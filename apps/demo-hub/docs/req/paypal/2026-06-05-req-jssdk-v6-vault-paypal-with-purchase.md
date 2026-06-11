# 需求 — JSSDK v6 Vault PayPal with Purchase Demo

> 日期：2026-06-05 · 范围：demo-hub · provider=paypal · sdk_version=jssdk-v6 · product_key=vault-paypal-with-purchase

## 1. 目标

在 demo-hub 新增 PayPal JSSDK **v6** 的 "Vault PayPal with Purchase"（购买中入会）demo，路由 `/paypal/jssdk-v6/vault-paypal-with-purchase`。在买家完成一次性付款的同时，把其 PayPal 账户保存到 vault；capture 成功后展示 vault token 与 customer id。功能与 v5 同名 demo 等价，只把 SDK 集成方式从 v5（`paypal.Buttons` + `vault=true` + id_token）迁移到 v6（`createInstance({ clientId })` + `createPayPalOneTimePaymentSession`）。

## 2. 硬性约束（用户明确要求）

1. **UI 参考 v5**：沿用 `views/paypal/jssdk-v5/vault-paypal-with-purchase.ejs` 的页面结构与控件（货币选择器、金额输入、Vault Behavior 说明框、PayPal 按钮、结果区、Vault Result 框）。**v5 UI only**——不加 v6 的 presentation-mode 下拉、不加 custom-trigger 按钮。
2. **create-order 参数与 v5 完全一致**：服务端 order body 的 `payment_source.paypal.attributes.vault`（`store_in_vault: ON_SUCCESS` / `usage_type: MERCHANT` / `customer_type: CONSUMER` / `permit_multiple_payment_tokens: false` / `description`）、`attributes.customer.merchant_customer_id`、`experience_context`（`brand_name` / `shipping_preference: SET_PROVIDED_ADDRESS` / return+cancel url）、purchase_units/items/shipping 全部保持不变（仅 return/cancel url 改 v6 路径）。
3. **认证路径 = clientId**：集成文档明确 "clientId is the standard path for saving to the vault"，仅 Fastlane 需 clientToken。复用现有 `init.js` 的 clientId 流程，不新增 browser-safe-client-token 端点。
4. **vault token 来源 = capture 响应**：与 v5 一致，从 capture 响应 `payment_source.paypal.attributes.vault.{id, customer.id}` 提取，**不**新增 `GET /order/:id` 端点。
5. **仅 PayPal 按钮**：不引入官方 demo code 里的 PayLater / Credit 按钮。
6. 后端 REST API 仍走 `/v2/checkout/orders`（v6 不改后端 API），账号沿用 **CN**（`getCNToken` / `PAYPAL_CN_CLIENT_ID`）。

## 2a. 保留的 vault 专属 SDK 设置（用户确认）

源自官方 demo code，确认保留：

- `findEligibleMethods({ currencyCode, paymentFlow: 'VAULT_WITH_PAYMENT' })` —— vault 流程的资格检查。
- `createPayPalOneTimePaymentSession({ ..., savePayment: true })` —— 因后端 order 已带 `store_in_vault`。

## 3. v6 与 v5 的关键差异（影响本 demo）

| 方面 | v5 | v6（本 demo） |
|------|----|----|
| 认证 | `sdk/js?...&vault=true` + `id_token`（sdkUserIdToken） | `web-sdk/v6/core`（无 query）+ `createInstance({ clientId, components:['paypal-payments'] })` |
| 资格检查 | 无显式 eligibility | `instance.findEligibleMethods({ paymentFlow:'VAULT_WITH_PAYMENT' }).isEligible('paypal')` |
| Session | `paypal.Buttons({ createOrder, onApprove })` | `instance.createPayPalOneTimePaymentSession({..., savePayment:true})` + `session.start(opts, orderPromise)` |
| create-order 返回 | `{ id }` | `{ orderId }`（小写 d） |
| capture 参数 | `{ orderID }`（大写 D） | `{ orderId }`（小写 d） |
| vault 展示 | Vault Result 框（token + customer id） | **不变**（同框、同字段） |

## 4. 完成标准（可验证）

- [ ] `/paypal/jssdk-v6/vault-paypal-with-purchase` 渲染出与 v5 视觉一致的页面（货币/金额/Vault Behavior 框/PayPal 按钮/结果区/Vault Result 框），无 presentation-mode 下拉、无 custom-trigger 按钮。
- [ ] 点击 PayPal 按钮 → 完成 sandbox 付款 → 结果区显示 `✓ Payment captured · Order: ...`。
- [ ] capture 成功后 Vault Result 框显示**非空** Vault Token 与 Customer ID。
- [ ] capture 非 `COMPLETED`（如 DECLINED/PENDING）→ 显示错误，不误报成功（`captures[0].status === 'COMPLETED'` 判定，规则 13）。
- [ ] 取消付款 → 显示取消提示（红色）。
- [ ] PayPal 不合格地区 → 显示 "PayPal not eligible in this region"。
- [ ] 货币切换 → reload 带 `?currency=&amount=`，金额保留。
- [ ] create-order body 与 v5 逐字一致（仅 return/cancel url 为 v6 路径）。

## 5. 关联文档

- 后端设计：`docs/design/2026-06-05-design-be-jssdk-v6-vault-paypal-with-purchase.md`
- 前端设计：`docs/design/2026-06-05-design-fe-jssdk-v6-vault-paypal-with-purchase.md`
- 实现计划：`docs/plans/2026-06-05-plan-jssdk-v6-vault-paypal-with-purchase-v1.md`
- 参考实现：`src/routes/paypal/jssdk-v5/vault-paypal-with-purchase.js`、`src/views/paypal/jssdk-v5/vault-paypal-with-purchase.ejs`、`src/public/js/paypal/jssdk-v5/vault-paypal-with-purchase.js`
- v6 同类参考：`src/public/js/paypal/jssdk-v6/paypal-ecm.js`（v6 PayPal button 流程模板）
