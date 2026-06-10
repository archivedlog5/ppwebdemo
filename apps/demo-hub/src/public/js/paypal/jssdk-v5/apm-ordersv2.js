/**
 * PayPal JSSDK v5 — APM Bancontact（纯 Orders v2 API，无 JSSDK）
 * window.DEMO = { urls: { createOrder } }
 * 货币固定 EUR（服务端强制）。点击 → 建单 → 重定向到 payer-action。
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
    return input ? input.value.trim() : '100.00'
  }

  var MIN_AMOUNT = 1.00, MAX_AMOUNT = 30000.00
  function validateAmount() {
    var input = document.getElementById('demo-amount')
    var errEl = document.getElementById('amount-error')
    if (!input) return true
    var val = input.value.trim(), num = parseFloat(val), err = ''
    if (!val || isNaN(num) || !/^\d+(\.\d{1,2})?$/.test(val)) err = 'Please enter a valid number'
    else if (num < MIN_AMOUNT) err = 'Minimum amount is ' + MIN_AMOUNT.toFixed(2)
    else if (num > MAX_AMOUNT) err = 'Maximum amount is ' + MAX_AMOUNT.toLocaleString()
    if (err) { if (errEl) errEl.textContent = err; input.classList.add('amount-input--error'); return false }
    if (errEl) errEl.textContent = ''
    input.classList.remove('amount-input--error')
    return true
  }

  window.addEventListener('load', function () {
    var urls = window.DEMO && window.DEMO.urls
    var btn  = document.getElementById('bancontact-btn')

    var amtInput = document.getElementById('demo-amount')
    if (amtInput) amtInput.addEventListener('blur', function () {
      var n = parseFloat(this.value); if (!isNaN(n) && n > 0) this.value = n.toFixed(2); validateAmount()
    })

    if (!btn) return
    btn.addEventListener('click', function () {
      if (!validateAmount()) return
      btn.disabled = true
      showResult('Creating order…', 'success')

      fetch(urls.createOrder, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: getAmount() }),
      })
        .then(function (r) { return r.json() })
        .then(function (d) {
          if (d.error || !d.payerAction) throw new Error(d.error || 'No redirect link')
          showResult('Redirecting to Bancontact…', 'success')
          window.location.href = d.payerAction
        })
        .catch(function (err) {
          btn.disabled = false
          showResult('✗ ' + (err.message || String(err)), 'error')
        })
    })
  })
})()
