# 实现计划 — JSSDK v6 Apple Pay ECM v1

> 日期：2026-06-02 · 关联：design-fe / design-be（同日 `*-jssdk-v6-applepay-ecm.md`）
>
> ⚠️ 当前 Opus 模型下只能产出本计划（markdown）。实际写代码需切换到 Sonnet 等非 Opus 模型。

## 目标（Definition of Done）

`/paypal/jssdk-v6/applepay-ecm` 上线：UI 与 v5 applepay-ecm 一致（官方 `<apple-pay-button>` + 客制化按钮）；create-order body 与 v5 逐字一致；v6 SDK 流程（findEligibleMethods → getDetails → createApplePayOneTimePaymentSession → formatConfigForPaymentRequest → confirmOrder 防御式 → capture COMPLETED）跑通；Safari + 沙盒钱包可完成付款。

## 改动文件清单（预期）

| # | 文件 | 动作 | 来源/参考 |
|---|------|------|-----------|
| 1 | `src/routes/paypal/jssdk-v6/applepay-ecm.js` | 新建 | 移植 v5 `routes/.../applepay-ecm.js` + v6 适配（响应 `orderId`） |
| 2 | `src/views/paypal/jssdk-v6/applepay-ecm.ejs` | 新建 | 移植 v5 视图 + v6 脚本加载（去 sdkUrl，加 Apple CDN + v6 core） |
| 3 | `src/public/js/paypal/jssdk-v6/applepay-ecm.js` | 新建 | 基于 v5 逻辑骨架 + v6 Apple Pay API + ACDC 风格 inspect 探查 |
| 4 | `src/app.js` | 改：加一行挂载（v6 块、buttons 之后） | — |
| 5 | `src/routes/paypal/jssdk-v6/CLAUDE.md` | 改：components 表 applepay-ecm 行 TBD→`['applepay-payments']`；新增 "Apple Pay 专属规则" 段 | — |
| 6 | Supabase `demohub.products` | 插一行（用户执行 SQL） | design-be 第 5 节 |

> 文件 5、6 不是代码逻辑，但属于交付完整性的一部分。

## 步骤

### Step 1 — 后端路由 `applepay-ecm.js`
- 复制 v5 `applepay-ecm.js`；`const C = require('../../../config/constants')` 风格；`SDK = 'jssdk-v6'`。
- GET：注入 `clientId`(CN) + `supportedCurrencies` + `defaultAmount` + `currency` + `sandboxShipping`（扁平字段同 v5），**删除 `sdkUrl`**。
- create-order：body 与 v5 **逐字一致**（reference_id/description/invoice_id/custom_id/soft_descriptor/amount.breakdown/items/shipping + `payment_source.apple_pay.experience_context`，return/cancel_url 指向 v6 路径）；返回 `{ orderId: order.id }`。
- capture-order：`req.body.orderId`（小写 d），标准 capture，返回原始 JSON。
- **不加** GET order details 端点（Apple Pay 3DS 协议内处理）。
- 验收：`curl` create-order 返回 `{ orderId }`，body 结构 = v5。

### Step 2 — 视图 `applepay-ecm.ejs`
- 复制 v5 视图；provider-badge 改 `PayPal · JSSDK v6 · Apple Pay`。
- header include **去掉 sdkUrl + extraScripts**。
- 货币下拉用 `supportedCurrencies.forEach`。
- 保留 Shipping Address 预填展示块（`sandboxShipping`）。
- 保留 `#paypal-button-container`（官方按钮）+ `#custom-applepay-btn`（客制化按钮，内联样式沿用 v5）+ `#result`。
- 底部注入 `window.DEMO`（clientId / components:['applepay-payments'] / pageType / urls{create,capture}）。
- 四段式脚本：`init.js` → `applepay-ecm.js` → Apple CDN → `<script defer ...v6/core>`。

### Step 3 — 前端 `public/js/paypal/jssdk-v6/applepay-ecm.js`
- IIFE + `'use strict'`；搬运 v5 辅助函数（getCurrency/getAmount/isZeroDecimal/validateAmount/showResult/clearLoading + 货币 reload + blur 格式化）。
- 加 ACDC 风格 `inspect(label, obj)` 探查工具。
- `onPayPalWebSdkLoaded`：`getPPInstance()` → 浏览器三连检查（ApplePaySession/supportsVersion(4)/canMakePayments）→ `findEligibleMethods({currencyCode}).isEligible('applepay')` → `getDetails('applepay')` → `setupApplePayButton(instance, details)`（V6-3 嵌套 then）。
- `setupApplePayButton`：`createApplePayOneTimePaymentSession()`（同步，inspect 确认）→ 官方 `<apple-pay-button>` + 客制按钮，两者绑 `onApplePayClicked(session, details)`。
- `onApplePayClicked`：`validateAmount` → 用 `session.formatConfigForPaymentRequest(details.config)` 拼 paymentRequest（+countryCode/currencyCode/requiredBillingContactFields/requiredShippingContactFields:[]/total）→ `new ApplePaySession(4, …)` → 绑事件 → `begin()`。
- 事件：onvalidatemerchant（validateMerchant→completeMerchantValidation）/ onpaymentmethodselected（completePaymentMethodSelection）/ onpaymentauthorized（createOrder→confirmOrder→capture→completePayment）/ oncancel。
- **全程 inspect**：instance/eligibility/details/session/config/paymentRequest/validateMerchant payload/confirmResult/capture order。
- **confirmOrder 防御式**：有 `approveApplePayPayment.status` 则查 APPROVED，无则跳过；最终以 capture `COMPLETED` 为准（snake_case `purchase_units`，规则 13，不收 PENDING）。
- **始终 completePayment**（SUCCESS/FAILURE）。
- 验收：见测试矩阵。

### Step 4 — 挂载 + CLAUDE.md
- `app.js` 在 v6 块 buttons 之后加 `app.use(v6, require('./routes/paypal/jssdk-v6/applepay-ecm'))`。
- 更新 `routes/paypal/jssdk-v6/CLAUDE.md`：
  - components 表：`applepay-ecm` → `['applepay-payments']`，状态 ✅。
  - 新增 "Apple Pay 专属规则" 段，至少记录：
    - 双层资格检查：`canMakePayments()` 查浏览器 + `findEligibleMethods().isEligible('applepay')` 查账号；
    - v6 配置：`getDetails('applepay').config` + `session.formatConfigForPaymentRequest(config)` 取代 v5 `Applepay().config()`；
    - `createApplePayOneTimePaymentSession()` 同步返回（以 inspect 实测为准）；
    - confirmOrder 防御式校验（有则查 APPROVED，无则靠 capture）；
    - capture 只认 COMPLETED（规则 13）；
    - 脚本加载顺序：init → 产品 JS → Apple CDN → v6 core(defer)；
    - 官方 `<apple-pay-button>` + 客制按钮同一 handler。

### Step 5 — Supabase + 重启
- 执行 INSERT（design-be 第 5 节），`sort_order` 取 v6 组内最大值 +1。
- 重启 demo-hub，确认首页 v6 分组出现 Apple Pay ECM 卡片。

## 测试矩阵（写入 `docs/test-cases.md`）

| 用例 | 操作 | 期望 |
|------|------|------|
| T1 官方按钮付款 | Safari + 沙盒钱包卡，点 `<apple-pay-button>` | 拉起 sheet → `✓ Payment captured · Order: ...` |
| T2 客制按钮付款 | 点 `#custom-applepay-btn` | 同 T1（同一 handler） |
| T3 非 Safari | Chrome 打开 | 显示 "Apple Pay not available..."，无未捕获异常 |
| T4 无钱包卡 | Safari 但钱包无卡 | 显示 "no cards configured" 类提示 |
| T5 账号不合格 | isEligible('applepay') 返回 false | 显示 "not eligible"，不渲染按钮 |
| T6 商户验证失败 | validateMerchant 失败（域名未注册等） | `abort()` + 错误提示，sheet 关闭 |
| T7 用户取消 | sheet 内取消 | oncancel log，无红错，可重试 |
| T8 capture 非 COMPLETED | 触发非完成态 | `✗ Capture failed · status: ...`，completePayment(FAILURE) |
| T9 货币切换 | 切 `#demo-currency` | reload 带 `?currency=&amount=`，金额保留 |
| T10 inspect 输出 | 任意流程 | console 可见各对象自身属性+原型方法，便于核对 v6 API |
| T11 create-order curl（新增） | `curl POST .../api/applepay-ecm/create-order` | 返回 `{ orderId }`，body 结构（payment_source.apple_pay.experience_context + shipping）= v5；无需 Safari |
| T12 eligibility 网络错误 | findEligibleMethods 抛错 | `.catch` 捕获，显示 `✗ ...`，不静默失败 |

## 风险 / 待确认

1. **`createApplePayOneTimePaymentSession()` 同步 vs 异步**：官方文档自相矛盾（文字说返回 Promise，示例同步调用）；GitHub 参考代码为同步。实现先按同步 + inspect；若实测是 Promise 再加 `await`。
2. **`details.config` 是否含 countryCode**：v6 `config()` 文档只列 merchantCapabilities/supportedNetworks。先 `details.config.countryCode || 'US'` 兜底，inspect 后确认。
3. **confirmOrder 返回形态**：v6 文档未定义返回值。防御式处理 + inspect，实测后在 CLAUDE.md 固化结论。
4. **本地 HTTPS/域名注册**：Apple Pay 需 HTTPS + PayPal 注册商户域名。忽略 ngrok（按用户要求）；本地若无法完成真实 sheet，至少验证按钮渲染 + 资格判定 + create-order/ capture 端点；真实付款在已注册域名环境验证。

## 评审（计划写好后执行）

- `/plan-eng-review`（架构 / 边界）✅ 已跑（2026-06-02）
- `/plan-design-review`（UI 一致性 / 交互态）
- 可选 `/autoplan` 一键跑全套

---

## 评审结果 — plan-eng-review（2026-06-02）

### Step 0 范围挑战
- **范围合适，无需缩减**：6 文件、0 新 class/service，低于复杂度阈值。后端是 v5 `applepay-ecm.js` 的近逐字克隆；前端用文档化 v6 SDK 方法 [Layer 1]，无自造轮子。

### What already exists（复用，未重建）
- `routes/paypal/jssdk-v5/applepay-ecm.js` — 后端模板（仅改 prefix/view/响应字段）。
- `public/js/paypal/jssdk-v6/acdc.js` — `inspect()` 探查 + 货币/金额 helper + capture-COMPLETED 逻辑。
- `public/js/paypal/jssdk-v6/init.js` — `getPPInstance()` 单例。
- v5 `applepay-ecm.ejs` — 视图结构 + 客制按钮内联样式。

### 各 section 结论
- **架构**：干净。后端 REST API 不变；前端 `createApplePayOneTimePaymentSession`/`formatConfigForPaymentRequest`/`validateMerchant`/`confirmOrder` 均为文档化方法。唯一现实生产失败 = 商户域名未注册 → `onvalidatemerchant` 失败 → `abort()`（T6 覆盖）。无 SPOF、无新基础设施。
- **代码质量**：1 项 finding（D1，DRY）→ **决议：维持现状**（独立 IIFE 各带一份 helper，沿用全部现有 v6 demo 约定；用户确认）。`inspect()` 探查为刻意保留、确认后清理。
- **测试**：demo-hub 无自动化测试框架，测试 = `test-cases.md` 手动矩阵。已补 T11（create-order curl，免 Safari）+ T12（eligibility 网络错误）。Apple Pay sheet 流程仅 Safari + 已注册域名可真测。
- **性能**：N/A（单页、两个 fetch、无 DB except 启动缓存）。无 finding。

### NOT in scope（已考虑，明确不做）
- **共享 helper 模块抽取**：违背"单文件即完整示例"约定，超本次范围（D1 决议）。
- **GET order details 端点**：Apple Pay 3DS 协议内处理，不需要（v5 规则 18）。
- **ECS 流程 / shippingContact 收集**：本 demo 是 ECM（商户预填 shipping），ECS 另立 `applepay-ecs`。
- **vault / 重复扣款**：与 `vault-applepay-*` 区分，本 demo 仅一次性付款。
- **ngrok 本地隧道**：用户明确忽略。

### Failure modes（每条新 codepath 的现实失败）
| Codepath | 失败方式 | 有测试? | 有错误处理? | 用户可见? |
|---|---|---|---|---|
| onvalidatemerchant | 域名未注册 / 网络 | T6 | `abort()` + showResult | ✅ 明确 |
| createOrder fetch | 4xx/5xx / 网络 | 部分（T11 curl） | `.catch` → completePayment(FAILURE) | ✅ 明确 |
| confirmOrder | v6 返回形态未知 | 探查 + 防御式 | try/catch + inspect | ✅ 明确 |
| capture | 非 COMPLETED | T8 | status 判定 + FAILURE | ✅ 明确 |
| findEligibleMethods | 网络错误 | T12（新增） | `.catch` | ✅ 明确 |
- **无 critical gap**（无"无测试 + 无错误处理 + 静默失败"的 codepath）。

### 并行化策略
- **顺序实现，无并行机会**：3 个文件（route/view/js）强耦合于同一 demo，依次实现即可（route → view → js → 挂载 → CLAUDE.md → SQL）。

### Completion Summary
- Step 0 范围：accepted as-is（未缩减）
- 架构：0 issues
- 代码质量：1 issue（D1 DRY）→ 维持现状
- 测试：diagram 产出，2 gap 已补（T11/T12）
- 性能：0 issues
- NOT in scope / What exists / Failure modes：已写
- 关键 gap：0
- Outside voice：跳过（用户按计划，未跑 codex）
- Lake score：N/A（无可缩减项）

> 备注：依项目规则未执行任何 git 操作；gstack telemetry/routing/CLAUDE.md commit 等 onboarding 步骤已跳过。

## 评审结果 — plan-design-review（2026-06-02）

> UI 明确"参考 v5 applepay-ecm"（已上线、视觉完整页面），视觉设计为继承式。跳过 mockup 生成与 outside-voice（无意义：复刻既有设计）。聚焦交互状态覆盖（v6 异步流程与 v5 的唯一差异点）。

### 初始评分 7/10 → 9/10（补交互状态表后）
继承 v5 视觉 ≈9/10；缺口为缺少"用户在每个状态看到什么"的统一交互状态表。

### 各 pass 评分
| Pass | 维度 | 分数 |
|------|------|------|
| 1 | 信息架构 | 9/10（v5 单列层级：货币/金额 → shipping 预填 → 按钮 → 结果） |
| 2 | 交互状态 | 6 → 9/10（补下方状态表） |
| 3 | 用户旅程 | 8/10（一键沙盒流程） |
| 4 | AI slop 风险 | 9/10（极简沙盒风，无 slop） |
| 5 | 设计系统对齐 | 9/10（复用 sandbox.css，无新组件） |
| 6 | 响应式 / 无障碍 | 7/10（继承 v5；按钮 width:100% + min-height:44px 触控；#result 有 aria-live） |
| 7 | 未决策 | D1 已决，0 deferred |

### 交互状态表（补入实现规范）
> 描述"用户看到什么"，非后端行为。

| 状态 | 触发 | 官方 apple-pay-button | 客制按钮 #custom-applepay-btn | #result |
|------|------|----------------------|------------------------------|---------|
| 初始加载 | 页面 load → createInstance + findEligibleMethods | `#paypal-button-container` 显示 spinner + "Loading Apple Pay..." | disabled，opacity 0.45，cursor not-allowed | 空 |
| 就绪 | 资格通过 | 清 spinner，插入 `<apple-pay-button>`（black/buy，width:100% height:44px） | 启用：opacity 1，cursor pointer，绑 hover/active | 空 |
| 浏览器不支持 | 非 Safari / 无 ApplePaySession / supportsVersion(4) false / canMakePayments false / 无钱包卡 | 不渲染（清 spinner） | 保持 disabled | 红色："Apple Pay is not available. Please use Safari on a supported Apple device."（或无卡文案） |
| 账号不合格 | isEligible('applepay') false | 不渲染（清 spinner） | 保持 disabled | 红色："Apple Pay is not eligible for this account."（D1 决议：与浏览器不支持文案区分） |
| sheet 处理中 | 点任一按钮 → begin() | Apple Pay 原生 sheet 接管 | — | 空（不另设 loading） |
| 商户验证失败 | onvalidatemerchant 失败 | sheet 关闭（abort） | — | 红色："Merchant validation failed: ..." |
| 用户取消 | sheet 内取消 → oncancel | sheet 关闭 | 仍可用 | 空（仅 console log，与 v5 一致，不显红错） |
| 付款成功 | capture COMPLETED | completePayment(SUCCESS)，sheet 关 | — | 绿色："✓ Payment captured · Order: ..." |
| 付款失败 | capture 非 COMPLETED / confirmOrder 抛错 | completePayment(FAILURE)，sheet 关 | 仍可用 | 红色："✗ Capture failed · status: ..." 或 "✗ ..." |

### D1 决议（资格/环境不满足 UX）
**不渲染官方按钮 + 客制按钮保持 disabled + 红色区分提示**（两种失败原因文案不同）。理由：官方 `<apple-pay-button>` 在非 Safari 下不注册、置灰不可控；与 v5 行为一致，避免用户点到必报错的按钮。

### NOT in scope（设计层）
- mockup / 视觉变体探索：UI 复刻 v5，无新设计方向。
- 新设计组件 / DESIGN.md 更新：复用 sandbox.css，零新组件。
- 移动端专属布局：单窄卡片继承 v5 响应式，沙盒 demo 无需独立移动设计。

### What already exists（设计层复用）
- v5 `applepay-ecm.ejs` 结构 + 客制按钮内联样式（hover/active/disabled 态）。
- `public/css/sandbox.css`（v5/v6 共享）：`.result-msg.success/.error`、`.sdk-loading`、`.sdk-spinner`、按钮铺满规则。
- v6 acdc `result-msg` 着色约定。

### Completion Summary（design）
- 初始 7/10 → 最终 9/10
- Pass 1–6 全部 ≥7（多数 9）
- Pass 7：1 决策（D1）已解，0 deferred
- mockup：跳过（UI 复刻 v5，已说明）
- 交互状态表：已补入计划

> 备注：依项目规则未执行任何 git 操作；gstack 设计器/outside-voice/onboarding 步骤已跳过。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 1 issue (DRY → 维持现状), 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (FULL) | score 7/10 → 9/10, 1 decision (D1) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 0
- **VERDICT:** ENG + DESIGN CLEARED — ready to implement（实现需切换到非 Opus 模型，当前 Opus 仅可写 markdown）
