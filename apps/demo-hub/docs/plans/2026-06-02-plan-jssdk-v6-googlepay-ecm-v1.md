# 实现计划 — JSSDK v6 Google Pay ECM v1

> **For agentic workers:** 本计划按 step 顺序实现。demo-hub 为 vanilla JS + 手动浏览器验证，无自动化测试框架，故验收用 `docs/test-cases.md` 手动矩阵（非 pytest TDD）。
>
> 日期：2026-06-02 · 关联：design-fe / design-be / req（同日 `*-jssdk-v6-googlepay-ecm.md`）
>
> ⚠️ 当前 Opus 模型下只能产出本计划（markdown）。实际写代码需切换到 Sonnet 等非 Opus 模型。

**Goal:** 上线 `/paypal/jssdk-v6/googlepay-ecm`，用 v6 SDK 复刻 v5 googlepay-ecm（官方 Google Pay 按钮 + 客制化按钮，Promise 模式，probe-then-decide 3DS），create-order body 与 v5 逐字一致。

**Architecture:** 后端 REST API 不变（`/v2/checkout/orders`，CN 账号），路由近逐字移植 v5；前端用文档化 v6 方法（`findEligibleMethods` → `getDetails('googlepay')` → `createGooglePayOneTimePaymentSession` → `formatConfigForPaymentRequest` → Google `PaymentsClient`（无 callbacks，Promise 模式）→ `confirmOrder` → capture），3DS 实现时按 inspect 结果二选一分支。

**Tech Stack:** Node.js + Express + EJS + vanilla JS；PayPal v6 web-sdk core；Google Pay `pay.js`；Supabase（产品配置）。

---

## 目标（Definition of Done）

`/paypal/jssdk-v6/googlepay-ecm` 上线：UI 与 v5 googlepay-ecm 一致（货币/金额/3DS 选择器/Shipping+Phone 预填/官方按钮/客制按钮/结果区）；create-order body 与 v5 逐字一致；v6 SDK 流程（findEligibleMethods → getDetails → createGooglePayOneTimePaymentSession → formatConfigForPaymentRequest → isReadyToPay → loadPaymentData(Promise) → createOrder → confirmOrder → 3DS(probe) → capture COMPLETED）跑通；Chrome + 沙盒 Google Pay 钱包可完成付款。

## 改动文件清单（预期）

| # | 文件 | 动作 | 来源/参考 |
|---|------|------|-----------|
| 1 | `src/routes/paypal/jssdk-v6/googlepay-ecm.js` | 新建 | 移植 v5 `routes/.../googlepay-ecm.js` + v6 适配（响应 `orderId`、`:orderId`） |
| 2 | `src/views/paypal/jssdk-v6/googlepay-ecm.ejs` | 新建 | 移植 v5 视图 + v6 脚本加载（去 sdkUrl/extraScripts，加 pay.js + v6 core） |
| 3 | `src/public/js/paypal/jssdk-v6/googlepay-ecm.js` | 新建 | v5 逻辑骨架 + v6 Google Pay API + ACDC 风格 inspect 探查 |
| 4 | `src/app.js` | 改：加一行挂载（v6 块、applepay-ecs 之后） | — |
| 5 | `src/routes/paypal/jssdk-v6/CLAUDE.md` | 改：components 表 googlepay-ecm 行 TBD→`['googlepay-payments']`；新增 "Google Pay 专属规则" 段 | — |
| 6 | Supabase `demohub.products` | 插一行（用户执行 SQL） | design-be 第 5 节 |

> 文件 5、6 不是代码逻辑，但属于交付完整性的一部分。

## 步骤

### Step 1 — 后端路由 `googlepay-ecm.js`
- 复制 v5 `googlepay-ecm.js`；`SDK = 'jssdk-v6'`；沿用 `resolveCurrency` + `SCA_METHODS = ['SCA_WHEN_REQUIRED','SCA_ALWAYS']`；CN 账号（`getCNToken` / `PAYPAL_CN_CLIENT_ID`）。
- GET：注入 `clientId`(CN) + `supportedCurrencies` + `defaultAmount` + `currency` + `sandboxShipping`（扁平字段同 v5）+ `sandboxPhone`，**删除 `sdkUrl` 和 `extraScripts`**。
- create-order：body 与 v5 **逐字一致**（reference_id/description/invoice_id/custom_id/soft_descriptor/amount.breakdown/items/shipping（来自 req.body.shipping，fallback SANDBOX_SHIPPING）+ `payment_source.google_pay`{email_address(条件)/phone_number=SANDBOX_PHONE/experience_context(return/cancel 指向 v6 路径)/attributes.verification.method=scaMethod}）；入参 `{amount,currency,shipping,scaMethod,email}`；返回 `{ orderId: order.id }`。
- GET order：`GET /api/googlepay-ecm/order/:orderId`（小写 d），返回原始 PayPal JSON（3DS Branch A 需要）。
- capture-order：`req.body.orderId`（小写 d），标准 capture，返回原始 JSON。
- 验收：`curl` create-order 返回 `{ orderId }`，body 结构 = v5（T11）。

### Step 2 — 视图 `googlepay-ecm.ejs`
- 复制 v5 视图；provider-badge 改 `PayPal · JSSDK v6 · Google Pay`。
- header include **去掉 sdkUrl + extraScripts**。
- 货币下拉用 `supportedCurrencies.forEach`。
- **保留 3DS/SCA 选择器** `#demo-sca`（SCA_WHEN_REQUIRED / SCA_ALWAYS）。
- 保留 Shipping Address & Phone 预填展示块（`sandboxShipping` + `sandboxPhone`）。
- 保留 `#paypal-button-container`（官方按钮，初始 spinner）+ `#custom-googlepay-btn`（客制化按钮，内联样式沿用 v5）+ `#result`。
- 底部注入 `window.DEMO`（clientId / components:['googlepay-payments'] / pageType / urls{createOrder,getOrder,captureOrder} / shipping: JSON.stringify(sandboxShipping)）。
- 四段式脚本：`init.js` → `googlepay-ecm.js` → `https://pay.google.com/gp/p/js/pay.js` → `<script defer ...v6/core>`。

### Step 3 — 前端 `public/js/paypal/jssdk-v6/googlepay-ecm.js`
- IIFE + `'use strict'`；搬运 v5 辅助函数（getCurrency/getAmount/getSCA/isZeroDecimal/validateAmount/showResult/clearLoading + 货币 reload + blur 格式化）；`ZERO_DECIMAL`/`BASE_REQUEST`/`MIN/MAX_AMOUNT` 沿用；模块级 `paymentsClient`/`urls`。
- 加 ACDC 风格 `inspect(label, obj)` 探查工具。
- `onPayPalWebSdkLoaded`：`getPPInstance()` → Google Pay SDK 可用性检查（`window.google && google.payments.api.PaymentsClient`）→ `findEligibleMethods({currencyCode}).isEligible('googlepay')` → `getDetails('googlepay')` → `setupGooglePayButton(instance, details)`（V6-3 嵌套 then）。
- `setupGooglePayButton`：`createGooglePayOneTimePaymentSession()`（同步，inspect 确认）→ `formatConfigForPaymentRequest(details.config)` → `new google.payments.api.PaymentsClient({environment:'TEST'})`（**不传 paymentDataCallbacks**）→ `isReadyToPay` → 官方 `createButton`（black/pay/fill）+ 客制按钮 `#custom-googlepay-btn`，两者绑 `onGooglePaymentButtonClicked(googlePaySession, googlePayConfig)`。
- `getGooglePaymentDataRequest(config, amount, currency)`：`Object.assign(BASE_REQUEST, {allowedPaymentMethods, merchantInfo, transactionInfo{countryCode:'US',currencyCode,totalPriceStatus:'FINAL',totalPrice,totalPriceLabel}, shippingAddressRequired:false, emailRequired:true})`。
- `onGooglePaymentButtonClicked`：`validateAmount` → `paymentsClient.loadPaymentData(req)`（Promise 模式）→ `.then(paymentData)` 取 `email` → fetch createOrder（body `{amount,currency,shipping,scaMethod,email}`）→ `processPayment(d.orderId, paymentData, googlePaySession)`；`.catch` 中 `statusCode==='CANCELED'` 静默，其余 showResult。
- `processPayment(orderId, paymentData, session)`：`session.confirmOrder({orderId, paymentMethodData: paymentData.paymentMethodData})` → `result.status==='PAYER_ACTION_REQUIRED'` ? `handlePayerAction(orderId, session)` : `doCapture(orderId)`。
- `doCapture(orderId)`：fetch captureOrder（body `{orderId}`）→ 查 `purchase_units[0].payments.captures[0].status==='COMPLETED'`（规则 13）→ 成功/失败 showResult。
- **全程 inspect**：instance/eligibility/details/googlePaySession/googlePayConfig/paymentData/confirmOrder result/(initiatePayerAction?)/order details/capture order。
- 验收：见测试矩阵。

### Step 4 — 3DS probe-then-decide（`handlePayerAction`）
- 先 `inspect('googlePaySession', googlePaySession)` 确认是否有 `initiatePayerAction` 方法。
- **Branch A（存在）**：移植 v5 完整路径 —
  - `session.initiatePayerAction({orderId})` → `getOrderDetails(orderId)`（GET urls.getOrder + '/' + orderId）→ `handle3DS(order)`。
  - `handle3DS` 读 `order.payment_source.google_pay.card.authentication_result`，决策表（与 v5 逐字一致）：POSSIBLE→doCapture；NO+enrollment∈{N,U,B}→doCapture；NO+其他→reject；UNKNOWN→reject(retry)；其他→reject。
- **Branch B（不存在）**：`showResult('✗ 3DS action required — please retry', 'error')`，不 capture。
- 实现后删除未走分支，把"v6 googlePaySession 是否含 initiatePayerAction + confirmOrder 实测返回形态"记入 `docs/debug-log.md`；`getOrderDetails`/`handle3DS` 仅 Branch A 保留。

### Step 5 — 挂载 + CLAUDE.md
- `app.js` 在 v6 块 applepay-ecs 之后加 `app.use(v6, require('./routes/paypal/jssdk-v6/googlepay-ecm'))`。
- 更新 `routes/paypal/jssdk-v6/CLAUDE.md`：
  - components 表：`googlepay-ecm` → `['googlepay-payments']`，状态 ✅。
  - 新增 "Google Pay 专属规则" 段，至少记录：
    - 资格检查：`window.google.payments` 浏览器检查 + `findEligibleMethods().isEligible('googlepay')` 账号检查 + `isReadyToPay`；
    - v6 配置：`getDetails('googlepay').config` + `session.formatConfigForPaymentRequest(config)` 取代 v5 `Googlepay().config()`；
    - **ECM = Promise 模式**：`PaymentsClient` 不传 `paymentDataCallbacks`；`loadPaymentData().then()` → createOrder → confirmOrder → capture（对照 v5 规则 14）；
    - `createGooglePayOneTimePaymentSession()` / `formatConfigForPaymentRequest` 同步返回（以 inspect 实测为准）；
    - confirmOrder 来自 `googlePaySession`；3DS = probe-then-decide（initiatePayerAction 是否存在 → 实测结论写此处）；
    - capture 只认 COMPLETED（规则 13）；
    - 脚本加载顺序：init → 产品 JS → Google pay.js → v6 core(defer)；
    - 官方 createButton + 客制按钮同一 handler；ECM phone 用 SANDBOX_PHONE 预填（规则 17）。

### Step 6 — Supabase + 重启
- 执行 INSERT（design-be 第 5 节），`sort_order` 取 v6 组内最大值 +1。
- 重启 demo-hub，确认首页 v6 分组出现 Google Pay ECM 卡片。

## 测试矩阵（写入 `docs/test-cases.md`）

| 用例 | 操作 | 期望 |
|------|------|------|
| T1 官方按钮付款 | Chrome + 沙盒 Google Pay 卡，点官方按钮 | 拉起 sheet → `✓ Payment captured · Order: ...` |
| T2 客制按钮付款 | 点 `#custom-googlepay-btn` | 同 T1（同一 handler） |
| T3 无 Google Pay SDK | `window.google.payments` 缺失（脚本被拦） | 显示 "Google Pay SDK is not available"，无未捕获异常 |
| T4 isReadyToPay false | 设备/账号无 Google Pay | 清 spinner，显示 "not available on this device or account" |
| T5 账号不合格 | isEligible('googlepay') false | 显示 "not eligible"，不渲染按钮 |
| T6 用户取消 | sheet 内取消（statusCode CANCELED） | 静默，无红错，可重试 |
| T7 3DS（SCA_ALWAYS）| `#demo-sca`=SCA_ALWAYS → 触发 PAYER_ACTION_REQUIRED | Branch A：完整路径 capture 成功；Branch B：显红色 retry 提示 |
| T8 capture 非 COMPLETED | 触发非完成态 | `✗ Capture failed · status: ...`，不误报成功 |
| T9 货币切换 | 切 `#demo-currency` | reload 带 `?currency=&amount=`，金额保留 |
| T10 inspect 输出 | 任意流程 | console 可见各对象自身属性+原型方法，便于核对 v6 API（重点 googlePaySession 是否含 initiatePayerAction） |
| T11 create-order curl | `curl POST .../api/googlepay-ecm/create-order`（body `{amount,currency,scaMethod}`）| 返回 `{ orderId }`，body 结构（payment_source.google_pay + shipping + verification.method）= v5；免 Chrome |
| T12 eligibility 网络错误 | findEligibleMethods 抛错 | `.catch` 捕获，显示 `✗ ...`，不静默失败 |
| T13 GET order curl | `curl GET .../api/googlepay-ecm/order/<id>` | 返回原始 PayPal order JSON |

## 风险 / 待确认

1. **`googlePaySession.initiatePayerAction` 是否存在**（核心未确认项）：v6 文档只列 `formatConfigForPaymentRequest` / `confirmOrder`，未列 `initiatePayerAction`。Step 4 用 inspect 实测决定 Branch A/B。这是本计划最大不确定点，直接影响 3DS 能否走完整路径。
2. **`createGooglePayOneTimePaymentSession()` / `formatConfigForPaymentRequest` 同步 vs 异步**：参考 demo 为同步。先按同步 + inspect；若实测是 Promise 再加 `await`（注意 V6-3 作用域）。
3. **confirmOrder 返回形态**：v6 文档说返回 `{status}`（APPROVED / PAYER_ACTION_REQUIRED）。inspect 实测后在 CLAUDE.md 固化。
4. **Promise 模式 vs 用户提供的 v6 demo callback 模式**：本计划按用户决策用 Promise 模式（不传 paymentDataCallbacks）。若实测 v6 在 ECM 下强制要求 callback 模式（如报错），回退到 callback 模式并更新 req/design + debug-log（视为范围变更，需用户确认）。
5. **transactionInfo.countryCode 来源**：v5 硬编码 'US'；v6 `googlePayConfig.countryCode` 可能可用。先沿用 'US'，inspect 后可选改用 config.countryCode。
6. **本地真实付款环境**：Google Pay sheet 需 Chrome + 沙盒 Google 账号 + 关联测试卡。本地若无法完成真实 sheet，至少验证按钮渲染 + 资格判定 + create-order/GET order/capture 端点（T11/T13）。

## 评审（计划写好后执行）

- `/plan-eng-review`（架构 / 边界，必跑）
- `/plan-design-review`（UI 一致性 / 交互态，可选 — UI 复刻 v5）
- 可选 `/autoplan` 一键跑全套

## 执行交接（Execution Handoff）

> ⚠️ 实现需切换到非 Opus 模型（Opus 仅可写 markdown）。

实现顺序为单线（route → view → js → 3DS 分支 → 挂载/CLAUDE.md → SQL），3 个核心文件强耦合同一 demo，无并行机会。建议在 Sonnet 下逐 step 执行，每个 step 后人工核对。

---

## 评审结果 — plan-eng-review（2026-06-02）

### Step 0 范围挑战
- **范围合适，无需缩减**：6 文件（route/view/js + app.js 挂载 + CLAUDE.md + SQL）、0 新 class/service，低于复杂度阈值。后端是 v5 `googlepay-ecm.js` 的近逐字克隆；前端复用 v6 `applepay-ecm.js` 既有约定（inspect / 双按钮 / capture-COMPLETED / 货币 helper）+ `init.js`。
- **Search 分层**：ECM Promise 模式 = [Layer 1]（同 v5 + Google 官方参考）；`confirmOrder` / `formatConfigForPaymentRequest` = 文档化 v6 方法 [Layer 1]；`googlePaySession.initiatePayerAction` 是否存在 = [Layer 3] 唯一第一性未知，已由 probe-then-decide 兜底。
- **Completeness**：计划为完整版（3DS Branch A 完整路径 + 货币零小数位 + curl 端点测试 T11/T13），非 shortcut。

### What already exists（复用，未重建）
- `routes/paypal/jssdk-v5/googlepay-ecm.js` — 后端模板（仅改 prefix/view/clientId/响应字段/`:orderId`）。
- `public/js/paypal/jssdk-v6/applepay-ecm.js` — `inspect()` 探查 + 双按钮同 handler + 货币/金额 helper + capture-COMPLETED。
- `public/js/paypal/jssdk-v5/googlepay-ecm.js` — Promise 模式流程骨架 + `handle3DS` 决策表（Branch A 直接移植）。
- `public/js/paypal/jssdk-v6/init.js` — `getPPInstance()` 单例。
- v5 `googlepay-ecm.ejs` — 视图结构 + 3DS 选择器 + 客制按钮内联样式。

### 各 section 结论
- **架构（0 issues）**：干净。后端 REST API 不变；前端均为文档化 v6 方法。无 SPOF、无新基础设施。唯一真实生产风险已被计划捕获：v6 若无 `initiatePayerAction`，Promise 模式下 `PAYER_ACTION_REQUIRED` 无 SDK 驱动 3DS 弹窗 → 订单停留未 capture（Branch B 显红色 retry，非静默失败）。**建议（排序，非计划变更）**：实现时优先用 `SCA_ALWAYS`（T7）早期 probe `googlePaySession`，先定 Branch A/B 再写后续，避免返工。
- **代码质量（1 issue，carry-over）**：D1（DRY）— 各独立 IIFE 各带一份 helper。**决议：维持现状**（沿用 applepay D1 用户确认的全 v6 demo 约定，单文件即完整示例）。另：v5 capture-order 读 `req.body.orderID`（大写）+ 前端传 `{orderID}`；v6 全链路改小写 `orderId` 的字段重命名已在 Step 1 + design-be §3.4 显式标注，避免逐字克隆时漏改。
- **测试（手动矩阵，0 critical gap）**：demo-hub 无自动化框架，测试 = `test-cases.md` 手动矩阵 T1–T13。免浏览器的 curl 端点测试已含（T11 create-order / T13 GET order）。T7 双验收结果对应 probe 两分支，正确。无"无测试 + 无错误处理 + 静默失败"的 codepath。
- **性能（0 issues）**：N/A（单页、两三个 fetch、配置启动缓存）。

### NOT in scope（已考虑，明确不做）
- **callback 模式（onPaymentAuthorized + callbackIntents）**：用户决策用 Promise 模式（同 v5）。仅当实测 v6 在 ECM 下强制 callback 模式才回退（风险 #4），属范围变更需用户确认。
- **共享 helper 模块抽取**：违背"单文件即完整示例"约定（D1 决议）。
- **ECS 流程 / shippingAddressRequired:true / 运费选择**：本 demo 是 ECM（商户预填、`shippingAddressRequired:false`），ECS 另立 `googlepay-ecs`。
- **vault / 重复扣款**：本 demo 仅一次性付款。
- **Branch A 的 `getOrderDetails`/`handle3DS` 在 Branch B 下保留**：probe 确认 Branch B 后删除，避免死代码。

### Failure modes（每条新 codepath 的现实失败）
| Codepath | 失败方式 | 有测试? | 有错误处理? | 用户可见? |
|---|---|---|---|---|
| loadPaymentData | 用户取消（CANCELED）/ sheet 失败 | T6 | `.catch` CANCELED 静默，余 showResult | ✅ |
| createOrder fetch | 4xx/5xx / 网络 | 部分（T11 curl） | `.catch` → showResult | ✅ |
| confirmOrder | v6 返回形态未知 | 探查（T10） | try/catch + inspect | ✅ |
| PAYER_ACTION_REQUIRED | 无 initiatePayerAction（Branch B） | T7 | 显红色 retry，不 capture | ✅（非静默） |
| handle3DS（Branch A） | liability_shift NO/UNKNOWN | T7 | 决策表 reject + showResult | ✅ |
| capture | 非 COMPLETED | T8 | status 判定（规则 13） | ✅ |
| findEligibleMethods | 网络错误 | T12 | `.catch` | ✅ |
- **无 critical gap**。

### 并行化策略
- **顺序实现，无并行机会**：route/view/js 强耦合同一 demo，依次实现（route → view → js → 3DS 分支 → 挂载/CLAUDE.md → SQL）。

### Completion Summary
- Step 0 范围：accepted as-is（未缩减）
- 架构：0 issues
- 代码质量：1 issue（D1 DRY，carry-over）→ 维持现状
- 测试：矩阵 T1–T13，0 gap（curl 端点测试已含）
- 性能：0 issues
- NOT in scope / What exists / Failure modes：已写
- 关键 gap：0
- Outside voice：跳过（用户按计划，未跑 codex）
- 并行化：单线，0 并行
- Lake score：N/A（无可缩减项；计划已是完整版）

> 备注：依项目规则未执行任何 git 操作；gstack telemetry / review-log / dashboard 等 onboarding 步骤已跳过（本仓库非 gstack 项目，相关 bin 未配置）。实现需切换到非 Opus 模型（Opus 仅可写 markdown）。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 1 issue (DRY → 维持现状), 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED — ready to implement（实现需切换到非 Opus 模型，当前 Opus 仅可写 markdown）
