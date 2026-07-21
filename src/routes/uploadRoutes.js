const router = require('express').Router()
const multer = require('multer')
const auth = require('../middleware/auth')
const c = require('../controllers/uploadController')

// Buffer files in memory so we can pipe them straight to Cloudinary
// without touching disk. 10MB per file matches Cloudinary's free-tier
// per-image limit; adjust if you upgrade the plan.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true)
    cb(new Error('Only image uploads are allowed'))
  },
})

// Admin-only. Field name must be "file".
router.post('/', auth, upload.single('file'), c.uploadOne)

module.exports = router
