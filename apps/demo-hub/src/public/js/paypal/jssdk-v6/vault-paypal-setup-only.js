;(function () {
  'use strict'

  console.log('[VaultSetupOnly] vault-paypal-setup-only.js loaded')

  // ── Helpers ────────────────────────────────────────────────────────────────

  function clearLoading() {
    var container = document.getElementById('paypal-button-container')
    if (container) {
      container.classList.remove('sdk-loading')
      container.innerHTML = ''
    }
    return container
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
    document.getElementById('payment-token-id').textContent = paymentTokenId || '—'
    document.getElementById('customer-id').textContent = customerId || '—'
    box.style.display = 'block'
  }

  // ── Two-step token fetches ─────────────────────────────────────────────────

  function createSetupToken() {
    // V6-2: called without await — returns a Promise for session.start()
    return fetch(window.DEMO.urls.createSetupToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (d.error) throw new Error(d.error)
        // SDK constraint: session.start() 2nd arg must resolve to { vaultSetupToken }
        return { vaultSetupToken: d.setupTokenId }
      })
  }

  function createPaymentToken(vaultSetupToken) {
    // onApprove passes data.vaultSetupToken (probe T3 confirms key name)
    return fetch(window.DEMO.urls.confirmSetupToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupTokenId: vaultSetupToken }),
    })
      .then(function (r) { return r.json() })
      .then(function (res) {
        console.dir(res)   // PROBE T4: confirm paymentTokenId / customer.id structure (delete after)
        if (res.error || !res.paymentTokenId) {
          showResult('✗ ' + (res.error || 'Payment token creation failed'), 'error')
          return
        }
        showResult('✓ Payment method saved · Payment Token: ' + res.paymentTokenId, 'success')
        showVaultResult(res.paymentTokenId, res.customerId)
      })
  }

  // ── Payment session options ────────────────────────────────────────────────

  var paymentSessionOptions = {
    onApprove: function (data) {
      console.log('[VaultSetupOnly] onApprove fired, data =', data)
      // PROBE T3: confirm the key is really vaultSetupToken (not billingToken)
      console.dir(data)
      return createPaymentToken(data.vaultSetupToken)
    },
    onCancel: function () {
      console.log('[VaultSetupOnly] onCancel fired')
      showResult('Save payment cancelled.', 'error')
    },
    onError: function (err) {
      console.error('[VaultSetupOnly] onError fired, err =', err)
      showResult('✗ ' + (err.message || String(err)), 'error')
    },
  }

  // ── Button setup + FALLBACK loop ───────────────────────────────────────────

  var FALLBACK_MODES = ['auto', 'popup', 'redirect', 'modal']

  function configurePayPalButton(instance) {
    // V6-8: createPayPalSavePaymentSession is assumed synchronous (probe T1 confirms)
    var session = instance.createPayPalSavePaymentSession(paymentSessionOptions)
    console.dir(session)   // PROBE T1: confirm sync return + hasReturned/resume availability (delete after)

    // redirect return handling — probe T1 will confirm if save session has hasReturned/resume.
    // If inspect shows no hasReturned/resume: delete this block + remove 'redirect' from FALLBACK_MODES
    // and record conclusion in docs/debug-log.md.
    if (typeof session.hasReturned === 'function' && session.hasReturned()) {
      console.log('[VaultSetupOnly] redirect returned, resuming session...')
      session.resume()
      return
    }

    var container = clearLoading()
    var btn = document.createElement('paypal-button')
    btn.setAttribute('type', 'pay')
    btn.setAttribute('class', 'paypal-gold')
    container.appendChild(btn)

    btn.addEventListener('click', function () { handleClick(session) })
  }

  function handleClick(session) {
    // V6-2: do not await — pass Promise reference to preserve click transient activation
    var setupTokenPromise = createSetupToken()
    startWithFallback(session, setupTokenPromise)
  }

  async function startWithFallback(session, setupTokenPromise) {
    for (var i = 0; i < FALLBACK_MODES.length; i++) {
      try {
        await session.start({ presentationMode: FALLBACK_MODES[i] }, setupTokenPromise)
        return
      } catch (error) {
        console.log('[VaultSetupOnly] session.start() error with mode "' + FALLBACK_MODES[i] + '":', error)
        if (error && error.isRecoverable) continue
        showResult('✗ ' + (error.message || String(error)), 'error')
        return
      }
    }
  }

  // ── SDK init ───────────────────────────────────────────────────────────────

  function onPayPalWebSdkLoaded() {
    console.log('[VaultSetupOnly] onPayPalWebSdkLoaded() called')

    getPPInstance()
      .then(function (instance) {
        return instance
          .findEligibleMethods({
            currencyCode: 'USD',
            paymentFlow: 'VAULT_WITHOUT_PAYMENT',
          })
          .then(function (eligibility) {
            console.dir(eligibility)   // PROBE T2: confirm paypal eligible + paymentFlow accepted (delete after)
            if (eligibility.isEligible('paypal')) {
              configurePayPalButton(instance)
            } else {
              showResult('PayPal save payment is not eligible for this session', 'error')
            }
          })
      })
      .catch(function (err) {
        console.error('[VaultSetupOnly] top-level error =', err)
        showResult('✗ ' + (err.message || String(err)), 'error')
      })
  }

  // ── window.load entry point ────────────────────────────────────────────────

  window.addEventListener('load', function () {
    console.log('[VaultSetupOnly] window.load fired, typeof paypal =', typeof paypal)
    if (typeof paypal === 'undefined') {
      console.error('[VaultSetupOnly] PayPal SDK not loaded!')
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }
    if (typeof window.isBrowserSupportedByPayPal === 'function' && !window.isBrowserSupportedByPayPal()) {
      console.warn('[VaultSetupOnly] browser not supported by PayPal')
      showResult('✗ Your browser is not supported by PayPal.', 'error')
      return
    }
    onPayPalWebSdkLoaded()
  })
})()
