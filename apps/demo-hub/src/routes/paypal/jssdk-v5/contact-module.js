const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getUSToken, API, getHeaders } = require('../../../config/paypal')
const C = require('../../../config/constants')

const PROVIDER    = 'paypal'
const SDK_VERSION = 'jssdk-v5'
const PRODUCT_KEY = 'contact-module'

const CONTACT_PREFS = ['NO_CONTACT_INFO', 'UPDATE_CONTACT_INFO', 'RETAIN_CONTACT_INFO']

// Fixed sandbox contact info (merchant-provided, buyer sees/edits in PayPal flow)
const DEMO_CONTACT = {
  email_address: 'buyer-contact@example.com',
  phone_number:  { country_code: '1', national_number: '5555555555' },
}

const router = Router()

// ── GET /contact-module ───────────────────────────────────────────────
router.get(`/${PRODUCT_KEY}`, (req, res) => {
  const product  = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  const amount   = req.query.amount || C.DEFAULT_AMOUNT
  const clientId = process.env.PAYPAL_US_CLIENT_ID
  // US-only: buyer-country=US triggers Contact Module in sandbox
  const sdkUrl = `https://www.paypal.com/sdk/js?client-id=${clientId}&components=buttons&buyer-country=US&currency=USD`

  res.render(`paypal/jssdk-v5/${PRODUCT_KEY}`, {
    title:             product?.displayName ?? PRODUCT_KEY,
    provider:          PROVIDER,
    sdkVersion:        SDK_VERSION,
    currentProductKey: PRODUCT_KEY,
    currentSdkVersion: SDK_VERSION,
    sidebarProducts:   getProviderProducts(PROVIDER),
    showSidebar:       true,
    clientId,
    sdkUrl,
    defaultAmount:     amount,
    demoContact:       DEMO_CONTACT,
  })
})

// ── POST /api/contact-module/create-order ─────────────────────────────
router.post(`/api/${PRODUCT_KEY}/create-order`, async (req, res) => {
  try {
    const { amount, contactPreference } = req.body

    const amountErr = C.validateAmount(amount, 'USD')
    if (amountErr) return res.status(400).json({ error: amountErr })

    const val  = parseFloat(amount).toFixed(2)
    const pref = CONTACT_PREFS.includes(contactPreference)
      ? contactPreference
      : 'UPDATE_CONTACT_INFO'   // fallback: most demonstrative

    const token = await getUSToken()

    const body = {
      intent: C.INTENT.CAPTURE,

      payment_source: {
        paypal: {
          experience_context: {
            brand_name:          C.EXPERIENCE_CONTEXT.brand_name,
            shipping_preference: 'SET_PROVIDED_ADDRESS',
            contact_preference:  pref,
            user_action:         'PAY_NOW',
            return_url:          C.EXPERIENCE_CONTEXT.return_url,
            cancel_url:          C.EXPERIENCE_CONTEXT.cancel_url,
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
          currency_code: 'USD',
          value:         val,
          breakdown: { item_total: { currency_code: 'USD', value: val } },
        },
        items: [{
          ...C.DEMO_ITEM,
          unit_amount: { currency_code: 'USD', value: val },
        }],

        shipping: {
          ...C.SANDBOX_SHIPPING,           // name + US address (CA)
          email_address: DEMO_CONTACT.email_address,
          phone_number:  DEMO_CONTACT.phone_number,
        },
      }],
    }

    console.log('[contact-module create-order] pref:', pref, 'body:', JSON.stringify(body, null, 2))

    const r = await fetch(`${API}/v2/checkout/orders`, {
      method:  'POST',
      headers: getHeaders(token),
      body:    JSON.stringify(body),
    })
    const order = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: order.message || 'Create order failed', details: order })

    console.log('[contact-module create-order] id:', order.id)
    res.json({ id: order.id })
  } catch (err) {
    console.error('[contact-module] create-order error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/contact-module/capture-order ────────────────────────────
// Approach A: GET Order first to read final contact info, then capture
router.post(`/api/${PRODUCT_KEY}/capture-order`, async (req, res) => {
  try {
    const { orderID } = req.body
    if (!orderID) return res.status(400).json({ error: 'orderID required' })

    const token = await getUSToken()

    // 1) GET Order — read latest contact info (may reflect buyer edits in UPDATE mode)
    const g = await fetch(`${API}/v2/checkout/orders/${orderID}`, {
      headers: getHeaders(token),
    })
    const orderDetails = await g.json()
    console.log('[contact-module get-order]', JSON.stringify(orderDetails, null, 2))

    const shipping = orderDetails.purchase_units?.[0]?.shipping || {}
    const contact = {
      email: shipping.email_address || null,
      phone: shipping.phone_number
        ? `${shipping.phone_number.country_code || ''} ${shipping.phone_number.national_number || ''}`.trim()
        : null,
    }

    // 2) Capture
    const c = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
      method:  'POST',
      headers: getHeaders(token),
    })
    const captureResult = await c.json()
    console.log('[contact-module capture]', JSON.stringify(captureResult, null, 2))

    if (!c.ok) {
      return res.status(c.status).json({
        error:   captureResult.message || 'Capture failed',
        details: captureResult,
      })
    }

    // 3) Rule 13: backend extracts capture status; frontend re-checks via raw
    const cap = captureResult.purchase_units?.[0]?.payments?.captures?.[0]

    res.json({
      id:        captureResult.id,
      status:    cap ? cap.status : 'unknown',
      captureId: cap ? cap.id : null,
      contact,
      raw:       captureResult,
    })
  } catch (err) {
    console.error('[contact-module] capture-order error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
