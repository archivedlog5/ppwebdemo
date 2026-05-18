/**
 * Route factory for PayPal JSSDK v5 standard demos.
 */
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API } = require('../../../config/paypal')
const {
  buildOrderBody, validateAmount,
  DEFAULT_AMOUNT, DEFAULT_CURRENCY, SUPPORTED_CURRENCIES,
} = require('../../../config/constants')

const PROVIDER    = 'paypal'
const SDK_VERSION = 'jssdk-v5'

/** Strip existing currency= from sdkParams so we can inject it dynamically */
function stripCurrency(sdkParams) {
  return sdkParams.replace(/[&]?currency=[^&]*/g, '').replace(/^&/, '')
}

function resolveCurrency(value) {
  return SUPPORTED_CURRENCIES.includes(value) ? value : DEFAULT_CURRENCY
}

/**
 * createStandardRoute
 * GET  reads ?currency and ?amount from query → passes to EJS + SDK URL
 * POST reads req.body.amount + req.body.currency → validates → builds body
 *
 * @param {object} config
 * @param {string} config.productKey
 * @param {string} config.sdkParams
 * @param {string} config.view
 * @param {function} [config.buildBody]  - (amount, currency) => body object
 *   If provided, called with dynamic amount+currency — all body logic in the route file.
 *   Can import and use constants directly: const C = require('.../constants')
 * @param {object}   [config.orderBody]  - Fallback: merged into buildOrderBody topLevel (legacy)
 * @param {Array}    [config.extraScripts]
 */
function createStandardRoute({ productKey, sdkParams, view, buildBody, orderBody = {}, extraScripts = [] }) {
  const router = Router()

  router.get(`/${productKey}`, (req, res) => {
    const product  = getProduct(PROVIDER, SDK_VERSION, productKey)
    const currency = resolveCurrency(req.query.currency)
    const amount   = req.query.amount || DEFAULT_AMOUNT
    const baseParams = stripCurrency(sdkParams)

    res.render(view, {
      title:             product?.displayName ?? productKey,
      provider:          PROVIDER,
      sdkVersion:        SDK_VERSION,
      currentProductKey: productKey,
      currentSdkVersion: SDK_VERSION,
      sidebarProducts:   getProviderProducts(PROVIDER),
      showSidebar:       true,
      clientId:          process.env.PAYPAL_CN_CLIENT_ID,
      sdkUrl:            `https://www.paypal.com/sdk/js?client-id=${process.env.PAYPAL_CN_CLIENT_ID}&${baseParams}&currency=${currency}`,
      extraScripts,
      defaultAmount:     amount,
      currency,
    })
  })

  router.post(`/api/${productKey}/create-order`, async (req, res) => {
    try {
      const amount   = req.body.amount   || DEFAULT_AMOUNT
      const currency = resolveCurrency(req.body.currency)
      const amountErr = validateAmount(amount, currency)
      if (amountErr) return res.status(400).json({ error: amountErr })
      const token = await getCNToken()
      // buildBody(amount, currency) → full control from route file
      // orderBody                  → legacy: merged into buildOrderBody topLevel
      const body = typeof buildBody === 'function'
        ? buildBody(amount, currency)
        : buildOrderBody(amount, { currency, topLevel: orderBody })
      const r = await fetch(`${API}/v2/checkout/orders`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const order = await r.json()
      if (!r.ok) return res.status(r.status).json({ error: order.message || 'Create order failed', details: order })
      res.json({ id: order.id })
    } catch (err) {
      console.error(`[${productKey}] create-order error:`, err.message)
      res.status(500).json({ error: err.message })
    }
  })

  router.post(`/api/${productKey}/capture-order`, async (req, res) => {
    try {
      const { orderID } = req.body
      if (!orderID) return res.status(400).json({ error: 'orderID required' })
      const token = await getCNToken()
      const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
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

/**
 * createVaultWithPurchaseRoute
 * @param {function} [config.buildBody] - (amount, currency) => body object
 *   If provided, full body control from route file (paymentSource ignored).
 * @param {object}   [config.paymentSource] - Fallback vault payment_source
 */
function createVaultWithPurchaseRoute({ productKey, sdkParams, view, buildBody, paymentSource }) {
  const router = Router()

  router.get(`/${productKey}`, (req, res) => {
    const product  = getProduct(PROVIDER, SDK_VERSION, productKey)
    const currency = resolveCurrency(req.query.currency)
    const amount   = req.query.amount || DEFAULT_AMOUNT
    const baseParams = stripCurrency(sdkParams)

    res.render(view, {
      title:             product?.displayName ?? productKey,
      provider:          PROVIDER,
      sdkVersion:        SDK_VERSION,
      currentProductKey: productKey,
      currentSdkVersion: SDK_VERSION,
      sidebarProducts:   getProviderProducts(PROVIDER),
      showSidebar:       true,
      clientId:          process.env.PAYPAL_CN_CLIENT_ID,
      sdkUrl:            `https://www.paypal.com/sdk/js?client-id=${process.env.PAYPAL_CN_CLIENT_ID}&${baseParams}&currency=${currency}`,
      defaultAmount:     amount,
      currency,
    })
  })

  router.post(`/api/${productKey}/create-order`, async (req, res) => {
    try {
      const amount   = req.body.amount   || DEFAULT_AMOUNT
      const currency = resolveCurrency(req.body.currency)
      const amountErr = validateAmount(amount, currency)
      if (amountErr) return res.status(400).json({ error: amountErr })
      const token = await getCNToken()
      const body = typeof buildBody === 'function'
        ? buildBody(amount, currency)
        : buildOrderBody(amount, { currency, purchaseUnit: { payment_source: paymentSource } })
      const r = await fetch(`${API}/v2/checkout/orders`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const order = await r.json()
      if (!r.ok) return res.status(r.status).json({ error: order.message || 'Create order failed', details: order })
      res.json({ id: order.id })
    } catch (err) {
      console.error(`[${productKey}] create-order error:`, err.message)
      res.status(500).json({ error: err.message })
    }
  })

  router.post(`/api/${productKey}/capture-order`, async (req, res) => {
    try {
      const { orderID } = req.body
      if (!orderID) return res.status(400).json({ error: 'orderID required' })
      const token = await getCNToken()
      const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      const data = await r.json()
      if (!r.ok) return res.status(r.status).json({ error: data.message || 'Capture failed', details: data })
      const src     = data?.payment_source
      const vaultId = src?.paypal?.attributes?.vault?.id ||
                      src?.card?.attributes?.vault?.id   ||
                      src?.apple_pay?.attributes?.vault?.id || null
      res.json({ ...data, vaultId })
    } catch (err) {
      console.error(`[${productKey}] capture-order error:`, err.message)
      res.status(500).json({ error: err.message })
    }
  })

  return router
}

module.exports = { createStandardRoute, createVaultWithPurchaseRoute }
