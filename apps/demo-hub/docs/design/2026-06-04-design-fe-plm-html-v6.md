# Design: JSSDK v6 PLM-HTML Demo

**Date:** 2026-06-04  
**Product key:** `plm-html`  
**Route:** `/paypal/jssdk-v6/plm-html`  
**UI reference:** `jssdk-v5/plm-div`

---

## 1. 目标

演示 PayPal Messages SDK v6 的 **HTML 配置模式**（`auto-bootstrap`）：通过 `<paypal-message>` web component 的 HTML 属性声明样式，SDK 自动 observe 属性变化并重新拉取内容，无需显式调用 JS `fetchContent()`。

plm-js（独立 demo）负责演示 JS `fetchContent()` 模式，本 demo 不涉及。

---

## 2. 文件结构

```
routes/paypal/jssdk-v6/plm-html.js          ← GET-only 自定义路由
views/paypal/jssdk-v6/plm-html.ejs          ← 页面模板
public/js/paypal/jssdk-v6/plm-html.js       ← 前端 JS
```

**不使用工厂函数**（`_factory.js` 强制要求 `buildBody`，PLM 无需订单 API）。

---

## 3. 路由设计

### GET `/paypal/jssdk-v6/plm-html`

自定义路由，只有一个 GET handler，无 POST API endpoint。

**Country → Currency 映射（服务端）：**

```js
const COUNTRY_TO_CUR = { US:'USD', AU:'AUD', DE:'EUR', ES:'EUR', FR:'EUR', IT:'EUR', GB:'GBP', CA:'CAD' }
const PLM_COUNTRIES  = ['US','AU','DE','ES','FR','IT','GB','CA']
```

优先读 `req.query.country`，fallback 到 `US`。

**EJS 注入变量：**

| 变量 | 值 |
|---|---|
| `title` | Supabase `display_name` |
| `clientId` | `process.env.PAYPAL_CN_CLIENT_ID` |
| `defaultAmount` | `req.query.amount \|\| DEFAULT_AMOUNT` |
| `currency` | `COUNTRY_TO_CUR[country]`（映射后） |
| `country` | `req.query.country \|\| 'US'` |
| `sidebarProducts` | `getProviderProducts('paypal')` |
| `showSidebar` | `true` |

**挂载（`app.js`）：**

```js
app.use(v6, require('./routes/paypal/jssdk-v6/plm-html'))
```

**Supabase 插入：**

```sql
INSERT INTO demohub.products (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES ('paypal', 'jssdk-v6', 'plm-html', 'PLM — HTML', 'Pay Later messaging via <paypal-message> auto-bootstrap HTML attributes', true, <next_sort_order>);
```

---

## 4. 页面布局

```
┌─────────────────────────────────────────┐
│  badge + title + description            │
├─────────────────────────────────────────┤
│  [Buyer Country ▼]   [Amount: 100.00 ] │
├─────────────────────────────────────────┤
│  ── PLACEMENTS ──────────────────────── │
│  Product Page  · logo-type="WORDMARK"   │
│  [white card] <paypal-message>          │
│                                         │
│  Cart  · logo-type="WORDMARK" RIGHT     │
│  [white card] <paypal-message>          │
│                                         │
│  Checkout  · logo-type="TEXT" INLINE    │
│  [white card] <paypal-message>          │
├─────────────────────────────────────────┤
│  ── STYLE GALLERY ───────────────────── │
│  8 rows (see §5)                        │
├─────────────────────────────────────────┤
│  supported markets hint                 │
└─────────────────────────────────────────┘
```

**注意：** v6 PLM 无 flex/banner 格式（v5 的 `layout="flex"` 在 v6 不存在），去掉 Home 8x1 / Category 20x1。

---

## 5. Placement 区属性配置

| Placement | `logo-type` | `logo-position` | `text-color` |
|---|---|---|---|
| Product Page | `WORDMARK` | `LEFT`（默认） | `BLACK` |
| Cart | `WORDMARK` | `RIGHT` | `BLACK` |
| Checkout | `TEXT` | `INLINE` | `BLACK` |

每个元素完整形态：

```html
<paypal-message
  auto-bootstrap
  amount="<%= defaultAmount %>"
  currency-code="<%= currency %>"
  logo-type="WORDMARK"
  logo-position="LEFT"
  text-color="BLACK"
></paypal-message>
```

label 格式（placement 上方）：

```
Product Page  logo-type="WORDMARK"
```

---

## 6. Style Gallery 配置（8 行）

| # | `logo-type` | `logo-position` | `text-color` | 卡片背景 |
|---|---|---|---|---|
| 1 | `MONOGRAM` | `LEFT` | `BLACK` | 白色 |
| 2 | `WORDMARK` | `LEFT` | `BLACK` | 白色 |
| 3 | `TEXT` | `INLINE` | `BLACK` | 白色 |
| 4 | `WORDMARK` | `INLINE` | `BLACK` | 白色 |
| 5 | `WORDMARK` | `TOP` | `BLACK` | 白色 |
| 6 | `MONOGRAM` | `LEFT` | `MONOCHROME` | 白色 |
| 7 | `WORDMARK` | `LEFT` | `MONOCHROME` | 白色 |
| 8 | `MONOGRAM` | `LEFT` | `WHITE` | 深色（`#1a1a2e`） |

约束说明（标注在 label 里）：
- `TEXT` → `logo-position` 强制 `INLINE`（文档规定）
- `MONOGRAM` → `logo-position` 强制 `LEFT`（文档规定）

每行 label 格式：

```
logo-type="MONOGRAM" · text-color="BLACK"
```

---

## 7. JS 行为（`plm-html.js`）

### 7.1 `window.DEMO` 注入（EJS）

```js
window.DEMO = {
  clientId:      '<%= clientId %>',
  currency:      '<%= currency %>',
  defaultAmount: '<%= defaultAmount %>',
  country:       '<%= country %>',
}
```

### 7.2 SDK 加载顺序（EJS body 底部）

```html
<script src="/js/paypal/jssdk-v6/plm-html.js"></script>
<script src="https://www.paypal.com/web-sdk/v6/paypal-messages"></script>
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>
```

PLM 需要额外加载 `paypal-messages` script（其他 v6 产品不需要）。

### 7.3 前端逻辑（三件事）

**① SDK 初始化（`window.load`）：**

```js
window.addEventListener('load', function () {
  window.paypal.createInstance({
    clientId:   window.DEMO.clientId,
    components: ['paypal-messages'],
  }).then(function (sdkInstance) {
    sdkInstance.createPayPalMessages()
    // auto-bootstrap 模式下 SDK 自动驱动所有 <paypal-message>，无需 fetchContent
  })
})
```

**② 金额同步（amount input change/blur）：**

```js
amountInput.addEventListener('change', function () {
  var val = parseFloat(this.value).toFixed(2)
  document.querySelectorAll('paypal-message').forEach(function (el) {
    el.setAttribute('amount', val)
  })
})
```

`auto-bootstrap` 检测到 `amount` 属性变化后自动重新拉取 message 内容。

**③ 国家切换（country selector change）：**

```js
countrySel.addEventListener('change', function () {
  var url = new URL(window.location.href)
  url.searchParams.set('country', this.value)
  url.searchParams.set('currency', COUNTRY_TO_CUR[this.value] || 'USD')
  if (amountInput) url.searchParams.set('amount', amountInput.value)
  window.location.replace(url.toString())
})
```

刷页后服务端重新映射货币，EJS 重新渲染所有 `currency-code` 属性。

### 7.4 无 `fetchContent`，无 `onReady`

全部由 `auto-bootstrap` 驱动，JS 只负责 SDK 初始化 + 属性更新。这是本 demo 相对 plm-js 的核心区别。

---

## 8. 与 v5 plm-div 的关键差异

| 对比点 | v5 plm-div | v6 plm-html |
|---|---|---|
| 渲染元素 | `<div data-pp-message>` | `<paypal-message auto-bootstrap>` |
| SDK 加载 | `sdk/js?components=messages` URL 参数 | `core` + `paypal-messages` 两个 script |
| 金额更新 | `setAttribute('data-pp-amount', val)` | `setAttribute('amount', val)` |
| 跨境支持 | `data-pp-buyercountry` attribute | 无（v6 不支持 HTML 跨境 override） |
| Banner 格式 | `data-pp-style-layout="flex"` | 不支持 |
| Placement 数 | 5（含 Home/Category banner） | 3（Product/Cart/Checkout） |
| Style Gallery | 无 | 8 行代表性组合 |

---

## 9. 成功标准

- [ ] 页面加载后所有 `<paypal-message>` 正常渲染 PLM 内容
- [ ] 修改 Amount 输入后所有 message 自动更新金额
- [ ] 切换 Buyer Country 后页面刷新，`currency-code` 对应更新
- [ ] WHITE 变体在深色背景下可见
- [ ] Supabase 配置生效，首页显示产品卡片
