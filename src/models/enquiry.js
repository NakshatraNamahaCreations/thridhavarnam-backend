const mongoose = require('mongoose');

const enquirySchema = new mongoose.Schema(
  {
    ref: {
      type: String,
      unique: true,
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    weave: {
      type: String,
      default: '',
      trim: true,
    },

    occasion: {
      type: String,
      default: '',
      trim: true,
    },

    budget: {
      type: String,
      default: '',
      trim: true,
    },

    timeline: {
      type: String,
      default: '',
      trim: true,
    },

    notes: {
      type: String,
      default: '',
      trim: true,
    },

    status: {
      type: String,
      enum: [
        'new',
        'contacted',
        'in-progress',
        'converted',
        'closed',
      ],
      default: 'new',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Enquiry', enquirySchema);