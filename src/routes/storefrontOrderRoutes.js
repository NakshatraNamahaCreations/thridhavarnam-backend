const router = require('express').Router()
const ah = require('../utils/asyncHandler')
const c = require('../controllers/storefrontOrderController')

// Public — the storefront checkout hits this without a JWT after
// Razorpay signature verification.
router.post('/', ah(c.place))

// Public — the storefront thank-you / orders page polls this to drive
// the live tracker. See controller for the response shape.
router.get('/:id/tracking', ah(c.track))

module.exports = router
