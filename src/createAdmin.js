// One-off script to create OR reset an admin user.
//
// Usage:
//   node src/createAdmin.js                              # uses seedData.adminUser defaults
//   node src/createAdmin.js <email> <password>           # override email + password
//   node src/createAdmin.js <email> <password> "<name>"  # + full name
//
// Safe to run multiple times — if the email already exists the record is
// updated (password gets re-hashed via the User pre-save hook) instead of
// throwing a duplicate-key error. Role is always set to 'Store Admin'.
require('dotenv').config()
const mongoose = require('mongoose')
const User = require('./models/User')
const data = require('./seedData')

async function main() {
  const [, , emailArg, passwordArg, nameArg] = process.argv
  const email = (emailArg || data.adminUser.email).toLowerCase()
  const password = passwordArg || data.adminUser.password
  const name = nameArg || data.adminUser.name

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set in .env')
  }

  await mongoose.connect(process.env.MONGODB_URI)
  console.log(`🔌 Connected to ${mongoose.connection.name || 'default'} DB`)

  const existing = await User.findOne({ email })
  if (existing) {
    existing.name = name
    existing.role = 'Store Admin'
    existing.password = password
    await existing.save()
    console.log(`✅ Admin updated → ${email} / ${password}`)
  } else {
    await User.create({ name, email, password, role: 'Store Admin' })
    console.log(`✅ Admin created → ${email} / ${password}`)
  }

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('❌', err.message)
  process.exit(1)
})
