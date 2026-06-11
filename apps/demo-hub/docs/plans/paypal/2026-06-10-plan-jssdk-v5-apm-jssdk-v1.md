# APM iDEAL (apm-jssdk) · JSSDK v5 — Implementation Plan · v1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> 日期：2026-06-10
> 关联需求：`docs/req/2026-06-10-req-jssdk-v5-apm-jssdk.md`
> 关联设计：`docs/design/2026-06-10-design-be-jssdk-v5-apm-jssdk.md` · `docs/design/2026-06-10-design-fe-jssdk-v5-apm-jssdk.md`
> 状态：待实现（**Opus 只写文档；代码须切换到非 Opus 模型（如 Sonnet）实现**）

**Goal:** 在 demo-hub 新增 `/paypal/jssdk-v5/apm-jssdk` 演示，用 JSSDK Marks+Buttons（iDEAL）+ Orders v2 完成荷兰 EUR 银行重定向支付（中国商户）。

**Architecture:** 自定义 Express 路由（GET 渲染 + create-order + capture-order，仿 `contact-module`），create-order 用 ECM 风格 body 但 `payment_source` 替换为 `payment_source.ideal` + 荷兰收货地址；前端渲染 iDEAL Mark + Button（`fundingSource: paypal.FUNDING.IDEAL`），`onApprove` 手动 capture，按规则 13 判 `COMPLETED`。

**Tech Stack:** Node.js + Express、EJS、Vanilla JS、PayPal JSSDK v5、Orders v2 REST API、Supabase（产品配置）。

---

## 0. 完成定义（Definition of Done）

- 访问 `/paypal/jssdk-v5/apm-jssdk` 渲染页面：iDEAL 说明条（NL · EUR · 重定向 · 中国商户）+ EUR 锁定 Amount + `#ideal-mark`（iDEAL 标记）+ `#ideal-btn`（按钮）+ 结果区。
- create-order 返回 order id；请求体含 `payment_source.ideal`（`country_code:"NL"` + `name` + `experience_context.return_url`/`cancel_url`）、`amount.currency_code === "EUR"`、`purchase_units[0].shipping` 为荷兰地址、**不含** `processing_instruction`。
- 点击 iDEAL Button → 重定向 sandbox 银行页 → 授权 → 返回触发 `onApprove` → capture。
- capture 后按**规则 13**：仅 `purchase_units[0].payments.captures[0].status === 'COMPLETED'` 显示成功；其余（含 PENDING）显示错误。
- 控制台 inspect/probe 打印 create-order + capture 完整响应。
- 首页出现「APM · iDEAL」卡片（Supabase 配置）。

---

## 1. 前置确认（实现前先看）

- [ ] 通读 `src/routes/paypal/jssdk-v5/spb-ecm.js`（ECM `buildBody` 建单模板）。
- [ ] 通读 `src/routes/paypal/jssdk-v5/contact-module.js`（自定义路由骨架 / 货币锁定 / inspect/probe 日志）。
- [ ] 通读 `src/public/js/paypal/jssdk-v5/spb.js`（按钮 + 金额校验）+ `src/views/paypal/jssdk-v5/spb-ecm.ejs`（页面骨架）。
- [ ] 确认 `.env` 有 `PAYPAL_CN_CLIENT_ID` / `PAYPAL_CN_CLIENT_SECRET`；`config/paypal.js` 有 `getCNToken` / `getHeaders` / `API`（已有）。
- [ ] 确认 `config/constants.js` 现有 `INTENT` / `DEMO_*` / `EXPERIENCE_CONTEXT` / `validateAmount` / `DEFAULT_AMOUNT`（已有）。

---

## 2. 任务拆解

### Task 1 — `config/constants.js`：新增共享常量 `NL_SHIPPING`

**Files:**
- Modify: `apps/demo-hub/src/config/constants.js`（在 `VENMO_SHIPPING` 之后；并加入 `module.exports`）

- [ ] **Step 1：在 `VENMO_SHIPPING` 定义之后新增 `NL_SHIPPING`**

```js
// ── 荷兰收货地址（iDEAL APM，purchase_units[0].shipping）──────────────
const NL_SHIPPING = {
  name: { full_name: "Cross Wen" },
  address: {
    address_line_1: "Keizersgracht 123",
    address_line_2: "",
    admin_area_2:   "Amsterdam",   // city
    admin_area_1:   "NH",          // province（North Holland）— inspect/probe 是否必填
    postal_code:    "1015 CJ",
    country_code:   "NL",
  },
};
```

- [ ] **Step 2：在 `module.exports` 的「地址 & 电话」分组加入 `NL_SHIPPING`**

```js
  // 地址 & 电话
  SANDBOX_SHIPPING,
  SANDBOX_BILLING,
  SANDBOX_PHONE,
  VENMO_SHIPPING,
  NL_SHIPPING,
```

- [ ] **Step 3：验收**

Run: `node -e "console.log(require('./apps/demo-hub/src/config/constants').NL_SHIPPING.address.country_code)"`
Expected: 输出 `NL`

---

### Task 2 — 路由文件 `src/routes/paypal/jssdk-v5/apm-jssdk.js`（新增）

**Files:**
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/apm-jssdk.js`

按 BE 设计 §3–§5。

- [ ] **Step 1：文件头 + 依赖 + 模块常量**

```js
/**
 * PayPal JSSDK v5 — APM iDEAL（自定义路由）
 * iDEAL：荷兰 · EUR · 银行重定向 · 中国商户
 */
const { Router } = require('express')
const fetch = require('node-fetch')
const { randomUUID } = require('crypto')   // PayPal-Request-Id（payment_source 时必须）
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API, getHeaders } = require('../../../config/paypal')
const C = require('../../../config/constants')

const PROVIDER    = 'paypal'
const SDK_VERSION = 'jssdk-v5'
const PRODUCT_KEY = 'apm-jssdk'

const router = Router()
```

- [ ] **Step 2：`buildBody(amount)` — create-order 请求体（payment_source.ideal）**

```js
function buildBody(amount) {
  const val = parseFloat(amount).toFixed(2)            // EUR 两位小数
  const eur = (v) => ({ currency_code: 'EUR', value: v })

  return {
    intent: C.INTENT.CAPTURE,                          // iDEAL 仅支持 CAPTURE

    payment_source: {
      ideal: {
        country_code: 'NL',
        name:         'Cross Wen',
        experience_context: {
          brand_name: C.EXPERIENCE_CONTEXT.brand_name, // inspect/probe
          locale:     'nl-NL',                         // inspect/probe
          return_url: C.EXPERIENCE_CONTEXT.return_url,
          cancel_url: C.EXPERIENCE_CONTEXT.cancel_url,
        },
      },
    },
    // 注意：不设 processing_instruction（onApprove 手动 capture）

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

      shipping: C.NL_SHIPPING,
    }],
  }
}
```

- [ ] **Step 3：GET 端点（渲染页面）**

```js
router.get(`/${PRODUCT_KEY}`, (req, res) => {
  const product  = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  const amount   = req.query.amount || C.DEFAULT_AMOUNT
  const clientId = process.env.PAYPAL_CN_CLIENT_ID
  const sdkUrl   = `https://www.paypal.com/sdk/js?client-id=${clientId}` +
                   `&components=buttons,marks&enable-funding=ideal&currency=EUR&buyer-country=NL`

  res.render(`paypal/jssdk-v5/${PRODUCT_KEY}`, {
    title:             product?.displayName ?? PRODUCT_KEY,
    provider:          PROVIDER,
    sdkVersion:        SDK_VERSION,
    currentProductKey: PRODUCT_KEY,
    currentSdkVersion: SDK_VERSION,
    sidebarProducts:   getProviderProducts(PROVIDER),
    showSidebar:       true,
    clientId,
    sdkUrl,
    defaultAmount:     amount,
  })
})
```

- [ ] **Step 4：create-order 端点**

```js
router.post(`/api/${PRODUCT_KEY}/create-order`, async (req, res) => {
  try {
    const amount    = req.body.amount || C.DEFAULT_AMOUNT
    const amountErr = C.validateAmount(amount, 'EUR')
    if (amountErr) return res.status(400).json({ error: amountErr })

    const token = await getCNToken()
    const body  = buildBody(amount)
    const r = await fetch(`${API}/v2/checkout/orders`, {
      // payment_source 存在时 PayPal 强制要求 PayPal-Request-Id（PAYPAL_REQUEST_ID_REQUIRED）
      method: 'POST', headers: getHeaders(token, { 'PayPal-Request-Id': randomUUID() }), body: JSON.stringify(body),
    })
    const order = await r.json()
    console.log('[apm-jssdk create-order]', JSON.stringify(order, null, 2))   // inspect/probe
    if (!r.ok) return res.status(r.status).json({ error: order.message || 'Create order failed', details: order })
    res.json({ id: order.id })
  } catch (err) {
    console.error('[apm-jssdk] create-order error:', err.message)
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 5：capture-order 端点 + 导出**

```js
router.post(`/api/${PRODUCT_KEY}/capture-order`, async (req, res) => {
  try {
    const { orderID } = req.body
    if (!orderID) return res.status(400).json({ error: 'orderID required' })

    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST', headers: getHeaders(token),
    })
    const data = await r.json()
    console.log('[apm-jssdk capture]', JSON.stringify(data, null, 2))         // inspect/probe
    if (!r.ok) return res.status(r.status).json({ error: data.message || 'Capture failed', details: data })

    res.json(data)   // 前端按规则 13 判 captures[0].status === 'COMPLETED'
  } catch (err) {
    console.error('[apm-jssdk] capture-order error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
```

- [ ] **Step 6：验收（路由可加载）**

Run: `node -e "require('./apps/demo-hub/src/routes/paypal/jssdk-v5/apm-jssdk.js'); console.log('route ok')"`
Expected: 输出 `route ok`（无 require 报错）

---

### Task 3 — 主视图 `src/views/paypal/jssdk-v5/apm-jssdk.ejs`（新增）

**Files:**
- Create: `apps/demo-hub/src/views/paypal/jssdk-v5/apm-jssdk.ejs`

按 FE 设计 §2。

- [ ] **Step 1：整文件内容**

```ejs
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar, sdkUrl
}) %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-paypal">PayPal · JSSDK v5 · APM</span>
    <h1><%= title %></h1>
    <p>iDEAL — Netherlands bank redirect (JSSDK Marks + Buttons + Orders v2)</p>
  </div>

  <div class="sandbox-card">
    <%# UI 文案统一英文（D3 设计评审裁决，与 spb-ecm/contact-module 一致）；
        配色保持浅色内联（D1 用户裁决保留现状） %>
    <div class="apm-notice" style="padding:12px 14px;margin-bottom:16px;border:1px solid #d6e0f5;background:#f4f7fe;border-radius:8px;font-size:14px;line-height:1.5">
      <strong>iDEAL</strong> · 🇳🇱 Netherlands · EUR only · bank redirect · CN merchant
      <br><small>Clicking the button redirects you to your bank to authorize; the payment is captured on return.</small>
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

    <div id="ideal-mark" class="apm-mark" style="margin-bottom:12px"></div>

    <div id="ideal-btn" class="sdk-loading">
      <div class="sdk-spinner"></div>
      <span>Loading iDEAL...</span>
    </div>

    <div class="result-msg" id="result" role="alert" aria-live="polite"></div>
  </div>
</div>

<script>
  window.DEMO = {
    urls: {
      createOrder:  '/paypal/jssdk-v5/api/apm-jssdk/create-order',
      captureOrder: '/paypal/jssdk-v5/api/apm-jssdk/capture-order',
    }
  }
</script>
<script src="/js/paypal/jssdk-v5/apm-ideal.js"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

- [ ] **Step 2：验收**

启动后访问页面（见 Task 6），确认说明条 / Amount / Mark 容器 / 按钮容器 / 结果区均渲染，视觉与其他 v5 demo 一致。

---

### Task 4 — 前端逻辑 `src/public/js/paypal/jssdk-v5/apm-ideal.js`（新增）

**Files:**
- Create: `apps/demo-hub/src/public/js/paypal/jssdk-v5/apm-ideal.js`

按 FE 设计 §3。

- [ ] **Step 1：整文件内容**

```js
/**
 * PayPal JSSDK v5 — APM iDEAL（Mark + Button）
 * window.DEMO = { urls: { createOrder, captureOrder } }
 * 货币固定 EUR（服务端强制）。规则 13：仅 COMPLETED 成功。
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

  function clearLoading(id) {
    var el = document.getElementById(id)
    if (!el) return el
    el.classList.remove('sdk-loading'); el.innerHTML = ''
    return el
  }

  window.addEventListener('load', function () {
    if (typeof paypalSDK === 'undefined') {
      showResult('✗ PayPal SDK failed to load', 'error'); return
    }
    var urls = window.DEMO && window.DEMO.urls

    var amtInput = document.getElementById('demo-amount')
    if (amtInput) amtInput.addEventListener('blur', function () {
      var n = parseFloat(this.value); if (!isNaN(n) && n > 0) this.value = n.toFixed(2); validateAmount()
    })

    // iDEAL Mark
    if (paypalSDK.Marks) {
      paypalSDK.Marks({ fundingSource: paypalSDK.FUNDING.IDEAL }).render('#ideal-mark')
    }

    // iDEAL Button
    clearLoading('ideal-btn')
    paypalSDK.Buttons({
      fundingSource: paypalSDK.FUNDING.IDEAL,
      style: { label: 'pay' },

      createOrder: function () {
        if (!validateAmount()) return Promise.reject(new Error('Invalid amount'))
        return fetch(urls.createOrder, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: getAmount() }),
        })
          .then(function (r) { return r.json() })
          .then(function (d) { if (d.error) throw new Error(d.error); return d.id })
      },

      onApprove: function (data) {
        return fetch(urls.captureOrder, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderID: data.orderID }),
        })
          .then(function (r) { return r.json() })
          .then(function (order) {
            if (order.error) throw new Error(order.error)
            var cap = order.purchase_units &&
                      order.purchase_units[0] &&
                      order.purchase_units[0].payments &&
                      order.purchase_units[0].payments.captures &&
                      order.purchase_units[0].payments.captures[0]
            if (!cap || cap.status !== 'COMPLETED') {
              showResult('✗ Capture failed · status: ' + (cap ? cap.status : 'unknown'), 'error')
              return
            }
            showResult('✓ Payment captured · Order: ' + order.id, 'success')
          })
      },

      onCancel: function () { showResult('Payment cancelled.', 'error') },
      onError:  function (err) { showResult('✗ ' + (err.message || String(err)), 'error') },
    }).render('#ideal-btn')
  })
})()
```

- [ ] **Step 2：验收**

页面加载后 `#ideal-mark` 出现 iDEAL 标记、`#ideal-btn` 出现 iDEAL 按钮；金额非法时 `#amount-error` 红字。
（若全局 SDK 名非 `paypalSDK` 或无 `FUNDING.IDEAL`，按 inspect/probe 调整——见 §3。）

---

### Task 5 — 挂载路由 `src/app.js`

**Files:**
- Modify: `apps/demo-hub/src/app.js`（v5 区块 `contact-module` 之后）

- [ ] **Step 1：追加挂载行**

```js
app.use(v5, require("./routes/paypal/jssdk-v5/apm-jssdk"));
```

- [ ] **Step 2：验收**

启动 demo-hub 无报错（见 Task 7）。

---

### Task 6 — Supabase 产品配置（用户手动执行）

**Files:** 无（Supabase SQL Editor）

- [ ] **Step 1：执行 INSERT**

```sql
INSERT INTO demohub.products (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES (
  'paypal', 'jssdk-v5', 'apm-jssdk',
  'APM · iDEAL',
  'iDEAL（荷兰）银行重定向 APM，JSSDK Marks+Buttons + Orders v2，EUR，中国商户',
  true,
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM demohub.products WHERE provider='paypal' AND sdk_version='jssdk-v5')
);
```

- [ ] **Step 2：验收**：重启 demo-hub，首页 PayPal / JSSDK v5 分组出现「APM · iDEAL」卡片。

---

### Task 7 — QA + inspect/probe（定稿）

**Files:** 记录到 `docs/test-cases.md` / `docs/debug-log.md`

- [ ] **Step 1：启动**

Run: `npm run dev:demo-hub`
Expected: 监听 `http://localhost:3000`，无启动报错。

- [ ] **Step 2：渲染检查**

打开 `http://localhost:3000/paypal/jssdk-v5/apm-jssdk`。
Expected: iDEAL 说明条 + EUR Amount + iDEAL Mark + iDEAL Button + 结果区。

- [ ] **Step 3：create-order 校验**

点击 iDEAL Button，观察服务端控制台 `[apm-jssdk create-order]` 完整响应。
Expected: 返回 order id；请求体含 `payment_source.ideal`（NL + name + experience_context）、`currency_code:"EUR"`、`shipping` 为荷兰地址、无 `processing_instruction`。

- [ ] **Step 4：重定向 + capture（规则 13）**

在 sandbox 银行页授权 → 返回 → `onApprove` → 观察 `[apm-jssdk capture]` 响应。
Expected: `captures[0].status === 'COMPLETED'` → 结果区绿字「✓ Payment captured」；否则红字。

- [ ] **Step 5：取消 / 错误路径**

银行页取消 → 结果区「Payment cancelled.」；金额非法 → `#amount-error` 红字。

- [ ] **Step 6：inspect/probe 核对（逐项填实测结论）**

  - [ ] create-order 响应是否含 `links`（payer-action / approve）。
  - [ ] `payment_source.ideal` + Button `fundingSource: IDEAL` 是否冲突（重定向是否正常发起）。
  - [ ] `ideal.experience_context.brand_name` / `locale` 是否被接受（不接受则移除）。
  - [ ] `purchase_units[0].shipping`（荷兰地址）是否被使用 / 回显。
  - [ ] `NL_SHIPPING.address.admin_area_1`（省份）是否必填。
  - [ ] sandbox 是否自动回流到 `onApprove`（无需独立 return 页面）。
  - [ ] 全局 SDK 名是 `paypalSDK` 还是 `paypal`；`FUNDING.IDEAL` 是否存在；`Marks` 是否可用。

- [ ] **Step 7：记录结果**：把实测写入 `docs/test-cases.md`，问题写入 `docs/debug-log.md`；更新 `docs/progress.md` / `docs/todos.md`。

---

## 3. 风险与缓解

| 风险 | 缓解 |
|------|------|
| `payment_source.ideal` 与 Button `fundingSource` 双重指定冲突 | inspect/probe 实测；若重定向异常，按 contact-module 经验改为创建无 payment_source 的 minimal order，或保留 ideal 但移除冗余字段 |
| `ideal.experience_context` 不接受 `brand_name`/`locale` | create-order 报 400 时按响应 details 移除该字段 |
| iDEAL 忽略/拒绝 shipping（callbacks 不支持） | 仅作静态地址；若建单报错则移除 shipping |
| capture 返回 PENDING | 规则 13 已按错误处理（用户选定严格模式）；inspect/probe 记录实际频率 |
| 全局 SDK 名 / FUNDING 枚举差异 | inspect/probe 校验后调整 `apm-ideal.js` |

---

## 4. 改动文件清单（预期）

- `apps/demo-hub/src/config/constants.js`（新增 `NL_SHIPPING` + 导出）
- `apps/demo-hub/src/routes/paypal/jssdk-v5/apm-jssdk.js`（新增）
- `apps/demo-hub/src/views/paypal/jssdk-v5/apm-jssdk.ejs`（新增）
- `apps/demo-hub/src/public/js/paypal/jssdk-v5/apm-ideal.js`（新增）
- `apps/demo-hub/src/app.js`（新增挂载行）
- Supabase `demohub.products`（手动 INSERT）
- 文档：`docs/test-cases.md` / `docs/debug-log.md` / `docs/progress.md` / `docs/todos.md`（QA 后更新）

---

## 5. 自审（Self-Review）

- **Spec 覆盖**：需求 §3 成功标准逐条 → Task 2（create-order body / EUR / payment_source.ideal / 无 processing_instruction）、Task 3（页面 + 说明条）、Task 4（Mark+Button + 规则 13）、Task 7（重定向 + capture + inspect/probe）。✓
- **占位符扫描**：无 TBD / TODO；每个代码步骤含完整代码。✓
- **类型/命名一致**：`PRODUCT_KEY='apm-jssdk'`、URL `/api/apm-jssdk/...`、JS 文件 `apm-ideal.js`、Mark/Button 容器 `#ideal-mark`/`#ideal-btn`、常量 `NL_SHIPPING` 在 Task 1 定义并在 Task 2 引用，全程一致。✓

---

## GSTACK REVIEW REPORT

> 评审：`/plan-eng-review` · 2026-06-10 · 分支 `main` · 模型 Opus（markdown only，无 git 操作）

### Step 0 — Scope Challenge
- **范围**：5 文件 / 0 新类，低于 8 文件阈值，无 scope creep。✓
- **复用**：`spb-ecm.js`（buildBody）、`contact-module.js`（自定义路由 + 货币锁定 + inspect/probe）、`_factory.js`（capture 形态）、`constants.js`。无重复造轮子。✓
- **完整性**：happy / cancel / error / 金额校验 / inspect/probe 均覆盖。✓

### 评审发现与裁决（3 项，均经 AskUserQuestion）

| # | 维度 | 发现 | 置信度 | 裁决 |
|---|------|------|--------|------|
| 1 | 架构 | `payment_source.ideal` 与 Button `fundingSource: IDEAL` 双重指定，标准 SDK APM 流建单通常不带 payment_source，叠加可能令确认/跳转步骤冲突 | 7/10 | **保持现状**：留在风险表 + inspect/probe（用户裁决） |
| 2 | 代码质量 | `apm-ideal.js` 与 `spb.js` 重叠约 90%（DRY） | 8/10 | **保持现状**：独立文件，与现有逐产品 JS 做法一致（用户裁决） |
| 3 | 代码质量 | 金额下限 1.00 与 req 文档「iDEAL 最小 0.01 EUR」不一致 | 6/10 | **保持现状**：沿用 house min 1.00（用户裁决） |

### 测试评审（项目无单测框架）
demo-hub 各 demo 统一靠**手动验证**（`docs/test-cases.md` + 浏览器 + 控制台 inspect/probe），无 jest/pytest。本计划 Task 7 已覆盖手动路径，与项目惯例一致，非缺口。

手动覆盖矩阵：

```
USER FLOWS                                        STATUS
[+] iDEAL 支付主流程
  ├── 建单 + 跳转银行 + 返回 + capture COMPLETED   [Task7 Step3-4]
  ├── 银行页取消                                    [Task7 Step5]
  ├── 金额非法                                      [Task7 Step5]
  └── capture 非 COMPLETED（含 PENDING）→ error     [Task7 Step4，规则13]
inspect/probe（7 项）                              [Task7 Step6]
```

### 性能评审
单次 create/capture API 调用；无 N+1；Supabase 产品配置启动时读一次缓存内存。**无问题。**

### Failure modes（关键失败路径）
| 路径 | 失败方式 | 有测试? | 有错误处理? | 用户可见? |
|------|----------|---------|-------------|-----------|
| create-order | `payment_source.ideal` 被拒 / 422 | 手动(Step3) | ✓ 返回 details | ✓ onError 红字 |
| 跳转银行 | 按钮不跳转（双重指定冲突） | inspect/probe | △ 仅日志 | △ 可能静默 — **见发现1，已知风险** |
| capture | 返回 PENDING | 手动(Step4) | ✓ 规则13 | ✓ 红字 |
| 回流 | SDK 未自动回 onApprove | inspect/probe | ✗ | △ 可能静默 — inspect/probe 待验 |

> 1 项潜在静默失败（按钮不跳转）已在发现 1 标注，用户选择以 inspect/probe 兜底。

### 并行化
顺序实现，无并行机会（Task 1→2→3→4→5 链式依赖：常量→路由→视图→JS→挂载；均围绕单一 demo 模块）。

### NOT in scope（明确不做）
- PaymentFields（姓名收集组件）— 用户选 Mark+Button。
- 多 APM / funding source 选择器 — 仅 iDEAL。
- 多页 checkout flow。
- Webhook 处理（CHECKOUT.ORDER.APPROVED 等）— 聚焦前后端建单+capture。
- 纯 Orders API（无 JSSDK）集成。
- 独立 return 页面 — SDK 托管返回（inspect/probe 待验）。

### Completion Summary
- Step 0 Scope：范围按原样接受（right-sized，未缩减）
- Architecture：1 issue（裁决：保持现状）
- Code Quality：2 issues（裁决：均保持现状）
- Test Review：手动覆盖矩阵已出，0 自动化缺口（项目无测试框架）
- Performance：0 issues
- NOT in scope / What already exists：已写
- Failure modes：1 潜在静默失败（已知，inspect/probe 兜底）
- Outside voice：跳过（用户未要求）

### 设计评审（`/plan-design-review` · 2026-06-10）

- 初始评分 **6/10**（UI 复用 sandbox-card 既有模式，IA/响应式/a11y 基础继承自共享 partials）。
- UI 范围小且高度复用，**有意跳过 AI mockup 生成**（生成新品牌稿会违背 pattern 一致性原则）。
- DESIGN.md 存在（深色 OLED 主题），作为对齐基准。

| # | 维度 | 发现 | 裁决 |
|---|------|------|------|
| D1 | Pass5 设计系统 | `.apm-notice` 浅色内联（#f4f7fe）与深色 OLED 主题冲突 | **保持现状**（用户裁决：保留浅色内联） |
| D2 | Pass2 交互状态 | 缺「Redirecting / Processing payment」中间态，银行往返几秒无反馈 | **保持现状**（用户裁决） |
| D3 | Pass4 一致性 | 说明条中英混排，与其他 v5 demo 纯英文不一致 | **已修复**：notice 文案统一英文（plan Task 3 + fe 设计同步） |

终评分 **7/10**（D3 已修；D1/D2 用户选择保留 → 影响观感/反馈细腻度，非阻塞）。

**Approved Mockups**：无（按 pattern 一致性跳过 mockup 生成）。

### Review Readiness Dashboard

```
| Review        | Runs | Status                  | Required |
|---------------|------|-------------------------|----------|
| Eng Review    |  1   | CLEAR (PLAN)            | YES      |
| Design Review |  1   | 7/10 · 1 fixed / 2 held | no       |
| CEO Review    |  0   | —                       | no       |
```

---

**VERDICT：ENG + DESIGN CLEARED — 计划架构合理、范围正确、可进入实现。**
工程评审 3 项、设计评审 3 项，用户裁决：5 项保持现状、1 项（D3 文案英文化）已修。实现需切换非 Opus 模型。
