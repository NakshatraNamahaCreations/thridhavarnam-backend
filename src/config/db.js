const mongoose = require('mongoose')

async function connectDB() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set in .env')
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri, {
    // Default pool is 5 — way too small when 10+ API calls fire simultaneously.
    // Each in-flight request holds a connection; anything beyond poolSize queues.
    maxPoolSize: 20,
    // Fail fast rather than letting queued requests pile up indefinitely.
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  console.log('✅ MongoDB connected:', mongoose.connection.host)
}

module.exports = connectDB
