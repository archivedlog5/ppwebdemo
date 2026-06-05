# CLAUDE.md — PayPal JSSDK v6

> 通用规则见 `apps/demo-hub/CLAUDE.md`（所有路径均自动加载）。本文件只包含 JSSDK v6 专属规则。
>
> **Symlinks:** `src/public/js/paypal/jssdk-v6/CLAUDE.md` 和 `src/views/paypal/jssdk-v6/CLAUDE.md` 均指向本文件，编辑任何 v6 文件时都会自动加载。

## ⚠️ Opus 模型限制

**当前 model 为 Opus 时，只允许写 markdown，禁止写任何代码，禁止执行任何代码改动。**

- 允许：创建/编辑 `.md` 文件（需求、设计、计划、todo、进度等文档）
- 禁止：编写或修改任何代码文件（`.js`、`.ejs`、`.ts`、`.css`、`.json`、`.sql` 等）
- 禁止：执行任何代码生成、重构或 bug 修复的代码写入操作
- 需要写代码时：提示用户切换到非 Opus 模型（如 Sonnet）

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
| Pay Later 按钮 | `paypal-pay-later-button` | `createElement('paypal-pay-later-button')` |
| Venmo 按钮 | `venmo-button` | `createElement('venmo-button')` |
| PayPal Credit 按钮 | `paypal-credit-button` | `createElement('paypal-credit-button')` |

**❌ 错误：** `createElement('paylater-button')` — SDK 未注册此元素，创建后无内容不可见。
**✅ 正确：** `createElement('paypal-pay-later-button')`

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

### `paypal-pay-later-button` — productCode 与 countryCode

与 `paypal-button` 一致，动态创建后 append 到容器：

```js
var paylaterDetails = eligibility.getDetails('paylater')
var btn = document.createElement('paypal-pay-later-button')
btn.productCode = paylaterDetails.productCode   // DOM property（非 attribute）
btn.countryCode = paylaterDetails.countryCode   // DOM property（非 attribute）
container.appendChild(btn)
```

---

### `paypal-credit-button` — countryCode

```js
var creditDetails = eligibility.getDetails('credit')
var btn = document.createElement('paypal-credit-button')
btn.countryCode = creditDetails.countryCode   // DOM property
container.appendChild(btn)
```

---

### CSS — 让 web component 铺满容器

```css
/* sandbox.css 已包含此规则，无需重复 */
paypal-button,
paypal-pay-later-button,
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
| venmo-ecm, venmo-ecs | `['venmo-payments']` | ✅ 已实现 |
| bcdc-ecm, bcdc-ecs | `['paypal-guest-payments']` | ✅ 已实现 |
| acdc | `['card-fields']` | ✅ 已实现 |
| applepay-ecm | `['applepay-payments']` | ✅ 已实现 |
| applepay-ecs | `['applepay-payments']` | ✅ 已实现 |
| googlepay-ecm | `['googlepay-payments']` | ✅ 已实现 |
| googlepay-ecs | `['googlepay-payments']` | ✅ 已实现 |
| vault-paypal-with-purchase | `['paypal-payments']` | ✅ 已实现 |
| vault-paypal-setup-only | `['paypal-payments']` | ✅ 已实现 |
| vault-acdc-setup-only | `['card-fields']` | ✅ 已实现 |
| plm-html | `['paypal-messages']` | ✅ 已实现 |
| plm-js | TBD | 等 markdown |

---

## Vault PayPal with Purchase 专属规则

### 规则 V6-VAULT-1 — 认证路径 = clientId（非 clientToken / id_token）

v5 vault 用 `id_token`（需要后端调 `fetchIdToken()`）；v6 vault 标准路径为 `clientId`，与普通 PayPal 按钮完全相同。不需要 id_token，不需要额外的认证端点。

### 规则 V6-VAULT-2 — eligibility 用 paymentFlow: 'VAULT_WITH_PAYMENT'

```js
instance.findEligibleMethods({
  currencyCode: getCurrency(),
  paymentFlow: 'VAULT_WITH_PAYMENT',   // vault 专属参数
})
// 资格检查 key
eligibility.isEligible('paypal')
```

若 `findEligibleMethods` 不接受 `paymentFlow` 参数，回退为不带 `paymentFlow`，记 `docs/debug-log.md`。

### 规则 V6-VAULT-3 — session 加 savePayment: true

```js
var paymentSessionOptions = {
  onApprove: ...,
  onCancel:  ...,
  onError:   ...,
  savePayment: true,   // 因 create-order body 含 store_in_vault: ON_SUCCESS
}
```

### 规则 V6-VAULT-4 — vault token 来源 = capture 响应（后端已提取为顶层字段）

后端 capture-order 额外提取：
```js
const vaultInfo = data?.payment_source?.paypal?.attributes?.vault
const vaultId   = vaultInfo?.id || null
const customerId = vaultInfo?.customer?.id || null
res.json({ ...data, vaultId, customerId })
```

前端优先读后端提取的顶层字段，降级读 response 原路径：
```js
var vaultId    = order.vaultId    || (vault && vault.id) || null
var customerId = order.customerId || (vault && vault.customer && vault.customer.id) || null
```

### 规则 V6-VAULT-5 — create-order body 与 v5 逐字一致，仅 return/cancel url 改 v6 路径

- v5：`return_url: .../paypal/jssdk-v5/vault-paypal-with-purchase`
- v6：`return_url: .../paypal/jssdk-v6/vault-paypal-with-purchase`
- 其他字段（vault 属性、customer.merchant_customer_id、brand_name、purchase_units）完全一致
- 后端 create-order 返回 `{ orderId: order.id }`（小写 d，遵守 V6-1）
- 后端 capture-order 读 `const { orderId } = req.body`（小写 d，遵守 V6-1）

### 规则 V6-VAULT-6 — 无 presentation-mode 下拉，无 custom-trigger 按钮（v5 UI only）

本 demo 不引入 v6 ECM 的 presentation-mode 选择器或 custom-trigger 按钮。FALLBACK_MODES 固定为 `['auto', 'popup', 'redirect', 'modal']`（无 `payment-handler`）。

---

## PLM 专属规则

### 规则 V6-PLM-1 — createPayPalMessages() 必须传 currencyCode + buyerCountry

```js
// ❌ 错误：无参调用，messages API 返回 422
sdkInstance.createPayPalMessages()

// ✅ 正确：传当前货币和国家，SDK 据此拉取对应语言和产品的 message 模板
sdkInstance.createPayPalMessages({
  currencyCode: window.DEMO.currency || 'USD',   // 'USD' / 'GBP' / 'AUD' / 'EUR' / ...
  buyerCountry: window.DEMO.country  || 'US',    // 'US' / 'GB' / 'AU' / 'DE' / 'ES' / 'FR' / 'IT' / 'CA'
})
```

国家切换时刷页，服务端重新映射 currency，`window.DEMO.currency` / `window.DEMO.country` 同步更新，重新调 `createPayPalMessages()` 即可。

### 规则 V6-PLM-2 — auto-bootstrap 模式不需要调 fetchContent()

所有 `<paypal-message>` 元素带 `auto-bootstrap` 属性，SDK 的 PayPalMessages 数据层自动 observe 属性变化（`amount`、`currency-code` 等）并重新拉取 message 内容。JS 只需：
1. 调 `createPayPalMessages({ currencyCode, buyerCountry })` 启动数据层
2. 金额变化时 `el.setAttribute('amount', val)` 触发 SDK 自动更新

不需要手动调 `fetchContent()`（那是 JS API 模式，用于 plm-js demo）。

### 规则 V6-PLM-3 — 脚本加载顺序（三段式，无需单独 paypal-messages script）

```html
<script src="/js/paypal/jssdk-v6/init.js"></script>        <!-- 1. singleton -->
<script src="/js/paypal/jssdk-v6/plm-html.js"></script>    <!-- 2. 产品 JS -->
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>  <!-- 3. v6 core -->
```

`components: ['paypal-messages']` 传给 `createInstance()`，core SDK 会按需加载 messages 组件，**无需单独引入** `paypal-messages` script（v5 需要 URL 参数 `components=messages`，v6 不同）。

### 规则 V6-PLM-4 — 路由为 GET-only 自定义路由，不用工厂函数

plm-html 无订单 API，`_factory.js` 的 `buildBody` 为必填项，不能用工厂。需写独立 GET 路由：
- GET handler：读 `?country` / `?amount` → 映射 currency → `res.render()`
- 无 POST 端点

---

## Apple Pay 专属规则

### 规则 V6-APPLEPAY-1 — 双层资格检查

浏览器检查（先）：`window.ApplePaySession` 存在 → `ApplePaySession.supportsVersion(4)` → `ApplePaySession.canMakePayments()`
账号检查（后）：`findEligibleMethods({ currencyCode }).isEligible('applepay')`

两层检查文案区分：
- 浏览器不支持 → "Apple Pay is not available. Please use Safari on a supported Apple device."
- 账号不合格 → "Apple Pay is not eligible for this account."

### 规则 V6-APPLEPAY-2 — v6 配置路径（不同于 v5）

| v5 | v6 |
|----|----|
| `paypalSDK.Applepay().config()` | `eligibility.getDetails('applepay').config`（注意：在 eligibility 上调用） |
| `applepayInstance.validateMerchant()` | `applePaySession.validateMerchant()` |
| `applepayInstance.confirmOrder()` | `applePaySession.confirmOrder()` |

**关键**：`getDetails('applepay')` 是 `findEligibleMethods()` 返回的 `eligibility` 对象上的方法，**不是** `instance` 上的方法。
`applePaySession` 来自 `instance.createApplePayOneTimePaymentSession()`（同步返回）。

### 规则 V6-APPLEPAY-3 — formatConfigForPaymentRequest 用 Object.assign 展开

```js
var formattedConfig = applePaySession.formatConfigForPaymentRequest(details.config)
// formattedConfig 已包含 merchantCapabilities + supportedNetworks
var paymentRequest = Object.assign({}, formattedConfig, {
  countryCode:                  'US',   // 硬编码覆盖（ECM）
  currencyCode:                 currency,
  requiredBillingContactFields: ['name', 'phone', 'email', 'postalAddress'],
  requiredShippingContactFields: [],
  total: { label: 'Total', amount: value, type: 'final' },
})
```

不要手动从 `formattedConfig` 取 `merchantCapabilities`/`supportedNetworks`，直接展开即可。

### 规则 V6-APPLEPAY-4 — confirmOrder 防御式校验

```js
var approveApplePayPayment = confirmResult && confirmResult.approveApplePayPayment
if (approveApplePayPayment && approveApplePayPayment.status) {
  // 有 status 字段才检查，否则跳过（靠 capture COMPLETED 判断）
  if (approveApplePayPayment.status !== 'APPROVED') {
    throw new Error('Apple Pay not approved · status: ' + approveApplePayPayment.status)
  }
}
```

### 规则 V6-APPLEPAY-5 — capture 只认 COMPLETED（规则 13）

同 v5 规则 13：`purchase_units[0].payments.captures[0].status === 'COMPLETED'` 才算成功。不认 PENDING / DECLINED 等非终态。

### 规则 V6-APPLEPAY-6 — 脚本加载顺序（四段式，Apple Pay 专属）

```html
<script src="/js/paypal/jssdk-v6/init.js"></script>          <!-- 1. singleton -->
<script src="/js/paypal/jssdk-v6/applepay-ecm.js"></script>  <!-- 2. 产品 JS -->
<script src="https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js"></script>  <!-- 3. Apple CDN -->
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>            <!-- 4. v6 core -->
```

Apple CDN 在 v6 core 之前加载，确保 `window.ApplePaySession` 在 `window.load` 时可用。

### 规则 V6-APPLEPAY-7 — 官方 `<apple-pay-button>` + 客制按钮，同一 handler

两个按钮绑同一 click handler `onApplePayClicked(applePaySession, details)`。
`applePaySession` 是 v6 SDK session（持有 validateMerchant/confirmOrder），`details` 是 getDetails 结果（持有 config）。

### 规则 V6-APPLEPAY-8 — completePayment 必须始终调用

Apple Pay sheet 必须收到 `completePayment()` 才会关闭，否则 sheet 卡住。
成功：`{ status: ApplePaySession.STATUS_SUCCESS }`，失败/错误：`{ status: ApplePaySession.STATUS_FAILURE }`。
`.catch()` 中也必须调用。

### 规则 V6-APPLEPAY-ECS — applepay-ecs 在 ecm 基础上的增量规则

**paymentRequest 额外字段（Object.assign 后置覆盖）：**
- `requiredShippingContactFields: ['name', 'phone', 'email', 'postalAddress']`
- `shippingType: 'shipping'`
- `shippingMethods`: SHIPPING_METHODS 数组（Standard $5 / Express $10，含 identifier）
- `lineItems`: `[{ label: 'Item Total', amount: value }, { label: chosenShipping.label, amount: shippingAmt }]`
- `total`: `calcTotal(value, chosenShipping, zd)`（item + chosenShipping.amount，sheet total 与 create-order 金额必须一致）

**新增 Apple Pay session 事件（浏览器原生，不依赖 v6 SDK）：**
- `onshippingcontactselected`：不按地址重算运费，仅用 `completeShippingContactSelection` 重确认当前 total + lineItems
- `onshippingmethodselected`：按 `event.shippingMethod.identifier` 查 SHIPPING_METHODS → 更新 `chosenShipping`，fallback 到 Standard；用 `completeShippingMethodSelection` 更新 total + lineItems

**chosenShipping 状态管理：**
- 每次按钮点击前 reset 为 `SHIPPING_METHODS[0]`（Standard）
- `onshippingmethodselected` 按 identifier 更新；identifier 不匹配时 fallback 到 Standard（不崩溃）

**create-order 请求 body 额外含：**
- `shippingContact`、`billingContact`（从 `event.payment` 取）
- `shippingAmount: chosenShipping.amount`

**后端 create-order body 额外含（对比 ECM）：**
- breakdown 含 `item_total` + `shipping`（两者分开）
- `shipping` object（mapApplePayShipping(shippingContact)）
- `payment_source.apple_pay` 额外含 `name`、`email_address`、`phone_number: { national_number }`（仅 national_number，无 country_code）

**normalizeContact()：** 剥离 phoneNumber 前导 `+`（Apple Pay 可能返回 E.164 格式，PayPal confirmOrder 不接受前导 `+`）

**返回字段：** `res.json({ orderId: order.id })`（v6 小写 d）；capture 读 `{ orderId }`（小写 d）

---

## ACDC 专属规则

### 规则 V6-ACDC-1 — eligibility key 为 `advanced_cards`，防御式判定

```js
instance.findEligibleMethods({ currencyCode: getCurrency() })
  .then(function (eligibility) {
    eligibility.isEligible('advanced_cards')  // ✅ key 名
  })
```

官方提示："The card may not appear in the eligibility response yet. Integrate defensively."
→ `isEligible('advanced_cards')` 返回 true **或** key 缺失时，**仍然渲染**卡输入域；仅在明确不合格信号时拦截。

### 规则 V6-ACDC-2 — createCardFieldsOneTimePaymentSession 同步返回

```js
// ✅ 同步调用，不 await，不 .then()
var session = instance.createCardFieldsOneTimePaymentSession()

// ❌ 错误：.then() 不存在，抛 TypeError
instance.createCardFieldsOneTimePaymentSession().then(...)
```

### 规则 V6-ACDC-3 — 字段用 appendChild（不是 v5 的 .render()）

```js
var numberField = session.createCardFieldsComponent({ type: 'number', placeholder: '...', style: STYLE })
document.querySelector('#card-number-container').appendChild(numberField)
// 同样适用 expiry / cvv
```

### 规则 V6-ACDC-4 — submit 是命令式，billingAddress 字段名用文档定义

v6 CardFields 官方写法：点击时先 await createOrder() 拿 orderId，再 await session.submit()。
这是 CardFields 专属；V6-2（session.start 必须传 Promise）仅适用于 Button session。

```js
async function onPayClick(session) {
  var orderId = await createOrder()                         // 显式获取 orderId
  var result  = await session.submit(orderId, {             // submit(orderId, opts) → { data, state }
    billingAddress: mapBilling(window.DEMO.billing),
  })
  await handleSubmitResult(result, payBtn)
}
```

**⚠️ billingAddress 字段名与 v5/后端不同：**

| submit billingAddress | 后端 create-order（snake_case） | window.DEMO.billing |
|---|---|---|
| `streetAddress` | `address_line_1` | `addressLine1` |
| `city` | `admin_area_2` | `adminArea2` |
| `state` | `admin_area_1` | `adminArea1` |
| `postalCode` | `postal_code` | `postalCode` |
| `countryCode` | `country_code` | `countryCode` |

`mapBilling()` 负责把 `window.DEMO.billing`（camelCase）映射为 submit 需要的字段名。

### 规则 V6-ACDC-5 — submit 返回 { data, state }，state 机处理结果

| state | 含义 | 处理 |
|-------|------|------|
| `'succeeded'` | 支付流程完成（含 3DS） | 读 `data.liabilityShift` → decide3DSAndCapture |
| `'canceled'` | 用户关闭 3DS 弹窗 | 显示取消提示，按钮重新可用 |
| `'failed'` | 卡校验/处理失败 | 显示 `data.message` |

### 规则 V6-ACDC-6 — 3DS 决策与 v5 ACDC 完全一致

- `data.liabilityShift` 为 `undefined` 或 `'POSSIBLE'` → 直接 capture。
- 其他值 → GET order details → 读 `payment_source.card.authentication_result`：
  - `liability_shift === 'NO'` + enrollment ∈ `{N, U, B}` → capture（未入会，frictionless）。
  - `liability_shift === 'UNKNOWN'` → 显示 "please retry"。
  - 其他 → 显示 "3D Secure declined"。

唯一字面差异：orderId 小写 d（`data.orderId`、`:orderId`）。

---

## BCDC 专属规则

### 规则 V6-BCDC-1 — session 方法名不同，且是异步的

```js
// ❌ 错误：PayPal session 方法
var session = sdkInstance.createPayPalOneTimePaymentSession(opts)

// ✅ 正确：BCDC 专属方法，且必须 await（异步，不同于 PayPal 的同步）
var session = await sdkInstance.createPayPalGuestOneTimePaymentSession(opts)
```

### 规则 V6-BCDC-2 — 无 hasReturned() / resume()

与 Venmo 一样，`createPayPalGuestOneTimePaymentSession` 返回的 session **没有** `hasReturned()` 和 `resume()` 方法。直接省略，否则报 `TypeError: session.hasReturned is not a function`。

### 规则 V6-BCDC-3 — eligibility key 为 `basic_cards`（下划线复数）

```js
instance.findEligibleMethods({ currencyCode: getCurrency() })
  .then(function (eligibility) {
    eligibility.isEligible('basic_cards')  // ✅ 下划线 + 复数
    // eligibility.isEligible('basic-card')  // ❌ 连字符 + 单数
  })
```

### 规则 V6-BCDC-4 — 按钮元素与容器

```js
var cardContainer = document.createElement('paypal-basic-card-container')
var btn = document.createElement('paypal-basic-card-button')
cardContainer.appendChild(btn)
container.appendChild(cardContainer)
```

### 规则 V6-BCDC-5 — 额外回调：onComplete 和 onWarn

```js
await sdkInstance.createPayPalGuestOneTimePaymentSession({
  onApprove,
  onCancel,
  onComplete: function (data) { /* 支付流程完成 */ },
  onError,
  onWarn: function (data) { /* 表单提交失败（卡号错误、地址错误等），可恢复 */ },
})
```

### 规则 V6-BCDC-6 — presentation mode 不支持 payment-handler

BCDC 支持：`auto`, `modal`, `popup`, `redirect`。**不支持** `payment-handler`。
`DEFAULT_MODES = ['auto', 'modal', 'popup', 'redirect']`

---

## Venmo 专属规则

### 规则 V6-VENMO-1 — 使用 US 账号凭证

Venmo 仅支持 US 买家 + USD，路由文件必须使用 US 账号：

```js
// GET handler
clientId: process.env.PAYPAL_US_CLIENT_ID

// create-order / capture-order
const token = await getUSToken()
```

**不能**使用工厂函数（`_factory.js` 硬编码 CN 账号），必须写自定义路由。

### 规则 V6-VENMO-2 — session 方法名不同

```js
// ❌ 错误：PayPal session 方法，Venmo 没有
var session = sdkInstance.createPayPalOneTimePaymentSession(opts)

// ✅ 正确：Venmo 专属方法
var session = sdkInstance.createVenmoOneTimePaymentSession(opts)
```

### 规则 V6-VENMO-3 — Venmo session 无 hasReturned() / resume()

这两个方法是 PayPal session 为 redirect 模式提供的，Venmo session **不存在**：

```js
// ❌ 错误：直接抛 TypeError: session.hasReturned is not a function
if (session.hasReturned()) { session.resume(); return }

// ✅ 正确：Venmo 仅支持 auto 模式，无整页跳转，直接省略
```

### 规则 V6-VENMO-4 — findEligibleMethods 必须传 currencyCode

```js
// ✅ 正确：Venmo 文档要求显式传 currencyCode
instance.findEligibleMethods({ currencyCode: 'USD' })

// 资格检查
eligibility.isEligible('venmo')
```

### 规则 V6-VENMO-5 — 按钮元素与 presentation mode

```js
// 按钮元素名
var btn = document.createElement('venmo-button')
btn.setAttribute('type', 'pay')

// 唯一支持的 presentation mode
session.start({ presentationMode: 'auto' }, orderPromise)
// 无需 fallback loop（PayPal ECM 有 5 种模式，Venmo 只有 auto）
```

### 规则 V6-VENMO-6 — 货币硬编码 USD，create-order 无需传 currency

```js
// 后端：固定 USD，不从 req.body.currency 读取
const val = parseFloat(amount).toFixed(2)
// currency_code 硬编码 'USD'

// 前端：createOrder fetch body 只传 amount，不传 currency
body: JSON.stringify({ amount: getAmount() })
```

---

## Standalone Buttons 专属规则

### 规则 V6-BUTTONS-1 — 同页面双账号必须顺序创建 + US 用 clientToken

同页面同时渲染 CN（PayPal/PayLater/BCDC）和 US（Venmo）按钮时：

```
❌ 错误：两次 createInstance 用 clientId，并发调用
  → CN 先起，US clientId 的 Venmo isEligible 返回 false（SDK 内部 auth 竞态）

❌ 错误：data-namespace 加载两次 SDK
  → v6 Web Component（paypal-button 等）注册是全局单例，第二次注册报
     NotSupportedError: already been used with this registry

✅ 正确：单 SDK 加载，顺序 await，US 用 clientToken（不是 clientId）
```

```js
// onPayPalWebSdkLoaded — async function
var cnPromise  = getPPInstance()          // CN：clientId via window.DEMO.clientId
var usTokenPromise = fetch(urls.usClientToken).then(r => r.json()).then(d => d.clientToken)

// Step 1: CN 完全就绪后再建 US
var cnInstance = await cnPromise
// ... 设置 PayPal / PayLater / BCDC 按钮 ...

// Step 2: 用 clientToken 创建 US 实例
var usClientToken = await usTokenPromise
var usInstance = await paypal.createInstance({
  clientToken: usClientToken,   // ← clientToken 不是 clientId
  components: ['venmo-payments'],
  pageType: 'checkout',
  testBuyerCountry: 'US',
})
// ... 设置 Venmo 按钮 ...
```

### 规则 V6-BUTTONS-2 — getUSClientToken() 调用方式

```js
// config/paypal.js
async function getUSClientToken() {
  // 调 /v1/oauth2/token，加 response_type=client_token + domains[]
  // 返回 data.access_token（PayPal 把 client_token 放在 access_token 字段）
}
```

路由后端暴露端点：`GET /api/buttons/us-client-token`，前端并行 fetch（与 CN instance 创建同时发起，await CN 完成后再 await token）。

### 规则 V6-BUTTONS-3 — 货币固定 USD

Standalone Buttons 页面有 Venmo（只支持 USD），currency selector disabled，`getCurrency()` 直接返回 `'USD'`。

---

## Google Pay 专属规则

### 规则 V6-GOOGLEPAY-1 — components 数组

`googlepay-ecm` 使用 `['googlepay-payments']`（与 applepay 的 `applepay-payments` 对应）。

### 规则 V6-GOOGLEPAY-2 — 三层资格检查

1. **Google Pay SDK 可用性**（浏览器）：`window.google && window.google.payments && window.google.payments.api && window.google.payments.api.PaymentsClient`
2. **账号资格**：`findEligibleMethods({ currencyCode }).isEligible('googlepay')`
3. **设备/账号支持**：`paymentsClient.isReadyToPay({ allowedPaymentMethods, apiVersion, apiVersionMinor })`

三层全通过才渲染按钮，每层失败显示不同文案。

### 规则 V6-GOOGLEPAY-3 — v6 配置路径（不同于 v5）

| 步骤 | v5 | v6 |
|------|----|----|
| 取 SDK | `paypalSDK.Googlepay()` 全局同步 | `getPPInstance()` → `instance.createGooglePayOneTimePaymentSession()`（同步） |
| 取配置 | `Googlepay().config()` → Promise | `eligibility.getDetails('googlepay').config` + `session.formatConfigForPaymentRequest(config)`（同步） |
| 账号资格 | 无 | `findEligibleMethods().isEligible('googlepay')` |
| confirmOrder | `Googlepay().confirmOrder(...)` | `googlePaySession.confirmOrder(...)` |

**关键**：`getDetails('googlepay')` 在 `eligibility` 对象上调用，**不是** `instance` 上的方法。`googlePaySession` 来自 `instance.createGooglePayOneTimePaymentSession()`（同步返回）。

### 规则 V6-GOOGLEPAY-4 — ECM = Promise 模式（与 v5 一致，已实测确认）

**v6 ECM 使用 Promise 模式**，与 v5 ECM 相同。实测（2026-06-03）：Promise 模式可正常拉起 sheet 并完成付款，**不触发 OR_BIBED_06**。

> 历史更正：本规则早期写为"ECM 必须用 Callback 模式，否则 OR_BIBED_06"。2026-06-03 重写本 demo 时实测：Callback 模式与 Promise 模式**均可用**，先前的 OR_BIBED_06 是上一版（已废弃）实现里另一个 bug 的误判，并非 Promise 模式本身所致。最终按用户决策 + 设计文档采用 Promise 模式（对齐 v5；3DS 弹窗在 sheet 关闭后才弹，不被遮挡）。

```js
// PaymentsClient 不传 paymentDataCallbacks（Promise 模式）
var paymentsClient = new google.payments.api.PaymentsClient({ environment: 'TEST' })

// loadPaymentData request 不含 callbackIntents
var req = Object.assign({}, BASE_REQUEST, {
  allowedPaymentMethods: googlePayConfig.allowedPaymentMethods,
  merchantInfo:          googlePayConfig.merchantInfo,
  transactionInfo:       { countryCode: 'US', currencyCode, totalPriceStatus: 'FINAL', totalPrice, totalPriceLabel: 'Total' },
  shippingAddressRequired: false,
  emailRequired:           true,
})
```

**流程：** 点按钮 → `paymentsClient.loadPaymentData(req)` 开 sheet → 用户确认 → sheet 关闭，Promise `resolve(paymentData)` → 取 `paymentData.email` → `createOrder` → `processPayment`（`confirmOrder` → 3DS → capture）。`.catch` 中 `err.statusCode === 'CANCELED'` 静默。

> ⚠️ **仅免挑战（SCA_WHEN_REQUIRED）可用。** SCA_ALWAYS 的 3DS 在 v6 走不通——详见 V6-GOOGLEPAY-7（已知限制，callback 模式也修不了）。

**`formatConfigForPaymentRequest(details.config)`** 返回含 `allowedPaymentMethods`（带 tokenizationSpecification）/`merchantInfo`/`apiVersion`/`apiVersionMinor` 的 config，用于拼装 `loadPaymentData` 请求 + `isReadyToPay`。

**ECS 另议**：ECS 额外需要 Full Callback 模式（`onPaymentDataChanged` + `SHIPPING_ADDRESS`/`SHIPPING_OPTION`/`PAYMENT_AUTHORIZATION` intents），与 ECM 不同（等 ECS 实现时补充规则）。

### 规则 V6-GOOGLEPAY-5 — createGooglePayOneTimePaymentSession + formatConfigForPaymentRequest 同步返回

- `instance.createGooglePayOneTimePaymentSession()` 同步返回 `googlePaySession`（不是 Promise）
- `googlePaySession.formatConfigForPaymentRequest(details.config)` 同步返回 `googlePayConfig`
- 实测后在 `inspect()` 输出确认；若实测为 Promise 再加 `await`（目前按同步处理）

### 规则 V6-GOOGLEPAY-6 — confirmOrder 返回形态

`googlePaySession.confirmOrder({ orderId, paymentMethodData })` 是 **async**（返回 Promise）。实测返回形态（2026-06-03 inspect）：
- 免挑战：`{ id, status: 'APPROVED', links, payment_source }` → 直接 `doCapture`
- 3DS：`{ id, status: 'PAYER_ACTION_REQUIRED', purchase_units, links, payment_source }` → 进入 `handlePayerAction` —— **但在 v6 走不通，见 V6-GOOGLEPAY-7**

> confirmOrder 完整签名（proto 实测）：`async confirmOrder({ billingAddress, email, orderId, paymentMethodData, shippingAddress })`，本 demo 只传 `{ orderId, paymentMethodData }`。

### 规则 V6-GOOGLEPAY-7 — 3DS（SCA_ALWAYS）当前不支持（实测结论 2026-06-03）

**结论：v6 Google Pay ECM demo 的 3DS 走不通，按"已知限制"处理。** 免挑战（SCA_WHEN_REQUIRED）正常 capture；SCA_ALWAYS 触发 `PAYER_ACTION_REQUIRED` 后无法完成。

实测发现（inspect + 两种模式都试过）：

1. **`googlePaySession.initiatePayerAction` 形态**：`length:0`、**普通函数（非 async）**、调用返回 `undefined`（v5 是返回 Promise 的 thenable）。proto 上只有 `formatConfigForPaymentRequest / getGooglePayConfig / confirmOrder / initiatePayerAction`，**没有 `hasReturned` / `resume`**。
2. **Promise 模式**：sheet 关闭后调 `confirmOrder` 拿到 `PAYER_ACTION_REQUIRED` → 调 `initiatePayerAction()` **没有弹任何 3DS 挑战**（void no-op），随后 GET order 的 `payment_source.google_pay.card.authentication_result` 全为 `undefined` → 落到 `✗ 3DS error · liability_shift: undefined`。无 `resume()` 可等，拿不到结果。
3. **Callback 模式**（`onPaymentAuthorized` + `callbackIntents:['PAYMENT_AUTHORIZATION']`，sheet 仍开）：`confirmOrder` 内部的 `POST .../graphql?ApproveGooglePayPayment` 被 `ERR_CONNECTION_RESET` 打断（CN 直连 sandbox.paypal.com 的网络问题），同样无法完成。**用户判定：callback 模式也解决不了这个 3DS 问题**。

**最终方案（用户拍板）**：ship **Promise 模式**（对齐 v5、免挑战可用）。`handlePayerAction` 保留为防御兜底：best-effort 调 `initiatePayerAction()`（无参）+ GET order + `handle3DS` 决策表；当前环境下 SCA_ALWAYS 会显示 3DS 错误，属已知限制，不是 bug。

> 代码现状：`googlepay-ecm.js` 为 Promise 模式（`PaymentsClient` 无 `paymentDataCallbacks`，请求无 `callbackIntents`）。如未来要支持 3DS，需 PayPal 提供 v6 Google Pay 可驱动 payer-action 的机制（带 Promise 返回或 resume），目前 SDK 形态不具备。

**UI 标注（2026-06-04）：** `googlepay-ecm.ejs` 已在页面上标记此限制——3DS 下拉框设为 `disabled`（固定显示 SCA_WHEN_REQUIRED）+ 黄色 warning 横条说明 "3DS not supported in JSSDK v6 yet"，告知用户后续会更新。

### 规则 V6-GOOGLEPAY-8 — 脚本加载顺序（四段式，Google Pay 专属）

```html
<script src="/js/paypal/jssdk-v6/init.js"></script>          <!-- 1. singleton -->
<script src="/js/paypal/jssdk-v6/googlepay-ecm.js"></script>  <!-- 2. 产品 JS -->
<script src="https://pay.google.com/gp/p/js/pay.js"></script> <!-- 3. Google Pay CDN -->
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>  <!-- 4. v6 core -->
```

Google Pay CDN 在 v6 core 之前加载，确保 `window.google.payments.api.PaymentsClient` 在 `window.load` 时可用。

### 规则 V6-GOOGLEPAY-9 — 官方 createButton + 客制按钮，同一 handler

两个按钮绑同一 click handler `onGooglePayButtonClicked(googlePaySession, googlePayConfig)`。
`googlePaySession` 来自 `instance.createGooglePayOneTimePaymentSession()`（持有 `confirmOrder` 和可能的 `initiatePayerAction`）；`googlePayConfig` 来自 `formatConfigForPaymentRequest`。
模块级 `paymentsClient`（Google `PaymentsClient`，Promise 模式无 callbacks）在 handler 内调 `loadPaymentData`。

### 规则 V6-GOOGLEPAY-10 — ECM phone 用 SANDBOX_PHONE 预填

ECM（`shippingAddressRequired: false`）Google Pay sheet 无地址区，无法收电话 → 后端 create-order 用 `demoParams.SANDBOX_PHONE` 预填（对应 v5 规则 17）。

### 规则 V6-GOOGLEPAY-11 — capture 只认 COMPLETED（规则 13）

同 v5 规则 13：`purchase_units[0].payments.captures[0].status === 'COMPLETED'` 才算成功。

---

## Vault PayPal Setup-Only 专属规则

### 规则 V6-SETUP-ONLY-1 — 模型：Save Payment Session + Vault v3 两步 token，不碰 Orders API

- 流程：`POST /v3/vault/setup-tokens`（create-setup-token） → 买家 approve → `POST /v3/vault/payment-tokens`（confirm-setup-token）。
- 使用 `createPayPalSavePaymentSession`（**不是** `createPayPalOneTimePaymentSession`；也**没有** `savePayment: true` 选项，save session 本身即 vault）。
- 不调 Orders API（`/v2/checkout/orders`）。

### 规则 V6-SETUP-ONLY-2 — eligibility：paymentFlow = VAULT_WITHOUT_PAYMENT，currency 固定 USD

```js
instance.findEligibleMethods({
  currencyCode: 'USD',             // zero-dollar，固定 USD
  paymentFlow: 'VAULT_WITHOUT_PAYMENT',
})
eligibility.isEligible('paypal')   // 资格 key
```

若 `paymentFlow` 不被接受，回退为不带 `paymentFlow`，记 `docs/debug-log.md`。

### 规则 V6-SETUP-ONLY-3 — session.start() 第二参必须 resolve 为 { vaultSetupToken }

```js
// createSetupToken() 返回 Promise<{ vaultSetupToken: id }>（不是 orderId）
var setupTokenPromise = createSetupToken()   // V6-2：不 await
session.start({ presentationMode: FALLBACK_MODES[i] }, setupTokenPromise)
```

### 规则 V6-SETUP-ONLY-4 — onApprove data key = vaultSetupToken（探针 T3 确认）

```js
onApprove: function (data) {
  // data.vaultSetupToken（不是 data.orderId，不是 data.billingToken）
  return createPaymentToken(data.vaultSetupToken)
}
```

前端传给后端时，body key 用 `setupTokenId`（与 v5 端点入参一致）：
```js
body: JSON.stringify({ setupTokenId: vaultSetupToken })
```

### 规则 V6-SETUP-ONLY-5 — create-setup-token body 与 v5 逐字一致（仅 return/cancel url 改 v6）

- customer.merchant_customer_id: 'MERCHANT_CUST_001'（硬编码，v5 一致）
- payment_source.paypal: NO_SHIPPING / IMMEDIATE / MERCHANT / CONSUMER
- return_url / cancel_url: `/paypal/jssdk-v6/vault-paypal-setup-only`（v6 路径）
- v6 不回传 `approveLink`（session.start 内部处理弹窗，无需）

### 规则 V6-SETUP-ONLY-6 — 认证路径 = clientId（复用 init.js）

不新增 browser-safe-client-token 端点（用户拍板）。若实测 `createPayPalSavePaymentSession` 在 clientId 下失败，切 clientToken 路径，记 `docs/debug-log.md`。

### 规则 V6-SETUP-ONLY-7 — 结果展示：Payment Token + Customer ID

confirm 响应 `{ paymentTokenId, customerId }`，展示到 `#payment-token-id` / `#customer-id`（与 v5 一致）。不展示 Vault Token（那是 vault-with-purchase 的字段名）。

### 规则 V6-SETUP-ONLY-8 — 探针清单（首次实测后删日志，结论记 debug-log）

| 探查点 | 代码位置 | 结论记录 |
|--------|----------|---------|
| T1: `createPayPalSavePaymentSession` 同步返回 + hasReturned/resume 存在性 | `configurePayPalButton` 内 `console.dir(session)` | 若无 hasReturned/resume：删 resume 段，从 FALLBACK_MODES 去掉 'redirect' |
| T2: `paymentFlow:'VAULT_WITHOUT_PAYMENT'` 被接受 + eligibility 含 paypal | `onPayPalWebSdkLoaded` 内 `console.dir(eligibility)` | 若 paymentFlow 不接受：回退无 paymentFlow |
| T3: onApprove data.vaultSetupToken 真实 key | `onApprove` 内 `console.dir(data)` | 若 key 不同（如 billingToken）：按实际调整 |
| T4: confirm 响应 paymentTokenId / customer.id 结构 | `createPaymentToken` 内 `console.dir(res)` | 确认结构后删日志 |

---

## Vault ACDC Setup-Only 专属规则

> 状态：📝 待实现（设计+计划已就绪，2026-06-05 过 eng review）。文件：`vault-acdc-setup-only.{js,ejs}` + 路由。
> 模型 = v6 Card Fields **Save Session** + Vault v3 两步 token。本质是 v6 `acdc`（card-fields）+ v5 `vault-acdc-setup-only`（vault 流程 + 严格门）的组合。
> 与 v6 `vault-paypal-setup-only` 的区别：入口是 Card Fields（非 paypal-button），approve 走 `submit()` 状态机（非 onApprove 回调），且多一个 GET setup-token 端点（严格门用）。

### 规则 V6-ACDC-SETUP-1 — 模型：Card Fields Save Session + Vault v3 两步 token，不碰 Orders API

- 流程：`POST /v3/vault/setup-tokens`（create） → `session.submit(setupTokenId)` 买家 approve/3DS → 严格门 → `POST /v3/vault/payment-tokens`（confirm）。
- session 用 **`createCardFieldsSavePaymentSession()`**（同步返回，不 await/.then；同 V6-ACDC-2）；**不是** `createCardFieldsOneTimePaymentSession()`，**没有** `savePayment` 选项（save session 本身即 vault）。
- 字段渲染 `createCardFieldsComponent({type}).appendChild`（同 V6-ACDC-3）。
- **3 个端点**：create-setup-token / GET setup-token/:id / confirm-setup-token（端点名逐字沿用 v5）。比 v6 vault-paypal-setup-only 多 GET（严格门读 verification_status 需要）。

### 规则 V6-ACDC-SETUP-2 — 严格 3DS 门（逐字沿用 v5，eng review 拍板保留）

`submit()` 返回 `{ state, data }`，`state === 'succeeded'` 时：
- `data.liabilityShift` ∈ {`YES`, `POSSIBLE`} → 直接 `doConfirm(data.vaultSetupToken)`。
- 否则 GET setup-token → `status === 'APPROVED' && payment_source.card.verification_status === 'VERIFIED'` → confirm；否则 `✗ Card not saved · <reason>`，按钮恢复。
- `canceled` → "3D Secure cancelled — card not saved"，按钮恢复；`failed` → 显示 `data.message`，按钮恢复。

> 逻辑与 v5 `vault-acdc-setup-only.js` 的 `onApprove` 完全一致，唯一区别：data 源从回调 `onApprove(data)` 改为 `submit()` 的 `result.data`。
> ⚠️ **首跑 watch-item（eng review Finding 1）**：确认 `SCA_WHEN_REQUIRED` 免挑战保存不被误拒（即 `verification_status` 该路径为 `VERIFIED`，或 liabilityShift 回 `POSSIBLE`）。这是 demo 主 happy path。低风险（v5 precedent），由探针 P2/P5 覆盖；若误拒再按实际调整并记 `docs/debug-log.md`。

### 规则 V6-ACDC-SETUP-3 — eligibility：currency=USD + paymentFlow=VAULT_WITHOUT_PAYMENT，防御式

```js
instance.findEligibleMethods({ currencyCode: 'USD', paymentFlow: 'VAULT_WITHOUT_PAYMENT' })
eligibility.isEligible('advanced_cards')   // 资格 key（同 ACDC）
```
防御式渲染（同 V6-ACDC-1）：明确合格或 key 缺失都渲染卡输入域，仅明确不合格信号才拦截。若 `paymentFlow` 不被接受 → 回退无 paymentFlow，记 debug-log（探针 P4）。

### 规则 V6-ACDC-SETUP-4 — create-setup-token body 与 v5 逐字一致（仅 return/cancel url 改 v6）

- 顶层 `customer.merchant_customer_id`：随机 `'CUST_' + randomBytes(6).hex.toUpperCase()`（与 v5 一致；**注意**与 v6 vault-paypal-setup-only 的硬编码 `MERCHANT_CUST_001` 不同，此为刻意）。
- `payment_source.card`：`billing_address`（SANDBOX_BILLING，snake_case）+ `experience_context.{return_url, cancel_url}`（v6 路径）+ `verification_method`（直挂 card 下，从 `req.body.scaMethod` 白名单取，默认 SCA_WHEN_REQUIRED）。
- 后端 CN 账号（`getCNToken`），header 加 `PayPal-Request-Id: acdc-setup-${Date.now()}`。返回 `{ setupTokenId }`。

### 规则 V6-ACDC-SETUP-5 — billingAddress 双传（用户拍板）

- ① create-setup-token body 含 `payment_source.card.billing_address`（snake_case，后端）。
- ② `session.submit(setupTokenId, { billingAddress: mapBilling(window.DEMO.billing) })`（camelCase，前端；`mapBilling` 同 v6 acdc：`streetAddress/city/state/postalCode/countryCode`）。
- 探针 P3：确认 save-session 的 `submit()` 接受第二参；若不接受 → 去掉第二参（body 已覆盖 billing），记 debug-log。

### 规则 V6-ACDC-SETUP-6 — DRY：保留每文件复制（eng review 拍板）

新 JS 文件从 v6 `acdc.js` 复制 `STYLE/inspect/clearLoading/mapBilling/showResult` + 从 v5 复制严格门/`showVaultResult`。**保留各文件独立复制**，不抽共享模块——沿用"每产品一个独立 IIFE、仅 init.js 共享"的既有架构，符合 surgical-change 原则。

### 规则 V6-ACDC-SETUP-7 — 探针清单（首次实测后删日志，结论记 debug-log）

| 编号 | 探查点 | 关注 | 定型后处理 |
|------|--------|------|-----------|
| P1 | `createCardFieldsSavePaymentSession()` 的 session | 是否同步返回；方法集（submit / createCardFieldsComponent） | 确认同步，记 debug-log |
| P2 | `submit()` 的 `result.data` | key 是否 `vaultSetupToken`；`liabilityShift` 是否存在 | 确认后删日志 |
| P3 | save session `submit()` 第二参 `{ billingAddress }` | 是否被接受（不报错） | 不接受则移除第二参，记 debug-log |
| P4 | `findEligibleMethods({paymentFlow:'VAULT_WITHOUT_PAYMENT'})` | 是否接受 paymentFlow；`advanced_cards` 是否合格 | 不接受则回退无 paymentFlow，记 debug-log |
| P5 | GET setup-token 响应（严格门触发时） | `status` + `payment_source.card.verification_status` 真实值 | 确认判定有效后删日志（关联 Finding 1） |
