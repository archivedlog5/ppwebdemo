# 设计（前端）— APM Bancontact (apm-ordersv2) · JSSDK v5

> 日期：2026-06-10
> 关联需求：`docs/req/2026-06-10-req-jssdk-v5-apm-ordersv2.md`
> 关联 BE 设计：`docs/design/2026-06-10-design-be-jssdk-v5-apm-ordersv2.md`
> 状态：设计中（Opus 只写文档；代码须切换非 Opus 模型实现）
> 模板来源：`apm-jssdk.ejs`（说明条 + amount 骨架）、`fastlane-fp-return.ejs`（return 页三态）

---

## 1. 页面构成（2 个 EJS）

| 文件 | 作用 |
|------|------|
| `views/paypal/jssdk-v5/apm-ordersv2.ejs` | 结账页：说明条 + EUR Amount + 「Pay with Bancontact」按钮 + 结果区 |
| `views/paypal/jssdk-v5/apm-ordersv2-return.ejs` | return 落地页：success / cancelled / error 三态 + 订单 JSON |

前端 JS：`public/js/paypal/jssdk-v5/apm-ordersv2.js`（无 SDK；按钮点击 → create-order → 重定向）。

> **本仓库首个纯 API 页面**：EJS 不 include SDK 脚本（GET handler 不传 `sdkUrl`，`header.ejs` 守卫跳过）。

---

## 2. 结账页 `apm-ordersv2.ejs`

复用 `apm-jssdk.ejs` 的 sandbox-card / apm-notice / amount-row 骨架，去掉 SDK 相关容器（`#ideal-mark` / `#ideal-btn`），改为自建按钮 `#bancontact-btn`。

```ejs
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar
}) %>
<%# 注意：不传 sdkUrl —— 纯 Orders v2 API，页面不加载 PayPal SDK %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-paypal">PayPal · JSSDK v5 · APM</span>
    <h1><%= title %></h1>
    <p>Bancontact — Belgium bank redirect (Orders v2 API only · no JSSDK)</p>
  </div>

  <div class="sandbox-card">
    <%# UI 文案统一英文（与其他 v5 demo 一致）；apm-notice 浅色内联沿用 apm-jssdk %>
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

> `#bancontact-btn` 用现有按钮样式类（沙盒页通用 `.pay-btn` 或与 spb 一致的按钮类）；
> inspect/probe 实测 `sandbox.css` 现有按钮类名，沿用既有，不新建样式系统。
> 无 captureOrder URL（自动捕获，return 页核验）。

---

## 3. 前端逻辑 `apm-ordersv2.js`（无 SDK）

比 iDEAL（`apm-ideal.js`）简单：无 `paypalSDK`、无 Marks/Buttons。amount 校验复用同款逻辑；按钮点击 → POST create-order → `window.location.href = payerAction`。

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
      showResult('Creating order…', 'info')   // 中间态反馈

      fetch(urls.createOrder, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: getAmount() }),
      })
        .then(function (r) { return r.json() })
        .then(function (d) {
          if (d.error || !d.payerAction) throw new Error(d.error || 'No redirect link')
          showResult('Redirecting to Bancontact…', 'info')
          window.location.href = d.payerAction   // 离开本站 → 银行
        })
        .catch(function (err) {
          btn.disabled = false
          showResult('✗ ' + (err.message || String(err)), 'error')
        })
    })
  })
})()
```

> **交互状态**（吸取 iDEAL 设计评审 D2「缺中间态」）：点击后立即 disable 按钮 +「Creating order… / Redirecting…」文案，
> 避免重定向前几秒无反馈、防重复点击。`info` 态用 `result-msg info`（若 sandbox.css 无 info 态，inspect/probe 后用既有中性态类）。

---

## 4. return 页 `apm-ordersv2-return.ejs`

镜像 `fastlane-fp-return.ejs`（页面级 `fpr-*` 样式 + 三态徽章 + 订单 JSON `<pre>` + 返回链接）。

```ejs
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar
}) %>

<style>
/* 复用 fastlane-fp-return 的 fpr-* 页面级样式（success/error/cancelled 徽章 + pre + back） */
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

---

## 5. 视觉一致性

- 深色 OLED 主题继承自共享 partials + `sandbox.css`（与全站一致）。
- `apm-notice` 浅色内联沿用 `apm-jssdk.ejs`（iDEAL 设计评审 D1 用户裁决保留浅色内联）。
- return 页完全复用 `fpr-*` 模式，零新设计语言。
- 按钮：沿用 sandbox 既有按钮类（inspect/probe 确认类名），不新建。

---

## 6. 与 iDEAL（apm-jssdk）FE 差异速查

| 维度 | iDEAL（apm-jssdk.ejs / apm-ideal.js） | Bancontact（apm-ordersv2.ejs / .js） |
|---|---|---|
| SDK 脚本 | 注入（`components=buttons,marks&enable-funding=ideal`） | **无** |
| 支付控件 | `paypalSDK.Marks` + `paypalSDK.Buttons` | **自建 `<button>`** |
| 重定向 | SDK Button 内部 | **`window.location.href = payerAction`** |
| 捕获触发 | `onApprove` → POST capture | **无（自动捕获）** |
| 结果展示 | 同页 `#result` | **独立 return 页**（`#result` 仅显示建单/重定向中间态与错误） |
| 中间态 | 无（评审 D2 held） | **有**（Creating / Redirecting） |
