'use strict'

const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API, getHeaders } = require('../../../config/paypal')
const { validateAmount, DEFAULT_AMOUNT, DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } = require('../../../config/constants')

const PROVIDER    = 'paypal'
const SDK_VERSION = 'jssdk-v6'

function resolveCurrency(value) {
  return SUPPORTED_CURRENCIES.includes(value) ? value : DEFAULT_CURRENCY
}

/**
 * createStandardRoute — factory for simple ECM/ECS products.
 *
 * @param {object} config
 * @param {string} config.productKey   — e.g. 'paypal-ecm'
 * @param {string} config.view         — EJS view path, e.g. 'paypal/jssdk-v6/paypal-ecm'
 * @param {function} config.buildBody  — (required) (amount, currency) => PayPal order request body object.
 *   amount is the raw string from req.body. For zero-decimal currencies (JPY/KRW/TWD/CLP/IDR)
 *   use isZeroDecimal(currency) from constants.js to round before building the amount value.
 */
function createStandardRoute({ productKey, view, buildBody }) {
  if (typeof buildBody !== 'function') throw new Error(`[${productKey}] buildBody is required for v6 routes`)
  const router = Router()

  // GET — render demo page (injects clientId, NOT sdkUrl — v6 SDK has no URL params)
  router.get(`/${productKey}`, (req, res) => {
    const product  = getProduct(PROVIDER, SDK_VERSION, productKey)
    const currency = resolveCurrency(req.query.currency)
    const amount   = req.query.amount || DEFAULT_AMOUNT

    res.render(view, {
      title:             product?.displayName ?? productKey,
      provider:          PROVIDER,
      sdkVersion:        SDK_VERSION,
      currentProductKey: productKey,
      currentSdkVersion: SDK_VERSION,
      sidebarProducts:   getProviderProducts(PROVIDER),
      showSidebar:       true,
      clientId:          process.env.PAYPAL_CN_CLIENT_ID,
      defaultAmount:     amount,
      currency,
      supportedCurrencies: SUPPORTED_CURRENCIES,
      country:           req.query.country || '',
    })
  })

  // POST create-order — v6 returns { orderId } (lowercase d, object)
  router.post(`/api/${productKey}/create-order`, async (req, res) => {
    try {
      const amount   = req.body.amount   || DEFAULT_AMOUNT
      const currency = resolveCurrency(req.body.currency)
      const amountErr = validateAmount(amount, currency)
      if (amountErr) return res.status(400).json({ error: amountErr })

      const token = await getCNToken()
      const body  = buildBody(amount, currency)
      const r = await fetch(`${API}/v2/checkout/orders`, {
        method:  'POST',
        headers: getHeaders(token),
        body:    JSON.stringify(body),
      })
      const order = await r.json()
      if (!r.ok) return res.status(r.status).json({ error: order.message || 'Create order failed', details: order })
      res.json({ orderId: order.id })   // ← v6: lowercase 'd', object (not string)
    } catch (err) {
      console.error(`[${productKey}] create-order error:`, err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // POST capture-order — v6 reads orderId (lowercase d)
  router.post(`/api/${productKey}/capture-order`, async (req, res) => {
    try {
      const { orderId } = req.body   // ← v6: lowercase 'd'
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
      console.error(`[${productKey}] capture-order error:`, err.message)
      res.status(500).json({ error: err.message })
    }
  })

  return router
}

module.exports = { createStandardRoute }
