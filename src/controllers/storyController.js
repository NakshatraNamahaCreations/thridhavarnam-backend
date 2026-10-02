const { Story } = require('../models')
const cache = require('../utils/cache')

const CACHE_KEY = 'stories'
const PROJ = { _id: 0, __v: 0 }
const CC = 'public, max-age=60, stale-while-revalidate=300'

exports.list = async (_req, res) => {
  const cached = cache.get(CACHE_KEY)
  if (cached) {
    res.set('Cache-Control', CC)
    return res.json(cached)
  }
  const data = await Story.find({}, PROJ).sort({ order: 1, createdAt: 1 }).lean()
  cache.set(CACHE_KEY, data, 300)
  res.set('Cache-Control', CC)
  res.json(data)
}

exports.getOne = async (req, res) => {
  const story = await Story.findOne({ id: req.params.id }, PROJ).lean()
  if (!story) return res.status(404).json({ message: 'Story not found' })
  res.json(story)
}

exports.create = async (req, res) => {
  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ message: 'Story name is required' })
  const id = String(req.body.id || '').trim() || name.toLowerCase().replace(/\s+/g, '-')

  const exists = await Story.findOne({ id })
  if (exists) return res.status(409).json({ message: 'A story with this id already exists' })

  const story = await Story.create({
    id,
    name,
    region: req.body.region || '',
    state: req.body.state || '',
    era: req.body.era || '',
    image: req.body.image || '',
    palette: Array.isArray(req.body.palette) ? req.body.palette.slice(0, 3) : [],
    intro: req.body.intro || '',
    origins: req.body.origins || '',
    technique: req.body.technique || '',
    look_for: Array.isArray(req.body.look_for) ? req.body.look_for.slice(0, 3) : [],
    pull_quote: req.body.pull_quote || '',
    order: Number(req.body.order) || 0,
  })
  cache.del(CACHE_KEY)
  res.status(201).json(story)
}

exports.update = async (req, res) => {
  const d = { ...req.body }
  delete d.id
  if (Array.isArray(d.palette)) d.palette = d.palette.slice(0, 3)
  if (Array.isArray(d.look_for)) d.look_for = d.look_for.slice(0, 3)
  if (d.order !== undefined) d.order = Number(d.order) || 0
  const story = await Story.findOneAndUpdate({ id: req.params.id }, d, { new: true })
  if (!story) return res.status(404).json({ message: 'Story not found' })
  cache.del(CACHE_KEY)
  res.json(story)
}

exports.remove = async (req, res) => {
  await Story.findOneAndDelete({ id: req.params.id })
  cache.del(CACHE_KEY)
  res.json({ ok: true })
}
