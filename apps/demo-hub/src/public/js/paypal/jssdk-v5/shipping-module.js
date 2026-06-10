/**
 * Shipping Module — JSSDK v5
 * server-side callbacks: SHIPPING_ADDRESS / SHIPPING_OPTIONS
 *
 * window.DEMO = {
 *   urls: { createOrder, captureOrder },
 *   merchant: 'cn' | 'us',
 *   currency: 'USD' | ...
 * }
 */
;(function () {
  'use strict'

  var ZERO_DECIMAL = ['JPY', 'KRW', 'TWD', 'CLP', 'IDR']

  function isZeroDecimal(currency) {
    return ZERO_DECIMAL.indexOf(currency) !== -1
  }

  function getCurrency() {
    var sel = document.getElementById('demo-currency')
    return sel ? sel.value : (window.DEMO && window.DEMO.currency) || 'USD'
  }

  function getAmount() {
    var input = document.getElementById('demo-amount')
    return input ? input.value.trim() : '100.00'
  }

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  function clearLoading() {
    var el = document.getElementById('paypal-button-container')
    if (!el) return el
    el.classList.remove('sdk-loading')
    el.innerHTML = ''
    return el
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
      err = 'Minimum amount is ' + (zd ? '1' : MIN_AMOUNT.toFixed(2))
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

  function readControls() {
    var subscribeCb = document.getElementById('subscribe-options')
    var declineSel  = document.getElementById('simulate-decline')
    return {
      amount:           getAmount(),
      currency:         getCurrency(),
      merchant:         (window.DEMO && window.DEMO.merchant) || 'cn',
      subscribeOptions: subscribeCb ? subscribeCb.checked : true,
      decline:          declineSel  ? declineSel.value    : 'none',
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Currency change → reload，保留 merchant + amount
    var currencySel = document.getElementById('demo-currency')
    if (currencySel) {
      currencySel.addEventListener('change', function () {
        var url = new URL(window.location.href)
        url.searchParams.set('currency', this.value)
        url.searchParams.set('amount', getAmount())
        window.location.replace(url.toString())
      })
    }

    // Merchant change → reload，保留 currency + amount
    var merchantSel = document.getElementById('demo-merchant')
    if (merchantSel) {
      merchantSel.addEventListener('change', function () {
        var url = new URL(window.location.href)
        url.searchParams.set('merchant', this.value)
        url.searchParams.set('currency', getCurrency())
        url.searchParams.set('amount', getAmount())
        window.location.replace(url.toString())
      })
    }

    // Amount blur → 格式化 + 校验
    var amountInput = document.getElementById('demo-amount')
    if (amountInput) {
      amountInput.addEventListener('blur', function () {
        var num = parseFloat(this.value)
        if (!isNaN(num) && num > 0) {
          this.value = isZeroDecimal(getCurrency()) ? String(Math.round(num)) : num.toFixed(2)
        }
        validateAmount()
      })
    }
  })

  window.addEventListener('load', function () {
    if (typeof paypalSDK === 'undefined') {
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }

    var container = clearLoading()
    if (!container) return

    paypalSDK.Buttons({
      createOrder: function () {
        if (!validateAmount()) return Promise.reject(new Error('Invalid amount'))
        var c = readControls()
        console.log('[shipping-module] createOrder controls:', JSON.stringify(c))
        return fetch(window.DEMO.urls.createOrder, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(c),
        })
          .then(function (r) { return r.json() })
          .then(function (d) {
            console.log('[shipping-module] createOrder response:', JSON.stringify(d))
            if (d.error) throw new Error(d.error)
            return d.id
          })
      },

      onApprove: function (data) {
        var merchant = readControls().merchant
        return fetch(window.DEMO.urls.captureOrder, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ orderID: data.orderID, merchant: merchant }),
        })
          .then(function (r) { return r.json() })
          .then(function (order) {
            console.log('[shipping-module] capture response:', JSON.stringify(order))
            if (order.error) throw new Error(order.error)
            // 规则 13：必须检查 captures[0].status === 'COMPLETED'
            var cap = order.purchase_units &&
                      order.purchase_units[0] &&
                      order.purchase_units[0].payments &&
                      order.purchase_units[0].payments.captures &&
                      order.purchase_units[0].payments.captures[0]
            if (!cap || cap.status !== 'COMPLETED') {
              showResult('✗ Capture failed · status: ' + (cap ? cap.status : 'unknown'), 'error')
              return
            }
            // 展示最终金额（含所选运费），便于核对运费已计入
            var amt = order.purchase_units[0].amount
            showResult('✓ Captured · ' + amt.currency_code + ' ' + amt.value + ' · Order: ' + order.id, 'success')
          })
      },

      onCancel: function () {
        showResult('Payment cancelled.', 'error')
      },

      onError: function (err) {
        showResult('✗ ' + (err.message || String(err)), 'error')
      },
    }).render('#paypal-button-container')
  })
})()
