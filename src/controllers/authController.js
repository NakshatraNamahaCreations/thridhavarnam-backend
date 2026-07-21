const jwt = require('jsonwebtoken')
const User = require('../models/User')

const sign = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' })

const sanitize = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  firstName: u.firstName,
  lastName: u.lastName,
  mobile: u.mobile,
  dob: u.dob,
})

exports.register = async (req, res) => {
  const { name, email, password, firstName, lastName, mobile, dob, role } = req.body
  // Accept either a single `name` or a first/last pair from the storefront
  // signup form.
  const fullName = (name || `${firstName || ''} ${lastName || ''}`).trim()
  if (!fullName || !email || !password)
    return res.status(400).json({ message: 'Name, email and password are required' })
  if (String(password).length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters' })

  const exists = await User.findOne({ email: email.toLowerCase() })
  if (exists) return res.status(409).json({ message: 'An account with this email already exists' })

  const user = await User.create({
    name: fullName,
    email,
    password,
    firstName,
    lastName,
    mobile,
    dob,
    // Only allow the client to opt into 'Customer'. Admin roles must be
    // set out-of-band so an open signup can't privilege-escalate.
    role: role === 'Customer' ? 'Customer' : 'Customer',
  })
  res.status(201).json({ token: sign(user), user: sanitize(user) })
}

exports.login = async (req, res) => {
  const { email, password } = req.body
  const user = await User.findOne({ email: (email || '').toLowerCase() })
  if (!user || !(await user.matchPassword(password)))
    return res.status(401).json({ message: 'Invalid email or password' })

  res.json({ token: sign(user), user: sanitize(user) })
}

exports.me = async (req, res) => {
  res.json(sanitize(req.user))
}
