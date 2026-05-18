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

  var ZERO_DECIMAL = ['JPY','KRW','TWD','CLP','IDR']

  function getCurrency() {
    var sel = document.getElementById('demo-currency')
    return sel ? sel.value : (window.DEMO && window.DEMO.currency) || 'USD'
  }

  function isZeroDecimal(currency) {
    return ZERO_DECIMAL.indexOf(currency) !== -1
  }

  // Currency change → reload page with ?currency=X&amount=Y
  document.addEventListener('DOMContentLoaded', function () {
    var currencySel = document.getElementById('demo-currency')
    if (!currencySel) return
    currencySel.addEventListener('change', function () {
      var amtInput = document.getElementById('demo-amount')
      var url = new URL(window.location.href)
      url.searchParams.set('currency', this.value)
      if (amtInput) url.searchParams.set('amount', amtInput.value.trim())
      window.location.replace(url.toString())
    })
  })


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

  document.addEventListener('DOMContentLoaded', function () {
    var urls   = window.DEMO && window.DEMO.urls
    var btn    = document.getElementById('vault-return-btn')
    var input  = document.getElementById('payment-token-input')

    // Format amount on blur
    var amountInput = document.getElementById('demo-amount')
    if (amountInput) {
      amountInput.addEventListener('blur', function () {
        var num = parseFloat(this.value)
        if (!isNaN(num) && num > 0) this.value = isZeroDecimal(getCurrency()) ? String(Math.round(num)) : num.toFixed(2)
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
        body:    JSON.stringify({ paymentTokenId: tokenId, amount: getAmount(), currency: getCurrency() }),
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
