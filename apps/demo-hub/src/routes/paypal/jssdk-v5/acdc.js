/* Custom: ACDC uses CardFields SDK (different from Buttons) */
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API, getHeaders } = require('../../../config/paypal')
const { buildOrderBody, DEFAULT_AMOUNT, DEFAULT_CURRENCY, SUPPORTED_CURRENCIES, validateAmount } = require('../../../config/constants')

function resolveCurrency(v) { return SUPPORTED_CURRENCIES.includes(v) ? v : DEFAULT_CURRENCY }

const router = Router()
const PROVIDER = 'paypal', SDK = 'jssdk-v5', KEY = 'acdc'

router.get('/acdc', (req, res) => {
  const product = getProduct(PROVIDER, SDK, KEY)
  const clientId = process.env.PAYPAL_CN_CLIENT_ID
  res.render('paypal/jssdk-v5/acdc', {
    title: product?.displayName ?? 'ACDC',
    provider: PROVIDER, sdkVersion: SDK,
    currentProductKey: KEY, currentSdkVersion: SDK,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    sdkUrl: `https://www.paypal.com/sdk/js?client-id=${clientId}&components=card-fields&currency=${resolveCurrency(req.query.currency)}`,
    defaultAmount: req.query.amount || DEFAULT_AMOUNT,
    currency:      resolveCurrency(req.query.currency),
  })
})

router.post('/api/acdc/create-order', async (req, res) => {
  try {
    const amount   = req.body.amount   || DEFAULT_AMOUNT
    const currency = resolveCurrency(req.body.currency)
    const amountErr = validateAmount(amount, currency)
    if (amountErr) return res.status(400).json({ error: amountErr })
    const token  = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method:  'POST',
      headers: getHeaders(token),
      body:    JSON.stringify(buildOrderBody(amount, { currency })),
    })
    const order = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: order.message, details: order })
    res.json({ id: order.id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/api/acdc/capture-order', async (req, res) => {
  try {
    const { orderID } = req.body
    if (!orderID) return res.status(400).json({ error: 'orderID required' })
    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: getHeaders(token),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
