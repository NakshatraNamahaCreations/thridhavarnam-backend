const { Product } = require('../models')
const { nextId } = require('../utils/genId')

// Keep the FAQ array well-formed: drop rows where both question and answer
// are blank, trim whitespace, cap the field so a malformed payload can't
// balloon the document.
function sanitizeFaqs(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((row) => ({
      q: String(row?.q ?? '').trim(),
      a: String(row?.a ?? '').trim(),
    }))
    .filter((row) => row.q || row.a)
    .slice(0, 30)
}

// Normalise gallery entries. Accepts either `[{url, color}]` (new shape)
// or `["url", ...]` (legacy) and returns the canonical object form. Drops
// blanks / placeholder emoji and caps at 12 to keep documents reasonable.
function sanitizeImages(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((entry) => {
      if (typeof entry === 'string') {
        return { url: entry.trim(), color: '' }
      }
      return {
        url: String(entry?.url ?? '').trim(),
        color: String(entry?.color ?? '').trim(),
      }
    })
    .filter((e) => e.url && e.url !== '🥻')
    .slice(0, 12)
}

exports.list = async (_req, res) => {
  res.json(await Product.find().sort({ createdAt: -1 }))
}

exports.getOne = async (req, res) => {
  const product = await Product.findOne({ id: req.params.id })
  if (!product) return res.status(404).json({ message: 'Product not found' })
  res.json(product)
}

exports.create = async (req, res) => {
  const d = req.body
  const stock = Number(d.stock) || 0
  // Gallery source of truth: prefer the images array; fall back to the
  // legacy single `image` field if that's all the client sent.
  const images = sanitizeImages(d.images?.length ? d.images : d.image ? [d.image] : [])
  const product = await Product.create({
    ...d,
    id: await nextId(Product, 'SAR-'),
    price: Number(d.price) || 0,
    mrp: Number(d.mrp) || 0,
    stock,
    sold: 0,
    rating: 0,
    images,
    image: images[0]?.url || '🥻',
    status: stock > 0 ? d.status || 'active' : 'out_of_stock',
    faqs: sanitizeFaqs(d.faqs),
  })
  res.status(201).json(product)
}

exports.bulkCreate = async (req, res) => {
  const items = (req.body.items || []).filter((d) => d && String(d.name || '').trim())
  if (!items.length) return res.json([])

  const docs = await Product.find({}, 'id').lean()
  let max = docs
    .map((d) => parseInt(String(d.id).replace(/\D/g, ''), 10))
    .filter((n) => !Number.isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0)

  const toAdd = items.map((d) => {
    max += 1
    const stock = Number(d.stock) || 0
    return {
      ...d,
      id: `SAR-${max}`,
      name: String(d.name).trim(),
      price: Number(d.price) || 0,
      mrp: Number(d.mrp) || 0,
      stock,
      sold: 0,
      rating: 0,
      image: d.image || '🥻',
      status: stock > 0 ? 'active' : 'out_of_stock',
    }
  })
  res.status(201).json(await Product.insertMany(toAdd))
}

exports.update = async (req, res) => {
  const d = { ...req.body }
  delete d.id
  if (d.price !== undefined) d.price = Number(d.price)
  if (d.mrp !== undefined) d.mrp = Number(d.mrp)
  if (d.stock !== undefined) {
    d.stock = Number(d.stock)
    if (d.stock === 0) d.status = 'out_of_stock'
  }
  if (d.faqs !== undefined) d.faqs = sanitizeFaqs(d.faqs)
  if (d.images !== undefined) {
    d.images = sanitizeImages(d.images)
    // Keep the legacy single hero pointing at the gallery's first slot so
    // list views (product cards, etc.) that still read `image` stay in sync.
    d.image = d.images[0]?.url || '🥻'
  }
  const product = await Product.findOneAndUpdate({ id: req.params.id }, d, { new: true })
  if (!product) return res.status(404).json({ message: 'Product not found' })
  res.json(product)
}

exports.restock = async (req, res) => {
  const qty = Number(req.body.qty) || 0
  const product = await Product.findOne({ id: req.params.id })
  if (!product) return res.status(404).json({ message: 'Product not found' })
  product.stock += qty
  if (product.stock > 0 && product.status === 'out_of_stock') product.status = 'active'
  await product.save()
  res.json(product)
}

exports.remove = async (req, res) => {
  await Product.findOneAndDelete({ id: req.params.id })
  res.json({ ok: true })
}
