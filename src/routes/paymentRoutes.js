const router = require('express').Router()
const ah = require('../utils/asyncHandler')
const auth = require('../middleware/auth')
const c = require('../controllers/paymentController')

router.use(auth)
router.get('/', ah(c.list))
router.post('/', ah(c.record))
router.patch('/:id/paid', ah(c.markPaid))
router.patch('/:id/refund', ah(c.refund))

module.exports = router
