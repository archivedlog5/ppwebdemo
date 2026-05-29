# demo-hub — Todos

最后更新：2026-05-21

---

## JSSDK v5（当前阶段）

> 完整计划：`docs/plans/2026-05-15-plan-jssdk-v5-v1.md`

### 基础设施

- [x] **Task 1** — 项目脚手架（package.json、.env.example、目录结构、npm install）
- [x] **Task 0A** — PayPal Access Token 缓存（`config/paypal.js`，CN + US，8h TTL）
- [x] **Task 0B** — 路由工厂函数（`_factory.js`：createStandardRoute + createVaultWithPurchaseRoute）
- [x] **Task 2** — Supabase 配置加载（`config/products.js`，demohub schema，ws transport）
- [x] **Task 3** — Express 入口（`app.js`，挂载所有路由，导出供 gateway 复用）
- [x] **Task 4** — 共享 CSS（`base.css`、`layout.css`、`sandbox.css`，Dark/Light 双主题）
- [x] **Task 5** — EJS Partials（`header.ejs`、`footer.ejs`，移动端水平 scroll tabs）
- [x] **Task 6** — 首页路由 + 视图（`routes/index.js`、`views/index.ejs`）
- [x] **Task 17** — Supabase 建表 + 14 条 seed 数据（已在 Supabase SQL Editor 执行）
- [x] 生产 gateway（根目录 `server.js`，单端口挂载所有 app）

### PayPal JSSDK v5 — 路由 + 视图 + JS 分离

**架构：** EJS 提供 HTML 结构 + 注入 `window.DEMO`，静态 JS 文件处理 SDK 逻辑。

#### 静态 JS 文件（`src/public/js/paypal/jssdk-v5/`）

- [x] **`spb.js`** — PayPal Buttons（createOrder + captureOrder）
- [x] **`acdc.js`** — CardFields（含 vault 模式）
- [x] **`buttons.js`** — 多按钮双 SDK（PayPal/PayLater/BCDC + Venmo）
- [x] **`vault-setup.js`** — Vault setup-only（createVaultSetupToken + confirm）
- [x] **`vault-return.js`** — Return buyer（点击 "Get Vaulted Payment Methods" 按钮 → GET `/api/vault-return/payment-tokens` → 渲染 radio 卡片；PayPal token → `paypalSDK.Buttons({ fundingSource: PAYPAL })`；card → Pay Now（`payment_source.card.vault_id`，`PayPal-Request-Id` 头）；apple_pay → radio 禁用（Apple 指南限制））
- [x] **`applepay-ecm.js`** — Apple Pay ECM（`ApplePaySession.supportsVersion(4)` + `canMakePayments()` 检测；`paypalSDK.Applepay().config()` → 创建 `<apple-pay-button>` web component + `#custom-applepay-btn`；流程：`onvalidatemerchant` → `validateMerchant()` → `completeMerchantValidation()`；`onpaymentmethodselected` → `completePaymentMethodSelection()`；`onpaymentauthorized` → createOrder（body: `{ amount, currency }`）→ `confirmOrder({ orderId, token, billingContact, shippingContact })` → 解包 `confirmResult.approveApplePayPayment` → 检查 `.status === 'APPROVED'` → capture → 检查 COMPLETED → `completePayment(STATUS_SUCCESS/FAILURE)`；3DS 由 Apple Pay 协议内部处理，无需 `initiatePayerAction`；`requiredBillingContactFields: ['name','phone','email','postalAddress']`（ECM 无 shippingFields））
- [x] **`applepay-ecs.js`** — Apple Pay ECS（`requiredShippingContactFields: ['name','phone','email','postalAddress']`；`SHIPPING_METHODS` 数组（Standard $5 / Express $10）；`onshippingmethodselected` → 更新 `chosenShipping` → `completeShippingMethodSelection({ newTotal, newLineItems })`；`onshippingcontactselected` → `completeShippingContactSelection({ newTotal, newLineItems })`（不按地址重算）；`normalizeContact()` 剥离 phoneNumber 中非数字（E.164 `+14089741010` → `14089741010`）；`fmtAmt()` + `calcTotal()` 含运费总价；ECS 流程：`onpaymentauthorized` → createOrder（body: `{ amount, currency, shippingContact, billingContact, shippingAmount: chosenShipping.amount }`）→ `confirmOrder({ orderId, token, billingContact: normalizeContact(bc), shippingContact: normalizeContact(sc) })` → 解包 `confirmResult.approveApplePayPayment` → 检查 `.status === 'APPROVED'` → capture → 检查 COMPLETED）
- [x] **`googlepay-ecm.js`** — Google Pay ECM（命名函数拆分；**Promise 模式**：`PaymentsClient` 无 `paymentDataCallbacks`，`loadPaymentData` 无 `callbackIntents`，sheet 关闭后 Promise resolve 再调 `processPayment`，3DS 窗口不被 sheet 遮挡；`confirmOrder` → PAYER_ACTION_REQUIRED 时 `initiatePayerAction` → `getOrderDetails` → `handle3DS`（解析 `payment_source.google_pay.card.authentication_result`，比 ACDC 多一层 `google_pay`）；`doCapture` 检查 COMPLETED；含 SCA 下拉、完整 console.log 日志；`addGooglePayButton` 额外启用 `#custom-googlepay-btn` 并绑定 hover/press/click）
- [x] **`googlepay-ecs.js`** — Google Pay ECS（`shippingAddressRequired: true`，`emailRequired: true`，`phoneNumberRequired: true`，`shippingOptionRequired: true`；`SHIPPING_OPTIONS` 数组（Standard $5 / Express $10）；`chosenShipping` 模块状态；**Full Callback 模式**：`paymentDataCallbacks: { onPaymentAuthorized, onPaymentDataChanged }`，`callbackIntents:['SHIPPING_ADDRESS','SHIPPING_OPTION','PAYMENT_AUTHORIZATION']`（只要注册 paymentDataCallbacks 就必须有 PAYMENT_AUTHORIZATION，否则 OR_BIBED_06）；`onPaymentAuthorized`：createOrder 在此回调内执行，返回 `Promise<{transactionState}>`；`onPaymentDataChanged`：INITIALIZE/SHIPPING_ADDRESS→`{newTransactionInfo, newShippingOptionParameters}`，SHIPPING_OPTION→仅 `{newTransactionInfo}`；`shippingOptions` 只含 `{id,label,description}`（不能有 price/selected）；`COUNTRY_DIAL` + `parsePhoneNumber()` 把 E.164 电话转成 PayPal `{ country_code, national_number }`；buyerName/email/parsedPhone/shippingAmount 注入 create-order；3DS 逻辑与 ECM 相同）

#### EJS 视图（`src/views/paypal/jssdk-v5/`）

- [x] **Task 8/9** — spb-ecm, spb-ecs（使用 `spb.js`）
- [x] **Task 10** — buttons（使用 `buttons.js`，双 SDK）
- [x] **Task 11** — acdc（使用 `acdc.js`）
- [x] **Task 14** — vault-paypal-with-purchase（**完整自定义路由**；GET 调 `fetchIdToken()` 注入 `data-user-id-token`；SDK URL 含 `buyer-country=US&vault=true&enable-funding=paylater&disable-funding=...`；`payment_source` 在顶层（含 `store_in_vault:ON_SUCCESS`、`usage_type:MERCHANT`、`customer_type:CONSUMER`、`permit_multiple_payment_tokens:false`、`description`、`attributes.customer.merchant_customer_id`、`experience_context.brand_name`、`shipping_preference:SET_PROVIDED_ADDRESS`）；capture 返回 `vaultId` + `customerId`；`vault-paypal-with-purchase.js` 专属 JS 展示 Vault Result 面板）
- [x] **Task 14** — vault-acdc-with-purchase（完整自定义路由；GET 传 `sandboxCardholderName`/`sandboxBilling`/`currency`；create-order 读 `saveVault`，勾选时在 `payment_source.card.attributes` 加 `vault.store_in_vault:ON_SUCCESS` + `customer.merchant_customer_id: 'CUST_' + randomBytes(6).hex`，始终加 `verification.method:scaMethod`；capture-order 提取 `vaultId`+`customerId` 返回；EJS：3DS select disabled（沙盒限制，说明"This demo focuses on vault functionality only. For 3DS testing, visit the ACDC demo."）；vault checkbox（默认勾选）+ `#vault-result` 面板；测试卡 `4012 0000 3333 0026`；**专属 `vault-acdc-with-purchase.js`**（不与 acdc.js 共用）；`getVaultChecked()`/`showVaultResult(vaultId, customerId)`；NumberField placeholder `4012000033330026`；console.log 前缀 `[ACDC-Vault]`）
- [x] **Task 14** — vault-applepay-with-purchase（完整自定义路由；虚拟产品，无 shipping；GET：SDK URL 硬编码 `currency=USD&vault=true`；create-order：purchase_unit 无 shipping；`payment_source.apple_pay`：`experience_context`（动态 return/cancel_url）+ `stored_credential`（CUSTOMER/RECURRING/`usage:FIRST`）+ `attributes.vault.store_in_vault:ON_SUCCESS`；capture-order：提取 `payment_source.apple_pay.attributes.vault`：`{id→vaultId, customer.id→customerId, status→vaultStatus}`，返回 `{...data, vaultId, customerId, vaultStatus}`；EJS：无 amount/currency 选择器；订阅套餐卡片（7-Day Trial $25.00 / Then weekly $40.00 USD/week / Cancel anytime）；`extraScripts` 加载 Apple Pay CDN；"⚡ Vault + Purchase" badge；无 shipping 地址区；custom button + `#custom-applepay-btn`；`#vault-result` 面板含 Vault Token / Customer ID / Vault Status；**专属 `vault-applepay-with-purchase.js`**（不与 applepay-ecm.js 共用）；硬编码 `TRIAL_AMOUNT="25.00"` / `REGULAR_AMOUNT="40.00"` / `CURRENCY="USD"`；paymentRequest：`requiredShippingContactFields:['email']` + `recurringPaymentRequest`（trial 7天$25 + regular 每7天$40，`billingAgreement`/`managementURL`）+ `lineItems`（`paymentTiming:recurring`）+ `total`（含 recurring 字段）；`ApplePaySession(4, paymentRequest)`；`recurringPaymentIntervalUnit: "day"`（Apple Pay 无 "week"）；button type `"subscribe"`；`showVaultResult(vaultId, customerId, vaultStatus)`；console.log 前缀 `[Apple Pay Vault]`）
- [x] **Task 15** — vault-paypal-setup-only（自定义路由；GET 调 `fetchIdToken()` 注入 `data-user-id-token`；create-setup-token body 含 `customer.merchant_customer_id`、`description`、`permit_multiple_payment_tokens:false`、`usage_pattern:IMMEDIATE`、`customer_type:CONSUMER`、`experience_context.shipping_preference:NO_SHIPPING`、`payment_method_preference:IMMEDIATE_PAYMENT_REQUIRED`、动态 return_url/cancel_url；confirm-setup-token 返回 `paymentTokenId` + `customerId`；EJS 加 `#vault-result` 面板；`vault-paypal-setup-only.js` 加 `showVaultResult()`）
- [x] **Task 15** — vault-acdc-setup-only（完整自定义路由；`/v3/vault/setup-tokens` API；create-setup-token body：顶层 `customer.merchant_customer_id`（随机 CUST_）+ `payment_source.card.billing_address`（SANDBOX_BILLING）+ `experience_context.return_url/cancel_url`（动态）+ `verification_method`（直接挂 card 下，非 attributes）；3DS 启用（SCA_WHEN_REQUIRED / SCA_ALWAYS）；onApprove 3DS 决策：`liabilityShift==='YES'||'POSSIBLE'` → 直接 confirm；否则 GET setup token → `token.status==='APPROVED' && verification_status==='VERIFIED'` → confirm（SCA_WHEN_REQUIRED 不触发 3DS 时 PayPal 仍返回 VERIFIED，已测试）；新增 GET setup-token 端点；confirm-setup-token 返回 `paymentTokenId` + `customerId`；EJS 展示 `#vault-result` 面板；**专属 `vault-acdc-setup-only.js`**（不与 acdc.js 共用）；console.group 分组打印 liabilityShift / token.status / verification_status；console.log 前缀 `[ACDC-Setup]`）
- [x] **Task 16** — vault-return（完整自定义路由；GET 调 `fetchIdToken()`；GET API 端点按需加载 payment tokens；create-and-capture 用 `tokenType` 区分 card/apple_pay；create-order + capture-order 供 PayPal SDK Buttons；`shipping: SANDBOX_SHIPPING`；`PayPal-Request-Id: randomUUID()` 头；**SDK URL 必须含 `commit=true&buyer-country=US`，否则弹 popup**；create-order `payment_source.paypal.experience_context`（无 vault_id）；`data-user-id-token` 识别回头买家）
- [x] **Task 12a** — applepay-ecm（自定义路由；`sandboxShipping` 传给 EJS 展示；create-order 含 `payment_source.apple_pay.experience_context`（return_url/cancel_url）；`applepay-ecm.js` 处理完整 session 流程；`confirmOrder` 响应解包：`confirmResult.approveApplePayPayment.status === 'APPROVED'`；Apple Pay button CSS from `applepay.cdn-apple.com`）
- [x] **Task 12b** — applepay-ecs（自定义路由；ECS 流程；`shippingMethods` 选择；`onshippingmethodselected` + `onshippingcontactselected`；`normalizeContact()` 剥非数字；create-order 接收 shippingContact + shippingAmount；`payment_source.apple_pay` 含 name/email_address/phone_number（`national_number` only，无 country_code）/experience_context；total = item + shippingAmount）
- [x] **Task 13a** — googlepay-ecm（自定义路由：SCA 下拉、reference_id/invoice_id/custom_id/soft_descriptor、return_url+cancel_url、merchant 预填 shipping；Custom Button（#custom-googlepay-btn）；**Promise 模式（无 callbackIntents）**；流程改为先开 sheet（emailRequired:true）→ 获取 email → createOrder（email + SANDBOX_PHONE 注入 payment_source.google_pay.email_address/phone_number）→ processPayment；3DS via GET order details；EJS 地址区显示预填 shipping + 电话）
- [x] **Task 13b** — googlepay-ecs（已实现：ECS 流程；email/phone/name 从 sheet 获取；parsePhoneNumber E.164 → PayPal 格式；mapGooglePayAddress Google Pay → PayPal 格式；3DS 与 ECM 相同路径；**2026-05-28 补充**：shippingOptionRequired + SHIPPING_OPTIONS；**Full Callback 模式**（paymentDataCallbacks:{ onPaymentAuthorized, onPaymentDataChanged }；callbackIntents:['SHIPPING_ADDRESS','SHIPPING_OPTION','PAYMENT_AUTHORIZATION']；只要注册 paymentDataCallbacks 就必须含 PAYMENT_AUTHORIZATION，否则 OR_BIBED_06）；onPaymentAuthorized 内执行 createOrder；onPaymentDataChanged：INITIALIZE/SHIPPING_ADDRESS→两个字段，SHIPPING_OPTION→仅 newTransactionInfo；shippingOptions 只含 {id,label,description}；create-order 含 shippingAmount，total = item + shipping）

### 动态金额 + 常量文件 + 币种选择器

> 设计文档：`docs/design/2026-05-18-design-be-dynamic-amount-and-constants.md`
> 币种设计：`docs/design/2026-05-18-design-be-currency-selector.md`

- [x] **新建** `src/config/constants.js`（INTENT、CURRENCY、DEMO_ITEM、SANDBOX_SHIPPING、SANDBOX_BILLING、buildOrderBody、validateAmount）
- [x] 更新 `_factory.js`、`buttons.js`、`acdc.js`、`vault-return.js`：用 `buildOrderBody` + 读 `req.body.amount`
- [x] 更新前端 JS：金额输入框 + validateAmount（$1–$30,000）
- [x] 更新 EJS 视图：金额输入框 UI + sandbox.css 样式
- [x] 重构 `_factory.js`：支持 `buildBody(amount, currency)` 模式
- [x] 迁移 `spb-ecm.js` → `buildBody` + `const demoParams = require('.../constants')`

#### 待迁移：所有工厂路由改用 `buildBody`（参考 spb-ecm.js）

- [x] `spb-ecs.js`
- [x] `applepay-ecm.js`
- [x] `applepay-ecs.js`
- [x] `googlepay-ecm.js`（已改为自定义路由，不再用工厂）
- [x] `googlepay-ecs.js`
- [x] `vault-paypal-with-purchase.js`
- [x] `vault-acdc-with-purchase.js`
- [x] `vault-applepay-with-purchase.js`

#### 待实现：币种选择器

- [ ] `constants.js` 加 `SUPPORTED_CURRENCIES`（30 种）、`ZERO_DECIMAL_CURRENCIES`、`isZeroDecimal`
- [ ] 更新 `buildOrderBody`：按币种格式化金额（零小数位取整）
- [ ] 更新 `validateAmount`：接收 `currency` 参数，零小数位特殊校验
- [ ] `_factory.js` GET handler：读 `req.query.currency`，传给 EJS + SDK URL
- [ ] `_factory.js` POST handler：读 `req.body.currency`，传给 `buildOrderBody`
- [ ] `buttons.js`、`acdc.js` 同上
- [ ] 所有有购买 EJS 视图：加 `<select id="demo-currency">` 30 种货币，`window.DEMO.currency`
- [ ] 前端 JS（spb/acdc/buttons）：`getCurrency()`、`isZeroDecimal()`、`change` 事件刷新（携带 amount+currency 到 URL）、`createOrder` 带 currency
- [ ] `sandbox.css`：`.amount-row`、`.currency-group`、`.currency-select` 并排布局
- [ ] 更新 `_factory.js`：POST handler 读 `req.body.amount`，调用 `buildOrderBody`
- [ ] 更新 `buttons.js`、`acdc.js`：改用 `buildOrderBody`
- [ ] 更新前端 JS（spb/acdc/buttons）：`createOrder` 读输入框 amount 传给后端
- [ ] 更新所有有购买行为的 EJS 视图：加金额输入框（default $100.00，验证，blur 格式化）
- [ ] 更新 `sandbox.css`：加金额输入框样式

#### 验证

- [ ] 浏览器测试 SPB ECM 完整支付流程（`npm run dev:demo-hub` → http://localhost:3000）
- [ ] 浏览器测试自定义金额（修改金额后支付，PayPal 结账页显示正确金额）
- [ ] 浏览器测试 ACDC 完整支付流程
- [ ] 浏览器测试 Vault setup-only 并获取 Payment Token
- [ ] 浏览器测试 Vault return buyer（用上面获取的 token）
- [ ] PayPal 结账页确认：商品名称、描述、收货地址预填正确

---

## 待启动（后续讨论）

- [ ] PayPal JSSDK v6 — 产品清单待讨论（与 v5 共用 `_factory.js` 模式）
- [ ] Braintree Web SDK — Drop-in UI、Hosted Fields
- [ ] Braintree GraphQL — 产品待定
- [ ] Stripe stripe-js — 产品待定
- [ ] Adyen Web Components — 产品待定
- [ ] admin-console — 需求讨论
- [ ] store-fashion — 需求讨论

---

## 已完成

- [x] 需求讨论（/office-hours）→ `docs/req/2026-05-15-req-demo-hub.md`
- [x] JSSDK v5 产品清单确认 → `docs/req/2026-05-15-req-jssdk-v5.md`
- [x] 路由三层结构设计 → `docs/design/2026-05-15-design-be-routing.md`
- [x] UI/UX 设计（Dark OLED，双主题，响应式）→ `DESIGN.md`
- [x] Supabase 多 schema 数据库设计 → `docs/design/2026-05-15-design-db-supabase.md`（全局）
- [x] JSSDK v5 实现计划 → `docs/plans/2026-05-15-plan-jssdk-v5-v1.md`
- [x] CEO Review + Eng Review + Design Review → 计划全部 CLEAR
- [x] 全栈实现：CSS + EJS partials + 首页 + 14 个路由 + 工厂函数
- [x] EJS/JS 分离重构：`window.DEMO` 模式，静态 JS 文件复用
- [x] Supabase 建表 + seed 数据已执行
- [x] 生产 gateway 架构（`server.js`）
