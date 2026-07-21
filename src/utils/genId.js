// Generate the next sequential id (e.g. SAR-1052, #ORD-9922) by scanning the
// numeric portion of existing ids for a collection.
async function nextId(Model, prefix, pad = 4) {
  const docs = await Model.find({}, 'id').lean()
  const nums = docs
    .map((d) => parseInt(String(d.id).replace(/\D/g, ''), 10))
    .filter((n) => !Number.isNaN(n))
  const max = nums.length ? Math.max(...nums) : 0
  return `${prefix}${String(max + 1).padStart(pad, '0')}`
}

const initials = (name) =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

const today = () => new Date().toISOString().slice(0, 10)

module.exports = { nextId, initials, today }
