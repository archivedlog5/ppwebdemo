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
// 各产品路由实现备注 → src/routes/paypal/jssdk-v5/CLAUDE.md
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
> JSSDK v5 专属规则（14–19：Google Pay、Apple Pay、Vault Return）→ `src/routes/paypal/jssdk-v5/CLAUDE.md`

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

完整文件对应表 → `docs/design/2026-05-18-design-be-jssdk-v5-file-map.md`

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

## 新增支付产品 Demo

详细步骤见 `docs/guides/add-product.md`。

## 记忆恢复（Memory Compaction 后）

1. 读 `docs/context.md`
2. 读 `docs/todos.md`
3. 读 `docs/progress.md`
4. 读 `docs/debug-log.md`


## 参考文档

- 通用新增 Demo 步骤：`docs/guides/add-product.md`
- JSSDK v5 专属规则 + 文件速查：`src/routes/paypal/jssdk-v5/CLAUDE.md`
- 需求：`docs/req/2026-05-15-req-demo-hub.md`
- JSSDK v5 产品：`docs/req/2026-05-15-req-jssdk-v5.md`
- 实现计划：`docs/plans/2026-05-15-plan-jssdk-v5-v1.md`
- 路由设计：`docs/design/2026-05-15-design-be-routing.md`
- v5 文件映射：`docs/design/2026-05-18-design-be-jssdk-v5-file-map.md`
- 根项目指南：`../../CLAUDE.md`
