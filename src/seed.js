const { Category } = require('./models')
const User = require('./models/User')
const data = require('./seedData')

// Ensure the default admin login exists, and seed the Category taxonomy
// if it's empty (so the storefront nav + filter aren't blank on a fresh
// database). Products, customers, orders and payments are NOT seeded —
// the store starts empty and fills in through real usage.
async function seedIfEmpty() {
  const admin = await User.findOne({ email: data.adminUser.email })
  if (!admin) {
    await User.create(data.adminUser)
    console.log(`👤 Admin created → ${data.adminUser.email} / ${data.adminUser.password}`)
  }

  if ((await Category.estimatedDocumentCount()) === 0) {
    await Category.insertMany(data.categories)
    console.log(`🌱 Seeded ${data.categories.length} category(ies)`)
  }
}

module.exports = { seedIfEmpty }
