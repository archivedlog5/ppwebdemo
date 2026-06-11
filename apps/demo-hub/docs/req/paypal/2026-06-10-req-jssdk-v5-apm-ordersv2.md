# 需求 — APM Bancontact (apm-ordersv2) · JSSDK v5

> 日期：2026-06-10
> 状态：需求确认（Opus 只写文档；代码须切换非 Opus 模型实现）
> 关联设计：`docs/design/2026-06-10-design-be-jssdk-v5-apm-ordersv2.md` · `docs/design/2026-06-10-design-fe-jssdk-v5-apm-ordersv2.md`
> 关联计划：`docs/plans/2026-06-10-plan-jssdk-v5-apm-ordersv2-v1.md`
> 姊妹 demo：`apm-jssdk`（iDEAL，JSSDK + Orders v2）

---

## 1. 背景

APM（Alternative Payment Methods）可用两种方式集成：

1. **JSSDK + Orders v2 API** —— PayPal 托管 UI（Marks / PaymentFields / Buttons），SDK 处理重定向。已有 demo `apm-jssdk`（iDEAL）。
2. **单独 Orders v2 API** —— 不加载 JSSDK，商户自建按钮，直接调 Orders v2 建单，手动重定向到 `payer-action`，买家返回 `return_url`。

**本 demo 只用第 2 种（纯 Orders v2 API）**，演示 **Bancontact**（比利时 · EUR · 银行重定向 · 中国商户）。

这是本仓库**第一个纯 API（无 JSSDK）的支付页面**，因此引入两个新模式：
- 前端无 SDK 脚本，自建按钮 + `window.location` 手动重定向。
- 独立 **return 页面**（买家从银行返回的落地页）。

---

## 2. Bancontact 关键事实（来自集成文档）

| 项 | 值 |
|---|---|
| 国家 | 比利时（BE） |
| 货币 | EUR（仅） |
| 支付类型 | bank redirect（银行重定向） |
| 最小金额 | 1 EUR |
| 退款 | 180 天内 |
| intent | **必须 CAPTURE**（不支持 authorization） |
| processing_instruction | **`ORDER_COMPLETE_ON_PAYMENT_APPROVAL`**（买家批准后自动捕获） |
| 资格 | 全球商户可用（仅排除 RU/JP/BR）→ 中国商户可处理 |
| 不支持 | billing agreements / multiple seller payments / shipping callbacks / chargebacks |

> **不需要手动 capture**：文档明确「When processing Bancontact payments, you don't need to capture payment for the order.」自动捕获由 `processing_instruction` 触发。

---

## 3. 需求范围

### 3.1 必须做（In Scope）

- [ ] 新增路由 `/paypal/jssdk-v5/apm-ordersv2`，product_key = `apm-ordersv2`。
- [ ] **纯 Orders v2 API**：不加载 JSSDK（页面无 `<script src=".../sdk/js">`）。
- [ ] create-order 用 ECM 风格 body，`payment_source` 替换为 `payment_source.bancontact`：
  - `country_code: "BE"`、`name`
  - `experience_context`：`brand_name` + `shipping_preference: SET_PROVIDED_ADDRESS` + `return_url` + `cancel_url`（+ `locale` 试探）
- [ ] `processing_instruction: ORDER_COMPLETE_ON_PAYMENT_APPROVAL`（自动捕获）。
- [ ] `purchase_units[0].shipping` 用**比利时地址**（新常量 `BE_SHIPPING`）。
- [ ] 货币锁 **EUR**，金额可调（沿用 `validateAmount`）。
- [ ] **中国商户**：`getCNToken()` + `PAYPAL_CN_CLIENT_ID`。
- [ ] **PayPal-Request-Id header**（body 含 `payment_source` 时必须，否则 422）。
- [ ] 前端：自建「Pay with Bancontact」按钮 → POST create-order → `window.location.href = payerAction`（重定向到银行）。
- [ ] **return 页面**：买家返回后读 `?token=`（order id），GET order details，按**规则 13** 判 `captures[0].status === 'COMPLETED'`，渲染 success / cancelled / error 三态 + 订单 JSON。
- [ ] 首页出现「APM · Bancontact (Orders v2)」卡片（Supabase 配置）。
- [ ] 全程 inspect/probe 打印 create-order / order details 响应（[[feedback_v6_inspect_probe]]）。

### 3.2 不做（Out of Scope）

- JSSDK / PaymentFields / Marks / Buttons（已选纯 API；姊妹 demo `apm-jssdk` 覆盖 JSSDK 路线）。
- 手动 capture 端点（自动捕获）。
- Webhook 处理（`PAYMENT.CAPTURE.COMPLETED` / `DENIED` / `CHECKOUT.ORDER.DECLINED`）—— 用 GET order details 轮询替代（同 iDEAL demo）。
- 其他 APM（iDEAL/P24/BLIK 等）—— 本 demo 只做 Bancontact，硬编码 `payment_source.bancontact`。
- 货币选择器（EUR 锁定）。
- 预选银行 `bic`（让买家在重定向页选）。

---

## 4. 成功标准（可验证）

1. 访问 `/paypal/jssdk-v5/apm-ordersv2`：渲染 Bancontact 说明条（BE · EUR · 重定向 · 中国商户）+ EUR Amount 输入 + 「Pay with Bancontact」按钮 + 结果区；**页面源码无 PayPal SDK 脚本**。
2. 点按钮 → POST create-order 返回 `{ id, payerAction }`；请求体含 `payment_source.bancontact`（BE + name + experience_context.return_url/cancel_url）、`processing_instruction: ORDER_COMPLETE_ON_PAYMENT_APPROVAL`、`amount.currency_code === "EUR"`、`shipping` 为比利时地址。
3. 浏览器重定向到 Bancontact 银行页 → 授权 → 自动捕获 → 返回 `return_url?token=<orderID>`。
4. return 页 GET order details：`status === 'COMPLETED'` 且 `captures[0].status === 'COMPLETED'`（规则 13）→ 绿色成功态 + 订单 JSON；否则错误态。
5. 银行页取消 → 返回 `cancel_url`（`?status=cancel`）→ return 页显示 cancelled 态。
6. 金额非法 → 前端 `#amount-error` 红字，不发起重定向。
7. 服务端控制台 inspect/probe 打印完整 create-order + order details 响应。

---

## 5. 与 iDEAL demo（apm-jssdk）的核心差异

| 维度 | iDEAL（apm-jssdk） | Bancontact（apm-ordersv2） |
|---|---|---|
| 集成方式 | JSSDK Marks+Buttons + Orders v2 | **纯 Orders v2 API（无 JSSDK）** |
| 重定向 | SDK Button 内部处理（弹窗） | **前端 `window.location → payer-action`** |
| 捕获 | 手动（`onApprove` 调 capture） | **自动**（`ORDER_COMPLETE_ON_PAYMENT_APPROVAL`） |
| 返回处理 | 同页 `onApprove` 回调 | **独立 return 页面**（GET order details） |
| 端点数 | 3（GET + create + capture） | **3（GET + create + return），无 capture** |
| payment_source | `ideal` | `bancontact` |
| 国家 / 地址 | NL / `NL_SHIPPING` | BE / `BE_SHIPPING`（新增） |
| 相同点 | EUR 锁定、中国商户、PayPal-Request-Id 必传、规则 13、inspect/probe | 同 |

---

## 6. 已确认决策（AskUserQuestion · 2026-06-10）

| # | 决策 | 选择 |
|---|------|------|
| 1 | Capture 模型 | **自动捕获 + return 页只读**（`ORDER_COMPLETE_ON_PAYMENT_APPROVAL`，无 capture 端点，return 页 GET order details） |
| 2 | return 页拿 order id | **读 PayPal 回传的 `?token=`**（inspect/probe 核实） |
| 3 | 范围 | **只做 Bancontact**（硬编码 `payment_source.bancontact`，不抽象 method 参数） |
