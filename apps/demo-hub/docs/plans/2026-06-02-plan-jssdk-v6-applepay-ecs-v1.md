# 实现计划 — JSSDK v6 Apple Pay ECS v1

> 日期：2026-06-02 · 关联：design-fe / design-be（同日 `*-jssdk-v6-applepay-ecs.md`）、req（`2026-06-02-req-jssdk-v6-applepay-ecs.md`）
>
> ⚠️ 当前 Opus 模型下只能产出本计划（markdown）。实际写代码需切换到 Sonnet 等非 Opus 模型。

## 目标（Definition of Done）

`/paypal/jssdk-v6/applepay-ecs` 上线：UI 与 v5 applepay-ecs 一致（"Buyer selects in sheet" 提示块 + 官方 `<apple-pay-button>` + 客制化按钮）；create-order body 与 v5 applepay-ecs 逐字一致（含 shippingContact 映射 + payment_source.apple_pay 的 name/email/phone）；v6 SDK 流程（findEligibleMethods → getDetails → createApplePayOneTimePaymentSession → formatConfigForPaymentRequest → ECS shipping 事件 → confirmOrder 防御式 → capture COMPLETED）跑通；Safari + 沙盒钱包可在 sheet 内选配送方式并完成付款。

## 实现策略（一句话）

= 已完成的 **v6 applepay-ecm**（结构 / v6 SDK 机制 / inspect / 两按钮同 handler）+ **v5 applepay-ecs** 的 ECS 流程（SHIPPING_METHODS / shipping 事件 / shippingContact→create-order / normalizeContact）。

## 改动文件清单（预期）

| # | 文件 | 动作 | 来源/参考 |
|---|------|------|-----------|
| 1 | `src/routes/paypal/jssdk-v6/applepay-ecs.js` | 新建 | 移植 v5 `routes/.../applepay-ecs.js` + v6 适配（响应 `orderId`、return/cancel_url 指 v6） |
| 2 | `src/views/paypal/jssdk-v6/applepay-ecs.ejs` | 新建 | 移植 v5 视图 + v6 脚本加载（去 sdkUrl，加 Apple CDN + v6 core）；保留 "Buyer selects in sheet" 块 |
| 3 | `src/public/js/paypal/jssdk-v6/applepay-ecs.js` | 新建 | v6 ecm.js 骨架 + v5 ecs ECS 流程 + inspect 探查 |
| 4 | `src/app.js` | 改：加一行挂载（v6 块、applepay-ecm 之后） | — |
| 5 | `src/routes/paypal/jssdk-v6/CLAUDE.md` | 改：components 表 applepay-ecs 行 TBD→`['applepay-payments']`；补 ECS 专属规则 | — |
| 6 | Supabase `demohub.products` | 插一行（用户执行 SQL） | design-be 第 5 节 |

> 文件 5、6 不是代码逻辑，但属于交付完整性的一部分。

## 步骤

### Step 1 — 后端路由 `applepay-ecs.js`
- 复制 v5 `applepay-ecs.js`（含 `mapApplePayShipping` + `parseApplePayPhone` 两个辅助函数）；`SDK = 'jssdk-v6'`。
- GET：注入 `clientId`(CN) + `supportedCurrencies` + `defaultAmount` + `currency`；**删除 `sdkUrl`**；**不注入 sandboxShipping**（ECS）。
- create-order：入参 `{amount, currency, shippingContact, billingContact, shippingAmount}`；body 与 v5 **逐字一致**（item+shipping breakdown / items / shipping=mapApplePayShipping(shippingContact) / payment_source.apple_pay{name?/email_address?/phone_number?/experience_context}，return/cancel_url 指向 v6 路径）；返回 `{ orderId: order.id }`。
- capture-order：`req.body.orderId`（小写 d），标准 capture，返回原始 JSON。
- **不加** GET order details 端点。
- 验收：`curl` create-order（带 shippingContact）返回 `{ orderId }`，body 结构 = v5（含 shipping breakdown + apple_pay name/email/phone）。

### Step 2 — 视图 `applepay-ecs.ejs`
- 复制 v5 ecs 视图；provider-badge 改 `PayPal · JSSDK v6 · Apple Pay`。
- header include **去掉 sdkUrl + extraScripts**。
- 货币下拉用 `supportedCurrencies.forEach`。
- **保留 "Buyer selects in sheet" 提示块**（Shipping address · Email · Phone · Shipping method）；**不要** 商户预填地址块。
- 保留 `#paypal-button-container`（官方按钮）+ `#custom-applepay-btn`（客制化按钮，内联样式沿用 v5 ecs）+ `#result`。
- 底部注入 `window.DEMO`（clientId / components:['applepay-payments'] / pageType / urls{create,capture}）。
- 四段式脚本：`init.js` → `applepay-ecs.js` → Apple CDN → `<script defer ...v6/core>`。

### Step 3 — 前端 `public/js/paypal/jssdk-v6/applepay-ecs.js`
- IIFE + `'use strict'`；搬运 ecm 辅助函数（getCurrency/getAmount/isZeroDecimal/validateAmount/showResult/clearLoading + 货币 reload + blur 格式化 + inspect）。
- **额外搬运 v5 ecs 专属**：`SHIPPING_METHODS`、`chosenShipping` 模块级状态、`normalizeContact`、`fmtAmt`、`calcTotal`。
- `onPayPalWebSdkLoaded`：浏览器三连检查 → `getPPInstance()` → `findEligibleMethods({currencyCode}).isEligible('applepay')` → `getDetails('applepay')` → `setupApplePayButton(instance, details)`（V6-3 嵌套 then）。
- `setupApplePayButton`：`createApplePayOneTimePaymentSession()`（同步，inspect 确认）→ 官方 `<apple-pay-button>` + 客制按钮，两者绑 `onApplePayClicked(applePaySession, details)`。
- `onApplePayClicked`（ECS 版）：`validateAmount` → `chosenShipping = SHIPPING_METHODS[0]` → 用 `applePaySession.formatConfigForPaymentRequest(details.config)` 拼 paymentRequest（+countryCode/currencyCode/requiredBillingContactFields/**requiredShippingContactFields(4 项)**/**shippingType**/**shippingMethods**/**lineItems**/total=calcTotal）→ `new ApplePaySession(4, …)` → 绑事件 → `begin()`。
- 事件：onvalidatemerchant / onpaymentmethodselected / **onshippingcontactselected**（不重算，重确认 total+lineItems）/ **onshippingmethodselected**（按 identifier 更新 chosenShipping → 重确认）/ onpaymentauthorized（createOrder 带 shippingContact+shippingAmount → confirmOrder(normalizeContact) → capture → completePayment）/ oncancel。
- **全程 inspect**，重点 ECS 事件 `event.shippingContact` / `event.shippingMethod`。
- **confirmOrder 防御式** + **始终 completePayment**（SUCCESS/FAILURE）+ **capture 只认 COMPLETED**。
- 验收：见测试矩阵。

### Step 4 — 挂载 + CLAUDE.md
- `app.js` 在 v6 块 applepay-ecm 之后加 `app.use(v6, require('./routes/paypal/jssdk-v6/applepay-ecs'))`。
- 更新 `routes/paypal/jssdk-v6/CLAUDE.md`：
  - components 表：`applepay-ecs` → `['applepay-payments']`，状态 ✅。
  - 在 "Apple Pay 专属规则" 段补 ECS 增量规则，至少记录：
    - ECS 在 ecm 基础上增加 `requiredShippingContactFields`(4 项) + `shippingType:'shipping'` + `shippingMethods` + `lineItems`；
    - 新增 `onshippingcontactselected`（不按地址重算）+ `onshippingmethodselected`（按 identifier 更新 chosenShipping）；
    - create-order 请求 body 额外含 `shippingContact / billingContact / shippingAmount`；
    - payment_source.apple_pay 额外含 `name / email_address / phone_number`（仅 `{ national_number }`，无 country_code）；
    - `normalizeContact()` 剥离 phone 前导 `+`；
    - `chosenShipping` 每次点击重置为 Standard；
    - `total = item + chosenShipping`，sheet total 必须与 create-order 金额一致。

### Step 5 — Supabase + 重启
- 执行 INSERT（design-be 第 5 节），`sort_order` 取 v6 组内最大值 +1（applepay-ecm 之后）。
- 重启 demo-hub，确认首页 v6 分组出现 Apple Pay ECS 卡片。

## 测试矩阵（写入 `docs/test-cases.md`）

| 用例 | 操作 | 期望 |
|------|------|------|
| T1 官方按钮付款 | Safari + 沙盒钱包卡，点 `<apple-pay-button>` | 拉起 sheet → 选地址/邮箱/电话/配送方式 → `✓ Payment captured · Order: ...` |
| T2 客制按钮付款 | 点 `#custom-applepay-btn` | 同 T1（同一 handler） |
| T3 切 shipping method | sheet 内 Standard↔Express | total 实时更新（item + 5 或 + 10）；最终 create-order 金额 = sheet total |
| T4 默认配送 | 不切换，直接付 | chosenShipping = Standard($5)，total = item + 5 |
| T5 非 Safari | Chrome 打开 | 显示 "Apple Pay not available..."，无未捕获异常 |
| T6 无钱包卡 | Safari 但钱包无卡 | 显示 "no cards configured" 类提示 |
| T7 账号不合格 | isEligible('applepay') 返回 false | 显示 "not eligible"，不渲染按钮 |
| T8 商户验证失败 | validateMerchant 失败（域名未注册等） | `abort()` + 错误提示，sheet 关闭 |
| T9 用户取消 | sheet 内取消 | oncancel log，无红错，可重试 |
| T10 capture 非 COMPLETED | 触发非完成态 | `✗ Capture failed · status: ...`，completePayment(FAILURE) |
| T11 货币切换 | 切 `#demo-currency` | reload 带 `?currency=&amount=`，金额保留 |
| T12 inspect 输出 | 任意流程 | console 可见各对象自身属性+原型方法；**重点确认 shippingContact / shippingMethod 事件 v6 形态** |
| T13 create-order curl | `curl POST .../api/applepay-ecs/create-order`（带 shippingContact/shippingAmount） | 返回 `{ orderId }`，body = v5（item+shipping breakdown + apple_pay name/email/phone）；无需 Safari |
| T14 eligibility 网络错误 | findEligibleMethods 抛错 | `.catch` 捕获，显示 `✗ ...`，不静默失败 |
| T15 shippingMethod identifier 不匹配 | event.shippingMethod.identifier 非 standard/express | fallback 到 SHIPPING_METHODS[0]，不崩溃 |

## 风险 / 待确认

1. **ECS 专属事件 v6 形态未验证**（最高风险）：v6 ecm 没有 `onshippingcontactselected` / `onshippingmethodselected`。这两个事件由浏览器原生 `ApplePaySession` 触发（不依赖 v6 SDK），理论上与 v5 一致；但 `formatConfigForPaymentRequest` 注入的字段是否与手动加的 `shippingMethods` / `lineItems` 冲突需 inspect 实测。先按 v5 假设实现 + 全程 inspect，实测后在 CLAUDE.md 固化。
2. **`createApplePayOneTimePaymentSession()` 同步 vs 异步**：官方文档自相矛盾；ecm 已按同步落地且工作。沿用同步 + inspect。
3. **`details.config` 是否含 countryCode**：先 `details.config.countryCode || 'US'` 兜底，inspect 后确认。
4. **confirmOrder 返回形态**：v6 文档未定义返回值。防御式 + inspect（ecm 已采同策略）。
5. **本地 HTTPS/域名注册**：Apple Pay 需 HTTPS + PayPal 注册商户域名。忽略 ngrok（按用户要求）；本地若无法完成真实 sheet，至少验证按钮渲染 + 资格判定 + create-order/capture 端点（T13）；真实付款（含 sheet 内 shipping 选择）在已注册域名环境验证。

## 评审（计划写好后执行）

- `/plan-eng-review`（架构 / 边界）✅ 已跑（2026-06-02）
- `/plan-design-review`（UI 一致性 / 交互态）
- 可选 `/autoplan` 一键跑全套

> 备注：依项目规则不执行任何 git 操作。实现需切换到非 Opus 模型（当前 Opus 仅可写 markdown）。

---

## 评审结果 — plan-eng-review（2026-06-02）

### Step 0 范围挑战
- **范围合适，无需缩减**：6 项（3 新文件 + app.js 挂载 1 行 + CLAUDE.md 文档 + SQL），0 新 class/service，低于复杂度阈值。后端是 v5 `applepay-ecs.js` 近逐字克隆；前端 = v6 applepay-ecm 骨架 + v5 applepay-ecs ECS 流程，全部用文档化方法 [Layer 1]，无自造轮子。

### What already exists（复用，未重建）
- `routes/paypal/jssdk-v5/applepay-ecs.js` — 后端模板（含 mapApplePayShipping/parseApplePayPhone；仅改 prefix/view/响应字段/return_url 路径）。
- `public/js/paypal/jssdk-v6/applepay-ecm.js` — v6 SDK 入口 + 双层资格 + formatConfigForPaymentRequest + inspect + 两按钮同 handler + confirmOrder 防御式 + capture-COMPLETED。
- `public/js/paypal/jssdk-v5/applepay-ecs.js` — ECS 流程源（SHIPPING_METHODS / shipping 事件 / normalizeContact / chosenShipping / calcTotal）。
- `public/js/paypal/jssdk-v6/init.js` — `getPPInstance()` 单例。
- v5 `applepay-ecs.ejs` — 视图结构 + "Buyer selects in sheet" 块 + 客制按钮内联样式。

### 各 section 结论
- **架构**：0 issue。后端 REST API 不变；ECS shipping 事件由浏览器原生 `ApplePaySession` 触发（不依赖 v6 SDK）。唯一现实生产失败 = 商户域名未注册 → `onvalidatemerchant` 失败 → `abort()`（T8 覆盖）。`formatConfigForPaymentRequest` 与手动 `shippingMethods`/`lineItems` 的潜在冲突已由 Risk #1 + `Object.assign`（ECS 字段后置覆盖）+ 全程 inspect 兜住。无 SPOF、无新基础设施。
- **代码质量**：1 finding（D1，DRY — 各 demo 自带 helper）→ **决议：维持现状**（与 ecm 一致，沿用全部 v6 demo「单文件即完整示例」约定；用户确认）。`inspect()` 探查为刻意保留、确认后清理。
- **测试**：demo-hub 无自动化测试框架，测试 = `test-cases.md` 手动矩阵。覆盖图 0 gap、0 regression（纯新增；app.js 仅 1 行挂载，CLAUDE.md 为文档）。ECS 专属路径（shipping 事件 / total 重算 / 未知 identifier fallback）由 T3/T4/T12/T15 覆盖；后端由 T13 curl 覆盖（免 Safari）。
- **性能**：N/A（单页、两个 fetch、无请求期 DB）。0 finding。

### NOT in scope（已考虑，明确不做）
- **共享 helper 模块抽取**：违背「单文件即完整示例」约定，超本次范围（D1 决议）。
- **GET order details 端点**：Apple Pay 3DS 协议内处理，不需要（v5 规则 18）。
- **按地址重算运费/税**：与 v5 ecs 一致，本 demo 仅 Standard/Express 两档定额，不按 shippingContact 地址重算（onshippingcontactselected 仅重确认当前 total）。
- **vault / 重复扣款**：与 `vault-applepay-*` 区分，仅一次性付款。
- **ngrok 本地隧道**：用户明确忽略。

### Failure modes（每条新 codepath 的现实失败）
| Codepath | 失败方式 | 有测试? | 有错误处理? | 用户可见? |
|---|---|---|---|---|
| onvalidatemerchant | 域名未注册 / 网络 | T8 | `abort()` + showResult | ✅ 明确 |
| onshippingmethodselected | event.shippingMethod 形态异常 / identifier 不匹配 | T15 | fallback SHIPPING_METHODS[0] + inspect | ✅（total 仍正确） |
| onshippingcontactselected | event.shippingContact v6 形态未知 | T12 | inspect + 仅重确认 total（不依赖字段） | ✅（不崩溃） |
| createOrder fetch | 4xx/5xx / 网络 | 部分（T13 curl） | `.catch` → completePayment(FAILURE) | ✅ 明确 |
| confirmOrder | v6 返回形态未知 | 探查 + 防御式 | try/catch + inspect | ✅ 明确 |
| capture | 非 COMPLETED | T10 | status 判定 + FAILURE | ✅ 明确 |
| findEligibleMethods | 网络错误 | T14 | `.catch` | ✅ 明确 |
- **无 critical gap**（无「无测试 + 无错误处理 + 静默失败」的 codepath）。最高风险是 ECS shipping 事件的 v6 形态（Risk #1），但有 inspect + fallback 兜底，非静默。

### 并行化策略
- **顺序实现，无并行机会**：3 个文件（route/view/js）强耦合于同一 demo，依次实现即可（route → view → js → 挂载 → CLAUDE.md → SQL）。

### Completion Summary
- Step 0 范围：accepted as-is（未缩减）
- 架构：0 issues
- 代码质量：1 issue（D1 DRY）→ 维持现状
- 测试：覆盖图产出，0 gap，0 regression
- 性能：0 issues
- NOT in scope / What exists / Failure modes：已写
- 关键 gap：0
- Outside voice：跳过（用户按计划，未跑 codex）
- Lake score：N/A（无可缩减项）

> 备注：依项目规则未执行任何 git 操作；gstack telemetry/routing/onboarding 步骤已跳过（已配置）。

## 评审结果 — plan-design-review（2026-06-02）

> UI 明确「参考 v5 applepay-ecs」（已上线、视觉完整页面），视觉设计为继承式。跳过 mockup 生成（无意义：复刻既有设计，用户确认）。聚焦交互状态覆盖（v6 异步流程 + ECS sheet 内配送选择，是与 v5/ecm 的唯一差异点）。

### 初始评分 7/10 → 9/10（补交互状态表后）
继承 v5 视觉 ≈9/10；缺口为缺少「用户在每个状态看到什么」的统一交互状态表，且 ECS 比 ecm 多出 sheet 内配送选择/切换状态。

### 各 pass 评分
| Pass | 维度 | 分数 |
|------|------|------|
| 1 | 信息架构 | 9/10（v5 单列层级：货币/金额 → "Buyer selects in sheet" 提示 → 官方按钮 → 客制按钮 → 结果） |
| 2 | 交互状态 | 6 → 9/10（补下方状态表，含 ECS shipping 选择态） |
| 3 | 用户旅程 | 8/10（一键沙盒；配送选择由 Apple Pay 原生 sheet 承载） |
| 4 | AI slop 风险 | 9/10（极简沙盒风，无 slop） |
| 5 | 设计系统对齐 | 9/10（复用 sandbox.css，无新组件） |
| 6 | 响应式 / 无障碍 | 7/10（继承 v5；按钮 width:100% + min-height:44px 触控；#result 有 aria-live；#amount-error role=alert） |
| 7 | 未决策 | D2 已决，0 deferred |

### 交互状态表（补入实现规范）
> 描述「用户看到什么」，非后端行为。ECS 专属状态以 **▶** 标注。

| 状态 | 触发 | 官方 apple-pay-button | 客制按钮 #custom-applepay-btn | #result |
|------|------|----------------------|------------------------------|---------|
| 初始加载 | 页面 load → createInstance + findEligibleMethods | `#paypal-button-container` 显示 spinner + "Loading Apple Pay..." | disabled，opacity 0.45，cursor not-allowed | 空 |
| 就绪 | 资格通过 | 清 spinner，插入 `<apple-pay-button>`（black/buy，width:100% height:44px） | 启用：opacity 1，cursor pointer，绑 hover/active | 空 |
| 浏览器不支持 | 非 Safari / 无 ApplePaySession / supportsVersion(4) false / canMakePayments false / 无钱包卡 | 不渲染（清 spinner） | 保持 disabled | 红色："Apple Pay is not available. Please use Safari on a supported Apple device."（或无卡文案） |
| 账号不合格 | isEligible('applepay') false | 不渲染（清 spinner） | 保持 disabled | 红色："Apple Pay is not eligible for this account."（D2：与浏览器不支持文案区分） |
| sheet 处理中 | 点任一按钮 → begin() | Apple Pay 原生 sheet 接管 | — | 空（不另设 loading） |
| ▶ 配送地址选择 | sheet 内选/改地址 → onshippingcontactselected | sheet 内 | — | 空（不按地址重算，仅重确认 total + lineItems） |
| ▶ 配送方式切换 | sheet 内 Standard↔Express → onshippingmethodselected | sheet 内 total 实时更新（item + 5 或 + 10），lineItems 同步 | — | 空 |
| 商户验证失败 | onvalidatemerchant 失败 | sheet 关闭（abort） | — | 红色："Merchant validation failed: ..." |
| 用户取消 | sheet 内取消 → oncancel | sheet 关闭 | 仍可用 | 空（仅 console log，与 v5 一致，不显红错） |
| 付款成功 | capture COMPLETED | completePayment(SUCCESS)，sheet 关 | — | 绿色："✓ Payment captured · Order: ..." |
| 付款失败 | capture 非 COMPLETED / confirmOrder 抛错 | completePayment(FAILURE)，sheet 关 | 仍可用 | 红色："✗ Capture failed · status: ..." 或 "✗ ..." |

### D2 决议（资格/环境不满足 UX）
**不渲染官方按钮 + 客制按钮保持 disabled + 红色区分提示**（两种失败原因文案不同），沿用 ecm 决议。理由：官方 `<apple-pay-button>` 在非 Safari 下不注册、置灰不可控；与 v5/ecm 行为一致，避免用户点到必报错的按钮。

### NOT in scope（设计层）
- mockup / 视觉变体探索：UI 复刻 v5，无新设计方向（用户确认跳过）。
- 新设计组件 / DESIGN.md 更新：复用 sandbox.css，零新组件。
- 移动端专属布局：单窄卡片继承 v5 响应式，沙盒 demo 无需独立移动设计。
- sheet 内配送 UI 样式：由 Apple Pay 原生 sheet 渲染，商户不可定制。

### What already exists（设计层复用）
- v5 `applepay-ecs.ejs` 结构 + "Buyer selects in sheet" 提示块 + 客制按钮内联样式（hover/active/disabled 态）。
- `public/css/sandbox.css`（v5/v6 共享）：`.result-msg.success/.error`、`.sdk-loading`、`.sdk-spinner`、按钮铺满规则。
- v6 ecm/acdc `result-msg` 着色约定。

### Completion Summary（design）
- 初始 7/10 → 最终 9/10
- Pass 1–6 全部 ≥7（多数 9）
- Pass 7：1 决策（D2）已解，0 deferred
- mockup：跳过（UI 复刻 v5，用户确认）
- 交互状态表：已补入计划（含 ECS shipping 选择/切换态）

> 备注：依项目规则未执行任何 git 操作；gstack 设计器/outside-voice/onboarding 步骤已跳过。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 1 issue (DRY → 维持现状), 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (FULL) | score 7/10 → 9/10, 1 decision (D2) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 0
- **VERDICT:** ENG + DESIGN CLEARED — ready to implement（实现需切换到非 Opus 模型，当前 Opus 仅可写 markdown）
