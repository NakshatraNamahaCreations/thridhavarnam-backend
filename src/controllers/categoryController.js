const { Category } = require('../models')
const cache = require('../utils/cache')

const CACHE_KEY = 'categories'
const PROJ = { _id: 0, __v: 0 }
const CC = 'public, max-age=60, stale-while-revalidate=300'

exports.list = async (_req, res) => {
  const cached = cache.get(CACHE_KEY)
  if (cached) {
    res.set('Cache-Control', CC)
    return res.json(cached)
  }
  const data = await Category.find({}, PROJ).sort({ order: 1, createdAt: 1 }).lean()
  cache.set(CACHE_KEY, data, 300)
  res.set('Cache-Control', CC)
  res.json(data)
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
  cache.del(CACHE_KEY)
  res.status(201).json(category)
}

exports.update = async (req, res) => {
  const d = { ...req.body }
  delete d.id
  const category = await Category.findOneAndUpdate({ id: req.params.id }, d, { new: true })
  if (!category) return res.status(404).json({ message: 'Category not found' })
  cache.del(CACHE_KEY)
  res.json(category)
}

exports.remove = async (req, res) => {
  await Category.findOneAndDelete({ id: req.params.id })
  cache.del(CACHE_KEY)
  res.json({ ok: true })
}
