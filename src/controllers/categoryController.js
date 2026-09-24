const { Category } = require('../models')

exports.list = async (_req, res) => {
  // Sort by admin-controlled order first, then creation time as a
  // tiebreaker so newer rows without an explicit order still appear last.
  res.json(await Category.find().sort({ order: 1, createdAt: 1 }))
}

exports.create = async (req, res) => {
  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ message: 'Category name is required' })
  const id = name.toLowerCase().replace(/\s+/g, '-')

  const exists = await Category.findOne({ id })
  if (exists) return res.status(409).json({ message: 'Category already exists' })

  const category = await Category.create({
    id,
    name,
    color: req.body.color || 'maroon',
    image: req.body.image || '',
    region: req.body.region || '',
    order: Number(req.body.order) || 0,
    active: req.body.active !== false,
  })
  res.status(201).json(category)
}

exports.update = async (req, res) => {
  const d = { ...req.body }
  delete d.id
  const category = await Category.findOneAndUpdate({ id: req.params.id }, d, { new: true })
  if (!category) return res.status(404).json({ message: 'Category not found' })
  res.json(category)
}

exports.remove = async (req, res) => {
  await Category.findOneAndDelete({ id: req.params.id })
  res.json({ ok: true })
}
