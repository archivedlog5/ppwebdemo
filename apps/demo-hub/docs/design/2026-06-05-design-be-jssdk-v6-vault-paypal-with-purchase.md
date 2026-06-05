# 后端设计 — JSSDK v6 Vault PayPal with Purchase

> 日期：2026-06-05 · 文件：`src/routes/paypal/jssdk-v6/vault-paypal-with-purchase.js`（自定义路由）

## 1. 为什么是自定义路由（不用 `_factory.js`）

参考 v5 `vault-paypal-with-purchase.js`——它就是**自定义路由**。原因：capture 之后要从 capture 响应里提取 vault token 与 customer id 并回传前端（`{ ...data, vaultId, customerId }`）。v6 工厂 `createStandardRoute` 的 capture-order 只 `res.json(data)`（原样返回完整 order），不做 vault 字段提取。为与 v5 行为一致（用户确认"factory 是否 reuse 参考 v5"，v5 = 不用 factory），本 demo 写自定义路由文件，结构直接移植 v5，仅做 v6 必要改动。

> 注：本 demo 选定 **vault token 来源 = capture 响应**（不另开 `GET /order/:id`）。这与 v5 完全一致。

## 2. 账号与依赖

- 账号：**CN**（与 v5 一致）。`getCNToken()` / `process.env.PAYPAL_CN_CLIENT_ID`。
- 认证路径：**clientId**（集成文档明确："clientId is the standard path for saving to the vault"，仅 Fastlane 需 clientToken）。复用现有 `init.js` 的 clientId 流程，**无需**新增 browser-safe-client-token 端点。
- 复用 `config/paypal.js`（`getCNToken`, `API`, `getHeaders`）。
- 复用 `config/constants.js`：`validateAmount`, `isZeroDecimal`, `DEFAULT_AMOUNT`, `DEFAULT_CURRENCY`, `SUPPORTED_CURRENCIES`, `INTENT`, `DEMO_DESCRIPTION`, `DEMO_ITEM`, `SANDBOX_SHIPPING`（与 v5 同一组）。
- 复用 `config/products.js`：`getProduct`, `getProviderProducts`。

## 3. 路由清单

```
GET  /paypal/jssdk-v6/vault-paypal-with-purchase                    → 渲染 views/paypal/jssdk-v6/vault-paypal-with-purchase
POST /paypal/jssdk-v6/api/vault-paypal-with-purchase/create-order   → 创建 order（含 vault 属性），返回 { orderId }
POST /paypal/jssdk-v6/api/vault-paypal-with-purchase/capture-order  → capture，提取 vault，返回 { ...data, vaultId, customerId }
```

挂载（`src/app.js`，v6 块内）：

```js
app.use(v6, require('./routes/paypal/jssdk-v6/vault-paypal-with-purchase'))
```

## 4. GET handler（渲染）

与 v5 GET 基本一致，但遵守 v6 规则：

- **不传 `sdkUrl`**（规则 V6-5，header 不加载任何 SDK；v6 core 由 EJS `<script defer>` 自行加载）。
- **不传 `sdkUserIdToken`**（v5 走 vault=true + id_token 路径；v6 走 clientId + SDK 内部 vault flow，不需要前端 id_token）。
- **传 `clientId`**（`process.env.PAYPAL_CN_CLIENT_ID`，前端 `createInstance` 用）。
- 传 `supportedCurrencies`（EJS 货币下拉用，与其它 v6 demo 一致）。
- 继续传 v5 已有：`defaultAmount`、`currency`。

```js
res.render('paypal/jssdk-v6/vault-paypal-with-purchase', {
  title: product?.displayName ?? 'Vault PayPal with Purchase',
  provider: 'paypal', sdkVersion: 'jssdk-v6',
  currentProductKey: 'vault-paypal-with-purchase', currentSdkVersion: 'jssdk-v6',
  sidebarProducts: getProviderProducts('paypal'),
  showSidebar: true,
  clientId: process.env.PAYPAL_CN_CLIENT_ID,        // v6 新增
  supportedCurrencies: SUPPORTED_CURRENCIES,         // v6 货币下拉
  defaultAmount: req.query.amount || DEFAULT_AMOUNT,
  currency: resolveCurrency(req.query.currency),
})
// 注意：v6 不传 sdkUrl，也不传 sdkUserIdToken
```

## 5. POST create-order（body 与 v5 **完全一致**）

参数：`amount`, `currency`（与 v5 同）。金额校验、零小数位处理同 v5。

order body 一字不差移植 v5（含 vault 属性，inline 而非常量）：

```js
const body = {
  intent: INTENT.CAPTURE,
  payment_source: {
    paypal: {
      attributes: {
        vault: {
          store_in_vault: 'ON_SUCCESS',
          usage_type: 'MERCHANT',
          customer_type: 'CONSUMER',
          permit_multiple_payment_tokens: false,
          description: 'After Purchase Your Payment Method Will Be Saved to Cross Wen China Store',
        },
        customer: { merchant_customer_id: 'MERCHANT_CUST_001' },
      },
      experience_context: {
        brand_name: 'Cross Wen China Store',
        shipping_preference: 'SET_PROVIDED_ADDRESS',
        return_url: `${baseUrl}/paypal/jssdk-v6/vault-paypal-with-purchase`,
        cancel_url: `${baseUrl}/paypal/jssdk-v6/vault-paypal-with-purchase`,
      },
    },
  },
  purchase_units: [
    {
      amount: {
        currency_code: currency,
        value: val,
        breakdown: { item_total: { currency_code: currency, value: val } },
      },
      description: DEMO_DESCRIPTION,
      items: [{ ...DEMO_ITEM, unit_amount: { currency_code: currency, value: val } }],
      shipping: SANDBOX_SHIPPING,
    },
  ],
}
```

**v6 差异（仅两处）**：
1. `return_url` / `cancel_url` 指向 v6 路径（`/paypal/jssdk-v6/...`）。
2. 成功返回 `res.json({ orderId: order.id })`（小写 d，规则 V6-1）。v5 返回 `{ id }`。

校验失败 / PayPal 报错沿用 v5：金额校验 400；`!r.ok` 透传 `order.message` + `details`。

## 6. POST capture-order（提取 vault，与 v5 一致）

移植 v5，仅参数名改小写 d：

```js
router.post('/api/vault-paypal-with-purchase/capture-order', async (req, res) => {
  const { orderId } = req.body                   // v6: 小写 d
  if (!orderId) return res.status(400).json({ error: 'orderId required' })
  const token = await getCNToken()
  const r = await fetch(`${API}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST', headers: getHeaders(token),
  })
  const data = await r.json()
  if (!r.ok) return res.status(r.status).json({ error: data.message || 'Capture failed', details: data })

  const vaultInfo = data?.payment_source?.paypal?.attributes?.vault
  const vaultId = vaultInfo?.id || null
  const customerId = vaultInfo?.customer?.id || null
  res.json({ ...data, vaultId, customerId })     // 与 v5 完全一致
})
```

> 前端既可读顶层 `vaultId`/`customerId`，也可读完整 order 判 `captures[0].status === 'COMPLETED'`（规则 13）。

## 7. Supabase 产品配置

新增一行（用户在 Supabase SQL Editor 执行，重启 demo-hub 生效）：

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('paypal', 'jssdk-v6', 'vault-paypal-with-purchase', 'Vault PayPal with Purchase',
   'Vault the PayPal account during a one-time purchase (v6)', true, <下一个可用 sort_order>);
```

> `sort_order` 取 v6 分组内当前最大值 +1。

## 8. 不做的事（范围控制）

- 不新增 `GET /order/:id` 端点（vault token 从 capture 响应取，与 v5 一致）。
- 不新增 browser-safe-client-token 端点（用 clientId 路径）。
- 不引入 PayLater / Credit 按钮（仅 PayPal）。
- 不改 `config/constants.js`（vault 相关串 inline 在路由内，与 v5 做法一致）。
- 不引入 vault-return / 复用已存 token 的展示（本 demo 只覆盖"购买中入会"）。
