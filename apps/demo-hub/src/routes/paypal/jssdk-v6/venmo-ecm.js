'use strict'

const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getUSToken, API, getHeaders } = require('../../../config/paypal')
const C = require('../../../config/constants')

const PROVIDER    = 'paypal'
const SDK_VERSION = 'jssdk-v6'
const PRODUCT_KEY = 'venmo-ecm'

const router = Router()

router.get(`/${PRODUCT_KEY}`, (req, res) => {
  const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  const amount  = req.query.amount || C.DEFAULT_AMOUNT

  res.render(`${PROVIDER}/jssdk-v6/${PRODUCT_KEY}`, {
    title:             product?.displayName ?? PRODUCT_KEY,
    provider:          PROVIDER,
    sdkVersion:        SDK_VERSION,
    currentProductKey: PRODUCT_KEY,
    currentSdkVersion: SDK_VERSION,
    sidebarProducts:   getProviderProducts(PROVIDER),
    showSidebar:       true,
    clientId:          process.env.PAYPAL_US_CLIENT_ID,
    defaultAmount:     amount,
  })
})

router.post(`/api/${PRODUCT_KEY}/create-order`, async (req, res) => {
  try {
    const amount    = req.body.amount || C.DEFAULT_AMOUNT
    const amountErr = C.validateAmount(amount, 'USD')
    if (amountErr) return res.status(400).json({ error: amountErr })

    const val       = parseFloat(amount).toFixed(2)
    const amountObj = { currency_code: 'USD', value: val }

    const body = {
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

    const token = await getUSToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method:  'POST',
      headers: getHeaders(token),
      body:    JSON.stringify(body),
    })
    const order = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: order.message || 'Create order failed', details: order })
    res.json({ orderId: order.id })
  } catch (err) {
    console.error(`[${PRODUCT_KEY}] create-order error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

router.post(`/api/${PRODUCT_KEY}/capture-order`, async (req, res) => {
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
    console.error(`[${PRODUCT_KEY}] capture-order error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
