# CLAUDE.md — PayPal JSSDK v6

> 通用规则见 `apps/demo-hub/CLAUDE.md`（所有路径均自动加载）。本文件只包含 JSSDK v6 专属规则。
>
> **Symlinks:** `src/public/js/paypal/jssdk-v6/CLAUDE.md` 和 `src/views/paypal/jssdk-v6/CLAUDE.md` 均指向本文件，编辑任何 v6 文件时都会自动加载。

---

## 核心开发原则（Karpathy）

**1. 先思考，再编码（Think Before Coding）**
不要默默地做假设，不要掩盖困惑。如果需求存在多种解读，应列出来让用户确认，而不是随机选一种就跑。

**2. 简单优先（Simplicity First）**
不写没人要求的抽象层，50行能解决的问题不写200行。避免过度设计。

**3. 精准修改（Surgical Changes）**
只碰需要改的地方，每一行diff都要能追溯到用户的具体需求。不去"顺手"优化不相关的代码，不重构没坏的东西，不动没被要求改的文件。

**4. 目标驱动执行（Goal-Driven Execution）**
在开始写代码之前，先定义"完成"长什么样。要有可验证的成功标准，而不是模糊地开工。

---

## JSSDK v6 核心差异（对比 v5）

| 方面 | v5 | v6 |
|------|----|----|
| SDK URL | `paypal.com/sdk/js?client-id=...&components=...` | `paypal.com/web-sdk/v6/core`（无 query params） |
| 加载触发 | script 同步可用 | `paypal.createInstance({ clientId, components })` 异步 |
| 按钮渲染 | `paypal.Buttons().render('#container')` | `document.createElement('paypal-button')` + session.start() |
| createOrder 返回 | `return orderID`（字符串） | `return { orderId: id }`（对象，小写 d） |
| onApprove 入参 | `data.orderID` | `data.orderId` |
| 资格检查 | `paypal.FUNDING.X` + `fundingSource` | `instance.findEligibleMethods().isEligible('paypal')` |
| 后端 REST API | 不变 | 不变（继续用 `/v2/checkout/orders`） |

---

## v6 关键实现规则

### 规则 V6-1 — orderId 全链路小写 d

- 后端 create-order 返回：`res.json({ orderId: order.id })` （小写 d）
- 前端 onApprove 接收：`data.orderId` （小写 d）
- 前端 capture fetch body：`{ orderId: data.orderId }` （小写 d）
- 后端 capture-order 读取：`const { orderId } = req.body` （小写 d）

v5 用 `orderID`（大写 D），v6 全链路改为 `orderId`（小写 d）。不要混用。

### 规则 V6-2 — session.start() 必须传 Promise，不能传 await 结果

```js
// ❌ 错误：await 会在 click handler 外部提前执行，导致弹窗被浏览器拦截
btn.addEventListener('click', async function () {
  const { orderId } = await createOrder()  // 此时已离开 click transient activation
  session.start(opts, orderId)
})

// ✅ 正确：传 Promise 引用，SDK 在 click transient activation 窗口内立即打开弹窗
btn.addEventListener('click', function () {
  var orderPromise = createOrder()  // 不 await，返回 Promise
  session.start(opts, orderPromise) // SDK 持有 Promise，弹窗立即触发
})
```

### 规则 V6-8 — createPayPalOneTimePaymentSession() 同步返回，不是 Promise

```js
// ❌ 错误：.then() 不存在，直接报 TypeError: ...().then is not a function
instance.createPayPalOneTimePaymentSession({...}).then(function (session) { ... })

// ✅ 正确：同步拿到 session，直接用
var session = instance.createPayPalOneTimePaymentSession({...})
btn.addEventListener('click', function () { session.start(...) })
```

### 规则 V6-3 — instance 变量作用域：必须嵌套 .then()

```js
// ❌ 错误：instance 在第二个 .then() 中不在作用域内
getPPInstance()
  .then(function (instance) {
    return instance.findEligibleMethods()
  })
  .then(function (eligibility) {
    return instance.createPayPalOneTimePaymentSession(...)  // ReferenceError!
  })

// ✅ 正确：嵌套 .then() 保证 instance 在作用域内
getPPInstance()
  .then(function (instance) {
    return instance.findEligibleMethods()
      .then(function (eligibility) {
        return instance.createPayPalOneTimePaymentSession(...)  // OK
      })
  })
```

### 规则 V6-4 — EJS 脚本加载顺序（必须严格遵守）

```html
<script src="/js/paypal/jssdk-v6/init.js"></script>      <!-- 先：singleton -->
<script src="/js/paypal/jssdk-v6/<product>.js"></script>  <!-- 再：产品 JS -->
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>  <!-- 最后：SDK with defer -->
```

**为什么 defer？** `defer` 保证 SDK 在 HTML 解析完成后、`window.load` 事件前执行。产品 JS 用 `window.addEventListener('load', ...)` 等待，此时 `window.paypal` 一定已就绪。

### 规则 V6-5 — EJS 不传 sdkUrl 给 header

v6 产品的 EJS 调用 `include('../../partials/header', { title, provider, ... })` 时**不传 sdkUrl**。header.ejs 有条件检查 `if (sdkUrl)`，不传则不加载任何 SDK。SDK 由 EJS body 中的 `<script defer>` 自行加载。

### 规则 V6-6 — window.DEMO 必须包含 clientId 和 components

```js
window.DEMO = {
  clientId:   '<%= clientId %>',    // 用于 createInstance()
  components: ['paypal-payments'],  // 各产品声明所需组件
  urls: {
    createOrder:  '/paypal/jssdk-v6/api/<product>/create-order',
    captureOrder: '/paypal/jssdk-v6/api/<product>/capture-order',
  },
}
```

### 规则 V6-9 — 产品 JS 函数结构（标准模式）

参考 PayPal 参考代码，所有 v6 产品 JS 文件统一使用以下三层分解：

```js
;(function () {
  'use strict'

  // ── 1. 顶层 paymentSessionOptions 对象（回调集中定义）
  var paymentSessionOptions = {
    onApprove: function (data) {
      var urls = (window.DEMO || {}).urls
      return fetch(urls.captureOrder, { ... body: JSON.stringify({ orderId: data.orderId }) ... })
        .then(function (r) { return r.json() })
        .then(function (order) {
          // 检查 capture.status === 'COMPLETED'
        })
    },
    onCancel: function () {
      showResult('Payment cancelled.', 'error')   // 'error' = 红色（与失败一致）
    },
    onError: function (err) {
      showResult('✗ ' + (err.message || String(err)), 'error')
    },
  }

  // ── 2. configurePayPalButton(sdkInstance)：创建 session + button + click 监听
  function configurePayPalButton(sdkInstance) {
    // V6-8: 同步返回，不能 .then()
    var session = sdkInstance.createPayPalOneTimePaymentSession(paymentSessionOptions)
    var container = clearLoading()
    var btn = document.createElement('paypal-button')
    container.appendChild(btn)
    btn.addEventListener('click', function () {
      if (!validateAmount()) return
      var urls = (window.DEMO || {}).urls
      // V6-2: 传 Promise 引用，不能 await
      var orderPromise = fetch(urls.createOrder, { ... })
        .then(function (r) { return r.json() })
        .then(function (d) {
          if (d.error) throw new Error(d.error)
          return { orderId: d.orderId }
        })
      session.start({ presentationMode: 'auto' }, orderPromise)
    })
  }

  // ── 3. onPayPalWebSdkLoaded()：SDK 入口，getPPInstance + 资格检查
  function onPayPalWebSdkLoaded() {
    getPPInstance()
      .then(function (instance) {
        // V6-3: 必须嵌套在 instance 回调内
        return instance.findEligibleMethods()
          .then(function (eligibility) {
            if (eligibility.isEligible('paypal')) {
              configurePayPalButton(instance)
            } else {
              showResult('PayPal not eligible in this region', 'error')
            }
          })
      })
      .catch(function (err) {
        showResult('✗ ' + (err.message || String(err)), 'error')
      })
  }

  // ── Currency selector + window.load 触发入口
  document.addEventListener('DOMContentLoaded', function () { /* currency change → reload */ })
  window.addEventListener('load', function () {
    if (typeof paypal === 'undefined') { showResult('✗ PayPal SDK failed to load', 'error'); return }
    onPayPalWebSdkLoaded()
  })
})()
```

### 规则 V6-10 — showResult CSS class 命名（不加 result- 前缀）

```js
// ❌ 错误：CSS 没有 .result-success / .result-error，样式不生效
el.className = 'result-msg result-success'
el.className = 'result-msg result-error'
el.style.display = 'block'  // 不要手动设 display，CSS 控制

// ✅ 正确：class 直接用 'success' 或 'error'
el.className = 'result-msg ' + type   // type = 'success' | 'error'
el.textContent = text
// .result-msg.success { display:block; color: green }
// .result-msg.error   { display:block; color: red   }
```

**onCancel 统一用 `'error'` 类型（红色）**，与支付失败保持一致：

```js
onCancel: function () {
  showResult('Payment cancelled.', 'error')   // ✅ 红色
  // showResult('Payment cancelled.', 'info') // ❌ 无对应 CSS，样式不生效
}
```

### 规则 V6-7 — 工厂路由 buildBody 必须处理零小数位货币

```js
buildBody: function (amount, currency) {
  const zero = C.isZeroDecimal(currency)
  const value = zero ? String(Math.round(parseFloat(amount))) : parseFloat(amount).toFixed(2)
  return {
    purchase_units: [{
      amount: {
        currency_code: currency,
        value,
        ...(zero ? {} : { breakdown: { item_total: { currency_code: currency, value } } }),
      },
      ...(zero ? {} : { items: [{ name: C.DEMO_ITEM.name, unit_amount: { ... }, quantity: '1' }] }),
    }],
  }
}
```

---

## 文件速查（v6 调试）

```
修改 PayPal API   → src/routes/paypal/jssdk-v6/_factory.js（工厂产品）
                    或 src/routes/paypal/jssdk-v6/<product>.js（自定义产品）
修改 SDK 行为     → src/public/js/paypal/jssdk-v6/<product>.js
修改页面 HTML     → src/views/paypal/jssdk-v6/<product>.ejs
修改 UI 样式      → src/public/css/sandbox.css（与 v5 共享）
```

---

## v6 Web Component 元素名（必须准确）

| 按钮 | 正确元素名 | JS 创建 |
|------|-----------|---------|
| PayPal 按钮 | `paypal-button` | `createElement('paypal-button')` |
| Pay Later 按钮 | `paylater-button` | `createElement('paylater-button')` |
| Venmo 按钮 | `venmo-button` | `createElement('venmo-button')` |
| PayPal Credit 按钮 | `paypal-credit-button` | `createElement('paypal-credit-button')` |

**❌ 错误：** `createElement('paypal-pay-later-button')` — 不存在的元素名。
**✅ 正确：** `createElement('paylater-button')`

---

### `paypal-button` — type 与 class

**`type` 属性**（控制按钮文字，必须设置，否则无文字）：

| type 值 | 显示文字 |
|---------|---------|
| `pay` | Pay with PayPal（**推荐，结账场景**） |
| `checkout` | PayPal Checkout |
| `buynow` | PayPal Buy Now |
| `subscribe` | PayPal Subscribe |

**`class` 属性**（控制按钮颜色）：

| class 值 | 颜色 | 说明 |
|---------|------|------|
| `paypal-gold` | 金色 | **推荐**，PayPal 品牌标准色 |
| `paypal-blue` | 蓝色 | 深蓝 |
| `paypal-white` | 白色 | 白色，适合深色背景 |

**CSS 自定义属性**（可选，控制圆角）：

```css
paypal-button {
  --paypal-button-border-radius: 4px;   /* 按钮整体圆角 */
  --paypal-mark-border-radius: 4px;     /* PayPal 标志圆角 */
}
```

**完整创建示例：**

```js
var btn = document.createElement('paypal-button')
btn.setAttribute('type', 'pay')        // "Pay with PayPal"
btn.setAttribute('class', 'paypal-gold')  // 金色（推荐）
container.appendChild(btn)
```

---

### `paylater-button` — productCode 与 countryCode

属性需以 DOM property（非 HTML attribute）方式赋值：

```js
var btn = document.createElement('paylater-button')
btn.productCode = paylaterDetails.productCode   // 从 eligibility.getDetails('paylater') 取
btn.countryCode = paylaterDetails.countryCode
container.appendChild(btn)
```

---

### `venmo-button`

```js
var btn = document.createElement('venmo-button')
btn.setAttribute('type', 'pay')
btn.setAttribute('class', 'venmo-blue')
container.appendChild(btn)
```

---

### `paypal-credit-button`

```js
var btn = document.createElement('paypal-credit-button')
btn.countryCode = 'US'   // DOM property
container.appendChild(btn)
```

---

### CSS — 让 web component 铺满容器

```css
/* sandbox.css 已包含此规则，无需重复 */
paypal-button,
paylater-button,
venmo-button,
paypal-credit-button {
  display: block;
  width: 100%;
}
```

---

## 各产品 components 数组（已确认）

| product_key | components | 状态 |
|---|---|---|
| paypal-ecm, paypal-ecs | `['paypal-payments']` | ✅ 已实现 |
| paylater-ecm, paylater-ecs | `['paypal-payments']` | ✅ 已实现 |
| venmo-ecm, venmo-ecs | TBD | 等 markdown |
| bcdc-ecm, bcdc-ecs, buttons | TBD | 等 markdown |
| acdc | TBD | 等 markdown |
| applepay-ecm, applepay-ecs | TBD | 等 markdown |
| googlepay-ecm, googlepay-ecs | TBD | 等 markdown |
| vault-* | TBD | 等 markdown |
| plm-html, plm-js | TBD | 等 markdown |
