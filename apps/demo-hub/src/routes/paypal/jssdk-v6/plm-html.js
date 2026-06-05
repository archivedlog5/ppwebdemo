'use strict'

const { Router } = require('express')
const { getProduct, getProviderProducts } = require('../../../config/products')

const PROVIDER    = 'paypal'
const SDK_VERSION = 'jssdk-v6'
const PRODUCT_KEY = 'plm-html'

const COUNTRY_TO_CUR = { US: 'USD', AU: 'AUD', DE: 'EUR', ES: 'EUR', FR: 'EUR', IT: 'EUR', GB: 'GBP', CA: 'CAD' }
const PLM_COUNTRIES  = ['US', 'AU', 'DE', 'ES', 'FR', 'IT', 'GB', 'CA']

const router = Router()

router.get(`/${PRODUCT_KEY}`, (req, res) => {
  const country  = PLM_COUNTRIES.includes(req.query.country) ? req.query.country : 'US'
  const currency = COUNTRY_TO_CUR[country] || 'USD'
  const amount   = req.query.amount || '100.00'
  const product  = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)

  res.render(`paypal/jssdk-v6/${PRODUCT_KEY}`, {
    title:             product?.displayName ?? PRODUCT_KEY,
    provider:          PROVIDER,
    sdkVersion:        SDK_VERSION,
    currentProductKey: PRODUCT_KEY,
    currentSdkVersion: SDK_VERSION,
    sidebarProducts:   getProviderProducts(PROVIDER),
    showSidebar:       true,
    clientId:          process.env.PAYPAL_CN_CLIENT_ID,
    defaultAmount:     amount,
    currency,
    country,
  })
})

module.exports = router
