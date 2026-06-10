# 设计（后端 + DB）— APM Bancontact (apm-ordersv2) · JSSDK v5

> 日期：2026-06-10
> 关联需求：`docs/req/2026-06-10-req-jssdk-v5-apm-ordersv2.md`
> 关联 FE 设计：`docs/design/2026-06-10-design-fe-jssdk-v5-apm-ordersv2.md`
> 状态：设计中（Opus 只写文档；代码须切换非 Opus 模型实现）
> 模板来源：`spb-ecm.js`（buildBody）、`apm-jssdk.js`（APM payment_source + PayPal-Request-Id）、`fastlane-fp.js`（return 页 + 动态 origin redirect）

---

## 1. 路由总览（自定义路由，3 端点，**无 capture 端点**）

非工厂路由（货币锁 EUR、无货币选择器、`payment_source.bancontact` 自定义建单、自动捕获）。
新增 `src/routes/paypal/jssdk-v5/apm-ordersv2.js`，3 个 handler：

| 方法 | 路径 | 作用 |
|------|------|------|
| GET  | `/paypal/jssdk-v5/apm-ordersv2` | 渲染页面（EUR-only，**不注入 SDK**） |
| POST | `/paypal/jssdk-v5/api/apm-ordersv2/create-order` | 构造 `payment_source.bancontact` 订单 → 返回 `{ id, payerAction }` |
| GET  | `/paypal/jssdk-v5/apm-ordersv2/return` | 买家从银行返回；读 `?token=`，GET order details，渲染结果页 |

挂载（`app.js`，v5 区块 `apm-jssdk` 之后）：
```js
app.use(v5, require("./routes/paypal/jssdk-v5/apm-ordersv2"));
```

> **没有 capture 端点**：`processing_instruction: ORDER_COMPLETE_ON_PAYMENT_APPROVAL` 令买家批准后自动捕获，
> return 页只做 **GET order details**（只读核验），不调 capture。这是与 iDEAL（`apm-jssdk` 手动 capture）的根本差异。

---

## 2. 关键架构决策

### 2.1 纯 Orders v2 API（无 JSSDK）—— 本仓库首例

- GET handler **不构造 `sdkUrl`**，不向 EJS 注入 SDK 脚本。`header.ejs` 第 12 行 `if (typeof sdkUrl !== 'undefined' && sdkUrl)` 守卫天然支持「无 SDK」页面 —— 不传 `sdkUrl` 即不渲染脚本，无需改 header。
- 前端无 `paypalSDK`、无 Marks/Buttons；自建 HTML 按钮 + `window.location` 重定向（见 FE 设计）。

### 2.2 中国商户（getCNToken）

所有 token 调用统一 `getCNToken()`；SDK 不加载（无需 client-id 注入页面）。
Bancontact 资格：全球可用仅排除 RU/JP/BR → 中国商户可处理。

### 2.3 货币锁定 EUR

Bancontact 建单必须 EUR。GET handler 不渲染 currency 选择器；create-order 强制 `currency='EUR'`。
EUR 为两位小数货币（非 zero-decimal）。金额可调（沿用 `validateAmount` + 标准 amount 输入）。

```js
const CURRENCY = 'EUR'
const val = parseFloat(amount).toFixed(2)   // EUR 两位小数
```

### 2.4 payment_source 替换为 bancontact（核心）

把 `spb-ecm.js` 的 `payment_source.paypal` 替换为 `payment_source.bancontact`，并按用户 point 5 把 `experience_context` **嵌套在 `bancontact` 内部**（非文档主样例的顶层 `application_context`）：

```js
payment_source: {
  bancontact: {
    country_code: "BE",
    name:         "Cross Wen",               // 项目惯例买家名（文档样例为 "John Doe"）— inspect/probe
    experience_context: {
      brand_name:          "CWEN CHINA STORE",       // 用户 point 5
      shipping_preference: "SET_PROVIDED_ADDRESS",   // 用 purchase_units 提供的 BE 地址
      locale:              "en-BE",                   // inspect/probe（en-BE / nl-BE / fr-BE）
      return_url:          `${origin}/paypal/jssdk-v5/apm-ordersv2/return`,
      cancel_url:          `${origin}/paypal/jssdk-v5/apm-ordersv2/return?status=cancel`,
    },
  },
}
```

> 文档权威结构确认 `country_code` / `name`；用户 point 5 确认 `experience_context.{brand_name, shipping_preference, return_url, cancel_url}`。
> `locale` 为通用 experience_context 字段，先包含并标 inspect/probe。
> `bic`（预选银行）**省略**——让买家在重定向页选行。

### 2.5 动态 origin 构造 return_url / cancel_url

`return_url` 是**浏览器重定向**目标（买家浏览器跳回），**不是**服务器→服务器回调，因此 **localhost 可用**（区别于 `shipping-module` 的 `callback_url` 需公网可达）。
origin 在 create-order handler 内动态取：

```js
const origin = `${req.protocol}://${req.get('host')}`   // 本地 http://localhost:3000
```

参考 `fastlane-fp.js` 的 API 3DS return 用动态 origin 的做法。

### 2.6 PayPal-Request-Id 必传（含 payment_source 时）—— 「iDEAL 头参数问题」

PayPal Orders v2 规则：create-order 请求体含 `payment_source` 时，**必须**在 HTTP header 传 `PayPal-Request-Id`，否则返回 `PAYPAL_REQUEST_ID_REQUIRED` 422。
这正是 iDEAL demo 踩过的坑（见 `apm-jssdk.js`），Bancontact 同样适用：

```js
const { randomUUID } = require('crypto')
// ...
headers: getHeaders(token, { 'PayPal-Request-Id': randomUUID() })
```

`getHeaders(token, extra)` 已支持 extra 合并，无需改 `paypal.js`。`randomUUID()` 为 Node 内置。

### 2.7 processing_instruction = ORDER_COMPLETE_ON_PAYMENT_APPROVAL（自动捕获）

与 iDEAL **相反**：iDEAL 走 JSSDK 手动 capture，故**不设** processing_instruction；
Bancontact 纯 API 重定向流，文档要求设 `ORDER_COMPLETE_ON_PAYMENT_APPROVAL` → 买家批准后 PayPal 自动捕获 → 返回 return_url。return 页只 GET 核验。

### 2.8 比利时收货地址（新常量 BE_SHIPPING）

参考 `NL_SHIPPING` / `VENMO_SHIPPING`，在 `constants.js` 新增共享常量：

```js
const BE_SHIPPING = {
  name: { full_name: "Cross Wen" },
  address: {
    address_line_1: "Grote Markt 1",
    address_line_2: "",
    admin_area_2:   "Brussels",       // city
    admin_area_1:   "Brussels",       // region（Brussels-Capital）— inspect/probe 是否必填/格式
    postal_code:    "1000",
    country_code:   "BE",
  },
}
```
导出并加入 `module.exports`（「地址 & 电话」分组，紧随 `NL_SHIPPING`）。

> `shipping_preference: SET_PROVIDED_ADDRESS` 要求 purchase_units 提供完整地址。
> Bancontact 文档称「shipping callbacks 不支持」，但静态 `shipping` 仍可传；是否被真正使用 → inspect/probe。

### 2.9 return 页拿 order id —— 读 `?token=`

APM 重定向流 PayPal 通常把 order id 作为 `?token=` 拼到 return_url。return handler 读 `req.query.token`。
**inspect/probe 核实** token 是否真的出现（参考 `fastlane-fp.js` 注释：PayPal **card 3DS** 回调不含 orderId，但 **Buttons/APM** 重定向是 `?token=` 流）。
若实测无 token → 回退方案：建单前生成 sessionKey 嵌入 return_url，模块级 Map 反查（fastlane-fp 模式，本 demo 暂不实现，记为 watch-item）。

### 2.10 严格规则 13（仅 COMPLETED）

return 页对 GET order details 结果按规则 13 判：`status === 'COMPLETED'` **且** `purchase_units[0].payments.captures[0].status === 'COMPLETED'` → 成功；
其余（含 `PAYER_ACTION_REQUIRED` / `PENDING` / 无 captures）→ 错误态。

---

## 3. create-order 请求体 + handler（完整）

前端 POST body：`{ amount }`（货币固定 EUR）。

```js
const C = require('../../../config/constants')
const { randomUUID } = require('crypto')

function buildBody(amount, origin) {
  const val = parseFloat(amount).toFixed(2)            // EUR 两位小数
  const eur = (v) => ({ currency_code: "EUR", value: v })

  return {
    intent: C.INTENT.CAPTURE,                          // Bancontact 仅支持 CAPTURE
    processing_instruction: "ORDER_COMPLETE_ON_PAYMENT_APPROVAL",   // 自动捕获

    payment_source: {
      bancontact: {
        country_code: "BE",
        name:         "Cross Wen",
        experience_context: {
          brand_name:          "CWEN CHINA STORE",
          shipping_preference: "SET_PROVIDED_ADDRESS",
          locale:              "en-BE",                  // inspect/probe
          return_url:          `${origin}/paypal/jssdk-v5/apm-ordersv2/return`,
          cancel_url:          `${origin}/paypal/jssdk-v5/apm-ordersv2/return?status=cancel`,
        },
      },
    },

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

      shipping: C.BE_SHIPPING,                          // 比利时地址
    }],
  }
}
```

create-order handler（提取 payer-action 链接返回前端）：
```js
router.post(`/api/${PRODUCT_KEY}/create-order`, async (req, res) => {
  try {
    const amount    = req.body.amount || C.DEFAULT_AMOUNT
    const amountErr = C.validateAmount(amount, 'EUR')
    if (amountErr) return res.status(400).json({ error: amountErr })

    const origin = `${req.protocol}://${req.get('host')}`
    const token  = await getCNToken()
    const body   = buildBody(amount, origin)
    const r = await fetch(`${API}/v2/checkout/orders`, {
      // payment_source 存在时 PayPal 强制要求 PayPal-Request-Id（PAYPAL_REQUEST_ID_REQUIRED）
      method: 'POST', headers: getHeaders(token, { 'PayPal-Request-Id': randomUUID() }), body: JSON.stringify(body),
    })
    const order = await r.json()
    console.log('[apm-ordersv2 create-order]', JSON.stringify(order, null, 2))   // inspect/probe
    if (!r.ok) return res.status(r.status).json({ error: order.message || 'Create order failed', details: order })

    // 提取 payer-action 重定向链接
    const link = (order.links || []).find(function (l) { return l.rel === 'payer-action' })
    if (!link) return res.status(502).json({ error: 'No payer-action link in order response', details: order })

    res.json({ id: order.id, payerAction: link.href })
  } catch (err) {
    console.error('[apm-ordersv2] create-order error:', err.message)
    res.status(500).json({ error: err.message })
  }
})
```

---

## 4. return 端点逻辑（GET，只读核验）

```js
router.get(`/${PRODUCT_KEY}/return`, async (req, res) => {
  const backUrl = `/paypal/jssdk-v5/${PRODUCT_KEY}`
  const render  = (state, orderJson) => res.render(`paypal/jssdk-v5/${PRODUCT_KEY}-return`, {
    title: 'APM · Bancontact — Return',
    provider: PROVIDER, sdkVersion: SDK_VERSION,
    currentProductKey: PRODUCT_KEY, currentSdkVersion: SDK_VERSION,
    sidebarProducts: getProviderProducts(PROVIDER), showSidebar: true,
    state, orderJson, backUrl,
  })

  try {
    // 取消分支
    if (req.query.status === 'cancel') return render('cancelled', null)

    const orderID = req.query.token            // inspect/probe：确认 PayPal 回传 ?token=
    if (!orderID) return render('error', null)

    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderID}`, {
      method: 'GET', headers: getHeaders(token),
    })
    const order = await r.json()
    console.log('[apm-ordersv2 return GET order]', JSON.stringify(order, null, 2))   // inspect/probe
    if (!r.ok) return render('error', JSON.stringify(order, null, 2))

    // 规则 13：status COMPLETED && captures[0].status COMPLETED
    const cap = order.purchase_units &&
                order.purchase_units[0] &&
                order.purchase_units[0].payments &&
                order.purchase_units[0].payments.captures &&
                order.purchase_units[0].payments.captures[0]
    const ok = order.status === 'COMPLETED' && cap && cap.status === 'COMPLETED'
    render(ok ? 'success' : 'error', JSON.stringify(order, null, 2))
  } catch (err) {
    console.error('[apm-ordersv2] return error:', err.message)
    render('error', null)
  }
})
```

> **watch-item（inspect/probe）**：若实测自动捕获**未**发生（`status` 非 COMPLETED 或无 captures），
> 在 return handler 补一次 capture 调用作 fallback（记 debug-log）。当前按文档假设自动捕获成功。

---

## 5. GET 端点（页面渲染，无 SDK）

```js
router.get(`/${PRODUCT_KEY}`, (req, res) => {
  const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  const amount  = req.query.amount || C.DEFAULT_AMOUNT
  // 纯 API：不构造 sdkUrl（header.ejs 守卫会跳过 SDK 脚本）
  res.render(`paypal/jssdk-v5/${PRODUCT_KEY}`, {
    title:             product?.displayName ?? PRODUCT_KEY,
    provider:          PROVIDER,
    sdkVersion:        SDK_VERSION,
    currentProductKey: PRODUCT_KEY,
    currentSdkVersion: SDK_VERSION,
    sidebarProducts:   getProviderProducts(PROVIDER),
    showSidebar:       true,
    defaultAmount:     amount,
  })
})
```

模块常量：
```js
const PROVIDER    = 'paypal'
const SDK_VERSION = 'jssdk-v5'
const PRODUCT_KEY = 'apm-ordersv2'
```

---

## 6. DB / 配置

### 6.1 Supabase 插入（用户手动执行）

```sql
INSERT INTO demohub.products (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES (
  'paypal', 'jssdk-v5', 'apm-ordersv2',
  'APM · Bancontact (Orders v2)',
  'Bancontact（比利时）银行重定向 APM，纯 Orders v2 API（无 JSSDK），EUR，中国商户，自动捕获',
  true,
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM demohub.products WHERE provider='paypal' AND sdk_version='jssdk-v5')
);
```

### 6.2 .env

无新增变量（复用 `PAYPAL_CN_CLIENT_ID` / `PAYPAL_CN_CLIENT_SECRET`）。

---

## 7. 复用 / 不重建

- `config/paypal.js`：`getCNToken` / `getHeaders` / `API`（直接用）。
- `config/constants.js`：`INTENT` / `DEMO_*` / `validateAmount` / `DEFAULT_AMOUNT`（整文件 `const C = require(...)`）；**新增 `BE_SHIPPING`** 并导出。
- `spb-ecm.js`：ECM `buildBody` 建单结构模板（替换 payment_source + 货币 + 地址 + processing_instruction）。
- `apm-jssdk.js`：APM payment_source 结构 + PayPal-Request-Id header 模式。
- `fastlane-fp.js` / `fastlane-fp-return.ejs`：return 页面 + 动态 origin redirect 模式。

---

## 8. inspect/probe 清单（定稿前核实）

> 遵循 [[feedback_v6_inspect_probe]]。

- [ ] create-order 响应 `links[]`：`payer-action` href 真实结构（域名 / 路径 / token 参数）。
- [ ] PayPal 是否把 order id 作为 `?token=` 拼到 return_url（**核心假设**）；是否还带 `PayerID` 等。
- [ ] 返回时是否已**自动捕获**（`status===COMPLETED` 且有 `captures[0]`，无需调 capture）；若否 → 补 capture fallback。
- [ ] `bancontact.experience_context.brand_name` / `locale` 是否被接受（不接受则移除/调整）。
- [ ] `bancontact.name`（"Cross Wen" vs 文档 "John Doe"）是否有要求。
- [ ] `purchase_units[0].shipping`（比利时地址）+ `SET_PROVIDED_ADDRESS` 是否被使用 / 回显。
- [ ] `BE_SHIPPING.address.admin_area_1`（region）是否必填及正确格式。
- [ ] cancel 分支：银行页取消是否确实回到 `cancel_url`（`?status=cancel`）。
