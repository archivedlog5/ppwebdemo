# 需求 — JSSDK v6 Apple Pay ECS Demo

> 日期：2026-06-02 · 范围：demo-hub · provider=paypal · sdk_version=jssdk-v6 · product_key=applepay-ecs

## 1. 目标

在 demo-hub 新增 PayPal JSSDK **v6** 的 Apple Pay ECS（Express Checkout Shortcut，买家在 Apple Pay sheet 内选配送地址 / 邮箱 / 电话 / 配送方式）一次性付款 demo，路由 `/paypal/jssdk-v6/applepay-ecs`。功能与 v5 applepay-ecs 等价，只把 SDK 集成方式从 v5（全局 `paypalSDK.Applepay()`）迁移到 v6（`createInstance` + `createApplePayOneTimePaymentSession`）。

**与已完成的 v6 applepay-ecm 的关系**：本 demo = v6 applepay-ecm 的 **SDK 机制/结构** + v5 applepay-ecs 的 **ECS 流程**（sheet 内收集配送信息 + shipping method 选择 + create-order 带 shippingContact/shippingAmount）。

## 2. 硬性约束（用户明确要求）

1. **UI 参考 v5 applepay-ecs**：沿用 `views/paypal/jssdk-v5/applepay-ecs.ejs` 的页面结构与控件（货币选择器、金额输入 + 校验、Sandbox 徽标、"Buyer selects in sheet"（配送地址·邮箱·电话·配送方式）提示块、官方 Apple Pay 按钮容器、客制化按钮、结果区）。**不渲染商户预填 Shipping 展示块**（与 ecm 的关键 UI 区别——ECS 由买家在 sheet 内选）。
2. **create-order 参数与 v5 applepay-ecs 完全一致**：服务端 order body 逐字保持不变——`intent` + `purchase_units`{reference_id/description/invoice_id/custom_id/soft_descriptor/amount.breakdown(item_total+shipping)/items/shipping(由 shippingContact 映射)} + `payment_source.apple_pay`{name/email_address/phone_number(仅 national_number)/experience_context(return_url/cancel_url)}；前端 create-order 请求 body 仍为 `{ amount, currency, shippingContact, billingContact, shippingAmount }`。
3. **官方按钮 + 客制化按钮**（参考 v5）：渲染官方 `<apple-pay-button>`（Apple CDN web component）+ 一个客制化样式按钮，两者绑定**同一点击流程**。
4. **Apple JS 相关函数模仿 v5 applepay-ecs**：事件处理骨架（onvalidatemerchant / onpaymentmethodselected / **onshippingcontactselected** / **onshippingmethodselected** / onpaymentauthorized / oncancel）结构对照 v5 ecs；createOrder→confirmOrder→capture 链在 `onpaymentauthorized` 内执行；始终调用 `completePayment(SUCCESS/FAILURE)`。
5. 后端 REST API 仍走 `/v2/checkout/orders`（v6 不改后端 API），账号沿用 **CN**（与 v5 applepay-ecs 一致，`getCNToken` / `PAYPAL_CN_CLIENT_ID`）。
6. **忽略 ngrok 相关内容**（用户明确：不需要）。
7. **clientId 来源沿用 demo-hub 现有 v6 约定**（用户确认）：EJS 注入 `clientId` → `window.DEMO.clientId` → `init.js` 的 `createInstance`。**不采纳**参考 demo code 的 `getBrowserSafeClientId()` GET 端点写法。
8. **参考 demo code（用户贴的 7.2）只作 v6 函数形态参考**（用户确认："demo code 只是给你看一些函数而已，不要完全参考 applepay 的参数"）——其本身是 ECM 流程（`requiredShippingContactFields: []`、无 shipping method、total 固定），**不作为本 ECS demo 的流程/参数依据**。流程与参数一律以 v5 applepay-ecs 为准。

## 3. ECS vs ECM 的关键区别（本 demo 相对已完成的 v6 applepay-ecm）

| 方面 | applepay-ecm（已完成） | applepay-ecs（本需求） |
|------|------------------------|------------------------|
| 配送信息来源 | 商户预填（`SANDBOX_SHIPPING`） | 买家在 Apple Pay sheet 内选 |
| `requiredShippingContactFields` | `[]` | `['name','phone','email','postalAddress']` |
| shipping method | 无 | `SHIPPING_METHODS`：Standard $5 / Express $10 |
| Apple Pay 事件 | onvalidatemerchant / onpaymentmethodselected / onpaymentauthorized / oncancel | **额外** onshippingcontactselected + onshippingmethodselected |
| `total` 构成 | 仅 item | item + 选中的 shipping（含 `lineItems`） |
| create-order 请求 body | `{ amount, currency }` | `{ amount, currency, shippingContact, billingContact, shippingAmount }` |
| payment_source.apple_pay | 仅 `experience_context` | 额外 `name` / `email_address` / `phone_number`（仅 national_number，无 country_code） |
| order body shipping | `SANDBOX_SHIPPING` | 由 `shippingContact` 映射（`mapApplePayShipping`） |
| UI Shipping 块 | 商户预填地址展示块 | "Buyer selects in sheet" 提示块（无地址数据） |

## 4. v6 与 v5 的关键差异（本 demo 与 v5 applepay-ecs 相比）

| 方面 | v5 applepay-ecs | v6 applepay-ecs |
|------|-----------------|-----------------|
| SDK 加载 | `sdk/js?client-id=...&components=applepay` | `web-sdk/v6/core`（无 query）+ `createInstance({ clientId, components: ['applepay-payments'] })` |
| 取 SDK 实例 | 全局 `paypalSDK.Applepay()`（同步） | `getPPInstance()` → `createApplePayOneTimePaymentSession()` |
| 取 merchant 配置 | `applepayInstance.config()` → `{countryCode, merchantCapabilities, supportedNetworks}` | `findEligibleMethods().getDetails('applepay').config` + `session.formatConfigForPaymentRequest(config)` |
| 账号资格检查 | 无（仅浏览器检查） | `findEligibleMethods({ currencyCode }).isEligible('applepay')` |
| 商户验证 | `applepayInstance.validateMerchant({ validationUrl })` → `{merchantSession}` | 相同（`session.validateMerchant(...)`） |
| 确认订单 | `applepayInstance.confirmOrder(...)` → `{approveApplePayPayment:{status}}`，查 `APPROVED` | `session.confirmOrder(...)`，返回值文档未定义 → 防御式 |
| createOrder 响应 | `{ id }` | `{ orderId }`（小写 d，规则 V6-1） |
| 3DS | Apple Pay 协议内部处理 | 相同 |
| shipping 事件 / 流程 | onshippingcontactselected + onshippingmethodselected + SHIPPING_METHODS | **完全相同**（ECS 流程不变，只换 SDK 取实例/配置/确认的写法） |

## 3a. 已定调的范围决策（评审确认）

1. **confirmOrder 校验 = 防御式 + 全程 inspect**：每个 SDK 返回对象（instance / eligibility / details / session / config / paymentRequest / validateMerchant payload / **shippingContact event** / **shippingMethod event** / confirmResult / capture order）都用 ACDC 风格 `inspect()` 打印自身属性 + 原型方法，先看真实形态后续再收紧。`confirmResult` 若含 `approveApplePayPayment.status` 则按 v5 校验 `=== 'APPROVED'`；若 v6 不返回则跳过；**最终成败一律以 capture 为准**。
   > 重点探查 ECS 专属事件：`onshippingcontactselected` 的 `event.shippingContact` 与 `onshippingmethodselected` 的 `event.shippingMethod` 在 v6 下的真实形态未经验证（v6 ecm 没有这两个事件）。
2. **双层资格检查**：`ApplePaySession.canMakePayments()` 查**浏览器/钱包**；`findEligibleMethods().isEligible('applepay')` 查**当前账号**。两者都要。
3. **capture 只认 COMPLETED**：遵项目 CLAUDE.md 规则 13，仅 `purchase_units[0].payments.captures[0].status === 'COMPLETED'` 算成功；后端返回原始 PayPal snake_case JSON。
4. **不新增 GET order details 端点**：Apple Pay 3DS 由协议内部处理（v5 规则 18）。
5. **onshippingcontactselected 不按地址重算**：与 v5 ecs 一致——本 demo 不根据买家地址重新计算运费/税，仅用当前选中 shipping method 重确认 total + lineItems。

## 5. 完成标准（可验证）

- [ ] `/paypal/jssdk-v6/applepay-ecs` 渲染出与 v5 视觉一致的页面（货币/金额/"Buyer selects in sheet" 提示块/官方按钮/客制按钮/结果区），**无**商户预填地址展示块。
- [ ] Safari + 沙盒 iCloud + 钱包测试卡：官方 `<apple-pay-button>` 和客制按钮都能拉起 Apple Pay sheet，sheet 内可选配送地址 + 邮箱 + 电话 + 配送方式（Standard/Express），切换 shipping method 时 total 实时更新，完成付款后结果区显示 `✓ Payment captured · Order: ...`。
- [ ] 切换 shipping method（Standard↔Express）：sheet 内 total 随之变化（item + 对应运费）；最终 create-order 的金额与 sheet total 一致。
- [ ] 非 Safari / 无钱包卡：显示对应 v5 风格提示，无未捕获异常。
- [ ] 账号不合格（`isEligible('applepay')` 为 false）：显示 "not eligible"，不渲染按钮。
- [ ] 商户验证失败：`abort()` + 错误提示，sheet 关闭。
- [ ] 用户取消：`oncancel` log，无红错，可重试。
- [ ] capture 非 COMPLETED：显示 `✗ Capture failed · status: ...`，`completePayment(FAILURE)`，不误报成功。
- [ ] create-order body 与 v5 applepay-ecs 逐字一致（含 shippingContact 映射 + payment_source.apple_pay 的 name/email_address/phone_number；仅响应字段名改为 `orderId`）。
- [ ] DevTools console 可见各对象 `inspect()` 输出，尤其 ECS 专属的 shippingContact / shippingMethod 事件形态。

## 6. 关联文档

- 后端设计：`docs/design/2026-06-02-design-be-jssdk-v6-applepay-ecs.md`
- 前端设计：`docs/design/2026-06-02-design-fe-jssdk-v6-applepay-ecs.md`
- 实现计划：`docs/plans/2026-06-02-plan-jssdk-v6-applepay-ecs-v1.md`
- 参考实现（ECS 流程 + create-order 参数）：`src/routes/paypal/jssdk-v5/applepay-ecs.js`、`src/public/js/paypal/jssdk-v5/applepay-ecs.js`、`src/views/paypal/jssdk-v5/applepay-ecs.ejs`
- 参考实现（v6 SDK 机制 + 结构 + inspect）：`src/routes/paypal/jssdk-v6/applepay-ecm.js`、`src/public/js/paypal/jssdk-v6/applepay-ecm.js`、`src/views/paypal/jssdk-v6/applepay-ecm.ejs`、`src/public/js/paypal/jssdk-v6/init.js`
- v6 同类需求：`docs/req/2026-06-02-req-jssdk-v6-applepay-ecm.md`
- 参考 demo code：用户贴的 7.2（仅作 v6 函数形态参考，参数不采纳）
