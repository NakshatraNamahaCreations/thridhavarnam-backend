// Simple in-memory TTL cache for rarely-changing data (categories, occasions,
// banners, etc.). Avoids a MongoDB round-trip on every storefront request.
// Invalidate a key whenever the admin writes to that collection.
const store = new Map()

function get(key) {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }
  return entry.value
}

// ttlSeconds defaults to 300 (5 minutes)
function set(key, value, ttlSeconds = 300) {
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
}

function del(key) {
  store.delete(key)
}

function clear() {
  store.clear()
}

module.exports = { get, set, del, clear }
