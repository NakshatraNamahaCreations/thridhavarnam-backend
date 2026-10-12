const router = require('express').Router()
const ah = require('../utils/asyncHandler')
const auth = require('../middleware/auth')
const c = require('../controllers/orderController')

router.use(auth)
router.get('/', ah(c.list))
// Must be registered before `/:id` so the literal segment wins the
// Express route match over the id placeholder.
router.get('/tracking', ah(c.tracking))
router.post('/', ah(c.create))
router.put('/:id', ah(c.update))
router.delete('/:id', ah(c.remove))

module.exports = router
