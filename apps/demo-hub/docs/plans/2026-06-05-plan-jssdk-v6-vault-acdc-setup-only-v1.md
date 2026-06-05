# JSSDK v6 Vault ACDC Setup-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **Model gate:** Writing code requires a non-Opus model (project rule). Under Opus only this markdown exists.
>
> ⚠️ **Git rule:** This project forbids any git operation. **No step runs git.** The user manages version control manually. "Verify" = manual sandbox browser flow (the codebase has no automated test runner for demos; see `docs/test-cases.md`).

**Goal:** Add a v6 `vault-acdc-setup-only` demo — save a card to the vault with no purchase, using v6 Card Fields `createCardFieldsSavePaymentSession` + Vault v3 two-step tokens, with the v5 strict 3DS gate.

**Architecture:** Custom Express route (3 endpoints, CN account, no Orders API) → `/v3/vault/setup-tokens` (create) + GET setup-token (strict gate) + `/v3/vault/payment-tokens` (confirm). Frontend reuses the v6 `acdc.js` card-fields skeleton (sync save session, `createCardFieldsComponent` + `appendChild`, `submit()` → `{state,data}` state machine) with the v5 strict 3DS gate. Billing address passed in **both** the setup-token body and `submit()`.

**Tech Stack:** Node.js + Express, EJS, vanilla JS (IIFE), PayPal Web SDK v6 (`web-sdk/v6/core`), Vault v3 REST API, Supabase product config.

**Reference files (read before starting):**
- BE design: `docs/design/2026-06-05-design-be-jssdk-v6-vault-acdc-setup-only.md`
- FE design: `docs/design/2026-06-05-design-fe-jssdk-v6-vault-acdc-setup-only.md`
- Route template: `src/routes/paypal/jssdk-v5/vault-acdc-setup-only.js` (v5, 3 endpoints) + `src/routes/paypal/jssdk-v6/vault-paypal-setup-only.js` (v6 patterns)
- FE template: `src/public/js/paypal/jssdk-v6/acdc.js` (card-fields) + `src/public/js/paypal/jssdk-v5/vault-acdc-setup-only.js` (strict gate)
- View template: `src/views/paypal/jssdk-v5/vault-acdc-setup-only.ejs` + `src/views/paypal/jssdk-v6/acdc.ejs`
- Rules: `src/routes/paypal/jssdk-v6/CLAUDE.md` (V6-1..10, V6-ACDC-1..6, V6-SETUP-ONLY-1..8)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/routes/paypal/jssdk-v6/vault-acdc-setup-only.js` | Create | GET render + 3 API endpoints (create / get / confirm setup-token) |
| `src/views/paypal/jssdk-v6/vault-acdc-setup-only.ejs` | Create | Page HTML, `window.DEMO` injection, v6 three-script load |
| `src/public/js/paypal/jssdk-v6/vault-acdc-setup-only.js` | Create | Save session card-fields + submit state machine + v5 strict gate |
| `src/app.js` | Modify | Mount the new route (one `app.use` line) |
| Supabase `demohub.products` | Insert | One product row (user runs SQL) |
| `src/routes/paypal/jssdk-v6/CLAUDE.md` | Modify | Add "Vault ACDC Setup-Only" rule section |

---

## Task 1: Backend route (3 endpoints)

**Files:**
- Create: `src/routes/paypal/jssdk-v6/vault-acdc-setup-only.js`

- [ ] **Step 1: Create the route file**

Copy the structure from v5 `routes/paypal/jssdk-v5/vault-acdc-setup-only.js`, change SDK to `jssdk-v6`, change render path + return/cancel URLs to v6, add `clientId` + sandbox vars to render (v6 needs them; v5 passed sdkUrl instead). Full file:

```js
/* Custom: v6 ACDC Vault setup-only (no purchase) — Card Fields Save Session + /v3/vault/setup-tokens */
const { Router } = require('express')
const { randomBytes } = require('crypto')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getCNToken, API, getHeaders } = require('../../../config/paypal')
const { SANDBOX_BUYER, SANDBOX_BILLING } = require('../../../config/constants')

const router = Router()
const PROVIDER = 'paypal', SDK = 'jssdk-v6', KEY = 'vault-acdc-setup-only'
const SCA_METHODS = ['SCA_WHEN_REQUIRED', 'SCA_ALWAYS']

router.get(`/${KEY}`, (req, res) => {
  const product = getProduct(PROVIDER, SDK, KEY)
  res.render(`paypal/jssdk-v6/${KEY}`, {
    title: product?.displayName ?? 'ACDC Vault Setup',
    provider: PROVIDER, sdkVersion: SDK,
    currentProductKey: KEY, currentSdkVersion: SDK,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    clientId: process.env.PAYPAL_CN_CLIENT_ID,
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

router.post(`/api/${KEY}/create-setup-token`, async (req, res) => {
  try {
    const scaMethod = SCA_METHODS.includes(req.body.scaMethod) ? req.body.scaMethod : 'SCA_WHEN_REQUIRED'
    const baseUrl   = `${req.protocol}://${req.get('host')}`
    const returnUrl = `${baseUrl}/paypal/jssdk-v6/${KEY}`
    const cancelUrl = `${baseUrl}/paypal/jssdk-v6/${KEY}`
    const token = await getCNToken()
    const r = await fetch(`${API}/v3/vault/setup-tokens`, {
      method: 'POST',
      headers: getHeaders(token, { 'PayPal-Request-Id': `acdc-setup-${Date.now()}` }),
      body: JSON.stringify({
        customer: { merchant_customer_id: 'CUST_' + randomBytes(6).toString('hex').toUpperCase() },
        payment_source: {
          card: {
            billing_address: {
              address_line_1: SANDBOX_BILLING.address_line_1,
              admin_area_2:   SANDBOX_BILLING.admin_area_2,
              admin_area_1:   SANDBOX_BILLING.admin_area_1,
              postal_code:    SANDBOX_BILLING.postal_code,
              country_code:   SANDBOX_BILLING.country_code,
            },
            experience_context: { return_url: returnUrl, cancel_url: cancelUrl },
            verification_method: scaMethod,
          },
        },
      }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
    res.json({ setupTokenId: data.id })
  } catch (err) {
    console.error(`[${KEY}] create-setup-token error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

router.get(`/api/${KEY}/setup-token/:setupTokenId`, async (req, res) => {
  try {
    const token = await getCNToken()
    const r = await fetch(`${API}/v3/vault/setup-tokens/${req.params.setupTokenId}`, {
      method: 'GET', headers: getHeaders(token),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
    res.json(data)
  } catch (err) {
    console.error(`[${KEY}] get-setup-token error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

router.post(`/api/${KEY}/confirm-setup-token`, async (req, res) => {
  try {
    const { setupTokenId } = req.body
    if (!setupTokenId) return res.status(400).json({ error: 'setupTokenId required' })
    const token = await getCNToken()
    const r = await fetch(`${API}/v3/vault/payment-tokens`, {
      method: 'POST',
      headers: getHeaders(token, { 'PayPal-Request-Id': `acdc-confirm-${Date.now()}` }),
      body: JSON.stringify({ payment_source: { token: { id: setupTokenId, type: 'SETUP_TOKEN' } } }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data })
    const customerId = data.customer?.id || null
    res.json({ paymentTokenId: data.id, customerId, data })
  } catch (err) {
    console.error(`[${KEY}] confirm-setup-token error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
```

- [ ] **Step 2: Confirm `SANDBOX_BUYER` and `SANDBOX_BILLING` are exported from constants**

Run: `grep -nE 'SANDBOX_BUYER|SANDBOX_BILLING' src/config/constants.js`
Expected: both names appear in `module.exports`. (v5 route imports the same two — they exist.)

---

## Task 2: Mount the route

**Files:**
- Modify: `src/app.js` (v6 block, after the `vault-paypal-setup-only` line — currently line ~54)

- [ ] **Step 1: Add the mount line**

Add immediately after the existing `vault-paypal-setup-only` require:

```js
app.use(v6, require('./routes/paypal/jssdk-v6/vault-acdc-setup-only'))
```

- [ ] **Step 2: Verify it loads**

Run: `cd apps/demo-hub && npm run dev` (or rely on running nodemon).
Expected: server restarts with no error. (Route GET will 500 on render until Task 3 creates the view — that's expected; just confirm no `MODULE_NOT_FOUND` / syntax error in the boot log.)

---

## Task 3: EJS view

**Files:**
- Create: `src/views/paypal/jssdk-v6/vault-acdc-setup-only.ejs`

- [ ] **Step 1: Create the view**

Mirror v5 `views/paypal/jssdk-v5/vault-acdc-setup-only.ejs` UI; apply v6 header (no `sdkUrl`) + three-script load. Full file:

```html
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar,
}) %>

<div class="sandbox-page">
  <div class="sandbox-header">
    <span class="provider-badge badge-paypal">PayPal · JSSDK v6 · ACDC Vault Setup</span>
    <h1><%= title %></h1>
    <p>Save a card to vault without a purchase. Uses <code>/v3/vault/setup-tokens</code> — no charge to the buyer.</p>
  </div>
  <div class="sandbox-card sandbox-card--wide">
    <div class="amount-row">
      <div class="currency-group">
        <label class="field-label" for="demo-sca">3DS</label>
        <select id="demo-sca" class="currency-select" aria-label="3DS SCA method" style="min-width:200px">
          <option value="SCA_WHEN_REQUIRED" selected>SCA_WHEN_REQUIRED</option>
          <option value="SCA_ALWAYS">SCA_ALWAYS</option>
        </select>
      </div>
    </div>
    <span class="sandbox-mode-badge" style="display:inline-block;margin-bottom:16px">⚡ Zero-Dollar Vault Enrollment</span>

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

    <button id="acdc-save-btn" class="pay-btn pay-btn-paypal" type="button">Save Card</button>
    <div class="result-msg" id="result" role="alert" aria-live="polite"></div>

    <div id="vault-result" style="display:none;margin-top:12px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:6px;font-size:13px;line-height:1.8">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--fg-subtle);margin-bottom:6px">Vault Result</div>
      <div><span style="color:var(--fg-muted)">Payment Token:&nbsp;</span><span id="payment-token-id" style="font-family:monospace;color:var(--fg)">—</span></div>
      <div><span style="color:var(--fg-muted)">Customer ID:&nbsp;</span><span id="customer-id" style="font-family:monospace;color:var(--fg)">—</span></div>
    </div>

    <div class="test-hint">
      Test card: <strong>4012 0000 3333 0026</strong> · Any future date · Any CVV
    </div>
  </div>
</div>

<script>
  window.DEMO = {
    clientId:   '<%= clientId %>',
    components: ['card-fields'],
    pageType:   'checkout',
    urls: {
      createSetupToken:  '/paypal/jssdk-v6/api/vault-acdc-setup-only/create-setup-token',
      getSetupToken:     '/paypal/jssdk-v6/api/vault-acdc-setup-only/setup-token/',
      confirmSetupToken: '/paypal/jssdk-v6/api/vault-acdc-setup-only/confirm-setup-token',
    },
    billing: <%- JSON.stringify(sandboxBilling) %>,
  }
</script>
<script src="/js/paypal/jssdk-v6/init.js"></script>
<script src="/js/paypal/jssdk-v6/vault-acdc-setup-only.js"></script>
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

- [ ] **Step 2: Verify the page renders**

Visit `http://localhost:3000/paypal/jssdk-v6/vault-acdc-setup-only`.
Expected: page loads, 3DS selector + card-number spinner visible. Card fields will not yet appear (JS file is created in Task 4 — the `<script src=".../vault-acdc-setup-only.js">` 404s). Confirm no EJS render error.

---

## Task 4: Frontend JS (save session + strict gate)

**Files:**
- Create: `src/public/js/paypal/jssdk-v6/vault-acdc-setup-only.js`

- [ ] **Step 1: Create the JS file**

Card-fields rendering from v6 `acdc.js`; strict gate from v5 `vault-acdc-setup-only.js`. Full file:

```js
;(function () {
  'use strict'

  console.log('[ACDC-VaultSetup-v6] loaded')

  var STYLE = {
    input: { fontFamily: "'Space Mono', monospace", fontSize: '13px', color: 'inherit' },
    '.invalid': { color: '#EF4444' },
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function getSCA() {
    var sel = document.getElementById('demo-sca')
    return sel ? sel.value : 'SCA_WHEN_REQUIRED'
  }
  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }
  function showVaultResult(paymentTokenId, customerId) {
    var box = document.getElementById('vault-result')
    if (!box) return
    var t = document.getElementById('payment-token-id')
    var c = document.getElementById('customer-id')
    if (t) t.textContent = paymentTokenId || '(not returned)'
    if (c) c.textContent = customerId || '(not returned)'
    box.style.display = 'block'
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

  // ── Debug probe (remove after API shapes confirmed) ───────────────────────
  function inspect(label, obj) {
    try {
      console.group('[ACDC-VaultSetup-PROBE] ' + label)
      console.log('value:', obj)
      console.dir(obj)
      if (obj && typeof obj === 'object') {
        console.log('own keys :', Object.keys(obj))
        var proto = Object.getPrototypeOf(obj)
        if (proto) console.log('proto methods:', Object.getOwnPropertyNames(proto))
      }
    } finally { console.groupEnd() }
  }

  // ── Token fetches ─────────────────────────────────────────────────────────
  function createSetupToken() {
    return fetch(window.DEMO.urls.createSetupToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scaMethod: getSCA() }),
    })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.error) throw new Error(d.error)
        console.log('[ACDC-VaultSetup] setup token:', d.setupTokenId)
        return d.setupTokenId
      })
  }

  function doConfirm(setupTokenId) {
    return fetch(window.DEMO.urls.confirmSetupToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupTokenId: setupTokenId }),
    })
      .then(function (r) { return r.json() })
      .then(function (data) {
        console.dir(data) // PROBE: confirm paymentTokenId / customerId (delete after)
        if (data.error) throw new Error(data.error)
        showResult('✓ Card saved · Payment Token: ' + data.paymentTokenId, 'success')
        showVaultResult(data.paymentTokenId, data.customerId)
      })
  }

  // ── v5 strict 3DS gate ─────────────────────────────────────────────────────
  function decideAndConfirm(data, saveBtn) {
    var liabilityShift  = data.liabilityShift
    var vaultSetupToken = data.vaultSetupToken
    console.group('[ACDC-VaultSetup] decide')
    console.log('  liabilityShift  :', liabilityShift)
    console.log('  vaultSetupToken :', vaultSetupToken)
    console.groupEnd()

    if (liabilityShift === 'YES' || liabilityShift === 'POSSIBLE') {
      return doConfirm(vaultSetupToken)
    }
    return fetch(window.DEMO.urls.getSetupToken + vaultSetupToken)
      .then(function (r) { return r.json() })
      .then(function (tokenData) {
        var tokenStatus = tokenData.status
        var verificationStatus =
          tokenData.payment_source &&
          tokenData.payment_source.card &&
          tokenData.payment_source.card.verification_status
        console.group('[ACDC-VaultSetup] setup token details')
        console.log('  token.status        :', tokenStatus)
        console.log('  verification_status :', verificationStatus)
        console.groupEnd()
        if (tokenStatus === 'APPROVED' && verificationStatus === 'VERIFIED') {
          return doConfirm(vaultSetupToken)
        }
        var msg = verificationStatus
          ? 'verification: ' + verificationStatus
          : 'liabilityShift: ' + (liabilityShift || 'none') + ' · token: ' + (tokenStatus || 'unknown')
        showResult('✗ Card not saved · ' + msg, 'error')
        if (saveBtn) saveBtn.disabled = false
      })
  }

  // ── submit state machine ────────────────────────────────────────────────────
  function handleSubmitResult(result, saveBtn) {
    inspect('submit result', result) // PROBE (delete after)
    var data = result.data || {}
    switch (result.state) {
      case 'succeeded':
        return decideAndConfirm(data, saveBtn)
      case 'canceled':
        showResult('3D Secure cancelled — card not saved.', 'error')
        saveBtn.disabled = false
        return
      case 'failed':
        showResult('✗ ' + (data.message || 'Card not saved. Check your details and try again.'), 'error')
        saveBtn.disabled = false
        return
      default:
        console.warn('[ACDC-VaultSetup] Unhandled submit state', result.state, data)
        saveBtn.disabled = false
    }
  }

  // ── Save click (imperative, V6-ACDC-4; billing double-passed) ───────────────
  async function onPayClick(session) {
    var saveBtn = document.getElementById('acdc-save-btn')
    saveBtn.disabled = true
    try {
      var setupTokenId = await createSetupToken()
      var result = await session.submit(setupTokenId, {
        billingAddress: mapBilling(window.DEMO.billing),
      })
      await handleSubmitResult(result, saveBtn)
    } catch (err) {
      showResult('✗ ' + (err.message || String(err)), 'error')
      saveBtn.disabled = false
    }
  }

  // ── setupCardFields (sync save session + appendChild) ───────────────────────
  function setupCardFields(instance) {
    var session = instance.createCardFieldsSavePaymentSession() // sync (V6-ACDC-2)
    inspect('session', session) // PROBE P1 (delete after)

    var numberField = session.createCardFieldsComponent({ type: 'number', placeholder: '4012000033330026', style: STYLE })
    var expiryField = session.createCardFieldsComponent({ type: 'expiry', placeholder: 'MM / YY',          style: STYLE })
    var cvvField    = session.createCardFieldsComponent({ type: 'cvv',    placeholder: '•••',              style: STYLE })

    clearLoading('card-number-container')
    document.querySelector('#card-number-container').appendChild(numberField)
    document.querySelector('#card-expiry-container').appendChild(expiryField)
    document.querySelector('#card-cvv-container').appendChild(cvvField)

    document.getElementById('acdc-save-btn').addEventListener('click', function () { onPayClick(session) })
  }

  // ── Eligibility (defensive, V6-ACDC-1) ──────────────────────────────────────
  function isCardEligible(eligibility) {
    if (eligibility && typeof eligibility.isEligible === 'function' && eligibility.isEligible('advanced_cards')) return true
    return true // render unless an explicit ineligible signal; submit() surfaces real errors
  }

  // ── SDK entry ────────────────────────────────────────────────────────────────
  function onPayPalWebSdkLoaded() {
    getPPInstance()
      .then(function (instance) {
        inspect('instance', instance)
        return instance.findEligibleMethods({
          currencyCode: 'USD',
          paymentFlow: 'VAULT_WITHOUT_PAYMENT', // PROBE P4: fall back to no paymentFlow if rejected
        }).then(function (eligibility) {
          inspect('eligibility', eligibility) // PROBE (delete after)
          if (isCardEligible(eligibility)) setupCardFields(instance)
          else showResult('Card Fields not available for this account.', 'error')
        })
      })
      .catch(function (err) {
        console.error('[ACDC-VaultSetup-v6] error:', err)
        showResult('✗ ' + (err.message || String(err)), 'error')
      })
  }

  window.addEventListener('load', function () {
    if (typeof paypal === 'undefined') { showResult('✗ PayPal SDK failed to load', 'error'); return }
    onPayPalWebSdkLoaded()
  })
})()
```

- [ ] **Step 2: Verify card fields render**

Reload `http://localhost:3000/paypal/jssdk-v6/vault-acdc-setup-only`.
Expected: spinner replaced by 3 card-field iframes (number/expiry/cvv). Console shows `[ACDC-VaultSetup-PROBE] session` and `eligibility` groups. If `findEligibleMethods` throws on `paymentFlow` (PROBE P4), remove the `paymentFlow` line, retry, and record in `docs/debug-log.md`.

- [ ] **Step 3: Verify happy path (SCA_WHEN_REQUIRED)**

3DS = `SCA_WHEN_REQUIRED`; enter `4012 0000 3333 0026`, any future expiry, any CVV; click **Save Card**.
Expected: `✓ Card saved · Payment Token: …` and the Vault Result box shows a non-empty Payment Token + Customer ID. Confirm PROBE P2 log shows `result.data.vaultSetupToken` present; confirm P3 (`submit` accepted the `billingAddress` 2nd arg without error). If `submit` rejects the 2nd arg, drop it (billing still set via setup-token body) and record in `docs/debug-log.md`.

- [ ] **Step 4: Verify strict gate (SCA_ALWAYS)**

3DS = `SCA_ALWAYS`; same card; **Save Card** → complete the 3DS challenge.
Expected: on pass → `✓ Card saved`; on a non-verified outcome → `✗ Card not saved · verification: …`. Confirm PROBE P5 log (`token.status` + `verification_status`) shows the gate evaluating. Cancel the 3DS modal → `3D Secure cancelled — card not saved.` and the button re-enables.

- [ ] **Step 5: Remove probes**

Delete every `inspect(...)` call, the `inspect` function, the `console.dir(data)` in `doConfirm`, and the verbose `console.group` blocks (keep one concise success/error log if desired). Reload and re-run Step 3 to confirm the happy path still works without the probe noise.

---

## Task 5: Supabase product row

**Files:**
- Insert: `demohub.products` (user runs SQL in Supabase SQL Editor)

- [ ] **Step 1: Find the next sort_order**

Run in Supabase SQL Editor:
```sql
SELECT product_key, sort_order FROM demohub.products
WHERE provider='paypal' AND sdk_version='jssdk-v6' ORDER BY sort_order;
```
Note the max `sort_order` (pick max+1; ideally right after `vault-paypal-setup-only`).

- [ ] **Step 2: Insert the row**

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('paypal', 'jssdk-v6', 'vault-acdc-setup-only', 'Vault ACDC Setup Only',
   'Save a card with no purchase — setup token → payment token, Card Fields (v6)', true, <max+1>);
```

- [ ] **Step 3: Restart demo-hub and verify the card appears**

Restart `npm run dev:demo-hub` (config is read once at boot). Visit `http://localhost:3000/`.
Expected: a "Vault ACDC Setup Only" card appears under PayPal · JSSDK v6, linking to the demo. The product page `<h1>` shows the `display_name`.

---

## Task 6: Document the rules

**Files:**
- Modify: `src/routes/paypal/jssdk-v6/CLAUDE.md` (this file is symlinked to the views + public/js v6 CLAUDE.md, so one edit updates all three)

> ✅ **Already done during eng review (2026-06-05):** the "Vault ACDC Setup-Only 专属规则" section (V6-ACDC-SETUP-1..7) and the components-table row are already written to `src/routes/paypal/jssdk-v6/CLAUDE.md` (symlinked to views + public/js). At implementation time, just **verify the rules match the code you wrote** and flip the components-table status from `📝 待实现` to `✅ 已实现`. The original spec below is retained for reference.

- [ ] **Step 1: Add a "Vault ACDC Setup-Only 专属规则" section** (already added — verify only)

Append after the "Vault PayPal Setup-Only 专属规则" section. Include:
- **V6-ACDC-SETUP-1** — model: Card Fields **Save Session** (`createCardFieldsSavePaymentSession`) + Vault v3 two-step token, no Orders API. 3 endpoints (adds GET setup-token vs paypal setup-only's 2).
- **V6-ACDC-SETUP-2** — strict 3DS gate on `submit()` state `succeeded`: `data.liabilityShift` ∈ {YES, POSSIBLE} → confirm; else GET setup-token → `status==='APPROVED' && payment_source.card.verification_status==='VERIFIED'` → confirm; else reject. (Identical logic to v5; data source is `result.data` not `onApprove(data)`.)
- **V6-ACDC-SETUP-3** — eligibility: `findEligibleMethods({ currencyCode:'USD', paymentFlow:'VAULT_WITHOUT_PAYMENT' })` + `isEligible('advanced_cards')`, defensive render; fall back to no `paymentFlow` if rejected.
- **V6-ACDC-SETUP-4** — create-setup-token body verbatim from v5 (random `CUST_` merchant_customer_id, `payment_source.card.{billing_address, experience_context, verification_method}`), only return/cancel url → v6 path. SCA from `req.body.scaMethod` whitelist.
- **V6-ACDC-SETUP-5** — billingAddress passed in **both** setup-token body (snake_case) and `submit()` 2nd arg (camelCase via `mapBilling`). If probe P3 shows save-session submit rejects the 2nd arg, drop it (body covers billing) and record in debug-log.
- **V6-ACDC-SETUP-6** — probe checklist P1–P5 (table from FE design §4); delete probes after first successful run, record conclusions in `docs/debug-log.md`.

- [ ] **Step 2: Update the components table**

In the "各产品 components 数组" table, add row: `vault-acdc-setup-only` | `['card-fields']` | ✅ 已实现.

---

## Self-Review

**Spec coverage:**
- BE §3 (3 endpoints) → Task 1. BE §4 GET render → Task 1 Step 1. BE §5/§6/§7 (create/get/confirm) → Task 1. BE §8 Supabase → Task 5. Mount → Task 2.
- FE §2 (EJS) → Task 3. FE §3.1–3.7 (helpers, fetches, strict gate, state machine, onPayClick, setupCardFields, init/eligibility) → Task 4 Step 1. FE §4 probes → Task 4 Steps 2–5. FE §5 DoD → Task 4 Steps 3–4.
- New CLAUDE.md rules (both designs) → Task 6.
- All covered.

**Placeholder scan:** Only intentional fill-ins are `<max+1>` / `<下一个可用 sort_order>` (Supabase sort_order — must be read live in Task 5 Step 1) and probe-driven conditional fallbacks (P3/P4, with explicit instructions). No TODO/TBD code placeholders; every code step is complete.

**Type/name consistency:** `setupTokenId` (backend body key + create return), `vaultSetupToken` (SDK `result.data` key) — distinguished and mapped consistently. URL keys `createSetupToken` / `getSetupToken` / `confirmSetupToken` match between EJS `window.DEMO.urls` (Task 3) and JS usage (Task 4). Endpoint paths match between route (Task 1) and EJS (Task 3). `mapBilling` returns the camelCase `streetAddress/city/state/postalCode/countryCode` shape used in v6 ACDC.

---

## Execution Handoff

Tasks 1, 3, 4 require **a non-Opus model** (code writing). Tasks 5 is user-run SQL; Task 2/6 are small edits. No git steps anywhere — version control stays manual per project rule.

---

## Eng Review Report (2026-06-05)

Reviewed via `/plan-eng-review`. Verdict: **CLEARED — implement as written.**

- **Scope:** Right-sized (5 files, 0 new services). Composes two proven implementations (v5 vault-acdc-setup-only + v6 acdc), rebuilds nothing. No complexity trigger.
- **Architecture:** Sound. One watch-item (not blocking).
- **Code quality:** Clean; duplication is the deliberate house style.
- **Tests:** No automated harness exists for demo-hub (vanilla JS + EJS); verification is the manual sandbox flow, consistent with all v6 demos.
- **Performance:** No concerns (zero-dollar, one extra GET only on non-frictionless path).

**Decisions (both confirmed by user):**
1. **DRY** → keep per-file duplication (one self-contained IIFE per product; only `init.js` shared). Matches existing pattern + surgical-change principle.
2. **Frictionless 3DS gate** → keep v5 strict gate verbatim; verify on first run via probe P5. If a `SCA_WHEN_REQUIRED` frictionless save is wrongly rejected (`verification_status ≠ VERIFIED`), adjust the gate then and record in `docs/debug-log.md`.

**Watch-item (carry into implementation):** Finding 1 — on first run, confirm the strict gate confirms (not rejects) a frictionless `SCA_WHEN_REQUIRED` save. This is the demo's primary happy path (DoD Step 3). Low risk (v5 precedent), already covered by probes P2/P5.

**Suggested test addition (minor):** add a manual "declined/invalid card → expect `✗` + button re-enabled" check to exercise the `failed` submit branch (DoD currently covers succeeded + canceled only).

**NOT in scope (deferred):** shared v6 card-field helpers module; cardholder-name field (v5 setup-only has none); automated test harness for demos; persisting payment tokens to a DB.
