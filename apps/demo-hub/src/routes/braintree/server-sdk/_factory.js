/**
 * Route factory for Braintree server-sdk demos.
 *
 * GET  /{productKey}                     → generate clientToken → render EJS
 * POST /api/{productKey}/transaction     → nonce + amount → transaction.sale → result
 *
 * Each product file provides buildTransaction(nonce, amount, extra) with its own
 * transaction params — the factory only owns the scaffold.
 */
const { Router } = require('express')
const { getGateway } = require('./_config')
const { getProduct, getProviderProducts } = require('../../../config/products')

const PROVIDER    = 'braintree'
const SDK_VERSION = 'server-sdk'
const DEFAULT_AMOUNT = '10.00'

/**
 * @param {string}   config.productKey
 * @param {string}   config.view              EJS path, e.g. 'braintree/server-sdk/dropin-ui'
 * @param {function} config.buildTransaction  (nonce, amount, extra) => braintree sale params
 * @param {string}   [config.region]          Braintree account region, default 'us'
 * @param {object}   [config.extraVars]       Additional vars injected into EJS render
 */
function createBraintreeRoute({ productKey, view, buildTransaction, region = 'us', extraVars = {} }) {
  const router = Router()

  router.get(`/${productKey}`, async (req, res) => {
    try {
      const gateway = getGateway(region)
      const { clientToken } = await gateway.clientToken.generate({})
      const product = getProduct(PROVIDER, SDK_VERSION, productKey)
      res.render(view, {
        title:             product?.displayName ?? productKey,
        provider:          PROVIDER,
        sdkVersion:        SDK_VERSION,
        currentProductKey: productKey,
        currentSdkVersion: SDK_VERSION,
        sidebarProducts:   getProviderProducts(PROVIDER),
        showSidebar:       true,
        clientToken,
        defaultAmount:     req.query.amount || DEFAULT_AMOUNT,
        ...extraVars,
      })
    } catch (err) {
      console.error(`[braintree/${productKey}] GET error:`, err.message)
      res.status(500).send('Failed to load demo: ' + err.message)
    }
  })

  router.post(`/api/${productKey}/transaction`, async (req, res) => {
    try {
      const { nonce, amount, ...extra } = req.body
      if (!nonce) return res.status(400).json({ error: 'nonce required' })
      const amt = parseFloat(amount) > 0 ? parseFloat(amount).toFixed(2) : DEFAULT_AMOUNT
      const gateway = getGateway(region)
      const result = await gateway.transaction.sale(buildTransaction(nonce, amt, extra))
      if (!result.success) {
        return res.status(400).json({ error: result.message })
      }
      res.json({
        transactionId: result.transaction.id,
        status:        result.transaction.status,
      })
    } catch (err) {
      console.error(`[braintree/${productKey}] transaction error:`, err.message)
      res.status(500).json({ error: err.message })
    }
  })

  return router
}

module.exports = { createBraintreeRoute, DEFAULT_AMOUNT }
