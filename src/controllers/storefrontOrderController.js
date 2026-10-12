const { Order, Payment, Customer, Product } = require('../models')
const { nextId, initials, today } = require('../utils/genId')
const { createShiprocketOrder, trackShipment } = require('../services/shiprocket')

// Map a free-form Shiprocket status string to our 5-step tracker index.
// Returns -1 for cancelled/RTO so the UI can render a cancelled badge
// instead of a progress dot.
function mapShiprocketStatusToStep(statusRaw) {
  const s = String(statusRaw || '').toLowerCase()
  if (!s) return 0
  if (s.includes('cancel')) return -1
  if (s.includes('rto')) return -1
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
  // New / confirmed / ready to ship — order sits at step 0 until Shiprocket
  // actually scans it in.
  return 0
}

// POST /api/storefront/orders — public endpoint hit by the checkout
// popup AFTER a successful Razorpay verification. Persists the order
// + payment, then fires off to Shiprocket. Shiprocket failures do NOT
// fail the whole request — the merchant can retry from the admin panel.
exports.place = async (req, res) => {
  const d = req.body || {}

  const clientOrderId = String(d.id || '').trim()
  const id = clientOrderId || (await nextId(Order, 'ORD-'))
  const customer = String(d.customer || '').trim()
  const address = d.address || {}
  const items = Array.isArray(d.lineItems) ? d.lineItems : []
  const paid = !!d.paid
  const payMethod = String(d.payMethod || 'upi')

  // Flat summary — matches what the admin panel already renders.
  const productSummary = items.length === 0
    ? ''
    : items.length === 1
      ? items[0].name
      : `${items[0].name} +${items.length - 1} more`

  const orderDoc = await Order.create({
    id,
    customer,
    avatar: d.avatar || initials(customer),
    city: address.city || '',
    product: productSummary,
    items: Number(d.itemCount) || items.reduce((s, it) => s + (Number(it.qty) || 0), 0) || 1,
    amount: Number(d.total) || 0,
    status: 'pending',
    payment: paid ? 'paid' : 'pending',
    date: today(),

    email: d.email || '',
    phone: d.phone || '',
    address: {
      line1: address.line1 || '',
      line2: address.line2 || '',
      city: address.city || '',
      state: address.state || '',
      pincode: address.pincode || '',
      country: address.country || 'India',
    },
    lineItems: items.map((it) => ({
      productId: String(it.productId || ''),
      name: String(it.name || ''),
      sku: String(it.sku || it.productId || ''),
      qty: Number(it.qty) || 1,
      unitPrice: Number(it.unitPrice) || 0,
    })),
    payMethod,
    shipMethod: String(d.shipMethod || 'standard'),
    promoCode: d.promoCode || null,
    subtotal: Number(d.subtotal) || 0,
    discount: Number(d.discount) || 0,
    shippingFee: Number(d.shippingFee) || 0,
    tax: Number(d.tax) || 0,
    total: Number(d.total) || 0,
    razorpay: d.razorpay || undefined,
  })

  // Decrement inventory + bump the sold counter for every line item.
  // Runs per-item (not one big $inc) so we can flip status='out_of_stock'
  // when the running stock hits zero. Best-effort — a failure here
  // doesn't undo the order (that already happened + the customer paid).
  let anyApplied = false
  for (const it of items) {
    const productId = String(it.productId || '').trim()
    const qty = Math.max(1, Number(it.qty) || 1)
    if (!productId) continue
    try {
      const updated = await Product.findOneAndUpdate(
        { id: productId },
        { $inc: { stock: -qty, sold: qty } },
        { new: true },
      )
      if (updated) {
        anyApplied = true
        if (typeof updated.stock === 'number' && updated.stock <= 0) {
          // Clamp negative stock (oversell) to 0 and mark out-of-stock so
          // the storefront card shows the right ribbon on next fetch.
          await Product.updateOne(
            { id: productId },
            { $set: { stock: Math.max(0, updated.stock), status: 'out_of_stock' } },
          )
        }
      }
    } catch (e) {
      console.warn('[storefront-order] stock update failed for', productId, e.message)
    }
  }

  // Flip the rollback flag so a later cancel/delete can restore inventory
  // exactly once. If every $inc failed above, leave it false so a retry
  // from the admin side doesn't double-restock.
  if (anyApplied) {
    await Order.updateOne({ id: orderDoc.id }, { $set: { inventoryApplied: true } })
  }

  // Mirror the paid state into the Payments ledger so the admin
  // Payments page stays consistent.
  if (paid) {
    await Payment.create({
      id: await nextId(Payment, 'PAY-'),
      orderId: id,
      customer,
      avatar: orderDoc.avatar,
      amount: orderDoc.amount,
      method: (payMethod || 'Razorpay').toUpperCase(),
      status: 'paid',
      date: orderDoc.date,
    })
  }

  // Best-effort customer roll-up so the admin Customers page reflects
  // real storefront activity. Match by email (falls back to phone).
  try {
    if (d.email || d.phone) {
      const match = d.email
        ? await Customer.findOne({ email: d.email })
        : await Customer.findOne({ phone: d.phone })
      if (match) {
        match.orders = (match.orders || 0) + 1
        match.spent = (match.spent || 0) + (Number(d.total) || 0)
        await match.save()
      } else {
        await Customer.create({
          id: await nextId(Customer, 'CUS-'),
          name: customer,
          email: d.email || '',
          phone: d.phone || '',
          city: address.city || '',
          orders: 1,
          spent: Number(d.total) || 0,
          segment: 'New',
          joined: today(),
          avatar: initials(customer),
        })
      }
    }
  } catch (_e) {
    // Non-fatal — customer rollup shouldn't fail the order response.
  }

  // ── Auto-push to Shiprocket ────────────────────────────────────────
  // Attach `createdAt` fresh from the doc so the payload uses the
  // canonical timestamp instead of a JS Date.now() drift.
  let shiprocketResult = null
  try {
    const result = await createShiprocketOrder({
      ...orderDoc.toObject(),
      createdAt: orderDoc.createdAt,
    })
    orderDoc.shiprocket = {
      orderId: result.shiprocketOrderId,
      shipmentId: result.shipmentId,
      awbCode: result.awbCode,
      courier: result.courierName,
      status: 'created',
      error: '',
      pushedAt: new Date(),
    }
    await orderDoc.save()
    shiprocketResult = orderDoc.shiprocket
  } catch (err) {
    orderDoc.shiprocket = {
      orderId: '',
      shipmentId: '',
      awbCode: '',
      courier: '',
      status: 'failed',
      error: (err && err.message ? String(err.message) : 'Shiprocket push failed').slice(0, 500),
      pushedAt: new Date(),
    }
    try { await orderDoc.save() } catch (_e) {}
    // Log but do not fail the checkout — the customer already paid.
    console.error('[shiprocket] push failed for order', id, err.message)
    shiprocketResult = orderDoc.shiprocket
  }

  res.status(201).json({
    id: orderDoc.id,
    status: orderDoc.status,
    payment: orderDoc.payment,
    shiprocket: shiprocketResult,
  })
}

// GET /api/storefront/orders/:id/tracking — public endpoint hit by the
// thank-you / orders pages to render a live tracker. We purposefully
// NEVER return 404 for an unknown id or a shipment-not-yet-indexed
// state: the storefront should degrade to its time-based estimate
// instead of erroring out. On an upstream Shiprocket failure we return
// 200 with { ok: false } + whatever metadata we have, same reason.
exports.track = async (req, res) => {
  const id = String(req.params.id || '').trim()
  if (!id) return res.status(400).json({ ok: false, error: 'order id required' })

  const order = await Order.findOne({ id }).lean()
  if (!order) {
    return res.json({ ok: false, reason: 'order_not_found', orderId: id })
  }

  const sr = order.shiprocket || {}
  const base = {
    ok: true,
    orderId: order.id,
    createdAt: order.createdAt,
    shipMethod: order.shipMethod || 'standard',
    orderStatus: order.status || 'pending',
    shiprocket: {
      orderId: sr.orderId || '',
      shipmentId: sr.shipmentId || '',
      awbCode: sr.awbCode || '',
      courier: sr.courier || '',
      status: sr.status || '',
      error: sr.error || '',
    },
  }

  // Order was cancelled on our side (admin or storefront). Short-circuit.
  if (order.status === 'cancelled') {
    return res.json({ ...base, step: -1, currentStatus: 'Cancelled', activities: [] })
  }

  // No Shiprocket shipment yet (push failed or still pending). Return
  // step 0 so the UI falls back to its time-based estimate.
  if (!sr.awbCode && !sr.shipmentId) {
    return res.json({
      ...base,
      step: 0,
      currentStatus: sr.status === 'failed' ? 'Awaiting dispatch' : 'Confirmed',
      activities: [],
    })
  }

  try {
    const tr = await trackShipment({ awbCode: sr.awbCode, shipmentId: sr.shipmentId })
    const step = mapShiprocketStatusToStep(tr.status)
    return res.json({
      ...base,
      step,
      currentStatus: tr.status || 'Confirmed',
      etd: tr.etd || '',
      courier: tr.courier || sr.courier || '',
      activities: tr.activities,
    })
  } catch (err) {
    console.warn('[tracking] shiprocket track failed for', id, err.message)
    return res.json({
      ...base,
      step: 0,
      currentStatus: 'Confirmed',
      activities: [],
      upstreamError: err.message || 'shiprocket track failed',
    })
  }
}
