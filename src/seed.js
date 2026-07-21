const { Product, Customer, Category, Order, Payment } = require('./models')
const User = require('./models/User')
const data = require('./seedData')

// Insert demo content for any collection that is currently empty, and make
// sure a default admin login exists.
async function seedIfEmpty() {
  const admin = await User.findOne({ email: data.adminUser.email })
  if (!admin) {
    await User.create(data.adminUser)
    console.log(`👤 Admin created → ${data.adminUser.email} / ${data.adminUser.password}`)
  }

  const pairs = [
    [Category, data.categories],
    [Product, data.products],
    [Customer, data.customers],
    [Order, data.orders],
    [Payment, data.buildPayments()],
  ]
  for (const [Model, seed] of pairs) {
    if ((await Model.estimatedDocumentCount()) === 0) {
      await Model.insertMany(seed)
      console.log(`🌱 Seeded ${seed.length} ${Model.modelName.toLowerCase()}(s)`)
    }
  }
}

// Wipe all business collections and re-seed (used by the "Reset demo data"
// button). User accounts are left untouched.
async function reset() {
  await Promise.all([
    Product.deleteMany({}),
    Customer.deleteMany({}),
    Category.deleteMany({}),
    Order.deleteMany({}),
    Payment.deleteMany({}),
  ])
  await Category.insertMany(data.categories)
  await Product.insertMany(data.products)
  await Customer.insertMany(data.customers)
  await Order.insertMany(data.orders)
  await Payment.insertMany(data.buildPayments())
}

module.exports = { seedIfEmpty, reset }
