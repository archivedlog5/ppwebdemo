/* Custom: Google Pay ECS — buyer selects shipping address, email, phone in the Google Pay sheet */
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API, getHeaders } = require('../../../config/paypal')
const demoParams = require('../../../config/constants')

function resolveCurrency(v) {
  return demoParams.SUPPORTED_CURRENCIES.includes(v) ? v : demoParams.DEFAULT_CURRENCY
}

const SCA_METHODS = ['SCA_WHEN_REQUIRED', 'SCA_ALWAYS']

// Google Pay address format → PayPal shipping format
function mapGooglePayAddress(sh) {
  if (!sh || !sh.countryCode) return null
  return {
    name: { full_name: sh.name || '' },
    address: {
      address_line_1: sh.address1 || '',
      ...(sh.address2 ? { address_line_2: sh.address2 } : {}),
      admin_area_2: sh.locality || '',
      admin_area_1: sh.administrativeArea || '',
      postal_code: sh.postalCode || '',
      country_code: sh.countryCode,
    },
  }
}

const router = Router()
const PROVIDER = 'paypal', SDK = 'jssdk-v5', KEY = 'googlepay-ecs'

router.get('/googlepay-ecs', (req, res) => {
  const product = getProduct(PROVIDER, SDK, KEY)
  const currency = resolveCurrency(req.query.currency)
  const clientId = process.env.PAYPAL_CN_CLIENT_ID
  res.render('paypal/jssdk-v5/googlepay-ecs', {
    title: product?.displayName ?? 'Google Pay ECS',
    provider: PROVIDER,
    sdkVersion: SDK,
    currentProductKey: KEY,
    currentSdkVersion: SDK,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    sdkUrl: `https://www.paypal.com/sdk/js?client-id=${clientId}&components=googlepay&currency=${currency}`,
    extraScripts: [{ url: 'https://pay.google.com/gp/p/js/pay.js' }],
    defaultAmount: req.query.amount || demoParams.DEFAULT_AMOUNT,
    currency,
  })
})

router.post('/api/googlepay-ecs/create-order', async (req, res) => {
  try {
    const amount = req.body.amount || demoParams.DEFAULT_AMOUNT
    const currency = resolveCurrency(req.body.currency)
    const scaMethod   = SCA_METHODS.includes(req.body.scaMethod) ? req.body.scaMethod : 'SCA_WHEN_REQUIRED'
    const shippingRaw = req.body.shippingAddress || null
    const buyerName   = req.body.buyerName   || null
    const email       = req.body.email       || null
    const parsedPhone = req.body.parsedPhone || null  // { country_code, national_number }

    const amountErr = demoParams.validateAmount(amount, currency)
    if (amountErr) return res.status(400).json({ error: amountErr })

    console.log('[GooglePay ECS] create-order — buyerName:', buyerName, '| email:', email, '| parsedPhone:', parsedPhone)
    console.log('[GooglePay ECS] shippingAddress from sheet:', shippingRaw)

    const token = await getCNToken()
    const zd = demoParams.isZeroDecimal(currency)
    const value = zd ? String(Math.round(parseFloat(amount))) : parseFloat(amount).toFixed(2)
    const amtObj = (c) => ({ currency_code: c, value })

    const shippingPayPal = mapGooglePayAddress(shippingRaw)

    const body = {
      intent: demoParams.INTENT.CAPTURE,
      purchase_units: [
        {
          reference_id: demoParams.DEMO_REFERENCE_ID,
          description: demoParams.DEMO_DESCRIPTION,
          invoice_id: `INV-${Date.now()}`,
          custom_id: demoParams.DEMO_CUSTOM_ID,
          soft_descriptor: demoParams.DEMO_SOFT_DESCRIPTOR,
          amount: {
            currency_code: currency,
            value,
            breakdown: { item_total: amtObj(currency) },
          },
          items: [{ ...demoParams.DEMO_ITEM, unit_amount: amtObj(currency) }],
          ...(shippingPayPal ? { shipping: shippingPayPal } : {}),
        },
      ],
      payment_source: {
        google_pay: {
          ...(buyerName   ? { name:          buyerName   } : {}),
          ...(email       ? { email_address: email       } : {}),
          ...(parsedPhone ? { phone_number:  parsedPhone } : {}),
          experience_context: {
            return_url: `${req.protocol}://${req.get('host')}/paypal/jssdk-v5/googlepay-ecs`,
            cancel_url: `${req.protocol}://${req.get('host')}/paypal/jssdk-v5/googlepay-ecs`,
          },
          attributes: { verification: { method: scaMethod } },
        },
      },
    }

    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(body),
    })
    const order = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: order.message, details: order })
    res.json({ id: order.id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/api/googlepay-ecs/order/:orderID', async (req, res) => {
  try {
    const { orderID } = req.params
    if (!orderID) return res.status(400).json({ error: 'orderID required' })
    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderID}`, {
      method: 'GET',
      headers: getHeaders(token),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/api/googlepay-ecs/capture-order', async (req, res) => {
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
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
