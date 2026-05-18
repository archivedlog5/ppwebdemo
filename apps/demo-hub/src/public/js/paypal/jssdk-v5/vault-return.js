/**
 * Vault Return Buyer — server-side charge via stored payment token
 * 用于：vault-return
 * 无 SDK，纯 fetch
 *
 * window.DEMO = {
 *   urls: { createAndCapture: '/paypal/jssdk-v5/api/vault-return/create-and-capture' }
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

  document.addEventListener('DOMContentLoaded', function () {
    var urls   = window.DEMO && window.DEMO.urls
    var btn    = document.getElementById('vault-return-btn')
    var input  = document.getElementById('payment-token-input')
    if (!btn || !input) return

    btn.addEventListener('click', function () {
      var tokenId = input.value.trim()
      if (!tokenId) {
        showResult('✗ Please enter a Payment Token ID', 'error')
        return
      }

      btn.disabled    = true
      btn.textContent = 'Charging...'

      fetch(urls.createAndCapture, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ paymentTokenId: tokenId }),
      })
        .then(function (r) { return r.json() })
        .then(function (order) {
          if (order.error) throw new Error(order.error)
          showResult('✓ Captured · Order: ' + order.id + ' · Status: ' + order.status, 'success')
        })
        .catch(function (err) {
          showResult('✗ ' + (err.message || String(err)), 'error')
        })
        .finally(function () {
          btn.disabled    = false
          btn.textContent = 'Charge \$100.00 with Vaulted Method'
        })
    })
  })
})()
