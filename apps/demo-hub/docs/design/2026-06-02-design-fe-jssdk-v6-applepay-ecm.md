# 前端设计 — JSSDK v6 Apple Pay ECM

> 日期：2026-06-02 · 关联：design-be / plan（同日 `*-jssdk-v6-applepay-ecm.md`）
>
> ⚠️ 当前 Opus 模型下只能产出本设计（markdown）。实际写代码需切换到 Sonnet 等非 Opus 模型。

## 1. 目标

`/paypal/jssdk-v6/applepay-ecm` 前端：UI 完全参考 v5 applepay-ecm（官方 `<apple-pay-button>` + 客制化按钮，两者同一点击流程）；Apple Pay JS 函数骨架模仿 v5，但用 v6 SDK API 形态实现。

## 2. v6 Apple Pay 与 v5 的 SDK 差异（核心）

| 步骤 | v5 | v6 |
|------|----|----|
| 取 SDK | 全局 `paypalSDK.Applepay()`（同步） | `await getPPInstance()` → `createApplePayOneTimePaymentSession()` |
| 取配置 | `applepayInstance.config()` → `{countryCode, merchantCapabilities, supportedNetworks}` | `findEligibleMethods().getDetails('applepay').config` + `session.formatConfigForPaymentRequest(config)` |
| 账号资格 | 无（仅浏览器检查） | `findEligibleMethods({currencyCode}).isEligible('applepay')` |
| 商户验证 | `applepayInstance.validateMerchant({validationUrl})` → `{merchantSession}` | 相同（`session.validateMerchant(...)`） |
| 确认订单 | `confirmOrder(...)` → `{approveApplePayPayment:{status}}`，查 `APPROVED` | `await session.confirmOrder(...)`，返回值文档未定义 → **防御式** |
| 3DS | Apple Pay 协议内部处理 | 相同 |

> 资格检查双层语义（用户确认）：`ApplePaySession.canMakePayments()` 查**浏览器/钱包**；`findEligibleMethods().isEligible('applepay')` 查**当前账号**。两者都要。

## 3. 文件

| 文件 | 动作 |
|------|------|
| `src/views/paypal/jssdk-v6/applepay-ecm.ejs` | 新建 |
| `src/public/js/paypal/jssdk-v6/applepay-ecm.js` | 新建 |

## 4. EJS 视图（applepay-ecm.ejs）

结构复制 v5 `views/paypal/jssdk-v5/applepay-ecm.ejs`，改动：
- header include **去掉 `sdkUrl` 和 extraScripts**（v6 SDK + Apple CDN 都在 body 自行加载）。
- provider-badge 文案：`PayPal · JSSDK v6 · Apple Pay`。
- 货币下拉用 `supportedCurrencies.forEach`（与 v6 acdc 一致），保留金额输入 + `amount-error`。
- 保留 v5 的"Shipping Address（商户预填、不在 Apple Pay sheet 显示）"展示块，数据来自 `sandboxShipping`。
- 容器：`#paypal-button-container`（官方按钮挂载点，初始 `sdk-loading` spinner）+ `#custom-applepay-btn`（客制化按钮，初始 `disabled`，样式逐字沿用 v5 内联样式）+ `#result`。

底部注入：

```html
<script>
  window.DEMO = {
    clientId:   '<%= clientId %>',
    components: ['applepay-payments'],
    pageType:   'checkout',
    urls: {
      createOrder:  '/paypal/jssdk-v6/api/applepay-ecm/create-order',
      captureOrder: '/paypal/jssdk-v6/api/applepay-ecm/capture-order',
    },
  }
</script>
<script src="/js/paypal/jssdk-v6/init.js"></script>
<script src="/js/paypal/jssdk-v6/applepay-ecm.js"></script>
<script src="https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js"></script>
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>
```

> 脚本顺序：init → 产品 JS → Apple CDN → v6 core（defer）。产品 JS 用 `window.addEventListener('load')` 等待，此时 `window.paypal` 与 `window.ApplePaySession` 均就绪。

## 5. 前端 JS（public/js/paypal/jssdk-v6/applepay-ecm.js）

IIFE + `'use strict'`。搬运 v5 的辅助函数：`getCurrency / getAmount / isZeroDecimal / validateAmount / showResult / clearLoading` + 货币切换 reload + 金额 blur 格式化。`ZERO_DECIMAL` / `MIN/MAX_AMOUNT` 沿用。

### 5.1 入口 `onPayPalWebSdkLoaded()`（替代 v5 `setupApplepay`）

```
getPPInstance()
  .then(function (instance) {
    inspect('instance', instance)
    // 浏览器/钱包检查（v5 三连）：window.ApplePaySession && supportsVersion(4) && canMakePayments()
    if (!browserOk) { clearLoading(); showResult('Apple Pay not available...', 'error'); return }
    return instance.findEligibleMethods({ currencyCode: getCurrency() })
      .then(function (eligibility) {
        inspect('eligibility', eligibility)
        if (eligibility.isEligible('applepay')) {
          var details = eligibility.getDetails('applepay')
          inspect('applepay details', details)
          setupApplePayButton(instance, details)
        } else {
          clearLoading(); showResult('Apple Pay is not eligible for this account.', 'error')
        }
      })
  })
  .catch(...)
```

- **V6-3**：`instance` 必须在嵌套 `.then()` 作用域内。
- 浏览器检查失败 → 与 v5 一致的三种提示（无 ApplePaySession / 不支持 v4 / 无钱包卡）。

### 5.2 `setupApplePayButton(instance, details)`

- `var session = instance.createApplePayOneTimePaymentSession()`（参考代码为同步调用；`inspect('session', session)`，若实测是 Promise 再加 `await`）。
- 创建官方按钮（参考 v5 + GitHub 参考代码）：
  ```
  var btn = document.createElement('apple-pay-button')
  btn.setAttribute('buttonstyle', 'black')
  btn.setAttribute('type', 'buy')
  btn.setAttribute('locale', 'en')
  // 尺寸：沿用 v5 的 width:100% / height:44px（或 Apple CSS 变量）
  btn.addEventListener('click', function () { onApplePayClicked(session, details) })
  ```
  挂到 `#paypal-button-container`（先 clearLoading）。
- 启用客制化按钮 `#custom-applepay-btn`：`disabled=false` + 沿用 v5 的 hover/active 内联样式监听 + `addEventListener('click', function(){ onApplePayClicked(session, details) })`。

### 5.3 `onApplePayClicked(session, details)`（点击）

```
if (!validateAmount()) return
var value = 零小数位 ? round : toFixed(2)
var paymentRequest = Object.assign(
  {},
  session.formatConfigForPaymentRequest(details.config),   // v6：取代 v5 config()
  {
    countryCode:  details.config.countryCode || 'US',      // inspect 后确认来源
    currencyCode: getCurrency(),
    requiredBillingContactFields:  ['name','phone','email','postalAddress'],
    requiredShippingContactFields: [],                     // ECM：商户预填，sheet 不收
    total: { label: 'Total', amount: value, type: 'final' },
  }
)
inspect('paymentRequest', paymentRequest)
var apSession = new ApplePaySession(4, paymentRequest)
// 绑定下列事件 → apSession.begin()
```

### 5.4 Apple Pay 事件（结构对照 v5）

- `onvalidatemerchant`：`session.validateMerchant({ validationUrl: event.validationURL })` → `inspect('validateMerchant payload', payload)` → `apSession.completeMerchantValidation(payload.merchantSession)`；catch → `apSession.abort()` + 错误提示。
- `onpaymentmethodselected`：`apSession.completePaymentMethodSelection({ newTotal: { label:'Total', amount: value, type:'final' } })`。
- `onpaymentauthorized`（核心链，全程在回调内）：
  ```
  1. createOrder()  → fetch createOrder，拿 d.orderId（v6 小写 d）
  2. session.confirmOrder({ orderId, token: event.payment.token,
                            billingContact, shippingContact })
     → inspect('confirmOrder result', confirmResult)
     → 防御式校验（见 §6）
  3. captureOrder() → fetch captureOrder，inspect('capture order', order)
     → 查 purchase_units[0].payments.captures[0].status === 'COMPLETED'（规则 13）
  4. apSession.completePayment({ status: COMPLETED ? STATUS_SUCCESS : STATUS_FAILURE })
     + showResult 成功/失败
  catch → completePayment(STATUS_FAILURE) + showResult('✗ ...')
  ```
- `oncancel`：log（不弹错误，与 v5 一致）。

> **必须始终调用 `completePayment()`**（v5 规则 18），否则 Apple Pay sheet 卡死。

## 6. confirmOrder 防御式校验（用户确认）

- 全程 `inspect()`：`instance / eligibility / details / session / config / paymentRequest / validateMerchant payload / confirmResult / capture order` 逐一打印自身属性 + 原型方法（ACDC 风格），先看真实形态，后续再收紧。
- `confirmResult` 判定：
  - 若含 `approveApplePayPayment.status` → 按 v5 校验 `=== 'APPROVED'`，否则抛错。
  - 若 v6 不返回该字段（实测确认）→ 跳过此校验。
- **最终成败一律以 capture 为准**：仅 `captures[0].status === 'COMPLETED'` 算成功（**不采纳**参考代码的 `PENDING`，遵项目规则 13）。
- capture 响应字段用 **snake_case `purchase_units`**（本项目后端返回原始 PayPal JSON；**不采纳**参考代码的 camelCase `purchaseUnits`）。

## 7. `inspect()` 探查工具

复用 v6 acdc.js 的 `inspect(label, obj)`：打印 value / `Object.keys` / `getOwnPropertyNames` / 原型方法 / 是否 DOM 节点 / 是否有 `addEventListener`。用于确认 v6 Apple Pay 各对象真实 API 形态。API 形态确认后按需删减探查代码（记 `docs/debug-log.md`）。

## 8. 与 v5 前端的差异总表

| 方面 | v5 | v6 |
|------|----|----|
| 取 SDK 实例 | `paypalSDK.Applepay()` | `getPPInstance()` + `createApplePayOneTimePaymentSession()` |
| 取 merchant 配置 | `instance.config()` | `getDetails('applepay').config` + `formatConfigForPaymentRequest()` |
| 账号资格门 | 无 | `findEligibleMethods().isEligible('applepay')` |
| paymentRequest 来源 | config 三字段 | formatConfigForPaymentRequest 展开 + countryCode/currency/total |
| createOrder 响应字段 | `d.id` | `d.orderId`（小写 d） |
| confirmOrder 校验 | 查 `approveApplePayPayment.status==='APPROVED'` | 防御式（有则查，无则靠 capture） |
| capture 字段名 | `purchase_units`（snake） | 相同（snake，规则 13） |
| 官方/客制按钮 | 两个，同一 handler | 相同 |

## 9. 验收标准（详见 plan 测试矩阵）

- Safari + 沙盒 iCloud + 钱包测试卡：官方按钮和客制按钮都能拉起 Apple Pay sheet 并完成付款，`✓ Payment captured · Order: ...`。
- 非 Safari / 无钱包卡：显示对应 v5 风格提示，不报未捕获异常。
- 账号不合格（isEligible 为 false）：显示 "not eligible"，不渲染按钮。
- DevTools console 可见各对象 `inspect()` 输出，便于核对 v6 API 形态。
