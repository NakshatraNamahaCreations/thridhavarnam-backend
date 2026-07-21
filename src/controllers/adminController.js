const { reset } = require('../seed')

exports.reset = async (_req, res) => {
  await reset()
  res.json({ ok: true, message: 'Demo data reset' })
}
