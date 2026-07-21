const router = require('express').Router()
const ah = require('../utils/asyncHandler')
const auth = require('../middleware/auth')
const c = require('../controllers/couponController')

// Public read so the storefront checkout can validate a code without auth.
router.get('/', ah(c.list))

router.post('/', auth, ah(c.create))
router.put('/:id', auth, ah(c.update))
router.delete('/:id', auth, ah(c.remove))

module.exports = router
