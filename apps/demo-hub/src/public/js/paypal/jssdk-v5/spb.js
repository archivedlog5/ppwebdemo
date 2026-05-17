/**
 * PayPal Standard Buttons (SPB)
 * 用于：spb-ecm, spb-ecs
 *
 * EJS 页面注入 window.DEMO 后引入此文件：
 *   window.DEMO = {
 *     urls: { createOrder: '/...', captureOrder: '/...' }
 *   }
 */
;(function () {
  'use strict'

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  function clearLoading(containerId) {
    var el = document.getElementById(containerId || 'paypal-button-container')
    if (!el) return el
    el.classList.remove('sdk-loading')
    el.innerHTML = ''
    return el
  }

  window.addEventListener('load', function () {
    if (typeof paypalSDK === 'undefined') {
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }

    var container = clearLoading()
    if (!container) return

    var urls = window.DEMO && window.DEMO.urls

    paypalSDK.Buttons({
      createOrder: function () {
        return fetch(urls.createOrder, { method: 'POST' })
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
            showResult('✓ Payment captured · Order: ' + order.id, 'success')
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
