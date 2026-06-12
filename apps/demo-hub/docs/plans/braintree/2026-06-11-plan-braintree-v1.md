# Braintree Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 10 Braintree `server-sdk` demos (dropin-ui, hosted-fields, paypal, venmo, applepay, googlepay, vault-card-setup-only, vault-card-with-purchase, vault-paypal-setup-only, vault-paypal-with-purchase) plus graphql placeholder routes to demo-hub.

**Architecture:** Factory pattern (`_factory.js` handles GET clientToken + POST transaction scaffold; each product file owns `buildTransaction(nonce, amount, extra)`). Frontend uses `braintree-web` CDN + IIFE JS files. Vault products use Braintree Customer + PaymentMethod model.

**Tech Stack:** Node.js + Express + `braintree` npm (server SDK) + `braintree-web` CDN (client) + EJS + Vanilla JS

---

## File Map

```
New files:
  src/routes/braintree/server-sdk/_config.js
  src/routes/braintree/server-sdk/_factory.js
  src/routes/braintree/server-sdk/dropin-ui.js
  src/routes/braintree/server-sdk/hosted-fields.js
  src/routes/braintree/server-sdk/paypal.js
  src/routes/braintree/server-sdk/venmo.js
  src/routes/braintree/server-sdk/applepay.js
  src/routes/braintree/server-sdk/googlepay.js
  src/routes/braintree/server-sdk/vault-card-setup-only.js
  src/routes/braintree/server-sdk/vault-card-with-purchase.js
  src/routes/braintree/server-sdk/vault-paypal-setup-only.js
  src/routes/braintree/server-sdk/vault-paypal-with-purchase.js
  src/routes/braintree/graphql/{same 10 product files, stub only}

  src/views/braintree/server-sdk/dropin-ui.ejs
  src/views/braintree/server-sdk/hosted-fields.ejs
  src/views/braintree/server-sdk/paypal.ejs
  src/views/braintree/server-sdk/venmo.ejs
  src/views/braintree/server-sdk/applepay.ejs
  src/views/braintree/server-sdk/googlepay.ejs
  src/views/braintree/server-sdk/vault-card-setup-only.ejs
  src/views/braintree/server-sdk/vault-card-with-purchase.ejs
  src/views/braintree/server-sdk/vault-paypal-setup-only.ejs
  src/views/braintree/server-sdk/vault-paypal-with-purchase.ejs

  src/public/js/braintree/server-sdk/dropin-ui.js
  src/public/js/braintree/server-sdk/hosted-fields.js
  src/public/js/braintree/server-sdk/paypal.js
  src/public/js/braintree/server-sdk/venmo.js
  src/public/js/braintree/server-sdk/applepay.js
  src/public/js/braintree/server-sdk/googlepay.js
  src/public/js/braintree/server-sdk/vault-card-setup-only.js
  src/public/js/braintree/server-sdk/vault-card-with-purchase.js
  src/public/js/braintree/server-sdk/vault-paypal-setup-only.js
  src/public/js/braintree/server-sdk/vault-paypal-with-purchase.js

Modified files:
  apps/demo-hub/package.json          (add braintree dep)
  apps/demo-hub/.env + .env.example   (add BT env vars)
  src/app.js                          (mount braintree routes)
  apps/demo-hub/DESIGN.md             (register server-sdk color)
```

---

## Task 1: Install braintree npm + env vars

**Files:**
- Modify: `apps/demo-hub/package.json`
- Modify: `apps/demo-hub/.env`
- Modify: `apps/demo-hub/.env.example`

- [ ] **Step 1: Install braintree npm package**

```bash
cd apps/demo-hub && npm install braintree
```

Expected: `braintree` appears in `package.json` dependencies.

- [ ] **Step 2: Add env vars to .env**

Add to `apps/demo-hub/.env`:
```
BRAINTREE_MERCHANT_ID=your_sandbox_merchant_id
BRAINTREE_PUBLIC_KEY=your_sandbox_public_key
BRAINTREE_PRIVATE_KEY=your_sandbox_private_key
```

- [ ] **Step 3: Add env vars to .env.example**

Add to `apps/demo-hub/.env.example`:
```
BRAINTREE_MERCHANT_ID=
BRAINTREE_PUBLIC_KEY=
BRAINTREE_PRIVATE_KEY=
```

- [ ] **Step 4: Commit**

```bash
git add apps/demo-hub/package.json apps/demo-hub/package-lock.json apps/demo-hub/.env.example
git commit -m "feat(braintree): install braintree npm, add env var stubs"
```

---

## Task 2: Create `_config.js` — Braintree gateway singleton

**Files:**
- Create: `apps/demo-hub/src/routes/braintree/server-sdk/_config.js`

- [ ] **Step 1: Create the file**

```js
// apps/demo-hub/src/routes/braintree/server-sdk/_config.js
const braintree = require('braintree')

const gateway = new braintree.BraintreeGateway({
  environment: braintree.Environment.Sandbox,
  merchantId:  process.env.BRAINTREE_MERCHANT_ID,
  publicKey:   process.env.BRAINTREE_PUBLIC_KEY,
  privateKey:  process.env.BRAINTREE_PRIVATE_KEY,
})

module.exports = { gateway }
```

- [ ] **Step 2: Smoke-test gateway can generate a client token**

Start the app (`npm run dev:demo-hub`) and confirm no startup errors. Then test in Node REPL:
```bash
cd apps/demo-hub
node -e "
require('dotenv').config()
const { gateway } = require('./src/routes/braintree/server-sdk/_config')
gateway.clientToken.generate({}).then(r => console.log('OK token length:', r.clientToken.length))
"
```
Expected: `OK token length: <number greater than 100>`

- [ ] **Step 3: Commit**

```bash
git add apps/demo-hub/src/routes/braintree/server-sdk/_config.js
git commit -m "feat(braintree): add gateway singleton _config.js"
```

---

## Task 3: Create `_factory.js` — route factory

**Files:**
- Create: `apps/demo-hub/src/routes/braintree/server-sdk/_factory.js`

- [ ] **Step 1: Create the factory**

```js
// apps/demo-hub/src/routes/braintree/server-sdk/_factory.js
const { Router } = require('express')
const { gateway } = require('./_config')
const { getProduct, getProviderProducts } = require('../../../config/products')

const PROVIDER    = 'braintree'
const SDK_VERSION = 'server-sdk'
const DEFAULT_AMOUNT = '10.00'

/**
 * createBraintreeRoute
 *
 * GET  /{productKey}           → generate clientToken → render EJS
 * POST /api/{productKey}/transaction → nonce + amount → transaction.sale → result
 *
 * @param {string}   config.productKey
 * @param {string}   config.view           EJS view path e.g. 'braintree/server-sdk/dropin-ui'
 * @param {function} config.buildTransaction(nonce, amount, extra) → braintree transaction params object
 * @param {object}   [config.extraVars]    additional vars passed to EJS render
 */
function createBraintreeRoute({ productKey, view, buildTransaction, extraVars = {} }) {
  const router = Router()

  router.get(`/${productKey}`, async (req, res) => {
    try {
      const { clientToken } = await gateway.clientToken.generate({})
      const product = getProduct(PROVIDER, SDK_VERSION, productKey)
      res.render(view, {
        title:             product?.displayName ?? productKey,
        provider:          PROVIDER,
        sdkVersion:        SDK_VERSION,
        currentProductKey: productKey,
        currentSdkVersion: SDK_VERSION,
        sidebarProducts:   getProviderProducts(PROVIDER),
        showSidebar:       true,
        clientToken,
        defaultAmount:     req.query.amount || DEFAULT_AMOUNT,
        ...extraVars,
      })
    } catch (err) {
      console.error(`[braintree/${productKey}] GET error:`, err.message)
      res.status(500).send('Failed to load demo: ' + err.message)
    }
  })

  router.post(`/api/${productKey}/transaction`, async (req, res) => {
    try {
      const { nonce, amount, ...extra } = req.body
      if (!nonce) return res.status(400).json({ error: 'nonce required' })
      const amt = parseFloat(amount) > 0 ? parseFloat(amount).toFixed(2) : DEFAULT_AMOUNT
      const params = buildTransaction(nonce, amt, extra)
      const result = await gateway.transaction.sale(params)
      if (!result.success) {
        return res.status(400).json({ error: result.message })
      }
      res.json({
        transactionId: result.transaction.id,
        status:        result.transaction.status,
      })
    } catch (err) {
      console.error(`[braintree/${productKey}] transaction error:`, err.message)
      res.status(500).json({ error: err.message })
    }
  })

  return router
}

module.exports = { createBraintreeRoute, DEFAULT_AMOUNT }
```

- [ ] **Step 2: Commit**

```bash
git add apps/demo-hub/src/routes/braintree/server-sdk/_factory.js
git commit -m "feat(braintree): add route factory _factory.js"
```

---

## Task 4: Supabase — insert all 20 product rows

**Files:** Supabase SQL Editor (no code file)

- [ ] **Step 1: Run SQL in Supabase SQL Editor**

```sql
-- server-sdk (enabled: true)
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('braintree','server-sdk','dropin-ui',                'Drop-in UI',                'Pre-built UI: card + PayPal + Venmo + Apple Pay + Google Pay (3DS)',   true, 1),
  ('braintree','server-sdk','hosted-fields',            'Hosted Fields',             'Custom card fields with 3D Secure',                                    true, 2),
  ('braintree','server-sdk','paypal',                   'PayPal',                    'PayPal checkout via Braintree',                                        true, 3),
  ('braintree','server-sdk','venmo',                    'Venmo',                     'Venmo via Braintree (US only)',                                         true, 4),
  ('braintree','server-sdk','applepay',                 'Apple Pay',                 'Apple Pay via Braintree',                                              true, 5),
  ('braintree','server-sdk','googlepay',                'Google Pay',                'Google Pay via Braintree',                                             true, 6),
  ('braintree','server-sdk','vault-card-setup-only',    'Vault Card (Setup Only)',   'Save card to vault without charging',                                  true, 7),
  ('braintree','server-sdk','vault-card-with-purchase', 'Vault Card (w/ Purchase)',  'Save card and charge in one step',                                     true, 8),
  ('braintree','server-sdk','vault-paypal-setup-only',    'Vault PayPal (Setup Only)',  'Save PayPal to vault without charging',                             true, 9),
  ('braintree','server-sdk','vault-paypal-with-purchase', 'Vault PayPal (w/ Purchase)', 'Save PayPal and charge in one step',                               true, 10)
ON CONFLICT (provider, sdk_version, product_key) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description,
      enabled      = EXCLUDED.enabled,
      sort_order   = EXCLUDED.sort_order;

-- graphql (enabled: false, placeholder)
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('braintree','graphql','dropin-ui',                'Drop-in UI',                'Coming soon',  false, 1),
  ('braintree','graphql','hosted-fields',            'Hosted Fields',             'Coming soon',  false, 2),
  ('braintree','graphql','paypal',                   'PayPal',                    'Coming soon',  false, 3),
  ('braintree','graphql','venmo',                    'Venmo',                     'Coming soon',  false, 4),
  ('braintree','graphql','applepay',                 'Apple Pay',                 'Coming soon',  false, 5),
  ('braintree','graphql','googlepay',                'Google Pay',                'Coming soon',  false, 6),
  ('braintree','graphql','vault-card-setup-only',    'Vault Card (Setup Only)',   'Coming soon',  false, 7),
  ('braintree','graphql','vault-card-with-purchase', 'Vault Card (w/ Purchase)',  'Coming soon',  false, 8),
  ('braintree','graphql','vault-paypal-setup-only',    'Vault PayPal (Setup Only)',  'Coming soon', false, 9),
  ('braintree','graphql','vault-paypal-with-purchase', 'Vault PayPal (w/ Purchase)', 'Coming soon', false, 10)
ON CONFLICT (provider, sdk_version, product_key) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description,
      enabled      = EXCLUDED.enabled,
      sort_order   = EXCLUDED.sort_order;
```

- [ ] **Step 2: Verify**

```sql
SELECT provider, sdk_version, product_key, enabled, sort_order
FROM demohub.products
WHERE provider = 'braintree'
ORDER BY sdk_version, sort_order;
```
Expected: 20 rows, server-sdk enabled=true, graphql enabled=false.

---

## Task 5: DESIGN.md — register `server-sdk` color

**Files:**
- Modify: `apps/demo-hub/DESIGN.md`

DESIGN.md already has `braintree / web-sdk` (purple `#A855F7`) and `braintree / graphql` (`#7B2FBE`) registered. The sdk_version is now `server-sdk` (not `web-sdk`), so update the table.

- [ ] **Step 1: Update SDK 深浅色表**

Find the line:
```
| `braintree / web-sdk` | `#A855F7` | 紫家族 · 浅 | 预留（未建）|
```

Replace with:
```
| `braintree / server-sdk` | `#A855F7` | 紫家族 · 浅 | ✅ 实现中 |
```

- [ ] **Step 2: Commit**

```bash
git add apps/demo-hub/DESIGN.md
git commit -m "feat(braintree): update DESIGN.md sdk color — web-sdk → server-sdk"
```

---

## Task 6: app.js — mount routes + create graphql stubs

**Files:**
- Modify: `apps/demo-hub/src/app.js`
- Create: `apps/demo-hub/src/routes/braintree/graphql/*.js` (10 stub files)

- [ ] **Step 1: Create graphql stub files (10 identical stubs)**

For each of these product keys: `dropin-ui`, `hosted-fields`, `paypal`, `venmo`, `applepay`, `googlepay`, `vault-card-setup-only`, `vault-card-with-purchase`, `vault-paypal-setup-only`, `vault-paypal-with-purchase`

Create `apps/demo-hub/src/routes/braintree/graphql/<product-key>.js`:
```js
// Placeholder — Braintree GraphQL implementation coming soon
const { Router } = require('express')
const router = Router()
router.get('/<PRODUCT_KEY>', (req, res) => res.status(200).send('Coming soon'))
module.exports = router
```
(Replace `<PRODUCT_KEY>` with the actual product key string in each file.)

- [ ] **Step 2: Add braintree route blocks to app.js**

After the v6 block and before the 404 handler, add:

```js
// ── Braintree server-sdk ─────────────────────────────────────────────
const btSdk = '/braintree/server-sdk'
app.use(btSdk, require('./routes/braintree/server-sdk/dropin-ui'))
app.use(btSdk, require('./routes/braintree/server-sdk/hosted-fields'))
app.use(btSdk, require('./routes/braintree/server-sdk/paypal'))
app.use(btSdk, require('./routes/braintree/server-sdk/venmo'))
app.use(btSdk, require('./routes/braintree/server-sdk/applepay'))
app.use(btSdk, require('./routes/braintree/server-sdk/googlepay'))
app.use(btSdk, require('./routes/braintree/server-sdk/vault-card-setup-only'))
app.use(btSdk, require('./routes/braintree/server-sdk/vault-card-with-purchase'))
app.use(btSdk, require('./routes/braintree/server-sdk/vault-paypal-setup-only'))
app.use(btSdk, require('./routes/braintree/server-sdk/vault-paypal-with-purchase'))

// ── Braintree graphql (placeholder) ──────────────────────────────────
const btGql = '/braintree/graphql'
app.use(btGql, require('./routes/braintree/graphql/dropin-ui'))
app.use(btGql, require('./routes/braintree/graphql/hosted-fields'))
app.use(btGql, require('./routes/braintree/graphql/paypal'))
app.use(btGql, require('./routes/braintree/graphql/venmo'))
app.use(btGql, require('./routes/braintree/graphql/applepay'))
app.use(btGql, require('./routes/braintree/graphql/googlepay'))
app.use(btGql, require('./routes/braintree/graphql/vault-card-setup-only'))
app.use(btGql, require('./routes/braintree/graphql/vault-card-with-purchase'))
app.use(btGql, require('./routes/braintree/graphql/vault-paypal-setup-only'))
app.use(btGql, require('./routes/braintree/graphql/vault-paypal-with-purchase'))
```

Note: the product route files don't exist yet — app will crash until Task 7+. Create all 10 server-sdk route stubs (just empty Router) before starting app if needed.

- [ ] **Step 3: Restart and verify no crash**

```bash
npm run dev:demo-hub
```
Expected: server starts, `Loaded X products from demohub.products` log shows braintree rows.

- [ ] **Step 4: Commit**

```bash
git add apps/demo-hub/src/app.js apps/demo-hub/src/routes/braintree/
git commit -m "feat(braintree): mount server-sdk routes + graphql stubs in app.js"
```

---

## Task 7: Drop-in UI demo

> 详细需求、设计、实现计划见独立文档：
> - 需求：`docs/req/braintree/2026-06-11-req-braintree-dropin-ui.md`
> - BE 设计：`docs/design/braintree/2026-06-11-design-be-braintree-dropin-ui.md`
> - FE 设计：`docs/design/braintree/2026-06-11-design-fe-braintree-dropin-ui.md`
> - 实现计划：`docs/plans/braintree/2026-06-11-plan-braintree-dropin-ui-v1.md`

**Files:**
- Modify: `src/routes/braintree/server-sdk/dropin-ui.js`
- Create: `src/views/braintree/server-sdk/dropin-ui.ejs`
- Create: `src/public/js/braintree/server-sdk/dropin-ui.js`

- [ ] 按独立计划文档执行，完成后在此打勾

---

## Task 8: Hosted Fields + 3DS

**Files:**
- Create: `src/routes/braintree/server-sdk/hosted-fields.js`
- Create: `src/views/braintree/server-sdk/hosted-fields.ejs`
- Create: `src/public/js/braintree/server-sdk/hosted-fields.js`

### 8a — Route file

- [ ] **Step 1: Create route**

```js
// apps/demo-hub/src/routes/braintree/server-sdk/hosted-fields.js
const { createBraintreeRoute } = require('./_factory')

module.exports = createBraintreeRoute({
  productKey: 'hosted-fields',
  view:       'braintree/server-sdk/hosted-fields',

  buildTransaction: function (nonce, amount) {
    return {
      amount,
      paymentMethodNonce: nonce,
      options: {
        submitForSettlement: true,
        three_d_secure: { required: false },
      },
    }
  },
})
```

### 8b — EJS view

- [ ] **Step 2: Create EJS**

```html
<!-- apps/demo-hub/src/views/braintree/server-sdk/hosted-fields.ejs -->
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar
}) %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-braintree">Braintree · server-sdk · Hosted Fields</span>
    <h1><%= title %></h1>
    <p>Custom card UI with 3D Secure verification</p>
  </div>

  <div class="sandbox-card">
    <div class="amount-row">
      <div class="amount-group">
        <label class="field-label" for="demo-amount">Amount (USD)</label>
        <div class="amount-input-wrapper">
          <input id="demo-amount" class="amount-input" type="text" inputmode="decimal"
            value="<%= defaultAmount %>" placeholder="0.00" />
        </div>
      </div>
      <div class="amount-group">
        <label class="field-label" for="demo-3ds">3D Secure</label>
        <select id="demo-3ds" class="currency-select">
          <option value="none">None</option>
          <option value="SCA_WHEN_REQUIRED">SCA When Required</option>
          <option value="SCA_ALWAYS">SCA Always</option>
        </select>
      </div>
    </div>
    <div class="amount-error" id="amount-error" role="alert"></div>
    <span class="sandbox-mode-badge" style="display:inline-block;margin-bottom:16px">⚡ Sandbox Mode</span>

    <div class="card-fields-form">
      <label class="field-label">Card Number</label>
      <div id="card-number" class="hosted-field"></div>
      <div class="card-row">
        <div>
          <label class="field-label">Expiry</label>
          <div id="expiration-date" class="hosted-field"></div>
        </div>
        <div>
          <label class="field-label">CVV</label>
          <div id="cvv" class="hosted-field"></div>
        </div>
      </div>
      <button id="pay-btn" class="pay-btn">Pay</button>
    </div>

    <div class="result-msg" id="result" role="alert" aria-live="polite"></div>
  </div>
</div>

<style>
  .card-fields-form { display: flex; flex-direction: column; gap: 12px; }
  .card-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .hosted-field { border: 1px solid #ddd; border-radius: 6px; padding: 10px; height: 40px; background: #fff; }
</style>

<script>
  window.DEMO = {
    clientToken:   '<%= clientToken %>',
    defaultAmount: '<%= defaultAmount %>',
    urls: {
      transaction: '/braintree/server-sdk/api/hosted-fields/transaction',
    },
  }
</script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/client.min.js"></script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/hosted-fields.min.js"></script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/three-d-secure.min.js"></script>
<script src="/js/braintree/server-sdk/hosted-fields.js"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

### 8c — Frontend JS

- [ ] **Step 3: Create frontend JS**

```js
// apps/demo-hub/src/public/js/braintree/server-sdk/hosted-fields.js
;(function () {
  'use strict'

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  function getAmount() {
    var input = document.getElementById('demo-amount')
    return input ? parseFloat(input.value.trim()).toFixed(2) : '10.00'
  }

  function get3DSMode() {
    var sel = document.getElementById('demo-3ds')
    return sel ? sel.value : 'none'
  }

  // liabilityShift decision (mirrors PayPal ACDC logic)
  function decide3DS(liabilityShifted, liabilityShiftPossible) {
    if (liabilityShifted || liabilityShiftPossible) return 'proceed'
    return 'proceed' // SCA_WHEN_REQUIRED: non-enrolled cards pass through
  }

  window.addEventListener('load', function () {
    var urls        = (window.DEMO || {}).urls
    var clientToken = (window.DEMO || {}).clientToken
    if (!clientToken) { showResult('✗ No client token', 'error'); return }

    var clientInstance = null
    var hfInstance     = null
    var threeDSInstance = null

    braintree.client.create({ authorization: clientToken }, function (err, client) {
      if (err) { showResult('✗ Client init: ' + err.message, 'error'); return }
      clientInstance = client

      braintree.hostedFields.create({
        client: client,
        styles: {
          input: { 'font-size': '14px', color: '#333' },
          ':focus': { color: '#0070ba' },
        },
        fields: {
          number:         { container: '#card-number',      placeholder: '4111 1111 1111 1111' },
          expirationDate: { container: '#expiration-date',  placeholder: 'MM / YY' },
          cvv:            { container: '#cvv',              placeholder: '123' },
        },
      }, function (err, hf) {
        if (err) { showResult('✗ Hosted Fields init: ' + err.message, 'error'); return }
        hfInstance = hf
      })

      braintree.threeDSecure.create({ version: 2, client: client }, function (err, tds) {
        if (err) { console.warn('3DS init failed:', err.message); return }
        threeDSInstance = tds
      })
    })

    document.getElementById('pay-btn').addEventListener('click', function () {
      if (!hfInstance) { showResult('✗ Card fields not ready', 'error'); return }
      var btn    = this
      var amount = getAmount()
      var mode   = get3DSMode()
      btn.disabled = true
      showResult('Processing…', 'info')

      hfInstance.tokenize(function (err, payload) {
        if (err) {
          showResult('✗ Tokenize: ' + err.message, 'error')
          btn.disabled = false
          return
        }

        function doTransaction(nonce) {
          fetch(urls.transaction, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ nonce: nonce, amount: amount }),
          })
            .then(function (r) { return r.json() })
            .then(function (data) {
              if (data.error) {
                showResult('✗ ' + data.error, 'error')
              } else {
                showResult('✓ ' + data.status + ' · Transaction ID: ' + data.transactionId, 'success')
              }
            })
            .catch(function (e) { showResult('✗ ' + e.message, 'error') })
            .finally(function () { btn.disabled = false })
        }

        if (mode === 'none' || !threeDSInstance) {
          doTransaction(payload.nonce)
          return
        }

        threeDSInstance.verifyCard({
          amount:                   amount,
          nonce:                    payload.nonce,
          bin:                      payload.details.bin,
          challengeRequested:       mode === 'SCA_ALWAYS',
          onLookupComplete: function (data, next) { next() },
        }, function (err, result) {
          if (err) {
            showResult('✗ 3DS error: ' + err.message, 'error')
            btn.disabled = false
            return
          }
          console.log('[3DS] liabilityShifted:', result.liabilityShifted,
                      'liabilityShiftPossible:', result.liabilityShiftPossible)
          var decision = decide3DS(result.liabilityShifted, result.liabilityShiftPossible)
          if (decision === 'proceed') {
            doTransaction(result.nonce)
          } else {
            showResult('✗ 3DS verification failed — card not charged', 'error')
            btn.disabled = false
          }
        })
      })
    })
  })
})()
```

- [ ] **Step 4: Test in browser**

Visit `http://localhost:3000/braintree/server-sdk/hosted-fields`. Verify:
- Card fields render (number, expiry, CVV)
- Test card `4111111111111111` exp `12/2025` CVV `123`, 3DS = None → success
- Test card `4000000000000002` (3DS enrolled), 3DS = SCA Always → 3DS challenge appears

- [ ] **Step 5: Commit**

```bash
git add apps/demo-hub/src/routes/braintree/server-sdk/hosted-fields.js \
        apps/demo-hub/src/views/braintree/server-sdk/hosted-fields.ejs \
        apps/demo-hub/src/public/js/braintree/server-sdk/hosted-fields.js
git commit -m "feat(braintree): add hosted-fields demo with 3DS"
```

---

## Task 9: PayPal via Braintree

**Files:**
- Create: `src/routes/braintree/server-sdk/paypal.js`
- Create: `src/views/braintree/server-sdk/paypal.ejs`
- Create: `src/public/js/braintree/server-sdk/paypal.js`

- [ ] **Step 1: Create route**

```js
// apps/demo-hub/src/routes/braintree/server-sdk/paypal.js
const { createBraintreeRoute } = require('./_factory')

module.exports = createBraintreeRoute({
  productKey: 'paypal',
  view:       'braintree/server-sdk/paypal',

  buildTransaction: function (nonce, amount) {
    return {
      amount,
      paymentMethodNonce: nonce,
      options: { submitForSettlement: true },
    }
  },
})
```

- [ ] **Step 2: Create EJS**

```html
<!-- apps/demo-hub/src/views/braintree/server-sdk/paypal.ejs -->
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar
}) %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-braintree">Braintree · server-sdk · PayPal</span>
    <h1><%= title %></h1>
    <p>PayPal checkout via Braintree (nonce flow)</p>
  </div>

  <div class="sandbox-card">
    <div class="amount-row">
      <div class="amount-group">
        <label class="field-label" for="demo-amount">Amount (USD)</label>
        <div class="amount-input-wrapper">
          <input id="demo-amount" class="amount-input" type="text" inputmode="decimal"
            value="<%= defaultAmount %>" placeholder="0.00" />
        </div>
      </div>
    </div>
    <div class="amount-error" id="amount-error" role="alert"></div>
    <span class="sandbox-mode-badge" style="display:inline-block;margin-bottom:16px">⚡ Sandbox Mode</span>

    <div id="paypal-button" class="sdk-loading">
      <div class="sdk-spinner"></div><span>Loading PayPal…</span>
    </div>
    <div class="result-msg" id="result" role="alert" aria-live="polite"></div>
  </div>
</div>

<script>
  window.DEMO = {
    clientToken:   '<%= clientToken %>',
    defaultAmount: '<%= defaultAmount %>',
    urls: { transaction: '/braintree/server-sdk/api/paypal/transaction' },
  }
</script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/client.min.js"></script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/paypal-checkout.min.js"></script>
<script src="https://www.paypal.com/sdk/js?client-id=sb&currency=USD&intent=capture"></script>
<script src="/js/braintree/server-sdk/paypal.js"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

- [ ] **Step 3: Create frontend JS**

```js
// apps/demo-hub/src/public/js/braintree/server-sdk/paypal.js
;(function () {
  'use strict'

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  function getAmount() {
    var input = document.getElementById('demo-amount')
    return input ? parseFloat(input.value.trim()).toFixed(2) : '10.00'
  }

  window.addEventListener('load', function () {
    var urls        = (window.DEMO || {}).urls
    var clientToken = (window.DEMO || {}).clientToken
    if (!clientToken) { showResult('✗ No client token', 'error'); return }

    braintree.client.create({ authorization: clientToken }, function (err, client) {
      if (err) { showResult('✗ Client: ' + err.message, 'error'); return }

      braintree.paypalCheckout.create({ client: client }, function (err, paypalCheckout) {
        if (err) { showResult('✗ PayPal init: ' + err.message, 'error'); return }

        paypalCheckout.loadPayPalSDK({ currency: 'USD', intent: 'capture' }, function () {
          paypal.Buttons({
            fundingSource: paypal.FUNDING.PAYPAL,
            createOrder: function () {
              return paypalCheckout.createPayment({
                flow:        'checkout',
                amount:      getAmount(),
                currency:    'USD',
                intent:      'capture',
                displayName: 'Demo Store',
              })
            },
            onApprove: function (data) {
              return paypalCheckout.tokenizePayment(data, function (err, payload) {
                if (err) { showResult('✗ Tokenize: ' + err.message, 'error'); return }
                fetch(urls.transaction, {
                  method:  'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body:    JSON.stringify({ nonce: payload.nonce, amount: getAmount() }),
                })
                  .then(function (r) { return r.json() })
                  .then(function (d) {
                    if (d.error) { showResult('✗ ' + d.error, 'error') }
                    else { showResult('✓ ' + d.status + ' · Transaction ID: ' + d.transactionId, 'success') }
                  })
                  .catch(function (e) { showResult('✗ ' + e.message, 'error') })
              })
            },
            onCancel:  function () { showResult('Payment cancelled.', 'error') },
            onError:   function (err) { showResult('✗ ' + err.message, 'error') },
          }).render('#paypal-button')
            .then(function () {
              document.getElementById('paypal-button').classList.remove('sdk-loading')
            })
        })
      })
    })
  })
})()
```

- [ ] **Step 4: Test in browser** — visit `/braintree/server-sdk/paypal`, click PayPal button, complete sandbox login, verify success result.

- [ ] **Step 5: Commit**

```bash
git add apps/demo-hub/src/routes/braintree/server-sdk/paypal.js \
        apps/demo-hub/src/views/braintree/server-sdk/paypal.ejs \
        apps/demo-hub/src/public/js/braintree/server-sdk/paypal.js
git commit -m "feat(braintree): add paypal demo"
```

---

## Task 10: Venmo via Braintree

**Files:**
- Create: `src/routes/braintree/server-sdk/venmo.js`
- Create: `src/views/braintree/server-sdk/venmo.ejs`
- Create: `src/public/js/braintree/server-sdk/venmo.js`

- [ ] **Step 1: Create route** (identical structure to paypal.js, different productKey/view)

```js
// apps/demo-hub/src/routes/braintree/server-sdk/venmo.js
const { createBraintreeRoute } = require('./_factory')

module.exports = createBraintreeRoute({
  productKey: 'venmo',
  view:       'braintree/server-sdk/venmo',
  buildTransaction: function (nonce, amount) {
    return {
      amount,
      paymentMethodNonce: nonce,
      options: { submitForSettlement: true },
    }
  },
})
```

- [ ] **Step 2: Create EJS** (same structure as paypal.ejs, Venmo-specific header text and container id)

```html
<!-- apps/demo-hub/src/views/braintree/server-sdk/venmo.ejs -->
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar
}) %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-braintree">Braintree · server-sdk · Venmo</span>
    <h1><%= title %></h1>
    <p>Venmo via Braintree (US only, sandbox mobile simulation)</p>
  </div>

  <div class="sandbox-card">
    <div class="amount-row">
      <div class="amount-group">
        <label class="field-label" for="demo-amount">Amount (USD)</label>
        <div class="amount-input-wrapper">
          <input id="demo-amount" class="amount-input" type="text" inputmode="decimal"
            value="<%= defaultAmount %>" placeholder="0.00" />
        </div>
      </div>
    </div>
    <span class="sandbox-mode-badge" style="display:inline-block;margin-bottom:16px">⚡ Sandbox Mode</span>
    <div id="venmo-button" class="sdk-loading">
      <div class="sdk-spinner"></div><span>Loading Venmo…</span>
    </div>
    <div class="result-msg" id="result" role="alert" aria-live="polite"></div>
  </div>
</div>

<script>
  window.DEMO = {
    clientToken:   '<%= clientToken %>',
    defaultAmount: '<%= defaultAmount %>',
    urls: { transaction: '/braintree/server-sdk/api/venmo/transaction' },
  }
</script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/client.min.js"></script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/venmo.min.js"></script>
<script src="/js/braintree/server-sdk/venmo.js"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

- [ ] **Step 3: Create frontend JS**

```js
// apps/demo-hub/src/public/js/braintree/server-sdk/venmo.js
;(function () {
  'use strict'

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  function getAmount() {
    var input = document.getElementById('demo-amount')
    return input ? parseFloat(input.value.trim()).toFixed(2) : '10.00'
  }

  window.addEventListener('load', function () {
    var urls        = (window.DEMO || {}).urls
    var clientToken = (window.DEMO || {}).clientToken
    var container   = document.getElementById('venmo-button')

    braintree.client.create({ authorization: clientToken }, function (err, client) {
      if (err) { showResult('✗ Client: ' + err.message, 'error'); return }

      braintree.venmo.create({ client: client, allowDesktop: true, paymentMethodUsage: 'single_use' }, function (err, venmoInstance) {
        container.classList.remove('sdk-loading')

        if (err) {
          if (err.code === 'VENMO_NOT_SUPPORTED') {
            container.innerHTML = '<p style="color:#888">Venmo is not supported in this browser/environment.</p>'
          } else {
            showResult('✗ Venmo init: ' + err.message, 'error')
          }
          return
        }

        var btn = document.createElement('button')
        btn.className = 'pay-btn'
        btn.style.background = '#008CFF'
        btn.textContent = 'Pay with Venmo'
        container.appendChild(btn)

        btn.addEventListener('click', function () {
          btn.disabled = true
          showResult('Opening Venmo…', 'info')

          venmoInstance.tokenize(function (err, payload) {
            if (err) {
              if (err.code === 'VENMO_CANCELED') {
                showResult('Venmo cancelled.', 'error')
              } else {
                showResult('✗ ' + err.message, 'error')
              }
              btn.disabled = false
              return
            }

            fetch(urls.transaction, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ nonce: payload.nonce, amount: getAmount() }),
            })
              .then(function (r) { return r.json() })
              .then(function (d) {
                if (d.error) { showResult('✗ ' + d.error, 'error') }
                else { showResult('✓ ' + d.status + ' · Transaction ID: ' + d.transactionId, 'success') }
              })
              .catch(function (e) { showResult('✗ ' + e.message, 'error') })
              .finally(function () { btn.disabled = false })
          })
        })
      })
    })
  })
})()
```

- [ ] **Step 4: Test** — visit `/braintree/server-sdk/venmo`, check Venmo button renders (may show "not supported" in desktop non-Chrome sandbox — expected).

- [ ] **Step 5: Commit**

```bash
git add apps/demo-hub/src/routes/braintree/server-sdk/venmo.js \
        apps/demo-hub/src/views/braintree/server-sdk/venmo.ejs \
        apps/demo-hub/src/public/js/braintree/server-sdk/venmo.js
git commit -m "feat(braintree): add venmo demo"
```

---

## Task 11: Apple Pay via Braintree

**Files:**
- Create: `src/routes/braintree/server-sdk/applepay.js`
- Create: `src/views/braintree/server-sdk/applepay.ejs`
- Create: `src/public/js/braintree/server-sdk/applepay.js`

- [ ] **Step 1: Create route**

```js
// apps/demo-hub/src/routes/braintree/server-sdk/applepay.js
const { createBraintreeRoute } = require('./_factory')

module.exports = createBraintreeRoute({
  productKey: 'applepay',
  view:       'braintree/server-sdk/applepay',
  buildTransaction: function (nonce, amount) {
    return {
      amount,
      paymentMethodNonce: nonce,
      options: { submitForSettlement: true },
    }
  },
})
```

- [ ] **Step 2: Create EJS**

```html
<!-- apps/demo-hub/src/views/braintree/server-sdk/applepay.ejs -->
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar
}) %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-braintree">Braintree · server-sdk · Apple Pay</span>
    <h1><%= title %></h1>
    <p>Apple Pay via Braintree (requires Safari on Apple device)</p>
  </div>

  <div class="sandbox-card">
    <div class="amount-row">
      <div class="amount-group">
        <label class="field-label" for="demo-amount">Amount (USD)</label>
        <div class="amount-input-wrapper">
          <input id="demo-amount" class="amount-input" type="text" inputmode="decimal"
            value="<%= defaultAmount %>" placeholder="0.00" />
        </div>
      </div>
    </div>
    <span class="sandbox-mode-badge" style="display:inline-block;margin-bottom:16px">⚡ Sandbox Mode</span>
    <div id="applepay-container"></div>
    <div class="result-msg" id="result" role="alert" aria-live="polite"></div>
  </div>
</div>

<script>
  window.DEMO = {
    clientToken:   '<%= clientToken %>',
    defaultAmount: '<%= defaultAmount %>',
    urls: { transaction: '/braintree/server-sdk/api/applepay/transaction' },
  }
</script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/client.min.js"></script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/apple-pay.min.js"></script>
<script src="https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js"></script>
<script src="/js/braintree/server-sdk/applepay.js"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

- [ ] **Step 3: Create frontend JS**

```js
// apps/demo-hub/src/public/js/braintree/server-sdk/applepay.js
;(function () {
  'use strict'

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  function getAmount() {
    var input = document.getElementById('demo-amount')
    return input ? parseFloat(input.value.trim()).toFixed(2) : '10.00'
  }

  window.addEventListener('load', function () {
    var urls        = (window.DEMO || {}).urls
    var clientToken = (window.DEMO || {}).clientToken
    var container   = document.getElementById('applepay-container')

    if (!window.ApplePaySession || !ApplePaySession.supportsVersion(3) || !ApplePaySession.canMakePayments()) {
      container.innerHTML = '<p style="color:#888">Apple Pay is not available. Please use Safari on a supported Apple device.</p>'
      return
    }

    braintree.client.create({ authorization: clientToken }, function (err, client) {
      if (err) { showResult('✗ Client: ' + err.message, 'error'); return }

      braintree.applePay.create({ client: client }, function (err, applePayInstance) {
        if (err) { showResult('✗ Apple Pay init: ' + err.message, 'error'); return }

        var btn = document.createElement('apple-pay-button')
        btn.setAttribute('buttonstyle', 'black')
        btn.setAttribute('type', 'buy')
        btn.setAttribute('locale', 'en-US')
        container.appendChild(btn)

        btn.addEventListener('click', function () {
          var amount = getAmount()
          var paymentRequest = applePayInstance.createPaymentRequest({
            total: { label: 'Demo Store', amount: amount },
            requiredBillingContactFields: ['postalAddress'],
          })

          var session = new ApplePaySession(3, paymentRequest)

          session.onvalidatemerchant = function (event) {
            applePayInstance.performValidation(
              { validationURL: event.validationURL, displayName: 'Demo Store' },
              function (err, merchantSession) {
                if (err) { showResult('✗ Validation: ' + err.message, 'error'); session.abort(); return }
                session.completeMerchantValidation(merchantSession)
              }
            )
          }

          session.onpaymentauthorized = function (event) {
            applePayInstance.tokenize({ token: event.payment.token }, function (err, payload) {
              if (err) {
                session.completePayment(ApplePaySession.STATUS_FAILURE)
                showResult('✗ Tokenize: ' + err.message, 'error')
                return
              }
              fetch(urls.transaction, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ nonce: payload.nonce, amount: amount }),
              })
                .then(function (r) { return r.json() })
                .then(function (d) {
                  if (d.error) {
                    session.completePayment(ApplePaySession.STATUS_FAILURE)
                    showResult('✗ ' + d.error, 'error')
                  } else {
                    session.completePayment(ApplePaySession.STATUS_SUCCESS)
                    showResult('✓ ' + d.status + ' · Transaction ID: ' + d.transactionId, 'success')
                  }
                })
                .catch(function (e) {
                  session.completePayment(ApplePaySession.STATUS_FAILURE)
                  showResult('✗ ' + e.message, 'error')
                })
            })
          }

          session.oncancel = function () { showResult('Apple Pay cancelled.', 'error') }
          session.begin()
        })
      })
    })
  })
})()
```

- [ ] **Step 4: Test** — on Safari/Apple device, visit `/braintree/server-sdk/applepay`, verify Apple Pay button renders and sheet opens.

- [ ] **Step 5: Commit**

```bash
git add apps/demo-hub/src/routes/braintree/server-sdk/applepay.js \
        apps/demo-hub/src/views/braintree/server-sdk/applepay.ejs \
        apps/demo-hub/src/public/js/braintree/server-sdk/applepay.js
git commit -m "feat(braintree): add applepay demo"
```

---

## Task 12: Google Pay via Braintree

**Files:**
- Create: `src/routes/braintree/server-sdk/googlepay.js`
- Create: `src/views/braintree/server-sdk/googlepay.ejs`
- Create: `src/public/js/braintree/server-sdk/googlepay.js`

- [ ] **Step 1: Create route**

```js
// apps/demo-hub/src/routes/braintree/server-sdk/googlepay.js
const { createBraintreeRoute } = require('./_factory')

module.exports = createBraintreeRoute({
  productKey: 'googlepay',
  view:       'braintree/server-sdk/googlepay',
  buildTransaction: function (nonce, amount) {
    return {
      amount,
      paymentMethodNonce: nonce,
      options: { submitForSettlement: true },
    }
  },
})
```

- [ ] **Step 2: Create EJS**

```html
<!-- apps/demo-hub/src/views/braintree/server-sdk/googlepay.ejs -->
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar
}) %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-braintree">Braintree · server-sdk · Google Pay</span>
    <h1><%= title %></h1>
    <p>Google Pay via Braintree</p>
  </div>

  <div class="sandbox-card">
    <div class="amount-row">
      <div class="amount-group">
        <label class="field-label" for="demo-amount">Amount (USD)</label>
        <div class="amount-input-wrapper">
          <input id="demo-amount" class="amount-input" type="text" inputmode="decimal"
            value="<%= defaultAmount %>" placeholder="0.00" />
        </div>
      </div>
    </div>
    <span class="sandbox-mode-badge" style="display:inline-block;margin-bottom:16px">⚡ Sandbox Mode</span>
    <div id="googlepay-container"></div>
    <div class="result-msg" id="result" role="alert" aria-live="polite"></div>
  </div>
</div>

<script>
  window.DEMO = {
    clientToken:   '<%= clientToken %>',
    defaultAmount: '<%= defaultAmount %>',
    urls: { transaction: '/braintree/server-sdk/api/googlepay/transaction' },
  }
</script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/client.min.js"></script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/google-payment.min.js"></script>
<script src="https://pay.google.com/gp/p/js/pay.js"></script>
<script src="/js/braintree/server-sdk/googlepay.js"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

- [ ] **Step 3: Create frontend JS**

```js
// apps/demo-hub/src/public/js/braintree/server-sdk/googlepay.js
;(function () {
  'use strict'

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  function getAmount() {
    var input = document.getElementById('demo-amount')
    return input ? parseFloat(input.value.trim()).toFixed(2) : '10.00'
  }

  window.addEventListener('load', function () {
    var urls        = (window.DEMO || {}).urls
    var clientToken = (window.DEMO || {}).clientToken
    var container   = document.getElementById('googlepay-container')

    if (!window.google || !window.google.payments) {
      container.innerHTML = '<p style="color:#888">Google Pay is not available in this browser.</p>'
      return
    }

    braintree.client.create({ authorization: clientToken }, function (err, client) {
      if (err) { showResult('✗ Client: ' + err.message, 'error'); return }

      braintree.googlePayment.create({ client: client, googlePayVersion: 2 }, function (err, googlePayInstance) {
        if (err) { showResult('✗ Google Pay init: ' + err.message, 'error'); return }

        var paymentsClient = new google.payments.api.PaymentsClient({ environment: 'TEST' })

        paymentsClient.isReadyToPay({
          apiVersion: 2,
          apiVersionMinor: 0,
          allowedPaymentMethods: googlePayInstance.createPaymentDataRequest().allowedPaymentMethods,
        }).then(function (response) {
          if (!response.result) {
            container.innerHTML = '<p style="color:#888">Google Pay is not available on this device/account.</p>'
            return
          }

          var btn = paymentsClient.createButton({
            onClick: function () {
              var amount  = getAmount()
              var request = googlePayInstance.createPaymentDataRequest({
                transactionInfo: {
                  currencyCode:      'USD',
                  totalPriceStatus:  'FINAL',
                  totalPrice:        amount,
                },
              })
              request.emailRequired = true

              paymentsClient.loadPaymentData(request)
                .then(function (paymentData) {
                  return googlePayInstance.parseResponse(paymentData)
                })
                .then(function (result) {
                  return fetch(urls.transaction, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ nonce: result.nonce, amount: amount }),
                  })
                })
                .then(function (r) { return r.json() })
                .then(function (d) {
                  if (d.error) { showResult('✗ ' + d.error, 'error') }
                  else { showResult('✓ ' + d.status + ' · Transaction ID: ' + d.transactionId, 'success') }
                })
                .catch(function (e) {
                  if (e.statusCode === 'CANCELED') { showResult('Google Pay cancelled.', 'error') }
                  else { showResult('✗ ' + (e.message || String(e)), 'error') }
                })
            },
          })
          container.appendChild(btn)
        })
      })
    })
  })
})()
```

- [ ] **Step 4: Test** — visit `/braintree/server-sdk/googlepay`, verify Google Pay button renders and payment sheet opens.

- [ ] **Step 5: Commit**

```bash
git add apps/demo-hub/src/routes/braintree/server-sdk/googlepay.js \
        apps/demo-hub/src/views/braintree/server-sdk/googlepay.ejs \
        apps/demo-hub/src/public/js/braintree/server-sdk/googlepay.js
git commit -m "feat(braintree): add googlepay demo"
```

---

## Task 13: Vault Card — Setup Only

**Files:**
- Create: `src/routes/braintree/server-sdk/vault-card-setup-only.js`
- Create: `src/views/braintree/server-sdk/vault-card-setup-only.ejs`
- Create: `src/public/js/braintree/server-sdk/vault-card-setup-only.js`

Vault setup-only does NOT use the factory's transaction endpoint. It has a custom route with two endpoints:
- `POST /api/vault-card-setup-only/save` — create customer + save card → return vault token

- [ ] **Step 1: Create route (custom, not factory)**

```js
// apps/demo-hub/src/routes/braintree/server-sdk/vault-card-setup-only.js
const { Router } = require('express')
const { gateway } = require('./_config')
const { getProduct, getProviderProducts } = require('../../../config/products')

const PROVIDER    = 'braintree'
const SDK_VERSION = 'server-sdk'
const PRODUCT_KEY = 'vault-card-setup-only'

const router = Router()

router.get(`/${PRODUCT_KEY}`, async (req, res) => {
  try {
    const { clientToken } = await gateway.clientToken.generate({})
    const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
    res.render('braintree/server-sdk/vault-card-setup-only', {
      title:             product?.displayName ?? PRODUCT_KEY,
      provider:          PROVIDER,
      sdkVersion:        SDK_VERSION,
      currentProductKey: PRODUCT_KEY,
      currentSdkVersion: SDK_VERSION,
      sidebarProducts:   getProviderProducts(PROVIDER),
      showSidebar:       true,
      clientToken,
      defaultAmount:     req.query.amount || '10.00',
    })
  } catch (err) {
    res.status(500).send('Failed to load demo: ' + err.message)
  }
})

router.post(`/api/${PRODUCT_KEY}/save`, async (req, res) => {
  try {
    const { nonce } = req.body
    if (!nonce) return res.status(400).json({ error: 'nonce required' })

    // Create a new customer
    const customerResult = await gateway.customer.create({
      firstName: 'Demo',
      lastName:  'Buyer',
    })
    if (!customerResult.success) {
      return res.status(400).json({ error: customerResult.message })
    }

    // Save payment method to vault
    const pmResult = await gateway.paymentMethod.create({
      customerId:          customerResult.customer.id,
      paymentMethodNonce:  nonce,
      options:             { verifyCard: true },
    })
    if (!pmResult.success) {
      return res.status(400).json({ error: pmResult.message })
    }

    res.json({
      vaultToken:  pmResult.paymentMethod.token,
      customerId:  customerResult.customer.id,
      cardType:    pmResult.paymentMethod.cardType,
      last4:       pmResult.paymentMethod.last4,
    })
  } catch (err) {
    console.error(`[braintree/${PRODUCT_KEY}] save error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
```

- [ ] **Step 2: Create EJS**

```html
<!-- apps/demo-hub/src/views/braintree/server-sdk/vault-card-setup-only.ejs -->
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar
}) %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-braintree">Braintree · server-sdk · Vault Card (Setup Only)</span>
    <h1><%= title %></h1>
    <p>Save a card to Braintree vault without charging — creates Customer + PaymentMethod</p>
  </div>

  <div class="sandbox-card">
    <span class="sandbox-mode-badge" style="display:inline-block;margin-bottom:16px">⚡ Sandbox Mode</span>

    <div class="card-fields-form">
      <label class="field-label">Card Number</label>
      <div id="card-number" class="hosted-field"></div>
      <div class="card-row">
        <div>
          <label class="field-label">Expiry</label>
          <div id="expiration-date" class="hosted-field"></div>
        </div>
        <div>
          <label class="field-label">CVV</label>
          <div id="cvv" class="hosted-field"></div>
        </div>
      </div>
      <button id="save-btn" class="pay-btn">Save Card to Vault</button>
    </div>

    <div class="result-msg" id="result" role="alert" aria-live="polite"></div>

    <div id="vault-result" style="display:none;margin-top:16px;padding:16px;background:#f5f5f5;border-radius:8px;font-family:monospace;font-size:13px">
      <div>Vault Token: <strong id="vault-token"></strong></div>
      <div>Customer ID: <strong id="customer-id"></strong></div>
      <div>Card: <strong id="card-info"></strong></div>
    </div>
  </div>
</div>

<style>
  .card-fields-form { display: flex; flex-direction: column; gap: 12px; }
  .card-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .hosted-field { border: 1px solid #ddd; border-radius: 6px; padding: 10px; height: 40px; background: #fff; }
</style>

<script>
  window.DEMO = {
    clientToken: '<%= clientToken %>',
    urls: { save: '/braintree/server-sdk/api/vault-card-setup-only/save' },
  }
</script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/client.min.js"></script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/hosted-fields.min.js"></script>
<script src="/js/braintree/server-sdk/vault-card-setup-only.js"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

- [ ] **Step 3: Create frontend JS**

```js
// apps/demo-hub/src/public/js/braintree/server-sdk/vault-card-setup-only.js
;(function () {
  'use strict'

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  function showVaultResult(data) {
    document.getElementById('vault-token').textContent  = data.vaultToken
    document.getElementById('customer-id').textContent  = data.customerId
    document.getElementById('card-info').textContent    = data.cardType + ' ****' + data.last4
    document.getElementById('vault-result').style.display = 'block'
  }

  window.addEventListener('load', function () {
    var urls        = (window.DEMO || {}).urls
    var clientToken = (window.DEMO || {}).clientToken
    if (!clientToken) { showResult('✗ No client token', 'error'); return }

    braintree.client.create({ authorization: clientToken }, function (err, client) {
      if (err) { showResult('✗ Client: ' + err.message, 'error'); return }

      braintree.hostedFields.create({
        client: client,
        styles: { input: { 'font-size': '14px', color: '#333' } },
        fields: {
          number:         { container: '#card-number',      placeholder: '4111 1111 1111 1111' },
          expirationDate: { container: '#expiration-date',  placeholder: 'MM / YY' },
          cvv:            { container: '#cvv',              placeholder: '123' },
        },
      }, function (err, hf) {
        if (err) { showResult('✗ Hosted Fields: ' + err.message, 'error'); return }

        document.getElementById('save-btn').addEventListener('click', function () {
          var btn = this
          btn.disabled = true
          showResult('Saving card…', 'info')

          hf.tokenize(function (err, payload) {
            if (err) {
              showResult('✗ Tokenize: ' + err.message, 'error')
              btn.disabled = false
              return
            }
            fetch(urls.save, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ nonce: payload.nonce }),
            })
              .then(function (r) { return r.json() })
              .then(function (d) {
                if (d.error) {
                  showResult('✗ ' + d.error, 'error')
                } else {
                  showResult('✓ Card saved to vault', 'success')
                  showVaultResult(d)
                }
              })
              .catch(function (e) { showResult('✗ ' + e.message, 'error') })
              .finally(function () { btn.disabled = false })
          })
        })
      })
    })
  })
})()
```

- [ ] **Step 4: Test** — visit `/braintree/server-sdk/vault-card-setup-only`, save card, verify vault token + customer ID appear.

- [ ] **Step 5: Commit**

```bash
git add apps/demo-hub/src/routes/braintree/server-sdk/vault-card-setup-only.js \
        apps/demo-hub/src/views/braintree/server-sdk/vault-card-setup-only.ejs \
        apps/demo-hub/src/public/js/braintree/server-sdk/vault-card-setup-only.js
git commit -m "feat(braintree): add vault-card-setup-only demo"
```

---

## Task 14: Vault Card — With Purchase

**Files:**
- Create: `src/routes/braintree/server-sdk/vault-card-with-purchase.js`
- Create: `src/views/braintree/server-sdk/vault-card-with-purchase.ejs`
- Create: `src/public/js/braintree/server-sdk/vault-card-with-purchase.js`

- [ ] **Step 1: Create route**

```js
// apps/demo-hub/src/routes/braintree/server-sdk/vault-card-with-purchase.js
const { Router } = require('express')
const { gateway } = require('./_config')
const { getProduct, getProviderProducts } = require('../../../config/products')

const PROVIDER    = 'braintree'
const SDK_VERSION = 'server-sdk'
const PRODUCT_KEY = 'vault-card-with-purchase'

const router = Router()

router.get(`/${PRODUCT_KEY}`, async (req, res) => {
  try {
    const { clientToken } = await gateway.clientToken.generate({})
    const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
    res.render('braintree/server-sdk/vault-card-with-purchase', {
      title:             product?.displayName ?? PRODUCT_KEY,
      provider:          PROVIDER,
      sdkVersion:        SDK_VERSION,
      currentProductKey: PRODUCT_KEY,
      currentSdkVersion: SDK_VERSION,
      sidebarProducts:   getProviderProducts(PROVIDER),
      showSidebar:       true,
      clientToken,
      defaultAmount:     req.query.amount || '10.00',
    })
  } catch (err) {
    res.status(500).send('Failed to load demo: ' + err.message)
  }
})

router.post(`/api/${PRODUCT_KEY}/transaction`, async (req, res) => {
  try {
    const { nonce, amount } = req.body
    if (!nonce) return res.status(400).json({ error: 'nonce required' })
    const amt = parseFloat(amount) > 0 ? parseFloat(amount).toFixed(2) : '10.00'

    const result = await gateway.transaction.sale({
      amount: amt,
      paymentMethodNonce: nonce,
      options: {
        submitForSettlement:      true,
        storeInVaultOnSuccess:    true,
      },
    })

    if (!result.success) {
      return res.status(400).json({ error: result.message })
    }

    const tx = result.transaction
    res.json({
      transactionId: tx.id,
      status:        tx.status,
      vaultToken:    tx.creditCard?.token ?? null,
      customerId:    tx.customer?.id ?? null,
    })
  } catch (err) {
    console.error(`[braintree/${PRODUCT_KEY}] transaction error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
```

- [ ] **Step 2: Create EJS**

```html
<!-- apps/demo-hub/src/views/braintree/server-sdk/vault-card-with-purchase.ejs -->
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar
}) %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-braintree">Braintree · server-sdk · Vault Card (w/ Purchase)</span>
    <h1><%= title %></h1>
    <p>Save card and charge in one step — storeInVaultOnSuccess</p>
  </div>

  <div class="sandbox-card">
    <div class="amount-row">
      <div class="amount-group">
        <label class="field-label" for="demo-amount">Amount (USD)</label>
        <div class="amount-input-wrapper">
          <input id="demo-amount" class="amount-input" type="text" inputmode="decimal"
            value="<%= defaultAmount %>" placeholder="0.00" />
        </div>
      </div>
    </div>
    <span class="sandbox-mode-badge" style="display:inline-block;margin-bottom:16px">⚡ Sandbox Mode</span>

    <div class="card-fields-form">
      <label class="field-label">Card Number</label>
      <div id="card-number" class="hosted-field"></div>
      <div class="card-row">
        <div><label class="field-label">Expiry</label><div id="expiration-date" class="hosted-field"></div></div>
        <div><label class="field-label">CVV</label><div id="cvv" class="hosted-field"></div></div>
      </div>
      <button id="pay-btn" class="pay-btn">Pay &amp; Save Card</button>
    </div>

    <div class="result-msg" id="result" role="alert" aria-live="polite"></div>
    <div id="vault-result" style="display:none;margin-top:16px;padding:16px;background:#f5f5f5;border-radius:8px;font-family:monospace;font-size:13px">
      <div>Transaction ID: <strong id="tx-id"></strong></div>
      <div>Vault Token: <strong id="vault-token"></strong></div>
      <div>Customer ID: <strong id="customer-id"></strong></div>
    </div>
  </div>
</div>

<style>
  .card-fields-form { display: flex; flex-direction: column; gap: 12px; }
  .card-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .hosted-field { border: 1px solid #ddd; border-radius: 6px; padding: 10px; height: 40px; background: #fff; }
</style>

<script>
  window.DEMO = {
    clientToken:   '<%= clientToken %>',
    defaultAmount: '<%= defaultAmount %>',
    urls: { transaction: '/braintree/server-sdk/api/vault-card-with-purchase/transaction' },
  }
</script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/client.min.js"></script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/hosted-fields.min.js"></script>
<script src="/js/braintree/server-sdk/vault-card-with-purchase.js"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

- [ ] **Step 3: Create frontend JS**

```js
// apps/demo-hub/src/public/js/braintree/server-sdk/vault-card-with-purchase.js
;(function () {
  'use strict'

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  function getAmount() {
    var input = document.getElementById('demo-amount')
    return input ? parseFloat(input.value.trim()).toFixed(2) : '10.00'
  }

  window.addEventListener('load', function () {
    var urls        = (window.DEMO || {}).urls
    var clientToken = (window.DEMO || {}).clientToken
    if (!clientToken) { showResult('✗ No client token', 'error'); return }

    braintree.client.create({ authorization: clientToken }, function (err, client) {
      if (err) { showResult('✗ Client: ' + err.message, 'error'); return }

      braintree.hostedFields.create({
        client: client,
        styles: { input: { 'font-size': '14px', color: '#333' } },
        fields: {
          number:         { container: '#card-number',      placeholder: '4111 1111 1111 1111' },
          expirationDate: { container: '#expiration-date',  placeholder: 'MM / YY' },
          cvv:            { container: '#cvv',              placeholder: '123' },
        },
      }, function (err, hf) {
        if (err) { showResult('✗ Hosted Fields: ' + err.message, 'error'); return }

        document.getElementById('pay-btn').addEventListener('click', function () {
          var btn = this
          btn.disabled = true
          showResult('Processing…', 'info')

          hf.tokenize(function (err, payload) {
            if (err) {
              showResult('✗ Tokenize: ' + err.message, 'error')
              btn.disabled = false
              return
            }
            fetch(urls.transaction, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ nonce: payload.nonce, amount: getAmount() }),
            })
              .then(function (r) { return r.json() })
              .then(function (d) {
                if (d.error) {
                  showResult('✗ ' + d.error, 'error')
                } else {
                  showResult('✓ ' + d.status + ' · Transaction ID: ' + d.transactionId, 'success')
                  var vr = document.getElementById('vault-result')
                  document.getElementById('tx-id').textContent       = d.transactionId
                  document.getElementById('vault-token').textContent  = d.vaultToken || '(not returned)'
                  document.getElementById('customer-id').textContent  = d.customerId || '(not returned)'
                  vr.style.display = 'block'
                }
              })
              .catch(function (e) { showResult('✗ ' + e.message, 'error') })
              .finally(function () { btn.disabled = false })
          })
        })
      })
    })
  })
})()
```

> **⚠️ Watch item:** `storeInVaultOnSuccess` requires a customer to be associated with the transaction. If `tx.creditCard.token` or `tx.customer.id` come back null, the Braintree sandbox account may need customer creation first. In that case, switch the route to: create customer → `transaction.sale` with `customerId` field → same response shape. Record in `docs/debug-log.md`.

- [ ] **Step 4: Test** — visit `/braintree/server-sdk/vault-card-with-purchase`, pay, verify transaction ID and vault token appear.

- [ ] **Step 5: Commit**

```bash
git add apps/demo-hub/src/routes/braintree/server-sdk/vault-card-with-purchase.js \
        apps/demo-hub/src/views/braintree/server-sdk/vault-card-with-purchase.ejs \
        apps/demo-hub/src/public/js/braintree/server-sdk/vault-card-with-purchase.js
git commit -m "feat(braintree): add vault-card-with-purchase demo"
```

---

## Task 15: Vault PayPal — Setup Only

**Files:**
- Create: `src/routes/braintree/server-sdk/vault-paypal-setup-only.js`
- Create: `src/views/braintree/server-sdk/vault-paypal-setup-only.ejs`
- Create: `src/public/js/braintree/server-sdk/vault-paypal-setup-only.js`

- [ ] **Step 1: Create route**

```js
// apps/demo-hub/src/routes/braintree/server-sdk/vault-paypal-setup-only.js
const { Router } = require('express')
const { gateway } = require('./_config')
const { getProduct, getProviderProducts } = require('../../../config/products')

const PROVIDER    = 'braintree'
const SDK_VERSION = 'server-sdk'
const PRODUCT_KEY = 'vault-paypal-setup-only'

const router = Router()

router.get(`/${PRODUCT_KEY}`, async (req, res) => {
  try {
    const { clientToken } = await gateway.clientToken.generate({})
    const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
    res.render('braintree/server-sdk/vault-paypal-setup-only', {
      title:             product?.displayName ?? PRODUCT_KEY,
      provider:          PROVIDER,
      sdkVersion:        SDK_VERSION,
      currentProductKey: PRODUCT_KEY,
      currentSdkVersion: SDK_VERSION,
      sidebarProducts:   getProviderProducts(PROVIDER),
      showSidebar:       true,
      clientToken,
      defaultAmount:     req.query.amount || '10.00',
    })
  } catch (err) {
    res.status(500).send('Failed to load demo: ' + err.message)
  }
})

// Save PayPal as vault payment method (no charge)
router.post(`/api/${PRODUCT_KEY}/save`, async (req, res) => {
  try {
    const { nonce } = req.body
    if (!nonce) return res.status(400).json({ error: 'nonce required' })

    const customerResult = await gateway.customer.create({ firstName: 'Demo', lastName: 'Buyer' })
    if (!customerResult.success) return res.status(400).json({ error: customerResult.message })

    const pmResult = await gateway.paymentMethod.create({
      customerId:         customerResult.customer.id,
      paymentMethodNonce: nonce,
    })
    if (!pmResult.success) return res.status(400).json({ error: pmResult.message })

    res.json({
      vaultToken: pmResult.paymentMethod.token,
      customerId: customerResult.customer.id,
      email:      pmResult.paymentMethod.email ?? null,
    })
  } catch (err) {
    console.error(`[braintree/${PRODUCT_KEY}] save error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
```

- [ ] **Step 2: Create EJS**

```html
<!-- apps/demo-hub/src/views/braintree/server-sdk/vault-paypal-setup-only.ejs -->
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar
}) %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-braintree">Braintree · server-sdk · Vault PayPal (Setup Only)</span>
    <h1><%= title %></h1>
    <p>Save PayPal account to vault without charging — creates Customer + PaymentMethod</p>
  </div>
  <div class="sandbox-card">
    <span class="sandbox-mode-badge" style="display:inline-block;margin-bottom:16px">⚡ Sandbox Mode</span>
    <div id="paypal-button" class="sdk-loading">
      <div class="sdk-spinner"></div><span>Loading PayPal…</span>
    </div>
    <div class="result-msg" id="result" role="alert" aria-live="polite"></div>
    <div id="vault-result" style="display:none;margin-top:16px;padding:16px;background:#f5f5f5;border-radius:8px;font-family:monospace;font-size:13px">
      <div>Vault Token: <strong id="vault-token"></strong></div>
      <div>Customer ID: <strong id="customer-id"></strong></div>
      <div>PayPal Email: <strong id="paypal-email"></strong></div>
    </div>
  </div>
</div>

<script>
  window.DEMO = {
    clientToken:   '<%= clientToken %>',
    defaultAmount: '<%= defaultAmount %>',
    urls: { save: '/braintree/server-sdk/api/vault-paypal-setup-only/save' },
  }
</script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/client.min.js"></script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/paypal-checkout.min.js"></script>
<script src="https://www.paypal.com/sdk/js?client-id=sb&currency=USD&vault=true&intent=tokenize"></script>
<script src="/js/braintree/server-sdk/vault-paypal-setup-only.js"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

- [ ] **Step 3: Create frontend JS**

```js
// apps/demo-hub/src/public/js/braintree/server-sdk/vault-paypal-setup-only.js
;(function () {
  'use strict'

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  window.addEventListener('load', function () {
    var urls        = (window.DEMO || {}).urls
    var clientToken = (window.DEMO || {}).clientToken
    if (!clientToken) { showResult('✗ No client token', 'error'); return }

    braintree.client.create({ authorization: clientToken }, function (err, client) {
      if (err) { showResult('✗ Client: ' + err.message, 'error'); return }

      braintree.paypalCheckout.create({ client: client }, function (err, paypalCheckout) {
        if (err) { showResult('✗ PayPal init: ' + err.message, 'error'); return }

        paypalCheckout.loadPayPalSDK({ vault: true, intent: 'tokenize' }, function () {
          paypal.Buttons({
            fundingSource: paypal.FUNDING.PAYPAL,
            createBillingAgreement: function () {
              return paypalCheckout.createPayment({ flow: 'vault' })
            },
            onApprove: function (data) {
              return paypalCheckout.tokenizePayment(data, function (err, payload) {
                if (err) { showResult('✗ Tokenize: ' + err.message, 'error'); return }
                fetch(urls.save, {
                  method:  'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body:    JSON.stringify({ nonce: payload.nonce }),
                })
                  .then(function (r) { return r.json() })
                  .then(function (d) {
                    if (d.error) {
                      showResult('✗ ' + d.error, 'error')
                    } else {
                      showResult('✓ PayPal saved to vault', 'success')
                      document.getElementById('vault-token').textContent  = d.vaultToken
                      document.getElementById('customer-id').textContent  = d.customerId
                      document.getElementById('paypal-email').textContent = d.email || '(not returned)'
                      document.getElementById('vault-result').style.display = 'block'
                    }
                  })
                  .catch(function (e) { showResult('✗ ' + e.message, 'error') })
              })
            },
            onCancel: function () { showResult('Cancelled.', 'error') },
            onError:  function (err) { showResult('✗ ' + err.message, 'error') },
          }).render('#paypal-button')
            .then(function () {
              document.getElementById('paypal-button').classList.remove('sdk-loading')
            })
        })
      })
    })
  })
})()
```

- [ ] **Step 4: Test** — visit `/braintree/server-sdk/vault-paypal-setup-only`, connect PayPal sandbox account, verify vault token appears.

- [ ] **Step 5: Commit**

```bash
git add apps/demo-hub/src/routes/braintree/server-sdk/vault-paypal-setup-only.js \
        apps/demo-hub/src/views/braintree/server-sdk/vault-paypal-setup-only.ejs \
        apps/demo-hub/src/public/js/braintree/server-sdk/vault-paypal-setup-only.js
git commit -m "feat(braintree): add vault-paypal-setup-only demo"
```

---

## Task 16: Vault PayPal — With Purchase

**Files:**
- Create: `src/routes/braintree/server-sdk/vault-paypal-with-purchase.js`
- Create: `src/views/braintree/server-sdk/vault-paypal-with-purchase.ejs`
- Create: `src/public/js/braintree/server-sdk/vault-paypal-with-purchase.js`

- [ ] **Step 1: Create route**

```js
// apps/demo-hub/src/routes/braintree/server-sdk/vault-paypal-with-purchase.js
const { Router } = require('express')
const { gateway } = require('./_config')
const { getProduct, getProviderProducts } = require('../../../config/products')

const PROVIDER    = 'braintree'
const SDK_VERSION = 'server-sdk'
const PRODUCT_KEY = 'vault-paypal-with-purchase'

const router = Router()

router.get(`/${PRODUCT_KEY}`, async (req, res) => {
  try {
    const { clientToken } = await gateway.clientToken.generate({})
    const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
    res.render('braintree/server-sdk/vault-paypal-with-purchase', {
      title:             product?.displayName ?? PRODUCT_KEY,
      provider:          PROVIDER,
      sdkVersion:        SDK_VERSION,
      currentProductKey: PRODUCT_KEY,
      currentSdkVersion: SDK_VERSION,
      sidebarProducts:   getProviderProducts(PROVIDER),
      showSidebar:       true,
      clientToken,
      defaultAmount:     req.query.amount || '10.00',
    })
  } catch (err) {
    res.status(500).send('Failed to load demo: ' + err.message)
  }
})

router.post(`/api/${PRODUCT_KEY}/transaction`, async (req, res) => {
  try {
    const { nonce, amount } = req.body
    if (!nonce) return res.status(400).json({ error: 'nonce required' })
    const amt = parseFloat(amount) > 0 ? parseFloat(amount).toFixed(2) : '10.00'

    const result = await gateway.transaction.sale({
      amount:             amt,
      paymentMethodNonce: nonce,
      options: {
        submitForSettlement:   true,
        storeInVaultOnSuccess: true,
        paypal: { description: 'Demo Store Purchase' },
      },
    })

    if (!result.success) return res.status(400).json({ error: result.message })

    const tx = result.transaction
    res.json({
      transactionId: tx.id,
      status:        tx.status,
      vaultToken:    tx.paypal?.token ?? null,
      customerId:    tx.customer?.id ?? null,
      payerEmail:    tx.paypal?.payerEmail ?? null,
    })
  } catch (err) {
    console.error(`[braintree/${PRODUCT_KEY}] transaction error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
```

- [ ] **Step 2: Create EJS**

```html
<!-- apps/demo-hub/src/views/braintree/server-sdk/vault-paypal-with-purchase.ejs -->
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar
}) %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-braintree">Braintree · server-sdk · Vault PayPal (w/ Purchase)</span>
    <h1><%= title %></h1>
    <p>Save PayPal account and charge in one step</p>
  </div>
  <div class="sandbox-card">
    <div class="amount-row">
      <div class="amount-group">
        <label class="field-label" for="demo-amount">Amount (USD)</label>
        <div class="amount-input-wrapper">
          <input id="demo-amount" class="amount-input" type="text" inputmode="decimal"
            value="<%= defaultAmount %>" placeholder="0.00" />
        </div>
      </div>
    </div>
    <span class="sandbox-mode-badge" style="display:inline-block;margin-bottom:16px">⚡ Sandbox Mode</span>
    <div id="paypal-button" class="sdk-loading">
      <div class="sdk-spinner"></div><span>Loading PayPal…</span>
    </div>
    <div class="result-msg" id="result" role="alert" aria-live="polite"></div>
    <div id="vault-result" style="display:none;margin-top:16px;padding:16px;background:#f5f5f5;border-radius:8px;font-family:monospace;font-size:13px">
      <div>Transaction ID: <strong id="tx-id"></strong></div>
      <div>Vault Token: <strong id="vault-token"></strong></div>
      <div>Customer ID: <strong id="customer-id"></strong></div>
      <div>PayPal Email: <strong id="payer-email"></strong></div>
    </div>
  </div>
</div>

<script>
  window.DEMO = {
    clientToken:   '<%= clientToken %>',
    defaultAmount: '<%= defaultAmount %>',
    urls: { transaction: '/braintree/server-sdk/api/vault-paypal-with-purchase/transaction' },
  }
</script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/client.min.js"></script>
<script src="https://js.braintreegateway.com/web/3.107.0/js/paypal-checkout.min.js"></script>
<script src="https://www.paypal.com/sdk/js?client-id=sb&currency=USD&vault=true&intent=capture"></script>
<script src="/js/braintree/server-sdk/vault-paypal-with-purchase.js"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

- [ ] **Step 3: Create frontend JS**

```js
// apps/demo-hub/src/public/js/braintree/server-sdk/vault-paypal-with-purchase.js
;(function () {
  'use strict'

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  function getAmount() {
    var input = document.getElementById('demo-amount')
    return input ? parseFloat(input.value.trim()).toFixed(2) : '10.00'
  }

  window.addEventListener('load', function () {
    var urls        = (window.DEMO || {}).urls
    var clientToken = (window.DEMO || {}).clientToken
    if (!clientToken) { showResult('✗ No client token', 'error'); return }

    braintree.client.create({ authorization: clientToken }, function (err, client) {
      if (err) { showResult('✗ Client: ' + err.message, 'error'); return }

      braintree.paypalCheckout.create({ client: client }, function (err, paypalCheckout) {
        if (err) { showResult('✗ PayPal init: ' + err.message, 'error'); return }

        paypalCheckout.loadPayPalSDK({ vault: true, intent: 'capture' }, function () {
          paypal.Buttons({
            fundingSource: paypal.FUNDING.PAYPAL,
            createOrder: function () {
              return paypalCheckout.createPayment({
                flow:        'checkout',
                amount:      getAmount(),
                currency:    'USD',
                intent:      'capture',
                requestBillingAgreement: true,
                displayName: 'Demo Store',
              })
            },
            onApprove: function (data) {
              return paypalCheckout.tokenizePayment(data, function (err, payload) {
                if (err) { showResult('✗ Tokenize: ' + err.message, 'error'); return }
                fetch(urls.transaction, {
                  method:  'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body:    JSON.stringify({ nonce: payload.nonce, amount: getAmount() }),
                })
                  .then(function (r) { return r.json() })
                  .then(function (d) {
                    if (d.error) {
                      showResult('✗ ' + d.error, 'error')
                    } else {
                      showResult('✓ ' + d.status + ' · Transaction ID: ' + d.transactionId, 'success')
                      document.getElementById('tx-id').textContent       = d.transactionId
                      document.getElementById('vault-token').textContent  = d.vaultToken || '(not returned)'
                      document.getElementById('customer-id').textContent  = d.customerId || '(not returned)'
                      document.getElementById('payer-email').textContent  = d.payerEmail || '(not returned)'
                      document.getElementById('vault-result').style.display = 'block'
                    }
                  })
                  .catch(function (e) { showResult('✗ ' + e.message, 'error') })
              })
            },
            onCancel: function () { showResult('Cancelled.', 'error') },
            onError:  function (err) { showResult('✗ ' + err.message, 'error') },
          }).render('#paypal-button')
            .then(function () {
              document.getElementById('paypal-button').classList.remove('sdk-loading')
            })
        })
      })
    })
  })
})()
```

- [ ] **Step 4: Test** — visit `/braintree/server-sdk/vault-paypal-with-purchase`, complete PayPal sandbox flow, verify transaction ID + vault token appear.

- [ ] **Step 5: Commit**

```bash
git add apps/demo-hub/src/routes/braintree/server-sdk/vault-paypal-with-purchase.js \
        apps/demo-hub/src/views/braintree/server-sdk/vault-paypal-with-purchase.ejs \
        apps/demo-hub/src/public/js/braintree/server-sdk/vault-paypal-with-purchase.js
git commit -m "feat(braintree): add vault-paypal-with-purchase demo"
```

---

## Task 17: Final verification + CLAUDE.md update

- [ ] **Step 1: Visit all 10 demos, verify each loads**

```
http://localhost:3000/braintree/server-sdk/dropin-ui
http://localhost:3000/braintree/server-sdk/hosted-fields
http://localhost:3000/braintree/server-sdk/paypal
http://localhost:3000/braintree/server-sdk/venmo
http://localhost:3000/braintree/server-sdk/applepay
http://localhost:3000/braintree/server-sdk/googlepay
http://localhost:3000/braintree/server-sdk/vault-card-setup-only
http://localhost:3000/braintree/server-sdk/vault-card-with-purchase
http://localhost:3000/braintree/server-sdk/vault-paypal-setup-only
http://localhost:3000/braintree/server-sdk/vault-paypal-with-purchase
```

Each page should: load without 500 errors, show the payment widget, show `⚡ Sandbox Mode` badge.

- [ ] **Step 2: Verify homepage shows Braintree section**

Visit `http://localhost:3000/`, confirm Braintree provider section appears with 10 server-sdk product cards. graphql products should NOT appear (enabled: false).

- [ ] **Step 3: Update braintree CLAUDE.md with key rules learned during implementation**

In `apps/demo-hub/src/routes/braintree/CLAUDE.md`, add a section documenting:
- `gateway.clientToken.generate({})` → `result.clientToken`
- transaction success check: `result.success === true`, not HTTP status
- vault watch-item: `storeInVaultOnSuccess` requires customer — if token comes back null, create customer first
- PayPal vault flow: use `flow: 'vault'` for setup-only, `requestBillingAgreement: true` for with-purchase
- Debug findings from any watch-items that fired during testing

- [ ] **Step 4: Final commit**

```bash
git add apps/demo-hub/src/routes/braintree/CLAUDE.md
git commit -m "feat(braintree): complete server-sdk demos, update CLAUDE.md with implementation notes"
```

---

## Watch Items (record in docs/debug-log.md if triggered)

| # | Item | What to do if it fires |
|---|------|------------------------|
| W1 | `storeInVaultOnSuccess` returns null vaultToken/customerId | Switch to explicit customer.create → transaction.sale with customerId |
| W2 | PayPal vault `requestBillingAgreement: true` not supported by sandbox | Try without the flag, check if vault still works |
| W3 | Venmo `allowDesktop: true` not working in sandbox | Expected — Venmo sandbox requires mobile simulation; note in demo UI |
| W4 | Drop-in UI 3DS option not visible in sandbox | Braintree sandbox 3DS requires specific test cards — document which cards to use |
| W5 | `tx.paypal.token` path for vault token differs | Inspect `result.transaction` full object, find actual vault token path |
