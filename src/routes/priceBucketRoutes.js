const router = require('express').Router()
const ah = require('../utils/asyncHandler')
const auth = require('../middleware/auth')
const c = require('../controllers/priceBucketController')

// Public list + get so the storefront can render tiles without a token.
// Writes are admin-authed.
router.get('/', ah(c.list))
router.get('/:id', ah(c.getOne))

router.post('/', auth, ah(c.create))
router.put('/:id', auth, ah(c.update))
router.delete('/:id', auth, ah(c.remove))

module.exports = router
