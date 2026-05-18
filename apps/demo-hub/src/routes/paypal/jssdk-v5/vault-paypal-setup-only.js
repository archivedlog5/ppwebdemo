/* Custom: Vault setup-only (no purchase) — uses /v3/vault/setup-tokens */
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API, getHeaders } = require('../../../config/paypal')

const router = Router()
const PROVIDER = 'paypal', SDK = 'jssdk-v5', KEY = 'vault-paypal-setup-only'

router.get('/vault-paypal-setup-only', (req, res) => {
  const product   = getProduct(PROVIDER, SDK, KEY)
  const clientId  = process.env.PAYPAL_CN_CLIENT_ID
  res.render('paypal/jssdk-v5/vault-paypal-setup-only', {
    title: product?.displayName ?? 'PayPal Vault Setup',
    provider: PROVIDER, sdkVersion: SDK,
    currentProductKey: KEY, currentSdkVersion: SDK,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    sdkUrl: `https://www.paypal.com/sdk/js?client-id=${clientId}&components=buttons&vault=true&currency=USD`,
  })
})

router.post('/api/vault-paypal-setup-only/create-setup-token', async (req, res) => {
  try {
    const token = await getCNToken()
    const r = await fetch(`${API}/v3/vault/setup-tokens`, {
      method:  'POST',
      headers: getHeaders(token, { 'PayPal-Request-Id': `setup-${Date.now()}` }),
      body: JSON.stringify({
        payment_source: {
          paypal: {
            usage_type: 'MERCHANT',
            experience_context: {
              return_url: `${process.env.APP_URL || 'http://localhost:3000'}/paypal/jssdk-v5/vault-paypal-setup-only`,
              cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/paypal/jssdk-v5/vault-paypal-setup-only`,
            }
          }
        }
      }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
    const approveLink = data.links?.find(l => l.rel === 'approve')?.href
    res.json({ setupTokenId: data.id, approveLink })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/api/vault-paypal-setup-only/confirm-setup-token', async (req, res) => {
  try {
    const { setupTokenId } = req.body
    if (!setupTokenId) return res.status(400).json({ error: 'setupTokenId required' })
    const token = await getCNToken()
    const r = await fetch(`${API}/v3/vault/payment-tokens`, {
      method:  'POST',
      headers: getHeaders(token, { 'PayPal-Request-Id': `confirm-${Date.now()}` }),
      body: JSON.stringify({
        payment_source: { token: { id: setupTokenId, type: 'SETUP_TOKEN' } }
      }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
    res.json({ paymentTokenId: data.id, data })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
