/**
 * PayPal Advanced Credit/Debit Card (ACDC) — CardFields
 * 用于：acdc, vault-acdc-with-purchase, vault-acdc-setup-only
 *
 * window.DEMO = {
 *   urls: { createOrder: '/...', captureOrder: '/...' },
 *   mode: 'standard' | 'vault-purchase' | 'vault-setup',
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

  function clearLoading(id) {
    var el = document.getElementById(id)
    if (!el) return
    el.classList.remove('sdk-loading')
    el.innerHTML = ''
  }

  window.addEventListener('load', function () {
    if (typeof paypalSDK === 'undefined') {
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }

    // Format amount on blur
    var amountInput = document.getElementById('demo-amount')
    if (amountInput) {
      amountInput.addEventListener('blur', function () {
        var num = parseFloat(this.value)
        if (!isNaN(num) && num > 0) this.value = num.toFixed(2)
        validateAmount()
      })
    }

    clearLoading('card-number-container')

    var urls = window.DEMO && window.DEMO.urls

    var cardFields = paypalSDK.CardFields({
      createOrder: function () {
        if (!validateAmount()) return Promise.reject(new Error('Invalid amount'))
        return fetch(urls.createOrder, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ amount: getAmount() }),
        })
          .then(function (r) { return r.json() })
          .then(function (d) {
            if (d.error) throw new Error(d.error)
            return d.id
          })
      },
      onApprove: function (data) {
        return fetch(urls.captureOrder, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ orderID: data.orderID }),
        })
          .then(function (r) { return r.json() })
          .then(function (order) {
            if (order.error) throw new Error(order.error)
            var msg = '✓ Payment captured · Order: ' + order.id
            if (order.vaultId) msg += ' · Vault: ' + order.vaultId
            showResult(msg, 'success')
          })
      },
      onError: function (err) {
        showResult('✗ ' + (err.message || String(err)), 'error')
      },
      style: {
        input: {
          'font-family': "'Space Mono', monospace",
          'font-size':   '13px',
          color:         'inherit',
        }
      }
    })

    if (cardFields.isEligible()) {
      cardFields.NumberField({ placeholder: '4111 1111 1111 1111' }).render('#card-number-container')
      cardFields.ExpiryField({ placeholder: 'MM / YY' }).render('#card-expiry-container')
      cardFields.CVVField({ placeholder: '•••' }).render('#card-cvv-container')
      if (document.getElementById('card-name-container')) {
        cardFields.NameField({ placeholder: 'Full Name' }).render('#card-name-container')
      }
    } else {
      document.getElementById('card-number-container').innerHTML =
        '<p style="color:var(--fg-muted);font-size:12px;text-align:center">Card Fields not available for this account.</p>'
    }

    var payBtn = document.getElementById('acdc-pay-btn')
    if (payBtn) {
      payBtn.addEventListener('click', function () {
        if (!validateAmount()) return
        payBtn.disabled = true
        cardFields.submit().catch(function (err) {
          showResult('✗ ' + (err.message || String(err)), 'error')
          payBtn.disabled = false
        })
      })
    }
  })
})()
