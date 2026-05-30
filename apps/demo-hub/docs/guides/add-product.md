# 新增支付产品 Demo 完整步骤

> 通用规则见 `apps/demo-hub/CLAUDE.md`。本文件只包含步骤指南。

### 1. 创建路由文件

**`buildBody` 模式（推荐，所有 API 参数在一个文件）：**
```js
// src/routes/<provider>/<sdk>/<product>.js
const { createStandardRoute } = require('./_factory')
const C = require('../../../config/constants')  // 整个引入

module.exports = createStandardRoute({
  productKey: '<product>',
  sdkParams:  'components=buttons',
  view:       '<provider>/<sdk>/<product>',

  buildBody: function (amount, currency) {
    // 完整 body 在这里，amount + currency 由工厂动态注入
    return {
      intent: C.INTENT.CAPTURE,
      purchase_units: [{
        amount: { currency_code: currency, value: amount, breakdown: { item_total: { currency_code: currency, value: amount } } },
        description: C.DEMO_DESCRIPTION,
        items: [{ ...C.DEMO_ITEM, unit_amount: { currency_code: currency, value: amount } }],
        shipping: C.SANDBOX_SHIPPING,
        // 加任何产品专属字段
      }]
    }
  },
})
```

**所有工厂路由产品必须使用 `buildBody`，包括"简单"产品。** 这样所有 API 参数都在路由文件一处，方便调试和日志查看：
```js
// 即使是最简单的产品，也用 buildBody 而非省略
module.exports = createStandardRoute({
  productKey: 'spb-ecs',
  sdkParams:  'components=buttons',
  view:       'paypal/jssdk-v5/spb-ecs',
  buildBody: function (amount, currency) {
    return {
      intent: C.INTENT.CAPTURE,
      purchase_units: [{
        amount: { currency_code: currency, value: amount, breakdown: { item_total: { currency_code: currency, value: amount } } },
        description: C.DEMO_DESCRIPTION,
        items: [{ ...C.DEMO_ITEM, unit_amount: { currency_code: currency, value: amount } }],
        shipping: C.SANDBOX_SHIPPING,
      }]
    }
  }
})
```

**Vault with-purchase（带购买的 Vault）：**

`vault-paypal-with-purchase` 已改为**完整自定义路由**（不再用工厂）：GET 获取 id_token → 注入 `data-user-id-token`；create-order 的 `payment_source` 在**顶层**（含 vault 完整参数）；capture 返回 `vaultId` + `customerId`。

其余 vault-with-purchase 产品仍可用工厂：
```js
const { createVaultWithPurchaseRoute } = require('./_factory')
module.exports = createVaultWithPurchaseRoute({
  productKey: 'vault-acdc-with-purchase',
  sdkParams:  'components=card-fields&vault=true',
  view:       'paypal/jssdk-v5/vault-acdc-with-purchase',
  paymentSource: { card: { attributes: { vault: { store_in_vault: 'ON_SUCCESS' } } } }
})
```

**自定义路由**（CardFields、双SDK、Google Pay、Vault Setup-only、Return Buyer）：参考 `acdc.js`、`buttons.js`、`googlepay-ecm.js`、`vault-paypal-setup-only.js`、`vault-return.js`。

### 2. 创建（或复用）静态 JS 文件

先看是否能复用已有 JS 文件（参考 `apps/demo-hub/CLAUDE.md` → EJS/JS 分离模式 对应关系表）。

**如需新建 JS 文件**（`src/public/js/<provider>/<sdk>/<product>.js`）：
```js
;(function () {
  'use strict'

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  window.addEventListener('load', function () {
    if (typeof paypalSDK === 'undefined') {
      showResult('✗ PayPal SDK failed to load', 'error'); return
    }
    var container = document.getElementById('paypal-button-container')
    container.classList.remove('sdk-loading')
    container.innerHTML = ''

    var urls = window.DEMO && window.DEMO.urls

    paypalSDK.Buttons({
      createOrder: function () {
        return fetch(urls.createOrder, { method: 'POST' })
          .then(function (r) { return r.json() }).then(function (d) { return d.id })
      },
      onApprove: function (data) {
        return fetch(urls.captureOrder, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderID: data.orderID })
        }).then(function (r) { return r.json() }).then(function (o) {
          showResult('✓ Captured: ' + o.id, 'success')
        })
      },
      onError: function (e) { showResult('✗ ' + (e.message || String(e)), 'error') }
    }).render('#paypal-button-container')
  })
})()
```

### 3. 创建 EJS 视图

在 `src/views/<provider>/<sdk>/<product>.ejs` 创建（**只写 HTML + window.DEMO 注入**）：
```ejs
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar, sdkUrl
}) %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-paypal">PayPal · JSSDK v5</span>
    <h1><%= title %></h1>
    <p>产品描述</p>
  </div>
  <div class="sandbox-card">
    <div class="amount-display">
      <div class="amount-label">Test Amount</div>
      <div class="amount-value">$1.00</div>
      <span class="sandbox-mode-badge">⚡ Sandbox Mode</span>
    </div>
    <div id="paypal-button-container" class="sdk-loading">
      <div class="sdk-spinner"></div>
      <span>Loading PayPal...</span>
    </div>
    <div class="result-msg" id="result" role="alert" aria-live="polite"></div>
  </div>
</div>

<%# 注入 API 端点配置，然后引入静态 JS 文件 %>
<script>
  window.DEMO = {
    urls: {
      createOrder:  '/paypal/jssdk-v5/api/<product>/create-order',
      captureOrder: '/paypal/jssdk-v5/api/<product>/capture-order',
    }
  }
</script>
<script src="/js/paypal/jssdk-v5/<product-or-shared>.js"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

### 4. 挂载路由（`src/app.js`）

```js
// 在对应 SDK 块下加一行
app.use(v5, require('./routes/paypal/jssdk-v5/<product>'))
```

### 5. 插入 Supabase 数据

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('paypal', 'jssdk-v5', '<product>', '显示名称', '一句话描述', true, <排序号>);
```

### 6. 重启并验证

```bash
npm run dev        # 或在已启动的 nodemon 中输入 rs
```

打开 `http://localhost:3000` → 首页自动出现新产品卡片 → 点击进入 demo 页验证。
