const { Order, Payment, Product } = require('../models')
const { nextId, initials, today } = require('../utils/genId')
const { trackShipment, cancelShiprocketOrder } = require('../services/shiprocket')

// Map a free-form Shiprocket status string to our 5-step tracker index.
// Mirrors the mapping used by the storefront's thank-you tracker so
// both surfaces agree on what "Shipped" vs "Out for delivery" means.
// Returns -1 for cancelled/RTO.
function mapShiprocketStatusToStep(statusRaw) {
  const s = String(statusRaw || '').toLowerCase()
  if (!s) return 0
  if (s.includes('cancel') || s.includes('rto')) return -1
  if (s.includes('delivered')) return 4
  if (s.includes('out for delivery') || s.includes('out_for_delivery')) return 3
  if (s.includes('transit') || s.includes('shipped') || s.includes('reached')) return 2
  if (
    s.includes('pickup') ||
    s.includes('manifest') ||
    s.includes('packed') ||
    s.includes('label') ||
    s.includes('awb assigned')
  ) {
    return 1
  }
  return 0
}

// Internal fulfilment-flow label for each Shiprocket step. Keeps the
// admin table's badge wording consistent with the existing status chip
// filters (`pending/processing/shipped/delivered/cancelled`) so filters
// and badges tell the same story.
function stepToInternalStatus(step) {
  if (step === -1) return 'cancelled'
  if (step >= 4) return 'delivered'
  if (step >= 2) return 'shipped'
  if (step >= 1) return 'processing'
  return 'pending'
}

exports.list = async (_req, res) => {
  res.json(await Order.find().sort({ createdAt: -1 }))
}

// GET /api/orders/tracking — batched live Shiprocket statuses for the
// admin orders table. Optional `ids` query filters to a subset
// (comma-separated); omit it to pull every order that has a Shiprocket
// shipment attached. Response shape:
//   { tracking: { [orderId]: { step, currentStatus, courier, awbCode,
//                              internalStatus, cancelled } } }
// Entries are only returned for orders where we have an AWB or
// shipmentId — admin-created orders with no Shiprocket push are
// skipped so the admin UI can keep showing their internal status.
exports.tracking = async (req, res) => {
  const idsParam = String(req.query.ids || '').trim()
  const idFilter = idsParam
    ? idsParam.split(',').map((s) => s.trim()).filter(Boolean)
    : null

  const query = idFilter ? { id: { $in: idFilter } } : {}
  // Pull just the fields we need — the full Order record is heavy and
  // we're potentially iterating every row in the DB.
  const orders = await Order.find(query, {
    id: 1,
    status: 1,
    shiprocket: 1,
  }).lean()

  // Fan out tracking calls with a bounded concurrency pool so a 50-row
  // admin page doesn't open 50 parallel sockets to Shiprocket. The
  // service layer caches per-identifier for 60s, so most of these
  // return instantly after the first pass.
  const CONCURRENCY = 5
  const results = {}
  const queue = orders.slice()

  async function worker() {
    while (queue.length) {
      const o = queue.shift()
      if (!o) return
      const sr = o.shiprocket || {}

      // Admin-cancelled orders — surface as cancelled regardless of
      // what Shiprocket last said. Keeps the badge in sync with the
      // internal state.
      if (o.status === 'cancelled') {
        results[o.id] = {
          step: -1,
          currentStatus: 'Cancelled',
          internalStatus: 'cancelled',
          courier: sr.courier || '',
          awbCode: sr.awbCode || '',
          source: 'internal',
          cancelled: true,
        }
        continue
      }

      if (!sr.awbCode && !sr.shipmentId) {
        // No shipment yet — skip. Caller falls back to internal status.
        continue
      }

      try {
        const tr = await trackShipment({ awbCode: sr.awbCode, shipmentId: sr.shipmentId })
        const step = mapShiprocketStatusToStep(tr.status)
        results[o.id] = {
          step,
          currentStatus: tr.status || 'Confirmed',
          internalStatus: stepToInternalStatus(step),
          courier: tr.courier || sr.courier || '',
          awbCode: tr.awbCode || sr.awbCode || '',
          source: 'shiprocket',
          cancelled: step === -1,
        }
      } catch (err) {
        console.warn('[orders/tracking] shiprocket track failed for', o.id, err.message)
        // Soft-fail — leave this order out of the results map so the
        // admin UI keeps showing the stored internal status for it.
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

  res.json({ tracking: results })
}

// Reverse the inventory impact of a storefront order: restock every line
// item, decrement sold (clamped at 0 so we never go negative), flip
// status back to 'active' if restock pulls it out of out_of_stock, and
// clear the `inventoryApplied` flag so a subsequent cancel/delete can't
// roll back a second time. Idempotent: a no-op if the flag is already
// false (admin-created order, legacy data, or already-rolled-back).
async function restoreInventory(order) {
  if (!order || !order.inventoryApplied) return
  const items = Array.isArray(order.lineItems) ? order.lineItems : []
  for (const it of items) {
    const productId = String(it.productId || '').trim()
    const qty = Math.max(1, Number(it.qty) || 1)
    if (!productId) continue
    try {
      const updated = await Product.findOneAndUpdate(
        { id: productId },
        { $inc: { stock: qty, sold: -qty } },
        { new: true },
      )
      if (updated) {
        const patch = {}
        if (typeof updated.sold === 'number' && updated.sold < 0) patch.sold = 0
        if (updated.status === 'out_of_stock' && (updated.stock || 0) > 0) patch.status = 'active'
        if (Object.keys(patch).length) {
          await Product.updateOne({ id: productId }, { $set: patch })
        }
      }
    } catch (e) {
      console.warn('[orders] inventory restore failed for', productId, e.message)
    }
  }
  // Flip the flag off so a later delete-after-cancel is a no-op.
  await Order.updateOne({ id: order.id }, { $set: { inventoryApplied: false } })
}

exports.create = async (req, res) => {
  const d = req.body
  const id = await nextId(Order, 'ORD-')
  const customer = String(d.customer || '').trim()

  const order = await Order.create({
    id,
    customer,
    avatar: d.avatar || initials(customer),
    city: d.city || '',
    product: d.product || '',
    items: Number(d.items) || 1,
    amount: Number(d.amount) || 0,
    status: d.status || 'pending',
    payment: d.payment || 'pending',
    date: d.date || today(),
  })

  // Mirror the order into the payments ledger so Payments stays in sync.
  await Payment.create({
    id: await nextId(Payment, 'PAY-'),
    orderId: id,
    customer: order.customer,
    avatar: order.avatar,
    amount: order.amount,
    method: order.payment === 'pending' ? '—' : 'UPI',
    status: order.payment,
    date: order.date,
  })

  res.status(201).json(order)
}

exports.update = async (req, res) => {
  const d = { ...req.body }
  delete d.id
  if (d.items !== undefined) d.items = Number(d.items)
  if (d.amount !== undefined) d.amount = Number(d.amount)

  // Fetch the pre-update state so we can detect a non-cancelled → cancelled
  // transition and roll back inventory exactly once.
  const prev = await Order.findOne({ id: req.params.id })
  if (!prev) return res.status(404).json({ message: 'Order not found' })

  const order = await Order.findOneAndUpdate({ id: req.params.id }, d, { new: true })

  const transitionedToCancelled =
    d.status === 'cancelled' && prev.status !== 'cancelled'

  if (transitionedToCancelled) {
    // 1. Restore inventory (idempotent — only runs when applied).
    if (order.inventoryApplied) await restoreInventory(order)

    // 2. Propagate the cancel to Shiprocket. We do NOT fail the admin's
    // PUT if Shiprocket rejects the cancel — the order is already
    // cancelled on our side and the admin needs that persisted. Any
    // upstream error is stashed on shiprocket.error so it's visible
    // in the order record.
    const srOrderId = order?.shiprocket?.orderId
    if (srOrderId) {
      try {
        await cancelShiprocketOrder(srOrderId)
        await Order.updateOne(
          { id: req.params.id },
          {
            $set: {
              'shiprocket.status': 'cancelled',
              'shiprocket.error': '',
              'shiprocket.pushedAt': new Date(),
            },
          },
        )
      } catch (err) {
        console.warn('[orders] shiprocket cancel failed for', order.id, err.message)
        await Order.updateOne(
          { id: req.params.id },
          {
            $set: {
              'shiprocket.error': `cancel failed: ${(err.message || 'unknown').slice(0, 480)}`,
            },
          },
        )
      }
    }

    // Re-read so the response reflects both the inventory flag reset
    // and any shiprocket-subdoc changes.
    const fresh = await Order.findOne({ id: req.params.id })
    return res.json(fresh || order)
  }

  res.json(order)
}

exports.remove = async (req, res) => {
  const order = await Order.findOne({ id: req.params.id })
  if (!order) return res.json({ ok: true })
  // Roll back before deleting — once the order document is gone we lose
  // the lineItems and can no longer compute the restock amounts.
  if (order.inventoryApplied) await restoreInventory(order)
  await Order.deleteOne({ id: req.params.id })
  res.json({ ok: true })
}
