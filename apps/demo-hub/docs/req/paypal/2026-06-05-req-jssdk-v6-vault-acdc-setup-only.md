# 需求 — JSSDK v6 Vault ACDC Setup-Only Demo

> 日期：2026-06-05 · 范围：demo-hub · provider=paypal · sdk_version=jssdk-v6 · product_key=vault-acdc-setup-only

## 1. 目标

在 demo-hub 新增 PayPal JSSDK **v6** 的 "Vault ACDC Setup-Only"（用卡纯签约、无购买）demo，路由 `/paypal/jssdk-v6/vault-acdc-setup-only`。买家在卡输入域填卡 → 点 Save Card → 通过/跳过 3DS → 把卡保存到 vault（zero-dollar，不扣款），保存成功后展示 Payment Token 与 Customer ID。功能与 v5 同名 demo 等价，只把 SDK 集成方式从 v5（`paypal.CardFields` + `createVaultSetupToken` 回调）迁移到 v6（`createInstance({ clientId })` + `createCardFieldsSavePaymentSession` + `session.submit()`）。

## 2. 硬性约束（用户明确要求）

1. **UI 参考 v5**：沿用 `views/paypal/jssdk-v5/vault-acdc-setup-only.ejs` 的页面结构与控件（3DS 选择器、Zero-Dollar 徽章、三个卡输入域、Save Card 按钮、结果区、Vault Result 框）。**无**货币/金额选择器（zero-dollar），仅保留 3DS 选择器。
2. **create setup payment 参数与 v5 完全一致**：服务端 `/v3/vault/setup-tokens` body 的 `customer.merchant_customer_id`（随机 `CUST_` 前缀）、`payment_source.card.{ billing_address, experience_context, verification_method }` 全部保持不变（仅 return/cancel url 改 v6 路径）。
3. **前端 card-fields 参考 v6 `acdc`**：复用 `createCardFieldsComponent` + `appendChild` 渲染、`STYLE`、`submit()` → `{ state, data }` 状态机、防御式 eligibility、`inspect()` 探针。
4. **billingAddress 双传**：① setup-token body 含 `payment_source.card.billing_address`（snake_case）；② `session.submit()` 第二参 `{ billingAddress: mapBilling(...) }`（camelCase）。与 v5 一致。
5. **认证路径 = clientId**：复用现有 `init.js` 的 clientId 流程（与 v6 acdc / vault-paypal-setup-only 一致），不新增 browser-safe-client-token 端点。官方 save-payment sample 的 `getBrowserSafeClientId()` 同样是 clientId。
6. 后端走 Vault v3 API（`/v3/vault/setup-tokens` + `/v3/vault/payment-tokens`，**不碰** Orders API），账号沿用 **CN**（`getCNToken` / `PAYPAL_CN_CLIENT_ID`）。

> **Eng review 确认（2026-06-05）**：以下两项经 `/plan-eng-review` 复核并由用户拍板保留 —— ① 严格 3DS 门按 v5 原样、首跑验证；② 代码按现有模式每文件独立复制，不抽共享模块。已写入 CLAUDE.md 规则节 V6-ACDC-SETUP-2 / V6-ACDC-SETUP-6。

## 2a. 保留的 vault 专属 SDK 设置（用户拍板）

- **3DS 严格门**（沿用 v5）：`submit()` 返回 `succeeded` 时，`data.liabilityShift` ∈ {YES, POSSIBLE} → 直接 confirm；否则 GET setup-token → `status==='APPROVED' && payment_source.card.verification_status==='VERIFIED'` → confirm；否则拒绝。这要求**第 3 个端点 GET setup-token**（比 v6 vault-paypal-setup-only 多一个）。
- **eligibility**：`findEligibleMethods({ currencyCode:'USD', paymentFlow:'VAULT_WITHOUT_PAYMENT' })` + `isEligible('advanced_cards')`，防御式渲染；若 `paymentFlow` 不被接受则回退无 paymentFlow。

## 3. v6 与 v5 的关键差异（影响本 demo）

| 方面 | v5 | v6（本 demo） |
|------|----|----|
| 认证 | `sdk/js?...&components=card-fields&vault=true` | `web-sdk/v6/core`（无 query）+ `createInstance({ clientId, components:['card-fields'] })` |
| Session | `paypal.CardFields({ createVaultSetupToken, onApprove, onError, onCancel })` | `instance.createCardFieldsSavePaymentSession()`（同步） |
| 字段渲染 | `cardFields.NumberField().render('#...')` | `session.createCardFieldsComponent({type}).appendChild` |
| 提交 | SDK 内部经 `createVaultSetupToken` 回调驱动 → `onApprove(data)` | 命令式：`await createSetupToken()` → `await session.submit(setupTokenId, { billingAddress })` → `{ state, data }` |
| approve 数据 | `onApprove(data)` 的 `data.liabilityShift` / `data.vaultSetupToken` | `submit()` 的 `result.data.liabilityShift` / `result.data.vaultSetupToken` |
| eligibility | 无显式 eligibility（`isEligible()` 同步） | `findEligibleMethods({ paymentFlow:'VAULT_WITHOUT_PAYMENT' }).isEligible('advanced_cards')` |
| 3DS 严格门 | 有（liabilityShift + GET setup-token verification_status） | **不变**（同逻辑，data 源从回调改为 submit 返回） |
| 结果展示 | Payment Token + Customer ID | **不变**（同框、同字段） |

## 4. 完成标准（可验证）

- [ ] `/paypal/jssdk-v6/vault-acdc-setup-only` 渲染出与 v5 视觉一致的页面（3DS 选择器 / Zero-Dollar 徽章 / 三卡输入域 / Save Card / 结果区 / Vault Result 框），无货币/金额选择器。
- [ ] 输入测试卡 `4012 0000 3333 0026` → Save Card（SCA_WHEN_REQUIRED）→ 结果区显示 `✓ Card saved · Payment Token: ...`，Vault Result 框显示**非空** Payment Token + Customer ID。
- [ ] SCA_ALWAYS：通过 3DS 挑战 → 成功保存；未通过 verification → `✗ Card not saved · verification: ...`（严格门，不误报成功）。
- [ ] 取消 3DS → 显示 `3D Secure cancelled — card not saved.`（红色），Save 按钮恢复可点。
- [ ] `submit()` 返回 `failed` → 显示 `data.message`；SDK 加载失败 → `✗ PayPal SDK failed to load`。
- [ ] create-setup-token body 与 v5 逐字一致（仅 return/cancel url 为 v6 路径）。
- [ ] billingAddress 在 setup-token body 与 `submit()` 两处都传（探针 P3 确认 submit 接受第二参；若不接受则仅 body 传，记 debug-log）。

## 5. 关联文档

- 后端设计：`docs/design/2026-06-05-design-be-jssdk-v6-vault-acdc-setup-only.md`
- 前端设计：`docs/design/2026-06-05-design-fe-jssdk-v6-vault-acdc-setup-only.md`
- 实现计划：`docs/plans/2026-06-05-plan-jssdk-v6-vault-acdc-setup-only-v1.md`
- 参考实现（v5）：`src/routes/paypal/jssdk-v5/vault-acdc-setup-only.js`、`src/views/paypal/jssdk-v5/vault-acdc-setup-only.ejs`、`src/public/js/paypal/jssdk-v5/vault-acdc-setup-only.js`
- v6 同类参考：`src/public/js/paypal/jssdk-v6/acdc.js`（v6 card-fields 模板）、`src/routes/paypal/jssdk-v6/vault-paypal-setup-only.js`（v6 vault setup-only 路由模板）
- 集成文档：PayPal "Save cards without purchase with the JavaScript SDK"（v6 `createCardFieldsSavePaymentSession`）
