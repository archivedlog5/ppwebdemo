# 需求 — Contact Module (contact-module) · JSSDK v5

> 日期：2026-06-10
> 产品：`paypal / jssdk-v5 / contact-module`
> 来源：用户需求 + PayPal 官方 Contact module 集成文档
> 状态：设计中（Opus 只写文档；代码留给非 Opus 模型实现）

---

## 1. 背景

Contact Module 让买家在 PayPal 结账时**查看并修改**与商户共享的 email 和电话号码，
特别适用于**礼品订单**——买家希望填写收件人（而非自己）的联系方式。

商户通过 `payment_source.paypal.experience_context.contact_preference` 控制买家能否看到/编辑
联系方式；联系方式本身通过 `purchase_units[].shipping.email_address` 与 `phone_number` 传递。
买家批准后，商户用 GET Orders API 取回**最新（可能被买家编辑过）**的联系方式。

### 三种 contact preference（文档 §Contact preferences）

| 值 | 行为 |
|----|------|
| `NO_CONTACT_INFO` | **默认**。买家结账时看不到任何联系方式。 |
| `UPDATE_CONTACT_INFO` | 买家可**查看并编辑** email 和电话。 |
| `RETAIN_CONTACT_INFO` | 买家可**查看但不能编辑**。 |

### 核心流程

1. 商户 Create Order：`experience_context.contact_preference` + `shipping.email_address`/`phone_number`。
2. 买家进入 PayPal flow：按 preference 看到/编辑联系方式（UPDATE 可改，RETAIN 只读，NO 不显示）。
3. 买家批准后，商户 **GET Order** 取回 `purchase_units[0].shipping` 中最新的 email/phone。
4. 商户 capture 完成交易。

---

## 2. 目标

在 demo-hub 新增 JSSDK v5 的 Contact Module 演示，向开发者展示：

1. 如何在 Create Order 的 `payment_source.paypal.experience_context.contact_preference`
   设置三种偏好之一（**UI 下拉切换**）。
2. 如何用 **ECS 建单参数**（merchant 预填，参考 `spb-ecs.js`）+ 文档要求的
   `shipping.email_address` / `phone_number` / `SET_PROVIDED_ADDRESS` 组装请求。
3. 买家批准后如何 **GET Order 取回最新联系方式**并展示（UPDATE 模式下可见买家编辑结果）。
4. Contact Module 当前**仅支持 US 商户**（UI 显著标注）。

## 3. 成功标准（可验证）

- [ ] 访问 `/paypal/jssdk-v5/contact-module` 渲染 sandbox 页面（US-only 提示条 / Contact preference
      下拉 / Amount / 显示将发送的固定联系方式 / PayPal 按钮 / 结果区）。
- [ ] 页面**显著标注**「Contact Module 现阶段仅支持美国商户」。
- [ ] create-order 请求体含
      `payment_source.paypal.experience_context.contact_preference`（= 下拉值）、
      `shipping_preference: SET_PROVIDED_ADDRESS`，以及
      `purchase_units[0].shipping.email_address` + `phone_number`（固定 sandbox 值）。
- [ ] 选 `UPDATE_CONTACT_INFO` → 在 PayPal 编辑联系方式 → 结果行显示**编辑后**的 email/phone（来自 GET Order）。
- [ ] 选 `RETAIN_CONTACT_INFO` / `NO_CONTACT_INFO` → 结果行显示商户传入的联系方式；capture 按规则 13 判 `COMPLETED`。
- [ ] 控制台按 inspect/probe 打印 GET Order 与 capture 完整响应。

## 4. 范围

### 4.1 本期范围（In Scope）

- payment_source：**仅 `paypal`**。
- 商户：**仅 US**（`getUSToken()`），无 CN/US 切换；UI 标注 US-only。
- contact_preference：**UI 下拉**在三种偏好间切换（默认 `UPDATE_CONTACT_INFO`，最具演示价值）。
- 联系方式：**固定 sandbox 值**（email + 完整电话），不提供页面编辑输入框。
- 取回最新联系方式：**Approach A** —— capture 端点内先 GET Order 读联系方式，再 capture，
  一并返回 `{ contact, capture }`（折叠为单端点，详见后端设计）。
- 货币：**锁定 USD**（US-only 模块，文档示例均 USD）；金额可调。
- intent：仅 `CAPTURE`。
- 结果展示：**仅最终联系方式**（不做 before/after 对比面板）。

### 4.2 非本期范围（Out of Scope，转 todo）

- **可编辑联系方式输入框** —— 本期用固定 sandbox 值；RETAIN 单字段 / 空值 fallback 等边界不演示。
- **before/after 对比面板**（merchant 传入 vs 买家返回）—— 本期仅展示最终值。
- **Venmo / card / 其他 payment_source**。
- **NO_CONTACT_INFO 的 omit 写法演示**（文档称省略字段等价 NO_CONTACT_INFO）—— 本期统一显式传值。
- **多币种 / CN 商户** —— 模块 US-only。

## 5. 关键约束与决策（用户已确认）

| 项 | 决策 |
|----|------|
| payment_source | 仅 `paypal` |
| 商户账户 | **仅 US**（`getUSToken()`），UI 标注 US-only |
| contact_preference | **UI 下拉**三选项，默认 `UPDATE_CONTACT_INFO` |
| 联系方式来源 | **固定 sandbox 值**（email + phone），不可页面编辑 |
| 取回最新联系方式 | **Approach A**：capture 端点内 GET Order → 读联系方式 → capture → 返回 `{contact,capture}` |
| 结果展示 | **仅最终联系方式**（email + phone + capture id） |
| shipping_preference | `SET_PROVIDED_ADDRESS`（商户传地址） |
| user_action | `PAY_NOW`（文档示例） |
| 货币 | **锁定 USD**；金额可调 |
| intent | 仅 CAPTURE |
| 建单参数模板 | ECS（`spb-ecs.js`）+ 文档 contact 字段 |

## 6. 测试数据 / 方式

- **商户**：US sandbox 商户（`PAYPAL_US_*`）。
- **买家**：US sandbox 个人买家账号（`buyer-country=US`）。
- 固定 sandbox 联系方式（路由内置 demo 常量）：
  - email：`buyer-contact@example.com`
  - phone：`{ country_code: "1", national_number: "5555555555" }`
- 流程：点 PayPal 按钮 → 按 preference 在 PayPal 看到/编辑联系方式 → 批准 →
  服务端 GET Order 取联系方式 → capture → 结果行展示最终 email/phone。
- 验证 UPDATE 模式：在 PayPal 把联系方式改成另一组 → 结果行须显示**改后**的值。

## 7. 风险 / 待确认（inspect/probe）

> 遵循 [[feedback_v6_inspect_probe]]：定稿逻辑前在控制台打印真实对象核对字段。

- **capture 响应是否已含 shipping 联系方式**：若 capture 响应本身就带
  `purchase_units[0].shipping.email_address`/`phone_number`，则可省去 GET Order 调用。
  Approach A 同时打印 GET Order 与 capture 两个响应，实测后决定是否精简。
- **NO_CONTACT_INFO 下 GET Order 返回值**：确认是否原样返回商户传入的联系方式。
- **RETAIN 下买家不可编辑**：确认 PayPal 端确实只读、返回值 == 商户传入。
- **US 商户必要性**：模块 US-only，确认 CN 商户不可用（本期不内建 CN 切换）。

## 8. 参考

- 官方文档：https://developer.paypal.com/docs/checkout/standard/customize/contact-module/
- 用户提供原文：`src/public/js/paypal/jssdk-v5/prompts/contactmodulesprompts`
- 设计文档（前端）：`docs/design/2026-06-10-design-fe-jssdk-v5-contact-module.md`
- 设计文档（后端 + DB）：`docs/design/2026-06-10-design-be-jssdk-v5-contact-module.md`
- 实现计划：`docs/plans/2026-06-10-plan-jssdk-v5-contact-module-v1.md`
- 参考实现（ECS 建单参数）：`src/routes/paypal/jssdk-v5/spb-ecs.js`
- 参考实现（自定义路由 + GET Order 读取思路）：`src/routes/paypal/jssdk-v5/shipping-module.js`
