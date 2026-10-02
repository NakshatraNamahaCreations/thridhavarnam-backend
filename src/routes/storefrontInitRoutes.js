// Single endpoint the storefront calls on first load to fetch all static
// reference data in one round-trip instead of 5 separate requests.
// All collections here are served from the in-memory cache after the first
// MongoDB hit, so repeated calls are essentially free.
const express = require('express')
const router = express.Router()
const { Category, Occasion, Banner, PriceBucket, Coupon } = require('../models')
const cache = require('../utils/cache')

const PROJ = { _id: 0, __v: 0 }

async function getCached(key, queryFn, ttl = 300) {
  const hit = cache.get(key)
  if (hit) return hit
  const data = await queryFn()
  cache.set(key, data, ttl)
  return data
}

router.get('/', async (_req, res, next) => {
  try {
    const [categories, occasions, banners, priceBuckets, coupons] = await Promise.all([
      getCached('categories',   () => Category.find({}, PROJ).sort({ order: 1, createdAt: 1 }).lean()),
      getCached('occasions',    () => Occasion.find({}, PROJ).sort({ createdAt: 1 }).lean()),
      getCached('banners',      () => Banner.find({}, PROJ).sort({ order: 1, createdAt: 1 }).lean()),
      getCached('price-buckets',() => PriceBucket.find({}, PROJ).sort({ order: 1, createdAt: 1 }).lean()),
      getCached('coupons',      () => Coupon.find({}, PROJ).sort({ createdAt: -1 }).lean(), 120),
    ])
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
    res.json({ categories, occasions, banners, priceBuckets, coupons })
  } catch (err) {
    next(err)
  }
})

module.exports = router
