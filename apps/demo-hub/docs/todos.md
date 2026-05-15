# demo-hub — Todos

最后更新：2026-05-15

---

## JSSDK v5（当前阶段）

> 完整计划：`docs/plans/2026-05-15-plan-jssdk-v5-v1.md`

### 基础设施

- [ ] **Task 1** — 项目脚手架（package.json、.env.example、目录结构、依赖安装）
- [ ] **Task 0A** — PayPal Access Token 缓存（`config/paypal.js`，CN + US，8h TTL）
- [ ] **Task 0B** — 路由工厂函数（`routes/paypal/jssdk-v5/_factory.js`）
  - `createStandardRoute({ productKey, sdkParams, view, orderBody?, extraScripts? })`
  - `createVaultWithPurchaseRoute({ productKey, sdkParams, view, paymentSource })`
- [ ] **Task 2** — Supabase 产品配置加载（`config/products.js`，Map key: `provider/sdk_version/product_key`）
- [ ] **Task 3** — Express 入口（`app.js`，挂载所有路由，启动时加载配置）
- [ ] **Task 4** — 共享 CSS（`base.css`、`layout.css`、`sandbox.css`，Dark/Light 变量）
- [ ] **Task 5** — EJS Partials（`header.ejs`、`footer.ejs`、`sidebar.ejs`）
- [ ] **Task 6** — 首页路由 + 视图（`routes/index.js`、`views/index.ejs`，动态渲染产品目录）
- [ ] **Task 17** — Supabase 建表 + 14 条 seed 数据

### PayPal JSSDK v5 — 标准按钮

- [ ] **Task 8** — SPB ECM（`/paypal/jssdk-v5/spb-ecm`）
- [ ] **Task 9** — SPB ECS（`/paypal/jssdk-v5/spb-ecs`）
- [ ] **Task 10** — 独立按钮（`/paypal/jssdk-v5/buttons`）— PayPal/PayLater/BCDC(CN) + Venmo(US)
- [ ] **Task 11** — ACDC（`/paypal/jssdk-v5/acdc`）— CardFields，自定义实现

### PayPal JSSDK v5 — Apple Pay / Google Pay

- [ ] **Task 12** — Apple Pay ECM（`/paypal/jssdk-v5/applepay-ecm`）
- [ ] **Task 12** — Apple Pay ECS（`/paypal/jssdk-v5/applepay-ecs`）
- [ ] **Task 13** — Google Pay ECM（`/paypal/jssdk-v5/googlepay-ecm`，需 extraScripts）
- [ ] **Task 13** — Google Pay ECS（`/paypal/jssdk-v5/googlepay-ecs`，需 extraScripts）

### PayPal JSSDK v5 — Vault

- [ ] **Task 14** — PayPal Vault with-purchase（`/paypal/jssdk-v5/vault-paypal-with-purchase`）
- [ ] **Task 14** — ACDC Vault with-purchase（`/paypal/jssdk-v5/vault-acdc-with-purchase`）
- [ ] **Task 14** — Apple Pay Vault with-purchase（`/paypal/jssdk-v5/vault-applepay-with-purchase`）
- [ ] **Task 15** — PayPal Vault setup-only（`/paypal/jssdk-v5/vault-paypal-setup-only`）
- [ ] **Task 15** — ACDC Vault setup-only（`/paypal/jssdk-v5/vault-acdc-setup-only`）
- [ ] **Task 16** — Vault return buyer（`/paypal/jssdk-v5/vault-return`）

---

## 待启动（后续讨论）

- [ ] PayPal JSSDK v6 — 产品清单待讨论
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
- [x] JSSDK v5 实现计划 → `docs/plans/2026-05-15-plan-jssdk-v5-v1.md`
- [x] CEO Review + Eng Review → 计划已 CLEAR
