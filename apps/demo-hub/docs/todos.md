# demo-hub — Todos

最后更新：2026-05-18

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
- [x] **`vault-return.js`** — Return buyer（纯 fetch，无 SDK）
- [ ] **`applepay.js`** — Apple Pay（ApplePaySession + validateMerchant，待实现）
- [ ] **`googlepay.js`** — Google Pay（google.payments.api，待实现）

#### EJS 视图（`src/views/paypal/jssdk-v5/`）

- [x] **Task 8/9** — spb-ecm, spb-ecs（使用 `spb.js`）
- [x] **Task 10** — buttons（使用 `buttons.js`，双 SDK）
- [x] **Task 11** — acdc（使用 `acdc.js`）
- [x] **Task 14** — vault-paypal-with-purchase（使用 `spb.js`）
- [x] **Task 14** — vault-acdc-with-purchase（使用 `acdc.js`）
- [x] **Task 14** — vault-applepay-with-purchase（结构完成，等 `applepay.js`）
- [x] **Task 15** — vault-paypal-setup-only（使用 `vault-setup.js`）
- [x] **Task 15** — vault-acdc-setup-only（使用 `acdc.js`）
- [x] **Task 16** — vault-return（使用 `vault-return.js`）
- [ ] **Task 12** — applepay-ecm, applepay-ecs（等 `applepay.js` 实现）
- [ ] **Task 13** — googlepay-ecm, googlepay-ecs（等 `googlepay.js` 实现）

### 动态金额 + 常量文件 + 币种选择器

> 设计文档：`docs/design/2026-05-18-design-be-dynamic-amount-and-constants.md`
> 币种设计：`docs/design/2026-05-18-design-be-currency-selector.md`

- [x] **新建** `src/config/constants.js`（INTENT、CURRENCY、DEMO_ITEM、SANDBOX_SHIPPING、SANDBOX_BILLING、buildOrderBody、validateAmount）
- [x] 更新 `_factory.js`、`buttons.js`、`acdc.js`、`vault-return.js`：用 `buildOrderBody` + 读 `req.body.amount`
- [x] 更新前端 JS：金额输入框 + validateAmount（$1–$30,000）
- [x] 更新 EJS 视图：金额输入框 UI + sandbox.css 样式

#### 待实现：币种选择器

- [ ] `constants.js` 加 `SUPPORTED_CURRENCIES`（30 种）、`ZERO_DECIMAL_CURRENCIES`、`isZeroDecimal`
- [ ] 更新 `buildOrderBody`：按币种格式化金额（零小数位取整）
- [ ] 更新 `validateAmount`：接收 `currency` 参数，零小数位特殊校验
- [ ] `_factory.js` GET handler：读 `req.query.currency`，传给 EJS + SDK URL
- [ ] `_factory.js` POST handler：读 `req.body.currency`，传给 `buildOrderBody`
- [ ] `buttons.js`、`acdc.js`、`vault-return.js` 同上
- [ ] 所有有购买 EJS 视图：加 `<select id="demo-currency">` 30 种货币，`window.DEMO.currency`
- [ ] 前端 JS（spb/acdc/buttons/vault-return.js）：`getCurrency()`、`isZeroDecimal()`、`change` 事件刷新（携带 amount+currency 到 URL）、`createOrder` 带 currency
- [ ] `sandbox.css`：`.amount-row`、`.currency-group`、`.currency-select` 并排布局
- [ ] 更新 `_factory.js`：POST handler 读 `req.body.amount`，调用 `buildOrderBody`
- [ ] 更新 `buttons.js`、`acdc.js`、`vault-return.js`：改用 `buildOrderBody`
- [ ] 更新前端 JS（spb/acdc/buttons/vault-return.js）：`createOrder` 读输入框 amount 传给后端
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
