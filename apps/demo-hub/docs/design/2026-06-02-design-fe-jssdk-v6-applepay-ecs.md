# 前端设计 — JSSDK v6 Apple Pay ECS

> 日期：2026-06-02 · 关联：design-be / plan（同日 `*-jssdk-v6-applepay-ecs.md`）
>
> ⚠️ 当前 Opus 模型下只能产出本设计（markdown）。实际写代码需切换到 Sonnet 等非 Opus 模型。

## 1. 目标

`/paypal/jssdk-v6/applepay-ecs` 前端：UI 完全参考 v5 applepay-ecs（官方 `<apple-pay-button>` + 客制化按钮，两者同一点击流程）；Apple Pay JS 函数骨架模仿 v5 ecs（含 ECS 专属的 shipping method 选择 + onshippingcontactselected/onshippingmethodselected），但取实例/配置/确认改用 v6 SDK API 形态。

**实现策略**：以已完成的 **v6 applepay-ecm.js** 为骨架（v6 SDK 入口 / 双层资格 / formatConfigForPaymentRequest / inspect / 两按钮同 handler / confirmOrder 防御式 / capture COMPLETED），叠加 **v5 applepay-ecs.js** 的 ECS 流程（SHIPPING_METHODS / chosenShipping 状态 / requiredShippingContactFields / shippingMethods / onshippingcontactselected / onshippingmethodselected / normalizeContact / create-order 带 shippingContact+shippingAmount）。

## 2. v6 Apple Pay 与 v5 的 SDK 差异（核心，与 ecm 相同）

| 步骤 | v5 | v6 |
|------|----|----|
| 取 SDK | 全局 `paypalSDK.Applepay()`（同步） | `getPPInstance()` → `createApplePayOneTimePaymentSession()`（同步，inspect 确认） |
| 取配置 | `applepayInstance.config()` → `{countryCode, merchantCapabilities, supportedNetworks}` | `findEligibleMethods().getDetails('applepay').config` + `session.formatConfigForPaymentRequest(config)` |
| 账号资格 | 无（仅浏览器检查） | `findEligibleMethods({currencyCode}).isEligible('applepay')` |
| 商户验证 | `applepayInstance.validateMerchant({validationUrl})` → `{merchantSession}` | 相同（`session.validateMerchant(...)`） |
| 确认订单 | `applepayInstance.confirmOrder(...)` → `{approveApplePayPayment:{status}}`，查 `APPROVED` | `session.confirmOrder(...)`，返回值文档未定义 → **防御式** |
| 3DS | Apple Pay 协议内部处理 | 相同 |

> 资格检查双层语义：`ApplePaySession.canMakePayments()` 查**浏览器/钱包**；`findEligibleMethods().isEligible('applepay')` 查**当前账号**。两者都要。

## 3. ECS 专属流程（相对 v6 ecm 的增量，来自 v5 ecs）

| 项 | ecm | ecs（本设计） |
|----|-----|--------------|
| `SHIPPING_METHODS` 常量 | 无 | `[{label:'Standard Shipping',amount:'5.00',detail:'Arrives in 5–7 days',identifier:'standard'}, {label:'Express Shipping',amount:'10.00',detail:'Arrives in 2–3 days',identifier:'express'}]` |
| `chosenShipping` 状态 | 无 | 模块级变量，每次点击重置为 `SHIPPING_METHODS[0]` |
| `requiredShippingContactFields` | `[]` | `['name','phone','email','postalAddress']` |
| `shippingType` | 无 | `'shipping'` |
| `shippingMethods`（paymentRequest） | 无 | 由 `SHIPPING_METHODS` 映射（label/amount/detail/identifier，金额按零小数位格式化） |
| `lineItems`（paymentRequest） | 无 | `[{Item Total, value}, {chosenShipping.label, shipVal}]` |
| `total` | item | `calcTotal(value, chosenShipping, zd)` = item + shipping |
| `onshippingcontactselected` | 无 | 有（不按地址重算，仅重确认当前 total + lineItems） |
| `onshippingmethodselected` | 无 | 有（按 identifier 匹配 SHIPPING_METHODS → 更新 chosenShipping → 重确认 total + lineItems） |
| `normalizeContact()` | 无（ecm 直接透传） | 有（剥离 phone 前导 `+` 及非数字，confirmOrder 用） |
| create-order 请求 body | `{ amount, currency }` | `{ amount: value, currency, shippingContact, billingContact, shippingAmount: chosenShipping.amount }` |

## 4. 文件

| 文件 | 动作 |
|------|------|
| `src/views/paypal/jssdk-v6/applepay-ecs.ejs` | 新建 |
| `src/public/js/paypal/jssdk-v6/applepay-ecs.js` | 新建 |

## 5. EJS 视图（applepay-ecs.ejs）

结构复制 v5 `views/paypal/jssdk-v5/applepay-ecs.ejs`，改动（参考已完成的 v6 applepay-ecm.ejs）：
- header include **去掉 `sdkUrl` 和 extraScripts**（v6 SDK + Apple CDN 都在 body 自行加载）。
- provider-badge 文案：`PayPal · JSSDK v6 · Apple Pay`。
- 页面描述沿用 v5 ecs："Apple Pay via PayPal — Express Checkout Shortcut. Buyer selects shipping address, email, phone, and shipping method inside the Apple Pay sheet."
- 货币下拉：用 `supportedCurrencies.forEach`（与 v6 ecm 一致），保留金额输入 + `amount-error` + Sandbox 徽标。
- **保留 v5 ecs 的 "Buyer selects in sheet" 提示块**（无地址数据，纯文案：Shipping address · Email address · Phone number · Shipping method）。**不要** ecm 的商户预填地址展示块。
- 容器：`#paypal-button-container`（官方按钮挂载点，初始 `sdk-loading` spinner）+ `#custom-applepay-btn`（客制化按钮，初始 `disabled`，内联样式逐字沿用 v5 ecs）+ `#result`。

底部注入：

```html
<script>
  window.DEMO = {
    clientId:   '<%= clientId %>',
    components: ['applepay-payments'],
    pageType:   'checkout',
    urls: {
      createOrder:  '/paypal/jssdk-v6/api/applepay-ecs/create-order',
      captureOrder: '/paypal/jssdk-v6/api/applepay-ecs/capture-order',
    },
  }
</script>
<script src="/js/paypal/jssdk-v6/init.js"></script>
<script src="/js/paypal/jssdk-v6/applepay-ecs.js"></script>
<script src="https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js"></script>
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>
```

> 脚本顺序：init → 产品 JS → Apple CDN → v6 core（defer）。产品 JS 用 `window.addEventListener('load')` 等待，此时 `window.paypal` 与 `window.ApplePaySession` 均就绪。

## 6. 前端 JS（public/js/paypal/jssdk-v6/applepay-ecs.js）

IIFE + `'use strict'`。搬运辅助函数（与 ecm 一致）：`getCurrency / getAmount / isZeroDecimal / validateAmount / showResult / clearLoading` + 货币切换 reload + 金额 blur 格式化。`ZERO_DECIMAL` / `MIN/MAX_AMOUNT` 沿用。**额外搬运 v5 ecs 专属**：`SHIPPING_METHODS` 常量、`chosenShipping` 模块级状态、`normalizeContact()`、`fmtAmt()`、`calcTotal()`。

### 6.1 入口 `onPayPalWebSdkLoaded()`（与 ecm 相同）

```
// 浏览器三连检查（v5）：window.ApplePaySession && supportsVersion(4) && canMakePayments()
//   任一失败 → clearLoading + 对应提示 + return
getPPInstance()
  .then(function (instance) {
    inspect('instance', instance)
    return instance.findEligibleMethods({ currencyCode: getCurrency() })   // V6-3 嵌套
      .then(function (eligibility) {
        inspect('eligibility', eligibility)
        if (!eligibility.isEligible('applepay')) {
          clearLoading(); showResult('Apple Pay is not eligible for this account.', 'error'); return
        }
        var details = eligibility.getDetails('applepay')
        inspect('getDetails(applepay)', details)
        setupApplePayButton(instance, details)
      })
  })
  .catch(function (err) { clearLoading(); showResult('✗ ' + (err.message||err), 'error') })
```

### 6.2 `setupApplePayButton(instance, details)`（与 ecm 相同）

- `var applePaySession = instance.createApplePayOneTimePaymentSession()`（同步，inspect 确认）。
- clearLoading → 创建官方 `<apple-pay-button>`（buttonstyle=black / type=buy / locale=en，width:100% height:44px），`addEventListener('click', function(){ onApplePayClicked(applePaySession, details) })`，挂到 `#paypal-button-container`。
- 启用客制化按钮 `#custom-applepay-btn`：`disabled=false` + 沿用 v5 ecs 的 hover/active 内联样式监听 + `addEventListener('click', function(){ onApplePayClicked(applePaySession, details) })`。

### 6.3 `onApplePayClicked(applePaySession, details)`（点击 — ECS 版）

```
if (!validateAmount()) return
var amount   = getAmount(), currency = getCurrency(), zd = isZeroDecimal(currency)
var value    = fmtAmt(amount, zd)
chosenShipping = SHIPPING_METHODS[0]               // 每次点击重置为 Standard

var paymentRequest = Object.assign(
  {},
  applePaySession.formatConfigForPaymentRequest(details.config),  // v6：含 merchantCapabilities+supportedNetworks
  {
    countryCode:  details.config.countryCode || 'US',            // inspect 后确认来源
    currencyCode: currency,
    requiredBillingContactFields:  ['name','phone','email','postalAddress'],
    requiredShippingContactFields: ['name','phone','email','postalAddress'],   // ECS
    shippingType: 'shipping',
    shippingMethods: SHIPPING_METHODS.map(m => ({ label:m.label, amount:fmtAmt(m.amount,zd), detail:m.detail, identifier:m.identifier })),
    lineItems: [
      { label:'Item Total',         amount:value,                          type:'final' },
      { label:chosenShipping.label, amount:fmtAmt(chosenShipping.amount,zd), type:'final' },
    ],
    total: { label:'Total', amount:calcTotal(value, chosenShipping, zd), type:'final' },
  }
)
inspect('paymentRequest', paymentRequest)
var session = new ApplePaySession(4, paymentRequest)   // 浏览器原生 session
// 绑定下列事件 → session.begin()
```

> 注意命名：`applePaySession` = v6 SDK session（持 formatConfig/validateMerchant/confirmOrder）；`session` = 浏览器原生 `ApplePaySession`（持事件 + completePayment）。与 v5 ecs 同名约定一致（v5 里是 `applepayInstance` vs `session`）。

### 6.4 Apple Pay 事件（结构对照 v5 ecs）

- `onvalidatemerchant`：`applePaySession.validateMerchant({ validationUrl: event.validationURL })` → `inspect('validateMerchant payload', payload)` → `session.completeMerchantValidation(payload.merchantSession)`；catch → `session.abort()` + 错误提示。
- `onpaymentmethodselected`：`session.completePaymentMethodSelection({ newTotal: {label:'Total', amount:calcTotal(value,chosenShipping,zd), type:'final'} })`。
- **`onshippingcontactselected`**（ECS 专属）：`inspect('shippingContact event', event)`；**不按地址重算**，仅重确认当前 total + lineItems：
  ```
  session.completeShippingContactSelection({
    newTotal:     {label:'Total', amount:calcTotal(value,chosenShipping,zd), type:'final'},
    newLineItems: [{Item Total,value},{chosenShipping.label,shipVal}],
  })
  ```
- **`onshippingmethodselected`**（ECS 专属）：`inspect('shippingMethod event', event)`；按 `event.shippingMethod.identifier` 匹配 `SHIPPING_METHODS` → 更新 `chosenShipping`（无匹配则 `SHIPPING_METHODS[0]`）→ `session.completeShippingMethodSelection({ newTotal, newLineItems })`。
- `onpaymentauthorized`（核心链，全程在回调内）：
  ```
  paymentData = event.payment; token = paymentData.token
  billingContact = paymentData.billingContact; shippingContact = paymentData.shippingContact
  inspect('onpaymentauthorized event.payment', paymentData)

  1. createOrder：fetch urls.createOrder，body =
       { amount: value, currency, shippingContact, billingContact, shippingAmount: chosenShipping.amount }
     → d.orderId（v6 小写 d）
  2. applePaySession.confirmOrder({
       orderId, token,
       billingContact:  normalizeContact(billingContact),
       shippingContact: normalizeContact(shippingContact),
     }) → inspect('confirmOrder result', confirmResult) → 防御式校验（§7）
  3. captureOrder：fetch urls.captureOrder，body { orderId } → inspect('capture order', order)
     → 查 purchase_units[0].payments.captures[0].status === 'COMPLETED'（规则 13）
  4. session.completePayment({ status: COMPLETED ? STATUS_SUCCESS : STATUS_FAILURE }) + showResult
  catch → session.completePayment(STATUS_FAILURE) + showResult('✗ ...')
  ```
- `oncancel`：log（不弹错误，与 v5 一致）。

> **必须始终调用 `completePayment()`**（v5 规则 18 / V6-APPLEPAY-8），否则 Apple Pay sheet 卡死。

## 7. confirmOrder 防御式校验（与 ecm 一致）

- 全程 `inspect()`：`instance / eligibility / details / applePaySession / config / paymentRequest / validateMerchant payload / **shippingContact event** / **shippingMethod event** / onpaymentauthorized payment / confirmResult / capture order` 逐一打印自身属性 + 原型方法。
- `confirmResult` 判定：含 `approveApplePayPayment.status` → 校验 `=== 'APPROVED'`，否则跳过。
- **最终成败一律以 capture 为准**：仅 `captures[0].status === 'COMPLETED'` 算成功（snake_case `purchase_units`，规则 13，不收 PENDING）。

## 8. `inspect()` 探查工具

复用 v6 ecm/acdc 的 `inspect(label, obj)`。**ECS 重点探查项**（v6 ecm 没有、形态未验证）：
- `onshippingcontactselected` 的 `event` / `event.shippingContact`
- `onshippingmethodselected` 的 `event` / `event.shippingMethod`（确认 `identifier` 字段是否如 v5 假设存在）
- `formatConfigForPaymentRequest` 与 ECS 的 `shippingMethods` / `lineItems` 是否冲突

API 形态确认后按需删减探查代码（记 `docs/debug-log.md`）。

## 9. 与 v5 前端 / v6 ecm 前端的差异总表

| 方面 | v5 ecs | v6 ecs（本设计） | v6 ecm |
|------|--------|------------------|--------|
| 取 SDK 实例 | `paypalSDK.Applepay()` | `getPPInstance()`+`createApplePayOneTimePaymentSession()` | 相同 v6 |
| 取 merchant 配置 | `instance.config()` | `getDetails('applepay').config`+`formatConfigForPaymentRequest()` | 相同 v6 |
| 账号资格门 | 无 | `findEligibleMethods().isEligible('applepay')` | 相同 v6 |
| SHIPPING_METHODS + shipping 事件 | 有 | **有（保留）** | 无 |
| requiredShippingContactFields | 4 项 | **4 项** | `[]` |
| create-order 请求 body | 5 字段 | **5 字段（相同）** | 仅 amount/currency |
| normalizeContact | 有 | **有** | 无 |
| createOrder 响应字段 | `d.id` | `d.orderId`（小写 d） | `d.orderId` |
| confirmOrder 校验 | 查 `APPROVED` | 防御式 | 防御式 |
| 官方/客制按钮 | 两个同 handler | 相同 | 相同 |

## 10. 验收标准（详见 plan 测试矩阵）

- Safari + 沙盒钱包卡：官方/客制按钮都能拉起 sheet，sheet 内选地址/邮箱/电话/配送方式，切 shipping method 时 total 实时更新，完成付款 `✓ Payment captured · Order: ...`。
- 切 Standard↔Express：total = item + 对应运费；create-order 金额与 sheet total 一致。
- 非 Safari / 无钱包卡 / 账号不合格：对应 v5 风格提示，不报未捕获异常。
- DevTools console 可见各对象 `inspect()` 输出，尤其 shippingContact / shippingMethod 事件形态。
