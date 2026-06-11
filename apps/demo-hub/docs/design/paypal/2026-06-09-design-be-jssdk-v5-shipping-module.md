# 设计（后端 + DB）— Shipping Module (shipping-module) · JSSDK v5

> 日期：2026-06-09
> 关联需求：`docs/req/2026-06-09-req-jssdk-v5-shipping-module.md`
> 状态：设计中（Opus 只写文档；代码须切换非 Opus 模型实现）

---

## 1. 路由总览（自定义路由）

非工厂路由（CN/US 切换 + 公网回调端点 + 动态 callback_events + 模拟拒绝）。
新增 `src/routes/paypal/jssdk-v5/shipping-module.js`，4 个 handler：

| 方法 | 路径 | 作用 |
|------|------|------|
| GET  | `/paypal/jssdk-v5/shipping-module` | 渲染页面，按 `?merchant=cn\|us` 选 client-id 注入 SDK URL |
| POST | `/paypal/jssdk-v5/api/shipping-module/create-order` | 构造含 `order_update_callback_config` 的订单 |
| POST | `/paypal/jssdk-v5/api/shipping-module/callback` | **PayPal 服务器回调入口（公网）** — 返回选项+金额 或 422 |
| POST | `/paypal/jssdk-v5/api/shipping-module/capture-order` | 标准 capture（规则 13 判定） |

挂载（`app.js`，v5 区块 fastlane-fp 之后）：
```js
app.use(v5, require("./routes/paypal/jssdk-v5/shipping-module"));
```

---

## 2. 关键架构决策

### 2.1 无状态回调（cart 信息内嵌 callback_url）

回调是 PayPal **服务器→服务器**调用，拿不到浏览器 session，且建单时（设置 callback_url 时）
尚未拿到 order id，无法按 order id 建内存映射。文档明确建议「cart 标识内嵌 callback URL」。

→ **建单时把 demo 购物车信息编进 callback_url query**，回调据此**无状态重算**：

```
callback_url = `${PUBLIC_BASE_URL}/paypal/jssdk-v5/api/shipping-module/callback`
             + `?cart_id=DEMO`
             + `&item_total=<金额>`
             + `&currency=<币种>`
             + `&decline=<none|COUNTRY_ERROR|ZIP_ERROR|...>`
```

> 响应顶层 `id` 用 order id（§2.3），不需要在 URL 里带 merchant。

> 备选：模块级 Map 按 sessionKey 存（类似 fastlane-fp 的 `threeDSSessionStore`）。
> 本场景 URL 内嵌更简单、更贴合文档，**选 URL 内嵌**。

### 2.2 商户切换（CN / US）

- GET：读 `req.query.merchant`（`us` → US，否则 CN），选 `process.env.PAYPAL_*_CLIENT_ID` 注入 SDK URL；
  把当前 merchant 注入 `window.DEMO.merchant`。
- create-order / capture：读 `req.body.merchant`，选 `getCNToken()` / `getUSToken()` 及 buyer-country。
- 切换方式：前端下拉 change → reload `?merchant=us&currency=..&amount=..`（沿用 currency 选择器同款 reload 模式）。

### 2.3 响应顶层 `id` = order id（用户 #4 已纠正）

回调成功响应顶层 `id` **直接用回调请求体里的 `id`（order id）**。
文档示例那个 `id` 是商户 ID，但本期先用 order id 看是否有问题；若 PayPal 校验失败，
再改回商户 ID（加 `PAYPAL_CN_MERCHANT_ID` / `PAYPAL_US_MERCHANT_ID` env + callback_url 带 `&merchant=`）。

→ 因此 callback_url **不需要** `&merchant=`，也**不需要**商户 id env。回调纯无状态（cart 信息足够）。

---

## 3. create-order 请求体（payment_source.paypal）

基于 `spb-ecs.js`（ECS 建单）+ 文档 `order_update_callback_config`。
前端 POST body：`{ amount, currency, merchant, subscribeOptions(bool), decline(string) }`。

```js
{
  intent: "CAPTURE",

  payment_source: {
    paypal: {
      experience_context: {
        brand_name:   C.EXPERIENCE_CONTEXT.brand_name,
        landing_page: "LOGIN",
        user_action:  "PAY_NOW",
        shipping_preference: "GET_FROM_FILE",     // 必须，回调触发前提
        return_url:   C.EXPERIENCE_CONTEXT.return_url,
        cancel_url:   C.EXPERIENCE_CONTEXT.cancel_url,

        order_update_callback_config: {
          // UI 开关：true → 两个事件都订；false → 只订 SHIPPING_ADDRESS
          callback_events: subscribeOptions
            ? ["SHIPPING_ADDRESS", "SHIPPING_OPTIONS"]
            : ["SHIPPING_ADDRESS"],
          callback_url: buildCallbackUrl({ itemTotal, currency, decline }),
        },
      },
    },
  },

  purchase_units: [{
    reference_id:  C.DEMO_REFERENCE_ID,
    description:   C.DEMO_DESCRIPTION,
    custom_id:     C.DEMO_CUSTOM_ID,
    soft_descriptor: C.DEMO_SOFT_DESCRIPTOR,
    invoice_id:    `INV-${Date.now()}`,

    amount: {
      currency_code: currency,
      value: itemTotal,                            // 首次只有 item_total
      breakdown: { item_total: { currency_code: currency, value: itemTotal } },
    },
    items: [{ ...C.DEMO_ITEM, unit_amount: { currency_code: currency, value: itemTotal } }],

    // GET_FROM_FILE：不传 shipping 对象，买家在 review 页选地址
  }],
}
```

`buildCallbackUrl()`：
```js
function buildCallbackUrl({ itemTotal, currency, decline }) {
  const base = process.env.PUBLIC_BASE_URL // 例 https://demo.cwen5.com
  const qs = new URLSearchParams({
    cart_id: "DEMO",
    item_total: itemTotal,
    currency,
    decline: decline || "none",
  }).toString()
  return `${base}/paypal/jssdk-v5/api/shipping-module/callback?${qs}`
}
```

> `PUBLIC_BASE_URL` 须带协议（`https://`）。`.env` 占位 `https://demo.cwen5.com`。

---

## 4. callback 端点逻辑

入参：`req.query`（cart_id / item_total / currency / decline / merchant）+ `req.body`
（文档 §Callback request：`id` / `shipping_address` / `shipping_option?` / `purchase_units`）。

### 4.1 拒绝分支（先判，最高优先级）

`decline !== 'none'` 时返回 **HTTP 422**：
```js
const ADDRESS_ERRORS = ["ADDRESS_ERROR","COUNTRY_ERROR","STATE_ERROR","ZIP_ERROR"]
const OPTION_ERRORS  = ["METHOD_UNAVAILABLE","STORE_UNAVAILABLE"]

// 地址类错误：在收到 SHIPPING_ADDRESS（无 shipping_option）时返回
// 选项类错误：在收到 SHIPPING_OPTIONS（有 shipping_option）时返回
const isOptionEvent = !!req.body.shipping_option
const wantOption = OPTION_ERRORS.includes(decline)
if ((wantOption && isOptionEvent) || (!wantOption && !isOptionEvent)) {
  return res.status(422).json({
    name: "UNPROCESSABLE_ENTITY",
    details: [{ issue: decline }],
  })
}
// 事件与错误类型不匹配时，仍走成功路径（避免无法演示成功态）
```

### 4.2 成功分支（重算金额 + 返回选项）

```js
const currency  = query.currency
const itemTotal = parseFloat(query.item_total)
if (!isFinite(itemTotal) || itemTotal <= 0) {      // 公网端点：防篡改/脏数据
  return res.status(400).json({ error: "invalid item_total" })
}
const zd  = C.isZeroDecimal(currency)
const fmt = (n) => zd ? String(Math.round(n)) : n.toFixed(2)

// 文档示例三选项
const OPTIONS = [
  { id: "1", label: "Free Shipping",          type: "SHIPPING", cost: 0  },
  { id: "2", label: "USPS Priority Shipping", type: "SHIPPING", cost: 7  },
  { id: "3", label: "1-Day Shipping",         type: "SHIPPING", cost: 10 },
]

// 选中项：回调带 shipping_option.id 用之；否则默认第一项（Free）
const selectedId = (req.body.shipping_option && req.body.shipping_option.id) || "1"
const selected   = OPTIONS.find(o => o.id === selectedId) || OPTIONS[0]
// 先各自取整，value 由「取整后」三项相加 → 从根上保证 value == breakdown 之和
const itemR  = fmt(itemTotal)
const taxR   = fmt(itemTotal * 0.05)               // demo 固定 5% 税
const shipR  = fmt(selected.cost)
const valueR = fmt(Number(itemR) + Number(taxR) + Number(shipR))

// 响应顶层 id 用回调请求体里的 order id（§2.3；先这么做看是否有问题）
const responseId = req.body.id

res.json({
  id: responseId,
  purchase_units: [{
    reference_id: (req.body.purchase_units && req.body.purchase_units[0]
                   && req.body.purchase_units[0].reference_id) || C.DEMO_REFERENCE_ID,
    amount: {
      currency_code: currency,
      value: valueR,
      breakdown: {
        item_total: { currency_code: currency, value: itemR },
        tax_total:  { currency_code: currency, value: taxR },
        shipping:   { currency_code: currency, value: shipR },
      },
    },
    shipping_options: OPTIONS.map(o => ({
      id: o.id,
      label: o.label,
      type: o.type,
      selected: o.id === selected.id,
      amount: { currency_code: currency, value: fmt(o.cost) },
    })),
  }],
})
```

**金额一致性（文档 §Merchant success response，必须满足）：**
- `breakdown.shipping.value` == selected 选项 `amount.value` ✓（同 `shipR`）
- `amount.value`(`valueR`) == item_total + tax_total + shipping ✓（由取整后三项相加得出）
- 全部 `currency_code` 一致 ✓
- 零小数币种取整 ✓

**inspect/probe：** 端点开头 `console.log("[shipping-module callback] query:", query, "body:", req.body)`；
返回前打印响应体。

---

## 5. capture-order 端点

标准实现（同工厂）：读 `{ orderID, merchant }` → `getCNToken()`/`getUSToken()` →
`POST /v2/checkout/orders/:id/capture` → 返回完整 order（前端按规则 13 判定 `captures[0].status==='COMPLETED'`）。

---

## 6. DB / 配置

### 6.1 Supabase 插入（用户手动执行）

```sql
INSERT INTO demohub.products (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES (
  'paypal', 'jssdk-v5', 'shipping-module',
  'Shipping Module',
  'Server-side shipping callbacks：review 页动态运送选项 + 金额重算（PayPal）',
  true,
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM demohub.products WHERE provider='paypal' AND sdk_version='jssdk-v5')
);
```

### 6.2 .env / .env.example 新增

```
# Shipping module — 回调公网基址（PayPal 服务器回调可达）
PUBLIC_BASE_URL=https://demo.cwen5.com
```

> 响应顶层 `id` 先用 order id（§2.3），不需要商户 id env。
> 若服务器实测 PayPal 校验失败需用商户 ID，再补 `PAYPAL_CN_MERCHANT_ID` / `PAYPAL_US_MERCHANT_ID`。

---

## 7. 复用 / 不重建

- `config/paypal.js`：`getCNToken` / `getUSToken` / `getHeaders` / `API`（直接用）。
- `config/constants.js`：`INTENT` / `DEMO_*` / `EXPERIENCE_CONTEXT` / `isZeroDecimal` / `validateAmount`
  / `SUPPORTED_CURRENCIES`（直接用，整文件 `const C = require(...)`）。
- `spb-ecs.js`：ECS 建单参数结构模板。
- `googlepay-ecs.js`：运送选项重算思路参考（但本期是 PayPal server-side callback，结构不同）。

---

## 8. inspect/probe 清单（服务器定稿）

- [ ] 回调 body 真实字段（确认首次回调**无** `shipping_option`）。
- [ ] callback_url 的 query 是否被 PayPal 原样保留。
- [ ] CN 商户回调是否真实触发（无效则切 US）。
- [ ] 响应顶层 `id` 用 order id 是否被 PayPal 接受（若拒则改商户 id）。
- [ ] 金额一致性是否通过 PayPal 校验（不通过则按真实要求调整 breakdown）。
