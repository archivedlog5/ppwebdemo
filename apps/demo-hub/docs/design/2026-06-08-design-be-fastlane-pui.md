# 后端 + DB 设计 — Fastlane Payment UI (fastlane-pui) · JSSDK v5

> 日期：2026-06-08
> 关联需求：`docs/req/2026-06-08-req-fastlane-pui.md`
> 关联前端设计：`docs/design/2026-06-08-design-fe-fastlane-pui.md`

---

## 1. 文件改动总览

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/config/paypal.js` | **小幅非破坏性修改** | `getUSClientToken()` 增加可选 `{ intent }` 参数 |
| `src/routes/paypal/jssdk-v5/fastlane-pui.js` | **新增** | 自定义路由（GET 渲染 + POST create-order） |
| `src/views/paypal/jssdk-v5/fastlane-pui.ejs` | 新增 | 见前端设计 |
| `src/public/js/paypal/jssdk-v5/fastlane-pui.js` | 新增 | 见前端设计 |
| `src/app.js` | 修改 | 挂载路由 |
| Supabase `demohub.products` | 数据 | INSERT 一行（用户手动执行） |
| `.env` / `.env.example` | 文档 | 补 `PAYPAL_US_MERCHANT_DOMAINS` 说明（若缺）；无新增 key |

不新增 env 变量：复用 `PAYPAL_US_CLIENT_ID` / `PAYPAL_US_CLIENT_SECRET` / `PAYPAL_US_MERCHANT_DOMAINS`。

---

## 2. config/paypal.js — client token 改动

`getUSClientToken()` 当前生成 `response_type=client_token` + `domains[]`，但**缺 `intent=sdk_init`**，
Fastlane 初始化要求 `intent=sdk_init`。

**方案（推荐，非破坏性）**：加可选参数，默认行为不变，v6 现有调用方不受影响。

```js
// 伪代码示意（实现阶段由非 Opus 模型写）
async function getUSClientToken({ intent } = {}) {
  const params = {
    grant_type: 'client_credentials',
    response_type: 'client_token',
    'domains[]': process.env.PAYPAL_US_MERCHANT_DOMAINS,
  }
  if (intent) params.intent = intent      // Fastlane 传 'sdk_init'
  // ... 其余沿用现有实现（Basic auth = PAYPAL_US_CLIENT_ID:SECRET）
}
```

- Fastlane 路由调用：`await getUSClientToken({ intent: 'sdk_init' })`
- client token **不缓存**，每次 GET 页面现取（沿用现有 getUSClientToken 不缓存的设计）。
- Orders API 的 access token **复用现有 `getUSToken()`**（已缓存 8h，同 `PAYPAL_US_*` 凭证）。

---

## 3. 路由 fastlane-pui.js（自定义路由）

参考 `acdc.js` 的自定义路由结构。`PROVIDER='paypal'`, `SDK='jssdk-v5'`, `KEY='fastlane-pui'`。

### 3.1 GET `/fastlane-pui`

```
- product   = getProduct('paypal','jssdk-v5','fastlane-pui')
- clientId  = process.env.PAYPAL_US_CLIENT_ID
- sdkClientToken = await getUSClientToken({ intent: 'sdk_init' })
- currency  = 'USD'（锁定，不读 query.currency）
- amount    = req.query.amount || DEFAULT_AMOUNT
- res.render('paypal/jssdk-v5/fastlane-pui', {
    title, provider, sdkVersion, currentProductKey, currentSdkVersion,
    sidebarProducts: getProviderProducts('paypal'), showSidebar: true,
    clientId,
    sdkClientToken,
    sdkUrl: `https://www.paypal.com/sdk/js?client-id=${clientId}&components=fastlane&buyer-country=US&currency=USD`,
    defaultAmount: amount,
    currency,
  })
```

### 3.2 POST `/api/fastlane-pui/create-order`

请求体：`{ paymentToken, shippingAddress?, amount }`

```
- amount   = req.body.amount || DEFAULT_AMOUNT
- currency = 'USD'
- amountErr = validateAmount(amount, currency) → 400 if error
- 校验 paymentToken?.id 存在 → 400 if missing
- token = await getUSToken()                       // US 账户 access token
- body  = buildFastlaneOrderBody(amount, paymentToken, shippingAddress)
- r = fetch(`${API}/v2/checkout/orders`, {
        method: 'POST',
        headers: getHeaders(token, { 'PayPal-Request-Id': Date.now().toString() }),
        body: JSON.stringify(body),
      })
- order = await r.json()
- 若 !r.ok → res.status(r.status).json({ error: order.message, details: order })
- res.json(order)        // 返回完整 order（含 captures）；前端按规则 13 判定
```

> `getHeaders` 已含 `Prefer: return=representation`，create-order 返回完整 order 表示。

### 3.3 Order body 组装

```js
// 伪代码
function buildFastlaneOrderBody(amount, paymentToken, shippingAddress) {
  const value = parseFloat(amount).toFixed(2)   // USD，两位小数
  const pu = {
    amount: {
      currency_code: 'USD',
      value,
      breakdown: { item_total: { currency_code: 'USD', value } },
    },
    description: C.DEMO_DESCRIPTION,
    items: [{ ...C.DEMO_ITEM, unit_amount: { currency_code: 'USD', value } }],
  }
  if (shippingAddress) {
    pu.shipping = mapShipping(shippingAddress)    // camelCase → snake_case
  }
  return {
    intent: 'CAPTURE',
    payment_source: { card: { single_use_token: paymentToken.id } },
    purchase_units: [pu],
  }
}
```

### 3.4 shippingAddress 映射（camelCase → PayPal snake_case）

前端结构见前端设计 §5。映射规则（参考官方 sample）：

```
shipping = {
  type: 'SHIPPING',
  name: { full_name: shippingAddress.name.fullName },        // 若存在
  address: {
    address_line_1: shippingAddress.address.addressLine1,
    address_line_2: shippingAddress.address.addressLine2,
    admin_area_2:   shippingAddress.address.adminArea2,       // city
    admin_area_1:   shippingAddress.address.adminArea1,       // state
    postal_code:    shippingAddress.address.postalCode,
    country_code:   shippingAddress.address.countryCode,
  },
  // 若 phoneNumber.countryCode && nationalNumber：
  phone_number: {
    country_code:    shippingAddress.phoneNumber.countryCode,
    national_number: shippingAddress.phoneNumber.nationalNumber,
  },
}
```

会员路径下 `profileData.shippingAddress` 结构相同，可走同一 `mapShipping`。

### 3.5 自动扣款验证（关键不确定性）

- **预期**：`single_use_token` + `intent: CAPTURE` 时，create-order 响应直接含
  `purchase_units[0].payments.captures[0].status === 'COMPLETED'`，无需单独 capture。
- **验证**：实现后用 inspect/probe 打印 order，QA 用例确认 captures 路径与 status。
- **回退方案**：若返回 `CREATED`/`APPROVED`（未自动 capture），新增
  `POST /api/fastlane-pui/capture-order`（`/v2/checkout/orders/:id/capture`），
  前端 checkout 改为「create → 拿 id → capture」两步。记入 `docs/debug-log.md`。

---

## 4. app.js 挂载

在 v5 区块（现有 `plm-js` 之后）追加：

```js
app.use(v5, require("./routes/paypal/jssdk-v5/fastlane-pui"));
```

---

## 5. Supabase 数据（用户手动执行）

> `sort_order` 取 **paypal / jssdk-v5 分组内当前最大值 + 1**。
> 由于本环境无 execute_sql 工具，无法读当前最大值，请按下方说明替换 `<下一个可用 sort_order>`。

### 5.1 INSERT

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('paypal', 'jssdk-v5', 'fastlane-pui', 'Fastlane Payment UI',
   'Fastlane Quick Start — guest/member checkout via prebuilt Payment UI component (single_use_token)',
   true, <下一个可用 sort_order>);
```

### 5.2 如何取 sort_order（先查后插）

```sql
-- 1) 查当前 v5 分组最大 sort_order
SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order
FROM demohub.products
WHERE provider = 'paypal' AND sdk_version = 'jssdk-v5';

-- 2) 用上面的结果替换 INSERT 里的 <下一个可用 sort_order>
```

或一步到位（自动取下一个序号）：

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
SELECT
  'paypal', 'jssdk-v5', 'fastlane-pui', 'Fastlane Payment UI',
  'Fastlane Quick Start — guest/member checkout via prebuilt Payment UI component (single_use_token)',
  true,
  COALESCE(MAX(sort_order), 0) + 1
FROM demohub.products
WHERE provider = 'paypal' AND sdk_version = 'jssdk-v5';
```

> 唯一约束 `UNIQUE(provider, sdk_version, product_key)`：重复执行会冲突，需要重跑可先
> `DELETE FROM demohub.products WHERE provider='paypal' AND sdk_version='jssdk-v5' AND product_key='fastlane-pui';`

### 5.3 生效

插入后**重启 demo-hub**（启动时一次性读入内存 Map），首页即出现 fastlane-pui 卡片。

---

## 6. 环境变量

无新增 key。确认 `.env` 已配置：

```
PAYPAL_US_CLIENT_ID=...
PAYPAL_US_CLIENT_SECRET=...
PAYPAL_US_MERCHANT_DOMAINS=<已在 PayPal 后台为 Fastlane/ACDC 配置白名单的根域名>
```

> `PAYPAL_US_MERCHANT_DOMAINS` 须与 PayPal 开发者后台 Fastlane 域名白名单一致，否则 client token
> 无法用于该域名，Fastlane 组件初始化会失败。
