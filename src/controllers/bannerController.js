const { Banner } = require('../models')
const cache = require('../utils/cache')

const CACHE_KEY = 'banners'
const PROJ = { _id: 0, __v: 0 }
const CC = 'public, max-age=60, stale-while-revalidate=300'

exports.list = async (_req, res) => {
  const cached = cache.get(CACHE_KEY)
  if (cached) {
    res.set('Cache-Control', CC)
    return res.json(cached)
  }
  const data = await Banner.find({}, PROJ).sort({ order: 1, createdAt: 1 }).lean()
  cache.set(CACHE_KEY, data, 300)
  res.set('Cache-Control', CC)
  res.json(data)
}

exports.getOne = async (req, res) => {
  const banner = await Banner.findOne({ id: req.params.id }, PROJ).lean()
  if (!banner) return res.status(404).json({ message: 'Banner not found' })
  res.json(banner)
}

exports.create = async (req, res) => {
  const type = req.body.type === 'weave' ? 'weave' : 'hero'
  const title = String(req.body.title || '').trim()
  const weave = String(req.body.weave || '').trim()
  const image = String(req.body.image || '').trim()

  if (type === 'weave') {
    if (!weave) return res.status(400).json({ message: 'Pick a weave for this tile' })
    if (!image) return res.status(400).json({ message: 'Upload an image for the weave tile' })
  } else if (!image && !title) {
    return res.status(400).json({ message: 'Banner needs at least an image or a title' })
  }

  const id =
    req.body.id ||
    (title
      ? title.toLowerCase().replace(/\s+/g, '-').slice(0, 40)
      : weave
      ? `weave-${weave.toLowerCase().replace(/\s+/g, '-').slice(0, 30)}-${Date.now().toString(36).slice(-4)}`
      : `banner-${Date.now().toString(36)}`)

  const exists = await Banner.findOne({ id })
  if (exists) return res.status(409).json({ message: 'Banner with this id already exists' })

  const banner = await Banner.create({
    id,
    type,
    weave: type === 'weave' ? weave : '',
    title,
    subtitle: String(req.body.subtitle || ''),
    image,
    ctaLabel: String(req.body.ctaLabel || ''),
    ctaHref: String(req.body.ctaHref || ''),
    order: Number(req.body.order) || 0,
    active: req.body.active !== false,
  })
  cache.del(CACHE_KEY)
  res.status(201).json(banner)
}

exports.update = async (req, res) => {
  const d = { ...req.body }
  delete d.id
  const banner = await Banner.findOneAndUpdate({ id: req.params.id }, d, { new: true })
  if (!banner) return res.status(404).json({ message: 'Banner not found' })
  cache.del(CACHE_KEY)
  res.json(banner)
}

exports.remove = async (req, res) => {
  await Banner.findOneAndDelete({ id: req.params.id })
  cache.del(CACHE_KEY)
  res.json({ ok: true })
}
