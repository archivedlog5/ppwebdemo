# 后端 + DB 设计 — Fastlane Flexible (fastlane-fp) · JSSDK v5

> 日期：2026-06-09
> 关联需求：`docs/req/2026-06-09-req-fastlane-fp.md`
> 关联前端设计：`docs/design/2026-06-09-design-fe-fastlane-fp.md`
> 参考实现：`fastlane-pui`（Quick Start）的 be 设计 `docs/design/2026-06-08-design-be-fastlane-pui.md`

---

## 1. 文件改动总览

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/config/paypal.js` | **无改动** | `getUSClientToken({ intent })` 已支持（pui 已加） |
| `src/routes/paypal/jssdk-v5/fastlane-fp.js` | **新增** | 自定义路由（GET 渲染 + POST create-order + GET return） |
| `src/views/paypal/jssdk-v5/fastlane-fp.ejs` | 新增 | 见前端设计 |
| `src/views/paypal/jssdk-v5/fastlane-fp-return.ejs` | 新增 | API 3DS return 结果页（服务端渲染） |
| `src/public/js/paypal/jssdk-v5/fastlane-fp.js` | 新增 | 见前端设计 |
| `src/app.js` | 修改 | 挂载路由（v5 区块，pui 之后追加一行） |
| Supabase `demohub.products` | 数据 | INSERT 一行（用户手动执行，见 §6） |
| `.env` / `.env.example` | 无新增 | 复用 `PAYPAL_US_*` |

不新增 env 变量：复用 `PAYPAL_US_CLIENT_ID` / `PAYPAL_US_CLIENT_SECRET` / `PAYPAL_US_MERCHANT_DOMAINS`。

---

## 2. 路由 fastlane-fp.js（自定义路由）

参考 `fastlane-pui.js`。`PROVIDER='paypal'`, `SDK='jssdk-v5'`, `KEY='fastlane-fp'`。

引入：`getUSToken`, `getUSClientToken`, `API`, `getHeaders`（config/paypal）；`getProduct`, `getProviderProducts`（config/products）；`C`（config/constants）；`mapShipping` 复用 pui 的映射逻辑（可直接在本文件内复制一份，遵守"不跨产品共用路由文件"规则 1）。

### 2.1 GET `/fastlane-fp`

```
- product   = getProduct('paypal','jssdk-v5','fastlane-fp')
- clientId  = process.env.PAYPAL_US_CLIENT_ID
- sdkClientToken = await getUSClientToken({ intent: 'sdk_init' })
- currency  = 'USD'（锁定，不读 query.currency）
- amount    = req.query.amount || C.DEFAULT_AMOUNT
- res.render('paypal/jssdk-v5/fastlane-fp', {
    title, provider, sdkVersion, currentProductKey, currentSdkVersion,
    sidebarProducts: getProviderProducts('paypal'), showSidebar: true,
    clientId,
    sdkClientToken,
    sdkUrl: `https://www.paypal.com/sdk/js?client-id=${clientId}`
          + `&components=fastlane,three-domain-secure&buyer-country=US&currency=USD`,
    defaultAmount: amount,
    currency,
  })
```

> **与 pui 唯一区别**：`components=fastlane,three-domain-secure`（ThreeDomainSecureClient 需要 `three-domain-secure`）。

### 2.2 POST `/api/fastlane-fp/create-order`

请求体：`{ paymentToken, shippingAddress?, billingAddress?, amount, threeDSFlow }`
- `threeDSFlow`：`'none'`（默认，不强制 3DS，直接下单）| `'jssdk'`（客户端已完成 3DS，nonce 替换后直接下单）| `'api'`（走 API 3DS，注入 verification + experience_context）。后端对 `none` 与 `jssdk` 行为完全一致，均不加 3DS 字段。
- `billingAddress`：Flexible 自建账单地址（camelCase）；guest/member-无卡时由前端
  `getPaymentToken({ billingAddress })` 已绑定到 token，本字段主要用于 inspect/日志，**不强依赖**。

```
- amount   = req.body.amount || C.DEFAULT_AMOUNT
- currency = 'USD'
- amountErr = C.validateAmount(amount, currency) → 400 if error
- 校验 paymentToken?.id 存在 → 400 if missing
- token = await getUSToken()                       // US 账户 access token
- threeDSFlow = req.body.threeDSFlow || 'none'
- // API flow 需在 return_url 中嵌入 sessionKey，让 return handler 反查 orderId
  // （PayPal card 3DS 回调不含 orderId，只有 state/code/liability_shift）
  sessionKey = (threeDSFlow === 'api') ? crypto.randomBytes(16).hex() : null
- body  = buildFastlaneOrderBody({ amount, paymentToken, shippingAddress,
            threeDSFlow, req, sessionKey })   // API flow 注入 verification + experience_context + return_url?session=<key>
- r = fetch(`${API}/v2/checkout/orders`, {
        method: 'POST',
        headers: getHeaders(token, { 'PayPal-Request-Id': Date.now().toString() }),
        body: JSON.stringify(body),
      })
- order = await r.json()
- 若 !r.ok → res.status(r.status).json({ error: order.message, details: order })
- // 存 sessionKey→orderId（PayPal 回调时无 orderId，靠此 Map 反查）
  if sessionKey && order.id:
    threeDSSessionStore.set(sessionKey, order.id)
    setTimeout(() => threeDSSessionStore.delete(sessionKey), 10 * 60 * 1000)  // 10分钟自动过期
- res.json(order)        // 返回完整 order；前端按 status 分支（见 §3）
```

### 2.3 GET `/fastlane-fp/return`（API 3DS 跳转回调，服务端 capture）

✅ **实测确认**：PayPal card 3DS 回调参数为 `?state=...&code=...&liability_shift=POSSIBLE`，**不含 orderId**（与标准 PayPal Buttons 的 `?token=` 行为不同）。

**解决方案**：create-order 时将 `sessionKey` 嵌入 `return_url`（`?session=<key>`），PayPal 原样保留该参数回传，return handler 从内存 Map `threeDSSessionStore` 中反查 orderId，取后即删（单次使用），10分钟未使用自动过期。

取消路径：`cancel_url` 设为 `...?fp_cancel=1`（PayPal 不附加额外参数）。

```
- log req.query（inspect/probe：确认实际回调参数）
- 若 query.fp_cancel 存在 → 渲染 return 页（cancelled 态）；return
- sessionKey = req.query.session
- orderId = threeDSSessionStore.get(sessionKey)   // 从内存 Map 反查
- threeDSSessionStore.delete(sessionKey)           // 单次使用，立即删除
- 若无 orderId → 渲染 return 页（error 态：session 过期或未找到）；return
- token = await getUSToken()
- 服务端 capture：
    r = fetch(`${API}/v2/checkout/orders/${orderId}/capture`, {
          method: 'POST',
          headers: getHeaders(token, { 'PayPal-Request-Id': Date.now().toString() }),
        })
    order = await r.json()
- 成功判定（规则 13）：capture = order.purchase_units[0].payments.captures[0]
    ok = capture && capture.status === 'COMPLETED'
- res.render('paypal/jssdk-v5/fastlane-fp-return', {
    title, provider, sdkVersion,
    sidebarProducts: getProviderProducts('paypal'), showSidebar: true,
    state: ok ? 'success' : 'error',
    captureId: ok ? capture.id : null,
    orderJson: JSON.stringify(order, null, 2),
    backUrl: '/paypal/jssdk-v5/fastlane-fp',
  })
```

> **D1 已知**：刷新 return 页会报 ORDER_ALREADY_CAPTURED（session 已删，找不到 orderId）——此为预期行为，demo 可接受。

---

## 3. Order body 组装（关键：两套 3DS 分支）

```js
// 伪代码（实现阶段由非 Opus 模型写）
function buildFastlaneOrderBody({ amount, paymentToken, shippingAddress, threeDSFlow, req }) {
  const value = parseFloat(amount).toFixed(2)   // USD，两位小数
  const pu = {
    amount: {
      currency_code: 'USD',
      value,
      breakdown: { item_total: { currency_code: 'USD', value } },
    },
    description: C.DEMO_DESCRIPTION,
    items: [{ ...C.DEMO_ITEM, unit_amount: { currency_code: 'USD', value } }],
  }
  const shipping = mapShipping(shippingAddress)
  if (shipping) pu.shipping = shipping

  // card payment_source —— JSSDK/none 与 API 共用 single_use_token
  const card = { single_use_token: paymentToken.id }

  // API 3DS：加 verification + experience_context（return/cancel url 由 req 拼 host）
  if (threeDSFlow === 'api') {
    const origin = `${req.protocol}://${req.get('host')}`
    card.attributes = { verification: { method: 'SCA_ALWAYS' } }       // ← inspect/probe 字段位置
    card.experience_context = {
      return_url: `${origin}/paypal/jssdk-v5/fastlane-fp/return?session=${sessionKey}`,  // sessionKey 由调用方传入
      cancel_url: `${origin}/paypal/jssdk-v5/fastlane-fp/return?fp_cancel=1`,
    }
  }

  return {
    intent: 'CAPTURE',
    payment_source: { card },
    purchase_units: [pu],
  }
}
```

### 3.1 两套 3DS 的后端行为差异

| flow | create-order body | PayPal 返回 | 后端/前端后续 |
|------|-------------------|-------------|----------------|
| **none** | `card.single_use_token`（不强制 3DS，PayPal 按需决定） | 直接含 `captures`（普通卡常见） | 前端按规则 13 内联判定 |
| **jssdk** | `card.single_use_token`（id 已由前端替换为 3DS nonce） | 直接含 `captures` | 前端按规则 13 内联判定 |
| **api** | `card.single_use_token` + `card.attributes.verification.method=SCA_ALWAYS` + `card.experience_context.return_url/cancel_url` | `status: PAYER_ACTION_REQUIRED` + `links[].rel='payer-action'` | 前端 `window.location.href = payer-action href` → return 页服务端 capture |

> 后端 `buildFastlaneOrderBody` 只对 `threeDSFlow === 'api'` 注入 3DS 字段；`none` 与 `jssdk` 行为完全相同——都是裸 `single_use_token`。前端三个分支是独立的业务路径，后端不需要区分 `none` 与 `jssdk`。

### 3.2 shippingAddress 映射（camelCase → snake_case）

与 `fastlane-pui` 完全一致，复用 `mapShipping(s)`：

```
shipping = {
  type: 'SHIPPING',
  name: { full_name: s.name.fullName },               // 若存在
  address: {
    address_line_1, address_line_2,
    admin_area_2 (city), admin_area_1 (state),
    postal_code, country_code,
  },
  phone_number: { country_code, national_number },     // 若 phoneNumber 完整
}
```

### 3.3 billingAddress 说明

Flexible 的账单地址通过前端 `cardComponent.getPaymentToken({ billingAddress })` 绑定到 single_use_token，
**不需要**在 order body 里单独再传 billing。后端收到 `billingAddress` 仅用于日志/inspect。
（若 inspect 发现 token 未携带 billing 导致 AVS/3DS 问题，再考虑在 `payment_source.card.billing_address`
补传——记入 debug-log，本设计默认不传。）

---

## 4. app.js 挂载

在 v5 区块（现有 `fastlane-pui` 之后）追加：

```js
app.use(v5, require("./routes/paypal/jssdk-v5/fastlane-fp"));
```

---

## 5. return 结果页（fastlane-fp-return.ejs）

服务端渲染的极简结果页，**不加载 Fastlane SDK**（纯展示）：

```
- include partials/header（title / sidebar）
- 三态：
    success → "✓ COMPLETED · Capture ID: <captureId>" 绿色 badge
    cancelled → "3DS 已取消 / 未完成" 提示
    error → "✗ Capture failed / missing order" 提示
- <pre> 展示 orderJson（完整 order，便于开发者核对）
- "← 返回 Fastlane Flexible Demo" 链接（backUrl）
- include partials/footer
```

样式复用 sandbox.css 现有类（`sandbox-page` / `sandbox-card` / `result-msg` 等），结果页专属
微调写在 EJS 内 `<style>`。

---

## 6. Supabase 数据（用户手动执行）

> 唯一约束 `UNIQUE(provider, sdk_version, product_key)`。`sort_order` 取 paypal/jssdk-v5 分组当前最大值 + 1。

### 6.1 一步到位 INSERT（自动取下一个 sort_order）

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
SELECT
  'paypal', 'jssdk-v5', 'fastlane-fp', 'Fastlane Flexible',
  'Fastlane Flexible — custom checkout with FastlaneCardComponent + own billing form + 3DS (JSSDK & API flows)',
  true,
  COALESCE(MAX(sort_order), 0) + 1
FROM demohub.products
WHERE provider = 'paypal' AND sdk_version = 'jssdk-v5';
```

### 6.2 重跑（如需重置）

```sql
DELETE FROM demohub.products
WHERE provider='paypal' AND sdk_version='jssdk-v5' AND product_key='fastlane-fp';
-- 然后重新执行 6.1
```

### 6.3 生效

插入后**重启 demo-hub**（启动时一次性读入内存 Map），首页即出现 fastlane-fp 卡片。

---

## 7. 环境变量

无新增 key。确认 `.env` 已配置（与 fastlane-pui 相同）：

```
PAYPAL_US_CLIENT_ID=...
PAYPAL_US_CLIENT_SECRET=...
PAYPAL_US_MERCHANT_DOMAINS=<已在 PayPal 后台为 Fastlane/ACDC 配置白名单的根域名>
```

> `PAYPAL_US_MERCHANT_DOMAINS` 须与 PayPal 开发者后台 Fastlane 域名白名单一致，否则 client token
> 无法用于该域名，Fastlane 组件初始化会失败。

---

## 8. 后端 inspect/probe 清单（实现/QA 阶段打印核对）

- create-order（jssdk/none）返回的完整 `order` → 确认是否直接含 `captures` 及路径。
- create-order（api）返回 → 确认 `status === 'PAYER_ACTION_REQUIRED'` 与 `links[].rel==='payer-action'` 的 href。
- return 路由收到的 `req.query` → ✅ 已确认：PayPal card 3DS 回调为 `state/code/liability_shift`，**无 orderId**；orderId 通过 `req.query.session` → `threeDSSessionStore` 反查。
- capture 返回 `order` → 确认 `purchase_units[0].payments.captures[0].status`。
- API 3DS order body：确认 `verification.method` 与 `experience_context` 在 `card` 下被 PayPal 接受
  （若报错，尝试 `payment_source.card.attributes.verification` 等替代位置）。
