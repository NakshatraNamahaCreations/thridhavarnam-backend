const { Order, Payment, Customer, Product } = require('../models')
const { nextId, initials, today } = require('../utils/genId')
const { createShiprocketOrder, trackShipment, cancelShiprocketOrder } = require('../services/shiprocket')

// Shape the Mongo Order doc into the storefront's Order type so
// `/account/orders` can hydrate without a translation pass on the
// client. Does not touch the stored doc.
function serializeOrderForStorefront(o) {
  const addr = o.address || {}
  const items = Array.isArray(o.lineItems) ? o.lineItems : []
  const srStatus = (o.shiprocket && o.shiprocket.status) || ''
  return {
    id: o.id,
    createdAt: o.createdAt ? new Date(o.createdAt).getTime() : Date.now(),
    status: o.status === 'cancelled' ? 'cancelled' : 'placed',
    cancelledAt: o.status === 'cancelled' && o.updatedAt ? new Date(o.updatedAt).getTime() : undefined,
    items: items.map((it) => ({
      productId: it.productId || '',
      name: it.name || '',
      weave: it.weave || '',
      qty: Number(it.qty) || 1,
      unitPrice: Number(it.unitPrice) || 0,
      image: it.image || '',
    })),
    itemCount: Number(o.items) || items.reduce((s, it) => s + (Number(it.qty) || 0), 0) || 0,
    address: {
      fullName: o.customer || '',
      phone: o.phone || '',
      email: o.email || '',
      line1: addr.line1 || '',
      line2: addr.line2 || '',
      city: addr.city || '',
      state: addr.state || '',
      pincode: addr.pincode || '',
      country: addr.country || 'India',
    },
    payMethod: o.payMethod || 'upi',
    shipMethod: o.shipMethod || 'standard',
    paid: o.payment === 'paid',
    promoCode: o.promoCode || null,
    subtotal: Number(o.subtotal) || 0,
    discount: Number(o.discount) || 0,
    shippingFee: Number(o.shippingFee) || 0,
    tax: Number(o.tax) || 0,
    total: Number(o.total) || Number(o.amount) || 0,
    shiprocket: {
      orderId: (o.shiprocket && o.shiprocket.orderId) || '',
      shipmentId: (o.shiprocket && o.shiprocket.shipmentId) || '',
      awbCode: (o.shiprocket && o.shiprocket.awbCode) || '',
      courier: (o.shiprocket && o.shiprocket.courier) || '',
      status: srStatus,
    },
  }
}

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
      weave: String(it.weave || ''),
      image: String(it.image || ''),
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

// Helper: fallback status when Shiprocket hasn't been queried yet /
// no AWB exists / the order was cancelled on our side.
function fallbackCurrentStatus(order) {
  if (!order) return 'Confirmed'
  if (order.status === 'cancelled') return 'Cancelled'
  const sr = order.shiprocket || {}
  if (sr.status === 'failed') return 'Awaiting dispatch'
  return 'Confirmed'
}

// GET /api/storefront/orders?email=... — public endpoint. Returns every
// order placed by this signed-in customer (matched by email, with
// phone as a secondary disambiguator). We intentionally require the
// email in the query — there is no server-side session for the
// storefront, so this is the key the client already has.
exports.list = async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase()
  const phone = String(req.query.phone || '').trim()

  if (!email && !phone) {
    return res.json({ orders: [] })
  }

  // Email is the primary key — accounts are matched on email in auth.
  // Phone acts as a defensive filter for duplicate-emailed addresses.
  const or = []
  if (email) or.push({ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
  if (phone) or.push({ phone })

  const docs = await Order.find({ $or: or })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()

  res.json({ orders: docs.map(serializeOrderForStorefront) })
}

// POST /api/storefront/orders/:id/cancel — public endpoint. Mirrors
// the admin cancel path: restore inventory + call Shiprocket cancel.
// Email in the body is used as a lightweight ownership check — a
// random person can't cancel someone else's order just by guessing
// the id. Soft-fails Shiprocket errors (order still goes cancelled
// on our side) so the storefront UI never gets stuck.
exports.cancel = async (req, res) => {
  const id = String(req.params.id || '').trim()
  const email = String((req.body && req.body.email) || '').trim().toLowerCase()
  if (!id) return res.status(400).json({ ok: false, error: 'order id required' })

  const order = await Order.findOne({ id })
  if (!order) return res.status(404).json({ ok: false, error: 'order not found' })

  // Email guard — fail silently with 404 to avoid leaking order existence
  // if the caller got the id but not the email.
  if (email && String(order.email || '').toLowerCase() !== email) {
    return res.status(404).json({ ok: false, error: 'order not found' })
  }

  if (order.status === 'cancelled') {
    return res.json({ ok: true, order: serializeOrderForStorefront(order.toObject()) })
  }

  // Flip status + restore inventory. Mirror of the admin update flow
  // without the extra admin-only side-effects (we don't rewrite other
  // mutable fields here).
  order.status = 'cancelled'
  await order.save()

  if (order.inventoryApplied) {
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
        console.warn('[storefront-cancel] inventory restore failed for', productId, e.message)
      }
    }
    await Order.updateOne({ id: order.id }, { $set: { inventoryApplied: false } })
  }

  // Propagate to Shiprocket (soft-fail).
  const srOrderId = order.shiprocket && order.shiprocket.orderId
  if (srOrderId) {
    try {
      await cancelShiprocketOrder(srOrderId)
      await Order.updateOne(
        { id: order.id },
        { $set: { 'shiprocket.status': 'cancelled', 'shiprocket.error': '', 'shiprocket.pushedAt': new Date() } },
      )
    } catch (err) {
      console.warn('[storefront-cancel] shiprocket cancel failed for', order.id, err.message)
      await Order.updateOne(
        { id: order.id },
        { $set: { 'shiprocket.error': `cancel failed: ${(err.message || 'unknown').slice(0, 480)}` } },
      )
    }
  }

  const fresh = await Order.findOne({ id: order.id }).lean()
  res.json({ ok: true, order: serializeOrderForStorefront(fresh || order.toObject()) })
}

// GET /api/storefront/orders/tracking?ids=A,B,C — batched live
// Shiprocket statuses for the storefront's /account/orders list.
// Response shape mirrors the admin equivalent so the client code can
// stay structurally similar.
exports.listTracking = async (req, res) => {
  const idsParam = String(req.query.ids || '').trim()
  if (!idsParam) return res.json({ tracking: {} })

  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean)
  if (ids.length === 0) return res.json({ tracking: {} })

  // Cap at 100 so a malicious caller can't fan us out to Shiprocket
  // with an arbitrarily long list.
  const slice = ids.slice(0, 100)
  const orders = await Order.find(
    { id: { $in: slice } },
    { id: 1, status: 1, shiprocket: 1 },
  ).lean()

  const CONCURRENCY = 5
  const results = {}
  const queue = orders.slice()

  async function worker() {
    while (queue.length) {
      const o = queue.shift()
      if (!o) return
      const sr = o.shiprocket || {}

      if (o.status === 'cancelled') {
        results[o.id] = {
          step: -1,
          currentStatus: 'Cancelled',
          courier: sr.courier || '',
          awbCode: sr.awbCode || '',
          source: 'internal',
          cancelled: true,
        }
        continue
      }

      if (!sr.awbCode && !sr.shipmentId) {
        results[o.id] = {
          step: 0,
          currentStatus: fallbackCurrentStatus(o),
          courier: sr.courier || '',
          awbCode: sr.awbCode || '',
          source: 'internal',
          cancelled: false,
        }
        continue
      }

      try {
        const tr = await trackShipment({ awbCode: sr.awbCode, shipmentId: sr.shipmentId })
        const step = mapShiprocketStatusToStep(tr.status)
        results[o.id] = {
          step,
          currentStatus: tr.status || 'Confirmed',
          courier: tr.courier || sr.courier || '',
          awbCode: tr.awbCode || sr.awbCode || '',
          source: 'shiprocket',
          cancelled: step === -1,
        }
      } catch (err) {
        console.warn('[storefront/tracking] shiprocket track failed for', o.id, err.message)
        results[o.id] = {
          step: 0,
          currentStatus: fallbackCurrentStatus(o),
          courier: sr.courier || '',
          awbCode: sr.awbCode || '',
          source: 'internal',
          cancelled: false,
        }
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

  res.json({ tracking: results })
}
