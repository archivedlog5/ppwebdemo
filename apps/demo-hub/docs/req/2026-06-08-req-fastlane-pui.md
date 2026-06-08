# 需求 — Fastlane Payment UI (fastlane-pui) · JSSDK v5

> 日期：2026-06-08
> 产品：`paypal / jssdk-v5 / fastlane-pui`
> 来源：用户需求 + PayPal 官方 Fastlane 集成文档（Quick Start 部分）
> 状态：已实现（2026-06-08，代码完成；QA 待用户在浏览器验收）

---

## 1. 背景

Fastlane by PayPal 是面向**访客结账（guest checkout）**的加速方案：买家输入 email 后，
PayPal 识别是否为 Fastlane 会员；会员通过 OTP 认证后一键带出已保存的卡 + 收货地址，
访客则填卡完成支付并可选择加入 Fastlane。目标是把卡支付转化率提升到接近一键支付。

Fastlane 提供**两个集成形态**：

| 形态 | 组件 | 说明 |
|------|------|------|
| **Quick Start（本期）** | `FastlanePaymentComponent` | 预制支付 UI，自动渲染选卡/换卡/加卡 + 账单地址，集成量最小，PCI DSS 合规 |
| Flexible（未来） | `FastlaneCardComponent` + watermark | 自建结账表单，单独使用卡组件 |

**本需求只覆盖 Quick Start（Payment UI component）。**

---

## 2. 目标

在 demo-hub 中新增一个 JSSDK v5 的 Fastlane Quick Start 演示，向开发者展示：

1. 如何用服务端 client token（`intent=sdk_init`）初始化 Fastlane。
2. 完整的 Fastlane Quick Start 结账流程：email → 识别/认证 → 收货地址 → 支付组件 → 下单。
3. 会员（member）、访客（guest）、PayPal 会员三种买家路径的差异。
4. 后端如何用 `single_use_token` 调 Orders v2 创建并完成订单。

## 3. 成功标准（可验证）

- [ ] 访问 `/paypal/jssdk-v5/fastlane-pui` 渲染三段式结账表单（Customer / Shipping / Payment **始终可见**，初始 Shipping 和 Payment 为 locked 态）；Shipping 内 "This purchase requires shipping" 复选框控制地址字段显隐（勾选 → 展开并强制填写；取消 → 收起直接 Continue）。
- [ ] 页面 SDK 脚本带有效的 `data-sdk-client-token`，Fastlane 组件成功初始化（无 "no Fastlane module" 报错）。
- [ ] email 旁正确渲染 "Powered by Fastlane" watermark。
- [ ] **访客路径**：新 email → 填收货地址 → Fastlane 支付组件渲染卡输入 → 用测试卡完成 → 扣款 `COMPLETED`。
- [ ] **会员路径**：已注册 Fastlane email → OTP 输 `111111` 认证成功 → Shipping section 自动显示会员地址摘要（变 visited 态，Edit 按钮触发 `showShippingAddressSelector`）→ Payment section 变 active → 扣款 `COMPLETED`。
- [ ] 后端 create-order 使用 `payment_source.card.single_use_token`，返回的 order 中
      `purchase_units[0].payments.captures[0].status === 'COMPLETED'` 判定成功（CLAUDE 规则 13）；
      成功提示格式 `✓ COMPLETED · Capture ID: <id>`；成功后 Checkout 按钮永久 disabled。
- [ ] 控制台按 inspect/probe 规则打印每个 Fastlane 返回对象，便于核对字段。
- [ ] 首页 Supabase 配置生效后出现 fastlane-pui 卡片。

## 4. 范围

### 4.1 本期范围（In Scope）
- Fastlane Quick Start（`FastlanePaymentComponent`）单一支付方式。
- US 账户（复用 `PAYPAL_US_*`），币种锁定 **USD**，intent 锁定 **CAPTURE**。
- 金额可调（沿用 demo-hub 标准金额输入），币种不可切换。
- 三种买家路径：guest / Fastlane member / PayPal member（PayPal member 由 SDK 内部处理，无需额外代码）。

### 4.2 非本期范围（Out of Scope，转 todo）
- **Fastlane + PayPal / Venmo / PayLater 多 funding**（Buttons 组件并存）——用户给的 demo code 含此部分，留作后续独立迭代。
- **Flexible 集成**（`FastlaneCardComponent` 单独使用）——可能的未来产品 `fastlane-flex`。
- Vaulting（`store_in_vault` / vault without transaction）。
- AUTHORIZE intent 流程。
- 多币种 / 非 US 买家。

## 5. 关键约束与决策（用户已确认）

| 项 | 决策 |
|----|------|
| 支付范围 | 纯 Fastlane Quick Start；多 funding 留 todo |
| PayPal 账户 | US 账户，复用 `PAYPAL_US_CLIENT_ID/SECRET/MERCHANT_DOMAINS`（demo code 里的 `US_FL_*` 仅为举例，不采用） |
| 后端流程 | 只需 create-order；`payment_source: { card: { single_use_token: paymentToken.id } }` |
| intent | 仅 CAPTURE |
| 币种 | 锁定 USD（Fastlane 仅限 US） |
| client token | `intent=sdk_init` + `response_type=client_token` + `domains[]` |

## 6. 测试账号 / 数据

- 测试卡（任选）：Visa `4005 5192 0000 0004`、`4012 0000 3333 0026`、MC `5555 5555 5555 4444`。
- OTP：`111111` = 认证成功；其他 6 位 = 失败（回落访客流程）。
- 访客转会员：用全新 email + opt-in 打开 + 有效手机号（区号/前缀有效，勿用 111-111-1111），
  完成交易后即创建 Fastlane profile，可用于后续会员测试。沙盒不真实发短信。

## 7. 风险 / 待确认

- **自动扣款不确定性**：`single_use_token` + intent CAPTURE 时，create-order 响应**预期**直接带 `captures`。
  若沙盒返回 `CREATED`/`APPROVED`（未自动 capture），需补一个 capture 调用。开发/QA 阶段验证，记入 debug-log。
- **components 参数**：本期用 `components=fastlane`；若 Fastlane 初始化失败再加 `buttons`。
- Fastlane 要求 US 账户已开通 ACDC 且在 PayPal 后台配置了域名白名单（`PAYPAL_US_MERCHANT_DOMAINS` 对应的根域名）。

## 8. 参考

- 官方文档：https://developer.paypal.com/studio/checkout/fastlane/integrate
- 官方 sample：https://github.com/paypaldevso/Fastlane
- 设计文档（前端）：`docs/design/2026-06-08-design-fe-fastlane-pui.md`
- 设计文档（后端 + DB）：`docs/design/2026-06-08-design-be-fastlane-pui.md`
- 实现计划：`docs/plans/2026-06-08-plan-fastlane-pui-v1.md`
