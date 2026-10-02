const { PriceBucket } = require('../models')
const cache = require('../utils/cache')

const CACHE_KEY = 'price-buckets'
const PROJ = { _id: 0, __v: 0 }
const CC = 'public, max-age=60, stale-while-revalidate=300'

exports.list = async (_req, res) => {
  const cached = cache.get(CACHE_KEY)
  if (cached) {
    res.set('Cache-Control', CC)
    return res.json(cached)
  }
  const data = await PriceBucket.find({}, PROJ).sort({ order: 1, createdAt: 1 }).lean()
  cache.set(CACHE_KEY, data, 300)
  res.set('Cache-Control', CC)
  res.json(data)
}

exports.getOne = async (req, res) => {
  const bucket = await PriceBucket.findOne({ id: req.params.id }, PROJ).lean()
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
  cache.del(CACHE_KEY)
  res.status(201).json(bucket)
}

exports.update = async (req, res) => {
  const d = { ...req.body }
  delete d.id
  const bucket = await PriceBucket.findOneAndUpdate({ id: req.params.id }, d, { new: true })
  if (!bucket) return res.status(404).json({ message: 'Price bucket not found' })
  cache.del(CACHE_KEY)
  res.json(bucket)
}

exports.remove = async (req, res) => {
  await PriceBucket.findOneAndDelete({ id: req.params.id })
  cache.del(CACHE_KEY)
  res.json({ ok: true })
}
