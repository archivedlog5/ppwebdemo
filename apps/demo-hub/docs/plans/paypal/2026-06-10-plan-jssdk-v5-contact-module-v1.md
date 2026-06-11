# 实现计划 — Contact Module (contact-module) · JSSDK v5 · v1

> 日期：2026-06-10
> 关联需求：`docs/req/2026-06-10-req-jssdk-v5-contact-module.md`
> 关联设计：`docs/design/2026-06-10-design-fe-jssdk-v5-contact-module.md` · `docs/design/2026-06-10-design-be-jssdk-v5-contact-module.md`
> 状态：待实现（**Opus 只写文档；代码须切换到非 Opus 模型（如 Sonnet）实现**）

---

## 0. 完成定义（Definition of Done）

- 访问 `/paypal/jssdk-v5/contact-module` 渲染页面；US-only 提示条 + Contact preference 下拉 +
  USD 锁定 + 固定联系方式展示 + PayPal 按钮渲染。
- create-order 返回 order id；请求体含
  `payment_source.paypal.experience_context.contact_preference`（= 下拉值）、
  `shipping_preference: SET_PROVIDED_ADDRESS`、`shipping.email_address` + `phone_number`。
- 点 PayPal 按钮（US sandbox 买家）→ 批准 → 服务端 GET Order 取联系方式 → capture `COMPLETED`
  → 结果行显示最终 email / phone + capture id。
- UPDATE 模式：在 PayPal 编辑联系方式 → 结果行显示**改后**值。
- 控制台 inspect/probe 打印 GET Order + capture 完整响应。

---

## 1. 前置确认（实现前先看）

- [ ] 通读 `spb-ecs.js`（ECS 建单模板）。
- [ ] 通读 `shipping-module.js`（自定义路由骨架 / GET Order + capture / inspect/probe 日志）。
- [ ] 通读 `spb.js`（按钮 + 金额校验）+ `spb-ecs.ejs`（页面骨架）。
- [ ] 确认 `.env` 有 `PAYPAL_US_*`；`config/paypal.js` 有 `getUSToken` / `getHeaders` / `API`（已有）。

---

## 2. 任务拆解

### Task 1 — 路由文件 `src/routes/paypal/jssdk-v5/contact-module.js`（新增）

按 be 设计 §1–§5。`const C = require('../../../config/constants')`。

- [ ] 内置常量：`CONTACT_PREFS`（白名单）、`DEMO_CONTACT`（email + phone）。
- [ ] **GET `/contact-module`**：US client-id；SDK URL 固定 `components=buttons&buyer-country=US&currency=USD`；
      渲染，注入 `defaultAmount` / `demoContact` / sidebar 等（参考 shipping-module GET，去掉 merchant/currency）。
- [ ] **POST `/api/contact-module/create-order`**：读 `{ amount, contactPreference }`；`validateAmount`；
      白名单校验 pref；`getUSToken()`；按 §3 组装 body（contact_preference + shipping contact）；返回 `{ id }`。
- [ ] **POST `/api/contact-module/capture-order`**：读 `{ orderID }`；`getUSToken()`；
      GET Order（log + 读 shipping 联系方式）→ capture（log）→ 返回 `{ id, status, captureId, contact, raw }`。
- [ ] 全程 inspect/probe console.log。

**验收**：路由可挂载；GET 200 渲染；`curl` create-order（带 contactPreference）返回 id 且 body 正确。

### Task 2 — 主视图 `src/views/paypal/jssdk-v5/contact-module.ejs`（新增）

按 fe 设计 §1–§2、§5。

- [ ] include header/footer；sandbox-header（badge / h1 / 说明）。
- [ ] **US-only 提示条**（warning 样式，置顶，显著）。
- [ ] 控件行：`#contact-preference` 下拉（三选项，默认 UPDATE_CONTACT_INFO）+ `#pref-hint` 动态提示行（英文，见 fe 设计 §1）/ Currency 纯文本 USD /
      Amount 输入。
- [ ] 只读「将发送的联系方式」展示区（`demoContact.email_address` / `phone_number`）。
- [ ] info 说明条（UPDATE 可在 PayPal 改 → 结果显示最终值）。
- [ ] `#paypal-button-container` + `#result` + `#amount-error`。
- [ ] `window.DEMO` 注入（urls）；引入 `contact-module.js`。
- [ ] 页内 scoped `<style>` 仅做新控件轻量布局。

**验收**：页面渲染正确，US-only 提示醒目，preference 下拉可选，视觉与其他 v5 demo 一致。

### Task 3 — 前端逻辑 `src/public/js/paypal/jssdk-v5/contact-module.js`（新增）

按 fe 设计 §3。IIFE + `'use strict'`。

- [ ] `readControls()`（amount / contactPreference）。
- [ ] `updatePrefHint()`：英文 `PREF_HINTS` 映射，绑定 `#contact-preference` change + page load 初始化（fe 设计 §3）。
- [ ] amount blur 格式化 + `validateAmount`（沿用 spb.js 规则，USD 两位小数）。
- [ ] `paypalSDK.Buttons`：createOrder（发 amount + contactPreference）/
      onApprove（capture + 规则 13 复判 `raw` + 展示最终 contact）/ onCancel / onError。
- [ ] `showResult` / `clearLoading` 本文件内置。
- [ ] inspect/probe console.log（fe §7）。

**验收**：按钮渲染；点按钮 create-order 拿 id；批准后结果行显示 contact + capture id。

### Task 4 — 挂载 `src/app.js`

- [ ] v5 区块 `shipping-module` 之后追加：`app.use(v5, require("./routes/paypal/jssdk-v5/contact-module"));`

### Task 5 — Supabase（用户手动）

- [ ] 执行 be 设计 §6.1 的 INSERT（自动取 sort_order）。
- [ ] 重启 demo-hub，确认首页出现 Contact Module 卡片。

### Task 6 — QA

**本地（curl + 浏览器）：**

- [ ] GET 页面渲染；US-only 提示条 + preference 下拉 + USD 锁定 + 联系方式展示。
- [ ] `curl` create-order（三种 preference）→ 返回 id，body `contact_preference` 与入参一致，
      含 `shipping.email_address` / `phone_number` / `SET_PROVIDED_ADDRESS`。
- [ ] `curl` create-order（非法 preference）→ fallback `UPDATE_CONTACT_INFO`。
- [ ] 浏览器端到端（US sandbox 买家）：
  - UPDATE：在 PayPal 改 email/phone → 结果行显示**改后**值。
  - RETAIN：PayPal 只读 → 结果行显示商户传入值。
  - NO_CONTACT_INFO：PayPal 不显示联系方式 → 结果行仍显示商户传入值（GET Order）。
- [ ] capture `COMPLETED`（规则 13）。
- [ ] 控制台打印 GET Order + capture 完整响应，核对 contact 字段。

**本地 curl 命令（demo-hub 跑在 localhost:3000）：**

```bash
# 1. create-order with UPDATE_CONTACT_INFO → 返回 id，body 含 contact_preference + shipping contact
curl -s -X POST "http://localhost:3000/paypal/jssdk-v5/api/contact-module/create-order" \
  -H "Content-Type: application/json" \
  -d '{"amount":"100.00","contactPreference":"UPDATE_CONTACT_INFO"}' | jq .
# 期望：{"id":"..."}；服务端 log 的 body 含 experience_context.contact_preference="UPDATE_CONTACT_INFO"
#       与 purchase_units[0].shipping.email_address / phone_number

# 2. create-order with RETAIN_CONTACT_INFO
curl -s -X POST "http://localhost:3000/paypal/jssdk-v5/api/contact-module/create-order" \
  -H "Content-Type: application/json" \
  -d '{"amount":"64.00","contactPreference":"RETAIN_CONTACT_INFO"}' | jq .

# 3. create-order with NO_CONTACT_INFO
curl -s -X POST "http://localhost:3000/paypal/jssdk-v5/api/contact-module/create-order" \
  -H "Content-Type: application/json" \
  -d '{"amount":"100.00","contactPreference":"NO_CONTACT_INFO"}' | jq .

# 4. 非法 preference → fallback UPDATE_CONTACT_INFO（看服务端 log 的 body）
curl -s -X POST "http://localhost:3000/paypal/jssdk-v5/api/contact-module/create-order" \
  -H "Content-Type: application/json" \
  -d '{"amount":"100.00","contactPreference":"GARBAGE"}' | jq .

# 5. 金额校验 → 400
curl -s -w "\nHTTP %{http_code}" -X POST "http://localhost:3000/paypal/jssdk-v5/api/contact-module/create-order" \
  -H "Content-Type: application/json" \
  -d '{"amount":"0","contactPreference":"UPDATE_CONTACT_INFO"}' | jq .
# 期望：HTTP 400

# 注：capture-order 需真实 approved order id，走浏览器端到端（curl 无法模拟买家批准）。
```

**端到端（浏览器，inspect/probe 定稿）：**
- [ ] GET Order / capture 响应字段回填设计（确认 capture 是否已含 shipping 联系方式 → 决定是否省 GET）。
- [ ] 异常记 `docs/debug-log.md`。

### Task 7 — 文档收尾

- [ ] 更新 `src/routes/paypal/jssdk-v5/CLAUDE.md`：
  - SDK params 表加 `contact-module` 行。
  - 自定义路由备注加 `contact-module` 段（3 端点、US-only、contact_preference 下拉、
    SET_PROVIDED_ADDRESS、Approach A 折叠 GET Order）。
  - 新增规则 21（见下）。
- [ ] 更新 `docs/progress.md` / `docs/todos.md`（可编辑联系方式 / before-after 面板 / Venmo 留 todo）。

---

## 3. 拟新增 CLAUDE 规则（规则 21，Task 7 落地）

> **规则 21 — Contact module 用 contact_preference + shipping 联系方式，US-only**
> - `payment_source.paypal.experience_context.contact_preference` 三值：`NO_CONTACT_INFO`（默认/隐藏）/
>   `UPDATE_CONTACT_INFO`（可看可编辑）/ `RETAIN_CONTACT_INFO`（可看不可编辑）。前端下拉切换，后端白名单校验。
> - 联系方式通过 `purchase_units[0].shipping.email_address` + `phone_number` 传递；
>   须配 `shipping_preference: SET_PROVIDED_ADDRESS` + 完整 address。
> - 模块 **US-only**：统一 `getUSToken()` + `PAYPAL_US_CLIENT_ID`，SDK URL 加 `buyer-country=US`；货币锁 USD。
> - 取回买家最新（可能编辑过）联系方式：**capture 端点内先 GET Order 读 `shipping.email_address`/`phone_number`，
>   再 capture**（Approach A 折叠单端点）。inspect/probe 核对 capture 响应是否已含联系方式，若含可省 GET。
> - capture 成功判定沿用规则 13（`captures[0].status === 'COMPLETED'`）。

---

## 4. 实现顺序建议

1. Task 1（路由）+ Task 4（挂载）→ GET 渲染 + curl create-order 先通。
2. Task 2（视图）→ Task 3（前端）→ 浏览器点按钮端到端。
3. Task 5（Supabase）→ 首页卡片。
4. Task 6 QA（curl + 浏览器端到端）→ inspect/probe 定稿 → Task 7 文档。

---

## 5. 风险与回退

| 风险 | 回退方案 |
|------|----------|
| capture 响应已含 shipping 联系方式 | 去掉 GET Order 调用，直接从 capture 响应读（inspect 后定稿） |
| GET Order 无 shipping 联系方式（NO_CONTACT_INFO 下被清空？） | inspect 真实返回；若被清空则结果行 fallback 商户传入值或 'n/a' |
| US sandbox 买家无法触发 Contact Module | 确认 buyer-country=US + US 商户；查 PayPal sandbox 账号设置 |
| UPDATE 编辑后返回值未变 | inspect GET Order；确认 PayPal sandbox 是否支持编辑回写 |

---

## 6. 不做（本期，留 todo）

- 可编辑联系方式输入框（页面改 email/phone）+ RETAIN 单字段 / 空值 fallback 边界。
- before/after 对比面板（merchant 传入 vs 买家返回）。
- Venmo / card / 其他 payment_source。
- 多币种 / CN 商户。

---

## 7. 涉及文件汇总

**新增：**
- `src/routes/paypal/jssdk-v5/contact-module.js`
- `src/views/paypal/jssdk-v5/contact-module.ejs`
- `src/public/js/paypal/jssdk-v5/contact-module.js`

**修改：**
- `src/app.js`（挂载一行）
- `src/routes/paypal/jssdk-v5/CLAUDE.md`（SDK 表 + 备注 + 规则 21）
- `docs/progress.md` / `docs/todos.md`

**外部（用户手动）：**
- Supabase `demohub.products` INSERT + 重启

---

## 8. 测试覆盖图

> demo-hub 无自动化测试框架（30+ demo 均手动 QA，保持一致）。覆盖 = curl + 浏览器手动。

```
CODE PATHS (contact-module.js)                          覆盖
─────────────────────────────────────────────────────────────
GET /contact-module
  └── US-only 渲染（US client-id, USD 锁定）            [本地浏览器 ✓]
POST /api/.../create-order
  ├── UPDATE_CONTACT_INFO body 正确                     [curl 查 body ✓]
  ├── RETAIN_CONTACT_INFO body 正确                     [curl 查 body ✓]
  ├── NO_CONTACT_INFO body 正确                         [curl 查 body ✓]
  ├── 非法 preference → fallback UPDATE                 [curl 查 body ✓]
  └── 金额校验 → 400                                    [curl ✓]
POST /api/.../capture-order  ← 核心（Approach A）
  ├── GET Order 读 shipping 联系方式                    [浏览器端到端 ✓]
  ├── capture COMPLETED 判定（规则 13）                 [浏览器端到端 ✓]
  ├── UPDATE：返回买家编辑后联系方式                    [浏览器端到端 ✓]
  └── RETAIN/NO：返回商户传入联系方式                   [浏览器端到端 ✓]

COVERAGE: create-order 路径 curl 全覆盖；capture/GET Order 依赖真实买家批准（浏览器端到端）
```

## 9. 失败模式（关键路径）

| codepath | 失败方式 | 有测试? | 有错误处理? | 用户可见? |
|----------|----------|---------|-------------|-----------|
| create-order 非法 preference | 传错 contact_preference 被 PayPal 拒 | curl ✓ | 白名单 fallback | 清晰 |
| capture 非 COMPLETED | 误判扣款成功 | 浏览器 | 规则 13 判定 | 清晰错误 |
| GET Order 无 shipping 联系方式 | contact=null | 浏览器 | 'n/a' fallback | 'n/a' |
| capture 响应已含联系方式 | GET Order 冗余 | inspect | 定稿可省 GET | 无影响 |
| Buttons 弹窗流不显示 Contact Module | 演示功能静默缺失 | 浏览器 e2e | **无（用户接受）** | 联系方式编辑器不出现 |

> **唯一 watch-item**（用户选「按现状进行」）：文档示例均为 redirect 流，本 demo 用 Buttons 弹窗流。
> 若 e2e 发现联系方式编辑器不出现 → 回退 redirect 流（记 todo）。非代码缺陷，付款仍正常。

## 10. 并行化策略

顺序实现，无并行机会：route → ejs → js → QA 链式强依赖（单产品单模块）。

## GSTACK REVIEW REPORT

> /plan-eng-review · 2026-06-10 · 交互式（Step 0 scope + Arch + Code Quality + Tests + Perf）

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run（demo 增量，scope 用户预先确认） |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 1 issue（已决，无改动），0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | 7/10 → 8/10，2 决策落地，2 项按现状/依赖现有 css |
| Outside Voice | `/codex` | Independent 2nd opinion | 0 | — | 用户跳过 |

**决策记录（Eng）：**
- **finding 1（Buttons vs redirect 流）**：用户选 **按现状进行**。已知 watch-item 记入 §9，e2e 验证；回退 redirect 流。

**决策记录（Design，7 pass 全跑，初始 7/10 → 8/10）：**
- **加 `#pref-hint` 动态提示行（英文）**：随 preference 下拉更新，消除「NO_CONTACT_INFO 是否仍发送联系方式」歧义。已写入 fe 设计 §1/§3 + Task CM-2/CM-3。
- **US-only 提示条复用现有 token**：中性 surface2 + accent 边框/图标 + fg 文字，不新增 warning 色、不动 sandbox.css/DESIGN.md。已写入 fe 设计 §1/§6。
- **按现状（用户选择）**：capture 期间 Processing… 加载态不加（依赖 PayPal 弹窗 spinner）。
- **依赖现有 css（用户选择）**：新元素响应式/a11y 不加专门规格，复用 sandbox.css 模式。
- Pass 1 IA 8/10 · Pass 3 Journey 8/10 · Pass 4 AI-slop 9/10（复用 sandbox-card，无 slop）· Pass 5 设计系统 7→8 · Pass 6 响应式/a11y 7/10（依赖现有）。无 mockup（复用已批准 Dark OLED 系统，新 mockup 会偏离）。

**Step 0**：scope 合适未削减（5 代码文件 < 8 阈值；0 新类/服务）。
**What already exists（复用未重建）**：`spb-ecs.js`(ECS 建单)、`shipping-module.js`(自定义路由骨架/GET Order+capture/inspect-probe)、`constants.js`(EXPERIENCE_CONTEXT/SANDBOX_SHIPPING/validateAmount/DEMO_*)、`config/paypal.js`(getUSToken/getHeaders/API)、`spb.js`(按钮/金额校验)。
**Code Quality**：无阻塞；1 条低置信观察（capture-order GET 无显式 `!g.ok` 分支，但 `?.` 已优雅降级，inspect/probe 日志照常）。
**Test review**：无 harness（与 30+ demo 一致）；create-order curl 全覆盖；capture/GET Order 依赖真实买家批准（E2E 固有，已分配 CM-6）；无 regression（全新代码，app.js 挂载为追加）。
**Performance**：capture-order 2 次串行 PayPal 调用（GET→capture），已在设计标注「capture 若含联系方式则省 GET」；无 DB / N+1。
**NOT in scope**（见 §6）：可编辑联系方式输入框 / before-after 面板 / Venmo·card / 多币种·CN 商户。
**并行化**：顺序实现（见 §10）。

**NOT in scope（Design，用户选择）**：capture Processing… 加载态；新元素专门 a11y/响应式规格（依赖 sandbox.css）；before/after 联系方式对比面板（需求层 §4.2）。

**VERDICT: ENG + DESIGN CLEARED — ready to implement（待切换非 Opus 模型写代码）。**
