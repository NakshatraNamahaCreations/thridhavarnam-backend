const { Payment, Order } = require('../models')
const { nextId, today } = require('../utils/genId')
const { getClient: getRazorpay } = require('./razorpayController')

exports.list = async (_req, res) => {
  res.json(await Payment.find().sort({ createdAt: -1 }))
}

exports.record = async (req, res) => {
  const d = req.body
  const payment = await Payment.create({
    id: await nextId(Payment, 'PAY-'),
    orderId: d.orderId || '',
    customer: d.customer,
    avatar: d.avatar,
    amount: Number(d.amount) || 0,
    method: d.method || 'UPI',
    status: 'paid',
    date: today(),
  })
  if (d.orderId) await Order.findOneAndUpdate({ id: d.orderId }, { payment: 'paid' })
  res.status(201).json(payment)
}

exports.markPaid = async (req, res) => {
  const payment = await Payment.findOneAndUpdate({ id: req.params.id }, { status: 'paid' }, { new: true })
  if (!payment) return res.status(404).json({ message: 'Payment not found' })
  if (payment.orderId) await Order.findOneAndUpdate({ id: payment.orderId }, { payment: 'paid' })
  res.json(payment)
}

exports.refund = async (req, res) => {
  const payment = await Payment.findOne({ id: req.params.id })
  if (!payment) return res.status(404).json({ message: 'Payment not found' })
  if (payment.status === 'refunded') {
    return res.status(409).json({ message: 'Payment has already been refunded' })
  }
  if (payment.status !== 'paid') {
    return res.status(409).json({ message: `Cannot refund a payment in status "${payment.status}"` })
  }

  // Real refund via Razorpay when the payment was captured through
  // Checkout (we stored razorpayPaymentId on /verify). Payments
  // recorded manually by an admin (no razorpay id) fall back to
  // DB-only bookkeeping — the actual money movement is handled
  // out-of-band in that case.
  let razorpayRefundId
  if (payment.razorpayPaymentId) {
    try {
      const client = getRazorpay()
      const refund = await client.payments.refund(payment.razorpayPaymentId, {
        amount: Math.round((payment.amount || 0) * 100), // paise
        speed: 'normal',
        notes: { paymentId: payment.id, orderId: payment.orderId || '' },
      })
      razorpayRefundId = refund && refund.id
    } catch (e) {
      const status = e && e.statusCode ? e.statusCode : 502
      const message = (e && e.error && e.error.description) || e.message || 'Razorpay refund failed'
      return res.status(status).json({ message })
    }
  }

  payment.status = 'refunded'
  payment.refundedAt = new Date()
  if (razorpayRefundId) payment.razorpayRefundId = razorpayRefundId
  await payment.save()

  if (payment.orderId)
    await Order.findOneAndUpdate({ id: payment.orderId }, { payment: 'refunded', status: 'cancelled' })
  res.json(payment)
}
