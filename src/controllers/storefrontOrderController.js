const { Order, Payment, Customer } = require('../models')
const { nextId, initials, today } = require('../utils/genId')
const { createShiprocketOrder } = require('../services/shiprocket')

// POST /api/storefront/orders — public endpoint hit by the checkout
// popup AFTER a successful Razorpay verification (or immediately for
// COD). Persists the order + payment, then fires off to Shiprocket.
// Shiprocket failures do NOT fail the whole request — the merchant
// can retry from the admin panel.
exports.place = async (req, res) => {
  const d = req.body || {}

  const clientOrderId = String(d.id || '').trim()
  const id = clientOrderId || (await nextId(Order, '#ORD-'))
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
    codFee: Number(d.codFee) || 0,
    tax: Number(d.tax) || 0,
    total: Number(d.total) || 0,
    razorpay: d.razorpay || undefined,
  })

  // Mirror the paid state into the Payments ledger so the admin
  // Payments page stays consistent.
  if (paid) {
    await Payment.create({
      id: await nextId(Payment, 'PAY-'),
      orderId: id,
      customer,
      avatar: orderDoc.avatar,
      amount: orderDoc.amount,
      method: payMethod === 'cod' ? 'COD' : (payMethod || 'Razorpay').toUpperCase(),
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
