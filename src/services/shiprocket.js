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

// In-memory tracking cache. Shiprocket statuses change on the order of
// minutes/hours, not seconds, so a 60s TTL is plenty — and it protects
// the admin orders page (which fetches tracking for every order in the
// list on every poll) from hammering Shiprocket's rate-limited API.
const TRACK_CACHE_TTL_MS = 60 * 1000
const _trackCache = new Map() // key → { data, at }

function _trackCacheKey({ awbCode, shipmentId }) {
  return awbCode ? `awb:${awbCode}` : `ship:${shipmentId}`
}

// Fetch live tracking for a shipment. Prefers the AWB endpoint (richer
// activity log once the courier has picked it up); falls back to the
// shipment-id endpoint for the brief window between order creation and
// AWB assignment. Returns a normalized shape the controller can hand
// straight to the storefront — Shiprocket's own response is deeply
// nested and slightly different between the two endpoints.
async function trackShipment({ awbCode, shipmentId }) {
  if (!awbCode && !shipmentId) {
    const err = new Error('trackShipment needs awbCode or shipmentId')
    err.status = 400
    throw err
  }

  // Serve from the per-identifier cache if the entry is still warm.
  // The admin orders page fans out a lot of parallel calls on every
  // 60s poll, so this keeps us well under Shiprocket's rate limit.
  const cacheKey = _trackCacheKey({ awbCode, shipmentId })
  const cached = _trackCache.get(cacheKey)
  if (cached && Date.now() - cached.at < TRACK_CACHE_TTL_MS) {
    return cached.data
  }

  const path = awbCode
    ? `/courier/track/awb/${encodeURIComponent(awbCode)}`
    : `/courier/track/shipment/${encodeURIComponent(shipmentId)}`

  const call = async (bearer) => {
    const { data } = await axios.get(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${bearer}` },
    })
    return data
  }

  let token = await getToken()
  let data
  try {
    data = await call(token)
  } catch (err) {
    if (err.response?.status === 401) {
      token = await getToken(true)
      data = await call(token)
    } else {
      const status = err.response?.status
      const body = err.response?.data
      const detail = typeof body === 'string' ? body : JSON.stringify(body || {}).slice(0, 300)
      const wrapped = new Error(`Shiprocket track ${status || 'error'}: ${detail || err.message}`)
      wrapped.status = status || 500
      throw wrapped
    }
  }

  // Shiprocket responses:
  //  - AWB endpoint:      { tracking_data: { track_status, shipment_status, shipment_track: [{current_status, courier_name, ...}], shipment_track_activities: [...] } }
  //  - Shipment endpoint: { [shipmentId]: { tracking_data: { ... } } }  (keyed by shipment id)
  // Normalise both into the same `tracking_data` object.
  let td = data?.tracking_data
  if (!td && shipmentId && data && typeof data === 'object') {
    const keyed = data[shipmentId] || data[String(shipmentId)]
    td = keyed?.tracking_data
  }
  td = td || {}

  const trackHead = Array.isArray(td.shipment_track) && td.shipment_track[0] ? td.shipment_track[0] : {}
  const activities = Array.isArray(td.shipment_track_activities) ? td.shipment_track_activities : []
  // Only use the string status fields — `shipment_status` is a numeric
  // Shiprocket-internal code and must NEVER be stringified for display
  // (otherwise the UI renders a bare "8" instead of "Cancelled" etc.).
  // Prefer the trackHead.current_status; fall back to the most recent
  // activity's label; else leave empty so the caller's default
  // ("Confirmed") kicks in.
  let currentStatus = String(trackHead.current_status || '').trim()
  if (!currentStatus && activities[0]) {
    currentStatus = String(activities[0].status || activities[0]['sr-status-label'] || '').trim()
  }

  const result = {
    awbCode: trackHead.awb_code || awbCode || '',
    courier: trackHead.courier_name || '',
    status: currentStatus,
    etd: trackHead.edd || trackHead.expected_delivery_date || '',
    activities: activities.map((a) => ({
      date: a.date || a.updated_date || '',
      status: String(a.status || a['sr-status-label'] || '').trim(),
      activity: String(a.activity || '').trim(),
      location: String(a.location || '').trim(),
    })),
    raw: td,
  }

  _trackCache.set(cacheKey, { data: result, at: Date.now() })
  return result
}

// Cancel a Shiprocket order by its (numeric) order_id. Shiprocket's
// cancel endpoint accepts a batch of ids; we send a single-element
// array. Throws with a descriptive message on upstream failure — the
// caller decides whether to surface or soft-fail that error, since
// cancellation on our side should typically still succeed either way.
async function cancelShiprocketOrder(shiprocketOrderId) {
  if (!shiprocketOrderId) {
    const err = new Error('cancelShiprocketOrder needs a shiprocketOrderId')
    err.status = 400
    throw err
  }

  const idForApi = Number(shiprocketOrderId) || String(shiprocketOrderId)
  const body = { ids: [idForApi] }

  const call = async (bearer) => {
    const { data } = await axios.post(`${BASE}/orders/cancel`, body, {
      headers: { Authorization: `Bearer ${bearer}` },
    })
    return data
  }

  let token = await getToken()
  try {
    const data = await call(token)
    // Clear any cached tracking for shipments on this order so the next
    // admin poll picks up the fresh "Cancelled" status instead of a
    // stale "In Transit" from the 60s cache.
    for (const key of _trackCache.keys()) _trackCache.delete(key)
    return data
  } catch (err) {
    if (err.response?.status === 401) {
      token = await getToken(true)
      const data = await call(token)
      for (const key of _trackCache.keys()) _trackCache.delete(key)
      return data
    }
    const status = err.response?.status
    const body = err.response?.data
    const detail = typeof body === 'string' ? body : JSON.stringify(body || {}).slice(0, 300)
    const wrapped = new Error(`Shiprocket cancel ${status || 'error'}: ${detail || err.message}`)
    wrapped.status = status || 500
    throw wrapped
  }
}

module.exports = { createShiprocketOrder, trackShipment, cancelShiprocketOrder, getToken }
