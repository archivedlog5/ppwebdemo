# 后端设计 — JSSDK v6 Vault ACDC Setup-Only

> 日期：2026-06-05 · 文件：`src/routes/paypal/jssdk-v6/vault-acdc-setup-only.js`（自定义路由）
>
> 模型：v6 Card Fields **Save Payment Session** + Vault v3 两步 token。UI/行为参考 v5 同名 demo；card-fields 渲染参考 v6 `acdc`。

## 1. 为什么是自定义路由（不用 `_factory.js`）

本 demo 是**用卡签约 Vault、无购买**（zero-dollar）。完全不碰 Orders API（`/v2/checkout/orders`），用 **Vault v3 API 的两步**：

1. `POST /v3/vault/setup-tokens` —— 创建 setup token（空/卡 payment_source，临时）
2. `POST /v3/vault/payment-tokens` —— 用 setup token 换 payment token（永久，存库用）

`_factory.js` 工厂函数围绕 Orders API 设计，`buildBody` 必填且产出 order body，与本模型不符。故写**自定义路由**，结构直接移植 v5 同名 demo（`routes/paypal/jssdk-v5/vault-acdc-setup-only.js`），仅做 v6 必要改动。

## 2. 账号与认证

- 账号：**CN**（与 v5 一致）。`getCNToken()` / `process.env.PAYPAL_CN_CLIENT_ID`。
- 认证路径：**clientId**（复用 `init.js` 的 `getPPInstance()`，与 v6 acdc / vault-paypal-setup-only 一致）。**不新增** browser-safe-client-token 端点。
  - 背景：官方 v6 save-payment 文档/sample 用 `getBrowserSafeClientId()`（仍是 clientId，非 clientToken），与本仓库做法一致。
  - 风险兜底：若实测 `createCardFieldsSavePaymentSession` 在 clientId 下不可用，再切 clientToken 路径，记 `docs/debug-log.md`。
- 复用 `config/paypal.js`（`getCNToken`, `API`, `getHeaders`）。
- 复用 `config/products.js`（`getProduct`, `getProviderProducts`）。
- 复用 `config/constants.js` 的 `SANDBOX_BUYER` / `SANDBOX_BILLING`（与 v5 一致，用于预填 cardholder name + billing address）。**不依赖**金额/币种常量（zero-dollar）。

## 3. 路由清单（端点名逐字沿用 v5）

```
GET  /paypal/jssdk-v6/vault-acdc-setup-only                          → 渲染 views/paypal/jssdk-v6/vault-acdc-setup-only
POST /paypal/jssdk-v6/api/vault-acdc-setup-only/create-setup-token   → POST /v3/vault/setup-tokens，返回 { setupTokenId }
GET  /paypal/jssdk-v6/api/vault-acdc-setup-only/setup-token/:id      → GET  /v3/vault/setup-tokens/:id，返回原始 setup token（3DS 严格门用）
POST /paypal/jssdk-v6/api/vault-acdc-setup-only/confirm-setup-token  → POST /v3/vault/payment-tokens，返回 { paymentTokenId, customerId }
```

> 三端点与 v5 `vault-acdc-setup-only` **完全对齐**（v5 也有 GET setup-token，用于 3DS 严格门）。这是与 v6 `vault-paypal-setup-only`（只有 2 端点）的关键区别——卡的 3DS 决策需要 GET 回原始 token 读 `verification_status`。

挂载（`src/app.js`，v6 块内，紧跟 `vault-paypal-setup-only`）：

```js
app.use(v6, require('./routes/paypal/jssdk-v6/vault-acdc-setup-only'))
```

## 4. GET handler（渲染）

与 v5 GET 相比的 v6 适配：

- **不传 `sdkUrl`**（规则 V6-5，header 不加载 SDK；v6 core 由 EJS `<script defer>` 加载）。
- **传 `clientId`**（`process.env.PAYPAL_CN_CLIENT_ID`，前端 `createInstance` 用）。
- **传 `sandboxCardholderName` + `sandboxBilling`**（搬 v5，用于卡名预填 + submit/创建 token 的 billing address）。
- **不传** `supportedCurrencies` / `defaultAmount` / `currency`（无货币/金额选择器，zero-dollar）。

```js
res.render('paypal/jssdk-v6/vault-acdc-setup-only', {
  title: product?.displayName ?? 'ACDC Vault Setup',
  provider: 'paypal', sdkVersion: 'jssdk-v6',
  currentProductKey: 'vault-acdc-setup-only', currentSdkVersion: 'jssdk-v6',
  sidebarProducts: getProviderProducts('paypal'),
  showSidebar: true,
  clientId: process.env.PAYPAL_CN_CLIENT_ID,            // v6 新增
  sandboxCardholderName: `${SANDBOX_BUYER.name.given_name} ${SANDBOX_BUYER.name.surname}`,
  sandboxBilling: {
    addressLine1: SANDBOX_BILLING.address_line_1,
    adminArea2:   SANDBOX_BILLING.admin_area_2,
    adminArea1:   SANDBOX_BILLING.admin_area_1,
    postalCode:   SANDBOX_BILLING.postal_code,
    countryCode:  SANDBOX_BILLING.country_code,
  },
})
// 注意：不传 sdkUrl、不传 currency/amount
```

## 5. POST create-setup-token（body 与 v5 **逐字一致**）

> 用户明确："create setup payment 参数和 v5 vault-acdc-setup-only 一样"。

`POST /v3/vault/setup-tokens`，header 加 `PayPal-Request-Id: acdc-setup-${Date.now()}`。SCA 从 `req.body.scaMethod` 取（白名单 `SCA_WHEN_REQUIRED` / `SCA_ALWAYS`，默认 `SCA_WHEN_REQUIRED`）。body 移植 v5（inline）：

```js
const scaMethod = ['SCA_WHEN_REQUIRED','SCA_ALWAYS'].includes(req.body.scaMethod)
  ? req.body.scaMethod : 'SCA_WHEN_REQUIRED'
const baseUrl   = `${req.protocol}://${req.get('host')}`
const returnUrl = `${baseUrl}/paypal/jssdk-v6/vault-acdc-setup-only`   // v6 路径
const cancelUrl = `${baseUrl}/paypal/jssdk-v6/vault-acdc-setup-only`   // v6 路径
const body = {
  customer: {
    merchant_customer_id: 'CUST_' + randomBytes(6).toString('hex').toUpperCase(),
  },
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
}
```

**v6 唯一差异**：`return_url` / `cancel_url` 指向 v6 路径。其余（随机 `CUST_` merchant_customer_id、`billing_address`、`verification_method` 直挂 `card` 下）与 v5 逐字一致。

返回：`res.json({ setupTokenId: data.id })`。错误处理沿用 v5：`!r.ok` → `res.status(r.status).json({ error: data.message, details: data })`；`try/catch` → 500。

## 6. GET setup-token/:id（3DS 严格门用）

`GET /v3/vault/setup-tokens/:setupTokenId`，原样返回 setup token，供前端读 `status` + `payment_source.card.verification_status`：

```js
const r = await fetch(`${API}/v3/vault/setup-tokens/${req.params.setupTokenId}`, {
  method: 'GET', headers: getHeaders(token),
})
const data = await r.json()
if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
res.json(data)
```

> 与 v5 GET setup-token 一致。**仅在前端 `liabilityShift` 非 `YES`/`POSSIBLE` 时才会调用**（见 fe 设计 §3 严格门）。

## 7. POST confirm-setup-token（setup token → payment token）

`POST /v3/vault/payment-tokens`，header 加 `PayPal-Request-Id: acdc-confirm-${Date.now()}`：

```js
const { setupTokenId } = req.body
if (!setupTokenId) return res.status(400).json({ error: 'setupTokenId required' })
const r = await fetch(`${API}/v3/vault/payment-tokens`, {
  method: 'POST',
  headers: getHeaders(token, { 'PayPal-Request-Id': `acdc-confirm-${Date.now()}` }),
  body: JSON.stringify({
    payment_source: { token: { id: setupTokenId, type: 'SETUP_TOKEN' } },
  }),
})
const data = await r.json()
if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
const customerId = data.customer?.id || null
res.json({ paymentTokenId: data.id, customerId, data })
```

> 与 v5 confirm 逐字一致。前端在 `succeeded` 经严格门后调用，body key 用 **`setupTokenId`**（前端 `data.vaultSetupToken` 的值）。

## 8. Supabase 产品配置

新增一行（用户在 Supabase SQL Editor 执行，重启 demo-hub 生效）：

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('paypal', 'jssdk-v6', 'vault-acdc-setup-only', 'Vault ACDC Setup Only',
   'Save a card with no purchase — setup token → payment token, Card Fields (v6)', true, <下一个可用 sort_order>);
```

> `sort_order` 取 v6 分组内当前最大值 +1（建议紧跟 `vault-paypal-setup-only`）。

## 9. 不做的事（范围控制）

- 不新增 browser-safe-client-token 端点（用 clientId，与 v6 acdc 一致）。
- 不引入货币/金额选择器（zero-dollar；保留 3DS 选择器）。
- 不碰 Orders API。
- 不把 payment token 落库（demo 仅展示；生产应存库且不回传浏览器）。
- 不改 `config/constants.js`（vault 串 inline 在路由内，与 v5 做法一致）。
