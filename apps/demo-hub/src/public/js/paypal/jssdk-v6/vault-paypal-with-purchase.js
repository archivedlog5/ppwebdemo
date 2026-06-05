;(function () {
  'use strict'

  console.log('[Vault-PayPal] vault-paypal-with-purchase.js loaded')

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getCurrency() {
    var sel = document.getElementById('demo-currency')
    return sel ? sel.value : 'USD'
  }

  function getAmount() {
    var inp = document.getElementById('demo-amount')
    return inp ? inp.value.trim() : ''
  }

  function validateAmount() {
    var raw = getAmount()
    var amt = parseFloat(raw)
    if (!raw || isNaN(amt) || amt <= 0 || !/^\d+(\.\d{1,2})?$/.test(raw)) {
      showResult('Please enter a valid amount (e.g. 100.00).', 'error')
      return false
    }
    return true
  }

  function clearLoading() {
    var container = document.getElementById('paypal-button-container')
    if (container) {
      container.classList.remove('sdk-loading')
      container.innerHTML = ''
    }
    return container
  }

  function showResult(text, type) {
    console.log('[Vault-PayPal] showResult() type=%s text=%s', type, text)
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  function showVaultResult(vaultId, customerId) {
    var box = document.getElementById('vault-result')
    if (!box) return
    document.getElementById('vault-id').textContent = vaultId || '—'
    document.getElementById('customer-id').textContent = customerId || '—'
    box.style.display = 'block'
  }

  // ── Capture + vault display ────────────────────────────────────────────────

  function captureAndShowVault(orderId) {
    var urls = window.DEMO.urls
    return fetch(urls.captureOrder, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: orderId }),
    })
      .then(function (r) { return r.json() })
      .then(function (order) {
        console.log('[Vault-PayPal] capture response body =', order)
        // Inspect vault structure (remove after confirming structure matches v5)
        console.dir(order)
        if (order.error) { showResult('✗ ' + order.error, 'error'); return }
        var capture =
          order.purchase_units &&
          order.purchase_units[0] &&
          order.purchase_units[0].payments &&
          order.purchase_units[0].payments.captures &&
          order.purchase_units[0].payments.captures[0]
        if (!capture || capture.status !== 'COMPLETED') {
          showResult(
            '✗ Capture failed · status: ' + (capture ? capture.status : 'unknown'),
            'error'
          )
          return
        }
        showResult('✓ Payment captured · Order: ' + order.id, 'success')

        var vault =
          (order.payment_source &&
            order.payment_source.paypal &&
            order.payment_source.paypal.attributes &&
            order.payment_source.paypal.attributes.vault) || {}
        var vaultId = order.vaultId || vault.id || null
        var customerId = order.customerId || (vault.customer && vault.customer.id) || null
        showVaultResult(vaultId, customerId)
      })
  }

  // ── Payment session options ────────────────────────────────────────────────

  var paymentSessionOptions = {
    onApprove: function (data) {
      console.log('[Vault-PayPal] onApprove fired, orderId =', data.orderId)
      return captureAndShowVault(data.orderId)
    },
    onCancel: function () {
      console.log('[Vault-PayPal] onCancel fired')
      showResult('Payment cancelled.', 'error')
    },
    onError: function (err) {
      console.error('[Vault-PayPal] onError fired, err =', err)
      showResult('✗ ' + (err.message || String(err)), 'error')
    },
    savePayment: true,
  }

  // ── Button setup + fallback ────────────────────────────────────────────────

  var FALLBACK_MODES = ['auto', 'popup', 'redirect', 'modal']

  function handleClick(session) {
    if (!validateAmount()) return
    var urls = window.DEMO.urls
    // V6-2: pass Promise reference, do not await before session.start()
    var orderPromise = fetch(urls.createOrder, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: getAmount(), currency: getCurrency() }),
    })
      .then(function (r) { return r.json() })
      .then(function (d) {
        console.log('[Vault-PayPal] createOrder response body =', d)
        if (d.error) throw new Error(d.error)
        return { orderId: d.orderId }
      })
    startWithFallback(session, orderPromise)
  }

  async function startWithFallback(session, orderPromise) {
    for (var i = 0; i < FALLBACK_MODES.length; i++) {
      try {
        await session.start({ presentationMode: FALLBACK_MODES[i] }, orderPromise)
        return
      } catch (error) {
        console.log('[Vault-PayPal] session.start() error with mode "' + FALLBACK_MODES[i] + '":', error)
        if (error && error.isRecoverable) continue
        showResult('✗ ' + (error.message || String(error)), 'error')
        return
      }
    }
  }

  function configurePayPalButton(instance) {
    // V6-8: createPayPalOneTimePaymentSession is synchronous, not a Promise
    var session = instance.createPayPalOneTimePaymentSession(paymentSessionOptions)
    console.log('[Vault-PayPal] session created =', session)

    if (session.hasReturned()) {
      console.log('[Vault-PayPal] redirect returned, resuming session...')
      session.resume()
      return
    }

    var container = clearLoading()
    var btn = document.createElement('paypal-button')
    btn.setAttribute('type', 'pay')
    btn.setAttribute('class', 'paypal-gold')
    container.appendChild(btn)
    console.log('[Vault-PayPal] paypal-button appended to container')

    btn.addEventListener('click', function () { handleClick(session) })
    console.log('[Vault-PayPal] click listener attached')
  }

  // ── SDK init ───────────────────────────────────────────────────────────────

  function onPayPalWebSdkLoaded() {
    console.log('[Vault-PayPal] onPayPalWebSdkLoaded() called')
    console.log('[Vault-PayPal] window.DEMO =', window.DEMO)

    getPPInstance()
      .then(function (instance) {
        console.log('[Vault-PayPal] getPPInstance() resolved, calling findEligibleMethods...')
        return instance
          .findEligibleMethods({
            currencyCode: getCurrency(),
            paymentFlow: 'VAULT_WITH_PAYMENT',
          })
          .then(function (eligibility) {
            // Inspect eligibility to confirm 'paypal' key exists
            console.log('[Vault-PayPal] findEligibleMethods() resolved =', eligibility)
            console.log('[Vault-PayPal] isEligible("paypal") =', eligibility.isEligible('paypal'))

            if (eligibility.isEligible('paypal')) {
              configurePayPalButton(instance)
            } else {
              showResult('PayPal not eligible in this region', 'error')
            }
          })
      })
      .catch(function (err) {
        console.error('[Vault-PayPal] top-level error =', err)
        showResult('✗ ' + (err.message || String(err)), 'error')
      })
  }

  // ── Currency selector ──────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    console.log('[Vault-PayPal] DOMContentLoaded fired')
    var currSel = document.getElementById('demo-currency')
    if (currSel) {
      currSel.addEventListener('change', function () {
        console.log('[Vault-PayPal] currency changed to', this.value)
        var url = new URL(window.location.href)
        url.searchParams.set('currency', this.value)
        var amt = document.getElementById('demo-amount')
        if (amt) url.searchParams.set('amount', amt.value.trim())
        window.location.replace(url.toString())
      })
    }
  })

  window.addEventListener('load', function () {
    console.log('[Vault-PayPal] window.load fired, typeof paypal =', typeof paypal)
    if (typeof paypal === 'undefined') {
      console.error('[Vault-PayPal] PayPal SDK not loaded!')
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }
    if (typeof window.isBrowserSupportedByPayPal === 'function' && !window.isBrowserSupportedByPayPal()) {
      console.warn('[Vault-PayPal] browser not supported by PayPal')
      showResult('✗ Your browser is not supported by PayPal.', 'error')
      return
    }
    onPayPalWebSdkLoaded()
  })
})()
