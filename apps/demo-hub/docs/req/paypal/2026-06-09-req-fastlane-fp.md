# 需求 — Fastlane Flexible (fastlane-fp) · JSSDK v5

> 日期：2026-06-09
> 产品：`paypal / jssdk-v5 / fastlane-fp`
> 来源：用户需求 + PayPal 官方 Fastlane 集成文档（Flexible 部分）+ 用户提供的 Flexible demo code
> 状态：设计中（Opus 只写文档；代码留给非 Opus 模型实现）

---

## 1. 背景

Fastlane by PayPal 面向**访客结账（guest checkout）**：买家输入 email 后，PayPal 识别是否为
Fastlane 会员；会员通过 OTP 认证一键带出已保存的卡 + 收货地址，访客填卡完成支付并可选加入 Fastlane。

Fastlane 提供**两个集成形态**：

| 形态 | 组件 | 说明 |
|------|------|------|
| Quick Start（已实现 `fastlane-pui`） | `FastlanePaymentComponent` | 预制支付 UI，自动渲染选卡/换卡/加卡 + 账单地址，集成量最小 |
| **Flexible（本期 `fastlane-fp`）** | `FastlaneCardComponent` + `FastlaneWatermarkComponent` | **自建结账表单**，单独使用卡组件，自己渲染账单地址，可自行控制 3DS |

**本需求只覆盖 Flexible（`FastlaneCardComponent`）。**

### 与 `fastlane-pui` 的核心差异

| 维度 | fastlane-pui (Quick Start) | **fastlane-fp (Flexible，本期)** |
|------|----------------------------|----------------------------------|
| 卡组件 | `FastlanePaymentComponent`（卡 + 账单一体） | `FastlaneCardComponent`（仅卡） |
| 账单地址 | 组件内置 | **自建独立 Billing 表单**（核心差异） |
| 支付步骤 | 3 步（Customer / Shipping / Payment） | **4 步**（Customer / Shipping / **Billing** / Payment） |
| 3DS | 无 | **三套 flow**：None/When Required（直接下单）+ JSSDK（`ThreeDomainSecureClient`）+ API（`verification.method`，全页跳转） |
| 取 token | `paymentComponent.getPaymentToken()` | `cardComponent.getPaymentToken({ billingAddress })` |
| 成功判定 | create-order 直接 captures | JSSDK 同 pui；API 流多 `PAYER_ACTION_REQUIRED` → 跳转 → return 页 capture |

---

## 2. 目标

在 demo-hub 中新增 JSSDK v5 的 Fastlane **Flexible** 演示，向开发者展示：

1. 如何单独使用 `FastlaneCardComponent` + `FastlaneWatermarkComponent` 自建结账表单。
2. 如何自建独立的 **Billing 账单地址**表单，并在取 token 时传入（`getPaymentToken({ billingAddress })`）。
3. Flexible 形态下**自己控制 3DS**的三种方式（Payment 步内下拉切换）：
   - **None / When Required**：不做强制 3DS，直接下单，让 PayPal 按需决定；方便日常测试普通卡。
   - **JSSDK 3DS**：`ThreeDomainSecureClient.isEligible()` → `.show()`，客户端单页完成。
   - **API 3DS**：服务端创建订单返回 `PAYER_ACTION_REQUIRED`，**全页跳转**到 PayPal 3DS 页，完成后回 return 页服务端 capture。
4. 会员（member）、访客（guest）、PayPal 会员三种买家路径在 Flexible 下的差异。

## 3. 成功标准（可验证）

- [ ] 访问 `/paypal/jssdk-v5/fastlane-fp` 渲染**四段式**结账表单（Customer / Shipping / Billing / Payment，始终可见，沿用 pui 三态 CSS：active / visited / locked）。
- [ ] 页面 SDK 脚本带有效 `data-sdk-client-token`，`components=fastlane,three-domain-secure`，Fastlane 与 ThreeDomainSecureClient 均成功初始化。
- [ ] email 旁正确渲染 "Powered by Fastlane" watermark。
- [ ] **访客路径**：新 email → 填收货地址 → 填账单地址 → `FastlaneCardComponent` 渲染卡输入（prefill 电话/邮编/持卡人名）→ 选 3DS flow → 完成 → 扣款 `COMPLETED`。
- [ ] **会员路径（有存卡）**：已注册 email → OTP `111111` 认证成功 → Shipping 自动显示会员地址（visited，Edit 触发 `showShippingAddressSelector`）→ **Billing 隐藏**（账单取自卡 profile）→ Payment 显示存卡 + watermark，Payment 步同时处于 `fl-active + fl-visited`，**Edit 按钮可见**（触发 `showCardSelector` 换卡）→ 扣款 `COMPLETED`。
- [ ] **会员路径（无存卡）**：认证成功但无卡 → 走 Billing + 卡组件流程。
- [ ] **None / When Required**：选中 None flow → 直接 create-order（无任何 3DS 字段）→ PayPal 按需决定 → 成功内联 `COMPLETED`（普通测试卡首选路径）。
- [ ] **JSSDK 3DS**：选中 JSSDK flow，符合资格的测试卡触发 3DS 挑战 → 认证成功 → `paymentToken.id` 更新为 nonce → create-order 返回 captures → `COMPLETED`（单页，结果内联 #demo-result）。
- [ ] **API 3DS**：选中 API flow → create-order 返回 `PAYER_ACTION_REQUIRED` → 全页跳转 PayPal 3DS 页 → 完成 → 回 `GET /paypal/jssdk-v5/fastlane-fp/return?token=<id>` → **服务端 capture** → 结果页显示完整 order JSON + Capture ID + 返回 demo 链接；取消则显示取消提示。
- [ ] 后端 create-order 使用 `payment_source.card.single_use_token`；成功判定 `purchase_units[0].payments.captures[0].status === 'COMPLETED'`（CLAUDE 规则 13）。
- [ ] 控制台按 inspect/probe 规则打印每个 Fastlane / 3DS 返回对象，便于核对字段。
- [ ] 首页 Supabase 配置生效后出现 fastlane-fp 卡片。

## 4. 范围

### 4.1 本期范围（In Scope）
- Fastlane **Flexible**（`FastlaneCardComponent` + `FastlaneWatermarkComponent`）。
- 自建独立 **Billing 账单地址**表单。
- **两套 3DS flow**（JSSDK + API），由 Payment 步内下拉 `[ JSSDK | API ]` 切换。
- API 3DS：**独立 return 页面 + 服务端 capture**（用户已确认的 return 策略）。
- US 账户（复用 `PAYPAL_US_*`），币种锁定 **USD**，intent 锁定 **CAPTURE**。
- 金额可调（沿用 demo-hub 标准金额输入），币种不可切换。
- 三种买家路径：guest / Fastlane member（含有卡/无卡）/ PayPal member（SDK 内部处理）。

### 4.2 非本期范围（Out of Scope，转 todo）
- **多 funding 按钮**（PayPal / Venmo / PayLater 与 Fastlane 卡并存）——用户 demo code 含此部分，
  本期**不做**，留 todo（demo-hub 已有独立 buttons/venmo demo）。
- AUTHORIZE intent（demo 里的 `captureAuthorize` 端点不实现）。
- Vaulting（`store_in_vault` / vault without transaction）。
- 多币种 / 非 US 买家。
- "购买时是否需要收货"以外的复杂运费/运送选项。

## 5. 关键约束与决策（用户已确认）

| 项 | 决策 |
|----|------|
| 集成形态 | Fastlane **Flexible**（`FastlaneCardComponent`，非 `FastlanePaymentComponent`） |
| 账单地址 | **自建独立 Billing 步骤**；取 token 时 `getPaymentToken({ billingAddress })` |
| 3DS 范围 | **两套 flow 都做**（JSSDK + API） |
| API 3DS 返回策略 | **独立 return 页面**（`GET .../fastlane-fp/return`），**服务端 capture**，渲染结果页 |
| 多 funding | **不做**，留 todo |
| PayPal 账户 | US 账户，复用 `PAYPAL_US_CLIENT_ID/SECRET/MERCHANT_DOMAINS` |
| intent | 仅 CAPTURE |
| 币种 | 锁定 USD（Fastlane 仅限 US） |
| client token | `intent=sdk_init` + `response_type=client_token` + `domains[]`（复用 `getUSClientToken({ intent:'sdk_init' })`） |
| SDK components | `fastlane,three-domain-secure`（3DS 需要 `three-domain-secure`） |
| UI 风格 | 参考 `fastlane-pui` 三态 CSS（active / visited / locked），4 步 |

## 6. 测试账号 / 数据

- 普通测试卡（任选）：Visa `4005 5192 0000 0004`、`4012 0000 3333 0026`、MC `5555 5555 5555 4444`。
- 3DS 测试卡（来自用户 demo）：
  - JSSDK 3DS：`4000 0000 0000 2503`
  - API 3DS：`5329 8797 3531 6929`
- OTP：`111111` = 认证成功；其他 6 位 = 失败（回落访客流程）。
- 访客转会员：用全新 email + opt-in 打开 + 有效手机号（区号/前缀有效，勿用 111-111-1111），
  完成交易后即创建 Fastlane profile，可用于后续会员测试。沙盒不真实发短信。

## 7. 风险 / 待确认（inspect/probe）

> 遵循 [[feedback_v6_inspect_probe]]：新集成定稿逻辑前，先在控制台逐个打印返回对象核对真实字段。

- **API 3DS order body 字段位置**：`verification.method` 与 `experience_context`（return_url/cancel_url）在
  `payment_source.card` 下的确切路径，需在实现/QA 阶段打印 PayPal 响应核对（设计文档给出推断结构）。
- **return 页 query 参数**：✅ 实测确认：PayPal card 3DS 回调参数为 `state/code/liability_shift`，**不含 orderId**（与标准 PayPal Buttons 的 `?token=` 行为不同）。解决方案：create-order 前生成 `sessionKey`，嵌入 `return_url?session=<key>`，PayPal 原样回传；return handler 从内存 Map（`threeDSSessionStore`）反查 orderId，用后即删，10分钟自动过期。
- **API 3DS 是否需显式 capture**：`PAYER_ACTION_REQUIRED` 完成后，return 页推断需调
  `/v2/checkout/orders/{id}/capture`；若 PayPal 在 payer action 后已自动 capture，则 return 页改为 GET order 校验。实测确认。
- **JSSDK 3DS nonce 替换**：`threeDomainSecureResults.nonce` 替换 `paymentToken.id` 后，create-order
  是否直接返回 captures（同 pui），需实测确认。
- **ThreeDomainSecureClient 资格/结果字段**：`isEligible()` 入参、`show()` 返回的
  `authenticationState` / `liabilityShift` / `nonce` 字段名实测核对。
- Fastlane 要求 US 账户已开通 ACDC 且在 PayPal 后台配置域名白名单（`PAYPAL_US_MERCHANT_DOMAINS` 根域名）。

## 8. 参考

- 官方文档：https://developer.paypal.com/studio/checkout/fastlane/integrate （Flexible 部分）
- 官方 sample：https://github.com/paypaldevso/Fastlane
- 已实现 Quick Start：`docs/req/2026-06-08-req-fastlane-pui.md` 及其 fe/be 设计
- 设计文档（前端）：`docs/design/2026-06-09-design-fe-fastlane-fp.md`
- 设计文档（后端 + DB）：`docs/design/2026-06-09-design-be-fastlane-fp.md`
- 实现计划：`docs/plans/2026-06-09-plan-fastlane-fp-v1.md`
