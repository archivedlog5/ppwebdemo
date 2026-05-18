/* Custom: dual SDK (CN account + US account for Venmo) */
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, getUSToken, API } = require('../../../config/paypal')

const router = Router()
const PROVIDER = 'paypal', SDK = 'jssdk-v5', KEY = 'buttons'

router.get('/buttons', (req, res) => {
  const product = getProduct(PROVIDER, SDK, KEY)
  const CN_ID = process.env.PAYPAL_CN_CLIENT_ID
  const US_ID = process.env.PAYPAL_US_CLIENT_ID
  res.render('paypal/jssdk-v5/buttons', {
    title: product?.displayName ?? 'Independent Buttons',
    provider: PROVIDER, sdkVersion: SDK,
    currentProductKey: KEY, currentSdkVersion: SDK,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    cnSdkUrl: `https://www.paypal.com/sdk/js?client-id=${CN_ID}&components=buttons&currency=USD`,
    usSdkUrl: `https://www.paypal.com/sdk/js?client-id=${US_ID}&components=buttons&enable-funding=venmo&currency=USD`,
  })
})

// CN: PayPal / PayLater / BCDC
router.post('/api/buttons/create-order', async (req, res) => {
  try {
    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: 'USD', value: '100.00' } }] }),
    })
    const order = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: order.message, details: order })
    res.json({ id: order.id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// US: Venmo
router.post('/api/buttons/create-order-us', async (req, res) => {
  try {
    const token = await getUSToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: 'USD', value: '100.00' } }] }),
    })
    const order = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: order.message, details: order })
    res.json({ id: order.id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Capture (handles both CN and US)
router.post('/api/buttons/capture-order', async (req, res) => {
  try {
    const { orderID, account } = req.body
    if (!orderID) return res.status(400).json({ error: 'orderID required' })
    const token = account === 'us' ? await getUSToken() : await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
