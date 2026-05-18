/* Custom: Vault return buyer — charges via stored payment token, no SDK needed */
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API } = require('../../../config/paypal')

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
  })
})

// Server-side charge via vault payment token — no buyer interaction
router.post('/api/vault-return/create-and-capture', async (req, res) => {
  try {
    const { paymentTokenId } = req.body
    if (!paymentTokenId) return res.status(400).json({ error: 'paymentTokenId required' })

    const token = await getCNToken()

    // Create order using vault payment token
    const orderRes = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: '100.00' } }],
        payment_source: { token: { id: paymentTokenId, type: 'PAYMENT_METHOD_TOKEN' } },
      }),
    })
    const order = await orderRes.json()
    if (!orderRes.ok) return res.status(orderRes.status).json({ error: order.message, details: order })
    if (order.status !== 'APPROVED') return res.status(400).json({ error: `Order status: ${order.status} (expected APPROVED)`, order })

    // Capture immediately
    const captureRes = await fetch(`${API}/v2/checkout/orders/${order.id}/capture`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const capture = await captureRes.json()
    if (!captureRes.ok) return res.status(captureRes.status).json({ error: capture.message, details: capture })
    res.json(capture)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
