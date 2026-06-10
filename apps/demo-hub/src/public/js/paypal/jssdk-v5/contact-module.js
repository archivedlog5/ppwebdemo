;(function () {
  'use strict'

  // ── Helpers ──────────────────────────────────────────────────────────
  function showResult(msg, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.textContent = msg
    el.className = 'result-msg ' + (type || 'info')
  }

  // ── Amount validation (USD, 2 decimal places) ─────────────────────
  function validateAmount() {
    var raw = document.getElementById('demo-amount').value.trim()
    var num = parseFloat(raw)
    var errEl = document.getElementById('amount-error')
    if (!raw || isNaN(num) || num <= 0) {
      if (errEl) errEl.textContent = 'Please enter a valid amount.'
      return false
    }
    if (errEl) errEl.textContent = ''
    return true
  }

  document.getElementById('demo-amount').addEventListener('blur', function () {
    var raw = this.value.trim()
    var num = parseFloat(raw)
    if (!isNaN(num) && num > 0) this.value = num.toFixed(2)
    validateAmount()
  })

  // ── #pref-hint dynamic hint text ──────────────────────────────────
  var PREF_HINTS = {
    UPDATE_CONTACT_INFO: 'Buyer can view and edit contact at PayPal.',
    RETAIN_CONTACT_INFO: 'Buyer can view contact but cannot edit it.',
    NO_CONTACT_INFO:     "Buyer won't see contact, but it's still sent to the merchant.",
  }

  function updatePrefHint() {
    var v = document.getElementById('contact-preference').value
    document.getElementById('pref-hint').textContent = PREF_HINTS[v] || ''
  }

  document.getElementById('contact-preference').addEventListener('change', updatePrefHint)
  updatePrefHint()  // initialize on page load

  // ── Read controls ─────────────────────────────────────────────────
  function readControls() {
    return {
      amount:           document.getElementById('demo-amount').value.trim(),
      contactPreference: document.getElementById('contact-preference').value,
    }
  }

  // ── SDK init ──────────────────────────────────────────────────────
  window.addEventListener('load', function () {
    if (typeof paypalSDK === 'undefined') {
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }

    paypalSDK.Buttons({
      createOrder: function () {
        if (!validateAmount()) return Promise.reject(new Error('Invalid amount'))
        var c = readControls()
        console.log('[contact-module] createOrder controls:', c)
        return fetch(window.DEMO.urls.createOrder, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(c),
        })
          .then(function (r) { return r.json() })
          .then(function (d) {
            console.log('[contact-module] createOrder response:', d)
            if (d.error) throw new Error(d.error)
            return d.id
          })
      },

      onApprove: function (data) {
        return fetch(window.DEMO.urls.captureOrder, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ orderID: data.orderID }),
        })
          .then(function (r) { return r.json() })
          .then(function (order) {
            console.log('[contact-module] captureOrder response:', order)
            if (order.error) throw new Error(order.error)

            // Rule 13: re-check captures[0].status from raw response
            var cap = order.raw &&
                      order.raw.purchase_units &&
                      order.raw.purchase_units[0] &&
                      order.raw.purchase_units[0].payments &&
                      order.raw.purchase_units[0].payments.captures &&
                      order.raw.purchase_units[0].payments.captures[0]
            if (!cap || cap.status !== 'COMPLETED') {
              showResult('✗ Capture failed · status: ' + (cap ? cap.status : 'unknown'), 'error')
              return
            }

            // Display final contact info retrieved from GET Order
            var email = (order.contact && order.contact.email) || 'n/a'
            var phone = (order.contact && order.contact.phone) || 'n/a'
            showResult(
              '✓ COMPLETED · Contact → ' + email + ' / ' + phone + ' · Capture ID: ' + cap.id,
              'success'
            )
          })
      },

      onCancel: function () {
        showResult('Payment cancelled.', 'error')
      },

      onError: function (e) {
        showResult('✗ ' + (e.message || String(e)), 'error')
      },
    }).render('#paypal-button-container')
  })
})()
