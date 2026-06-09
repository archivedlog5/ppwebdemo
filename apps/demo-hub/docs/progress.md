# demo-hub — Progress Log

---

## 2026-06-09 — fastlane-fp API 3DS orderId 问题修复（sessionKey 方案）

**问题**：API 3DS 回调 URL 为 `...?state=undefined&code=undefined&liability_shift=POSSIBLE`，PayPal card 3DS 不回传 orderId（与标准 Buttons `?token=<orderId>` 行为不同），导致 return handler 无法发起 capture。

**方案**：pre-generate sessionKey → embed in return_url → store Map after create-order → lookup on return

具体实现（`fastlane-fp.js` 路由文件）：
- 模块顶部加 `const crypto = require('crypto')` 和 `const threeDSSessionStore = new Map()`
- `create-order` POST handler：API flow 时 `sessionKey = crypto.randomBytes(16).hex()`，传入 `buildFastlaneOrderBody` 嵌入 `return_url?session=<key>`；调 PayPal 成功后 `threeDSSessionStore.set(sessionKey, order.id)`，`setTimeout` 10分钟自动 delete
- `buildFastlaneOrderBody`：接受 `sessionKey` 参数，`return_url` 改为 `...?session=${sessionKey}`
- `return` GET handler：读 `req.query.session` → `threeDSSessionStore.get(key)` 得 orderId → delete（单次）→ 发 capture

同步更新文档（5 个 markdown）：req §7 / be 设计 §2.2/§2.3/§3/§8 / plan Task 1 / CLAUDE.md / todos Task 7

---

## 2026-06-09 — fastlane-fp 两处修订（bug fix + 新功能）

**Bug fix：member-有卡 Payment 步 Edit 按钮不可见**

原因：`setActive(stepPayment)` 只加 `fl-active`，CSS `.fl-visited:not(.fl-active)` 规则导致 Edit 按钮始终隐藏。
修复：
- `fastlane-fp.js` — member-有卡分支 `setActive(stepPayment)` 后紧接 `markVisited(stepPayment)`
- `fastlane-fp.ejs` — 追加 CSS 规则 `.fl-step.fl-active.fl-visited .fl-step__edit { opacity: 1; pointer-events: auto; }`

**新功能：3DS Flow 下拉加 "None / When Required" 选项（默认）**

原因：强制 JSSDK/API 3DS 不方便日常测试普通卡。
修复：
- `fastlane-fp.ejs` — `<select>` 加 `<option value="none">` 作为第一项/默认
- `fastlane-fp.js` — checkout 加 `if (threeDSFlow === 'none')` 分支直接 `createAndJudge`，原 jssdk 改为 `else if`

**同步更新文档**（6 个 markdown）：req / fe 设计 / be 设计 / plan / todos / CLAUDE.md

---

## 2026-06-09 — Fastlane Flexible（fastlane-fp）代码实现完成（Tasks 1–5, 8）

**代码实现（Sonnet 模型执行）：**

- **`src/routes/paypal/jssdk-v5/fastlane-fp.js`** — 自定义路由（3 端点）
  - GET 渲染：`components=fastlane,three-domain-secure&buyer-country=US&currency=USD`；`sdkClientToken = getUSClientToken({ intent:'sdk_init' })`；USD 锁定
  - POST create-order：读 `{ paymentToken, shippingAddress, billingAddress, amount, threeDSFlow }`；`buildFastlaneOrderBody`（API flow 注入 `card.attributes.verification.method=SCA_ALWAYS` + `card.experience_context.return_url/cancel_url`；return_url 由 `req.protocol+host` 动态拼）；`mapShipping` 从 pui 复制（规则 1，不跨产品共用）；inspect/probe 打印 request body + order body + PayPal 响应
  - GET return：inspect `req.query` 确认 orderId 参数名（推断 `?token=`）；`fp_cancel` → 渲染取消态；服务端 `POST /v2/checkout/orders/:id/capture`；规则 13 判定 `captures[0].status === 'COMPLETED'`；完整 order JSON 渲染到结果页
  - D1 决策（用户已拍板）：简单 POST capture，已知刷新 return 页显示 ORDER_ALREADY_CAPTURED 为预期行为
  - D2 决策：`mapShipping` 复制到本文件（不动 pui.js）
- **`src/views/paypal/jssdk-v5/fastlane-fp-return.ejs`** — API 3DS return 结果页（不加载 Fastlane SDK）；三态（success `✓ COMPLETED` / cancelled / error）；`<pre>` 展示完整 order JSON；返回 Demo 链接
- **`src/views/paypal/jssdk-v5/fastlane-fp.ejs`** — 四段式表单（Customer / Shipping / **Billing** / Payment）；复用 pui 三态 CSS（`fl-active` / `fl-visited` / locked）；序号扩到 1/2/3/4；`#step-billing[hidden]{display:none}` 供 member-有卡隐藏；Payment 步内 3DS Flow `<select>`（JSSDK / API）+ `#selected-card` + `#card-component` + `#payment-watermark`；`data-sdk-client-token` 加载 Fastlane SDK；`window.DEMO` 注入 createOrder URL + amount + currency
- **`src/public/js/paypal/jssdk-v5/fastlane-fp.js`** — IIFE + `'use strict'`，全程 inspect/probe console.log：
  - 初始化：`FastlaneCardComponent`（非 pui 的 `FastlanePaymentComponent`）+ `FastlaneWatermarkComponent`
  - Email → `lookupCustomerByEmail` → `triggerAuthenticationFlow`；member-有卡（隐藏 Billing + renderSelectedCard + watermark → Payment）/ member-无卡（Shipping → Billing）/ guest（Shipping → Billing）
  - 收货提交 → Billing（与 pui 区别：不跳 Payment，先到 Billing）
  - 账单提交：组装 flat `billingAddress`；`FastlaneCardComponent({ fields: { phoneNumber/postalCode/cardholderName } })` 渲染卡组件
  - JSSDK 3DS：`window.paypal.ThreeDomainSecureClient.isEligible(params)` → `show()` → inspect nonce / authenticationState / liabilityShift → 替换 `paymentToken.id = results.nonce` → create-order → `judgeInline`（规则 13）
  - API 3DS：create-order → `PAYER_ACTION_REQUIRED` → `window.location.href = payer-action href` 跳转；非 PAYER_ACTION_REQUIRED → `judgeInline` 内联判定
  - member-有卡：`showCardSelector` 换卡；`showShippingAddressSelector` 换地址
  - D3 决策：所有辅助函数（formatPhone/getAddressSummary/validateFields/setActive/markVisited/showResult/setBillingSummary/renderSelectedCard）复制到本文件（产品自包含，不动 pui.js）
  - 成功后全部 Edit + Checkout 按钮 disabled，刷新重试
- **`src/app.js`** — 追加 `app.use(v5, require('./routes/paypal/jssdk-v5/fastlane-fp'))` 于 fastlane-pui 之后
- **`src/routes/paypal/jssdk-v5/CLAUDE.md`** — SDK params 表新增 fastlane-fp 行；自定义路由备注新增 fastlane-fp 详细说明

**待用户操作（按顺序）：**
1. Supabase SQL Editor 执行（见 be 设计 §6.1 的 INSERT — 自动取 sort_order max+1）
2. 重启 demo-hub（`npm run dev:demo-hub`）
3. 手动 QA（Task 7 清单，12 个场景）：
   - guest + JSSDK 3DS（卡 4000 0000 0000 2503 → 挑战 → `✓ COMPLETED`）
   - guest + API 3DS（卡 5329 8797 3531 6929 → 跳转 → return 页 `✓ COMPLETED`）
   - guest + 普通卡（JSSDK flow, not eligible → 直接下单成功）
   - member-有卡（OTP 111111 → Billing 隐藏 → Payment 显存卡 → Checkout）
   - member 换卡/换地址（showCardSelector / showShippingAddressSelector 生效）
   - member-无卡（走 Billing + 卡组件）
   - API 3DS 取消（return 页取消提示）
   - OTP 失败回退（错误 OTP → 访客流程）
   - JSSDK 3DS 认证失败（显示错误，按钮恢复）
   - API 3DS 未触发挑战（judgeInline 内联判定）
   - 虚拟商品（不勾选 shipping-required）
   - member-有卡 × API 3DS
4. inspect/probe 定稿后回填 fe/be 设计文档（去掉推断标记），记 debug-log

---

## 2026-06-08 — Fastlane Quick Start（fastlane-pui）实现完成

**代码实现（Sonnet 模型执行）：**

- **`src/config/paypal.js`** — `getUSClientToken` 加可选 `{ intent } = {}` 参数（非破坏性；v6 现有调用不受影响）
- **`src/routes/paypal/jssdk-v5/fastlane-pui.js`** — 自定义路由；GET 渲染（intent=sdk_init client token）；POST create-order（single_use_token + shipping camelCase→snake_case 映射，USD 锁定）；`buildFastlaneOrderBody` + `mapShipping`；成功判定 captures[0].status=COMPLETED
- **`src/views/paypal/jssdk-v5/fastlane-pui.ejs`** — 三段式表单（Customer / Shipping / Payment）；`window.DEMO` 注入；`data-sdk-client-token` 加载 Fastlane SDK；无 `sdkUrl` 传 header（header 仅条件性加载）
- **`src/public/js/paypal/jssdk-v5/fastlane-pui.js`** — IIFE；Fastlane 初始化/email/OTP 认证/收货/FastlanePaymentComponent/下单全流程；inspect/probe 规则：逐个 console.log 每个返回对象
- **`src/app.js`** — 追加 `app.use(v5, require('./routes/paypal/jssdk-v5/fastlane-pui'))` 于 plm-js 之后
- **`src/routes/paypal/jssdk-v5/CLAUDE.md`** — SDK params 表新增 fastlane-pui 行；自定义路由备注新增 fastlane-pui.js 说明

**待用户操作：**
1. 在 Supabase SQL Editor 执行 INSERT（见 Task 6 SQL）
2. 重启 demo-hub（`npm run dev:demo-hub`）
3. 手动 QA：访客路径（测试卡 4005 5192 0000 0004）+ 会员路径（OTP 111111）+ 确认 captures[0].status=COMPLETED（自动扣款）

---

## 2026-06-05 — JSSDK v6 ACDC Vault with Purchase 实现完成（Task 20）

**代码实现（Sonnet 模型执行）：**

- **`src/routes/paypal/jssdk-v6/vault-acdc-with-purchase.js`** — 3 端点（create-order / GET order / capture-order）；`saveVault` 条件加 `vault.store_in_vault:ON_SUCCESS` + random `CUST_` merchant_customer_id；capture 提取 `payment_source.card.attributes.vault.{id, customer.id}` → 顶层 `vaultId`/`customerId`；`orderId` 全链路小写 d（V6-1）
- **`src/views/paypal/jssdk-v6/vault-acdc-with-purchase.ejs`** — 三段式脚本加载；SCA 下拉 disabled；save-card checkbox 默认勾选；Vault Result 面板；链接指向 v6 acdc demo
- **`src/public/js/paypal/jssdk-v6/vault-acdc-with-purchase.js`** — IIFE；`createCardFieldsOneTimePaymentSession()`（无参）；`getVaultChecked`/`showVaultResult`；`doCapture` 后调 `showVaultResult`；P1–P4 probe 日志（首跑后删）；`decide3DSAndCapture` GET 兜底保留
- **`src/app.js`** — 追加 `app.use(v6, require('./routes/paypal/jssdk-v6/vault-acdc-with-purchase'))` 于 vault-acdc-setup-only 之后
- **`src/routes/paypal/jssdk-v6/CLAUDE.md`** — 追加 V6-ACDC-VAULT-1..6 规则 + 组件表新增 vault-acdc-with-purchase 行

**待用户操作：**
1. 在 Supabase SQL Editor 执行 INSERT（Task 5 SQL，sort_order = vault-acdc-setup-only 的 sort_order + 1）
2. 重启 demo-hub（`npm run dev:demo-hub`）
3. 手动 DoD 验收（勾选 save-card 测试卡 4012 0000 3333 0026 → 确认 Vault Token 非空；不勾选 → 确认 not returned）
4. 首跑后删探针（P1–P4 `inspect()` 调用 + `inspect` 函数），并将结论记入 `docs/debug-log.md`

---

## 2026-06-05 — JSSDK v6 ACDC Vault with Purchase 设计 + 计划 + Eng Review（Task 20）

**背景：** 为 `/paypal/jssdk-v6/vault-acdc-with-purchase` 完成需求、前后端设计、实现计划，并过 `/plan-eng-review`，待切非 Opus 模型执行代码。

**模型：** v6 `acdc`（card-fields 一次性 `createCardFieldsOneTimePaymentSession` + submit 状态机 + 3DS decide+capture）**＋** v5 `vault-acdc-with-purchase`（vault 层：save-card 复选框 → `store_in_vault: ON_SUCCESS` + `merchant_customer_id`；capture 提取 `vaultId`/`customerId`；Vault Result 框）。

**关键决策（用户拍板）：**
- create-order body 与 v5 **逐字一致**，唯一差异 `orderId` 小写 d（V6-1）。
- 3DS **忠实镜像 v5**：SCA 下拉禁用、固定 `SCA_WHEN_REQUIRED`、保留「3DS 测试见 ACDC demo」提示（链接改 v6 acdc）。
- 3DS 兜底（GET order + decide3DSAndCapture GET 分支）**保留**（对齐 v6 acdc/v5，近 dead 但作安全网）。

**新建文件（4 个 markdown）：**
- `docs/req/2026-06-05-req-jssdk-v6-vault-acdc-with-purchase.md`
- `docs/design/2026-06-05-design-be-jssdk-v6-vault-acdc-with-purchase.md`
- `docs/design/2026-06-05-design-fe-jssdk-v6-vault-acdc-with-purchase.md`
- `docs/plans/2026-06-05-plan-jssdk-v6-vault-acdc-with-purchase-v1.md`（含 Eng Review Report + GSTACK REVIEW REPORT）

**Eng Review 结论：** CLEARED — 按计划实现。5 代码文件、0 新服务（footprint 同 vault-acdc-setup-only）。1 个 watch-item：探针 **P1** —— 确认 `createCardFieldsOneTimePaymentSession()` 无参是否真存卡（PayPal 按钮 vault 当年用 `savePayment: true`）；集成文档示例为无参 + server `store_in_vault`，故无参为正确默认，万一不存卡再加选项并记 debug-log。

**待用户操作：**
- 切非 Opus 模型实现 Task 1/3/4（route/ejs/js）+ Task 6（CLAUDE.md 规则段 V6-ACDC-VAULT-1..6 + components 表）。
- Supabase INSERT 一行（`product_key='vault-acdc-with-purchase'`，sort_order 取 v6 组 max+1）。

**状态：** Task 20 设计 + 计划 + eng review ✅，待实现代码。

---

## 2026-06-04 — JSSDK v6 PLM HTML 实现（Task 23）

**背景：** 基于 2026-06-04 的设计文档 + 实现计划，实现 PayPal JSSDK v6 PLM HTML demo，路由 `/paypal/jssdk-v6/plm-html`。

**新建文件（3 个）：**
- `src/routes/paypal/jssdk-v6/plm-html.js`（GET-only 自定义路由；COUNTRY_TO_CUR 映射；注入 clientId/currency/country/defaultAmount）
- `src/views/paypal/jssdk-v6/plm-html.ejs`（3 placements + 8 行 Style Gallery；11× `<paypal-message auto-bootstrap>`；country select + amount input）
- `src/public/js/paypal/jssdk-v6/plm-html.js`（IIFE；`syncAmount()` → `setAttribute('amount', val)`；country change → URL reload；`getPPInstance()` → `createPayPalMessages()` on window.load）

**修改文件（2 个）：**
- `src/app.js`（+1 行 v6 plm-html 路由挂载，位于 googlepay-ecs 之后 buttons 之前）
- `docs/todos.md`（Task 23 → ✅）

**技术说明：**
- `auto-bootstrap` 模式：SDK 自动 observe `amount` / `currency-code` 等属性变化，无需调用 `fetchContent()`，与 v5 plm-div 的 `data-pp-amount` + MutationObserver 效果相同
- 脚本加载：`init.js` → `plm-html.js` → `core` defer（三段式，无需单独 `paypal-messages` script；components `['paypal-messages']` 让 core 按需加载）
- 11 个 `<paypal-message>` 元素已验证：全部有 `auto-bootstrap`、`amount="100.00"`、`currency-code="USD"`，logo-type/logo-position/text-color 均符合设计
- **`createPayPalMessages({ currencyCode, buyerCountry })` 必须传参**：调用时传 `{ currencyCode: 'USD', buyerCountry: 'US' }`（从 `window.DEMO.currency` / `window.DEMO.country` 读取），否则 messages API 返回 422。不同国家传对应值（GB → `{ currencyCode: 'GBP', buyerCountry: 'GB' }`）。已验证 US 正常渲染 "Pay in 4 interest-free payments of $25.00"。

**待用户操作：**
- Supabase SQL Editor 执行：
  ```sql
  SELECT MAX(sort_order) FROM demohub.products WHERE provider = 'paypal' AND sdk_version = 'jssdk-v6';
  -- 用返回值 + 1 作为 sort_order
  INSERT INTO demohub.products (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
  VALUES ('paypal', 'jssdk-v6', 'plm-html', 'PLM — HTML', 'Pay Later messaging via <paypal-message> auto-bootstrap HTML attributes', true, <max+1>);
  ```
- 重启 demo-hub，验证首页 jssdk-v6 组出现 "PLM — HTML" 卡片

**状态：** Task 23 ✅ 代码完成，待 Supabase INSERT。

---

## 2026-06-04 — JSSDK v6 PLM HTML 设计 + 计划（Task 23）

**背景：** 为 `/paypal/jssdk-v6/plm-html` 完成需求分析、设计文档、实现计划，待切 Sonnet 执行代码。

**关键设计决策：**

- **纯 HTML 配置模式（`auto-bootstrap`）**：所有 `<paypal-message>` 元素带 `auto-bootstrap` 属性，SDK 的 PayPalMessages 数据层自动 observe 属性变化重新拉取内容，无需调用 `fetchContent()`。
- **无工厂函数**：plm-html 无订单 API，不能用 `_factory.js`（`buildBody` 强制要求），使用 GET-only 自定义路由。
- **Hybrid SDK 加载**：`window.DEMO.components = ['paypal-messages']`，由 `init.js` 的 `createInstance` 动态加载 messages 组件，不单独加载 `paypal-messages` script，与项目现有 v6 模式一致。
- **页面两区**：Placement 区（Product/Cart/Checkout，每个对应 WORDMARK+LEFT / WORDMARK+RIGHT / TEXT+INLINE）+ Style Gallery（8 行，覆盖 MONOGRAM/WORDMARK/TEXT × BLACK/MONOCHROME/WHITE，WHITE 行用深色背景 `#1a1a2e`）。
- **v6 无 flex/banner**：v5 plm-div 的 Home 8x1 / Category 20x1 在 v6 不存在，已去掉，Placement 区只有 3 个。
- **国家选择器**：保留 8 国（US/AU/DE/ES/FR/IT/GB/CA），映射到 `currency-code` 属性；切换时刷页传 `?country=XX&currency=YYY`，无 `buyercountry` override（v6 不支持）。

**新建文档（2 个）：**
- `docs/design/2026-06-04-design-fe-plm-html-v6.md`（设计文档）
- `docs/superpowers/plans/2026-06-04-plm-html-v6.md`（实现计划，4 Tasks）

**修改文档（2 个）：**
- `docs/todos.md`（Task 23 标注设计+计划已完成）
- `docs/progress.md`（本条）

---

## 2026-06-03 — JSSDK v6 Google Pay ECM（Task 16）

**背景：** 基于 2026-06-02 的 req/design-fe/design-be/plan 四份文档，重写 PayPal JSSDK v6 Google Pay ECM demo，路由 `/paypal/jssdk-v6/googlepay-ecm`。UI 与 v5 googlepay-ecm 一致（货币/金额/3DS 选择器 + 商户预填 Shipping+Phone 展示 + 官方 Google Pay 按钮 + 客制按钮）；后端 create-order body 与 v5 逐字一致，前端改为 v6 Google Pay API 流程。

**关键技术决策（付款流程模式）：**

- **最终采用 Promise 模式（v5-style），实测确认可用。** 实现时先按当时 CLAUDE.md 规则 V6-GOOGLEPAY-4（"ECM 必须 Callback 模式，否则 OR_BIBED_06"）写了 Callback 模式，验证可用、无 OR_BIBED_06；随后按用户要求改回 Promise 模式（不传 `paymentDataCallbacks`、`loadPaymentData` 请求不含 `callbackIntents`），**同样验证可用、无 OR_BIBED_06**。
- **结论：Callback 与 Promise 两种模式在 v6 ECM 下均可用。** 先前规则里"Promise 模式必触发 OR_BIBED_06"系上一版（已废弃）实现里另一 bug 的误判，已在 CLAUDE.md V6-GOOGLEPAY-4 更正。Promise 模式与设计文档一致、对齐 v5，且 3DS 弹窗在 sheet 关闭后才弹不被遮挡，故作为最终方案。
- **v6 配置链（同步）：** `findEligibleMethods({currencyCode}).isEligible('googlepay')` → `eligibility.getDetails('googlepay')` → `instance.createGooglePayOneTimePaymentSession()` → `session.formatConfigForPaymentRequest(details.config)`。
- **三层资格检查：** Google Pay SDK 浏览器可用性（`window.google.payments.api.PaymentsClient`）+ 账号资格（`isEligible('googlepay')`）+ 设备/账号（`isReadyToPay`）。
- **3DS（SCA_ALWAYS）= 已知限制，不支持（实测结论）：** v6 `googlePaySession.initiatePayerAction()` 实测为**无参 + void no-op**（非 v5 的 Promise）、session **无 `resume()`**。Promise 模式下 confirmOrder 拿到 `PAYER_ACTION_REQUIRED` 后 `initiatePayerAction()` 不弹挑战、GET order 无 auth 结果 → 显示 3DS 错误。改 callback 模式后 confirmOrder 的 `ApproveGooglePayPayment` 又遇 `ERR_CONNECTION_RESET`（CN→sandbox.paypal.com 网络重置）。**用户拍板：callback 模式也解决不了，ship Promise 模式**，3DS 列为已知限制。免挑战（SCA_WHEN_REQUIRED）正常 capture。`handlePayerAction` 保留为防御兜底。详见 CLAUDE.md V6-GOOGLEPAY-7。
- **全程 inspect()** 探查 instance/eligibility/details/googlePaySession/googlePayConfig/paymentData/confirmOrder result/order details/capture（ACDC 风格）。

**新建文件（3 个）：**
- `src/routes/paypal/jssdk-v6/googlepay-ecm.js`（自定义路由；CN 账号；GET 注入 clientId/supportedCurrencies/sandboxShipping/sandboxPhone，无 sdkUrl/extraScripts；create-order body 与 v5 逐字一致，返回 `{ orderId }`；GET order/:orderId；capture 读 `req.body.orderId`）
- `src/views/paypal/jssdk-v6/googlepay-ecm.ejs`（badge "PayPal · JSSDK v6 · Google Pay"；`supportedCurrencies.forEach`；保留 3DS/SCA 选择器 + Shipping&Phone 预填块；window.DEMO 含 clientId/components/urls/shipping；四段式脚本 init→产品 JS→pay.js→v6 core defer）
- `src/public/js/paypal/jssdk-v6/googlepay-ecm.js`（v6 Google Pay 完整流程，Promise 模式；inspect 探查；货币/金额 helpers）

**修改文件（4 个 md，含 symlink 计 1 处源文件）：**
- `src/routes/paypal/jssdk-v6/CLAUDE.md`（V6-GOOGLEPAY-4 Callback→Promise 更正；V6-GOOGLEPAY-9 handler 签名更新；V6-GOOGLEPAY-7 probe 现状备注）
- `docs/todos.md`（Task 16 → ✅）
- `docs/test-cases.md`（新增 Google Pay ECM v6 测试矩阵）
- `docs/progress.md`（本条）

> `src/app.js` 已含 googlepay-ecm 挂载行（无需改动）。

**待用户操作：**
- Supabase SQL Editor 执行 INSERT：
  ```sql
  INSERT INTO demohub.products (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
  VALUES ('paypal', 'jssdk-v6', 'googlepay-ecm', 'Google Pay ECM', 'Google Pay via PayPal v6 — Express Checkout Mark', true, <v6 组内最大 sort_order + 1>);
  ```
- 重启 demo-hub，Chrome + 沙盒 Google Pay 钱包卡验证
- 测试 3DS（SCA_ALWAYS）后把 probe 结论（Branch A/B）回填到 CLAUDE.md V6-GOOGLEPAY-7

**状态：** Task 16 ✅ 代码完成（Promise 模式），免挑战付款已实测通过；3DS（SCA_ALWAYS）实测确认为已知限制（不支持）。待 Supabase INSERT。

---

## 2026-06-02 — JSSDK v6 Apple Pay ECS（Task 15）

**背景：** 基于需求/设计/计划文档（2026-06-02-*-jssdk-v6-applepay-ecs.md），实现 PayPal JSSDK v6 Apple Pay ECS demo，路由 `/paypal/jssdk-v6/applepay-ecs`。UI 与 v5 applepay-ecs 一致（"Buyer selects in sheet" 提示块 + 官方 `<apple-pay-button>` + 客制化按钮）；实现策略 = v6 applepay-ecm 骨架 + v5 applepay-ecs ECS 流程移植。

**新增文件：**
- `src/routes/paypal/jssdk-v6/applepay-ecs.js`
- `src/views/paypal/jssdk-v6/applepay-ecs.ejs`
- `src/public/js/paypal/jssdk-v6/applepay-ecs.js`

**修改文件：**
- `src/app.js`（一行挂载）
- `src/routes/paypal/jssdk-v6/CLAUDE.md`（applepay-ecs ✅，ECS 规则）

**ECS 对比 ECM 的增量：**
- paymentRequest 追加 `requiredShippingContactFields`（4 项）+ `shippingType: 'shipping'` + `shippingMethods` 数组（Standard $5 / Express $10）+ `lineItems` + `calcTotal()`
- 新增事件：`onshippingcontactselected`（仅重确认 total，不按地址重算）+ `onshippingmethodselected`（按 identifier 更新 chosenShipping，不匹配 fallback Standard）
- `onpaymentauthorized` createOrder 额外携带 `shippingContact + billingContact + shippingAmount`
- `normalizeContact()` 剥离 phoneNumber E.164 前导 `+`
- 后端 create-order body：breakdown 含 item_total + shipping；payment_source.apple_pay 含 name/email_address/phone_number（national_number only）；return/cancel_url 指 v6 路径
- 返回 `{ orderId: order.id }`（v6 小写 d）；capture 读 `{ orderId }`

---

## 2026-06-02 — JSSDK v6 Apple Pay ECM（Task 14）

**背景：** 基于需求/设计/计划四份文档（2026-06-02-*-jssdk-v6-applepay-ecm.md），实现 PayPal JSSDK v6 Apple Pay ECM demo，路由 `/paypal/jssdk-v6/applepay-ecm`。UI 与 v5 applepay-ecm 一致（官方 `<apple-pay-button>` + 客制化按钮），后端 create-order body 与 v5 逐字一致，前端改为 v6 Apple Pay API 流程。

**关键技术决策（含运行时发现）：**

- **`getDetails('applepay')` 在 eligibility 上调用，非 instance**：初始实现错误地调用 `instance.getDetails()`，运行时报 `TypeError: instance.getDetails is not a function`。实际 API 为 `eligibility.getDetails('applepay')`（`findEligibleMethods()` 的返回值），且是同步调用（无需 `.then()`）。
- **`createApplePayOneTimePaymentSession()` 同步返回**：与 `createPayPalOneTimePaymentSession()` 一致，同步返回 session 对象，持有 `validateMerchant()`、`confirmOrder()`、`formatConfigForPaymentRequest()` 三个方法。
- **`formatConfigForPaymentRequest` 用 `Object.assign` 展开**：该方法返回含 `merchantCapabilities`/`supportedNetworks` 的对象，需用 `Object.assign({}, formattedConfig, { countryCode, currencyCode, ... })` 展开后追加自定义字段（参考 GitHub 官方示例代码）。
- **confirmOrder 防御式校验**：`confirmResult.approveApplePayPayment.status` 存在时校验 APPROVED，不存在时直接靠 capture COMPLETED 判定（v6 文档未定义返回值，防御式处理）。
- **四段式脚本加载**：`init.js` → `applepay-ecm.js` → Apple CDN（`applepay.cdn-apple.com`）→ v6 core（defer）。Apple CDN 需在 v6 core 之前确保 `window.ApplePaySession` 可用。
- **双层资格检查**：浏览器检查（`ApplePaySession` 存在 / `supportsVersion(4)` / `canMakePayments()`）+ SDK 账号检查（`eligibility.isEligible('applepay')`），两种失败文案区分。

**新建文件（3 个）：**
- `src/routes/paypal/jssdk-v6/applepay-ecm.js`（自定义路由；GET 传 clientId/supportedCurrencies/sandboxShipping；create-order body 与 v5 逐字一致，返回 `{ orderId }` 小写 d；capture 读 `req.body.orderId`）
- `src/views/paypal/jssdk-v6/applepay-ecm.ejs`（badge "PayPal · JSSDK v6 · Apple Pay"；`supportedCurrencies.forEach`；window.DEMO 含 clientId/components/urls；四段式脚本）
- `src/public/js/paypal/jssdk-v6/applepay-ecm.js`（v6 Apple Pay 完整流程；`inspect()` 探查所有关键对象；货币/金额 helpers 独立 IIFE）

**修改文件（2 个）：**
- `src/app.js`（+1 行 v6 applepay-ecm 路由挂载，位于 acdc 之后）
- `src/routes/paypal/jssdk-v6/CLAUDE.md`（components 表 applepay-ecm → `['applepay-payments']` ✅；新增 V6-APPLEPAY-1 至 V6-APPLEPAY-8 八条专属规则，含 API 发现结论）

**待用户操作：**
- Supabase SQL Editor 执行 INSERT：
  ```sql
  INSERT INTO demohub.products (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
  VALUES ('paypal', 'jssdk-v6', 'applepay-ecm', 'Apple Pay ECM', 'Apple Pay one-time payment — merchant pre-fills shipping', true, 11);
  ```
- 重启 demo-hub，Safari 访问 `/paypal/jssdk-v6/applepay-ecm` 验证页面加载与按钮渲染
- 按 `docs/test-cases.md` Apple Pay v6 测试矩阵逐项验收

**状态：** Task 14 ✅ 代码完成，待 Supabase INSERT + Safari E2E 验证。

---

## 2026-06-02 — JSSDK v6 ACDC（Task 13）

**背景：** 基于需求/设计/计划四份文档（2026-06-02-*-jssdk-v6-acdc.md），实现 PayPal JSSDK v6 Advanced Credit/Debit Card demo，路由 `/paypal/jssdk-v6/acdc`。UI 与 v5 ACDC 一致，3DS 决策逻辑与 v5 一致，API 层不变（仍 `/v2/checkout/orders`），前端改为 v6 CardFields 命令式流程。

**关键技术决策：**

- **`createCardFieldsOneTimePaymentSession()` 同步返回**：与 `createPayPalGuestOneTimePaymentSession`（BCDC，异步）不同，ACDC 同步返回；不能 `.then()` 调用。
- **submit 是命令式**：click 时先 `await createOrder()` 拿 orderId（字符串），再 `await session.submit(orderId, { billingAddress })`，不套用 V6-2（那是 button session.start 专属的 Promise 传递规则）。
- **字段挂载用 `appendChild`**：`createCardFieldsComponent({ type })` 返回 `HTMLElement`，直接 `appendChild` 到宿主容器（非 v5 的 `.render()`）。
- **防御式资格判定**：`advanced_cards` key 可能不在 eligibility 响应里，缺失时仍渲染（官方指引 "integrate defensively"）。
- **STYLE 用 camelCase**：v6 style 对象要求 `fontFamily`/`fontSize` 而非 kebab-case；`height`/`padding`/`color` 等也用 camelCase。
- **billingAddress 字段名**：`session.submit()` 的 `billingAddress` 字段按文档为 `streetAddress`/`city`/`state`/`postalCode`/`countryCode`（非 v5 的 `addressLine1`/`adminArea2`/`adminArea1`）。
- **容器高度控制**：v6 SDK STYLE 的 `height` 只影响 iframe 内部 input，外层 iframe 高度需在宿主容器上加 `height:42px; overflow:hidden;` 才能截断。

**调试探查（design-fe §8）：**
- 加入 `inspect()` 工具函数（own keys + proto methods + DOM check），对 `paypal` / `instance` / `eligibility` / `session` / 三个 field 组件 / `submit result` 逐一打印。
- session 和 field 对象同时保留 `console.log(obj)` 直接引用 + `inspect()` 深度探查，双通道覆盖。
- `decide3DSAndCapture` 进入 GET order 分支时，用 `console.group` 打印 `authentication_result` 完整对象及所有子字段（`liability_shift`、`enrollment_status`、`authentication_status`、`cavv`、`cavv_algorithm`、`eci_indicator`、`xid`）。

**新建文件（4 个）：**
- `src/routes/paypal/jssdk-v6/acdc.js`（自定义路由：GET render + POST create-order + GET order/:orderId + POST capture-order；CN 账号；返回 `{ orderId }` 小写 d）
- `src/views/paypal/jssdk-v6/acdc.ejs`（移植 v5 结构；`supportedCurrencies.forEach`；`window.DEMO` 含 clientId/components/billing；三段式脚本；宿主容器 `height:42px`）
- `src/public/js/paypal/jssdk-v6/acdc.js`（v6 CardFields 命令式；3DS 决策同 v5；inspect() 探查；mapBilling 字段名修正）

**修改文件（3 个）：**
- `src/app.js`（+1 行 v6 acdc 路由挂载）
- `src/routes/paypal/jssdk-v6/CLAUDE.md`（components 表 acdc → `['card-fields']` ✅；新增 V6-ACDC-1 到 V6-ACDC-6 六条专属规则）
- `apps/demo-hub/docs/todos.md`（Task 13 → ✅）

**待用户操作：**
- Supabase SQL Editor 执行 INSERT（`demohub.products` 插入 acdc 行，`sort_order` 取 v6 组内最大 +1）
- 重启 demo-hub，访问 `/paypal/jssdk-v6/acdc` 验证页面加载与卡字段渲染
- 按 `docs/test-cases.md` ACDC v6 测试矩阵逐项验收

**状态：** Task 13 ✅ 代码完成，待 Supabase INSERT + E2E 验证。

---

## 2026-06-01 — JSSDK v6 Standalone Buttons（Task 12）

**背景：** 在同一页面渲染四个按钮（PayPal / PayLater / BCDC / Venmo），CN 账号用于前三者，US 账号用于 Venmo。v6 SDK `createInstance` 多次调用同一 `paypal` 全局且加载同一 SDK 脚本，无法通过 `data-namespace` 方案隔离（v6 Web Component 注册是全局单例，两次加载触发 `NotSupportedError: already been used with this registry`）。最终方案：单 SDK 加载，CN 用 `clientId`（via `getPPInstance()`），US 用 `clientToken`（从后端 `GET /api/buttons/us-client-token` 获取，调用 `/v1/oauth2/token` 带 `response_type=client_token&domains[]=...`）。

**关键技术决策：**
- **双实例不能并发** `createInstance`：必须 CN await 后再建 US（否则 Venmo `isEligible` 返回 false，原因可能是 SDK 内部 auth 上下文竞态）
- **`clientToken` vs `clientId`**：第二次 `createInstance` 用 `clientToken` 才能携带独立的 US 账号凭证，`clientId` 在第二次调用时 Venmo 不 eligible
- **货币固定 USD**：Venmo 只支持 USD，页面 currency selector disabled

**新增函数：`getUSClientToken()`**（`config/paypal.js`）
- 调 `/v1/oauth2/token`，body: `grant_type=client_credentials&response_type=client_token&domains[]=PAYPAL_US_MERCHANT_DOMAINS`
- 返回 `data.access_token`（PayPal 把 client_token 放在 access_token 字段）

**改动文件（共 5 个）：**
- `src/routes/paypal/jssdk-v6/buttons.js`（新建：4 个 API 端点 + GET us-client-token）
- `src/views/paypal/jssdk-v6/buttons.ejs`（新建：4 btn-slot，USD only，usClientToken URL）
- `src/public/js/paypal/jssdk-v6/buttons.js`（新建：sequential createInstance，clientToken for US）
- `src/config/paypal.js`（修改：新增 `getUSClientToken()`）
- `src/app.js`（修改：挂载 buttons 路由）

**状态：** Task 12 ✅ 完成。

---

## 2026-06-01 — Collapsible Sections（UI 改进）

**背景：** List 页面 provider / SDK 分组内容太长，需要可折叠。Demo 详情页侧边栏同样需要两级折叠。

**实现方案：** 共享 `collapse.js`（vanilla JS IIFE），读 `data-collapse-provider` / `data-collapse-sdk` 属性定位触发元素，`aria-controls` 关联 `.collapsible-body` 容器，CSS `max-height` + `opacity` 过渡实现动画，localStorage 持久化展开/折叠状态。

**无障碍（ui-ux-pro-max 审查）：** `role="button"` + `tabindex="0"` + `aria-expanded` + `aria-controls` + `keydown Enter/Space` + `:focus-visible` 焦点环 + `@media (prefers-reduced-motion: reduce)`。

**Coming-soon provider 处理：** CSS 触发样式改为属性选择器 `[data-collapse-provider]`，无此属性的 Stripe/Adyen header 保持 `cursor: auto`，不进入折叠逻辑。

**改动文件（共 5 个）：**
- `src/public/js/collapse.js`（新建：toggle + localStorage + ARIA + keyboard）
- `src/public/css/layout.css`（修改：`.collapsible-body` transition + focus-visible + reduced-motion）
- `src/views/index.ejs`（修改：provider/SDK wrapper + icons + ARIA attrs + script include）
- `src/views/partials/header.ejs`（修改：sidebar provider/SDK wrapper）
- `src/views/partials/footer.ejs`（修改：collapse.js script include）

**状态：** ✅ 完成。经浏览器验证：折叠/展开、localStorage 持久化、键盘导航、焦点环、mobile tabs 不受影响均正常。

---

## 2026-06-01 — JSSDK v6 BCDC ECM / ECS（Task 10）

**背景：** 基于 PayPal JSSDK v6 BCDC 文档，新增 bcdc-ecm 和 bcdc-ecs 两个 demo。BCDC（Basic Card & Debit Card）使用 `createPayPalGuestOneTimePaymentSession`（异步）和 `paypal-basic-card-button` web component，与 PayPal ECM/ECS 的 `createPayPalOneTimePaymentSession`（同步）存在关键差异。

**完成内容：**

### 路由文件（工厂路由，CN 账号）

- **`src/routes/paypal/jssdk-v6/bcdc-ecm.js`**：`createStandardRoute`，buildBody 与 paypal-ecm 完全相同（含 `SANDBOX_BUYER`、`EXPERIENCE_CONTEXT`、`SANDBOX_SHIPPING`）
- **`src/routes/paypal/jssdk-v6/bcdc-ecs.js`**：`createStandardRoute`，buildBody 与 paypal-ecs 完全相同（`shipping_preference: 'GET_FROM_FILE'`，无 shipping 字段）

### EJS 视图

- **`src/views/paypal/jssdk-v6/bcdc-ecm.ejs`** / **`bcdc-ecs.ejs`**：
  - `window.DEMO.components: ['paypal-guest-payments']`
  - 有货币选择器
  - 无 presentation mode 下拉（BCDC 固定 `auto`）
  - 无 custom trigger button（BCDC 仅官方按钮）

### 前端 JS

- **`src/public/js/paypal/jssdk-v6/bcdc-ecm.js`** / **`bcdc-ecs.js`**：各自独立文件
  - `createPayPalGuestOneTimePaymentSession`（**async**，需 await；与 PayPal session 的同步调用不同）
  - `findEligibleMethods({ currencyCode: getCurrency() })`（显式传 currencyCode）
  - `isEligible('basic_cards')`（下划线 + 复数）
  - `paypal-basic-card-container` + `paypal-basic-card-button` 动态创建
  - `session.start({ presentationMode: 'auto' }, orderPromise)`（固定 auto，无 fallback 循环）
  - 无 `session.hasReturned()` / `session.resume()`（guest session 不支持）
  - 额外回调：`onComplete`（完成通知）、`onWarn`（表单错误，可恢复）

### Bug 修复（运行时）

- 移除 `session.hasReturned()` 调用：guest session 无此方法，调用即 `TypeError`

### 样式更新

- `src/public/css/sandbox.css`：将 `paypal-basic-card-button` 和 `paypal-basic-card-container` 加入 web component block（`display: block; width: 100%`）

### 规则文档

- `src/routes/paypal/jssdk-v6/CLAUDE.md`：新增 V6-BCDC-1 至 V6-BCDC-6 六条 BCDC 专属规则

### 更新 app.js

- 挂载 `bcdc-ecm` + `bcdc-ecs` 路由

**改动文件（共 9 个）：**
- `src/routes/paypal/jssdk-v6/bcdc-ecm.js`（新建）
- `src/routes/paypal/jssdk-v6/bcdc-ecs.js`（新建）
- `src/views/paypal/jssdk-v6/bcdc-ecm.ejs`（新建）
- `src/views/paypal/jssdk-v6/bcdc-ecs.ejs`（新建）
- `src/public/js/paypal/jssdk-v6/bcdc-ecm.js`（新建）
- `src/public/js/paypal/jssdk-v6/bcdc-ecs.js`（新建）
- `src/app.js`（修改 — 挂载两个新路由）
- `src/public/css/sandbox.css`（修改 — bcdc web component 样式）
- `src/routes/paypal/jssdk-v6/CLAUDE.md`（修改 — 新增 BCDC 专属规则）

**状态：** Task 10 ✅ 完成。Supabase 需插入两条产品记录后重启 demo-hub 生效。

---

## 2026-06-01 — JSSDK v6 Venmo ECM / ECS（Task 9）

**背景：** 基于 PayPal JSSDK v6 文档，新增 Venmo ECM 和 ECS 两个 demo。Venmo 仅支持 US 买家 + USD，使用 US 沙盒账号凭证，前端 SDK 方法与 PayPal ECM/ECS 存在显著差异。

**完成内容：**

### 路由文件（各自独立，均使用 US 账号）

- **`src/routes/paypal/jssdk-v6/venmo-ecm.js`**：自定义路由（非工厂）
  - GET 注入 `clientId: process.env.PAYPAL_US_CLIENT_ID`
  - create-order：`getUSToken()`；`payment_source.venmo.experience_context.shipping_preference: 'SET_PROVIDED_ADDRESS'`；`shipping: VENMO_SHIPPING`；货币硬编码 USD
  - capture-order：`getUSToken()`

- **`src/routes/paypal/jssdk-v6/venmo-ecs.js`**：自定义路由
  - 与 ECM 相同，差异：`shipping_preference: 'GET_FROM_FILE'`；无 `shipping` 字段

### EJS 视图

- **`src/views/paypal/jssdk-v6/venmo-ecm.ejs`** / **`venmo-ecs.ejs`**：
  - `window.DEMO.components: ['venmo-payments']`
  - 无货币选择器（disabled select 显示 USD only）
  - 无 presentation mode 选择器（Venmo 仅支持 `auto`）
  - 保留 custom trigger wrap（与 paypal-ecm/ecs 一致）

### 前端 JS

- **`src/public/js/paypal/jssdk-v6/venmo-ecm.js`** / **`venmo-ecs.js`**：各自独立
  - `createVenmoOneTimePaymentSession`（非 `createPayPalOneTimePaymentSession`）
  - `findEligibleMethods({ currencyCode: 'USD' })`（显式传 currencyCode）
  - `isEligible('venmo')`
  - `document.createElement('venmo-button')` + `type="pay"`
  - `session.start({ presentationMode: 'auto' }, orderPromise)`（仅 auto，无 fallback 循环）
  - 无 `session.hasReturned()` / `session.resume()`（Venmo session 不支持）

### Bug 修复（运行时）

- 移除 `session.hasReturned()` 调用：Venmo session 无此方法，调用即 `TypeError`

### 更新 app.js

- 挂载 `venmo-ecm` + `venmo-ecs` 路由

**改动文件（共 7 个）：**
- `src/routes/paypal/jssdk-v6/venmo-ecm.js`（新建）
- `src/routes/paypal/jssdk-v6/venmo-ecs.js`（新建）
- `src/views/paypal/jssdk-v6/venmo-ecm.ejs`（新建）
- `src/views/paypal/jssdk-v6/venmo-ecs.ejs`（新建）
- `src/public/js/paypal/jssdk-v6/venmo-ecm.js`（新建）
- `src/public/js/paypal/jssdk-v6/venmo-ecs.js`（新建）
- `src/app.js`（修改 — 挂载两个新路由）

**状态：** Task 9 ✅ 完成。Supabase 需插入两条产品记录后重启 demo-hub 生效。

---

## 2026-05-30 — PayPal JSSDK v6 基础实施（Tasks 1–10 + Task 22）

**背景：** 在已完成的 jssdk-v5 基础上，新增 `/paypal/jssdk-v6/` 路由前缀，首先实现 PayPal ECM / ECS 两个核心 demo，验证 v6 SDK 架构可行性。

**完成内容：**

### 设计与规划
- 完成 JSSDK v6 设计文档：`docs/superpowers/specs/2026-05-30-jssdk-v6-design.md`
- 完成 JSSDK v6 实现计划：`docs/superpowers/plans/2026-05-30-jssdk-v6.md`（20 个产品，Tasks 1–24）
- Supabase SQL 执行：插入 20 条 v6 产品记录（`demohub.products` 表），app 启动确认加载 36 个产品（16 v5 + 20 v6）

### 基础设施
- **`src/routes/paypal/jssdk-v6/_factory.js`**：v6 路由工厂
  - `createStandardRoute({ productKey, view, buildBody })`
  - `buildBody` 为必填参数（运行时 guard），签名：`function(amount, currency) → body`
  - 与 v5 工厂关键差异：注入 `clientId`（非 `sdkUrl`）；create-order 返回 `{ orderId: order.id }`；capture-order 读 `req.body.orderId`
  - JSDoc 提醒：零小数位货币（JPY 等）在 `buildBody` 内需 `Math.round()`
- **`src/public/js/paypal/jssdk-v6/init.js`**：browser-side 单例
  - `window.getPPInstance()` → `paypal.createInstance({ clientId, components })` 的 Promise 缓存
  - sessionStorage 记录 `pp_v6_clientId`（跨页面 SDK 缓存加速）

### PayPal ECM / ECS 路由 + 视图 + JS
- **`src/routes/paypal/jssdk-v6/paypal-ecm.js`**：buildBody 含 `shipping: SANDBOX_SHIPPING`、`shipping_preference: 'SET_PROVIDED_ADDRESS'`
- **`src/routes/paypal/jssdk-v6/paypal-ecs.js`**：无 shipping 字段、`shipping_preference: 'GET_FROM_FILE'`
- **`src/views/paypal/jssdk-v6/paypal-ecm.ejs`** / **`paypal-ecs.ejs`**：
  - `window.DEMO = { clientId, components: ['paypal-payments'], urls: { createOrder, captureOrder } }`
  - Script 加载顺序：`init.js` → `paypal.js` → `<script defer src="...web-sdk/v6/core">`（defer 保证 window.load 触发时 SDK 已就绪）
  - 无 `sdkUrl` 传给 header（header.ejs 条件跳过 SDK 注入）
- **`src/public/js/paypal/jssdk-v6/paypal.js`**（paypal-ecm + paypal-ecs 共用）：
  - 关键 V6-3 规则：`findEligibleMethods()` 嵌套在接收 `instance` 的 `.then()` 内部，保证 `instance` 在后续回调中可用
  - `session.start({ presentationMode: 'auto' }, orderPromise)` 传 Promise 引用（非 await 结果），防止弹窗被浏览器拦截
  - `onApprove` 读 `data.orderId`（小写 d）；capture 成功判断：`captures[0].status === 'COMPLETED'`
  - `validateAmount()` 含正则校验 `^\d+(\.\d{1,2})?$` + `isNaN` 检查
  - `onCancel` 使用 `'info'` type（非 error）

### 规则文档
- **`src/routes/paypal/jssdk-v6/CLAUDE.md`**：v6 专属 7 条规则（V6-1 到 V6-7）
- Symlinks：`src/views/paypal/jssdk-v6/CLAUDE.md` → 同文件；`src/public/js/paypal/jssdk-v6/CLAUDE.md` → 同文件

**修复的关键 Bug（Code Review 发现）：**
1. `instance` 作用域错误：Promise chain 从 flat `.then()` 改为嵌套 `.then()`（V6-3 规则来源）
2. 死代码：移除 EJS 中的 `#amount-error` div（`paypal.js` 从不写入该元素）
3. 弱校验：`validateAmount()` 补充 `isNaN` 和正则校验
4. 缺少服务端错误 guard：`onApprove` 内补充 `if (order.error)` 检查
5. `window.DEMO.urls` 不安全访问：改为 `(window.DEMO || {}).urls`
6. `_factory.js` 缺少 `buildBody` runtime guard：补充 `typeof` 检查

**状态：**
- Tasks 1–10、22：✅ 完成（subagent 实施 + spec + 代码质量双重审查）
- Task 4（Supabase）：✅ 用户已执行 SQL，36 产品加载确认
- Task 11（E2E 测试）：⏳ 用户人手测试中
- Tasks 12–21、23–24：⏸ 等待各产品 v6 markdown 文档

**下一步：**
- 等 Task 11 测试结果（pass → 继续后续产品；fail → 针对性修复）
- 用户提供 paylater/venmo/bcdc/acdc/applepay/googlepay/vault/plm 的 v6 markdown 后，继续 Tasks 8–21

---

## 2026-05-31 — JSSDK v6 四个 demo 新增 Custom Trigger Button

**背景：** JSSDK v6 使用真实 HTML 元素（Web Component）而非 iframe，因此任何普通 DOM 元素都可通过 `.addEventListener('click', sameHandler)` 触发相同支付流程。在 paypal-ecm / paypal-ecs / paylater-ecm / paylater-ecs 四个 demo 中，在官方按钮下方加入一个视觉美观的自定义按钮，用于演示这一能力。

**完成内容：**

- **`src/public/css/sandbox.css`**：新增 custom trigger button 样式（`.custom-trigger-wrap`、`.custom-trigger-sep`、`.custom-trigger-sep-label`、`.custom-trigger-btn`）
  - 虚线边框（dashed）+ monospace 字体，与沙盒 dev 风格一致
  - 完整交互状态：hover / active（scale 0.99）/ focus-visible（accent outline）
  - 初始 `display:none`，JS 在 SDK 就绪后显示

- **4 个 EJS 视图**：在 `#paypal-button-container` 和 `#result` 之间插入 `#custom-trigger-wrap`
  - paypal-ecm / paypal-ecs：按钮文字 "Trigger Payment Flow"
  - paylater-ecm / paylater-ecs：按钮文字 "Trigger Pay Later Flow"
  - 内联 SVG 播放三角图标（无 emoji）

- **4 个前端 JS 文件**：将原匿名 click handler 抽取为命名 `handleClick` async function
  - 保持 V6-2 规则不变：`orderPromise` 在 handler 内同步创建（不 await），然后传给 `session.start()`，确保弹窗在 transient activation 窗口内触发
  - SDK 官方按钮和 custom button 共享同一 `handleClick` 引用
  - SDK 就绪后 `wrap.style.display = 'block'` 显示 custom button 区域

**改动文件：**
- `src/public/css/sandbox.css`
- `src/views/paypal/jssdk-v6/paypal-ecm.ejs`
- `src/views/paypal/jssdk-v6/paypal-ecs.ejs`
- `src/views/paypal/jssdk-v6/paylater-ecm.ejs`
- `src/views/paypal/jssdk-v6/paylater-ecs.ejs`
- `src/public/js/paypal/jssdk-v6/paypal-ecm.js`
- `src/public/js/paypal/jssdk-v6/paypal-ecs.js`
- `src/public/js/paypal/jssdk-v6/paylater-ecm.js`
- `src/public/js/paypal/jssdk-v6/paylater-ecs.js`

---

## 2026-05-31 — JSSDK v6 PayLater ECM/ECS 国家→币种联动

**背景：** paylater-ecm 和 paylater-ecs demo 中，切换国家选择器时，SDK 的 `findEligibleMethods()` 和 create-order 请求的 currency 参数需要随之变化（而非硬编码 USD）。工厂路由的 GET handler 已支持透传 `?currency=` 参数，只需在前端 JS 完成映射并在 URL reload 时带上 currency。

**完成内容：**

- **`paylater-ecm.js`**（3 处修改）：
  1. `findEligibleMethods({ currencyCode: 'USD' })` → `findEligibleMethods({ currencyCode: getCurrency() })`
  2. `createOrder` body `currency: 'USD'` → `currency: getCurrency()`
  3. 国家切换 reload URL 新增 `url.searchParams.set('currency', COUNTRY_TO_CURRENCY[this.value] || 'USD')`

- **`paylater-ecs.js`**（4 处修改）：
  1. 新增 `COUNTRY_TO_CURRENCY` 映射表 + `getCurrency()` helper（与 ECM 相同）
  2. 同上 1–3 三处修改

**映射规则：** `US→USD | AU→AUD | IT/ES/FR→EUR | GB→GBP | CA→CAD`（其余 fallback USD）

**改动文件：**
- `src/public/js/paypal/jssdk-v6/paylater-ecm.js`
- `src/public/js/paypal/jssdk-v6/paylater-ecs.js`

---

## 2026-05-31 — JSSDK v6 paypal-ecm/ecs Bug 修复 + 代码重构

**修复内容：**

1. **`createPayPalOneTimePaymentSession()` 同步返回（V6-8 新规则）**
   - 原错误：`.then(function(session) {...})` → `TypeError: ...().then is not a function`
   - 修复：改为 `var session = instance.createPayPalOneTimePaymentSession({...})`，直接同步使用
   - 更新 `CLAUDE.md` 新增规则 V6-8；更新 design spec section 7 代码示例

2. **`paypal.js` 拆分为 `paypal-ecm.js` + `paypal-ecs.js`**
   - 原因：每产品独立文件，便于后续差异化实现
   - `paypal-ecm.ejs` → 引用 `/js/paypal/jssdk-v6/paypal-ecm.js`
   - `paypal-ecs.ejs` → 引用 `/js/paypal/jssdk-v6/paypal-ecs.js`
   - `paypal.js` 已删除

3. **buildBody 完全对齐 v5 spb-ecm / spb-ecs**
   - **paypal-ecm**：补充 `SANDBOX_BUYER`、`reference_id`、`description`、`invoice_id`、`custom_id`、`soft_descriptor`、完整 `DEMO_ITEM`（含 sku/description/url 等字段）；`EXPERIENCE_CONTEXT` 直接使用（不手动加 `shipping_preference`，由常量控制）
   - **paypal-ecs**：同上字段，`experience_context` 额外加 `shipping_preference: 'GET_FROM_FILE'` + `user_action: 'CONTINUE'`；无 shipping 字段

4. **`paypal-ecm.js` 三层函数重构（参考 PayPal 参考代码，V6-9 新规则）**
   - `paymentSessionOptions` 对象提取到 IIFE 顶层（回调集中管理，不再内联）
   - `configurePayPalButton(sdkInstance)` 函数：创建 session + button + click 监听
   - `onPayPalWebSdkLoaded()` 函数：SDK 入口，getPPInstance + findEligibleMethods + 路由到 configurePayPalButton
   - `window.addEventListener('load', ...)` 只调用 `onPayPalWebSdkLoaded()`，不含任何业务逻辑
   - 保留 `[ECM]` console.log 调试日志（用于 Task 11 验证）

5. **showResult CSS class 修复（V6-10 新规则）**
   - 原错误：`el.className = 'result-msg result-success'`（无对应 CSS selector，样式不生效）
   - 修复：`el.className = 'result-msg ' + type`（type = 'success' | 'error'）
   - 移除 `el.style.display = 'block'`（CSS 通过 `.result-msg.success/.error` 控制 display）
   - `onCancel` 改为 `showResult('Payment cancelled.', 'error')`（红色，与失败一致；`'info'` 无对应 CSS）
   - 同时修复 `paypal-ecs.js` 的相同问题

**更新的 markdown 文件：**
- `src/routes/paypal/jssdk-v6/CLAUDE.md`：新增规则 V6-9（函数结构）、V6-10（showResult CSS）
- `docs/superpowers/specs/2026-05-30-jssdk-v6-design.md`：Section 7 完整重写为三层函数结构

**状态：** Task 11 E2E 测试进行中（用户人手测试）

---

## 2026-05-28 — Google Pay ECS Full Callback 模式

- 修复 `googlepay-ecs.js`：改为 Full Callback 模式（`paymentDataCallbacks: { onPaymentAuthorized, onPaymentDataChanged }`）
- 修复 `callbackIntents` 必须含 `PAYMENT_AUTHORIZATION`（否则 Google Pay OR_BIBED_06 错误）
- 修复 `shippingOptions` 格式：只含 `{id, label, description}`，不能含 `price` / `selected`
- 修复 `onPaymentDataChanged` 返回规则：SHIPPING_OPTION 时只返回 `newTransactionInfo`
- 新增 `shippingAmount` 注入 create-order，total = item + shipping

---

## 2026-05-20 ~ 2026-05-27 — JSSDK v5 完整实施

- PLM div / PLM JS（`plm-div.js`、`plm-js.js`）
- Google Pay ECM / ECS（Promise 模式 / Full Callback 模式）
- Apple Pay ECM / ECS
- Vault Return（`commit=true&buyer-country=US` 规则确认）
- ACDC Vault w/ Purchase / ACDC Vault Setup-only
- Apple Pay Vault w/ Purchase
- PayPal Vault w/ Purchase / PayPal Vault Setup-only
- 动态金额 + 币种选择器（30 种货币，零小数位格式化）
- `constants.js` 统一常量管理
- EJS/JS 分离重构（`window.DEMO` 模式）
