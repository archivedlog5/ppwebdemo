# 实现计划 — Braintree Drop-in UI v1

> 日期：2026-06-11 · 关联：req / design-fe / design-be（同日 `*-braintree-dropin-ui.md`）
>
> ⚠️ 当前 Opus 模型下只能产出本计划（markdown）。实际写代码需切换到 Sonnet 等非 Opus 模型。

## 目标（Definition of Done）

`/braintree/server-sdk/dropin-ui` 上线，全量支付方式（信用卡/PayPal/Venmo/Apple Pay/Google Pay），USD/EUR 双币种各走正确 merchantAccountId，deviceData 收集并传递，transaction.sale 完整参数，满足 req 文档第 4 节全部完成标准。

## 改动文件清单

| # | 文件 | 动作 |
|---|------|------|
| 1 | `src/routes/braintree/server-sdk/dropin-ui.js` | 修改（当前为占位符） |
| 2 | `src/routes/braintree/server-sdk/_factory.js` | 修改（必须）：① 传 `currency` 给 EJS；② 增加 `clientTokenOptions(req)` 可选回调 |
| 3 | `src/views/braintree/server-sdk/dropin-ui.ejs` | 新建 |
| 4 | `src/public/js/braintree/server-sdk/dropin-ui.js` | 新建 |
| 5 | Supabase `demohub.products` | 确认已有 dropin-ui 行（enabled: true） |

## Step 1 — 确认 `_factory.js` GET handler 传 currency

检查 `_factory.js` 的 `res.render(view, {...})` 是否包含：

```js
currency: req.query.currency || 'USD',
```

若不存在则精准添加（只加这一行，不动其他逻辑）。

验收：`GET /braintree/server-sdk/dropin-ui?currency=EUR` → EJS 收到 `currency = 'EUR'`。

## Step 2 — 路由文件 `dropin-ui.js`

替换占位符，实现完整 `buildTransaction`：

```js
// src/routes/braintree/server-sdk/dropin-ui.js
const { createBraintreeRoute } = require('./_factory')

module.exports = createBraintreeRoute({
  productKey: 'dropin-ui',
  view:       'braintree/server-sdk/dropin-ui',

  buildTransaction: function (nonce, amount, extra) {
    var paymentType = extra.paymentType || ''
    var currency    = extra.currency    || 'USD'

    var params = {
      amount:             amount,
      paymentMethodNonce: nonce,
      deviceData:         extra.deviceData,
      merchantAccountId:  currency === 'EUR'
        ? process.env.BRAINTREE_US_EUR_MERCHANT_ACCOUNT_ID
        : process.env.BRAINTREE_US_USD_MERCHANT_ACCOUNT_ID,
      orderId: 'DEMO-BT-' + Date.now(),
      customer: {
        firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com',
      },
      billing: {
        firstName: 'John', lastName: 'Doe',
        streetAddress: '1 E Main St', extendedAddress: 'Suite 403',
        locality: 'Chicago', region: 'IL',
        postalCode: '60622', countryCodeAlpha2: 'US',
      },
      shipping: {
        firstName: 'John', lastName: 'Doe',
        streetAddress: '1 E Main St', extendedAddress: 'Suite 403',
        locality: 'Chicago', region: 'IL',
        postalCode: '60622', countryCodeAlpha2: 'US',
        shippingMethod: 'ground',
      },
      descriptor: { name: 'DEMO*BT DROPIN', phone: '3125551212', url: 'demo.paypal.com' },
      options: { submitForSettlement: true },
    }

    if (paymentType === 'PayPalAccount') {
      params.options.paypal = {
        description: 'Braintree Drop-in Demo Purchase',
        customField: 'dropin-demo',
      }
    }

    if (paymentType === 'VenmoAccount') {
      params.descriptor = { name: 'DEMO*BT DROPIN' }
    }

    return params
  },
})
```

验收：`GET /braintree/server-sdk/dropin-ui` 返回 200，不抛 500。

## Step 3 — EJS 视图 `dropin-ui.ejs`

页面结构（详见 FE 设计文档第 1 节）：

```html
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar
}) %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-braintree">Braintree · server-sdk · Drop-in UI</span>
    <h1><%= title %></h1>
    <p>Pre-built payment UI — card, PayPal, Venmo, Apple Pay, Google Pay</p>
  </div>

  <div class="sandbox-card">
    <!-- amount-row: currency select + amount input + Update button -->
    <div class="amount-row">
      <div class="currency-group">
        <label class="field-label" for="demo-currency">Currency</label>
        <select id="demo-currency" class="currency-select">
          <% ['USD','EUR'].forEach(function(c) { %>
            <option value="<%= c %>" <%= currency === c ? 'selected' : '' %>><%= c %></option>
          <% }) %>
        </select>
      </div>
      <div class="amount-group">
        <label class="field-label" for="demo-amount">Amount</label>
        <div class="amount-input-wrapper">
          <input id="demo-amount" class="amount-input" type="text" inputmode="decimal"
            value="<%= defaultAmount %>" placeholder="0.00" />
        </div>
      </div>
      <div class="currency-group" style="align-self:flex-end">
        <button id="update-btn" class="currency-select" style="cursor:pointer;background:var(--accent);color:#fff;border:none;border-radius:6px;padding:0 16px;height:36px">Update</button>
      </div>
    </div>

    <span class="sandbox-mode-badge" style="display:inline-block;margin-bottom:16px">⚡ Sandbox Mode</span>

    <div id="dropin-container"></div>

    <button id="pay-btn" class="pay-btn pay-btn-paypal" type="button" disabled>Pay Now</button>

    <div class="result-msg" id="result" role="alert" aria-live="polite"></div>
    <div class="test-hint">Test card: <strong>4111 1111 1111 1111</strong> · Any future date · Any CVV</div>
  </div>
</div>

<script>
  window.DEMO = {
    clientToken: '<%- clientToken %>',
    amount:      '<%= defaultAmount %>',
    currency:    '<%= currency %>',
    urls: {
      transaction: '/braintree/server-sdk/api/dropin-ui/transaction',
    },
  }
</script>
<script src="https://js.braintreegateway.com/web/dropin/1.46.1/js/dropin.min.js"></script>
<script src="/js/braintree/server-sdk/dropin-ui.js"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

## Step 4 — 前端 JS `dropin-ui.js`

IIFE 包裹，从 `window.DEMO` 读配置：

```js
;(function () {
  'use strict'

  var currentAmount   = DEMO.amount
  var currentCurrency = DEMO.currency
  var dropinInstance  = null

  function showResult(msg, type) {
    var el = document.getElementById('result')
    el.textContent = msg
    el.className   = 'result-msg result-msg--' + type
  }

  // ── Drop-in 初始化 ──────────────────────────────────────
  braintree.dropin.create({
    authorization: DEMO.clientToken,
    container:     '#dropin-container',
    dataCollector: true,
    card:      { cardholderName: { required: true } },
    paypal:    { flow: 'checkout', amount: DEMO.amount, currency: DEMO.currency, commit: true },
    venmo:     { allowNewBrowserTab: false },
    applePay:  {
      displayName:    'Braintree Demo',
      paymentRequest: { total: { label: 'Braintree Demo', amount: DEMO.amount } },
    },
    googlePay: {
      googlePayVersion: 2,
      transactionInfo: {
        totalPriceStatus: 'FINAL',
        totalPrice:       DEMO.amount,
        currencyCode:     DEMO.currency,
      },
    },
  }, function (err, instance) {
    if (err) { showResult('✗ Drop-in init failed: ' + err.message, 'error'); return }
    dropinInstance = instance
    wireDropIn(instance)
  })

  // ── 金额 / 币种更新（updateConfiguration，无需重载） ───
  function applyUpdate(instance, newAmount, newCurrency) {
    instance.updateConfiguration('paypal', 'flow',     'checkout')
    instance.updateConfiguration('paypal', 'amount',   newAmount)
    instance.updateConfiguration('paypal', 'currency', newCurrency)
    instance.updateConfiguration('applePay', 'paymentRequest', {
      total: { label: 'Braintree Demo', amount: newAmount },
    })
    instance.updateConfiguration('googlePay', 'transactionInfo', {
      totalPriceStatus: 'FINAL',
      totalPrice:       newAmount,
      currencyCode:     newCurrency,
    })
    currentAmount   = newAmount
    currentCurrency = newCurrency
  }

  // ── 事件绑定 ────────────────────────────────────────────
  function wireDropIn(instance) {
    var payBtn = document.getElementById('pay-btn')

    if (instance.isPaymentMethodRequestable()) payBtn.disabled = false

    instance.on('paymentMethodRequestable',   function () { payBtn.disabled = false })
    instance.on('noPaymentMethodRequestable', function () { payBtn.disabled = true })

    document.getElementById('update-btn').addEventListener('click', function () {
      var newAmount   = document.getElementById('demo-amount').value   || currentAmount
      var newCurrency = document.getElementById('demo-currency').value || currentCurrency
      applyUpdate(instance, newAmount, newCurrency)
    })

    payBtn.addEventListener('click', function () { onPayClick(instance, payBtn) })
  }

  // ── 支付主流程 ──────────────────────────────────────────
  function onPayClick(instance, payBtn) {
    payBtn.disabled = true

    instance.requestPaymentMethod(function (err, payload) {
      if (err) {
        showResult('✗ ' + err.message, 'error')
        payBtn.disabled = false
        return
      }

      console.log('[dropin] requestPaymentMethod payload:', payload)

      fetch(DEMO.urls.transaction, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nonce:       payload.nonce,
          deviceData:  payload.deviceData,
          paymentType: payload.type,
          amount:      currentAmount,
          currency:    currentCurrency,
        }),
      })
        .then(function (r) { return r.json() })
        .then(function (data) {
          if (data.error) {
            showResult('✗ ' + data.error, 'error')
            instance.clearSelectedPaymentMethod()
            payBtn.disabled = false
          } else {
            showResult(
              '✓ ' + data.status + ' · TX: ' + data.transactionId + ' · ' + payload.type,
              'success'
            )
          }
        })
        .catch(function (e) {
          showResult('✗ Network error: ' + e.message, 'error')
          payBtn.disabled = false
        })
    })
  }
})()
```

## Step 5 — 测试验证

访问 `http://localhost:3000/braintree/server-sdk/dropin-ui`：

| 用例 | 操作 | 期望结果 |
|------|------|---------|
| T1 信用卡 | `4111 1111 1111 1111` + Pay Now | `✓ submitted_for_settlement · TX: ... · CreditCard` |
| T2 PayPal | PayPal 授权 + Pay Now | `✓ submitted_for_settlement · TX: ... · PayPalAccount` |
| T3 金额更新 | 改金额 → Update | PayPal sheet 显示新金额 |
| T4 USD→EUR | 切换 EUR → Update | 后端日志 `merchantAccountId: cwenEUR` |
| T5 EUR→USD | 切换 USD → Update | 后端日志 `merchantAccountId: cwen` |
| T6 交易失败 | 无效 nonce | 显示错误 + clearSelectedPaymentMethod，Pay Now 重新 enabled |
| T7 console | 任意支付 | `[dropin] requestPaymentMethod payload:` 含 type / deviceData |
| T8 Pay Now 状态 | 初始 / card 填好前 | disabled；填好后 enabled |

## 风险 / 待确认

| # | 风险 | 处理 |
|---|------|------|
| W1 | `updateConfiguration` 调用后 PayPal 授权账号被清除 | 预期行为，SDK 文档说明；可在页面加提示 |
| W2 | Apple Pay 在 localhost HTTP 不显示 | 预期；提示需 HTTPS |
| W3 | Venmo 桌面不显示（`allowNewBrowserTab: false`） | 预期；`getAvailablePaymentOptions()` 可确认 |
| W4 | `_factory.js` GET handler 未传 `currency` | Step 1 先确认，必要时修改 |
| W5 | Venmo `options.venmo.profileId` 沙盒是否需要 | 不传，沙盒不强制；记 debug-log 如出错 |

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | CLEAR | Round 1: 4 blockers, 5 medium/low. Round 2: 4 decisions resolved (D1–D4), 0 unresolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** ENG CLEARED (2nd pass) — ready to implement.

NO UNRESOLVED DECISIONS

---

### Round 2 Decisions (2026-06-12)

| D# | 发现 | 决策 |
|----|------|------|
| D1 | 计划主体 Steps 1–5 仍为旧架构，与第一轮 blockers 和 FE/BE 设计文档不一致 | 更新计划主体至正确架构 |
| D2 | `wireDropIn()` 每次 recreate 都给 `payBtn` 追加 click 监听器，多次 recreate 后重复调用旧 instance | 改用 `payBtn.onclick = …` 赋值（自动替换） |
| D3 | 测试矩阵缺少 3DS toggle 本身触发 teardown+recreate 的验证 | 新增 T12 |
| D4 | 3DS toggle 对 Google Pay 的影响（用户备注：Google Pay 也有 3DS） | 保持现有实现，Braintree Drop-in 内部处理；后续 GooglePay-3DS 单独 demo |

---

### 架构（最终确认）

已确认正确：

- `threeDSecure: true`（boolean）在 `dropin.create()` 时传入；`threeDSecureParameters`（含 amount/billingAddress）在 `requestPaymentMethod()` 时传入。这是 Braintree Drop-in 3DS 文档规定的标准模式。
- `clientTokenOptions(req)` 回调在 `_factory.js` GET handler 调用，dropin-ui 传入 merchantAccountId-aware 实现；其他路由不传，行为完全不变。
- currency 变更 → 页面 reload（`?currency=EUR&amount=...`）取新 clientToken；amount 变更 / 3DS toggle → `teardownAndRecreate()`（同 clientToken）。
- `_factory.js` POST handler 已有 `const { nonce, amount, ...extra } = req.body`，currency、paymentType、deviceData 均在 `extra` 中，`buildTransaction` 正常接收。

---

### 测试矩阵（最终版，含 Round 2 新增）

| 用例 | 操作 | 期望结果 |
|------|------|---------|
| T1 信用卡 | `4111 1111 1111 1111` + Pay Now | `✓ submitted_for_settlement · CreditCard` |
| T2 PayPal | PayPal 授权 + Pay Now | `✓ submitted_for_settlement · PayPalAccount` |
| T3 金额更新 | 改金额 → Update | teardown+recreate，PayPal sheet 显示新金额 |
| T4 USD→EUR | 切换 EUR → Update | 页面 reload → 后端日志 `merchantAccountId: cwenEUR` |
| T5 EUR→USD | 切换 USD → Update | 页面 reload → 后端日志 `merchantAccountId: cwen` |
| T6 交易失败 | 无效 nonce | 显示错误 + clearSelectedPM + Pay Now re-enabled |
| T7 Console | 任意支付 | `[dropin] requestPaymentMethod payload:` 含 type/deviceData |
| T8 Pay Now 状态 | 初始 / card 填好前 | disabled；填好后 enabled |
| T9 3DS 开启 | 勾选 Enable 3DS → `4000000000001091` → Pay Now | Drop-in 触发 3DS challenge；通过后 TX submitted_for_settlement |
| T10 3DS 关闭 | 不勾选 → `4111 1111 1111 1111` → Pay Now | 无 3DS challenge；正常 submitted_for_settlement |
| T11 后端日志 | 任意支付成功 | 终端打印完整 buildTransaction params（含 billing/shipping/descriptor/customer） |
| T12 3DS toggle | 初始化完成后勾选 Enable 3DS | `#dropin-container` 清空再填充（teardown+recreate），Pay Now 重新 disabled 等待填卡 |

---

### 失败模式（最终版）

| 失败场景 | 测试 | 错误处理 | 用户可见 |
|----------|------|---------|---------|
| `clientToken.generate` 失败 | — | 工厂 catch → 500 | GET 500 页面 |
| EUR env var 未设置（GET） | — | `clientTokenOptions` 返回 `{}`，静默用 default | 静默（warn 仅在 POST） |
| `dropin.create` 失败 | — | showResult '✗ Drop-in init failed' | ✓ 显示 |
| `requestPaymentMethod` 失败 | T6/T9 | showResult + re-enable Pay Now | ✓ 显示 |
| 3DS challenge 取消 | T6（间接） | requestPaymentMethod err 分支 | ✓ 显示 |
| `transaction.sale` decline | T6 | 工厂返回 400 JSON | ✓ 显示 |
| `merchantAccountId` env var 缺失（POST） | — | console.warn | 静默 |
| 网络错误 fetch | T6（间接） | `.catch` → showResult | ✓ 显示 |
| Apple Pay / Google Pay 不可用 | — | Drop-in 自动隐藏 | 预期行为 |
| Venmo 桌面 | — | Drop-in 自动隐藏 | 预期行为 |

---

### NOT in scope

- Apple Pay 生产域名验证（需 HTTPS + merchant domain）
- Google Pay 生产域名注册
- Venmo 桌面（intentional: `allowNewBrowserTab: false`）
- 自动化测试套件
- GooglePay + 3DS 深度集成 demo（后续单独开）

### What already exists

- `_factory.js`：完整 GET+POST scaffold；POST handler 已有 `...extra` spread，currency 已传
- `_config.js`：lazy multi-region gateway init
- `dropin-ui.js`：stub（200 "Coming soon"）已在 `app.js` 挂载，无需再改 `app.js`

### Parallelization

Sequential implementation — all 4 files touch the same Braintree server-sdk module. No parallelization opportunity.

---

## Round 3 — 实现后修正记录（2026-06-12）

**状态：IMPLEMENTED ✅**

### 实现修正

| # | 问题 | 修正 | 文件 |
|---|------|------|------|
| F1 | `card: { cardholderName: { required: true } }` 增加了不需要的姓名字段 | 改为 `card: {}`（移除 cardholderName）| `public/js/.../dropin-ui.js` |
| F2 | CVV 字段未显示 | 根本原因：CVV 显示由 Braintree merchant account 的 AVS/CVV 设置控制，非前端参数。需在 Braintree 控制台 Settings → Processing → CVV 开启验证 | 无代码改动 |
| F3 | `descriptor.url: 'demo.paypal.com'` 超出 13 字符限制（15 字符）导致 400 | 改为 `url: 'cwen5.com'`（9 字符）| `routes/.../dropin-ui.js` |
| F4 | `showResult` CSS 类名 bug：`'result-msg result-msg--success'` 无法匹配 `.result-msg.success` | 改为 `'result-msg ' + type`（空格分隔，匹配 sandbox.css）| `public/js/.../dropin-ui.js` |
| F5 | 交易成功后 Pay Now 仍可点击，重用 nonce 报 `Cannot use a payment_method_nonce more than once` | 成功后隐藏 Pay Now，显示 `#reset-btn`（New Payment，Braintree 紫色）；点击调 `teardownAndRecreate()` 回到支付方式选择界面 | `dropin-ui.ejs` + `dropin-ui.js` |

### 新增功能

**结果展示增强：**
- `#result`：单行状态文字（原有）
- `#response-data`（`<pre>`）：成功后展示格式化 JSON 响应（`transactionId` + `status` 等）
- `showResponseData(data)` / `clearResponseData()` 辅助函数

**支付成功后 UI 流程（New Payment 按钮）：**
```
支付成功
  → #result 显示 "✓ submitted_for_settlement · TX: ... · CreditCard"
  → #response-data 展示 { "transactionId": "...", "status": "..." }
  → #pay-btn 隐藏（display:none）
  → #reset-btn "New Payment"（紫色）出现

点击 New Payment
  → clearResponseData() + 清空 #result
  → teardownAndRecreate()
    → recreateDropIn() 内：pay-btn.style.display=''，reset-btn 隐藏，dropin-container 清空
    → Drop-in 重新初始化（新 nonce，用户可重选支付方式）
```

**`recreateDropIn()` 新增职责：**
```js
payBtn.style.display = ''          // 恢复 Pay Now 可见
document.getElementById('reset-btn').style.display = 'none'  // 隐藏 New Payment
```

### 最终测试矩阵补充

| T# | 操作 | 期望结果 |
|----|------|---------|
| T13 | 信用卡支付成功 | #result 绿色 + #response-data JSON 块显示 + Pay Now 消失 + New Payment 出现 |
| T14 | 点击 New Payment | Drop-in teardown+recreate → 回到方式选择界面 → Pay Now disabled + New Payment 消失 |
| T15 | 支付失败 | #result 红色 + #response-data 隐藏 + Pay Now re-enabled + clearSelectedPaymentMethod |

---

## Round 4 — 常量提取重构（2026-06-12）

### 新增文件

**`src/config/bt-constants.js`**（新建）— 仿 PayPal `constants.js` 结构，集中管理所有 Braintree demo 硬编码值：

| 分组 | 常量 | Demo 值 |
|------|------|---------|
| 账单联系人 | `BILLING_FIRST_NAME`, `BILLING_LAST_NAME`, `BILLING_EMAIL`, `BILLING_PHONE` | John Doe · Chicago IL |
| 账单地址 | `BILLING_STREET_ADDRESS`, `BILLING_EXTENDED_ADDRESS`, `BILLING_LOCALITY`, `BILLING_REGION`, `BILLING_POSTAL_CODE`, `BILLING_COUNTRY_CODE` | 1 E Main St, Suite 403, Chicago IL 60622 US |
| 收货联系人 | `SHIPPING_FIRST_NAME`, `SHIPPING_LAST_NAME` | Jane Smith |
| 收货地址 | `SHIPPING_STREET_ADDRESS`, `SHIPPING_EXTENDED_ADDRESS`, `SHIPPING_LOCALITY`, `SHIPPING_REGION`, `SHIPPING_POSTAL_CODE`, `SHIPPING_COUNTRY_CODE` | 456 Market St, Apt 12, San Francisco CA 94105 US |
| 收货方式 | `SHIPPING_METHOD` | `'ground'` |
| 描述符 | `DESCRIPTOR_NAME`, `DESCRIPTOR_PHONE`, `DESCRIPTOR_URL` | — |
| PayPal 专属 | `PAYPAL_DESC`, `PAYPAL_FIELD` | — |

### 路由文件重构

`src/routes/braintree/server-sdk/dropin-ui.js`：
- 移除文件内所有 `var` 常量声明
- 头部加 `const C = require('../../../config/bt-constants')`
- `buildTransaction` 内所有硬编码字符串改用 `C.XXX` 引用

### 前端 JS 常量（保持内联，同步拆分）

`src/public/js/braintree/server-sdk/dropin-ui.js` 运行在浏览器，无法 `require()`。常量以 `var` 声明在 IIFE 顶部常量块中，同样拆为 `BILLING_*` / `SHIPPING_*` 两组，与服务端各自维护一份：
- `BILLING_*`：用于 3DS `requestOpts.threeDSecure.billingAddress`
- `SHIPPING_*`：用于 3DS `requestOpts.threeDSecure.additionalInformation.shippingAddress`

### 引入规范（写入 demo-hub CLAUDE.md 规则 8）

- PayPal 路由：`const C = require('../../../config/constants')`
- Braintree 路由：`const C = require('../../../config/bt-constants')`
- 前端 JS：`var` 常量块在 IIFE 顶部，不用 require

---

## Round 5 — 交互优化 + 响应扩展（2026-06-12）

### 删除 Update 按钮，改为自动触发

| 控件 | 之前 | 之后 |
|------|------|------|
| #demo-currency | 选择后需点 Update | `change` 事件自动 reload（携带 amount） |
| #demo-amount | 修改后需点 Update | `change` 事件自动更新 `currentAmount` + `updateConfiguration` |
| Update 按钮 | 存在 | **删除**（EJS + wireControls 均移除） |
| 3DS toggle | 已是自动 | 不变 |

**amount `change` 不需要 teardown 的原因：** Drop-in 只收集支付方式 nonce，金额经 POST body 传给后端。`updateConfiguration` 仅同步 PayPal / Apple Pay / Google Pay 弹窗中显示的金额，不触发重建；对不可用支付方式静默忽略。

### 扩展 POST 响应字段（`_factory.js`）

从只返回 `transactionId + status` 扩展为包含完整交易信息：

**通用字段：** `amount`, `currencyIsoCode`, `orderId`, `merchantAccountId`, `paymentInstrumentType`, `createdAt`

**按支付方式追加（互斥）：**
- `card`：`cardType`, `last4`, `bin`, `expirationDate`
- `paypal`：`payerEmail`, `payerId`, `authorizationId`
- `venmo`：`username`, `venmoUserId`
- `applePay`：`cardType`, `last4`, `paymentInstrumentName`
- `googlePay`：`cardType`, `last4`, `sourceCardType`, `sourceCardLast4`

前端 `#response-data` 块展示完整 JSON，方便开发者直观看到交易详情。

---

## Round 6 — lineItems + descriptor 修正（2026-06-12）

### `bt-constants.js` 新增商品行项常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `LINE_ITEM_NAME` | `"Demo Product"` | 商品名，max 35 chars |
| `LINE_ITEM_KIND` | `"debit"` | 扣款类型 |
| `LINE_ITEM_QUANTITY` | `"1"` | 数量（字符串） |
| `LINE_ITEM_UNIT_OF_MEASURE` | `"each"` | 单位 |
| `LINE_ITEM_DESCRIPTION` | `"Braintree Drop-in Demo Purchase"` | 商品描述 |
| `LINE_ITEM_PRODUCT_CODE` | `"BT-DEMO-001"` | SKU，max 12 chars |
| `LINE_ITEM_COMMODITY_CODE` | `"43231500"` | UNSPSC 商品分类码 |
| `LINE_ITEM_URL` | `"https://cwen5.com"` | 商品页 URL |

`unitAmount` / `totalAmount` 为动态值（= transaction `amount`），在 `buildTransaction` 内注入，不能抽成常量。`totalAmount` 必须等于 `quantity × unitAmount`，Braintree 会校验。

### `buildTransaction` 新增 `lineItems`

在 `descriptor` 前插入 `lineItems` 数组（Level 3 数据，传给处理器）。

### descriptor 修正

`DESCRIPTOR_NAME` 从 `"CWEN*BT DROPIN"`（DBA=4，PayPal 报错）改为 `"CWEN5BT*DROPIN"`（DBA=7，product=6，总长 14，符合 PayPal 3/7/12 规则）。

---

## Round 7 — 3DS CVV 修复 + 测试卡更正（2026-06-12）

### 问题

启用 3DS 后信用卡交易报 `Gateway Rejected: cvv`；无 3DS 时正常。原因：Drop-in 默认 `vaultCard: true`，在 3DS + CVV rules 同时存在时 default vaulting 行为会导致 processor CVV 错误（Braintree 3DS 文档 Note）。

### 修复

`buildDropInOptions` 的 `card` 配置：

```js
card: {
  vaultCard: false,  // 禁用 Drop-in 层 vaulting；3DS + CVV rules 组合下必须
  overrides: {
    fields: {
      cvv: { placeholder: '•••' },  // 显式渲染 CVV 字段
    },
  },
}
```

如需 vault 卡，应在后端 `transaction.sale` 的 `options.storeInVaultOnSuccess: true` 处理。

### 隐藏 Drop-in 标题

Drop-in 默认顶部显示 "Choose a way to pay" 标题，通过 `translations` 选项设为空字符串隐藏：

```js
translations: { chooseAWayToPay: '' }
```

`translations` 支持覆盖任意 Drop-in 内置文字，设为空字符串后元素渲染为空，视觉上消失。

### `threeDSecureAuthenticationId` 说明

Braintree 提供两条 3DS 路径：

| 路径 | 场景 | transaction.sale 写法 |
|------|------|-----------------------|
| **enriched nonce**（Drop-in / Hosted Fields） | 首次支付，Drop-in 完成 3DS 后返回 3DS enriched nonce | `paymentMethodNonce: nonce`（够了，nonce 已含 3DS 认证数据） |
| **token + authId**（vaulted 卡） | 返回用户，持有 vaulted 卡的 token，单独跑 3DS 拿到 authId | `paymentMethodToken: token` + `threeDSecureAuthenticationId: authId`（可选加 cvvOnlyNonce） |

**Drop-in demo 用 enriched nonce 路径，不需要传 `threeDSecureAuthenticationId`。** 该字段仅在持有 vault token 的场景（如 vault-return demo）下才需要。

### 3DS 沙盒测试卡更正

| 卡号 | 品牌 | 用途 |
|------|------|------|
| `4111 1111 1111 1111` | Visa | 无 3DS，标准测试 |
| `5200000000002151` | **Mastercard**（非 Visa） | 3DS friction challenge |
| `340000000002534` | Amex | 3DS friction challenge |

---

## Round 8 — Toggle 开关 UI 重构 + Drop-in 空白修复（2026-06-12）

### 3DS Toggle：pill switch，点文字不触发

**问题：** 原 `<label>` 包裹整行（checkbox + 文字），点文字也会切换状态。

**方案：** `<label for="...">` 只包裹视觉 pill，文字改为独立 `<span>`（非 label，不关联 input）。

```html
<input type="checkbox" id="threeds-toggle" class="threeds-input" />
<label for="threeds-toggle" class="threeds-switch"></label>
<span class="threeds-label">Enable 3DS Verification</span>
```

**CSS 关键点：**
- `threeds-input`：`position:absolute; opacity:0; pointer-events:none`（隐藏但保留可访问性）
- `threeds-switch`：36×20px pill，`border: 1.5px solid var(--border-hi)`（dark `#475569` / light `#CBD5E1`，两主题均可见）
- checked 状态：绿色半透明轨道 + `var(--accent)` 滑块，0.2s ease 过渡
- `threeds-label`：普通 span，`user-select:none`，点击无效

### Drop-in 内置元素两个问题及处理

| 问题 | 原因 | 解法 |
|------|------|------|
| "Choose a way to pay" 标题 | Drop-in 默认渲染 | `translations: { chooseAWayToPay: '' }` 清空文字 |
| 清空后仍有大块空白 | `.braintree-placeholder` 元素还在，保留了 margin/padding | scoped CSS `.braintree-placeholder { display: none }` |

**注意：** 元素类名是 `.braintree-placeholder`（不是 `.braintree-heading`），通过浏览器 DevTools 实测确认。

---

## Round 9 — PayPal 参数扩充 + 买家联系方式回传（2026-06-12）

### 前端 Drop-in PayPal 配置全量化

`buildDropInOptions` 内提取 `paypalConfig` 局部变量，`paypal` 和 `paypalCredit` 共享引用：

| 参数 | 值 | 说明 |
|------|-----|------|
| `flow` | `'checkout'` | 一次性结账 |
| `intent` | `'capture'` | 对应后端 `submitForSettlement: true` |
| `offerCredit` | `true` | 提供 PayPal Credit 选项 |
| `displayName` | `PAYPAL_DISPLAY_NAME` | PayPal 弹窗中显示的商户名 |
| `enableShippingAddress` | `true` | 返回买家收货地址 |
| `shippingAddressEditable` | `false` | 使用 `shippingAddressOverride` 预填，不可编辑 |
| `landingPageType` | `PAYPAL_LANDING_PAGE` = `'login'` | 弹窗落地页类型 |
| `userAction` | `'COMMIT'` | 替换旧 `commit: true` |
| `shippingAddressOverride` | SHIPPING_* 常量 + `recipientName` | 预填收货地址 |
| `lineItems` | PP_ITEM_* 常量 + 动态 `unitAmount` | 商品行项 |
| `amountBreakdown` | `{ itemTotal: currentAmount }` | 金额明细 |

`paypalCredit: paypalConfig` 引用同一对象，`updateConfiguration` 时用 `forEach` 同步两者。

新增前端 IIFE 常量：`PAYPAL_DISPLAY_NAME`、`PAYPAL_LANDING_PAGE`、`PP_ITEM_*`（6 个）。

### 买家联系方式从 payload.details 回传

**数据流：**
```
PayPal 授权完成 → payload.details
  .email       = "cwenup2025@personal.com"
  .phone       = "3125551212"
  .countryCode = "US"

前端 fetch body 新增：
  payerEmail / payerPhone / payerCountry

后端 buildTransaction（PayPalAccount 分支）：
  customer.email            ← payerEmail（覆盖常量默认值）
  customer.internationalPhone ← COUNTRY_DIAL_MAP["US"]="1" + nationalNumber
  shipping.internationalPhone ← 同上
```

**新增常量（`bt-constants.js`）：**

| 常量 | 说明 |
|------|------|
| `COUNTRY_DIAL_MAP` | ISO 3166-1 alpha-2 → 电话区号；覆盖 US/CA/GB/AU/DE/FR 等 18 个国家 |
| `TAX_AMOUNT` | `"0.00"`，Level 2，对应前端 `amountBreakdown.taxTotal` |
| `PURCHASE_ORDER_NUMBER` | `"PO-DEMO-001"`，Level 2 |

**后端 `buildTransaction` 新增（`PayPalAccount` 分支内）：**
- `customer.internationalPhone` / `shipping.internationalPhone` = `{ countryCode, nationalNumber }` |
- fallback: `COUNTRY_DIAL_MAP[payerCountry] || '1'`（未知国家默认 US 区号）
