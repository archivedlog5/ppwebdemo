# 前端设计 — JSSDK v6 Vault PayPal with Purchase

> 日期：2026-06-05 · 文件：`views/paypal/jssdk-v6/vault-paypal-with-purchase.ejs` + `public/js/paypal/jssdk-v6/vault-paypal-with-purchase.js`

## 1. UI（参考 v5，结构不变）

视图以 v5 `views/paypal/jssdk-v5/vault-paypal-with-purchase.ejs` 为蓝本，仅做 v6 适配。**用户确认：v5 UI only**——不加 v6 的 presentation-mode 下拉、不加 custom-trigger 按钮。控件清单（保持与 v5 一致）：

- 顶部 `amount-row`：货币下拉 `#demo-currency`、金额输入 `#demo-amount`。
- `#amount-error` 校验提示 + `⚡ Sandbox Mode` badge。
- **Vault Behavior 说明框**（v5 原样）：`store_in_vault: ON_SUCCESS` 文案，说明仅购买成功才入会，token/customer id 在下方展示。
- `#paypal-button-container`（带 `sdk-loading` spinner）——单个 PayPal 按钮。
- `#result` 结果区。
- **Vault Result 框** `#vault-result`（默认 `display:none`）：`#vault-id`（Vault Token）+ `#customer-id`（Customer ID），capture 成功后填充并显示。

v6 EJS 适配点（与其它 v6 demo 一致）：

- 货币下拉用 `supportedCurrencies.forEach(...)` 渲染（v5 是硬编码数组）。
- badge 文案改 `PayPal · JSSDK v6 · Vault`。
- `include('../../partials/header', {...})` **不传 sdkUrl、不传 sdkUserIdToken**（规则 V6-5）。

### `window.DEMO` 注入（规则 V6-6）

```js
window.DEMO = {
  clientId:   '<%= clientId %>',
  components: ['paypal-payments'],
  pageType:   'checkout',
  urls: {
    createOrder:  '/paypal/jssdk-v6/api/vault-paypal-with-purchase/create-order',
    captureOrder: '/paypal/jssdk-v6/api/vault-paypal-with-purchase/capture-order',
  },
  defaultAmount: '<%= defaultAmount || "100.00" %>',
}
```

### 脚本加载顺序（规则 V6-4）

```html
<script src="/js/paypal/jssdk-v6/init.js"></script>
<script src="/js/paypal/jssdk-v6/vault-paypal-with-purchase.js"></script>
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>
```

`init.js` 的 `getPPInstance()` 读取 `window.DEMO.components`（`['paypal-payments']`）和 `pageType`，**直接复用，无需改 init.js**。

## 2. SDK 流程（v6 PayPal button + vault flow）

三层结构对齐 v6 规则 V6-9，模板取自 `paypal-ecm.js`，但**裁掉 presentation-mode 选择器与 custom-trigger**，并加入 vault 专属设置：

```
window.load
  → onPayPalWebSdkLoaded()
      → getPPInstance()                                              // createInstance({clientId, components:['paypal-payments']})
      → instance.findEligibleMethods({ currencyCode, paymentFlow: 'VAULT_WITH_PAYMENT' })   // vault 专属资格
      → isEligible('paypal') ?
          configurePayPalButton(instance)
        : showResult('PayPal not eligible in this region', 'error')
```

> **vault 专属点 1**：`findEligibleMethods` 带 `paymentFlow: 'VAULT_WITH_PAYMENT'`（用户确认保留，源自官方 demo code）。

### configurePayPalButton(instance)

```js
function configurePayPalButton(instance) {
  var session = instance.createPayPalOneTimePaymentSession(paymentSessionOptions)

  // 重定向返回：先 resume（规则 V6 hasReturned）
  if (session.hasReturned()) { session.resume(); return }

  var container = clearLoading()
  var btn = document.createElement('paypal-button')
  btn.setAttribute('type', 'pay')
  btn.setAttribute('class', 'paypal-gold')
  container.appendChild(btn)

  btn.addEventListener('click', function () { handleClick(session) })
}
```

> **vault 专属点 2**：`paymentSessionOptions` 含 `savePayment: true`（用户确认保留，源自官方 demo code——因为后端 order 已带 `store_in_vault`）。

### paymentSessionOptions

```js
var paymentSessionOptions = {
  onApprove: function (data) {                       // data.orderId（小写 d）
    return captureAndShowVault(data.orderId)         // ↓ 第 3 节
  },
  onCancel: function () { showResult('Payment cancelled.', 'error') },
  onError:  function (err) { showResult('✗ ' + (err.message || String(err)), 'error') },
  savePayment: true,                                 // vault 专属
}
```

### handleClick(session)（遵守 V6-2：不 await createOrder）

```js
function handleClick(session) {
  if (!validateAmount()) return
  var urls = window.DEMO.urls
  // V6-2：拿 promise 引用但不 await，避免 transient activation 丢失
  var orderPromise = fetch(urls.createOrder, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: getAmount(), currency: getCurrency() }),
  })
    .then(function (r) { return r.json() })
    .then(function (d) { if (d.error) throw new Error(d.error); return { orderId: d.orderId } })

  // presentation mode 固定 'auto' + 内部 fallback 循环（无 UI 选择器）
  startWithFallback(session, orderPromise)
}
```

### startWithFallback（保留 paypal-ecm 的 mode fallback，但无 UI）

```js
var FALLBACK_MODES = ['auto', 'popup', 'redirect', 'modal']

async function startWithFallback(session, orderPromise) {
  for (var i = 0; i < FALLBACK_MODES.length; i++) {
    try {
      await session.start({ presentationMode: FALLBACK_MODES[i] }, orderPromise)
      return
    } catch (error) {
      if (error && error.isRecoverable) continue
      showResult('✗ ' + (error.message || String(error)), 'error')
      return
    }
  }
}
```

> 与 paypal-ecm 的区别：模式数组**硬编码**（默认 auto 起跑），不读 `#demo-presentation-mode`（该控件不存在）。

## 3. capture + vault 结果展示（核心差异）

`onApprove` 后 capture，先判 `COMPLETED`（规则 13），再填 Vault Result 框：

```js
function captureAndShowVault(orderId) {
  var urls = window.DEMO.urls
  return fetch(urls.captureOrder, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: orderId }),       // v6 小写 d
  })
    .then(function (r) { return r.json() })
    .then(function (order) {
      if (order.error) { showResult('✗ ' + order.error, 'error'); return }
      var capture = order.purchase_units && order.purchase_units[0] &&
                    order.purchase_units[0].payments &&
                    order.purchase_units[0].payments.captures &&
                    order.purchase_units[0].payments.captures[0]
      if (!capture || capture.status !== 'COMPLETED') {
        showResult('✗ Capture failed · status: ' + (capture ? capture.status : 'unknown'), 'error')
        return
      }
      showResult('✓ Payment captured · Order: ' + order.id, 'success')

      // 后端已回传顶层 vaultId / customerId（与 v5 一致），兜底再从 order 里读
      var vaultId = order.vaultId ||
        (order.payment_source && order.payment_source.paypal &&
         order.payment_source.paypal.attributes && order.payment_source.paypal.attributes.vault &&
         order.payment_source.paypal.attributes.vault.id) || null
      var customerId = order.customerId ||
        (order.payment_source && order.payment_source.paypal &&
         order.payment_source.paypal.attributes && order.payment_source.paypal.attributes.vault &&
         order.payment_source.paypal.attributes.vault.customer &&
         order.payment_source.paypal.attributes.vault.customer.id) || null

      showVaultResult(vaultId, customerId)
    })
}

function showVaultResult(vaultId, customerId) {
  var box = document.getElementById('vault-result')
  if (!box) return
  document.getElementById('vault-id').textContent = vaultId || '—'
  document.getElementById('customer-id').textContent = customerId || '—'
  box.style.display = 'block'
}
```

> 行为与 v5 一致：成功 capture → 顶部 success 文案 + 下方 Vault Result 框显示 token/customer id。

## 4. 辅助逻辑（直接复用 v5 / paypal-ecm）

- 货币切换 → reload（`?currency=X&amount=Y`）：同 paypal-ecm。
- 金额校验 `validateAmount()`、`getCurrency()`、`getAmount()`、`clearLoading()`、`showResult(text, 'success'|'error')`：同 paypal-ecm（规则 V6-10：取消/失败统一 `'error'` 红色）。
- 浏览器支持检测 `isBrowserSupportedByPayPal()`、`typeof paypal === 'undefined'` 守卫：同 paypal-ecm。

## 5. v5 → v6 差异小结

| 维度 | v5 | v6（本 demo） |
|---|---|---|
| 认证 | `vault=true` + `id_token`（sdkUserIdToken） | **clientId**（init.js），无 id_token |
| SDK 加载 | header 注入 sdkUrl | EJS `<script defer>` core + init.js |
| session | `paypal.Buttons({ createOrder, onApprove })` | `createPayPalOneTimePaymentSession({..., savePayment:true})` + `session.start(opts, orderPromise)` |
| 资格 | 无显式 eligibility | `findEligibleMethods({ paymentFlow:'VAULT_WITH_PAYMENT' })` |
| create-order 返回 | `{ id }` | `{ orderId }`（小写 d） |
| capture 参数 | `{ orderID }` | `{ orderId }`（小写 d） |
| vault 展示 | Vault Result 框（token + customer id） | **不变**（同框、同字段） |

## 6. 不做的事（范围控制）

- 不加 presentation-mode 下拉 / custom-trigger 按钮（v5 UI only）。
- 不加 PayLater / Credit 按钮。
- 不做 vault token 的二次校验或"复用已存 token"展示。
- 不改 `init.js`、不改 `sandbox.css`（复用现有 `.field-host`/`.sdk-loading`/`.result-msg` 等）。

## 7. 实现阶段探查（遵循 memory：v6 新集成先 inspect）

实现时在 `onApprove` 的 capture 响应、`findEligibleMethods` 返回、`session` 对象处加临时 `console.log/console.dir`，确认：

1. capture 响应里 `payment_source.paypal.attributes.vault.{id, customer.id}` 的真实结构（确认与 v5 一致）。
2. `findEligibleMethods({ paymentFlow:'VAULT_WITH_PAYMENT' })` 返回是否含 `paypal`。
3. `savePayment: true` 是否影响 session.start 行为。

确认结论后删除探查日志（保留本设计文档为结论记录）。
