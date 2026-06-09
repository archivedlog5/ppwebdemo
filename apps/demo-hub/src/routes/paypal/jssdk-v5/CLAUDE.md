# CLAUDE.md — PayPal JSSDK v5

> 通用规则见 `apps/demo-hub/CLAUDE.md`（所有路径均自动加载）。本文件只包含 JSSDK v5 专属规则。
>
> **Symlinks:** `src/public/js/paypal/jssdk-v5/CLAUDE.md` 和 `src/views/paypal/jssdk-v5/CLAUDE.md` 均指向本文件，编辑任何 v5 文件时都会自动加载。

## ⚠️ Opus 模型限制

**当前 model 为 Opus 时，只允许写 markdown，禁止写任何代码，禁止执行任何代码改动。**

- 允许：创建/编辑 `.md` 文件（需求、设计、计划、todo、进度等文档）
- 禁止：编写或修改任何代码文件（`.js`、`.ejs`、`.ts`、`.css`、`.json`、`.sql` 等）
- 禁止：执行任何代码生成、重构或 bug 修复的代码写入操作
- 需要写代码时：提示用户切换到非 Opus 模型（如 Sonnet）

---

## 核心开发原则（Karpathy）

**1. 先思考，再编码（Think Before Coding）**
不要默默地做假设，不要掩盖困惑。如果需求存在多种解读，应列出来让用户确认，而不是随机选一种就跑。

**2. 简单优先（Simplicity First）**
不写没人要求的抽象层，50行能解决的问题不写200行。避免过度设计。

**3. 精准修改（Surgical Changes）**
只碰需要改的地方，每一行diff都要能追溯到用户的具体需求。不去"顺手"优化不相关的代码，不重构没坏的东西，不动没被要求改的文件。

**4. 目标驱动执行（Goal-Driven Execution）**
在开始写代码之前，先定义"完成"长什么样。要有可验证的成功标准，而不是模糊地开工。

---

## 各产品 SDK Params 速查

| product_key | sdkParams / SDK URL 特殊参数 |
|-------------|------------------------------|
| spb-ecm | `components=buttons&currency=USD&enable-funding=paylater` |
| spb-ecs | `components=buttons&currency=USD&enable-funding=paylater` |
| buttons | 双 SDK：CN（`components=buttons&currency=USD`）+ US（`enable-funding=venmo,paylater`） |
| acdc | `components=card-fields&currency=USD` |
| applepay-ecm | `components=applepay&currency=USD` + Apple Pay CDN script |
| applepay-ecs | `components=applepay&currency=USD` + Apple Pay CDN script |
| googlepay-ecm | `components=googlepay&currency=USD` + Google Pay script |
| googlepay-ecs | `components=googlepay&currency=USD` + Google Pay script |
| vault-paypal-with-purchase | `components=buttons&vault=true&enable-funding=paylater&buyer-country=US` + id_token |
| vault-acdc-with-purchase | `components=card-fields&vault=true&currency=USD` |
| vault-applepay-with-purchase | 硬编码 `currency=USD&vault=true` + Apple Pay CDN |
| vault-paypal-setup-only | `components=buttons&vault=true&buyer-country=US` + id_token |
| vault-acdc-setup-only | `components=card-fields&vault=true` |
| vault-return | `components=buttons&commit=true&buyer-country=US` + id_token（**必须含 commit=true**） |
| plm-div | `components=messages` |
| plm-js | `components=messages` |
| fastlane-pui | `components=fastlane&buyer-country=US&currency=USD` + `data-sdk-client-token`（intent=sdk_init） |
| fastlane-fp  | `components=fastlane,three-domain-secure&buyer-country=US&currency=USD` + `data-sdk-client-token`（intent=sdk_init）— three-domain-secure 必须，ThreeDomainSecureClient 需要 |

---

## 各自定义路由关键实现备注

```
// buttons.js            — 双 SDK（CN + US）
// acdc.js               — CardFields SDK
// googlepay-ecm.js      — 双外部 SDK（PayPal + Google Pay）；需传 sandboxShipping + sandboxPhone 给 EJS；emailRequired:true（从 sheet 获取）；phone 用 SANDBOX_PHONE 预填；流程：sheet→email→createOrder→processPayment；3DS 通过 GET order details 解析；#custom-googlepay-btn 复用同一点击流程
// googlepay-ecs.js      — 双外部 SDK；shippingAddressRequired:true + emailRequired:true + phoneNumberRequired:true + shippingOptionRequired:true；SHIPPING_OPTIONS 数组（Standard $5 / Express $10）；Full Callback 模式（paymentDataCallbacks: { onPaymentAuthorized, onPaymentDataChanged }；callbackIntents:['SHIPPING_ADDRESS','SHIPPING_OPTION','PAYMENT_AUTHORIZATION']）；onPaymentAuthorized：用户授权后 Google Pay 调用，createOrder 在此回调内执行，返回 Promise<{transactionState}>；onPaymentDataChanged：INITIALIZE/SHIPPING_ADDRESS→返回 newTransactionInfo+newShippingOptionParameters，SHIPPING_OPTION→仅返回 newTransactionInfo；parsePhoneNumber(E.164, isoCountry)→{country_code,national_number}；buyerName/email/parsedPhone/shippingAmount 注入 create-order；total = item + shippingAmount
// applepay-ecm.js       — 自定义路由；GET 传 sandboxShipping 给 EJS；create-order 含 payment_source.apple_pay.experience_context（return_url/cancel_url；token 由 confirmOrder 注入）；capture-order 标准；extraScripts 加载 applepay.cdn-apple.com
// applepay-ecs.js       — 自定义路由；ECS 流程；GET 无 sandboxShipping（买家在 sheet 选）；create-order 接收 shippingContact + shippingAmount；payment_source.apple_pay 含 name/email_address/phone_number（national_number only，无 country_code）/experience_context；normalizeContact() 剥离非数字；total = item + shippingAmount
// vault-paypal-with-purchase.js — 完整自定义路由；GET 调 fetchIdToken() 注入 data-user-id-token；payment_source 在顶层（含 permit_multiple_payment_tokens/description/attributes.customer.merchant_customer_id/experience_context.brand_name/shipping_preference）；capture 返回 vaultId + customerId
// vault-acdc-with-purchase.js — 完整自定义路由；saveVault=true 时 attributes 加 vault.store_in_vault:ON_SUCCESS + customer.merchant_customer_id（随机 CUST_ 前缀）；3DS select disabled（沙盒限制）；测试卡 4012 0000 3333 0026
// vault-acdc-setup-only.js  — 完整自定义路由；/v3/vault/setup-tokens；顶层 customer.merchant_customer_id（随机）+ payment_source.card.billing_address + experience_context.return/cancel_url + verification_method（直接挂 card 下）；onApprove：liabilityShift 'YES'|'POSSIBLE' → confirm；否则 GET setup-token → token.status=APPROVED && verification_status=VERIFIED → confirm
// vault-applepay-with-purchase.js — 完整自定义路由；虚拟产品（无 shipping）；SDK URL 硬编码 currency=USD&vault=true；payment_source.apple_pay 含 stored_credential（CUSTOMER/RECURRING/usage:FIRST）+ attributes.vault.store_in_vault:ON_SUCCESS；button type "subscribe"；recurringPaymentIntervalUnit:"day"
// vault-paypal-setup-only.js — /v3/vault/setup-tokens API（PayPal 按钮方式）
// vault-return.js       — 自定义；PayPal → SDK Buttons（data-user-id-token 识别回头买家）；card → Pay Now（vault_id）；apple_pay → 禁用；PayPal-Request-Id 头；**SDK URL 必须含 commit=true&buyer-country=US，否则弹出登录 popup**
// plm-div.js            — 工厂路由；sdkParams:"components=messages"；国家选择器（US/AU/DE/ES/FR/IT/GB/CA）；优先读 ?country param；data-pp-buyercountry 注入每个 message div；max-width:680px
// plm-js.js             — 工厂路由；同 plm-div 国家选择；JS API：paypalSDK.Messages({amount,placement,buyerCountry,style,onRender,onClick,onApply}).render('#plm-js-container')；金额变化重新调 Messages()
// fastlane-pui.js       — Fastlane Quick Start（Payment UI 组件）；US 账户；client token 用 getUSClientToken({intent:'sdk_init'})，orders 用 getUSToken()；create-order body：payment_source.card.single_use_token + purchase_units（USD 锁定）；shipping camelCase→snake_case 映射（mapShipping）
//   前端 CSS 三态：fl-active（当前展开）/ fl-visited（已完成，显摘要+Edit）/ locked（无 class，dimmed）；三步始终在 DOM 中可见，不 display:none
//   Email 流程：lookupCustomerByEmail → member（triggerAuthenticationFlow OTP）或 guest
//   Member 路径：setShippingSummary(profileData.shippingAddress) + markVisited(stepShipping) 直接跳 Payment，不隐藏 Shipping
//   Guest 路径：setActive(stepShipping) 展开地址表单；checkbox #shipping-required-checkbox 控制 #shipping-address-fields 显隐（取消勾选→跳过字段校验直接 Continue）
//   Member edit 地址：showShippingAddressSelector → selectionChanged → setShippingSummary(newAddr) + setShippingAddress(newAddr)
//   Checkout 成功判定 captures[0].status==='COMPLETED'（规则 13）；提示格式 '✓ COMPLETED · Capture ID: <id>'；成功后 Checkout + 全部 Edit 按钮（email/shipping/payment）永久 disabled，整个表单锁定，刷新页面重试
// fastlane-fp.js        — Fastlane Flexible（FastlaneCardComponent，非 FastlanePaymentComponent）；US 账户；components=fastlane,three-domain-secure（ThreeDomainSecureClient 需要）；USD 锁定；四步表单（Customer/Shipping/Billing/Payment）
//   Billing 步（Flexible 新增）：自建 billing- 前缀表单；member-有卡时 #step-billing[hidden] 整步隐藏；getPaymentToken({ billingAddress }) 传 flat 地址对象
//   member-有卡路径：Shipping visited（profile 地址）→ Billing hidden → Payment 显 renderSelectedCard + watermark；payment-edit → showCardSelector 换卡
//   member-无卡路径：Shipping visited → Billing active（填账单）→ Payment（渲染卡组件）
//   guest 路径：Shipping active → Billing active → Payment（渲染卡组件）
//   3DS Flow 下拉三选项（none 为默认）：none = 直接下单不强制 3DS；jssdk = ThreeDomainSecureClient SCA_ALWAYS；api = 服务端注入 SCA_ALWAYS + experience_context 全页跳转
//   None flow：直接 createAndJudge，不走任何 3DS，方便普通卡日常测试
//   JSSDK 3DS：window.paypal.ThreeDomainSecureClient.isEligible(params) → show() → authenticationState='succeeded' + liabilityShift='POSSIBLE' → paymentToken.id = results.nonce → create-order → judgeInline（规则 13）；not eligible → 直接 create-order
//   API 3DS：create-order body 加 card.attributes.verification.method=SCA_ALWAYS + card.experience_context.return_url/cancel_url（动态 origin）；前端判 PAYER_ACTION_REQUIRED → window.location.href = payer-action href → GET /fastlane-fp/return 服务端 capture → 渲染 fastlane-fp-return.ejs（success/cancelled/error 三态 + 完整 order JSON）
//   ⚠️ PayPal card 3DS 回调参数为 state/code/liability_shift，不含 orderId（与 Buttons ?token= 不同）
//   解法：create-order 前生成 sessionKey，嵌入 return_url?session=<key>；PayPal 原样回传；return handler 从模块级 threeDSSessionStore Map 反查 orderId，单次使用后 delete，10分钟自动过期
//   member-有卡 Payment 步：setActive(stepPayment) 后紧接 markVisited(stepPayment)，CSS 加 .fl-step.fl-active.fl-visited .fl-step__edit 规则，使 Edit 按钮在展开状态下仍可见（触发 showCardSelector 换卡）
//   D1（用户拍板）：return 页简单 POST capture；刷新显 ORDER_ALREADY_CAPTURED 为预期行为，不修
//   D2：mapShipping 复制到本文件（不动 pui.js，不抽公共文件，规则 1）
//   D3：辅助函数（formatPhone/getAddressSummary/validateFields/setActive/markVisited 等）复制到 fastlane-fp.js（产品自包含）
//   全程 inspect/probe console.log：Fastlane init / lookupCustomerByEmail / triggerAuthenticationFlow / FastlaneCardComponent / getPaymentToken / showShippingAddressSelector / showCardSelector / isEligible / show() / create-order 响应 / return capture 响应
```

---

## 文件速查（v5 调试）

```
修改 SDK 加载参数  → src/routes/paypal/jssdk-v5/<product>.js 的 sdkParams
修改 PayPal API   → src/routes/paypal/jssdk-v5/_factory.js（工厂产品）
                    或 src/routes/paypal/jssdk-v5/<product>.js（自定义产品）
修改 SDK 行为     → src/public/js/paypal/jssdk-v5/<shared>.js
修改页面 HTML     → src/views/paypal/jssdk-v5/<product>.ejs
修改 UI 样式      → src/public/css/sandbox.css
```

完整文件映射：`docs/design/2026-05-18-design-be-jssdk-v5-file-map.md`

---

## JSSDK v5 专属规则

### 规则 14 — Google Pay ECM 用 Promise 模式，ECS 用 Full Callback 模式

**ECM — Promise 模式**（无任何 callbacks）：
- 不传 `paymentDataCallbacks`，不设 `callbackIntents`
- `loadPaymentData(req).then(function(paymentData) { createOrder → processPayment })`
- sheet 关闭后 Promise resolve，3DS 窗口可正常弹出

**ECS — Full Callback 模式**（因 `onPaymentDataChanged` 需要）：
- `paymentDataCallbacks: { onPaymentAuthorized, onPaymentDataChanged }`
- `callbackIntents: ['SHIPPING_ADDRESS', 'SHIPPING_OPTION', 'PAYMENT_AUTHORIZATION']`
- `onPaymentAuthorized` 必须返回 `Promise<{ transactionState: 'SUCCESS' | 'ERROR' }>`（只能 resolve，失败用 ERROR）

**Google Pay API 强制规则（违反 → OR_BIBED_06）：**
- 只要传 `paymentDataCallbacks`，`callbackIntents` **必须**含 `'PAYMENT_AUTHORIZATION'` 且**必须**提供 `onPaymentAuthorized`
- `'SHIPPING_ADDRESS'` 必须在 `callbackIntents` 里才触发 `INITIALIZE` 回调
- `shippingOptions` 对象只允许 `{id, label, description}`，不能含 `price`、`selected`
- `onPaymentDataChanged` 返回规则：INITIALIZE/SHIPPING_ADDRESS → `newTransactionInfo` + `newShippingOptionParameters`；SHIPPING_OPTION → 只返回 `newTransactionInfo`
- 初始 `totalPriceStatus: 'ESTIMATED'`；`onPaymentDataChanged` 回调里用 `'FINAL'`

### 规则 15 — Google Pay 3DS 路径

Google Pay 无前端 `liabilityShift`，`confirmOrder` 返回 `PAYER_ACTION_REQUIRED` 时：
1. `initiatePayerAction`
2. GET order details
3. 从 `payment_source.google_pay.card.authentication_result`（比 ACDC 多一层 `google_pay`）读取结果

决策逻辑：
- `liability_shift === 'POSSIBLE'` → capture
- `liability_shift === 'NO'` + enrollment in `['N','U','B']` → capture（未入会）
- `liability_shift === 'NO'` + 其他 enrollment → reject
- `liability_shift === 'UNKNOWN'` → reject（提示重试）

### 规则 16 — Google Pay ECS 电话格式转换

Google Pay 返回 E.164（`+14155552671`），PayPal 需要 `{ country_code: '1', national_number: '4155552671' }`。

转换：strip 非数字 → 用 `COUNTRY_DIAL[shippingAddress.countryCode]` 找 dialCode → 若 digits 以 dialCode 开头则剥离，剩余为 `national_number`。

### 规则 17 — Google Pay ECM vs ECS 的 phone 来源不同

- **ECM**（`shippingAddressRequired: false`）：sheet 无地址区，无法收电话 → 用 `demoParams.SANDBOX_PHONE` 预填
- **ECS**（`shippingAddressRequired: true`）：从 `paymentData.shippingAddress.phoneNumber` 经 `parsePhoneNumber()` 转换

### 规则 18 — Apple Pay 流程关键规则

- **ECM create-order 含 `payment_source.apple_pay.experience_context`**（return_url/cancel_url）；token 由 `confirmOrder` 注入
- **ECS create-order 的 `payment_source.apple_pay`** 额外含 `name`、`email_address`、`phone_number`（仅 `{ national_number: digits }`，无 `country_code`）
- **create-order 在 `onpaymentauthorized` 内执行**；整个 createOrder→confirmOrder→capture 链都在此回调中
- **必须始终调用 `session.completePayment()`**：成功用 `STATUS_SUCCESS`，失败用 `STATUS_FAILURE`，否则 sheet 卡住
- **`confirmOrder` 返回** `{ approveApplePayPayment: { status, ... } }`；检查 `.status === 'APPROVED'`
- **3DS 由 Apple Pay 协议内部处理**，无需 `initiatePayerAction` 或 GET order details
- **ECM**: `requiredBillingContactFields: ['name','phone','email','postalAddress']`，无 shippingFields
- **ECS**: 额外加 `requiredShippingContactFields`；`shippingMethods` 数组；`onshippingmethodselected` + `onshippingcontactselected`；`normalizeContact()` 剥离非数字
- **Apple Pay `phone_number` 格式**：仅 `{ national_number: digits }`（与 Google Pay 不同，Google Pay 需要两个字段）

### 规则 19 — Vault Return Buyer SDK 必须加 `commit=true`

- 缺少 `commit=true` → 点击 PayPal 按钮弹出完整登录 popup，而非一键确认
- 正确 SDK URL：`...&buyer-country=US&commit=true&components=buttons&currency=${currency}`
- `create-order` 的 `payment_source` 只需 `{ paypal: { experience_context } }`，**不需要 vault_id**
- `data-user-id-token` 由后端调 `POST /v1/oauth2/token?response_type=id_token&target_customer_id=<customerId>` 获取
