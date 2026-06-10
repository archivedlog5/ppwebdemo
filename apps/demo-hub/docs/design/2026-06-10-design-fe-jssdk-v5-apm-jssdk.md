# 设计（前端）— APM iDEAL (apm-jssdk) · JSSDK v5

> 日期：2026-06-10
> 关联需求：`docs/req/2026-06-10-req-jssdk-v5-apm-jssdk.md`
> 关联后端设计：`docs/design/2026-06-10-design-be-jssdk-v5-apm-jssdk.md`
> 状态：设计中（Opus 只写文档；代码须切换非 Opus 模型实现）

---

## 1. 文件总览

| 文件 | 作用 |
|------|------|
| `views/paypal/jssdk-v5/apm-jssdk.ejs` | 页面骨架：iDEAL 说明条 + Amount（EUR 锁定）+ `#ideal-mark` + `#ideal-btn` + 结果区 |
| `public/js/paypal/jssdk-v5/apm-ideal.js` | 渲染 iDEAL Mark + Button（`fundingSource: paypal.FUNDING.IDEAL`），驱动 create/capture |

EJS 仅注入 `window.DEMO = { urls: {...} }`，SDK 逻辑全在 `apm-ideal.js`（遵循 EJS/JS 分离规范）。

---

## 2. 页面布局（EJS）

复用 `spb-ecm.ejs` 骨架，去掉货币选择器（EUR 锁定），加 iDEAL 专属说明与两个容器。

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
    <!-- iDEAL 说明条：国家/货币/重定向/中国商户 -->
    <div class="apm-notice">
      <strong>iDEAL</strong> · 🇳🇱 Netherlands · EUR only · bank redirect · CN merchant
      <br><small>Clicking the button redirects you to your bank to authorize; the payment is captured on return.</small>
    </div>

    <%# UI 文案统一英文（D3 设计评审裁决，与 spb-ecm / contact-module 一致） %>

    <!-- 金额（EUR 固定，无货币选择器；EUR 符号前缀）-->
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

    <!-- iDEAL Mark（品牌标记）-->
    <div id="ideal-mark" class="apm-mark"></div>

    <!-- iDEAL Button（重定向入口）-->
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

> `.apm-notice` / `.apm-mark` 若全局 CSS 无定义，用内联样式或复用既有卡片样式。
> Amount 区不渲染 `currency-select`（与 `contact-module` 锁定货币一致）。

---

## 3. 前端脚本（apm-ideal.js）

结构参考 `spb.js`，但：渲染 **Marks + Buttons** 且都指定 `fundingSource: paypal.FUNDING.IDEAL`；
货币固定 EUR（无货币切换逻辑）；POST body 只传 `{ amount }`。

```js
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

  // EUR 两位小数校验（min 1.00 / max 30000，沿用 house 规则）
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

    // amount 失焦格式化
    var amtInput = document.getElementById('demo-amount')
    if (amtInput) amtInput.addEventListener('blur', function () {
      var n = parseFloat(this.value); if (!isNaN(n) && n > 0) this.value = n.toFixed(2); validateAmount()
    })

    // 1) iDEAL Mark
    if (paypalSDK.Marks) {
      paypalSDK.Marks({ fundingSource: paypalSDK.FUNDING.IDEAL }).render('#ideal-mark')
    }

    // 2) iDEAL Button
    clearLoading('ideal-btn')
    paypalSDK.Buttons({
      fundingSource: paypalSDK.FUNDING.IDEAL,
      style: { label: 'pay' },

      createOrder: function () {
        if (!validateAmount()) return Promise.reject(new Error('Invalid amount'))
        return fetch(urls.createOrder, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: getAmount() }),       // 货币固定 EUR（服务端强制）
        })
          .then(function (r) { return r.json() })
          .then(function (d) { if (d.error) throw new Error(d.error); return d.id })
      },

      onApprove: function (data) {                              // 银行授权返回后触发
        return fetch(urls.captureOrder, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderID: data.orderID }),
        })
          .then(function (r) { return r.json() })
          .then(function (order) {
            if (order.error) throw new Error(order.error)
            // 规则 13：仅 COMPLETED 成功
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

> SDK 全局名：项目里 SDK URL 通过 header partial 注入并暴露为 `paypalSDK`（见 `spb.js` 用法）。
> `paypalSDK.FUNDING.IDEAL` 为枚举常量；若实测为 `paypal.FUNDING.IDEAL` 命名空间，以实际全局为准（inspect/probe）。

---

## 4. 交互状态

| 状态 | 表现 |
|------|------|
| 加载中 | `#ideal-btn` 显示 spinner（`.sdk-loading`），Mark 区渲染 iDEAL 标记 |
| 金额非法 | `#amount-error` 红字，按钮 createOrder reject |
| 点击按钮 | SDK 重定向到 sandbox 银行页（弹窗或整页） |
| 授权返回 | `onApprove` → capture → 成功绿字 / 失败红字 |
| 取消 | `onCancel` → 「Payment cancelled.」 |
| SDK 失败 | 「✗ PayPal SDK failed to load」 |

---

## 5. 与现有样式复用

- `.sandbox-page` / `.sandbox-card` / `.sandbox-header` / `.provider-badge.badge-paypal`
- `.amount-row` / `.amount-group` / `.amount-input` / `.amount-input--error` / `.amount-error`
- `.sandbox-mode-badge` / `.sdk-loading` / `.sdk-spinner` / `.result-msg.success` / `.result-msg.error`
- 新增（如缺）：`.apm-notice`（说明条）、`.apm-mark`（Mark 容器间距）——可内联，不新建全局 CSS 文件。

---

## 6. inspect/probe 清单（前端）

> 遵循 [[feedback_v6_inspect_probe]]。

- [ ] 全局 SDK 名是 `paypalSDK` 还是 `paypal`；`FUNDING.IDEAL` 是否存在。
- [ ] `paypalSDK.Marks` 是否随 `components=...,marks` 可用。
- [ ] 点击按钮重定向是弹窗还是整页跳转；返回是否自动触发 `onApprove`（决定是否需要独立 return 页面）。
- [ ] iDEAL Button 是否需要先选行（bic）才渲染，还是重定向后选行。
- [ ] capture 返回的 `purchase_units[0].payments.captures[0].status` 实际值。
