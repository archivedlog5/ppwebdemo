/**
 * Vault Return Buyer — server-side charge via stored payment token
 * 用于：vault-return
 * 无 SDK，纯 fetch
 *
 * window.DEMO = {
 *   urls: { createAndCapture: '/...' },
 *   defaultAmount: '100.00'
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

  function getAmount() {
    var input = document.getElementById('demo-amount')
    return input ? input.value.trim() : (window.DEMO && window.DEMO.defaultAmount) || '100.00'
  }

  function validateAmount() {
    var input = document.getElementById('demo-amount')
    var errEl = document.getElementById('amount-error')
    if (!input) return true
    var val = input.value.trim()
    var num = parseFloat(val)
    if (!val || isNaN(num) || num <= 0 || !/^\d+(\.\d{1,2})?$/.test(val)) {
      if (errEl) errEl.textContent = 'Please enter a valid amount (e.g. 100.00)'
      input.classList.add('amount-input--error')
      return false
    }
    if (errEl) errEl.textContent = ''
    input.classList.remove('amount-input--error')
    return true
  }

  document.addEventListener('DOMContentLoaded', function () {
    var urls   = window.DEMO && window.DEMO.urls
    var btn    = document.getElementById('vault-return-btn')
    var input  = document.getElementById('payment-token-input')

    // Format amount on blur
    var amountInput = document.getElementById('demo-amount')
    if (amountInput) {
      amountInput.addEventListener('blur', function () {
        var num = parseFloat(this.value)
        if (!isNaN(num) && num > 0) this.value = num.toFixed(2)
        validateAmount()
      })
    }

    if (!btn || !input) return

    btn.addEventListener('click', function () {
      var tokenId = input.value.trim()
      if (!tokenId) {
        showResult('✗ Please enter a Payment Token ID', 'error')
        return
      }
      if (!validateAmount()) return

      btn.disabled    = true
      btn.textContent = 'Charging...'

      fetch(urls.createAndCapture, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ paymentTokenId: tokenId, amount: getAmount() }),
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
          btn.textContent = 'Charge with Vaulted Method'
        })
    })
  })
})()
