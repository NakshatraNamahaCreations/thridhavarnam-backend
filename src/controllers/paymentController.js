const { Payment, Order } = require('../models')
const { nextId, today } = require('../utils/genId')

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
  const payment = await Payment.findOneAndUpdate({ id: req.params.id }, { status: 'refunded' }, { new: true })
  if (!payment) return res.status(404).json({ message: 'Payment not found' })
  if (payment.orderId)
    await Order.findOneAndUpdate({ id: payment.orderId }, { payment: 'refunded', status: 'cancelled' })
  res.json(payment)
}
