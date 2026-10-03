const { cloudinary, isConfigured } = require('../config/cloudinary')

// MIME types we leave in their original format on Cloudinary:
//   - svg: converting to raster WebP would lose scalability
//   - webp: already WebP
//   - gif: animated frames would need animated-webp handling; conservative
// Everything else (jpeg/png/heic/avif/…) is converted to WebP on ingest.
const SKIP_CONVERT = new Set(['image/svg+xml', 'image/webp', 'image/gif'])

// POST /api/upload
// multipart/form-data with field name "file". Streams the file buffer
// (held in memory by multer) directly to Cloudinary and returns the
// secure_url the admin panel then stores on the product.
exports.uploadOne = (req, res) => {
  if (!isConfigured()) {
    return res
      .status(500)
      .json({ message: 'Cloudinary is not configured on the server' })
  }
  if (!req.file) {
    return res.status(400).json({ message: 'No file provided (field: "file")' })
  }

  // Convert JPG/PNG uploads to WebP at ingest so the stored asset — and
  // every delivery URL that doesn't go through Cloudinary's f_auto
  // transformation — is already the compact format.
  const uploadOptions = { resource_type: 'image' }
  if (!SKIP_CONVERT.has(req.file.mimetype || '')) {
    uploadOptions.format = 'webp'
    uploadOptions.quality = 'auto:good'
  }

  const stream = cloudinary.uploader.upload_stream(
    uploadOptions,
    (err, result) => {
      if (err) {
        return res.status(502).json({ message: err.message || 'Upload failed' })
      }
      res.json({
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        format: result.format,
      })
    },
  )
  stream.end(req.file.buffer)
}
