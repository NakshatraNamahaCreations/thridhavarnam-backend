// Response cache for the public, read-only storefront endpoints.
//
// Why: under a traffic spike (thousands of shoppers opening the homepage at
// once) every request used to run the same MongoDB query, JSON.stringify the
// result and gzip it again. GET /api/products alone takes ~3s against Atlas,
// so 1,000 concurrent shoppers queued up behind each other and nothing came
// back. This middleware makes that work happen once per cache window:
//
//   * Fresh hit   -> pre-serialised, pre-gzipped bytes are written straight to
//                    the socket (no DB, no JSON.stringify, no gzip).
//   * Single-flight -> on a miss only ONE request runs the route handler;
//                    every concurrent request for the same URL waits for it.
//   * Stale-while-revalidate -> once an entry expires, storefront visitors keep
//                    getting the previous copy while one request refreshes it.
//   * ETag / 304  -> repeat visitors with a cached copy get an empty 304.
//
// Two cache layers:
//   L1  in-process Map (fastest, per worker)
//   L2  Redis (optional, REDIS_URL) shared by every worker and every server,
//       so a cold worker or a freshly restarted server gets the products
//       list from Redis in ~1ms instead of re-running the 3s MongoDB query.
//
// Any successful write (admin edit, storefront order that changes stock, ...)
// calls invalidateAll(), which marks every L1 entry stale, bumps the Redis
// cache version (old L2 keys become unreachable and expire on their own) and
// publishes a Redis message so every worker on every server drops its L1
// copy immediately. Without Redis, our cluster primary (src/index.js) relays
// the same message between sibling workers over IPC. Requests carrying an Authorization header (the admin panel)
// never receive a stale copy, so admins always see their own edits at once.

const zlib = require('zlib')
const crypto = require('crypto')
const kvCache = require('./cache')
const redis = require('../config/redis')

const FRESH_MS = (Number(process.env.CACHE_TTL_SECONDS) || 60) * 1000
const STALE_MS = (Number(process.env.CACHE_STALE_SECONDS) || 600) * 1000
const MAX_ENTRIES = Number(process.env.CACHE_MAX_ENTRIES) || 500
const DEFAULT_CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=120'
const INVALIDATE_MSG = 'thv:cache-invalidate'

const store = new Map() // url -> entry
const inflight = new Map() // url -> [{ req, res, next }] waiting on the leader
let generation = 0
let redisVersion = 0 // current L2 namespace; bumped on every invalidation
// Number of version bumps this worker has sent but Redis hasn't confirmed.
// While > 0 the old namespace may still hold pre-write data, so L2 is skipped.
let pendingBumps = 0
const l2Usable = () => pendingBumps === 0 && redis.isReady()
const REDIS_VERSION_KEY = 'rc:version'
const REDIS_CHANNEL = 'cache-invalidate'

const redisKey = (url) => `rc:${redisVersion}:${url}`

// L2 read: returns an entry shaped like buildEntry()'s, or null.
async function loadFromRedis(key) {
  if (!l2Usable()) return null
  const h = await redis.getHashBuffers(redisKey(key))
  if (!h || !h.body || !h.etag) return null
  const created = Number(h.created) || Date.now()
  return {
    body: h.body,
    gzip: h.gz && h.gz.length ? h.gz : null,
    etag: h.etag.toString(),
    cacheControl: h.cc ? h.cc.toString() : DEFAULT_CACHE_CONTROL,
    freshUntil: created + FRESH_MS,
    staleUntil: created + FRESH_MS + STALE_MS,
  }
}

// L2 write (fire-and-forget; a Redis hiccup never affects the response).
function saveToRedis(key, entry) {
  if (!l2Usable()) return
  redis.setHash(
    redisKey(key),
    {
      body: entry.body,
      gz: entry.gzip || Buffer.alloc(0),
      etag: entry.etag,
      cc: entry.cacheControl,
      created: String(entry.freshUntil - FRESH_MS),
    },
    FRESH_MS,
  )
}

function buildEntry(body, cacheControl) {
  const gzip = body.length > 1024 ? zlib.gzipSync(body, { level: 6 }) : null
  const hash = crypto.createHash('sha1').update(body).digest('base64url').slice(0, 27)
  const now = Date.now()
  return {
    body,
    gzip,
    etag: `"${hash}"`,
    cacheControl: cacheControl || DEFAULT_CACHE_CONTROL,
    freshUntil: now + FRESH_MS,
    staleUntil: now + FRESH_MS + STALE_MS,
  }
}

function remember(key, entry) {
  store.delete(key) // re-insert so Map order stays oldest-first
  store.set(key, entry)
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value)
}

function send(req, res, entry, state) {
  if (res.headersSent || res.writableEnded) return
  const isAdmin = Boolean(req.headers.authorization)
  res.setHeader('X-Cache', state)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  // Admin requests must revalidate every time (cheap thanks to the ETag) so
  // the panel never shows a browser-cached list right after an edit.
  res.setHeader('Cache-Control', isAdmin ? 'private, no-cache' : entry.cacheControl)
  res.setHeader('ETag', entry.etag)
  res.vary('Accept-Encoding')

  if (req.fresh) {
    res.statusCode = 304
    return res.end()
  }

  const useGzip = entry.gzip && /\bgzip\b/i.test(req.headers['accept-encoding'] || '')
  const payload = useGzip ? entry.gzip : entry.body
  if (useGzip) res.setHeader('Content-Encoding', 'gzip')
  res.setHeader('Content-Length', payload.length)
  res.statusCode = 200
  return req.method === 'HEAD' ? res.end() : res.end(payload)
}

// Express middleware. Mount it only on routers whose GET responses are
// public and identical for every caller.
function cachePublicGet(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next()

  const key = req.originalUrl
  const entry = store.get(key)
  const now = Date.now()
  const isAdmin = Boolean(req.headers.authorization)

  if (entry && now < entry.freshUntil) return send(req, res, entry, 'HIT')

  const waiters = inflight.get(key)
  if (waiters) {
    // Someone is already refreshing this URL. Shoppers get the previous copy
    // immediately if we have one; otherwise (and for admins) wait for it.
    if (entry && !isAdmin && now < entry.staleUntil) return send(req, res, entry, 'STALE')
    waiters.push({ req, res, next })
    return
  }

  // This request becomes the leader and actually runs the route handler.
  inflight.set(key, [])
  const startedAt = generation
  let settled = false

  const settle = (fresh) => {
    if (settled) return
    settled = true
    const queued = inflight.get(key) || []
    inflight.delete(key)
    // Only store the result if no write happened while we were querying.
    if (fresh && startedAt === generation) remember(key, fresh)
    const fallback = fresh || (entry && Date.now() < entry.staleUntil ? entry : null)
    for (const w of queued) {
      if (fallback) send(w.req, w.res, fallback, fresh ? 'HIT' : 'STALE')
      else w.next() // leader failed and nothing cached: let each run normally
    }
  }

  const runHandler = () => {
    const originalJson = res.json.bind(res)
    res.json = (obj) => {
      if (res.statusCode !== 200) {
        settle(null)
        return originalJson(obj)
      }
      let fresh
      try {
        fresh = buildEntry(Buffer.from(JSON.stringify(obj)), res.getHeader('Cache-Control'))
      } catch (err) {
        settle(null)
        return originalJson(obj)
      }
      settle(fresh)
      if (startedAt === generation) saveToRedis(key, fresh)
      return send(req, res, fresh, 'MISS')
    }
    return next()
  }

  // Errors, aborted connections, non-JSON responses: release the waiters.
  res.on('close', () => settle(null))

  // L2: another worker or server may already have this response in Redis.
  if (!l2Usable()) return runHandler()
  loadFromRedis(key)
    .then((shared) => {
      if (shared && startedAt === generation && Date.now() < shared.freshUntil) {
        settle(shared)
        return send(req, res, shared, 'REDIS')
      }
      return runHandler()
    })
    .catch(() => runHandler())
}

// Mark everything stale (kept as a fallback, never served to admins) and
// clear the older key/value cache used by storefront/init and controllers.
function invalidateAll({ broadcast = true } = {}) {
  generation++
  for (const entry of store.values()) entry.freshUntil = 0
  kvCache.clear()
  if (!broadcast) return
  const viaIpc = () => {
    if (process.env.THV_CLUSTER_WORKER === '1' && process.send) process.send({ type: INVALIDATE_MSG })
  }
  if (!redis.isReady()) return viaIpc()
  // Redis reaches every worker on every server, so no IPC needed unless the
  // version bump fails.
  pendingBumps++
  redis
    .incr(REDIS_VERSION_KEY)
    .then((v) => {
      if (v == null) return viaIpc()
      redisVersion = Math.max(redisVersion, Number(v))
      return redis.publish(REDIS_CHANNEL, `${v}:${process.pid}`)
    })
    .catch(viaIpc)
    .finally(() => {
      pendingBumps--
    })
}

process.on('message', (msg) => {
  if (msg && msg.type === INVALIDATE_MSG) invalidateAll({ broadcast: false })
})

// Call once per process after redis.init(): load the current L2 namespace
// and listen for invalidations from other workers / servers.
function attachRedis() {
  if (!redis.isEnabled()) return
  const syncVersion = async () => {
    const v = await redis.getNumber(REDIS_VERSION_KEY)
    if (v > redisVersion) redisVersion = v
  }
  const poll = setInterval(() => {
    if (redis.isReady()) {
      clearInterval(poll)
      syncVersion()
    }
  }, 200)
  poll.unref()
  redis.subscribe(REDIS_CHANNEL, (msg) => {
    const [version, pid] = String(msg).split(':')
    const v = Number(version) || 0
    if (v > redisVersion) redisVersion = v
    if (pid !== String(process.pid)) invalidateAll({ broadcast: false })
  })
}

// Path prefixes whose writes never change cached storefront data.
const WRITE_IGNORE = ['/api/auth', '/api/enquiries', '/api/customers', '/api/upload']

// App-level middleware: after any successful write, invalidate the caches.
function invalidateOnWrite(req, res, next) {
  const m = req.method
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return next()
  if (WRITE_IGNORE.some((p) => req.originalUrl.startsWith(p))) return next()
  res.on('finish', () => {
    if (res.statusCode < 400) invalidateAll()
  })
  return next()
}

module.exports = { cachePublicGet, invalidateOnWrite, invalidateAll, attachRedis, INVALIDATE_MSG }
