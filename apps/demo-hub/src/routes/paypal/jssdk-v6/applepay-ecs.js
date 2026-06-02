/* Custom: Apple Pay ECS — buyer selects shipping address, email, phone, shipping method inside Apple Pay sheet */
const { Router }                          = require('express')
const fetch                               = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API, getHeaders }     = require('../../../config/paypal')
const demoParams                          = require('../../../config/constants')

function resolveCurrency(v) {
  return demoParams.SUPPORTED_CURRENCIES.includes(v) ? v : demoParams.DEFAULT_CURRENCY
}

// Apple Pay shippingContact → PayPal shipping object
function mapApplePayShipping(sc) {
  const givenName  = sc.givenName  || ''
  const familyName = sc.familyName || ''
  return {
    name:    { full_name: `${givenName} ${familyName}`.trim() || 'Buyer' },
    address: {
      address_line_1: (sc.addressLines || [])[0] || '',
      admin_area_2:   sc.locality             || '',
      admin_area_1:   sc.administrativeArea   || '',
      postal_code:    sc.postalCode           || '',
      country_code:   sc.countryCode          || '',
    },
  }
}

// Apple Pay phone_number only needs national_number (no country_code)
function parseApplePayPhone(phoneNumber) {
  if (!phoneNumber) return null
  const digits = String(phoneNumber).replace(/\D/g, '')
  return digits ? { national_number: digits } : null
}

const router   = Router()
const PROVIDER = 'paypal'
const SDK      = 'jssdk-v6'
const KEY      = 'applepay-ecs'

router.get('/applepay-ecs', (req, res) => {
  const product  = getProduct(PROVIDER, SDK, KEY)
  const currency = resolveCurrency(req.query.currency)
  const clientId = process.env.PAYPAL_CN_CLIENT_ID
  res.render('paypal/jssdk-v6/applepay-ecs', {
    title:              product?.displayName ?? 'Apple Pay ECS',
    provider:           PROVIDER,
    sdkVersion:         SDK,
    currentProductKey:  KEY,
    currentSdkVersion:  SDK,
    sidebarProducts:    getProviderProducts(PROVIDER),
    showSidebar:        true,
    clientId,
    supportedCurrencies: demoParams.SUPPORTED_CURRENCIES,
    defaultAmount:      req.query.amount || demoParams.DEFAULT_AMOUNT,
    currency,
  })
})

router.post('/api/applepay-ecs/create-order', async (req, res) => {
  try {
    const amount          = req.body.amount         || demoParams.DEFAULT_AMOUNT
    const currency        = resolveCurrency(req.body.currency)
    const shippingContact = req.body.shippingContact || {}
    const billingContact  = req.body.billingContact  || {}
    const shippingAmount  = req.body.shippingAmount  || '0.00'
    const amountErr       = demoParams.validateAmount(amount, currency)
    if (amountErr) return res.status(400).json({ error: amountErr })

    const token    = await getCNToken()
    const zd       = demoParams.isZeroDecimal(currency)
    const value    = zd ? String(Math.round(parseFloat(amount))) : parseFloat(amount).toFixed(2)
    const shipVal  = zd ? String(Math.round(parseFloat(shippingAmount))) : parseFloat(shippingAmount).toFixed(2)
    const totalVal = zd
      ? String(Math.round(parseFloat(value) + parseFloat(shipVal)))
      : (parseFloat(value) + parseFloat(shipVal)).toFixed(2)
    const amtObj   = (c, v) => ({ currency_code: c, value: v })

    const shipping  = mapApplePayShipping(shippingContact)
    const email     = shippingContact.emailAddress || null
    const phone     = parseApplePayPhone(shippingContact.phoneNumber)
    const buyerName = shipping.name.full_name

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
          value:         totalVal,
          breakdown: {
            item_total: amtObj(currency, value),
            shipping:   amtObj(currency, shipVal),
          },
        },
        items:    [{ ...demoParams.DEMO_ITEM, unit_amount: amtObj(currency, value) }],
        shipping,
      }],
      payment_source: {
        apple_pay: {
          ...(buyerName ? { name:          buyerName } : {}),
          ...(email     ? { email_address: email }     : {}),
          ...(phone     ? { phone_number:  phone }     : {}),
          experience_context: {
            return_url: `${req.protocol}://${req.get('host')}/paypal/jssdk-v6/applepay-ecs`,
            cancel_url: `${req.protocol}://${req.get('host')}/paypal/jssdk-v6/applepay-ecs`,
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
    res.json({ orderId: order.id })  // v6: lowercase d
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/api/applepay-ecs/capture-order', async (req, res) => {
  try {
    const { orderId } = req.body  // v6: lowercase d
    if (!orderId) return res.status(400).json({ error: 'orderId required' })
    const token = await getCNToken()
    const r     = await fetch(`${API}/v2/checkout/orders/${orderId}/capture`, {
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
