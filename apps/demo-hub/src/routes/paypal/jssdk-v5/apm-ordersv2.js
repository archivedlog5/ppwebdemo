/**
 * PayPal JSSDK v5 — APM Bancontact（纯 Orders v2 API，无 JSSDK）
 * Bancontact：比利时 · EUR · 银行重定向 · 中国商户 · 自动捕获
 * 3 端点：GET 渲染 / POST create-order / GET return（无 capture，自动捕获）
 */
const { Router } = require('express')
const fetch = require('node-fetch')
const { randomUUID } = require('crypto')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API, getHeaders } = require('../../../config/paypal')
const C = require('../../../config/constants')

const PROVIDER    = 'paypal'
const SDK_VERSION = 'jssdk-v5'
const PRODUCT_KEY = 'apm-ordersv2'

const router = Router()

function buildBody(amount, origin) {
  const val = parseFloat(amount).toFixed(2)
  const eur = (v) => ({ currency_code: 'EUR', value: v })

  return {
    intent: C.INTENT.CAPTURE,
    processing_instruction: 'ORDER_COMPLETE_ON_PAYMENT_APPROVAL',

    payment_source: {
      bancontact: {
        country_code: 'BE',
        name:         'Cross Wen',
        experience_context: {
          brand_name:          'CWEN CHINA STORE',
          shipping_preference: 'SET_PROVIDED_ADDRESS',
          locale:              'en-BE',
          return_url:          `${origin}/paypal/jssdk-v5/apm-ordersv2/return`,
          cancel_url:          `${origin}/paypal/jssdk-v5/apm-ordersv2/return?status=cancel`,
        },
      },
    },

    purchase_units: [{
      reference_id:    C.DEMO_REFERENCE_ID,
      description:     C.DEMO_DESCRIPTION,
      custom_id:       C.DEMO_CUSTOM_ID,
      soft_descriptor: C.DEMO_SOFT_DESCRIPTOR,
      invoice_id:      `INV-${Date.now()}`,

      amount: {
        currency_code: 'EUR',
        value:         val,
        breakdown: { item_total: eur(val) },
      },
      items: [{ ...C.DEMO_ITEM, unit_amount: eur(val) }],

      shipping: C.BE_SHIPPING,
    }],
  }
}

router.get(`/${PRODUCT_KEY}`, (req, res) => {
  const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  const amount  = req.query.amount || C.DEFAULT_AMOUNT
  res.render(`paypal/jssdk-v5/${PRODUCT_KEY}`, {
    title:             product?.displayName ?? PRODUCT_KEY,
    provider:          PROVIDER,
    sdkVersion:        SDK_VERSION,
    currentProductKey: PRODUCT_KEY,
    currentSdkVersion: SDK_VERSION,
    sidebarProducts:   getProviderProducts(PROVIDER),
    showSidebar:       true,
    defaultAmount:     amount,
  })
})

router.post(`/api/${PRODUCT_KEY}/create-order`, async (req, res) => {
  try {
    const amount    = req.body.amount || C.DEFAULT_AMOUNT
    const amountErr = C.validateAmount(amount, 'EUR')
    if (amountErr) return res.status(400).json({ error: amountErr })

    const origin = `${req.protocol}://${req.get('host')}`
    const token  = await getCNToken()
    const body   = buildBody(amount, origin)
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: getHeaders(token, { 'PayPal-Request-Id': randomUUID() }),
      body: JSON.stringify(body),
    })
    const order = await r.json()
    console.log('[apm-ordersv2 create-order]', JSON.stringify(order, null, 2))
    if (!r.ok) return res.status(r.status).json({ error: order.message || 'Create order failed', details: order })

    const link = (order.links || []).find(function (l) { return l.rel === 'payer-action' })
    if (!link) return res.status(502).json({ error: 'No payer-action link in order response', details: order })

    res.json({ id: order.id, payerAction: link.href })
  } catch (err) {
    console.error('[apm-ordersv2] create-order error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

router.get(`/${PRODUCT_KEY}/return`, async (req, res) => {
  const backUrl = `/paypal/jssdk-v5/${PRODUCT_KEY}`
  const render = (state, orderJson) => res.render(`paypal/jssdk-v5/${PRODUCT_KEY}-return`, {
    title:             'APM · Bancontact — Return',
    provider:          PROVIDER,
    sdkVersion:        SDK_VERSION,
    currentProductKey: PRODUCT_KEY,
    currentSdkVersion: SDK_VERSION,
    sidebarProducts:   getProviderProducts(PROVIDER),
    showSidebar:       true,
    state, orderJson, backUrl,
  })

  try {
    if (req.query.status === 'cancel') return render('cancelled', null)

    const orderID = req.query.token
    if (!orderID) return render('error', null)

    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderID}`, {
      method: 'GET', headers: getHeaders(token),
    })
    const order = await r.json()
    console.log('[apm-ordersv2 return GET order]', JSON.stringify(order, null, 2))
    if (!r.ok) return render('error', JSON.stringify(order, null, 2))

    const cap = order.purchase_units &&
                order.purchase_units[0] &&
                order.purchase_units[0].payments &&
                order.purchase_units[0].payments.captures &&
                order.purchase_units[0].payments.captures[0]
    const ok = order.status === 'COMPLETED' && cap && cap.status === 'COMPLETED'
    render(ok ? 'success' : 'error', JSON.stringify(order, null, 2))
  } catch (err) {
    console.error('[apm-ordersv2] return error:', err.message)
    render('error', null)
  }
})

module.exports = router
