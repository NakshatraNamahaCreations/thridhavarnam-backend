const { Occasion } = require('../models')

exports.list = async (_req, res) => {
  res.json(await Occasion.find().sort({ createdAt: 1 }))
}

exports.create = async (req, res) => {
  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ message: 'Occasion name is required' })
  const id = name.toLowerCase().replace(/\s+/g, '-')

  const exists = await Occasion.findOne({ id })
  if (exists) return res.status(409).json({ message: 'Occasion already exists' })

  const occasion = await Occasion.create({
    id,
    name,
    color: req.body.color || 'maroon',
    image: req.body.image || '',
    fromAmount: Number(req.body.fromAmount) || 0,
    toAmount: Number(req.body.toAmount) || 0,
  })
  res.status(201).json(occasion)
}

exports.update = async (req, res) => {
  const d = { ...req.body }
  delete d.id
  const occasion = await Occasion.findOneAndUpdate({ id: req.params.id }, d, { new: true })
  if (!occasion) return res.status(404).json({ message: 'Occasion not found' })
  res.json(occasion)
}

exports.remove = async (req, res) => {
  await Occasion.findOneAndDelete({ id: req.params.id })
  res.json({ ok: true })
}
