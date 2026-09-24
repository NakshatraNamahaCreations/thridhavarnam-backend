require('dotenv').config()
const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const connectDB = require('./config/db')
const { seedIfEmpty } = require('./seed')
const errorHandler = require('./middleware/error')

const app = express()

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '12mb' })) // large limit so base64 saree images fit
app.use(morgan('dev'))

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'vastra-crm-api' }))

app.use('/api/auth', require('./routes/authRoutes'))
app.use('/api/products', require('./routes/productRoutes'))
app.use('/api/customers', require('./routes/customerRoutes'))
app.use('/api/enquiries', require('./routes/enquiryRoutes'))
app.use('/api/categories', require('./routes/categoryRoutes'))
app.use('/api/occasions', require('./routes/occasionRoutes'))
app.use('/api/stories', require('./routes/storyRoutes'))
app.use('/api/reviews', require('./routes/reviewRoutes'))
app.use('/api/banners', require('./routes/bannerRoutes'))
app.use('/api/price-buckets', require('./routes/priceBucketRoutes'))
app.use('/api/colorways', require('./routes/colorwayRoutes'))
app.use('/api/coupons', require('./routes/couponRoutes'))
app.use('/api/orders', require('./routes/orderRoutes'))
app.use('/api/storefront/orders', require('./routes/storefrontOrderRoutes'))
app.use('/api/payments', require('./routes/paymentRoutes'))
app.use('/api/upload', require('./routes/uploadRoutes'))

app.use((req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` }))
app.use(errorHandler)

const PORT = process.env.PORT || 5000

console.log(process.env.MONGODB_URI);
connectDB()
  .then(async () => {
    await seedIfEmpty()
    app.listen(PORT, () => console.log(`🚀 API running on http://localhost:${PORT}`))
  })
  .catch((err) => {
    console.error('Failed to start server:', err.message)
    process.exit(1)
  })
