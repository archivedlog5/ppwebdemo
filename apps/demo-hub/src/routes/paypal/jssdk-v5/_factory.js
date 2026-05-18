/**
 * Route factory for PayPal JSSDK v5 standard demos.
 * Eliminates boilerplate across 14 product route files.
 */
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API } = require('../../../config/paypal')
const { buildOrderBody, DEFAULT_AMOUNT, validateAmount } = require('../../../config/constants')

const PROVIDER    = 'paypal'
const SDK_VERSION = 'jssdk-v5'

/**
 * createStandardRoute — for standard PayPal/ApplePay/GooglePay demos.
 * create-order reads amount from req.body.amount (sent by frontend input).
 *
 * @param {object} config
 * @param {string} config.productKey    - e.g. 'spb-ecm'
 * @param {string} config.sdkParams     - SDK URL query string
 * @param {string} config.view          - EJS view path
 * @param {object} [config.orderBody]   - Merged into buildOrderBody overrides.topLevel
 * @param {Array}  [config.extraScripts]- Extra scripts (e.g. Google Pay)
 */
function createStandardRoute({ productKey, sdkParams, view, orderBody = {}, extraScripts = [] }) {
  const router = Router()

  router.get(`/${productKey}`, (req, res) => {
    const product = getProduct(PROVIDER, SDK_VERSION, productKey)
    res.render(view, {
      title:             product?.displayName ?? productKey,
      provider:          PROVIDER,
      sdkVersion:        SDK_VERSION,
      currentProductKey: productKey,
      currentSdkVersion: SDK_VERSION,
      sidebarProducts:   getProviderProducts(PROVIDER),
      showSidebar:       true,
      clientId:          process.env.PAYPAL_CN_CLIENT_ID,
      sdkUrl:            `https://www.paypal.com/sdk/js?client-id=${process.env.PAYPAL_CN_CLIENT_ID}&${sdkParams}`,
      extraScripts,
      defaultAmount:     DEFAULT_AMOUNT,
    })
  })

  router.post(`/api/${productKey}/create-order`, async (req, res) => {
    try {
      const amount = req.body.amount || DEFAULT_AMOUNT
      const amountErr = validateAmount(amount)
      if (amountErr) return res.status(400).json({ error: amountErr })
      const token  = await getCNToken()
      const body   = buildOrderBody(amount, { topLevel: orderBody })
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
 * createVaultWithPurchaseRoute — Vault with-purchase demos.
 * payment_source goes into purchaseUnit override so buildOrderBody can merge it.
 */
function createVaultWithPurchaseRoute({ productKey, sdkParams, view, paymentSource }) {
  const router = Router()

  router.get(`/${productKey}`, (req, res) => {
    const product = getProduct(PROVIDER, SDK_VERSION, productKey)
    res.render(view, {
      title:             product?.displayName ?? productKey,
      provider:          PROVIDER,
      sdkVersion:        SDK_VERSION,
      currentProductKey: productKey,
      currentSdkVersion: SDK_VERSION,
      sidebarProducts:   getProviderProducts(PROVIDER),
      showSidebar:       true,
      clientId:          process.env.PAYPAL_CN_CLIENT_ID,
      sdkUrl:            `https://www.paypal.com/sdk/js?client-id=${process.env.PAYPAL_CN_CLIENT_ID}&${sdkParams}`,
      defaultAmount:     DEFAULT_AMOUNT,
    })
  })

  router.post(`/api/${productKey}/create-order`, async (req, res) => {
    try {
      const amount = req.body.amount || DEFAULT_AMOUNT
      const amountErr = validateAmount(amount)
      if (amountErr) return res.status(400).json({ error: amountErr })
      const token  = await getCNToken()
      const body   = buildOrderBody(amount, { purchaseUnit: { payment_source: paymentSource } })
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
      // Vault token id varies by payment source type
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
