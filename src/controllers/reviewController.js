const { Review } = require('../models')

// GET /api/reviews[?productId=SAR-1045]
// Both admin (all reviews) and storefront (per-product) call this;
// productId query narrows the result set. Newest first.
exports.list = async (req, res) => {
  const query = {}
  if (req.query.productId) query.productId = String(req.query.productId)
  res.json(await Review.find(query).sort({ createdAt: -1 }))
}

// POST /api/reviews — public. Anyone can submit a review; there is no
// moderation queue. Fields are trimmed / clamped to defend against
// stray whitespace and out-of-range ratings.
exports.create = async (req, res) => {
  const productId = String(req.body.productId || '').trim()
  const name = String(req.body.name || '').trim()
  const rating = Number(req.body.rating)
  if (!productId) return res.status(400).json({ message: 'productId is required' })
  if (!name) return res.status(400).json({ message: 'Reviewer name is required' })
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' })
  }

  const id = 'REV-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const review = await Review.create({
    id,
    productId,
    name,
    rating: Math.round(rating),
    comment: String(req.body.comment || '').trim(),
  })
  res.status(201).json(review)
}

// DELETE /api/reviews/:id — admin-only (auth guard applied in the route)
exports.remove = async (req, res) => {
  await Review.findOneAndDelete({ id: req.params.id })
  res.json({ ok: true })
}
