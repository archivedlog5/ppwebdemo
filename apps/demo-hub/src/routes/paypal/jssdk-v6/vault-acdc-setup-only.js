/* Custom: v6 ACDC Vault setup-only (no purchase) — Card Fields Save Session + /v3/vault/setup-tokens */
const { Router } = require('express')
const { randomBytes } = require('crypto')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API, getHeaders } = require('../../../config/paypal')
const { SANDBOX_BUYER, SANDBOX_BILLING } = require('../../../config/constants')

const router = Router()
const PROVIDER = 'paypal', SDK = 'jssdk-v6', KEY = 'vault-acdc-setup-only'
const SCA_METHODS = ['SCA_WHEN_REQUIRED', 'SCA_ALWAYS']

router.get(`/${KEY}`, (req, res) => {
  const product = getProduct(PROVIDER, SDK, KEY)
  res.render(`paypal/jssdk-v6/${KEY}`, {
    title: product?.displayName ?? 'ACDC Vault Setup',
    provider: PROVIDER, sdkVersion: SDK,
    currentProductKey: KEY, currentSdkVersion: SDK,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    clientId: process.env.PAYPAL_CN_CLIENT_ID,
    sandboxCardholderName: `${SANDBOX_BUYER.name.given_name} ${SANDBOX_BUYER.name.surname}`,
    sandboxBilling: {
      addressLine1: SANDBOX_BILLING.address_line_1,
      adminArea2:   SANDBOX_BILLING.admin_area_2,
      adminArea1:   SANDBOX_BILLING.admin_area_1,
      postalCode:   SANDBOX_BILLING.postal_code,
      countryCode:  SANDBOX_BILLING.country_code,
    },
  })
})

router.post(`/api/${KEY}/create-setup-token`, async (req, res) => {
  try {
    const scaMethod = SCA_METHODS.includes(req.body.scaMethod) ? req.body.scaMethod : 'SCA_WHEN_REQUIRED'
    const baseUrl   = `${req.protocol}://${req.get('host')}`
    const returnUrl = `${baseUrl}/paypal/jssdk-v6/${KEY}`
    const cancelUrl = `${baseUrl}/paypal/jssdk-v6/${KEY}`
    const token = await getCNToken()
    const r = await fetch(`${API}/v3/vault/setup-tokens`, {
      method: 'POST',
      headers: getHeaders(token, { 'PayPal-Request-Id': `acdc-setup-${Date.now()}` }),
      body: JSON.stringify({
        customer: { merchant_customer_id: 'CUST_' + randomBytes(6).toString('hex').toUpperCase() },
        payment_source: {
          card: {
            billing_address: {
              address_line_1: SANDBOX_BILLING.address_line_1,
              admin_area_2:   SANDBOX_BILLING.admin_area_2,
              admin_area_1:   SANDBOX_BILLING.admin_area_1,
              postal_code:    SANDBOX_BILLING.postal_code,
              country_code:   SANDBOX_BILLING.country_code,
            },
            experience_context: { return_url: returnUrl, cancel_url: cancelUrl },
            verification_method: scaMethod,
          },
        },
      }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
    res.json({ setupTokenId: data.id })
  } catch (err) {
    console.error(`[${KEY}] create-setup-token error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

router.get(`/api/${KEY}/setup-token/:setupTokenId`, async (req, res) => {
  try {
    const token = await getCNToken()
    const r = await fetch(`${API}/v3/vault/setup-tokens/${req.params.setupTokenId}`, {
      method: 'GET', headers: getHeaders(token),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
    res.json(data)
  } catch (err) {
    console.error(`[${KEY}] get-setup-token error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

router.post(`/api/${KEY}/confirm-setup-token`, async (req, res) => {
  try {
    const { setupTokenId } = req.body
    if (!setupTokenId) return res.status(400).json({ error: 'setupTokenId required' })
    const token = await getCNToken()
    const r = await fetch(`${API}/v3/vault/payment-tokens`, {
      method: 'POST',
      headers: getHeaders(token, { 'PayPal-Request-Id': `acdc-confirm-${Date.now()}` }),
      body: JSON.stringify({ payment_source: { token: { id: setupTokenId, type: 'SETUP_TOKEN' } } }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
    const customerId = data.customer?.id || null
    res.json({ paymentTokenId: data.id, customerId, data })
  } catch (err) {
    console.error(`[${KEY}] confirm-setup-token error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
