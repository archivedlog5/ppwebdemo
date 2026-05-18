/**
 * PayPal Independent Buttons — Multi-SDK (CN + US for Venmo)
 * 用于：buttons
 *
 * window.DEMO = {
 *   urls: { createOrder, createOrderUs, captureOrder },
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

  var MIN_AMOUNT = 1.00
  var MAX_AMOUNT = 30000.00

  function validateAmount() {
    var input = document.getElementById('demo-amount')
    var errEl = document.getElementById('amount-error')
    if (!input) return true
    var val = input.value.trim()
    var num = parseFloat(val)
    var err = ''
    if (!val || isNaN(num) || !/^\d+(\.\d{1,2})?$/.test(val)) {
      err = 'Please enter a valid number (e.g. 100.00)'
    } else if (num < MIN_AMOUNT) {
      err = 'Minimum amount is $' + MIN_AMOUNT.toFixed(2)
    } else if (num > MAX_AMOUNT) {
      err = 'Maximum amount is $' + MAX_AMOUNT.toLocaleString('en-US', { minimumFractionDigits: 2 })
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

  function capture(orderID, account) {
    var urls = window.DEMO && window.DEMO.urls
    return fetch(urls.captureOrder, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ orderID: orderID, account: account }),
    })
      .then(function (r) { return r.json() })
      .then(function (order) {
        if (order.error) throw new Error(order.error)
        showResult('✓ Captured · Order: ' + order.id, 'success')
      })
  }

  window.addEventListener('load', function () {
    var urls = window.DEMO && window.DEMO.urls

    // Format amount on blur
    var amountInput = document.getElementById('demo-amount')
    if (amountInput) {
      amountInput.addEventListener('blur', function () {
        var num = parseFloat(this.value)
        if (!isNaN(num) && num > 0) this.value = num.toFixed(2)
        validateAmount()
      })
    }

    function makeCreateOrder(endpoint) {
      return function () {
        if (!validateAmount()) return Promise.reject(new Error('Invalid amount'))
        return fetch(endpoint, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ amount: getAmount() }),
        })
          .then(function (r) { return r.json() })
          .then(function (d) { if (d.error) throw new Error(d.error); return d.id })
      }
    }

    // ── CN: PayPal ──────────────────────────────────────────────────
    if (typeof paypalCN !== 'undefined') {
      paypalCN.Buttons({
        fundingSource: paypalCN.FUNDING.PAYPAL,
        createOrder:   makeCreateOrder(urls.createOrder),
        onApprove:     function (d) { return capture(d.orderID, 'cn') },
        onError:       function (e) { showResult('✗ PayPal: ' + (e.message || String(e)), 'error') },
      }).render('#btn-paypal')

      paypalCN.Buttons({
        fundingSource: paypalCN.FUNDING.PAYLATER,
        createOrder:   makeCreateOrder(urls.createOrder),
        onApprove:     function (d) { return capture(d.orderID, 'cn') },
        onError:       function (e) { showResult('✗ PayLater: ' + (e.message || String(e)), 'error') },
      }).render('#btn-paylater')

      paypalCN.Buttons({
        fundingSource: paypalCN.FUNDING.CARD,
        createOrder:   makeCreateOrder(urls.createOrder),
        onApprove:     function (d) { return capture(d.orderID, 'cn') },
        onError:       function (e) { showResult('✗ BCDC: ' + (e.message || String(e)), 'error') },
      }).render('#btn-bcdc')
    }

    // ── US: Venmo ───────────────────────────────────────────────────
    if (typeof paypalUS !== 'undefined') {
      paypalUS.Buttons({
        fundingSource: paypalUS.FUNDING.VENMO,
        createOrder:   makeCreateOrder(urls.createOrderUs),
        onApprove:     function (d) { return capture(d.orderID, 'us') },
        onError:       function (e) { showResult('✗ Venmo: ' + (e.message || String(e)), 'error') },
      }).render('#btn-venmo')
    }
  })
})()
