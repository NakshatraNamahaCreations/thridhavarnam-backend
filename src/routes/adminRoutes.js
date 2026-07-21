const router = require('express').Router()
const ah = require('../utils/asyncHandler')
const auth = require('../middleware/auth')
const c = require('../controllers/adminController')

router.use(auth)
router.post('/reset', ah(c.reset))

module.exports = router
