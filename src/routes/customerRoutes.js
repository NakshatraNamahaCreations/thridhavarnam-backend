const router = require('express').Router()
const ah = require('../utils/asyncHandler')
const auth = require('../middleware/auth')
const c = require('../controllers/customerController')

router.use(auth)
router.get('/', ah(c.list))
router.post('/', ah(c.create))
router.put('/:id', ah(c.update))
router.delete('/:id', ah(c.remove))

module.exports = router
