// Standalone seeder: `npm run seed` — connects, seeds empty collections, exits.
require('dotenv').config()
const mongoose = require('mongoose')
const connectDB = require('./config/db')
const { seedIfEmpty } = require('./seed')

;(async () => {
  try {
    await connectDB()
    await seedIfEmpty()
    console.log('✅ Seed complete')
  } catch (err) {
    console.error('Seed failed:', err.message)
  } finally {
    await mongoose.connection.close()
    process.exit(0)
  }
})()
