# 全局进度日志

## 2026-05-15

### 完成
- [x] 确定项目名称：`payment-playground`
- [x] 确定仓库结构：Monorepo + 每 app 独立 CLAUDE.md
- [x] 确定第一阶段 app：demo-hub、store-fashion、admin-console
- [x] 设计文件命名规范（req/design-fe/design-be/design-db/plans）
- [x] 生成根 CLAUDE.md
- [x] 创建全局 docs/（context.md、progress.md、pending.md）

### 下一步
- [ ] 开始实现 demo-hub JSSDK v5（计划已完成 CEO + Eng Review）
- [ ] 对 store-fashion 和 admin-console 分别讨论需求
- [ ] 对 demo-hub JSSDK v6 讨论产品清单

## 2026-05-15（续）

### 完成（本会话）
- [x] demo-hub 需求讨论（/office-hours）→ `docs/req/2026-05-15-req-demo-hub.md`
- [x] admin-console → demo-hub 配置关系设计 → `apps/admin-console/docs/design/2026-05-15-design-db-demo-hub-products.md`
- [x] JSSDK v5 产品清单确认（14 个 demo）→ `docs/req/2026-05-15-req-jssdk-v5.md`
- [x] 路由三层结构设计（`/{provider}/{sdk_version}/{product_key}`）→ `docs/design/2026-05-15-design-be-routing.md`
- [x] UI/UX 设计（Dark OLED，双主题，响应式）→ `apps/demo-hub/DESIGN.md`
- [x] JSSDK v5 实现计划 → `docs/plans/2026-05-15-plan-jssdk-v5-v1.md`
- [x] CEO Review（SELECTIVE EXPANSION）— 3 项改进：工厂函数、Token 缓存、EJS header/footer
- [x] Eng Review — 3 项修复：File Map、工厂覆盖范围、extraScripts 参数
- [x] apps/demo-hub/CLAUDE.md、apps/admin-console/CLAUDE.md 创建
- [x] 所有文档同步更新

## 2026-05-18

### 完成
- [x] Supabase 多 schema 数据库设计 → `docs/design/2026-05-15-design-db-supabase.md`
- [x] demohub schema 建表 + 14 条 JSSDK v5 seed 数据（已在 Supabase 执行）
- [x] demo-hub 前端全栈实现（CSS、EJS partials、首页、14 个路由 + 工厂函数）
- [x] 生产 gateway 架构（`server.js`）：所有 app 合并到同一端口
- [x] 开发/生产架构文档化（CLAUDE.md、demo-hub/CLAUDE.md）
- [x] Design Review 完成（6/10 → 9/10）：删搜索框、移动端水平 tabs、SDK loading spinner

- [x] EJS/JS 分离重构：静态 JS 文件模式（window.DEMO 注入 + spb/acdc/buttons/vault-setup/vault-return.js）
- [x] 全部 14 个 EJS 视图更新为新模式（Apple Pay + Google Pay 结构完成，JS 文件待实现）
- [x] 生产 gateway 架构（server.js，开发独立端口，生产单端口）
- [x] 所有 CLAUDE.md 同步更新（EJS/JS 模式、运行架构、新增流程文档化）

### 当前状态
- demo-hub 全栈完成：CSS、EJS partials、首页、14 个路由、工厂函数、静态 JS 文件
- Supabase 连接正常，14 个产品已加载，`npm run dev:demo-hub` → http://localhost:3000
- SPB ECM 完整实现（spb.js 复用）；ACDC 完整实现（acdc.js）；Vault 完整实现
- 待实现：applepay.js / googlepay.js（需要 Apple/Google Pay sandbox 环境）

- [x] 更正 CLAUDE.md 中 superpowers/gstack skills 各阶段归属（plan-review 系列必须在有 plan 后才调用）
- [x] 设计动态金额输入 + API 常量文件 → `docs/design/2026-05-18-design-be-dynamic-amount-and-constants.md`

- [x] 重构 `_factory.js`：`buildBody(amount, currency)` 模式，产品 API 参数集中在路由文件
- [x] 币种选择器（30 种货币，零小数位处理，URL 参数刷新）
- [x] 修复 validateAmount 函数残片 syntax error

### 下一步
- [ ] 各产品路由按需迁移到 `buildBody` 模式（spb-ecm 已完成作为参考）
- [ ] 更新 `_factory.js` + 各自定义路由读 `req.body.amount`
- [ ] 更新前端 JS 读输入框 amount
- [ ] 更新 EJS 视图加金额输入框 + sandbox.css 加样式
- [ ] 浏览器测试 SPB ECM / ACDC / Vault 完整支付流程
- [ ] 实现 applepay.js（需 Safari + Apple Wallet）
- [ ] 实现 googlepay.js（需 Chrome + Google Pay card）
