# 后端设计 — JSSDK v6 Apple Pay ECS

> 日期：2026-06-02 · 关联：design-fe / plan（同日 `*-jssdk-v6-applepay-ecs.md`）
>
> ⚠️ 当前 Opus 模型下只能产出本设计（markdown）。实际写代码需切换到 Sonnet 等非 Opus 模型。

## 1. 目标

新增 `/paypal/jssdk-v6/applepay-ecs` 后端，能力等价 v5 applepay-ecs（ECS：买家在 Apple Pay sheet 内选配送地址 / 邮箱 / 电话 / 配送方式）。**create-order 请求 body 与 v5 applepay-ecs 逐字一致**；响应字段遵循 v6 约定（`orderId` 小写 d，规则 V6-1）。

后端 REST API 与 v5 完全相同（继续用 `/v2/checkout/orders`）——v5↔v6 的差异只在前端 SDK，不在 PayPal Orders API。因此本路由几乎是 v5 `routes/paypal/jssdk-v5/applepay-ecs.js` 的直接移植，仅改三处：路径前缀、视图路径、响应字段名。

## 2. 文件

| 文件 | 动作 |
|------|------|
| `src/routes/paypal/jssdk-v6/applepay-ecs.js` | 新建（移植 v5 同名路由 + v6 适配） |
| `src/app.js` | 改：加挂载行 |
| Supabase `demohub.products` | 插一行（用户执行 SQL） |

## 3. 路由结构（applepay-ecs.js）

凭证用 **CN 账号**（`getCNToken()` / `PAYPAL_CN_CLIENT_ID`），与 v5 一致。沿用 v5 ecs 的两个辅助函数（逐字搬运）：

```
mapApplePayShipping(sc)  // Apple Pay shippingContact → PayPal shipping{ name.full_name, address{...} }
parseApplePayPhone(num)  // 仅返回 { national_number: digits }（无 country_code）；空则 null
```

```
const PROVIDER = 'paypal', SDK = 'jssdk-v6', KEY = 'applepay-ecs'
```

### 3.1 `GET /applepay-ecs`

渲染 `paypal/jssdk-v6/applepay-ecs`，注入字段：
- `title`（来自 `getProduct`）、`provider`、`sdkVersion`、`currentProductKey`、`currentSdkVersion`、`sidebarProducts`、`showSidebar`。
- `clientId: process.env.PAYPAL_CN_CLIENT_ID`（v6 用 `createInstance` 需要）。
- `supportedCurrencies: demoParams.SUPPORTED_CURRENCIES`、`defaultAmount: req.query.amount || demoParams.DEFAULT_AMOUNT`、`currency: resolveCurrency(req.query.currency)`。
- **不注入 `sandboxShipping`**（ECS：买家在 sheet 内选，无商户预填地址展示——与 v5 ecs GET 一致）。
- **不传 `sdkUrl`**（规则 V6-5，v6 SDK 由 EJS body `<script defer>` 加载）。

### 3.2 `POST /api/applepay-ecs/create-order`

**body 与 v5 applepay-ecs 逐字一致**。请求入参：`amount`、`currency`、`shippingContact`、`billingContact`、`shippingAmount`。

```
// 入参
amount          = req.body.amount         || DEFAULT_AMOUNT
currency        = resolveCurrency(req.body.currency)
shippingContact = req.body.shippingContact || {}
billingContact  = req.body.billingContact  || {}
shippingAmount  = req.body.shippingAmount  || '0.00'
amountErr       = validateAmount(amount, currency)  // 400 if invalid

// 金额（零小数位取整；item + shipping = total）
zd       = isZeroDecimal(currency)
value    = zd ? round(amount)        : toFixed2(amount)
shipVal  = zd ? round(shippingAmount): toFixed2(shippingAmount)
totalVal = zd ? round(value+shipVal) : toFixed2(value+shipVal)

// 由 shippingContact 推导
shipping  = mapApplePayShipping(shippingContact)
email     = shippingContact.emailAddress || null
phone     = parseApplePayPhone(shippingContact.phoneNumber)   // { national_number } | null
buyerName = shipping.name.full_name

// order body（逐字同 v5 ecs）
intent: INTENT.CAPTURE
purchase_units: [{
  reference_id: DEMO_REFERENCE_ID, description: DEMO_DESCRIPTION,
  invoice_id: `INV-${Date.now()}`, custom_id: DEMO_CUSTOM_ID,
  soft_descriptor: DEMO_SOFT_DESCRIPTOR,
  amount: {
    currency_code: currency, value: totalVal,
    breakdown: { item_total: {currency,value}, shipping: {currency,shipVal} },
  },
  items: [{ ...DEMO_ITEM, unit_amount: {currency,value} }],
  shipping,                                  // ECS：由买家 sheet 选择映射而来
}]
payment_source: {
  apple_pay: {
    ...(buyerName ? { name: buyerName } : {}),
    ...(email     ? { email_address: email } : {}),
    ...(phone     ? { phone_number: phone } : {}),   // 仅 { national_number }
    experience_context: { return_url, cancel_url }   // 指向 v6 路由
  }
}
```

- `return_url` / `cancel_url` 指向 `/paypal/jssdk-v6/applepay-ecs`（v6 路径，非 v5）。
- token 不在此注入——由前端 `session.confirmOrder()` 注入。
- **唯一差异**：成功返回 `res.json({ orderId: order.id })`（v5 是 `{ id }`）。失败 `res.status(r.status).json({ error: order.message, details: order })`。

### 3.3 `POST /api/applepay-ecs/capture-order`

- 读 `const { orderId } = req.body`（小写 d，规则 V6-1）；缺失返回 400。
- `POST /v2/checkout/orders/${orderId}/capture`，标准 capture。
- 返回原始 PayPal 响应（**snake_case `purchase_units`**，前端按规则 13 判 `captures[0].status === 'COMPLETED'`）。

> 注：**不新增** GET order details 端点（Apple Pay 3DS 由协议内处理，v5 规则 18）。

## 4. app.js 挂载

在 v6 块、`applepay-ecm` 之后加：

```
app.use(v6, require('./routes/paypal/jssdk-v6/applepay-ecs'))
```

## 5. Supabase 数据

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('paypal', 'jssdk-v6', 'applepay-ecs', 'Apple Pay ECS',
   'Apple Pay via PayPal v6 — Express Checkout Shortcut', true, <v6 组内最大 sort_order + 1>);
```

插入后重启 demo-hub，首页 v6 分组出现 Apple Pay ECS 卡片。

## 6. 与 v5 后端 / v6 ecm 后端的差异总表

| 方面 | v5 applepay-ecs | v6 applepay-ecs（本设计） | v6 applepay-ecm（已完成） |
|------|-----------------|--------------------------|---------------------------|
| 路由前缀 | `/paypal/jssdk-v5` | `/paypal/jssdk-v6` | `/paypal/jssdk-v6` |
| GET 注入 sdkUrl | 是 | **否**（V6-5） | 否 |
| GET 注入 clientId | 否 | **是** | 是 |
| GET 注入 sandboxShipping | 否（ECS） | **否**（ECS） | 是（ECM 商户预填） |
| create-order 入参 | amount/currency/shippingContact/billingContact/shippingAmount | **相同** | 仅 amount/currency |
| create-order body | item+shipping breakdown，apple_pay 含 name/email/phone | **逐字相同** | 仅 item_total，apple_pay 仅 experience_context |
| order shipping | `mapApplePayShipping(shippingContact)` | **相同** | `SANDBOX_SHIPPING` |
| create-order 响应 | `{ id }` | `{ orderId }`（小写 d） | `{ orderId }` |
| capture 请求字段 | `req.body.orderID` | `req.body.orderId`（小写 d） | `req.body.orderId` |
| Orders REST API | `/v2/checkout/orders` | 相同 | 相同 |
| 凭证账号 | CN | CN | CN |

## 7. 验收标准

- `curl POST /paypal/jssdk-v6/api/applepay-ecs/create-order`（带 `{amount, currency, shippingContact, shippingAmount}`）返回 `{ orderId: 'xxx' }`，body 结构与 v5 一致：`amount.breakdown` 含 `item_total` + `shipping`，`total = item + shipping`，`payment_source.apple_pay` 含 name/email_address/phone_number(仅 national_number)/experience_context。
- 不传 shippingContact 时（兜底 `{}`）不报错，apple_pay 字段按条件展开省略。
- `curl POST /paypal/jssdk-v6/api/applepay-ecs/capture-order`（带合法 orderId）返回原始 PayPal capture JSON。
- 首页出现 v6 Apple Pay ECS 卡片，点击进入页面正常渲染。
