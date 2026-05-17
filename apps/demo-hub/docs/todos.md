# demo-hub — Todos

最后更新：2026-05-15

---

## JSSDK v5（当前阶段）

> 完整计划：`docs/plans/2026-05-15-plan-jssdk-v5-v1.md`

### 基础设施

- [x] **Task 1** — 项目脚手架（package.json、.env.example、目录结构）
- [x] **Task 0A** — PayPal Access Token 缓存（`config/paypal.js`，CN + US，8h TTL）
- [x] **Task 0B** — 路由工厂函数（`routes/paypal/jssdk-v5/_factory.js`）
- [x] **Task 2** — Supabase 产品配置加载（`config/products.js`）
- [x] **Task 3** — Express 入口（`app.js`，挂载所有路由）
- [x] **Task 4** — 共享 CSS（`base.css`、`layout.css`、`sandbox.css`）
- [x] **Task 5** — EJS Partials（`header.ejs`、`footer.ejs`，mobile tabs）
- [x] **Task 6** — 首页路由 + 视图（`routes/index.js`、`views/index.ejs`）
- [ ] **Task 17** — Supabase 建表 + 14 条 seed 数据（需要 Supabase 项目配置后执行）
- [ ] `npm install` — 安装依赖（在 apps/demo-hub 目录）

### PayPal JSSDK v5 — 路由已实现，视图待完善

- [x] 路由文件全部创建（工厂 + 自定义）
- [x] **Task 8** — SPB ECM 视图完整实现（参考模板）
- [ ] **Task 9** — SPB ECS 视图（占位符已创建，待补充真实 SDK 逻辑）
- [ ] **Task 10** — 独立按钮视图（CN+US 双 SDK）
- [ ] **Task 11** — ACDC 视图（CardFields SDK）
- [ ] **Task 12** — Apple Pay ECM + ECS 视图
- [ ] **Task 13** — Google Pay ECM + ECS 视图
- [ ] **Task 14** — Vault with-purchase 视图（PayPal + ACDC + ApplePay）
- [ ] **Task 15** — Vault setup-only 视图（PayPal + ACDC）
- [ ] **Task 16** — Vault return buyer 视图

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
