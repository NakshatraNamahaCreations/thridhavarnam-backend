require('dotenv').config()
const cluster = require('cluster')
const os = require('os')

// --dev (used by `npm run dev`): single process + log every request.
const DEV = process.argv.includes('--dev')

// One Node process uses one CPU core. In production we fork one worker per
// core (override with WEB_CONCURRENCY) so the API can use the whole server.
// Under PM2 cluster mode this file already runs inside a cluster worker, so
// cluster.isPrimary is false and we simply start the server.
const WORKERS = DEV
  ? 1
  : Number(process.env.WEB_CONCURRENCY) ||
    Math.min(os.availableParallelism ? os.availableParallelism() : os.cpus().length, 8)

if (cluster.isPrimary && WORKERS > 1) {
  startPrimary()
} else {
  startServer()
}

function startPrimary() {
  const { INVALIDATE_MSG } = require('./utils/responseCache')
  let shuttingDown = false
  const indexOf = new Map() // worker.id -> WORKER_INDEX

  const fork = (index) => {
    const worker = cluster.fork({ THV_CLUSTER_WORKER: '1', WORKER_INDEX: String(index) })
    indexOf.set(worker.id, index)
  }

  console.log(`🧵 Primary ${process.pid} starting ${WORKERS} API workers`)
  for (let i = 0; i < WORKERS; i++) fork(i)

  // A write in one worker must invalidate the cache in all the others.
  cluster.on('message', (from, msg) => {
    if (!msg || msg.type !== INVALIDATE_MSG) return
    for (const w of Object.values(cluster.workers)) {
      if (w && w.id !== from.id && w.isConnected()) w.send(msg)
    }
  })

  cluster.on('exit', (worker, code, signal) => {
    const index = indexOf.get(worker.id)
    indexOf.delete(worker.id)
    if (shuttingDown) return
    console.error(`⚠️  Worker ${worker.process.pid} exited (${signal || code}); restarting`)
    setTimeout(() => fork(index), 1000)
  })

  const shutdown = () => {
    shuttingDown = true
    for (const w of Object.values(cluster.workers)) w && w.process.kill('SIGTERM')
    setTimeout(() => process.exit(0), 5000).unref()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

function startServer() {
  const express = require('express')
  const compression = require('compression')
  const cors = require('cors')
  const morgan = require('morgan')
  const connectDB = require('./config/db')
  const { seedIfEmpty } = require('./seed')
  const errorHandler = require('./middleware/error')
  const redis = require('./config/redis')
  const { cachePublicGet, invalidateOnWrite, attachRedis } = require('./utils/responseCache')

  // Optional shared cache (REDIS_URL). The API runs fine without it.
  redis.init()
  attachRedis()

  // If our cluster primary goes away, exit instead of lingering orphaned.
  if (process.env.THV_CLUSTER_WORKER === '1') process.on('disconnect', () => process.exit(0))

  const app = express()
  app.set('trust proxy', 1) // behind nginx
  app.disable('x-powered-by')

  app.use(compression()) // gzip all responses — biggest single bandwidth win
  // app.use(cors({ origin: true, credentials: true }))
  const allowedOrigins = [
  'https://admin.thridhavarnam.com',
  'https://www.thridhavarnam.com',
  'https://thridhavarnam.com'
]

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error(`CORS blocked origin: ${origin}`))
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)
  app.use(express.json({ limit: '12mb' })) // large limit so base64 saree images fit
  // Writing a log line for every successful request is a measurable cost at
  // thousands of requests per second. Outside --dev, log only failures, or
  // everything when LOG_REQUESTS=1.
  const logAll = DEV || process.env.LOG_REQUESTS === '1'
  app.use(morgan(logAll ? 'dev' : 'combined', { skip: (_req, res) => !logAll && res.statusCode < 400 }))
  app.use(invalidateOnWrite)

  app.get('/api/health', (_req, res) =>
    res.json({
      ok: true,
      service: 'vastra-crm-api',
      redis: redis.isEnabled() ? (redis.isReady() ? 'up' : 'down') : 'disabled',
    }),
  )

  // Public read endpoints used by the storefront are served through the
  // response cache (see utils/responseCache.js). Writes on these routers
  // still go straight to their handlers.
  const cached = cachePublicGet

  app.use('/api/auth', require('./routes/authRoutes'))
  app.use('/api/products', cached, require('./routes/productRoutes'))
  app.use('/api/customers', require('./routes/customerRoutes'))
  app.use('/api/enquiries', require('./routes/enquiryRoutes'))
  app.use('/api/categories', cached, require('./routes/categoryRoutes'))
  app.use('/api/occasions', cached, require('./routes/occasionRoutes'))
  app.use('/api/stories', cached, require('./routes/storyRoutes'))
  app.use('/api/reviews', cached, require('./routes/reviewRoutes'))
  app.use('/api/banners', cached, require('./routes/bannerRoutes'))
  app.use('/api/price-buckets', cached, require('./routes/priceBucketRoutes'))
  app.use('/api/colorways', cached, require('./routes/colorwayRoutes'))
  app.use('/api/coupons', require('./routes/couponRoutes'))
  app.use('/api/orders', require('./routes/orderRoutes'))
  app.use('/api/storefront/orders', require('./routes/storefrontOrderRoutes'))
  app.use('/api/storefront/init', cached, require('./routes/storefrontInitRoutes'))
  app.use('/api/payments', require('./routes/paymentRoutes'))
  app.use('/api/upload', require('./routes/uploadRoutes'))

  app.use((req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` }))
  app.use(errorHandler)

  const PORT = process.env.PORT || 5000
  const isFirstWorker = (process.env.WORKER_INDEX || '0') === '0'

  connectDB()
    .then(async () => {
      if (isFirstWorker) await seedIfEmpty()
      // backlog: how many not-yet-accepted connections the kernel may queue.
      // Node's default (511) overflows when thousands of shoppers connect at
      // once, and the overflow shows up as connection timeouts. On Linux the
      // effective value is capped by net.core.somaxconn (see deploy/).
      const server = app.listen({ port: Number(PORT), backlog: Number(process.env.LISTEN_BACKLOG) || 4096 }, () =>
        console.log(`🚀 API ${process.pid} running on http://localhost:${PORT}`),
      )
      // Keep idle keep-alive sockets open longer than nginx's upstream
      // keepalive_timeout so nginx never reuses a socket Node just closed.
      server.keepAliveTimeout = 65000
      server.headersTimeout = 66000
      process.on('SIGTERM', () => {
        server.close(() => redis.quit().finally(() => process.exit(0)))
        setTimeout(() => process.exit(0), 10000).unref()
      })
    })
    .catch((err) => {
      console.error('Failed to start server:', err.message)
      process.exit(1)
    })
}
