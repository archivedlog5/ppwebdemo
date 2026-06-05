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
