# 设计（后端 + DB）— Contact Module (contact-module) · JSSDK v5

> 日期：2026-06-10
> 关联需求：`docs/req/2026-06-10-req-jssdk-v5-contact-module.md`
> 状态：设计中（Opus 只写文档；代码须切换非 Opus 模型实现）

---

## 1. 路由总览（自定义路由，3 端点）

非工厂路由（create-order 需读下拉的 `contactPreference`；capture 端点需先 GET Order 取联系方式）。
新增 `src/routes/paypal/jssdk-v5/contact-module.js`，3 个 handler：

| 方法 | 路径 | 作用 |
|------|------|------|
| GET  | `/paypal/jssdk-v5/contact-module` | 渲染页面（US-only），注入 US client-id 的 SDK URL |
| POST | `/paypal/jssdk-v5/api/contact-module/create-order` | 按 `contactPreference` 构造 ECS 订单（含 contact 字段） |
| POST | `/paypal/jssdk-v5/api/contact-module/capture-order` | **GET Order 读联系方式 → capture → 返回 `{contact, capture}`**（Approach A） |

挂载（`app.js`，v5 区块 `shipping-module` 之后）：
```js
app.use(v5, require("./routes/paypal/jssdk-v5/contact-module"));
```

---

## 2. 关键架构决策

### 2.1 仅 US 商户（无切换）

模块 US-only。所有 token 调用统一 `getUSToken()`；SDK URL 用 `PAYPAL_US_CLIENT_ID`。
不引入 `merchant` 参数 / CN 分支（与 shipping-module 的 CN/US 切换不同）。

### 2.2 货币锁定 USD

US-only 模块，文档示例均 USD。GET handler 不渲染 currency 选择器；create-order 强制 `currency='USD'`。
金额仍可调（沿用 `validateAmount` + 标准 amount 输入）。

### 2.3 contact_preference 来自前端下拉（白名单校验）

create-order 读 `req.body.contactPreference`，对白名单校验，非法则 fallback 默认值：
```js
const CONTACT_PREFS = ['NO_CONTACT_INFO', 'UPDATE_CONTACT_INFO', 'RETAIN_CONTACT_INFO']
const pref = CONTACT_PREFS.includes(req.body.contactPreference)
  ? req.body.contactPreference
  : 'UPDATE_CONTACT_INFO'   // 默认最具演示价值
```

### 2.4 Approach A — capture 端点折叠 GET Order

capture 端点内部：
1. `GET /v2/checkout/orders/{orderID}` → **console.log 完整响应**（inspect/probe）
   → 读 `purchase_units[0].shipping.email_address` + `phone_number`。
2. `POST /v2/checkout/orders/{orderID}/capture` → **console.log 完整响应**。
3. 规则 13 判定 `captures[0].status === 'COMPLETED'`。
4. 返回 `{ id, status, contact: { email, phone }, captureId, raw }`。

> inspect/probe（§7）：若 capture 响应本身已含 `shipping` 联系方式，可在定稿时去掉 GET Order 调用。

### 2.5 固定 sandbox 联系方式（路由内置常量）

参考 shipping-module 把 `OPTIONS` 内置路由文件的做法（产品自包含，规则 1），
在 `contact-module.js` 内置：
```js
const DEMO_CONTACT = {
  email_address: 'buyer-contact@example.com',
  phone_number:  { country_code: '1', national_number: '5555555555' },
}
```
> 与买家 PayPal 账户 email 有意不同，凸显「商户提供的联系方式」概念（礼品订单场景）。

---

## 3. create-order 请求体（payment_source.paypal + shipping contact）

基于 `spb-ecs.js`（ECS 建单）+ 文档 contact 字段。前端 POST body：`{ amount, contactPreference }`。

```js
{
  intent: "CAPTURE",

  payment_source: {
    paypal: {
      experience_context: {
        brand_name:          C.EXPERIENCE_CONTEXT.brand_name,
        shipping_preference: "SET_PROVIDED_ADDRESS",   // 商户传地址
        contact_preference:  pref,                     // 下拉值（白名单校验后）
        user_action:         "PAY_NOW",                // 文档示例
        return_url:          C.EXPERIENCE_CONTEXT.return_url,
        cancel_url:          C.EXPERIENCE_CONTEXT.cancel_url,
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
      currency_code: "USD",
      value:         val,                              // amount.toFixed(2)
      breakdown: { item_total: { currency_code: "USD", value: val } },
    },
    items: [{ ...C.DEMO_ITEM, unit_amount: { currency_code: "USD", value: val } }],

    // 文档核心：shipping 携带联系方式（email + phone）+ 名称 + US 地址
    shipping: {
      ...C.SANDBOX_SHIPPING,                           // name + US address（CA）
      email_address: DEMO_CONTACT.email_address,
      phone_number:  DEMO_CONTACT.phone_number,
    },
  }],
}
```

> `C.SANDBOX_SHIPPING` = `{ name:{full_name:'Cross Wen'}, address:{...US CA...} }`，
> 缺 email/phone，故用 `DEMO_CONTACT` 补足。`SET_PROVIDED_ADDRESS` 要求 address 存在 ✓。

返回 `{ id }`（order id）。

---

## 4. capture-order 端点逻辑（Approach A）

入参：`req.body = { orderID }`。

```js
const token = await getUSToken()

// 1) GET Order — 取最新联系方式（UPDATE 模式下含买家编辑结果）
const g = await fetch(`${API}/v2/checkout/orders/${orderID}`, { headers: getHeaders(token) })
const orderDetails = await g.json()
console.log('[contact-module get-order]', JSON.stringify(orderDetails, null, 2))   // inspect/probe

const shipping = orderDetails.purchase_units?.[0]?.shipping || {}
const contact = {
  email: shipping.email_address || null,
  phone: shipping.phone_number
    ? `${shipping.phone_number.country_code || ''} ${shipping.phone_number.national_number || ''}`.trim()
    : null,
}

// 2) Capture
const c = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
  method: 'POST', headers: getHeaders(token),
})
const captureResult = await c.json()
console.log('[contact-module capture]', JSON.stringify(captureResult, null, 2))    // inspect/probe
if (!c.ok) return res.status(c.status).json({ error: captureResult.message || 'Capture failed', details: captureResult })

// 3) 规则 13 判定（前端再判一次，后端也返回完整体）
const cap = captureResult.purchase_units?.[0]?.payments?.captures?.[0]

res.json({
  id:        captureResult.id,
  status:    cap ? cap.status : 'unknown',
  captureId: cap ? cap.id : null,
  contact,                       // 最终联系方式（GET Order 读取）
  raw:       captureResult,      // 前端按规则 13 复判
})
```

> **inspect/probe**：同时打印 GET Order 与 capture 两个响应，核对 capture 是否已含 shipping 联系方式
> （若含，则定稿去掉 GET Order，省一次调用）。

---

## 5. GET 端点（页面渲染）

参考 shipping-module GET handler，但**无 merchant 分支、无 currency 选择器**：

```js
router.get(`/${PRODUCT_KEY}`, (req, res) => {
  const product  = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  const amount   = req.query.amount || C.DEFAULT_AMOUNT
  const clientId = process.env.PAYPAL_US_CLIENT_ID
  // US-only：buyer-country=US 让 sandbox 美国买家登录 + 触发 Contact Module
  const sdkUrl = `https://www.paypal.com/sdk/js?client-id=${clientId}&components=buttons&buyer-country=US&currency=USD`

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
    demoContact:       DEMO_CONTACT,   // 页面展示「将发送的固定联系方式」
  })
})
```

---

## 6. DB / 配置

### 6.1 Supabase 插入（用户手动执行）

```sql
INSERT INTO demohub.products (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES (
  'paypal', 'jssdk-v5', 'contact-module',
  'Contact Module',
  '买家在 PayPal 结账查看/编辑 email 与电话（contact_preference，US only）',
  true,
  (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM demohub.products WHERE provider='paypal' AND sdk_version='jssdk-v5')
);
```

### 6.2 .env

无新增变量（复用 `PAYPAL_US_CLIENT_ID` / `PAYPAL_US_*` token 凭证）。

---

## 7. 复用 / 不重建

- `config/paypal.js`：`getUSToken` / `getHeaders` / `API`（直接用）。
- `config/constants.js`：`INTENT` / `DEMO_*` / `EXPERIENCE_CONTEXT` / `SANDBOX_SHIPPING`
  / `validateAmount`（整文件 `const C = require(...)`）。
- `spb-ecs.js`：ECS 建单参数结构模板。
- `shipping-module.js`：自定义路由骨架 + GET Order/capture + inspect/probe 日志模式参考。

---

## 8. inspect/probe 清单（定稿）

> 遵循 [[feedback_v6_inspect_probe]]。

- [ ] GET Order 响应 `purchase_units[0].shipping` 真实字段（email_address / phone_number 结构）。
- [ ] capture 响应是否已含 shipping 联系方式（决定是否省 GET Order）。
- [ ] UPDATE 模式：买家编辑后 GET Order 返回的 email/phone 确为改后值。
- [ ] RETAIN / NO_CONTACT_INFO：GET Order 返回值 == 商户传入值。
