# 后端设计 — JSSDK v6 ACDC

> 日期：2026-06-02 · 文件：`src/routes/paypal/jssdk-v6/acdc.js`（自定义路由）

## 1. 为什么是自定义路由（不能用 `_factory.js`）

v6 工厂 `createStandardRoute` 只产出两个端点（create-order + capture-order）且 `buildBody(amount, currency)` 只接收金额/币种。ACDC 需要：

- **第三个端点** `GET /api/acdc/order/:orderId`（3DS 决策要读 `authentication_result`）。
- create-order 还要接收 `scaMethod` / `cardholderName` / `billingAddress` 三个额外参数，并写入 `payment_source.card`。

因此 ACDC 与 v5 一样写**自定义路由文件**，结构直接移植 v5 `acdc.js`，仅做 v6 必要改动（orderId 小写 d、不注入 sdkUrl、注入 clientId/components）。

## 2. 账号与依赖

- 账号：**CN**（与 v5 ACDC 一致）。`getCNToken()` / `process.env.PAYPAL_CN_CLIENT_ID`。
- 复用 `config/paypal.js`（`getCNToken`, `API`, `getHeaders`）。
- 复用 `config/constants.js`：`DEFAULT_AMOUNT`, `DEFAULT_CURRENCY`, `SUPPORTED_CURRENCIES`, `validateAmount`, `buildOrderBody`, `ACDC_EXPERIENCE_CONTEXT`, `SANDBOX_BILLING`, `SANDBOX_BUYER`, `isZeroDecimal`。
- 复用 `config/products.js`：`getProduct`, `getProviderProducts`。

## 3. 路由清单

```
GET  /paypal/jssdk-v6/acdc                      → 渲染 views/paypal/jssdk-v6/acdc
POST /paypal/jssdk-v6/api/acdc/create-order     → 创建 order，返回 { orderId }
GET  /paypal/jssdk-v6/api/acdc/order/:orderId   → 返回完整 order JSON（3DS 决策）
POST /paypal/jssdk-v6/api/acdc/capture-order    → capture，返回完整 order JSON
```

挂载（`src/app.js`，v6 块内）：

```js
app.use(v6, require('./routes/paypal/jssdk-v6/acdc'))
```

## 4. GET handler（渲染）

与 v5 `acdc.js` 的 GET 基本相同，但遵守 v6 规则：

- **不传 `sdkUrl`**（规则 V6-5，header 不加载任何 SDK；v6 SDK 由 EJS `<script defer>` 自行加载）。
- **传 `clientId`**（`process.env.PAYPAL_CN_CLIENT_ID`，用于前端 `createInstance`）。
- 传 `supportedCurrencies`（EJS 货币下拉用，与 bcdc 一致）。
- 继续传 v5 已有的：`defaultAmount`、`currency`、`sandboxCardholderName`、`sandboxBilling`（`{ addressLine1, adminArea2, adminArea1, postalCode, countryCode }`）。

```js
res.render('paypal/jssdk-v6/acdc', {
  title: product?.displayName ?? 'ACDC',
  provider: 'paypal', sdkVersion: 'jssdk-v6',
  currentProductKey: 'acdc', currentSdkVersion: 'jssdk-v6',
  sidebarProducts: getProviderProducts('paypal'),
  showSidebar: true,
  clientId: process.env.PAYPAL_CN_CLIENT_ID,        // v6 新增
  supportedCurrencies: SUPPORTED_CURRENCIES,         // v6 货币下拉
  defaultAmount: req.query.amount || DEFAULT_AMOUNT,
  currency: resolveCurrency(req.query.currency),
  sandboxCardholderName: `${SANDBOX_BUYER.name.given_name} ${SANDBOX_BUYER.name.surname}`,
  sandboxBilling: {
    addressLine1: SANDBOX_BILLING.address_line_1,
    adminArea2:   SANDBOX_BILLING.admin_area_2,
    adminArea1:   SANDBOX_BILLING.admin_area_1,
    postalCode:   SANDBOX_BILLING.postal_code,
    countryCode:  SANDBOX_BILLING.country_code,
  },
})
// 注意：v6 不传 sdkUrl
```

## 5. POST create-order（参数与 body 与 v5 完全一致）

参数：`amount`, `currency`, `scaMethod`（白名单 `['SCA_WHEN_REQUIRED','SCA_ALWAYS']`，默认 `SCA_WHEN_REQUIRED`）, `cardholderName`, `billingAddress`（`{ addressLine1, addressLine2, adminArea1, adminArea2, postalCode, countryCode }` → 映射为 snake_case）。

order body（与 v5 一字不差，通过 `buildOrderBody` + `topLevel.payment_source.card`）：

```js
buildOrderBody(amount, {
  currency,
  topLevel: {
    payment_source: {
      card: {
        name:               cardholderName,
        billing_address:    billingAddress,            // snake_case 映射
        experience_context: ACDC_EXPERIENCE_CONTEXT,    // return_url / cancel_url
        attributes:         { verification: { method: scaMethod } },
      },
    },
  },
})
```

**唯一 v6 差异**：成功返回 `res.json({ orderId: order.id })`（小写 d，规则 V6-1）。v5 返回 `{ id }`。

校验失败 / PayPal 报错沿用 v5：金额校验 400；`!r.ok` 透传 `order.message` + `details`。

## 6. GET order/:orderId（3DS 决策数据源）

直接移植 v5 `GET /api/acdc/order/:orderID`，仅把路径参数改为小写 `:orderId`（规则 V6-1）：

```js
router.get('/api/acdc/order/:orderId', async (req, res) => {
  const token = await getCNToken()
  const r = await fetch(`${API}/v2/checkout/orders/${req.params.orderId}`, {
    method: 'GET', headers: getHeaders(token),
  })
  const data = await r.json()
  if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
  res.json(data)
})
```

返回整个 order，前端读 `payment_source.card.authentication_result.{ liability_shift, three_d_secure.enrollment_status, three_d_secure.authentication_status }`。

## 7. POST capture-order

移植 v5，仅参数名改小写 d：

```js
router.post('/api/acdc/capture-order', async (req, res) => {
  const { orderId } = req.body                 // v6: 小写 d
  if (!orderId) return res.status(400).json({ error: 'orderId required' })
  const token = await getCNToken()
  const r = await fetch(`${API}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST', headers: getHeaders(token),
  })
  const data = await r.json()
  if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
  res.json(data)                               // 返回完整 order，前端判 captures[0].status
})
```

## 8. Supabase 产品配置

新增一行（用户在 Supabase SQL Editor 执行，重启 demo-hub 生效）：

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('paypal', 'jssdk-v6', 'acdc', 'ACDC',
   'Advanced Credit/Debit Card — hosted card fields (v6)', true, <下一个可用 sort_order>);
```

> `sort_order` 取 v6 分组内当前最大值 +1（紧随 bcdc-ecs 之后即可）。

## 9. 不做的事（范围控制）

- 不动后端 REST API 调用方式（仍 `/v2/checkout/orders`）。
- 不引入 Vault（本 demo 是纯一次性付款；vault-acdc 是后续单独 demo）。
- 不改 `config/constants.js`（所有常量已存在并复用）。
</content>
