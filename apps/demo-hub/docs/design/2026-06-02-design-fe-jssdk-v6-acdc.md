# 前端设计 — JSSDK v6 ACDC

> 日期：2026-06-02 · 文件：`views/paypal/jssdk-v6/acdc.ejs` + `public/js/paypal/jssdk-v6/acdc.js`

## 1. UI（参考 v5，结构不变）

视图直接以 v5 `views/paypal/jssdk-v5/acdc.ejs` 为蓝本，仅做 v6 适配。控件清单（保持一致）：

- 顶部 `amount-row`：货币下拉 `#demo-currency`、金额输入 `#demo-amount`、3DS 下拉 `#demo-sca`（`SCA_WHEN_REQUIRED` 默认 / `SCA_ALWAYS`）。
- `#amount-error` 校验提示 + `⚡ Sandbox Mode` badge。
- Name on Card：普通 `<input id="card-name">`，预填 `sandboxCardholderName`（**非托管字段**，v6 同 v5）。
- 三个 host 容器：`#card-number-container`（带 `sdk-loading` spinner）、`#card-expiry-container`、`#card-cvv-container`。
- `#acdc-pay-btn`（Pay Now）、`#result` 结果区、测试卡提示 `4032030176760800`。

v6 EJS 适配点（与 bcdc-ecm.ejs 一致）：

- 货币下拉用 `supportedCurrencies.forEach(...)` 渲染（v5 是硬编码数组，v6 统一用注入的列表）。
- `include('../../partials/header', {...})` **不传 sdkUrl**（规则 V6-5）。

### `window.DEMO` 注入（规则 V6-6）

```js
window.DEMO = {
  clientId:   '<%= clientId %>',
  components: ['card-fields'],
  pageType:   'checkout',
  urls: {
    createOrder:  '/paypal/jssdk-v6/api/acdc/create-order',
    captureOrder: '/paypal/jssdk-v6/api/acdc/capture-order',
    getOrder:     '/paypal/jssdk-v6/api/acdc/order/:orderId',
  },
  billing: <%- JSON.stringify(sandboxBilling) %>,
}
```

### 脚本加载顺序（规则 V6-4）

```html
<script src="/js/paypal/jssdk-v6/init.js"></script>
<script src="/js/paypal/jssdk-v6/acdc.js"></script>
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>
```

`init.js` 的 `getPPInstance()` 已读取 `window.DEMO.components`（`['card-fields']`）和 `pageType`，**可直接复用，无需改 init.js**。

## 2. SDK 流程（v6 CardFields）

整体三层结构对齐 v6 规则 V6-9，但 ACDC 是 CardFields 而非 button，几处不同：

```
window.load
  → onPayPalWebSdkLoaded()
      → getPPInstance()                                   // createInstance({clientId, components:['card-fields']})
      → instance.findEligibleMethods({ currencyCode })
      → isCardEligible(eligibility) ?                      // 防御式判定，见下
          setupCardFields(instance)
        : showResult('Card Fields not available for this account.', 'error')
```

### 资格判定：防御式（用户确认）

官方 v6 示例明确提示："The card may not appear in the eligibility response yet. Integrate defensively." 因此**不做硬门控**：只有在 SDK 给出**明确不合格**信号时才拦截；`advanced_cards` 缺失（key 未出现在响应里）时**仍然渲染**卡输入域。

```js
function isCardEligible(eligibility) {
  // 1) 明确合格 → 渲染
  if (eligibility && typeof eligibility.isEligible === 'function' && eligibility.isEligible('advanced_cards')) {
    return true
  }
  // 2) key 在响应里但为 false → 明确不合格 → 拦截
  //    （若 SDK 暴露了已知方法列表/详情，用它判断 advanced_cards 是否"出现且为 false"）
  // 3) key 缺失（未出现） → 防御式渲染，让 submit() 暴露真实错误
  //    实现阶段以 SDK 实际返回结构为准；无法区分 (2)/(3) 时默认渲染（宁可渲染也不误拦）。
  return true
}
```

> 落地细节（如何区分"明确 false"与"缺失"）取决于 `findEligibleMethods` 的实际返回结构，在实现阶段确定；**默认偏向渲染**，避免把可用的卡域误判为不可用。`findEligibleMethods` 调用本身失败（reject）则进 top-level catch 显示错误。

### setupCardFields(instance)

```js
// 规则：createCardFieldsOneTimePaymentSession 同步返回（与 createPayPalOneTimePaymentSession 一致，不 await/不 .then）
var session = instance.createCardFieldsOneTimePaymentSession(/* 无回调对象 */)

// 创建三个字段组件，appendChild 到容器（文档用 appendChild，非 v5 的 .render()）
var numberField = session.createCardFieldsComponent({ type: 'number', placeholder: '4032030176760800', style: STYLE })
var expiryField = session.createCardFieldsComponent({ type: 'expiry', placeholder: 'MM / YY',         style: STYLE })
var cvvField    = session.createCardFieldsComponent({ type: 'cvv',    placeholder: '•••',             style: STYLE })

clearLoading('card-number-container')
document.querySelector('#card-number-container').appendChild(numberField)
document.querySelector('#card-expiry-container').appendChild(expiryField)
document.querySelector('#card-cvv-container').appendChild(cvvField)

// Pay 按钮
document.getElementById('acdc-pay-btn').addEventListener('click', function () { onPayClick(session) })
```

> **与 v5 的本质差异**：v5 把 `createOrder`/`onApprove` 作为 `CardFields({...})` 的回调，由 `cardFields.submit()` 内部驱动；v6 改为**点击时显式** `createOrder()` 拿 orderId，再 `session.submit(orderId, opts)`。回调式 → 命令式。

### onPayClick(session)

```js
async function onPayClick(session) {
  if (!validateAmount()) return
  var payBtn = document.getElementById('acdc-pay-btn')
  payBtn.disabled = true
  try {
    var orderId = await createOrder()                         // 显式调用 create-order
    var result  = await session.submit(orderId, {             // v6：submit(orderId, opts) → { data, state }
      billingAddress: mapBilling(window.DEMO.billing),
    })
    await handleSubmitResult(result, payBtn)
  } catch (err) {
    showResult('✗ ' + (err.message || String(err)), 'error')
    payBtn.disabled = false
  }
}
```

> **transient activation 说明**：与 `paypal-button` 的 `session.start(opts, orderPromise)` 不同（规则 V6-2 要求传 Promise），v6 CardFields 官方示例在 click handler 内 `await createOrder()` 后再 `await session.submit(...)`，3DS 弹窗由 `submit()` 触发。**本 demo 遵循官方 CardFields 写法**（await 串行），不套用 V6-2 的 Promise 传递（那是 button session.start 专属）。

### createOrder()（携带 v5 同款参数）

```js
function createOrder() {
  return fetch(window.DEMO.urls.createOrder, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount:         getAmount(),
      currency:       getCurrency(),
      scaMethod:      getSCA(),            // #demo-sca
      cardholderName: getName(),           // #card-name
      billingAddress: window.DEMO.billing || {},
    }),
  })
    .then(function (r) { return r.json() })
    .then(function (d) { if (d.error) throw new Error(d.error); return d.orderId })  // v6 小写 d
}
```

## 3. submit 结果处理（state 机）

```js
async function handleSubmitResult(result, payBtn) {
  var data  = result.data || {}
  switch (result.state) {
    case 'succeeded': return decide3DSAndCapture(data, payBtn)   // ↓ 第 4 节
    case 'canceled':
      showResult('3D Secure cancelled — payment not completed.', 'error')
      payBtn.disabled = false
      return
    case 'failed':
      showResult('✗ ' + (data.message || 'Payment failed. Check your details and try again.'), 'error')
      payBtn.disabled = false
      return
    default:
      console.warn('[ACDC] Unhandled submit state', result.state, data)
      payBtn.disabled = false
  }
}
```

CSS class 命名遵守规则 V6-10：`showResult(text, 'success'|'error')`，取消统一用 `'error'`（红色）。

## 4. 3DS 决策（**与 v5 完全一致** — 用户确认"跟 v5 一样"）

`state === 'succeeded'` 后，`data` 含 `{ orderId, liabilityShift }`。逻辑逐行移植 v5 `acdc.js` 的 `onApprove`：

```js
function decide3DSAndCapture(data, payBtn) {
  var liabilityShift = data.liabilityShift
  console.log('[ACDC] 3DS liabilityShift (client):', liabilityShift)

  // ① undefined（未触发 3DS）或 'POSSIBLE'（责任转移）→ 直接 capture
  if (!liabilityShift || liabilityShift === 'POSSIBLE') {
    return doCapture(data.orderId)
  }

  // ② 其他值 → GET order details，读服务端 authentication_result
  var url = window.DEMO.urls.getOrder.replace(':orderId', data.orderId)
  return fetch(url).then(function (r) { return r.json() }).then(function (order) {
    var ar         = (order.payment_source && order.payment_source.card && order.payment_source.card.authentication_result) || {}
    var threeDS    = ar.three_d_secure || {}
    var ls         = ar.liability_shift
    var enrollment = threeDS.enrollment_status
    var authStatus = threeDS.authentication_status
    console.log('[ACDC] 3DS server — ls:', ls, '| enrollment:', enrollment, '| auth:', authStatus)

    // 决策表（同 v5）
    if (ls === 'NO' && (enrollment === 'N' || enrollment === 'U' || enrollment === 'B')) {
      return doCapture(data.orderId)        // 卡未入会，frictionless → 继续
    }
    if (ls === 'UNKNOWN') {
      showResult('✗ 3D Secure unavailable — please retry.', 'error')
    } else {
      showResult('✗ 3D Secure declined (enrollment: ' + enrollment + ', auth: ' + authStatus +
        ') — please try another card.', 'error')
    }
    if (payBtn) payBtn.disabled = false
  })
}
```

> 与 v5 唯一字面差异：`data.orderId`（小写 d）、`getOrder` 占位符 `:orderId`。决策分支、阈值、文案均不变。

### doCapture（同 v5/bcdc 的 COMPLETED 判定，规则 13）

```js
function doCapture(orderId) {
  return fetch(window.DEMO.urls.captureOrder, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: orderId }),           // v6 小写 d
  })
    .then(function (r) { return r.json() })
    .then(function (order) {
      if (order.error) throw new Error(order.error)
      var capture = order.purchase_units && order.purchase_units[0] &&
                    order.purchase_units[0].payments &&
                    order.purchase_units[0].payments.captures &&
                    order.purchase_units[0].payments.captures[0]
      if (!capture || capture.status !== 'COMPLETED') {
        showResult('✗ Capture failed · status: ' + (capture ? capture.status : 'unknown'), 'error')
        return
      }
      showResult('✓ Payment captured · Order: ' + order.id, 'success')
    })
}
```

## 5. 辅助逻辑（直接复用 v5）

- 货币切换 → reload（`?currency=X&amount=Y`）：同 v5/bcdc。
- 金额校验 `validateAmount()`、零小数位货币、blur 格式化：直接搬 v5 `acdc.js`。
- `getCurrency()` / `getAmount()` / `getSCA()` / `getName()`：同 v5。
- `clearLoading(id)`：移除 spinner、清空 host 容器。

## 6. v5 → v6 UI 能力差异（已定调：documented-only）

v6 文档对 `createCardFieldsComponent` 只暴露 `type` / `placeholder` / `style`（`style` 允许 `input`、`.invalid` 等选择器），**未文档化 v5 的 `inputEvents`（onChange/onFocus/onBlur）**。**用户确认按 documented-only 交付**：

- **保留**：通过 `style: { '.invalid': { color: '#EF4444' } }` 让 SDK 自带的无效态着色。这是 v6 唯一受支持的字段级视觉反馈。
- **明确不做**（相对 v5 的减项，非 bug）：
  - 每字段 valid/invalid 边框态（v5 `field-host--valid` / `field-host--invalid`，由 `inputEvents.onChange` 驱动）。
  - 字段 focus 边框态（v5 `inputEvents.onFocus/onBlur` → `.focused`）。
  - 卡种检测 console 日志（v5 `data.cards[0].niceType` 等）。
- **不尝试**用未文档化的 `inputEvents`，即使 v6 SDK 可能私下支持——按公开文档能力交付，不依赖未声明 API。

> 影响：前端 `acdc.js` **不需要**移植 v5 的 `CONTAINER_BY_EMITTED` / `CONTAINER_BY_FIELD` / `updateFieldStates` 及 `inputEvents` 回调块。这是 v6 相对 v5 的合理简化，已在 req 完成标准中对齐。

## 7. 样式常量（STYLE）

```js
var STYLE = {
  input: { 'font-family': "'Space Mono', monospace", 'font-size': '13px', color: 'inherit' },
  '.invalid': { color: '#EF4444' },
}
```

CSS 复用 `public/css/sandbox.css`（与 v5 共享 `.field-host`、`.sdk-loading`、`.result-msg` 等）。

## 8. 调试探查日志（实现阶段加入，用于发现 v6 字段事件 API）

> 目的：v6 公开文档没有文档化 CardFields 的字段事件（onChange/onFocus/onBlur）。在控制台把**每个对象的自身属性 + 原型方法**都打印出来，人工排查是否存在可监听字段事件的 API（如 `on` / `addEventListener` / `inputEvents` / `onChange` 等）。
>
> ⚠️ 这是**临时探查代码**，确认结论后应删除或收敛（不要留在最终交付里刷屏）。仅在 documented-only 决策需要复核时启用。

### 8.1 通用探查辅助函数

普通 `console.log(obj)` 看不到原型链上的方法。统一用下面的 `inspect()` 同时 dump 自身属性、原型方法、是否 DOM 节点：

```js
function inspect(label, obj) {
  try {
    console.group('[ACDC-PROBE] ' + label)
    console.log('value:', obj)
    console.dir(obj)                                   // 可展开看完整结构
    if (obj && typeof obj === 'object') {
      console.log('own keys     :', Object.keys(obj))
      console.log('own props    :', Object.getOwnPropertyNames(obj))
      var proto = Object.getPrototypeOf(obj)
      console.log('proto        :', proto)
      if (proto) console.log('proto methods:', Object.getOwnPropertyNames(proto))
      console.log('is DOM node  :', obj instanceof Element,
                  '| has addEventListener:', typeof obj.addEventListener === 'function',
                  '| has on():', typeof obj.on === 'function')
    }
  } finally { console.groupEnd() }
}
```

### 8.2 要探查的每个对象（按出现顺序）

| 顺序 | 对象 | 来源 | 重点看什么 |
|------|------|------|-----------|
| 1 | `paypal` | 全局（`window.paypal`） | 顶层 API 入口、是否有 CardFields 相关命名空间 |
| 2 | `instance` | `await getPPInstance()` | 实例方法（`createCardFieldsOneTimePaymentSession`、`findEligibleMethods` 等） |
| 3 | `eligibility` | `instance.findEligibleMethods({ currencyCode })` | `isEligible` / `getDetails` / 是否含 `advanced_cards` |
| 4 | `session` | `instance.createCardFieldsOneTimePaymentSession()` | **最关键**：是否有 `on` / `addEventListener` / `inputEvents` / `onChange` / `getState` 等事件入口 |
| 5 | `numberField` / `expiryField` / `cvvField` | `session.createCardFieldsComponent({type})` 各自返回值 | **关键**：返回的是 DOM 元素还是带 `.render()`/`.on()` 的对象；是否 `instanceof Element`（可 `addEventListener`） |
| 6 | `result` | `await session.submit(orderId, { billingAddress })` | `{ data, state }` 完整结构；`data.liabilityShift` 等 |

### 8.3 在 `acdc.js` 中的插入位置

```js
// onPayPalWebSdkLoaded()
inspect('paypal (global)', window.paypal)

getPPInstance().then(function (instance) {
  inspect('instance', instance)
  return instance.findEligibleMethods({ currencyCode: getCurrency() }).then(function (eligibility) {
    inspect('eligibility', eligibility)
    ...
  })
})

// setupCardFields(instance)
var session = instance.createCardFieldsOneTimePaymentSession()
inspect('session', session)

var numberField = session.createCardFieldsComponent({ type: 'number', placeholder: '4032030176760800', style: STYLE })
var expiryField = session.createCardFieldsComponent({ type: 'expiry', placeholder: 'MM / YY', style: STYLE })
var cvvField    = session.createCardFieldsComponent({ type: 'cvv',    placeholder: '•••',     style: STYLE })
inspect('numberField', numberField)
inspect('expiryField', expiryField)
inspect('cvvField',    cvvField)

// onPayClick()，submit 之后
var result = await session.submit(orderId, { billingAddress: mapBilling(window.DEMO.billing) })
inspect('submit result', result)
```

### 8.4 探查后的决策路径

- 若 `session` 或字段对象上发现可用事件 API（如 `on('change', ...)` / `addEventListener` / `inputEvents`）→ 回到第 6 节，把 documented-only 改为接入该事件，重新实现 v5 同款"实时校验 + 卡种 console 日志"。
- 若确认没有任何字段事件 API → 维持 documented-only，**删除本节探查代码**（保留本设计文档作为结论记录即可）。

</content>
