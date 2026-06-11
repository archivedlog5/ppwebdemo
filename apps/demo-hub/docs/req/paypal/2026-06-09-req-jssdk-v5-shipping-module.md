# 需求 — Shipping Module (shipping-module) · JSSDK v5

> 日期：2026-06-09
> 产品：`paypal / jssdk-v5 / shipping-module`
> 来源：用户需求 + PayPal 官方 Shipping module 集成文档（server-side callbacks 部分）
> 状态：设计中（Opus 只写文档；代码留给非 Opus 模型实现）

---

## 1. 背景

Shipping module 在 **Pay with PayPal / Pay with Venmo** 的 review 页向买家展示收货地址与运送选项。
买家在 review 页选地址 / 选运送方式时，PayPal **服务器到服务器**调用商户的 `callback_url`，
商户实时返回运送选项 + 重算后的金额（税、运费），review 页随之刷新。

文档同时支持 server-side 与 client-side 回调，但**明确推荐 server-side**（client-side 与 Venmo 不兼容、
部分场景不可用）。本需求按文档推荐**只做 server-side callbacks**。

### 核心机制（文档 §How it works）

1. 买家点 PayPal 按钮 → 商户 Create Order（带 `order_update_callback_config`）。
2. 买家进入 flow，到 review 页 → PayPal 用默认地址向 `callback_url` 发**首次回调**。
3. 商户处理回调，返回该地址的运送选项 + 更新后的金额。
4. review 页刷新；买家改地址 / 改选项 → 再次回调 → 再次刷新。
5. 买家点 pay → 商户 capture 完成交易。

---

## 2. 目标

在 demo-hub 新增 JSSDK v5 的 Shipping module 演示，向开发者展示：

1. 如何在 Create Order 的 `payment_source.paypal.experience_context.order_update_callback_config`
   中**启用 server-side 回调**（`callback_events` + `callback_url`）。
2. `callback_url` 如何**无状态**地携带购物车信息（文档建议把 cart 标识内嵌到回调 URL）。
3. 回调端点如何按买家地址**返回运送选项 + 重算金额**（item_total / tax_total / shipping），
   并满足文档要求的**金额内部一致性**约束。
4. 如何用 **HTTP 422** 拒绝回调（`COUNTRY_ERROR` / `ZIP_ERROR` / `METHOD_UNAVAILABLE` 等）。
5. `callback_events` 订阅 `SHIPPING_ADDRESS`（推荐）vs `SHIPPING_ADDRESS + SHIPPING_OPTIONS`
   两种模式的行为差异。

## 3. 成功标准（可验证）

**本地（无公网回调，仅验证代码）：**

- [ ] 访问 `/paypal/jssdk-v5/shipping-module` 渲染 sandbox 页面（Merchant 切换 / Currency / Amount /
      callback_events 开关 / Simulate decline 下拉 / PayPal 按钮）。
- [ ] CN/US 切换：reload `?merchant=us` 后 SDK URL 使用对应 client-id。
- [ ] create-order 返回 order id；请求体含 `order_update_callback_config`，`callback_url` 指向
      `${PUBLIC_BASE_URL}/paypal/jssdk-v5/api/shipping-module/callback?...`（内嵌 item_total/currency/decline）。
- [ ] `curl` 直打 callback 端点：
  - 模拟 **SHIPPING_ADDRESS 首次回调**（无 shipping_option）→ 返回 200 + 三个运送选项（Free 默认 selected）
    + breakdown（item_total / tax_total / shipping=0）+ `value = item_total + tax`。
  - 模拟 **SHIPPING_OPTIONS 回调**（带 shipping_option.id=2）→ 返回 200 + 该选项 selected + `value` 含 $7 运费。
  - `decline=COUNTRY_ERROR` → 返回 **422** `{ name:'UNPROCESSABLE_ENTITY', details:[{issue:'COUNTRY_ERROR'}] }`。
- [ ] 回调响应顶层 `id` 用**回调请求体里的 `id`（order id）**。
- [ ] 控制台按 inspect/probe 打印回调入参与出参。

**服务器（用户部署到 `demo.cwen5.com` 后，真实端到端）：**

- [ ] 点 PayPal 按钮进 review 页 → 出现三个运送选项 + 税/运费金额。
- [ ] 切换运送选项 → 金额动态更新（订阅 SHIPPING_OPTIONS 时）。
- [ ] 选 decline 模式 → review 页报对应错误（地址/选项不可用）。
- [ ] 点 pay → capture `COMPLETED`，最终金额含所选运费。

## 4. 范围

### 4.1 本期范围（In Scope）

- **server-side callbacks**（`order_update_callback_config`）。
- payment_source：**仅 `paypal`**。
- 商户：**CN / US 切换**（页面下拉，默认 CN），复用 `PAYPAL_CN_*` / `PAYPAL_US_*`。
- `callback_events`：**UI 开关**在 `[SHIPPING_ADDRESS]` 与 `[SHIPPING_ADDRESS, SHIPPING_OPTIONS]` 间切换。
- **拒绝场景**：Simulate decline 下拉（none / COUNTRY_ERROR / ZIP_ERROR / STATE_ERROR / ADDRESS_ERROR /
  METHOD_UNAVAILABLE / STORE_UNAVAILABLE）。
- 金额可调、币种可切（沿用 demo-hub 标准输入）；intent 锁 CAPTURE。
- demo 运送选项（文档示例）：Free Shipping $0 / USPS Priority $7 / 1-Day Shipping $10；税率固定 **5%**。

### 4.2 非本期范围（Out of Scope，转 todo）

- **Venmo**（payment_source.venmo）—— 需 US 账户 + buyer-country=US，留 todo。
- **client-side 回调**（`onShippingAddressChange` / `onShippingOptionsChange`）—— 文档不推荐，且与 Venmo 不兼容，不做。
- **真实购物车 / 多行 item / 真实税费引擎** —— demo 用固定单 item + 固定税率。
- `SET_PROVIDED_ADDRESS` / `NO_SHIPPING` 偏好演示 —— 本期固定 `GET_FROM_FILE`（回调前提）。
- 本地 ngrok 隧道 —— 用户明确：本地只写代码，真实回调在服务器测。

## 5. 关键约束与决策（用户已确认）

| 项 | 决策 |
|----|------|
| 回调方式 | **server-side callbacks**（文档推荐） |
| 本地回调可达性 | **构建端点但本地不触发**；`callback_url` 指向 `PUBLIC_BASE_URL`，真实回调在服务器测 |
| `PUBLIC_BASE_URL` | `demo.cwen5.com`（占位，部署用） |
| payment_source | 仅 `paypal`（Venmo 留 todo） |
| 商户账户 | **CN / US 切换**，默认 CN |
| callback_events | **UI 开关**：SHIPPING_ADDRESS 单订 ↔ 两个都订 |
| 拒绝场景 | **Simulate decline 下拉**，回调按选择返回 422 |
| 回调无状态化 | **cart 信息内嵌 callback_url query**（item_total / currency / decline），不用内存 Map |
| 响应顶层 `id` | **order id**（直接用回调请求体里的 `id`）。先这么做，看是否有问题 |
| shipping_preference | 固定 `GET_FROM_FILE`（回调触发前提） |
| user_action | `PAY_NOW`（文档示例） |
| 税率 | 固定 5%（demo） |
| 运送选项 | Free $0（默认）/ USPS Priority $7 / 1-Day $10（文档示例） |
| intent | 仅 CAPTURE |

## 6. 测试数据 / 方式

- **本地**：用 `curl` / Postman 按文档 §callback 样例 POST 到 callback 端点（构造 shipping_address +
  可选 shipping_option），核对返回 JSON 与 422。
- **服务器**：CN sandbox 个人买家账号（钱包内有美国地址）→ review 页交互。
- 金额一致性自检（文档 §Merchant success response）：
  - `breakdown.shipping.value` == selected 选项 `amount.value`
  - `amount.value` == item_total + tax_total + shipping
  - 所有 `currency_code` 一致；零小数币种金额取整。

## 7. 风险 / 待确认（inspect/probe）

> 遵循 [[feedback_v6_inspect_probe]]：定稿逻辑前在服务器控制台打印真实回调对象核对字段。

- **回调请求真实结构**：文档样例字段（`id` / `shipping_address` / `shipping_option` / `purchase_units`）
  需在服务器实测打印核对（首次回调确认**无** `shipping_option` 段）。
- **callback_url query 是否原样回传**：文档称 cart 标识可内嵌 URL；需实测确认 PayPal POST 时保留 query。
- **CN 商户是否支持 shipping module 回调**：用户 #5 —— 先 CN 试，无效切 US；切换能力已内建，QA 时确认。
- **响应顶层 `id` 用 order id 是否有问题**：文档示例为商户 ID，但本期先用回调请求体的 `id`（order id）；
  若 PayPal 校验失败再改回商户 ID（加 env）。服务器实测确认。
- **金额一致性被拒**：不满足 §6 约束时 PayPal 可能拒绝响应 → 实测打印调整。

## 8. 参考

- 官方文档：https://developer.paypal.com/docs/checkout/standard/customize/shipping-module/
- 用户提供原文：`src/public/js/paypal/jssdk-v5/prompts/shippingmodulesprompts`
- 设计文档（前端）：`docs/design/2026-06-09-design-fe-jssdk-v5-shipping-module.md`
- 设计文档（后端 + DB）：`docs/design/2026-06-09-design-be-jssdk-v5-shipping-module.md`
- 实现计划：`docs/plans/2026-06-09-plan-jssdk-v5-shipping-module-v1.md`
- 参考实现（ECS 建单参数）：`src/routes/paypal/jssdk-v5/spb-ecs.js`
- 参考实现（运送选项思路）：`src/routes/paypal/jssdk-v5/googlepay-ecs.js`
