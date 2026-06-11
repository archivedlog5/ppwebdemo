# 后端设计 — JSSDK v6 Apple Pay ECM

> 日期：2026-06-02 · 关联：design-fe / plan（同日 `*-jssdk-v6-applepay-ecm.md`）
>
> ⚠️ 当前 Opus 模型下只能产出本设计（markdown）。实际写代码需切换到 Sonnet 等非 Opus 模型。

## 1. 目标

新增 `/paypal/jssdk-v6/applepay-ecm` 后端，能力等价 v5 applepay-ecm（ECM：商户预填 shipping，买家在 Apple Pay sheet 提供 billing）。**create-order 请求 body 与 v5 逐字一致**；响应字段遵循 v6 约定（`orderId` 小写 d，规则 V6-1）。

后端 REST API 与 v5 完全相同（继续用 `/v2/checkout/orders`）——v5↔v6 的差异只在前端 SDK，不在 PayPal Orders API。因此本路由几乎是 v5 `routes/paypal/jssdk-v5/applepay-ecm.js` 的直接移植，仅改三处：路径前缀、视图路径、响应字段名。

## 2. 文件

| 文件 | 动作 |
|------|------|
| `src/routes/paypal/jssdk-v6/applepay-ecm.js` | 新建（移植 v5 同名路由 + v6 适配） |
| `src/app.js` | 改：加挂载行 |
| Supabase `demohub.products` | 插一行（用户执行 SQL） |

## 3. 路由结构（applepay-ecm.js）

常量整体引入风格 `const C = require('../../../config/constants')`（与 v6 其他路由一致），凭证用 **CN 账号**（`getCNToken()` / `PAYPAL_CN_CLIENT_ID`），与 v5 一致。

```
const PROVIDER = 'paypal', SDK = 'jssdk-v6', KEY = 'applepay-ecm'
```

### 3.1 `GET /applepay-ecm`

渲染 `paypal/jssdk-v6/applepay-ecm`，注入字段与 v5 GET 相同：
- `title`（来自 `getProduct`）、`provider`、`sdkVersion`、`currentProductKey`、`currentSdkVersion`、`sidebarProducts`、`showSidebar`。
- `clientId: process.env.PAYPAL_CN_CLIENT_ID`（v6 用 `createInstance` 需要）。
- `supportedCurrencies: C.SUPPORTED_CURRENCIES`、`defaultAmount`、`currency: resolveCurrency(req.query.currency)`。
- `sandboxShipping`（展开 `C.SANDBOX_SHIPPING`：name / addressLine1 / adminArea2 / adminArea1 / postalCode / countryCode）——与 v5 完全相同的扁平字段，供 EJS 展示"商户预填、不在 Apple Pay sheet 显示"的地址。
- **不传 `sdkUrl`**（规则 V6-5，v6 SDK 由 EJS body `<script defer>` 加载）。

### 3.2 `POST /api/applepay-ecm/create-order`

**body 与 v5 逐字一致**：

```
intent: C.INTENT.CAPTURE
purchase_units: [{
  reference_id, description, invoice_id: `INV-${Date.now()}`,
  custom_id, soft_descriptor,
  amount: { currency_code, value, breakdown: { item_total } },
  items: [{ ...C.DEMO_ITEM, unit_amount }],
  shipping: C.SANDBOX_SHIPPING,          // ECM：商户预填 shipping
}]
payment_source: {
  apple_pay: {
    experience_context: { return_url, cancel_url }   // 指向本 v6 路由
  }
}
```

- 金额：沿用 v5 逻辑——`resolveCurrency` 白名单校验 + `validateAmount` + 零小数位取整（`C.isZeroDecimal`）。
- `return_url` / `cancel_url` 指向 `/paypal/jssdk-v6/applepay-ecm`（v6 路径，非 v5）。
- token 不在此注入——由前端 `applePaySession.confirmOrder()` 注入（ECM 流程）。
- **唯一差异**：成功返回 `res.json({ orderId: order.id })`（v5 是 `{ id }`）。失败 `res.status(r.status).json({ error: order.message, details: order })`。

### 3.3 `POST /api/applepay-ecm/capture-order`

- 读 `const { orderId } = req.body`（小写 d，规则 V6-1）；缺失返回 400。
- `POST /v2/checkout/orders/${orderId}/capture`，标准 capture。
- 返回原始 PayPal 响应（**snake_case `purchase_units`**，前端按规则 13 判 `captures[0].status === 'COMPLETED'`）。

> 注：**不新增** GET order details 端点。Apple Pay 的 3DS 由 Apple Pay 协议内部处理（v5 规则 18），无需像 ACDC 那样 GET order 解析 `authentication_result`。

## 4. app.js 挂载

在 v6 块、`buttons` 之后加：

```
app.use(v6, require('./routes/paypal/jssdk-v6/applepay-ecm'))
```

## 5. Supabase 数据

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('paypal', 'jssdk-v6', 'applepay-ecm', 'Apple Pay ECM',
   'Apple Pay via PayPal v6 — Express Checkout Mark', true, <v6 组内最大 sort_order + 1>);
```

插入后重启 demo-hub，首页 v6 分组出现 Apple Pay ECM 卡片。

## 6. 与 v5 后端的差异总表

| 方面 | v5 | v6 |
|------|----|----|
| 路由前缀 | `/paypal/jssdk-v5` | `/paypal/jssdk-v6` |
| 视图路径 | `paypal/jssdk-v5/applepay-ecm` | `paypal/jssdk-v6/applepay-ecm` |
| GET 注入 sdkUrl | 是（`...components=applepay`） | **否**（V6-5） |
| GET 注入 clientId | 否 | **是**（createInstance 需要） |
| create-order body | — | **逐字相同** |
| create-order 响应 | `{ id }` | `{ orderId }`（小写 d） |
| capture 请求字段 | `req.body.orderID` | `req.body.orderId`（小写 d） |
| Orders REST API | `/v2/checkout/orders` | 相同 |
| 凭证账号 | CN | CN（相同） |

## 7. 验收标准

- `curl POST /paypal/jssdk-v6/api/applepay-ecm/create-order` 返回 `{ orderId: 'xxx' }`，body 结构与 v5 一致。
- `curl POST /paypal/jssdk-v6/api/applepay-ecm/capture-order`（带合法 orderId，实际需经 Apple Pay confirmOrder 后才会成功）返回原始 PayPal capture JSON。
- 首页出现 v6 Apple Pay ECM 卡片，点击进入页面正常渲染。
