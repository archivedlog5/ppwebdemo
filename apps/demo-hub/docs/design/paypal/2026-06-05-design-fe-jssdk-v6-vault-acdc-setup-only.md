# 前端设计 — JSSDK v6 Vault ACDC Setup-Only

> 日期：2026-06-05 · 文件：`src/views/paypal/jssdk-v6/vault-acdc-setup-only.ejs` + `src/public/js/paypal/jssdk-v6/vault-acdc-setup-only.js`
>
> UI 参考 v5 `vault-acdc-setup-only`（zero-dollar、仅 3DS 选择器）；card-fields 渲染 + submit 状态机参考 v6 `acdc`；3DS 严格门参考 v5 `vault-acdc-setup-only`。

## 1. 关键差异

### 1.1 对比 v6 `acdc`（一次性付款 → setup-only）

| 方面 | acdc（一次性） | **acdc-setup-only（本 demo）** |
|------|---------------|-------------------------------|
| session 工厂 | `createCardFieldsOneTimePaymentSession` | **`createCardFieldsSavePaymentSession`** |
| submit 第一参 | `orderId`（来自 create-order） | **`setupTokenId`**（来自 create-setup-token） |
| submit 成功后 | 3DS 决策 → **capture order** | 3DS 严格门 → **confirm setup→payment token** |
| eligibility | `findEligibleMethods({ currencyCode })` | **`{ currencyCode:'USD', paymentFlow:'VAULT_WITHOUT_PAYMENT' }`** |
| 货币/金额 | 有选择器 | **无**（仅 3DS 选择器，zero-dollar） |
| 结果展示 | `✓ Payment captured · Order` | **`✓ Card saved · Payment Token` + Vault Result 框** |

### 1.2 对比 v6 `vault-paypal-setup-only`（PayPal 按钮 → 卡）

| 方面 | vault-paypal-setup-only | **acdc-setup-only（本 demo）** |
|------|-------------------------|-------------------------------|
| 入口 | `paypal-button` + `session.start(opts, promise)` | **Card Fields** + `session.submit(setupToken, opts)` |
| approve 触发 | `onApprove` 回调 | **submit 返回 `{ state, data }` 状态机**（命令式，V6-ACDC-4） |
| 3DS 处理 | 无（PayPal 内部） | **v5 严格门**（liabilityShift / GET setup-token verification_status） |
| 端点数 | 2（create / confirm） | **3**（多 GET setup-token，严格门用） |

## 2. EJS 视图（`vault-acdc-setup-only.ejs`）

移植 v5 同名视图结构，套 v6 脚本三段式（V6-4 / V6-5）。

- header include **不传** `sdkUrl`（仅 `title, provider, sdkVersion, currentProductKey, currentSdkVersion, sidebarProducts, showSidebar`）。
- badge：`PayPal · JSSDK v6 · ACDC Vault Setup`。
- **3DS 选择器** `#demo-sca`（`SCA_WHEN_REQUIRED` / `SCA_ALWAYS`，搬 v5）。**无** `#demo-currency` / `#demo-amount`。
- `⚡ Zero-Dollar Vault Enrollment` 徽章（搬 v5）。
- 卡输入域（三个 host，搬 v6 acdc，含 `height:42px;overflow:hidden`）：
  - `#card-number-container`（带 `sdk-loading` spinner）
  - `#card-expiry-container`、`#card-cvv-container`
  - > 与 v6 acdc 不同：**不放 "Name on Card" 输入框**（v5 setup-only 无 cardholder name 输入，name 不参与 setup-token；billing 用沙盒常量）。保持 v5 UI。
- `#acdc-save-btn`（"Save Card"）。
- `.result-msg#result`。
- `#vault-result`（默认 `display:none`）：**Payment Token**（`#payment-token-id`）+ **Customer ID**（`#customer-id`），搬 v5。
- test-hint：`4012 0000 3333 0026`。

`window.DEMO` 注入（V6-6）：

```html
<script>
  window.DEMO = {
    clientId:   '<%= clientId %>',
    components: ['card-fields'],
    pageType:   'checkout',
    urls: {
      createSetupToken:  '/paypal/jssdk-v6/api/vault-acdc-setup-only/create-setup-token',
      getSetupToken:     '/paypal/jssdk-v6/api/vault-acdc-setup-only/setup-token/',
      confirmSetupToken: '/paypal/jssdk-v6/api/vault-acdc-setup-only/confirm-setup-token',
    },
    billing: <%- JSON.stringify(sandboxBilling) %>,
  }
</script>
<script src="/js/paypal/jssdk-v6/init.js"></script>
<script src="/js/paypal/jssdk-v6/vault-acdc-setup-only.js"></script>
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>
```

## 3. 前端 JS（`vault-acdc-setup-only.js`）

IIFE + `'use strict'`。结构参考 v6 `acdc.js`（card-fields 渲染 + submit 状态机），决策逻辑参考 v5 `vault-acdc-setup-only.js`（严格门）。

### 3.1 常量与辅助函数
- `STYLE`（搬 v6 acdc：`input` 字体 + `.invalid` 红色）。
- `CONTAINER_*` map（若沿用 v5 的 field-state 高亮可保留；最简实现可省）。
- `getSCA()`：读 `#demo-sca`，默认 `SCA_WHEN_REQUIRED`。
- `showResult(text, type)`（V6-10：class = `'result-msg ' + type`，type ∈ `success`/`error`）。
- `showVaultResult(paymentTokenId, customerId)`：填 `#payment-token-id` / `#customer-id`，显示 `#vault-result`。
- `clearLoading(id)`、`mapBilling(billing)`（搬 v6 acdc：camelCase → `streetAddress/city/state/postalCode/countryCode`）。
- `inspect(label, obj)`（搬 v6 acdc，探针；定型后删）。
- **无** `getCurrency()` / `getAmount()` / `validateAmount()`。eligibility 的 currency 硬编码 `'USD'`。

### 3.2 createSetupToken（点击时调）

```js
function createSetupToken() {
  return fetch(window.DEMO.urls.createSetupToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scaMethod: getSCA() }),
  })
    .then(function (r) { return r.json() })
    .then(function (d) {
      if (d.error) throw new Error(d.error)
      return d.setupTokenId
    })
}
```

### 3.3 doConfirm（setup token → payment token）

```js
function doConfirm(setupTokenId) {
  return fetch(window.DEMO.urls.confirmSetupToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupTokenId: setupTokenId }),
  })
    .then(function (r) { return r.json() })
    .then(function (data) {
      if (data.error) throw new Error(data.error)
      showResult('✓ Card saved · Payment Token: ' + data.paymentTokenId, 'success')
      showVaultResult(data.paymentTokenId, data.customerId)
    })
}
```

### 3.4 submit 状态机 + v5 严格门（核心）

submit 返回 `{ state, data }`（V6-ACDC-5）。`data` 含 `vaultSetupToken` + liabilityShift 字段（探针 P2 确认）。

```js
function handleSubmitResult(result, saveBtn) {
  inspect('submit result', result)              // 探针，定型后删
  var data = result.data || {}
  switch (result.state) {
    case 'succeeded':
      return decideAndConfirm(data, saveBtn)
    case 'canceled':
      showResult('3D Secure cancelled — card not saved.', 'error')
      saveBtn.disabled = false
      return
    case 'failed':
      showResult('✗ ' + (data.message || 'Card not saved. Check your details and try again.'), 'error')
      saveBtn.disabled = false
      return
    default:
      console.warn('[ACDC-Setup] Unhandled submit state', result.state, data)
      saveBtn.disabled = false
  }
}

// v5 严格门：liabilityShift YES|POSSIBLE → 直接 confirm；
// 否则 GET setup-token → status=APPROVED && verification_status=VERIFIED → confirm；否则拒绝
function decideAndConfirm(data, saveBtn) {
  var liabilityShift  = data.liabilityShift
  var vaultSetupToken = data.vaultSetupToken
  if (liabilityShift === 'YES' || liabilityShift === 'POSSIBLE') {
    return doConfirm(vaultSetupToken)
  }
  return fetch(window.DEMO.urls.getSetupToken + vaultSetupToken)
    .then(function (r) { return r.json() })
    .then(function (tokenData) {
      var tokenStatus = tokenData.status
      var verificationStatus =
        tokenData.payment_source &&
        tokenData.payment_source.card &&
        tokenData.payment_source.card.verification_status
      if (tokenStatus === 'APPROVED' && verificationStatus === 'VERIFIED') {
        return doConfirm(vaultSetupToken)
      }
      var msg = verificationStatus
        ? 'verification: ' + verificationStatus
        : 'liabilityShift: ' + (liabilityShift || 'none') + ' · token: ' + (tokenStatus || 'unknown')
      showResult('✗ Card not saved · ' + msg, 'error')
      if (saveBtn) saveBtn.disabled = false
    })
}
```

> 逻辑与 v5 `vault-acdc-setup-only.js` 的 `onApprove` 完全一致，唯一区别：v5 从 `CardFields` 的 `onApprove(data)` 拿 data，v6 从 `submit()` 的 `result.data` 拿。

### 3.5 onPayClick（命令式，V6-ACDC-4 + billing 双传）

```js
async function onPayClick(session) {
  var saveBtn = document.getElementById('acdc-save-btn')
  saveBtn.disabled = true
  try {
    var setupTokenId = await createSetupToken()
    var result = await session.submit(setupTokenId, {
      billingAddress: mapBilling(window.DEMO.billing),   // 用户拍板：submit 也传 billing
    })
    await handleSubmitResult(result, saveBtn)
  } catch (err) {
    showResult('✗ ' + (err.message || String(err)), 'error')
    saveBtn.disabled = false
  }
}
```

> **billingAddress 双传**（用户拍板）：① create-setup-token body 含 `payment_source.card.billing_address`（snake_case，后端，§be-5）；② `submit()` 第二参 `{ billingAddress: mapBilling(...) }`（camelCase，前端）。与 v5 做法一致（v5 同时在 setup-token body 和 `cardFields.submit({ billingAddress })` 传）。探针 P3 确认 save session 的 submit 是否接受该参；若不接受，setup-token body 仍覆盖。

### 3.6 setupCardFields（同步 session + appendChild，V6-ACDC-2/3）

```js
function setupCardFields(instance) {
  var session = instance.createCardFieldsSavePaymentSession()   // 同步，不 await/.then
  inspect('session', session)                                   // 探针 P1

  var numberField = session.createCardFieldsComponent({ type: 'number', placeholder: '4012000033330026', style: STYLE })
  var expiryField = session.createCardFieldsComponent({ type: 'expiry', placeholder: 'MM / YY',          style: STYLE })
  var cvvField    = session.createCardFieldsComponent({ type: 'cvv',    placeholder: '•••',              style: STYLE })

  clearLoading('card-number-container')
  document.querySelector('#card-number-container').appendChild(numberField)
  document.querySelector('#card-expiry-container').appendChild(expiryField)
  document.querySelector('#card-cvv-container').appendChild(cvvField)

  document.getElementById('acdc-save-btn').addEventListener('click', function () { onPayClick(session) })
}
```

### 3.7 SDK init + eligibility（VAULT_WITHOUT_PAYMENT，防御式）

```js
function isCardEligible(eligibility) {
  // 防御式（V6-ACDC-1）：明确合格 → true；key 缺失也 render，由 submit 暴露真错
  if (eligibility && typeof eligibility.isEligible === 'function' && eligibility.isEligible('advanced_cards')) return true
  return true
}

function onPayPalWebSdkLoaded() {
  getPPInstance()
    .then(function (instance) {
      return instance.findEligibleMethods({
        currencyCode: 'USD',                      // zero-dollar，固定 USD
        paymentFlow: 'VAULT_WITHOUT_PAYMENT',     // 探针 P4：若不被接受，回退无 paymentFlow
      }).then(function (eligibility) {
        inspect('eligibility', eligibility)       // 探针，定型后删
        if (isCardEligible(eligibility)) setupCardFields(instance)
        else showResult('Card Fields not available for this account.', 'error')
      })
    })
    .catch(function (err) { showResult('✗ ' + (err.message || String(err)), 'error') })
}

window.addEventListener('load', function () {
  if (typeof paypal === 'undefined') { showResult('✗ PayPal SDK failed to load', 'error'); return }
  onPayPalWebSdkLoaded()
})
```

> 无 `DOMContentLoaded` 货币切换监听（无货币选择器）。

## 4. 探针清单（遵循 memory：v6 新集成先 inspect 再定型）

| 编号 | 探查点 | 关注 | 定型后处理 |
|------|--------|------|-----------|
| P1 | `createCardFieldsSavePaymentSession()` 返回的 `session` | 是否同步返回；有哪些方法（submit / createCardFieldsComponent） | 确认同步；结论记 debug-log |
| P2 | `submit()` 的 `result.data` | key 是否为 `vaultSetupToken`；`liabilityShift` 是否存在 | 确认后删日志 |
| P3 | save session `submit()` 第二参 `{ billingAddress }` | 是否被接受（不报错） | 若不接受：移除第二参，靠 setup-token body 的 billing_address；记 debug-log |
| P4 | `findEligibleMethods({paymentFlow:'VAULT_WITHOUT_PAYMENT'})` | 是否接受 paymentFlow；`advanced_cards` 是否合格 | 若不接受：回退无 paymentFlow；记 debug-log |
| P5 | GET setup-token 响应（严格门触发时） | `status` + `payment_source.card.verification_status` 真实值 | 确认 VERIFIED/APPROVED 判定有效后删日志 |

## 5. 完成标准（DoD）

输入测试卡 `4012 0000 3333 0026` → 点击 "Save Card" → 通过/跳过 3DS → 页面显示 `✓ Card saved · Payment Token: ...` + Vault Result 框非空（Payment Token + Customer ID）。`canceled` / `failed` / 严格门拒绝 / SDK 失败 均有对应红色提示，按钮恢复可点。
