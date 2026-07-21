const jwt = require('jsonwebtoken')
const User = require('../models/User')

module.exports = async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ message: 'Not authorized — no token' })

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = await User.findById(decoded.id).select('-password')
    if (!req.user) return res.status(401).json({ message: 'Not authorized — user missing' })

    next()
  } catch {
    res.status(401).json({ message: 'Not authorized — invalid token' })
  }
}
