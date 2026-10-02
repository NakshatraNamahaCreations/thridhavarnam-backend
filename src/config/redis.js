// Redis connection + small helper methods.
//
// Redis is optional. Set REDIS_URL (e.g. redis://127.0.0.1:6379) to enable
// it; without it, or while Redis is down, every helper below quietly returns
// "nothing cached" and the API keeps working from MongoDB + the in-process
// cache. Nothing in the request path ever waits on a broken Redis: commands
// fail fast instead of queueing while disconnected.
//
// Two connections are used because a Redis connection in subscribe mode
// can't run normal commands:
//   * client     — GET/SET/INCR/PUBLISH/...
//   * subscriber — receives cache-invalidation messages from other workers
//                  and other servers.

const Redis = require('ioredis')

const PREFIX = process.env.REDIS_PREFIX || 'thv:'
const URL = process.env.REDIS_URL

let client = null
let subscriber = null
let lastErrorLog = 0

function logError(where, err) {
  // Avoid flooding logs while Redis is down: at most one line per 30s.
  const now = Date.now()
  if (now - lastErrorLog < 30000) return
  lastErrorLog = now
  console.error(`⚠️  Redis ${where}: ${err.message}`)
}

function makeConnection(name) {
  const conn = new Redis(URL, {
    keyPrefix: name === 'subscriber' ? undefined : PREFIX,
    connectionName: `thv-api-${name}-${process.pid}`,
    enableOfflineQueue: false, // fail fast when disconnected
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    retryStrategy: (times) => Math.min(times * 500, 5000), // keep reconnecting
  })
  conn.on('error', (err) => logError(name, err))
  return conn
}

function init() {
  if (!URL || client) return
  client = makeConnection('client')
  subscriber = makeConnection('subscriber')
  client.once('ready', () => console.log(`🟥 Redis connected (${process.pid})`))
}

const isReady = () => Boolean(client && client.status === 'ready')
const isEnabled = () => Boolean(URL)

// Run a command; on any Redis problem return `fallback` instead of throwing.
async function safe(where, fn, fallback = null) {
  if (!isReady()) return fallback
  try {
    return await fn(client)
  } catch (err) {
    logError(where, err)
    return fallback
  }
}

// ---- Helper methods -------------------------------------------------------

// JSON value or null.
async function getJSON(key) {
  const raw = await safe('get', (c) => c.get(key))
  if (raw == null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function setJSON(key, value, ttlSeconds = 300) {
  return safe('set', (c) => c.set(key, JSON.stringify(value), 'EX', ttlSeconds), false)
}

async function del(...keys) {
  return safe('del', (c) => c.del(...keys), 0)
}

// Cache-aside: return the cached value, or compute, store and return it.
async function remember(key, ttlSeconds, compute) {
  const hit = await getJSON(key)
  if (hit != null) return hit
  const value = await compute()
  if (value != null) setJSON(key, value, ttlSeconds)
  return value
}

// Binary hash (used by the response cache to store pre-gzipped bodies).
async function getHashBuffers(key) {
  const h = await safe('hgetall', (c) => c.hgetallBuffer(key))
  return h && Object.keys(h).length ? h : null
}

async function setHash(key, fields, ttlMs) {
  return safe(
    'hset',
    (c) => c.multi().hset(key, fields).pexpire(key, ttlMs).exec(),
    false,
  )
}

async function getNumber(key) {
  const v = await safe('get', (c) => c.get(key))
  return v == null ? 0 : Number(v) || 0
}

async function incr(key) {
  return safe('incr', (c) => c.incr(key))
}

// Pub/sub. Channel names are prefixed manually (keyPrefix doesn't apply).
async function publish(channel, message) {
  return safe('publish', (c) => c.publish(PREFIX + channel, message), 0)
}

function subscribe(channel, onMessage) {
  if (!subscriber) return
  const full = PREFIX + channel
  // Re-subscribe automatically after every reconnect.
  const doSubscribe = () => subscriber.subscribe(full).catch((err) => logError('subscribe', err))
  subscriber.on('ready', doSubscribe)
  if (subscriber.status === 'ready') doSubscribe()
  subscriber.on('message', (ch, msg) => {
    if (ch === full) onMessage(msg)
  })
}

async function quit() {
  await Promise.allSettled([client && client.quit(), subscriber && subscriber.quit()])
}

module.exports = {
  init,
  isReady,
  isEnabled,
  getJSON,
  setJSON,
  del,
  remember,
  getHashBuffers,
  setHash,
  getNumber,
  incr,
  publish,
  subscribe,
  quit,
}
