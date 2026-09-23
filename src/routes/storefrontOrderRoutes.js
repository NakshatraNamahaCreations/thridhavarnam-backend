const router = require('express').Router()
const ah = require('../utils/asyncHandler')
const c = require('../controllers/storefrontOrderController')

// Public — the storefront checkout hits this without a JWT after
// Razorpay signature verification.
router.post('/', ah(c.place))

module.exports = router
