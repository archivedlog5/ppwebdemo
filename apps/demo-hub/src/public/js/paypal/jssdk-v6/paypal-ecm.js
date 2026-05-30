;(function () {
  'use strict'

  function getCurrency() {
    var sel = document.getElementById('demo-currency')
    return sel ? sel.value : 'USD'
  }

  function getAmount() {
    var inp = document.getElementById('demo-amount')
    return inp ? inp.value.trim() : ''
  }

  function validateAmount() {
    var raw = getAmount()
    var amt = parseFloat(raw)
    if (!raw || isNaN(amt) || amt <= 0 || !/^\d+(\.\d{1,2})?$/.test(raw)) {
      showResult('Please enter a valid amount (e.g. 100.00).', 'error')
      return false
    }
    return true
  }

  function clearLoading() {
    var container = document.getElementById('paypal-button-container')
    if (container) container.innerHTML = ''
    return container
  }

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.textContent = text
    el.className = 'result-msg result-' + (type || 'info')
    el.style.display = 'block'
  }

  // Currency change → reload page with new currency param
  document.addEventListener('DOMContentLoaded', function () {
    var sel = document.getElementById('demo-currency')
    if (!sel) return
    sel.addEventListener('change', function () {
      var url = new URL(window.location.href)
      url.searchParams.set('currency', this.value)
      var amt = document.getElementById('demo-amount')
      if (amt) url.searchParams.set('amount', amt.value.trim())
      window.location.replace(url.toString())
    })
  })

  window.addEventListener('load', function () {
    if (typeof paypal === 'undefined') {
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }

    var urls = (window.DEMO || {}).urls

    getPPInstance()
      .then(function (instance) {
        return instance.findEligibleMethods()
          .then(function (eligibility) {
            if (!eligibility.isEligible('paypal')) {
              showResult('PayPal not eligible in this region', 'error')
              return
            }

            var container = clearLoading()
            var btn = document.createElement('paypal-button')
            container.appendChild(btn)

            return instance
              .createPayPalOneTimePaymentSession({
                onApprove: function (data) {
                  return fetch(urls.captureOrder, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId: data.orderId }),
                  })
                    .then(function (r) { return r.json() })
                    .then(function (order) {
                      if (order.error) { showResult('✗ ' + order.error, 'error'); return }
                      var capture =
                        order.purchase_units &&
                        order.purchase_units[0] &&
                        order.purchase_units[0].payments &&
                        order.purchase_units[0].payments.captures &&
                        order.purchase_units[0].payments.captures[0]
                      if (!capture || capture.status !== 'COMPLETED') {
                        showResult(
                          '✗ Capture failed · status: ' + (capture ? capture.status : 'unknown'),
                          'error'
                        )
                        return
                      }
                      showResult('✓ Payment captured · Order: ' + order.id, 'success')
                    })
                },
                onCancel: function () {
                  showResult('Payment cancelled.', 'info')
                },
                onError: function (err) {
                  showResult('✗ ' + (err.message || String(err)), 'error')
                },
              })
              .then(function (session) {
                btn.addEventListener('click', function () {
                  if (!validateAmount()) return
                  var orderPromise = fetch(urls.createOrder, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount: getAmount(), currency: getCurrency() }),
                  })
                    .then(function (r) { return r.json() })
                    .then(function (d) {
                      if (d.error) throw new Error(d.error)
                      return { orderId: d.orderId }
                    })
                  session.start({ presentationMode: 'auto' }, orderPromise)
                })
              })
          })
      })
      .catch(function (err) {
        showResult('✗ ' + (err.message || String(err)), 'error')
      })
  })
})()
