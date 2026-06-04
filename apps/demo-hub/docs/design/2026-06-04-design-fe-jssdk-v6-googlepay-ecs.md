# 前端设计 — JSSDK v6 Google Pay ECS

> 日期：2026-06-04 · 关联：req / design-be / plan（同日 `*-jssdk-v6-googlepay-ecs.md`）
>
> ⚠️ 当前 Opus 模型下只能产出本设计（markdown）。实际写代码需切换到非 Opus 模型（如 Sonnet）。

## 1. 目标

`/paypal/jssdk-v6/googlepay-ecs` 前端：UI 完全参考 v5 googlepay-ecs（官方 Google Pay 按钮 + 客制化按钮，两者同一点击流程）；Google Pay JS 函数骨架模仿 v5，但用 v6 SDK API 形态实现。

**付款流程采用 Full Callback 模式**（与 v5 ECS 一致，**不是** ECM 的 Promise 模式）。原因：ECS 需买家在 Google Pay sheet 内选运费方式并实时改价，`onPaymentDataChanged` 仅在 callback 模式触发。这是 ECS 的硬约束，无法用 Promise 模式替代。

## 2. v6 Google Pay 与 v5 的 SDK 差异（核心）

| 步骤 | v5 | v6 |
|------|----|----|
| 取 SDK | 全局 `paypalSDK.Googlepay()`（同步） | `await getPPInstance()` → `instance.createGooglePayOneTimePaymentSession()`（同步） |
| 取配置 | `paypalSDK.Googlepay().config()` → `{allowedPaymentMethods, merchantInfo, apiVersion, apiVersionMinor, countryCode}` | `findEligibleMethods().getDetails('googlepay').config` + `session.formatConfigForPaymentRequest(config)` |
| 账号资格 | 无（仅 `isReadyToPay`） | `findEligibleMethods({currencyCode}).isEligible('googlepay')`（外加 `isReadyToPay`） |
| 确认订单 | `paypalSDK.Googlepay().confirmOrder({orderId, paymentMethodData})` | `googlePaySession.confirmOrder({orderId, paymentMethodData})` |
| 3DS | `initiatePayerAction` → GET order → `handle3DS` | 防御兜底保留（v6 initiatePayerAction 为 no-op，SCA_ALWAYS 暂不支持，沿用 ECM） |
| createOrder 响应 | `d.id` | `d.orderId`（小写 d） |
| capture body | `{ orderID }` | `{ orderId }`（小写 d） |

> `PaymentsClient` 仍来自 Google 的 `pay.js`（与 v5 相同）。**ECS 传 `paymentDataCallbacks`**（callback 模式）。v6 只改变"从 PayPal 取 config / session / confirmOrder"这部分；Google Pay 侧的 callback 模式机制与 v5 完全相同。

## 3. 文件

| 文件 | 动作 |
|------|------|
| `src/views/paypal/jssdk-v6/googlepay-ecs.ejs` | 新建 |
| `src/public/js/paypal/jssdk-v6/googlepay-ecs.js` | 新建 |

## 4. EJS 视图（googlepay-ecs.ejs）

结构复制 v5 `views/paypal/jssdk-v5/googlepay-ecs.ejs`，改动：

- header include **去掉 `sdkUrl` 和 `extraScripts`**（v6 SDK + Google Pay pay.js 都在 body 自行加载）。
- provider-badge 文案：`PayPal · JSSDK v6 · Google Pay`。
- 货币下拉用 `supportedCurrencies.forEach`（与 v6 acdc/applepay/googlepay-ecm 一致），保留金额输入 + `amount-error`。
- **3DS/SCA 选择器沿用 ECM 处理**（与 v6 googlepay-ecm.ejs 完全一致）：
  - `#demo-sca` 设 `disabled`，固定显示 `SCA_WHEN_REQUIRED`，label 加 `TBD` 徽标。
  - 下方加黄色 warning 横条："**3DS not supported in JSSDK v6 yet.** `initiatePayerAction()` is a no-op in v6 — only **SCA_WHEN_REQUIRED** (frictionless) is supported. This will be updated when the v6 SDK adds 3DS support."
- **保留 v5 ECS 的"Buyer selects in sheet"说明块**（Shipping address · Email address · Phone number · Shipping method）——ECS 特征，区别于 ECM 的"商户预填地址"展示块。
- 容器：`#paypal-button-container`（官方按钮挂载点，初始 `sdk-loading` spinner）+ `#custom-googlepay-btn`（客制化按钮，初始 `disabled`，样式逐字沿用 v5 内联样式）+ `#result`。

底部注入（脚本四段式，规则 V6-GOOGLEPAY-8 同款）：

```html
<script>
  window.DEMO = {
    clientId:   '<%= clientId %>',
    components: ['googlepay-payments'],
    pageType:   'checkout',
    urls: {
      createOrder:  '/paypal/jssdk-v6/api/googlepay-ecs/create-order',
      getOrder:     '/paypal/jssdk-v6/api/googlepay-ecs/order',
      captureOrder: '/paypal/jssdk-v6/api/googlepay-ecs/capture-order',
    },
  }
</script>
<script src="/js/paypal/jssdk-v6/init.js"></script>
<script src="/js/paypal/jssdk-v6/googlepay-ecs.js"></script>
<script src="https://pay.google.com/gp/p/js/pay.js"></script>
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>
```

> ECS 的 `window.DEMO` **不含 `shipping`**（区别于 ECM）——地址来自 sheet。

## 5. 前端 JS（public/js/paypal/jssdk-v6/googlepay-ecs.js）

IIFE + `'use strict'`。从 v5 googlepay-ecs.js 搬运的辅助/常量：

- `getCurrency / getAmount / getSCA / isZeroDecimal / validateAmount / showResult` + 货币切换 reload + 金额 blur 格式化。
- `clearLoading`（沿用 v6 googlepay-ecm.js 写法）。
- 常量：`ZERO_DECIMAL`、`BASE_REQUEST`、`MIN/MAX_AMOUNT`、`SHIPPING_OPTIONS`（Standard $5 / Express $10，`{id, label, description, price}`）、`COUNTRY_DIAL`（ISO→区号表）。
- helper：`fmtAmt(num, zd)`、`calcTotal(amount, zd)`（item + `chosenShipping.price`）、`parsePhoneNumber(rawPhone, isoCountry)`（E.164 → `{country_code, national_number}`，逐字移植 v5）。
- 模块级状态：`paymentsClient`（Google 单例）、`urls`、`chosenShipping = SHIPPING_OPTIONS[0]`、`currentOrderID`。
- `inspect(label, obj)`：复用 v6 acdc/applepay/googlepay-ecm 的探查工具。

### 5.1 入口 `onPayPalWebSdkLoaded()`（替代 v5 `window.load` 内的 config 链）

```
getPPInstance()
  .then(function (instance) {
    inspect('instance', instance)
    // Google Pay SDK 可用性（浏览器）：window.google && google.payments.api.PaymentsClient
    if (!googleSdkOk) { clearLoading(); showResult('Google Pay SDK is not available', 'error'); return }
    return instance.findEligibleMethods({ currencyCode: getCurrency() })   // V6-3 嵌套
      .then(function (eligibility) {
        inspect('eligibility', eligibility)
        if (eligibility.isEligible('googlepay')) {
          var details = eligibility.getDetails('googlepay')
          inspect('getDetails(googlepay)', details)
          setupGooglePayButton(instance, details)
        } else {
          clearLoading(); showResult('Google Pay is not eligible for this account.', 'error')
        }
      })
  })
  .catch(function (err) { clearLoading(); showResult('✗ Google Pay config error: ' + (err.message || String(err)), 'error') })
```

- **V6-3**：`instance` 必须在嵌套 `.then()` 作用域内。
- 三层资格检查（规则 V6-GOOGLEPAY-2）：Google SDK 可用性 → `isEligible('googlepay')` → 后续 `isReadyToPay`。

### 5.2 `setupGooglePayButton(instance, details)`（对照 v5 同名函数 + getGooglePaymentsClient）

```
var googlePaySession = instance.createGooglePayOneTimePaymentSession()   // 同步；inspect()
inspect('googlePaySession', googlePaySession)
var googlePayConfig = googlePaySession.formatConfigForPaymentRequest(details.config)   // v6 取代 v5 config()
inspect('googlePayConfig', googlePayConfig)

// ⚠️ callback 模式：PaymentsClient 必须带 paymentDataCallbacks
paymentsClient = new google.payments.api.PaymentsClient({
  environment: 'TEST',
  paymentDataCallbacks: {
    onPaymentAuthorized:  function (pd) { return onPaymentAuthorized(pd, googlePaySession) },
    onPaymentDataChanged: onPaymentDataChanged,
  },
})
inspect('paymentsClient', paymentsClient)

paymentsClient.isReadyToPay({
  allowedPaymentMethods: googlePayConfig.allowedPaymentMethods,
  apiVersion:            googlePayConfig.apiVersion,
  apiVersionMinor:       googlePayConfig.apiVersionMinor,
}).then(function (resp) {
  inspect('isReadyToPay', resp)
  if (!resp.result) { clearLoading(); showResult('Google Pay is not available on this device or account.', 'error'); return }
  // 官方按钮
  var btn = paymentsClient.createButton({
    buttonColor: 'black', buttonType: 'pay', buttonSizeMode: 'fill',
    onClick: function () { onGooglePaymentButtonClicked(googlePayConfig) },
  })
  var container = clearLoading(); container.appendChild(btn)
  // 客制化按钮 #custom-googlepay-btn：disabled=false + 沿用 v5 hover/active 内联样式监听 +
  //   addEventListener('click', function(){ onGooglePaymentButtonClicked(googlePayConfig) })
})
```

> 官方按钮 + 客制按钮**同一 handler**（规则 V6-GOOGLEPAY-9）。注意 ECS 的 handler 参数只需 `googlePayConfig`（`googlePaySession` 已通过闭包绑入 `onPaymentAuthorized`）。

### 5.3 `getGooglePaymentDataRequest(config, amount, currency, zd)`（沿用 v5 ECS）

```
Object.assign({}, BASE_REQUEST, {
  allowedPaymentMethods: config.allowedPaymentMethods,
  merchantInfo:          config.merchantInfo,
  transactionInfo: {
    countryCode: 'US', currencyCode: currency,
    totalPriceStatus: 'ESTIMATED',                 // ⚠️ ECS 初始 ESTIMATED（运费选完才 FINAL）
    totalPrice: fmtAmt(parseFloat(amount), zd),    // 初始仅 item
    totalPriceLabel: 'Total',
    displayItems: [{ label: 'Item total', type: 'SUBTOTAL', price: itemPrice }],
  },
  shippingAddressRequired:   true,
  shippingAddressParameters: { phoneNumberRequired: true },
  emailRequired:             true,
  shippingOptionRequired:    true,
  shippingOptionParameters: {
    defaultSelectedOptionId: SHIPPING_OPTIONS[0].id,
    shippingOptions: SHIPPING_OPTIONS.map(o => ({ id: o.id, label: o.label, description: o.description })),
    // ⚠️ Google Pay shippingOptions 只接受 id/label/description，不能含 price/selected
  },
  callbackIntents: ['SHIPPING_ADDRESS', 'SHIPPING_OPTION', 'PAYMENT_AUTHORIZATION'],
})
```

> 与 ECM 的请求差异：ECM `shippingAddressRequired:false` + `totalPriceStatus:'FINAL'` + 无 shippingOption + 无 callbackIntents；ECS 全部相反。

### 5.4 `onPaymentDataChanged(intermediatePaymentData)`（sheet 内运费回调，逐字移植 v5）

```
trigger = intermediatePaymentData.callbackTrigger
if (trigger === 'SHIPPING_OPTION') {
  chosenShipping = SHIPPING_OPTIONS.find(o => o.id === shippingOptionData.id) || SHIPPING_OPTIONS[0]
}
// INITIALIZE / SHIPPING_ADDRESS：chosenShipping 保持 SHIPPING_OPTIONS[0]（每次按钮点击 reset）

var update = {}
if (trigger === 'INITIALIZE' || trigger === 'SHIPPING_ADDRESS') {
  update.newShippingOptionParameters = {
    defaultSelectedOptionId: chosenShipping.id,
    shippingOptions: SHIPPING_OPTIONS.map(o => ({ id: o.id, label: o.label, description: o.description })),
  }
}
update.newTransactionInfo = {
  countryCode: 'US', currencyCode: currency,
  totalPriceStatus: 'FINAL', totalPrice: calcTotal(amount, zd), totalPriceLabel: 'Total',
  displayItems: [
    { label: 'Item total',           type: 'SUBTOTAL',  price: fmtAmt(parseFloat(amount), zd) },
    { label: chosenShipping.label,   type: 'LINE_ITEM', price: chosenShipping.price },
  ],
}
return Promise.resolve(update)
```

> 返回规则（违反 → OR_BIBED_06）：INITIALIZE/SHIPPING_ADDRESS 返回 `newTransactionInfo` + `newShippingOptionParameters`；SHIPPING_OPTION 只返回 `newTransactionInfo`。

### 5.5 `onGooglePaymentButtonClicked(googlePayConfig)`（点击）

```
if (!validateAmount()) return
chosenShipping = SHIPPING_OPTIONS[0]                 // 每次点击 reset
var req = getGooglePaymentDataRequest(googlePayConfig, getAmount(), getCurrency(), isZeroDecimal(getCurrency()))
paymentsClient.loadPaymentData(req)                  // 开 sheet（callback 模式，无 .then 取 paymentData）
```

> callback 模式下，`loadPaymentData` 的结果由 `onPaymentAuthorized` 回调处理，**不在此处 `.then()`**（区别于 ECM Promise 模式）。

### 5.6 `onPaymentAuthorized(paymentData, googlePaySession)`（授权回调，逐字移植 v5 + v6 适配）

Google Pay 在买家点 Pay 后调用，sheet 处于"processing"直到 resolve。必须返回 `Promise<{ transactionState }>`。

```
return new Promise(function (resolve) {
  var sh = paymentData.shippingAddress || null
  var buyerName  = sh ? sh.name        : null
  var email      = paymentData.email   || null
  var rawPhone   = sh ? sh.phoneNumber : null
  var isoCountry = sh ? sh.countryCode : null
  var parsedPhone = parsePhoneNumber(rawPhone, isoCountry)
  var finalShipping = SHIPPING_OPTIONS.find(o => o.id === paymentData.shippingOptionData?.id) || chosenShipping

  var body = { amount, currency, scaMethod: getSCA(),
               shippingAddress: sh, buyerName, email, parsedPhone,
               shippingAmount: finalShipping.price }
  fetch(urls.createOrder, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    .then(r => r.json())
    .then(function (d) {
      inspect('createOrder response', d)
      if (d.error) throw new Error(d.error)
      currentOrderID = d.orderId                      // ⚠️ v6 小写 d（v5 是 d.id）
      return processPayment(d.orderId, paymentData, googlePaySession)
    })
    .then(function () { resolve({ transactionState: 'SUCCESS' }) })
    .catch(function (err) {
      showResult('✗ ' + (err.message || String(err)), 'error')
      resolve({ transactionState: 'ERROR' })          // 只能 resolve，失败用 ERROR
    })
})
```

### 5.7 `processPayment(orderId, paymentData, googlePaySession)`（对照 v5）

```
googlePaySession.confirmOrder({ orderId: orderId, paymentMethodData: paymentData.paymentMethodData })
  .then(function (result) {
    inspect('confirmOrder result', result)
    if (result.status === 'PAYER_ACTION_REQUIRED') {
      return handlePayerAction(orderId, googlePaySession)   // §6 防御兜底（3DS 暂不支持）
    }
    return doCapture(orderId)
  })
```

> ⚠️ **R-RISK-1（gating）**：此处 `confirmOrder` 在 callback 模式下、**sheet 仍打开**时调用。ECM 实测 callback 模式 confirmOrder 内部 graphql 曾被 `ERR_CONNECTION_RESET` 打断（CN→sandbox）。实现阶段必须先验证 frictionless 下此调用能否完成（见 plan 测试矩阵 T1）。

### 5.8 `doCapture(orderId)`（对照 v5，仅 orderId 小写 d）

```
fetch(urls.captureOrder, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ orderId: orderId }) })
  .then(r => r.json())
  .then(function (order) {
    inspect('captureOrder response', order)
    if (order.error) throw new Error(order.error)
    var capture = order.purchase_units?.[0]?.payments?.captures?.[0]
    if (!capture || capture.status !== 'COMPLETED') {       // 规则 13
      showResult('✗ Capture failed · status: ' + (capture ? capture.status : 'unknown'), 'error')
      throw new Error('capture not completed')              // 触发 onPaymentAuthorized ERROR
    }
    showResult('✓ Payment captured · Order: ' + order.id, 'success')
  })
```

## 6. 3DS — 沿用 ECM（防御兜底，SCA_ALWAYS 暂不支持）

`#demo-sca` 已 disabled 固定 `SCA_WHEN_REQUIRED`，正常不会触发 3DS。`processPayment` 收到 `PAYER_ACTION_REQUIRED` 时进入 `handlePayerAction`，作为防御兜底（与 v6 googlepay-ecm.js 一致）：

```
handlePayerAction(orderId, googlePaySession):
  if (typeof googlePaySession.initiatePayerAction === 'function') googlePaySession.initiatePayerAction()  // 无参，v6 为 void no-op
  return getOrderDetails(orderId).then(order => handle3DS(order, orderId))
```

`handle3DS(order, orderId)` 读 `order.payment_source.google_pay.card.authentication_result`，决策表与 v5/ECM 逐字一致：
- `liability_shift === 'POSSIBLE'` → `doCapture`
- `liability_shift === 'NO'` + `enrollment_status ∈ {N,U,B}` → `doCapture`（未入会 frictionless）
- `liability_shift === 'NO'` + 其他 → throw（`3DS rejected · enrollment: ... · authStatus: ...`）
- `liability_shift === 'UNKNOWN'` → throw（`3DS result unknown · Please retry`）
- 其他 → throw（`3DS error · liability_shift: ...`）

> v6 实测 `initiatePayerAction` 是 no-op，SCA_ALWAYS 下 authentication_result 为 undefined，落到最后一档 throw → onPaymentAuthorized 返回 ERROR。此为已知限制（规则 V6-GOOGLEPAY-7），页面已用 warning 横条标注。

## 7. `inspect()` 探查重点

实现阶段重点确认（记入 `docs/debug-log.md`）：
- `googlePaySession` 是否同步返回、proto 方法集（`confirmOrder` / `formatConfigForPaymentRequest` / `initiatePayerAction`）。
- `formatConfigForPaymentRequest` 输出字段（allowedPaymentMethods / merchantInfo / apiVersion / apiVersionMinor / countryCode）。
- **callback 模式 confirmOrder（sheet-open）的返回形态与网络结果**（R-RISK-1 核心）。
- `onPaymentDataChanged` 的 `callbackTrigger` 取值与 `shippingOptionData` 结构。

## 8. 与 v5 前端的差异总表

| 方面 | v5 ECS | v6 ECS |
|------|----|----|
| 取 SDK 实例 | `paypalSDK.Googlepay()` | `getPPInstance()` + `instance.createGooglePayOneTimePaymentSession()` |
| 取 Google Pay 配置 | `Googlepay().config()` | `getDetails('googlepay').config` + `formatConfigForPaymentRequest()` |
| 账号资格门 | 无 | `findEligibleMethods().isEligible('googlepay')` |
| 付款流程模式 | Full Callback | **相同**（Full Callback，ECS 硬约束） |
| PaymentsClient callbacks | `{onPaymentAuthorized, onPaymentDataChanged}` | **相同** |
| confirmOrder 来源 | `Googlepay().confirmOrder()` | `googlePaySession.confirmOrder()`（sheet-open，R-RISK-1） |
| 3DS 路径 | `initiatePayerAction` + GET order + handle3DS | 防御兜底保留；SCA_ALWAYS 暂不支持（沿用 ECM） |
| 3DS 选择器 | 可用 | disabled + warning 横条（沿用 ECM） |
| createOrder 响应字段 | `d.id` | `d.orderId`（小写 d） |
| capture fetch body | `{ orderID }` | `{ orderId }`（小写 d） |
| sheet 内运费/地址/邮箱/电话 | 是 | 相同 |
| 官方/客制按钮 | 两个，同一 handler | 相同 |

## 9. 与 v6 ECM 前端的差异总表

| 方面 | v6 ECM | v6 ECS |
|------|----|----|
| PaymentsClient | 无 callbacks（Promise） | **带 callbacks**（onPaymentAuthorized + onPaymentDataChanged） |
| loadPaymentData 取结果 | `.then(paymentData)` | 由 `onPaymentAuthorized` 回调处理 |
| createOrder 时机 | sheet 关闭后 | `onPaymentAuthorized` 内（sheet 仍开） |
| confirmOrder 时机 | sheet 关闭后 | sheet 仍开（R-RISK-1） |
| shippingAddressRequired | false | true |
| emailRequired | true | true |
| shippingOptionRequired | 无 | true（Standard/Express + 实时改价） |
| totalPriceStatus | FINAL | ESTIMATED（初始）→ FINAL（callback 内） |
| phone 来源 | SANDBOX_PHONE 预填 | sheet（parsePhoneNumber） |
| window.DEMO.shipping | 有 | 无 |
| create-order breakdown | item_total only | item_total + shipping |

## 10. 验收标准（详见 plan 测试矩阵）

- Chrome + 沙盒 Google 账号 + 钱包测试卡：官方按钮和客制按钮都能拉起 sheet；sheet 内可选地址、邮箱、电话、运费方式，选 Standard/Express 时总价实时变化。
- frictionless（SCA_WHEN_REQUIRED）路径：confirmOrder 完成 → capture COMPLETED → `✓ Payment captured · Order: ...`（**或** 按 R-RISK-1 记录为已知 callback-mode 网络限制）。
- 非 Chrome / 无 Google Pay SDK / 账号不合格 / `isReadyToPay` false：显示对应 v5 风格提示，不抛未捕获异常。
- 用户取消 sheet：静默，可重试。
- create-order body 与 v5 逐字一致（含 shipping breakdown + parsedPhone 两字段）。
- DevTools console 可见各对象 `inspect()` 输出。
