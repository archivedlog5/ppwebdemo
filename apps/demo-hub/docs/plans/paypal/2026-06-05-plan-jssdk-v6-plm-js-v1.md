# 实现计划 — JSSDK v6 PLM-JS v1

> **For agentic workers:** 本计划按 step 顺序实现。demo-hub 为 vanilla JS + 手动浏览器验证，无自动化测试框架，故验收用 `docs/test-cases.md` 手动矩阵（非 pytest TDD）。
>
> 日期：2026-06-05 · 关联：design-fe / design-be / req（同日 `*-jssdk-v6-plm-js.md`）
>
> ⚠️ 当前 Opus 模型下只能产出本计划（markdown）。实际写代码需切换到 Sonnet 等非 Opus 模型。

**Goal:** 上线 `/paypal/jssdk-v6/plm-js`，演示 PayPal Messages SDK v6 的 **JavaScript 配置模式**：`fetchContent()` + `setContent()` 渲染单条消息；`content.update({ amount })` 走缓存更新金额；交互式样式下拉框（logoType/logoPosition/textColor）改动重新 `fetchContent()`；`createLearnMore({ presentationMode })` + `paypal-message-click` 控制 Learn More。UI 骨架参考 v5 plm-js（单消息 + Current JS Config + Event Log）。

**Architecture:** 后端仅 GET-only 自定义路由（无订单 API，近逐字克隆 `plm-html.js`，仅改 PRODUCT_KEY + view）。前端用文档化 v6 Messages JS API：`getPPInstance()` → `createPayPalMessages({ currencyCode, buyerCountry })` → `fetchContent({...onContentReady,onTemplateReady})` → `messageEl.setContent()`；金额走 `content.update()`；样式走重新 fetch；`createLearnMore` + 监听 `paypal-message-click`。

**Tech Stack:** Node.js + Express + EJS + vanilla JS；PayPal v6 web-sdk core（`components:['paypal-messages']`）；Supabase（产品配置）。无 PayPal REST、无 Google/Apple 第三方 SDK。

---

## 目标（Definition of Done）

`/paypal/jssdk-v6/plm-js` 上线：UI 骨架与 v5 plm-js 一致（Country/Amount 控件 + 单条渲染消息 + Current JS Config + Event Log），并新增样式下拉框 + presentationMode 选择器；纯 JS 配置渲染（`<paypal-message>` 无 auto-bootstrap）；金额改动走 `content.update()`（Event Log 见 `onTemplateReady`）；样式改动走重新 `fetchContent()`（Event Log 见 `onContentReady`）；点击消息按当前 presentationMode 弹 Learn More；切 Country 刷页重映射 currency；八国市场（US/AU/DE/ES/FR/IT/GB/CA）。

## 改动文件清单（预期）

| # | 文件 | 动作 | 来源/参考 |
|---|------|------|-----------|
| 1 | `src/routes/paypal/jssdk-v6/plm-js.js` | 新建 | 近逐字克隆 `routes/.../plm-html.js`，仅改 `PRODUCT_KEY='plm-js'` + render 路径 |
| 2 | `src/views/paypal/jssdk-v6/plm-js.ejs` | 新建 | v5 plm-js 视图骨架 + v6 三段式脚本 + 样式/presentation 下拉框 |
| 3 | `src/public/js/paypal/jssdk-v6/plm-js.js` | 新建 | v5 plm-js 的 logEvent/updateConfigDisplay/控件骨架 + v6 fetchContent/setContent/content.update/createLearnMore + inspect |
| 4 | `src/app.js` | 改：加一行挂载（v6 块、plm-html 之后） | — |
| 5 | `src/public/js/paypal/jssdk-v6/CLAUDE.md` | 改：components 表 plm-js 行 TBD→`['paypal-messages']` ✅；补 PLM JS 模式细节（fetchContent/content.update/createLearnMore inspect 结论） | — |
| 6 | Supabase `demohub.products` | 插一行（用户执行 SQL） | design-be 第 6 节 |

> 文件 5、6 不是代码逻辑，但属于交付完整性的一部分。

## 步骤

### Step 0 — 早期 probe（写完整逻辑前先做）

> 按"先思考再编码"+ [[feedback_v6_inspect_probe]]，先 inspect 三个核心 v6 句柄的形态，再定细节，避免返工：
>
> 1. **`createPayPalMessages(...)`** 返回 —— 同步对象还是 Promise？（R-RISK-3）有哪些方法（应含 `fetchContent` / `createLearnMore`）。
> 2. **`fetchContent(...)`** 返回的 `content` 句柄 —— 是否含 `update` 方法？`update({ amount })` 能否只改金额并触发 `onTemplateReady`（缓存）？（R-RISK-1/2）
> 3. **`createLearnMore(...)`** 返回的 `learnMore` 句柄 —— 同步/Promise？是否含 `open(config)`？
> 4. **`paypal-message-click` 事件** —— `event.detail.config` 形态（传给 `learnMore.open`）。
> 5. **组件加载** —— 仅 `components:['paypal-messages']` 是否足以让 `<paypal-message>` + fetchContent 工作（规则 V6-PLM-3 三段式），还是需补单独 `web-sdk/v6/paypal-messages` script（plm-html 当前做法）。
>
> probe 做法：先把 Step 1–3 最小版（默认样式 + 首次 fetchContent + setContent）拉到能渲染一条消息，console `inspect()` 上述对象，结论写入 debug-log + CLAUDE.md，再补金额/样式/learnMore 交互。
>
> - `content.update` 存在且生效 → 金额走缓存路径（理想）。
> - `content.update` 缺失/形态不符 → 降级：金额改动也走 `doFetch()`（记 debug-log，R-RISK-1 兜底）。

### Step 1 — 后端路由 `plm-js.js`
- 克隆 `routes/paypal/jssdk-v6/plm-html.js`；`PRODUCT_KEY = 'plm-js'`；render 路径 `paypal/jssdk-v6/plm-js`。
- 沿用 `COUNTRY_TO_CUR` + `PLM_COUNTRIES`；GET：白名单校验 `?country`（fallback US），映射 currency，注入 `clientId`(CN) / `defaultAmount`(`?amount`||'100.00') / `currency` / `country` / sidebar。
- 无 POST endpoint。
- 验收：`curl GET .../plm-js` 200；`?country=DE` 注入 EUR；非法 country fallback US（T8/T9）。

### Step 2 — 视图 `plm-js.ejs`
- include header **不传 sdkUrl**（规则 V6-5）。provider-badge：`PayPal · JSSDK v6 · PLM — JS`。
- 控件区（参考 v5 plm-js + plm-html）：
  - `#demo-country`（八国，selected=当前）、`#demo-amount`（默认值）。
  - **新增** `#demo-logo-type`（WORDMARK/MONOGRAM/TEXT）、`#demo-logo-position`（LEFT/RIGHT/TOP/INLINE）、`#demo-text-color`（BLACK/WHITE/MONOCHROME）；WHITE 旁注 "for dark backgrounds"。
  - **新增** `#demo-presentation`（AUTO/MODAL/POPUP/REDIRECT）；REDIRECT 旁注 "navigates away"。
- 消息区：白卡内 `<paypal-message id="paypal-message"></paypal-message>`（**无 auto-bootstrap、无属性**）。
- Current JS Config `<pre id="plm-js-config">`（沿用 v5 内联样式）。
- Event Log（`#plm-event-log` + `#clear-log-btn`，沿用 v5 内联样式）。
- `test-hint`：八国市场说明。
- 底部注入 `window.DEMO`（design-fe §6）+ 三段式脚本：`init.js` → `plm-js.js` → `<script defer ...v6/core>`（规则 V6-PLM-3）。
  - ⚠️ 若 Step 0 probe #5 判定需单独 messages script，则按 plm-html 改四段式并记 debug-log。

### Step 3 — 前端 `public/js/paypal/jssdk-v6/plm-js.js`
- IIFE + `'use strict'`；搬运 v5 plm-js 的 `getAmount` / `getCurrency` / `logEvent(name, detail)`（时间戳+名称+JSON，insertBefore，封顶 30）/ `updateConfigDisplay(config)` / Clear 按钮 / 国家切换刷页 / amount blur 格式化（`toFixed(2)`，PLM 无零小数）。
- 模块级状态：`messagesInstance` / `content` / `learnMore` / `logCount`、`COUNTRY_TO_CUR`、`messageEl`。
- 加 ACDC 风格 `inspect(label, obj)` 探查工具。
- `buildOptions()`：读三个样式 select + amount + `window.DEMO.currency` → 返回 `{ amount, currencyCode, logoType, logoPosition, textColor }`。
- `doFetch()`：`updateConfigDisplay(buildOptions())` → `content = messagesInstance.fetchContent({ ...opts, onContentReady: c=>{logEvent('onContentReady',{src:'server'}); messageEl.setContent(c)}, onTemplateReady: c=>{logEvent('onTemplateReady',{src:'cache'}); messageEl.setContent(c)} })`（按 Step 0 决定是否 `await`）。
- `onAmountChange()`：校验 → `content.update({ amount })`（存在时；否则 `doFetch()` 降级）→ `updateConfigDisplay`。
- 样式 select change → `doFetch()`。
- `onPresentationChange()`：`learnMore = messagesInstance.createLearnMore({ presentationMode: sel.value, onShow/onApply/onCalculate/onClose → logEvent })`。
- `onMessageClick(event)`：`preventDefault()` → `logEvent('paypal-message-click', ...)` → `learnMore.open(event.detail.config)`。
- 入口 `window.load`：`typeof paypal` 守卫 → `getPPInstance()` → `messagesInstance = sdkInstance.createPayPalMessages({ currencyCode: DEMO.currency||'USD', buyerCountry: DEMO.country||'US' })`（规则 V6-PLM-1，按 Step 0 决定是否 await）→ `doFetch()` → `onPresentationChange()`（建初始 learnMore）→ `messageEl.addEventListener('paypal-message-click', onMessageClick)`。
- `DOMContentLoaded`：绑定 country（刷页）/ amount（change+blur）/ 三个样式 select / presentation select / clear 按钮。
- **全程 inspect**：sdkInstance / messagesInstance / fetchContent 返回 content / content.update / createLearnMore 返回 learnMore / event.detail。

### Step 4 — 挂载 + CLAUDE.md
- `app.js` 在 v6 块 plm-html 之后加 `app.use(v6, require('./routes/paypal/jssdk-v6/plm-js'))`。
- 更新 `public/js/paypal/jssdk-v6/CLAUDE.md`：
  - components 表：`plm-js` → `['paypal-messages']`，状态 ✅。
  - PLM 专属规则段补充 JS 模式（对照已有 V6-PLM-1~4）：
    - **JS 模式 = fetchContent + setContent**（无 auto-bootstrap）；金额走 `content.update({ amount })`（缓存 → onTemplateReady），样式走重新 `fetchContent`（server → onContentReady）。
    - `createPayPalMessages` / `fetchContent` 返回 / `createLearnMore` 返回 的同步 vs Promise 实测结论（Step 0）。
    - `paypal-message-click` + `event.detail.config` → `learnMore.open()`。
    - presentationMode 改动 = 重建 learnMore。
    - 组件加载结论（三段式是否够，或需单独 messages script）。

### Step 5 — Supabase + 重启
- 执行 INSERT（design-be 第 6 节，子查询取 v6 组内 max sort_order +1，plm-html 之后）。
- 重启 demo-hub，确认首页 v6 分组出现 PLM-JS 卡片。

## 测试矩阵（写入 `docs/test-cases.md`）

| 用例 | 操作 | 期望 |
|------|------|------|
| T1 首次渲染 | 加载页面 | 单条消息渲染（默认 WORDMARK/LEFT/BLACK），Event Log 见 `onContentReady`(server)，Config `<pre>` 显示默认 options |
| T2 金额更新（缓存路径）| 改 `#demo-amount` → blur | 消息金额更新，Event Log 见 `onTemplateReady`(cache)，Config amount 同步（若 content.update 不可用→降级 fetch，记 debug-log）|
| T3 logoType 切换 | 选 MONOGRAM / TEXT | 消息样式变化，Event Log 见 `onContentReady`，Config logoType 同步 |
| T4 logoPosition 切换 | 选 RIGHT/TOP/INLINE | 同 T3，position 变化 |
| T5 textColor 切换 | 选 MONOCHROME / WHITE | 同 T3；WHITE 在白卡上不可见（预期，旁注已说明）|
| T6 Learn More 弹出 | 点击消息（presentationMode=AUTO）| `preventDefault` 生效，按 AUTO 弹 Learn More，Event Log 见 `paypal-message-click` + `LearnMore.onShow`；关闭见 `onClose` |
| T7 presentationMode 切换 | 选 MODAL/POPUP 后点消息 | 以新模式展示（modal/popup）|
| T8 REDIRECT 模式 | 选 REDIRECT 后点消息 | 整页跳转 PayPal Learn More 页（预期，旁注已说明）；后退返回 demo |
| T9 国家切换 | 切 `#demo-country` 为 DE | 刷页带 `?country=DE&currency=EUR&amount=`，消息以 EUR + de buyerCountry 重渲染 |
| T10 非法 country | 直接访问 `?country=XX` | 服务端 fallback US/USD，正常渲染 |
| T11 Clear Log | 点 Clear | Event Log 重置为占位文案 |
| T12 SDK 未加载 | `typeof paypal==='undefined'` | 守卫触发，console 报错，不抛未捕获异常 |
| T13 inspect 输出 | 任意流程 | console 可见 sdkInstance/messagesInstance/content/learnMore/event.detail 属性+原型方法 |
| T14 createPayPalMessages 缺参防回归 | 代码核对 | 确认传 `currencyCode`+`buyerCountry`（规则 V6-PLM-1），无 422 |

## 风险 / 待确认

1. **R-RISK-1（content.update 可用性）**：`fetchContent` 返回的 `content` 句柄是否含 `update({ amount })` 并触发 `onTemplateReady`。Step 0 probe 验证。兜底：金额改动降级走 `doFetch()`（功能等价，仅丢失缓存路径演示，记 debug-log）。
2. **R-RISK-2（样式 update）**：文档仅定义 `amount` 可 update，样式按"重新 fetchContent"实现。若实测 `content.update` 支持样式属性可优化（非必须，不阻断）。
3. **R-RISK-3（同步 vs Promise）**：`createPayPalMessages` / `fetchContent` / `createLearnMore` 的同步性。plm-html 当前按 `createPayPalMessages` 同步处理；plm doc JS 示例对 `fetchContent`/`createLearnMore` 用 `await`。Step 0 inspect 后定，必要时加 `await`（注意 V6-3 instance 作用域）。
4. **组件加载（三段式 vs 四段式）**：规则 V6-PLM-3 说仅 `components:['paypal-messages']` 三段式即可；但 plm-html EJS 实际额外引了 `web-sdk/v6/paypal-messages` script。Step 0 probe #5 判定，按实测选三段或四段，记 debug-log。
5. **REDIRECT 离开页面**：预期行为，非 bug，旁注说明。
6. **WHITE textColor 不可见**：白卡背景下 WHITE 文字不可见，预期，旁注说明（不为单条消息引入深色卡切换，保持简单；如需可后续增强）。
7. **本地验证环境**：PLM 消息直连 PayPal sandbox 拉取，CN→sandbox 网络若不稳可能影响 fetchContent（参考 googlepay ERR_CONNECTION_RESET 经验）。若 fetchContent 网络失败，console 记录，页面显示空消息卡——属环境问题非代码 bug，记 debug-log。

## 评审（计划写好后执行）

- `/plan-eng-review`（架构 / 边界，必跑）
- `/plan-design-review`（UI 一致性 / 交互态，可选 — UI 复刻 v5 plm-js + 增量控件）
- 可选 `/autoplan` 一键跑全套

## 执行交接（Execution Handoff）

> ⚠️ 实现需切换到非 Opus 模型（Opus 仅可写 markdown）。

实现顺序为单线（probe → route → view → js → 挂载/CLAUDE.md → SQL），3 个核心文件强耦合同一 demo，无并行机会。建议在 Sonnet 下逐 step 执行；**Step 0 早期 probe 是关键**——先 inspect 三个 v6 句柄形态 + 组件加载方式，再补金额/样式/learnMore 交互，避免返工。本 demo 无支付链路，风险低于 googlepay/applepay 系列。

---

## 评审结果 — plan-eng-review（2026-06-05）

### Step 0 范围挑战
- **范围合适，未缩减**：5 文件（route/view/js + app.js 挂载 + CLAUDE.md）+ 1 SQL，0 新 class/service，远低于复杂度阈值（8 文件 / 2 class）。后端是 `plm-html.js` 的近逐字克隆；前端复用 v5 `plm-js.js`（logEvent/updateConfigDisplay/控件骨架）+ plm-html.js（getPPInstance/createPayPalMessages）+ v6 Messages JS API。
- **Search 分层**：v6 Messages JS API（fetchContent/setContent/content.update/createLearnMore/paypal-message-click）= 文档化 [Layer 1]；唯一第一性未知 = SDK 句柄形态（同步 vs Promise、content.update 是否存在并触发 onTemplateReady），已由 Step 0 probe + 降级兜底覆盖。
- **Completeness**：完整版（交互式样式 + presentationMode 全四值 + server/cache 双回调区分 + 全程 inspect），非 shortcut。

### What already exists（复用，未重建）
- `routes/paypal/jssdk-v6/plm-html.js` — GET-only 路由模板（country→currency 映射）。plm-js 近逐字克隆，仅改 PRODUCT_KEY + view。
- `public/js/paypal/jssdk-v6/plm-html.js` — `getPPInstance()` + `createPayPalMessages({currencyCode,buyerCountry})` 用法。
- `public/js/paypal/jssdk-v5/plm-js.js` — logEvent / updateConfigDisplay / 控件骨架 / 国家刷页 / amount blur。
- `public/js/paypal/jssdk-v6/init.js` — `getPPInstance()` 单例。

### 各 section 结论
- **架构（0 阻断）**：GET-only、无支付链路、镜像 plm-html，干净。唯一观察——R-RISK #4（3 段 vs 4 段脚本加载）已被**已上线**的 plm-html.js（3 段，无单独 paypal-messages script）证明可行，降级为"probe 确认"而非真风险。附带发现：旧 `2026-06-04-design-fe-plm-html-v6.md` §7.2 的 4 段写法与实际 shipped 实现（3 段）不符，属**陈旧文档**（本计划范围外，已标注）。
- **代码质量（1 finding → 维持现状）**：D1（DRY）—— plm-js.js 路由与 plm-html.js 高度重复 + 前端复制 v5 helper。**用户决策：维持现状**，沿用项目"每路由文件只处理一个产品"+ v6"单文件即完整示例"约定（与 googlepay D1 一致），不抽 createPlmRoute 工厂。
- **测试（手动矩阵，1 finding → 不补）**：demo-hub 无自动化框架，测试 = T1–T14 手动矩阵，覆盖前端全 codepath（首渲染 server / 金额 cache / 样式 server / learnMore / presentationMode / 国家刷页 / 非法 country / clear / SDK 守卫）。3 个边界缺口（无效金额 guard、MONOGRAM+非LEFT doc-invalid 组合、fetchContent 网络失败）**用户决策不补**——均为预期行为（静默/环境）非 bug，无回归。0 critical gap。
- **性能（0 issues）**：N/A（单页、少量 fetch、启动缓存配置）。样式改动每次一 fetchContent（离散下拉，低频），无需 debounce。

### NOT in scope（已考虑，明确不做）
- **createPlmRoute 共享路由工厂**：违背单文件示例约定（D1 维持现状）。
- **国家切换纯 JS 无刷页重建**：用户 brainstorm 阶段已选刷页方案。
- **多条消息 / placement gallery**：plm-html 的职责。
- **订单 / 支付链路**：PLM 无支付。
- **content.update 支持样式属性**：文档仅定义 amount，样式走重新 fetch（R-RISK-2，若实测支持可后续优化，非本计划）。
- **深色卡切换以显示 WHITE textColor**：保持单卡简单，旁注说明即可。
- **修复陈旧 plm-html design 文档（§7.2 4段）**：本计划范围外，已标注。

### Failure modes（每条 codepath 的现实失败）
| Codepath | 失败方式 | 有测试? | 有错误处理? | 用户可见? |
|---|---|---|---|---|
| 首次 fetchContent | CN→sandbox 网络失败 | R-RISK #7（无独立行）| console 记录 + 空消息卡 | ⚠️ 空卡（环境问题，非静默崩溃）|
| content.update | 句柄无 update / 形态不符 | T2 + R-RISK-1 | 降级走 doFetch() | ✅ |
| content.update | 无效金额（0/负/NaN）| 无（用户决策不补）| onAmountChange 早返回 | ✅（静默 return，预期）|
| style fetchContent | doc-invalid 组合（MONOGRAM+非LEFT）| 无（用户决策不补）| SDK 自行回退 LEFT（文档）| ✅（SDK 处理）|
| createLearnMore | 同步/Promise 形态不符 | T6/T7 + R-RISK-3 | probe 确认后定 await | ✅ |
| message click | event.detail.config 形态异常 | T6 | inspect 后定，learnMore.open 守卫 | ✅ |
| SDK 未加载 | window.paypal undefined | T12 | window.load 守卫 + console | ✅ |
- **无 critical gap**：唯一非✅项（首次 fetchContent 网络失败→空卡）属 CN→sandbox 环境问题，console 有记录，非静默成功误报。

### 并行化策略
- **顺序实现，无并行机会**：route/view/js 强耦合同一 demo，依次实现（probe → route → view → js → 挂载/CLAUDE.md → SQL）。

### Outside Voice
- **跳过**：低新颖度（plm-html + v5 plm-js 近克隆 + 文档化 [Layer 1] API），用户未要求；同 googlepay 评审处理。

### Completion Summary
- Step 0 范围：accepted as-is（未缩减）
- 架构：0 阻断（1 观察：R-RISK #4 降级 + 陈旧 plm-html 文档标注）
- 代码质量：1 issue（D1 DRY）→ 维持现状
- 测试：矩阵 T1–T14，3 边界缺口 → 用户决策不补，0 critical gap
- 性能：0 issues
- NOT in scope / What exists / Failure modes / 并行化：已写
- 关键 gap：0
- Unresolved decisions：0
- Lake Score：2/2 决策均由用户拍板（D1 维持现状、测试不补）

> 备注：依项目规则未执行任何 git 操作；gstack 升级（1.34→1.56）+ CLAUDE.md 路由注入均跳过（不改用户 curated 文件 + 无 git）。实现需切换到非 Opus 模型（Opus 仅可写 markdown）。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 1 issue (DRY → 维持现状), 0 critical gaps, 0 unresolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED — ready to implement（实现需切换到非 Opus 模型，当前 Opus 仅可写 markdown）
