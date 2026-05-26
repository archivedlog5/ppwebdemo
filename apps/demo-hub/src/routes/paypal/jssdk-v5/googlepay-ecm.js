/* Custom: Google Pay ECM — merchant pre-fills shipping, shippingAddressRequired: false */
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API, getHeaders } = require('../../../config/paypal')
const demoParams = require('../../../config/constants')

function resolveCurrency(v) {
  return demoParams.SUPPORTED_CURRENCIES.includes(v) ? v : demoParams.DEFAULT_CURRENCY
}

const SCA_METHODS = ['SCA_WHEN_REQUIRED', 'SCA_ALWAYS']

const router = Router()
const PROVIDER = 'paypal', SDK = 'jssdk-v5', KEY = 'googlepay-ecm'

router.get('/googlepay-ecm', (req, res) => {
  const product  = getProduct(PROVIDER, SDK, KEY)
  const currency = resolveCurrency(req.query.currency)
  const clientId = process.env.PAYPAL_CN_CLIENT_ID
  const addr     = demoParams.SANDBOX_SHIPPING.address
  res.render('paypal/jssdk-v5/googlepay-ecm', {
    title:             product?.displayName ?? 'Google Pay ECM',
    provider:          PROVIDER,
    sdkVersion:        SDK,
    currentProductKey: KEY,
    currentSdkVersion: SDK,
    sidebarProducts:   getProviderProducts(PROVIDER),
    showSidebar:       true,
    sdkUrl:            `https://www.paypal.com/sdk/js?client-id=${clientId}&components=googlepay&currency=${currency}`,
    extraScripts:      [{ url: 'https://pay.google.com/gp/p/js/pay.js' }],
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
    sandboxPhone: `+${demoParams.SANDBOX_PHONE.country_code} ${demoParams.SANDBOX_PHONE.national_number}`,
  })
})

router.post('/api/googlepay-ecm/create-order', async (req, res) => {
  try {
    const amount    = req.body.amount    || demoParams.DEFAULT_AMOUNT
    const currency  = resolveCurrency(req.body.currency)
    const sh        = req.body.shipping  || {}
    const scaMethod = SCA_METHODS.includes(req.body.scaMethod) ? req.body.scaMethod : 'SCA_WHEN_REQUIRED'
    const email     = req.body.email     || null
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
        items: [{ ...demoParams.DEMO_ITEM, unit_amount: amtObj(currency) }],
        shipping: {
          name:    { full_name: sh.name || demoParams.SANDBOX_SHIPPING.name.full_name },
          address: {
            address_line_1: sh.addressLine1 || demoParams.SANDBOX_SHIPPING.address.address_line_1,
            admin_area_1:   sh.adminArea1   || demoParams.SANDBOX_SHIPPING.address.admin_area_1,
            admin_area_2:   sh.adminArea2   || demoParams.SANDBOX_SHIPPING.address.admin_area_2,
            postal_code:    sh.postalCode   || demoParams.SANDBOX_SHIPPING.address.postal_code,
            country_code:   sh.countryCode  || demoParams.SANDBOX_SHIPPING.address.country_code,
          },
        },
      }],
      payment_source: {
        google_pay: {
          ...(email ? { email_address: email } : {}),
          phone_number: demoParams.SANDBOX_PHONE,
          experience_context: {
            return_url: `${req.protocol}://${req.get('host')}/paypal/jssdk-v5/googlepay-ecm`,
            cancel_url: `${req.protocol}://${req.get('host')}/paypal/jssdk-v5/googlepay-ecm`,
          },
          attributes: { verification: { method: scaMethod } },
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

router.get('/api/googlepay-ecm/order/:orderID', async (req, res) => {
  try {
    const { orderID } = req.params
    if (!orderID) return res.status(400).json({ error: 'orderID required' })
    const token = await getCNToken()
    const r     = await fetch(`${API}/v2/checkout/orders/${orderID}`, {
      method:  'GET',
      headers: getHeaders(token),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/api/googlepay-ecm/capture-order', async (req, res) => {
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
