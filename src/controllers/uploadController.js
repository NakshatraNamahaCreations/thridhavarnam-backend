const { cloudinary, isConfigured } = require('../config/cloudinary')

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

  const stream = cloudinary.uploader.upload_stream(
    { resource_type: 'image' },
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
