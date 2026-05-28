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
| 路由（SDK 参数 + API） | `src/routes/paypal/jssdk-v5/spb-ecm.js` | `sdkParams` 含 `commit=true&buyer-country=US&disable-funding=...`；`buildBody` 含完整 buyer info + experience_context |
| 后端逻辑 | `src/routes/paypal/jssdk-v5/_factory.js` → `createStandardRoute` | `POST /v2/checkout/orders`（intent: CAPTURE），`POST /v2/checkout/orders/{id}/capture` |
| EJS 视图 | `src/views/paypal/jssdk-v5/spb-ecm.ejs` | `window.DEMO.urls.createOrder/captureOrder`，badge 文字 |
| SDK JS | `src/public/js/paypal/jssdk-v5/spb.js` | `paypalSDK.Buttons({ createOrder, onApprove, onError })` |

**常用微调点：**
- 改货币 → `spb-ecm.js` 的 `sdkParams` 加 `&currency=CNY`
- 改金额 → `_factory.js` 的 order body 里 `value: '1.00'`
- 改按钮样式 → `spb.js` 的 `Buttons()` 加 `style: { color, shape, label }`
- 改结账体验 → order body 加 `payment_source.paypal.experience_context`

---

### spb-ecs — Standard PayPal Button, Express Checkout Shortcut

> ECS = Express Checkout Shortcut，`user_action: CONTINUE`，`shipping_preference: GET_FROM_FILE`（从买家账户获取地址）

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由（SDK 参数 + API） | `src/routes/paypal/jssdk-v5/spb-ecs.js` | `sdkParams` 含 `commit=false&buyer-country=US`；`buildBody` 设 `user_action: CONTINUE`, `shipping_preference: GET_FROM_FILE` |
| 后端逻辑 | `src/routes/paypal/jssdk-v5/_factory.js` → `createStandardRoute` | 同 ECM，但 order body 含 `payment_source.paypal.experience_context` |
| EJS 视图 | `src/views/paypal/jssdk-v5/spb-ecs.ejs` | 同 ECM 结构，window.DEMO 改为 spb-ecs API |
| SDK JS | `src/public/js/paypal/jssdk-v5/spb.js` | 与 ECM **共用同一 JS 文件** |

---

## Standalone Buttons（自定义路由）

### buttons — PayPal/PayLater/BCDC/Venmo Standalone 渲染

> 同一页面展示 4 个按钮，CN 账户 + US 账户双 SDK

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由 + API | `src/routes/paypal/jssdk-v5/buttons.js` | 自定义路由；`create-order`（CN）用 `buildBody` → `payment_source.paypal`（`SANDBOX_BUYER` + `EXPERIENCE_CONTEXT`）；`create-order-us`（US Venmo）用 `buildBodyVenmo` → `payment_source.venmo`（`brand_name: "Cross Wen US Store"`，`shipping: VENMO_SHIPPING`）；`capture-order` 用 `account` 参数区分 CN/US token |
| EJS 视图 | `src/views/paypal/jssdk-v5/buttons.ejs` | 4 个 `btn-slot` div，顺序：PayPal → PayLater → Venmo → BCDC；Venmo slot 下方显示提示"Requires a US IP to test"；`cnSdkUrl`/`usSdkUrl` 双 script 注入（均含 `funding-eligibility`）；`window.DEMO.urls` 含三个端点；**币种选择器已 `disabled`** |
| SDK JS | `src/public/js/paypal/jssdk-v5/buttons.js` | 每个按钮先 `Buttons()` 创建，再 `button.isEligible()` 判断，通过才 `render()`；paypalCN 渲染 PAYPAL/PAYLATER/CARD（BCDC 加 `expandCardForm: true`），paypalUS 渲染 VENMO |

**常用微调点：**
- CN/US 账户切换 → `buttons.js` 路由里改 `getCNToken()`/`getUSToken()`
- 按钮 label → `public/js/.../buttons.js` 各 `Buttons()` 加 `style.label`
- Venmo brand name → `buttons.js` 路由里 `buildBodyVenmo` 的 `experience_context.brand_name`

---

## ACDC — Advanced Credit/Debit Card（自定义路由）

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由 + API | `src/routes/paypal/jssdk-v5/acdc.js` | 自定义路由；SDK 参数 `components=card-fields`；从 body 读取 `scaMethod`（白名单校验）、`cardholderName`、`billingAddress`（camelCase → snake_case 转换）；注入 `payment_source.card = { name, billing_address, experience_context: ACDC_EXPERIENCE_CONTEXT, attributes.verification.method }`；`GET /api/acdc/order/:orderID` 返回完整 order 数据（前端自行解析 3DS 字段） |
| EJS 视图 | `src/views/paypal/jssdk-v5/acdc.ejs` | 字段顺序：Name（普通 input，预填 sandboxCardholderName）→ Number → Expiry/CVV；amount-row 含三列：Currency / Amount / **3DS** select（SCA_WHEN_REQUIRED / SCA_ALWAYS）；`window.DEMO.billing` 注入 sandboxBilling（camelCase）；`window.DEMO.urls.getOrder` 含 `:orderID` 占位符 |
| SDK JS | `src/public/js/paypal/jssdk-v5/acdc.js` | `getName()` 读 `#card-name`；`getSCA()` 读 `#demo-sca`；`createOrder` fetch body 含 `{ amount, currency, scaMethod, cardholderName, billingAddress: window.DEMO.billing }`；`submit({ billingAddress: window.DEMO.billing })`；NameField 已移除（name 改为普通 input）；`doCapture(orderID)` 抽取为独立 helper |

**onApprove 3DS 决策逻辑（acdc.js）：**

```
liabilityShift 来自 onApprove data（客户端）：
  undefined   → 3DS 未触发（SCA_WHEN_REQUIRED 且无需验证）→ 直接 doCapture
  'POSSIBLE'  → 责任转移到发卡行 → 直接 doCapture
  其他值       → GET /api/acdc/order/:orderID 取完整 order，解析：
                  authResult = payment_source.card.authentication_result
                  ls         = authResult.liability_shift
                  enrollment = authResult.three_d_secure.enrollment_status
                  authStatus = authResult.three_d_secure.authentication_status
                继续条件：ls === 'NO' 且 enrollment 为 N/U/B → doCapture
                ls === 'UNKNOWN' → 提示重试
                其余 → 提示 3DS 拒绝（显示 enrollment + authStatus）
```

**onCancel（acdc.js）：** 3DS 弹窗被用户关闭时触发，显示"3D Secure cancelled"并重新启用支付按钮。

**inputEvents 行为：**
- `onFocus` / `onBlur` → 给对应容器 div 加/去 `.focused` 类（number/expiry/cvv，name 已移出托管字段）
- `onChange` → 调用 `updateFieldStates(data.fields)`：
  - `isValid: true` → `.field-host--valid`（绿色边框）
  - `isPotentiallyValid: false` 且非空 → `.field-host--invalid`（红色边框 + glow）
  - 检测卡类型并输出到控制台：`[ACDC] Card type: Visa (visa)` + CVV 位数 + 表单是否有效 + 错误列表

**CSS 类（sandbox.css）：**
- `.sandbox-card--wide` → `max-width: 540px`（ACDC/vault-acdc 专用）
- `.field-host--valid` → 绿色边框 `#22c55e`
- `.field-host--invalid` → 红色边框 `#ef4444` + 红色 glow

**CardFields style 对象：**
- `input` → Space Mono 13px
- `.invalid` → `color: #EF4444`（iframe 内输入文字变红）

**常用微调点：**
- 改 CardFields 样式 → `acdc.js` 的 `CardFields({ style: { input: {...}, '.invalid': {...} } })`
- 改 billing 地址 → `constants.js` 的 `SANDBOX_BILLING`，路由层转 camelCase 后注入 `window.DEMO.billing`
- 测试卡 → `4032030176760800`，任意未来日期，任意 CVV

---

## Apple Pay（自定义路由）

### applepay-ecm — Apple Pay Express Checkout Mark（2026-05-28 完成）

> ECM = 商户侧预填收货地址，买家在 Apple Pay sheet 里提供账单信息，`requiredBillingContactFields` 只含 billing 字段，无 shippingFields。

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由 + API | `src/routes/paypal/jssdk-v5/applepay-ecm.js` | **自定义路由**（非工厂）；GET 传 `sandboxShipping` 给 EJS；create-order 含 `payment_source.apple_pay.experience_context`（return_url/cancel_url；token 仍由 `confirmOrder` 注入）；capture-order 标准；SDK 参数 `components=applepay` |
| EJS 视图 | `src/views/paypal/jssdk-v5/applepay-ecm.ejs` | `extraScripts` 加载 `apple-pay-sdk.js`（`applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js`，注册 `<apple-pay-button>` web component）；currency + amount 选择器；只读 Shipping 展示区；`#paypal-button-container`（放 `<apple-pay-button>` web component）；`#custom-applepay-btn`（初始 `disabled`）；加载 `applepay-ecm.js` |
| SDK JS | `src/public/js/paypal/jssdk-v5/applepay-ecm.js` | ECM 专用；完整 console.log 日志；见下方函数一览 |

**前提条件：** Safari on macOS/iOS、Apple Wallet 测试卡、domain 验证（sandbox 下 localhost 可用）

---

#### 后端 API（`applepay-ecm.js` 路由文件）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/paypal/jssdk-v5/applepay-ecm` | GET | 渲染页面；传 `sandboxShipping`（camelCase 格式，同 Google Pay ECM）给 EJS |
| `/api/applepay-ecm/create-order` | POST | 读 `{ amount, currency }`；标准 order body（无 `payment_source`）；返回 `{ id }` |
| `/api/applepay-ecm/capture-order` | POST | 读 `{ orderID }`；capture 并返回完整 order JSON |

**create-order body（`payment_source.apple_pay.experience_context`；token 由 `confirmOrder` 注入）：**

```js
{
  intent: 'CAPTURE',
  purchase_units: [{
    reference_id:    demoParams.DEMO_REFERENCE_ID,
    description:     demoParams.DEMO_DESCRIPTION,
    invoice_id:      `INV-${Date.now()}`,
    custom_id:       demoParams.DEMO_CUSTOM_ID,
    soft_descriptor: demoParams.DEMO_SOFT_DESCRIPTOR,
    amount: { currency_code, value, breakdown: { item_total } },
    items:  [{ ...demoParams.DEMO_ITEM, unit_amount }],
    shipping: demoParams.SANDBOX_SHIPPING,   // 商户预填，不出现在 Apple Pay sheet
  }],
  payment_source: {
    apple_pay: {
      experience_context: {   // return_url / cancel_url；token 无需在此指定
        return_url: `${protocol}://${host}/paypal/jssdk-v5/applepay-ecm`,
        cancel_url: `${protocol}://${host}/paypal/jssdk-v5/applepay-ecm`,
      },
    },
  },
}
```

---

#### 前端函数一览（`applepay-ecm.js`）

| 函数 | 类型 | 职责 |
|------|------|------|
| `getCurrency()` | UI helper | 读 `#demo-currency` |
| `getAmount()` | UI helper | 读 `#demo-amount` |
| `isZeroDecimal(currency)` | UI helper | 判断零小数位货币 |
| `validateAmount()` | UI helper | 金额校验（$1–$30,000，零小数位校验） |
| `showResult(text, type)` | UI helper | 写 `#result` 展示结果 |
| `clearLoading()` | UI helper | 清空 `#paypal-button-container` loading 状态 |
| `setupApplepay()` | setup | 检测 `ApplePaySession.supportsVersion(4)` + `canMakePayments()` → `paypalSDK.Applepay().config()` → 创建 `<apple-pay-button>` web component → 启用 `#custom-applepay-btn` |
| `onApplePayButtonClicked()` | handler | 验证金额 → 构建 `paymentRequest`（`requiredBillingContactFields`）→ `new ApplePaySession(4, ...)` → 注册 3 个事件处理器 → `session.begin()` |
| `onvalidatemerchant handler` | session event | `applepayInstance.validateMerchant({ validationUrl })` → `session.completeMerchantValidation(payload.merchantSession)` |
| `onpaymentmethodselected handler` | session event | `session.completePaymentMethodSelection({ newTotal })` |
| `onpaymentauthorized handler` | session event | createOrder → `confirmOrder({ orderId, token, billingContact, shippingContact })` → 解包 `confirmResult.approveApplePayPayment` → 检查 `.status === 'APPROVED'` → captureOrder → 检查 `COMPLETED` → `session.completePayment(STATUS_SUCCESS/FAILURE)` |

---

#### Apple Pay ECM 完整 SDK 调用链

```
window load
  ├─ [LOG] urls
  ├─ 检测 ApplePaySession.supportsVersion(4) + canMakePayments()
  ├─ paypalSDK.Applepay().config()
  │   └─ [LOG] countryCode, merchantCapabilities, supportedNetworks
  ├─ 创建 <apple-pay-button> web component（type=buy，buttonstyle=black）
  └─ 启用 #custom-applepay-btn，绑定 hover/press/click

onApplePayButtonClicked()   ← 按钮点击
  ├─ validateAmount()
  ├─ [LOG] amount, currency, value
  ├─ 构建 paymentRequest（requiredBillingContactFields: ['name','phone','email','postalAddress']）
  ├─ new ApplePaySession(4, paymentRequest)
  └─ session.begin()

onvalidatemerchant
  ├─ applepayInstance.validateMerchant({ validationUrl: event.validationURL })
  │   └─ [LOG] merchantSession
  └─ session.completeMerchantValidation(payload.merchantSession)

onpaymentmethodselected
  └─ session.completePaymentMethodSelection({ newTotal })

onpaymentauthorized                        ← 用户 Touch ID / Face ID 授权后触发
  ├─ [LOG] event.payment（token, billingContact, shippingContact）
  ├─ fetch createOrder（body: { amount, currency }）
  │   └─ [LOG] response + orderId → createdOrderId
  ├─ applepayInstance.confirmOrder({ orderId, token, billingContact, shippingContact })
  │   └─ [LOG] confirmResult → confirmResult.approveApplePayPayment, status
  ├─ 检查 confirmResult.approveApplePayPayment.status === 'APPROVED'（否则 → STATUS_FAILURE）
  ├─ fetch captureOrder（body: { orderID: createdOrderId }）
  │   └─ [LOG] order, capture 对象
  ├─ 检查 captures[0].status === 'COMPLETED'
  ├─ session.completePayment({ status: STATUS_SUCCESS })  ← 成功
  └─ showResult('✓ Payment captured · Order: <id>', 'success')

oncancel
  └─ [LOG] session cancelled
```

---

#### Apple Pay ECM vs Google Pay ECM 关键差异

| 维度 | Apple Pay ECM | Google Pay ECM |
|------|--------------|----------------|
| 外部 SDK | 无额外 script（内置于 Safari/WebKit）| `pay.google.com/gp/p/js/pay.js` |
| 按钮元素 | `<apple-pay-button>` web component + CSS | `google.payments.api.PaymentsClient().createButton()` |
| 3DS 处理 | Apple Pay 协议内部处理（无需 initiatePayerAction）| `initiatePayerAction` → GET order → 解析 `authentication_result` |
| create-order 时机 | **onpaymentauthorized 内部**（sheet 已显示 → 用户授权 → 然后 createOrder）| sheet 关闭后（loadPaymentData Promise resolve 后）→ createOrder |
| payment_source in create-order | **有**（`payment_source.apple_pay.experience_context`；token 由 confirmOrder 注入，无需指定 apple_pay token）| **有**（`payment_source.google_pay`：email、phone、experience_context、attributes） |
| 3DS 检查方式 | 无（Apple Pay 负责）| GET order details → `payment_source.google_pay.card.authentication_result` |
| completePayment 要求 | **必须始终调用** `session.completePayment()`（success 或 failure）| 无对应机制 |

### applepay-ecs — Apple Pay Express Checkout Shortcut（2026-05-28 完成）

> ECS = 买家在 Apple Pay sheet 里选择收货地址、email、电话，并选择 shipping 方式。`shippingContact` 从 `onpaymentauthorized` 提取注入 order。

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由 + API | `src/routes/paypal/jssdk-v5/applepay-ecs.js` | **自定义路由**；GET 无 sandboxShipping（买家 sheet 里选）；create-order 接收 `{ amount, currency, shippingContact, billingContact, shippingAmount }`；`mapApplePayShipping()` 转地址格式；`parseApplePayPhone()` 只返回 `{ national_number: digits }`（无 country_code）；`payment_source.apple_pay` 含 name/email/phone/experience_context；total = item + shippingAmount |
| EJS 视图 | `src/views/paypal/jssdk-v5/applepay-ecs.ejs` | `extraScripts` 加载 `apple-pay-sdk.js`；currency + amount 选择器；"Buyer selects in sheet" 信息区（shipping address / email / phone / shipping method）；`#paypal-button-container` + `#custom-applepay-btn` |
| SDK JS | `src/public/js/paypal/jssdk-v5/applepay-ecs.js` | ECS 专用；含 `SHIPPING_METHODS`、`normalizeContact()`、`fmtAmt()`、`calcTotal()` |

#### 后端 API（`applepay-ecs.js` 路由文件）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/paypal/jssdk-v5/applepay-ecs` | GET | 渲染页面（无 sandboxShipping） |
| `/api/applepay-ecs/create-order` | POST | 读 `{ amount, currency, shippingContact, billingContact, shippingAmount }`；`mapApplePayShipping(sc)` 转 PayPal shipping；`parseApplePayPhone(sc.phoneNumber)` → `{ national_number: digits }`；total = item + shipping；`payment_source.apple_pay` 含 name/email_address/phone_number/experience_context；返回 `{ id }` |
| `/api/applepay-ecs/capture-order` | POST | 读 `{ orderID }`；capture 并返回完整 order JSON |

**create-order body（`payment_source.apple_pay` 含 name/email/phone，与 ECM 不同）：**

```js
{
  intent: 'CAPTURE',
  purchase_units: [{
    reference_id, description, invoice_id, custom_id, soft_descriptor,
    amount: {
      currency_code: currency, value: totalVal,
      breakdown: {
        item_total: { currency_code, value },
        shipping:   { currency_code, value: shipVal },
      },
    },
    items:    [{ ...DEMO_ITEM, unit_amount }],
    shipping: mapApplePayShipping(shippingContact),   // 买家在 sheet 选的地址
  }],
  payment_source: {
    apple_pay: {
      ...(buyerName ? { name:          buyerName } : {}),
      ...(email     ? { email_address: email }     : {}),
      ...(phone     ? { phone_number:  phone }     : {}),  // { national_number: digits }
      experience_context: { return_url, cancel_url },
    },
  },
}
```

**地址格式转换 `mapApplePayShipping(sc)`：**

```
Apple Pay shippingContact:     →   PayPal shipping:
  givenName + familyName       →     name.full_name
  addressLines[0]              →     address.address_line_1
  locality                     →     address.admin_area_2
  administrativeArea           →     address.admin_area_1
  postalCode                   →     address.postal_code
  countryCode                  →     address.country_code
```

**电话格式转换（`parseApplePayPhone`）：**

Apple Pay `shippingContact.phoneNumber` 可能是 E.164 格式（`+14089741010`）。PayPal `payment_source.apple_pay.phone_number` 只需 `{ national_number: digits }`（无 `country_code`，与 Google Pay 不同）。

```
rawPhone: "+14089741010"
  digits = rawPhone.replace(/\D/g, '')  → "14089741010"
  return { national_number: "14089741010" }
  // 不剥离 dial code，不需要 country_code
```

前端 `normalizeContact()` 同理（剥离非数字，PayPal `confirmOrder` 内部映射会拒绝 "+"）：

```js
function normalizeContact(contact) {
  if (!contact || !contact.phoneNumber) return contact
  var phone = String(contact.phoneNumber)
  if (phone.charAt(0) !== '+') return contact
  var copy = {}
  for (var k in contact) { if (Object.prototype.hasOwnProperty.call(contact, k)) copy[k] = contact[k] }
  copy.phoneNumber = phone.replace(/\D/g, '')
  return copy
}
```

#### Apple Pay ECS vs ECM 关键差异

| 维度 | Apple Pay ECM | Apple Pay ECS |
|------|--------------|----------------|
| `requiredShippingContactFields` | 无 | `['name','phone','email','postalAddress']` |
| `shippingMethods` in paymentRequest | 无 | `[{ label, amount, detail, identifier }]` |
| `shippingType` | 无 | `'shipping'` |
| `onshippingmethodselected` | 无 | 更新 `chosenShipping`，调 `completeShippingMethodSelection({ newTotal, newLineItems })` |
| `onshippingcontactselected` | 无 | 调 `completeShippingContactSelection({ newTotal, newLineItems })`（本 demo 不按地址重算） |
| shipping 来源 | 商户预填 `SANDBOX_SHIPPING` | `event.payment.shippingContact` → `mapApplePayShipping()` |
| name/email/phone in payment_source | 无 | 从 `shippingContact` 提取 |
| total 计算 | 只含 item | item + `chosenShipping.amount`（`breakdown` 含 `shipping`） |
| `normalizeContact()` | 无需（ECM 不需剥非数字） | 需要（Apple Pay E.164 → 纯数字，`confirmOrder` 拒绝 "+"）|

---

## Google Pay（自定义路由）

### googlepay-ecm — Google Pay Express Checkout Mark（2026-05-22 完成）

> ECM = 商户侧预填收货地址，`shippingAddressRequired: false`，买家不在 Google Pay sheet 里选地址。

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由 + API | `src/routes/paypal/jssdk-v5/googlepay-ecm.js` | **自定义路由**（非工厂）；3 个 API 端点（见下）；GET handler 把 `sandboxShipping` 传给 EJS |
| EJS 视图 | `src/views/paypal/jssdk-v5/googlepay-ecm.ejs` | `extraScripts` 加载 Google Pay JS；`amount-row` 三列：Currency / Amount / **3DS**（`#demo-sca`）；只读 Shipping 展示区；`window.DEMO.urls` 含三个端点 + `window.DEMO.shipping`；`#custom-googlepay-btn`（初始 `disabled` + `opacity:0.45`，Google Pay 初始化完成后由 JS 启用） |
| SDK JS | `src/public/js/paypal/jssdk-v5/googlepay-ecm.js` | ECM 专用；全函数拆分；完整 console.log 日志；3DS 处理（GET order → 解析 google_pay.card.authentication_result）；`addGooglePayButton` 启用 `#custom-googlepay-btn` 并绑定 hover/press/click 监听器 |

---

#### 后端 API（`googlepay-ecm.js` 路由文件）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/paypal/jssdk-v5/googlepay-ecm` | GET | 渲染页面；传 `sandboxShipping`（camelCase）+ `sandboxPhone`（格式化字符串）给 EJS |
| `/api/googlepay-ecm/create-order` | POST | 读 `{ amount, currency, shipping, scaMethod, email }`；构建完整 order body（见下）；返回 `{ id }` |
| `/api/googlepay-ecm/order/:orderID` | GET | 返回完整 order JSON（用于 3DS 后读取 authentication_result） |
| `/api/googlepay-ecm/capture-order` | POST | 读 `{ orderID }`；capture 并返回完整 order JSON |

**create-order body（`payment_source.google_pay`）：**

```js
{
  intent: 'CAPTURE',
  purchase_units: [{
    reference_id:    demoParams.DEMO_REFERENCE_ID,
    description:     demoParams.DEMO_DESCRIPTION,
    invoice_id:      `INV-${Date.now()}`,
    custom_id:       demoParams.DEMO_CUSTOM_ID,
    soft_descriptor: demoParams.DEMO_SOFT_DESCRIPTOR,
    amount: { currency_code, value, breakdown: { item_total } },
    items:  [{ ...demoParams.DEMO_ITEM, unit_amount }],
    shipping: { name, address },   // 从 req.body.shipping 读，fallback demoParams.SANDBOX_SHIPPING
  }],
  payment_source: {
    google_pay: {
      ...(email ? { email_address: email } : {}),         // 从 sheet 获取，可选
      phone_number: demoParams.SANDBOX_PHONE,             // 商户预填：{ country_code: '1', national_number: '4085551234' }
      experience_context: {
        return_url: `${protocol}://${host}/paypal/jssdk-v5/googlepay-ecm`,
        cancel_url: `${protocol}://${host}/paypal/jssdk-v5/googlepay-ecm`,
      },
      attributes: { verification: { method: scaMethod } },  // SCA_WHEN_REQUIRED | SCA_ALWAYS
    }
  }
}
```

---

#### 前端函数一览（`googlepay-ecm.js`）

| 函数 | 类型 | 职责 |
|------|------|------|
| `getCurrency()` | UI helper | 读 `#demo-currency` |
| `getSCA()` | UI helper | 读 `#demo-sca` |
| `getAmount()` | UI helper | 读 `#demo-amount` |
| `validateAmount()` | UI helper | 金额校验（$1–$30,000，零小数位校验） |
| `showResult(text, type)` | UI helper | 写 `#result` 展示结果 |
| `getGooglePaymentsClient()` | singleton | 首次 new `google.payments.api.PaymentsClient`，之后返回缓存 |
| `getGooglePayConfig()` | singleton | 首次调 `paypalSDK.Googlepay().config()`，缓存 `googlepayConfig` |
| `getGoogleIsReadyToPayRequest(config)` | builder | 构建 `isReadyToPay` 请求体（`BASE_REQUEST + allowedPaymentMethods`） |
| `getGooglePaymentDataRequest(config, amount, currency)` | builder | 构建 `loadPaymentData` 请求体（含 `transactionInfo`、`shippingAddressRequired: false`）；**无 `callbackIntents`** |
| `addGooglePayButton(config)` | setup | 清容器 + `createButton()`；启用 `#custom-googlepay-btn`（opacity→1, cursor→pointer）并绑定 mouseenter/mouseleave/mousedown/mouseup/click 监听器 |
| `onGooglePaymentButtonClicked(config)` | handler | 验证金额 → **先 `loadPaymentData()`（sheet 开，含 email 字段）→ sheet 关闭后提取 `paymentData.email` → createOrder（带 email）→ processPayment**；官方按钮和 custom button 共用此函数 |
| `processPayment(paymentData)` | orchestrator | `confirmOrder` → 分支：PAYER_ACTION_REQUIRED → `initiatePayerAction` → `getOrderDetails` → `handle3DS`；其余 → `doCapture` |
| `getOrderDetails(orderID)` | fetch | GET `/api/googlepay-ecm/order/:orderID`，返回完整 order |
| `handle3DS(order)` | 3DS logic | 解析 `payment_source.google_pay.card.authentication_result`，决定是否 capture（见下） |
| `doCapture(orderID)` | fetch | POST captureOrder，校验 `captures[0].status === 'COMPLETED'` |

---

#### 3DS 处理逻辑（`handle3DS`）

**路径与 ACDC 的关键区别：**
- ACDC：`payment_source.card.authentication_result`
- Google Pay：`payment_source.google_pay.card.authentication_result`（多一层 `google_pay`）
- Google Pay 没有客户端 `liabilityShift`，必须 GET order details 后从 API 响应读取

```
handle3DS(order)
  ├─ 解析 order.payment_source.google_pay.card.authentication_result
  │   ├─ liability_shift      (ls)
  │   ├─ three_d_secure.enrollment_status   (enrollment)
  │   └─ three_d_secure.authentication_status  (authStatus)
  │
  ├─ ls === 'POSSIBLE'
  │   └─ 责任转移到发卡行 → doCapture ✅
  │
  ├─ ls === 'NO'
  │   ├─ enrollment in ['N', 'U', 'B']  → 卡未注册 → doCapture ✅
  │   └─ 其他 enrollment               → 显示错误，reject ✗
  │
  ├─ ls === 'UNKNOWN'
  │   └─ 显示"请重试"，reject ✗
  │
  └─ 其他 ls（undefined 等）
      └─ 显示错误，reject ✗
```

---

#### Promise 模式 vs Callback 模式（重要设计决策）

**当前实现：Promise 模式（`loadPaymentData` 返回 Promise，无 `paymentDataCallbacks`）**

Callback 模式问题：若在 `PaymentsClient` 构造时传入 `paymentDataCallbacks: { onPaymentAuthorized }`，并在 `paymentDataRequest` 加 `callbackIntents: ['PAYMENT_AUTHORIZATION']`，Google Pay sheet 会等待 callback 返回的 Promise resolve 后才关闭。因此当 `initiatePayerAction` 触发 3DS 验证窗口时，sheet 仍然覆盖在屏幕上，3DS 窗口被挡住无法交互，用户无法完成验证，最终 sheet 超时报错。

Promise 模式解法：不传 `paymentDataCallbacks`，不设 `callbackIntents`。用户在 sheet 里授权后，sheet 自动关闭，`loadPaymentData()` 的 Promise 才 resolve，此时屏幕干净，`initiatePayerAction` 触发的 3DS 窗口可以正常弹出并完成验证。

```
❌ Callback 模式（3DS 场景下 sheet 挡住 3DS 窗口）：
PaymentsClient({ paymentDataCallbacks: { onPaymentAuthorized } })
loadPaymentData({ callbackIntents: ['PAYMENT_AUTHORIZATION'] })
  → sheet 保持打开 → 调 onPaymentAuthorized → confirmOrder → initiatePayerAction
  → 3DS 窗口在 sheet 后面 → 超时报错

✅ Promise 模式（sheet 先关再触发 3DS）：
PaymentsClient()                        ← 无 paymentDataCallbacks
loadPaymentData()                       ← 无 callbackIntents
  → 用户授权 → sheet 自动关闭 → Promise resolve
  → processPayment → confirmOrder → initiatePayerAction
  → 3DS 窗口正常弹出 → 完成验证 → doCapture
```

---

#### 完整 SDK JS 调用链

```
window load
  ├─ [LOG] urls, shipping
  ├─ getGooglePayConfig()              ← 首次调 paypalSDK.Googlepay().config()，缓存结果
  │   └─ [LOG] config（allowedPaymentMethods、merchantInfo、apiVersion）
  ├─ getGooglePaymentsClient()         ← new PaymentsClient（无 paymentDataCallbacks）
  │   └─ [LOG] paymentsClient
  ├─ getGoogleIsReadyToPayRequest()    ← 构建 isReadyToPay 请求体
  ├─ isReadyToPay()
  │   └─ [LOG] 响应
  └─ addGooglePayButton(config)        ← 清容器，createButton；启用 #custom-googlepay-btn，绑定 hover/press/click

onGooglePaymentButtonClicked(config)   ← 按钮点击
  ├─ validateAmount()
  ├─ [LOG] amount, currency, sca, shipping (merchant pre-filled)
  ├─ getGooglePaymentDataRequest()     ← 构建 loadPaymentData 请求体（含 emailRequired:true，无 callbackIntents）
  ├─ loadPaymentData()                 ← 先开 sheet（让买家输入 email）；用户授权后 sheet 自动关闭
  └─ .then(paymentData)                ← sheet 已关闭，email 可读
      ├─ [LOG] paymentData, email from sheet
      ├─ fetch createOrder（body: { amount, currency, shipping, scaMethod, email }）
      │   └─ [LOG] 请求体 + 响应 + orderId → currentOrderID
      └─ processPayment(paymentData)
          ├─ confirmOrder({ orderId, paymentMethodData })
          │   └─ [LOG] result, status
          ├─ if PAYER_ACTION_REQUIRED
          │   ├─ initiatePayerAction({ orderId })
          │   │   └─ [LOG] completed
          │   ├─ getOrderDetails(orderId)
          │   │   └─ [LOG] GET url + 完整 order 响应
          │   └─ handle3DS(order)
          │       ├─ [LOG] authResult, ls, enrollment, authStatus
          │       └─ → doCapture 或 reject
          └─ else → doCapture(orderId)

doCapture(orderID)
  ├─ [LOG] orderID, captureOrder API
  ├─ fetch captureOrder
  │   └─ [LOG] 完整响应
  ├─ [LOG] capture 对象
  └─ status === 'COMPLETED' → [LOG] + showResult ✅  |  否则 error ✗
```

**前提条件：** Chrome、Google Pay 账户绑定测试卡、localhost（Google Pay TEST 环境允许）

---

### googlepay-ecs — Google Pay Express Checkout Shortcut（2026-05-28 更新：shipping 方式选择）

> ECS = 买家在 Google Pay sheet 里选择收货地址 + 输入 email + 电话 + 选择运费方式。订单在 sheet 关闭后才创建（与 ECM 相反）。

| 文件 | 路径 | 关键内容 |
|------|------|---------|
| 路由 + API | `src/routes/paypal/jssdk-v5/googlepay-ecs.js` | **自定义路由**；`mapGooglePayAddress()` 转换地址格式；create-order 接收 `{ amount, currency, scaMethod, shippingAddress, buyerName, email, parsedPhone, shippingAmount }`；total = item + shippingAmount；breakdown 含 `shipping` 字段 |
| EJS 视图 | `src/views/paypal/jssdk-v5/googlepay-ecs.ejs` | 无 Shipping Address 展示区，改为"Buyer selects in sheet"提示面板（含 Shipping method）；结构与 ECM 相同（currency/amount/3DS 选择器，custom button） |
| SDK JS | `src/public/js/paypal/jssdk-v5/googlepay-ecs.js` | ECS 专用；含 `SHIPPING_OPTIONS`（Standard $5 / Express $10）、`chosenShipping` 模块状态、`fmtAmt`/`calcTotal` 工具函数；**Full Callback 模式**：`PaymentsClient` 含 `paymentDataCallbacks: { onPaymentAuthorized, onPaymentDataChanged }`；`callbackIntents: ['SHIPPING_ADDRESS', 'SHIPPING_OPTION', 'PAYMENT_AUTHORIZATION']`（三个 intent 缺一不可，只要注册 paymentDataCallbacks 就必须有 PAYMENT_AUTHORIZATION，否则 OR_BIBED_06）；`onPaymentAuthorized`：用户授权后 Google Pay 调用，sheet 转为处理中状态，createOrder 在此回调内执行，返回 `Promise<{ transactionState: 'SUCCESS'\|'ERROR' }>`；`onPaymentDataChanged`：INITIALIZE/SHIPPING_ADDRESS→返回 `{newTransactionInfo, newShippingOptionParameters}`，SHIPPING_OPTION→仅返回 `{newTransactionInfo}`；`shippingOptions` 只含 `{id, label, description}`（不能有 price/selected）；`COUNTRY_DIAL` + `parsePhoneNumber()`；3DS 路径与 ECM 相同 |

---

#### 后端 API（`googlepay-ecs.js` 路由文件）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/paypal/jssdk-v5/googlepay-ecs` | GET | 渲染页面（无 sandboxShipping 传入 EJS） |
| `/api/googlepay-ecs/create-order` | POST | 读 `{ amount, currency, scaMethod, shippingAddress, buyerName, email, parsedPhone, shippingAmount }`；`mapGooglePayAddress()` 转换地址；计算 `shipVal` + `totalVal`；注入 `payment_source.google_pay.name/email_address/phone_number`；amount breakdown 含 `shipping`；返回 `{ id }` |
| `/api/googlepay-ecs/order/:orderID` | GET | 返回完整 order JSON（3DS 后读取） |
| `/api/googlepay-ecs/capture-order` | POST | 读 `{ orderID }`；capture 并返回 |

**地址格式转换 `mapGooglePayAddress(sh)`：**

```
Google Pay shippingAddress:           →   PayPal shipping:
  name                                →     name.full_name
  address1                            →     address.address_line_1
  address2 (可选)                     →     address.address_line_2
  locality                            →     address.admin_area_2
  administrativeArea                  →     address.admin_area_1
  postalCode                          →     address.postal_code
  countryCode                         →     address.country_code
```

**create-order body（含 shippingAmount breakdown）：**

```js
amount: {
  currency_code: currency,
  value: totalVal,   // item + shippingAmount
  breakdown: {
    item_total: { currency_code, value },
    shipping:   { currency_code, value: shipVal },
  },
},

payment_source: {
  google_pay: {
    ...(buyerName   ? { name:          buyerName   } : {}),
    ...(email       ? { email_address: email       } : {}),
    ...(parsedPhone ? { phone_number:  parsedPhone } : {}),
    // parsedPhone = { country_code: '1', national_number: '4155552671' }
    experience_context: { return_url, cancel_url },
    attributes: { verification: { method: scaMethod } },
  }
}
```

---

#### 运费选择（`onPaymentDataChanged`）

```
SHIPPING_OPTIONS = [
  { id: 'standard', label: 'Standard Shipping', description: 'Arrives in 5–7 days', price: '5.00' },
  { id: 'express',  label: 'Express Shipping',  description: 'Arrives in 2–3 days', price: '10.00' },
]

// Google Pay API 规则：shippingOptions 对象只能含 {id, label, description}
// 不能有 price、selected 等字段（无效字段会被 Google Pay 拒绝）

onPaymentDataChanged 按 callbackTrigger 分支处理：

  INITIALIZE / SHIPPING_ADDRESS：
    → 初始化运费选项 + 更新总价（chosenShipping 保持默认 SHIPPING_OPTIONS[0]）
    → 返回 Promise.resolve({
        newTransactionInfo: {
          totalPriceStatus: 'FINAL',
          totalPrice: fmtAmt(item + chosenShipping.price),
          displayItems: [{ label:'Item total', type:'SUBTOTAL', price: itemPrice },
                         { label: chosenShipping.label, type:'LINE_ITEM', price: chosenShipping.price }],
        },
        newShippingOptionParameters: {
          defaultSelectedOptionId: chosenShipping.id,
          shippingOptions: [{ id, label, description }, ...],   // 只含三字段
        },
      })

  SHIPPING_OPTION：
    → 更新 chosenShipping（按 shippingOptionData.id 匹配）
    → 只返回 Promise.resolve({
        newTransactionInfo: { totalPriceStatus:'FINAL', totalPrice: item+chosenShipping.price, ... },
        // 不返回 newShippingOptionParameters（Google Pay API 规则：SHIPPING_OPTION 时不需传选项列表）
      })

PaymentsClient 构建时 paymentDataCallbacks: { onPaymentAuthorized, onPaymentDataChanged }
getGooglePaymentDataRequest 加：
  shippingOptionRequired: true
  shippingOptionParameters: { defaultSelectedOptionId, shippingOptions: [{id,label,description},...] }
  totalPriceStatus: 'ESTIMATED'   // 初始请求：总价还会因运费变化（不能用 FINAL）
  callbackIntents: ['SHIPPING_ADDRESS', 'SHIPPING_OPTION', 'PAYMENT_AUTHORIZATION']
    // SHIPPING_ADDRESS：触发 INITIALIZE 回调（sheet 打开时立即展示运费选项）
    // SHIPPING_OPTION：触发运费切换回调
    // PAYMENT_AUTHORIZATION：只要注册 paymentDataCallbacks 就必须加，否则 OR_BIBED_06
```

**Google Pay API 强制规则（OR_BIBED_06 根因）**：只要构造 `PaymentsClient` 时传入 `paymentDataCallbacks`（哪怕只有 `onPaymentDataChanged`），`callbackIntents` 就**必须**包含 `'PAYMENT_AUTHORIZATION'`，且**必须**提供 `onPaymentAuthorized`。违反此规则时 Google Pay 返回 OR_BIBED_06。

---

#### 电话格式转换（`parsePhoneNumber`）

Google Pay 返回 E.164 格式（`+14155552671`），PayPal 需要 `{ country_code, national_number }`。

```
rawPhone: "+14155552671"  +  isoCountry: "US"
  1. digits = rawPhone.replace(/\D/g, '')     → "14155552671"
  2. dialCode = COUNTRY_DIAL["US"]            → "1"
  3. digits 以 dialCode 开头 → strip prefix  → "4155552671"
  4. return { country_code: "1", national_number: "4155552671" }
```

`COUNTRY_DIAL` 覆盖 30 种货币对应国家：AE/AU/BR/CA/CH/CL/CN/CO/CZ/DK/DE/FR/GB/HK/HU/ID/IL/IN/JP/KR/MX/MY/NO/NZ/PE/PH/PL/SA/SE/SG/TH/TW/UY/US

---

#### ECS vs ECM 关键差异

| 维度 | ECM | ECS |
|------|-----|-----|
| `shippingAddressRequired` | `false` | `true` |
| `emailRequired` | `true` | `true` |
| `phoneNumberRequired` | N/A（tied to shipping） | `true`（在 `shippingAddressParameters` 里） |
| `shippingOptionRequired` | 无 | `true` |
| `callbackIntents` | 无 | `['SHIPPING_ADDRESS', 'SHIPPING_OPTION', 'PAYMENT_AUTHORIZATION']` |
| `paymentDataCallbacks` | 无 | `{ onPaymentAuthorized, onPaymentDataChanged }` |
| `onPaymentAuthorized` | 无 | 用户授权后 Google Pay 调用；sheet 转为处理中状态；createOrder 在此执行；返回 `Promise<{transactionState}>` |
| 订单创建时机 | sheet 关闭后（loadPaymentData Promise resolve 后） | `onPaymentAuthorized` 回调内（sheet 保持处理中状态） |
| 地址来源 | 商户预填（`SANDBOX_SHIPPING`） | 买家在 sheet 里选 |
| name 来源 | 无（ECM 不收 buyer name） | `paymentData.shippingAddress.name` |
| email 来源 | `paymentData.email`（sheet 收集） | `paymentData.email`（sheet 收集） |
| phone 来源 | 商户预填（`SANDBOX_PHONE`） | `paymentData.shippingAddress.phoneNumber`（sheet 收集）→ `parsePhoneNumber()` |
| shipping 金额来源 | 无（item only）| 买家在 sheet 选运费方式 → `paymentData.shippingOptionData.id` |
| total 计算 | item only | item + `chosenShipping.price`（breakdown 含 `shipping`） |
| `payment_source.google_pay` | `email_address` + `phone_number: SANDBOX_PHONE` | `name` + `email_address` + `phone_number`（解析后）|

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
| SDK JS | `src/public/js/paypal/jssdk-v5/applepay-ecm.js` | `applepay-ecm.js` 目前只含 ECM 逻辑；vault-applepay 需独立实现或扩展 |

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

每个产品的 SDK URL 格式：`https://www.paypal.com/sdk/js?client-id=<ID>&<sdkParams>&currency=<CURRENCY>`
（factory 动态注入 currency，sdkParams 不用再写 currency=）

| 产品 | sdkParams（当前实际值） | 关键说明 |
|------|------------------------|---------|
| **spb-ecm** | `components=buttons&commit=true&buyer-country=US&disable-funding=bancontact,blik,eps,giropay,ideal,mercadopago,mybank,p24,sepa,sofort` | ECM：`commit=true` 显示 "Pay Now" |
| **spb-ecs** | `components=buttons&commit=false&buyer-country=US&disable-funding=bancontact,blik,eps,giropay,ideal,mercadopago,mybank,p24,sepa,sofort` | ECS：`commit=false` 显示 "Continue" |
| **buttons** | CN: `components=buttons,funding-eligibility&commit=true&buyer-country=US&disable-funding=bancontact,blik,eps,giropay,ideal,mercadopago,mybank,p24,sepa,sofort&currency=${currency}` / US: 同 CN + `&enable-funding=venmo` | 双 SDK，`funding-eligibility` 组件必须，`isEligible()` 依赖它；currency 由路由注入 |
| **acdc** | `components=card-fields` | 不能和 buttons 混用 |
| **applepay-ecm** | `components=applepay&currency=${currency}` + extraScripts: `applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js` | 自定义路由；需 Safari + Apple Wallet |
| **applepay-ecs** | `components=applepay&currency=${currency}` + extraScripts: `applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js` | 自定义路由；ECS 流程；`shippingMethods` 选择；`normalizeContact()` 剥非数字；buyer 在 sheet 选地址/email/phone |
| **googlepay-ecm** | `components=googlepay&currency=${currency}` + extraScripts: `pay.google.com/gp/p/js/pay.js` | 自定义路由；需 Chrome + Google Pay 卡；3DS select `#demo-sca` |
| **googlepay-ecs** | `components=googlepay&currency=${currency}` + extraScripts: `pay.google.com/gp/p/js/pay.js` | 自定义路由；`shippingAddressRequired: true` + `shippingOptionRequired: true`；Full Callback 模式；`callbackIntents:['SHIPPING_ADDRESS','SHIPPING_OPTION','PAYMENT_AUTHORIZATION']`；`onPaymentAuthorized`（createOrder 在内）+ `onPaymentDataChanged`（运费动态更新）；email + phone + name + 运费方式从 sheet 获取 |
| **vault-paypal-with-purchase** | `components=buttons&vault=true` | vault=true 才能 store_in_vault |
| **vault-acdc-with-purchase** | `components=card-fields&vault=true` | |
| **vault-applepay-with-purchase** | `components=applepay&vault=true` | |
| **vault-paypal-setup-only** | `components=buttons&vault=true` | 路由文件中手动构建完整 sdkUrl |
| **vault-acdc-setup-only** | `components=card-fields&vault=true` | 同上 |
| **vault-return** | 无 SDK（server-side only）| 不加载任何 SDK |

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

---

## 加载与调用链（以 SPB ECM 为例）

### 阶段一：服务器启动

```
node src/app.js
  │
  ├─ require('dotenv').config()              ← 加载 .env 环境变量
  │
  ├─ require('./config/products')            ← 定义 loadProductConfig、getProduct 等函数
  │   └─ require('@supabase/supabase-js')
  │   └─ require('ws')                       ← Node 20 WebSocket polyfill
  │
  ├─ require('./config/paypal')              ← 定义 getCNToken、getUSToken（含 8h 缓存）
  │
  ├─ require('./routes/paypal/jssdk-v5/spb-ecm')
  │   └─ 立即调用 createStandardRoute({ productKey, sdkParams, view })
  │       └─ _factory.js 注册三条路由到 router：
  │           ├─ GET  /spb-ecm
  │           ├─ POST /api/spb-ecm/create-order
  │           └─ POST /api/spb-ecm/capture-order
  │
  ├─ app.use('/paypal/jssdk-v5', router)    ← 路由挂载到 Express
  │
  ├─ loadProductConfig()                     ← 从 Supabase demohub.products 读取数据
  │   └─ 写入内存 Map：
  │       key = 'paypal/jssdk-v5/spb-ecm'
  │       value = { displayName, description, enabled, sortOrder, ... }
  │
  └─ app.listen(3000)                        ← 开始监听请求
```

---

### 阶段二：浏览器请求页面（GET /paypal/jssdk-v5/spb-ecm）

```
浏览器
  │  GET /paypal/jssdk-v5/spb-ecm
  ▼
Express → _factory.js GET handler
  ├─ getProduct('paypal','jssdk-v5','spb-ecm')  ← 读内存 Map
  ├─ getProviderProducts('paypal')               ← 读内存 Map（侧边栏数据）
  └─ res.render('paypal/jssdk-v5/spb-ecm', vars)
      │
      ▼  EJS 服务端渲染顺序（从上到下拼 HTML）
      │
      1. include('../../partials/header')
      │   └─ 输出：
      │       <html><head>
      │         <link href="/css/base.css">
      │         <link href="/css/layout.css">
      │         <link href="/css/sandbox.css">
      │         <script src="/js/theme.js">           ← 主题切换（立即执行）
      │         <script src="paypal.com/sdk/js?...">  ← PayPal SDK
      │       </head><body>
      │         <nav class="topbar">...</nav>
      │         <div class="sidebar">...</div>        ← 侧边栏（sidebarProducts 数据）
      │         <nav class="breadcrumb">...</nav>
      │         <div class="tab-bar">...</div>
      │
      2. spb-ecm.ejs 主体
      │   └─ 输出：
      │       <div class="sandbox-page">
      │         <div id="paypal-button-container" class="sdk-loading">
      │           <div class="sdk-spinner"></div>     ← loading spinner
      │         </div>
      │         <div id="result"></div>
      │       </div>
      │
      3. 内联 <script>
      │   └─ window.DEMO = { urls: { createOrder, captureOrder } }
      │                                               ← 注入 API 端点配置
      4. <script src="/js/paypal/jssdk-v5/spb.js">   ← 引入静态 JS 文件
      │
      5. include('../../partials/footer')
          └─ 输出：</div></div></body></html>
```

---

### 阶段三：浏览器执行（脚本按顺序执行）

```
HTML 解析完成，浏览器按 <script> 出现顺序执行：

Step 1  /js/theme.js
        └─ 同步执行：读 localStorage，设 data-theme，注册 #theme-toggle 点击事件

Step 2  paypal.com/sdk/js?client-id=...&components=buttons
        └─ 异步加载：创建全局 window.paypalSDK

Step 3  window.DEMO = { urls: { createOrder: '...', captureOrder: '...' } }
        └─ 同步执行：API 端点写入全局变量

Step 4  /js/paypal/jssdk-v5/spb.js
        └─ 同步执行 IIFE：
            └─ window.addEventListener('load', callback)
               （回调延迟到页面完全加载后才执行）

Step 5  页面 load 事件触发
        └─ spb.js 的 callback 执行：
            ├─ container.classList.remove('sdk-loading')  ← 移除 spinner
            ├─ container.innerHTML = ''                   ← 清空容器
            ├─ 读取 window.DEMO.urls
            └─ paypalSDK.Buttons({
                 createOrder: fn,
                 onApprove:   fn,
                 onError:     fn,
               }).render('#paypal-button-container')      ← 渲染 PayPal 按钮
```

---

### 阶段四：用户点击支付

```
用户点击 PayPal 按钮
  │
  ▼
paypalSDK 触发 createOrder callback（定义在 spb.js）
  └─ fetch('POST /paypal/jssdk-v5/api/spb-ecm/create-order')
      │
      ▼
Express → _factory.js POST create-order handler
  ├─ getCNToken()                                ← 取缓存 token（过期才重新获取）
  ├─ fetch('POST paypal-api/v2/checkout/orders') ← 调用 PayPal REST API
  │   body: { intent:'CAPTURE', purchase_units:[{ amount:{ value:'1.00' } }] }
  └─ res.json({ id: order.id })
      │
      ▼
paypalSDK 收到 order.id → 弹出 PayPal 结账窗口
用户在 PayPal 弹窗里登录并确认支付
      │
      ▼
paypalSDK 触发 onApprove callback（定义在 spb.js）
  └─ fetch('POST /paypal/jssdk-v5/api/spb-ecm/capture-order', { orderID })
      │
      ▼
Express → _factory.js POST capture-order handler
  ├─ getCNToken()                                ← 取缓存 token
  ├─ fetch('POST paypal-api/v2/checkout/orders/{id}/capture')
  └─ res.json(captureResult)
      │
      ▼
spb.js onApprove callback 收到结果
  ├─ 检查 purchase_units[0].payments.captures[0].status === 'COMPLETED'
  │   非 COMPLETED → showResult('✗ Capture failed · status: ...', 'error')
  └─ COMPLETED → showResult('✓ Payment captured · Order: ' + order.id, 'success')
```

---

### 依赖关系总图

```
服务端依赖：
┌─────────────────────────────────────────────────────┐
│                     app.js                          │
│                       │                             │
│         ┌─────────────┼─────────────┐               │
│         ▼             ▼             ▼               │
│  config/products   config/paypal  routes/*/         │
│  (Supabase client) (token cache)  spb-ecm.js        │
│         │                            │              │
│    (启动时读取)                  _factory.js         │
│    内存 Map                     (注册路由)           │
│    ┌─────────────────────────────────┘              │
│    │ GET handler：读 Map → res.render               │
│    │ POST handler：getCNToken → 调 PayPal API       │
└────┼────────────────────────────────────────────────┘
     │
     ▼ （HTTP 响应 HTML）

浏览器依赖：
┌─────────────────────────────────────────────────────┐
│  header.ejs 输出的 HTML                              │
│    │                                                 │
│    ├─ /css/base.css  layout.css  sandbox.css        │
│    ├─ /js/theme.js              ← 同步立即执行        │
│    ├─ paypal.com/sdk/js?...     ← 创建 paypalSDK    │
│    └─ window.DEMO = {...}       ← 注入 API 配置      │
│                                                      │
│  /js/paypal/jssdk-v5/spb.js                         │
│    读取 window.DEMO.urls  ──────────────────────┐   │
│    调用 paypalSDK.Buttons()                      │   │
│         │                                        │   │
│         ▼ 用户点击                               │   │
│    createOrder → fetch(window.DEMO.urls.*)  ◄───┘   │
│    onApprove   → fetch(window.DEMO.urls.*)          │
└─────────────────────────────────────────────────────┘
```

---

### 不同产品的差异点

| 产品 | 阶段一差异 | 阶段三差异 | 阶段四差异 |
|------|-----------|-----------|-----------|
| spb-ecm | `createStandardRoute` | `paypalSDK.Buttons().render()` | `/v2/checkout/orders` create + capture |
| spb-ecs | `createStandardRoute` + `orderBody`（PAY_NOW） | 同 ECM（共用 spb.js） | 同 ECM（order body 不同） |
| acdc | 自定义路由，`components=card-fields` | `paypalSDK.CardFields()`，`cardFields.submit()` | 同 ECM（同 REST API） |
| buttons | 自定义路由，双 SDK（cnSdkUrl + usSdkUrl） | 4 个 `Buttons()` 分别 render | 两套 token：getCNToken/getUSToken |
| vault-*-with-purchase | `createVaultWithPurchaseRoute`，`payment_source` 含 vault 指令 | 同对应产品的 JS | capture 返回值含 `vaultId` |
| vault-*-setup-only | 自定义路由，`/v3/vault/setup-tokens` | `Buttons({ createVaultSetupToken })` | 无 capture，返回 `paymentTokenId` |
| applepay-ecm | 自定义路由，`components=applepay`；Apple Pay button CSS from `applepay.cdn-apple.com` | `setupApplepay()` → `ApplePaySession` → `validateMerchant` → `completeMerchantValidation` | **onpaymentauthorized 内**：createOrder（含 `payment_source.apple_pay.experience_context`）→ `confirmOrder({ orderId, token, billingContact, shippingContact })` → 解包 `confirmResult.approveApplePayPayment` → 检查 `APPROVED` → capture；3DS 由 Apple Pay 协议内部处理；`session.completePayment()` 必须始终调用 |
| applepay-ecs | 自定义路由，`components=applepay`；双按钮（`<apple-pay-button>` + `#custom-applepay-btn`） | `setupApplepay()` → `ApplePaySession`（含 `shippingMethods`、`requiredShippingContactFields`）；`onshippingmethodselected` + `onshippingcontactselected` 更新 total/lineItems | **onpaymentauthorized 内**：提取 shippingContact → createOrder（`mapApplePayShipping` + `parseApplePayPhone`→`{national_number}` → `payment_source.apple_pay` 含 name/email/phone）→ `confirmOrder({ orderId, token, billingContact: normalizeContact(bc), shippingContact: normalizeContact(sc) })` → 解包 `confirmResult.approveApplePayPayment` → 检查 `APPROVED` → capture → COMPLETED |
| googlepay-ecm | 自定义路由，`components=googlepay`，双外部 SDK（PayPal + Google Pay） | sheet 先开（`emailRequired:true`）→ 获取 email → createOrder（email + SANDBOX_PHONE 注入 payment_source）→ processPayment → confirmOrder → doCapture | `shippingAddressRequired: false`；**Promise 模式**；phone 商户预填 SANDBOX_PHONE；email 从 sheet 获取；3DS 需 GET order details |
| googlepay-ecs | 自定义路由，同 ECM 双外部 SDK | **Full Callback 模式**（paymentDataCallbacks:{ onPaymentAuthorized, onPaymentDataChanged }；callbackIntents:['SHIPPING_ADDRESS','SHIPPING_OPTION','PAYMENT_AUTHORIZATION']）；sheet 先开 → 买家选地址/email/phone/运费方式 → 用户授权 → `onPaymentAuthorized`：createOrder（含 shippingAmount）→ processPayment | address 由买家在 sheet 选；name/email/phone/shippingAmount 全部注入 create-order；total = item + shipping；payment_source.google_pay 含 name/email/phone；3DS 路径同 ECM（onPaymentAuthorized 运行时 sheet 转为处理中状态，3DS popup 可正常弹出）|
| vault-return | 自定义路由，`/v2/checkout/orders` + capture 一步完成 | 无 SDK，纯 fetch | 无 PayPal 弹窗，纯服务端 |

---

## Order Body 定制指南

每个 demo 的 PayPal `create-order` body 参数不同。**推荐用 `buildBody` 模式**，所有参数在产品路由文件一个地方定义。

### `buildBody(amount, currency)` — 推荐模式

适用：所有工厂路由产品（spb-ecm/ecs、applepay、googlepay、vault-with-purchase 等）

```js
// routes/paypal/jssdk-v5/<product>.js
const { createStandardRoute } = require('./_factory')
const C = require('../../../config/constants')  // 整个文件引入，用 C.xxx 引用

module.exports = createStandardRoute({
  productKey: 'spb-ecm',
  sdkParams:  'components=buttons',
  view:       'paypal/jssdk-v5/spb-ecm',

  buildBody: function (amount, currency) {
    // amount + currency 由工厂从前端请求注入，其余字段自定义
    return {
      intent: C.INTENT.CAPTURE,
      payment_source: {          // 产品专属：experience_context、email 等
        paypal: {
          experience_context: {
            brand_name:  'My Store',
            user_action: 'PAY_NOW',
            landing_page: 'LOGIN',
          }
        }
      },
      purchase_units: [{
        reference_id:   '01234567',       // 产品专属字段
        description:    C.DEMO_DESCRIPTION,
        invoice_id:     'INV-' + Date.now(),
        custom_id:      'MemberNumber00001',
        soft_descriptor: 'SDCW',
        amount: {
          currency_code: currency,
          value:         amount,
          breakdown: { item_total: { currency_code: currency, value: amount } }
        },
        items: [{
          name:        'Monkey Toy',
          sku:         'sku01',
          quantity:    '1',
          unit_amount: { currency_code: currency, value: amount }
        }],
        shipping: {                        // 自定义收货地址，或用 C.SANDBOX_SHIPPING
          name:    { full_name: 'Test Buyer' },
          address: { address_line_1: 'Via Silvio Spaventa, 97', admin_area_2: 'Naples', country_code: 'IT', postal_code: '80166' }
        }
      }]
    }
  },
})
```

**工厂的调用逻辑（_factory.js POST handler）：**
```js
// 有 buildBody → 调用它（产品完全控制 body）
// 无 buildBody → 调用 buildOrderBody（标准 body，向后兼容）
const body = typeof buildBody === 'function'
  ? buildBody(amount, currency)
  : buildOrderBody(amount, { currency, topLevel: orderBody })
```

### 自定义路由产品（直接改 POST handler）

适用：buttons, acdc, vault-*-setup-only, vault-return（这些本身就是自定义路由）

```js
// routes/paypal/jssdk-v5/<product>.js 里的 POST handler
const C = require('../../../config/constants')

router.post('/api/<product>/create-order', async (req, res) => {
  const amount   = req.body.amount   || C.DEFAULT_AMOUNT
  const currency = req.body.currency || C.DEFAULT_CURRENCY
  const body = C.buildOrderBody(amount, { currency })
  // 或直接手写完整 body
})
```

### 常用 body 参数参考

```js
{
  intent: C.INTENT.CAPTURE,       // 'CAPTURE' | 'AUTHORIZE'

  payment_source: {
    paypal: {
      experience_context: {
        brand_name:                'My Store',
        user_action:               'PAY_NOW',      // 'PAY_NOW' | 'CONTINUE'
        landing_page:              'LOGIN',         // 'LOGIN' | 'GUEST_CHECKOUT'
        shipping_preference:       'SET_PROVIDED_ADDRESS',
        return_url: 'https://example.com/return',
        cancel_url: 'https://example.com/cancel',
      },
      email_address: 'buyer@example.com',          // 预填买家邮箱
      name: { given_name: 'John', surname: 'Doe' },
      attributes: {
        vault: { store_in_vault: 'ON_SUCCESS' }    // Vault 才加
      }
    }
  },

  purchase_units: [{
    reference_id:    '01234567',
    description:     C.DEMO_DESCRIPTION,
    invoice_id:      'INV-001',
    custom_id:       'MemberNumber00001',
    soft_descriptor: 'SDCW',
    amount: {
      currency_code: currency,
      value:         amount,
      breakdown: { item_total: { currency_code: currency, value: amount } }
    },
    items: [{
      name: 'Demo Item', sku: 'sku01', quantity: '1',
      unit_amount: { currency_code: currency, value: amount }
    }],
    shipping: C.SANDBOX_SHIPPING,  // 或自定义地址
  }]
}
```

### 修改文件速查

| 场景 | 修改文件 |
|------|---------|
| 工厂产品改 body（任何字段）| **`routes/paypal/jssdk-v5/<product>.js`** → `buildBody` 函数（唯一入口）|
| 自定义产品改 body | `routes/paypal/jssdk-v5/<product>.js` → POST handler |
| 所有产品通用默认值（DEMO_ITEM 等）| `config/constants.js` |
| 金额/币种从前端传入 | 已实现：`req.body.amount` + `req.body.currency`，`buildBody(amount, currency)` 接收 |

### `buildBody` 迁移状态

**规范：所有工厂路由必须使用 `buildBody`，常量用 `const demoParams = require('.../constants')` 引入。**

| 产品路由文件 | 类型 | `buildBody` 状态 |
|------------|------|----------------|
| `spb-ecm.js` | 工厂 | ✅ 已迁移 |
| `spb-ecs.js` | 工厂 | ⏳ 待迁移 |
| `applepay-ecm.js` | **自定义** | N/A（直接控制 POST handler）|
| `applepay-ecs.js` | **自定义** | N/A（直接控制 POST handler）|
| `googlepay-ecm.js` | 自定义（已改） | N/A（直接控制 POST handler）|
| `googlepay-ecs.js` | **自定义**（已改） | N/A（直接控制 POST handler）|
| `vault-paypal-with-purchase.js` | 工厂 | ⏳ 待迁移 |
| `vault-acdc-with-purchase.js` | 工厂 | ⏳ 待迁移 |
| `vault-applepay-with-purchase.js` | 工厂 | ⏳ 待迁移 |
| `buttons.js` | 自定义 | N/A（直接控制 POST handler）|
| `acdc.js` | 自定义 | N/A |
| `vault-paypal-setup-only.js` | 自定义 | N/A（无 purchase body）|
| `vault-acdc-setup-only.js` | 自定义 | N/A |
| `vault-return.js` | 自定义 | N/A |

---

## Capture 成功判断规则（2026-05-21）

**所有前端 JS 文件中，capture order 成功必须验证 `purchase_units[0].payments.captures[0].status === 'COMPLETED'`。**

- 禁止用 `order.status`（订单级状态，不代表扣款成功）
- 禁止仅靠 `order.error` 缺失判断成功
- 非 COMPLETED 状态（如 DECLINED、PENDING）必须显示错误

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
showResult('✓ Payment captured · Order: ' + order.id, 'success')
```

| 文件 | 位置 | 状态 |
|------|------|------|
| `spb.js` | `onApprove` 内联 capture | ✅ 已更新 |
| `buttons.js` | `capture()` 共享函数 | ✅ 已更新 |
| `acdc.js` | `doCapture()` helper | ✅ 已更新 |
| `vault-return.js` | `createAndCapture` 回调 | ✅ 已更新 |
| `vault-setup.js` | 无 capture（纯签约） | N/A |

---

## 常量文件与动态金额（2026-05-18）

> 完整设计：`docs/design/2026-05-18-design-be-dynamic-amount-and-constants.md`

### 新增文件：`src/config/constants.js`

所有路由文件通过此文件统一引用 PayPal API 参数，不再硬编码：

```js
const { INTENT, CURRENCY, DEFAULT_AMOUNT, buildOrderBody,
        SANDBOX_SHIPPING, SANDBOX_BILLING } = require('../../../config/constants')
```

| 导出 | 类型 | 说明 |
|------|------|------|
| `INTENT` | 对象 | `{ CAPTURE, AUTHORIZE }` |
| `CURRENCY` | 对象 | `{ USD, CNY, EUR, GBP }` |
| `ITEM_CATEGORY` | 对象 | `{ PHYSICAL, DIGITAL }` |
| `DEFAULT_AMOUNT` | 字符串 | `'100.00'` |
| `DEFAULT_CURRENCY` | 字符串 | `'USD'` |
| `DEMO_DESCRIPTION` | 字符串 | 出现在 PayPal 结账页的订单描述 |
| `DEMO_ITEM` | 对象 | 商品名称、描述、类目、数量 |
| `SANDBOX_SHIPPING` | 对象 | 预填收货地址（US sandbox 地址，CN 账户通用） |
| `SANDBOX_PHONE` | 对象 | 商户预填电话，格式 `{ country_code: '1', national_number: '4085551234' }`；用于 Google Pay ECM `payment_source.google_pay.phone_number` |
| `VENMO_SHIPPING` | 对象 | Venmo 专用收货地址（`test / Trumbull, AL 06611, US`） |
| `SANDBOX_BILLING` | 对象 | 账单地址（ACDC `payment_source.card.billing_address`）|
| `ACDC_EXPERIENCE_CONTEXT` | 对象 | ACDC 卡支付 `return_url` / `cancel_url` |
| `buildOrderBody(amount, overrides)` | 函数 | 统一组装 PayPal order body |

### `buildOrderBody` 调用方式

```js
// 标准场景（工厂路由）
buildOrderBody(amount)

// Vault with-purchase（需要 payment_source 在 purchase_unit 内）
buildOrderBody(amount, {
  purchaseUnit: { payment_source: { paypal: { attributes: { vault: {...} } } } }
})

// 覆盖顶层字段
buildOrderBody(amount, {
  topLevel: { payment_source: { token: { id, type } } }
})
```

### 动态金额输入框

所有有购买行为的 demo 页面在 sandbox-card 内加金额输入框：

- 位置：`amount-display` 区域改为输入框
- 默认值：`100.00`
- 验证：正数、最多两位小数、最小 $0.01，blur 时自动格式化
- 传参：`createOrder` callback 读 `#demo-amount` 值，放入 fetch body `{ amount }`

### 不加输入框的页面

- `vault-paypal-setup-only.ejs` — 纯签约，无购买金额
- `vault-acdc-setup-only.ejs` — 纯签约，无购买金额
