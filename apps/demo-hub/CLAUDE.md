# CLAUDE.md — demo-hub

> 派生自根目录 `CLAUDE.md`，聚焦 demo-hub app。根 CLAUDE.md 的所有通用规则在此同样适用。

## 核心开发原则（Karpathy）

**1. 先思考，再编码（Think Before Coding）**
不做无声假设，不掩盖困惑。需求存在多种解读时，列出来让用户确认，而不是随机选一种就跑。

**2. 简单优先（Simplicity First）**
不写没人要求的抽象层，50 行能解决的问题不写 200 行。避免过度设计。

**3. 精准修改（Surgical Changes）**
只碰需要改的地方，每一行 diff 都要能追溯到用户的具体需求。不"顺手"优化不相关的代码，不重构没坏的东西，不动没被要求改的文件。

**4. 目标驱动执行（Goal-Driven Execution）**
开始写代码之前，先定义"完成"长什么样。要有可验证的成功标准，而不是模糊地开工。

---

## App 定位

demo-hub 是支付产品集成演示中心，以最简洁的方式展示各支付提供商（PayPal、Braintree、Stripe、Adyen）的不同产品如何集成。面向技术开发者（主）、业务决策者（辅）、内部销售同事（辅）。

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Node.js |
| Web 框架 | Express.js |
| 模板引擎 | EJS |
| 前端 | Vanilla JS（无框架） |
| 数据库 | Supabase（产品展示配置） |
| 样式 | 原生 CSS |

## 目录结构

```
apps/demo-hub/
├── CLAUDE.md                    # 本文件
├── DESIGN.md                    # UI/UX 设计系统（由 /design-consultation 生成）
├── docs/
│   ├── req/                     # 需求文档
│   │   ├── 2026-05-15-req-demo-hub.md
│   │   └── 2026-05-15-req-jssdk-v5.md
│   ├── design/                  # 设计文档（fe/be/db 分开）
│   │   └── 2026-05-15-design-be-routing.md
│   ├── plans/                   # 实现计划
│   │   └── 2026-05-15-plan-jssdk-v5-v1.md
│   ├── todos.md                 # 任务清单
│   ├── context.md               # App 目标与关键决策
│   ├── progress.md              # 进度日志
│   ├── debug-log.md             # 错误记录
│   └── test-cases.md            # 测试用例
├── src/
│   ├── app.js                   # Express 入口，启动时从 Supabase 加载产品配置
│   ├── config/
│   │   ├── products.js          # 内存 Map（启动时从 Supabase 填充）
│   │   └── paypal.js            # Access token helper（CN + US，8h TTL 缓存）
│   ├── routes/
│   │   ├── index.js             # GET / → 首页产品目录
│   │   └── paypal/
│   │       └── jssdk-v5/
│   │           ├── _factory.js  # createStandardRoute + createVaultWithPurchaseRoute
│   │           ├── spb-ecm.js   # 工厂路由示例
│   │           ├── buttons.js   # 自定义（双 SDK：CN + US）
│   │           └── ...          # 其余 12 个产品路由
│   ├── views/
│   │   ├── partials/
│   │   │   ├── header.ejs       # HTML head + topbar + sidebar open
│   │   │   ├── footer.ejs       # 关闭 sidebar + body + html
│   │   │   └── sidebar.ejs      # 左侧产品列表
│   │   ├── index.ejs            # 首页产品目录（动态渲染）
│   │   └── paypal/
│   │       └── jssdk-v5/        # 每产品独立 EJS 文件
│   └── public/
│       ├── css/
│       └── js/
├── .env                         # 本地环境变量（不提交 git）
├── .env.example
└── package.json
```

## 路由规范

**三层路由结构（所有 provider 统一）：`/{provider}/{sdk_version}/{product_key}`**

每个支付产品必须有独立路由文件，文件路径与 URL 完全对应，不允许跨产品共用。

```
GET /                                           → 首页（动态渲染）
GET /paypal/jssdk-v5/spb-ecm
GET /paypal/jssdk-v5/spb-ecs
GET /paypal/jssdk-v5/buttons                    # 双 SDK（CN + US）
GET /paypal/jssdk-v5/acdc
GET /paypal/jssdk-v5/applepay-ecm
GET /paypal/jssdk-v5/vault-paypal-with-purchase
GET /paypal/jssdk-v5/vault-paypal-setup-only
GET /paypal/jssdk-v5/vault-return
...（共 14 个 JSSDK v5 demo）
GET /braintree/web-sdk/dropin-ui
GET /braintree/web-sdk/hosted-fields
GET /braintree/graphql/<product>                # 预留
GET /stripe/stripe-js/<product>                 # 预留
GET /adyen/web-components/<product>             # 预留

POST /paypal/jssdk-v5/api/spb-ecm/create-order
POST /paypal/jssdk-v5/api/spb-ecm/capture-order
... 每个产品有对应的后端 API 路由
```

**命名规范：** provider 小写无连字符 / sdk_version + product_key 均为 kebab-case

**Vault 命名规范：**
- `-with-purchase`：首次购买同时完成 Vault 签约
- `-setup-only`：纯 Vault 签约，无购买（setup token）
- `-return`：已签约回头买家体验

## 路由工厂模式

大多数标准产品路由通过工厂函数创建，避免重复代码。

### `buildBody(amount, currency)` — 推荐模式

产品路由文件中提供 `buildBody` 函数，完整 order body 在**一个文件**里定义，可以直接 `require` 整个 constants 文件引用常量：

```js
// spb-ecm.js（推荐写法）
const C = require('../../../config/constants')  // 整个文件引入

module.exports = createStandardRoute({
  productKey: 'spb-ecm',
  sdkParams:  'components=buttons&...',
  view:       'paypal/jssdk-v5/spb-ecm',

  buildBody: function (amount, currency) {
    // 完整 body 在这里定义，amount + currency 由工厂注入
    // 用 C.xxx 引用任何常量
    return {
      intent: C.INTENT.CAPTURE,
      purchase_units: [{
        amount: { currency_code: currency, value: amount, ... },
        description: C.DEMO_DESCRIPTION,
        items: [{ ...C.DEMO_ITEM, unit_amount: { currency_code: currency, value: amount } }],
        shipping: C.SANDBOX_SHIPPING,
        // 加任何产品专属字段：reference_id, invoice_id, custom_id, payment_source 等
      }]
    }
  },
})
```

**好处**：产品的所有 API 参数只在一个文件——改参数只改路由文件，无需动 `_factory.js`。

### 降级模式（`orderBody`）— 向后兼容

不提供 `buildBody` 时，工厂自动调用 `buildOrderBody(amount, { currency, topLevel: orderBody })`：

```js
// 简单产品，不需要自定义 body 结构
module.exports = createStandardRoute({
  productKey: 'spb-ecs',
  sdkParams:  'components=buttons&...',
  view:       'paypal/jssdk-v5/spb-ecs',
  // 不写 buildBody → 自动用 buildOrderBody 生成标准 body
})
```

### 工厂函数汇总

```js
createStandardRoute({ productKey, sdkParams, view, buildBody?, orderBody?, extraScripts? })
  // buildBody 优先；无 buildBody 时用 orderBody 降级

createVaultWithPurchaseRoute({ productKey, sdkParams, view, buildBody?, paymentSource })
  // buildBody 优先；无 buildBody 时用 paymentSource

// 需要完全自定义实现的路由：
// buttons.js            — 双 SDK（CN + US）
// acdc.js               — CardFields SDK
// googlepay-ecm.js      — 双外部 SDK（PayPal + Google Pay）；需传 sandboxShipping + sandboxPhone 给 EJS；emailRequired:true（从 sheet 获取）；phone 用 SANDBOX_PHONE 预填；流程：sheet→email→createOrder→processPayment；3DS 通过 GET order details 解析；#custom-googlepay-btn 复用同一点击流程
// googlepay-ecs.js      — 双外部 SDK；shippingAddressRequired:true + emailRequired:true + phoneNumberRequired:true + shippingOptionRequired:true；SHIPPING_OPTIONS 数组（Standard $5 / Express $10）；Full Callback 模式（paymentDataCallbacks: { onPaymentAuthorized, onPaymentDataChanged }；callbackIntents:['SHIPPING_ADDRESS','SHIPPING_OPTION','PAYMENT_AUTHORIZATION']）；onPaymentAuthorized：用户授权后 Google Pay 调用，createOrder 在此回调内执行，返回 Promise<{transactionState}>；onPaymentDataChanged：INITIALIZE/SHIPPING_ADDRESS→返回 newTransactionInfo+newShippingOptionParameters，SHIPPING_OPTION→仅返回 newTransactionInfo；parsePhoneNumber(E.164, isoCountry)→{country_code,national_number}；buyerName/email/parsedPhone/shippingAmount 注入 create-order；total = item + shippingAmount
// applepay-ecm.js       — 自定义路由；GET 传 sandboxShipping 给 EJS；create-order 含 payment_source.apple_pay.experience_context（return_url/cancel_url；token 由 confirmOrder 注入）；capture-order 标准；extraScripts 加载 `https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js`
// applepay-ecs.js       — 自定义路由；ECS 流程；GET 无 sandboxShipping（买家在 sheet 选）；create-order 接收 shippingContact + shippingAmount；payment_source.apple_pay 含 name/email_address/phone_number（national_number only，无 country_code）/experience_context；normalizeContact() 剥离非数字；total = item + shippingAmount
// vault-paypal-with-purchase.js — 完整自定义路由；GET 调 fetchIdToken() 获取 id_token 注入 data-user-id-token；payment_source 在顶层（含 permit_multiple_payment_tokens/description/attributes.customer.merchant_customer_id/experience_context.brand_name/shipping_preference）；capture 返回 vaultId + customerId
// vault-acdc-with-purchase.js — 完整自定义路由；saveVault=true 时 attributes 加 vault.store_in_vault:ON_SUCCESS + customer.merchant_customer_id（随机 CUST_ 前缀，randomBytes(6)）；3DS select disabled（沙盒限制）；测试卡 4012 0000 3333 0026
// vault-acdc-setup-only.js  — 完整自定义路由；/v3/vault/setup-tokens；顶层 customer.merchant_customer_id（随机）+ payment_source.card.billing_address + experience_context.return/cancel_url + verification_method（直接挂 card 下）；onApprove：liabilityShift 'YES'|'POSSIBLE' → confirm；否则 GET setup-token → token.status=APPROVED && verification_status=VERIFIED → confirm；GET /api/vault-acdc-setup-only/setup-token/:id 端点；confirm 返回 paymentTokenId + customerId
// vault-applepay-with-purchase.js — 完整自定义路由；虚拟产品（purchase_unit 无 shipping）；SDK URL 硬编码 `currency=USD&vault=true`；payment_source.apple_pay 含 experience_context（return/cancel_url）+ stored_credential（CUSTOMER/RECURRING/`usage:FIRST`）+ attributes.vault.store_in_vault:ON_SUCCESS；capture 提取 payment_source.apple_pay.attributes.vault：{id→vaultId, customer.id→customerId, status→vaultStatus}；返回 { ...data, vaultId, customerId, vaultStatus }；前端：硬编码 TRIAL_AMOUNT="25.00" / REGULAR_AMOUNT="40.00" / CURRENCY="USD"；requiredShippingContactFields:['email']；paymentRequest 含 recurringPaymentRequest（trial 7天$25 + regular 每7天$40，billingAgreement/managementURL）+ lineItems（paymentTiming:recurring）+ total（含 recurring 字段）；recurringPaymentIntervalUnit:"day"（Apple Pay 无 "week"）；ApplePaySession(4, paymentRequest)；button type "subscribe"
// vault-paypal-setup-only.js — /v3/vault/setup-tokens API（PayPal 按钮方式）
// vault-return.js       — 自定义；GET payment-tokens 按钮触发；PayPal → SDK Buttons（fundingSource:PAYPAL，payment_source.paypal.experience_context 无 vault_id，SDK 通过 data-user-id-token 识别回头买家）；card → Pay Now（vault_id）；apple_pay → 禁用（Apple 指南限制）；PayPal-Request-Id 头；shipping:SANDBOX_SHIPPING；**SDK URL 必须含 commit=true&buyer-country=US，否则弹出登录 popup**
// plm-div.js            — 工厂路由；sdkParams:"components=messages"；EJS 国家选择器（US/AU/DE/ES/FR/IT/GB/CA）；服务端 COUNTRY_TO_CUR 映射；优先读 ?country param（保留 ES/FR/IT 选择）；`data-pp-buyercountry` 注入每个 message div；3 text + 2 flex 布局；无按钮；max-width:680px
// plm-js.js             — 工厂路由；同 plm-div 国家选择；JS API 方式：`paypalSDK.Messages({amount, placement, buyerCountry, style, onRender, onClick, onApply}).render('#plm-js-container')`；金额变化重新调 Messages()；Event Log 面板；Current Config 展示
```

## Supabase 产品配置

demo-hub 与 admin-console 通过 Supabase `demohub.products` 表交互：

**表结构关键字段：** `provider`, `sdk_version`, `product_key`, `display_name`, `description`, `enabled`, `sort_order`

```
启动时：
  SELECT * FROM demohub.products ORDER BY provider, sort_order
  → 存入内存 Map：
    key = 'paypal/jssdk-v5/spb-ecm'   (provider/sdk_version/product_key)
    value = { displayName, description, enabled, sortOrder, ... }

首页渲染：
  读内存 Map → 只展示 enabled=true 的产品，按 provider → sdk_version → sort_order 分组

产品页标题：
  getProduct('paypal', 'jssdk-v5', 'spb-ecm') → display_name（找不到则 fallback product_key）
```

**Access token 缓存：** `config/paypal.js` 中 CN 和 US 账户的 token 各自缓存 8 小时，避免每次 API 调用重新获取。

**配置变更后需重启 demo-hub 生效。**

## 页面设计原则

- **极简沙盒风格**：只有支付 widget + 测试金额，无电商 UI 元素
- **EJS 布局**：每个产品视图 include `partials/header.ejs`（开头）和 `partials/footer.ejs`（结尾），中间写正常 HTML/JS，不使用 `layout.ejs` 模式
- **Tab 结构预留**：`[ Demo ] [ Code ] [ Logs ]`，现阶段只激活 Demo Tab（在 header.ejs 中定义）
- 页面标题来自 Supabase `display_name` 字段

## 回复规范

每次完成任务后，必须列出本次改动涉及的所有文件：

```
改动文件：
- path/to/file1.js
- path/to/file2.ejs
```

---

## 关键开发规则

1. 每个路由文件只处理一个产品，不跨产品共用逻辑
2. 凭证/密钥从 `.env` 环境变量读取，绝不 hardcode
3. EJS 视图结构：`<%- include('../partials/header', vars) %>` + HTML + `<%- include('../partials/footer') %>`
4. **EJS/JS 分离模式**（重要）：EJS 只负责 HTML 结构和配置注入，所有 SDK 逻辑放静态 JS 文件
5. `product_key` 与路由 slug 完全对应（`/paypal/jssdk-v5/spb-ecm` → `product_key: 'spb-ecm'`）
6. 新增产品：写路由代码 → 在 Supabase 插入行（含 sdk_version） → 重启 app
7. Access token 由 `config/paypal.js` 的 `getCNToken()` / `getUSToken()` 统一管理，8h 缓存
7a. 工厂 GET handler 透传 `country: req.query.country || ''` 给所有 EJS（非破坏性，普通产品忽略；PLM demo 用此区分同属 EUR 的 DE/ES/FR/IT）
8. **API 常量引入方式**：路由文件用 `const C = require('../../../config/constants')` 整个引入，用 `C.INTENT`、`C.SANDBOX_SHIPPING` 等，不逐个解构
9. **Order body 规范**：所有工厂路由产品（`createStandardRoute` / `createVaultWithPurchaseRoute`）**必须**提供 `buildBody(amount, currency)` 函数；自定义路由（buttons/acdc/googlepay-ecm/vault-setup-only/vault-return）直接在 POST handler 里控制 body
10. **金额动态传递**：前端从 `#demo-amount` 读值 → fetch body `{ amount, currency }` → 后端 `req.body.amount` / `req.body.currency`
11. **币种选择**：`#demo-currency` 下拉框切换时刷新页面（`?currency=EUR&amount=xxx`）；服务端读 `req.query.currency` 并注入 SDK URL；零小数位货币（JPY/KRW/TWD/CLP/IDR）金额自动取整
12. **币种校验**：后端用 `SUPPORTED_CURRENCIES` 白名单校验，无效则 fallback 到 `DEFAULT_CURRENCY`
13. **Capture 成功判断**：capture order API 返回后，必须检查 `purchase_units[0].payments.captures[0].status === 'COMPLETED'` 才算成功扣款。不能用 `order.status`（订单级状态，不代表扣款成功）也不能仅靠 `order.error` 缺失来判断。非 COMPLETED 状态（如 DECLINED、PENDING）必须显示错误。
    ```js
    var capture = order.purchase_units &&
                  order.purchase_units[0] &&
                  order.purchase_units[0].payments &&
                  order.purchase_units[0].payments.captures &&
                  order.purchase_units[0].payments.captures[0]
    if (!capture || capture.status !== 'COMPLETED') {
      showResult('✗ Capture failed · status: ' + (capture ? capture.status : 'unknown'), 'error')
      return
    }
    ```
14. **Google Pay ECM 用 Promise 模式，ECS 用 Full Callback 模式**：

    **ECM — Promise 模式**（当前 ECM 实现，无任何 callbacks）：
    - 不传 `paymentDataCallbacks`，不设 `callbackIntents`
    - 代码：`loadPaymentData(req).then(function(paymentData) { createOrder → processPayment })`
    - 用户授权后 sheet 自动关闭，Promise resolve，屏幕干净，3DS 窗口可正常弹出

    **ECS — Full Callback 模式**（当前 ECS 实现，因 `onPaymentDataChanged` 需要）：
    - ECS 需要 `onPaymentDataChanged` 在 sheet 内动态更新运费，只要注册 `paymentDataCallbacks`，Google Pay 就强制进入 Full Callback 模式
    - `PaymentsClient` 传 `paymentDataCallbacks: { onPaymentAuthorized, onPaymentDataChanged }`
    - `callbackIntents: ['SHIPPING_ADDRESS', 'SHIPPING_OPTION', 'PAYMENT_AUTHORIZATION']`
    - 用户 tap Pay → Google Pay 调 `onPaymentAuthorized` → sheet 转为"处理中"转圈状态 → createOrder 在此回调内执行 → 3DS popup 在 sheet 处理中状态下弹出（可正常交互）
    - `onPaymentAuthorized` 必须返回 `Promise<{ transactionState: 'SUCCESS' | 'ERROR' }>`，只能 resolve（失败用 ERROR，不能 reject）

    **Google Pay API 强制规则（违反 → OR_BIBED_06）：**
    - 只要构造 `PaymentsClient` 时传入 `paymentDataCallbacks`（哪怕只有 `onPaymentDataChanged`），`callbackIntents` **必须**包含 `'PAYMENT_AUTHORIZATION'`，且**必须**提供 `onPaymentAuthorized` → 否则 OR_BIBED_06
    - `'SHIPPING_ADDRESS'` 必须在 `callbackIntents` 里才能触发 `INITIALIZE` 回调（sheet 打开时立即调用，展示初始运费选项）
    - `shippingOptions` 对象只允许 `{id, label, description}`，不能含 `price`、`selected` 等额外字段
    - `onPaymentDataChanged` 返回规则：INITIALIZE/SHIPPING_ADDRESS → 同时返回 `newTransactionInfo` + `newShippingOptionParameters`；SHIPPING_OPTION → 只返回 `newTransactionInfo`（不传 `newShippingOptionParameters`）
    - 初始请求 `totalPriceStatus: 'ESTIMATED'`（总价会变化），`onPaymentDataChanged` 回调里用 `'FINAL'`（运费已选定，总价确定）

15. **Google Pay 3DS 路径**（与 ACDC 不同，ECM 和 ECS 相同）：Google Pay 无前端 `liabilityShift`，`confirmOrder` 返回 `PAYER_ACTION_REQUIRED` 时需 `initiatePayerAction` → **GET order details** → 从 `payment_source.google_pay.card.authentication_result`（比 ACDC 多一层 `google_pay`）读取 `liability_shift`、`three_d_secure.enrollment_status`、`three_d_secure.authentication_status`，再决定 capture 还是 reject：
    - `liability_shift === 'POSSIBLE'` → capture
    - `liability_shift === 'NO'` + enrollment in `['N','U','B']` → capture（未入会）
    - `liability_shift === 'NO'` + 其他 enrollment → reject
    - `liability_shift === 'UNKNOWN'` → reject（提示重试）

16. **Google Pay ECS 电话格式转换**：Google Pay 返回 E.164（`+14155552671`），PayPal `payment_source.google_pay.phone_number` 需要 `{ country_code: '1', national_number: '4155552671' }`。转换方式：strip 非数字 → 用 `COUNTRY_DIAL[shippingAddress.countryCode]`（ISO→拨号代码）找 dialCode → 若 digits 以 dialCode 开头则剥离，剩余为 `national_number`。`COUNTRY_DIAL` 覆盖所有支持货币对应国家。

18. **Apple Pay 流程关键规则**：
    - **ECM `create-order` 含 `payment_source.apple_pay.experience_context`（return_url/cancel_url）**；token 仍由 `confirmOrder` 注入，无需在 create-order 里指定 Apple Pay token
    - **ECS `create-order` 的 `payment_source.apple_pay`** 还额外包含从 `shippingContact` 提取的 `name`、`email_address`、`phone_number`（仅 `{ national_number: digits }`，无 `country_code`）
    - **create-order 在 `onpaymentauthorized` 内部执行**（与 Google Pay 不同，Google Pay 在 sheet 关闭后先 createOrder）；Apple Pay 的整个 createOrder→confirmOrder→capture 链都在 `onpaymentauthorized` 回调中
    - **必须始终调用 `session.completePayment()`**：无论成功还是失败，否则 Apple Pay sheet 卡住；成功用 `STATUS_SUCCESS`，失败用 `STATUS_FAILURE`
    - **`confirmOrder` 返回 `{ approveApplePayPayment: { status, ... } }`**；取 `confirmResult.approveApplePayPayment`，再检查 `.status === 'APPROVED'`
    - **3DS 由 Apple Pay 协议内部处理**（设备 + Touch ID/Face ID），无需 `initiatePayerAction` 或 GET order details
    - **ECM**: `requiredBillingContactFields: ['name','phone','email','postalAddress']`，无 shippingFields
    - **ECS**: 额外加 `requiredShippingContactFields: ['name','phone','email','postalAddress']`；`shippingMethods` 数组；`onshippingmethodselected` + `onshippingcontactselected`；`normalizeContact()` 剥离 phoneNumber 中非数字（E.164 含 `+` → 纯数字）
    - **Apple Pay `phone_number` 格式**：仅 `{ national_number: digits }`，无 `country_code`（与 Google Pay 不同，Google Pay 需要两个字段）

17. **Google Pay ECM vs ECS 的 phone 来源不同**：
    - ECM（`shippingAddressRequired: false`）：sheet 无地址区域，无法收电话 → 用 `demoParams.SANDBOX_PHONE`（商户预填）注入 `payment_source.google_pay.phone_number`
    - ECS（`shippingAddressRequired: true`）：sheet 收集地址 + 电话 → `paymentData.shippingAddress.phoneNumber` 经 `parsePhoneNumber()` 转换后注入

19. **Vault Return Buyer SDK 必须加 `commit=true`**：
    - PayPal 回头买家（`data-user-id-token`）若 SDK URL 缺少 `commit=true`，点击 PayPal 按钮会弹出完整登录 popup，而非一键确认（one-click）体验
    - 正确 SDK URL：`...&buyer-country=US&commit=true&components=buttons&currency=${currency}`
    - `create-order` 的 `payment_source` 只需 `{ paypal: { experience_context } }`，**不需要 vault_id**；SDK 通过 `data-user-id-token` 自动识别回头买家身份
    - `data-user-id-token` 由后端调 `POST /v1/oauth2/token?response_type=id_token&target_customer_id=<customerId>` 获取并注入 SDK script 标签

## EJS/JS 分离模式

**核心原则**：EJS 文件不写业务 JS，只注入配置到 `window.DEMO`，然后引入静态 JS 文件。

```
EJS 文件职责：
  1. HTML 结构（sandbox-card、amount-display 等）
  2. window.DEMO 配置注入（API URL、client ID 等）
  3. <script src="/js/..."> 引入静态 JS 文件

静态 JS 文件职责：
  1. PayPal SDK 初始化（Buttons、CardFields、Applepay 等）
  2. fetch 调用后端 API（create-order、capture-order 等）
  3. 结果展示（showResult('✓ ...', 'success')）
```

**EJS 注入示例：**
```html
<script>
  window.DEMO = {
    urls: {
      createOrder:  '/paypal/jssdk-v5/api/<product>/create-order',
      captureOrder: '/paypal/jssdk-v5/api/<product>/capture-order',
    }
  }
</script>
<script src="/js/paypal/jssdk-v5/spb.js"></script>
```

**静态 JS 文件位置与对应关系：**

| JS 文件 | 使用的产品 EJS |
|---------|--------------|
| `public/js/paypal/jssdk-v5/spb.js` | spb-ecm, spb-ecs |
| `public/js/paypal/jssdk-v5/vault-paypal-with-purchase.js` | vault-paypal-with-purchase（专属；capture 后显示 vaultId + customerId） |
| `public/js/paypal/jssdk-v5/acdc.js` | acdc |
| `public/js/paypal/jssdk-v5/vault-acdc-setup-only.js` | vault-acdc-setup-only（专属；`createVaultSetupToken` callback；onApprove 3DS 决策：`liabilityShift 'YES'|'POSSIBLE'` → 直接 confirm；否则 GET setup token → `token.status==='APPROVED' && verification_status==='VERIFIED'` → confirm；`doConfirm()` + `showVaultResult(paymentTokenId, customerId)`；console.group 分组打印三个字段；前缀 `[ACDC-Setup]`） |
| `public/js/paypal/jssdk-v5/vault-acdc-with-purchase.js` | vault-acdc-with-purchase（专属；含 `getVaultChecked()` + `showVaultResult()`；`saveVault` 条件 vault attrs；capture 后展示 vault 面板） |
| `public/js/paypal/jssdk-v5/buttons.js` | buttons（双 SDK：cnSdkUrl + usSdkUrl） |
| `public/js/paypal/jssdk-v5/vault-paypal-setup-only.js` | vault-paypal-setup-only |
| `public/js/paypal/jssdk-v5/vault-return.js` | vault-return |
| `public/js/paypal/jssdk-v5/applepay-ecm.js` | applepay-ecm（已实现；完整 ApplePaySession 流程；`confirmOrder` 响应 `{ approveApplePayPayment }` 解包后检查 `.status === 'APPROVED'`；3DS 由 Apple Pay 协议内部处理；ECM 无 shippingFields） |
| `public/js/paypal/jssdk-v5/applepay-ecs.js` | applepay-ecs（已实现；ECS 流程；`SHIPPING_METHODS` 数组；`onshippingmethodselected` + `onshippingcontactselected`；`normalizeContact()` 剥离非数字；createOrder 带 shippingContact + shippingAmount；`payment_source.apple_pay` 含 name/email/phone） |
| `public/js/paypal/jssdk-v5/googlepay-ecm.js` | googlepay-ecm（已实现；Promise 模式；`emailRequired:true`；流程：sheet 先开→获取 email→createOrder（email + SANDBOX_PHONE 注入 payment_source）→processPayment；singleton paymentsClient/googlepayConfig、handle3DS、doCapture；custom button 绑定 hover/press/click） |
| `public/js/paypal/jssdk-v5/googlepay-ecs.js` | googlepay-ecs（已实现；`shippingAddressRequired:true` + `emailRequired:true` + `phoneNumberRequired:true` + `shippingOptionRequired:true`；`SHIPPING_OPTIONS` 数组（Standard $5 / Express $10）；`chosenShipping` 模块状态；**Full Callback 模式**：`paymentDataCallbacks: { onPaymentAuthorized, onPaymentDataChanged }`，`callbackIntents: ['SHIPPING_ADDRESS', 'SHIPPING_OPTION', 'PAYMENT_AUTHORIZATION']`；`onPaymentAuthorized`：createOrder 在此回调内执行，返回 `Promise<{transactionState}>`；`onPaymentDataChanged`：INITIALIZE/SHIPPING_ADDRESS→`newTransactionInfo+newShippingOptionParameters`，SHIPPING_OPTION→仅 `newTransactionInfo`；`shippingOptions` 只含 `{id,label,description}`；`COUNTRY_DIAL` + `parsePhoneNumber()` 把 E.164 → `{ country_code, national_number }`；3DS 路径与 ECM 相同） |
| `public/js/paypal/jssdk-v5/vault-applepay-with-purchase.js` | vault-applepay-with-purchase（专属；虚拟产品 Apple Pay 流程 + vault；硬编码 `TRIAL_AMOUNT="25.00"` / `REGULAR_AMOUNT="40.00"` / `CURRENCY="USD"`；`requiredShippingContactFields:['email']`（email only，无 shipping address）；`stored_credential` 含 `usage:FIRST`；paymentRequest 含 `recurringPaymentRequest`（trial 7天$25 + regular 每7天$40，`billingAgreement`/`managementURL`）+ `lineItems`（`paymentTiming:recurring`）+ `total`（含 recurring 字段，Apple Pay sheet 展示订阅信息）；`recurringPaymentIntervalUnit:"day"`（Apple Pay 无 "week"）；`ApplePaySession(4, paymentRequest)`；button type `"subscribe"`；`showVaultResult(vaultId, customerId, vaultStatus)`；console.log 前缀 `[Apple Pay Vault]`） |
| `public/js/paypal/jssdk-v5/plm-div.js` | plm-div（`updateAllMessages()`：`querySelectorAll("[data-pp-message]")` → `setAttribute("data-pp-amount", val)`，SDK MutationObserver 自动重渲染；`COUNTRY_TO_CUR` 映射（US→USD / AU→AUD / DE/ES/FR/IT→EUR / GB→GBP / CA→CAD）；`#demo-country` change：带 `?country=XX&currency=YYY` 刷新；零小数位格式化） |
| `public/js/paypal/jssdk-v5/plm-js.js` | plm-js（`renderMessages(amount)`：调 `paypalSDK.Messages({ amount, placement, buyerCountry, style, onRender, onClick, onApply }).render('#plm-js-container')`；金额变化重新调 `renderMessages()`（非 setAttribute）；`logEvent()` 写 `#plm-event-log`（最多 30 条，最新在顶）；`updateConfigDisplay()` 更新 `#plm-js-config`；Clear 按钮重置日志；同 plm-div 的国家切换逻辑） |

**新增 JS 文件时的规范：**
- 用 IIFE 包裹（`(function() { 'use strict'; ... })()`）
- 从 `window.DEMO.urls` 读取 API 端点
- 导出函数用于复用（如 `showResult`、`clearLoading`）
- 不写 ES6 模块语法，保持浏览器直接运行兼容

## 开发命令

```bash
# 在 apps/demo-hub/ 目录下
npm install        # 安装依赖（首次）
npm run dev        # 独立运行，http://localhost:3000

# 或在根目录
npm run dev:demo-hub
```

nodemon 监听文件变更自动重启。修改路由/视图后终端会显示重启信息。

## 新增支付产品 Demo 完整步骤

### 1. 创建路由文件

**`buildBody` 模式（推荐，所有 API 参数在一个文件）：**
```js
// src/routes/<provider>/<sdk>/<product>.js
const { createStandardRoute } = require('./_factory')
const C = require('../../../config/constants')  // 整个引入

module.exports = createStandardRoute({
  productKey: '<product>',
  sdkParams:  'components=buttons',
  view:       '<provider>/<sdk>/<product>',

  buildBody: function (amount, currency) {
    // 完整 body 在这里，amount + currency 由工厂动态注入
    return {
      intent: C.INTENT.CAPTURE,
      purchase_units: [{
        amount: { currency_code: currency, value: amount, breakdown: { item_total: { currency_code: currency, value: amount } } },
        description: C.DEMO_DESCRIPTION,
        items: [{ ...C.DEMO_ITEM, unit_amount: { currency_code: currency, value: amount } }],
        shipping: C.SANDBOX_SHIPPING,
        // 加任何产品专属字段
      }]
    }
  },
})
```

**所有工厂路由产品必须使用 `buildBody`，包括"简单"产品。** 这样所有 API 参数都在路由文件一处，方便调试和日志查看：
```js
// 即使是最简单的产品，也用 buildBody 而非省略
module.exports = createStandardRoute({
  productKey: 'spb-ecs',
  sdkParams:  'components=buttons',
  view:       'paypal/jssdk-v5/spb-ecs',
  buildBody: function (amount, currency) {
    return {
      intent: demoParams.INTENT.CAPTURE,
      purchase_units: [{ ... }]
    }
  }
})
```

**Vault with-purchase（带购买的 Vault）：**

`vault-paypal-with-purchase` 已改为**完整自定义路由**（不再用工厂）：GET 获取 id_token → 注入 `data-user-id-token`；create-order 的 `payment_source` 在**顶层**（含 vault 完整参数）；capture 返回 `vaultId` + `customerId`。

其余 vault-with-purchase 产品仍可用工厂：
```js
const { createVaultWithPurchaseRoute } = require('./_factory')
module.exports = createVaultWithPurchaseRoute({
  productKey: 'vault-acdc-with-purchase',
  sdkParams:  'components=card-fields&vault=true',
  view:       'paypal/jssdk-v5/vault-acdc-with-purchase',
  paymentSource: { card: { attributes: { vault: { store_in_vault: 'ON_SUCCESS' } } } }
})
```

**自定义路由**（CardFields、双SDK、Google Pay、Vault Setup-only、Return Buyer）：参考 `acdc.js`、`buttons.js`、`googlepay-ecm.js`、`vault-paypal-setup-only.js`、`vault-return.js`。

### 2. 创建（或复用）静态 JS 文件

先看是否能复用已有 JS 文件（参考上方"EJS/JS 分离模式"对应关系表）。

**如需新建 JS 文件**（`src/public/js/<provider>/<sdk>/<product>.js`）：
```js
;(function () {
  'use strict'

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  window.addEventListener('load', function () {
    if (typeof paypalSDK === 'undefined') {
      showResult('✗ PayPal SDK failed to load', 'error'); return
    }
    var container = document.getElementById('paypal-button-container')
    container.classList.remove('sdk-loading')
    container.innerHTML = ''

    var urls = window.DEMO && window.DEMO.urls

    paypalSDK.Buttons({
      createOrder: function () {
        return fetch(urls.createOrder, { method: 'POST' })
          .then(function (r) { return r.json() }).then(function (d) { return d.id })
      },
      onApprove: function (data) {
        return fetch(urls.captureOrder, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderID: data.orderID })
        }).then(function (r) { return r.json() }).then(function (o) {
          showResult('✓ Captured: ' + o.id, 'success')
        })
      },
      onError: function (e) { showResult('✗ ' + (e.message || String(e)), 'error') }
    }).render('#paypal-button-container')
  })
})()
```

### 3. 创建 EJS 视图

在 `src/views/<provider>/<sdk>/<product>.ejs` 创建（**只写 HTML + window.DEMO 注入**）：
```ejs
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar, sdkUrl
}) %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-paypal">PayPal · JSSDK v5</span>
    <h1><%= title %></h1>
    <p>产品描述</p>
  </div>
  <div class="sandbox-card">
    <div class="amount-display">
      <div class="amount-label">Test Amount</div>
      <div class="amount-value">$1.00</div>
      <span class="sandbox-mode-badge">⚡ Sandbox Mode</span>
    </div>
    <div id="paypal-button-container" class="sdk-loading">
      <div class="sdk-spinner"></div>
      <span>Loading PayPal...</span>
    </div>
    <div class="result-msg" id="result" role="alert" aria-live="polite"></div>
  </div>
</div>

<%# 注入 API 端点配置，然后引入静态 JS 文件 %>
<script>
  window.DEMO = {
    urls: {
      createOrder:  '/paypal/jssdk-v5/api/<product>/create-order',
      captureOrder: '/paypal/jssdk-v5/api/<product>/capture-order',
    }
  }
</script>
<script src="/js/paypal/jssdk-v5/<product-or-shared>.js"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

### 4. 挂载路由（`src/app.js`）

```js
// 在对应 SDK 块下加一行
app.use(v5, require('./routes/paypal/jssdk-v5/<product>'))
```

### 5. 插入 Supabase 数据

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('paypal', 'jssdk-v5', '<product>', '显示名称', '一句话描述', true, <排序号>);
```

### 6. 重启并验证

```bash
npm run dev        # 或在已启动的 nodemon 中输入 rs
```

打开 `http://localhost:3000` → 首页自动出现新产品卡片 → 点击进入 demo 页验证。

## 记忆恢复（Memory Compaction 后）

1. 读 `docs/context.md`
2. 读 `docs/todos.md`
3. 读 `docs/progress.md`
4. 读 `docs/debug-log.md`

## JSSDK v5 文件速查（调试用）

```
修改 SDK 加载参数  → src/routes/paypal/jssdk-v5/<product>.js 的 sdkParams
修改 PayPal API   → src/routes/paypal/jssdk-v5/_factory.js（工厂产品）
                    或 src/routes/paypal/jssdk-v5/<product>.js（自定义产品）
修改 SDK 行为     → src/public/js/paypal/jssdk-v5/<shared>.js
修改页面 HTML     → src/views/paypal/jssdk-v5/<product>.ejs
修改 UI 样式      → src/public/css/sandbox.css
```

完整文件映射（每个 demo 对应哪些文件）：
→ `docs/design/2026-05-18-design-be-jssdk-v5-file-map.md`

## 参考文档

- 需求：`docs/req/2026-05-15-req-demo-hub.md`
- JSSDK v5 产品：`docs/req/2026-05-15-req-jssdk-v5.md`
- 实现计划：`docs/plans/2026-05-15-plan-jssdk-v5-v1.md`
- 路由设计：`docs/design/2026-05-15-design-be-routing.md`
- 根项目指南：`../../CLAUDE.md`
