const crypto = require('crypto')
const Razorpay = require('razorpay')
const { Payment, Order } = require('../models')
const { nextId, today } = require('../utils/genId')

// Lazy singleton — we don't want to crash the whole server if the keys
// are missing; the endpoints below throw a clean 500 in that case.
let _razorpay = null
function getClient() {
  if (_razorpay) return _razorpay
  const key_id = process.env.RAZORPAY_KEY_ID
  const key_secret = process.env.RAZORPAY_KEY_SECRET
  if (!key_id || !key_secret) {
    const err = new Error('Razorpay keys are not configured on the server (set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env)')
    err.status = 500
    throw err
  }
  _razorpay = new Razorpay({ key_id, key_secret })
  return _razorpay
}

// POST /api/payments/razorpay/order
// Body: { amount: number (INR rupees), receipt?: string, notes?: object }
// Returns the Razorpay order object PLUS the public key id so the client
// can open Checkout without a second round-trip.
exports.createOrder = async (req, res) => {
  const client = getClient()
  const rupees = Number(req.body?.amount)
  if (!Number.isFinite(rupees) || rupees <= 0) {
    return res.status(400).json({ message: 'amount (in INR rupees) is required and must be > 0' })
  }
  const order = await client.orders.create({
    amount: Math.round(rupees * 100), // Razorpay expects paise
    currency: 'INR',
    receipt: (req.body?.receipt || `rcpt_${Date.now()}`).slice(0, 40),
    notes: req.body?.notes && typeof req.body.notes === 'object' ? req.body.notes : {},
  })
  res.json({ ...order, key_id: process.env.RAZORPAY_KEY_ID })
}

// POST /api/payments/razorpay/verify
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId?, customer?, amount? }
// Verifies the HMAC-SHA256 signature per Razorpay docs, and — if a local
// storefront order id was passed — records a Payment and flips the Order
// to paid. Returns { ok: true } on success, 400 on signature mismatch.
exports.verify = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {}
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ message: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required' })
  }
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret) return res.status(500).json({ message: 'Razorpay keys are not configured on the server' })

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex')

  if (expected !== razorpay_signature) {
    return res.status(400).json({ ok: false, message: 'Invalid payment signature' })
  }

  // Best-effort local bookkeeping — the storefront may not have created an
  // Order yet (order-after-payment flow), so an empty orderId is fine.
  const orderId = req.body.orderId || ''
  const amount = Number(req.body.amount) || 0
  try {
    await Payment.create({
      id: await nextId(Payment, 'PAY-'),
      orderId,
      customer: req.body.customer || '',
      avatar: req.body.avatar || '',
      amount,
      method: (req.body.method || 'Razorpay'),
      status: 'paid',
      date: today(),
    })
    if (orderId) await Order.findOneAndUpdate({ id: orderId }, { payment: 'paid' })
  } catch (_e) {
    // Do not fail the verification response over a bookkeeping error —
    // the signature already proves the payment is valid.
  }

  res.json({ ok: true, razorpay_payment_id, razorpay_order_id })
}
