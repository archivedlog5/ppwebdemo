# JSSDK v6 Vault ACDC with Purchase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **Model gate:** Writing code requires a non-Opus model (project rule). Under Opus only this markdown exists.
>
> ⚠️ **Git rule:** This project forbids any git operation. **No step runs git.** The user manages version control manually. "Verify" = manual sandbox browser flow (the codebase has no automated test runner for demos; see `docs/test-cases.md`).

**Goal:** Add a v6 `vault-acdc-with-purchase` demo — pay with a card via Card Fields and save it to the vault on successful capture (`store_in_vault: ON_SUCCESS`), using v6 `createCardFieldsOneTimePaymentSession` + Orders v2 API. create-order body is **verbatim from v5**; only `orderId` goes lowercase-d (V6-1). 3DS faithfully mirrors v5 (SCA selector disabled, fixed `SCA_WHEN_REQUIRED`).

**Architecture:** Custom Express route (3 endpoints, CN account) → `/v2/checkout/orders` (create, conditional vault attrs) + GET order (3DS fallback) + capture (extract vault → top-level `vaultId`/`customerId`). Frontend copies the v6 `acdc.js` skeleton (sync one-time session, `createCardFieldsComponent` + `appendChild`, `submit()` → `{state,data}` state machine, `decide3DSAndCapture`) and adds the v5 vault layer (save-card checkbox → `saveVault` flag; `showVaultResult` after capture).

**Tech Stack:** Node.js + Express, EJS, vanilla JS (IIFE), PayPal Web SDK v6 (`web-sdk/v6/core`), Orders v2 REST API, Supabase product config.

**Reference files (read before starting):**
- Req: `docs/req/2026-06-05-req-jssdk-v6-vault-acdc-with-purchase.md`
- BE design: `docs/design/2026-06-05-design-be-jssdk-v6-vault-acdc-with-purchase.md`
- FE design: `docs/design/2026-06-05-design-fe-jssdk-v6-vault-acdc-with-purchase.md`
- Route template: `src/routes/paypal/jssdk-v5/vault-acdc-with-purchase.js` (v5, 3 endpoints) + `src/routes/paypal/jssdk-v6/acdc.js` (v6 patterns)
- FE template: `src/public/js/paypal/jssdk-v6/acdc.js` (card-fields skeleton) + `src/public/js/paypal/jssdk-v5/vault-acdc-with-purchase.js` (vault layer)
- View template: `src/views/paypal/jssdk-v5/vault-acdc-with-purchase.ejs` + `src/views/paypal/jssdk-v6/acdc.ejs`
- Rules: `src/routes/paypal/jssdk-v6/CLAUDE.md` (V6-1..10, V6-ACDC-1..6, V6-VAULT-1..6)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/routes/paypal/jssdk-v6/vault-acdc-with-purchase.js` | Create | GET render + 3 API endpoints (create-order / get order / capture-order) |
| `src/views/paypal/jssdk-v6/vault-acdc-with-purchase.ejs` | Create | Page HTML, `window.DEMO` injection, v6 three-script load |
| `src/public/js/paypal/jssdk-v6/vault-acdc-with-purchase.js` | Create | One-time card-fields + submit state machine + 3DS decide + vault display |
| `src/app.js` | Modify | Mount the new route (one `app.use` line) |
| Supabase `demohub.products` | Insert | One product row (user runs SQL) |
| `src/routes/paypal/jssdk-v6/CLAUDE.md` | Modify | Add "Vault ACDC with Purchase" rule section + components-table row |

---

## Task 1: Backend route (3 endpoints)

**Files:**
- Create: `src/routes/paypal/jssdk-v6/vault-acdc-with-purchase.js`

- [ ] **Step 1: Create the route file**

Copy the structure from v5 `routes/paypal/jssdk-v5/vault-acdc-with-purchase.js`; change SDK to `jssdk-v6`, render path + URLs to v6, add `clientId` to render (drop `sdkUrl`), and make `orderId` lowercase-d everywhere (return field, GET param `:orderId`, capture body key). Full file:

```js
/* Custom: v6 ACDC Vault with purchase — card saved on successful payment (Card Fields one-time session) */
const { Router } = require('express')
const { randomBytes } = require('crypto')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API, getHeaders } = require('../../../config/paypal')
const {
  buildOrderBody, DEFAULT_AMOUNT, DEFAULT_CURRENCY, SUPPORTED_CURRENCIES, validateAmount,
  ACDC_EXPERIENCE_CONTEXT, SANDBOX_BILLING, SANDBOX_BUYER,
} = require('../../../config/constants')

function resolveCurrency(v) { return SUPPORTED_CURRENCIES.includes(v) ? v : DEFAULT_CURRENCY }

const router = Router()
const PROVIDER = 'paypal', SDK = 'jssdk-v6', KEY = 'vault-acdc-with-purchase'
const SCA_METHODS = ['SCA_WHEN_REQUIRED', 'SCA_ALWAYS']

router.get(`/${KEY}`, (req, res) => {
  const product = getProduct(PROVIDER, SDK, KEY)
  res.render(`paypal/jssdk-v6/${KEY}`, {
    title: product?.displayName ?? 'ACDC Vault with Purchase',
    provider: PROVIDER, sdkVersion: SDK,
    currentProductKey: KEY, currentSdkVersion: SDK,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    clientId: process.env.PAYPAL_CN_CLIENT_ID,
    supportedCurrencies: SUPPORTED_CURRENCIES,
    defaultAmount: req.query.amount || DEFAULT_AMOUNT,
    currency: resolveCurrency(req.query.currency),
    sandboxCardholderName: `${SANDBOX_BUYER.name.given_name} ${SANDBOX_BUYER.name.surname}`,
    sandboxBilling: {
      addressLine1: SANDBOX_BILLING.address_line_1,
      adminArea2:   SANDBOX_BILLING.admin_area_2,
      adminArea1:   SANDBOX_BILLING.admin_area_1,
      postalCode:   SANDBOX_BILLING.postal_code,
      countryCode:  SANDBOX_BILLING.country_code,
    },
  })
})

router.post(`/api/${KEY}/create-order`, async (req, res) => {
  try {
    const amount    = req.body.amount || DEFAULT_AMOUNT
    const currency  = resolveCurrency(req.body.currency)
    const scaMethod = SCA_METHODS.includes(req.body.scaMethod) ? req.body.scaMethod : 'SCA_WHEN_REQUIRED'
    const cardholderName = req.body.cardholderName || ''
    const saveVault = req.body.saveVault === true
    const ba = req.body.billingAddress || {}
    const billingAddress = {
      address_line_1: ba.addressLine1 || '',
      address_line_2: ba.addressLine2 || '',
      admin_area_1:   ba.adminArea1   || '',
      admin_area_2:   ba.adminArea2   || '',
      postal_code:    ba.postalCode   || '',
      country_code:   ba.countryCode  || '',
    }

    const amountErr = validateAmount(amount, currency)
    if (amountErr) return res.status(400).json({ error: amountErr })

    const cardAttributes = { verification: { method: scaMethod } }
    const topLevel = {
      payment_source: {
        card: {
          name: cardholderName,
          billing_address: billingAddress,
          experience_context: ACDC_EXPERIENCE_CONTEXT,
          attributes: cardAttributes,
        },
      },
    }
    if (saveVault) {
      cardAttributes.vault = { store_in_vault: 'ON_SUCCESS' }
      cardAttributes.customer = {
        merchant_customer_id: 'CUST_' + randomBytes(6).toString('hex').toUpperCase(),
      }
    }

    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(buildOrderBody(amount, { currency, topLevel })),
    })
    const order = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: order.message, details: order })
    res.json({ orderId: order.id })   // v6: lowercase d
  } catch (err) {
    console.error(`[${KEY}] create-order error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

router.get(`/api/${KEY}/order/:orderId`, async (req, res) => {
  try {
    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${req.params.orderId}`, {
      method: 'GET', headers: getHeaders(token),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
    res.json(data)
  } catch (err) {
    console.error(`[${KEY}] get-order error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

router.post(`/api/${KEY}/capture-order`, async (req, res) => {
  try {
    const { orderId } = req.body   // v6: lowercase d
    if (!orderId) return res.status(400).json({ error: 'orderId required' })
    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST', headers: getHeaders(token),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })

    const vaultInfo  = data?.payment_source?.card?.attributes?.vault || null
    const vaultId    = vaultInfo?.id || null
    const customerId = vaultInfo?.customer?.id || null
    res.json({ ...data, vaultId, customerId })
  } catch (err) {
    console.error(`[${KEY}] capture-order error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
```

- [ ] **Step 2: Confirm constants exports**

Run: `grep -nE 'buildOrderBody|ACDC_EXPERIENCE_CONTEXT|SANDBOX_BUYER|SANDBOX_BILLING|validateAmount|SUPPORTED_CURRENCIES' src/config/constants.js`
Expected: all appear in `module.exports`. (v5 vault-acdc-with-purchase + v6 acdc import the same set — they exist.)

---

## Task 2: Mount the route

**Files:**
- Modify: `src/app.js` (v6 block, after the `vault-acdc-setup-only` line)

- [ ] **Step 1: Add the mount line**

Add immediately after the existing `vault-acdc-setup-only` require:

```js
app.use(v6, require('./routes/paypal/jssdk-v6/vault-acdc-with-purchase'))
```

- [ ] **Step 2: Verify it loads**

Rely on running nodemon (or `cd apps/demo-hub && npm run dev`).
Expected: server restarts with no error. (Route GET will 500 on render until Task 3 creates the view — that's expected; just confirm no `MODULE_NOT_FOUND` / syntax error in the boot log.)

---

## Task 3: EJS view

**Files:**
- Create: `src/views/paypal/jssdk-v6/vault-acdc-with-purchase.ejs`

- [ ] **Step 1: Create the view**

Mirror v5 `views/paypal/jssdk-v5/vault-acdc-with-purchase.ejs` UI (currency/amount, **disabled 3DS select**, Name on Card, card hosts, **save-card checkbox checked**, Vault Result box); apply v6 header (no `sdkUrl`) + three-script load; the 3DS-note link points to v6 acdc. Full file:

```html
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar,
}) %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-paypal">PayPal · JSSDK v6 · ACDC Vault</span>
    <h1><%= title %></h1>
    <p>Advanced card payment with optional vault — check the box to save the card on successful purchase.</p>
  </div>
  <div class="sandbox-card sandbox-card--wide">
    <div class="amount-row">
      <div class="currency-group">
        <label class="field-label" for="demo-currency">Currency</label>
        <select id="demo-currency" class="currency-select" aria-label="Select currency">
          <% var _cur = currency || 'USD' %>
          <% (supportedCurrencies || ['USD']).forEach(function(c) { %>
            <option value="<%= c %>" <%= _cur === c ? 'selected' : '' %>><%= c %></option>
          <% }) %>
        </select>
      </div>
      <div class="amount-group">
        <label class="field-label" for="demo-amount">Amount</label>
        <div class="amount-input-wrapper">
          <input id="demo-amount" class="amount-input" type="text" inputmode="decimal"
            value="<%= defaultAmount || '100.00' %>" placeholder="0.00"
            aria-label="Payment amount" />
        </div>
      </div>
      <div class="currency-group">
        <label class="field-label" for="demo-sca">3DS</label>
        <select id="demo-sca" class="currency-select" aria-label="3DS SCA method" style="min-width:160px;opacity:0.4;cursor:not-allowed" disabled>
          <option value="SCA_WHEN_REQUIRED" selected>SCA_WHEN_REQUIRED</option>
          <option value="SCA_ALWAYS">SCA_ALWAYS</option>
        </select>
      </div>
    </div>
    <div class="amount-error" id="amount-error" role="alert"></div>
    <p style="font-size:11px;color:var(--fg-subtle);margin:0 0 12px">
      This demo focuses on vault functionality only. For 3DS testing, visit the <a href="/paypal/jssdk-v6/acdc" style="color:var(--fg-muted);text-decoration:underline">ACDC demo</a>.
    </p>
    <span class="sandbox-mode-badge" style="display:inline-block;margin-bottom:16px">⚡ Sandbox Mode</span>

    <div class="field-group">
      <label class="field-label">Name on Card</label>
      <input id="card-name" type="text" class="field-host"
        value="<%= sandboxCardholderName %>" placeholder="Full name on card"
        style="width:100%;box-sizing:border-box;font-family:var(--font-mono);font-size:13px;color:var(--fg);outline:none;" />
    </div>
    <div class="field-group">
      <label class="field-label" for="card-number-container">Card Number</label>
      <div class="field-host sdk-loading" id="card-number-container" style="height:42px;overflow:hidden;">
        <div class="sdk-spinner"></div><span>Loading...</span>
      </div>
    </div>
    <div class="field-row">
      <div class="field-group">
        <label class="field-label">Expiry</label>
        <div class="field-host" id="card-expiry-container" style="height:42px;overflow:hidden;"></div>
      </div>
      <div class="field-group">
        <label class="field-label">CVV</label>
        <div class="field-host" id="card-cvv-container" style="height:42px;overflow:hidden;"></div>
      </div>
    </div>

    <div class="field-group" style="margin-top:4px">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--fg-muted)">
        <input type="checkbox" id="save-card" checked
          style="width:15px;height:15px;cursor:pointer;accent-color:var(--brand)" />
        <span>Save card for future purchases (<code style="font-size:12px">store_in_vault: ON_SUCCESS</code>)</span>
      </label>
    </div>

    <button id="acdc-pay-btn" class="pay-btn pay-btn-paypal" type="button">Pay Now</button>
    <div class="result-msg" id="result" role="alert" aria-live="polite"></div>

    <div id="vault-result" style="display:none;margin-top:12px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:6px;font-size:13px;line-height:1.8">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--fg-subtle);margin-bottom:6px">Vault Result</div>
      <div><span style="color:var(--fg-muted)">Vault Token:&nbsp;</span><span id="vault-id" style="font-family:monospace;color:var(--fg)">—</span></div>
      <div><span style="color:var(--fg-muted)">Customer ID:&nbsp;</span><span id="customer-id" style="font-family:monospace;color:var(--fg)">—</span></div>
    </div>

    <div class="test-hint">
      Test card: <strong>4012 0000 3333 0026</strong> · Any future date · Any CVV ·
      <a href="https://developer.paypal.com/docs/checkout/save-payment-methods/during-purchase/js-sdk/cards/" target="_blank" rel="noopener" style="color:inherit;opacity:0.7">more cards ↗</a>
    </div>
  </div>
</div>

<script>
  window.DEMO = {
    clientId:   '<%= clientId %>',
    components: ['card-fields'],
    pageType:   'checkout',
    urls: {
      createOrder:  '/paypal/jssdk-v6/api/vault-acdc-with-purchase/create-order',
      getOrder:     '/paypal/jssdk-v6/api/vault-acdc-with-purchase/order/:orderId',
      captureOrder: '/paypal/jssdk-v6/api/vault-acdc-with-purchase/capture-order',
    },
    billing:       <%- JSON.stringify(sandboxBilling) %>,
    defaultAmount: '<%= defaultAmount || "100.00" %>',
    currency:      '<%= currency %>',
  }
</script>
<script src="/js/paypal/jssdk-v6/init.js"></script>
<script src="/js/paypal/jssdk-v6/vault-acdc-with-purchase.js"></script>
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

> Currency list: v5 hard-codes a 30-currency array inline; here we render from `supportedCurrencies` (passed by the route = `SUPPORTED_CURRENCIES`) to stay DRY with the constants whitelist. Same set, single source of truth.

- [ ] **Step 2: Verify the page renders**

Visit `http://localhost:3000/paypal/jssdk-v6/vault-acdc-with-purchase`.
Expected: page loads; currency/amount/disabled-3DS row, Name on Card, card-number spinner, save-card checkbox (checked), Pay Now visible. Card fields not yet present (JS created in Task 4 — its `<script>` 404s). Confirm no EJS render error.

---

## Task 4: Frontend JS (one-time session + vault layer)

**Files:**
- Create: `src/public/js/paypal/jssdk-v6/vault-acdc-with-purchase.js`

- [ ] **Step 1: Create the JS file**

Copy v6 `acdc.js` skeleton; add `getVaultChecked()` + `showVaultResult()`; add `saveVault` to create-order body; call `showVaultResult` after a COMPLETED capture; add `paymentFlow: 'VAULT_WITH_PAYMENT'` to eligibility (probe P2). Full file:

```js
;(function () {
  'use strict'

  console.log('[ACDC-Vault-v6] vault-acdc-with-purchase.js loaded')

  var STYLE = {
    input: { fontFamily: "'Space Mono', monospace", fontSize: '13px', color: 'inherit' },
    '.invalid': { color: '#EF4444' },
  }

  var ZERO_DECIMAL = ['JPY', 'KRW', 'TWD', 'CLP', 'IDR']

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getCurrency() {
    var sel = document.getElementById('demo-currency')
    return sel ? sel.value : (window.DEMO && window.DEMO.currency) || 'USD'
  }
  function getAmount() {
    var inp = document.getElementById('demo-amount')
    return inp ? inp.value.trim() : (window.DEMO && window.DEMO.defaultAmount) || '100.00'
  }
  function getSCA() {
    var sel = document.getElementById('demo-sca')
    return sel ? sel.value : 'SCA_WHEN_REQUIRED'   // selector disabled → always SCA_WHEN_REQUIRED
  }
  function getName() {
    var inp = document.getElementById('card-name')
    return inp ? inp.value.trim() : ''
  }
  function getVaultChecked() {
    var cb = document.getElementById('save-card')
    return cb ? cb.checked : false
  }
  function isZeroDecimal(currency) { return ZERO_DECIMAL.indexOf(currency) !== -1 }

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }
  function showVaultResult(vaultId, customerId) {
    var panel = document.getElementById('vault-result')
    if (!panel) return
    var v = document.getElementById('vault-id')
    var c = document.getElementById('customer-id')
    if (v) v.textContent = vaultId    || '(not returned)'
    if (c) c.textContent = customerId || '(not returned)'
    panel.style.display = 'block'
  }

  var MIN_AMOUNT = 1.00
  var MAX_AMOUNT = 30000.00
  function validateAmount() {
    var input = document.getElementById('demo-amount')
    var errEl = document.getElementById('amount-error')
    if (!input) return true
    var val = input.value.trim()
    var num = parseFloat(val)
    var cur = getCurrency()
    var zd  = isZeroDecimal(cur)
    var err = ''
    if (!val || isNaN(num) || !/^\d+(\.\d{1,2})?$/.test(val)) {
      err = 'Please enter a valid number'
    } else if (num < MIN_AMOUNT) {
      err = 'Minimum amount is ' + MIN_AMOUNT.toFixed(zd ? 0 : 2)
    } else if (num > MAX_AMOUNT) {
      err = 'Maximum amount is ' + MAX_AMOUNT.toLocaleString()
    } else if (zd && val.indexOf('.') !== -1 && parseFloat(val) !== Math.round(parseFloat(val))) {
      err = cur + ' does not support decimal amounts'
    }
    if (err) {
      if (errEl) errEl.textContent = err
      input.classList.add('amount-input--error')
      return false
    }
    if (errEl) errEl.textContent = ''
    input.classList.remove('amount-input--error')
    return true
  }

  function clearLoading(id) {
    var el = document.getElementById(id)
    if (!el) return
    el.classList.remove('sdk-loading')
    el.innerHTML = ''
  }

  function mapBilling(billing) {
    billing = billing || {}
    return {
      streetAddress: billing.addressLine1 || '',
      city:          billing.adminArea2   || '',
      state:         billing.adminArea1   || '',
      postalCode:    billing.postalCode   || '',
      countryCode:   billing.countryCode  || '',
    }
  }

  // ── Debug probe (remove after v6 vault shapes confirmed) ───────────────────
  function inspect(label, obj) {
    try {
      console.group('[ACDC-Vault-PROBE] ' + label)
      console.log('value:', obj)
      console.dir(obj)
      if (obj && typeof obj === 'object') {
        console.log('own keys :', Object.keys(obj))
        var proto = Object.getPrototypeOf(obj)
        if (proto) console.log('proto methods:', Object.getOwnPropertyNames(proto))
      }
    } finally { console.groupEnd() }
  }

  // ── create-order (body carries saveVault) ──────────────────────────────────
  function createOrder() {
    return fetch(window.DEMO.urls.createOrder, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount:         getAmount(),
        currency:       getCurrency(),
        scaMethod:      getSCA(),
        cardholderName: getName(),
        billingAddress: window.DEMO.billing || {},
        saveVault:      getVaultChecked(),
      }),
    })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.error) throw new Error(d.error)
        return d.orderId   // v6: lowercase d
      })
  }

  // ── capture (show vault on success) ────────────────────────────────────────
  function doCapture(orderId) {
    return fetch(window.DEMO.urls.captureOrder, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: orderId }),
    })
      .then(function (r) { return r.json() })
      .then(function (order) {
        if (order.error) throw new Error(order.error)
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
        showVaultResult(order.vaultId, order.customerId)   // PROBE P3: confirm vault fields populated
      })
  }

  // ── 3DS decision (identical to v6 acdc / v5) ───────────────────────────────
  function decide3DSAndCapture(data, payBtn) {
    var liabilityShift = data.liabilityShift
    if (!liabilityShift || liabilityShift === 'POSSIBLE') {
      return doCapture(data.orderId)
    }
    var url = window.DEMO.urls.getOrder.replace(':orderId', data.orderId)
    return fetch(url)
      .then(function (r) { return r.json() })
      .then(function (order) {
        var ar         = (order.payment_source && order.payment_source.card && order.payment_source.card.authentication_result) || {}
        var threeDS    = ar.three_d_secure || {}
        var ls         = ar.liability_shift
        var enrollment = threeDS.enrollment_status
        var authStatus = threeDS.authentication_status
        if (ls === 'NO' && (enrollment === 'N' || enrollment === 'U' || enrollment === 'B')) {
          return doCapture(data.orderId)
        }
        if (ls === 'UNKNOWN') {
          showResult('✗ 3D Secure unavailable — please retry.', 'error')
        } else {
          showResult('✗ 3D Secure declined (enrollment: ' + enrollment + ', auth: ' + authStatus +
            ') — please try another card.', 'error')
        }
        if (payBtn) payBtn.disabled = false
      })
  }

  // ── submit state machine ───────────────────────────────────────────────────
  async function handleSubmitResult(result, payBtn) {
    inspect('submit result', result)   // PROBE P4 (delete after)
    var data = result.data || {}
    switch (result.state) {
      case 'succeeded':
        return decide3DSAndCapture(data, payBtn)
      case 'canceled':
        showResult('3D Secure cancelled — payment not completed.', 'error')
        payBtn.disabled = false
        return
      case 'failed':
        showResult('✗ ' + (data.message || 'Payment failed. Check your details and try again.'), 'error')
        payBtn.disabled = false
        return
      default:
        console.warn('[ACDC-Vault] Unhandled submit state', result.state, data)
        payBtn.disabled = false
    }
  }

  // ── Pay click (imperative, V6-ACDC-4) ──────────────────────────────────────
  async function onPayClick(session) {
    if (!validateAmount()) return
    var payBtn = document.getElementById('acdc-pay-btn')
    payBtn.disabled = true
    try {
      var orderId = await createOrder()
      var result  = await session.submit(orderId, { billingAddress: mapBilling(window.DEMO.billing) })
      await handleSubmitResult(result, payBtn)
    } catch (err) {
      showResult('✗ ' + (err.message || String(err)), 'error')
      payBtn.disabled = false
    }
  }

  // ── setupCardFields (sync one-time session + appendChild) ───────────────────
  function setupCardFields(instance) {
    var session = instance.createCardFieldsOneTimePaymentSession()   // sync (V6-ACDC-2); PROBE P1
    inspect('session', session)

    var numberField = session.createCardFieldsComponent({ type: 'number', placeholder: '4012000033330026', style: STYLE })
    var expiryField = session.createCardFieldsComponent({ type: 'expiry', placeholder: 'MM / YY',          style: STYLE })
    var cvvField    = session.createCardFieldsComponent({ type: 'cvv',    placeholder: '•••',              style: STYLE })

    clearLoading('card-number-container')
    document.querySelector('#card-number-container').appendChild(numberField)
    document.querySelector('#card-expiry-container').appendChild(expiryField)
    document.querySelector('#card-cvv-container').appendChild(cvvField)

    document.getElementById('acdc-pay-btn').addEventListener('click', function () { onPayClick(session) })
  }

  // ── Eligibility (defensive, V6-ACDC-1) ──────────────────────────────────────
  function isCardEligible(eligibility) {
    if (eligibility && typeof eligibility.isEligible === 'function' && eligibility.isEligible('advanced_cards')) return true
    return true   // render unless explicit ineligible signal; submit() surfaces real errors
  }

  // ── SDK entry ────────────────────────────────────────────────────────────────
  function onPayPalWebSdkLoaded() {
    getPPInstance()
      .then(function (instance) {
        inspect('instance', instance)
        return instance.findEligibleMethods({
          currencyCode: getCurrency(),
          paymentFlow: 'VAULT_WITH_PAYMENT',   // PROBE P2: fall back to no paymentFlow if rejected
        }).then(function (eligibility) {
          inspect('eligibility', eligibility)
          if (isCardEligible(eligibility)) setupCardFields(instance)
          else showResult('Card Fields not available for this account.', 'error')
        })
      })
      .catch(function (err) {
        console.error('[ACDC-Vault-v6] error:', err)
        showResult('✗ ' + (err.message || String(err)), 'error')
      })
  }

  // ── Currency selector ──────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    var currSel = document.getElementById('demo-currency')
    if (currSel) {
      currSel.addEventListener('change', function () {
        var url = new URL(window.location.href)
        url.searchParams.set('currency', this.value)
        var amt = document.getElementById('demo-amount')
        if (amt) url.searchParams.set('amount', amt.value.trim())
        window.location.replace(url.toString())
      })
    }
  })

  // ── window.load ────────────────────────────────────────────────────────────
  window.addEventListener('load', function () {
    if (typeof paypal === 'undefined') {
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }
    var amountInput = document.getElementById('demo-amount')
    if (amountInput) {
      amountInput.addEventListener('blur', function () {
        var num = parseFloat(this.value)
        if (!isNaN(num) && num > 0) {
          this.value = isZeroDecimal(getCurrency()) ? String(Math.round(num)) : num.toFixed(2)
        }
        validateAmount()
      })
    }
    onPayPalWebSdkLoaded()
  })
})()
```

- [ ] **Step 2: Verify card fields render**

Reload `http://localhost:3000/paypal/jssdk-v6/vault-acdc-with-purchase`.
Expected: spinner replaced by 3 card-field iframes (number/expiry/cvv). Console shows `[ACDC-Vault-PROBE] session` + `eligibility`. If `findEligibleMethods` throws on `paymentFlow` (PROBE P2), remove the `paymentFlow` line, retry, record in `docs/debug-log.md`.

- [ ] **Step 3: Verify happy path WITH save (vault)**

Save-card **checked**; enter `4012 0000 3333 0026`, any future expiry, any CVV; click **Pay Now**.
Expected: `✓ Payment captured · Order: …` and the Vault Result box shows a non-empty **Vault Token** + **Customer ID**. Confirm PROBE P3 (`order.vaultId` / `order.customerId` populated) and PROBE P4 (`result.data.orderId` present). If `createCardFieldsOneTimePaymentSession()` needs a vault/`savePayment` option for the card to actually save (PROBE P1 — unlikely per integration doc), add it and record in `docs/debug-log.md`.

- [ ] **Step 4: Verify happy path WITHOUT save (no vault)**

Save-card **unchecked**; same card; **Pay Now**.
Expected: `✓ Payment captured · Order: …`; Vault Result either stays hidden or shows Vault Token = `(not returned)` (no vault attribute in the order). No error.

- [ ] **Step 5: Verify failure branches**

(a) Invalid/declined card → `✗ Capture failed · status: …` or `✗ <message>`, button re-enabled.
(b) Amount out of range → inline amount error, no network call.

- [ ] **Step 6: Remove probes**

Delete every `inspect(...)` call + the `inspect` function (keep concise success/error logs if desired). Reload, re-run Step 3 to confirm the vault happy path still works without probe noise.

---

## Task 5: Supabase product row

**Files:**
- Insert: `demohub.products` (user runs SQL in Supabase SQL Editor)

- [ ] **Step 1: Find the next sort_order**

```sql
SELECT product_key, sort_order FROM demohub.products
WHERE provider='paypal' AND sdk_version='jssdk-v6' ORDER BY sort_order;
```
Note the max `sort_order` (pick max+1; ideally right after `vault-acdc-setup-only`).

- [ ] **Step 2: Insert the row**

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('paypal', 'jssdk-v6', 'vault-acdc-with-purchase', 'Vault ACDC with Purchase',
   'Pay with a card and save it to the vault on success — Card Fields (v6)', true, <max+1>);
```

- [ ] **Step 3: Restart demo-hub and verify the card appears**

Restart `npm run dev:demo-hub` (config is read once at boot). Visit `http://localhost:3000/`.
Expected: a "Vault ACDC with Purchase" card appears under PayPal · JSSDK v6, linking to the demo. The product page `<h1>` shows the `display_name`.

---

## Task 6: Document the rules

**Files:**
- Modify: `src/routes/paypal/jssdk-v6/CLAUDE.md` (symlinked to views + public/js v6 CLAUDE.md — one edit updates all three)

- [ ] **Step 1: Add a "Vault ACDC with Purchase 专属规则" section**

Append after the "Vault PayPal with Purchase 专属规则" section. Include:
- **V6-ACDC-VAULT-1** — model: Card Fields **One-Time Payment Session** (`createCardFieldsOneTimePaymentSession`, sync) + Orders v2 API; save driven by server create-order body `attributes.vault.store_in_vault: ON_SUCCESS` (probe P1: no session option needed per integration doc). 3 endpoints (adds GET order vs setup-only's GET setup-token).
- **V6-ACDC-VAULT-2** — create-order body **verbatim from v5** `vault-acdc-with-purchase`; only `orderId` lowercase-d (V6-1). `saveVault === true` → append `attributes.vault` + `attributes.customer.merchant_customer_id` (random `CUST_`).
- **V6-ACDC-VAULT-3** — eligibility: `findEligibleMethods({ currencyCode, paymentFlow: 'VAULT_WITH_PAYMENT' })` + `isEligible('advanced_cards')`, defensive render; fall back to no `paymentFlow` if rejected (probe P2).
- **V6-ACDC-VAULT-4** — capture-order extracts `payment_source.card.attributes.vault.{id, customer.id}` → top-level `vaultId`/`customerId`; frontend `showVaultResult`. Capture success still gated on `captures[0].status === 'COMPLETED'` (rule 13).
- **V6-ACDC-VAULT-5** — 3DS faithfully mirrors v5: SCA selector **disabled** (fixed `SCA_WHEN_REQUIRED`), note links to v6 acdc demo. `decide3DSAndCapture` logic identical to v6 acdc (kept as fallback; happy path frictionless only).
- **V6-ACDC-VAULT-6** — probe checklist P1–P4 (FE design §4); delete probes after first successful run, record conclusions in `docs/debug-log.md`.

- [ ] **Step 2: Update the components table**

In the "各产品 components 数组" table, add row: `vault-acdc-with-purchase` | `['card-fields']` | ✅ 已实现.

---

## Self-Review

**Spec coverage:**
- BE §3 (3 endpoints) → Task 1. BE §4 GET render → Task 1 Step 1. BE §5/§6/§7 (create/get/capture) → Task 1. BE §8 Supabase → Task 5. Mount → Task 2.
- FE §2 (EJS) → Task 3. FE §3.1–3.8 (helpers, createOrder+saveVault, doCapture+showVaultResult, 3DS, state machine, onPayClick, setupCardFields, init/eligibility, currency/load) → Task 4 Step 1. FE §4 probes → Task 4 Steps 2–6. FE §5 DoD → Task 4 Steps 3–5.
- New CLAUDE.md rules → Task 6.
- All covered.

**Placeholder scan:** Only intentional fill-ins are `<max+1>` / `<下一个可用 sort_order>` (Supabase sort_order — read live in Task 5 Step 1) and probe-driven conditional fallbacks (P1/P2, with explicit instructions). No TODO/TBD code placeholders.

**Type/name consistency:** `orderId` lowercase-d everywhere (create return, GET param `:orderId`, capture body key, `data.orderId`, `getOrder.replace(':orderId', …)`) per V6-1. `saveVault` (frontend body key) maps to `req.body.saveVault` (backend). `vaultId`/`customerId` top-level fields match between capture route (Task 1) and `showVaultResult` (Task 4). URL keys `createOrder`/`getOrder`/`captureOrder` match between EJS `window.DEMO.urls` (Task 3) and JS usage (Task 4). `mapBilling` returns camelCase `streetAddress/city/state/postalCode/countryCode` (v6 ACDC shape).

**Scope check:** 5 files + 1 SQL row + 1 CLAUDE.md edit. Composes two proven implementations (v5 vault-acdc-with-purchase + v6 acdc). No new services, no shared-module refactor (per house style). Focused enough for a single plan.

---

## Execution Handoff

Tasks 1, 3, 4 require **a non-Opus model** (code writing). Task 5 is user-run SQL; Tasks 2/6 are small edits. No git steps anywhere — version control stays manual per project rule.

After implementation: run the manual DoD (Task 4 Steps 3–5), delete probes (Step 6), record any probe conclusions / fallbacks in `docs/debug-log.md`, and update `docs/progress.md` + `docs/todos.md`.

---

## Eng Review Report (2026-06-05)

Reviewed via `/plan-eng-review`. Verdict: **CLEARED — implement as written.**

- **Scope (Step 0):** Right-sized. 5 code files, 0 new services/classes (under the 8-file trigger). Composes two proven implementations (v5 `vault-acdc-with-purchase` + v6 `acdc`); identical footprint to the already-shipped `vault-acdc-setup-only`. `_factory.js` correctly rejected (non-standard `payment_source.card` body + conditional vault + GET-order endpoint).
- **Architecture:** Sound. One design point resolved + one watch-item (below).
- **Code quality:** Clean. The ~150-line copy from `acdc.js` + v5 vault layer is the deliberate house style (V6-ACDC-SETUP-6: one self-contained IIFE per product, only `init.js` shared). Not a DRY violation.
- **Tests:** No automated harness exists for demo-hub (vanilla JS + EJS); verification = the manual sandbox DoD, consistent with all v6 demos. DoD covers save-happy / no-save / failure / canceled.
- **Performance:** No concern (one extra GET only on the rare non-frictionless path).

**Decision (user-confirmed):**
1. **3DS fallback retention** → **keep** the GET order endpoint + `decide3DSAndCapture` GET branch verbatim from v6 `acdc`/v5. Rationale: stays faithful to the copy-source, and `SCA_WHEN_REQUIRED` can still trigger a PSD2 challenge for some card/region; the ~30 lines are proven and cheap. (Near-dead under CN + test cards, but a real safety net.)

**Watch-item (carry into implementation):** **Probe P1** — confirm `createCardFieldsOneTimePaymentSession()` (no-arg) actually persists the vault, or whether a session-level flag is needed (the PayPal-button vault used `savePayment: true`, V6-VAULT-3). Integration doc's "No verification" example uses no-arg + server-driven `store_in_vault`, so no-arg is the right default — but this is THE happy-path risk (DoD Step 3: vault token returned). Low risk (doc precedent); if the vault doesn't save, add the session option and record in `docs/debug-log.md`.

**NOT in scope (deferred):** SCA_ALWAYS / 3DS challenge testing (mirror v5, route users to ACDC demo); returning-buyer pay-with-saved-card (vault-return's job); vault webhook subscription (`APPROVED` async-save path); persisting vault tokens to a DB; shared v6 card-field helper module (house style is per-file copy); automated test harness for demos.

**What already exists (reused, not rebuilt):** v6 `acdc` route + `acdc.js` (one-time Card Fields session, submit state machine, 3DS decide+capture, helpers, `mapBilling`, `inspect`); v5 `vault-acdc-with-purchase` (vault create-order body, capture vault extraction, `getVaultChecked`, `showVaultResult`, view layout); `config/constants.js` (`buildOrderBody`, `ACDC_EXPERIENCE_CONTEXT`, `SANDBOX_*`, `validateAmount`); `init.js` (`getPPInstance`).

**Failure modes (manual-verified, no automated coverage by design):**
| Codepath | Failure | Handled? | User sees |
|----------|---------|----------|-----------|
| capture returns non-COMPLETED (DECLINED/PENDING) | declined card | ✅ rule 13 gate | `✗ Capture failed · status: …` |
| `submit()` state `failed` | bad card data | ✅ state machine | `✗ <data.message>` |
| `submit()` state `canceled` | buyer closes 3DS | ✅ state machine | cancel message, button re-enabled |
| vault attr absent (no-save or P1 miss) | `order.vaultId` null | ✅ `'(not returned)'` | Vault Token shows `(not returned)` |
| `findEligibleMethods` rejects `paymentFlow` | P2 | ✅ documented fallback | (dev-time, retry without paymentFlow) |
| SDK fails to load | network | ✅ `typeof paypal` guard | `✗ PayPal SDK failed to load` |

No critical gap (every failure mode has handling + a visible message).

**Parallelization:** Sequential implementation, no parallelization opportunity (all 3 files are one tightly-coupled demo; Tasks 1→2→3→4→5→6 are ordered).

**Completion summary:** Step 0 scope accepted as-is · Architecture 1 issue (resolved: keep fallback) · Code Quality 0 · Tests: manual DoD, 0 gaps warranting a harness · Performance 0 · NOT-in-scope written · What-already-exists written · 0 TODOs proposed · 0 critical failure-mode gaps · 1 watch-item (P1) · Outside voice skipped (tiny well-precedented plan).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 1 issue (resolved), 1 watch-item (P1), 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED — ready to implement (UI mirrors shipped v5; no design review needed for a vanilla-JS/EJS sandbox demo).
