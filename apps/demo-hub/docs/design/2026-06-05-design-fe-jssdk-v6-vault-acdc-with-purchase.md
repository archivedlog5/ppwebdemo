# 前端设计 — JSSDK v6 Vault ACDC with Purchase

> 日期：2026-06-05 · 文件：`src/views/paypal/jssdk-v6/vault-acdc-with-purchase.ejs` + `src/public/js/paypal/jssdk-v6/vault-acdc-with-purchase.js`
>
> UI 忠实参考 v5 `vault-acdc-with-purchase`（currency/amount 选择器、**3DS 下拉禁用**、Name on Card、save-card 复选框、Vault Result 框）；card-fields 渲染 + submit 状态机 + 3DS 决策参考 v6 `acdc`。

## 1. 关键差异

### 1.1 对比 v6 `acdc`（一次性付款 → vault with purchase）

| 方面 | acdc（一次性） | **acdc-vault-with-purchase（本 demo）** |
|------|---------------|------------------------------------------|
| session 工厂 | `createCardFieldsOneTimePaymentSession` | **同上**（一次性付款，vault 由 server body 驱动） |
| create-order body | `payment_source.card.attributes.verification` | **+ 条件 `vault.store_in_vault: ON_SUCCESS` + `customer.merchant_customer_id`**（saveVault 勾选时） |
| UI 额外控件 | 无 | **save-card 复选框**（默认勾选） |
| 3DS 下拉 | **启用**（SCA_WHEN_REQUIRED / SCA_ALWAYS） | **禁用**（固定 SCA_WHEN_REQUIRED，镜像 v5） |
| capture 成功后 | `✓ Payment captured · Order` | **同 + `showVaultResult(vaultId, customerId)`** |

### 1.2 对比 v5 `vault-acdc-with-purchase`（v5 → v6 适配）

| 方面 | v5 | **v6（本 demo）** |
|------|----|--------------------|
| 卡渲染 | `cardFields.NumberField().render('#...')` | **`createCardFieldsComponent({type}).appendChild`**（V6-ACDC-3） |
| approve 触发 | `CardFields({ createOrder, onApprove, ... })` 回调对象 | **`session.submit(orderId, opts)` → `{ state, data }` 状态机**（命令式，V6-ACDC-4/5） |
| orderId | `orderID`（大写 D）、`data.orderID` | **`orderId`（小写 d）**（V6-1） |
| SDK 加载 | header `sdkUrl`（`components=card-fields&vault=true`） | **三段式 `<script>`，不传 sdkUrl**（V6-4/5） |
| eligibility | `cardFields.isEligible()` | **`findEligibleMethods(...).isEligible('advanced_cards')`**（防御式，V6-ACDC-1） |

> **3DS 逻辑不变**：v6 `decide3DSAndCapture` 与 v5 `onApprove` 内决策逐字一致（`liabilityShift` undefined/POSSIBLE → capture；否则 GET order 读 `authentication_result`）。

## 2. EJS 视图（`vault-acdc-with-purchase.ejs`）

移植 v5 同名视图结构，套 v6 脚本三段式（V6-4 / V6-5）。

- header include **不传** `sdkUrl`（仅 `title, provider, sdkVersion, currentProductKey, currentSdkVersion, sidebarProducts, showSidebar`）。
- badge：`PayPal · JSSDK v6 · ACDC Vault`。
- **amount-row**（搬 v5）：
  - `#demo-currency`（`SUPPORTED_CURRENCIES` 全量，参考 v5 列表；选中 `currency`）。
  - `#demo-amount`（`defaultAmount`）。
  - `#demo-sca`（**`disabled`**，`opacity:0.4;cursor:not-allowed`，固定 `SCA_WHEN_REQUIRED`）。
- `#amount-error` + 「This demo focuses on vault functionality only. For 3DS testing, visit the [ACDC demo](/paypal/jssdk-v6/acdc)」提示（链接改 v6 acdc 路径）。
- `⚡ Sandbox Mode` 徽章。
- **Name on Card** 输入 `#card-name`（预填 `sandboxCardholderName`，搬 v5）。
- 卡输入域（三个 host，搬 v6 acdc，含 `height:42px;overflow:hidden`）：
  - `#card-number-container`（带 `sdk-loading` spinner）、`#card-expiry-container`、`#card-cvv-container`。
- **save-card 复选框** `#save-card`（**默认 `checked`**，label 含 `store_in_vault: ON_SUCCESS`，搬 v5）。
- `#acdc-pay-btn`（"Pay Now"）。
- `.result-msg#result`。
- `#vault-result`（默认 `display:none`）：**Vault Token**（`#vault-id`）+ **Customer ID**（`#customer-id`），搬 v5。
- test-hint：`4012 0000 3333 0026`。

`window.DEMO` 注入（V6-6）：

```html
<script>
  window.DEMO = {
    clientId:   '<%= clientId %>',
    components: ['card-fields'],
    pageType:   'checkout',
    urls: {
      createOrder:  '/paypal/jssdk-v6/api/vault-acdc-with-purchase/create-order',
      getOrder:     '/paypal/jssdk-v6/api/vault-acdc-with-purchase/order/:orderId',
      captureOrder: '/paypal/jssdk-v6/api/vault-acdc-with-purchase/capture-order',
    },
    billing:       <%- JSON.stringify(sandboxBilling) %>,
    defaultAmount: '<%= defaultAmount || "100.00" %>',
    currency:      '<%= currency %>',
  }
</script>
<script src="/js/paypal/jssdk-v6/init.js"></script>
<script src="/js/paypal/jssdk-v6/vault-acdc-with-purchase.js"></script>
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>
```

> 注意 `getOrder` URL 含 `:orderId`（小写 d），前端用 `.replace(':orderId', id)`。

## 3. 前端 JS（`vault-acdc-with-purchase.js`）

IIFE + `'use strict'`。骨架直接复制 v6 `acdc.js`（card-fields 渲染 + submit 状态机 + 3DS 决策），增量加 vault（save-card 复选框 + capture 后展示）。

### 3.1 常量与辅助函数（搬 v6 acdc）
- `STYLE`、`ZERO_DECIMAL`、`getCurrency()`、`getAmount()`、`getSCA()`（读 `#demo-sca`，禁用时返回固定 `SCA_WHEN_REQUIRED`）、`getName()`、`isZeroDecimal()`、`showResult()`（V6-10）、`MIN/MAX_AMOUNT` + `validateAmount()`、`clearLoading()`、`mapBilling()`（camelCase → `streetAddress/city/state/postalCode/countryCode`）、`inspect()`（探针，定型后删）。
- **新增**（搬 v5）：
  - `getVaultChecked()`：读 `#save-card` 的 `.checked`。
  - `showVaultResult(vaultId, customerId)`：填 `#vault-id` / `#customer-id`，显示 `#vault-result`。

### 3.2 createOrder（点击时调，body 加 saveVault）

```js
function createOrder() {
  return fetch(window.DEMO.urls.createOrder, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount:         getAmount(),
      currency:       getCurrency(),
      scaMethod:      getSCA(),
      cardholderName: getName(),
      billingAddress: window.DEMO.billing || {},
      saveVault:      getVaultChecked(),     // ← vault 增量
    }),
  })
    .then(function (r) { return r.json() })
    .then(function (d) {
      if (d.error) throw new Error(d.error)
      return d.orderId   // v6: 小写 d
    })
}
```

### 3.3 doCapture（成功后展示 vault）

```js
function doCapture(orderId) {
  return fetch(window.DEMO.urls.captureOrder, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: orderId }),
  })
    .then(function (r) { return r.json() })
    .then(function (order) {
      if (order.error) throw new Error(order.error)
      var capture = order.purchase_units &&
                    order.purchase_units[0] &&
                    order.purchase_units[0].payments &&
                    order.purchase_units[0].payments.captures &&
                    order.purchase_units[0].payments.captures[0]
      if (!capture || capture.status !== 'COMPLETED') {      // 规则 13
        showResult('✗ Capture failed · status: ' + (capture ? capture.status : 'unknown'), 'error')
        return
      }
      showResult('✓ Payment captured · Order: ' + order.id, 'success')
      showVaultResult(order.vaultId, order.customerId)        // ← vault 增量
    })
}
```

### 3.4 3DS 决策 + submit 状态机（与 v6 acdc 逐字一致）

`decide3DSAndCapture(data, payBtn)`：`liabilityShift` 为 `undefined`/`'POSSIBLE'` → `doCapture(data.orderId)`；否则 `GET order/:orderId` 读 `payment_source.card.authentication_result` → `liability_shift==='NO'` 且 enrollment ∈ {N,U,B} → capture；`UNKNOWN` → retry 提示；其他 → declined 提示（V6-ACDC-6）。

`handleSubmitResult(result, payBtn)`：`succeeded` → `decide3DSAndCapture`；`canceled` → 取消提示 + 按钮恢复；`failed` → `data.message` + 按钮恢复（V6-ACDC-5）。

> 因 3DS 下拉禁用、固定 `SCA_WHEN_REQUIRED`，happy path 几乎只走 `liabilityShift` undefined/POSSIBLE → 直接 capture；GET order 兜底分支保留但极少触发（镜像 v5「vault 优先、3DS 去 acdc demo」的取舍）。

### 3.5 onPayClick（命令式，V6-ACDC-4）

```js
async function onPayClick(session) {
  if (!validateAmount()) return
  var payBtn = document.getElementById('acdc-pay-btn')
  payBtn.disabled = true
  try {
    var orderId = await createOrder()
    var result  = await session.submit(orderId, { billingAddress: mapBilling(window.DEMO.billing) })
    await handleSubmitResult(result, payBtn)
  } catch (err) {
    showResult('✗ ' + (err.message || String(err)), 'error')
    payBtn.disabled = false
  }
}
```

### 3.6 setupCardFields（同步 session + appendChild，V6-ACDC-2/3）

```js
function setupCardFields(instance) {
  var session = instance.createCardFieldsOneTimePaymentSession()   // 同步，不 await/.then（探针 P1）
  inspect('session', session)

  var numberField = session.createCardFieldsComponent({ type: 'number', placeholder: '4012000033330026', style: STYLE })
  var expiryField = session.createCardFieldsComponent({ type: 'expiry', placeholder: 'MM / YY',          style: STYLE })
  var cvvField    = session.createCardFieldsComponent({ type: 'cvv',    placeholder: '•••',              style: STYLE })

  clearLoading('card-number-container')
  document.querySelector('#card-number-container').appendChild(numberField)
  document.querySelector('#card-expiry-container').appendChild(expiryField)
  document.querySelector('#card-cvv-container').appendChild(cvvField)

  document.getElementById('acdc-pay-btn').addEventListener('click', function () { onPayClick(session) })
}
```

> 探针 P1：确认 `createCardFieldsOneTimePaymentSession()` 是否需要传 vault/`savePayment` 选项。集成文档「No verification」示例为**无参**调用，save 完全靠 server create-order body 的 `store_in_vault`，故默认无参。若实测 vault 不生效再加选项并记 debug-log。

### 3.7 SDK init + eligibility（防御式，含 vault paymentFlow 探针）

```js
function isCardEligible(eligibility) {
  if (eligibility && typeof eligibility.isEligible === 'function' && eligibility.isEligible('advanced_cards')) return true
  return true   // 防御式：key 缺失也 render，submit 暴露真错（V6-ACDC-1）
}

function onPayPalWebSdkLoaded() {
  getPPInstance()
    .then(function (instance) {
      return instance.findEligibleMethods({
        currencyCode: getCurrency(),
        paymentFlow: 'VAULT_WITH_PAYMENT',     // 探针 P2：若不被接受，回退无 paymentFlow
      }).then(function (eligibility) {
        inspect('eligibility', eligibility)
        if (isCardEligible(eligibility)) setupCardFields(instance)
        else showResult('Card Fields not available for this account.', 'error')
      })
    })
    .catch(function (err) { showResult('✗ ' + (err.message || String(err)), 'error') })
}
```

### 3.8 currency selector + window.load（搬 v6 acdc）
- `DOMContentLoaded`：`#demo-currency` change → 带 `?currency=&amount=` reload。
- `window.load`：`typeof paypal === 'undefined'` 检查 → amount blur 格式化 + 校验 → `onPayPalWebSdkLoaded()`。

## 4. 探针清单（遵循 memory：v6 新集成先 inspect 再定型）

| 编号 | 探查点 | 关注 | 定型后处理 |
|------|--------|------|-----------|
| P1 | `createCardFieldsOneTimePaymentSession()` 的 session（with vault） | 是否需要 `savePayment`/vault 选项；submit 是否照常 | 默认无参；若 vault 不生效再加选项，记 debug-log |
| P2 | `findEligibleMethods({paymentFlow:'VAULT_WITH_PAYMENT'})` | 是否接受 paymentFlow；`advanced_cards` 是否合格 | 不接受则回退无 paymentFlow，记 debug-log |
| P3 | capture 响应 vault 字段 | `payment_source.card.attributes.vault.{id, customer.id}` 真实路径与 `status: VAULTED` | 确认后删日志 |
| P4 | `submit()` 的 `result.data` | key 是否 `orderId`；`liabilityShift` 是否存在 | 确认后删日志 |

## 5. 完成标准（DoD）

输入测试卡 `4012 0000 3333 0026`、勾选「保存卡」、点击 Pay Now → 页面显示 `✓ Payment captured · Order: <id>` + Vault Result 框非空（Vault Token + Customer ID）。
- **未勾选**「保存卡」→ 仍显示 `✓ Payment captured`，但 Vault Result 框中 Vault Token 为 `(not returned)`（无 vault）。
- capture 非 COMPLETED / `canceled` / `failed` / SDK 失败 → 对应红色提示，按钮恢复。
