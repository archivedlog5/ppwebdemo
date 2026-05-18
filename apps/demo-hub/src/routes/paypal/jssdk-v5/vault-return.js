/* Custom: Vault return buyer — charges via stored payment token, no SDK needed */
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API, getHeaders } = require('../../../config/paypal')
const { buildOrderBody, DEFAULT_AMOUNT, DEFAULT_CURRENCY, SUPPORTED_CURRENCIES, validateAmount } = require('../../../config/constants')

function resolveCurrency(v) { return SUPPORTED_CURRENCIES.includes(v) ? v : DEFAULT_CURRENCY }

const router = Router()
const PROVIDER = 'paypal', SDK = 'jssdk-v5', KEY = 'vault-return'

router.get('/vault-return', (req, res) => {
  const product = getProduct(PROVIDER, SDK, KEY)
  res.render('paypal/jssdk-v5/vault-return', {
    title: product?.displayName ?? 'Vault Return Buyer',
    provider: PROVIDER, sdkVersion: SDK,
    currentProductKey: KEY, currentSdkVersion: SDK,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    defaultAmount: req.query.amount || DEFAULT_AMOUNT,
    currency:      resolveCurrency(req.query.currency),
  })
})

// Server-side charge via vault payment token — no buyer interaction
router.post('/api/vault-return/create-and-capture', async (req, res) => {
  try {
    const { paymentTokenId, amount } = req.body
    if (!paymentTokenId) return res.status(400).json({ error: 'paymentTokenId required' })
    const amountErr = validateAmount(amount || DEFAULT_AMOUNT)
    if (amountErr) return res.status(400).json({ error: amountErr })

    const token = await getCNToken()
    const body  = buildOrderBody(amount || DEFAULT_AMOUNT, {
      topLevel: { payment_source: { token: { id: paymentTokenId, type: 'PAYMENT_METHOD_TOKEN' } } }
    })

    // Create order using vault payment token
    const orderRes = await fetch(`${API}/v2/checkout/orders`, {
      method:  'POST',
      headers: getHeaders(token),
      body:    JSON.stringify(body),
    })
    const order = await orderRes.json()
    if (!orderRes.ok) return res.status(orderRes.status).json({ error: order.message, details: order })
    if (order.status !== 'APPROVED') return res.status(400).json({ error: `Order status: ${order.status} (expected APPROVED)`, order })

    // Capture immediately
    const captureRes = await fetch(`${API}/v2/checkout/orders/${order.id}/capture`, {
      method: 'POST',
      headers: getHeaders(token),
    })
    const capture = await captureRes.json()
    if (!captureRes.ok) return res.status(captureRes.status).json({ error: capture.message, details: capture })
    res.json(capture)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
