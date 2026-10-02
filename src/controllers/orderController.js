const { Order, Payment } = require('../models')
const { nextId, initials, today } = require('../utils/genId')

exports.list = async (_req, res) => {
  res.json(await Order.find().sort({ createdAt: -1 }))
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
  const order = await Order.findOneAndUpdate({ id: req.params.id }, d, { new: true })
  if (!order) return res.status(404).json({ message: 'Order not found' })
  res.json(order)
}

exports.remove = async (req, res) => {
  await Order.findOneAndDelete({ id: req.params.id })
  res.json({ ok: true })
}
