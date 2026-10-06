// One-off migration: rewrite Cloudinary cloud name in every DB-stored URL.
//
// Usage (from Backend/):
//   node src/scripts/migrateCloudName.js --dry-run   # report counts, no writes
//   node src/scripts/migrateCloudName.js             # apply the rewrite
//
// Reads MONGODB_URI from .env. Idempotent — running it twice is a no-op.
//
// Change OLD / NEW below if these ever shift. Images must already exist at
// the same public_ids in the new cloud for the rewritten URLs to resolve.

require('dotenv').config()
const mongoose = require('mongoose')

const OLD = 'duetf78gt'
const NEW = 'wuko36n1'

const OLD_PREFIX = `res.cloudinary.com/${OLD}/`
const NEW_PREFIX = `res.cloudinary.com/${NEW}/`

const DRY = process.argv.includes('--dry-run')

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set in .env')
  await mongoose.connect(process.env.MONGODB_URI)
  console.log(`Connected to ${mongoose.connection.host}/${mongoose.connection.name}`)
  console.log(`Mode: ${DRY ? 'DRY-RUN (no writes)' : 'LIVE (writing)'}`)
  console.log(`Rewriting ${OLD_PREFIX}  ->  ${NEW_PREFIX}\n`)

  const db = mongoose.connection.db

  // Collection -> list of top-level string fields that may hold a Cloudinary
  // URL. Keeps everything in one table so adding a field later is one edit.
  const flatTargets = [
    { coll: 'products', fields: ['image'] },
    { coll: 'banners', fields: ['image'] },
    { coll: 'categories', fields: ['image'] },
    { coll: 'occasions', fields: ['image'] },
    { coll: 'stories', fields: ['image'] },
    { coll: 'pricebuckets', fields: ['image'] },
    { coll: 'users', fields: ['avatar'] },
    // Customer / Order / Payment store initials in `avatar`, but occasionally
    // an uploaded URL slips in. Including them is a safe no-op otherwise.
    { coll: 'customers', fields: ['avatar'] },
    { coll: 'orders', fields: ['avatar'] },
    { coll: 'payments', fields: ['avatar'] },
  ]

  for (const { coll, fields } of flatTargets) {
    const c = db.collection(coll)
    for (const f of fields) {
      const filter = { [f]: { $regex: OLD_PREFIX } }
      const matched = await c.countDocuments(filter)
      if (!matched) { console.log(`  ${coll}.${f}: 0 to update`); continue }
      if (DRY) { console.log(`  ${coll}.${f}: ${matched} would update`); continue }
      const r = await c.updateMany(filter, [
        { $set: { [f]: { $replaceAll: { input: `$${f}`, find: OLD_PREFIX, replacement: NEW_PREFIX } } } },
      ])
      console.log(`  ${coll}.${f}: ${r.modifiedCount} updated`)
    }
  }

  // Product.images is an array of { url, color } subdocuments. Need $map to
  // rewrite each entry's url in place while preserving the color field.
  const products = db.collection('products')
  const nestedFilter = { 'images.url': { $regex: OLD_PREFIX } }
  const nestedMatched = await products.countDocuments(nestedFilter)
  if (nestedMatched && DRY) {
    console.log(`  products.images[].url: ${nestedMatched} docs would update`)
  } else if (nestedMatched) {
    const r = await products.updateMany(nestedFilter, [
      {
        $set: {
          images: {
            $map: {
              input: '$images',
              as: 'img',
              in: {
                $mergeObjects: [
                  '$$img',
                  { url: { $replaceAll: { input: '$$img.url', find: OLD_PREFIX, replacement: NEW_PREFIX } } },
                ],
              },
            },
          },
        },
      },
    ])
    console.log(`  products.images[].url: ${r.modifiedCount} docs updated`)
  } else {
    console.log('  products.images[].url: 0 to update')
  }

  console.log(`\n${DRY ? 'Dry run complete.' : 'Done.'}`)
  await mongoose.connection.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
