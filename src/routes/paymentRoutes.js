const router = require('express').Router()
const ah = require('../utils/asyncHandler')
const auth = require('../middleware/auth')
const c = require('../controllers/paymentController')
const rzp = require('../controllers/razorpayController')

// Public storefront endpoints — the browser hits these without a JWT.
// Signature verification below guarantees the payment is real.
router.post('/razorpay/order', ah(rzp.createOrder))
router.post('/razorpay/verify', ah(rzp.verify))

router.use(auth)
router.get('/', ah(c.list))
router.post('/', ah(c.record))
router.patch('/:id/paid', ah(c.markPaid))
router.patch('/:id/refund', ah(c.refund))

module.exports = router
