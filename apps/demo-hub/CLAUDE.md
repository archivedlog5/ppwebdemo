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
│   │   └── 2026-05-15-req-demo-hub.md
│   ├── design/                  # 设计文档（fe/be/db 分开）
│   ├── plans/                   # 实现计划
│   ├── todos.md                 # 任务清单
│   ├── context.md               # App 目标与关键决策
│   ├── progress.md              # 进度日志
│   ├── debug-log.md             # 错误记录
│   └── test-cases.md            # 测试用例
├── src/
│   ├── app.js                   # Express 入口，启动时从 Supabase 加载产品配置
│   ├── config/
│   │   └── products.js          # 内存中的产品配置 Map（启动时填充）
│   ├── routes/
│   │   ├── index.js             # GET / → 首页产品目录
│   │   ├── paypal/
│   │   │   ├── jssdk-v5.js
│   │   │   ├── jssdk-v6.js
│   │   │   ├── acdc.js
│   │   │   ├── applepay.js
│   │   │   ├── googlepay.js
│   │   │   ├── vault.js
│   │   │   ├── apm.js
│   │   │   └── invoice.js
│   │   ├── braintree/
│   │   │   ├── dropin-ui.js
│   │   │   └── hosted-fields.js
│   │   ├── stripe/              # 待扩展
│   │   └── adyen/               # 待扩展
│   ├── views/
│   │   ├── layout.ejs           # 共享布局（含 Tab 栏预留）
│   │   ├── index.ejs            # 首页产品目录（动态渲染）
│   │   ├── paypal/
│   │   ├── braintree/
│   │   ├── stripe/
│   │   └── adyen/
│   └── public/
│       ├── css/
│       └── js/
├── .env                         # 本地环境变量（不提交 git）
├── .env.example
└── package.json
```

## 路由规范

**每个支付产品必须有独立路由文件，不允许跨产品共用。**

```
GET /                            → 首页（从内存配置动态渲染）
GET /paypal/jssdk-v5
GET /paypal/jssdk-v6
GET /paypal/acdc
GET /paypal/applepay
GET /paypal/googlepay
GET /paypal/vault
GET /paypal/apm
GET /paypal/invoice
GET /braintree/dropin-ui
GET /braintree/hosted-fields
GET /stripe/<product>            # 待扩展
GET /adyen/<product>             # 待扩展

POST /api/paypal/create-order
POST /api/paypal/capture-order
POST /api/braintree/client-token
... 每个产品有对应的后端 API 路由
```

## Supabase 产品配置

demo-hub 与 admin-console 通过 Supabase `demo_hub_products` 表交互：

```
启动时：
  SELECT * FROM demo_hub_products ORDER BY provider, sort_order
  → 存入内存 Map：{ 'paypal/acdc': { displayName, description, enabled, sortOrder } }

首页渲染：
  读内存 Map → 只展示 enabled=true 的产品

产品页标题：
  读内存 Map → 用 display_name 作标题（找不到则用 product_key fallback）
```

**配置变更后需重启 demo-hub 生效。**

## 页面设计原则

- **极简沙盒风格**：白色背景，只有支付 widget + 测试金额，无电商 UI 元素
- **Tab 结构预留**：`[ Demo ] [ Code ] [ Logs ]`，现阶段只激活 Demo Tab
- 页面标题来自 Supabase `display_name` 字段

## 关键开发规则

1. 每个路由文件只处理一个产品，不跨产品共用逻辑
2. 凭证/密钥从 `.env` 环境变量读取，绝不 hardcode
3. Tab 结构在 `layout.ejs` 中定义，产品页只填充 widget 内容
4. `product_key` 必须与路由 slug 完全对应（`/paypal/acdc` → `product_key: 'acdc'`）
5. 新增产品：写路由代码 → 在 Supabase 插入行 → 重启 app

## 记忆恢复（Memory Compaction 后）

1. 读 `docs/context.md`
2. 读 `docs/todos.md`
3. 读 `docs/progress.md`
4. 读 `docs/debug-log.md`

## 参考文档

- 需求：`docs/req/2026-05-15-req-demo-hub.md`
- 根项目指南：`../../CLAUDE.md`
