# 后端设计 — JSSDK v6 Google Pay ECS

> 日期：2026-06-04 · 关联：req / design-fe / plan（同日 `*-jssdk-v6-googlepay-ecs.md`）
>
> ⚠️ 当前 Opus 模型下只能产出本设计（markdown）。实际写代码需切换到非 Opus 模型（如 Sonnet）。

## 1. 目标

新增 `/paypal/jssdk-v6/googlepay-ecs` 后端，能力等价 v5 googlepay-ecs（ECS：买家在 Google Pay sheet 内选地址/邮箱/电话/运费方式）。**create-order 请求 body 与 v5 逐字一致**；响应字段遵循 v6 约定（`orderId` 小写 d，规则 V6-1）。

后端 REST API 与 v5 完全相同（继续用 `/v2/checkout/orders`）——v5↔v6 差异只在前端 SDK。本路由几乎是 v5 `routes/paypal/jssdk-v5/googlepay-ecs.js` 的直接移植，仅改：路径前缀、视图路径、注入 `clientId`、去掉 `sdkUrl`/`extraScripts`、响应字段名、`:orderID`→`:orderId`。

## 2. 文件

| 文件 | 动作 |
|------|------|
| `src/routes/paypal/jssdk-v6/googlepay-ecs.js` | 新建（移植 v5 同名路由 + v6 适配） |
| `src/app.js` | 改：加挂载行 |
| Supabase `demohub.products` | 插一行（用户执行 SQL） |

## 3. 路由结构（googlepay-ecs.js）

自定义路由（非工厂），凭证用 **CN 账号**（`getCNToken()` / `PAYPAL_CN_CLIENT_ID`），与 v5 一致。沿用 v5 的：

- `resolveCurrency(v)` — `SUPPORTED_CURRENCIES` 白名单
- `SCA_METHODS = ['SCA_WHEN_REQUIRED','SCA_ALWAYS']`
- `mapGooglePayAddress(sh)` — Google Pay 地址格式 → PayPal shipping 格式（**逐字移植 v5**）

```
const PROVIDER = 'paypal', SDK = 'jssdk-v6', KEY = 'googlepay-ecs'
```

### 3.1 `GET /googlepay-ecs`

渲染 `paypal/jssdk-v6/googlepay-ecs`，注入字段：

- `title`（来自 `getProduct`）、`provider`、`sdkVersion`、`currentProductKey`、`currentSdkVersion`、`sidebarProducts`、`showSidebar`。
- `clientId: process.env.PAYPAL_CN_CLIENT_ID`（v6 用 `createInstance` 需要）。
- `supportedCurrencies`、`defaultAmount`、`currency: resolveCurrency(req.query.currency)`。
- **不传 `sandboxShipping` / `sandboxPhone`**（ECS：买家在 sheet 内选，无需商户预填展示块——区别于 ECM）。
- **不传 `sdkUrl`**（规则 V6-5，v6 SDK 由 EJS body `<script defer>` 加载）。
- **不传 `extraScripts`**（Google Pay `pay.js` 由 EJS body 显式加载，与 applepay/googlepay-ecm 一致）。

### 3.2 `POST /api/googlepay-ecs/create-order`

**body 与 v5 googlepay-ecs 逐字一致**：

```
入参（req.body）：
  amount, currency, scaMethod,
  shippingAddress（Google Pay 原始地址对象）,
  buyerName, email, parsedPhone（{country_code, national_number}）,
  shippingAmount（最终选中运费方式的价格）

intent: C.INTENT.CAPTURE
purchase_units: [{
  reference_id, description, invoice_id: `INV-${Date.now()}`,
  custom_id, soft_descriptor,
  amount: {
    currency_code, value: totalVal,             // totalVal = item + shipping
    breakdown: { item_total, shipping },         // ⚠️ ECS 含 shipping（ECM 只有 item_total）
  },
  items: [{ ...C.DEMO_ITEM, unit_amount: item }],
  ...(shippingPayPal ? { shipping: shippingPayPal } : {}),   // mapGooglePayAddress(shippingAddress)
}]
payment_source: {
  google_pay: {
    ...(buyerName   ? { name:          buyerName   } : {}),
    ...(email       ? { email_address: email       } : {}),
    ...(parsedPhone ? { phone_number:  parsedPhone } : {}),   // ⚠️ ECS：country_code + national_number 两字段
    experience_context: { return_url, cancel_url },          // 指向本 v6 路由
    attributes: { verification: { method: scaMethod } },
  }
}
```

- 金额：`validateAmount` + 零小数位取整（`isZeroDecimal`）；`totalVal = value + shipVal`，与 v5 相同。
- `amtObj(c, v)` helper 同 v5（ECS 因 item/shipping/total 三个值，签名为 `(currency, value)` 双参）。
- `return_url` / `cancel_url` 指向 `/paypal/jssdk-v6/googlepay-ecs`（v6 路径）。
- **唯一差异**：成功返回 `res.json({ orderId: order.id })`（v5 是 `{ id }`）。失败 `res.status(r.status).json({ error: order.message, details: order })`。

> ECM vs ECS 后端差异（与 v5 一致）：ECM breakdown 只有 `item_total`、phone 用 `SANDBOX_PHONE` 预填、无顶层 shipping；ECS breakdown 含 `item_total` + `shipping`、phone 来自 sheet（country_code + national_number）、含 sheet 地址 mapped 的 shipping。

### 3.3 `GET /api/googlepay-ecs/order/:orderId`

- **保留此端点**：3DS 完整路径分支（防御兜底）需 GET order 解析 `payment_source.google_pay.card.authentication_result`。
- 路径参数名 `:orderId`（v6 小写 d；v5 是 `:orderID`）。
- `GET /v2/checkout/orders/${orderId}`，返回原始 PayPal JSON。

### 3.4 `POST /api/googlepay-ecs/capture-order`

- 读 `const { orderId } = req.body`（小写 d，规则 V6-1）；缺失返回 400。
  > ⚠️ v5 此处读 `req.body.orderID`（大写），前端传的也是 `{ orderID }`。v6 全链路统一小写 `orderId`——前端 fetch body 也必须传 `{ orderId }`（见 fe 设计）。
- `POST /v2/checkout/orders/${orderId}/capture`，标准 capture。
- 返回原始 PayPal 响应（**snake_case `purchase_units`**，前端按规则 13 判 `captures[0].status === 'COMPLETED'`）。

## 4. app.js 挂载

在 v6 块、`googlepay-ecm` 之后加：

```
app.use(v6, require('./routes/paypal/jssdk-v6/googlepay-ecs'))
```

## 5. Supabase 数据

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('paypal', 'jssdk-v6', 'googlepay-ecs', 'Google Pay ECS',
   'Google Pay via PayPal v6 — Express Checkout Shortcut', true, <v6 组内最大 sort_order + 1>);
```

插入后重启 demo-hub，首页 v6 分组出现 Google Pay ECS 卡片。

## 6. 与 v5 后端的差异总表

| 方面 | v5 | v6 |
|------|----|----|
| 路由前缀 | `/paypal/jssdk-v5` | `/paypal/jssdk-v6` |
| 视图路径 | `paypal/jssdk-v5/googlepay-ecs` | `paypal/jssdk-v6/googlepay-ecs` |
| GET 注入 sdkUrl | 是（`...components=googlepay`） | **否**（V6-5） |
| GET 注入 extraScripts | 是（pay.js） | **否**（EJS body 自行加载 pay.js） |
| GET 注入 clientId | 否 | **是**（createInstance 需要） |
| create-order body | — | **逐字相同**（含 shipping breakdown / mapGooglePayAddress / parsedPhone 两字段） |
| create-order 响应 | `{ id }` | `{ orderId }`（小写 d） |
| GET order 路径参数 | `:orderID` | `:orderId`（小写 d） |
| capture 请求字段 | `req.body.orderID` | `req.body.orderId`（小写 d） |
| Orders REST API | `/v2/checkout/orders` | 相同 |
| 凭证账号 | CN | CN（相同） |

## 7. 验收标准

- `curl POST /paypal/jssdk-v6/api/googlepay-ecs/create-order`（body 含 `amount/currency/scaMethod/shippingAddress/buyerName/email/parsedPhone/shippingAmount`）返回 `{ orderId: 'xxx' }`，order body 结构与 v5 一致（breakdown 含 item_total + shipping）。
- `curl GET /paypal/jssdk-v6/api/googlepay-ecs/order/<orderId>` 返回原始 PayPal order JSON。
- `curl POST /paypal/jssdk-v6/api/googlepay-ecs/capture-order`（带合法 orderId，实际需经 Google Pay confirmOrder 后才会成功）返回原始 PayPal capture JSON。
- 首页出现 v6 Google Pay ECS 卡片，点击进入页面正常渲染。
