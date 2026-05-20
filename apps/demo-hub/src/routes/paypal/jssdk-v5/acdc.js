/* Custom: ACDC uses CardFields SDK (different from Buttons) */
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API, getHeaders } = require('../../../config/paypal')
const {
  buildOrderBody, DEFAULT_AMOUNT, DEFAULT_CURRENCY, SUPPORTED_CURRENCIES, validateAmount,
  ACDC_EXPERIENCE_CONTEXT, SANDBOX_BILLING, SANDBOX_BUYER,
} = require('../../../config/constants')

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
    sandboxCardholderName: `${SANDBOX_BUYER.name.given_name} ${SANDBOX_BUYER.name.surname}`,
    sandboxBilling: {
      addressLine1: SANDBOX_BILLING.address_line_1,
      adminArea2:   SANDBOX_BILLING.admin_area_2,
      adminArea1:   SANDBOX_BILLING.admin_area_1,
      postalCode:   SANDBOX_BILLING.postal_code,
      countryCode:  SANDBOX_BILLING.country_code,
    },
  })
})

const SCA_METHODS = ['SCA_WHEN_REQUIRED', 'SCA_ALWAYS']

router.post('/api/acdc/create-order', async (req, res) => {
  try {
    const amount          = req.body.amount          || DEFAULT_AMOUNT
    const currency        = resolveCurrency(req.body.currency)
    const scaMethod       = SCA_METHODS.includes(req.body.scaMethod) ? req.body.scaMethod : 'SCA_WHEN_REQUIRED'
    const cardholderName  = req.body.cardholderName  || ''
    const ba              = req.body.billingAddress  || {}
    const billingAddress  = {
      address_line_1: ba.addressLine1 || '',
      address_line_2: ba.addressLine2 || '',
      admin_area_1:   ba.adminArea1   || '',
      admin_area_2:   ba.adminArea2   || '',
      postal_code:    ba.postalCode   || '',
      country_code:   ba.countryCode  || '',
    }
    const amountErr = validateAmount(amount, currency)
    if (amountErr) return res.status(400).json({ error: amountErr })
    const token  = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method:  'POST',
      headers: getHeaders(token),
      body:    JSON.stringify(buildOrderBody(amount, {
        currency,
        topLevel: {
          payment_source: {
            card: {
              name:               cardholderName,
              billing_address:    billingAddress,
              experience_context: ACDC_EXPERIENCE_CONTEXT,
              attributes:         { verification: { method: scaMethod } },
            },
          },
        },
      })),
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
