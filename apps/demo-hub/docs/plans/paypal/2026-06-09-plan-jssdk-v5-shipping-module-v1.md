# 实现计划 — Shipping Module (shipping-module) · JSSDK v5 · v1

> 日期：2026-06-09
> 关联需求：`docs/req/2026-06-09-req-jssdk-v5-shipping-module.md`
> 关联设计：`docs/design/2026-06-09-design-fe-jssdk-v5-shipping-module.md` · `docs/design/2026-06-09-design-be-jssdk-v5-shipping-module.md`
> 状态：待实现（**Opus 只写文档；代码须切换到非 Opus 模型（如 Sonnet）实现**）

---

## 0. 完成定义（Definition of Done）

**本地（仅代码可验证）：**
- 访问 `/paypal/jssdk-v5/shipping-module` 渲染页面；Merchant/Currency 切换正常；PayPal 按钮渲染。
- create-order 返回 order id；请求体含 `order_update_callback_config`，`callback_url` 内嵌
  `item_total/currency/decline/merchant`，`callback_events` 随复选框变化。
- `curl` 打 callback 端点：首次回调（无 option）/ 选项回调（带 option.id）/ decline=COUNTRY_ERROR
  分别返回正确 200 JSON 与 422 JSON；金额满足一致性约束。
- 控制台 inspect/probe 打印齐全。

**服务器（用户部署 `demo.cwen5.com` 后）：**
- review 页出现三运送选项 + 税/运费；切选项金额更新；decline 模式 review 页报错；capture `COMPLETED`。

---

## 1. 前置确认（实现前先看）

- [ ] 通读 `spb-ecs.js`（ECS 建单模板）+ `_factory.js`（GET 渲染 / token / 端点模式）。
- [ ] 通读 `spb.js`（按钮 + 金额校验 + reload 模式）+ `spb-ecs.ejs`（页面骨架）。
- [ ] 确认 `.env` 有 `PAYPAL_CN_*` / `PAYPAL_US_*`；新增 `PUBLIC_BASE_URL`。
- [ ] 确认 `config/paypal.js` 有 `getCNToken` / `getUSToken` / `getHeaders` / `API`（已有）。

---

## 2. 任务拆解

### Task 1 — 路由文件 `src/routes/paypal/jssdk-v5/shipping-module.js`（新增）

按 be 设计 §1–§5。`const C = require('../../../config/constants')`。

- [ ] **GET `/shipping-module`**：读 `req.query.merchant`（默认 cn）→ 选 client-id；`stripCurrency` + 动态 currency；
      CN 加 `buyer-country=US`；渲染，注入 `merchant` / `currency` / `defaultAmount` / sidebar 等（参考 _factory GET）。
- [ ] **POST `/api/shipping-module/create-order`**：读 `{ amount, currency, merchant, subscribeOptions, decline }`；
      `validateAmount`；`getCNToken()/getUSToken()`；按 §3 组装 body（`buildCallbackUrl` 内嵌 query）；返回 `{ id }`。
- [ ] **POST `/api/shipping-module/callback`**：按 §4 —— 先判 decline（422），否则重算金额 + 返回选项；
      响应顶层 `id` 用回调请求体 `id`（order id）；全程 console.log。
- [ ] **POST `/api/shipping-module/capture-order`**：读 `{ orderID, merchant }`；对应 token；capture；返回完整 order。
- [ ] 辅助函数 `buildCallbackUrl` / `OPTIONS` / `fmt` 内置本文件（产品自包含，规则 1）。

**验收**：路由可挂载；GET 200 渲染；`curl` create-order 返回 id；`curl` callback 三种入参返回符合 §4。

### Task 2 — 主视图 `src/views/paypal/jssdk-v5/shipping-module.ejs`（新增）

按 fe 设计 §1–§2、§5。

- [ ] include header/footer；sandbox-header（badge / h1 / 说明）。
- [ ] 控件行：Merchant 下拉（sticky selected）/ Currency 下拉（沿用 spb-ecs 写法）/ Amount 输入 /
      `#subscribe-options` 复选框 / `#simulate-decline` 下拉。
- [ ] info 说明条（本地不触发回调）。
- [ ] `#paypal-button-container` + `#result` + `#amount-error`。
- [ ] `window.DEMO` 注入（urls + merchant + currency）；引入 `shipping-module.js`。
- [ ] 页内 scoped `<style>` 仅做新控件轻量布局。

**验收**：页面渲染正确，控件 sticky，视觉与其他 v5 demo 一致。

### Task 3 — 前端逻辑 `src/public/js/paypal/jssdk-v5/shipping-module.js`（新增）

按 fe 设计 §3。IIFE + `'use strict'`。

- [ ] `readControls()`（amount/currency/merchant/subscribeOptions/decline）。
- [ ] Merchant + Currency change → reload（互相保留值 + amount）。
- [ ] amount blur 格式化 + `validateAmount`（沿用 spb.js 规则，零小数取整）。
- [ ] `paypalSDK.Buttons`：createOrder（发全部控件）/ onApprove（capture + 规则 13 + 展示最终金额）/ onCancel / onError。
- [ ] `showResult` / `clearLoading` 本文件内置。
- [ ] inspect/probe console.log（fe §7）。

**验收**：按钮渲染；本地点按钮 create-order 成功拿 id（review 页回调本地不触发，属预期）。

### Task 4 — 挂载 `src/app.js`

- [ ] v5 区块 `fastlane-fp` 之后追加：`app.use(v5, require("./routes/paypal/jssdk-v5/shipping-module"));`

### Task 5 — env 与示例

- [ ] `.env.example` 追加 `PUBLIC_BASE_URL`（be §6.2）。
- [ ] 本地 `.env` 填 `PUBLIC_BASE_URL=https://demo.cwen5.com`。
- [ ] （响应顶层 `id` 先用 order id，不需要商户 id env；若服务器实测被拒再补 `PAYPAL_*_MERCHANT_ID`。）

### Task 6 — Supabase（用户手动）

- [ ] 执行 be 设计 §6.1 的 INSERT（自动取 sort_order）。
- [ ] 重启 demo-hub，确认首页出现 Shipping Module 卡片。

### Task 7 — QA

**本地（curl + 浏览器）：**
- [ ] GET 页面渲染 + Merchant/Currency 切换 sticky。
- [ ] `curl` 首次回调（body 仅 shipping_address）→ 三选项，Free selected，value=item+tax。
- [ ] `curl` 选项回调（body 带 shipping_option.id=2）→ id=2 selected，value 含 $7。
- [ ] `curl` `?decline=COUNTRY_ERROR` + 仅地址 → 422 COUNTRY_ERROR。
- [ ] `curl` `?decline=METHOD_UNAVAILABLE` + 带 option → 422 METHOD_UNAVAILABLE。
- [ ] 金额一致性自检（shipping==selected、value==sum、currency 一致、零小数取整）。
- [ ] **奇数分边界用例**：item_total 取会产生半分税的值（如 `19.99` → 税 0.9995、`10.10` 等）curl 回调，
      验证 `value` 严格等于 breakdown 三项相加（D2 取整顺序），不差 1 分。
- [ ] **脏数据守卫**：`curl` callback 传 `item_total=abc` / `item_total=-5` → 返回 400，不返回 fmt(NaN)。
- [ ] create-order 请求体 `callback_events` 随复选框变化；`callback_url` query 正确。

**本地 curl 命令（demo-hub 跑在 localhost:3000）：**

```bash
# 1. 首次回调（无 shipping_option）→ 三选项 Free selected, value = item + tax
curl -s -X POST \
  "http://localhost:3000/paypal/jssdk-v5/api/shipping-module/callback?cart_id=DEMO&item_total=100.00&currency=USD&decline=none" \
  -H "Content-Type: application/json" \
  -d '{"id":"ORDER123","shipping_address":{"address_line_1":"123 Main St","admin_area_2":"San Jose","admin_area_1":"CA","postal_code":"95131","country_code":"US"}}' | jq .
# 期望：shipping_options[0].selected=true, amount.value="106.00", tax_total="5.00", shipping="0.00"

# 2. 选项回调（shipping_option.id=2，USPS $7）→ id=2 selected, value 含运费
curl -s -X POST \
  "http://localhost:3000/paypal/jssdk-v5/api/shipping-module/callback?cart_id=DEMO&item_total=100.00&currency=USD&decline=none" \
  -H "Content-Type: application/json" \
  -d '{"id":"ORDER123","shipping_option":{"id":"2"},"shipping_address":{"country_code":"US"}}' | jq .
# 期望：shipping_options[1].selected=true, amount.value="113.00", shipping="7.00"

# 3. 选项回调（shipping_option.id=3，1-Day $10）→ id=3 selected
curl -s -X POST \
  "http://localhost:3000/paypal/jssdk-v5/api/shipping-module/callback?cart_id=DEMO&item_total=100.00&currency=USD&decline=none" \
  -H "Content-Type: application/json" \
  -d '{"id":"ORDER123","shipping_option":{"id":"3"},"shipping_address":{"country_code":"US"}}' | jq .
# 期望：shipping_options[2].selected=true, amount.value="116.00", shipping="10.00"

# 4. COUNTRY_ERROR + 地址事件（无 shipping_option）→ HTTP 422
curl -s -w "\nHTTP %{http_code}" -X POST \
  "http://localhost:3000/paypal/jssdk-v5/api/shipping-module/callback?item_total=100.00&currency=USD&decline=COUNTRY_ERROR" \
  -H "Content-Type: application/json" \
  -d '{"id":"ORDER123","shipping_address":{"country_code":"RU"}}' | jq .
# 期望：HTTP 422, {"name":"UNPROCESSABLE_ENTITY","details":[{"issue":"COUNTRY_ERROR"}]}

# 5. METHOD_UNAVAILABLE + 选项事件 → HTTP 422
curl -s -w "\nHTTP %{http_code}" -X POST \
  "http://localhost:3000/paypal/jssdk-v5/api/shipping-module/callback?item_total=100.00&currency=USD&decline=METHOD_UNAVAILABLE" \
  -H "Content-Type: application/json" \
  -d '{"id":"ORDER123","shipping_option":{"id":"2"},"shipping_address":{"country_code":"US"}}' | jq .
# 期望：HTTP 422, {"name":"UNPROCESSABLE_ENTITY","details":[{"issue":"METHOD_UNAVAILABLE"}]}

# 6. D2 奇数分边界（item_total=1.30，税 0.065 → 取整 0.07）
curl -s -X POST \
  "http://localhost:3000/paypal/jssdk-v5/api/shipping-module/callback?item_total=1.30&currency=USD&decline=none" \
  -H "Content-Type: application/json" \
  -d '{"id":"ORDER123","shipping_address":{"country_code":"US"}}' | jq .
# 期望：item_total="1.30", tax_total="0.07", shipping="0.00", value="1.37"（不是 1.36）

# 7. D2 奇数分（item_total=19.99）
curl -s -X POST \
  "http://localhost:3000/paypal/jssdk-v5/api/shipping-module/callback?item_total=19.99&currency=USD&decline=none" \
  -H "Content-Type: application/json" \
  -d '{"id":"ORDER123","shipping_address":{"country_code":"US"}}' | jq .
# 期望：tax_total="1.00", value="20.99"

# 8. 脏数据守卫 — item_total=abc → HTTP 400
curl -s -w "\nHTTP %{http_code}" -X POST \
  "http://localhost:3000/paypal/jssdk-v5/api/shipping-module/callback?item_total=abc&currency=USD&decline=none" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
# 期望：HTTP 400, {"error":"invalid item_total"}

# 9. 脏数据守卫 — item_total=-5 → HTTP 400
curl -s -w "\nHTTP %{http_code}" -X POST \
  "http://localhost:3000/paypal/jssdk-v5/api/shipping-module/callback?item_total=-5&currency=USD&decline=none" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
# 期望：HTTP 400, {"error":"invalid item_total"}

# 10. DC state → 无条件 STATE_ERROR 422（优先于 decline 参数）
curl -s -w "\nHTTP %{http_code}" -X POST \
  "http://localhost:3000/paypal/jssdk-v5/api/shipping-module/callback?item_total=100.00&currency=USD&decline=none" \
  -H "Content-Type: application/json" \
  -d '{"id":"ORDER123","shipping_address":{"admin_area_1":"Washington","admin_area_2":"DC","country_code":"US"}}' | jq .
# 期望：HTTP 422, {"name":"UNPROCESSABLE_ENTITY","details":[{"issue":"STATE_ERROR"}]}

# 11. NY state → $10 SUMMER_SALE discount in breakdown
curl -s -X POST \
  "http://localhost:3000/paypal/jssdk-v5/api/shipping-module/callback?item_total=100.00&currency=USD&decline=none" \
  -H "Content-Type: application/json" \
  -d '{"id":"ORDER123","shipping_address":{"admin_area_2":"NY","country_code":"US"}}' | jq .
# 期望：amount.value="95.00", breakdown.item_total="100.00", tax_total="5.00",
#       shipping="0.00", discount.value="10.00", discount.breakdown[0].discount_code="SUMMER_SALE"
```

**服务器（部署后，inspect/probe 定稿）：**
- [ ] CN 商户：review 页选项/金额是否真实更新（后端控制台看回调命中）；无效→切 US 重测。
- [ ] 切运送选项金额更新（订阅 SHIPPING_OPTIONS）。
- [ ] decline 各模式 review 页报对应错误。
- [ ] capture `COMPLETED`，最终金额含运费。
- [ ] 回填真实回调字段到 be/fe 设计（去掉推断标记），异常记 `docs/debug-log.md`。

### Task 8 — 文档收尾

- [ ] 更新 `src/routes/paypal/jssdk-v5/CLAUDE.md`：
  - SDK params 表加 `shipping-module` 行。
  - 自定义路由备注加 `shipping-module` 段（4 端点、CN/US 切换、URL 内嵌无状态回调、422 拒绝、响应 id 用 order id）。
  - 新增规则 20（见下）。
- [ ] 更新 `docs/progress.md` / `docs/todos.md`（Venmo / client-side 回调留 todo）。

---

## 3. 拟新增 CLAUDE 规则（规则 20，Task 8 落地）

> **规则 20 — Shipping module 用 server-side callback，无状态化靠 callback_url 内嵌**
> - `order_update_callback_config.callback_url` 须公网可达（`PUBLIC_BASE_URL`）；localhost 回调不触发。
> - 回调是服务器→服务器，无 session、建单时无 order id：把 cart 信息（item_total/currency/decline/merchant）
>   **内嵌 callback_url query**，回调无状态重算，不用内存 Map。
> - `shipping_preference` 必须 `GET_FROM_FILE` 才触发回调；`user_action` 用 `CONTINUE`（ECS 有 review 页选地址，`PAY_NOW` 不适用）。
> - 回调成功响应须满足金额一致性：`breakdown.shipping` == selected 选项金额；`amount.value` == breakdown 之和；
>   currency 一致；零小数币种取整。
> - **取整顺序（D2）**：明细三项各自先 `fmt` 取整（itemR/taxR/shipR），`value` 由「取整后」三项相加得出，
>   不能用未取整的中间值算 value——否则奇数分税额下 value 与明细之和差 1 分，PayPal 拒。公网端点对 `item_total` 加 NaN/负数守卫。
> - 拒绝用 HTTP 422 `{ name:'UNPROCESSABLE_ENTITY', details:[{issue:<REASON>}] }`；地址类 vs 选项类按事件区分。
> - 响应顶层 `id` 先用回调请求体的 `id`（order id）；若 PayPal 校验失败再改商户 ID（env）。
- **PayPal callback body 地址字段**：普通州 `admin_area_1` = state 缩写（如 `"NY"`），`admin_area_2` = city。DC 特例：`admin_area_1="Washington"`，`admin_area_2="DC"`（缩写在 area2）。须同时判断：`area1 === 'DC' || area2 === 'DC'`。
- **State 特殊规则**：DC（area1 或 area2 = `'DC'`）→ 无条件 422 STATE_ERROR（优先于 decline 参数）；NY（area1 = `'NY'`）+ **US merchant only**（`query.merchant === 'us'`）→ 注入 $10 SUMMER_SALE discount（breakdown.discount + valueR -= 10）；CN merchant NY 走普通路径。
- **SDK URL**：CN 和 US 两个商户均加 `buyer-country=US`（CN 为沙盒登录，US 为运送地址选择）；`merchant` 加入 `callback_url` query 以便 callback 判断商户类型。

---

## 4. 实现顺序建议

1. Task 1（路由）+ Task 4（挂载）+ Task 5（env）→ GET 渲染 + curl create-order/callback 先通。
2. Task 2（视图）→ Task 3（前端）→ 浏览器点按钮拿 order id。
3. Task 6（Supabase）→ 首页卡片。
4. Task 7 本地 QA（curl 全场景）→ 部署后服务器 QA 定稿 → Task 8 文档。

---

## 5. 风险与回退

| 风险 | 回退方案 |
|------|----------|
| callback_url query 未被 PayPal 保留 | 改模块级 Map 按 sessionKey 存（sessionKey 内嵌 URL，类比 fastlane-fp） |
| CN 商户不支持 shipping callback | 切 US 商户（切换能力已内建，用户 #5） |
| 金额一致性被 PayPal 拒 | 按实测错误调整 breakdown 字段/精度，记 debug-log |
| 响应顶层 id 用 order id 被拒 | 改用商户 id（加 `PAYPAL_*_MERCHANT_ID` env + callback_url 带 merchant）；inspect 真实要求 |
| 首次回调含/不含 shipping_option 与推断不符 | inspect 真实 body，调整 §4 判定 |

---

## 6. 不做（本期，留 todo）

- Venmo（payment_source.venmo，需 US + buyer-country=US）。
- client-side 回调（onShippingAddressChange / onShippingOptionsChange）。
- 真实购物车 / 多 item / 真实税费引擎。
- SET_PROVIDED_ADDRESS / NO_SHIPPING 偏好演示。

---

## 7. 涉及文件汇总

**新增：**
- `src/routes/paypal/jssdk-v5/shipping-module.js`
- `src/views/paypal/jssdk-v5/shipping-module.ejs`
- `src/public/js/paypal/jssdk-v5/shipping-module.js`

**修改：**
- `src/app.js`（挂载一行）
- `.env.example`（1 个新变量：`PUBLIC_BASE_URL`）
- `src/routes/paypal/jssdk-v5/CLAUDE.md`（SDK 表 + 备注 + 规则 20）
- `docs/progress.md` / `docs/todos.md`

**外部（用户手动）：**
- Supabase `demohub.products` INSERT
- `.env` 填值 + 部署到 `demo.cwen5.com`

---

## 8. 测试覆盖图（/plan-eng-review）

> demo-hub 无自动化测试框架（30+ demo 均手动 QA，保持一致）。覆盖 = curl + 浏览器手动。

```
CODE PATHS (shipping-module.js)                         覆盖
─────────────────────────────────────────────────────────────
GET /shipping-module
  ├── merchant=cn (默认)                                [本地浏览器 ✓]
  └── merchant=us 切换                                  [本地浏览器 ✓]
POST /api/.../create-order
  ├── callback_events: [SHIPPING_ADDRESS]              [curl 查 body ✓]
  ├── callback_events: 两个都订                         [curl 查 body ✓]
  └── callback_url 内嵌 item_total/currency/decline    [curl 查 body ✓]
POST /api/.../callback  ← 核心
  ├── 首次回调（无 shipping_option）→ 三选项,Free selected [curl ✓]
  ├── 选项回调（带 option.id=2）→ id2 selected,含运费     [curl ✓]
  ├── 金额一致性 value==breakdown 之和                   [curl ✓]
  ├── 奇数分边界(19.99/10.10) value 不差分 (D2)          [curl ✓ 新增]
  ├── decline 地址类(COUNTRY_ERROR)+地址事件 → 422       [curl ✓]
  ├── decline 选项类(METHOD_UNAVAILABLE)+选项事件 → 422  [curl ✓]
  ├── decline/event 类型不匹配 → 走成功路径              [curl ✓ 应补]
  └── item_total 脏数据(abc/-5) → 400 (D2 守卫)         [curl ✓ 新增]
POST /api/.../capture-order
  └── captures[0].status==COMPLETED 判定 (规则13)       [服务器浏览器]

服务器端到端（部署后）
  ├── review 页出现三选项 + 税/运费                      [服务器 ✓]
  ├── 切选项金额更新                                     [服务器 ✓]
  ├── decline 各模式 review 页报错                       [服务器 ✓]
  └── CN 无效 → 切 US 重测                               [服务器 ✓]

COVERAGE: 本地代码路径 curl 全覆盖；端到端回调命中依赖服务器（localhost 不触发，设计已知）
```

## 9. 失败模式（关键路径）

| codepath | 失败方式 | 有测试? | 有错误处理? | 用户可见? |
|----------|----------|---------|-------------|-----------|
| callback 收到脏 item_total | fmt(NaN) 返回乱金额 | curl ✓ | 400 守卫 (D2) | 清晰(400) |
| 金额取整不一致 | value≠breakdown,PayPal 拒 | curl ✓ | D2 取整顺序根治 | review 页错误 |
| PUBLIC_BASE_URL 漏配 | callback_url=undefined/... | — | **无(D1 用户接受)** | PayPal 报错(隐晦) |
| CN 商户不支持回调 | review 页无更新/超时 | 服务器 | 切 US fallback | review 页 |
| capture 非 COMPLETED | 误判扣款成功 | — | 规则13 判定 | 清晰错误 |

> **D1 为唯一已知缺口**（PUBLIC_BASE_URL 漏配静默失败）：用户选择不处理（假定 env 一定配好）。非 critical（部署前必配），但记录在案。

## GSTACK REVIEW REPORT

> /plan-eng-review · 2026-06-09 · 交互式（Step 0 scope + Arch + Code Quality + Tests + Perf）

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run（demo 增量，scope 用户预先确认） |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 2 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run（复用 sandbox-card，无新设计系统） |
| Outside Voice | `/codex` | Independent 2nd opinion | 0 | — | 可选，未运行 |

**决策记录（2 findings）：**
- **D1 — PUBLIC_BASE_URL 漏配静默失败**：用户选 **不处理**（假定 env 一定配好）。已知缺口，记入 §9。
- **D2 — 金额取整一致性**：用户选 **先取整再求和 + NaN 守卫**。已改 be 设计 §4.2 + 规则 20 + QA 用例（奇数分边界 / 脏数据守卫）。

**Step 0**：scope 合适未削减（6 文件 < 8 阈值；4-handler 单路由非新类）。
**What already exists（复用未重建）**：`spb-ecs.js`(ECS 建单)、`_factory.js`(GET/token/capture 模式)、`spb.js`(按钮/金额校验/reload)、`constants.js`(DEMO_*/isZeroDecimal/validateAmount)、`googlepay-ecs.js`(运送选项思路)。
**Test review**：无 harness（与 30+ demo 一致），curl + 浏览器手动；本地代码路径 curl 全覆盖。
**Performance**：回调 O(1) 无状态无 DB，无 N+1，无问题。
**NOT in scope**（见 §6）：Venmo / client-side 回调 / 真实购物车/税引擎 / SET_PROVIDED_ADDRESS·NO_SHIPPING。
**并行化**：顺序实现，无并行机会（route→ejs→js→QA 链式强依赖）。

**VERDICT: ENG CLEARED — ready to implement（待切换非 Opus 模型写代码）。**
