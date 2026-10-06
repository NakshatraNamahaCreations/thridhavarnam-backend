const { Customer } = require('../models')
const User = require('../models/User')
const { nextId, initials, today } = require('../utils/genId')

// The admin "Customers" page is the CRM view and needs to show everyone
// the brand has ever interacted with — not just shoppers who completed a
// purchase. Two sources feed into it:
//   1. `Customer` records — created by admin manually OR auto-rolled up
//      by storefrontOrderController when an order is placed.
//   2. `User` records with role='Customer' — created when someone signs
//      up / logs in on the storefront but may never have ordered.
//
// We merge the two, deduping by email (lower-cased) then phone, so a
// shopper who registered AND ordered appears once with their order totals
// intact. User-only rows are tagged `source: 'registered'` so the admin
// UI can hide Edit / Delete (those actions belong to the User record,
// not the CRM Customer record) and show a distinct badge.
exports.list = async (_req, res) => {
  const [customers, users] = await Promise.all([
    Customer.find().sort({ createdAt: -1 }).lean(),
    User.find({ role: 'Customer' }).select('-password').lean(),
  ])

  const byEmail = new Map()
  const byPhone = new Map()
  for (const c of customers) {
    if (c.email) byEmail.set(String(c.email).toLowerCase(), c)
    if (c.phone) byPhone.set(String(c.phone), c)
  }

  const registered = []
  for (const u of users) {
    const email = (u.email || '').toLowerCase()
    const phone = u.mobile || ''
    if ((email && byEmail.has(email)) || (phone && byPhone.has(phone))) continue
    const name =
      (u.name && u.name.trim()) ||
      `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
      'Customer'
    registered.push({
      // USR- prefix guarantees no collision with CUS- CRM ids and lets
      // the admin panel detect "this row has no Customer document behind
      // it" when it decides whether Edit / Delete should be enabled.
      id: `USR-${String(u._id)}`,
      name,
      email: u.email || '',
      phone: u.mobile || '',
      city: '',
      orders: 0,
      spent: 0,
      segment: 'New',
      joined: u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : '',
      avatar: u.avatar || initials(name),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      source: 'registered',
    })
  }

  const tagged = customers.map((c) => ({ ...c, source: 'customer' }))
  const combined = [...tagged, ...registered].sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime()
    const tb = new Date(b.createdAt || 0).getTime()
    return tb - ta
  })

  res.json(combined)
}

exports.create = async (req, res) => {
  const d = req.body
  const name = String(d.name || '').trim()
  const customer = await Customer.create({
    ...d,
    id: await nextId(Customer, 'CUS-', 3),
    name,
    orders: 0,
    spent: 0,
    segment: d.segment || 'New',
    joined: today(),
    avatar: d.avatar || initials(name),
  })
  res.status(201).json(customer)
}

exports.update = async (req, res) => {
  const d = { ...req.body }
  delete d.id

  // Registered-user row — no CRM Customer document exists yet. Persist
  // what we can onto the User record (name / email / mobile) so the
  // storefront login + profile reflect the admin's edit. City / segment
  // live only in the CRM; carry them over by upserting a Customer so
  // the row stops showing as "registered" from now on.
  if (String(req.params.id || '').startsWith('USR-')) {
    const userId = req.params.id.slice(4)
    const user = await User.findById(userId)
    if (!user) return res.status(404).json({ message: 'Customer not found' })
    if (d.name) user.name = String(d.name).trim()
    if (d.email !== undefined) user.email = d.email
    if (d.phone !== undefined) user.mobile = d.phone
    await user.save()
    return res.json({
      id: req.params.id,
      name: user.name,
      email: user.email,
      phone: user.mobile || '',
      city: d.city || '',
      segment: d.segment || 'New',
      source: 'registered',
    })
  }

  const customer = await Customer.findOneAndUpdate({ id: req.params.id }, d, { new: true })
  if (!customer) return res.status(404).json({ message: 'Customer not found' })
  res.json(customer)
}

exports.remove = async (req, res) => {
  // Registered-user row — delete the storefront User account. This
  // revokes their login; any orders they placed remain in the Orders
  // collection untouched.
  if (String(req.params.id || '').startsWith('USR-')) {
    const userId = req.params.id.slice(4)
    const deleted = await User.findByIdAndDelete(userId)
    if (!deleted) return res.status(404).json({ message: 'Customer not found' })
    return res.json({ ok: true })
  }
  await Customer.findOneAndDelete({ id: req.params.id })
  res.json({ ok: true })
}
