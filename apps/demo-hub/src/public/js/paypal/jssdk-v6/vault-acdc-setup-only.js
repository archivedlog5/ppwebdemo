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
  // save-payment session uses addressLine1 (not streetAddress — different GraphQL schema)
  function mapBilling(billing) {
    billing = billing || {}
    return {
      addressLine1: billing.addressLine1 || '',
      city:         billing.adminArea2   || '',
      state:        billing.adminArea1   || '',
      postalCode:   billing.postalCode   || '',
      countryCode:  billing.countryCode  || '',
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
        console.group('[ACDC-VaultSetup] setup token details') // PROBE P5 (delete after)
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
    inspect('submit result', result) // PROBE P2 (delete after)
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
      // P3: save-session submit() rejects billingAddress (both streetAddress and addressLine1 fail).
      // Billing covered by payment_source.card.billing_address in create-setup-token body.
      // TODO: confirm correct billingAddress field names for save session when PayPal docs clarify.
      var result = await session.submit(setupTokenId)
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
    return true // render unless explicit ineligible signal; submit() surfaces real errors
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
