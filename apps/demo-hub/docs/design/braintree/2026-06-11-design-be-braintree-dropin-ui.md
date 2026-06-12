# 后端设计 — Braintree Drop-in UI

> 日期：2026-06-11 · 文件：`src/routes/braintree/server-sdk/dropin-ui.js`（工厂路由）

## 1. 路由清单

```
GET  /braintree/server-sdk/dropin-ui                        → 生成 clientToken，渲染 EJS
POST /braintree/server-sdk/api/dropin-ui/transaction        → nonce → transaction.sale → 结果
```

挂载（`src/app.js`，braintree 块内，已存在）：

```js
const btSdk = '/braintree/server-sdk'
app.use(btSdk, require('./routes/braintree/server-sdk/dropin-ui'))
```

## 2. 为什么用工厂（`createBraintreeRoute`）

Drop-in UI 不需要额外端点，两条路由（GET 渲染 + POST transaction）与工厂职责完全匹配，直接用 `createBraintreeRoute`，无需自定义路由。

## 2a. 常量文件（`src/config/bt-constants.js`）

所有 Braintree 路由文件从此处引用 demo 常量，不在路由文件里硬编码。引入方式与 PayPal 一致：

```js
const C = require('../../../config/bt-constants')
```

| 分组 | 常量 | 说明 |
|------|------|------|
| 账单联系人 | `BILLING_FIRST_NAME`, `BILLING_LAST_NAME`, `BILLING_EMAIL`, `BILLING_PHONE` | customer / billing / 3DS billingAddress 共用（John Doe · Chicago IL） |
| 账单地址 | `BILLING_STREET_ADDRESS`, `BILLING_EXTENDED_ADDRESS`, `BILLING_LOCALITY`, `BILLING_REGION`, `BILLING_POSTAL_CODE`, `BILLING_COUNTRY_CODE` | transaction.sale billing 字段 |
| 收货联系人 | `SHIPPING_FIRST_NAME`, `SHIPPING_LAST_NAME` | shipping / 3DS additionalInformation（Jane Smith · San Francisco CA） |
| 收货地址 | `SHIPPING_STREET_ADDRESS`, `SHIPPING_EXTENDED_ADDRESS`, `SHIPPING_LOCALITY`, `SHIPPING_REGION`, `SHIPPING_POSTAL_CODE`, `SHIPPING_COUNTRY_CODE` | transaction.sale shipping 字段 |
| 收货方式 | `SHIPPING_METHOD` | `'ground'` |
| 描述符 | `DESCRIPTOR_NAME`, `DESCRIPTOR_PHONE`, `DESCRIPTOR_URL` | DBA 段必须 3/7/12 字符；url ≤13；`DESCRIPTOR_NAME = "CWEN5BT*DROPIN"`（7+1+6=14） |
| PayPal 专属 | `PAYPAL_DESC`, `PAYPAL_FIELD` | Drop-in PayPal `options.paypal.description / customField` |
| 商品行项（静态） | `LINE_ITEM_NAME`, `LINE_ITEM_KIND`, `LINE_ITEM_QUANTITY`, `LINE_ITEM_UNIT_OF_MEASURE`, `LINE_ITEM_DESCRIPTION`, `LINE_ITEM_PRODUCT_CODE`, `LINE_ITEM_COMMODITY_CODE`, `LINE_ITEM_URL` | Level 3 lineItems 静态字段；`unitAmount` / `totalAmount` 动态注入（= transaction amount） |
| Level 2 | `TAX_AMOUNT`, `PURCHASE_ORDER_NUMBER` | 对应前端 `amountBreakdown.taxTotal`；Level 2 采购单号 |
| 电话区号映射 | `COUNTRY_DIAL_MAP` | ISO 3166-1 alpha-2 → 电话区号；用于将 PayPal `payload.details.countryCode` 转为 `internationalPhone.countryCode` |

**注意：前端 JS（`public/js/`）运行在浏览器，无法 `require()`**，前端的同类常量（`MERCHANT_NAME`、地址字段等）以 `var` 声明在 IIFE 顶部的常量块中，与服务端各自维护一份。

## 3. 环境变量

```
BRAINTREE_US_MERCHANT_ID
BRAINTREE_US_PUBLIC_KEY
BRAINTREE_US_PRIVATE_KEY
BRAINTREE_US_USD_MERCHANT_ACCOUNT_ID    # USD 商户账户（值：cwen）
BRAINTREE_US_EUR_MERCHANT_ACCOUNT_ID    # EUR 商户账户（值：cwenEUR）
```

`_config.js` 已实现 `getGateway(region = 'us')`，读 `BRAINTREE_US_*` 系列变量，dropin-ui 直接使用默认 region `'us'`。

## 4. GET handler

**（2026-06-12 修正）** dropin-ui 需要在 `clientToken.generate` 时传入 `merchantAccountId`（而非空选项），原因：Braintree 文档要求 merchantAccountId 与后续 transaction 一致，且此 ID 决定 3DS eligibility。

工厂通过可选回调 `clientTokenOptions(req)` 支持此需求：

```js
// _factory.js GET handler（新增一行）
const tokenOpts = clientTokenOptions ? clientTokenOptions(req) : {}
const { clientToken } = await gateway.clientToken.generate(tokenOpts)
```

`dropin-ui.js` 传入实现：

```js
module.exports = createBraintreeRoute({
  productKey: 'dropin-ui',
  view:       'braintree/server-sdk/dropin-ui',

  // dropin-ui 专属：用 currency 对应的 merchantAccountId 生成 clientToken
  clientTokenOptions: function (req) {
    var currency = req.query.currency || 'USD'
    var mid = currency === 'EUR'
      ? process.env.BRAINTREE_US_EUR_MERCHANT_ACCOUNT_ID
      : process.env.BRAINTREE_US_USD_MERCHANT_ACCOUNT_ID
    return mid ? { merchantAccountId: mid } : {}
  },

  buildTransaction: function (nonce, amount, extra) { ... },
})
```

res.render 传出的字段（工厂已内置）：

```
→ res.render('braintree/server-sdk/dropin-ui', {
    title, provider, sdkVersion, currentProductKey, currentSdkVersion,
    sidebarProducts, showSidebar,
    clientToken,                          // 含正确 merchantAccountId
    defaultAmount: req.query.amount  || '10.00',
    currency:      req.query.currency || 'USD',
  })
```

## 5. POST handler 与 `buildTransaction`

前端 POST body：

```json
{
  "nonce":       "...",
  "deviceData":  "...",
  "paymentType": "CreditCard | PayPalAccount | VenmoAccount | ApplePayCard | AndroidPayCard",
  "amount":      "10.00",
  "currency":    "USD"
}
```

工厂将 `nonce`、`amount` 直接提取，其余字段作为 `extra` 传给 `buildTransaction`。

### `buildTransaction(nonce, amount, extra)` 完整结构

```js
// const C = require('../../../config/bt-constants')

function buildTransaction(nonce, amount, extra) {
  var paymentType = extra.paymentType || ''
  var currency    = extra.currency    || 'USD'

  var params = {
    amount:             amount,
    paymentMethodNonce: nonce,
    deviceData:         extra.deviceData,
    merchantAccountId:
      currency === 'EUR'
        ? process.env.BRAINTREE_US_EUR_MERCHANT_ACCOUNT_ID
        : process.env.BRAINTREE_US_USD_MERCHANT_ACCOUNT_ID,
    orderId: 'DEMO-BT-' + Date.now(),
    customer: {
      firstName: C.BILLING_FIRST_NAME,
      lastName:  C.BILLING_LAST_NAME,
      email:     C.BILLING_EMAIL,
    },
    billing: {
      firstName:         C.BILLING_FIRST_NAME,
      lastName:          C.BILLING_LAST_NAME,
      streetAddress:     C.BILLING_STREET_ADDRESS,
      extendedAddress:   C.BILLING_EXTENDED_ADDRESS,
      locality:          C.BILLING_LOCALITY,
      region:            C.BILLING_REGION,
      postalCode:        C.BILLING_POSTAL_CODE,
      countryCodeAlpha2: C.BILLING_COUNTRY_CODE,
    },
    shipping: {
      firstName:         C.SHIPPING_FIRST_NAME,
      lastName:          C.SHIPPING_LAST_NAME,
      streetAddress:     C.SHIPPING_STREET_ADDRESS,
      extendedAddress:   C.SHIPPING_EXTENDED_ADDRESS,
      locality:          C.SHIPPING_LOCALITY,
      region:            C.SHIPPING_REGION,
      postalCode:        C.SHIPPING_POSTAL_CODE,
      countryCodeAlpha2: C.SHIPPING_COUNTRY_CODE,
      shippingMethod:    C.SHIPPING_METHOD,
    },
    lineItems: [{
      name:          C.LINE_ITEM_NAME,
      kind:          C.LINE_ITEM_KIND,           // 'debit'
      quantity:      C.LINE_ITEM_QUANTITY,       // '1'
      unitAmount:    amount,                     // 动态：= transaction amount
      totalAmount:   amount,                     // quantity(1) × unitAmount
      description:   C.LINE_ITEM_DESCRIPTION,
      productCode:   C.LINE_ITEM_PRODUCT_CODE,   // max 12 chars
      commodityCode: C.LINE_ITEM_COMMODITY_CODE, // UNSPSC
      unitOfMeasure: C.LINE_ITEM_UNIT_OF_MEASURE,
      url:           C.LINE_ITEM_URL,
    }],
    descriptor: {
      name:  C.DESCRIPTOR_NAME,
      phone: C.DESCRIPTOR_PHONE,
      url:   C.DESCRIPTOR_URL,
    },
    options: {
      submitForSettlement: true,
    },
  }

  // PayPal 专属
  if (paymentType === 'PayPalAccount') {
    params.options.paypal = {
      description: C.PAYPAL_DESC,
      customField: C.PAYPAL_FIELD,
    }
    // 用 payload.details 里的真实买家联系方式覆盖常量默认值
    if (extra.payerEmail) {
      params.customer.email = extra.payerEmail
    }
    if (extra.payerPhone) {
      var dialCode = C.COUNTRY_DIAL_MAP[extra.payerCountry] || '1'
      var intlPhone = { countryCode: dialCode, nationalNumber: extra.payerPhone }
      params.customer.internationalPhone = intlPhone
      params.shipping.internationalPhone = intlPhone
    }
  }

  // Venmo 专属：descriptor 只支持 name，max 22 chars
  if (paymentType === 'VenmoAccount') {
    params.descriptor = { name: 'DEMO*BT DROPIN' }
  }

  // CreditCard / ApplePayCard / AndroidPayCard：base 参数已足够

  return params
}
```

### paymentType 对应表

| Drop-in `payload.type` | 支付方式 | 专属参数 |
|---|---|---|
| `CreditCard` | 信用卡 | 无 |
| `PayPalAccount` | PayPal | `options.paypal` |
| `VenmoAccount` | Venmo | `descriptor`（name-only） |
| `ApplePayCard` | Apple Pay | 无 |
| `AndroidPayCard` | Google Pay | 无（Braintree 内部叫 AndroidPayCard） |

## 6. POST 响应

工厂从 `result.transaction` 提取字段返回，按支付方式追加具体信息：

```json
// 成功（result.success === true）— 通用字段
{
  "transactionId":         "abc123def",
  "status":                "submitted_for_settlement",
  "amount":                "10.00",
  "currencyIsoCode":       "USD",
  "orderId":               "DEMO-BT-1749734400000",
  "merchantAccountId":     "cwen",
  "paymentInstrumentType": "credit_card",
  "createdAt":             "2026-06-12T10:00:00.000Z",
  // 按支付方式追加（互斥，只出现其中一个）：
  "card": { "cardType": "Visa", "last4": "1111", "bin": "411111", "expirationDate": "12/2026" },
  "paypal": { "payerEmail": "buyer@example.com", "payerId": "...", "authorizationId": "..." },
  "venmo": { "username": "...", "venmoUserId": "..." },
  "applePay": { "cardType": "Visa", "last4": "...", "paymentInstrumentName": "..." },
  "googlePay": { "cardType": "Visa", "last4": "...", "sourceCardType": "...", "sourceCardLast4": "..." }
}

// 失败
{ "error": "..." }
```

| 字段 | 来源 | 说明 |
|------|------|------|
| `transactionId` | `tx.id` | Braintree transaction ID |
| `status` | `tx.status` | `submitted_for_settlement` / `authorized` 等 |
| `amount` | `tx.amount` | 实际扣款金额（字符串） |
| `currencyIsoCode` | `tx.currencyIsoCode` | 币种 |
| `orderId` | `tx.orderId` | 我们传的 `DEMO-BT-<timestamp>` |
| `merchantAccountId` | `tx.merchantAccountId` | 实际扣款账户（`cwen` / `cwenEUR`） |
| `paymentInstrumentType` | `tx.paymentInstrumentType` | `credit_card` / `paypal_account` / `venmo_account` 等 |
| `createdAt` | `tx.createdAt` | 交易创建时间 |
| `card` / `paypal` / ... | `tx.creditCard` 等 | 按 `paymentInstrumentType` 条件追加，字段不存在时不返回 |

前端收到 `error` 时调 `clearSelectedPaymentMethod()` 让用户重选支付方式。

## 7. merchantAccountId 选择原理（2026-06-12 修正）

**旧设计（已废弃）：** `generate({})` 生成 token，merchantAccountId 只在 transaction.sale 时决定。

**新设计（正确）：**

Braintree 3DS 文档要求：
> If using a non-default merchant account ID, specify `merchant_account_id` when generating the token. This ID **must match** the merchant account ID used to create the subsequent transaction or verification.

因此 dropin-ui 的 merchantAccountId 在两处都需要：

| 时机 | 用途 | 值来源 |
|------|------|--------|
| `clientToken.generate({ merchantAccountId })` | 决定 3DS eligibility + PayPal 显示 | `req.query.currency` → env var |
| `transaction.sale({ merchantAccountId })` | 实际扣款走正确账户 | `extra.currency` → env var |

**前端切换币种时需要页面 reload**（GET 重新拿新 clientToken），而不是 `updateConfiguration`。

## 8. 3DS 对后端的影响

Drop-in UI 的 3DS 完全在客户端处理（challenge iframe 由 Drop-in 管理），后端 `buildTransaction` **无需任何改动**。Drop-in 在 3DS 通过后返回的 nonce 已经过 3DS 认证，`transaction.sale` 正常提交即可。

## 9. 成功标准（后端）

- [ ] GET `?currency=USD` → 200，clientToken 由 USD merchantAccountId 生成
- [ ] GET `?currency=EUR` → 200，clientToken 由 EUR merchantAccountId 生成
- [ ] POST transaction USD nonce → `submitted_for_settlement`，日志含 `buildTransaction params` + `merchantAccountId: 'cwen'`
- [ ] POST transaction EUR nonce → 日志含 `merchantAccountId: 'cwenEUR'`
- [ ] `result.success === false` 时返回 400 + `{ error: ... }`
- [ ] PayPal 交易：日志含 `options.paypal.description`
- [ ] Venmo 交易：日志 `descriptor` 只有 `name` 字段
- [ ] 3DS 通过后的 nonce → transaction.sale 正常成功（后端无感知 3DS）
