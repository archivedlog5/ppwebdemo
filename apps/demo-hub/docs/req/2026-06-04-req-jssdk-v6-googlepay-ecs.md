# 需求 — JSSDK v6 Google Pay ECS

> 日期：2026-06-04 · 关联：design-fe / design-be / plan（同日 `*-jssdk-v6-googlepay-ecs.md`）
>
> ⚠️ 当前 Opus 模型下只能产出 markdown 文档。实际写代码需切换到非 Opus 模型（如 Sonnet）。

## 1. 背景

demo-hub 已完成 v6 系列大部分产品（paypal/paylater/venmo/bcdc/acdc/applepay-ecm/applepay-ecs/googlepay-ecm）。本需求新增 **JSSDK v6 Google Pay ECS**（Express Checkout Shortcut），路由 `/paypal/jssdk-v6/googlepay-ecs`。

ECS 与已完成的 ECM 的关键区别：买家在 **Google Pay sheet 内**选择收货地址、邮箱、电话、以及**运费方式**（Standard / Express），sheet 内总价随运费方式实时变化。订单在买家授权后（用 sheet 内选择的地址/运费）才创建。

## 2. 目标用户

技术开发者（主）。展示 PayPal v6 SDK 集成 Google Pay 的 ECS 流程，与 v5 googlepay-ecs 形成 v5↔v6 对照。

## 3. 功能需求

| # | 需求 | 验收 |
|---|------|------|
| R1 | UI 完全参考 v5 googlepay-ecs | 页面结构、文案、"Buyer selects in sheet" 说明块、官方按钮 + 客制按钮布局与 v5 一致 |
| R2 | create-order 参数与 v5 googlepay-ecs **逐字一致** | breakdown 含 item_total + shipping；payment_source.google_pay 含 name/email_address/phone_number（country_code+national_number）；shipping 地址来自 sheet |
| R3 | 官方 Google Pay 按钮（`PaymentsClient.createButton`） | Chrome + 沙盒 Google 账号下可拉起 sheet 并完成付款 |
| R4 | 客制化按钮（`#custom-googlepay-btn`） | 与官方按钮**同一点击 handler**，功能等价 |
| R5 | Google Pay 相关 JS 函数模仿 v5 googlepay-ecs | `onPaymentDataChanged` / `onPaymentAuthorized` / `parsePhoneNumber` / `getGooglePaymentDataRequest` 等骨架对照 v5，仅替换为 v6 SDK API 形态 |
| R6 | sheet 内运费方式选择 + 实时改价 | 选 Standard/Express 时 sheet 总价 = item + 对应运费；create-order 用最终选中的运费 |
| R7 | 三层资格检查（Google SDK / 账号 / 设备） | 任一层失败显示对应文案，不抛未捕获异常 |
| R8 | 成功判断只认 capture COMPLETED | 规则 13：`purchase_units[0].payments.captures[0].status === 'COMPLETED'` |
| R9 | 用户取消 sheet 静默处理 | `statusCode === 'CANCELED'` 不显示错误 |
| R10 | 3DS（SCA_ALWAYS）沿用 ECM 处理 | `#demo-sca` 下拉框 disabled + 黄色 warning 横条；frictionless（SCA_WHEN_REQUIRED）为支持路径 |

## 4. 非功能需求 / 约束

- **架构**：Full Callback 模式（`paymentDataCallbacks: { onPaymentAuthorized, onPaymentDataChanged }`，`callbackIntents: ['SHIPPING_ADDRESS','SHIPPING_OPTION','PAYMENT_AUTHORIZATION']`）。这是 ECS 的硬约束——`onPaymentDataChanged` 仅在 callback 模式触发，缺少它无法在 sheet 内选运费并改价。
- **凭证**：CN 账号（`getCNToken()` / `PAYPAL_CN_CLIENT_ID`），与 v5/ECM 一致。
- **REST API**：继续用 `/v2/checkout/orders`，与 v5 完全相同（v5↔v6 差异只在前端 SDK）。
- **v6 约定**：`orderId` 全链路小写 d（规则 V6-1）；EJS 不传 sdkUrl（V6-5）；脚本四段式加载顺序（V6-GOOGLEPAY-8 同款）。
- **inspect/probe**：每个 v6 返回对象先 `inspect()` 探查后再定逻辑（用户标准要求）。

## 5. 已知风险（需在实现阶段验证）

> **R-RISK-1（gating）**：callback 模式下 `confirmOrder` 在 **sheet 仍打开**时调用。ECM 实测（规则 V6-GOOGLEPAY-7 第 3 点）：callback 模式 confirmOrder 内部的 `POST .../graphql?ApproveGooglePayPayment` 曾被 `ERR_CONNECTION_RESET`（CN 直连 sandbox.paypal.com 网络问题）打断。
>
> ECS 必须用 callback 模式，无法回退到 Promise 模式（否则丢失 sheet 内运费选择）。因此**实现阶段第一优先验证**：frictionless（SCA_WHEN_REQUIRED）下 callback 模式 confirmOrder 是否能完成。
> - 若能完成 → ECS 正常 ship。
> - 若 frictionless 也被 ERR_CONNECTION_RESET 打断 → 记入 `docs/debug-log.md` 作为已知 v6 限制，页面加说明横条（类比 ECM 的 3DS 限制处理）。

## 6. 范围外（Out of Scope）

- 真实生产环境（仅 sandbox + TEST 环境）。
- 3DS（SCA_ALWAYS）完成路径——沿用 ECM，标注为暂不支持。
- 多 Google Pay 钱包卡管理、地址簿等高级特性。

## 7. 成功标准（Definition of Done）

1. 首页 v6 分组出现 Google Pay ECS 卡片，点击进入页面正常渲染。
2. Chrome + 沙盒 Google 账号 + 钱包测试卡：官方按钮和客制按钮都能拉起 sheet，sheet 内可选地址/运费方式并见总价实时变化，frictionless 路径完成付款显示 `✓ Payment captured · Order: ...`（或按 R-RISK-1 记录限制）。
3. create-order body 结构与 v5 googlepay-ecs 逐字一致（curl + console 核对）。
4. 各 v6 对象 `inspect()` 输出可见，API 形态结论记入 debug-log。
