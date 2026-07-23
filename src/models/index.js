const mongoose = require('mongoose')

// Shared schema options: keep the custom string `id`, drop Mongo internals
// from JSON responses so the frontend can rely on `id` exactly as before.
const opts = {
  timestamps: true,
  toJSON: {
    transform: (_doc, ret) => {
      delete ret._id
      delete ret.__v
      return ret
    },
  },
}

const Product = mongoose.model(
  'Product',
  new mongoose.Schema(
    {
      id: { type: String, unique: true, index: true },
      name: String,
      category: String,
      occasion: String,
      fabric: String,
      color: String,
      description: String,
      price: Number,
      mrp: Number,
      stock: Number,
      sold: { type: Number, default: 0 },
      rating: { type: Number, default: 0 },
      status: String,
      // Stock/availability ribbons shown on the storefront card.
      // Allowed values: 'ready' | 'fast' | 'last'. Admin can override the
      // auto-derived-from-stock defaults by picking specific ones here.
      badges: { type: [String], default: [] },
      // Homepage / nav curation flags. Allowed values:
      //   'bestseller' — appears in the Bestsellers rail
      //   'new_in'    — appears under Featured > "New In"
      //   'sale'      — appears in the nav "Sale" and shop "On sale" filter
      flags: { type: [String], default: [] },
      // `image` remains the single hero used everywhere legacy code reads
      // one image. `images` is the full gallery: each entry pairs an image
      // URL / data URL with a color label so the storefront can group
      // variants by colorway. The controller keeps `image` synced to
      // `images[0].url`.
      image: String,
      images: {
        type: [{ url: String, color: String, _id: false }],
        default: [],
      },

      // Product Details section on the storefront accordion
      styleNo: String,
      designNo: String,
      weave: String,
      region: String,
      length: String,
      blouse: String,
      zari: String,
      weight: String,
      packContains: String,
      manufactured: String,

      // Product Speciality (long-form paragraph)
      story: String,

      // Style & Fit Tips (two separate paragraphs)
      styleTips: String,
      fitTips: String,

      // Shipping & Returns copy — free-form, newline-separated paragraphs
      shippingReturns: String,

      // FAQs — per-product question/answer list
      faqs: {
        type: [{ q: String, a: String, _id: false }],
        default: [],
      },
    },
    opts
  )
)

const Customer = mongoose.model(
  'Customer',
  new mongoose.Schema(
    {
      id: { type: String, unique: true, index: true },
      name: String,
      email: String,
      phone: String,
      city: String,
      orders: { type: Number, default: 0 },
      spent: { type: Number, default: 0 },
      segment: { type: String, default: 'New' },
      joined: String,
      avatar: String,
    },
    opts
  )
)

const Category = mongoose.model(
  'Category',
  new mongoose.Schema(
    {
      id: { type: String, unique: true, index: true },
      name: String,
      color: { type: String, default: 'maroon' },
    },
    opts
  )
)

const Occasion = mongoose.model(
  'Occasion',
  new mongoose.Schema(
    {
      id: { type: String, unique: true, index: true },
      name: String,
      color: { type: String, default: 'maroon' },
    },
    opts
  )
)

const Order = mongoose.model(
  'Order',
  new mongoose.Schema(
    {
      id: { type: String, unique: true, index: true },
      customer: String,
      avatar: String,
      city: String,
      product: String,
      items: { type: Number, default: 1 },
      amount: { type: Number, default: 0 },
      status: { type: String, default: 'pending' },
      payment: { type: String, default: 'pending' },
      date: String,

      // Full storefront-order payload — populated when the order comes
      // from the checkout popup (POST /api/storefront/orders). The admin
      // Orders table still reads the flat summary fields above; these
      // extras drive Shiprocket + the customer-facing order detail page.
      email: String,
      phone: String,
      address: {
        line1: String,
        line2: String,
        city: String,
        state: String,
        pincode: String,
        country: { type: String, default: 'India' },
        _id: false,
      },
      lineItems: {
        type: [
          {
            productId: String,
            name: String,
            sku: String,
            qty: Number,
            unitPrice: Number,
            _id: false,
          },
        ],
        default: [],
      },
      payMethod: String,       // 'upi' | 'card' | 'netbanking' | 'cod'
      shipMethod: String,      // 'standard' | 'express'
      promoCode: String,
      subtotal: Number,
      discount: Number,
      shippingFee: Number,
      codFee: Number,
      tax: Number,
      total: Number,
      razorpay: {
        orderId: String,
        paymentId: String,
        signature: String,
        _id: false,
      },
      shiprocket: {
        orderId: String,       // Shiprocket order_id (numeric)
        shipmentId: String,    // Shiprocket shipment_id
        awbCode: String,       // AWB assigned after courier is picked
        courier: String,
        status: String,        // 'created' | 'failed' | 'pending'
        error: String,         // last error message if push failed
        pushedAt: Date,
        _id: false,
      },
    },
    opts
  )
)

const Payment = mongoose.model(
  'Payment',
  new mongoose.Schema(
    {
      id: { type: String, unique: true, index: true },
      orderId: String,
      customer: String,
      avatar: String,
      amount: { type: Number, default: 0 },
      method: String,
      status: { type: String, default: 'paid' },
      date: String,
    },
    opts
  )
)

const Coupon = mongoose.model(
  'Coupon',
  new mongoose.Schema(
    {
      id: { type: String, unique: true, index: true },
      code: { type: String, unique: true, index: true },
      description: String,
      // 'percent' — value is a percentage 0-100; 'fixed' — value is an INR amount
      type: { type: String, default: 'percent' },
      value: { type: Number, default: 0 },
      minOrder: { type: Number, default: 0 },
      // Optional cap for percent coupons (INR).
      maxDiscount: Number,
      startDate: String,
      expiryDate: String,
      usageLimit: { type: Number, default: 0 }, // 0 = unlimited
      usageCount: { type: Number, default: 0 },
      active: { type: Boolean, default: true },
    },
    opts
  )
)

module.exports = { Product, Customer, Category, Occasion, Order, Payment, Coupon }
