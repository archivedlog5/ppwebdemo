# CLAUDE.md Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `apps/demo-hub/CLAUDE.md` from 587 lines to ~230 lines by extracting v5-specific rules and reference guides into focused files, with symlinks ensuring all three code directories (routes/public/js/views) load the same v5 rules automatically.

**Architecture:** General rules stay in `apps/demo-hub/CLAUDE.md` (loaded from all paths). JSSDK v5–specific rules move to `src/routes/paypal/jssdk-v5/CLAUDE.md` (single source of truth); symlinks in `public/js/paypal/jssdk-v5/` and `views/paypal/jssdk-v5/` point to it. The 175-line new-product guide moves to `docs/guides/add-product.md`. Four stub files are created for future providers/SDKs.

**Tech Stack:** Markdown files, filesystem symlinks (`ln -s`), no code changes.

---

## File Structure

| Operation | Path | Note |
|-----------|------|------|
| Shrink | `apps/demo-hub/CLAUDE.md` | 587 → ~230 lines |
| Create (real) | `apps/demo-hub/docs/guides/add-product.md` | 175 lines moved from CLAUDE.md |
| Create (real) | `apps/demo-hub/src/routes/paypal/jssdk-v5/CLAUDE.md` | v5 rules moved from CLAUDE.md |
| Create (symlink) | `apps/demo-hub/src/public/js/paypal/jssdk-v5/CLAUDE.md` | → routes/.../jssdk-v5/CLAUDE.md |
| Create (symlink) | `apps/demo-hub/src/views/paypal/jssdk-v5/CLAUDE.md` | → routes/.../jssdk-v5/CLAUDE.md |
| Create (stub) | `apps/demo-hub/src/routes/paypal/jssdk-v6/CLAUDE.md` | placeholder |
| Create (stub) | `apps/demo-hub/src/routes/braintree/CLAUDE.md` | placeholder |
| Create (stub) | `apps/demo-hub/src/routes/stripe/CLAUDE.md` | placeholder |
| Create (stub) | `apps/demo-hub/src/routes/adyen/CLAUDE.md` | placeholder |

---

## Task 1: Create `docs/guides/add-product.md`

**Files:**
- Create: `apps/demo-hub/docs/guides/add-product.md`

- [ ] **Step 1: Create the guides directory and file**

```bash
mkdir -p apps/demo-hub/docs/guides
```

- [ ] **Step 2: Write `docs/guides/add-product.md`**

Copy verbatim from `apps/demo-hub/CLAUDE.md` lines 383–557 (section "## 新增支付产品 Demo 完整步骤" through "打开 http://localhost:3000..."). Add a header and back-link:

```markdown
# 新增支付产品 Demo 完整步骤

> 通用规则见 `apps/demo-hub/CLAUDE.md`。本文件只包含步骤指南。

## 1. 创建路由文件

**`buildBody` 模式（推荐，所有 API 参数在一个文件）：**
\`\`\`js
// src/routes/<provider>/<sdk>/<product>.js
const { createStandardRoute } = require('./_factory')
const C = require('../../../config/constants')  // 整个引入

module.exports = createStandardRoute({
  productKey: '<product>',
  sdkParams:  'components=buttons',
  view:       '<provider>/<sdk>/<product>',

  buildBody: function (amount, currency) {
    return {
      intent: C.INTENT.CAPTURE,
      purchase_units: [{
        amount: { currency_code: currency, value: amount, breakdown: { item_total: { currency_code: currency, value: amount } } },
        description: C.DEMO_DESCRIPTION,
        items: [{ ...C.DEMO_ITEM, unit_amount: { currency_code: currency, value: amount } }],
        shipping: C.SANDBOX_SHIPPING,
      }]
    }
  },
})
\`\`\`

**所有工厂路由产品必须使用 `buildBody`。**

**Vault with-purchase：**

`vault-paypal-with-purchase` 已改为完整自定义路由（GET 获取 id_token → 注入 `data-user-id-token`；`payment_source` 在顶层；capture 返回 `vaultId` + `customerId`）。

其余 vault-with-purchase 可用工厂：
\`\`\`js
const { createVaultWithPurchaseRoute } = require('./_factory')
module.exports = createVaultWithPurchaseRoute({
  productKey: 'vault-acdc-with-purchase',
  sdkParams:  'components=card-fields&vault=true',
  view:       'paypal/jssdk-v5/vault-acdc-with-purchase',
  paymentSource: { card: { attributes: { vault: { store_in_vault: 'ON_SUCCESS' } } } }
})
\`\`\`

**自定义路由**（CardFields、双SDK、Google Pay、Vault Setup-only、Return Buyer）：参考 `acdc.js`、`buttons.js`、`googlepay-ecm.js`、`vault-paypal-setup-only.js`、`vault-return.js`。

## 2. 创建（或复用）静态 JS 文件

先看是否能复用已有 JS 文件（参考 `apps/demo-hub/CLAUDE.md` 中的 EJS/JS 分离模式对应关系表）。

**如需新建 JS 文件**（`src/public/js/<provider>/<sdk>/<product>.js`）：
\`\`\`js
;(function () {
  'use strict'

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  window.addEventListener('load', function () {
    if (typeof paypalSDK === 'undefined') {
      showResult('✗ PayPal SDK failed to load', 'error'); return
    }
    var container = document.getElementById('paypal-button-container')
    container.classList.remove('sdk-loading')
    container.innerHTML = ''

    var urls = window.DEMO && window.DEMO.urls

    paypalSDK.Buttons({
      createOrder: function () {
        return fetch(urls.createOrder, { method: 'POST' })
          .then(function (r) { return r.json() }).then(function (d) { return d.id })
      },
      onApprove: function (data) {
        return fetch(urls.captureOrder, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderID: data.orderID })
        }).then(function (r) { return r.json() }).then(function (o) {
          showResult('✓ Captured: ' + o.id, 'success')
        })
      },
      onError: function (e) { showResult('✗ ' + (e.message || String(e)), 'error') }
    }).render('#paypal-button-container')
  })
})()
\`\`\`

## 3. 创建 EJS 视图

在 `src/views/<provider>/<sdk>/<product>.ejs` 创建（**只写 HTML + window.DEMO 注入**）：
\`\`\`ejs
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar, sdkUrl
}) %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-paypal">PayPal · JSSDK v5</span>
    <h1><%= title %></h1>
    <p>产品描述</p>
  </div>
  <div class="sandbox-card">
    <div class="amount-display">
      <div class="amount-label">Test Amount</div>
      <div class="amount-value">$1.00</div>
      <span class="sandbox-mode-badge">⚡ Sandbox Mode</span>
    </div>
    <div id="paypal-button-container" class="sdk-loading">
      <div class="sdk-spinner"></div>
      <span>Loading PayPal...</span>
    </div>
    <div class="result-msg" id="result" role="alert" aria-live="polite"></div>
  </div>
</div>

<script>
  window.DEMO = {
    urls: {
      createOrder:  '/paypal/jssdk-v5/api/<product>/create-order',
      captureOrder: '/paypal/jssdk-v5/api/<product>/capture-order',
    }
  }
</script>
<script src="/js/paypal/jssdk-v5/<product-or-shared>.js"></script>

<%- include('../../partials/footer', { showSidebar }) %>
\`\`\`

## 4. 挂载路由（`src/app.js`）

\`\`\`js
// 在对应 SDK 块下加一行
app.use(v5, require('./routes/paypal/jssdk-v5/<product>'))
\`\`\`

## 5. 插入 Supabase 数据

\`\`\`sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('paypal', 'jssdk-v5', '<product>', '显示名称', '一句话描述', true, <排序号>);
\`\`\`

## 6. 重启并验证

\`\`\`bash
npm run dev        # 或在已启动的 nodemon 中输入 rs
\`\`\`

打开 `http://localhost:3000` → 首页自动出现新产品卡片 → 点击进入 demo 页验证。
```

- [ ] **Step 3: Verify file exists and has content**

```bash
wc -l apps/demo-hub/docs/guides/add-product.md
```

Expected: ~120–140 lines (the content above, markdown is slightly compressed from the original).

---

## Task 2: Create `src/routes/paypal/jssdk-v5/CLAUDE.md`

**Files:**
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/CLAUDE.md`

- [ ] **Step 1: Write the file**

This file contains content extracted from `apps/demo-hub/CLAUDE.md`. Write it as follows:

```markdown
# CLAUDE.md — PayPal JSSDK v5

> 通用规则见 `apps/demo-hub/CLAUDE.md`（所有路径均自动加载）。本文件只包含 JSSDK v5 专属规则。
>
> **Symlinks:** `src/public/js/paypal/jssdk-v5/CLAUDE.md` 和 `src/views/paypal/jssdk-v5/CLAUDE.md` 均指向本文件，编辑任何 v5 文件时都会自动加载。

---

## 各产品 SDK Params 速查

| product_key | sdkParams / SDK URL 特殊参数 |
|-------------|------------------------------|
| spb-ecm | `components=buttons&currency=USD&enable-funding=paylater` |
| spb-ecs | `components=buttons&currency=USD&enable-funding=paylater` |
| buttons | 双 SDK：CN（`components=buttons&currency=USD`）+ US（`enable-funding=venmo,paylater`） |
| acdc | `components=card-fields&currency=USD` |
| applepay-ecm | `components=applepay&currency=USD` + Apple Pay CDN script |
| applepay-ecs | `components=applepay&currency=USD` + Apple Pay CDN script |
| googlepay-ecm | `components=googlepay&currency=USD` + Google Pay script |
| googlepay-ecs | `components=googlepay&currency=USD` + Google Pay script |
| vault-paypal-with-purchase | `components=buttons&vault=true&enable-funding=paylater&buyer-country=US` + id_token |
| vault-acdc-with-purchase | `components=card-fields&vault=true&currency=USD` |
| vault-applepay-with-purchase | 硬编码 `currency=USD&vault=true` + Apple Pay CDN |
| vault-paypal-setup-only | `components=buttons&vault=true&buyer-country=US` + id_token |
| vault-acdc-setup-only | `components=card-fields&vault=true` |
| vault-return | `components=buttons&commit=true&buyer-country=US` + id_token（**必须含 commit=true**） |
| plm-div | `components=messages` |
| plm-js | `components=messages` |

---

## 各自定义路由关键实现备注

```
// buttons.js            — 双 SDK（CN + US）
// acdc.js               — CardFields SDK
// googlepay-ecm.js      — 双外部 SDK（PayPal + Google Pay）；需传 sandboxShipping + sandboxPhone 给 EJS；emailRequired:true（从 sheet 获取）；phone 用 SANDBOX_PHONE 预填；流程：sheet→email→createOrder→processPayment；3DS 通过 GET order details 解析；#custom-googlepay-btn 复用同一点击流程
// googlepay-ecs.js      — 双外部 SDK；shippingAddressRequired:true + emailRequired:true + phoneNumberRequired:true + shippingOptionRequired:true；SHIPPING_OPTIONS 数组（Standard $5 / Express $10）；Full Callback 模式（paymentDataCallbacks: { onPaymentAuthorized, onPaymentDataChanged }；callbackIntents:['SHIPPING_ADDRESS','SHIPPING_OPTION','PAYMENT_AUTHORIZATION']）；onPaymentAuthorized：用户授权后 Google Pay 调用，createOrder 在此回调内执行，返回 Promise<{transactionState}>；onPaymentDataChanged：INITIALIZE/SHIPPING_ADDRESS→返回 newTransactionInfo+newShippingOptionParameters，SHIPPING_OPTION→仅返回 newTransactionInfo；parsePhoneNumber(E.164, isoCountry)→{country_code,national_number}；buyerName/email/parsedPhone/shippingAmount 注入 create-order；total = item + shippingAmount
// applepay-ecm.js       — 自定义路由；GET 传 sandboxShipping 给 EJS；create-order 含 payment_source.apple_pay.experience_context（return_url/cancel_url；token 由 confirmOrder 注入）；capture-order 标准；extraScripts 加载 applepay.cdn-apple.com
// applepay-ecs.js       — 自定义路由；ECS 流程；GET 无 sandboxShipping（买家在 sheet 选）；create-order 接收 shippingContact + shippingAmount；payment_source.apple_pay 含 name/email_address/phone_number（national_number only，无 country_code）/experience_context；normalizeContact() 剥离非数字；total = item + shippingAmount
// vault-paypal-with-purchase.js — 完整自定义路由；GET 调 fetchIdToken() 注入 data-user-id-token；payment_source 在顶层（含 permit_multiple_payment_tokens/description/attributes.customer.merchant_customer_id/experience_context.brand_name/shipping_preference）；capture 返回 vaultId + customerId
// vault-acdc-with-purchase.js — 完整自定义路由；saveVault=true 时 attributes 加 vault.store_in_vault:ON_SUCCESS + customer.merchant_customer_id（随机 CUST_ 前缀）；3DS select disabled（沙盒限制）；测试卡 4012 0000 3333 0026
// vault-acdc-setup-only.js  — 完整自定义路由；/v3/vault/setup-tokens；顶层 customer.merchant_customer_id（随机）+ payment_source.card.billing_address + experience_context.return/cancel_url + verification_method（直接挂 card 下）；onApprove：liabilityShift 'YES'|'POSSIBLE' → confirm；否则 GET setup-token → token.status=APPROVED && verification_status=VERIFIED → confirm
// vault-applepay-with-purchase.js — 完整自定义路由；虚拟产品（无 shipping）；SDK URL 硬编码 currency=USD&vault=true；payment_source.apple_pay 含 stored_credential（CUSTOMER/RECURRING/usage:FIRST）+ attributes.vault.store_in_vault:ON_SUCCESS；button type "subscribe"；recurringPaymentIntervalUnit:"day"
// vault-paypal-setup-only.js — /v3/vault/setup-tokens API（PayPal 按钮方式）
// vault-return.js       — 自定义；PayPal → SDK Buttons（data-user-id-token 识别回头买家）；card → Pay Now（vault_id）；apple_pay → 禁用；PayPal-Request-Id 头；**SDK URL 必须含 commit=true&buyer-country=US，否则弹出登录 popup**
// plm-div.js            — 工厂路由；sdkParams:"components=messages"；国家选择器（US/AU/DE/ES/FR/IT/GB/CA）；优先读 ?country param；data-pp-buyercountry 注入每个 message div；max-width:680px
// plm-js.js             — 工厂路由；同 plm-div 国家选择；JS API：paypalSDK.Messages({amount,placement,buyerCountry,style,onRender,onClick,onApply}).render('#plm-js-container')；金额变化重新调 Messages()
```

---

## 文件速查（v5 调试）

```
修改 SDK 加载参数  → src/routes/paypal/jssdk-v5/<product>.js 的 sdkParams
修改 PayPal API   → src/routes/paypal/jssdk-v5/_factory.js（工厂产品）
                    或 src/routes/paypal/jssdk-v5/<product>.js（自定义产品）
修改 SDK 行为     → src/public/js/paypal/jssdk-v5/<shared>.js
修改页面 HTML     → src/views/paypal/jssdk-v5/<product>.ejs
修改 UI 样式      → src/public/css/sandbox.css
```

完整文件映射：`docs/design/2026-05-18-design-be-jssdk-v5-file-map.md`

---

## JSSDK v5 专属规则

### 规则 14 — Google Pay ECM 用 Promise 模式，ECS 用 Full Callback 模式

**ECM — Promise 模式**（无任何 callbacks）：
- 不传 `paymentDataCallbacks`，不设 `callbackIntents`
- `loadPaymentData(req).then(function(paymentData) { createOrder → processPayment })`
- sheet 关闭后 Promise resolve，3DS 窗口可正常弹出

**ECS — Full Callback 模式**（因 `onPaymentDataChanged` 需要）：
- `paymentDataCallbacks: { onPaymentAuthorized, onPaymentDataChanged }`
- `callbackIntents: ['SHIPPING_ADDRESS', 'SHIPPING_OPTION', 'PAYMENT_AUTHORIZATION']`
- `onPaymentAuthorized` 必须返回 `Promise<{ transactionState: 'SUCCESS' | 'ERROR' }>`（只能 resolve，失败用 ERROR）

**Google Pay API 强制规则（违反 → OR_BIBED_06）：**
- 只要传 `paymentDataCallbacks`，`callbackIntents` **必须**含 `'PAYMENT_AUTHORIZATION'` 且**必须**提供 `onPaymentAuthorized`
- `'SHIPPING_ADDRESS'` 必须在 `callbackIntents` 里才触发 `INITIALIZE` 回调
- `shippingOptions` 对象只允许 `{id, label, description}`，不能含 `price`、`selected`
- `onPaymentDataChanged` 返回规则：INITIALIZE/SHIPPING_ADDRESS → `newTransactionInfo` + `newShippingOptionParameters`；SHIPPING_OPTION → 只返回 `newTransactionInfo`
- 初始 `totalPriceStatus: 'ESTIMATED'`；`onPaymentDataChanged` 回调里用 `'FINAL'`

### 规则 15 — Google Pay 3DS 路径

Google Pay 无前端 `liabilityShift`，`confirmOrder` 返回 `PAYER_ACTION_REQUIRED` 时：
1. `initiatePayerAction`
2. GET order details
3. 从 `payment_source.google_pay.card.authentication_result`（比 ACDC 多一层 `google_pay`）读取结果

决策逻辑：
- `liability_shift === 'POSSIBLE'` → capture
- `liability_shift === 'NO'` + enrollment in `['N','U','B']` → capture（未入会）
- `liability_shift === 'NO'` + 其他 enrollment → reject
- `liability_shift === 'UNKNOWN'` → reject（提示重试）

### 规则 16 — Google Pay ECS 电话格式转换

Google Pay 返回 E.164（`+14155552671`），PayPal 需要 `{ country_code: '1', national_number: '4155552671' }`。

转换：strip 非数字 → 用 `COUNTRY_DIAL[shippingAddress.countryCode]` 找 dialCode → 若 digits 以 dialCode 开头则剥离，剩余为 `national_number`。

### 规则 17 — Google Pay ECM vs ECS 的 phone 来源不同

- **ECM**（`shippingAddressRequired: false`）：sheet 无地址区，无法收电话 → 用 `demoParams.SANDBOX_PHONE` 预填
- **ECS**（`shippingAddressRequired: true`）：从 `paymentData.shippingAddress.phoneNumber` 经 `parsePhoneNumber()` 转换

### 规则 18 — Apple Pay 流程关键规则

- **ECM create-order 含 `payment_source.apple_pay.experience_context`**（return_url/cancel_url）；token 由 `confirmOrder` 注入
- **ECS create-order 的 `payment_source.apple_pay`** 额外含 `name`、`email_address`、`phone_number`（仅 `{ national_number: digits }`，无 `country_code`）
- **create-order 在 `onpaymentauthorized` 内执行**；整个 createOrder→confirmOrder→capture 链都在此回调中
- **必须始终调用 `session.completePayment()`**：成功用 `STATUS_SUCCESS`，失败用 `STATUS_FAILURE`，否则 sheet 卡住
- **`confirmOrder` 返回** `{ approveApplePayPayment: { status, ... } }`；检查 `.status === 'APPROVED'`
- **3DS 由 Apple Pay 协议内部处理**，无需 `initiatePayerAction` 或 GET order details
- **ECM**: `requiredBillingContactFields: ['name','phone','email','postalAddress']`，无 shippingFields
- **ECS**: 额外加 `requiredShippingContactFields`；`shippingMethods` 数组；`onshippingmethodselected` + `onshippingcontactselected`；`normalizeContact()` 剥离非数字
- **Apple Pay `phone_number` 格式**：仅 `{ national_number: digits }`（与 Google Pay 不同，Google Pay 需要两个字段）

### 规则 19 — Vault Return Buyer SDK 必须加 `commit=true`

- 缺少 `commit=true` → 点击 PayPal 按钮弹出完整登录 popup，而非一键确认
- 正确 SDK URL：`...&buyer-country=US&commit=true&components=buttons&currency=${currency}`
- `create-order` 的 `payment_source` 只需 `{ paypal: { experience_context } }`，**不需要 vault_id**
- `data-user-id-token` 由后端调 `POST /v1/oauth2/token?response_type=id_token&target_customer_id=<customerId>` 获取
```

- [ ] **Step 2: Verify line count**

```bash
wc -l apps/demo-hub/src/routes/paypal/jssdk-v5/CLAUDE.md
```

Expected: ~150–180 lines.

---

## Task 3: Create Symlinks

**Files:**
- Create (symlink): `apps/demo-hub/src/public/js/paypal/jssdk-v5/CLAUDE.md`
- Create (symlink): `apps/demo-hub/src/views/paypal/jssdk-v5/CLAUDE.md`

- [ ] **Step 1: Create symlink in public/js**

```bash
cd apps/demo-hub/src/public/js/paypal/jssdk-v5
ln -s ../../../../routes/paypal/jssdk-v5/CLAUDE.md CLAUDE.md
cd -
```

- [ ] **Step 2: Create symlink in views**

```bash
cd apps/demo-hub/src/views/paypal/jssdk-v5
ln -s ../../../routes/paypal/jssdk-v5/CLAUDE.md CLAUDE.md
cd -
```

- [ ] **Step 3: Verify both symlinks resolve correctly**

```bash
cat apps/demo-hub/src/public/js/paypal/jssdk-v5/CLAUDE.md | head -3
cat apps/demo-hub/src/views/paypal/jssdk-v5/CLAUDE.md | head -3
ls -la apps/demo-hub/src/public/js/paypal/jssdk-v5/CLAUDE.md
ls -la apps/demo-hub/src/views/paypal/jssdk-v5/CLAUDE.md
```

Expected: both `cat` commands print the same first 3 lines from the real file. `ls -la` for public/js shows `-> ../../../../routes/paypal/jssdk-v5/CLAUDE.md`; for views shows `-> ../../../routes/paypal/jssdk-v5/CLAUDE.md`.

---

## Task 4: Create Placeholder Stubs

**Files:**
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v6/CLAUDE.md`
- Create: `apps/demo-hub/src/routes/braintree/CLAUDE.md`
- Create: `apps/demo-hub/src/routes/stripe/CLAUDE.md`
- Create: `apps/demo-hub/src/routes/adyen/CLAUDE.md`

- [ ] **Step 1: Create jssdk-v6 directory and stub**

```bash
mkdir -p apps/demo-hub/src/routes/paypal/jssdk-v6
```

Write `apps/demo-hub/src/routes/paypal/jssdk-v6/CLAUDE.md`:

```markdown
# CLAUDE.md — PayPal JSSDK v6

> 通用规则见 `apps/demo-hub/CLAUDE.md`。
> v5 参考见 `src/routes/paypal/jssdk-v5/CLAUDE.md`。

JSSDK v6 专属规则待建。开始实现 v6 时在此补充。
```

- [ ] **Step 2: Create braintree stub**

```bash
mkdir -p apps/demo-hub/src/routes/braintree
```

Write `apps/demo-hub/src/routes/braintree/CLAUDE.md`:

```markdown
# CLAUDE.md — Braintree

> 通用规则见 `apps/demo-hub/CLAUDE.md`。

Braintree 专属规则待建。开始实现 Braintree 时在此补充。
```

- [ ] **Step 3: Create stripe stub**

```bash
mkdir -p apps/demo-hub/src/routes/stripe
```

Write `apps/demo-hub/src/routes/stripe/CLAUDE.md`:

```markdown
# CLAUDE.md — Stripe

> 通用规则见 `apps/demo-hub/CLAUDE.md`。

Stripe 专属规则待建。开始实现 Stripe 时在此补充。
```

- [ ] **Step 4: Create adyen stub**

```bash
mkdir -p apps/demo-hub/src/routes/adyen
```

Write `apps/demo-hub/src/routes/adyen/CLAUDE.md`:

```markdown
# CLAUDE.md — Adyen

> 通用规则见 `apps/demo-hub/CLAUDE.md`。

Adyen 专属规则待建。开始实现 Adyen 时在此补充。
```

---

## Task 5: Trim `apps/demo-hub/CLAUDE.md`

**Files:**
- Modify: `apps/demo-hub/CLAUDE.md`

This task removes four sections from the main CLAUDE.md and replaces them with one-line pointers. Work section by section.

- [ ] **Step 1: Remove the route annotations block**

Find the block starting with `// buttons.js` and ending with `// plm-js.js             — 工厂路由...` (the big multi-line comment inside the factory section, around lines 180–193). Replace the entire block with:

```
// 各产品路由实现备注 → src/routes/paypal/jssdk-v5/CLAUDE.md
```

- [ ] **Step 2: Remove rules 14–19**

Find and remove the section starting with `14. **Google Pay ECM 用 Promise 模式...` through `19. **Vault Return Buyer SDK...` (including all sub-bullets). Replace with:

```
> JSSDK v5 专属规则（14–19：Google Pay、Apple Pay、Vault Return）→ `src/routes/paypal/jssdk-v5/CLAUDE.md`
```

- [ ] **Step 3: Remove the JS file → EJS mapping table**

Find the table block inside "EJS/JS 分离模式" section (the `| JS 文件 | 使用的产品 EJS |` table, around lines 344–362). Replace with:

```
完整文件对应表 → `docs/design/2026-05-18-design-be-jssdk-v5-file-map.md`
```

- [ ] **Step 4: Remove the 新增步骤 section**

Find the section `## 新增支付产品 Demo 完整步骤` through the end of step 6 (line ~557). Replace the entire section with:

```markdown
## 新增支付产品 Demo

详细步骤见 `docs/guides/add-product.md`。
```

- [ ] **Step 5: Remove the JSSDK v5 文件速查 section**

Find `## JSSDK v5 文件速查（调试用）` through the pointer to the file-map (lines ~566–578). Remove the entire section — this content now lives in `src/routes/paypal/jssdk-v5/CLAUDE.md`.

- [ ] **Step 6: Update references section**

At the end of `apps/demo-hub/CLAUDE.md`, update the `## 参考文档` section to add the new files:

```markdown
## 参考文档

- 通用新增 Demo 步骤：`docs/guides/add-product.md`
- JSSDK v5 专属规则 + 文件速查：`src/routes/paypal/jssdk-v5/CLAUDE.md`
- 需求：`docs/req/2026-05-15-req-demo-hub.md`
- JSSDK v5 产品：`docs/req/2026-05-15-req-jssdk-v5.md`
- 实现计划：`docs/plans/2026-05-15-plan-jssdk-v5-v1.md`
- 路由设计：`docs/design/2026-05-15-design-be-routing.md`
- v5 文件映射：`docs/design/2026-05-18-design-be-jssdk-v5-file-map.md`
- 根项目指南：`../../CLAUDE.md`
```

- [ ] **Step 7: Check final line count**

```bash
wc -l apps/demo-hub/CLAUDE.md
```

Expected: 220–250 lines (down from 587).

---

## Task 6: Verify

- [ ] **Step 1: Confirm all new files exist**

```bash
ls apps/demo-hub/docs/guides/add-product.md
ls apps/demo-hub/src/routes/paypal/jssdk-v5/CLAUDE.md
ls -la apps/demo-hub/src/public/js/paypal/jssdk-v5/CLAUDE.md
ls -la apps/demo-hub/src/views/paypal/jssdk-v5/CLAUDE.md
ls apps/demo-hub/src/routes/paypal/jssdk-v6/CLAUDE.md
ls apps/demo-hub/src/routes/braintree/CLAUDE.md
ls apps/demo-hub/src/routes/stripe/CLAUDE.md
ls apps/demo-hub/src/routes/adyen/CLAUDE.md
```

Expected: all 8 files present; the two symlinks show `->` arrow.

- [ ] **Step 2: Confirm symlinks point to the right target**

```bash
readlink apps/demo-hub/src/public/js/paypal/jssdk-v5/CLAUDE.md
readlink apps/demo-hub/src/views/paypal/jssdk-v5/CLAUDE.md
```

Expected:
- public/js: `../../../../routes/paypal/jssdk-v5/CLAUDE.md`
- views: `../../../routes/paypal/jssdk-v5/CLAUDE.md`

- [ ] **Step 3: Confirm symlink content matches real file**

```bash
diff \
  apps/demo-hub/src/public/js/paypal/jssdk-v5/CLAUDE.md \
  apps/demo-hub/src/routes/paypal/jssdk-v5/CLAUDE.md
diff \
  apps/demo-hub/src/views/paypal/jssdk-v5/CLAUDE.md \
  apps/demo-hub/src/routes/paypal/jssdk-v5/CLAUDE.md
```

Expected: no output (files are identical).

- [ ] **Step 4: Confirm main CLAUDE.md is trimmed**

```bash
wc -l apps/demo-hub/CLAUDE.md
grep -c "Google Pay ECM 用 Promise 模式" apps/demo-hub/CLAUDE.md
grep -c "新増支払产品" apps/demo-hub/CLAUDE.md
```

Expected:
- Line count: 220–250
- Both grep counts: `0` (extracted content is gone)

- [ ] **Step 5: Confirm v5 CLAUDE.md has the key rules**

```bash
grep -c "OR_BIBED_06" apps/demo-hub/src/routes/paypal/jssdk-v5/CLAUDE.md
grep -c "commit=true" apps/demo-hub/src/routes/paypal/jssdk-v5/CLAUDE.md
grep -c "completePayment" apps/demo-hub/src/routes/paypal/jssdk-v5/CLAUDE.md
```

Expected: all counts ≥ 1.
