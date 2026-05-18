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
  └─ showResult('✓ Payment captured · Order: ' + order.id, 'success')
     └─ 更新页面上 #result 元素的样式和文字
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
| vault-return | 自定义路由，`/v2/checkout/orders` + capture 一步完成 | 无 SDK，纯 fetch | 无 PayPal 弹窗，纯服务端 |
