# 设计文档 — Braintree 后端架构（demo-hub）

**日期：** 2026-06-11  
**状态：** 架构设计完成，待实现  
**关联需求：** `docs/req/braintree/2026-06-11-req-braintree.md`

---

## 请求流程（所有产品通用）

```
1. GET /braintree/server-sdk/{product}
   后端：gateway.clientToken.generate()
   → 注入 window.DEMO = { clientToken, urls: { transaction: '...' } }
   → 渲染 EJS 页面

2. 前端：braintree.client.create({ authorization: clientToken })
   → 各产品组件初始化（dropin / hostedFields / paypal / venmo / applepay / googlepay）
   → 用户操作完成 → 生成 paymentMethodNonce

3. POST /braintree/server-sdk/api/{product}/transaction
   body: { nonce, amount, ...extra }
   后端：gateway.transaction.sale(buildTransaction(nonce, amount, extra))
   → 返回 { transactionId, status } 或 error
```

与 PayPal 对比：

| | PayPal | Braintree |
|--|--------|-----------|
| 前端凭证 | clientId（SDK URL 参数） | clientToken（后端生成，注入页面） |
| 前端操作产物 | orderID | paymentMethodNonce |
| 后端扣款 | capture order | transaction.sale |
| 金额确定时机 | create-order（服务端） | transaction.sale（服务端） |

---

## 目录结构

```
src/routes/braintree/
├── CLAUDE.md
├── server-sdk/
│   ├── _config.js                   ← Braintree gateway 单例
│   ├── _factory.js                  ← 工厂函数
│   ├── dropin-ui.js
│   ├── hosted-fields.js
│   ├── paypal.js
│   ├── venmo.js
│   ├── applepay.js
│   ├── googlepay.js
│   ├── vault-card-setup-only.js
│   ├── vault-card-with-purchase.js
│   ├── vault-paypal-setup-only.js
│   └── vault-paypal-with-purchase.js
└── graphql/
    └── （同结构 10 个空文件，enabled: false）

src/views/braintree/
└── server-sdk/                      ← 10 个 EJS（同结构 graphql 占位）

src/public/js/braintree/
└── server-sdk/                      ← 10 个前端 JS
```

---

## `_config.js` — Gateway 单例

```js
const braintree = require('braintree')

const gateway = new braintree.BraintreeGateway({
  environment: braintree.Environment.Sandbox,
  merchantId:  process.env.BRAINTREE_MERCHANT_ID,
  publicKey:   process.env.BRAINTREE_PUBLIC_KEY,
  privateKey:  process.env.BRAINTREE_PRIVATE_KEY,
})

module.exports = { gateway }
```

---

## `_factory.js` — 工厂函数职责边界

**工厂管：**
- GET 路由：调 `gateway.clientToken.generate()` → 渲染 EJS
- POST 路由：接收 nonce + amount + extra → 调产品的 `buildTransaction` → `gateway.transaction.sale()` → 返回结果
- 成功判断：`result.success === true`（Braintree SDK 约定）
- 统一错误处理与返回格式

**每个产品文件管：**
- `buildTransaction(nonce, amount, extra)` — 完整 transaction body，只在产品文件里改
- EJS 需要的额外变量（如 applepay 需要传 `merchantId`）
- 产品特殊端点（vault 类产品有 customer 创建流程）

```js
// 工厂调用示例
module.exports = createBraintreeRoute({
  productKey: 'hosted-fields',
  view: 'braintree/server-sdk/hosted-fields',
  buildTransaction: function (nonce, amount, extra) {
    return {
      amount,
      paymentMethodNonce: nonce,
      options: { submitForSettlement: true },
    }
  },
})
```

---

## 3DS 设计

### Hosted Fields — 手动 verifyCard()

```
前端流程：
1. hostedFields.tokenize() → rawNonce
2. threeDSecure.verifyCard({ nonce: rawNonce, amount, ... }) → verifiedNonce + liabilityShift
3. POST transaction with verifiedNonce

liabilityShift 决策（参考 PayPal ACDC 规则）：
- 'YES' | 'POSSIBLE' → 直接 transaction
- 'NO' + enrollment N/U/B → transaction（未入会）
- 'NO' + 其他 → 拒绝
- 'UNKNOWN' → 提示重试
```

### Drop-in UI — 内置 3DS

Drop-in UI 通过 `threeDSecure` 配置项自动处理，无需手动调用 `verifyCard()`：

```js
braintree.dropin.create({
  authorization: clientToken,
  container: '#dropin-container',
  threeDSecure: { amount },   // 传金额，SDK 内部处理验证流程
})
```

---

## Vault 设计

Braintree vault 核心模型：**Customer（买家档案）→ PaymentMethod（支付方式）**

| product_key | 流程 |
|-------------|------|
| vault-card-setup-only | 前端 tokenize → 后端创建/查找 Customer → 保存 PaymentMethod → 返回 vault token + customer ID，不扣款 |
| vault-card-with-purchase | 前端 tokenize → 后端创建 Customer → sale（含 `options.storeInVaultOnSuccess: true`）→ 返回 transactionId + vault token |
| vault-paypal-setup-only | 同 card 路径，PayPal nonce |
| vault-paypal-with-purchase | 同 card 路径，PayPal nonce + sale |

> 具体参数（`storeInVault` vs `storeInVaultOnSuccess`，Customer 查找/创建策略）在实现阶段按实测调整，记 `docs/debug-log.md`。

---

## Supabase 数据

```sql
-- server-sdk 产品（enabled: true）
INSERT INTO demohub.products (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('braintree', 'server-sdk', 'dropin-ui',                'Drop-in UI',               'Pre-built payment UI with card, PayPal, Venmo, Apple Pay, Google Pay', true, 1),
  ('braintree', 'server-sdk', 'hosted-fields',            'Hosted Fields',            'Custom card UI with 3D Secure', true, 2),
  ('braintree', 'server-sdk', 'paypal',                   'PayPal',                   'PayPal checkout via Braintree', true, 3),
  ('braintree', 'server-sdk', 'venmo',                    'Venmo',                    'Venmo via Braintree (US only)', true, 4),
  ('braintree', 'server-sdk', 'applepay',                 'Apple Pay',                'Apple Pay via Braintree', true, 5),
  ('braintree', 'server-sdk', 'googlepay',                'Google Pay',               'Google Pay via Braintree', true, 6),
  ('braintree', 'server-sdk', 'vault-card-setup-only',    'Vault Card (Setup Only)',  'Save card to vault without charging', true, 7),
  ('braintree', 'server-sdk', 'vault-card-with-purchase', 'Vault Card (w/ Purchase)', 'Save card and charge in one step', true, 8),
  ('braintree', 'server-sdk', 'vault-paypal-setup-only',    'Vault PayPal (Setup Only)',  'Save PayPal to vault without charging', true, 9),
  ('braintree', 'server-sdk', 'vault-paypal-with-purchase', 'Vault PayPal (w/ Purchase)', 'Save PayPal and charge in one step', true, 10);

-- graphql 产品（enabled: false，占位）
INSERT INTO demohub.products (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('braintree', 'graphql', 'dropin-ui',                'Drop-in UI',               'Coming soon', false, 1),
  ('braintree', 'graphql', 'hosted-fields',            'Hosted Fields',            'Coming soon', false, 2),
  ('braintree', 'graphql', 'paypal',                   'PayPal',                   'Coming soon', false, 3),
  ('braintree', 'graphql', 'venmo',                    'Venmo',                    'Coming soon', false, 4),
  ('braintree', 'graphql', 'applepay',                 'Apple Pay',                'Coming soon', false, 5),
  ('braintree', 'graphql', 'googlepay',                'Google Pay',               'Coming soon', false, 6),
  ('braintree', 'graphql', 'vault-card-setup-only',    'Vault Card (Setup Only)',  'Coming soon', false, 7),
  ('braintree', 'graphql', 'vault-card-with-purchase', 'Vault Card (w/ Purchase)', 'Coming soon', false, 8),
  ('braintree', 'graphql', 'vault-paypal-setup-only',    'Vault PayPal (Setup Only)',  'Coming soon', false, 9),
  ('braintree', 'graphql', 'vault-paypal-with-purchase', 'Vault PayPal (w/ Purchase)', 'Coming soon', false, 10);
```

---

## 颜色登记（DESIGN.md）

Braintree 品牌色为深蓝 `#1F3F7A`，需在 `apps/demo-hub/DESIGN.md` 的「Provider Color Map」和「SDK 深浅色表」新增：

- Provider: `braintree` → `#1F3F7A`（深蓝）
- `server-sdk`：深色 + 浅色各一档（参考现有 PayPal / jssdk-v5 写法）
- `graphql`：同品牌色系，另一档深浅

---

## 待确认（实现阶段）

- [ ] Vault：`storeInVault` vs `storeInVaultOnSuccess` 具体参数（实测后定）
- [ ] Customer 查找策略：每次新建还是按 merchant_customer_id 复用？
- [ ] GraphQL API 版本与鉴权方式（第二阶段再议）
- [ ] ACH Direct Debit（TODO，账号开通后再做）
