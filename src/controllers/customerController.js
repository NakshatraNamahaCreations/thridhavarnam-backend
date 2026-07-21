const { Customer } = require('../models')
const { nextId, initials, today } = require('../utils/genId')

exports.list = async (_req, res) => {
  res.json(await Customer.find().sort({ createdAt: -1 }))
}

exports.create = async (req, res) => {
  const d = req.body
  const name = String(d.name || '').trim()
  const customer = await Customer.create({
    ...d,
    id: await nextId(Customer, 'CUS-', 3),
    name,
    orders: 0,
    spent: 0,
    segment: d.segment || 'New',
    joined: today(),
    avatar: d.avatar || initials(name),
  })
  res.status(201).json(customer)
}

exports.update = async (req, res) => {
  const d = { ...req.body }
  delete d.id
  const customer = await Customer.findOneAndUpdate({ id: req.params.id }, d, { new: true })
  if (!customer) return res.status(404).json({ message: 'Customer not found' })
  res.json(customer)
}

exports.remove = async (req, res) => {
  await Customer.findOneAndDelete({ id: req.params.id })
  res.json({ ok: true })
}
