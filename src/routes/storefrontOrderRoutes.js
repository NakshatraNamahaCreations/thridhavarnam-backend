const router = require('express').Router()
const ah = require('../utils/asyncHandler')
const c = require('../controllers/storefrontOrderController')

// Public — the storefront checkout hits this without a JWT after
// Razorpay signature verification.
router.post('/', ah(c.place))

// Public — the signed-in storefront /account/orders page hydrates
// from here. Scoped by email query param (the client's identifier).
router.get('/', ah(c.list))

// Public — batched live Shiprocket tracking for the /account/orders
// list. Must be registered BEFORE the `/:id/tracking` route below so
// the literal `tracking` segment wins the Express match.
router.get('/tracking', ah(c.listTracking))

// Public — the storefront thank-you / orders page polls this to drive
// the live tracker. See controller for the response shape.
router.get('/:id/tracking', ah(c.track))

// Public — the storefront /account/orders cancel button hits this.
// Soft email check in the body prevents trivial id-guessing attacks.
router.post('/:id/cancel', ah(c.cancel))

module.exports = router
