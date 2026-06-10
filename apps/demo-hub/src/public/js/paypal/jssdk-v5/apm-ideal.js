/**
 * PayPal JSSDK v5 — APM iDEAL（Mark + Button）
 * window.DEMO = { urls: { createOrder, captureOrder } }
 * 货币固定 EUR（服务端强制）。规则 13：仅 COMPLETED 成功。
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

  function clearLoading(id) {
    var el = document.getElementById(id)
    if (!el) return el
    el.classList.remove('sdk-loading'); el.innerHTML = ''
    return el
  }

  window.addEventListener('load', function () {
    if (typeof paypalSDK === 'undefined') {
      showResult('✗ PayPal SDK failed to load', 'error'); return
    }
    var urls = window.DEMO && window.DEMO.urls

    var amtInput = document.getElementById('demo-amount')
    if (amtInput) amtInput.addEventListener('blur', function () {
      var n = parseFloat(this.value); if (!isNaN(n) && n > 0) this.value = n.toFixed(2); validateAmount()
    })

    // iDEAL Mark
    if (paypalSDK.Marks) {
      paypalSDK.Marks({ fundingSource: paypalSDK.FUNDING.IDEAL }).render('#ideal-mark')
    }

    // iDEAL Button
    clearLoading('ideal-btn')
    paypalSDK.Buttons({
      fundingSource: paypalSDK.FUNDING.IDEAL,
      style: { label: 'pay' },

      createOrder: function () {
        if (!validateAmount()) return Promise.reject(new Error('Invalid amount'))
        return fetch(urls.createOrder, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: getAmount() }),
        })
          .then(function (r) { return r.json() })
          .then(function (d) { if (d.error) throw new Error(d.error); return d.id })
      },

      onApprove: function (data) {
        return fetch(urls.captureOrder, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderID: data.orderID }),
        })
          .then(function (r) { return r.json() })
          .then(function (order) {
            if (order.error) throw new Error(order.error)
            var cap = order.purchase_units &&
                      order.purchase_units[0] &&
                      order.purchase_units[0].payments &&
                      order.purchase_units[0].payments.captures &&
                      order.purchase_units[0].payments.captures[0]
            if (!cap || cap.status !== 'COMPLETED') {
              showResult('✗ Capture failed · status: ' + (cap ? cap.status : 'unknown'), 'error')
              return
            }
            showResult('✓ Payment captured · Order: ' + order.id, 'success')
          })
      },

      onCancel: function () { showResult('Payment cancelled.', 'error') },
      onError:  function (err) { showResult('✗ ' + (err.message || String(err)), 'error') },
    }).render('#ideal-btn')
  })
})()
