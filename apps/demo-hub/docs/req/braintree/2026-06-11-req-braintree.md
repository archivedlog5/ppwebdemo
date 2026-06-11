# 需求文档 — Braintree Demo（demo-hub）

**日期：** 2026-06-11  
**状态：** 需求确认完成，待实现

---

## 背景

在 demo-hub 中新增 Braintree 支付产品演示，覆盖 Braintree 支持的主要支付方式，供技术开发者、业务决策者参考集成方案。

---

## SDK Version 命名决策

**以后端区分，不以前端区分。**

理由：Braintree 所有产品的前端都使用同一套 `braintree-web` CDN 加载，真正的差异在后端：

| sdk_version | 后端方案 | 状态 |
|-------------|---------|------|
| `server-sdk` | Node.js Server SDK（`braintree` npm 包，封装 REST API） | 第一阶段实现 |
| `graphql` | 直接调 Braintree GraphQL API | 占位，第二阶段 |

路由格式：`/braintree/{sdk_version}/{product_key}`

对比 PayPal（以前端 JS SDK 版本区分 v5/v6），Braintree 的分水岭在后端，命名逻辑不同。

---

## 产品清单

共 10 个产品，两个 sdk_version 结构相同，合计 20 个 demo。

| product_key | 说明 | 3DS | Vault |
|-------------|------|-----|-------|
| `dropin-ui` | Drop-in UI（全家桶：卡 + PayPal + Venmo + Apple Pay + Google Pay），含 3DS 选项 | ✅ | — |
| `hosted-fields` | 自定义卡 UI，含 3DS | ✅ | — |
| `paypal` | PayPal 按钮 via Braintree | — | — |
| `venmo` | Venmo via Braintree | — | — |
| `applepay` | Apple Pay via Braintree | — | — |
| `googlepay` | Google Pay via Braintree | — | — |
| `vault-card-setup-only` | 纯保存信用卡到 vault，不扣款 | — | ✅ |
| `vault-card-with-purchase` | 保存信用卡同时扣款 | — | ✅ |
| `vault-paypal-setup-only` | 纯保存 PayPal 账号到 vault，不扣款 | — | ✅ |
| `vault-paypal-with-purchase` | 保存 PayPal 账号同时扣款 | — | ✅ |

**ACH Direct Debit：** 暂 hold，留 TODO，后续视账号开通情况添加。

---

## 账号与环境

- 已有 Braintree sandbox 账号
- 以下功能已开通：信用卡、PayPal、Venmo、Apple Pay、Google Pay、3D Secure
- ACH 未开通，暂不做

环境变量（新增至 `.env`）：
```
BRAINTREE_MERCHANT_ID=
BRAINTREE_PUBLIC_KEY=
BRAINTREE_PRIVATE_KEY=
```

---

## 功能要求

### 所有产品通用
- 金额可在页面输入（`#demo-amount`）
- 结果展示区显示 transactionId + status
- capture 成功判断：`transaction.status === 'submitted_for_settlement'` 或 `'settled'`

### Drop-in UI（`dropin-ui`）
- 默认启用：卡、PayPal、Venmo、Apple Pay、Google Pay
- 提供 3DS 选项下拉（SCA_WHEN_REQUIRED / SCA_ALWAYS / 无）
- 3DS 由 Drop-in UI 内置配置（`threeDSecure` 参数传入），无需手动调用 `verifyCard()`

### Hosted Fields（`hosted-fields`）
- 自定义卡号 / 有效期 / CVV 输入域（`braintree-web` Hosted Fields 组件）
- 3DS 通过 `threeDSecure.verifyCard()` 手动触发（客户端）
- 3DS 选项下拉：SCA_WHEN_REQUIRED / SCA_ALWAYS / 无
- `liabilityShift` 决策逻辑（参考 PayPal ACDC）

### Vault（四个产品）
- Braintree vault 模型：Customer ID + PaymentMethod Token
- setup-only：创建 Customer → 保存 PaymentMethod → 展示 vault token + customer ID，不扣款
- with-purchase：创建 Customer → 保存 PaymentMethod → 立即扣款 → 展示 transactionId + vault token
- 具体参数（charge-after-save vs save-during-charge）在实现阶段按实测调整

### GraphQL 占位
- `graphql/` 目录下 10 个产品各放空路由，挂载到 app.js
- Supabase 对应行 `enabled: false`
- 待 server-sdk 全部完成后启动 graphql 实现

---

## 优先级

| 阶段 | 内容 |
|------|------|
| P1（第一批） | dropin-ui、hosted-fields（核心，Braintree 最具代表性） |
| P2 | paypal、venmo、applepay、googlepay |
| P3 | vault-card-setup-only、vault-card-with-purchase、vault-paypal-setup-only、vault-paypal-with-purchase |
| 占位 | graphql/ 全部（enabled: false） |
| TODO | ACH Direct Debit |
