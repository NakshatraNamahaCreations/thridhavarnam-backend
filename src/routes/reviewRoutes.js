const router = require('express').Router()
const ah = require('../utils/asyncHandler')
const auth = require('../middleware/auth')
const c = require('../controllers/reviewController')

// Reads + create are public — anyone can submit a review from the
// storefront product page. Delete is admin-only.
router.get('/', ah(c.list))
router.post('/', ah(c.create))
router.delete('/:id', auth, ah(c.remove))

module.exports = router
