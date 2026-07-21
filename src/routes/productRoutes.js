const router = require('express').Router()
const ah = require('../utils/asyncHandler')
const auth = require('../middleware/auth')
const c = require('../controllers/productController')

// Reads are public so the Next.js storefront can render the catalogue and
// product detail page without a token. Writes stay behind the admin auth
// middleware.
router.get('/', ah(c.list))
router.get('/:id', ah(c.getOne))

router.post('/', auth, ah(c.create))
router.post('/bulk', auth, ah(c.bulkCreate))
router.put('/:id', auth, ah(c.update))
router.patch('/:id/restock', auth, ah(c.restock))
router.delete('/:id', auth, ah(c.remove))

module.exports = router
