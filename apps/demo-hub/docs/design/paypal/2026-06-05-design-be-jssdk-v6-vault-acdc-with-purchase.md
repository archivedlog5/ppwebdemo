# 后端设计 — JSSDK v6 Vault ACDC with Purchase

> 日期：2026-06-05 · 文件：`src/routes/paypal/jssdk-v6/vault-acdc-with-purchase.js`（自定义路由）
>
> 模型：v6 Card Fields **One-Time Payment Session** + Orders v2 API（create → submit → capture），capture 时按 `store_in_vault: ON_SUCCESS` 存卡。create-order body 与 v5 同名 demo **逐字一致**，仅 `orderId` 小写 d。

## 1. 为什么是自定义路由（不用 `_factory.js`）

`_factory.js` 的 `createStandardRoute` / `buildBody` 围绕「标准 Buttons 付款」设计，本 demo 需要：

- `payment_source.card`（名字 / billing / experience_context / attributes.verification / 条件性 vault 属性）——非标准 body。
- 条件分支：`saveVault` 为 true 才追加 vault 属性。
- capture 响应提取 vault 字段为顶层。
- 额外 GET order 端点（3DS 兜底）。

与 v5 `vault-acdc-with-purchase.js` 一致，写**自定义路由**，结构直接移植 v5，仅做 v6 必要改动（`orderId` 小写 d、render 传 `clientId` 不传 `sdkUrl`）。

## 2. 账号与认证

- 账号：**CN**（与 v5 一致）。`getCNToken()` / `process.env.PAYPAL_CN_CLIENT_ID`。
- 认证路径：**clientId**（复用 `init.js` 的 `getPPInstance()`，与 v6 acdc / vault-acdc-setup-only 一致）。不新增 browser-safe-client-token 端点。
- 复用 `config/paypal.js`（`getCNToken`, `API`, `getHeaders`）。
- 复用 `config/products.js`（`getProduct`, `getProviderProducts`）。
- 复用 `config/constants.js`：`buildOrderBody`, `DEFAULT_AMOUNT`, `DEFAULT_CURRENCY`, `SUPPORTED_CURRENCIES`, `validateAmount`, `ACDC_EXPERIENCE_CONTEXT`, `SANDBOX_BILLING`, `SANDBOX_BUYER`（与 v5 同款引入）。
- `randomBytes`（`crypto`）生成 `merchant_customer_id`。

## 3. 路由清单（端点名逐字沿用 v5，仅 :orderID → :orderId）

```
GET  /paypal/jssdk-v6/vault-acdc-with-purchase                       → 渲染 views/paypal/jssdk-v6/vault-acdc-with-purchase
POST /paypal/jssdk-v6/api/vault-acdc-with-purchase/create-order      → POST /v2/checkout/orders，返回 { orderId }
GET  /paypal/jssdk-v6/api/vault-acdc-with-purchase/order/:orderId    → GET  /v2/checkout/orders/:orderId（3DS 兜底）
POST /paypal/jssdk-v6/api/vault-acdc-with-purchase/capture-order     → POST /v2/checkout/orders/:id/capture，返回 { ...data, vaultId, customerId }
```

> 与 v5 三端点一一对应；唯一字面差异：v6 全链路用 `orderId`（小写 d），含 GET 路由参数 `:orderId`、create 返回字段、capture 入参（规则 V6-1）。

挂载（`src/app.js`，v6 块内，紧跟 `vault-acdc-setup-only`）：

```js
app.use(v6, require('./routes/paypal/jssdk-v6/vault-acdc-with-purchase'))
```

## 4. GET handler（渲染）

与 v5 GET 相比的 v6 适配：

- **不传 `sdkUrl`**（规则 V6-5；v6 core 由 EJS `<script defer>` 加载）。
- **传 `clientId`**（`process.env.PAYPAL_CN_CLIENT_ID`，前端 `createInstance` 用）。
- 其余照搬 v5：`currency`（`resolveCurrency(req.query.currency)`）、`defaultAmount`（`req.query.amount || DEFAULT_AMOUNT`）、`sandboxCardholderName`、`sandboxBilling`、`supportedCurrencies`（前端 currency 下拉需要，参考 v6 acdc 也传了）。

```js
const PROVIDER = 'paypal', SDK = 'jssdk-v6', KEY = 'vault-acdc-with-purchase'
function resolveCurrency(v) { return SUPPORTED_CURRENCIES.includes(v) ? v : DEFAULT_CURRENCY }

router.get(`/${KEY}`, (req, res) => {
  const product = getProduct(PROVIDER, SDK, KEY)
  res.render(`paypal/jssdk-v6/${KEY}`, {
    title: product?.displayName ?? 'ACDC Vault with Purchase',
    provider: PROVIDER, sdkVersion: SDK,
    currentProductKey: KEY, currentSdkVersion: SDK,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    clientId: process.env.PAYPAL_CN_CLIENT_ID,        // v6 新增
    supportedCurrencies: SUPPORTED_CURRENCIES,
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
})
// 注意：不传 sdkUrl
```

## 5. POST create-order（body 与 v5 **逐字一致**）

> 用户明确："create order 参数和 v5 vault-acdc-with-purchase 一样"。

逻辑搬 v5：读 `amount` / `currency` / `scaMethod`（白名单，默认 `SCA_WHEN_REQUIRED`）/ `cardholderName` / `saveVault`（`=== true`）/ `billingAddress`（camelCase → snake_case）。校验金额。组装 `payment_source.card`，**仅当 `saveVault` 为 true** 才追加 `vault` + `customer` 属性：

```js
const SCA_METHODS = ['SCA_WHEN_REQUIRED', 'SCA_ALWAYS']

router.post(`/api/${KEY}/create-order`, async (req, res) => {
  try {
    const amount    = req.body.amount || DEFAULT_AMOUNT
    const currency  = resolveCurrency(req.body.currency)
    const scaMethod = SCA_METHODS.includes(req.body.scaMethod) ? req.body.scaMethod : 'SCA_WHEN_REQUIRED'
    const cardholderName = req.body.cardholderName || ''
    const saveVault = req.body.saveVault === true
    const ba = req.body.billingAddress || {}
    const billingAddress = {
      address_line_1: ba.addressLine1 || '',
      address_line_2: ba.addressLine2 || '',
      admin_area_1:   ba.adminArea1   || '',
      admin_area_2:   ba.adminArea2   || '',
      postal_code:    ba.postalCode   || '',
      country_code:   ba.countryCode  || '',
    }

    const amountErr = validateAmount(amount, currency)
    if (amountErr) return res.status(400).json({ error: amountErr })

    const cardAttributes = { verification: { method: scaMethod } }
    const topLevel = {
      payment_source: {
        card: {
          name: cardholderName,
          billing_address: billingAddress,
          experience_context: ACDC_EXPERIENCE_CONTEXT,
          attributes: cardAttributes,
        },
      },
    }
    if (saveVault) {
      cardAttributes.vault = { store_in_vault: 'ON_SUCCESS' }
      cardAttributes.customer = {
        merchant_customer_id: 'CUST_' + randomBytes(6).toString('hex').toUpperCase(),
      }
    }

    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(buildOrderBody(amount, { currency, topLevel })),
    })
    const order = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: order.message, details: order })
    res.json({ orderId: order.id })   // v6: 小写 d（规则 V6-1）
  } catch (err) {
    console.error(`[${KEY}] create-order error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})
```

**v6 唯一差异**：返回 `{ orderId: order.id }`（v5 是 `{ id: order.id }`）。body 结构（`buildOrderBody` + `topLevel.payment_source.card` + 条件 vault 属性）与 v5 逐字一致。

## 6. GET order/:orderId（3DS 兜底用）

`GET /v2/checkout/orders/:orderId`，原样返回 order，供前端读 `payment_source.card.authentication_result`：

```js
router.get(`/api/${KEY}/order/:orderId`, async (req, res) => {
  try {
    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${req.params.orderId}`, {
      method: 'GET', headers: getHeaders(token),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
    res.json(data)
  } catch (err) {
    console.error(`[${KEY}] get-order error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})
```

> 与 v5 GET order 一致，仅参数名 `:orderID` → `:orderId`。**仅在前端 `liabilityShift` 非 `undefined`/`POSSIBLE` 时才会调用**（镜像 v5，happy path 走免挑战，几乎不触发）。

## 7. POST capture-order（提取 vault 字段为顶层）

`POST /v2/checkout/orders/:id/capture`，capture 后从响应提取 vault 信息：

```js
router.post(`/api/${KEY}/capture-order`, async (req, res) => {
  try {
    const { orderId } = req.body                       // v6: 小写 d
    if (!orderId) return res.status(400).json({ error: 'orderId required' })
    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST', headers: getHeaders(token),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })

    const vaultInfo  = data?.payment_source?.card?.attributes?.vault || null
    const vaultId    = vaultInfo?.id || null
    const customerId = vaultInfo?.customer?.id || null
    res.json({ ...data, vaultId, customerId })
  } catch (err) {
    console.error(`[${KEY}] capture-order error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})
```

> 与 v5 capture 逐字一致，仅入参 `orderID` → `orderId`。vault 提取路径 `payment_source.card.attributes.vault.{id, customer.id}` 与集成文档「Authorize or capture」响应示例一致（`status: VAULTED`）。capture **成功判定**仍由前端按规则 13 检查 `captures[0].status === 'COMPLETED'`。

## 8. Supabase 产品配置

新增一行（用户在 Supabase SQL Editor 执行，重启 demo-hub 生效）：

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('paypal', 'jssdk-v6', 'vault-acdc-with-purchase', 'Vault ACDC with Purchase',
   'Pay with a card and save it to the vault on success — Card Fields (v6)', true, <下一个可用 sort_order>);
```

> `sort_order` 取 v6 分组内当前最大值 +1（建议紧跟 `vault-acdc-setup-only`）。

## 9. 不做的事（范围控制）

- 不开放 SCA_ALWAYS（前端 3DS 下拉禁用，镜像 v5）。
- 不新增 browser-safe-client-token 端点（用 clientId）。
- 不订阅 vault webhook（`APPROVED` 异步保存场景不在范围；`ON_SUCCESS` 同步返回 `VAULTED`）。
- 不把 vault token 落库（demo 仅展示）。
- 不改 `config/constants.js`（vault 串 inline，与 v5 一致）。
