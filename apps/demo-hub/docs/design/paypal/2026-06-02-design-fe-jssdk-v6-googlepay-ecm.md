# 前端设计 — JSSDK v6 Google Pay ECM

> 日期：2026-06-02 · 关联：design-be / plan（同日 `*-jssdk-v6-googlepay-ecm.md`）
>
> ⚠️ 当前 Opus 模型下只能产出本设计（markdown）。实际写代码需切换到 Sonnet 等非 Opus 模型。

## 1. 目标

`/paypal/jssdk-v6/googlepay-ecm` 前端：UI 完全参考 v5 googlepay-ecm（官方 Google Pay 按钮 + 客制化按钮，两者同一点击流程）；Google Pay JS 函数骨架模仿 v5，但用 v6 SDK API 形态实现。**付款流程采用 v5-style Promise 模式**（不用 v6 参考 demo 的 callback 模式）。

## 2. v6 Google Pay 与 v5 的 SDK 差异（核心）

| 步骤 | v5 | v6 |
|------|----|----|
| 取 SDK | 全局 `paypalSDK.Googlepay()`（同步） | `await getPPInstance()` → `instance.createGooglePayOneTimePaymentSession()`（同步） |
| 取配置 | `paypalSDK.Googlepay().config()` → `{allowedPaymentMethods, merchantInfo, apiVersion, apiVersionMinor, countryCode}` | `findEligibleMethods().getDetails('googlepay').config` + `session.formatConfigForPaymentRequest(config)` |
| 账号资格 | 无（仅 `isReadyToPay`） | `findEligibleMethods({currencyCode}).isEligible('googlepay')`（外加 `isReadyToPay`） |
| 确认订单 | `paypalSDK.Googlepay().confirmOrder({orderId, paymentMethodData})` | `googlePaySession.confirmOrder({orderId, paymentMethodData})` |
| 3DS | `initiatePayerAction` → GET order → `handle3DS` | **probe-then-decide**（§6） |
| createOrder 响应 | `d.id` | `d.orderId`（小写 d） |

> `PaymentsClient` 本身仍来自 Google 的 `pay.js`（与 v5 相同），**ECM 不传 `paymentDataCallbacks`**（Promise 模式，v5 规则 14）。v6 只改变"从 PayPal 取 config / session / confirmOrder"这部分。

## 3. 文件

| 文件 | 动作 |
|------|------|
| `src/views/paypal/jssdk-v6/googlepay-ecm.ejs` | 新建 |
| `src/public/js/paypal/jssdk-v6/googlepay-ecm.js` | 新建 |

## 4. EJS 视图（googlepay-ecm.ejs）

结构复制 v5 `views/paypal/jssdk-v5/googlepay-ecm.ejs`，改动：
- header include **去掉 `sdkUrl` 和 `extraScripts`**（v6 SDK + Google Pay pay.js 都在 body 自行加载）。
- provider-badge 文案：`PayPal · JSSDK v6 · Google Pay`。
- 货币下拉用 `supportedCurrencies.forEach`（与 v6 acdc/applepay 一致），保留金额输入 + `amount-error`。
- **保留 v5 的 3DS/SCA 选择器** `#demo-sca`（`SCA_WHEN_REQUIRED` / `SCA_ALWAYS`）——因 create-order 参数要求与 v5 一致。
- 保留 v5 的"Shipping Address & Phone（商户预填、不在 Google Pay sheet 显示）"展示块，数据来自 `sandboxShipping` + `sandboxPhone`。
- 容器：`#paypal-button-container`（官方按钮挂载点，初始 `sdk-loading` spinner）+ `#custom-googlepay-btn`（客制化按钮，初始 `disabled`，样式逐字沿用 v5 内联样式）+ `#result`。

底部注入：

```html
<script>
  window.DEMO = {
    clientId:   '<%= clientId %>',
    components: ['googlepay-payments'],
    pageType:   'checkout',
    urls: {
      createOrder:  '/paypal/jssdk-v6/api/googlepay-ecm/create-order',
      getOrder:     '/paypal/jssdk-v6/api/googlepay-ecm/order',
      captureOrder: '/paypal/jssdk-v6/api/googlepay-ecm/capture-order',
    },
    shipping: <%- JSON.stringify(sandboxShipping) %>,
  }
</script>
<script src="/js/paypal/jssdk-v6/init.js"></script>
<script src="/js/paypal/jssdk-v6/googlepay-ecm.js"></script>
<script src="https://pay.google.com/gp/p/js/pay.js"></script>
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>
```

> 脚本顺序：init → 产品 JS → Google Pay pay.js → v6 core（defer）。产品 JS 用 `window.addEventListener('load')` 等待，此时 `window.paypal` 与 `window.google.payments` 均就绪。

## 5. 前端 JS（public/js/paypal/jssdk-v6/googlepay-ecm.js）

IIFE + `'use strict'`。搬运 v5 的辅助函数：`getCurrency / getAmount / getSCA / isZeroDecimal / validateAmount / showResult / clearLoading` + 货币切换 reload + 金额 blur 格式化。`ZERO_DECIMAL` / `BASE_REQUEST` / `MIN/MAX_AMOUNT` 沿用。模块级状态：`paymentsClient`（Google 单例）、`urls`（来自 `window.DEMO.urls`）。

### 5.1 入口 `onPayPalWebSdkLoaded()`（替代 v5 `window.load` 内的 config 链）

```
getPPInstance()
  .then(function (instance) {
    inspect('instance', instance)
    // Google Pay SDK 可用性检查（v5 同款）：window.google && google.payments.api.PaymentsClient
    if (!googleSdkOk) { clearLoading(); showResult('Google Pay SDK is not available', 'error'); return }
    return instance.findEligibleMethods({ currencyCode: getCurrency() })   // V6-3 嵌套
      .then(function (eligibility) {
        inspect('eligibility', eligibility)
        if (eligibility.isEligible('googlepay')) {
          var details = eligibility.getDetails('googlepay')
          inspect('googlepay details', details)
          setupGooglePayButton(instance, details)
        } else {
          clearLoading(); showResult('Google Pay is not eligible for this account.', 'error')
        }
      })
  })
  .catch(function (err) { clearLoading(); showResult('✗ Google Pay config error: ' + (err.message || String(err)), 'error') })
```

- **V6-3**：`instance` 必须在嵌套 `.then()` 作用域内。
- Google Pay SDK 缺失 → 与 v5 一致的提示（`window.google.payments` 不存在）。

### 5.2 `setupGooglePayButton(instance, details)`（对照 v5 同名函数）

```
var googlePaySession = instance.createGooglePayOneTimePaymentSession()   // 同步；inspect()
inspect('googlePaySession', googlePaySession)
var googlePayConfig = googlePaySession.formatConfigForPaymentRequest(details.config)   // v6 取代 v5 config()
inspect('googlePayConfig', googlePayConfig)

var client = new google.payments.api.PaymentsClient({ environment: 'TEST' })   // ⚠️ 不传 paymentDataCallbacks（Promise 模式）
// 缓存到模块级 paymentsClient（v5 的 getGooglePaymentsClient 单例语义）

client.isReadyToPay({
  allowedPaymentMethods: googlePayConfig.allowedPaymentMethods,
  apiVersion:            googlePayConfig.apiVersion,
  apiVersionMinor:       googlePayConfig.apiVersionMinor,
}).then(function (resp) {
  inspect('isReadyToPay', resp)
  if (!resp.result) { clearLoading(); showResult('Google Pay is not available on this device or account.', 'error'); return }
  // 官方按钮
  var btn = client.createButton({
    buttonColor: 'black', buttonType: 'pay', buttonSizeMode: 'fill',
    onClick: function () { onGooglePaymentButtonClicked(googlePaySession, googlePayConfig) },
  })
  var container = clearLoading(); container.appendChild(btn)
  // 客制化按钮 #custom-googlepay-btn：disabled=false + 沿用 v5 hover/active 内联样式监听 +
  //   addEventListener('click', function(){ onGooglePaymentButtonClicked(googlePaySession, googlePayConfig) })
})
```

> 与 applepay-ecm 一样：官方按钮 + 客制按钮**同一 handler**，参数为 `(googlePaySession, googlePayConfig)`。

### 5.3 `getGooglePaymentDataRequest(config, amount, currency)`（沿用 v5）

```
Object.assign({}, BASE_REQUEST, {
  allowedPaymentMethods: config.allowedPaymentMethods,
  merchantInfo:          config.merchantInfo,
  transactionInfo: { countryCode: 'US', currencyCode: currency, totalPriceStatus: 'FINAL', totalPrice: amount, totalPriceLabel: 'Total' },
  shippingAddressRequired: false,    // ECM
  emailRequired:           true,     // 从 sheet 取 email
})
```

> `config` 来自 `formatConfigForPaymentRequest`（已含 allowedPaymentMethods / merchantInfo / apiVersion / apiVersionMinor / countryCode）；transactionInfo 的 `countryCode` 可优先用 `config.countryCode`，inspect 后确认。

### 5.4 `onGooglePaymentButtonClicked(googlePaySession, googlePayConfig)`（点击，Promise 模式）

```
if (!validateAmount()) return
var amount = getAmount(), currency = getCurrency(), sca = getSCA()
var shipping = window.DEMO && window.DEMO.shipping
var req = getGooglePaymentDataRequest(googlePayConfig, amount, currency)

paymentsClient.loadPaymentData(req)        // sheet 打开（仅 email，无地址选择）
  .then(function (paymentData) {            // sheet 关闭 → email 可用
    inspect('loadPaymentData paymentData', paymentData)
    var email = paymentData.email || null
    var body = { amount: amount, currency: currency, shipping: shipping, scaMethod: sca, email: email }
    return fetch(urls.createOrder, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      .then(function (r) { return r.json() })
      .then(function (d) {
        inspect('createOrder response', d)
        if (d.error) throw new Error(d.error)
        return processPayment(d.orderId, paymentData, googlePaySession)   // ⚠️ v6 小写 d.orderId
      })
  })
  .catch(function (err) {
    if (err && err.statusCode === 'CANCELED') return    // 用户取消，静默
    showResult('✗ ' + (err.message || String(err)), 'error')
  })
```

### 5.5 `processPayment(orderId, paymentData, googlePaySession)`（对照 v5）

```
googlePaySession.confirmOrder({ orderId: orderId, paymentMethodData: paymentData.paymentMethodData })
  .then(function (result) {
    inspect('confirmOrder result', result)
    if (result.status === 'PAYER_ACTION_REQUIRED') {
      return handlePayerAction(orderId, googlePaySession)   // §6 probe-then-decide
    }
    return doCapture(orderId)
  })
```

### 5.6 `doCapture(orderId)`（对照 v5，仅 orderId 小写 d）

```
fetch(urls.captureOrder, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ orderId: orderId }) })
  .then(r => r.json())
  .then(function (order) {
    inspect('captureOrder response', order)
    if (order.error) throw new Error(order.error)
    var capture = order.purchase_units?.[0]?.payments?.captures?.[0]
    if (!capture || capture.status !== 'COMPLETED') {     // 规则 13
      showResult('✗ Capture failed · status: ' + (capture ? capture.status : 'unknown'), 'error'); return
    }
    showResult('✓ Payment captured · Order: ' + order.id, 'success')
  })
```

## 6. 3DS — probe-then-decide（用户确认）

`processPayment` 收到 `PAYER_ACTION_REQUIRED` 时进入 `handlePayerAction(orderId, googlePaySession)`。实现时先 `inspect('googlePaySession', googlePaySession)` 确认是否有 `initiatePayerAction` 方法：

**Branch A — `googlePaySession.initiatePayerAction` 存在**（移植 v5 完整路径）：
```
googlePaySession.initiatePayerAction({ orderId })
  .then(() => getOrderDetails(orderId))     // GET urls.getOrder + '/' + orderId
  .then(order => handle3DS(order))
```
`handle3DS(order)` 读 `order.payment_source.google_pay.card.authentication_result`（比 ACDC 多一层 `google_pay`），决策表（与 v5 逐字一致）：
- `liability_shift === 'POSSIBLE'` → `doCapture`
- `liability_shift === 'NO'` + `enrollment_status ∈ {N,U,B}` → `doCapture`（未入会，frictionless）
- `liability_shift === 'NO'` + 其他 → reject（`✗ 3DS rejected · enrollment: ... · authStatus: ...`）
- `liability_shift === 'UNKNOWN'` → reject（`✗ 3DS result unknown · Please retry`）
- 其他 → reject（`✗ 3DS error · liability_shift: ...`）

**Branch B — 无 `initiatePayerAction`**（v6 参考 demo 回退）：
```
showResult('✗ 3DS action required — please retry', 'error')   // 不 capture
```

> probe 后，删除未走的分支，把"v6 googlePaySession 是否含 initiatePayerAction"的结论 + 实测 confirmOrder 返回形态记入 `docs/debug-log.md`。`getOrderDetails` / `handle3DS` 仅在 Branch A 保留。

## 7. `inspect()` 探查工具

复用 v6 acdc.js / applepay-ecm.js 的 `inspect(label, obj)`：打印 value / `Object.keys` / `getOwnPropertyNames` / 原型方法。用于确认 v6 Google Pay 各对象真实 API 形态（重点：`googlePaySession` 是否同步返回、是否含 `initiatePayerAction`、`confirmOrder` 返回 `{status}` 形态、`formatConfigForPaymentRequest` 输出字段）。API 形态确认后按需删减探查代码（记 `docs/debug-log.md`）。

## 8. 与 v5 前端的差异总表

| 方面 | v5 | v6 |
|------|----|----|
| 取 SDK 实例 | `paypalSDK.Googlepay()` | `getPPInstance()` + `instance.createGooglePayOneTimePaymentSession()` |
| 取 Google Pay 配置 | `Googlepay().config()` | `getDetails('googlepay').config` + `formatConfigForPaymentRequest()` |
| 账号资格门 | 无 | `findEligibleMethods().isEligible('googlepay')` |
| 付款流程模式 | Promise（无 callbacks） | **相同**（Promise，不用 callback 模式） |
| PaymentsClient callbacks | 无（ECM） | 无（ECM，相同） |
| confirmOrder 来源 | `Googlepay().confirmOrder()` | `googlePaySession.confirmOrder()` |
| 3DS 路径 | `initiatePayerAction` + GET order + handle3DS | probe-then-decide（A=同 v5 / B=回退） |
| createOrder 响应字段 | `d.id` | `d.orderId`（小写 d） |
| capture fetch body | `{ orderID }` | `{ orderId }`（小写 d） |
| capture 字段名 | `purchase_units`（snake，规则 13） | 相同 |
| 官方/客制按钮 | 两个，同一 handler | 相同 |

## 9. 验收标准（详见 plan 测试矩阵）

- Chrome + 沙盒 Google 账号 + 钱包测试卡：官方按钮和客制按钮都能拉起 Google Pay sheet 并完成付款，`✓ Payment captured · Order: ...`。
- 非 Chrome / 无 Google Pay SDK：显示对应 v5 风格提示，不报未捕获异常。
- 账号不合格（isEligible 为 false）或 `isReadyToPay` 为 false：显示对应提示，不渲染按钮。
- 用户取消 sheet（`statusCode === 'CANCELED'`）：静默，可重试。
- 3DS（SCA_ALWAYS）：按 probe 分支走完整路径或回退提示。
- DevTools console 可见各对象 `inspect()` 输出，便于核对 v6 API 形态。
