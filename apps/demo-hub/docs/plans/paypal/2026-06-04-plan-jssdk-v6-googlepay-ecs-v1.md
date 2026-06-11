# 实现计划 — JSSDK v6 Google Pay ECS v1

> **For agentic workers:** 本计划按 step 顺序实现。demo-hub 为 vanilla JS + 手动浏览器验证，无自动化测试框架，故验收用 `docs/test-cases.md` 手动矩阵（非 pytest TDD）。
>
> 日期：2026-06-04 · 关联：design-fe / design-be / req（同日 `*-jssdk-v6-googlepay-ecs.md`）
>
> ⚠️ 当前 Opus 模型下只能产出本计划（markdown）。实际写代码需切换到 Sonnet 等非 Opus 模型。

**Goal:** 上线 `/paypal/jssdk-v6/googlepay-ecs`，用 v6 SDK 复刻 v5 googlepay-ecs（官方 Google Pay 按钮 + 客制化按钮，**Full Callback 模式**，sheet 内选地址/邮箱/电话/运费方式 + 实时改价），create-order body 与 v5 逐字一致。3DS 沿用 ECM（disabled + warning，SCA_ALWAYS 暂不支持）。

**Architecture:** 后端 REST API 不变（`/v2/checkout/orders`，CN 账号），路由近逐字移植 v5 ECS；前端用文档化 v6 方法（`findEligibleMethods` → `getDetails('googlepay')` → `createGooglePayOneTimePaymentSession` → `formatConfigForPaymentRequest` → Google `PaymentsClient`（**带 `paymentDataCallbacks`**，callback 模式）→ `onPaymentDataChanged`（运费）/`onPaymentAuthorized`（createOrder → confirmOrder → capture）），Google Pay 侧 callback 机制与 v5 完全相同。

**Tech Stack:** Node.js + Express + EJS + vanilla JS；PayPal v6 web-sdk core；Google Pay `pay.js`；Supabase（产品配置）。

---

## 目标（Definition of Done）

`/paypal/jssdk-v6/googlepay-ecs` 上线：UI 与 v5 googlepay-ecs 一致（货币/金额/3DS 选择器/"Buyer selects in sheet" 块/官方按钮/客制按钮/结果区，3DS 选择器按 ECM 处理 disabled+warning）；create-order body 与 v5 逐字一致；v6 SDK 流程（findEligibleMethods → getDetails → createGooglePayOneTimePaymentSession → formatConfigForPaymentRequest → isReadyToPay → loadPaymentData(callback) → onPaymentDataChanged 改价 → onPaymentAuthorized: createOrder → confirmOrder → capture COMPLETED）跑通；Chrome + 沙盒 Google Pay 钱包可在 frictionless 路径完成付款（或按 R-RISK-1 记录已知限制）。

## 改动文件清单（预期）

| # | 文件 | 动作 | 来源/参考 |
|---|------|------|-----------|
| 1 | `src/routes/paypal/jssdk-v6/googlepay-ecs.js` | 新建 | 移植 v5 `routes/.../googlepay-ecs.js` + v6 适配（响应 `orderId`、`:orderId`、去 sdkUrl/extraScripts、注入 clientId） |
| 2 | `src/views/paypal/jssdk-v6/googlepay-ecs.ejs` | 新建 | 移植 v5 视图 + v6 脚本加载 + 3DS 选择器按 ECM disabled+warning |
| 3 | `src/public/js/paypal/jssdk-v6/googlepay-ecs.js` | 新建 | v5 ECS 逻辑骨架 + v6 Google Pay API + callback 模式 + inspect 探查 |
| 4 | `src/app.js` | 改：加一行挂载（v6 块、googlepay-ecm 之后） | — |
| 5 | `src/routes/paypal/jssdk-v6/CLAUDE.md` | 改：components 表 googlepay-ecs 行 TBD→`['googlepay-payments']`；新增 "规则 V6-GOOGLEPAY-ECS" 段 | — |
| 6 | Supabase `demohub.products` | 插一行（用户执行 SQL） | design-be 第 5 节 |

> 文件 5、6 不是代码逻辑，但属于交付完整性的一部分。

## 步骤

### Step 0 — 早期 probe（gating，写后续代码前先做）

> **R-RISK-1 是本计划最大不确定点**，按"先思考再编码"，第一步先验证 callback 模式 confirmOrder（sheet-open）在 frictionless 下能否完成。
>
> 做法：先把 Step 1–3 的最小可跑版本（callback 模式 + frictionless）拉通到能点官方按钮拉起 sheet → onPaymentAuthorized → createOrder → confirmOrder，**重点 inspect confirmOrder 的返回 / 是否 ERR_CONNECTION_RESET**。
> - confirmOrder 正常 resolve（APPROVED）→ 继续完整实现，R-RISK-1 解除。
> - confirmOrder 被 ERR_CONNECTION_RESET 打断 → **兜底策略已定（eng-review 2026-06-04）：ship + warning**。记入 `docs/debug-log.md`，页面加黄色 warning 横条说明"v6 Google Pay ECS callback-mode confirmOrder 网络限制（同 ECM 3DS 限制处理方式）"，demo 展示完整集成代码，标注本环境付款跑不通为已知限制。**不降级 Promise 模式**（用户已否决 Approach B，要保留 sheet 内运费实时改价的 v5 一致性）。

### Step 1 — 后端路由 `googlepay-ecs.js`
- 复制 v5 `googlepay-ecs.js`；`SDK = 'jssdk-v6'`；沿用 `resolveCurrency` + `SCA_METHODS` + `mapGooglePayAddress`（逐字移植）；CN 账号（`getCNToken` / `PAYPAL_CN_CLIENT_ID`）。
- GET：注入 `clientId`(CN) + `supportedCurrencies` + `defaultAmount` + `currency`，**删除 `sdkUrl` 和 `extraScripts`**，**不传 sandboxShipping/sandboxPhone**（ECS 买家在 sheet 选）。
- create-order：body 与 v5 ECS **逐字一致**（reference_id/description/invoice_id/custom_id/soft_descriptor/amount{value=totalVal, breakdown{item_total, shipping}}/items/shipping(mapGooglePayAddress(shippingAddress))+`payment_source.google_pay`{name(条件)/email_address(条件)/phone_number=parsedPhone(条件,两字段)/experience_context(return/cancel 指向 v6 路径)/attributes.verification.method=scaMethod}）；入参 `{amount,currency,scaMethod,shippingAddress,buyerName,email,parsedPhone,shippingAmount}`；返回 `{ orderId: order.id }`。
- GET order：`GET /api/googlepay-ecs/order/:orderId`（小写 d），返回原始 PayPal JSON（3DS 防御兜底需要）。
- capture-order：`req.body.orderId`（小写 d），标准 capture，返回原始 JSON。
- 验收：`curl` create-order 返回 `{ orderId }`，body 结构 = v5（含 shipping breakdown，T11）。

### Step 2 — 视图 `googlepay-ecs.ejs`
- 复制 v5 ECS 视图；provider-badge 改 `PayPal · JSSDK v6 · Google Pay`。
- header include **去掉 sdkUrl + extraScripts**。
- 货币下拉用 `supportedCurrencies.forEach`。
- **3DS/SCA 选择器按 ECM 处理**：`#demo-sca` 设 `disabled` 固定 SCA_WHEN_REQUIRED + TBD 徽标 + 黄色 warning 横条（文案同 v6 googlepay-ecm.ejs）。
- **保留 v5 ECS 的 "Buyer selects in sheet" 说明块**（Shipping address · Email · Phone · Shipping method）。
- 保留 `#paypal-button-container`（官方按钮，初始 spinner）+ `#custom-googlepay-btn`（客制化按钮，内联样式沿用 v5）+ `#result`。
- 底部注入 `window.DEMO`（clientId / components:['googlepay-payments'] / pageType / urls{createOrder,getOrder,captureOrder}；**无 shipping**）。
- 四段式脚本：`init.js` → `googlepay-ecs.js` → `https://pay.google.com/gp/p/js/pay.js` → `<script defer ...v6/core>`。

### Step 3 — 前端 `public/js/paypal/jssdk-v6/googlepay-ecs.js`
- IIFE + `'use strict'`；搬运 v5 ECS 辅助/常量（getCurrency/getAmount/getSCA/isZeroDecimal/validateAmount/showResult/clearLoading + 货币 reload + blur 格式化；ZERO_DECIMAL/BASE_REQUEST/MIN/MAX_AMOUNT/SHIPPING_OPTIONS/COUNTRY_DIAL；fmtAmt/calcTotal/parsePhoneNumber）；模块级 `paymentsClient`/`urls`/`chosenShipping=SHIPPING_OPTIONS[0]`/`currentOrderID`。
- 加 ACDC 风格 `inspect(label, obj)` 探查工具。
- `onPayPalWebSdkLoaded`：`getPPInstance()` → Google Pay SDK 可用性检查 → `findEligibleMethods({currencyCode}).isEligible('googlepay')` → `getDetails('googlepay')` → `setupGooglePayButton(instance, details)`（V6-3 嵌套 then）。
- `setupGooglePayButton`：`createGooglePayOneTimePaymentSession()`（同步，inspect 确认）→ `formatConfigForPaymentRequest(details.config)` → `new google.payments.api.PaymentsClient({environment:'TEST', paymentDataCallbacks:{ onPaymentAuthorized: pd => onPaymentAuthorized(pd, googlePaySession), onPaymentDataChanged }})`（**带 callbacks**）→ `isReadyToPay` → 官方 `createButton`（black/pay/fill）+ 客制按钮 `#custom-googlepay-btn`，两者绑 `onGooglePaymentButtonClicked(googlePayConfig)`。
- `getGooglePaymentDataRequest(config, amount, currency, zd)`：`Object.assign(BASE_REQUEST, {allowedPaymentMethods, merchantInfo, transactionInfo{countryCode:'US',currencyCode,totalPriceStatus:'ESTIMATED',totalPrice:itemPrice,displayItems:[Item total]}, shippingAddressRequired:true, shippingAddressParameters:{phoneNumberRequired:true}, emailRequired:true, shippingOptionRequired:true, shippingOptionParameters:{defaultSelectedOptionId, shippingOptions:[id/label/description]}, callbackIntents:['SHIPPING_ADDRESS','SHIPPING_OPTION','PAYMENT_AUTHORIZATION']})`。
- `onPaymentDataChanged(intermediate)`：逐字移植 v5 — `callbackTrigger==='SHIPPING_OPTION'` 时按 id 更新 `chosenShipping`；INITIALIZE/SHIPPING_ADDRESS 返回 `newTransactionInfo`(FINAL) + `newShippingOptionParameters`；SHIPPING_OPTION 只返回 `newTransactionInfo`；`Promise.resolve(update)`。
- `onGooglePaymentButtonClicked(googlePayConfig)`：`validateAmount` → `chosenShipping = SHIPPING_OPTIONS[0]`（reset）→ `paymentsClient.loadPaymentData(req)`（callback 模式，**不 .then 取 paymentData**）。
- `onPaymentAuthorized(paymentData, googlePaySession)`：返回 `new Promise(resolve => {...})`；取 shippingAddress.name/email/phoneNumber(parsePhoneNumber)/shippingOptionData.id(finalShipping)；fetch createOrder（body 见 design-fe §5.6）→ `currentOrderID = d.orderId` → `processPayment(d.orderId, paymentData, googlePaySession)` → resolve SUCCESS；catch → showResult + resolve ERROR。
- `processPayment(orderId, paymentData, session)`：`session.confirmOrder({orderId, paymentMethodData})` → `PAYER_ACTION_REQUIRED` ? `handlePayerAction` : `doCapture`。⚠️ R-RISK-1 验证点。
- `doCapture(orderId)`：fetch captureOrder（body `{orderId}`）→ 查 `captures[0].status==='COMPLETED'`（规则 13）→ 成功 showResult / 失败 showResult + throw（触发 ERROR）。
- **全程 inspect**：instance/eligibility/details/googlePaySession/googlePayConfig/paymentsClient/isReadyToPay/paymentData/confirmOrder result/order details/capture order。

### Step 4 — 3DS 防御兜底（`handlePayerAction`，沿用 ECM）
- `#demo-sca` 已 disabled，正常不触发；`handlePayerAction` 作为兜底（与 v6 googlepay-ecm.js 一致）：
  - `if (typeof session.initiatePayerAction === 'function') session.initiatePayerAction()`（无参，v6 void no-op）。
  - `getOrderDetails(orderId)` → `handle3DS(order, orderId)`，决策表与 v5/ECM 逐字一致（POSSIBLE→capture；NO+{N,U,B}→capture；NO+其他→throw；UNKNOWN→throw；其他→throw）。
- SCA_ALWAYS 实测落到最后一档 throw（已知限制，规则 V6-GOOGLEPAY-7），页面 warning 横条已标注。

### Step 5 — 挂载 + CLAUDE.md
- `app.js` 在 v6 块 googlepay-ecm 之后加 `app.use(v6, require('./routes/paypal/jssdk-v6/googlepay-ecs'))`。
- 更新 `routes/paypal/jssdk-v6/CLAUDE.md`：
  - components 表：`googlepay-ecs` → `['googlepay-payments']`，状态 ✅。
  - 新增 "规则 V6-GOOGLEPAY-ECS"（ECS 在 ECM 基础上的增量），至少记录：
    - **Full Callback 模式**（ECS 硬约束）：`PaymentsClient` 带 `paymentDataCallbacks:{onPaymentAuthorized, onPaymentDataChanged}`，`callbackIntents:['SHIPPING_ADDRESS','SHIPPING_OPTION','PAYMENT_AUTHORIZATION']`；
    - `onPaymentDataChanged` 返回规则（INITIALIZE/SHIPPING_ADDRESS→newTransactionInfo+newShippingOptionParameters；SHIPPING_OPTION→仅 newTransactionInfo；shippingOptions 只允许 id/label/description）；
    - `onPaymentAuthorized` 内 createOrder→confirmOrder→capture，返回 `Promise<{transactionState}>`；
    - SHIPPING_OPTIONS（Standard $5 / Express $10）+ `chosenShipping` reset 逻辑；
    - phone 来自 sheet（`parsePhoneNumber` E.164→country_code+national_number，规则 16）；
    - create-order breakdown 含 item_total + shipping；payment_source.google_pay 含 name/email_address/phone_number（两字段）；
    - **R-RISK-1 实测结论**：callback 模式 confirmOrder（sheet-open）在本环境 frictionless 下是否完成（ERR_CONNECTION_RESET？）——写入实测结果；
    - 3DS 沿用 ECM（disabled + warning，SCA_ALWAYS 暂不支持）。

### Step 6 — Supabase + 重启
- 执行 INSERT（design-be 第 5 节），`sort_order` 取 v6 组内最大值 +1（googlepay-ecm 之后）。
- 重启 demo-hub，确认首页 v6 分组出现 Google Pay ECS 卡片。

## 测试矩阵（写入 `docs/test-cases.md`）

| 用例 | 操作 | 期望 |
|------|------|------|
| **T1 (gating) frictionless 付款** | Chrome + 沙盒 Google Pay 卡 + SCA_WHEN_REQUIRED，点官方按钮，sheet 内选地址/运费，Pay | confirmOrder 完成 → capture COMPLETED → `✓ Payment captured · Order: ...`（**或** ERR_CONNECTION_RESET → 记 R-RISK-1） |
| T2 客制按钮付款 | 点 `#custom-googlepay-btn` | 同 T1（同一 handler） |
| T3 sheet 内运费改价 | sheet 内切 Standard↔Express | 总价实时 = item + 对应运费；create-order shippingAmount = 最终选中 |
| T4 无 Google Pay SDK | `window.google.payments` 缺失 | 显示 "Google Pay SDK is not available"，无未捕获异常 |
| T5 isReadyToPay false | 设备/账号无 Google Pay | 清 spinner，显示 "not available on this device or account" |
| T6 账号不合格 | isEligible('googlepay') false | 显示 "not eligible"，不渲染按钮 |
| T7 用户取消 | sheet 内取消 | 静默，无红错，可重试 |
| T8 capture 非 COMPLETED | 触发非完成态 | `✗ Capture failed · status: ...`，不误报成功 |
| T9 货币切换 | 切 `#demo-currency` | reload 带 `?currency=&amount=`，金额保留 |
| T10 inspect 输出 | 任意流程 | console 可见各对象属性+原型方法（重点 confirmOrder 返回 / callback 模式网络结果） |
| T11 create-order curl | `curl POST .../api/googlepay-ecs/create-order`（body 含 shippingAddress/buyerName/email/parsedPhone/shippingAmount）| 返回 `{ orderId }`，body 结构（breakdown item_total+shipping / payment_source.google_pay 三字段 / shipping 地址）= v5；免 Chrome |
| T12 eligibility 网络错误 | findEligibleMethods 抛错 | `.catch` 捕获，显示 `✗ ...`，不静默失败 |
| T13 GET order curl | `curl GET .../api/googlepay-ecs/order/<id>` | 返回原始 PayPal order JSON |
| T14 phone 解析 | sheet 返回 E.164 电话 | parsePhoneNumber → `{country_code, national_number}`，create-order phone_number 正确 |
| T15 3DS（SCA_ALWAYS）兜底 | `#demo-sca` disabled（无法手动切）——如临时启用触发 PAYER_ACTION_REQUIRED | 落到 handle3DS 最后一档红色错误（已知限制），不静默、不误报成功 |

## 风险 / 待确认

1. **R-RISK-1（核心、gating）— callback 模式 confirmOrder（sheet-open）网络可用性**：ECM 实测 callback 模式 confirmOrder 内部 graphql 曾被 ERR_CONNECTION_RESET 打断（CN→sandbox）。ECS 必须用 callback 模式无法回退。Step 0 早期 probe 先验证 frictionless 是否可完成。**兜底已定（eng-review 2026-06-04）**：若跑不通 → ship + 黄色 warning 横条 + debug-log，不降级 Promise 模式（保留 v5 sheet 内运费实时改价一致性）。
2. **`createGooglePayOneTimePaymentSession()` / `formatConfigForPaymentRequest` 同步 vs 异步**：参考 demo + ECM 实测为同步。先按同步 + inspect；若 Promise 再加 `await`（注意 V6-3 作用域）。
3. **confirmOrder 返回形态**：ECM 实测 frictionless 返回 `{status:'APPROVED'}`、3DS 返回 `{status:'PAYER_ACTION_REQUIRED'}`。ECS callback 模式（sheet-open）是否同形态，inspect 实测后在 CLAUDE.md 固化。
4. **`initiatePayerAction` no-op（3DS）**：v6 已知为 void no-op（规则 V6-GOOGLEPAY-7）。SCA_ALWAYS 暂不支持，沿用 ECM 处理（disabled + warning），不属本 demo 阻断项。
5. **transactionInfo.countryCode 来源**：v5 硬编码 'US'；可选改用 `config.countryCode`。先沿用 'US'，inspect 后定。
6. **本地真实付款环境**：Google Pay sheet 需 Chrome + 沙盒 Google 账号 + 关联测试卡。本地无法完成真实 sheet 时，至少验证按钮渲染 + 资格判定 + create-order/GET order/capture 端点（T11/T13）。

## 评审（计划写好后执行）

- `/plan-eng-review`（架构 / 边界，必跑）
- `/plan-design-review`（UI 一致性 / 交互态，可选 — UI 复刻 v5）
- 可选 `/autoplan` 一键跑全套

## 执行交接（Execution Handoff）

> ⚠️ 实现需切换到非 Opus 模型（Opus 仅可写 markdown）。

实现顺序为单线（probe → route → view → js → 3DS 兜底 → 挂载/CLAUDE.md → SQL），3 个核心文件强耦合同一 demo，无并行机会。建议在 Sonnet 下逐 step 执行；**Step 0 早期 probe 是关键**——先验证 R-RISK-1 再写完整逻辑，避免返工。每个 step 后人工核对。

---

## 评审结果 — plan-eng-review（2026-06-04）

### Step 0 范围挑战
- **范围合适，无需缩减**：6 文件（route/view/js + app.js 挂载 + CLAUDE.md + SQL）、0 新 class/service，低于复杂度阈值（8 文件 / 2 class）。后端是 v5 `googlepay-ecs.js` 的近逐字克隆；前端复用 v6 `googlepay-ecm.js`（v6 SDK 管线 + inspect + 双按钮 + capture-COMPLETED）+ v5 `googlepay-ecs.js`（callback 流程骨架）+ v6 `applepay-ecs.js`（ECS chosenShipping 状态）+ `init.js`。
- **Search 分层**：callback 模式 = [Layer 1]（同 v5 + Google 官方参考）；v6 方法（confirmOrder / formatConfigForPaymentRequest / createGooglePayOneTimePaymentSession）= 文档化 [Layer 1]；**唯一第一性未知 = R-RISK-1**（callback-mode sheet-open confirmOrder 在 CN→sandbox 是否被 ERR_CONNECTION_RESET），已由 Step 0 gating probe 兜底。
- **Completeness**：完整版（callback 实时改价 + parsePhoneNumber + 3DS 防御兜底 + curl 端点测试 T11/T13），非 shortcut。

### What already exists（复用，未重建）
- `routes/paypal/jssdk-v5/googlepay-ecs.js` — 后端模板（mapGooglePayAddress / breakdown item_total+shipping / parsedPhone）。仅改 prefix/view/clientId/响应字段/`:orderId`。
- `public/js/paypal/jssdk-v6/googlepay-ecm.js` — v6 SDK 管线 + `inspect()` + 双按钮同 handler + capture-COMPLETED + 货币/金额 helper。
- `public/js/paypal/jssdk-v5/googlepay-ecs.js` — callback 流程骨架（onPaymentDataChanged / onPaymentAuthorized / parsePhoneNumber / SHIPPING_OPTIONS）。
- `public/js/paypal/jssdk-v6/applepay-ecs.js` — v6 ECS chosenShipping reset 状态模式。
- `public/js/paypal/jssdk-v6/init.js` — `getPPInstance()` 单例。

### 各 section 结论
- **架构（1 decision，已解决）**：A1 — R-RISK-1 兑现时的兜底策略。ECS 必须 callback 模式，无法像 ECM 回退 Promise。**用户决策：ship + 黄色 warning 横条 + debug-log，不降级 Promise 模式**（保留 v5 sheet 内运费实时改价一致性）。已写入 Step 0 + 风险 #1。其余架构干净：REST 不变；失败路径 resolve ERROR（sheet 不卡死）。
- **代码质量（1 issue，carry-over）**：D1（DRY）— 各 IIFE 各带一份 helper。**决议：维持现状**（沿用 v6 demo "单文件即完整示例" 约定，同 ECM）。orderID→orderId 全链路重命名陷阱已在 design-be §3.4 + Step 1 显式标注。
- **测试（手动矩阵，0 gap）**：demo-hub 无自动化框架，测试 = T1–T15 手动矩阵。覆盖前端全 codepath + curl 端点（T11/T13）。gating 路径 T1 兼作 R-RISK-1 probe。0 critical gap。
- **性能（0 issues）**：N/A（单页、两三个 fetch、启动缓存配置）。

### NOT in scope（已考虑，明确不做）
- **Promise 模式降级（Approach B）**：用户已否决（要 sheet 内运费实时改价）；仅作为 R-RISK-1 文档化备选，不实现。
- **3DS（SCA_ALWAYS）完成路径**：v6 initiatePayerAction no-op（规则 V6-GOOGLEPAY-7），沿用 ECM（选择器 disabled + warning）。
- **共享 helper 模块抽取**：违背"单文件即完整示例"约定（D1 决议）。
- **vault / 重复扣款**：本 demo 仅一次性付款。

### Failure modes（每条 codepath 的现实失败）
| Codepath | 失败方式 | 有测试? | 有错误处理? | 用户可见? |
|---|---|---|---|---|
| loadPaymentData | 用户取消 / sheet 失败 | T7 | `.catch` CANCELED 静默，余 showResult | ✅ |
| onPaymentDataChanged | 返回错误 shape → OR_BIBED_06 | T1/T3 | 移植 v5 正确 shape（INITIALIZE/SHIPPING_ADDRESS vs SHIPPING_OPTION） | ✅ |
| onPaymentAuthorized | createOrder 4xx/5xx | T11 | `.catch` → resolve ERROR（sheet 不卡死） | ✅ |
| confirmOrder（sheet-open）| **ERR_CONNECTION_RESET（R-RISK-1）** | T1 gating | `.catch` → resolve ERROR + warning 横条兜底 | ✅（非静默） |
| PAYER_ACTION_REQUIRED | initiatePayerAction no-op | T15 | handle3DS 末档 throw（已知限制） | ✅（非静默） |
| capture | 非 COMPLETED | T8 | status 判定（规则 13） | ✅ |
| findEligibleMethods | 网络错误 | T12 | `.catch` | ✅ |
- **无 critical gap**（R-RISK-1 有测试 T1 + 错误处理 + 用户可见 warning，非静默失败）。

### 并行化策略
- **顺序实现，无并行机会**：route/view/js 强耦合同一 demo，依次实现（probe → route → view → js → 3DS 兜底 → 挂载/CLAUDE.md → SQL）。

### Completion Summary
- Step 0 范围：accepted as-is（未缩减）
- 架构：1 decision（A1 R-RISK-1 兜底）→ 已解决（ship + warning）
- 代码质量：1 issue（D1 DRY，carry-over）→ 维持现状
- 测试：矩阵 T1–T15，0 gap
- 性能：0 issues
- NOT in scope / What exists / Failure modes：已写
- 关键 gap：0
- Outside voice：跳过（低新颖度，近 ECM 克隆；用户未要求）
- 并行化：单线，0 并行
- Unresolved decisions：0

> 备注：依项目规则未执行任何 git 操作；gstack 升级（1.34→1.55）+ CLAUDE.md 路由注入均跳过（不改用户 curated 文件 + 无 git）。实现需切换到非 Opus 模型（Opus 仅可写 markdown）。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 1 decision (R-RISK-1 兜底 → ship+warning), 1 issue (DRY → 维持现状), 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED — ready to implement（实现需切换到非 Opus 模型，当前 Opus 仅可写 markdown）
