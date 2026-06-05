# 需求 — JSSDK v6 Vault ACDC with Purchase

> 日期：2026-06-05 · product_key：`vault-acdc-with-purchase` · provider/sdk：`paypal` / `jssdk-v6`
>
> 来源：用户提供的集成文档（Save cards with purchase with the JavaScript SDK）+ v6 JSSDK setup/reference + 既有 v5/v6 demo 沿用。

## 1. 目标

在 demo-hub 新增一个 **JSSDK v6** 的「用卡支付并同时签约 Vault」演示：买家用 Card Fields 输入卡信息完成**一次性购买**，若勾选「保存卡」，则在扣款成功（`ON_SUCCESS`）时把卡存入 Vault，返回 Vault Token + Customer ID 供回头买家复用。

这是 v6 vault 家族的第 4 个 demo（已有：vault-paypal-with-purchase、vault-paypal-setup-only、vault-acdc-setup-only）。本 demo 补齐「ACDC + with-purchase」组合。

## 2. 用户明确约束（拍板项）

1. **UI 参考 v5 `vault-acdc-with-purchase`**：currency + amount 选择器、3DS 下拉**禁用**（固定 `SCA_WHEN_REQUIRED`，附「3DS 测试请去 ACDC demo」提示）、Name on Card 输入、save-card 复选框（默认勾选）、Vault Result 框（Vault Token + Customer ID）。
2. **create-order 参数与 v5 `vault-acdc-with-purchase` 逐字一致**（唯一差异：v6 返回 `{ orderId }` 小写 d，遵守规则 V6-1）。
3. **Card Fields 部分参考 v6 `acdc` demo**：同步 `createCardFieldsOneTimePaymentSession()`、`createCardFieldsComponent` + `appendChild`、`submit()` → `{ state, data }` 状态机、3DS decide+capture 逻辑。
4. **3DS 处理 = 忠实镜像 v5**（用户决策 2026-06-05）：SCA 下拉禁用、happy path 仅走免挑战；3DS decide+capture 代码保留作兜底，但不开放 SCA_ALWAYS 选择。

## 3. 业务流程（集成文档对应）

1. 买家在结账页输入卡号 / 有效期 / CVV / 持卡人姓名，勾选「保存卡」。
2. 点击 Pay Now → 前端 `createOrder()`（body 带 `saveCard`/`saveVault` 标志）→ 后端 `POST /v2/checkout/orders`，在 `payment_source.card.attributes` 写入 `vault.store_in_vault: ON_SUCCESS` + `customer.merchant_customer_id`。
3. 前端 `session.submit(orderId, { billingAddress })` 完成卡校验（+ 可能的 3DS）。
4. `state === 'succeeded'` → 读 `liabilityShift` 决策 → `POST /v2/checkout/orders/:id/capture`。
5. capture 响应 `payment_source.card.attributes.vault` 含 `id`（Vault Token）+ `customer.id`（Customer ID），扣款成功时 `status: VAULTED`；展示给买家（生产环境应存库供回头买家复用）。

## 4. 成功标准（DoD）

输入测试卡 `4012 0000 3333 0026`、勾选「保存卡」、点击 Pay Now → 页面显示 `✓ Payment captured · Order: <id>` 且 Vault Result 框显示非空 Vault Token + Customer ID。
- 未勾选「保存卡」→ 正常扣款成功，但**不**保存卡（无 Vault Token）。
- capture 非 `COMPLETED`（DECLINED/PENDING）→ 红色错误提示（规则 13）。
- `canceled` / `failed` / SDK 加载失败 → 对应红色提示，按钮恢复可点。

## 5. 范围控制（不做）

- 不开放 SCA_ALWAYS（镜像 v5，3DS 测试引导到 ACDC demo）。
- 不实现「回头买家用已存卡支付」（那是 vault-return 的范畴）。
- 不把 Vault Token 落库（demo 仅展示）。
- 不订阅 `VAULT.PAYMENT-TOKEN.CREATED` webhook（`APPROVED` 异步保存场景超出 demo 范围；happy path 用 `ON_SUCCESS` 同步返回 `VAULTED`）。
- 不改 `config/constants.js`（vault 串 inline 在路由内，与 v5 一致）。

## 6. 参考

- 集成文档：Save cards with purchase with the JavaScript SDK（用户提供）
- v6 SDK：`web-sdk/v6/core`，Card Fields 章节（`createCardFieldsOneTimePaymentSession` / `createCardFieldsComponent` / `submit`）
- 既有实现：v5 `vault-acdc-with-purchase`、v6 `acdc`、v6 `vault-acdc-setup-only`
- 规则：`src/routes/paypal/jssdk-v6/CLAUDE.md`（V6-1..10、V6-ACDC-1..6、V6-VAULT-1..6）
