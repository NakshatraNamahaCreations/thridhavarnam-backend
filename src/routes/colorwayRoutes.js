const router = require('express').Router()
const COLORWAYS = require('../data/colorways')

// Public — the admin dropdowns and (eventually) the storefront read this.
router.get('/', (_req, res) => res.json(COLORWAYS))

module.exports = router
