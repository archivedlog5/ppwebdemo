'use strict'

/* Custom route: dual SDK (CN account for PayPal/PayLater/BCDC, US account for Venmo) */

const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, getUSToken, getUSClientToken, API, getHeaders } = require('../../../config/paypal')
const C = require('../../../config/constants')

const PROVIDER    = 'paypal'
const SDK_VERSION = 'jssdk-v6'
const PRODUCT_KEY = 'buttons'

function resolveCurrency(v) {
  return C.SUPPORTED_CURRENCIES.includes(v) ? v : C.DEFAULT_CURRENCY
}

function buildBodyCN(amount, currency) {
  const zd  = C.isZeroDecimal(currency)
  const val = zd ? String(Math.round(parseFloat(amount))) : parseFloat(amount).toFixed(2)
  const amountObj = (curr) => ({ currency_code: curr, value: val })
  return {
    intent: C.INTENT.CAPTURE,
    payment_source: {
      paypal: {
        ...C.SANDBOX_BUYER,
        experience_context: C.EXPERIENCE_CONTEXT,
      },
    },
    purchase_units: [{
      reference_id:    C.DEMO_REFERENCE_ID,
      description:     C.DEMO_DESCRIPTION,
      invoice_id:      `INV-${Date.now()}`,
      custom_id:       C.DEMO_CUSTOM_ID,
      soft_descriptor: C.DEMO_SOFT_DESCRIPTOR,
      amount: {
        currency_code: currency,
        value:         val,
        breakdown:     { item_total: amountObj(currency) },
      },
      items:    [{ ...C.DEMO_ITEM, unit_amount: amountObj(currency) }],
      shipping: C.SANDBOX_SHIPPING,
    }],
  }
}

function buildBodyVenmo(amount) {
  const val       = parseFloat(amount).toFixed(2)
  const amountObj = { currency_code: 'USD', value: val }
  return {
    intent: C.INTENT.CAPTURE,
    payment_source: {
      venmo: {
        experience_context: {
          brand_name:          'Cross Wen US Store',
          shipping_preference: 'SET_PROVIDED_ADDRESS',
        },
      },
    },
    purchase_units: [{
      reference_id:    C.DEMO_REFERENCE_ID,
      description:     C.DEMO_DESCRIPTION,
      invoice_id:      `INV-${Date.now()}`,
      custom_id:       C.DEMO_CUSTOM_ID,
      soft_descriptor: C.DEMO_SOFT_DESCRIPTOR,
      amount: {
        currency_code: 'USD',
        value:         val,
        breakdown:     { item_total: amountObj },
      },
      items:    [{ ...C.DEMO_ITEM, unit_amount: amountObj }],
      shipping: C.VENMO_SHIPPING,
    }],
  }
}

const router = Router()

// Browser-safe client token for US account (v6 SDK Venmo instance)
router.get(`/api/${PRODUCT_KEY}/us-client-token`, async (req, res) => {
  try {
    const clientToken = await getUSClientToken()
    res.json({ clientToken })
  } catch (err) {
    console.error('[buttons] us-client-token error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

router.get(`/${PRODUCT_KEY}`, (req, res) => {
  const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  const amount  = req.query.amount || C.DEFAULT_AMOUNT

  res.render(`${PROVIDER}/jssdk-v6/${PRODUCT_KEY}`, {
    title:             product?.displayName ?? 'Standalone Buttons',
    provider:          PROVIDER,
    sdkVersion:        SDK_VERSION,
    currentProductKey: PRODUCT_KEY,
    currentSdkVersion: SDK_VERSION,
    sidebarProducts:   getProviderProducts(PROVIDER),
    showSidebar:       true,
    cnClientId:        process.env.PAYPAL_CN_CLIENT_ID,
    usClientId:        process.env.PAYPAL_US_CLIENT_ID,
    defaultAmount:     amount,
  })
})

// CN: PayPal / PayLater / BCDC
router.post(`/api/${PRODUCT_KEY}/create-order-cn`, async (req, res) => {
  try {
    const amount    = req.body.amount || C.DEFAULT_AMOUNT
    const currency  = resolveCurrency(req.body.currency)
    const amountErr = C.validateAmount(amount, currency)
    if (amountErr) return res.status(400).json({ error: amountErr })

    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method:  'POST',
      headers: getHeaders(token),
      body:    JSON.stringify(buildBodyCN(amount, currency)),
    })
    const order = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: order.message || 'Create order failed', details: order })
    res.json({ orderId: order.id })
  } catch (err) {
    console.error('[buttons] create-order-cn error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// US: Venmo
router.post(`/api/${PRODUCT_KEY}/create-order-us`, async (req, res) => {
  try {
    const amount    = req.body.amount || C.DEFAULT_AMOUNT
    const amountErr = C.validateAmount(amount, 'USD')
    if (amountErr) return res.status(400).json({ error: amountErr })

    const token = await getUSToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method:  'POST',
      headers: getHeaders(token),
      body:    JSON.stringify(buildBodyVenmo(amount)),
    })
    const order = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: order.message || 'Create order failed', details: order })
    res.json({ orderId: order.id })
  } catch (err) {
    console.error('[buttons] create-order-us error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// CN capture: PayPal / PayLater / BCDC
router.post(`/api/${PRODUCT_KEY}/capture-order-cn`, async (req, res) => {
  try {
    const { orderId } = req.body
    if (!orderId) return res.status(400).json({ error: 'orderId required' })

    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderId}/capture`, {
      method:  'POST',
      headers: getHeaders(token),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message || 'Capture failed', details: data })
    res.json(data)
  } catch (err) {
    console.error('[buttons] capture-order-cn error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// US capture: Venmo
router.post(`/api/${PRODUCT_KEY}/capture-order-us`, async (req, res) => {
  try {
    const { orderId } = req.body
    if (!orderId) return res.status(400).json({ error: 'orderId required' })

    const token = await getUSToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderId}/capture`, {
      method:  'POST',
      headers: getHeaders(token),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message || 'Capture failed', details: data })
    res.json(data)
  } catch (err) {
    console.error('[buttons] capture-order-us error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
