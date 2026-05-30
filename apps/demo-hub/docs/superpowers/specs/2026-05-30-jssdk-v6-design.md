# JSSDK v6 Demo — Design Spec

**Date:** 2026-05-30  
**Author:** brainstorming session  
**Status:** Draft — pending user approval

---

## 1. Scope

新增 PayPal JSSDK v6 的 20 个独立 demo，挂载到 `/paypal/jssdk-v6/` 路由下。结构完全镜像 jssdk-v5，适配 v6 SDK 的异步初始化 API。

---

## 2. 产品列表与 Product Keys

| sort_order | product_key                  | display_name                  | 路由类型 |
|-----------|------------------------------|-------------------------------|---------|
| 1         | paypal-ecm                   | PayPal ECM                    | 工厂路由 |
| 2         | paypal-ecs                   | PayPal ECS                    | 工厂路由 |
| 3         | paylater-ecm                 | PayLater ECM                  | 工厂路由 |
| 4         | paylater-ecs                 | PayLater ECS                  | 工厂路由 |
| 5         | venmo-ecm                    | Venmo ECM                     | 工厂路由 |
| 6         | venmo-ecs                    | Venmo ECS                     | 工厂路由 |
| 7         | bcdc-ecm                     | BCDC ECM                      | 工厂路由 |
| 8         | bcdc-ecs                     | BCDC ECS                      | 工厂路由 |
| 9         | buttons                      | Standalone Buttons            | 自定义路由 |
| 10        | acdc                         | ACDC                          | 自定义路由 |
| 11        | applepay-ecm                 | Apple Pay ECM                 | 自定义路由 |
| 12        | applepay-ecs                 | Apple Pay ECS                 | 自定义路由 |
| 13        | googlepay-ecm                | Google Pay ECM                | 自定义路由 |
| 14        | googlepay-ecs                | Google Pay ECS                | 自定义路由 |
| 15        | vault-paypal-with-purchase   | PayPal Vault (w/ Purchase)    | 自定义路由 |
| 16        | vault-paypal-setup-only      | PayPal Vault Setup            | 自定义路由 |
| 17        | vault-acdc-with-purchase     | ACDC Vault (w/ Purchase)      | 自定义路由 |
| 18        | vault-acdc-setup-only        | ACDC Vault Setup              | 自定义路由 |
| 19        | plm-html                     | Pay Later Messages — HTML     | 工厂路由 |
| 20        | plm-js                       | Pay Later Messages — JS       | 工厂路由 |

路由前缀：`/paypal/jssdk-v6`  
路由格式：`GET /paypal/jssdk-v6/{product_key}`  
API 格式：`POST /paypal/jssdk-v6/api/{product_key}/create-order`  
         `POST /paypal/jssdk-v6/api/{product_key}/capture-order`

---

## 3. JSSDK v6 与 v5 核心差异

| 方面 | v5 | v6 |
|------|----|----|
| SDK URL | `paypal.com/sdk/js?client-id=...&components=...` | `paypal.com/web-sdk/v6/core`（无 query params） |
| 加载触发 | script 同步可用 | `paypal.createInstance({ clientId, components })` 异步 |
| 按钮渲染 | `paypal.Buttons().render('#container')` | `document.createElement('paypal-button')` + session.start() |
| createOrder 返回 | `return orderID`（字符串） | `return { orderId: id }`（对象，小写 d） |
| onApprove 入参 | `data.orderID` | `data.orderId` |
| 资格检查 | `paypal.FUNDING.X` + `fundingSource` | `sdkInstance.findEligibleMethods().isEligible('paypal')` |
| 后端 REST API | 不变 | 不变（继续用 `/v2/checkout/orders`） |
| 后端 SDK | 不使用 | 不使用（直接 fetch，与 v5 一致） |

---

## 4. 目录结构

```
apps/demo-hub/src/
├── routes/paypal/jssdk-v6/
│   ├── _factory.js                       # v6 路由工厂
│   ├── paypal-ecm.js                     # 工厂路由
│   ├── paypal-ecs.js                     # 工厂路由
│   ├── paylater-ecm.js                   # 工厂路由
│   ├── paylater-ecs.js                   # 工厂路由
│   ├── venmo-ecm.js                      # 工厂路由
│   ├── venmo-ecs.js                      # 工厂路由
│   ├── bcdc-ecm.js                       # 工厂路由
│   ├── bcdc-ecs.js                       # 工厂路由
│   ├── buttons.js                        # 自定义路由（多个 funding source）
│   ├── acdc.js                           # 自定义路由
│   ├── applepay-ecm.js                   # 自定义路由
│   ├── applepay-ecs.js                   # 自定义路由
│   ├── googlepay-ecm.js                  # 自定义路由
│   ├── googlepay-ecs.js                  # 自定义路由
│   ├── vault-paypal-with-purchase.js     # 自定义路由
│   ├── vault-paypal-setup-only.js        # 自定义路由
│   ├── vault-acdc-with-purchase.js       # 自定义路由
│   ├── vault-acdc-setup-only.js          # 自定义路由
│   ├── plm-html.js                       # 工厂路由
│   └── plm-js.js                         # 工厂路由
├── views/paypal/jssdk-v6/                # 20 个 EJS，各产品一个
│   ├── paypal-ecm.ejs
│   ├── paypal-ecs.ejs
│   ├── paylater-ecm.ejs
│   ├── paylater-ecs.ejs
│   ├── venmo-ecm.ejs
│   ├── venmo-ecs.ejs
│   ├── bcdc-ecm.ejs
│   ├── bcdc-ecs.ejs
│   ├── buttons.ejs
│   ├── acdc.ejs
│   ├── applepay-ecm.ejs
│   ├── applepay-ecs.ejs
│   ├── googlepay-ecm.ejs
│   ├── googlepay-ecs.ejs
│   ├── vault-paypal-with-purchase.ejs
│   ├── vault-paypal-setup-only.ejs
│   ├── vault-acdc-with-purchase.ejs
│   ├── vault-acdc-setup-only.ejs
│   ├── plm-html.ejs
│   └── plm-js.ejs
└── public/js/paypal/jssdk-v6/
    ├── init.js                           # 共享：getPPInstance() 单例 + sessionStorage
    ├── paypal.js                         # paypal-ecm 和 paypal-ecs 共用
    ├── paylater.js                       # paylater-ecm 和 paylater-ecs 共用
    ├── venmo.js                          # venmo-ecm 和 venmo-ecs 共用
    ├── bcdc.js                           # bcdc-ecm 和 bcdc-ecs 共用
    ├── buttons.js
    ├── acdc.js
    ├── applepay-ecm.js                   # ECM/ECS 实现差异大，各自独立
    ├── applepay-ecs.js
    ├── googlepay-ecm.js
    ├── googlepay-ecs.js
    ├── vault-paypal-with-purchase.js
    ├── vault-paypal-setup-only.js
    ├── vault-acdc-with-purchase.js
    ├── vault-acdc-setup-only.js
    ├── plm-html.js
    └── plm-js.js
```

**JS 文件共用说明：**
- `paypal.js` 被 `paypal-ecm.ejs` 和 `paypal-ecs.ejs` 共用（SDK 调用相同，order body 差异由后端路由区分）
- 同理：`paylater.js`, `venmo.js`, `bcdc.js` 各自被对应的 ECM/ECS 两个 EJS 共用
- Apple Pay / Google Pay / Vault：ECM vs ECS 实现差异较大，各自独立

---

## 5. 共享 init.js 设计

```js
;(function () {
  'use strict'
  var _promise = null

  window.getPPInstance = function () {
    if (_promise) return _promise
    _promise = window.paypal
      .createInstance({
        clientId:   window.DEMO.clientId,
        components: window.DEMO.components || ['paypal-payments'],
      })
      .then(function (inst) {
        try { sessionStorage.setItem('pp_v6_clientId', window.DEMO.clientId) } catch (e) {}
        return inst
      })
    return _promise
  }
})()
```

**职责：**
- `_promise`：页面级单例，同一页面多次调用 `getPPInstance()` 返回相同 Promise
- `sessionStorage.pp_v6_clientId`：跨页面记录"已初始化过"，SDK 命中浏览器缓存时下次加载更快
- `window.DEMO.components`：由各产品 EJS 注入，决定加载哪些 v6 组件

---

## 6. EJS 模板结构

```html
<%- include('../../partials/header', { title, provider, sdkVersion, ... }) %>

<div class="sandbox-page">
  <!-- 产品页内容（金额选择器、按钮容器、结果显示）-->
  <!-- 结构与 v5 完全一致 -->
</div>

<script>
  window.DEMO = {
    clientId:   '<%= clientId %>',
    components: ['paypal-payments'],         // 各产品独立声明，等 markdown 后补全
    urls: {
      createOrder:  '/paypal/jssdk-v6/api/<product_key>/create-order',
      captureOrder: '/paypal/jssdk-v6/api/<product_key>/capture-order',
    }
  }
</script>
<script src="/js/paypal/jssdk-v6/init.js"></script>
<script src="/js/paypal/jssdk-v6/<shared_js_file>.js"></script>
<!-- SDK defer 加载：保证在 window load 事件前执行完毕 -->
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

**`defer` vs `async`：** 用 `defer`（非 `async`），保证 SDK 在 HTML 解析完成后、`window.load` 事件前执行完毕，这样产品 JS 的 `window.addEventListener('load', ...)` 触发时 `paypal` 对象一定已就绪。

---

## 7. 各产品 JS 标准模式（以 paypal-ecm/ecs 为例）

```js
;(function () {
  'use strict'

  // 公共辅助函数（与 v5 相同）
  function getCurrency() { ... }
  function getAmount()   { ... }
  function validateAmount() { ... }
  function clearLoading(id) { ... }
  function showResult(text, type) { ... }

  // 币种切换 → reload（与 v5 相同）
  document.addEventListener('DOMContentLoaded', function () {
    var sel = document.getElementById('demo-currency')
    if (!sel) return
    sel.addEventListener('change', function () {
      var url = new URL(window.location.href)
      url.searchParams.set('currency', this.value)
      var amt = document.getElementById('demo-amount')
      if (amt) url.searchParams.set('amount', amt.value.trim())
      window.location.replace(url.toString())
    })
  })

  window.addEventListener('load', function () {
    if (typeof paypal === 'undefined') {
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }

    var urls = window.DEMO.urls

    getPPInstance()
      .then(function (instance) { return instance.findEligibleMethods() })
      .then(function (eligibility) {
        if (!eligibility.isEligible('paypal')) {
          showResult('PayPal not eligible in this region', 'error')
          return
        }

        var container = clearLoading()
        var btn = document.createElement('paypal-button')
        container.appendChild(btn)

        return instance.createPayPalOneTimePaymentSession({
          onApprove: function (data) {
            return fetch(urls.captureOrder, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: data.orderId }),
            })
              .then(function (r) { return r.json() })
              .then(function (order) {
                // capture 成功判断：与 v5 规则完全一致
                var capture = order.purchase_units &&
                  order.purchase_units[0] &&
                  order.purchase_units[0].payments &&
                  order.purchase_units[0].payments.captures &&
                  order.purchase_units[0].payments.captures[0]
                if (!capture || capture.status !== 'COMPLETED') {
                  showResult('✗ Capture failed · status: ' + (capture ? capture.status : 'unknown'), 'error')
                  return
                }
                showResult('✓ Payment captured · Order: ' + order.id, 'success')
              })
          },
          onCancel: function () { showResult('Payment cancelled.', 'error') },
          onError:  function (err) { showResult('✗ ' + (err.message || String(err)), 'error') },
        })
        .then(function (session) {
          btn.addEventListener('click', function () {
            if (!validateAmount()) return
            // 关键：不能 await createOrder，要传 Promise 引用给 session.start()
            var orderPromise = fetch(urls.createOrder, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ amount: getAmount(), currency: getCurrency() }),
            })
              .then(function (r) { return r.json() })
              .then(function (d) {
                if (d.error) throw new Error(d.error)
                return { orderId: d.orderId }
              })
            session.start({ presentationMode: 'auto' }, orderPromise)
          })
        })
      })
      .catch(function (err) {
        showResult('✗ ' + err.message, 'error')
      })
  })
})()
```

---

## 8. 后端工厂 _factory.js（v6 专属）

相对 v5 工厂，仅改以下几处，其余逻辑（order body、validate、getCNToken）完全照搬：

```js
const SDK_VERSION = 'jssdk-v6'

// GET handler：注入 clientId（不再注入 sdkUrl）
res.render(view, {
  title, provider, sdkVersion: SDK_VERSION, currentProductKey, currentSdkVersion: SDK_VERSION,
  sidebarProducts: getProviderProducts(PROVIDER),
  showSidebar: true,
  clientId: process.env.PAYPAL_CN_CLIENT_ID,  // 前端用于 createInstance
  defaultAmount: amount,
  currency,
  country: req.query.country || '',
})

// create-order：返回 orderId（小写 d）
res.json({ orderId: order.id })

// capture-order：读 orderId（小写 d）
const { orderId } = req.body
const r = await fetch(`${API}/v2/checkout/orders/${orderId}/capture`, {
  method: 'POST', headers: getHeaders(token),
})
```

---

## 9. components 数组（各产品，等 markdown 补全）

| product_key | components | 状态 |
|---|---|---|
| paypal-ecm, paypal-ecs | `['paypal-payments']` | 已确认（v6 文档） |
| paylater-ecm, paylater-ecs | TBD | 等 markdown |
| venmo-ecm, venmo-ecs | TBD | 等 markdown |
| bcdc-ecm, bcdc-ecs, buttons | TBD | 等 markdown |
| acdc | TBD | 等 markdown |
| applepay-ecm, applepay-ecs | TBD | 等 markdown |
| googlepay-ecm, googlepay-ecs | TBD | 等 markdown |
| vault-* | TBD | 等 markdown |
| plm-html, plm-js | TBD | 等 markdown |

---

## 10. Supabase INSERT SQL

```sql
INSERT INTO demohub.products (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('paypal','jssdk-v6','paypal-ecm',                'PayPal ECM',                   'PayPal Button v6 — Express Checkout Mark Flow.',                                          true, 1),
  ('paypal','jssdk-v6','paypal-ecs',                'PayPal ECS',                   'PayPal Button v6 — Express Checkout Shortcut Flow.',                                      true, 2),
  ('paypal','jssdk-v6','paylater-ecm',              'PayLater ECM',                 'PayLater Button v6 — Express Checkout Mark Flow.',                                        true, 3),
  ('paypal','jssdk-v6','paylater-ecs',              'PayLater ECS',                 'PayLater Button v6 — Express Checkout Shortcut Flow.',                                    true, 4),
  ('paypal','jssdk-v6','venmo-ecm',                 'Venmo ECM',                    'Venmo Button v6 — Express Checkout Mark Flow (US only).',                                 true, 5),
  ('paypal','jssdk-v6','venmo-ecs',                 'Venmo ECS',                    'Venmo Button v6 — Express Checkout Shortcut Flow (US only).',                             true, 6),
  ('paypal','jssdk-v6','bcdc-ecm',                  'BCDC ECM',                     'Basic Card Button v6 — Express Checkout Mark Flow.',                                      true, 7),
  ('paypal','jssdk-v6','bcdc-ecs',                  'BCDC ECS',                     'Basic Card Button v6 — Express Checkout Shortcut Flow.',                                  true, 8),
  ('paypal','jssdk-v6','buttons',                   'Standalone Buttons',           'All standalone payment method buttons on one page (v6 SDK).',                             true, 9),
  ('paypal','jssdk-v6','acdc',                      'ACDC',                         'Advanced Credit & Debit Card v6 — hosted card fields with 3DS/SCA support.',              true, 10),
  ('paypal','jssdk-v6','applepay-ecm',              'Apple Pay ECM',                'Apple Pay v6 — Express Checkout Mark Flow.',                                              true, 11),
  ('paypal','jssdk-v6','applepay-ecs',              'Apple Pay ECS',                'Apple Pay v6 — Express Checkout Shortcut Flow.',                                          true, 12),
  ('paypal','jssdk-v6','googlepay-ecm',             'Google Pay ECM',               'Google Pay v6 — Express Checkout Mark Flow.',                                             true, 13),
  ('paypal','jssdk-v6','googlepay-ecs',             'Google Pay ECS',               'Google Pay v6 — Express Checkout Shortcut Flow.',                                         true, 14),
  ('paypal','jssdk-v6','vault-paypal-with-purchase','PayPal Vault (w/ Purchase)',   'PayPal Vault v6 — save payment method during first purchase (store_in_vault: ON_SUCCESS).', true, 15),
  ('paypal','jssdk-v6','vault-paypal-setup-only',   'PayPal Vault Setup',           'PayPal Vault v6 setup-only — create a vault token without a purchase.',                   true, 16),
  ('paypal','jssdk-v6','vault-acdc-with-purchase',  'ACDC Vault (w/ Purchase)',     'ACDC Vault v6 — save card during first purchase.',                                        true, 17),
  ('paypal','jssdk-v6','vault-acdc-setup-only',     'ACDC Vault Setup',             'ACDC Vault v6 setup-only — create a card vault token without a purchase.',                true, 18),
  ('paypal','jssdk-v6','plm-html',                  'Pay Later Messages — HTML',    'PLM v6 via HTML attributes.',                                                             true, 19),
  ('paypal','jssdk-v6','plm-js',                    'Pay Later Messages — JS',      'PLM v6 via JS API.',                                                                      true, 20);
```

---

## 11. app.js 挂载

```js
const v6 = '/paypal/jssdk-v6'
app.use(v6, require('./routes/paypal/jssdk-v6/paypal-ecm'))
app.use(v6, require('./routes/paypal/jssdk-v6/paypal-ecs'))
app.use(v6, require('./routes/paypal/jssdk-v6/paylater-ecm'))
app.use(v6, require('./routes/paypal/jssdk-v6/paylater-ecs'))
app.use(v6, require('./routes/paypal/jssdk-v6/venmo-ecm'))
app.use(v6, require('./routes/paypal/jssdk-v6/venmo-ecs'))
app.use(v6, require('./routes/paypal/jssdk-v6/bcdc-ecm'))
app.use(v6, require('./routes/paypal/jssdk-v6/bcdc-ecs'))
app.use(v6, require('./routes/paypal/jssdk-v6/buttons'))
app.use(v6, require('./routes/paypal/jssdk-v6/acdc'))
app.use(v6, require('./routes/paypal/jssdk-v6/applepay-ecm'))
app.use(v6, require('./routes/paypal/jssdk-v6/applepay-ecs'))
app.use(v6, require('./routes/paypal/jssdk-v6/googlepay-ecm'))
app.use(v6, require('./routes/paypal/jssdk-v6/googlepay-ecs'))
app.use(v6, require('./routes/paypal/jssdk-v6/vault-paypal-with-purchase'))
app.use(v6, require('./routes/paypal/jssdk-v6/vault-paypal-setup-only'))
app.use(v6, require('./routes/paypal/jssdk-v6/vault-acdc-with-purchase'))
app.use(v6, require('./routes/paypal/jssdk-v6/vault-acdc-setup-only'))
app.use(v6, require('./routes/paypal/jssdk-v6/plm-html'))
app.use(v6, require('./routes/paypal/jssdk-v6/plm-js'))
```

---

## 12. 设计模式说明

| 模式 | 位置 | 作用 |
|------|------|------|
| **Singleton (Promise caching)** | `init.js` → `_promise` | `createInstance()` 只调用一次，页面内多个组件复用同一 instance；用 Promise 而非对象缓存，天然支持异步竞态（并发调用安全） |
| **Factory Method** | `_factory.js` | 工厂函数生成标准 GET + POST handler，各产品路由文件只声明差异（productKey / buildBody），不重复 Express 逻辑 |
| **IIFE + Module** | 每个产品 JS 文件 | `(function(){ 'use strict' ... })()` 包裹，避免全局变量污染，与 v5 风格一致 |
| **Command + Session (v6 专属)** | 各产品 JS → `session.start()` | v6 SDK 将"支付会话"抽象为 Session 对象，`session.start(opts, orderPromise)` 接受 Promise 引用而非已解析值，SDK 在需要时才拉取 orderId，避免 transient activation 问题（click 事件过期） |
| **Separation of Concerns** | EJS / init.js / 产品 JS | EJS 只注入配置（`window.DEMO`），`init.js` 只管 SDK 初始化，产品 JS 只管业务流程；三层职责清晰，互不耦合 |

**为什么 `session.start()` 必须传 Promise 而非 await 结果？**

```js
// ❌ 错误：await 会在 click handler 外部提前执行，导致弹窗被浏览器拦截
btn.addEventListener('click', async function () {
  const { orderId } = await createOrder()  // 此时已离开 click transient activation
  session.start(opts, orderId)
})

// ✅ 正确：传 Promise 引用，SDK 在 click transient activation 窗口内立即打开弹窗
btn.addEventListener('click', function () {
  const orderPromise = createOrder()  // 不 await，返回 Promise
  session.start(opts, orderPromise)   // SDK 持有 Promise，弹窗立即触发
})
```

---

## 13. 开放问题（各产品 markdown 到位后补全）

- [ ] paylater / venmo / bcdc / buttons 的 `components` 数组和 eligibility key
- [ ] `acdc` 的 Card Fields v6 API（`createCardFieldsSession` 或类似）
- [ ] `applepay-ecm/ecs` 的 v6 Apple Pay API
- [ ] `googlepay-ecm/ecs` 的 v6 Google Pay API（ECM Promise 模式 vs ECS Full Callback 模式是否保持不变）
- [ ] vault 系列的 v6 vault API
- [ ] `plm-html/js` 的 v6 Messages API
- [ ] `presentationMode` 各产品最佳选择（`auto` / `popup` / `redirect`）

---

## 13. 不在本 spec 范围内

- jssdk-v5 相关文件的修改（精准修改原则，不动已有代码）
- CLAUDE.md symlinks（实现阶段处理）
- production URL（spec 只覆盖 sandbox）
