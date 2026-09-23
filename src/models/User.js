const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    // Optional profile fields collected from the storefront signup form.
    firstName: String,
    lastName: String,
    mobile: String,
    dob: String, // ISO yyyy-mm-dd
    // Cloudinary URL for the profile photo shown in the admin panel
    // header + Settings > Profile. Empty string means "use initials".
    avatar: { type: String, default: '' },
    role: { type: String, default: 'Customer' },
  },
  { timestamps: true }
)

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 10)
  next()
})

userSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password)
}

module.exports = mongoose.model('User', userSchema)
