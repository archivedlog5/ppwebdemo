# CLAUDE.md — payment-playground 项目总指南

> **双语维护说明**：本文件为中文主版本（source of truth）。每次更新本文件后，必须同步更新英文版 `CLAUDE.en.md`，两个文件始终保持内容一致。

## 项目概览

**payment-playground** 是一个综合支付演示与跨境电商平台 monorepo，包含：

- **demo-hub**：PayPal、Braintree、Stripe、Adyen 等支付产品的独立集成 demo
- **store-fashion**：服装类跨境电商网站（第一阶段原型）
- **admin-console**：支付渠道管理后台控制台

其余电商网站类型（电子产品、AI订阅、短剧、阅读、航空、旅游）列入 `docs/pending.md`，后续逐步启动。

---

## 目录结构

```
payment-playground/
├── CLAUDE.md                        # 根项目总指南，中文主版本（本文件）
├── CLAUDE.en.md                     # 根项目总指南，英文版（与本文件同步）
├── docs/                            # 全局文档
│   ├── context.md                   # 项目目标、决策记录
│   ├── progress.md                  # 全局进度日志
│   └── pending.md                   # 待启动 app 列表与优先级
├── apps/
│   ├── demo-hub/                    # 支付产品 demo 集合
│   │   ├── CLAUDE.md
│   │   ├── docs/
│   │   │   ├── req/
│   │   │   ├── design/
│   │   │   ├── plans/
│   │   │   ├── todos.md
│   │   │   ├── context.md
│   │   │   ├── progress.md
│   │   │   ├── debug-log.md
│   │   │   └── test-cases.md
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── paypal/          # jssdk-v5, jssdk-v6, acdc, applepay,
│   │       │   │                    # googlepay, vault, apm, invoice, ...
│   │       │   ├── braintree/       # dropin-ui, hosted-fields, ...
│   │       │   ├── stripe/
│   │       │   └── adyen/
│   │       └── views/               # EJS 模板
│   ├── store-fashion/               # 服装电商（React + Supabase）
│   │   ├── CLAUDE.md
│   │   └── docs/
│   │       ├── req/
│   │       ├── design/
│   │       ├── plans/
│   │       ├── todos.md
│   │       ├── context.md
│   │       ├── progress.md
│   │       ├── debug-log.md
│   │       └── test-cases.md
│   └── admin-console/               # 支付渠道管理控制台（React + Supabase）
│       ├── CLAUDE.md
│       └── docs/
│           ├── req/
│           ├── design/
│           ├── plans/
│           ├── todos.md
│           ├── context.md
│           ├── progress.md
│           ├── debug-log.md
│           └── test-cases.md
└── shared/                          # 公共工具、类型定义、常量
```

---

## 技术栈

| App | 前端 | 后端 | 数据库 | 模板/渲染 |
|-----|------|------|--------|-----------|
| demo-hub | Vanilla JS | Node.js + Express | Supabase | EJS |
| store-fashion | React + Vite | Node.js + Express | Supabase | — |
| admin-console | React + Vite | Node.js + Express | Supabase | — |

**Supabase 配置：单一 project，多 schema 隔离**

Supabase 免费版限 2 个 project，全部数据放入 1 个 project，通过 PostgreSQL schema 隔离各 app：

| Schema | 归属 | 核心表 |
|--------|------|--------|
| `demohub` | demo-hub | `products`（产品展示配置） |
| `admin` | admin-console | `stores`、`payment_channels` |
| `fashion` | store-fashion | `profiles`、`orders` |
| `auth` | Supabase 内置 | `users`（所有 app 共用） |
| `public` | 共享 | `update_updated_at()` 工具函数 |

详见：`docs/design/2026-05-15-design-db-supabase.md`

**admin-console → demo-hub 配置关系：**
- admin-console 写入 `demohub.products` 表（display_name、description、enabled、sort_order）
- demo-hub 启动时从该表读取配置，决定首页展示哪些产品、名称、顺序
- 配置变更后重启 demo-hub 即生效（启动时读取一次，缓存在内存中）
- `product_key`（路由 slug）与代码路由绑定，admin 只读不可修改
- 内存 Map key 格式：`provider/sdk_version/product_key`（如 `paypal/jssdk-v5/spb-ecm`）
- 唯一约束：`UNIQUE(provider, sdk_version, product_key)`（三字段联合）

---

## 文件命名规范

### 需求文档（Requirements）
```
docs/req/YYYY-MM-DD-req-<topic>.md
```
示例：`docs/req/2026-05-15-req-demo-hub-paypal.md`

### 设计文档（Design）—— 前后端分开
```
docs/design/YYYY-MM-DD-design-fe-<topic>.md   # 前端设计
docs/design/YYYY-MM-DD-design-be-<topic>.md   # 后端/API 设计
docs/design/YYYY-MM-DD-design-db-<topic>.md   # 数据库 Schema 设计
```
示例：
- `docs/design/2026-05-15-design-fe-store-fashion.md`
- `docs/design/2026-05-15-design-be-demo-hub.md`
- `docs/design/2026-05-15-design-db-supabase.md`

### 实现计划（Plans）
```
docs/plans/YYYY-MM-DD-plan-<topic>-v<n>.md
```
示例：`docs/plans/2026-05-15-plan-demo-hub-v1.md`

### 固定文档（每个 app 必备）
| 文件 | 用途 |
|------|------|
| `docs/todos.md` | 任务清单，带复选框，完成即勾选 |
| `docs/context.md` | app 目标、技术栈、关键决策 |
| `docs/progress.md` | 每次工作后更新的进度日志 |
| `docs/debug-log.md` | 错误记录与解决方案 |
| `docs/test-cases.md` | 测试用例与结果 |

---

## gstack Skills 工作流

每个新 app 或功能模块启动时，按以下顺序调用 gstack skills。

**每个阶段结束后，必须执行 `find-skills` 流程：**
1. 搜索与当前阶段需求相关的高分 skills
2. 评估哪些 skills 能帮助当前需求（不是所有找到的都需要安装）
3. 安装有价值的 skills
4. **立即调用已安装的 skills 服务当前阶段的工作**（安装不是终点，使用才是）

### 1. 需求讨论阶段
```
/office-hours        → 讨论想法，验证需求是否值得构建
/brainstorming       → 探索实现方案，生成 spec 设计文档
```
阶段结束后执行 find-skills 流程：搜索"需求/该 app 领域"相关 skills → 评估 → 安装 → **调用已安装 skills 完善需求文档**
产出：`docs/req/YYYY-MM-DD-req-<topic>.md`

### 2. UI/UX 设计阶段
**所有页面的设计必须经过 UI/UX skills 流程，不允许跳过。**
```
ui-ux-pro-max        → 作为 UI/UX 专家设计页面（50+ 风格、161 色板、57 字体组合）
/design-consultation → 创建该 app 的设计系统和 DESIGN.md（新 app 首次使用）
/design-shotgun      → 生成多个设计方案供对比选择
/plan-design-review  → 设计视角审核 UI/UX 计划
frontend-design      → 审查 UI/UX 模式，生成高质量前端设计规范
```
阶段结束后执行 find-skills 流程：搜索"UI/UX/设计系统/前端"相关 skills → 评估 → 安装 → **调用已安装 skills 优化设计输出**
产出：`docs/design/YYYY-MM-DD-design-fe-<topic>.md`、`DESIGN.md`（每 app 根目录）

### 3. 后端与数据库设计阶段
```
/plan-eng-review     → 工程视角审核架构，确保技术可行
/plan-ceo-review     → CEO 视角审核计划，确保方向正确
```
阶段结束后执行 find-skills 流程：搜索"后端/Supabase/API/数据库"相关 skills → 评估 → 安装 → **调用已安装 skills 优化 API 设计和 DB Schema**
产出：`docs/design/YYYY-MM-DD-design-be-<topic>.md`、`docs/design/YYYY-MM-DD-design-db-<topic>.md`

### 4. 计划阶段
```
/writing-plans       → 生成分步实现计划
/autoplan            → 自动运行全套 review 流程
```
阶段结束后执行 find-skills 流程：搜索"项目规划/任务拆解/实现方案"相关 skills → 评估 → 安装 → **调用已安装 skills 完善实现计划**
产出：`docs/plans/YYYY-MM-DD-plan-<topic>-v<n>.md`

### 5. Todo 生成
根据 plan 拆解写入 `docs/todos.md`（带日期标签的分类复选框）
阶段结束后执行 find-skills 流程：搜索"自动化/脚手架/代码生成"相关 skills → 评估 → 安装 → **调用已安装 skills 辅助初始化项目结构**

### 6. 开发阶段
```
/qa              → 测试并修复 bug
/design-review   → 视觉 QA，修复设计问题（对照 ui-ux-pro-max 输出验证）
/review          → PR 审核（落地前）
/investigate     → 系统性 debug
```
阶段结束后执行 find-skills 流程：搜索"测试/QA/安全审查"相关 skills → 评估 → 安装 → **调用已安装 skills 提升代码质量和测试覆盖**

### 7. 发布阶段
```
/ship            → 发布工作流（版本号、changelog、PR）
/canary          → 部署后监控
/document-release → 更新文档
```
阶段结束后执行 find-skills 流程：搜索"监控/部署/文档"相关 skills → 评估 → 安装 → **调用已安装 skills 强化部署和监控流程**

---

## 路由规范

### demo-hub — 三层路由结构（所有 provider 统一）

路由格式：`/{provider}/{sdk_version}/{product_key}`

每个支付产品必须有独立的 Express 路由文件，文件路径与 URL 完全对应：

```
/paypal/jssdk-v6/paypal-button  → routes/paypal/jssdk-v6/paypal-button.js
/paypal/jssdk-v6/paylater       → routes/paypal/jssdk-v6/paylater.js
/paypal/jssdk-v6/venmo          → routes/paypal/jssdk-v6/venmo.js
/paypal/jssdk-v6/bcdc           → routes/paypal/jssdk-v6/bcdc.js
/paypal/jssdk-v6/acdc           → routes/paypal/jssdk-v6/acdc.js
/paypal/jssdk-v6/apple-pay      → routes/paypal/jssdk-v6/apple-pay.js
/paypal/jssdk-v6/google-pay     → routes/paypal/jssdk-v6/google-pay.js
/paypal/jssdk-v6/vault          → routes/paypal/jssdk-v6/vault.js
/paypal/jssdk-v5/paypal-button  → routes/paypal/jssdk-v5/paypal-button.js
/paypal/jssdk-v5/acdc           → routes/paypal/jssdk-v5/acdc.js
/braintree/web-sdk/dropin-ui    → routes/braintree/web-sdk/dropin-ui.js
/braintree/web-sdk/hosted-fields→ routes/braintree/web-sdk/hosted-fields.js
/braintree/graphql/<product>    → routes/braintree/graphql/<product>.js（预留）
/stripe/stripe-js/<product>     → routes/stripe/stripe-js/<product>.js（预留）
/adyen/web-components/<product> → routes/adyen/web-components/<product>.js（预留）
```

**命名规范：**

| 层级 | 规则 | 示例 |
|------|------|------|
| provider | 小写，无连字符 | `paypal`, `braintree` |
| sdk_version | 小写 + kebab-case | `jssdk-v6`, `web-sdk`, `graphql` |
| product_key | 小写 + kebab-case | `paypal-button`, `acdc`, `apple-pay` |

规则：
- 每个路由文件只处理一个产品的逻辑，**不允许跨产品共用路由文件**
- 文件名 = `product_key`（如 `acdc.js`、`apple-pay.js`）
- 每个产品有独立的 EJS 视图：`views/paypal/jssdk-v5/acdc.ejs`
- Supabase `demohub.products` 表用 `(provider, sdk_version, product_key)` 三字段唯一标识每个产品
- **EJS/JS 分离**：EJS 只注入 `window.DEMO = { urls: {...} }`，SDK 逻辑放 `public/js/<provider>/<sdk>/<product>.js`，多产品可复用同一 JS 文件

### 电商网站 — 每个网站独立路由前缀

每个电商网站在 React 前端使用独立的路由前缀，后端 API 同样按网站隔离：

```
前端路由（React Router）：
/fashion/*         → store-fashion 的所有页面
/electronics/*     → store-electronics 的所有页面（待启动）

后端 API 路由（Express）：
/api/fashion/*     → store-fashion 的所有 API
/api/electronics/* → store-electronics 的所有 API（待启动）
```

规则：
- 每个电商网站是独立的 React 应用（`apps/store-<name>/`），**不共享前端入口**
- 各网站后端 API 路由通过前缀严格隔离
- 支付渠道配置通过 admin-console 写入 Supabase，各网站运行时从 Supabase 读取

---

## 运行架构

### 开发模式（各 app 独立端口，方便调试）

```bash
npm run dev:demo-hub    # → http://localhost:3000
npm run dev:fashion     # → http://localhost:5173  (Vite HMR)
npm run dev:admin       # → http://localhost:5174  (Vite HMR)
```

各 app 完全独立运行，互不影响。React 的 Vite dev server 支持热更新（HMR）。

### 生产模式（统一 gateway，单一端口）

根目录 `server.js` 是唯一入口，挂载所有 app 到同一端口（443 或反向代理后的内网端口）：

```
node server.js   (PORT=3000 本地 / PORT=443 生产)
  /              → demo-hub（EJS 服务端渲染）
  /fashion/*     → store-fashion React dist 静态文件 + /api/fashion/* API
  /electronics/* → store-electronics（未来，结构相同）
  ...
```

**admin-console 始终独立部署**，不进入 gateway（内部工具，单独域名或端口）。

生产部署流程：
```bash
# 1. 构建所有 React app
npm run build:fashion    # → apps/store-fashion/dist/
npm run build:admin      # → apps/admin-console/dist/

# 2. 启动统一 gateway
npm start                # node server.js
```

### 架构图

```
开发模式                          生产模式
─────────────────────────────     ────────────────────────────────────
localhost:3000  demo-hub          PORT:3000/443  server.js (gateway)
localhost:5173  store-fashion  →    /            demo-hub EJS routes
localhost:5174  admin-console       /fashion/*   store-fashion dist/
                                    /api/fashion/ store-fashion API
                                  [另部署] admin-console
```

---

## 新增电商网站流程

每次新增一个电商站（如 `store-electronics`），按以下步骤完整执行：

### 第一步：规划与设计（先讨论再动手）
- [ ] 调用 `/office-hours` + `/brainstorming` 讨论需求
- [ ] 调用 `ui-ux-pro-max` + `/design-consultation` 设计 UI/UX
- [ ] 调用 `/writing-plans` 生成实现计划
- [ ] 创建 `apps/store-<name>/docs/` 下的 req/design/plans/todos 文件

### 第二步：创建 React 项目
```bash
cd apps
npm create vite@latest store-<name> -- --template react
cd store-<name> && npm install
```

在 `vite.config.js` 设置路径前缀（**关键，否则生产环境资源路径错误**）：
```js
export default { base: '/<name>/' }
```

在 React Router 设置 basename：
```jsx
<BrowserRouter basename="/<name>">
```

### 第三步：Supabase Schema
在 Supabase SQL Editor 执行：
```sql
CREATE SCHEMA IF NOT EXISTS <name>;
CREATE TABLE <name>.profiles ( ... );  -- 参考 docs/design/2026-05-15-design-db-supabase.md
CREATE TABLE <name>.orders ( ... );
-- 设置 RLS
ALTER TABLE <name>.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE <name>.orders FORCE ROW LEVEL SECURITY;
CREATE POLICY "own_orders" ON <name>.orders FOR ALL USING ((select auth.uid()) = user_id);
-- 在 Supabase Dashboard → Settings → API → Exposed schemas 加入 <name>
-- 运行 GRANT 权限 SQL（参考 demohub 的做法）
INSERT INTO admin.stores (store_type, display_name, enabled) VALUES ('<name>', '显示名称', true);
```

### 第四步：挂载到 gateway（`server.js`）
```js
// 加在对应位置
const <name>Dist = path.join(__dirname, 'apps/store-<name>/dist')
if (fs.existsSync(<name>Dist)) {
  app.use('/api/<name>', require('./apps/store-<name>/src/routes'))
  app.use('/<name>', express.static(<name>Dist))
  app.get('/<name>/*', (req, res) => res.sendFile(path.join(<name>Dist, 'index.html')))
}
```

在根 `package.json` 加脚本：
```json
"dev:<name>": "cd apps/store-<name> && npm run dev",
"build:<name>": "cd apps/store-<name> && npm run build"
```

### 第五步：验证
```bash
# 开发验证
npm run dev:<name>          # 独立跑，http://localhost:5173

# 生产验证
npm run build:<name>
npm start                   # http://localhost:3000/<name>/
```

---

## 新增支付产品 Demo 流程

每次向 demo-hub 新增一个支付产品 demo（如 JSSDK v6 的新产品）：

### 第一步：写路由文件
```bash
# 工厂模式（标准产品，推荐）
# 在 apps/demo-hub/src/routes/<provider>/<sdk>/<product>.js
const { createStandardRoute } = require('./_factory')
module.exports = createStandardRoute({
  productKey: '<product>',
  sdkParams:  'components=buttons&currency=USD',
  view:       '<provider>/<sdk>/<product>',
})
```

非标准产品（CardFields、双SDK、Vault Setup-only 等）参考已有的自定义路由文件。

### 第二步：写 EJS 视图
在 `apps/demo-hub/src/views/<provider>/<sdk>/<product>.ejs` 创建视图，
参考 `views/paypal/jssdk-v5/spb-ecm.ejs` 作为模板。

### 第三步：挂载路由（`app.js`）
```js
// 在 apps/demo-hub/src/app.js 对应 sdk 块下添加
app.use(v5, require('./routes/paypal/jssdk-v5/<product>'))
```

### 第四步：插入 Supabase 数据
```sql
INSERT INTO demohub.products (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES ('<provider>', '<sdk>', '<product>', '显示名称', '一句话描述', true, <排序号>);
```

### 第五步：重启 demo-hub
```bash
npm run dev:demo-hub     # nodemon 会自动重启，或手动 rs
```

首页会自动出现新产品卡片（Supabase 配置读取）。

---

## 新增整个 Provider（如 Braintree GraphQL）流程

1. 创建目录：`apps/demo-hub/src/routes/braintree/graphql/`
2. 在 `app.js` 添加：`app.use('/braintree/graphql', require('./routes/braintree/graphql/index'))`
3. 建 `views/braintree/graphql/` 视图目录
4. 在 Supabase 插入对应 `sdk_version='graphql'` 的产品行
5. 重启即可，首页自动分组展示

---

## 新 App 启动检查清单

每次启动一个新 app（如 `store-fashion`、`admin-console` 等），必须依次执行：

**需求阶段**
- [ ] 调用 `/office-hours` 讨论需求
- [ ] 调用 `/brainstorming` 生成需求 spec
- [ ] 创建 `docs/req/YYYY-MM-DD-req-<app>.md`
- [ ] 执行 find-skills 流程：搜索该领域相关 skills → 评估 → 安装 → **调用已安装 skills 完善需求**

**UI/UX 设计阶段（所有页面必须经过此步骤）**
- [ ] 调用 `ui-ux-pro-max` 设计所有页面的 UI/UX 风格、色板、字体
- [ ] 调用 `/design-consultation` 创建 `DESIGN.md`（新 app 首次使用）
- [ ] 调用 `/design-shotgun` 生成多方案供选择
- [ ] 调用 `frontend-design` 生成前端设计规范
- [ ] 创建 `docs/design/YYYY-MM-DD-design-fe-<app>.md`
- [ ] 执行 find-skills 流程：搜索设计/UI 相关 skills → 评估 → 安装 → **调用已安装 skills 优化设计输出**

**后端与数据库设计阶段**
- [ ] 调用 `/plan-eng-review` 审核架构
- [ ] 调用 `/plan-ceo-review` 审核方向
- [ ] 创建 `docs/design/YYYY-MM-DD-design-be-<app>.md`
- [ ] 创建 `docs/design/YYYY-MM-DD-design-db-<app>.md`
- [ ] 执行 find-skills 流程：搜索后端/Supabase/API 相关 skills → 评估 → 安装 → **调用已安装 skills 优化 API 和 DB 设计**

**计划与 Todo 阶段**
- [ ] 调用 `/writing-plans` 生成实现计划
- [ ] 创建 `docs/plans/YYYY-MM-DD-plan-<app>-v1.md`
- [ ] 根据计划填写 `docs/todos.md`（分类复选框格式）
- [ ] 执行 find-skills 流程：搜索实现/测试相关 skills → 评估 → 安装 → **调用已安装 skills 辅助项目初始化**

**准备开发**
- [ ] 创建该 app 的 `CLAUDE.md`（从本文件派生，聚焦该 app）
- [ ] 确认路由结构符合"路由规范"章节要求

---

## Sub-Agent 路由

| 任务领域 | Sub-Agent 类型 |
|----------|---------------|
| 后端（Node.js、Supabase、支付集成） | `general-purpose` |
| 前端（React、Vite、UI 组件） | `general-purpose` |
| 代码审查与简化 | `code-simplifier` |
| 大规模并行任务 | `superpowers:dispatching-parallel-agents` |

---

## 开发方法论

### 测试驱动开发（TDD）
- 调用 `superpowers:test-driven-development` 在写实现代码前设计测试
- 先写测试 → 看失败 → 实现 → 看通过
- 测试结果记录在 `docs/test-cases.md`

### 系统性 Debug
- 调用 `superpowers:systematic-debugging` 处理任何 bug 或意外行为
- 记录到 `docs/debug-log.md`

### 代码审查
- 调用 `superpowers:requesting-code-review` 完成每个功能后
- 调用 `superpowers:verification-before-completion` 标记完成前验证

---

## 记忆恢复（Memory Compaction 后）

会话恢复或上下文压缩后，按顺序读取：

1. `docs/context.md` — 重建项目目标
2. 当前 app 的 `docs/todos.md` — 确定未完成任务
3. 当前 app 的 `docs/progress.md` — 了解上次进度
4. 当前 app 的 `docs/debug-log.md` — 已知问题

从上次断点继续，不重复已完成工作。

---

## 待启动 App（Pending）

详见 `docs/pending.md`。以下 app 需求待后续讨论后再启动：

| App | 类型 | 状态 |
|-----|------|------|
| store-electronics | 电子产品电商 | 待启动 |
| store-ai-subscription | AI 订阅服务 | 待启动 |
| store-short-drama | 短剧平台 | 待启动 |
| store-reading | 阅读平台 | 待启动 |
| store-airline | 航空公司 | 待启动 |
| store-travel | 旅游定制化 | 待启动 |

每个 app 启动前必须完整走一遍"新 App 启动检查清单"。

---

## Git 规则

### 只在用户明确要求时才 commit
**不要在每次完成任务后自动 git commit。** 只有当用户明确说"帮我 commit"、"git commit"、"提交一下"等指令时，才执行 commit 和 push 操作。

### .gitignore 规范
以下内容不进入版本控制：
- Playwright 截图（`*.png`、`*.jpeg`、`.playwright-mcp/`、`playwright-report/`）
- 环境变量文件（`.env`、`.env.local`）
- `node_modules/`、`dist/`、`build/`
- 临时 mockup 文件（`/tmp/*.html`）
- OS 文件（`.DS_Store`）

---

## Hooks

### PostToolUse — 自动格式化
文件编辑后自动运行：
- `prettier --write` （JS/TS/CSS/JSON）
- `eslint --fix` （JS/TS）

---

## 参考资料

- `prompt/` 文件夹：用户准备的参考 markdown 文件，每次任务前检查
- gstack 可用 skills：`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`,
  `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`,
  `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`,
  `/open-gstack-browser`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`,
  `/setup-deploy`, `/retro`, `/investigate`, `/document-release`, `/codex`,
  `/cso`, `/autoplan`, `/pair-agent`, `/careful`, `/freeze`, `/guard`, `/unfreeze`,
  `/gstack-upgrade`, `/learn`, `/brainstorming`, `/writing-plans`
