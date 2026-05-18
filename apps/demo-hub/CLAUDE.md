# CLAUDE.md — demo-hub

> 派生自根目录 `CLAUDE.md`，聚焦 demo-hub app。根 CLAUDE.md 的所有通用规则在此同样适用。

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

大多数标准产品路由通过工厂函数创建，避免重复代码：

```js
// _factory.js 提供的工厂函数：
createStandardRoute({ productKey, sdkParams, view, orderBody?, extraScripts? })
  // 适用：spb-ecm/ecs, applepay-ecm/ecs, googlepay-ecm/ecs
  // extraScripts 用于 Google Pay（需加载额外 JS 库）

createVaultWithPurchaseRoute({ productKey, sdkParams, view, paymentSource })
  // 适用：vault-paypal/acdc/applepay-with-purchase

// 需要自定义实现的路由：
// buttons.js           — 双 SDK（CN + US），Venmo 需美国账户
// acdc.js              — CardFields SDK，前端逻辑不同
// vault-*-setup-only.js — /v3/vault/setup-tokens API
// vault-return.js      — 用户提供 vault token，纯服务端
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

## 关键开发规则

1. 每个路由文件只处理一个产品，不跨产品共用逻辑
2. 凭证/密钥从 `.env` 环境变量读取，绝不 hardcode
3. EJS 视图结构：`<%- include('../partials/header', vars) %>` + HTML + `<%- include('../partials/footer') %>`
4. **EJS/JS 分离模式**（重要）：EJS 只负责 HTML 结构和配置注入，所有 SDK 逻辑放静态 JS 文件
5. `product_key` 与路由 slug 完全对应（`/paypal/jssdk-v5/spb-ecm` → `product_key: 'spb-ecm'`）
6. 新增产品：写路由代码 → 在 Supabase 插入行（含 sdk_version） → 重启 app
7. Access token 由 `config/paypal.js` 的 `getCNToken()` / `getUSToken()` 统一管理，8h 缓存

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
| `public/js/paypal/jssdk-v5/spb.js` | spb-ecm, spb-ecs, vault-paypal-with-purchase, vault-applepay-with-purchase |
| `public/js/paypal/jssdk-v5/acdc.js` | acdc, vault-acdc-with-purchase, vault-acdc-setup-only |
| `public/js/paypal/jssdk-v5/buttons.js` | buttons（双 SDK：cnSdkUrl + usSdkUrl） |
| `public/js/paypal/jssdk-v5/vault-setup.js` | vault-paypal-setup-only |
| `public/js/paypal/jssdk-v5/vault-return.js` | vault-return |
| `public/js/paypal/jssdk-v5/applepay.js` | applepay-ecm, applepay-ecs（待实现） |
| `public/js/paypal/jssdk-v5/googlepay.js` | googlepay-ecm, googlepay-ecs（待实现） |

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

**工厂模式（标准产品，推荐）：**
```js
// src/routes/<provider>/<sdk>/<product>.js
const { createStandardRoute } = require('./_factory')
module.exports = createStandardRoute({
  productKey: '<product>',
  sdkParams:  'components=buttons&currency=USD',
  view:       '<provider>/<sdk>/<product>',
  // orderBody: {} 可选，合并进 create-order body
  // extraScripts: [] 可选，如 Google Pay 需要额外 JS
})
```

**Vault with-purchase（带购买的 Vault）：**
```js
const { createVaultWithPurchaseRoute } = require('./_factory')
module.exports = createVaultWithPurchaseRoute({
  productKey: 'vault-xxx-with-purchase',
  sdkParams:  'components=buttons&vault=true&currency=USD',
  view:       'paypal/jssdk-v5/vault-xxx-with-purchase',
  paymentSource: { paypal: { attributes: { vault: { store_in_vault: 'ON_SUCCESS' } } } }
})
```

**自定义路由**（CardFields、双SDK、Vault Setup-only、Return Buyer）：参考 `acdc.js`、`buttons.js`、`vault-paypal-setup-only.js`、`vault-return.js`。

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
