/**
 * PayPal Independent Buttons — Multi-SDK (CN + US for Venmo)
 * 用于：buttons
 *
 * window.DEMO = {
 *   urls: {
 *     createOrder:   '/paypal/jssdk-v5/api/buttons/create-order',
 *     createOrderUs: '/paypal/jssdk-v5/api/buttons/create-order-us',
 *     captureOrder:  '/paypal/jssdk-v5/api/buttons/capture-order',
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

    // ── CN: PayPal Button ──────────────────────────────────────────
    if (typeof paypalCN !== 'undefined') {
      paypalCN.Buttons({
        fundingSource: paypalCN.FUNDING.PAYPAL,
        createOrder: function () {
          return fetch(urls.createOrder, { method: 'POST' })
            .then(function (r) { return r.json() }).then(function (d) { return d.id })
        },
        onApprove:  function (d) { return capture(d.orderID, 'cn') },
        onError:    function (e) { showResult('✗ PayPal: ' + (e.message || String(e)), 'error') },
      }).render('#btn-paypal')

      // ── CN: PayLater ─────────────────────────────────────────────
      paypalCN.Buttons({
        fundingSource: paypalCN.FUNDING.PAYLATER,
        createOrder: function () {
          return fetch(urls.createOrder, { method: 'POST' })
            .then(function (r) { return r.json() }).then(function (d) { return d.id })
        },
        onApprove:  function (d) { return capture(d.orderID, 'cn') },
        onError:    function (e) { showResult('✗ PayLater: ' + (e.message || String(e)), 'error') },
      }).render('#btn-paylater')

      // ── CN: BCDC ─────────────────────────────────────────────────
      paypalCN.Buttons({
        fundingSource: paypalCN.FUNDING.CARD,
        createOrder: function () {
          return fetch(urls.createOrder, { method: 'POST' })
            .then(function (r) { return r.json() }).then(function (d) { return d.id })
        },
        onApprove:  function (d) { return capture(d.orderID, 'cn') },
        onError:    function (e) { showResult('✗ BCDC: ' + (e.message || String(e)), 'error') },
      }).render('#btn-bcdc')
    }

    // ── US: Venmo ─────────────────────────────────────────────────
    if (typeof paypalUS !== 'undefined') {
      paypalUS.Buttons({
        fundingSource: paypalUS.FUNDING.VENMO,
        createOrder: function () {
          return fetch(urls.createOrderUs, { method: 'POST' })
            .then(function (r) { return r.json() }).then(function (d) { return d.id })
        },
        onApprove:  function (d) { return capture(d.orderID, 'us') },
        onError:    function (e) { showResult('✗ Venmo: ' + (e.message || String(e)), 'error') },
      }).render('#btn-venmo')
    }
  })
})()
