const { Occasion } = require('../models')
const cache = require('../utils/cache')

const CACHE_KEY = 'occasions'
const PROJ = { _id: 0, __v: 0 }
const CC = 'public, max-age=60, stale-while-revalidate=300'

exports.list = async (_req, res) => {
  const cached = cache.get(CACHE_KEY)
  if (cached) {
    res.set('Cache-Control', CC)
    return res.json(cached)
  }
  const data = await Occasion.find({}, PROJ).sort({ createdAt: 1 }).lean()
  cache.set(CACHE_KEY, data, 300)
  res.set('Cache-Control', CC)
  res.json(data)
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
  cache.del(CACHE_KEY)
  res.status(201).json(occasion)
}

exports.update = async (req, res) => {
  const d = { ...req.body }
  delete d.id
  const occasion = await Occasion.findOneAndUpdate({ id: req.params.id }, d, { new: true })
  if (!occasion) return res.status(404).json({ message: 'Occasion not found' })
  cache.del(CACHE_KEY)
  res.json(occasion)
}

exports.remove = async (req, res) => {
  await Occasion.findOneAndDelete({ id: req.params.id })
  cache.del(CACHE_KEY)
  res.json({ ok: true })
}
