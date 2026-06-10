# APM Bancontact (apm-ordersv2) · JSSDK v5 — Implementation Plan · v1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> 日期：2026-06-10
> 关联需求：`docs/req/2026-06-10-req-jssdk-v5-apm-ordersv2.md`
> 关联设计：`docs/design/2026-06-10-design-be-jssdk-v5-apm-ordersv2.md` · `docs/design/2026-06-10-design-fe-jssdk-v5-apm-ordersv2.md`
> 状态：待实现（**Opus 只写文档；代码须切换到非 Opus 模型（如 Sonnet）实现**）
> 项目约束：**不执行任何 git 操作**；项目无单测框架 → 用 `node -e` 加载校验 + 浏览器手动 QA + 控制台 inspect/probe（同 `apm-jssdk` 计划）。

**Goal:** 在 demo-hub 新增 `/paypal/jssdk-v5/apm-ordersv2` 演示，用**纯 Orders v2 API（无 JSSDK）**完成 Bancontact（比利时 · EUR）银行重定向支付，自动捕获，独立 return 页核验（中国商户）。

**Architecture:** 自定义 Express 路由 3 端点（GET 渲染 + create-order + GET return），**无 capture 端点**。create-order 用 ECM 风格 body 但 `payment_source` 替换为 `payment_source.bancontact`（含 experience_context.return_url/cancel_url）+ `processing_instruction: ORDER_COMPLETE_ON_PAYMENT_APPROVAL` + 比利时收货地址；返回 `payer-action` 链接给前端。前端自建按钮 `window.location` 重定向到银行；买家批准后 PayPal 自动捕获并回到 `return_url?token=<orderID>`；return handler GET order details，按规则 13 判 `COMPLETED`，渲染 success/cancelled/error 三态。

**Tech Stack:** Node.js + Express、EJS、Vanilla JS（无 SDK）、PayPal Orders v2 REST API、Supabase（产品配置）。

---

## 0. 完成定义（Definition of Done）

- 访问 `/paypal/jssdk-v5/apm-ordersv2` 渲染页面：Bancontact 说明条（BE · EUR · 重定向 · 中国商户）+ EUR 锁定 Amount + 「Pay with Bancontact」按钮 + 结果区；**页面源码无 PayPal SDK 脚本**。
- create-order 返回 `{ id, payerAction }`；请求体含 `payment_source.bancontact`（`country_code:"BE"` + `name` + `experience_context.{brand_name, shipping_preference:SET_PROVIDED_ADDRESS, return_url, cancel_url}`）、`processing_instruction:"ORDER_COMPLETE_ON_PAYMENT_APPROVAL"`、`amount.currency_code === "EUR"`、`purchase_units[0].shipping` 为比利时地址、HTTP header 含 `PayPal-Request-Id`。
- 点击按钮 → POST create-order → 浏览器 `window.location` 跳转 Bancontact 银行页 → 授权 → 自动捕获 → 回到 `return_url?token=<orderID>`。
- return 页 GET order details，按**规则 13**：仅 `status==='COMPLETED'` 且 `purchase_units[0].payments.captures[0].status==='COMPLETED'` 显示成功（success 态）；其余显示 error 态；`?status=cancel` 显示 cancelled 态。
- 控制台 inspect/probe 打印 create-order + return GET order 完整响应。
- 首页出现「APM · Bancontact (Orders v2)」卡片（Supabase 配置）。

---

## 1. 前置确认（实现前先看）

- [ ] 通读 `src/routes/paypal/jssdk-v5/spb-ecm.js`（ECM `buildBody` 建单模板）。
- [ ] 通读 `src/routes/paypal/jssdk-v5/apm-jssdk.js`（APM `payment_source` 结构 + PayPal-Request-Id header 模式 + EUR 锁定）。
- [ ] 通读 `src/routes/paypal/jssdk-v5/fastlane-fp.js`（return handler + 动态 origin redirect）+ `src/views/paypal/jssdk-v5/fastlane-fp-return.ejs`（return 页三态模板）。
- [ ] 通读 `src/views/partials/header.ejs` 第 12 行（`sdkUrl` 守卫——确认不传 `sdkUrl` 时不渲染 SDK 脚本）。
- [ ] 确认 `.env` 有 `PAYPAL_CN_CLIENT_ID` / `PAYPAL_CN_CLIENT_SECRET`；`config/paypal.js` 有 `getCNToken` / `getHeaders` / `API`（已有）。
- [ ] 确认 `config/constants.js` 现有 `INTENT` / `DEMO_*` / `validateAmount` / `DEFAULT_AMOUNT` / `NL_SHIPPING`（已有）。
- [ ] 在 `sandbox.css` 查实结账按钮可用类名（spb 等用的按钮类）与中间态 `result-msg` 类（是否有 `info`），FE 实现时沿用既有，不新建样式。

---

## 2. 任务拆解

### Task 1 — `config/constants.js`：新增共享常量 `BE_SHIPPING`

**Files:**
- Modify: `apps/demo-hub/src/config/constants.js`（在 `NL_SHIPPING` 之后；并加入 `module.exports`）

- [ ] **Step 1：在 `NL_SHIPPING` 定义之后新增 `BE_SHIPPING`**

```js
// ── 比利时收货地址（Bancontact APM，purchase_units[0].shipping）────────
const BE_SHIPPING = {
  name: { full_name: "Cross Wen" },
  address: {
    address_line_1: "Grote Markt 1",
    address_line_2: "",
    admin_area_2:   "Brussels",   // city
    admin_area_1:   "Brussels",   // region（Brussels-Capital）— inspect/probe 是否必填/格式
    postal_code:    "1000",
    country_code:   "BE",
  },
};
```

- [ ] **Step 2：在 `module.exports` 的「地址 & 电话」分组加入 `BE_SHIPPING`（紧随 `NL_SHIPPING`）**

```js
  // 地址 & 电话
  SANDBOX_SHIPPING,
  SANDBOX_BILLING,
  SANDBOX_PHONE,
  VENMO_SHIPPING,
  NL_SHIPPING,
  BE_SHIPPING,
```

- [ ] **Step 3：验收**

Run: `node -e "console.log(require('./apps/demo-hub/src/config/constants').BE_SHIPPING.address.country_code)"`
Expected: 输出 `BE`

---

### Task 2 — 路由文件 `src/routes/paypal/jssdk-v5/apm-ordersv2.js`（新增）

**Files:**
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/apm-ordersv2.js`

按 BE 设计 §3–§5。**无 capture 端点。**

- [ ] **Step 1：文件头 + 依赖 + 模块常量**

```js
/**
 * PayPal JSSDK v5 — APM Bancontact（纯 Orders v2 API，无 JSSDK）
 * Bancontact：比利时 · EUR · 银行重定向 · 中国商户 · 自动捕获
 * 3 端点：GET 渲染 / POST create-order / GET return（无 capture，自动捕获）
 */
const { Router } = require('express')
const fetch = require('node-fetch')
const { randomUUID } = require('crypto')   // PayPal-Request-Id（payment_source 时必须）
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API, getHeaders } = require('../../../config/paypal')
const C = require('../../../config/constants')

const PROVIDER    = 'paypal'
const SDK_VERSION = 'jssdk-v5'
const PRODUCT_KEY = 'apm-ordersv2'

const router = Router()
```

- [ ] **Step 2：`buildBody(amount, origin)` — create-order 请求体（payment_source.bancontact）**

```js
function buildBody(amount, origin) {
  const val = parseFloat(amount).toFixed(2)            // EUR 两位小数
  const eur = (v) => ({ currency_code: 'EUR', value: v })

  return {
    intent: C.INTENT.CAPTURE,                          // Bancontact 仅支持 CAPTURE
    processing_instruction: 'ORDER_COMPLETE_ON_PAYMENT_APPROVAL',   // 自动捕获

    payment_source: {
      bancontact: {
        country_code: 'BE',
        name:         'Cross Wen',
        experience_context: {
          brand_name:          'CWEN CHINA STORE',
          shipping_preference: 'SET_PROVIDED_ADDRESS',
          locale:              'en-BE',                 // inspect/probe
          return_url:          `${origin}/paypal/jssdk-v5/apm-ordersv2/return`,
          cancel_url:          `${origin}/paypal/jssdk-v5/apm-ordersv2/return?status=cancel`,
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
        currency_code: 'EUR',
        value:         val,
        breakdown: { item_total: eur(val) },
      },
      items: [{ ...C.DEMO_ITEM, unit_amount: eur(val) }],

      shipping: C.BE_SHIPPING,
    }],
  }
}
```

- [ ] **Step 3：GET 端点（渲染页面，无 SDK）**

```js
router.get(`/${PRODUCT_KEY}`, (req, res) => {
  const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  const amount  = req.query.amount || C.DEFAULT_AMOUNT
  // 纯 API：不构造 sdkUrl（header.ejs 守卫会跳过 SDK 脚本）
  res.render(`paypal/jssdk-v5/${PRODUCT_KEY}`, {
    title:             product?.displayName ?? PRODUCT_KEY,
    provider:          PROVIDER,
    sdkVersion:        SDK_VERSION,
    currentProductKey: PRODUCT_KEY,
    currentSdkVersion: SDK_VERSION,
    sidebarProducts:   getProviderProducts(PROVIDER),
    showSidebar:       true,
    defaultAmount:     amount,
  })
})
```

- [ ] **Step 4：create-order 端点（返回 payer-action 链接）**

```js
router.post(`/api/${PRODUCT_KEY}/create-order`, async (req, res) => {
  try {
    const amount    = req.body.amount || C.DEFAULT_AMOUNT
    const amountErr = C.validateAmount(amount, 'EUR')
    if (amountErr) return res.status(400).json({ error: amountErr })

    const origin = `${req.protocol}://${req.get('host')}`
    const token  = await getCNToken()
    const body   = buildBody(amount, origin)
    const r = await fetch(`${API}/v2/checkout/orders`, {
      // payment_source 存在时 PayPal 强制要求 PayPal-Request-Id（PAYPAL_REQUEST_ID_REQUIRED）
      method: 'POST', headers: getHeaders(token, { 'PayPal-Request-Id': randomUUID() }), body: JSON.stringify(body),
    })
    const order = await r.json()
    console.log('[apm-ordersv2 create-order]', JSON.stringify(order, null, 2))   // inspect/probe
    if (!r.ok) return res.status(r.status).json({ error: order.message || 'Create order failed', details: order })

    const link = (order.links || []).find(function (l) { return l.rel === 'payer-action' })
    if (!link) return res.status(502).json({ error: 'No payer-action link in order response', details: order })

    res.json({ id: order.id, payerAction: link.href })
  } catch (err) {
    console.error('[apm-ordersv2] create-order error:', err.message)
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 5：return 端点（GET，只读核验）+ 导出**

```js
router.get(`/${PRODUCT_KEY}/return`, async (req, res) => {
  const backUrl = `/paypal/jssdk-v5/${PRODUCT_KEY}`
  const render = (state, orderJson) => res.render(`paypal/jssdk-v5/${PRODUCT_KEY}-return`, {
    title:             'APM · Bancontact — Return',
    provider:          PROVIDER,
    sdkVersion:        SDK_VERSION,
    currentProductKey: PRODUCT_KEY,
    currentSdkVersion: SDK_VERSION,
    sidebarProducts:   getProviderProducts(PROVIDER),
    showSidebar:       true,
    state, orderJson, backUrl,
  })

  try {
    if (req.query.status === 'cancel') return render('cancelled', null)

    const orderID = req.query.token   // inspect/probe：确认 PayPal 回传 ?token=
    if (!orderID) return render('error', null)

    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderID}`, {
      method: 'GET', headers: getHeaders(token),
    })
    const order = await r.json()
    console.log('[apm-ordersv2 return GET order]', JSON.stringify(order, null, 2))   // inspect/probe
    if (!r.ok) return render('error', JSON.stringify(order, null, 2))

    const cap = order.purchase_units &&
                order.purchase_units[0] &&
                order.purchase_units[0].payments &&
                order.purchase_units[0].payments.captures &&
                order.purchase_units[0].payments.captures[0]
    const ok = order.status === 'COMPLETED' && cap && cap.status === 'COMPLETED'
    render(ok ? 'success' : 'error', JSON.stringify(order, null, 2))
  } catch (err) {
    console.error('[apm-ordersv2] return error:', err.message)
    render('error', null)
  }
})

module.exports = router
```

- [ ] **Step 6：验收（路由可加载）**

Run: `node -e "require('./apps/demo-hub/src/routes/paypal/jssdk-v5/apm-ordersv2.js'); console.log('route ok')"`
Expected: 输出 `route ok`（无 require 报错）

---

### Task 3 — 主视图 `src/views/paypal/jssdk-v5/apm-ordersv2.ejs`（新增）

**Files:**
- Create: `apps/demo-hub/src/views/paypal/jssdk-v5/apm-ordersv2.ejs`

按 FE 设计 §2。**header include 不传 `sdkUrl`。**

- [ ] **Step 1：整文件内容**

```ejs
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar
}) %>
<%# 纯 Orders v2 API —— 不传 sdkUrl，页面不加载 PayPal SDK %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-paypal">PayPal · JSSDK v5 · APM</span>
    <h1><%= title %></h1>
    <p>Bancontact — Belgium bank redirect (Orders v2 API only · no JSSDK)</p>
  </div>

  <div class="sandbox-card">
    <div class="apm-notice" style="padding:12px 14px;margin-bottom:16px;border:1px solid #d6e0f5;background:#f4f7fe;border-radius:8px;font-size:14px;line-height:1.5">
      <strong>Bancontact</strong> · 🇧🇪 Belgium · EUR only · bank redirect · CN merchant
      <br><small>Pure Orders v2 API (no JavaScript SDK). Clicking the button creates an order and redirects you to Bancontact to authorize; the payment is captured automatically on approval, and you return to a result page.</small>
    </div>

    <div class="amount-row">
      <div class="amount-group">
        <label class="field-label" for="demo-amount">Amount (EUR)</label>
        <div class="amount-input-wrapper">
          <input id="demo-amount" class="amount-input" type="text" inputmode="decimal"
            value="<%= defaultAmount || '100.00' %>" placeholder="0.00"
            aria-label="Payment amount in EUR" />
        </div>
      </div>
    </div>
    <div class="amount-error" id="amount-error" role="alert"></div>
    <span class="sandbox-mode-badge" style="display:inline-block;margin-bottom:16px">⚡ Sandbox Mode</span>

    <button id="bancontact-btn" type="button" class="pay-btn">Pay with Bancontact</button>

    <div class="result-msg" id="result" role="alert" aria-live="polite"></div>
  </div>
</div>

<script>
  window.DEMO = {
    urls: {
      createOrder: '/paypal/jssdk-v5/api/apm-ordersv2/create-order',
    }
  }
</script>
<script src="/js/paypal/jssdk-v5/apm-ordersv2.js"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

- [ ] **Step 2：按钮类名核对**

确认 `#bancontact-btn` 的 `class` 用 `sandbox.css` 既有结账按钮类（前置确认已查）。若现有类名不是 `pay-btn`，替换为实际类名（如 spb 页所用），不新建样式。

- [ ] **Step 3：验收**

启动后访问页面（见 Task 6），确认说明条 / Amount / 按钮 / 结果区均渲染；**查看页面源码无 `sdk/js` 脚本标签**；视觉与其他 v5 demo 一致。

---

### Task 4 — return 视图 `src/views/paypal/jssdk-v5/apm-ordersv2-return.ejs`（新增）

**Files:**
- Create: `apps/demo-hub/src/views/paypal/jssdk-v5/apm-ordersv2-return.ejs`

按 FE 设计 §4，镜像 `fastlane-fp-return.ejs`。

- [ ] **Step 1：整文件内容**

```ejs
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar
}) %>

<style>
/* 复用 fastlane-fp-return 的 fpr-* 页面级样式 */
.fpr-card { max-width: 560px; margin: 0 auto; padding: var(--sp-5); }
.fpr-badge { display:inline-block; font-family:var(--font-mono); font-size:12px; font-weight:700; letter-spacing:.3px; padding:5px 14px; border-radius:var(--r-sm); margin-bottom:var(--sp-4); }
.fpr-badge.success   { background: rgba(34,197,94,0.15); color: var(--accent); }
.fpr-badge.error     { background: rgba(239,68,68,0.12); color: var(--error); }
.fpr-badge.cancelled { background: var(--surface2); color: var(--fg-muted); }
.fpr-msg { font-family:var(--font-sans); font-size:14px; color:var(--fg-muted); line-height:1.5; margin-bottom:var(--sp-3); }
.fpr-pre { background:var(--surface2); border:1px solid var(--border); border-radius:var(--r-md); padding:var(--sp-3) var(--sp-4); overflow:auto; font-family:var(--font-mono); font-size:11px; color:var(--fg-muted); max-height:420px; margin-top:var(--sp-4); white-space:pre; line-height:1.5; }
.fpr-back { display:inline-block; margin-top:var(--sp-5); font-family:var(--font-mono); font-size:12px; color:var(--accent); text-decoration:none; }
.fpr-back:hover { text-decoration: underline; }
</style>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-paypal">PayPal · JSSDK v5 · APM</span>
    <h1>Bancontact — Payment Result</h1>
    <p>Orders v2 API redirect result (auto-capture on approval)</p>
  </div>

  <div class="fpr-card">
    <% if (state === 'success') { %>
      <div class="fpr-badge success">✓ COMPLETED</div>
      <p class="fpr-msg">Payment captured successfully (auto-captured on approval).</p>
    <% } else if (state === 'cancelled') { %>
      <div class="fpr-badge cancelled">— Cancelled</div>
      <p class="fpr-msg">The payment was cancelled or not completed by the buyer.</p>
    <% } else { %>
      <div class="fpr-badge error">✗ Error</div>
      <p class="fpr-msg">Payment was not completed, or the order could not be found. See details below.</p>
    <% } %>

    <% if (orderJson) { %>
      <pre class="fpr-pre"><%= orderJson %></pre>
    <% } %>

    <a href="<%= backUrl %>" class="fpr-back">← Back to Bancontact Demo</a>
  </div>
</div>

<%- include('../../partials/footer', { showSidebar }) %>
```

- [ ] **Step 2：验收**

手动访问 `/paypal/jssdk-v5/apm-ordersv2/return?status=cancel`（无需真支付）确认 cancelled 态渲染正常（badge + 文案 + 返回链接）。

---

### Task 5 — 前端逻辑 `src/public/js/paypal/jssdk-v5/apm-ordersv2.js`（新增）

**Files:**
- Create: `apps/demo-hub/src/public/js/paypal/jssdk-v5/apm-ordersv2.js`

按 FE 设计 §3。**无 SDK 依赖。**

- [ ] **Step 1：整文件内容**

```js
/**
 * PayPal JSSDK v5 — APM Bancontact（纯 Orders v2 API，无 JSSDK）
 * window.DEMO = { urls: { createOrder } }
 * 货币固定 EUR（服务端强制）。点击 → 建单 → 重定向到 payer-action。
 */
;(function () {
  'use strict'

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  function getAmount() {
    var input = document.getElementById('demo-amount')
    return input ? input.value.trim() : '100.00'
  }

  var MIN_AMOUNT = 1.00, MAX_AMOUNT = 30000.00
  function validateAmount() {
    var input = document.getElementById('demo-amount')
    var errEl = document.getElementById('amount-error')
    if (!input) return true
    var val = input.value.trim(), num = parseFloat(val), err = ''
    if (!val || isNaN(num) || !/^\d+(\.\d{1,2})?$/.test(val)) err = 'Please enter a valid number'
    else if (num < MIN_AMOUNT) err = 'Minimum amount is ' + MIN_AMOUNT.toFixed(2)
    else if (num > MAX_AMOUNT) err = 'Maximum amount is ' + MAX_AMOUNT.toLocaleString()
    if (err) { if (errEl) errEl.textContent = err; input.classList.add('amount-input--error'); return false }
    if (errEl) errEl.textContent = ''
    input.classList.remove('amount-input--error')
    return true
  }

  window.addEventListener('load', function () {
    var urls = window.DEMO && window.DEMO.urls
    var btn  = document.getElementById('bancontact-btn')

    var amtInput = document.getElementById('demo-amount')
    if (amtInput) amtInput.addEventListener('blur', function () {
      var n = parseFloat(this.value); if (!isNaN(n) && n > 0) this.value = n.toFixed(2); validateAmount()
    })

    if (!btn) return
    btn.addEventListener('click', function () {
      if (!validateAmount()) return
      btn.disabled = true
      showResult('Creating order…', 'info')

      fetch(urls.createOrder, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: getAmount() }),
      })
        .then(function (r) { return r.json() })
        .then(function (d) {
          if (d.error || !d.payerAction) throw new Error(d.error || 'No redirect link')
          showResult('Redirecting to Bancontact…', 'info')
          window.location.href = d.payerAction
        })
        .catch(function (err) {
          btn.disabled = false
          showResult('✗ ' + (err.message || String(err)), 'error')
        })
    })
  })
})()
```

- [ ] **Step 2：中间态类名核对**

若 `sandbox.css` 无 `result-msg.info` 中性态样式，将两处 `showResult(..., 'info')` 的类型改为现有中性/提示类（前置确认已查）；不新建样式。

- [ ] **Step 3：验收**

页面加载后点击按钮：金额合法 → 按钮 disable + 显示「Creating order… / Redirecting…」并跳转；金额非法 → `#amount-error` 红字、不跳转。

---

### Task 6 — 挂载路由 `src/app.js`

**Files:**
- Modify: `apps/demo-hub/src/app.js`（v5 区块 `apm-jssdk` 之后）

- [ ] **Step 1：追加挂载行**

```js
app.use(v5, require("./routes/paypal/jssdk-v5/apm-ordersv2"));
```

- [ ] **Step 2：验收**

启动 demo-hub 无报错（见 Task 8）。

---

### Task 7 — Supabase 产品配置（用户手动执行）

**Files:** 无（Supabase SQL Editor）

- [ ] **Step 1：执行 INSERT**

```sql
INSERT INTO demohub.products (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES (
  'paypal', 'jssdk-v5', 'apm-ordersv2',
  'APM · Bancontact (Orders v2)',
  'Bancontact（比利时）银行重定向 APM，纯 Orders v2 API（无 JSSDK），EUR，中国商户，自动捕获',
  true,
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM demohub.products WHERE provider='paypal' AND sdk_version='jssdk-v5')
);
```

- [ ] **Step 2：验收**：重启 demo-hub，首页 PayPal / JSSDK v5 分组出现「APM · Bancontact (Orders v2)」卡片。

---

### Task 8 — QA + inspect/probe（定稿）

**Files:** 记录到 `docs/test-cases.md` / `docs/debug-log.md`

- [ ] **Step 1：启动**

Run: `npm run dev:demo-hub`
Expected: 监听 `http://localhost:3000`，无启动报错。

- [ ] **Step 2：渲染检查（无 SDK）**

打开 `http://localhost:3000/paypal/jssdk-v5/apm-ordersv2`。
Expected: Bancontact 说明条 + EUR Amount + 「Pay with Bancontact」按钮 + 结果区；**View Source 无 `sdk/js` 脚本标签**。

- [ ] **Step 3：create-order 校验**

点击按钮，观察服务端控制台 `[apm-ordersv2 create-order]` 完整响应。
Expected: 返回 `{ id, payerAction }`；请求体含 `payment_source.bancontact`（BE + name + experience_context.return_url/cancel_url）、`processing_instruction:"ORDER_COMPLETE_ON_PAYMENT_APPROVAL"`、`currency_code:"EUR"`、`shipping` 为比利时地址；响应 `links[]` 含 `payer-action`。

- [ ] **Step 4：重定向 + 自动捕获 + return（规则 13）**

跳转 Bancontact 银行页 → 授权 → 自动回到 `/apm-ordersv2/return?token=...`。观察 `[apm-ordersv2 return GET order]` 响应。
Expected: `status==='COMPLETED'` 且 `captures[0].status==='COMPLETED'` → return 页绿色 success 态 + 订单 JSON；否则 error 态。

- [ ] **Step 5：取消 / 错误路径**

银行页取消 → 回到 `cancel_url` → return 页 cancelled 态；
直接访问 `/apm-ordersv2/return`（无 token）→ error 态；
金额非法 → `#amount-error` 红字、不跳转。

- [ ] **Step 6：inspect/probe 核对（逐项填实测结论）**

  - [ ] create-order 响应 `links[]` `payer-action` href 真实结构。
  - [ ] PayPal 是否把 order id 作为 `?token=` 拼到 return_url（**核心假设**）；是否带 `PayerID`。
  - [ ] 返回时是否已**自动捕获**（无需 capture）；若 `status` 非 COMPLETED / 无 captures → 在 return handler 补 capture fallback（记 debug-log）。
  - [ ] `bancontact.experience_context.brand_name` / `locale` 是否被接受（不接受则移除/调整）。
  - [ ] `bancontact.name`（"Cross Wen" vs 文档 "John Doe"）是否有要求。
  - [ ] `purchase_units[0].shipping`（比利时地址）+ `SET_PROVIDED_ADDRESS` 是否被使用 / 回显。
  - [ ] `BE_SHIPPING.address.admin_area_1`（region）是否必填 / 正确格式。
  - [ ] cancel 分支是否确实回到 `cancel_url`。

- [ ] **Step 7：记录结果**：把实测写入 `docs/test-cases.md`，问题写入 `docs/debug-log.md`；更新 `docs/progress.md` / `docs/todos.md`。

---

## 3. 风险与缓解

| 风险 | 缓解 |
|------|------|
| PayPal 未把 order id 作为 `?token=` 回传 return_url | inspect/probe 实测；若无 token → 改用建单前生成 sessionKey 嵌入 return_url + 模块级 Map 反查（fastlane-fp 模式） |
| 自动捕获未发生（return 时 status 非 COMPLETED） | inspect/probe；补 capture fallback 调用（watch-item，记 debug-log） |
| `bancontact.experience_context` 不接受 `brand_name`/`locale` | create-order 报 400 时按响应 details 移除该字段 |
| `BE_SHIPPING.admin_area_1` 格式/必填要求 | inspect/probe；按 400 details 调整 region 值 |
| `sandbox.css` 无 `pay-btn` / `result-msg.info` 类 | 前置确认已查实际类名；FE 用既有类，不新建样式 |
| return_url 用 localhost 不可达 | 不适用——return_url 是浏览器重定向（非 server→server callback），localhost 正常 |

---

## 4. 改动文件清单（预期）

- `apps/demo-hub/src/config/constants.js`（新增 `BE_SHIPPING` + 导出）
- `apps/demo-hub/src/routes/paypal/jssdk-v5/apm-ordersv2.js`（新增）
- `apps/demo-hub/src/views/paypal/jssdk-v5/apm-ordersv2.ejs`（新增）
- `apps/demo-hub/src/views/paypal/jssdk-v5/apm-ordersv2-return.ejs`（新增）
- `apps/demo-hub/src/public/js/paypal/jssdk-v5/apm-ordersv2.js`（新增）
- `apps/demo-hub/src/app.js`（新增挂载行）
- Supabase `demohub.products`（手动 INSERT）
- 文档：`docs/test-cases.md` / `docs/debug-log.md` / `docs/progress.md` / `docs/todos.md`（QA 后更新）
- 可选：`src/routes/paypal/jssdk-v5/CLAUDE.md`（新增 `apm-ordersv2` 备注 + sdkParams 速查行 + 新规则）

---

## 5. 自审（Self-Review）

- **Spec 覆盖**：需求 §3 成功标准逐条 →
  - 纯 API 无 SDK → Task 2 Step 3（不传 sdkUrl）+ Task 3（header 不传 sdkUrl）+ Task 8 Step 2（View Source 校验）。✓
  - payment_source.bancontact + experience_context + processing_instruction → Task 2 Step 2/4。✓
  - PayPal-Request-Id → Task 2 Step 4。✓
  - 比利时地址 BE_SHIPPING → Task 1 + Task 2 Step 2。✓
  - 前端按钮 + window.location 重定向 → Task 5。✓
  - return 页三态 + 规则 13 → Task 2 Step 5 + Task 4。✓
  - 首页卡片 → Task 7。✓
  - inspect/probe → Task 2（日志）+ Task 8 Step 6。✓
- **占位符扫描**：无 TBD / TODO；每个代码步骤含完整代码。inspect/probe 为有意的实测核验项，非占位。✓
- **类型/命名一致**：`PRODUCT_KEY='apm-ordersv2'`、URL `/api/apm-ordersv2/create-order` + `/apm-ordersv2/return`、JS `apm-ordersv2.js`、视图 `apm-ordersv2.ejs` / `apm-ordersv2-return.ejs`、按钮 `#bancontact-btn`、常量 `BE_SHIPPING`（Task 1 定义 / Task 2 引用）、`buildBody(amount, origin)` 签名（Task 2 Step 2 定义 / Step 4 调用）、return render 变量 `state`/`orderJson`/`backUrl`（Task 2 Step 5 传 / Task 4 用），全程一致。✓
- **无 capture 端点**：req / BE 设计 / 本计划一致（自动捕获）。✓

---

## 6. NOT in scope（明确不做）

- JSSDK / PaymentFields / Marks / Buttons（纯 API；JSSDK 路线见姊妹 demo `apm-jssdk`）。
- 手动 capture 端点（自动捕获）。
- Webhook 处理（用 return 页 GET order details 替代）。
- 其他 APM（iDEAL/P24/BLIK）/ funding 选择器（只做 Bancontact）。
- 货币选择器（EUR 锁定）。
- 预选银行 `bic`。
- sessionKey Map（仅作 token 缺失时的 fallback，记为 watch-item，本版不实现）。

---

## GSTACK REVIEW REPORT

> 评审：`/plan-eng-review` · 2026-06-10 · 分支 `main` · 模型 Opus（markdown only，无 git 操作；已跳过 gstack 遥测/onboarding/git 仪式 bash）

### Step 0 — Scope Challenge
- **范围**：6 文件（constants 改 + 4 新 + app.js 挂载）/ 0 新类，低于 8 文件阈值，无 scope creep。✓
- **复用**：`spb-ecm.js`（buildBody）、`apm-jssdk.js`（APM payment_source + PayPal-Request-Id）、`fastlane-fp.js` + `fastlane-fp-return.ejs`（return handler + 动态 origin + 三态页）、`constants.js`（DEMO_*/validateAmount/NL_SHIPPING）。无重复造轮子。✓
- **Search**：标准 PayPal APM Orders v2 重定向流（**[Layer 1]**），无自定义基础设施；`processing_instruction=ORDER_COMPLETE_ON_PAYMENT_APPROVAL` 为文档标准。✓
- **完整性**：happy / cancel / error / 金额校验 / inspect-probe 均覆盖，非 shortcut。✓
- **裁决**：范围 right-sized，按原样接受（未缩减）。

### 评审发现与裁决

| # | 维度 | 发现 | 置信度 | 裁决 |
|---|------|------|--------|------|
| 1 | 架构 | `return_url` base 用动态 `req.protocol`/`req.get('host')`；生产反向代理下 `req.protocol` 可能为 http，return_url 出错（仓库已有 `PUBLIC_BASE_URL` 约定） | 6/10 | **保持现状（动态 origin）**：sandbox demo + 浏览器重定向，本地零配置；生产风险留设计 §2.5 + 风险表（用户裁决 D1→A） |
| 2 | 代码质量 | `validateAmount()`+MIN/MAX 在 `apm-ideal.js`/`spb.js`/`apm-ordersv2.js` 重复（DRY） | 8/10 | **保持现状**：与 iDEAL 评审发现 #2 相同裁决（逐产品 JS 自包含，house pattern） |
| 3 | 代码质量 | `BE_SHIPPING` 与 `NL_/VENMO_/SANDBOX_SHIPPING` 近重复 | 7/10 | **保持现状**：constants.js 既定「显式命名常量」模式，explicit > clever，minimal diff |
| — | 代码质量（旁注） | `validateAmount` 错误信息硬编码 `$`（即便 EUR）—— **既有问题，非本计划引入** | 7/10 | 仅旗标，不在本计划范围 |

### 测试评审（项目无单测框架）
demo-hub 各 demo 统一手动验证（`docs/test-cases.md` + 浏览器 + 控制台 inspect/probe），无 jest/pytest。Task 8 已覆盖手动路径，与项目惯例一致，**0 自动化缺口**。

手动覆盖矩阵：
```
USER FLOWS                                              STATUS
[+] Bancontact 支付主流程
  ├── create-order → payer-action → 重定向               [Task8 Step3]
  ├── 银行授权 → 自动捕获 → return COMPLETED              [Task8 Step4，规则13]
  └── return GET order details COMPLETED → success 页     [Task8 Step4]
[+] 取消 / 错误
  ├── 银行取消 → cancel_url → cancelled 页                [Task8 Step5]
  ├── /return 无 token → error 页                         [Task8 Step5]
  ├── 金额非法 → #amount-error，不重定向                  [Task8 Step5]
  └── 无 payer-action 链接 → 502                          [守卫已存在；未显式 QA — 次要]
[+] 无 SDK 断言（首个无 SDK 页面）
  └── View Source 无 sdk/js 脚本                          [Task8 Step2]
inspect/probe（8 项，含 ?token= + 自动捕获核实）          [Task8 Step6]
```
> 小补充（非阻塞）：可在 Task 8 加一行显式 QA「无 payer-action → 502」守卫；两个核心 watch-item（`?token=` 是否出现 / 自动捕获是否发生）已在 Step 6。

### 性能评审
单次 create-order + 单次 GET order details；无 N+1；token 8h 缓存；Supabase 配置启动读一次。**无问题。**

### Failure modes（关键失败路径）
| 路径 | 失败方式 | 有测试? | 有错误处理? | 用户可见? |
|------|----------|---------|-------------|-----------|
| create-order | `payment_source.bancontact` 被拒 / 422 | 手动(Step3) | ✓ 返回 details | ✓ 按钮区红字 |
| create-order | 响应无 `payer-action` 链接 | inspect/probe | ✓ 502 | ✓ 红字 |
| 重定向回流 | PayPal 未回传 `?token=` | inspect/probe | ✓ token 缺失→error 页 | ✓ error 页（但订单可能已捕获 — 见风险表 sessionKey fallback） |
| return | 自动捕获未发生（status 非 COMPLETED） | inspect/probe | △ 显示 error（watch-item：补 capture fallback） | ✓ error 页 |
| 生产代理 | return_url 变 http / host 错 | ✗ | ✗ | △ 仅生产，已知（发现1，用户裁决保留） |

> 无「无测试 AND 无错误处理 AND 静默」的关键缺口。生产代理项为已知、用户裁决保留、sandbox 不触发。

### 并行化
顺序实现，无并行机会（Task 1→2→3→4→5→6 链式：常量→路由→主视图→return 视图→前端 JS→挂载；均围绕单一 demo 模块）。**Sequential implementation, no parallelization opportunity.**

### NOT in scope / What already exists
见本计划 §6（NOT in scope）与 §1 前置确认 / §模板来源（What already exists：spb-ecm / apm-jssdk / fastlane-fp(-return) / constants）。

### Completion Summary
- Step 0 Scope：范围按原样接受（right-sized，未缩减）
- Architecture：1 issue（裁决：保持现状，用户 D1→A）
- Code Quality：2 issues + 1 旁注（裁决：均保持现状 / 旁注不在范围）
- Test Review：手动覆盖矩阵已出，0 自动化缺口（项目无测试框架）
- Performance：0 issues
- NOT in scope / What already exists：已写
- Failure modes：0 关键静默缺口（1 已知生产项，用户保留）
- Outside voice：跳过（用户未要求；Opus + 项目无 git/遥测仪式）

### 设计评审（`/plan-design-review` · 2026-06-10）

> 模型 Opus（markdown only，无 git）；**有意跳过 AI mockup 生成**（UI 高度复用，生成新品牌稿违背 pattern 一致性，与 iDEAL 评审同一裁决）。DESIGN.md 存在（深色 OLED 主题），作为对齐基准。聚焦评审（用户裁决 D1→A）：只深挖 3 个真正新点，其余 pass 快速过。

- 初始评分 **7/10**；UI 范围 2 视图（结账页 + return 页），高度复用 `sandbox-card` + `apm-notice` + `fpr-*`。
- FE 设计已**修复** iDEAL 评审遗留：D2（缺中间态 → 已加 Creating/Redirecting + 按钮 disable）、D3（中英混排 → 纯英文）。

| Pass | 维度 | 评分 | 结论 |
|------|------|------|------|
| 1 | 信息架构 | 8/10 | notice→amount→button→result / badge→msg→json→back，层级清晰，无 issue |
| 2 | 交互状态 | 7→8/10 | 中间态已 spec；G2 `result-msg info` 类是否存在 → verify-during-impl（plan Task5 Step2 已记） |
| 3 | 用户旅程 | 8/10 | 每步有反馈（iDEAL D2 缺口已闭合），无 issue |
| 4 | AI Slop | 9/10 | 无 card grid / 无紫渐变 / 非全居中 / 真字体 / 单一按钮，过黑名单 |
| 5 | 设计系统 | 7/10 | **G1** `apm-notice` 浅色内联（#f4f7fe）于深色 OLED → iDEAL D1，用户保留（held） |
| 6 | 响应/无障碍 | 8/10 | 继承共享 partials 响应式 + 移动 tabs；result `aria-live`；原生 `<button>` 键盘可达 |
| 7 | 遗留决策 | — | 1 resolved（D2），0 deferred |

| # | 维度 | 发现 | 裁决 |
|---|------|------|------|
| G1 | Pass5 设计系统 | `.apm-notice` 浅色内联与深色主题冲突 | **保持现状**（与 iDEAL D1 同裁决，用户保留浅色内联） |
| G2 | Pass2 状态 | 中间态用 `result-msg info`，该类可能不存在于 sandbox.css | **verify-during-impl**（plan + eng 评审已记 watch-item，非阻塞） |
| D2 | Pass7 决策 | return error/cancelled 是否需专门「Try again」按钮 | **保持现状（back 链接足够）**：直接落到结账页 Pay 按钮，最短重试路径，subtraction default（用户裁决 D2→A） |

终评分 **7/10 → 8/10**（G1 浅色 notice 用户保留 → 封顶 8，影响观感细节，非阻塞）。
**Approved Mockups**：无（按 pattern 一致性有意跳过 mockup 生成）。

### Review Readiness Dashboard
```
| Review        | Runs | Status                  | Required |
|---------------|------|-------------------------|----------|
| Eng Review    |  1   | CLEAR (PLAN)            | YES      |
| Design Review |  1   | 8/10 · 1 resolved/2 held| no       |
| CEO Review    |  0   | —                       | no       |
| Outside Voice |  0   | —                       | no       |
```

**VERDICT：ENG + DESIGN CLEARED — 计划架构合理、范围正确、设计完整度 8/10，可进入实现。**
工程评审 3 项（1 架构 + 2 代码质量）、设计评审 3 项（G1/G2/D2），用户裁决：保持现状/verify-impl/back 链接。全部与 iDEAL 姊妹评审一致。实现需切换非 Opus 模型。
