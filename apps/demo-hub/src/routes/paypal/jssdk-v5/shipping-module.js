const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, getUSToken, API, getHeaders } = require('../../../config/paypal')
const C = require('../../../config/constants')

const PROVIDER    = 'paypal'
const SDK_VERSION = 'jssdk-v5'
const PRODUCT_KEY = 'shipping-module'

function resolveCurrency(value) {
  return C.SUPPORTED_CURRENCIES.includes(value) ? value : C.DEFAULT_CURRENCY
}

// 文档示例三选项
const OPTIONS = [
  { id: '1', label: 'Free Shipping',          type: 'SHIPPING', cost: 0  },
  { id: '2', label: 'USPS Priority Shipping', type: 'SHIPPING', cost: 7  },
  { id: '3', label: '1-Day Shipping',         type: 'SHIPPING', cost: 10 },
]

const ADDRESS_ERRORS = ['ADDRESS_ERROR', 'COUNTRY_ERROR', 'STATE_ERROR', 'ZIP_ERROR']
const OPTION_ERRORS  = ['METHOD_UNAVAILABLE', 'STORE_UNAVAILABLE']

// cart 信息内嵌 callback_url query（无状态，文档推荐）
function buildCallbackUrl({ itemTotal, currency, decline, merchant }) {
  const base = process.env.PUBLIC_BASE_URL
  const qs = new URLSearchParams({
    cart_id:    'DEMO',
    item_total: itemTotal,
    currency,
    decline:    decline || 'none',
    merchant:   merchant || 'cn',
  }).toString()
  return `${base}/paypal/jssdk-v5/api/shipping-module/callback?${qs}`
}

const router = Router()

// ── GET /shipping-module ──────────────────────────────────────────────
router.get(`/${PRODUCT_KEY}`, (req, res) => {
  const merchant = req.query.merchant === 'us' ? 'us' : 'cn'
  const product  = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  const currency = resolveCurrency(req.query.currency)
  const amount   = req.query.amount || C.DEFAULT_AMOUNT
  const clientId = merchant === 'us'
    ? process.env.PAYPAL_US_CLIENT_ID
    : process.env.PAYPAL_CN_CLIENT_ID

  // 两个商户均加 buyer-country=US：CN 让沙盒美国买家账号登录，US 让买家可选 US 地址
  const sdkUrl = `https://www.paypal.com/sdk/js?client-id=${clientId}&components=buttons&buyer-country=US&currency=${currency}`

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
    currency,
    merchant,
  })
})

// ── POST /api/shipping-module/create-order ────────────────────────────
router.post(`/api/${PRODUCT_KEY}/create-order`, async (req, res) => {
  try {
    const { amount, currency: rawCurrency, merchant, subscribeOptions, decline } = req.body
    const currency = resolveCurrency(rawCurrency)
    const amountErr = C.validateAmount(amount, currency)
    if (amountErr) return res.status(400).json({ error: amountErr })

    const zd        = C.isZeroDecimal(currency)
    const itemTotal = zd ? String(Math.round(parseFloat(amount))) : parseFloat(amount).toFixed(2)
    const token     = merchant === 'us' ? await getUSToken() : await getCNToken()

    const body = {
      intent: C.INTENT.CAPTURE,

      payment_source: {
        paypal: {
          experience_context: {
            brand_name:          C.EXPERIENCE_CONTEXT.brand_name,
            landing_page:        'LOGIN',
            user_action:         'CONTINUE',
            shipping_preference: 'GET_FROM_FILE',   // 必须，否则不触发 callback
            return_url:          C.EXPERIENCE_CONTEXT.return_url,
            cancel_url:          C.EXPERIENCE_CONTEXT.cancel_url,

            order_update_callback_config: {
              // UI 开关：subscribeOptions=true → 两个事件都订；false → 只订 SHIPPING_ADDRESS
              callback_events: subscribeOptions
                ? ['SHIPPING_ADDRESS', 'SHIPPING_OPTIONS']
                : ['SHIPPING_ADDRESS'],
              callback_url: buildCallbackUrl({ itemTotal, currency, decline, merchant }),
            },
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
          currency_code: currency,
          value:         itemTotal,
          breakdown: { item_total: { currency_code: currency, value: itemTotal } },
        },
        items: [{
          ...C.DEMO_ITEM,
          unit_amount: { currency_code: currency, value: itemTotal },
        }],

        // GET_FROM_FILE：不传 shipping 对象，买家在 review 页选地址
      }],
    }

    console.log('[shipping-module create-order] body:', JSON.stringify(body, null, 2))

    const r = await fetch(`${API}/v2/checkout/orders`, {
      method:  'POST',
      headers: getHeaders(token),
      body:    JSON.stringify(body),
    })
    const order = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: order.message || 'Create order failed', details: order })

    console.log('[shipping-module create-order] response id:', order.id)
    res.json({ id: order.id })
  } catch (err) {
    console.error('[shipping-module] create-order error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/shipping-module/callback ───────────────────────────────
// PayPal 服务器→服务器回调（公网可达）；cart 信息从 query 无状态读取
router.post(`/api/${PRODUCT_KEY}/callback`, (req, res) => {
  const query = req.query
  const body  = req.body

  console.log('[shipping-module callback] query:', query, 'body:', JSON.stringify(body, null, 2))

  // ── 公网端点守卫：防脏数据 ───────────────────────────────────────────
  const itemTotal = parseFloat(query.item_total)
  if (!isFinite(itemTotal) || itemTotal <= 0) {
    return res.status(400).json({ error: 'invalid item_total' })
  }

  const currency   = query.currency || 'USD'
  const decline    = query.decline  || 'none'
  const addr  = body.shipping_address || {}
  const area1 = addr.admin_area_1 || ''  // state code for most US states (e.g. 'NY')
  const area2 = addr.admin_area_2 || ''  // DC quirk: admin_area_1='Washington', admin_area_2='DC'

  // ── DC → 无条件 STATE_ERROR ───────────────────────────────────────────
  if (area1 === 'DC' || area2 === 'DC') {
    return res.status(422).json({
      name:    'UNPROCESSABLE_ENTITY',
      details: [{ issue: 'STATE_ERROR' }],
    })
  }

  // ── 拒绝分支（最高优先级）────────────────────────────────────────────
  if (decline !== 'none') {
    const isOptionEvent = !!(body.shipping_option)
    const wantOption    = OPTION_ERRORS.includes(decline)
    // 地址类错误配地址事件；选项类错误配选项事件
    if ((wantOption && isOptionEvent) || (!wantOption && !isOptionEvent)) {
      return res.status(422).json({
        name:    'UNPROCESSABLE_ENTITY',
        details: [{ issue: decline }],
      })
    }
    // 事件与错误类型不匹配 → 走成功路径（避免无法演示成功态）
  }

  // ── 成功分支：重算金额 + 返回运送选项 ────────────────────────────────
  const zd  = C.isZeroDecimal(currency)
  const fmt = (n) => zd ? String(Math.round(n)) : n.toFixed(2)

  // 选中项：回调带 shipping_option.id 用之；否则默认第一项（Free）
  const selectedId = (body.shipping_option && body.shipping_option.id) || '1'
  const selected   = OPTIONS.find((o) => o.id === selectedId) || OPTIONS[0]

  // ⚠️ D2 取整顺序：明细三项各自先 fmt 取整，value 由取整后三项相加
  // → 从根上保证 value == breakdown 之和，即使奇数分税额也不差 1 分
  const itemR  = fmt(itemTotal)
  const taxR   = fmt(itemTotal * 0.05)    // demo 固定 5% 税
  const shipR  = fmt(selected.cost)

  // NY state: fixed $10 SUMMER_SALE discount — US merchant only
  const isNY   = (area1 === 'NY' || area2 === 'NY') && query.merchant === 'us'
  const discR  = isNY ? fmt(10) : null
  const valueR = isNY
    ? fmt(Number(itemR) + Number(taxR) + Number(shipR) - 10)
    : fmt(Number(itemR) + Number(taxR) + Number(shipR))

  const breakdown = {
    item_total: { currency_code: currency, value: itemR },
    tax_total:  { currency_code: currency, value: taxR  },
    shipping:   { currency_code: currency, value: shipR },
  }
  if (isNY) {
    breakdown.discount = {
      currency_code: currency,
      value:         discR,
      breakdown: [{
        value:         discR,
        currency_code: currency,
        discount_code: 'SUMMER_SALE',
        description:   '$10 off for summer sale',
      }],
    }
  }

  // 响应顶层 id 用回调请求体里的 order id（§2.3；先这么做看是否有问题）
  const responseId = body.id

  const responseBody = {
    id: responseId,
    purchase_units: [{
      reference_id: (body.purchase_units &&
                     body.purchase_units[0] &&
                     body.purchase_units[0].reference_id) || C.DEMO_REFERENCE_ID,
      amount: {
        currency_code: currency,
        value:         valueR,
        breakdown,
      },
      shipping_options: OPTIONS.map((o) => ({
        id:       o.id,
        label:    o.label,
        type:     o.type,
        selected: o.id === selected.id,
        amount:   { currency_code: currency, value: fmt(o.cost) },
      })),
    }],
  }

  console.log('[shipping-module callback] response:', JSON.stringify(responseBody, null, 2))
  res.json(responseBody)
})

// ── POST /api/shipping-module/capture-order ───────────────────────────
router.post(`/api/${PRODUCT_KEY}/capture-order`, async (req, res) => {
  try {
    const { orderID, merchant } = req.body
    if (!orderID) return res.status(400).json({ error: 'orderID required' })

    const token = merchant === 'us' ? await getUSToken() : await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
      method:  'POST',
      headers: getHeaders(token),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message || 'Capture failed', details: data })

    console.log('[shipping-module capture-order] response:', JSON.stringify(data, null, 2))
    res.json(data)
  } catch (err) {
    console.error('[shipping-module] capture-order error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
