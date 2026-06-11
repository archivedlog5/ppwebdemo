# 后端设计 — JSSDK v6 Google Pay ECM

> 日期：2026-06-02 · 关联：design-fe / plan（同日 `*-jssdk-v6-googlepay-ecm.md`）
>
> ⚠️ 当前 Opus 模型下只能产出本设计（markdown）。实际写代码需切换到 Sonnet 等非 Opus 模型。

## 1. 目标

新增 `/paypal/jssdk-v6/googlepay-ecm` 后端，能力等价 v5 googlepay-ecm（ECM：商户预填 shipping，`shippingAddressRequired: false`，买家在 Google Pay sheet 仅提供 email）。**create-order 请求 body 与 v5 逐字一致**；响应字段遵循 v6 约定（`orderId` 小写 d，规则 V6-1）。

后端 REST API 与 v5 完全相同（继续用 `/v2/checkout/orders`）——v5↔v6 的差异只在前端 SDK，不在 PayPal Orders API。因此本路由几乎是 v5 `routes/paypal/jssdk-v5/googlepay-ecm.js` 的直接移植，仅改：路径前缀、视图路径、注入 `clientId`、去掉 `sdkUrl`、响应字段名、`:orderID`→`:orderId`。

## 2. 文件

| 文件 | 动作 |
|------|------|
| `src/routes/paypal/jssdk-v6/googlepay-ecm.js` | 新建（移植 v5 同名路由 + v6 适配） |
| `src/app.js` | 改：加挂载行 |
| Supabase `demohub.products` | 插一行（用户执行 SQL） |

## 3. 路由结构（googlepay-ecm.js）

自定义路由（非工厂），凭证用 **CN 账号**（`getCNToken()` / `PAYPAL_CN_CLIENT_ID`），与 v5 一致。沿用 v5 的 `resolveCurrency` + `SCA_METHODS = ['SCA_WHEN_REQUIRED','SCA_ALWAYS']`。

```
const PROVIDER = 'paypal', SDK = 'jssdk-v6', KEY = 'googlepay-ecm'
```

### 3.1 `GET /googlepay-ecm`

渲染 `paypal/jssdk-v6/googlepay-ecm`，注入字段：
- `title`（来自 `getProduct`）、`provider`、`sdkVersion`、`currentProductKey`、`currentSdkVersion`、`sidebarProducts`、`showSidebar`。
- `clientId: process.env.PAYPAL_CN_CLIENT_ID`（v6 用 `createInstance` 需要）。
- `supportedCurrencies`、`defaultAmount`、`currency: resolveCurrency(req.query.currency)`。
- `sandboxShipping`（展开 `SANDBOX_SHIPPING`：name / addressLine1 / adminArea2 / adminArea1 / postalCode / countryCode）——供 EJS 展示"商户预填、不在 Google Pay sheet 显示"的地址。
- `sandboxPhone`：`` `+${SANDBOX_PHONE.country_code} ${SANDBOX_PHONE.national_number}` ``（与 v5 一致，展示用）。
- **不传 `sdkUrl`**（规则 V6-5，v6 SDK 由 EJS body `<script defer>` 加载）。
- **不传 `extraScripts`**（Google Pay `pay.js` 由 EJS body 显式加载，与 applepay 一致）。

### 3.2 `POST /api/googlepay-ecm/create-order`

**body 与 v5 逐字一致**：

```
intent: C.INTENT.CAPTURE
purchase_units: [{
  reference_id, description, invoice_id: `INV-${Date.now()}`,
  custom_id, soft_descriptor,
  amount: { currency_code, value, breakdown: { item_total } },
  items: [{ ...C.DEMO_ITEM, unit_amount }],
  shipping: { name: { full_name }, address: { address_line_1/admin_area_1/admin_area_2/postal_code/country_code } },
    // 来自 req.body.shipping，缺省 fallback 到 SANDBOX_SHIPPING（与 v5 相同）
}]
payment_source: {
  google_pay: {
    ...(email ? { email_address: email } : {}),
    phone_number: C.SANDBOX_PHONE,                     // ECM：sheet 无地址区，电话用预填（v5 规则 17）
    experience_context: { return_url, cancel_url },    // 指向本 v6 路由
    attributes: { verification: { method: scaMethod } },
  }
}
```

- 入参：`amount`、`currency`（`resolveCurrency` 白名单）、`shipping`、`scaMethod`（`SCA_METHODS` 校验，默认 `SCA_WHEN_REQUIRED`）、`email`。
- 金额：`validateAmount` + 零小数位取整（`isZeroDecimal`），与 v5 相同。
- `return_url` / `cancel_url` 指向 `/paypal/jssdk-v6/googlepay-ecm`（v6 路径）。
- **唯一差异**：成功返回 `res.json({ orderId: order.id })`（v5 是 `{ id }`）。失败 `res.status(r.status).json({ error: order.message, details: order })`。

### 3.3 `GET /api/googlepay-ecm/order/:orderId`

- **保留此端点**（区别于 applepay-ecm）：3DS 完整路径分支需 GET order 解析 `payment_source.google_pay.card.authentication_result`。
- 路径参数名 `:orderId`（v6 小写 d；v5 是 `:orderID`）。
- `GET /v2/checkout/orders/${orderId}`，返回原始 PayPal JSON。

### 3.4 `POST /api/googlepay-ecm/capture-order`

- 读 `const { orderId } = req.body`（小写 d，规则 V6-1）；缺失返回 400。
  > ⚠️ v5 此处读 `req.body.orderID`（大写），前端传的也是 `{ orderID }`。v6 全链路统一小写 `orderId`——前端 fetch body 也必须传 `{ orderId }`（见 fe 设计）。
- `POST /v2/checkout/orders/${orderId}/capture`，标准 capture。
- 返回原始 PayPal 响应（**snake_case `purchase_units`**，前端按规则 13 判 `captures[0].status === 'COMPLETED'`）。

## 4. app.js 挂载

在 v6 块、`applepay-ecs` 之后加：

```
app.use(v6, require('./routes/paypal/jssdk-v6/googlepay-ecm'))
```

## 5. Supabase 数据

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('paypal', 'jssdk-v6', 'googlepay-ecm', 'Google Pay ECM',
   'Google Pay via PayPal v6 — Express Checkout Mark', true, <v6 组内最大 sort_order + 1>);
```

插入后重启 demo-hub，首页 v6 分组出现 Google Pay ECM 卡片。

## 6. 与 v5 后端的差异总表

| 方面 | v5 | v6 |
|------|----|----|
| 路由前缀 | `/paypal/jssdk-v5` | `/paypal/jssdk-v6` |
| 视图路径 | `paypal/jssdk-v5/googlepay-ecm` | `paypal/jssdk-v6/googlepay-ecm` |
| GET 注入 sdkUrl | 是（`...components=googlepay`） | **否**（V6-5） |
| GET 注入 extraScripts | 是（pay.js） | **否**（EJS body 自行加载 pay.js） |
| GET 注入 clientId | 否 | **是**（createInstance 需要） |
| create-order body | — | **逐字相同** |
| create-order 响应 | `{ id }` | `{ orderId }`（小写 d） |
| GET order 路径参数 | `:orderID` | `:orderId`（小写 d） |
| capture 请求字段 | `req.body.orderID` | `req.body.orderId`（小写 d） |
| Orders REST API | `/v2/checkout/orders` | 相同 |
| 凭证账号 | CN | CN（相同） |

## 7. 验收标准

- `curl POST /paypal/jssdk-v6/api/googlepay-ecm/create-order`（body `{amount,currency,scaMethod}`）返回 `{ orderId: 'xxx' }`，order body 结构与 v5 一致。
- `curl GET /paypal/jssdk-v6/api/googlepay-ecm/order/<orderId>` 返回原始 PayPal order JSON。
- `curl POST /paypal/jssdk-v6/api/googlepay-ecm/capture-order`（带合法 orderId，实际需经 Google Pay confirmOrder 后才会成功）返回原始 PayPal capture JSON。
- 首页出现 v6 Google Pay ECM 卡片，点击进入页面正常渲染。
