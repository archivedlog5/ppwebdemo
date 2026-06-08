/* Custom: Fastlane Quick Start — Payment UI component (single_use_token) */
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getUSToken, getUSClientToken, API, getHeaders } = require('../../../config/paypal')
const C = require('../../../config/constants')

const router = Router()
const PROVIDER = 'paypal', SDK = 'jssdk-v5', KEY = 'fastlane-pui'

// camelCase (前端) → PayPal snake_case shipping
function mapShipping(s) {
  if (!s || !s.address) return undefined
  const out = {
    type: 'SHIPPING',
    address: {
      address_line_1: s.address.addressLine1 || '',
      address_line_2: s.address.addressLine2 || '',
      admin_area_2:   s.address.adminArea2   || '',
      admin_area_1:   s.address.adminArea1   || '',
      postal_code:    s.address.postalCode   || '',
      country_code:   s.address.countryCode  || '',
    },
  }
  if (s.name && s.name.fullName) out.name = { full_name: s.name.fullName }
  if (s.phoneNumber && s.phoneNumber.countryCode && s.phoneNumber.nationalNumber) {
    out.phone_number = {
      country_code:    s.phoneNumber.countryCode,
      national_number: s.phoneNumber.nationalNumber,
    }
  }
  return out
}

function buildFastlaneOrderBody(amount, paymentToken, shippingAddress) {
  const value = parseFloat(amount).toFixed(2) // USD, 两位小数
  const pu = {
    amount: {
      currency_code: 'USD',
      value,
      breakdown: { item_total: { currency_code: 'USD', value } },
    },
    description: C.DEMO_DESCRIPTION,
    items: [{ ...C.DEMO_ITEM, unit_amount: { currency_code: 'USD', value } }],
  }
  const shipping = mapShipping(shippingAddress)
  if (shipping) pu.shipping = shipping
  return {
    intent: C.INTENT.CAPTURE,
    payment_source: { card: { single_use_token: paymentToken.id } },
    purchase_units: [pu],
  }
}

router.get('/fastlane-pui', async (req, res) => {
  try {
    const product = getProduct(PROVIDER, SDK, KEY)
    const clientId = process.env.PAYPAL_US_CLIENT_ID
    const sdkClientToken = await getUSClientToken({ intent: 'sdk_init' })
    res.render('paypal/jssdk-v5/fastlane-pui', {
      title: product?.displayName ?? 'Fastlane Payment UI',
      provider: PROVIDER, sdkVersion: SDK,
      currentProductKey: KEY, currentSdkVersion: SDK,
      sidebarProducts: getProviderProducts(PROVIDER),
      showSidebar: true,
      clientId,
      sdkClientToken,
      sdkUrl: `https://www.paypal.com/sdk/js?client-id=${clientId}&components=fastlane&buyer-country=US&currency=USD`,
      defaultAmount: req.query.amount || C.DEFAULT_AMOUNT,
      currency: 'USD',
    })
  } catch (err) {
    console.error('[fastlane-pui] render error:', err.message)
    res.status(500).send('Fastlane init failed: ' + err.message)
  }
})

router.post('/api/fastlane-pui/create-order', async (req, res) => {
  try {
    const { paymentToken, shippingAddress } = req.body
    const amount = req.body.amount || C.DEFAULT_AMOUNT
    if (!paymentToken || !paymentToken.id) {
      return res.status(400).json({ error: 'paymentToken.id required' })
    }
    const amountErr = C.validateAmount(amount, 'USD')
    if (amountErr) return res.status(400).json({ error: amountErr })

    const token = await getUSToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: getHeaders(token, { 'PayPal-Request-Id': Date.now().toString() }),
      body: JSON.stringify(buildFastlaneOrderBody(amount, paymentToken, shippingAddress)),
    })
    const order = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: order.message, details: order })
    res.json(order) // 完整 order；前端按 captures[0].status 判定
  } catch (err) {
    console.error('[fastlane-pui] create-order error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
