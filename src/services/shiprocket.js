const axios = require('axios')

// Shiprocket REST base — v1 external API, per
// https://apidocs.shiprocket.in/. We do not open any URLs at build time;
// this is the documented base and would need updating if Shiprocket
// deprecates v1.
const BASE = 'https://apiv2.shiprocket.in/v1/external'

// Package defaults for a folded saree box. Weights are kg, dimensions
// are cm — matching Shiprocket's API expectations.
const DEFAULTS = {
  weightKg: 0.5,
  lengthCm: 25,
  breadthCm: 20,
  heightCm: 5,
}

// Cached bearer token — Shiprocket tokens live ~10 days. Refresh on
// 401 or when we get within 24h of the stored expiry.
let _token = null
let _tokenExpiresAt = 0

async function getToken(force = false) {
  const now = Date.now()
  if (!force && _token && now < _tokenExpiresAt - 24 * 60 * 60 * 1000) return _token

  const email = process.env.SHIPROCKET_EMAIL
  const password = process.env.SHIPROCKET_PASSWORD
  if (!email || !password) {
    const err = new Error('Shiprocket credentials missing (set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in .env)')
    err.status = 500
    throw err
  }

  const { data } = await axios.post(`${BASE}/auth/login`, { email, password })
  _token = data.token
  // Shiprocket does not return an explicit expiry — assume 10 days.
  _tokenExpiresAt = now + 10 * 24 * 60 * 60 * 1000
  return _token
}

function splitName(full) {
  const s = String(full || '').trim()
  if (!s) return { first: 'Customer', last: '.' }
  const parts = s.split(/\s+/)
  if (parts.length === 1) return { first: parts[0], last: '.' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

// Strip non-digits so a pincode like " 570031 " or "570-031" still
// coerces cleanly. Shiprocket rejects the request if this ends up
// non-numeric or wrong-length — the controller catches that and
// stores the error on the Order.
function digitsOnly(v) {
  return String(v ?? '').replace(/\D/g, '')
}

// Build the Shiprocket "Create Adhoc Order" payload from our Order
// record. Field names / shape follow Shiprocket's docs exactly — do
// not rename these keys.
function buildPayload(order) {
  const addr = order.address || {}
  const { first, last } = splitName(order.customer)
  const items = Array.isArray(order.lineItems) ? order.lineItems : []

  // Shiprocket wants pincode as a 6-digit NUMBER, not a string. It also
  // wants phone as a 10-digit number (strip country prefix + spaces).
  const pincodeNum = Number(digitsOnly(addr.pincode))
  const phoneDigits = digitsOnly(order.phone).slice(-10)

  return {
    order_id: order.id,
    order_date: new Date(order.createdAt || Date.now()).toISOString().slice(0, 19).replace('T', ' '),
    pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary',
    channel_id: '',
    comment: `Storefront order ${order.id}`,
    billing_customer_name: first,
    billing_last_name: last,
    billing_address: addr.line1 || '',
    billing_address_2: addr.line2 || '',
    billing_city: addr.city || '',
    billing_pincode: pincodeNum,
    billing_state: addr.state || '',
    billing_country: addr.country || 'India',
    billing_email: order.email || '',
    billing_phone: phoneDigits,
    shipping_is_billing: true,
    order_items: items.map((it) => ({
      name: it.name || 'Saree',
      sku: it.sku || it.productId || 'SAREE',
      units: Number(it.qty) || 1,
      selling_price: Number(it.unitPrice) || 0,
    })),
    payment_method: 'Prepaid',
    shipping_charges: Number(order.shippingFee) || 0,
    total_discount: Number(order.discount) || 0,
    sub_total: Number(order.total) || Number(order.amount) || 0,
    length: DEFAULTS.lengthCm,
    breadth: DEFAULTS.breadthCm,
    height: DEFAULTS.heightCm,
    weight: DEFAULTS.weightKg,
  }
}

// Create a Shiprocket "adhoc" order. Returns { shiprocketOrderId,
// shipmentId, awbCode?, courierName? } on success. On error, throws
// with a message safe to store in Order.shiprocket.error.
async function createShiprocketOrder(order) {
  const payload = buildPayload(order)

  // Validate up-front so we don't waste a token refresh + round-trip
  // on obviously-bad data. Shiprocket returns a generic 422 that
  // makes the actual field hard to spot in logs.
  const errs = []
  if (!/^\d{6}$/.test(String(payload.billing_pincode))) {
    errs.push(`billing_pincode "${payload.billing_pincode}" (raw="${order.address?.pincode}") is not 6 digits`)
  }
  if (!/^\d{10}$/.test(String(payload.billing_phone))) {
    errs.push(`billing_phone "${payload.billing_phone}" (raw="${order.phone}") is not 10 digits`)
  }
  if (!payload.billing_address) errs.push('billing_address is empty')
  if (!payload.billing_city) errs.push('billing_city is empty')
  if (!payload.billing_state) errs.push('billing_state is empty')
  if (!payload.order_items?.length) errs.push('order_items is empty')
  if (errs.length) {
    const err = new Error(`Shiprocket payload invalid: ${errs.join('; ')}`)
    err.status = 400
    throw err
  }

  // One-line diagnostic so ops can see what we're sending without
  // dumping the full payload (which contains PII).
  console.log(
    '[shiprocket] createOrder',
    order.id,
    `pincode=${payload.billing_pincode}`,
    `phone=${payload.billing_phone}`,
    `city=${payload.billing_city}`,
    `state=${payload.billing_state}`,
    `items=${payload.order_items.length}`,
    `total=${payload.sub_total}`,
  )

  const send = async (bearer) => {
    const { data } = await axios.post(`${BASE}/orders/create/adhoc`, payload, {
      headers: { Authorization: `Bearer ${bearer}` },
    })
    // Log the raw response so we can tell WHY an order might not show
    // in the Shiprocket "New" tab — often the response is 2xx but
    // Shiprocket returns { status: 1, message: 'Wrong Pickup ...' }
    // instead of order_id/shipment_id.
    console.log('[shiprocket] response for', order.id, JSON.stringify(data).slice(0, 500))
    return data
  }

  let token = await getToken()
  try {
    const data = await send(token)
    if (!data?.order_id && !data?.shipment_id) {
      const detail = data?.message || JSON.stringify(data).slice(0, 300)
      const wrapped = new Error(`Shiprocket accepted request but returned no order_id/shipment_id: ${detail}`)
      wrapped.status = 502
      wrapped.responseBody = data
      throw wrapped
    }
    return {
      shiprocketOrderId: data?.order_id ? String(data.order_id) : '',
      shipmentId: data?.shipment_id ? String(data.shipment_id) : '',
      awbCode: data?.awb_code || '',
      courierName: data?.courier_name || '',
      raw: data,
    }
  } catch (err) {
    // Retry once on 401 in case our cached token expired mid-flight.
    if (err.response?.status === 401) {
      token = await getToken(true)
      const data = await send(token)
      if (!data?.order_id && !data?.shipment_id) {
        const detail = data?.message || JSON.stringify(data).slice(0, 300)
        const wrapped = new Error(`Shiprocket accepted request but returned no order_id/shipment_id: ${detail}`)
        wrapped.status = 502
        wrapped.responseBody = data
        throw wrapped
      }
      return {
        shiprocketOrderId: data?.order_id ? String(data.order_id) : '',
        shipmentId: data?.shipment_id ? String(data.shipment_id) : '',
        awbCode: data?.awb_code || '',
        courierName: data?.courier_name || '',
        raw: data,
      }
    }
    const status = err.response?.status
    const body = err.response?.data
    const detail = typeof body === 'string' ? body : JSON.stringify(body || {}).slice(0, 300)
    const msg = `Shiprocket ${status || 'error'}: ${detail || err.message}`
    const wrapped = new Error(msg)
    wrapped.status = status || 500
    wrapped.responseBody = body
    throw wrapped
  }
}

module.exports = { createShiprocketOrder, getToken }
