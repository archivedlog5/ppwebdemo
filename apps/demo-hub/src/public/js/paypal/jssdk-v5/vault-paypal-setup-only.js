/**
 * PayPal Vault Setup-Only (zero-dollar authorization)
 * 用于：vault-paypal-setup-only
 *
 * window.DEMO = {
 *   urls: {
 *     createSetupToken:  '/paypal/jssdk-v5/api/vault-paypal-setup-only/create-setup-token',
 *     confirmSetupToken: '/paypal/jssdk-v5/api/vault-paypal-setup-only/confirm-setup-token',
 *   }
 * }
 */
;(function () {
  'use strict'

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  function showVaultResult(paymentTokenId, customerId) {
    var panel      = document.getElementById('vault-result')
    var tokenEl    = document.getElementById('payment-token-id')
    var customerEl = document.getElementById('customer-id')
    if (!panel) return
    if (tokenEl)    tokenEl.textContent    = paymentTokenId || '(not returned)'
    if (customerEl) customerEl.textContent = customerId     || '(not returned)'
    panel.style.display = 'block'
  }

  function clearLoading(id) {
    var el = document.getElementById(id || 'paypal-button-container')
    if (!el) return
    el.classList.remove('sdk-loading')
    el.innerHTML = ''
  }

  window.addEventListener('load', function () {
    if (typeof paypalSDK === 'undefined') {
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }

    clearLoading()
    var urls = window.DEMO && window.DEMO.urls

    paypalSDK.Buttons({
      createVaultSetupToken: function () {
        return fetch(urls.createSetupToken, { method: 'POST' })
          .then(function (r) { return r.json() })
          .then(function (d) {
            if (d.error) throw new Error(d.error)
            return d.setupTokenId
          })
      },
      onApprove: function (data) {
        return fetch(urls.confirmSetupToken, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ setupTokenId: data.vaultSetupToken }),
        })
          .then(function (r) { return r.json() })
          .then(function (res) {
            if (res.error) throw new Error(res.error)
            showResult('✓ Vault enrolled · Payment Token: ' + res.paymentTokenId, 'success')
            showVaultResult(res.paymentTokenId, res.customerId)
          })
      },
      onError: function (err) {
        showResult('✗ ' + (err.message || String(err)), 'error')
      },
    }).render('#paypal-button-container')
  })
})()
