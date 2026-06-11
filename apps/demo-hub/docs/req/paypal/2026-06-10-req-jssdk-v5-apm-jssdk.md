# 需求 — APM iDEAL (apm-jssdk) · JSSDK v5

> 日期：2026-06-10
> 产品：`paypal / jssdk-v5 / apm-jssdk`
> 来源：用户需求 + PayPal 官方「Accept iDEAL payments」「Integrate iDEAL using the JavaScript SDK」文档
> 状态：设计中（Opus 只写文档；代码留给非 Opus 模型实现）

---

## 1. 背景

APM（Alternative Payment Methods，替代支付方式）是 PayPal 在 PayPal 钱包/卡之外提供的本地化支付方式。
iDEAL 是**荷兰**最主流的银行转账支付：买家在结账时选择自己的开户行，被**重定向**到银行平台完成授权后返回商户站点。

APM 有两种集成路径：

1. **JSSDK + Orders v2 API**（本 demo 采用）——PayPal 托管的 UI 组件（Marks / Buttons）渲染支付入口，
   配合服务端 Orders v2 建单 / 扣款。
2. **纯 Orders v2 API**（不在本 demo 范围）——完全自定义 UI，单次调用 + `processing_instruction`。

### iDEAL 关键事实（官方文档）

| 项 | 值 |
|----|----|
| 国家 | 荷兰（NL） |
| 货币 | EUR（建单必须 EUR） |
| 支付类型 | 银行重定向（bank redirect） |
| 最小金额 | 0.01 EUR |
| intent | 仅支持 **CAPTURE**（不支持 authorize） |
| 退款 | 180 天内 |
| 不支持 | billing agreements、multiple seller payments、shipping callbacks、chargebacks |
| 商户资格 | 全球可用，**仅排除 RU / JP / BR** → 中国商户可用 ✓ |

### 核心流程（JSSDK Buttons 重定向流）

1. 商户页面渲染 iDEAL **Mark**（品牌标记）+ iDEAL **Button**。
2. 买家点击 Button → `createOrder` 调服务端 Orders v2 建单（`payment_source.ideal`）。
3. SDK 把买家**重定向到所选银行**授权。
4. 买家授权完成 → 返回商户站点 → SDK 触发 `onApprove`。
5. `onApprove` 调服务端 **capture**（手动扣款）→ 按规则 13 判 `COMPLETED`。

> 与「纯 Orders API 单次流」不同：本 demo **不设** `processing_instruction:
> ORDER_COMPLETE_ON_PAYMENT_APPROVAL`，因为我们要在 `onApprove` 里**手动 capture**；
> 若设了该字段订单会在审批时自动完成，手动 capture 会失败。

---

## 2. 目标

在 demo-hub 新增 JSSDK v5 的 APM (iDEAL) 演示，向开发者展示：

1. 如何用 **JSSDK Marks + Buttons**（`fundingSource: paypal.FUNDING.IDEAL`）渲染 APM 支付入口。
2. 如何用 **ECM 风格建单参数**（参考 `spb-ecm.js` 的 `buildBody`）+ **替换 `payment_source`** 为
   `payment_source.ideal`（含 `country_code: NL` / `name` / `experience_context`）+ **荷兰收货地址**
   组装 Orders v2 create-order 请求。
3. 重定向 APM 的完整回流：买家在银行授权 → 返回 → `onApprove` → 手动 capture。
4. **中国商户**通过 `getCNToken()` / `PAYPAL_CN_CLIENT_ID` 处理 iDEAL。

---

## 3. 成功标准（可验证）

- [ ] 访问 `/paypal/jssdk-v5/apm-jssdk` 渲染 sandbox 页面（iDEAL 说明条 / 锁定 EUR / Amount 输入 /
      `#ideal-mark` + `#ideal-btn` / 结果区）。
- [ ] 页面**显著标注**「iDEAL — 荷兰 · EUR · 银行重定向 · 中国商户」。
- [ ] SDK URL 含 `components=buttons,marks`、`enable-funding=ideal`、`currency=EUR`。
- [ ] create-order 请求体含：
      - `payment_source.ideal`（`country_code:"NL"` + `name` + `experience_context.return_url`/`cancel_url`）；
      - `purchase_units[0].amount.currency_code === "EUR"`；
      - `purchase_units[0].shipping` 为**荷兰地址**（`country_code:"NL"`）；
      - **不含** `processing_instruction`。
- [ ] 点击 iDEAL Button → 重定向到 sandbox 银行页 → 授权 → 返回触发 `onApprove`。
- [ ] capture 后按**规则 13** 判定：仅 `captures[0].status === 'COMPLETED'` 显示成功；
      其余（含 `PENDING`）显示错误。
- [ ] 控制台按 inspect/probe 打印 create-order 与 capture 完整响应。

---

## 4. 范围

### 包含
- 单一 funding source：**iDEAL**。
- 前端形态：**Mark + Button**（不含 PaymentFields；姓名用固定 sandbox 常量）。
- 货币：**锁定 EUR**（不渲染货币选择器）。
- 商户：**中国商户**（`getCNToken`）。
- 金额可调（沿用 `validateAmount`，EUR 两位小数）。

### 不包含
- PaymentFields（收集 first/last name）组件。
- 多 APM 切换 / funding source 选择器（仅 iDEAL）。
- 多页 checkout flow（multi-page）。
- Webhook 处理（文档建议订阅 `CHECKOUT.ORDER.APPROVED` 等，但本 demo 聚焦前后端建单 + capture）。
- 纯 Orders API（无 JSSDK）集成。
- 退款 / chargeback / billing agreement。
- 独立 return 页面（SDK 托管返回；若 sandbox 实测需要再议，见 inspect/probe）。

---

## 5. 关键决策

| # | 决策 | 理由 |
|---|------|------|
| 1 | 自定义路由（非工厂） | 工厂默认货币 USD + 渲染货币选择器；本 demo 锁 EUR、无选择器、自定义 `payment_source.ideal`。参考 `contact-module` 自定义路由做法。 |
| 2 | Mark + Button（无 Fields） | 用户选定。展示 APM Mark 标记 + 重定向 Button，姓名用固定常量，复杂度适中。 |
| 3 | 仅 iDEAL（NL/EUR） | 用户选定。`product_key='apm-jssdk'` 通用名，但首版只做 iDEAL，不引入 APM 配置表。 |
| 4 | 严格规则 13（仅 COMPLETED） | 用户选定。PENDING 也按错误提示。最贴合 CLAUDE.md 规则 13。 |
| 5 | 中国商户 | 用户选定。`getCNToken` + `PAYPAL_CN_CLIENT_ID`。 |
| 6 | 不设 `processing_instruction` | JSSDK 流要在 `onApprove` 手动 capture；自动完成会与手动 capture 冲突。 |
| 7 | `NL_SHIPPING` 入 `constants.js` | 与 `SANDBOX_SHIPPING`/`VENMO_SHIPPING` 一致，作为共享常量。 |
| 8 | create-order 必传 `PayPal-Request-Id` header | PayPal Orders v2 规则：请求体含 `payment_source` 时强制要求此 header，否则 422 `PAYPAL_REQUEST_ID_REQUIRED`。用 `randomUUID()` 生成，通过 `getHeaders(token, extra)` 传入。 |

---

## 6. inspect/probe 待核实项

> 遵循 [[feedback_v6_inspect_probe]]：新集成需逐一核对返回对象后再定稿。

- [ ] create-order 同时含 `payment_source.ideal` 与 Button `fundingSource: IDEAL` 是否冲突（重定向是否正常）。
- [ ] `ideal.experience_context` 是否接受 `brand_name` / `locale`。
- [ ] iDEAL 是否真正使用 `purchase_units[0].shipping`（文档称 shipping callbacks 不支持）。
- [ ] sandbox iDEAL 是否自动回流到 `onApprove`，还是需要独立 return 页面。
- [ ] capture 响应 `captures[0].status` 在 sandbox 的真实取值（COMPLETED vs PENDING）。

---

## 7. 参考

- 用户提供的官方文档：「Accept iDEAL payments」「Integrate iDEAL using the JavaScript SDK」。
- PayPal Orders v2 — Create order（`payment_source.ideal` 结构来源）。
- 代码参考：`spb-ecm.js`（ECM `buildBody`）、`contact-module.js`（自定义路由 + EUR/USD 锁定 + inspect/probe 日志）。
- 官方示例仓库：`paypal-examples/ideal-paypal-payment-js-sdk`。
