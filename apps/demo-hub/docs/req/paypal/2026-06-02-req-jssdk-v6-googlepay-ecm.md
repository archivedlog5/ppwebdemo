# 需求 — JSSDK v6 Google Pay ECM Demo

> 日期：2026-06-02 · 范围：demo-hub · provider=paypal · sdk_version=jssdk-v6 · product_key=googlepay-ecm

## 1. 目标

在 demo-hub 新增 PayPal JSSDK **v6** 的 Google Pay ECM（Express Checkout Mark，商户预填 shipping、`shippingAddressRequired: false`，买家在 Google Pay sheet 仅提供 email）一次性付款 demo，路由 `/paypal/jssdk-v6/googlepay-ecm`。功能与 v5 googlepay-ecm 等价，只把 SDK 集成方式从 v5（全局 `paypalSDK.Googlepay()`）迁移到 v6（`createInstance` + `createGooglePayOneTimePaymentSession`）。

## 2. 硬性约束（用户明确要求）

1. **UI 参考 v5 googlepay-ecm**：沿用 `views/paypal/jssdk-v5/googlepay-ecm.ejs` 的页面结构与控件（货币选择器、金额输入 + 校验、3DS/SCA 选择器、Sandbox 徽标、商户预填 Shipping Address + Phone 展示块、官方 Google Pay 按钮容器、客制化按钮、结果区）。
2. **create-order 参数与 v5 googlepay-ecm 完全一致**：服务端 order body（`intent` + `purchase_units`{reference_id/description/invoice_id/custom_id/soft_descriptor/amount.breakdown/items/shipping} + `payment_source.google_pay`{email_address/phone_number=SANDBOX_PHONE/experience_context{return_url/cancel_url}/attributes.verification.method}）逐字保持不变；前端 create-order 请求 body 仍为 `{ amount, currency, shipping, scaMethod, email }`。
3. **官方按钮 + 客制化按钮**（参考 v5）：渲染官方 Google Pay 按钮（`paymentsClient.createButton`）+ 一个客制化样式按钮，两者绑定**同一点击流程** `onGooglePaymentButtonClicked`。
4. **Google Pay JS 相关函数模仿 v5**：函数骨架（`setupGooglePayButton` / `onGooglePaymentButtonClicked` / `processPayment` / `getOrderDetails` / `handle3DS` / `doCapture`）结构对照 v5；createOrder→confirmOrder→capture 链结构沿用 v5。
5. 后端 REST API 仍走 `/v2/checkout/orders`（v6 不改后端 API），账号沿用 **CN**（与 v5 googlepay-ecm 一致，`getCNToken` / `PAYPAL_CN_CLIENT_ID`）。

## 3. v6 与 v5 的关键差异（影响本 demo）

| 方面 | v5 googlepay-ecm | v6 googlepay-ecm |
|------|-----------------|-----------------|
| SDK 加载 | `sdk/js?client-id=...&components=googlepay` | `web-sdk/v6/core`（无 query）+ `createInstance({ clientId, components: ['googlepay-payments'] })` |
| 取 SDK 实例 | 全局 `paypalSDK.Googlepay()`（同步） | `getPPInstance()` → `instance.createGooglePayOneTimePaymentSession()`（同步） |
| 取 Google Pay 配置 | `paypalSDK.Googlepay().config()` → `{allowedPaymentMethods, merchantInfo, apiVersion, apiVersionMinor, countryCode}` | `findEligibleMethods().getDetails('googlepay').config` + `session.formatConfigForPaymentRequest(config)` |
| 账号资格检查 | 无（仅 `isReadyToPay` 浏览器/钱包检查） | `findEligibleMethods({ currencyCode }).isEligible('googlepay')`（外加 `isReadyToPay`） |
| 确认订单 | `paypalSDK.Googlepay().confirmOrder({orderId, paymentMethodData})` | `googlePaySession.confirmOrder({orderId, paymentMethodData})` |
| createOrder 响应 | `{ id }` | `{ orderId }`（小写 d，规则 V6-1） |
| 3DS | `PAYER_ACTION_REQUIRED` → `initiatePayerAction` → GET order → `handle3DS` | **probe-then-decide**（见 3a.2） |

## 3a. 已定调的范围决策（评审确认）

1. **付款流程 = v5-style Promise 模式**（用户确认）：`PaymentsClient` 创建时**不传** `paymentDataCallbacks`（v5 规则 14 的 ECM Promise 模式）；`loadPaymentData(req).then(paymentData => createOrder → processPayment)`。**不采纳**用户提供的 v6 参考 demo 的 callback 模式（`onPaymentAuthorized` + `callbackIntents:['PAYMENT_AUTHORIZATION']`）。理由：① 用户要求函数模仿 v5；② v5 ECM 选 Promise 模式正是为让 3DS 弹窗正常弹出；③ create-order 参数要求与 v5 一致（含 SCA），与 v5 Promise 流程契合。
2. **3DS = probe-then-decide**（用户确认）：实现时先 `inspect()` v6 `googlePaySession`，确认是否存在 `initiatePayerAction`：
   - **存在** → 移植 v5 完整路径（`initiatePayerAction({orderId})` → `getOrderDetails` → `handle3DS` 读 `payment_source.google_pay.card.authentication_result`，决策表 POSSIBLE→capture / NO+enrollment∈{N,U,B}→capture / NO+其他→reject / UNKNOWN→retry）。
   - **不存在** → v6 参考 demo 回退：`PAYER_ACTION_REQUIRED` 时显示 "3DS action required — retry"，**不** capture。
   - 最终 ship 的分支由 probe 结果决定，删除未走的分支并把结论记入 `docs/debug-log.md`。
3. **全程 inspect 探查**（用户记忆规则）：每个 v6 SDK 返回对象（instance / eligibility / details / googlePaySession / googlePayConfig / paymentData / confirmOrder result /（initiatePayerAction?）/ order details / capture order）都用 ACDC 风格 `inspect()` 打印自身属性 + 原型方法，先看真实形态后续再收紧。
4. **capture 只认 COMPLETED**（项目规则 13）：仅 `purchase_units[0].payments.captures[0].status === 'COMPLETED'` 算成功；非终态（PENDING/DECLINED）显示错误。
5. **保留 GET order details 端点**：3DS 完整路径分支需要 GET order 解析 `authentication_result`（区别于 applepay-ecm 无需此端点）。

## 4. 完成标准（可验证）

- [ ] `/paypal/jssdk-v6/googlepay-ecm` 渲染出与 v5 视觉一致的页面（货币/金额/3DS 选择器/Shipping+Phone 预填展示/官方按钮/客制按钮/结果区）。
- [ ] Chrome + Google-Pay 关联卡：官方 Google Pay 按钮和客制按钮都能拉起 Google Pay sheet 并完成付款，结果区显示 `✓ Payment captured · Order: ...`。
- [ ] 非 Chrome / 无 Google Pay SDK（`window.google.payments` 缺失）：显示对应 v5 风格提示，无未捕获异常。
- [ ] 账号不合格（`isEligible('googlepay')` 为 false）或 `isReadyToPay` 为 false：显示对应提示，不渲染按钮。
- [ ] 用户取消 Google Pay sheet（`statusCode === 'CANCELED'`）：静默，无红错，可重试。
- [ ] 3DS（SCA_ALWAYS 触发 `PAYER_ACTION_REQUIRED`）：按 probe 结果走完整路径（capture 成功）或回退提示。
- [ ] capture 非 COMPLETED：显示 `✗ Capture failed · status: ...`，不误报成功。
- [ ] create-order body 与 v5 逐字一致（仅响应字段名改为 `orderId`）。
- [ ] DevTools console 可见各对象 `inspect()` 输出，便于核对 v6 API 形态。

## 5. 关联文档

- 后端设计：`docs/design/2026-06-02-design-be-jssdk-v6-googlepay-ecm.md`
- 前端设计：`docs/design/2026-06-02-design-fe-jssdk-v6-googlepay-ecm.md`
- 实现计划：`docs/plans/2026-06-02-plan-jssdk-v6-googlepay-ecm-v1.md`
- 参考实现：`src/routes/paypal/jssdk-v5/googlepay-ecm.js`、`src/public/js/paypal/jssdk-v5/googlepay-ecm.js`、`src/views/paypal/jssdk-v5/googlepay-ecm.ejs`
- v6 同类参考：`src/public/js/paypal/jssdk-v6/applepay-ecm.js`（v6 inspect 探查 + 钱包类双按钮流程）、`src/public/js/paypal/jssdk-v6/init.js`（实例单例）
- 用户提供：v6 Google Pay 集成文档 + JSSDK v6 Reference（`createGooglePayOneTimePaymentSession` / `formatConfigForPaymentRequest` / `confirmOrder`）+ v6 参考 demo code（callback 模式，本 demo **不采纳**其流程模式，仅作 API 形态参考）
- GitHub 参考：paypal-examples/v6-web-sdk-sample-integration（googlepayPayments/oneTimePayment/html）
