# 实现计划 — Fastlane Flexible (fastlane-fp) · JSSDK v5 · v1

> 日期：2026-06-09
> 关联需求：`docs/req/2026-06-09-req-fastlane-fp.md`
> 关联设计：`docs/design/2026-06-09-design-fe-fastlane-fp.md` · `docs/design/2026-06-09-design-be-fastlane-fp.md`
> 状态：待实现（**Opus 只写文档；代码须切换到非 Opus 模型（如 Sonnet）实现**）

---

## 0. 完成定义（Definition of Done）

- 访问 `/paypal/jssdk-v5/fastlane-fp` 渲染四段式表单，Fastlane + ThreeDomainSecureClient 初始化成功。
- guest / member-有卡 / member-无卡 三路径均可走到 Checkout。
- JSSDK 3DS：测试卡 `4000 0000 0000 2503` 触发挑战 → 成功 → 内联 `✓ COMPLETED · Capture ID`。
- API 3DS：测试卡 `5329 8797 3531 6929` → 跳转 PayPal 3DS → 回 return 页 → 服务端 capture → 结果页 `✓ COMPLETED`。
- 普通卡（无 3DS）：JSSDK flow `isEligible` false → 直接下单成功。
- 成功判定遵循 CLAUDE 规则 13；首页出现 fastlane-fp 卡片。
- 控制台按 inspect/probe 打印所有关键返回对象。

---

## 1. 前置确认（实现前先看）

- [ ] `config/paypal.js` 的 `getUSClientToken({ intent })` 已支持可选 intent（pui 已加，确认存在）。
- [ ] `.env` 已配置 `PAYPAL_US_CLIENT_ID/SECRET/MERCHANT_DOMAINS`，且 domains 在 PayPal 后台 Fastlane 白名单内。
- [ ] 通读 `fastlane-pui.js`（路由）/ `fastlane-pui.ejs` / `public/js/.../fastlane-pui.js` 作为模板。
- [ ] 通读用户提供的 Flexible demo（html + js）确认字段与流程细节。

---

## 2. 任务拆解

### Task 1 — 路由文件 `src/routes/paypal/jssdk-v5/fastlane-fp.js`（新增）

参考 `fastlane-pui.js`。三个 handler：

- [ ] **GET `/fastlane-fp`**：渲染，SDK URL `components=fastlane,three-domain-secure&buyer-country=US&currency=USD`，
      `sdkClientToken = getUSClientToken({ intent:'sdk_init' })`，currency 锁 USD。
- [ ] **POST `/api/fastlane-fp/create-order`**：读 `{ paymentToken, shippingAddress?, billingAddress?, amount, threeDSFlow }`；
      `validateAmount`；API flow 时预生成 `sessionKey = crypto.randomBytes(16).hex()`，传入 `buildFastlaneOrderBody`（嵌入 `return_url?session=<key>`）；调 PayPal 后将 `sessionKey→order.id` 存入模块级 `threeDSSessionStore`（Map，10分钟自动过期）；返回完整 order。
- [ ] **GET `/fastlane-fp/return`**：✅ 实测确认 PayPal card 3DS 回调无 orderId（参数为 `state/code/liability_shift`）；
      读 `req.query.session` → `threeDSSessionStore.get(key)`（单次使用后 delete）；`fp_cancel` → 渲染取消态；
      否则 `getUSToken()` → POST `/v2/checkout/orders/:orderId/capture` → 规则 13 判定 → 渲染 `fastlane-fp-return`。
- [ ] 复制 pui 的 `mapShipping`（不跨产品共用路由文件，规则 1）。
- [ ] `buildFastlaneOrderBody`：见 be 设计 §3（两套 3DS 分支）。

**验收**：路由可挂载，GET 200 渲染；create-order 在 Postman/浏览器返回合理结构（待 inspect）。

### Task 2 — return 结果页 `src/views/paypal/jssdk-v5/fastlane-fp-return.ejs`（新增）

- [ ] include header/footer；三态（success / cancelled / error）；
      `✓ COMPLETED · Capture ID: <captureId>`；`<pre>` 展示完整 order JSON；"← 返回 Demo" 链接。
- [ ] **不加载** Fastlane SDK（纯展示）。样式复用 sandbox.css + 页内微调。

**验收**：手动访问 `/fastlane-fp/return?token=<已知orderId>` 能渲染（capture 可能报错，先验证渲染骨架）。

### Task 3 — 主视图 `src/views/paypal/jssdk-v5/fastlane-fp.ejs`（新增）

- [ ] 复制 pui EJS 的 scoped `<style>`（三态 CSS），序号扩到 1/2/3/4；加 `#step-billing[hidden]{display:none}`。
- [ ] 四步结构：Customer / Shipping / **Billing**（id/name 前缀 `billing-`）/ Payment。
- [ ] Payment 步内：3DS Flow `<select id="three-ds-flow">`（**none 为第一项/默认**；jssdk；api）、`#selected-card`、`#card-component`、`#payment-watermark`、Checkout 按钮。
- [ ] 追加 CSS 规则：`.fl-step.fl-active.fl-visited .fl-step__edit { opacity: 1; pointer-events: auto; }`（供 Payment 步 member-有卡路径同时展示内容与 Edit 按钮）。
- [ ] `window.DEMO` 注入（createOrder url + amount + currency）；SDK 脚本带 `data-sdk-client-token`；引入 `fastlane-fp.js`。

**验收**：页面四步渲染正确，三态视觉与 pui 一致。

### Task 4 — 前端逻辑 `src/public/js/paypal/jssdk-v5/fastlane-fp.js`（新增）

按 fe 设计 §5 实现，IIFE + `'use strict'`：

- [ ] 初始化：`window.paypal.Fastlane(...)` 取 `FastlaneCardComponent` + watermark；email 旁 watermark 渲染。
- [ ] Email → lookup + OTP；认证后三路径分支（member-有卡 / member-无卡 / guest）。
- [ ] Shipping 提交（复用 pui；checkbox 控制字段显隐；记录 prefill）→ Billing。
- [ ] Billing 提交 → 渲染 `FastlaneCardComponent({ fields:{ phoneNumber, postalCode, cardholderName } })` + watermark。
- [ ] 编辑按钮：shipping-edit（member: `showShippingAddressSelector`）、payment-edit（member-有卡: `showCardSelector`）。
- [ ] member-有卡分支：`setActive(stepPayment)` 后紧接 `markVisited(stepPayment)`，使 Edit 按钮可见（用于换卡）。
- [ ] Checkout：
  - [ ] 取 token（member-有卡用 profile token；否则 `getPaymentToken({ billingAddress })`）。
  - [ ] **None flow**（默认）：直接 `createAndJudge(paymentToken, 'none', ...)`，不走任何 3DS 逻辑。
  - [ ] **JSSDK flow**：`ThreeDomainSecureClient.isEligible` → `show` → 成功则 `paymentToken.id = nonce` → create-order → `judgeInline`；not eligible → 直接 create-order。
  - [ ] **API flow**：create-order → `PAYER_ACTION_REQUIRED` → `window.location.href = payer-action href`；否则内联判定。
  - [ ] `judgeInline` 规则 13；成功后锁全表单。
- [ ] **全程 inspect/probe** console.log（fe 设计 §7 清单）。

**验收**：三路径 + 两套 3DS 在浏览器跑通（见 Task 7 QA）。

### Task 5 — 挂载 `src/app.js`

- [ ] v5 区块 `fastlane-pui` 之后追加：`app.use(v5, require("./routes/paypal/jssdk-v5/fastlane-fp"));`

### Task 6 — Supabase（用户手动）

- [ ] 执行 be 设计 §6.1 的 INSERT（自动取 sort_order）。
- [ ] 重启 demo-hub，确认首页出现 fastlane-fp 卡片。

### Task 7 — QA（浏览器，inspect/probe 验证 + 定稿）

- [ ] **guest + JSSDK 3DS**：新 email → 收货 → 账单 → 卡 `4000 0000 0000 2503` → 挑战成功 → `✓ COMPLETED`。
- [ ] **guest + API 3DS**：卡 `5329 8797 3531 6929` → 跳转 → 完成 → return 页 `✓ COMPLETED`。
- [ ] **guest + 普通卡（JSSDK flow, not eligible）**：`4005 5192 0000 0004` → 直接下单成功。
- [ ] **member-有卡**：注册过的 email → OTP `111111` → Shipping visited / Billing 隐藏 / Payment 显存卡 → Checkout。
- [ ] **member 换卡/换地址**：`showCardSelector` / `showShippingAddressSelector` 生效且摘要刷新。
- [ ] **member-无卡**：认证成功无 card → 走 Billing + 卡组件。
- [ ] **API 3DS 取消**：3DS 页取消 → return 页取消提示。
- [ ] **OTP 失败回退**：会员 email + 错误 OTP（非 111111）→ `authenticationState !== 'succeeded'` → 回落访客流程（展开 Shipping）。
- [ ] **JSSDK 3DS 认证失败**：3DS 挑战失败或 `liabilityShift !== 'POSSIBLE'` → showResult 错误，不下单，按钮恢复可重试。
- [ ] **API 3DS 未触发挑战**：API flow 但 create-order 直接返回 captures（未 PAYER_ACTION_REQUIRED）→ 前端 `judgeInline` 内联判定成功（不跳转）。
- [ ] **虚拟商品（不要收货）**：取消勾选 shipping-required → 不发 shippingAddress，仍走 Billing + 卡 → 下单成功。
- [ ] **member-有卡 × API 3DS**：存卡 token 选 API flow → 整页跳转 → return 页服务端 capture（确认存卡 token 在 API 3DS 路径可用）。
- [ ] **return 页刷新行为（已知）**：D1 决策为保持简单 POST capture——成功后刷新 return 页会显示 ORDER_ALREADY_CAPTURED 错误，属预期，QA 时知悉不误判为 bug。
- [ ] **inspect 核对并定稿**：API order body 字段位置、return token 参数名、是否需显式 capture、JSSDK nonce 替换后是否直接 captures。发现偏差按 be 设计 §2.3 / §8 回退方案调整，记入 `docs/debug-log.md`。

### Task 8 — 文档收尾

- [ ] 更新 `src/routes/paypal/jssdk-v5/CLAUDE.md`（SDK params 表加 fastlane-fp 行；自定义路由备注加 fastlane-fp 段：四步、两套 3DS、return 页服务端 capture、与 pui 差异）。
- [ ] 更新 `docs/progress.md`。
- [ ] 更新 `docs/todos.md`（勾选 fastlane-fp 任务；多 funding 留 todo）。
- [ ] QA 中确认的真实字段回填到 fe/be 设计文档（去掉 inspect/probe 推断标记）。

---

## 3. 实现顺序建议

1. Task 1（路由骨架）+ Task 5（挂载）→ GET 渲染先通。
2. Task 3（主视图）→ 页面结构 + 三态。
3. Task 4（前端逻辑）→ 先跑 guest 非 3DS（JSSDK flow not eligible）打通 create-order。
4. Task 2 + Task 1 的 return handler → API 3DS 整链。
5. JSSDK 3DS（Task 4 补全）。
6. member 路径（有卡/无卡）。
7. Task 6（Supabase）→ Task 7（QA 定稿）→ Task 8（文档）。

---

## 4. 风险与回退（详见 be/fe 设计 inspect/probe 清单）

| 风险 | 回退方案 |
|------|----------|
| API order body 字段位置被 PayPal 拒 | 试 `payment_source.card.attributes.verification` 等位置；记 debug-log |
| return token 参数名非 `token` | inspect `req.query` 实测改正 |
| payer action 后已自动 capture | return 路由改 GET order details 读 captures，不再 POST capture |
| JSSDK nonce 替换后未直接 captures | 比照 pui；若返回 CREATED/APPROVED 补一次 capture |
| ThreeDomainSecureClient 字段名差异 | inspect `show()` 返回，按真实字段判定 |
| 普通卡走 API flow 不触发挑战 | create-order 直接返回 captures → 前端 `judgeInline` 内联判定（已在设计覆盖） |

---

## 5. 不做（本期）

- 多 funding（PayPal / Venmo / PayLater）→ `docs/todos.md` 保留 todo。
- AUTHORIZE intent / `captureAuthorize`。
- Vaulting、多币种、非 US 买家。

---

## GSTACK REVIEW REPORT

> /plan-eng-review · 2026-06-09 · 全程交互式（Step 0 scope + Arch + Code Quality + Tests + Perf）

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run（demo 增量，scope 由用户预先确认） |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 4 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run（复用 pui 三态 CSS，无新设计系统） |
| Codex/Outside | `/codex` | Independent 2nd opinion | 0 | — | skipped |

**决策记录（4 findings，全部用户拍板）：**
- **D1 — return GET capture 幂等**：选 **B 保持简单 POST capture**。已知副作用：成功后刷新 return 页显示 ORDER_ALREADY_CAPTURED 错误，demo 可接受（已写入 Task 7 知悉项）。
- **D2 — mapShipping 后端重复**：选 **A 复制到 fp**（不动 pui，surgical）。
- **D3 — 前端辅助函数重复**：选 **A 复制到 fp**（产品自包含，不动 pui.js）。
- **D4 — Task 7 QA 补 5 边界用例**：选 **A 补齐**（已写入 Task 7：OTP 失败回退 / JSSDK 3DS 认证失败 / API 3DS 未触发挑战 / 虚拟商品 / member-有卡×API 3DS）。

**Test review**：demo-hub 无自动化测试框架（30+ demo 均手动 QA，保持一致，不强加 harness）。覆盖矩阵 7→12 场景（补 D4 后），无 regression（全新代码）。

**What already exists（复用，未重建）**：`fastlane-pui`（email/OTP/shipping/watermark/三态 CSS/rule-13/success-lock/mapShipping，~70%）；`acdc.js`/`vault-acdc-*`（3DS 决策模式）；`config/paypal.js`（getUSToken/getUSClientToken 已支持 intent）；`config/constants.js`（DEMO_ITEM/validateAmount/DEFAULT_AMOUNT）。

**NOT in scope**（见 §5）：多 funding / AUTHORIZE / Vaulting / 多币种 / 非 US。

**Failure modes（关键路径，0 critical gap）**：
- API 3DS create→redirect→return→capture 链：单点是 PayPal 跳转可达性 + return token 参数名 → 已标 inspect/probe + 回退方案。
- single_use_token 单次性：API flow create 消费 token、capture 用 order id，不重复用 token，安全。
- return GET 刷新重 capture：D1 选 B，已知并接受。

**并行化**：顺序实现，无并行机会（4 个新文件强依赖：route→ejs→js→QA 链式）。

**VERDICT: ENG CLEARED — ready to implement（待切换非 Opus 模型写代码）。**
