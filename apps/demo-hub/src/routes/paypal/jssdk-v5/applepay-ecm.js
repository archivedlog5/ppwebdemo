/* Custom: Apple Pay ECM — merchant pre-fills shipping, buyer provides billing via Apple Pay sheet */
const { Router }                          = require('express')
const fetch                               = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API, getHeaders }     = require('../../../config/paypal')
const demoParams                          = require('../../../config/constants')

function resolveCurrency(v) {
  return demoParams.SUPPORTED_CURRENCIES.includes(v) ? v : demoParams.DEFAULT_CURRENCY
}


const router   = Router()
const PROVIDER = 'paypal'
const SDK      = 'jssdk-v5'
const KEY      = 'applepay-ecm'

router.get('/applepay-ecm', (req, res) => {
  const product  = getProduct(PROVIDER, SDK, KEY)
  const currency = resolveCurrency(req.query.currency)
  const clientId = process.env.PAYPAL_CN_CLIENT_ID
  const addr     = demoParams.SANDBOX_SHIPPING.address
  res.render('paypal/jssdk-v5/applepay-ecm', {
    title:             product?.displayName ?? 'Apple Pay ECM',
    provider:          PROVIDER,
    sdkVersion:        SDK,
    currentProductKey: KEY,
    currentSdkVersion: SDK,
    sidebarProducts:   getProviderProducts(PROVIDER),
    showSidebar:       true,
    sdkUrl:            `https://www.paypal.com/sdk/js?client-id=${clientId}&components=applepay&currency=${currency}`,
    defaultAmount:     req.query.amount || demoParams.DEFAULT_AMOUNT,
    currency,
    sandboxShipping: {
      name:         demoParams.SANDBOX_SHIPPING.name.full_name,
      addressLine1: addr.address_line_1,
      adminArea2:   addr.admin_area_2,
      adminArea1:   addr.admin_area_1,
      postalCode:   addr.postal_code,
      countryCode:  addr.country_code,
    },
  })
})

router.post('/api/applepay-ecm/create-order', async (req, res) => {
  try {
    const amount    = req.body.amount || demoParams.DEFAULT_AMOUNT
    const currency  = resolveCurrency(req.body.currency)
    const amountErr = demoParams.validateAmount(amount, currency)
    if (amountErr) return res.status(400).json({ error: amountErr })

    const token  = await getCNToken()
    const zd     = demoParams.isZeroDecimal(currency)
    const value  = zd ? String(Math.round(parseFloat(amount))) : parseFloat(amount).toFixed(2)
    const amtObj = (c) => ({ currency_code: c, value })

    const body = {
      intent: demoParams.INTENT.CAPTURE,
      purchase_units: [{
        reference_id:    demoParams.DEMO_REFERENCE_ID,
        description:     demoParams.DEMO_DESCRIPTION,
        invoice_id:      `INV-${Date.now()}`,
        custom_id:       demoParams.DEMO_CUSTOM_ID,
        soft_descriptor: demoParams.DEMO_SOFT_DESCRIPTOR,
        amount: {
          currency_code: currency,
          value,
          breakdown: { item_total: amtObj(currency) },
        },
        items:    [{ ...demoParams.DEMO_ITEM, unit_amount: amtObj(currency) }],
        shipping: demoParams.SANDBOX_SHIPPING,
      }],
      payment_source: {
        apple_pay: {
          experience_context: {
            return_url: `${req.protocol}://${req.get('host')}/paypal/jssdk-v5/applepay-ecm`,
            cancel_url: `${req.protocol}://${req.get('host')}/paypal/jssdk-v5/applepay-ecm`,
          },
        },
      },
    }

    const r     = await fetch(`${API}/v2/checkout/orders`, {
      method:  'POST',
      headers: getHeaders(token),
      body:    JSON.stringify(body),
    })
    const order = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: order.message, details: order })
    res.json({ id: order.id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/api/applepay-ecm/capture-order', async (req, res) => {
  try {
    const { orderID } = req.body
    if (!orderID) return res.status(400).json({ error: 'orderID required' })
    const token = await getCNToken()
    const r     = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
      method:  'POST',
      headers: getHeaders(token),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
