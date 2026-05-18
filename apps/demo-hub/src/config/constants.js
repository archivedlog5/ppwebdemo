/**
 * PayPal API 常量与 Demo 默认数据
 * 所有路由文件从此处引用，不在路由文件里硬编码
 */

// ── 业务枚举 ─────────────────────────────────────────────────────────
const INTENT = {
  CAPTURE:   'CAPTURE',
  AUTHORIZE: 'AUTHORIZE',
}

const CURRENCY = {
  USD: 'USD',
  CNY: 'CNY',
  EUR: 'EUR',
  GBP: 'GBP',
}

const ITEM_CATEGORY = {
  PHYSICAL: 'PHYSICAL_GOODS',
  DIGITAL:  'DIGITAL_GOODS',
  DONATION: 'DONATION',
}

// ── Demo 默认值 ──────────────────────────────────────────────────────
const DEFAULT_AMOUNT   = '100.00'
const DEFAULT_CURRENCY = CURRENCY.USD
const MIN_AMOUNT       = 1.00
const MAX_AMOUNT       = 30000.00

// ── Demo 订单描述（显示在 PayPal 结账页）─────────────────────────────
const DEMO_DESCRIPTION = 'PayPal Integration Demo Purchase'

const DEMO_ITEM = {
  name:        'Demo Product',
  description: 'PayPal Integration Demo Item',
  category:    ITEM_CATEGORY.PHYSICAL,
  quantity:    '1',
}

// ── Sandbox 收货地址（pre-fill 到结账页，买家可修改）──────────────────
const SANDBOX_SHIPPING = {
  name: { full_name: 'Test Buyer' },
  address: {
    address_line_1: '123 Townsend St',
    admin_area_2:   'San Francisco',
    admin_area_1:   'CA',
    postal_code:    '94107',
    country_code:   'US',
  },
}

// ── Sandbox 账单地址（ACDC 等卡支付场景）─────────────────────────────
const SANDBOX_BILLING = {
  address_line_1: '123 Townsend St',
  admin_area_2:   'San Francisco',
  admin_area_1:   'CA',
  postal_code:    '94107',
  country_code:   'US',
}

/**
 * 统一组装 PayPal v2/checkout/orders 请求 body
 *
 * @param {string} amount   - 金额字符串，如 '100.00'（前端传入）
 * @param {object} overrides
 *   @param {string} overrides.currency      - 货币代码，默认 USD
 *   @param {object} overrides.purchaseUnit  - 合并进 purchase_units[0]（如 Vault payment_source）
 *   @param {object} overrides.topLevel      - 合并进顶层（如 payment_source.token）
 */
/**
 * 服务端金额校验，返回错误字符串或 null
 */
function validateAmount(amount) {
  const num = parseFloat(amount)
  if (!amount || isNaN(num)) return 'Invalid amount'
  if (num < MIN_AMOUNT) return `Amount must be at least $${MIN_AMOUNT.toFixed(2)}`
  if (num > MAX_AMOUNT) return `Amount cannot exceed $${MAX_AMOUNT.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  return null
}

function buildOrderBody(amount, overrides = {}) {
  const value    = parseFloat(amount).toFixed(2)
  const currency = overrides.currency || DEFAULT_CURRENCY

  const purchaseUnit = {
    amount: {
      currency_code: currency,
      value,
      breakdown: {
        // 包含 items 时 PayPal 要求 breakdown.item_total === items 之和
        item_total: { currency_code: currency, value }
      }
    },
    description: DEMO_DESCRIPTION,
    items: [{
      ...DEMO_ITEM,
      unit_amount: { currency_code: currency, value },
    }],
    shipping: SANDBOX_SHIPPING,
    ...(overrides.purchaseUnit || {}),
  }

  return {
    intent: INTENT.CAPTURE,
    purchase_units: [purchaseUnit],
    ...(overrides.topLevel || {}),
  }
}

module.exports = {
  INTENT,
  CURRENCY,
  ITEM_CATEGORY,
  DEFAULT_AMOUNT,
  DEFAULT_CURRENCY,
  MIN_AMOUNT,
  MAX_AMOUNT,
  DEMO_DESCRIPTION,
  DEMO_ITEM,
  SANDBOX_SHIPPING,
  SANDBOX_BILLING,
  validateAmount,
  buildOrderBody,
}
