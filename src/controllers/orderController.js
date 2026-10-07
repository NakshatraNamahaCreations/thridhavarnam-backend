const { Order, Payment, Product } = require('../models')
const { nextId, initials, today } = require('../utils/genId')

exports.list = async (_req, res) => {
  res.json(await Order.find().sort({ createdAt: -1 }))
}

// Reverse the inventory impact of a storefront order: restock every line
// item, decrement sold (clamped at 0 so we never go negative), flip
// status back to 'active' if restock pulls it out of out_of_stock, and
// clear the `inventoryApplied` flag so a subsequent cancel/delete can't
// roll back a second time. Idempotent: a no-op if the flag is already
// false (admin-created order, legacy data, or already-rolled-back).
async function restoreInventory(order) {
  if (!order || !order.inventoryApplied) return
  const items = Array.isArray(order.lineItems) ? order.lineItems : []
  for (const it of items) {
    const productId = String(it.productId || '').trim()
    const qty = Math.max(1, Number(it.qty) || 1)
    if (!productId) continue
    try {
      const updated = await Product.findOneAndUpdate(
        { id: productId },
        { $inc: { stock: qty, sold: -qty } },
        { new: true },
      )
      if (updated) {
        const patch = {}
        if (typeof updated.sold === 'number' && updated.sold < 0) patch.sold = 0
        if (updated.status === 'out_of_stock' && (updated.stock || 0) > 0) patch.status = 'active'
        if (Object.keys(patch).length) {
          await Product.updateOne({ id: productId }, { $set: patch })
        }
      }
    } catch (e) {
      console.warn('[orders] inventory restore failed for', productId, e.message)
    }
  }
  // Flip the flag off so a later delete-after-cancel is a no-op.
  await Order.updateOne({ id: order.id }, { $set: { inventoryApplied: false } })
}

exports.create = async (req, res) => {
  const d = req.body
  const id = await nextId(Order, 'ORD-')
  const customer = String(d.customer || '').trim()

  const order = await Order.create({
    id,
    customer,
    avatar: d.avatar || initials(customer),
    city: d.city || '',
    product: d.product || '',
    items: Number(d.items) || 1,
    amount: Number(d.amount) || 0,
    status: d.status || 'pending',
    payment: d.payment || 'pending',
    date: d.date || today(),
  })

  // Mirror the order into the payments ledger so Payments stays in sync.
  await Payment.create({
    id: await nextId(Payment, 'PAY-'),
    orderId: id,
    customer: order.customer,
    avatar: order.avatar,
    amount: order.amount,
    method: order.payment === 'pending' ? '—' : 'UPI',
    status: order.payment,
    date: order.date,
  })

  res.status(201).json(order)
}

exports.update = async (req, res) => {
  const d = { ...req.body }
  delete d.id
  if (d.items !== undefined) d.items = Number(d.items)
  if (d.amount !== undefined) d.amount = Number(d.amount)

  // Fetch the pre-update state so we can detect a non-cancelled → cancelled
  // transition and roll back inventory exactly once.
  const prev = await Order.findOne({ id: req.params.id })
  if (!prev) return res.status(404).json({ message: 'Order not found' })

  const order = await Order.findOneAndUpdate({ id: req.params.id }, d, { new: true })

  if (
    d.status === 'cancelled' &&
    prev.status !== 'cancelled' &&
    order.inventoryApplied
  ) {
    await restoreInventory(order)
    // Re-read so the response reflects the cleared flag.
    const fresh = await Order.findOne({ id: req.params.id })
    return res.json(fresh || order)
  }

  res.json(order)
}

exports.remove = async (req, res) => {
  const order = await Order.findOne({ id: req.params.id })
  if (!order) return res.json({ ok: true })
  // Roll back before deleting — once the order document is gone we lose
  // the lineItems and can no longer compute the restock amounts.
  if (order.inventoryApplied) await restoreInventory(order)
  await Order.deleteOne({ id: req.params.id })
  res.json({ ok: true })
}
