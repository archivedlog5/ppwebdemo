# Design (BE) — JSSDK v6 PLM-JS

**Date:** 2026-06-05
**Product key:** `plm-js`
**Route:** `/paypal/jssdk-v6/plm-js`
**关联：** req / design-fe（同日 `*-jssdk-v6-plm-js.md`）

---

## 1. 目标

后端只需提供一个 **GET-only 自定义路由**，渲染 plm-js 页面并注入配置。PLM 无订单 API，无 POST 端点，无 PayPal REST 调用。结构与 `plm-html.js` 几乎逐字一致。

---

## 2. 文件结构

```
routes/paypal/jssdk-v6/plm-js.js     ← GET-only 自定义路由（新建）
app.js                                ← 挂载一行（修改）
Supabase demohub.products             ← 插入一行
```

**不使用工厂函数**：`_factory.js` 强制要求 `buildBody`（订单 body），PLM 无订单，故自定义路由。

---

## 3. 路由设计

### GET `/paypal/jssdk-v6/plm-js`

唯一 GET handler，无 POST endpoint。逻辑对照 `plm-html.js`：

```js
'use strict'

const { Router } = require('express')
const { getProduct, getProviderProducts } = require('../../../config/products')

const PROVIDER    = 'paypal'
const SDK_VERSION = 'jssdk-v6'
const PRODUCT_KEY = 'plm-js'

const COUNTRY_TO_CUR = { US: 'USD', AU: 'AUD', DE: 'EUR', ES: 'EUR', FR: 'EUR', IT: 'EUR', GB: 'GBP', CA: 'CAD' }
const PLM_COUNTRIES  = ['US', 'AU', 'DE', 'ES', 'FR', 'IT', 'GB', 'CA']

const router = Router()

router.get(`/${PRODUCT_KEY}`, (req, res) => {
  const country  = PLM_COUNTRIES.includes(req.query.country) ? req.query.country : 'US'
  const currency = COUNTRY_TO_CUR[country] || 'USD'
  const amount   = req.query.amount || '100.00'
  const product  = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)

  res.render(`paypal/jssdk-v6/${PRODUCT_KEY}`, {
    title:             product?.displayName ?? PRODUCT_KEY,
    provider:          PROVIDER,
    sdkVersion:        SDK_VERSION,
    currentProductKey: PRODUCT_KEY,
    currentSdkVersion: SDK_VERSION,
    sidebarProducts:   getProviderProducts(PROVIDER),
    showSidebar:       true,
    clientId:          process.env.PAYPAL_CN_CLIENT_ID,
    defaultAmount:     amount,
    currency,
    country,
  })
})

module.exports = router
```

**与 plm-html.js 的差异：** 仅 `PRODUCT_KEY = 'plm-js'` 与 render 路径不同。其余完全相同。

---

## 4. EJS 注入变量

| 变量 | 值 |
|---|---|
| `title` | Supabase `display_name`（fallback `plm-js`） |
| `clientId` | `process.env.PAYPAL_CN_CLIENT_ID` |
| `defaultAmount` | `req.query.amount \|\| '100.00'` |
| `currency` | `COUNTRY_TO_CUR[country]`（映射后） |
| `country` | `req.query.country`（白名单校验，fallback `US`） |
| `sidebarProducts` | `getProviderProducts('paypal')` |
| `showSidebar` | `true` |

---

## 5. 挂载（`app.js`）

在 v6 路由块（紧随 `plm-html` 之后）添加：

```js
app.use(v6, require('./routes/paypal/jssdk-v6/plm-js'))
```

> `v6` 为已存在的路由前缀常量（`/paypal/jssdk-v6`），与其他 v6 产品一致。

---

## 6. Supabase 数据

紧接 plm-html 之后排序：

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
SELECT 'paypal', 'jssdk-v6', 'plm-js',
       'PLM — JS',
       'Pay Later messaging via JS fetchContent() + setContent() + createLearnMore()',
       true,
       COALESCE(MAX(sort_order), 0) + 1
FROM demohub.products
WHERE provider = 'paypal' AND sdk_version = 'jssdk-v6';
```

> 用子查询取当前 v6 最大 sort_order + 1，避免硬编码。执行后重启 demo-hub 生效（启动时读一次缓存内存）。

---

## 7. 无后端支付链路

| v6 支付产品 | plm-js |
|---|---|
| create-order POST | ❌ 无 |
| capture-order POST | ❌ 无 |
| `getCNToken()` 调用 | ❌ 无（仅注入 clientId 给前端 SDK） |
| `/v2/checkout/orders` | ❌ 无 |

后端职责仅"渲染页面 + 注入 currency/country/clientId"。所有 PLM 内容拉取由前端 SDK 直连 PayPal 完成。

---

## 8. 成功标准（BE）

- [ ] `GET /paypal/jssdk-v6/plm-js` 返回 200，渲染页面。
- [ ] `?country=DE` → 注入 `currency=EUR`、`country=DE`。
- [ ] 非法 `?country=XX` → fallback `US` / `USD`。
- [ ] Supabase 行插入后首页出现 PLM-JS 卡片。
