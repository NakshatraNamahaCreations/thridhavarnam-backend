const { Coupon } = require('../models')

const norm = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '-')

exports.list = async (_req, res) => {
  res.json(await Coupon.find().sort({ createdAt: -1 }))
}

exports.create = async (req, res) => {
  const code = norm(req.body.code)
  if (!code) return res.status(400).json({ message: 'Coupon code is required' })
  const id = code.toLowerCase()

  const exists = await Coupon.findOne({ id })
  if (exists) return res.status(409).json({ message: 'Coupon code already exists' })

  const type = req.body.type === 'fixed' ? 'fixed' : 'percent'
  const value = Number(req.body.value) || 0
  if (type === 'percent' && (value < 0 || value > 100)) {
    return res.status(400).json({ message: 'Percent value must be between 0 and 100' })
  }
  if (value <= 0) return res.status(400).json({ message: 'Value must be greater than 0' })

  const coupon = await Coupon.create({
    id,
    code,
    description: req.body.description || '',
    type,
    value,
    minOrder: Number(req.body.minOrder) || 0,
    maxDiscount: req.body.maxDiscount ? Number(req.body.maxDiscount) : undefined,
    startDate: req.body.startDate || '',
    expiryDate: req.body.expiryDate || '',
    usageLimit: Number(req.body.usageLimit) || 0,
    usageCount: 0,
    active: req.body.active !== false,
  })
  res.status(201).json(coupon)
}

exports.update = async (req, res) => {
  const d = { ...req.body }
  delete d.id
  delete d.code
  delete d.usageCount
  if (d.value !== undefined) d.value = Number(d.value) || 0
  if (d.minOrder !== undefined) d.minOrder = Number(d.minOrder) || 0
  if (d.maxDiscount !== undefined) d.maxDiscount = d.maxDiscount ? Number(d.maxDiscount) : undefined
  if (d.usageLimit !== undefined) d.usageLimit = Number(d.usageLimit) || 0
  const coupon = await Coupon.findOneAndUpdate({ id: req.params.id }, d, { new: true })
  if (!coupon) return res.status(404).json({ message: 'Coupon not found' })
  res.json(coupon)
}

exports.remove = async (req, res) => {
  await Coupon.findOneAndDelete({ id: req.params.id })
  res.json({ ok: true })
}
