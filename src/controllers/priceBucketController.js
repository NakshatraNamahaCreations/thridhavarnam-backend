const { PriceBucket } = require('../models')

exports.list = async (_req, res) => {
  res.json(await PriceBucket.find().sort({ order: 1, createdAt: 1 }))
}

exports.getOne = async (req, res) => {
  const bucket = await PriceBucket.findOne({ id: req.params.id })
  if (!bucket) return res.status(404).json({ message: 'Price bucket not found' })
  res.json(bucket)
}

exports.create = async (req, res) => {
  const label = String(req.body.label || '').trim()
  if (!label) return res.status(400).json({ message: 'Label is required' })
  const id =
    req.body.id ||
    label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  const exists = await PriceBucket.findOne({ id })
  if (exists) return res.status(409).json({ message: 'Price bucket already exists' })

  const bucket = await PriceBucket.create({
    id,
    label,
    subtitle: req.body.subtitle || '',
    image: req.body.image || '',
    href: req.body.href || '/shop',
    startingPrice: Number(req.body.startingPrice) || 0,
    order: Number(req.body.order) || 0,
    active: req.body.active !== false,
  })
  res.status(201).json(bucket)
}

exports.update = async (req, res) => {
  const d = { ...req.body }
  delete d.id
  const bucket = await PriceBucket.findOneAndUpdate({ id: req.params.id }, d, { new: true })
  if (!bucket) return res.status(404).json({ message: 'Price bucket not found' })
  res.json(bucket)
}

exports.remove = async (req, res) => {
  await PriceBucket.findOneAndDelete({ id: req.params.id })
  res.json({ ok: true })
}
