const router = require('express').Router()
const ah = require('../utils/asyncHandler')
const auth = require('../middleware/auth')
const c = require('../controllers/occasionController')

// Public read for the Next.js storefront; writes still admin-authed.
router.get('/', ah(c.list))

router.post('/', auth, ah(c.create))
router.put('/:id', auth, ah(c.update))
router.delete('/:id', auth, ah(c.remove))

module.exports = router
