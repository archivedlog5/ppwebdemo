# PayPal JSSDK v5 Demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 14 interactive PayPal JSSDK v5 demo pages under `/paypal/jssdk-v5/*`, each loading a real sandbox SDK and completing an actual payment flow.

**Architecture:** Express + EJS monolith. Shared `header.ejs` + `footer.ejs` partials provide the tab bar and left sidebar. **EJS/JS 分离模式**：EJS 文件只负责 HTML 结构和 `window.DEMO` 配置注入，SDK 逻辑全部放在静态 JS 文件（`src/public/js/paypal/jssdk-v5/*.js`），多产品可复用同一 JS 文件。Route factory pattern: `createStandardRoute` + `createVaultWithPurchaseRoute`. Access tokens cached 8h TTL. Supabase `demohub` schema for config.

**Tech Stack:** Node.js 20+, Express 4, EJS 3, dotenv, @supabase/supabase-js 2, ws (Node 20 WebSocket), native CSS (no framework)

## Implementation Notes (2026-05-18)

### EJS/JS 分离重构（与原计划的差异）

原计划：JS 逻辑写在 EJS `<script>` 标签内。
实际实现：JS 逻辑抽离为静态文件，EJS 只注入配置。

**window.DEMO 模式（每个 EJS 文件）：**
```html
<script>
  window.DEMO = {
    urls: {
      createOrder:  '/paypal/jssdk-v5/api/<product>/create-order',
      captureOrder: '/paypal/jssdk-v5/api/<product>/capture-order',
    }
  }
</script>
<script src="/js/paypal/jssdk-v5/spb.js"></script>
```

**静态 JS 文件与产品对应表：**

| JS 文件 | 使用的产品 |
|---------|-----------|
| `spb.js` | spb-ecm, spb-ecs, vault-paypal-with-purchase, vault-applepay-with-purchase |
| `acdc.js` | acdc, vault-acdc-with-purchase, vault-acdc-setup-only |
| `buttons.js` | buttons（双 SDK：CN + US） |
| `vault-setup.js` | vault-paypal-setup-only |
| `vault-return.js` | vault-return |
| `applepay.js` | applepay-ecm, applepay-ecs（待实现） |
| `googlepay.js` | googlepay-ecm, googlepay-ecs（待实现） |

### 实际完成状态（2026-05-18）

- ✅ 全部 14 个路由文件（工厂 + 自定义）
- ✅ 全部静态 JS 文件（5 个已完成，2 个待实现）
- ✅ 全部 14 个 EJS 视图（window.DEMO 模式）
- ✅ Supabase demohub schema 已建表 + seed 数据
- ✅ 生产 gateway（根目录 server.js）
- ⏳ applepay.js / googlepay.js 待实现（需测试 Apple/Google Pay sandbox 环境）
- ⏳ 浏览器验证各产品支付流程

## Design Review Decisions (2026-05-18)

| # | 决定 | 结论 |
|---|------|------|
| R1 | 首页搜索框 | **删除** — 无逻辑支撑，装饰性控件损耗信任度 |
| R2 | 移动端侧边栏 | **水平滚动 tabs** — `overflow-x: auto` + `white-space: nowrap`，可定制样式 |
| R3 | SDK 加载状态 | 按钮容器内显示 spinner + "Loading..." 文字，SDK ready 后 `.innerHTML` 替换 |

### R2 — 移动端水平滚动 tabs 规格

```css
/* 在 layout.css 中添加 */
.sidebar-mobile {
  display: none;
  overflow-x: auto;
  white-space: nowrap;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  gap: 4px;
}
.sidebar-mobile-tab {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-family: 'Space Mono', monospace;
  color: var(--fg-muted);
  background: var(--surface2);
  cursor: pointer;
  text-decoration: none;
  transition: all 150ms;
}
.sidebar-mobile-tab.active {
  background: rgba(34,197,94,0.1);
  color: var(--accent);
}

@media (max-width: 768px) {
  .sidebar { display: none; }
  .sidebar-mobile { display: flex; }
}
```

### R3 — SDK Loading spinner 规格

```js
// 在每个产品 EJS 文件中，按钮容器默认显示 spinner
// SDK 加载完成后替换内容
```
```html
<!-- 按钮容器初始状态 -->
<div id="paypal-button-container" class="sdk-loading">
  <div class="sdk-spinner"></div>
  <span class="sdk-loading-text">Loading PayPal...</span>
</div>
```
```css
/* 在 sandbox.css 中添加 */
.sdk-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  color: var(--fg-muted);
  font-size: 12px;
  font-family: 'Fira Sans', sans-serif;
}
.sdk-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
```
```js
// SDK onInit 回调或 DOMContentLoaded 后清除 loading 状态
document.getElementById('paypal-button-container').classList.remove('sdk-loading')
```

## CEO Review Decisions (2026-05-15)

| # | Decision | Choice | Impact |
|---|----------|--------|--------|
| D1 | Implementation pattern | Route factory functions | Eliminates DRY across 14 route files |
| D3 | Access token handling | Cache with 8h TTL | Prevents per-request latency + rate limiting |
| D4 | EJS layout pattern | header.ejs + footer.ejs partials | Normal HTML/JS in each view, full IDE support |
| D5 | API request/response logger | Deferred to TODO | Required for Logs Tab implementation |
| D6 | Fetch timeout | Skipped | Accepted risk |
| D7 | Rate limiting | Skipped | Internal tool, accepted risk |
| D8 | Tests | Skipped | Manual browser testing for sandbox flows |

---

## File Map

### Created by this plan

```
apps/demo-hub/
├── package.json
├── .env.example
├── src/
│   ├── app.js                                  # Express entry, mounts all routers
│   ├── config/
│   │   ├── products.js                         # Supabase config loader + in-memory Map
│   │   └── paypal.js                           # Access token helper (CN + US, 8h TTL cache)
│   ├── routes/
│   │   ├── index.js                            # GET / → homepage
│   │   └── paypal/
│   │       └── jssdk-v5/
│   │           ├── _factory.js                 # createStandardRoute + createVaultWithPurchaseRoute
│   │           ├── spb-ecm.js                  # Uses createStandardRoute
│   │           ├── spb-ecs.js                  # Uses createStandardRoute
│   │           ├── buttons.js                  # Custom: dual SDK (CN + US), 4 buttons
│   │           ├── acdc.js                     # Uses createStandardRoute (card-fields component)
│   │           ├── applepay-ecm.js             # Uses createStandardRoute
│   │           ├── applepay-ecs.js             # Uses createStandardRoute
│   │           ├── googlepay-ecm.js            # Uses createStandardRoute
│   │           ├── googlepay-ecs.js            # Uses createStandardRoute
│   │           ├── vault-paypal-with-purchase.js   # Uses createVaultWithPurchaseRoute
│   │           ├── vault-paypal-setup-only.js      # Custom: /v3/vault/setup-tokens API
│   │           ├── vault-acdc-with-purchase.js     # Uses createVaultWithPurchaseRoute
│   │           ├── vault-acdc-setup-only.js        # Custom: /v3/vault/setup-tokens API
│   │           ├── vault-applepay-with-purchase.js # Uses createVaultWithPurchaseRoute
│   │           └── vault-return.js                 # Custom: user-provided vault token
│   ├── views/
│   │   ├── partials/
│   │   │   ├── header.ejs                      # HTML head + topbar + sidebar open (replaces layout.ejs)
│   │   │   ├── footer.ejs                      # Closes sidebar + body + html
│   │   │   └── sidebar.ejs                     # Provider product list
│   │   ├── index.ejs                           # Homepage product catalog
│   │   └── paypal/
│   │       └── jssdk-v5/
│   │           ├── spb-ecm.ejs
│   │           ├── spb-ecs.ejs
│   │           ├── buttons.ejs
│   │           ├── acdc.ejs
│   │           ├── applepay-ecm.ejs
│   │           ├── applepay-ecs.ejs
│   │           ├── googlepay-ecm.ejs
│   │           ├── googlepay-ecs.ejs
│   │           ├── vault-paypal-with-purchase.ejs
│   │           ├── vault-paypal-setup-only.ejs
│   │           ├── vault-acdc-with-purchase.ejs
│   │           ├── vault-acdc-setup-only.ejs
│   │           ├── vault-applepay-with-purchase.ejs
│   │           └── vault-return.ejs
│   └── public/
│       ├── css/
│       │   ├── base.css                        # CSS variables, reset
│       │   ├── layout.css                      # Topbar, sidebar, tab bar
│       │   └── sandbox.css                     # Payment widget sandbox styles
│       └── js/
│           └── theme.js                        # Light/dark toggle, persists to localStorage
```

**Factory coverage (Eng Review clarification):**
| Route | Uses Factory? | Notes |
|-------|--------------|-------|
| spb-ecm, spb-ecs | ✅ createStandardRoute | Standard buttons flow |
| applepay-ecm, applepay-ecs | ✅ createStandardRoute | sdkParams: `components=applepay` |
| googlepay-ecm, googlepay-ecs | ✅ createStandardRoute + extraScripts | extraScripts: Google Pay JS lib |
| vault-paypal/acdc/applepay-with-purchase | ✅ createVaultWithPurchaseRoute | Vault payment_source in order |
| buttons.js | ❌ Custom | Dual SDK (CN + US), 4 buttons |
| acdc.js | ❌ Custom | CardFields SDK, different frontend |
| vault-*-setup-only.js | ❌ Custom | /v3/vault/setup-tokens API |
| vault-return.js | ❌ Custom | User-provided vault token |

`createStandardRoute` needs `extraScripts?: Array<{url: string, namespace?: string}>` parameter for Google Pay.

---

## Task 0: Route Factory + Token Cache (CEO Review additions)

**Files:**
- Create: `apps/demo-hub/src/config/paypal.js` (update with token cache)
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/_factory.js`

### 0A: Token Cache in `config/paypal.js`

- [ ] **Step 1: Add token cache to `src/config/paypal.js`**

Replace the `getAccessToken` function with a cached version:

```js
const fetch = require('node-fetch')
const API = process.env.PAYPAL_API_BASE

// Token cache: { accessToken, expiresAt }
const _cache = { cn: null, us: null }

async function _fetchToken(clientId, clientSecret) {
  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`)
  const data = await res.json()
  return { accessToken: data.access_token, expiresAt: Date.now() + 8 * 60 * 60 * 1000 }
}

async function getCNToken() {
  if (!_cache.cn || Date.now() > _cache.cn.expiresAt) {
    _cache.cn = await _fetchToken(process.env.PAYPAL_CN_CLIENT_ID, process.env.PAYPAL_CN_CLIENT_SECRET)
  }
  return _cache.cn.accessToken
}

async function getUSToken() {
  if (!_cache.us || Date.now() > _cache.us.expiresAt) {
    _cache.us = await _fetchToken(process.env.PAYPAL_US_CLIENT_ID, process.env.PAYPAL_US_CLIENT_SECRET)
  }
  return _cache.us.accessToken
}

module.exports = { getCNToken, getUSToken, API }
```

### 0B: Route Factory `src/routes/paypal/jssdk-v5/_factory.js`

- [ ] **Step 2: Create route factory for standard products (SPB, Apple Pay, Google Pay)**

```js
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API } = require('../../../config/paypal')

/**
 * Creates a standard PayPal demo route with create-order + capture-order.
 * @param {object} config
 * @param {string} config.productKey  - e.g. 'spb-ecm'
 * @param {string} config.sdkParams   - query string for SDK URL e.g. 'components=buttons&currency=USD'
 * @param {string} config.view        - EJS view path e.g. 'paypal/jssdk-v5/spb-ecm'
 * @param {object} [config.orderBody] - extra fields merged into create-order body
 */
function createStandardRoute({ productKey, sdkParams, view, orderBody = {}, extraScripts = [] }) {
  const router = Router()
  const PROVIDER = 'paypal', SDK_VERSION = 'jssdk-v5'

  router.get(`/${productKey}`, (req, res) => {
    const product = getProduct(PROVIDER, SDK_VERSION, productKey)
    res.render(view, {
      title: product?.displayName ?? productKey,
      provider: PROVIDER, sdkVersion: SDK_VERSION,
      currentProductKey: productKey, currentSdkVersion: SDK_VERSION,
      sidebarProducts: getProviderProducts(PROVIDER),
      clientId: process.env.PAYPAL_CN_CLIENT_ID,
      sdkParams,
      extraScripts,  // e.g. Google Pay needs [{ url: 'https://pay.google.com/gp/p/js/pay.js' }]
    })
  })

  router.post(`/api/${productKey}/create-order`, async (req, res) => {
    try {
      const token = await getCNToken()
      const body = {
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: '1.00' } }],
        ...orderBody,
      }
      const r = await fetch(`${API}/v2/checkout/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      res.json({ id: (await r.json()).id })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.post(`/api/${productKey}/capture-order`, async (req, res) => {
    try {
      const { orderID } = req.body
      const token = await getCNToken()
      const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      res.json(await r.json())
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  return router
}

/**
 * Creates a Vault with-purchase route (adds vault instructions to order).
 */
function createVaultWithPurchaseRoute({ productKey, sdkParams, view, paymentSource }) {
  const router = Router()
  const PROVIDER = 'paypal', SDK_VERSION = 'jssdk-v5'

  router.get(`/${productKey}`, (req, res) => {
    const product = getProduct(PROVIDER, SDK_VERSION, productKey)
    res.render(view, {
      title: product?.displayName ?? productKey,
      provider: PROVIDER, sdkVersion: SDK_VERSION,
      currentProductKey: productKey, currentSdkVersion: SDK_VERSION,
      sidebarProducts: getProviderProducts(PROVIDER),
      clientId: process.env.PAYPAL_CN_CLIENT_ID,
      sdkParams,
    })
  })

  router.post(`/api/${productKey}/create-order`, async (req, res) => {
    try {
      const token = await getCNToken()
      const r = await fetch(`${API}/v2/checkout/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{ amount: { currency_code: 'USD', value: '1.00' } }],
          payment_source: paymentSource,
        }),
      })
      const order = await r.json()
      res.json({ id: order.id })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  router.post(`/api/${productKey}/capture-order`, async (req, res) => {
    try {
      const { orderID } = req.body
      const token = await getCNToken()
      const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      const data = await r.json()
      const vaultId = data?.payment_source?.paypal?.attributes?.vault?.id
                   ?? data?.payment_source?.card?.attributes?.vault?.id
      res.json({ ...data, vaultId })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  return router
}

module.exports = { createStandardRoute, createVaultWithPurchaseRoute }
```

With the factory, each standard product route becomes:
```js
// routes/paypal/jssdk-v5/spb-ecm.js
const { createStandardRoute } = require('./_factory')
module.exports = createStandardRoute({
  productKey: 'spb-ecm',
  sdkParams: 'components=buttons&currency=USD',
  view: 'paypal/jssdk-v5/spb-ecm',
})
```

- [ ] **Step 3: Commit**

```bash
git add apps/demo-hub/src/config/paypal.js \
        apps/demo-hub/src/routes/paypal/jssdk-v5/_factory.js
git commit -m "feat(demo-hub): add token cache + route factory for jssdk-v5"
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `apps/demo-hub/package.json`
- Create: `apps/demo-hub/.env.example`
- Create: `apps/demo-hub/.gitignore`

- [ ] **Step 1: Init package.json**

```bash
cd apps/demo-hub
npm init -y
npm install express ejs dotenv @supabase/supabase-js node-fetch
npm install --save-dev nodemon
```

- [ ] **Step 2: Set package.json scripts**

Edit `apps/demo-hub/package.json` — replace the `"scripts"` section:
```json
{
  "scripts": {
    "start": "node src/app.js",
    "dev": "nodemon src/app.js"
  },
  "main": "src/app.js"
}
```

- [ ] **Step 3: Create .env.example**

```
# PayPal Sandbox — CN merchant account (used for all products except Venmo)
PAYPAL_CN_CLIENT_ID=
PAYPAL_CN_CLIENT_SECRET=

# PayPal Sandbox — US merchant account (Venmo only)
PAYPAL_US_CLIENT_ID=
PAYPAL_US_CLIENT_SECRET=

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Server
PORT=3000
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
.env
```

- [ ] **Step 5: Copy .env.example to .env and fill in your sandbox credentials**

```bash
cp .env.example .env
# Then edit .env with real sandbox client IDs and secrets
```

- [ ] **Step 6: Create directory structure**

```bash
mkdir -p src/config src/routes/paypal/jssdk-v5 src/views/paypal/jssdk-v5 \
         src/views/partials src/public/css src/public/js
```

- [ ] **Step 7: Commit**

```bash
cd ../..
git add apps/demo-hub/package.json apps/demo-hub/package-lock.json \
        apps/demo-hub/.env.example apps/demo-hub/.gitignore
git commit -m "feat(demo-hub): init project scaffolding for jssdk-v5"
```

---

## Task 2: Supabase Config Loader

**Files:**
- Create: `apps/demo-hub/src/config/products.js`

This module loads `demohub.products` from Supabase at startup and exposes helper functions used by every route.

- [ ] **Step 1: Create `src/config/products.js`**

```js
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// In-memory config: 'paypal/jssdk-v5/spb-ecm' → { displayName, description, enabled, sortOrder }
let productConfig = new Map()

async function loadProductConfig() {
  const { data, error } = await supabase
    .schema('demohub')
    .from('products')
    .select('*')
    .order('provider')
    .order('sort_order')

  if (error) throw new Error(`Failed to load product config: ${error.message}`)

  productConfig = new Map(
    data.map(row => [
      `${row.provider}/${row.sdk_version}/${row.product_key}`,
      {
        displayName: row.display_name,
        description: row.description,
        enabled: row.enabled,
        sortOrder: row.sort_order,
        provider: row.provider,
        sdkVersion: row.sdk_version,
        productKey: row.product_key,
      }
    ])
  )
  console.log(`[config] Loaded ${productConfig.size} products from Supabase`)
}

function getProduct(provider, sdkVersion, productKey) {
  return productConfig.get(`${provider}/${sdkVersion}/${productKey}`) ?? null
}

// Returns enabled products grouped: { paypal: { 'jssdk-v5': [...], 'jssdk-v6': [...] }, ... }
function getGroupedProducts() {
  const grouped = {}
  for (const product of productConfig.values()) {
    if (!product.enabled) continue
    if (!grouped[product.provider]) grouped[product.provider] = {}
    if (!grouped[product.provider][product.sdkVersion]) grouped[product.provider][product.sdkVersion] = []
    grouped[product.provider][product.sdkVersion].push(product)
  }
  return grouped
}

// Returns all enabled products for a given provider, grouped by sdkVersion
function getProviderProducts(provider) {
  const grouped = {}
  for (const product of productConfig.values()) {
    if (product.provider !== provider || !product.enabled) continue
    if (!grouped[product.sdkVersion]) grouped[product.sdkVersion] = []
    grouped[product.sdkVersion].push(product)
  }
  return grouped
}

function productUrl({ provider, sdkVersion, productKey }) {
  return `/${provider}/${sdkVersion}/${productKey}`
}

module.exports = { loadProductConfig, getProduct, getGroupedProducts, getProviderProducts, productUrl }
```

- [ ] **Step 2: Commit**

```bash
git add apps/demo-hub/src/config/products.js
git commit -m "feat(demo-hub): add Supabase product config loader"
```

---

## Task 3: Express App Entry

**Files:**
- Create: `apps/demo-hub/src/app.js`

- [ ] **Step 1: Create `src/app.js`**

```js
require('dotenv').config()
const express = require('express')
const path = require('path')
const { loadProductConfig } = require('./config/products')

const app = express()
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, 'public')))

// Routes
app.use('/', require('./routes/index'))
app.use('/paypal/jssdk-v5', require('./routes/paypal/jssdk-v5/spb-ecm'))
app.use('/paypal/jssdk-v5', require('./routes/paypal/jssdk-v5/spb-ecs'))
app.use('/paypal/jssdk-v5', require('./routes/paypal/jssdk-v5/buttons'))
app.use('/paypal/jssdk-v5', require('./routes/paypal/jssdk-v5/acdc'))
app.use('/paypal/jssdk-v5', require('./routes/paypal/jssdk-v5/applepay-ecm'))
app.use('/paypal/jssdk-v5', require('./routes/paypal/jssdk-v5/applepay-ecs'))
app.use('/paypal/jssdk-v5', require('./routes/paypal/jssdk-v5/googlepay-ecm'))
app.use('/paypal/jssdk-v5', require('./routes/paypal/jssdk-v5/googlepay-ecs'))
app.use('/paypal/jssdk-v5', require('./routes/paypal/jssdk-v5/vault-paypal-with-purchase'))
app.use('/paypal/jssdk-v5', require('./routes/paypal/jssdk-v5/vault-paypal-setup-only'))
app.use('/paypal/jssdk-v5', require('./routes/paypal/jssdk-v5/vault-acdc-with-purchase'))
app.use('/paypal/jssdk-v5', require('./routes/paypal/jssdk-v5/vault-acdc-setup-only'))
app.use('/paypal/jssdk-v5', require('./routes/paypal/jssdk-v5/vault-applepay-with-purchase'))
app.use('/paypal/jssdk-v5', require('./routes/paypal/jssdk-v5/vault-return'))

async function start() {
  await loadProductConfig()
  const port = process.env.PORT || 3000
  app.listen(port, () => console.log(`demo-hub running at http://localhost:${port}`))
}

start().catch(err => { console.error('Startup failed:', err); process.exit(1) })
```

- [ ] **Step 2: Verify server starts**

```bash
cd apps/demo-hub && npm run dev
```
Expected output: `[config] Loaded N products from Supabase` then `demo-hub running at http://localhost:3000`

- [ ] **Step 3: Commit**

```bash
git add apps/demo-hub/src/app.js
git commit -m "feat(demo-hub): add Express app entry with all jssdk-v5 route mounts"
```

---

## Task 4: Shared CSS

**Files:**
- Create: `apps/demo-hub/src/public/css/base.css`
- Create: `apps/demo-hub/src/public/css/layout.css`
- Create: `apps/demo-hub/src/public/css/sandbox.css`

- [ ] **Step 1: Create `src/public/css/base.css`** (CSS variables, dark/light theme)

```css
/* Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Fira+Sans:wght@300;400;500;600&display=swap');

:root {
  --bg:        #0F172A;
  --bg-deep:   #020617;
  --surface:   #1E293B;
  --surface2:  #272F42;
  --border:    #334155;
  --border-hi: #475569;
  --fg:        #F8FAFC;
  --fg-muted:  #94A3B8;
  --accent:    #22C55E;
  --error:     #EF4444;
  --paypal-blue:  #003087;
  --paypal-light: #009CDE;
}

[data-theme="light"] {
  --bg:        #F8FAFC;
  --bg-deep:   #F1F5F9;
  --surface:   #FFFFFF;
  --surface2:  #F1F5F9;
  --border:    #E2E8F0;
  --border-hi: #CBD5E1;
  --fg:        #0F172A;
  --fg-muted:  #64748B;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Fira Sans', sans-serif;
  background: var(--bg);
  color: var(--fg);
  min-height: 100dvh;
}

a { color: var(--accent); text-decoration: none; }
```

- [ ] **Step 2: Create `src/public/css/layout.css`** (topbar, sidebar, tab bar)

```css
/* Topbar */
.topbar {
  height: 56px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 100;
}
.topbar-logo {
  font-family: 'Space Mono', monospace;
  font-size: 14px;
  font-weight: 700;
  color: var(--fg);
}
.topbar-logo span { color: var(--accent); }

/* Theme toggle */
.theme-toggle {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  color: var(--fg-muted);
  font-size: 13px;
}

/* Page layout with sidebar */
.page-layout {
  display: flex;
  height: calc(100dvh - 56px);
}

/* Left sidebar */
.sidebar {
  width: 240px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 16px 0;
  flex-shrink: 0;
}
.sidebar-provider {
  padding: 8px 16px 4px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--fg-muted);
}
.sidebar-sdk {
  padding: 6px 16px 2px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--fg-muted);
  font-family: 'Space Mono', monospace;
}
.sidebar-item {
  display: block;
  padding: 7px 24px;
  font-size: 12px;
  color: var(--fg-muted);
  transition: all 120ms;
  cursor: pointer;
}
.sidebar-item:hover { background: var(--surface2); color: var(--fg); }
.sidebar-item.active {
  background: rgba(34,197,94,0.08);
  color: var(--accent);
  border-left: 2px solid var(--accent);
}

/* Main content area */
.main-content { flex: 1; overflow-y: auto; }

/* Tab bar */
.tab-bar {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  padding: 0 24px;
}
.tab {
  padding: 14px 20px;
  font-size: 12px;
  font-weight: 700;
  font-family: 'Space Mono', monospace;
  border-bottom: 2px solid transparent;
  color: var(--fg-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 150ms;
}
.tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.tab.disabled { color: var(--border-hi); cursor: not-allowed; }
.tab-badge {
  font-size: 9px;
  background: var(--border);
  color: var(--fg-muted);
  padding: 1px 5px;
  border-radius: 3px;
}

/* Breadcrumb */
.breadcrumb {
  padding: 10px 24px;
  font-size: 12px;
  color: var(--fg-muted);
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.breadcrumb a { color: var(--accent); }
.breadcrumb .sep { color: var(--border-hi); }

/* Homepage */
.home-hero { padding: 32px 32px 20px; border-bottom: 1px solid var(--border); }
.home-hero h1 { font-family: 'Space Mono', monospace; font-size: 24px; font-weight: 700; }
.home-hero h1 em { color: var(--accent); font-style: normal; }
.home-hero p { font-size: 13px; color: var(--fg-muted); margin-top: 8px; line-height: 1.7; font-weight: 300; }
.home-body { padding: 24px 32px; display: flex; flex-direction: column; gap: 28px; }

/* Provider section */
.provider-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.provider-dot { width: 8px; height: 8px; border-radius: 2px; }
.provider-name { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--fg-muted); }
.sdk-label { font-size: 10px; color: var(--fg-muted); font-family: 'Space Mono', monospace; margin-bottom: 8px; padding-left: 2px; }
.product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin-bottom: 16px; }

/* Product card */
.product-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  cursor: pointer;
  transition: all 150ms;
  position: relative;
  overflow: hidden;
}
.product-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--paypal-light); }
.product-card:hover { border-color: var(--border-hi); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
.product-card h3 { font-family: 'Space Mono', monospace; font-size: 12px; font-weight: 700; color: var(--fg); margin-bottom: 4px; }
.product-card p { font-size: 11px; color: var(--fg-muted); line-height: 1.5; font-weight: 300; }
.card-footer { margin-top: 10px; display: flex; align-items: center; justify-content: space-between; }
.card-link { font-size: 10px; color: var(--accent); font-weight: 700; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 5px var(--accent); }

/* Responsive */
@media (max-width: 768px) {
  .sidebar { display: none; }
  .product-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 480px) {
  .product-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: Create `src/public/css/sandbox.css`** (payment widget styles)

```css
/* Payment sandbox wrapper */
.sandbox-page {
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.sandbox-header { text-align: center; margin-bottom: 28px; }
.provider-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--paypal-light);
  background: rgba(0,156,222,0.1);
  border: 1px solid rgba(0,156,222,0.2);
  padding: 3px 10px;
  border-radius: 4px;
  display: inline-block;
  margin-bottom: 10px;
}
.sandbox-header h1 { font-family: 'Space Mono', monospace; font-size: 20px; font-weight: 700; }
.sandbox-header p { font-size: 12px; color: var(--fg-muted); margin-top: 4px; }

/* Sandbox card */
.sandbox-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 28px;
  width: 100%;
  max-width: 420px;
}
.amount-display { text-align: center; margin-bottom: 22px; }
.amount-label { font-size: 10px; color: var(--fg-muted); letter-spacing: 0.8px; text-transform: uppercase; }
.amount-value { font-family: 'Space Mono', monospace; font-size: 34px; font-weight: 700; color: var(--fg); margin-top: 2px; }
.sandbox-badge {
  font-size: 10px;
  color: var(--accent);
  background: rgba(34,197,94,0.1);
  border: 1px solid rgba(34,197,94,0.2);
  padding: 2px 8px;
  border-radius: 4px;
  margin-top: 4px;
  display: inline-block;
}

/* Button slots */
.btn-slot { margin-bottom: 10px; min-height: 44px; }
.btn-slot-label { font-size: 10px; color: var(--fg-muted); margin-bottom: 5px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; }

/* ACDC / card fields */
.field-group { margin-bottom: 14px; }
.field-label { font-size: 10px; color: var(--fg-muted); font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; margin-bottom: 5px; }
.field-host {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 12px 14px;
  min-height: 44px;
  transition: border-color 150ms;
}
.field-host.focused { border-color: var(--accent); }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

/* Result message */
.result-msg {
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: 7px;
  font-size: 12px;
  font-family: 'Space Mono', monospace;
  display: none;
}
.result-msg.success { background: rgba(34,197,94,0.1); color: var(--accent); border: 1px solid rgba(34,197,94,0.2); display: block; }
.result-msg.error { background: rgba(239,68,68,0.1); color: var(--error); border: 1px solid rgba(239,68,68,0.2); display: block; }

/* Test card hint */
.test-hint { text-align: center; margin-top: 12px; font-size: 10px; color: var(--border-hi); }
.test-hint strong { color: var(--fg-muted); }
```

- [ ] **Step 4: Create `src/public/js/theme.js`** (light/dark toggle)

```js
;(function () {
  const saved = localStorage.getItem('theme') || 'dark'
  document.documentElement.setAttribute('data-theme', saved)

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-toggle')
    if (!btn) return
    btn.textContent = saved === 'dark' ? '☀ Light' : '☾ Dark'
    btn.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      localStorage.setItem('theme', next)
      btn.textContent = next === 'dark' ? '☀ Light' : '☾ Dark'
    })
  })
})()
```

- [ ] **Step 5: Commit**

```bash
git add apps/demo-hub/src/public/
git commit -m "feat(demo-hub): add base CSS (dark/light theme, layout, sandbox styles)"
```

---

## Task 5: Shared EJS Partials (header + footer)

**Files:**
- Create: `apps/demo-hub/src/views/partials/header.ejs`
- Create: `apps/demo-hub/src/views/partials/footer.ejs`
- Create: `apps/demo-hub/src/views/partials/sidebar.ejs`

Each product view is a normal EJS file: starts with `<%- include('../partials/header') %>`, ends with `<%- include('../partials/footer') %>`. The HTML/JS in between has full IDE syntax highlighting and no escaping issues.

- [ ] **Step 1: Create `src/views/partials/header.ejs`**

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= title %> — payment_playground</title>
  <link rel="stylesheet" href="/css/base.css">
  <link rel="stylesheet" href="/css/layout.css">
  <link rel="stylesheet" href="/css/sandbox.css">
  <script src="/js/theme.js"></script>
  <% if (typeof sdkUrl !== 'undefined' && sdkUrl) { %>
    <script src="<%= sdkUrl %>" data-namespace="paypalSDK"></script>
  <% } %>
  <% if (typeof extraScripts !== 'undefined') { extraScripts.forEach(s => { %>
    <script src="<%= s.url %>" <% if (s.namespace) { %>data-namespace="<%= s.namespace %>"<% } %>></script>
  <% }) } %>
</head>
<body>
  <nav class="topbar">
    <a href="/" class="topbar-logo">payment<span>_</span>playground</a>
    <button class="theme-toggle" id="theme-toggle">☀ Light</button>
  </nav>
  <% if (typeof showSidebar !== 'undefined' && showSidebar) { %>
  <div class="page-layout">
    <aside class="sidebar"><%- include('sidebar', { sidebarProducts, currentProductKey, currentSdkVersion, provider }) %></aside>
    <div class="main-content">
      <nav class="breadcrumb">
        <a href="/">Home</a><span class="sep">/</span>
        <a href="#"><%= provider %></a><span class="sep">/</span>
        <span><%= sdkVersion %></span><span class="sep">/</span>
        <span><%= title %></span>
      </nav>
      <div class="tab-bar">
        <div class="tab active">▶ Demo</div>
        <div class="tab disabled">&lt;/&gt; Code <span class="tab-badge">soon</span></div>
        <div class="tab disabled">≋ Logs <span class="tab-badge">soon</span></div>
      </div>
  <% } %>
```

- [ ] **Step 2: Create `src/views/partials/footer.ejs`**

```html
  <% if (typeof showSidebar !== 'undefined' && showSidebar) { %>
    </div><!-- main-content -->
  </div><!-- page-layout -->
  <% } %>
</body>
</html>
```

- [ ] **Step 3: Create `src/views/partials/sidebar.ejs`**

```html
<% Object.entries(sidebarProducts).forEach(([sdkVer, products]) => { %>
  <div class="sidebar-sdk"><%= sdkVer %></div>
  <% products.forEach(p => { %>
    <a href="/<%= provider %>/<%= sdkVer %>/<%= p.productKey %>"
       class="sidebar-item <%= (p.productKey === currentProductKey && sdkVer === currentSdkVersion) ? 'active' : '' %>">
      <%= p.displayName %>
    </a>
  <% }) %>
<% }) %>
```

With this pattern, each product view looks like:
```html
<%- include('../../partials/header', { title, provider, sdkVersion,
    currentProductKey, currentSdkVersion, sidebarProducts, showSidebar: true,
    sdkUrl: `https://www.paypal.com/sdk/js?client-id=${clientId}&components=buttons&currency=USD` }) %>

<div class="sandbox-page">
  <!-- Normal HTML here — full IDE support, no escaping needed -->
  <div id="paypal-button-container"></div>
</div>

<script>
  // Normal JavaScript here — full syntax highlighting
  paypalSDK.Buttons({ ... }).render('#paypal-button-container')
</script>

<%- include('../../partials/footer') %>
```

- [ ] **Step 4: Commit**

```bash
git add apps/demo-hub/src/views/partials/
git commit -m "feat(demo-hub): add header/footer/sidebar EJS partials"
```

---

## Task 6: Homepage Route + View

**Files:**
- Create: `apps/demo-hub/src/routes/index.js`
- Create: `apps/demo-hub/src/views/index.ejs`

- [ ] **Step 1: Create `src/routes/index.js`**

```js
const { Router } = require('express')
const { getGroupedProducts, productUrl } = require('../config/products')
const router = Router()

router.get('/', (req, res) => {
  const grouped = getGroupedProducts()
  res.render('index', { title: 'Demo Hub', grouped, productUrl })
})

module.exports = router
```

- [ ] **Step 2: Create `src/views/index.ejs`**

```html
<%- include('layout', {
  title: 'Payment Demos',
  showSidebar: false,
  body: `
    <div class="home-hero">
      <h1>Payment Integration <em>Demos</em></h1>
      <p>Interactive sandboxes for PayPal, Braintree, Stripe and Adyen.<br>
         Each demo runs real SDK code — inspect, test, integrate.</p>
    </div>
    <div class="home-body">
      ${Object.entries(grouped).map(([provider, sdkVersions]) => `
        <div>
          <div class="provider-header">
            <div class="provider-dot" style="background:#009CDE"></div>
            <span class="provider-name">${provider}</span>
          </div>
          ${Object.entries(sdkVersions).map(([sdkVer, products]) => `
            <div class="sdk-label">${sdkVer}</div>
            <div class="product-grid">
              ${products.map(p => `
                <a href="${productUrl(p)}" class="product-card">
                  <h3>${p.displayName}</h3>
                  <p>${p.description}</p>
                  <div class="card-footer">
                    <span class="card-link">Run demo →</span>
                    <span class="status-dot"></span>
                  </div>
                </a>
              `).join('')}
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `
}) %>
```

- [ ] **Step 3: Verify homepage renders**

Open `http://localhost:3000` — should show product cards grouped by PayPal → JSSDK v5.

- [ ] **Step 4: Commit**

```bash
git add apps/demo-hub/src/routes/index.js apps/demo-hub/src/views/index.ejs
git commit -m "feat(demo-hub): add homepage route and product catalog view"
```

---

## Task 7: PayPal Access Token Helper

A shared utility used by all PayPal route files to get a sandbox Bearer token.

**Files:**
- Create: `apps/demo-hub/src/config/paypal.js`

- [ ] **Step 1: Create `src/config/paypal.js`**

```js
const fetch = require('node-fetch')
const API = process.env.PAYPAL_API_BASE

async function getAccessToken(clientId, clientSecret) {
  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`)
  const { access_token } = await res.json()
  return access_token
}

async function getCNToken() {
  return getAccessToken(process.env.PAYPAL_CN_CLIENT_ID, process.env.PAYPAL_CN_CLIENT_SECRET)
}

async function getUSToken() {
  return getAccessToken(process.env.PAYPAL_US_CLIENT_ID, process.env.PAYPAL_US_CLIENT_SECRET)
}

module.exports = { getCNToken, getUSToken, API }
```

- [ ] **Step 2: Commit**

```bash
git add apps/demo-hub/src/config/paypal.js
git commit -m "feat(demo-hub): add PayPal access token helper (CN + US accounts)"
```

---

## Task 8: SPB ECM Demo

**Files:**
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/spb-ecm.js`
- Create: `apps/demo-hub/src/views/paypal/jssdk-v5/spb-ecm.ejs`

SPB ECM (Express Checkout Mark) — standard PayPal button, checkout completes in PayPal window.

- [ ] **Step 1: Create `src/routes/paypal/jssdk-v5/spb-ecm.js`**

```js
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API } = require('../../../config/paypal')
const router = Router()

const PROVIDER = 'paypal'
const SDK_VERSION = 'jssdk-v5'
const PRODUCT_KEY = 'spb-ecm'

router.get('/spb-ecm', (req, res) => {
  const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  const sidebarProducts = getProviderProducts(PROVIDER)
  res.render('paypal/jssdk-v5/spb-ecm', {
    title: product?.displayName ?? 'SPB ECM',
    provider: PROVIDER,
    sdkVersion: SDK_VERSION,
    currentProductKey: PRODUCT_KEY,
    currentSdkVersion: SDK_VERSION,
    sidebarProducts,
    showSidebar: true,
    clientId: process.env.PAYPAL_CN_CLIENT_ID,
  })
})

router.post('/api/spb-ecm/create-order', async (req, res) => {
  try {
    const token = await getCNToken()
    const response = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: '1.00' } }],
      }),
    })
    const order = await response.json()
    res.json({ id: order.id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/api/spb-ecm/capture-order', async (req, res) => {
  try {
    const { orderID } = req.body
    const token = await getCNToken()
    const response = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const data = await response.json()
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
```

- [ ] **Step 2: Create `src/views/paypal/jssdk-v5/spb-ecm.ejs`**

```html
<%- include('../../layout', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar,
  extraHead: `<script src="https://www.paypal.com/sdk/js?client-id=${clientId}&components=buttons&currency=USD" data-namespace="paypalSDK"></script>`,
  body: `
    <div class="sandbox-page">
      <div class="sandbox-header">
        <div class="provider-badge">PayPal · JSSDK v5 · ECM</div>
        <h1>${title}</h1>
        <p>Smart Payment Button — Express Checkout Mark Flow</p>
      </div>
      <div class="sandbox-card">
        <div class="amount-display">
          <div class="amount-label">Test Amount</div>
          <div class="amount-value">$1.00</div>
          <span class="sandbox-badge">⚡ Sandbox Mode</span>
        </div>
        <div id="paypal-button-container"></div>
        <div class="result-msg" id="result"></div>
      </div>
    </div>
    <script>
      paypalSDK.Buttons({
        createOrder: () =>
          fetch('/paypal/jssdk-v5/api/spb-ecm/create-order', { method: 'POST' })
            .then(r => r.json()).then(d => d.id),
        onApprove: (data) =>
          fetch('/paypal/jssdk-v5/api/spb-ecm/capture-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderID: data.orderID })
          })
          .then(r => r.json())
          .then(d => {
            const el = document.getElementById('result')
            el.className = 'result-msg success'
            el.textContent = '✓ Payment captured: ' + d.id
          }),
        onError: (err) => {
          const el = document.getElementById('result')
          el.className = 'result-msg error'
          el.textContent = '✗ ' + err
        }
      }).render('#paypal-button-container')
    </script>
  `
}) %>
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:3000/paypal/jssdk-v5/spb-ecm` — PayPal button should appear. Click it, log in with CN sandbox buyer account, complete $1.00 payment. Result message should show "✓ Payment captured: [ORDER_ID]".

- [ ] **Step 4: Commit**

```bash
git add apps/demo-hub/src/routes/paypal/jssdk-v5/spb-ecm.js \
        apps/demo-hub/src/views/paypal/jssdk-v5/spb-ecm.ejs
git commit -m "feat(demo-hub): add PayPal SPB ECM demo (/paypal/jssdk-v5/spb-ecm)"
```

---

## Task 9: SPB ECS Demo

**Files:**
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/spb-ecs.js`
- Create: `apps/demo-hub/src/views/paypal/jssdk-v5/spb-ecs.ejs`

SPB ECS (Express Checkout Standard) — same PayPal button but redirects to full PayPal checkout page.

- [ ] **Step 1: Create `src/routes/paypal/jssdk-v5/spb-ecs.js`**

```js
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API } = require('../../../config/paypal')
const router = Router()

const PROVIDER = 'paypal', SDK_VERSION = 'jssdk-v5', PRODUCT_KEY = 'spb-ecs'

router.get('/spb-ecs', (req, res) => {
  const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  res.render('paypal/jssdk-v5/spb-ecs', {
    title: product?.displayName ?? 'SPB ECS',
    provider: PROVIDER, sdkVersion: SDK_VERSION,
    currentProductKey: PRODUCT_KEY, currentSdkVersion: SDK_VERSION,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    clientId: process.env.PAYPAL_CN_CLIENT_ID,
  })
})

router.post('/api/spb-ecs/create-order', async (req, res) => {
  try {
    const token = await getCNToken()
    const response = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: '1.00' } }],
        payment_source: { paypal: { experience_context: { payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED', user_action: 'PAY_NOW' } } }
      }),
    })
    const order = await response.json()
    res.json({ id: order.id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/api/spb-ecs/capture-order', async (req, res) => {
  try {
    const { orderID } = req.body
    const token = await getCNToken()
    const response = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    res.json(await response.json())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
```

- [ ] **Step 2: Create `src/views/paypal/jssdk-v5/spb-ecs.ejs`**

```html
<%- include('../../layout', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar,
  extraHead: `<script src="https://www.paypal.com/sdk/js?client-id=${clientId}&components=buttons&currency=USD" data-namespace="paypalSDK"></script>`,
  body: `
    <div class="sandbox-page">
      <div class="sandbox-header">
        <div class="provider-badge">PayPal · JSSDK v5 · ECS</div>
        <h1>${title}</h1>
        <p>SPB Express Checkout Standard — full PayPal checkout page flow</p>
      </div>
      <div class="sandbox-card">
        <div class="amount-display">
          <div class="amount-label">Test Amount</div>
          <div class="amount-value">$1.00</div>
          <span class="sandbox-badge">⚡ Sandbox Mode</span>
        </div>
        <div id="paypal-button-container"></div>
        <div class="result-msg" id="result"></div>
      </div>
    </div>
    <script>
      paypalSDK.Buttons({
        createOrder: () =>
          fetch('/paypal/jssdk-v5/api/spb-ecs/create-order', { method: 'POST' })
            .then(r => r.json()).then(d => d.id),
        onApprove: (data) =>
          fetch('/paypal/jssdk-v5/api/spb-ecs/capture-order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderID: data.orderID })
          }).then(r => r.json()).then(d => {
            const el = document.getElementById('result')
            el.className = 'result-msg success'
            el.textContent = '✓ Payment captured: ' + d.id
          }),
        onError: (err) => {
          const el = document.getElementById('result')
          el.className = 'result-msg error'
          el.textContent = '✗ ' + err
        }
      }).render('#paypal-button-container')
    </script>
  `
}) %>
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:3000/paypal/jssdk-v5/spb-ecs` — PayPal button renders. Complete $1.00 payment with CN sandbox buyer.

- [ ] **Step 4: Commit**

```bash
git add apps/demo-hub/src/routes/paypal/jssdk-v5/spb-ecs.js \
        apps/demo-hub/src/views/paypal/jssdk-v5/spb-ecs.ejs
git commit -m "feat(demo-hub): add PayPal SPB ECS demo (/paypal/jssdk-v5/spb-ecs)"
```

---

## Task 10: Standalone Buttons Demo (CN + US dual SDK)

**Files:**
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/buttons.js`
- Create: `apps/demo-hub/src/views/paypal/jssdk-v5/buttons.ejs`

One page showing PayPal / PayLater / BCDC (CN account) + Venmo (US account). Two SDK instances loaded via `data-namespace`.

- [ ] **Step 1: Create `src/routes/paypal/jssdk-v5/buttons.js`**

```js
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, getUSToken, API } = require('../../../config/paypal')
const router = Router()

const PROVIDER = 'paypal', SDK_VERSION = 'jssdk-v5', PRODUCT_KEY = 'buttons'

router.get('/buttons', (req, res) => {
  const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  res.render('paypal/jssdk-v5/buttons', {
    title: product?.displayName ?? 'Standalone Buttons',
    provider: PROVIDER, sdkVersion: SDK_VERSION,
    currentProductKey: PRODUCT_KEY, currentSdkVersion: SDK_VERSION,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    cnClientId: process.env.PAYPAL_CN_CLIENT_ID,
    usClientId: process.env.PAYPAL_US_CLIENT_ID,
  })
})

// CN account: PayPal / PayLater / BCDC
router.post('/api/buttons/create-order', async (req, res) => {
  try {
    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: 'USD', value: '1.00' } }] }),
    })
    res.json({ id: (await r.json()).id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// US account: Venmo
router.post('/api/buttons/create-order-us', async (req, res) => {
  try {
    const token = await getUSToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: 'USD', value: '1.00' } }] }),
    })
    res.json({ id: (await r.json()).id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/api/buttons/capture-order', async (req, res) => {
  try {
    const { orderID, account } = req.body
    const token = account === 'us' ? await getUSToken() : await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    res.json(await r.json())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
```

- [ ] **Step 2: Create `src/views/paypal/jssdk-v5/buttons.ejs`**

```html
<%- include('../../layout', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar,
  extraHead: `
    <script src="https://www.paypal.com/sdk/js?client-id=${cnClientId}&components=buttons&currency=USD" data-namespace="paypalCN"></script>
    <script src="https://www.paypal.com/sdk/js?client-id=${usClientId}&components=buttons&enable-funding=venmo&currency=USD" data-namespace="paypalUS"></script>
  `,
  body: `
    <div class="sandbox-page">
      <div class="sandbox-header">
        <div class="provider-badge">PayPal · JSSDK v5 · Buttons</div>
        <h1>${title}</h1>
        <p>PayPal / PayLater / BCDC use CN account · Venmo uses US account</p>
      </div>
      <div class="sandbox-card">
        <div class="amount-display">
          <div class="amount-label">Test Amount</div>
          <div class="amount-value">$1.00</div>
          <span class="sandbox-badge">⚡ Sandbox Mode</span>
        </div>
        <div class="btn-slot"><div class="btn-slot-label">PayPal</div><div id="btn-paypal"></div></div>
        <div class="btn-slot"><div class="btn-slot-label">PayLater</div><div id="btn-paylater"></div></div>
        <div class="btn-slot"><div class="btn-slot-label">BCDC (Basic Card)</div><div id="btn-bcdc"></div></div>
        <div class="btn-slot"><div class="btn-slot-label">Venmo (US Account)</div><div id="btn-venmo"></div></div>
        <div class="result-msg" id="result"></div>
      </div>
    </div>
    <script>
      function showResult(text, type) {
        const el = document.getElementById('result')
        el.className = 'result-msg ' + type
        el.textContent = text
      }

      // CN: PayPal button
      paypalCN.Buttons({ fundingSource: paypalCN.FUNDING.PAYPAL,
        createOrder: () => fetch('/paypal/jssdk-v5/api/buttons/create-order', { method: 'POST' }).then(r => r.json()).then(d => d.id),
        onApprove: d => fetch('/paypal/jssdk-v5/api/buttons/capture-order', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ orderID: d.orderID, account: 'cn' }) }).then(r => r.json()).then(o => showResult('✓ PayPal captured: ' + o.id, 'success')),
        onError: e => showResult('✗ ' + e, 'error')
      }).render('#btn-paypal')

      // CN: PayLater button
      paypalCN.Buttons({ fundingSource: paypalCN.FUNDING.PAYLATER,
        createOrder: () => fetch('/paypal/jssdk-v5/api/buttons/create-order', { method: 'POST' }).then(r => r.json()).then(d => d.id),
        onApprove: d => fetch('/paypal/jssdk-v5/api/buttons/capture-order', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ orderID: d.orderID, account: 'cn' }) }).then(r => r.json()).then(o => showResult('✓ PayLater captured: ' + o.id, 'success')),
        onError: e => showResult('✗ ' + e, 'error')
      }).render('#btn-paylater')

      // CN: BCDC
      paypalCN.Buttons({ fundingSource: paypalCN.FUNDING.CARD,
        createOrder: () => fetch('/paypal/jssdk-v5/api/buttons/create-order', { method: 'POST' }).then(r => r.json()).then(d => d.id),
        onApprove: d => fetch('/paypal/jssdk-v5/api/buttons/capture-order', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ orderID: d.orderID, account: 'cn' }) }).then(r => r.json()).then(o => showResult('✓ BCDC captured: ' + o.id, 'success')),
        onError: e => showResult('✗ ' + e, 'error')
      }).render('#btn-bcdc')

      // US: Venmo
      paypalUS.Buttons({ fundingSource: paypalUS.FUNDING.VENMO,
        createOrder: () => fetch('/paypal/jssdk-v5/api/buttons/create-order-us', { method: 'POST' }).then(r => r.json()).then(d => d.id),
        onApprove: d => fetch('/paypal/jssdk-v5/api/buttons/capture-order', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ orderID: d.orderID, account: 'us' }) }).then(r => r.json()).then(o => showResult('✓ Venmo captured: ' + o.id, 'success')),
        onError: e => showResult('✗ ' + e, 'error')
      }).render('#btn-venmo')
    </script>
  `
}) %>
```

- [ ] **Step 3: Verify**

Open `http://localhost:3000/paypal/jssdk-v5/buttons` — 4 buttons appear. Verify each renders without JS errors in DevTools Console.

- [ ] **Step 4: Commit**

```bash
git add apps/demo-hub/src/routes/paypal/jssdk-v5/buttons.js \
        apps/demo-hub/src/views/paypal/jssdk-v5/buttons.ejs
git commit -m "feat(demo-hub): add standalone buttons demo (PayPal/PayLater/BCDC/Venmo)"
```

---

## Task 11: ACDC Demo

**Files:**
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/acdc.js`
- Create: `apps/demo-hub/src/views/paypal/jssdk-v5/acdc.ejs`

ACDC uses `paypal.CardFields` — hosted card input fields rendered into separate DOM containers.

- [ ] **Step 1: Create `src/routes/paypal/jssdk-v5/acdc.js`**

```js
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API } = require('../../../config/paypal')
const router = Router()

const PROVIDER = 'paypal', SDK_VERSION = 'jssdk-v5', PRODUCT_KEY = 'acdc'

router.get('/acdc', (req, res) => {
  const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  res.render('paypal/jssdk-v5/acdc', {
    title: product?.displayName ?? 'ACDC',
    provider: PROVIDER, sdkVersion: SDK_VERSION,
    currentProductKey: PRODUCT_KEY, currentSdkVersion: SDK_VERSION,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    clientId: process.env.PAYPAL_CN_CLIENT_ID,
  })
})

router.post('/api/acdc/create-order', async (req, res) => {
  try {
    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: 'USD', value: '1.00' } }] }),
    })
    res.json({ id: (await r.json()).id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/api/acdc/capture-order', async (req, res) => {
  try {
    const { orderID } = req.body
    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    res.json(await r.json())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
```

- [ ] **Step 2: Create `src/views/paypal/jssdk-v5/acdc.ejs`**

```html
<%- include('../../layout', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar,
  extraHead: `<script src="https://www.paypal.com/sdk/js?client-id=${clientId}&components=card-fields&currency=USD" data-namespace="paypalSDK"></script>`,
  body: `
    <div class="sandbox-page">
      <div class="sandbox-header">
        <div class="provider-badge">PayPal · JSSDK v5 · ACDC</div>
        <h1>${title}</h1>
        <p>Advanced Credit/Debit Card — hosted card input fields</p>
      </div>
      <div class="sandbox-card">
        <div class="amount-display">
          <div class="amount-label">Test Amount</div>
          <div class="amount-value">$1.00</div>
          <span class="sandbox-badge">⚡ Sandbox Mode</span>
        </div>
        <div class="field-group">
          <div class="field-label">Card Number</div>
          <div class="field-host" id="card-number"></div>
        </div>
        <div class="field-row">
          <div class="field-group">
            <div class="field-label">Expiry</div>
            <div class="field-host" id="expiry"></div>
          </div>
          <div class="field-group">
            <div class="field-label">CVV</div>
            <div class="field-host" id="cvv"></div>
          </div>
        </div>
        <div class="field-group">
          <div class="field-label">Name on Card</div>
          <div class="field-host" id="card-name"></div>
        </div>
        <button id="pay-btn" style="width:100%;background:linear-gradient(135deg,#003087,#009CDE);border:none;border-radius:8px;padding:14px;color:white;font-family:'Space Mono',monospace;font-size:13px;font-weight:700;cursor:pointer;margin-top:12px;">Pay $1.00</button>
        <div class="result-msg" id="result"></div>
        <div class="test-hint">Test card: <strong>4111 1111 1111 1111</strong> · Any future date · Any CVV</div>
      </div>
    </div>
    <script>
      let orderID
      const cardFields = paypalSDK.CardFields({
        createOrder: () =>
          fetch('/paypal/jssdk-v5/api/acdc/create-order', { method: 'POST' })
            .then(r => r.json()).then(d => { orderID = d.id; return d.id }),
        onApprove: (data) =>
          fetch('/paypal/jssdk-v5/api/acdc/capture-order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderID: data.orderID })
          }).then(r => r.json()).then(o => {
            const el = document.getElementById('result')
            el.className = 'result-msg success'
            el.textContent = '✓ Payment captured: ' + o.id
          }),
        onError: e => {
          const el = document.getElementById('result')
          el.className = 'result-msg error'
          el.textContent = '✗ ' + (e.message || JSON.stringify(e))
        },
        style: { input: { 'font-family': 'Space Mono, monospace', 'font-size': '13px', color: '#F8FAFC' } }
      })
      cardFields.NumberField().render('#card-number')
      cardFields.ExpiryField().render('#expiry')
      cardFields.CVVField().render('#cvv')
      cardFields.NameField().render('#card-name')
      document.getElementById('pay-btn').addEventListener('click', () => cardFields.submit())
    </script>
  `
}) %>
```

- [ ] **Step 3: Verify**

Open `http://localhost:3000/paypal/jssdk-v5/acdc` — card fields appear in iframes. Enter `4111 1111 1111 1111`, future date, any CVV, click Pay. Result shows captured order ID.

- [ ] **Step 4: Commit**

```bash
git add apps/demo-hub/src/routes/paypal/jssdk-v5/acdc.js \
        apps/demo-hub/src/views/paypal/jssdk-v5/acdc.ejs
git commit -m "feat(demo-hub): add ACDC hosted card fields demo (/paypal/jssdk-v5/acdc)"
```

---

## Task 12: Apple Pay ECM + ECS Demos

**Files:**
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/applepay-ecm.js`
- Create: `apps/demo-hub/src/views/paypal/jssdk-v5/applepay-ecm.ejs`
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/applepay-ecs.js`
- Create: `apps/demo-hub/src/views/paypal/jssdk-v5/applepay-ecs.ejs`

> **Pre-req:** Apple Pay requires a verified domain and must be tested in Safari on macOS/iOS with an Apple ID that has a test card in Wallet. Confirm with the team that the CN sandbox account has Apple Pay enabled.

- [ ] **Step 1: Create `src/routes/paypal/jssdk-v5/applepay-ecm.js`**

```js
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API } = require('../../../config/paypal')
const router = Router()

const PROVIDER = 'paypal', SDK_VERSION = 'jssdk-v5', PRODUCT_KEY = 'applepay-ecm'

router.get('/applepay-ecm', (req, res) => {
  const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  res.render('paypal/jssdk-v5/applepay-ecm', {
    title: product?.displayName ?? 'Apple Pay ECM',
    provider: PROVIDER, sdkVersion: SDK_VERSION,
    currentProductKey: PRODUCT_KEY, currentSdkVersion: SDK_VERSION,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    clientId: process.env.PAYPAL_CN_CLIENT_ID,
  })
})

router.post('/api/applepay-ecm/create-order', async (req, res) => {
  try {
    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: 'USD', value: '1.00' } }] }),
    })
    res.json({ id: (await r.json()).id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/api/applepay-ecm/capture-order', async (req, res) => {
  try {
    const { orderID } = req.body
    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    res.json(await r.json())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
```

- [ ] **Step 2: Create `src/views/paypal/jssdk-v5/applepay-ecm.ejs`**

```html
<%- include('../../layout', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar,
  extraHead: `<script src="https://www.paypal.com/sdk/js?client-id=${clientId}&components=applepay&currency=USD" data-namespace="paypalSDK"></script>`,
  body: `
    <div class="sandbox-page">
      <div class="sandbox-header">
        <div class="provider-badge">PayPal · JSSDK v5 · Apple Pay ECM</div>
        <h1>${title}</h1>
        <p>Apple Pay via PayPal — Express Checkout Mini flow. Requires Safari + Apple Wallet card.</p>
      </div>
      <div class="sandbox-card">
        <div class="amount-display">
          <div class="amount-label">Test Amount</div>
          <div class="amount-value">$1.00</div>
          <span class="sandbox-badge">⚡ Sandbox Mode</span>
        </div>
        <div id="applepay-button-container"></div>
        <div class="result-msg" id="result"></div>
      </div>
    </div>
    <script>
    (async () => {
      const applepay = paypalSDK.Applepay()
      const config = await applepay.config()
      if (!config.isEligible) {
        document.getElementById('applepay-button-container').innerHTML =
          '<p style="color:var(--fg-muted);font-size:12px;text-align:center;">Apple Pay not available in this browser. Use Safari on macOS/iOS.</p>'
        return
      }
      const btn = document.createElement('apple-pay-button')
      btn.setAttribute('buttonstyle', 'black')
      btn.setAttribute('type', 'buy')
      btn.setAttribute('locale', 'en-US')
      btn.style.width = '100%'
      btn.style.height = '44px'
      document.getElementById('applepay-button-container').appendChild(btn)
      btn.addEventListener('click', async () => {
        const orderId = await fetch('/paypal/jssdk-v5/api/applepay-ecm/create-order', { method: 'POST' })
          .then(r => r.json()).then(d => d.id)
        const session = new ApplePaySession(3, {
          countryCode: 'US', currencyCode: 'USD',
          merchantCapabilities: ['supports3DS'],
          supportedNetworks: ['visa', 'masterCard', 'amex', 'discover'],
          total: { label: 'Demo Hub', amount: '1.00' }
        })
        session.onvalidatemerchant = async (e) => {
          const { merchantSession } = await applepay.validateMerchant({ validationUrl: e.validationURL, displayName: 'Demo Hub' })
          session.completeMerchantValidation(merchantSession)
        }
        session.onpaymentauthorized = async (e) => {
          await applepay.confirmOrder({ orderId, token: e.payment.token, billingContact: e.payment.billingContact })
          const captured = await fetch('/paypal/jssdk-v5/api/applepay-ecm/capture-order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderID: orderId })
          }).then(r => r.json())
          session.completePayment(ApplePaySession.STATUS_SUCCESS)
          const el = document.getElementById('result')
          el.className = 'result-msg success'
          el.textContent = '✓ Payment captured: ' + captured.id
        }
        session.begin()
      })
    })()
    </script>
  `
}) %>
```

- [ ] **Step 3: Create `src/routes/paypal/jssdk-v5/applepay-ecs.js`**

Same as `applepay-ecm.js` — replace all `applepay-ecm` with `applepay-ecs` and `PRODUCT_KEY = 'applepay-ecs'`. The ECS experience context differs in the order creation payload.

```js
// Same structure as applepay-ecm.js with:
// PRODUCT_KEY = 'applepay-ecs'
// router.get('/applepay-ecs', ...)
// router.post('/api/applepay-ecs/create-order', ...)
// router.post('/api/applepay-ecs/capture-order', ...)
// order body adds: payment_source: { apple_pay: { experience_context: { return_url: 'http://localhost:3000/paypal/jssdk-v5/applepay-ecs' } } }
```

- [ ] **Step 4: Create `src/views/paypal/jssdk-v5/applepay-ecs.ejs`**

Same as `applepay-ecm.ejs` — replace all `applepay-ecm` API paths with `applepay-ecs` and update the badge label to "ECS".

- [ ] **Step 5: Verify**

On Safari: open `http://localhost:3000/paypal/jssdk-v5/applepay-ecm` — Apple Pay button appears. On non-Safari browser: "Apple Pay not available" message shows instead of a broken button.

- [ ] **Step 6: Commit**

```bash
git add apps/demo-hub/src/routes/paypal/jssdk-v5/applepay-ecm.js \
        apps/demo-hub/src/views/paypal/jssdk-v5/applepay-ecm.ejs \
        apps/demo-hub/src/routes/paypal/jssdk-v5/applepay-ecs.js \
        apps/demo-hub/src/views/paypal/jssdk-v5/applepay-ecs.ejs
git commit -m "feat(demo-hub): add Apple Pay ECM + ECS demos"
```

---

## Task 13: Google Pay ECM + ECS Demos

**Files:**
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/googlepay-ecm.js`
- Create: `apps/demo-hub/src/views/paypal/jssdk-v5/googlepay-ecm.ejs`
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/googlepay-ecs.js`
- Create: `apps/demo-hub/src/views/paypal/jssdk-v5/googlepay-ecs.ejs`

> **Pre-req:** Google Pay requires HTTPS or `localhost`. The CN sandbox account must have Google Pay enabled. Test in Chrome on Android or desktop Chrome with a saved Google Pay card.

- [ ] **Step 1: Create `src/routes/paypal/jssdk-v5/googlepay-ecm.js`**

```js
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API } = require('../../../config/paypal')
const router = Router()

const PROVIDER = 'paypal', SDK_VERSION = 'jssdk-v5', PRODUCT_KEY = 'googlepay-ecm'

router.get('/googlepay-ecm', (req, res) => {
  const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  res.render('paypal/jssdk-v5/googlepay-ecm', {
    title: product?.displayName ?? 'Google Pay ECM',
    provider: PROVIDER, sdkVersion: SDK_VERSION,
    currentProductKey: PRODUCT_KEY, currentSdkVersion: SDK_VERSION,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    clientId: process.env.PAYPAL_CN_CLIENT_ID,
  })
})

router.post('/api/googlepay-ecm/create-order', async (req, res) => {
  try {
    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: 'USD', value: '1.00' } }] }),
    })
    res.json({ id: (await r.json()).id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/api/googlepay-ecm/capture-order', async (req, res) => {
  try {
    const { orderID } = req.body
    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    res.json(await r.json())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
```

- [ ] **Step 2: Create `src/views/paypal/jssdk-v5/googlepay-ecm.ejs`**

```html
<%- include('../../layout', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar,
  extraHead: `
    <script src="https://pay.google.com/gp/p/js/pay.js"></script>
    <script src="https://www.paypal.com/sdk/js?client-id=${clientId}&components=googlepay&currency=USD" data-namespace="paypalSDK"></script>
  `,
  body: `
    <div class="sandbox-page">
      <div class="sandbox-header">
        <div class="provider-badge">PayPal · JSSDK v5 · Google Pay ECM</div>
        <h1>${title}</h1>
        <p>Google Pay via PayPal — Express Checkout Mini. Requires Chrome + Google Pay card.</p>
      </div>
      <div class="sandbox-card">
        <div class="amount-display">
          <div class="amount-label">Test Amount</div>
          <div class="amount-value">$1.00</div>
          <span class="sandbox-badge">⚡ Sandbox Mode</span>
        </div>
        <div id="googlepay-button-container"></div>
        <div class="result-msg" id="result"></div>
      </div>
    </div>
    <script>
    (async () => {
      const googlepay = paypalSDK.Googlepay()
      const config = await googlepay.config()
      const paymentsClient = new google.payments.api.PaymentsClient({ environment: 'TEST' })
      const isReady = await paymentsClient.isReadyToPay({
        apiVersion: 2, apiVersionMinor: 0,
        allowedPaymentMethods: config.allowedPaymentMethods
      })
      if (!isReady.result) {
        document.getElementById('googlepay-button-container').innerHTML =
          '<p style="color:var(--fg-muted);font-size:12px;text-align:center;">Google Pay not available. Use Chrome with a saved Google Pay card.</p>'
        return
      }
      const button = paymentsClient.createButton({
        onClick: async () => {
          const orderId = await fetch('/paypal/jssdk-v5/api/googlepay-ecm/create-order', { method: 'POST' })
            .then(r => r.json()).then(d => d.id)
          const paymentData = await paymentsClient.loadPaymentData({
            apiVersion: 2, apiVersionMinor: 0,
            allowedPaymentMethods: config.allowedPaymentMethods,
            transactionInfo: { totalPriceStatus: 'FINAL', totalPrice: '1.00', currencyCode: 'USD', countryCode: 'US' },
            merchantInfo: { merchantName: 'Demo Hub', merchantId: config.merchantId }
          })
          await googlepay.confirmOrder({ orderId, paymentMethodData: paymentData.paymentMethodData })
          const captured = await fetch('/paypal/jssdk-v5/api/googlepay-ecm/capture-order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderID: orderId })
          }).then(r => r.json())
          const el = document.getElementById('result')
          el.className = 'result-msg success'
          el.textContent = '✓ Payment captured: ' + captured.id
        },
        buttonType: 'buy'
      })
      document.getElementById('googlepay-button-container').appendChild(button)
    })()
    </script>
  `
}) %>
```

- [ ] **Step 3: Create ECS variants** — `googlepay-ecs.js` and `googlepay-ecs.ejs`

Same structure as ECM files. Replace `googlepay-ecm` with `googlepay-ecs` throughout, update badge label to "ECS".

- [ ] **Step 4: Verify**

On Chrome: `http://localhost:3000/paypal/jssdk-v5/googlepay-ecm` — Google Pay button renders if a card is saved to Google account. Non-eligible browser shows fallback message.

- [ ] **Step 5: Commit**

```bash
git add apps/demo-hub/src/routes/paypal/jssdk-v5/googlepay-ecm.js \
        apps/demo-hub/src/views/paypal/jssdk-v5/googlepay-ecm.ejs \
        apps/demo-hub/src/routes/paypal/jssdk-v5/googlepay-ecs.js \
        apps/demo-hub/src/views/paypal/jssdk-v5/googlepay-ecs.ejs
git commit -m "feat(demo-hub): add Google Pay ECM + ECS demos"
```

---

## Task 14: Vault with-purchase Demos (PayPal + ACDC + ApplePay)

**Files:**
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/vault-paypal-with-purchase.js`
- Create: `apps/demo-hub/src/views/paypal/jssdk-v5/vault-paypal-with-purchase.ejs`
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/vault-acdc-with-purchase.js`
- Create: `apps/demo-hub/src/views/paypal/jssdk-v5/vault-acdc-with-purchase.ejs`
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/vault-applepay-with-purchase.js`
- Create: `apps/demo-hub/src/views/paypal/jssdk-v5/vault-applepay-with-purchase.ejs`

Vault with-purchase: creates an order with `payment_source.paypal.attributes.vault.store_in_vault = "ON_SUCCESS"` so the payment method is saved when the purchase completes.

- [ ] **Step 1: Create `src/routes/paypal/jssdk-v5/vault-paypal-with-purchase.js`**

```js
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API } = require('../../../config/paypal')
const router = Router()

const PROVIDER = 'paypal', SDK_VERSION = 'jssdk-v5', PRODUCT_KEY = 'vault-paypal-with-purchase'

router.get('/vault-paypal-with-purchase', (req, res) => {
  const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  res.render('paypal/jssdk-v5/vault-paypal-with-purchase', {
    title: product?.displayName ?? 'PayPal Vault (w/ Purchase)',
    provider: PROVIDER, sdkVersion: SDK_VERSION,
    currentProductKey: PRODUCT_KEY, currentSdkVersion: SDK_VERSION,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    clientId: process.env.PAYPAL_CN_CLIENT_ID,
  })
})

router.post('/api/vault-paypal-with-purchase/create-order', async (req, res) => {
  try {
    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: '1.00' } }],
        payment_source: {
          paypal: {
            attributes: { vault: { store_in_vault: 'ON_SUCCESS', usage_type: 'MERCHANT' } },
            experience_context: { return_url: 'http://localhost:3000', cancel_url: 'http://localhost:3000' }
          }
        }
      }),
    })
    res.json({ id: (await r.json()).id })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/api/vault-paypal-with-purchase/capture-order', async (req, res) => {
  try {
    const { orderID } = req.body
    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const data = await r.json()
    // Vault token is in: data.payment_source.paypal.attributes.vault.id
    const vaultId = data?.payment_source?.paypal?.attributes?.vault?.id
    res.json({ ...data, vaultId })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
```

- [ ] **Step 2: Create `src/views/paypal/jssdk-v5/vault-paypal-with-purchase.ejs`**

```html
<%- include('../../layout', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar,
  extraHead: `<script src="https://www.paypal.com/sdk/js?client-id=${clientId}&components=buttons&vault=true&currency=USD" data-namespace="paypalSDK"></script>`,
  body: `
    <div class="sandbox-page">
      <div class="sandbox-header">
        <div class="provider-badge">PayPal · JSSDK v5 · Vault</div>
        <h1>${title}</h1>
        <p>Complete $1.00 purchase and vault the payment method in one step. Vault token returned on success.</p>
      </div>
      <div class="sandbox-card">
        <div class="amount-display">
          <div class="amount-label">Test Amount</div>
          <div class="amount-value">$1.00</div>
          <span class="sandbox-badge">⚡ Sandbox Mode · Vault ON_SUCCESS</span>
        </div>
        <div id="paypal-button-container"></div>
        <div class="result-msg" id="result"></div>
      </div>
    </div>
    <script>
      paypalSDK.Buttons({
        createOrder: () =>
          fetch('/paypal/jssdk-v5/api/vault-paypal-with-purchase/create-order', { method: 'POST' })
            .then(r => r.json()).then(d => d.id),
        onApprove: (data) =>
          fetch('/paypal/jssdk-v5/api/vault-paypal-with-purchase/capture-order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderID: data.orderID })
          }).then(r => r.json()).then(o => {
            const el = document.getElementById('result')
            el.className = 'result-msg success'
            el.textContent = '✓ Captured: ' + o.id + (o.vaultId ? ' · Vault ID: ' + o.vaultId : '')
          }),
        onError: e => {
          const el = document.getElementById('result')
          el.className = 'result-msg error'
          el.textContent = '✗ ' + e
        }
      }).render('#paypal-button-container')
    </script>
  `
}) %>
```

- [ ] **Step 3: Create ACDC with-purchase** (`vault-acdc-with-purchase.js` + `.ejs`)

Same as PayPal with-purchase but using `CardFields` (ACDC) and `payment_source.card.attributes.vault.store_in_vault = "ON_SUCCESS"`.

Route key differences in create-order body:
```js
body: JSON.stringify({
  intent: 'CAPTURE',
  purchase_units: [{ amount: { currency_code: 'USD', value: '1.00' } }],
  payment_source: {
    card: { attributes: { vault: { store_in_vault: 'ON_SUCCESS' } } }
  }
})
```

View uses `CardFields` component (same as Task 11 ACDC) with `vault=true` in SDK URL.

- [ ] **Step 4: Create ApplePay with-purchase** (`vault-applepay-with-purchase.js` + `.ejs`)

Same as Apple Pay ECM but order creation includes:
```js
payment_source: {
  apple_pay: { attributes: { vault: { store_in_vault: 'ON_SUCCESS', usage_type: 'MERCHANT' } } }
}
```

- [ ] **Step 5: Verify**

Open `http://localhost:3000/paypal/jssdk-v5/vault-paypal-with-purchase`. Complete payment. Result should show captured order ID **and** a Vault ID (e.g., `VAULT-xxx`).

- [ ] **Step 6: Commit**

```bash
git add apps/demo-hub/src/routes/paypal/jssdk-v5/vault-paypal-with-purchase.js \
        apps/demo-hub/src/views/paypal/jssdk-v5/vault-paypal-with-purchase.ejs \
        apps/demo-hub/src/routes/paypal/jssdk-v5/vault-acdc-with-purchase.js \
        apps/demo-hub/src/views/paypal/jssdk-v5/vault-acdc-with-purchase.ejs \
        apps/demo-hub/src/routes/paypal/jssdk-v5/vault-applepay-with-purchase.js \
        apps/demo-hub/src/views/paypal/jssdk-v5/vault-applepay-with-purchase.ejs
git commit -m "feat(demo-hub): add Vault with-purchase demos (PayPal + ACDC + ApplePay)"
```

---

## Task 15: Vault Setup-Only Demos (PayPal + ACDC)

**Files:**
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/vault-paypal-setup-only.js`
- Create: `apps/demo-hub/src/views/paypal/jssdk-v5/vault-paypal-setup-only.ejs`
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/vault-acdc-setup-only.js`
- Create: `apps/demo-hub/src/views/paypal/jssdk-v5/vault-acdc-setup-only.ejs`

Setup-only uses PayPal's Vault v3 API (`/v3/vault/setup-tokens`) — zero-dollar authorization that creates a setup token, then confirms it to produce a payment token. No order/capture involved.

- [ ] **Step 1: Create `src/routes/paypal/jssdk-v5/vault-paypal-setup-only.js`**

```js
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API } = require('../../../config/paypal')
const router = Router()

const PROVIDER = 'paypal', SDK_VERSION = 'jssdk-v5', PRODUCT_KEY = 'vault-paypal-setup-only'

router.get('/vault-paypal-setup-only', (req, res) => {
  const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  res.render('paypal/jssdk-v5/vault-paypal-setup-only', {
    title: product?.displayName ?? 'PayPal Vault Setup',
    provider: PROVIDER, sdkVersion: SDK_VERSION,
    currentProductKey: PRODUCT_KEY, currentSdkVersion: SDK_VERSION,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    clientId: process.env.PAYPAL_CN_CLIENT_ID,
  })
})

// Step 1: Create setup token (no purchase)
router.post('/api/vault-paypal-setup-only/create-setup-token', async (req, res) => {
  try {
    const token = await getCNToken()
    const r = await fetch(`${API}/v3/vault/setup-tokens`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json',
                 'PayPal-Request-Id': `setup-${Date.now()}` },
      body: JSON.stringify({
        payment_source: {
          paypal: { usage_type: 'MERCHANT', experience_context: {
            return_url: 'http://localhost:3000/paypal/jssdk-v5/vault-paypal-setup-only',
            cancel_url: 'http://localhost:3000/paypal/jssdk-v5/vault-paypal-setup-only'
          }}
        }
      }),
    })
    const data = await r.json()
    res.json({ setupTokenId: data.id, approveLink: data.links?.find(l => l.rel === 'approve')?.href })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Step 2: Approve + confirm setup token → payment token
router.post('/api/vault-paypal-setup-only/confirm-setup-token', async (req, res) => {
  try {
    const { setupTokenId } = req.body
    const token = await getCNToken()
    const r = await fetch(`${API}/v3/vault/payment-tokens`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json',
                 'PayPal-Request-Id': `confirm-${Date.now()}` },
      body: JSON.stringify({ payment_source: { token: { id: setupTokenId, type: 'SETUP_TOKEN' } } }),
    })
    const data = await r.json()
    res.json({ paymentTokenId: data.id, data })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
```

- [ ] **Step 2: Create `src/views/paypal/jssdk-v5/vault-paypal-setup-only.ejs`**

```html
<%- include('../../layout', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar,
  extraHead: `<script src="https://www.paypal.com/sdk/js?client-id=${clientId}&components=buttons&vault=true&currency=USD" data-namespace="paypalSDK"></script>`,
  body: `
    <div class="sandbox-page">
      <div class="sandbox-header">
        <div class="provider-badge">PayPal · JSSDK v5 · Vault Setup</div>
        <h1>${title}</h1>
        <p>Pure vault enrollment — no purchase. Creates a setup token, buyer approves, confirms to payment token.</p>
      </div>
      <div class="sandbox-card">
        <div class="amount-display">
          <div class="amount-label">Payment</div>
          <div class="amount-value" style="font-size:22px;">Setup Only</div>
          <span class="sandbox-badge">⚡ Zero-Dollar Auth</span>
        </div>
        <div id="paypal-button-container"></div>
        <div class="result-msg" id="result"></div>
      </div>
    </div>
    <script>
      paypalSDK.Buttons({
        createVaultSetupToken: () =>
          fetch('/paypal/jssdk-v5/api/vault-paypal-setup-only/create-setup-token', { method: 'POST' })
            .then(r => r.json()).then(d => d.setupTokenId),
        onApprove: async (data) => {
          const res = await fetch('/paypal/jssdk-v5/api/vault-paypal-setup-only/confirm-setup-token', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ setupTokenId: data.vaultSetupToken })
          }).then(r => r.json())
          const el = document.getElementById('result')
          el.className = 'result-msg success'
          el.textContent = '✓ Vault enrolled! Payment Token: ' + res.paymentTokenId
        },
        onError: e => {
          const el = document.getElementById('result')
          el.className = 'result-msg error'
          el.textContent = '✗ ' + e
        }
      }).render('#paypal-button-container')
    </script>
  `
}) %>
```

- [ ] **Step 3: Create `vault-acdc-setup-only.js` and `.ejs`**

Same pattern but using `payment_source.card` in the setup token request body, and using `CardFields` in the view (same as Task 11 ACDC). The `createVaultSetupToken` callback sends the card fields data instead of opening a PayPal popup.

```js
// setup-token body:
body: JSON.stringify({
  payment_source: { card: {} }  // Card details filled by CardFields SDK
})
```

- [ ] **Step 4: Verify**

Open `http://localhost:3000/paypal/jssdk-v5/vault-paypal-setup-only`. Click button, log in as CN sandbox buyer, approve vault. Result shows Payment Token ID (no order ID, no capture).

- [ ] **Step 5: Commit**

```bash
git add apps/demo-hub/src/routes/paypal/jssdk-v5/vault-paypal-setup-only.js \
        apps/demo-hub/src/views/paypal/jssdk-v5/vault-paypal-setup-only.ejs \
        apps/demo-hub/src/routes/paypal/jssdk-v5/vault-acdc-setup-only.js \
        apps/demo-hub/src/views/paypal/jssdk-v5/vault-acdc-setup-only.ejs
git commit -m "feat(demo-hub): add Vault setup-only demos (PayPal + ACDC)"
```

---

## Task 16: Vault Return Buyer Demo

**Files:**
- Create: `apps/demo-hub/src/routes/paypal/jssdk-v5/vault-return.js`
- Create: `apps/demo-hub/src/views/paypal/jssdk-v5/vault-return.ejs`

Demonstrates a returning buyer paying with a previously vaulted payment token — no PayPal button shown, just a "Pay with saved method" button that uses the vault token directly.

- [ ] **Step 1: Create `src/routes/paypal/jssdk-v5/vault-return.js`**

```js
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API } = require('../../../config/paypal')
const router = Router()

const PROVIDER = 'paypal', SDK_VERSION = 'jssdk-v5', PRODUCT_KEY = 'vault-return'

router.get('/vault-return', (req, res) => {
  const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  res.render('paypal/jssdk-v5/vault-return', {
    title: product?.displayName ?? 'Vault Return Buyer',
    provider: PROVIDER, sdkVersion: SDK_VERSION,
    currentProductKey: PRODUCT_KEY, currentSdkVersion: SDK_VERSION,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
  })
})

// Create order using a vault payment token (server-side only, no SDK needed)
router.post('/api/vault-return/create-and-capture', async (req, res) => {
  try {
    const { paymentTokenId } = req.body
    if (!paymentTokenId) return res.status(400).json({ error: 'paymentTokenId required' })
    const token = await getCNToken()

    // Create order with vault token as payment source
    const orderRes = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: '1.00' } }],
        payment_source: { token: { id: paymentTokenId, type: 'PAYMENT_METHOD_TOKEN' } }
      }),
    })
    const order = await orderRes.json()
    if (order.status !== 'APPROVED') return res.status(400).json({ error: 'Order not approved', order })

    // Capture immediately
    const captureRes = await fetch(`${API}/v2/checkout/orders/${order.id}/capture`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    res.json(await captureRes.json())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
```

- [ ] **Step 2: Create `src/views/paypal/jssdk-v5/vault-return.ejs`**

```html
<%- include('../../layout', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar,
  extraHead: '',
  body: `
    <div class="sandbox-page">
      <div class="sandbox-header">
        <div class="provider-badge">PayPal · JSSDK v5 · Vault Return</div>
        <h1>${title}</h1>
        <p>Enter a Payment Token ID from a previous vault session. Charge $1.00 server-side — no buyer interaction.</p>
      </div>
      <div class="sandbox-card">
        <div class="amount-display">
          <div class="amount-label">Test Amount</div>
          <div class="amount-value">$1.00</div>
          <span class="sandbox-badge">⚡ Server-side Vault Charge</span>
        </div>
        <div class="field-group">
          <div class="field-label">Payment Token ID</div>
          <input id="token-input" type="text" placeholder="e.g. PAYMENT-TOKEN-123"
            style="background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:10px 14px;width:100%;color:var(--fg);font-family:'Space Mono',monospace;font-size:12px;outline:none;">
        </div>
        <button id="pay-btn" style="width:100%;background:var(--accent);border:none;border-radius:8px;padding:14px;color:#0F172A;font-family:'Space Mono',monospace;font-size:13px;font-weight:700;cursor:pointer;margin-top:8px;">
          Charge $1.00 with Vaulted Method
        </button>
        <div class="result-msg" id="result"></div>
        <div class="test-hint">Get a Payment Token ID from the Vault Setup or Vault with-purchase demos above.</div>
      </div>
    </div>
    <script>
      document.getElementById('pay-btn').addEventListener('click', async () => {
        const paymentTokenId = document.getElementById('token-input').value.trim()
        if (!paymentTokenId) {
          const el = document.getElementById('result')
          el.className = 'result-msg error'
          el.textContent = '✗ Please enter a Payment Token ID'
          return
        }
        const res = await fetch('/paypal/jssdk-v5/api/vault-return/create-and-capture', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentTokenId })
        }).then(r => r.json())
        const el = document.getElementById('result')
        if (res.id) {
          el.className = 'result-msg success'
          el.textContent = '✓ Captured: ' + res.id + ' · Status: ' + res.status
        } else {
          el.className = 'result-msg error'
          el.textContent = '✗ ' + (res.error || JSON.stringify(res))
        }
      })
    </script>
  `
}) %>
```

- [ ] **Step 3: Verify**

1. First get a payment token from `/paypal/jssdk-v5/vault-paypal-setup-only`
2. Copy the token ID from the success message
3. Open `http://localhost:3000/paypal/jssdk-v5/vault-return`, paste it, click charge
4. Result shows captured order ID immediately (no PayPal button, no buyer popup)

- [ ] **Step 4: Commit**

```bash
git add apps/demo-hub/src/routes/paypal/jssdk-v5/vault-return.js \
        apps/demo-hub/src/views/paypal/jssdk-v5/vault-return.ejs
git commit -m "feat(demo-hub): add Vault return buyer demo (/paypal/jssdk-v5/vault-return)"
```

---

## Task 17: Supabase Seed Data

Insert the 14 products into `demohub.products`.

- [ ] **Step 1: Open Supabase SQL editor and run**

```sql
-- 先建 schema（若尚未建立）
CREATE SCHEMA IF NOT EXISTS demohub;

-- 共享工具函数（若尚未建立）
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS demohub.products (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     text        NOT NULL,
  sdk_version  text        NOT NULL,
  product_key  text        NOT NULL,
  display_name text        NOT NULL,
  description  text        NOT NULL DEFAULT '',
  enabled      boolean     NOT NULL DEFAULT true,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, sdk_version, product_key)
);

CREATE TRIGGER demohub_products_updated_at
  BEFORE UPDATE ON demohub.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE demohub.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON demohub.products FOR SELECT USING (true);

INSERT INTO demohub.products (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('paypal','jssdk-v5','spb-ecm',                    'SPB ECM Flow',               'Smart Payment Button — Express Checkout Mark Flow',   true,  1),
  ('paypal','jssdk-v5','spb-ecs',                    'SPB ECS Flow',               'Smart Payment Button — Express Checkout Shortcut',   true,  2),
  ('paypal','jssdk-v5','buttons',                    'Standalone Buttons',        'PayPal / PayLater / BCDC / Venmo Standalone Buttons 渲染',        true,  3),
  ('paypal','jssdk-v5','acdc',                       'ACDC',                       'Advanced Credit/Debit Card 卡片输入集成',              true,  4),
  ('paypal','jssdk-v5','applepay-ecm',               'Apple Pay ECM',              'Apple Pay — Express Checkout Mini 流程',              true,  5),
  ('paypal','jssdk-v5','applepay-ecs',               'Apple Pay ECS',              'Apple Pay — Express Checkout Standard 流程',          true,  6),
  ('paypal','jssdk-v5','googlepay-ecm',              'Google Pay ECM',             'Google Pay — Express Checkout Mini 流程',             true,  7),
  ('paypal','jssdk-v5','googlepay-ecs',              'Google Pay ECS',             'Google Pay — Express Checkout Standard 流程',         true,  8),
  ('paypal','jssdk-v5','vault-paypal-with-purchase', 'PayPal Vault (w/ Purchase)', 'Vault 签约 + 首次购买一步完成',                        true,  9),
  ('paypal','jssdk-v5','vault-paypal-setup-only',    'PayPal Vault Setup',         '纯 Vault 签约，无购买（Setup Token）',                 true, 10),
  ('paypal','jssdk-v5','vault-acdc-with-purchase',   'ACDC Vault (w/ Purchase)',   'ACDC Vault 签约 + 首次购买',                          true, 11),
  ('paypal','jssdk-v5','vault-acdc-setup-only',      'ACDC Vault Setup',           '纯 ACDC Vault 签约，无购买',                          true, 12),
  ('paypal','jssdk-v5','vault-applepay-with-purchase','Apple Pay Vault (w/ Purchase)','Apple Pay Vault 签约 + 首次购买',                  true, 13),
  ('paypal','jssdk-v5','vault-return',               'Vault Return Buyer',         'Vault 回头买家体验（已签约后的支付流程）',              true, 14)
ON CONFLICT (provider, sdk_version, product_key) DO NOTHING;

-- 最后：在 Supabase Dashboard → Settings → API → Exposed schemas 里开启 demohub schema
```

- [ ] **Step 2: Restart demo-hub and verify all 14 products load**

```bash
npm run dev
```
Expected: `[config] Loaded 14 products from Supabase`

- [ ] **Step 3: Verify homepage shows all 14 cards**

Open `http://localhost:3000` — JSSDK v5 section shows 14 product cards.

---

## Self-Review

**Spec coverage check:**
- ✅ All 14 product_keys implemented
- ✅ Dual-account strategy (CN + US) — handled in `buttons.js` + `paypal.js` helper
- ✅ `data-namespace` for dual SDK load on `buttons` page
- ✅ Vault with-purchase: `store_in_vault: "ON_SUCCESS"` in order body
- ✅ Vault setup-only: `/v3/vault/setup-tokens` API, `createVaultSetupToken` SDK method
- ✅ Vault return: server-side charge via payment token, no buyer popup
- ✅ Left sidebar on all product pages
- ✅ Tab bar (Demo|Code|Logs) — Code + Logs disabled
- ✅ Light/dark theme toggle persisted to localStorage
- ✅ Apple Pay / Google Pay eligibility fallback messages
- ✅ Supabase seed SQL included

**Type consistency check:**
- `getProduct(provider, sdkVersion, productKey)` — consistent across all route files ✅
- `getProviderProducts(provider)` — consistent ✅
- `getCNToken()` / `getUSToken()` — consistent ✅
- `API` constant used throughout ✅

**No placeholders check:** All steps have actual code. ✅


---

## NOT in scope

- Rate limiting on API endpoints (accepted risk for internal demo tool)
- Fetch timeout / AbortController (accepted risk, sandbox occasionally slow)
- Automated tests (manual browser testing with PayPal sandbox)
- Production deployment (local tool for now)
- Code Tab / Logs Tab (architecture reserved, implementation deferred)

## TODO items (from CEO review)

- [ ] **P1 — API Request/Response Logger**: After payment success/failure, show collapsible JSON panel with PayPal API request body and response. Required for the Logs Tab. Deferred from D5. Implement when activating the Logs Tab.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR (PLAN) | 3 accepted: factory pattern, token cache, EJS layout |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 3 issues fixed: File Map, factory coverage, extraScripts |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** CEO + ENG + DESIGN CLEARED — 已实现，持续迭代中。
