# Design: JSSDK v5 各 Demo 文件映射

Generated: 2026-05-18
Status: LIVING DOCUMENT（随实现持续更新）

---

## 概览

每个 demo 涉及 4 类文件。调试时对照此表找到需要改的文件：

| 层 | 文件模式 | 改什么 |
|---|---------|--------|
| **SDK 加载参数** | `routes/paypal/jssdk-v5/<product>.js` 的 `sdkParams` | SDK URL query string（components、currency、vault 等） |
| **后端 API** | `routes/paypal/jssdk-v5/_factory.js` 或自定义路由文件 | PayPal REST API 调用（order body、API endpoint） |
| **HTML + 配置** | `views/paypal/jssdk-v5/<product>.ejs` | 页面结构、`window.DEMO.urls`、provider badge |
| **SDK 逻辑** | `public/js/paypal/jssdk-v5/<js>.js` | Buttons/CardFields 初始化、回调行为 |

---

## SPB 标准按钮（工厂路由）

### spb-ecm — Standard PayPal Button, Express Checkout Mark

> ECM = Express Checkout Mark，PayPal 弹窗内完成结账（默认流程）

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由（SDK 参数 + API） | `src/routes/paypal/jssdk-v5/spb-ecm.js` | `sdkParams: 'components=buttons&currency=USD'`，调用 `createStandardRoute` |
| 后端逻辑 | `src/routes/paypal/jssdk-v5/_factory.js` → `createStandardRoute` | `POST /v2/checkout/orders`（intent: CAPTURE），`POST /v2/checkout/orders/{id}/capture` |
| EJS 视图 | `src/views/paypal/jssdk-v5/spb-ecm.ejs` | `window.DEMO.urls.createOrder/captureOrder`，badge 文字 |
| SDK JS | `src/public/js/paypal/jssdk-v5/spb.js` | `paypalSDK.Buttons({ createOrder, onApprove, onError })` |

**常用微调点：**
- 改货币 → `spb-ecm.js` 的 `sdkParams` 加 `&currency=CNY`
- 改金额 → `_factory.js` 的 order body 里 `value: '1.00'`
- 改按钮样式 → `spb.js` 的 `Buttons()` 加 `style: { color, shape, label }`
- 改结账体验 → order body 加 `payment_source.paypal.experience_context`

---

### spb-ecs — Standard PayPal Button, Express Checkout Standard

> ECS = Express Checkout Standard，携带 `PAY_NOW` 体验上下文

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由（SDK 参数 + API） | `src/routes/paypal/jssdk-v5/spb-ecs.js` | `sdkParams: 'components=buttons&currency=USD'`，`orderBody` 含 `experience_context.user_action: 'PAY_NOW'` |
| 后端逻辑 | `src/routes/paypal/jssdk-v5/_factory.js` → `createStandardRoute` | 同 ECM，但 order body 含 `payment_source.paypal.experience_context` |
| EJS 视图 | `src/views/paypal/jssdk-v5/spb-ecs.ejs` | 同 ECM 结构，window.DEMO 改为 spb-ecs API |
| SDK JS | `src/public/js/paypal/jssdk-v5/spb.js` | 与 ECM **共用同一 JS 文件** |

---

## 独立按钮（自定义路由）

### buttons — PayPal/PayLater/BCDC/Venmo 独立渲染

> 同一页面展示 4 个按钮，CN 账户 + US 账户双 SDK

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由 + API | `src/routes/paypal/jssdk-v5/buttons.js` | 自定义路由；`create-order`（CN）、`create-order-us`（US Venmo）、`capture-order`（account 参数区分） |
| EJS 视图 | `src/views/paypal/jssdk-v5/buttons.ejs` | 4 个 `btn-slot` div；`cnSdkUrl`/`usSdkUrl` 双 script 注入；`window.DEMO.urls` 含三个端点 |
| SDK JS | `src/public/js/paypal/jssdk-v5/buttons.js` | 分别渲染 paypalCN.FUNDING.PAYPAL/PAYLATER/CARD 和 paypalUS.FUNDING.VENMO |

**常用微调点：**
- CN/US 账户切换 → `buttons.js` 路由里改 `getCNToken()`/`getUSToken()`
- 按钮 label → `public/js/.../buttons.js` 各 `Buttons()` 加 `style.label`
- Venmo 不可用时降级 → `buttons.js` SDK JS 里判断 `paypalUS.isFundingEligible(VENMO)`

---

## ACDC — Advanced Credit/Debit Card（自定义路由）

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由 + API | `src/routes/paypal/jssdk-v5/acdc.js` | 自定义路由；SDK 参数 `components=card-fields`；create/capture 同工厂 |
| EJS 视图 | `src/views/paypal/jssdk-v5/acdc.ejs` | 4 个 `field-host` div（card-number/expiry/cvv/name）；`#acdc-pay-btn`；`window.DEMO.urls` |
| SDK JS | `src/public/js/paypal/jssdk-v5/acdc.js` | `paypalSDK.CardFields()`，render 到各容器；`#acdc-pay-btn` 点击触发 `cardFields.submit()` |

**常用微调点：**
- 隐藏姓名字段 → `acdc.ejs` 删除 `card-name-container`；`acdc.js` 删除 `cardFields.NameField().render()`
- 改 CardFields 样式 → `acdc.js` 的 `CardFields({ style: { input: {...} } })`
- 测试卡 → `4111 1111 1111 1111`，任意未来日期，任意 CVV

---

## Apple Pay（工厂路由）

### applepay-ecm / applepay-ecs

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由 applepay-ecm | `src/routes/paypal/jssdk-v5/applepay-ecm.js` | `sdkParams: 'components=applepay&currency=USD'`；create/capture 同工厂 |
| 路由 applepay-ecs | `src/routes/paypal/jssdk-v5/applepay-ecs.js` | 同 ECM，可在 orderBody 加 experience_context |
| EJS 视图 | `src/views/paypal/jssdk-v5/applepay-ecm.ejs` | `window.DEMO.urls`；`#paypal-button-container` |
| SDK JS | `src/public/js/paypal/jssdk-v5/applepay.js` | **⏳ 待实现**：`paypalSDK.Applepay()`、`ApplePaySession`、`validateMerchant`、`paymentauthorized` 回调 |

**前提条件：** Safari on macOS/iOS、Apple Wallet 测试卡、domain 验证

---

## Google Pay（工厂路由）

### googlepay-ecm / googlepay-ecs

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由 googlepay-ecm | `src/routes/paypal/jssdk-v5/googlepay-ecm.js` | `sdkParams: 'components=googlepay&currency=USD'`；`extraScripts: [{ url: 'https://pay.google.com/gp/p/js/pay.js' }]` |
| 路由 googlepay-ecs | `src/routes/paypal/jssdk-v5/googlepay-ecs.js` | 同 ECM |
| EJS 视图 | `src/views/paypal/jssdk-v5/googlepay-ecm.ejs` | 自动加载 Google Pay JS + PayPal SDK；`window.DEMO.urls` |
| SDK JS | `src/public/js/paypal/jssdk-v5/googlepay.js` | **⏳ 待实现**：`google.payments.api.PaymentsClient`、`paypalSDK.Googlepay()`、`loadPaymentData`、`confirmOrder` |

**前提条件：** Chrome、Google Pay 账户绑定卡、localhost（Google Pay TEST 环境允许 localhost）

---

## Vault with-purchase（工厂路由）

### vault-paypal-with-purchase

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由 | `src/routes/paypal/jssdk-v5/vault-paypal-with-purchase.js` | `createVaultWithPurchaseRoute`；`paymentSource.paypal.attributes.vault.store_in_vault: 'ON_SUCCESS'` |
| 后端逻辑 | `_factory.js` → `createVaultWithPurchaseRoute` | order body 含 `payment_source`；capture 返回 `vaultId` |
| EJS | `src/views/paypal/jssdk-v5/vault-paypal-with-purchase.ejs` | 同 spb-ecm 结构；SDK 参数需 `vault=true` |
| SDK JS | `src/public/js/paypal/jssdk-v5/spb.js` | **与 ECM 共用**；captureOrder 返回值包含 `vaultId` 字段 |

### vault-acdc-with-purchase

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由 | `src/routes/paypal/jssdk-v5/vault-acdc-with-purchase.js` | `paymentSource.card.attributes.vault.store_in_vault: 'ON_SUCCESS'` |
| EJS | `src/views/paypal/jssdk-v5/vault-acdc-with-purchase.ejs` | CardFields 结构；SDK 参数 `components=card-fields&vault=true` |
| SDK JS | `src/public/js/paypal/jssdk-v5/acdc.js` | **与 ACDC 共用** |

### vault-applepay-with-purchase

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由 | `src/routes/paypal/jssdk-v5/vault-applepay-with-purchase.js` | `paymentSource.apple_pay.attributes.vault.store_in_vault: 'ON_SUCCESS'` |
| EJS | `src/views/paypal/jssdk-v5/vault-applepay-with-purchase.ejs` | `sdkUrl` 含 `vault=true` |
| SDK JS | `src/public/js/paypal/jssdk-v5/applepay.js` | **⏳ 待实现**（同 applepay-ecm 共用） |

---

## Vault Setup-Only（自定义路由）

### vault-paypal-setup-only

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由 | `src/routes/paypal/jssdk-v5/vault-paypal-setup-only.js` | `/v3/vault/setup-tokens` + `/v3/vault/payment-tokens`（非 v2/checkout） |
| EJS | `src/views/paypal/jssdk-v5/vault-paypal-setup-only.ejs` | `window.DEMO.urls.createSetupToken`/`confirmSetupToken` |
| SDK JS | `src/public/js/paypal/jssdk-v5/vault-setup.js` | `Buttons({ createVaultSetupToken, onApprove })` |

### vault-acdc-setup-only

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由 | `src/routes/paypal/jssdk-v5/vault-acdc-setup-only.js` | `/v3/vault/setup-tokens`（card body 为空 `{}`） |
| EJS | `src/views/paypal/jssdk-v5/vault-acdc-setup-only.ejs` | CardFields 结构；`mode: 'vault-setup'` |
| SDK JS | `src/public/js/paypal/jssdk-v5/acdc.js` | **与 ACDC 共用**；`mode` 影响行为（待实现区分） |

---

## Vault Return Buyer（自定义路由）

### vault-return

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由 | `src/routes/paypal/jssdk-v5/vault-return.js` | 纯服务端，接收 `paymentTokenId`，create-order（`payment_source.token`）+ capture 一步完成 |
| EJS | `src/views/paypal/jssdk-v5/vault-return.ejs` | `#payment-token-input` 输入框；`#vault-return-btn` 按钮；`window.DEMO.urls.createAndCapture` |
| SDK JS | `src/public/js/paypal/jssdk-v5/vault-return.js` | 无 SDK，纯 fetch；从输入框读 token，POST 到后端 |

---

## SDK 参数速查表

每个产品的 SDK URL 格式：`https://www.paypal.com/sdk/js?client-id=<ID>&<sdkParams>`

| 产品 | 关键 sdkParams | 说明 |
|------|----------------|------|
| spb-ecm, spb-ecs | `components=buttons&currency=USD` | 标准按钮，按需加 `intent=authorize` |
| buttons | CN: `components=buttons` / US: `components=buttons&enable-funding=venmo` | 双 SDK 加载 |
| acdc | `components=card-fields&currency=USD` | 不能和 buttons 混用 |
| applepay-ecm/ecs | `components=applepay&currency=USD` | 需 Safari |
| googlepay-ecm/ecs | `components=googlepay&currency=USD` | 需额外加载 `pay.google.com/gp/p/js/pay.js` |
| vault-paypal-with-purchase | `components=buttons&vault=true&currency=USD` | vault=true 才能存储支付方式 |
| vault-acdc-with-purchase | `components=card-fields&vault=true&currency=USD` | |
| vault-paypal-setup-only | `components=buttons&vault=true&currency=USD` | createVaultSetupToken 需要 vault=true |
| vault-acdc-setup-only | `components=card-fields&vault=true&currency=USD` | |
| vault-return | 无 SDK（server-side only） | 不需要前端加载 SDK |

---

## 常用调试路径

```
修改 SDK 加载参数  → src/routes/paypal/jssdk-v5/<product>.js 的 sdkParams
修改 PayPal API   → src/routes/paypal/jssdk-v5/_factory.js（工厂产品）
                    或 src/routes/paypal/jssdk-v5/<product>.js（自定义产品）
修改 SDK 行为     → src/public/js/paypal/jssdk-v5/<shared>.js
修改页面 HTML     → src/views/paypal/jssdk-v5/<product>.ejs
修改页面 UI 样式  → src/public/css/sandbox.css
```
