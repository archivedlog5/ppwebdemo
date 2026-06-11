# 设计（后端 + DB）— APM iDEAL (apm-jssdk) · JSSDK v5

> 日期：2026-06-10
> 关联需求：`docs/req/2026-06-10-req-jssdk-v5-apm-jssdk.md`
> 状态：设计中（Opus 只写文档；代码须切换非 Opus 模型实现）

---

## 1. 路由总览（自定义路由，3 端点）

非工厂路由（货币锁 EUR、无货币选择器、`payment_source.ideal` 自定义建单）。
新增 `src/routes/paypal/jssdk-v5/apm-jssdk.js`，3 个 handler：

| 方法 | 路径 | 作用 |
|------|------|------|
| GET  | `/paypal/jssdk-v5/apm-jssdk` | 渲染页面（EUR-only），注入 CN client-id + iDEAL SDK URL |
| POST | `/paypal/jssdk-v5/api/apm-jssdk/create-order` | 构造 `payment_source.ideal` 订单（NL / EUR / 荷兰地址） |
| POST | `/paypal/jssdk-v5/api/apm-jssdk/capture-order` | capture → 规则 13 判定 → 返回完整体 |

挂载（`app.js`，v5 区块 `contact-module` 之后）：
```js
app.use(v5, require("./routes/paypal/jssdk-v5/apm-jssdk"));
```

---

## 2. 关键架构决策

### 2.1 中国商户（getCNToken）

所有 token 调用统一 `getCNToken()`；SDK URL 用 `PAYPAL_CN_CLIENT_ID`。
iDEAL 资格：全球可用仅排除 RU/JP/BR → 中国商户可处理 iDEAL。

### 2.2 货币锁定 EUR

iDEAL 建单必须 EUR。GET handler 不渲染 currency 选择器；create-order 强制 `currency='EUR'`。
EUR 为两位小数货币（非 zero-decimal）。金额可调（沿用 `validateAmount` + 标准 amount 输入）。

```js
const CURRENCY = 'EUR'
const val = parseFloat(amount).toFixed(2)   // EUR 两位小数
```

### 2.3 payment_source 替换为 ideal（核心）

把 `spb-ecm.js` 的 `payment_source.paypal` 替换为 `payment_source.ideal`：

```js
payment_source: {
  ideal: {
    country_code: "NL",
    name:         "Cross Wen",          // 固定 NL sandbox 买家姓名（Mark+Button 无 Fields 收集）
    experience_context: {
      brand_name: C.EXPERIENCE_CONTEXT.brand_name,   // "Cross WEN China Store" — inspect/probe
      locale:     "nl-NL",                            // inspect/probe
      return_url: C.EXPERIENCE_CONTEXT.return_url,
      cancel_url: C.EXPERIENCE_CONTEXT.cancel_url,
    },
  },
}
```

> 文档权威结构仅确认 `country_code` / `name` / `experience_context.{return_url,cancel_url}`；
> `brand_name` / `locale` 为通用 experience_context 字段，先包含并标 inspect/probe 核实是否被接受。
> `bic`（预选银行）**省略**——让买家在重定向页选行。

### 2.4 PayPal-Request-Id 必传（含 payment_source 时）

PayPal Orders v2 规则：create-order 请求体包含 `payment_source` 时，**必须**在 HTTP header 中传 `PayPal-Request-Id`，否则返回 `PAYPAL_REQUEST_ID_REQUIRED` 422 错误。

```js
const { randomUUID } = require('crypto')
// ...
headers: getHeaders(token, { 'PayPal-Request-Id': randomUUID() })
```

`getHeaders(token, extra)` 已支持 extra 参数合并，无需修改 paypal.js。`randomUUID()` 为 Node.js 内置，无需额外依赖。

> 这是 iDEAL 区别于标准 PayPal/Card 建单的关键差异点：标准 Buttons 建单不含 `payment_source`，可省略此 header；APM 建单含 `payment_source.ideal`，必须加。

---

### 2.5 不设 processing_instruction（手动 capture）

JSSDK Buttons 重定向流在 `onApprove` 手动 capture，因此 create-order **不设**
`processing_instruction: ORDER_COMPLETE_ON_PAYMENT_APPROVAL`（该值会令订单审批即自动完成，
手动 capture 会冲突报错）。

### 2.6 荷兰收货地址（新常量 NL_SHIPPING）

参考 `SANDBOX_SHIPPING` / `VENMO_SHIPPING`，在 `constants.js` 新增共享常量：

```js
const NL_SHIPPING = {
  name: { full_name: "Cross Wen" },
  address: {
    address_line_1: "Keizersgracht 123",
    address_line_2: "",
    admin_area_2:   "Amsterdam",        // city
    admin_area_1:   "NH",               // province (North Holland) — inspect/probe 是否必填
    postal_code:    "1015 CJ",
    country_code:   "NL",
  },
}
```
导出并加入 `module.exports`。

> 文档称 iDEAL「shipping callbacks 不支持」，但仍允许在 create-order 传 `shipping`（静态地址）。
> 用户明确要求带荷兰地址；是否被 iDEAL 真正使用 → inspect/probe。

### 2.7 严格规则 13（仅 COMPLETED）

capture 端点返回完整体；前端按规则 13 判 `captures[0].status === 'COMPLETED'`。
`PENDING` 等其余状态一律按错误处理（不做 pending 中性态）。

---

## 3. create-order 请求体（完整）

基于 `spb-ecm.js` 的 `buildBody`，替换 payment_source + 货币 + 地址。前端 POST body：`{ amount }`（货币固定 EUR）。

```js
const C = require('../../../config/constants')

function buildBody(amount) {
  const val = parseFloat(amount).toFixed(2)            // EUR 两位小数
  const eur = (v) => ({ currency_code: "EUR", value: v })

  return {
    intent: C.INTENT.CAPTURE,                          // iDEAL 仅支持 CAPTURE

    payment_source: {
      ideal: {
        country_code: "NL",
        name:         "Cross Wen",
        experience_context: {
          brand_name: C.EXPERIENCE_CONTEXT.brand_name, // inspect/probe
          locale:     "nl-NL",                         // inspect/probe
          return_url: C.EXPERIENCE_CONTEXT.return_url,
          cancel_url: C.EXPERIENCE_CONTEXT.cancel_url,
        },
      },
    },
    // 注意：不设 processing_instruction（手动 capture）

    purchase_units: [{
      reference_id:    C.DEMO_REFERENCE_ID,
      description:     C.DEMO_DESCRIPTION,
      custom_id:       C.DEMO_CUSTOM_ID,
      soft_descriptor: C.DEMO_SOFT_DESCRIPTOR,
      invoice_id:      `INV-${Date.now()}`,

      amount: {
        currency_code: "EUR",
        value:         val,
        breakdown: { item_total: eur(val) },
      },
      items: [{ ...C.DEMO_ITEM, unit_amount: eur(val) }],

      shipping: C.NL_SHIPPING,                          // 荷兰地址
    }],
  }
}
```

create-order handler：
```js
const { randomUUID } = require('crypto')   // ← 文件头引入

router.post(`/api/${PRODUCT_KEY}/create-order`, async (req, res) => {
  try {
    const amount    = req.body.amount || C.DEFAULT_AMOUNT
    const amountErr = C.validateAmount(amount, 'EUR')
    if (amountErr) return res.status(400).json({ error: amountErr })

    const token = await getCNToken()
    const body  = buildBody(amount)
    const r = await fetch(`${API}/v2/checkout/orders`, {
      // payment_source 存在时 PayPal 强制要求 PayPal-Request-Id header（PAYPAL_REQUEST_ID_REQUIRED）
      method: 'POST', headers: getHeaders(token, { 'PayPal-Request-Id': randomUUID() }), body: JSON.stringify(body),
    })
    const order = await r.json()
    console.log('[apm-jssdk create-order]', JSON.stringify(order, null, 2))   // inspect/probe
    if (!r.ok) return res.status(r.status).json({ error: order.message || 'Create order failed', details: order })
    res.json({ id: order.id })
  } catch (err) {
    console.error('[apm-jssdk] create-order error:', err.message)
    res.status(500).json({ error: err.message })
  }
})
```

---

## 4. capture-order 端点逻辑

与工厂 capture 一致（无需 GET Order——无联系方式可读）：

```js
router.post(`/api/${PRODUCT_KEY}/capture-order`, async (req, res) => {
  try {
    const { orderID } = req.body
    if (!orderID) return res.status(400).json({ error: 'orderID required' })

    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST', headers: getHeaders(token),
    })
    const data = await r.json()
    console.log('[apm-jssdk capture]', JSON.stringify(data, null, 2))         // inspect/probe
    if (!r.ok) return res.status(r.status).json({ error: data.message || 'Capture failed', details: data })

    res.json(data)   // 前端按规则 13 判 captures[0].status === 'COMPLETED'
  } catch (err) {
    console.error('[apm-jssdk] capture-order error:', err.message)
    res.status(500).json({ error: err.message })
  }
})
```

---

## 5. GET 端点（页面渲染）

参考 `contact-module` GET handler，无 merchant 分支、无 currency 选择器，SDK URL 锁 EUR + iDEAL：

```js
router.get(`/${PRODUCT_KEY}`, (req, res) => {
  const product  = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  const amount   = req.query.amount || C.DEFAULT_AMOUNT
  const clientId = process.env.PAYPAL_CN_CLIENT_ID
  // iDEAL：components 含 marks；enable-funding=ideal 绕过买家国家门控；buyer-country=NL（inspect/probe）
  const sdkUrl = `https://www.paypal.com/sdk/js?client-id=${clientId}` +
                 `&components=buttons,marks&enable-funding=ideal&currency=EUR&buyer-country=NL`

  res.render(`paypal/jssdk-v5/${PRODUCT_KEY}`, {
    title:             product?.displayName ?? PRODUCT_KEY,
    provider:          PROVIDER,
    sdkVersion:        SDK_VERSION,
    currentProductKey: PRODUCT_KEY,
    currentSdkVersion: SDK_VERSION,
    sidebarProducts:   getProviderProducts(PROVIDER),
    showSidebar:       true,
    clientId,
    sdkUrl,
    defaultAmount:     amount,
  })
})
```

模块常量：
```js
const PROVIDER    = 'paypal'
const SDK_VERSION = 'jssdk-v5'
const PRODUCT_KEY = 'apm-jssdk'
```

---

## 6. DB / 配置

### 6.1 Supabase 插入（用户手动执行）

```sql
INSERT INTO demohub.products (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES (
  'paypal', 'jssdk-v5', 'apm-jssdk',
  'APM · iDEAL',
  'iDEAL（荷兰）银行重定向 APM，JSSDK Marks+Buttons + Orders v2，EUR，中国商户',
  true,
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM demohub.products WHERE provider='paypal' AND sdk_version='jssdk-v5')
);
```

### 6.2 .env

无新增变量（复用 `PAYPAL_CN_CLIENT_ID` / `PAYPAL_CN_CLIENT_SECRET`）。

---

## 7. 复用 / 不重建

- `config/paypal.js`：`getCNToken` / `getHeaders` / `API`（直接用）。
- `config/constants.js`：`INTENT` / `DEMO_*` / `EXPERIENCE_CONTEXT` / `validateAmount` / `DEFAULT_AMOUNT`
  （整文件 `const C = require(...)`）；**新增 `NL_SHIPPING`** 并导出。
- `spb-ecm.js`：ECM `buildBody` 建单结构模板（替换 payment_source + 货币 + 地址）。
- `contact-module.js`：自定义路由骨架 + 货币锁定 + inspect/probe 日志模式参考。

---

## 8. inspect/probe 清单（定稿）

> 遵循 [[feedback_v6_inspect_probe]]。

- [ ] create-order 响应：`payment_source.ideal` 回显结构、是否含 `links`（重定向 payer-action）。
- [ ] `payment_source.ideal` + Button `fundingSource: IDEAL` 是否冲突（重定向是否正常发起）。
- [ ] `ideal.experience_context.brand_name` / `locale` 是否被接受（不被接受则移除）。
- [ ] `purchase_units[0].shipping`（荷兰地址）是否被 iDEAL 使用 / 回显。
- [ ] `NL_SHIPPING.address.admin_area_1`（省份）是否必填。
- [ ] capture 响应 `captures[0].status` 真实取值（COMPLETED / PENDING）。
- [ ] sandbox 是否自动回流到 `onApprove`（无需独立 return 页面）。
