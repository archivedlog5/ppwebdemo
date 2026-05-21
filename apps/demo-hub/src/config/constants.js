/**
 * PayPal API 常量与 Demo 默认数据
 * 所有路由文件从此处引用，不在路由文件里硬编码
 */

// ── 业务枚举 ─────────────────────────────────────────────────────────
const INTENT = {
  CAPTURE: "CAPTURE",
  AUTHORIZE: "AUTHORIZE",
};

const PAYMENT_SOURCE = {
  PAYPAL: "paypal",
  CARD: "card",
  APPLEPAY: "apple_pay",
  GOOGLEPAY: "google_pay",
  VENMO: "venmo",
};

const ITEM_CATEGORY = {
  PHYSICAL: "PHYSICAL_GOODS",
  DIGITAL: "DIGITAL_GOODS",
  DONATION: "DONATION",
};

// ── 支持的货币列表（30 种，已去重）──────────────────────────────────
const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "BRL",
  "CHF",
  "CZK",
  "DKK",
  "HKD",
  "HUF",
  "ILS",
  "JPY",
  "MXN",
  "NOK",
  "NZD",
  "PHP",
  "PLN",
  "SEK",
  "SGD",
  "THB",
  "TWD",
  "KRW",
  "CLP",
  "SAR",
  "UYU",
  "COP",
  "IDR",
  "PEN",
  "AED",
];

// 零小数位货币（不支持 .xx，如 ¥100 而非 ¥100.00）
const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "TWD", "CLP", "IDR"]);

function isZeroDecimal(currency) {
  return ZERO_DECIMAL_CURRENCIES.has(currency);
}

// ── Demo 默认值 ──────────────────────────────────────────────────────
const DEFAULT_AMOUNT = "100.00";
const DEFAULT_CURRENCY = "USD";
const MIN_AMOUNT = 1.0;
const MAX_AMOUNT = 30000.0;

// ── Demo 订单描述（显示在 PayPal 结账页）─────────────────────────────
const DEMO_DESCRIPTION = "Purchase Unit Description";

// purchase_units 级别的元数据常量
const DEMO_REFERENCE_ID = "01234567";
const DEMO_CUSTOM_ID = "MemberNumber00001";
const DEMO_SOFT_DESCRIPTOR = "CWEN";

const DEMO_ITEM = {
  name: "Monkey Toy",
  sku: "sku01",
  description: "Description for Monkey Toy Item",
  url: "http://www.example.com",
  category: ITEM_CATEGORY.PHYSICAL,
  quantity: "1",
};

// ── ACDC 卡支付体验上下文（payment_source.card.experience_context）────
const ACDC_EXPERIENCE_CONTEXT = {
  return_url: "https://example.com/paypal/acdc/return",
  cancel_url: "https://example.com/paypal/acdc/cancel",
};

// ── PayPal 结账体验上下文（payment_source.paypal.experience_context）──
const EXPERIENCE_CONTEXT = {
  brand_name: "Cross WEN China Store",
  landing_page: "LOGIN",
  shipping_preference: "SET_PROVIDED_ADDRESS",
  user_action: "PAY_NOW",
  return_url: "https://example.com/returnUrl",
  cancel_url: "https://example.com/cancelUrl",
};

// ── Sandbox 账单地址（ACDC 等卡支付场景）─────────────────────────────
// 声明在 SANDBOX_BUYER 之前，避免 ReferenceError
const SANDBOX_BILLING = {
  address_line_1: "123 Townsend St",
  admin_area_2: "San Francisco",
  admin_area_1: "CA",
  postal_code: "94107",
  country_code: "US",
};

// ── Sandbox 买家 PayPal 账号信息（payment_source.paypal.*）─────────────
const SANDBOX_BUYER = {
  email_address: "cwenup@personal.com",
  name: {
    given_name: "Cross",
    surname: "Wen",
  },
  address: SANDBOX_BILLING,
  phone: {
    phone_type: "MOBILE",
    phone_number: { national_number: "12407808080" },
  },
};

// ── Sandbox 收货地址（purchase_units[0].shipping，pre-fill 到结账页）──
const SANDBOX_SHIPPING = {
  name: { full_name: "Cross Wen" },
  address: {
    address_line_1: "123 Townsend St",
    address_line_2: "",
    admin_area_1: "CA",
    admin_area_2: "San Francisco",
    postal_code: "94107",
    country_code: "US",
  },
};

// ── Venmo 收货地址（US sandbox，Venmo 专用）──────────────────────────
const VENMO_SHIPPING = {
  name: { full_name: "Cross Wen" },
  address: {
    address_line_1: "test",
    address_line_2: "",
    admin_area_2: "Trumbull",
    admin_area_1: "AL",
    postal_code: "06611",
    country_code: "US",
  },
};

/**
 * 服务端金额校验
 * @param {string} amount
 * @param {string} [currency]
 * @returns {string|null} 错误信息，或 null 表示通过
 */
function validateAmount(amount, currency) {
  const cur = currency || DEFAULT_CURRENCY;
  const num = parseFloat(amount);
  if (!amount || isNaN(num)) return "Invalid amount";
  if (num < MIN_AMOUNT)
    return `Amount must be at least $${MIN_AMOUNT.toFixed(2)}`;
  if (num > MAX_AMOUNT)
    return `Amount cannot exceed $${MAX_AMOUNT.toLocaleString("en-US", {
      minimumFractionDigits: 2,
    })}`;
  return null;
}

/**
 * 统一组装 PayPal v2/checkout/orders 请求 body
 *
 * @param {string} amount
 * @param {object} overrides
 *   @param {string} overrides.currency      - 货币代码（默认 USD）
 *   @param {object} overrides.purchaseUnit  - 合并进 purchase_units[0]
 *   @param {object} overrides.topLevel      - 合并进顶层
 */
function buildOrderBody(amount, overrides = {}) {
  const currency = SUPPORTED_CURRENCIES.includes(overrides.currency)
    ? overrides.currency
    : DEFAULT_CURRENCY;

  // 零小数位货币取整，其余保留两位小数
  const num = parseFloat(amount);
  const value = isZeroDecimal(currency)
    ? String(Math.round(num))
    : num.toFixed(2);

  const purchaseUnit = {
    amount: {
      currency_code: currency,
      value,
      breakdown: {
        item_total: { currency_code: currency, value },
      },
    },
    description: DEMO_DESCRIPTION,
    items: [
      {
        ...DEMO_ITEM,
        unit_amount: { currency_code: currency, value },
      },
    ],
    shipping: SANDBOX_SHIPPING,
    ...(overrides.purchaseUnit || {}),
  };

  return {
    intent: INTENT.CAPTURE,
    purchase_units: [purchaseUnit],
    ...(overrides.topLevel || {}),
  };
}

module.exports = {
  // 业务枚举
  INTENT,
  PAYMENT_SOURCE,
  ITEM_CATEGORY,

  // 货币
  SUPPORTED_CURRENCIES,
  ZERO_DECIMAL_CURRENCIES,
  DEFAULT_AMOUNT,
  DEFAULT_CURRENCY,
  MIN_AMOUNT,
  MAX_AMOUNT,

  // Demo 订单元数据
  DEMO_DESCRIPTION,
  DEMO_REFERENCE_ID,
  DEMO_CUSTOM_ID,
  DEMO_SOFT_DESCRIPTOR,
  DEMO_ITEM,

  // PayPal 结账体验 & 买家信息
  ACDC_EXPERIENCE_CONTEXT,
  EXPERIENCE_CONTEXT,
  SANDBOX_BUYER,

  // 地址
  SANDBOX_SHIPPING,
  SANDBOX_BILLING,
  VENMO_SHIPPING,

  // 工具函数
  isZeroDecimal,
  validateAmount,
  buildOrderBody,
};
