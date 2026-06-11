# 需求 — JSSDK v6 Apple Pay ECM Demo

> 日期：2026-06-02 · 范围：demo-hub · provider=paypal · sdk_version=jssdk-v6 · product_key=applepay-ecm

## 1. 目标

在 demo-hub 新增 PayPal JSSDK **v6** 的 Apple Pay ECM（Express Checkout Mark，商户预填 shipping、买家在 Apple Pay sheet 提供 billing）一次性付款 demo，路由 `/paypal/jssdk-v6/applepay-ecm`。功能与 v5 applepay-ecm 等价，只把 SDK 集成方式从 v5（全局 `paypalSDK.Applepay()`）迁移到 v6（`createInstance` + `createApplePayOneTimePaymentSession`）。

## 2. 硬性约束（用户明确要求）

1. **UI 参考 v5 applepay-ecm**：沿用 `views/paypal/jssdk-v5/applepay-ecm.ejs` 的页面结构与控件（货币选择器、金额输入 + 校验、Sandbox 徽标、商户预填 Shipping Address 展示块、官方 Apple Pay 按钮容器、客制化按钮、结果区）。
2. **create-order 参数与 v5 applepay-ecm 完全一致**：服务端 order body（`intent` + `purchase_units`{reference_id/description/invoice_id/custom_id/soft_descriptor/amount.breakdown/items/shipping=SANDBOX_SHIPPING} + `payment_source.apple_pay.experience_context`{return_url/cancel_url}）逐字保持不变；前端 create-order 请求 body 仍为 `{ amount, currency }`。
3. **官方按钮 + 客制化按钮**（参考 v5）：渲染官方 `<apple-pay-button>`（Apple CDN web component）+ 一个客制化样式按钮，两者绑定**同一点击流程**。
4. **Apple JS 相关函数模仿 v5**：事件处理骨架（onvalidatemerchant / onpaymentmethodselected / onpaymentauthorized / oncancel）结构对照 v5；createOrder→confirmOrder→capture 链在 `onpaymentauthorized` 内执行；始终调用 `completePayment(SUCCESS/FAILURE)`。
5. 后端 REST API 仍走 `/v2/checkout/orders`（v6 不改后端 API），账号沿用 **CN**（与 v5 applepay-ecm 一致，`getCNToken` / `PAYPAL_CN_CLIENT_ID`）。
6. **忽略 ngrok 相关内容**（用户明确：不需要）。

## 3. v6 与 v5 的关键差异（影响本 demo）

| 方面 | v5 applepay-ecm | v6 applepay-ecm |
|------|-----------------|-----------------|
| SDK 加载 | `sdk/js?client-id=...&components=applepay` | `web-sdk/v6/core`（无 query）+ `createInstance({ clientId, components: ['applepay-payments'] })` |
| 取 SDK 实例 | 全局 `paypalSDK.Applepay()`（同步） | `getPPInstance()` → `createApplePayOneTimePaymentSession()` |
| 取 merchant 配置 | `applepayInstance.config()` → `{countryCode, merchantCapabilities, supportedNetworks}` | `findEligibleMethods().getDetails('applepay').config` + `session.formatConfigForPaymentRequest(config)` |
| 账号资格检查 | 无（仅浏览器检查） | `findEligibleMethods({ currencyCode }).isEligible('applepay')` |
| 商户验证 | `applepayInstance.validateMerchant({ validationUrl })` → `{merchantSession}` | 相同（`session.validateMerchant(...)`） |
| 确认订单 | `confirmOrder(...)` → `{approveApplePayPayment:{status}}`，查 `APPROVED` | `await session.confirmOrder(...)`，返回值文档未定义 → 防御式 |
| createOrder 响应 | `{ id }` | `{ orderId }`（小写 d，规则 V6-1） |
| 3DS | Apple Pay 协议内部处理 | 相同 |

## 3a. 已定调的范围决策（评审确认）

1. **confirmOrder 校验 = 防御式 + 全程 inspect**（用户确认）：每个 SDK 返回对象（instance / eligibility / details / session / config / paymentRequest / validateMerchant payload / confirmResult / capture order）都用 ACDC 风格 `inspect()` 打印自身属性 + 原型方法，先看真实形态后续再收紧。`confirmResult` 若含 `approveApplePayPayment.status` 则按 v5 校验 `=== 'APPROVED'`；若 v6 不返回则跳过；**最终成败一律以 capture 为准**。
2. **双层资格检查**（用户确认）：`ApplePaySession.canMakePayments()` 查**浏览器/钱包**；`findEligibleMethods().isEligible('applepay')` 查**当前账号**。两者都要。
3. **capture 只认 COMPLETED**（用户确认）：遵项目 CLAUDE.md 规则 13，仅 `purchase_units[0].payments.captures[0].status === 'COMPLETED'` 算成功；**不采纳** GitHub 参考代码的 `COMPLETED || PENDING`，也**不采纳**其 camelCase `purchaseUnits`（本项目后端返回原始 PayPal snake_case JSON）。
4. **不新增 GET order details 端点**：Apple Pay 3DS 由协议内部处理（v5 规则 18），无需像 ACDC 那样 GET order 解析 `authentication_result`。

## 4. 完成标准（可验证）

- [ ] `/paypal/jssdk-v6/applepay-ecm` 渲染出与 v5 视觉一致的页面（货币/金额/Shipping 预填展示/官方按钮/客制按钮/结果区）。
- [ ] Safari + 沙盒 iCloud + 钱包测试卡：官方 `<apple-pay-button>` 和客制按钮都能拉起 Apple Pay sheet 并完成付款，结果区显示 `✓ Payment captured · Order: ...`。
- [ ] 非 Safari / 无钱包卡：显示对应 v5 风格提示，无未捕获异常。
- [ ] 账号不合格（`isEligible('applepay')` 为 false）：显示 "not eligible"，不渲染按钮。
- [ ] 商户验证失败：`abort()` + 错误提示，sheet 关闭。
- [ ] 用户取消：`oncancel` log，无红错，可重试。
- [ ] capture 非 COMPLETED：显示 `✗ Capture failed · status: ...`，`completePayment(FAILURE)`，不误报成功。
- [ ] create-order body 与 v5 逐字一致（仅响应字段名改为 `orderId`）。
- [ ] DevTools console 可见各对象 `inspect()` 输出，便于核对 v6 API 形态。

## 5. 关联文档

- 后端设计：`docs/design/2026-06-02-design-be-jssdk-v6-applepay-ecm.md`
- 前端设计：`docs/design/2026-06-02-design-fe-jssdk-v6-applepay-ecm.md`
- 实现计划：`docs/plans/2026-06-02-plan-jssdk-v6-applepay-ecm-v1.md`
- 参考实现：`src/routes/paypal/jssdk-v5/applepay-ecm.js`、`src/public/js/paypal/jssdk-v5/applepay-ecm.js`、`src/views/paypal/jssdk-v5/applepay-ecm.ejs`
- v6 同类参考：`src/public/js/paypal/jssdk-v6/acdc.js`（v6 inspect 探查 + 卡类流程）、`src/public/js/paypal/jssdk-v6/init.js`（实例单例）
- GitHub 参考：paypal-examples/v6-web-sdk-sample-integration（applePay/html）
