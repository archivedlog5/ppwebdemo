# 需求 — JSSDK v6 ACDC Demo

> 日期：2026-06-02 · 范围：demo-hub · provider=paypal · sdk_version=jssdk-v6 · product_key=acdc

## 1. 目标

在 demo-hub 新增 PayPal JSSDK **v6** 的 ACDC（Advanced Credit/Debit Cards，托管卡输入域）一次性付款 demo，路由 `/paypal/jssdk-v6/acdc`。功能与 v5 ACDC 等价，只把 SDK 集成方式从 v5（`paypal.CardFields`）迁移到 v6（`createInstance` + `createCardFieldsOneTimePaymentSession`）。

## 2. 硬性约束（用户明确要求）

1. **UI 参考 v5 ACDC**：沿用 `views/paypal/jssdk-v5/acdc.ejs` 的页面结构与控件（货币选择器、金额输入、3DS SCA 下拉、Name on Card、卡号/有效期/CVV 三个 host 容器、Pay Now 按钮、结果区、测试卡提示）。
2. **create-order 参数与 v5 ACDC 完全一致**：`amount`、`currency`、`scaMethod`（`SCA_WHEN_REQUIRED` | `SCA_ALWAYS`）、`cardholderName`、`billingAddress`；服务端 order body 的 `payment_source.card` 结构（`name` + `billing_address` + `experience_context: ACDC_EXPERIENCE_CONTEXT` + `attributes.verification.method`）保持不变。
3. **3DS 处理逻辑跟 v5 ACDC 完全一致**（用户确认："跟 v5 一样"）：
   - 前端从 `session.submit()` 拿到 `liabilityShift`。
   - `liabilityShift` 为 `undefined` 或 `'POSSIBLE'` → 直接 capture。
   - 其他值 → GET order details，读 `payment_source.card.authentication_result`，套用 v5 决策表：
     - `liability_shift === 'NO'` 且 `enrollment_status ∈ {N, U, B}` → capture（卡未入会，frictionless）。
     - `liability_shift === 'UNKNOWN'` → 提示重试。
     - 其他 → 提示 3DS declined，换卡重试。
4. 后端 REST API 仍走 `/v2/checkout/orders`（v6 不改后端 API），账号沿用 **CN**（与 v5 ACDC 一致，`getCNToken` / `PAYPAL_CN_CLIENT_ID`）。

## 3. v6 与 v5 的关键差异（影响本 demo）

| 方面 | v5 ACDC | v6 ACDC |
|------|---------|---------|
| SDK 加载 | `sdk/js?client-id=...&components=card-fields` | `web-sdk/v6/core`（无 query）+ `createInstance({ clientId, components: ['card-fields'] })` |
| 资格检查 | `cardFields.isEligible()` | `instance.findEligibleMethods({ currencyCode }).isEligible('advanced_cards')` |
| Session | `paypal.CardFields({ createOrder, onApprove, ... })` | `instance.createCardFieldsOneTimePaymentSession(options)`（**同步返回**） |
| 字段渲染 | `cardFields.NumberField().render('#...')` | `session.createCardFieldsComponent({ type:'number' }).render?` → 文档用 `appendChild` |
| 提交 | `cardFields.submit({ billingAddress })` 内部回调触发 createOrder/onApprove | 点击时先 `await createOrder()` 拿 orderId，再 `await session.submit(orderId, { billingAddress })` 返回 `{ data, state }` |
| 结果 | onApprove(data) / onError / onCancel | `state ∈ {'succeeded','canceled','failed'}`，`data` 含 `{ orderId, liabilityShift }` |
| orderId | `orderID`（大写 D） | `orderId`（小写 d，全链路） |

## 3a. 已定调的范围决策（评审确认）

1. **资格判定 = 防御式（defensive）**：调用 `findEligibleMethods`，当 `isEligible('advanced_cards')` 为 true **或** 该 key 未出现在响应中时，**仍渲染**卡输入域；仅在明确不合格信号下显示 "not available"。依据官方提示 "the card may not appear in the eligibility response yet. Integrate defensively."
2. **字段 UX = documented-only**：仅交付 v6 文档支持的 `style`（含 `.invalid` 着色）；**明确不实现** v5 的每字段 valid/invalid 边框、focus 边框、卡种 console 日志（v5 `inputEvents`）。这是相对 v5 的合理减项，**不计为 bug**。

## 4. 完成标准（可验证）

- [ ] `/paypal/jssdk-v6/acdc` 渲染出与 v5 视觉一致的页面（布局/控件一致；字段级反馈仅 `.invalid` 着色），卡输入域正常加载。
- [ ] 有效卡 + `SCA_WHEN_REQUIRED`：付款成功，结果区显示 `✓ Payment captured · Order: ...`。
- [ ] `SCA_ALWAYS` 触发 3DS 弹窗，完成验证后成功 capture。
- [ ] 3DS 取消 → 显示取消提示，可重试。
- [ ] 卡验证错误 / capture DECLINED → 显示错误，不误报成功（`captures[0].status === 'COMPLETED'` 判定）。
- [ ] `liabilityShift` 非 `POSSIBLE`/`undefined` 的分支走 GET order → 决策表，行为与 v5 一致。
- [ ] 资格响应中缺 `advanced_cards` key 时，卡域仍渲染（防御式，不误拦）。

## 5. 关联文档

- 后端设计：`docs/design/2026-06-02-design-be-jssdk-v6-acdc.md`
- 前端设计：`docs/design/2026-06-02-design-fe-jssdk-v6-acdc.md`
- 实现计划：`docs/plans/2026-06-02-plan-jssdk-v6-acdc-v1.md`
- 参考实现：`src/routes/paypal/jssdk-v5/acdc.js`、`src/public/js/paypal/jssdk-v5/acdc.js`、`src/views/paypal/jssdk-v5/acdc.ejs`
- v6 同类参考：`src/public/js/paypal/jssdk-v6/bcdc-ecm.js`（v6 卡类产品流程）
</content>
</invoke>
