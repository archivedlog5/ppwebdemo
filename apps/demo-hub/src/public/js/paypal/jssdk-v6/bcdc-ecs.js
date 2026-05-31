;(function () {
  'use strict'

  console.log('[PayPal-BCDC-ECS] bcdc-ecs.js loaded')

  // ── Helpers ────────────────────────────────────────────────────────────────

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
    console.log('[PayPal-BCDC-ECS] showResult() type=%s text=%s', type, text)
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  // ── Currency selector ──────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    console.log('[PayPal-BCDC-ECS] DOMContentLoaded fired')
    var currSel = document.getElementById('demo-currency')
    if (currSel) {
      currSel.addEventListener('change', function () {
        console.log('[PayPal-BCDC-ECS] currency changed to', this.value)
        var url = new URL(window.location.href)
        url.searchParams.set('currency', this.value)
        var amt = document.getElementById('demo-amount')
        if (amt) url.searchParams.set('amount', amt.value.trim())
        window.location.replace(url.toString())
      })
    }
  })

  window.addEventListener('load', function () {
    console.log('[PayPal-BCDC-ECS] window.load fired, typeof paypal =', typeof paypal)
    if (typeof paypal === 'undefined') {
      console.error('[PayPal-BCDC-ECS] PayPal SDK not loaded!')
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }
    if (typeof window.isBrowserSupportedByPayPal === 'function' && !window.isBrowserSupportedByPayPal()) {
      console.warn('[PayPal-BCDC-ECS] browser not supported by PayPal')
      showResult('✗ Your browser is not supported by PayPal.', 'error')
      return
    }

    console.log('[PayPal-BCDC-ECS] window.DEMO =', window.DEMO)
    var urls = (window.DEMO || {}).urls

    getPPInstance()
      .then(function (instance) {
        console.log('[PayPal-BCDC-ECS] getPPInstance() resolved, instance =', instance)
        console.log('[PayPal-BCDC-ECS] calling findEligibleMethods()...')
        return instance.findEligibleMethods({ currencyCode: getCurrency() })
          .then(async function (eligibility) {
            console.log('[PayPal-BCDC-ECS] findEligibleMethods() resolved')
            console.log('[PayPal-BCDC-ECS] isEligible("basic_cards") =', eligibility.isEligible('basic_cards'))

            if (!eligibility.isEligible('basic_cards')) {
              showResult('BCDC not eligible in this region', 'error')
              return
            }

            var session = await instance.createPayPalGuestOneTimePaymentSession({
              onApprove: function (data) {
                console.log('[PayPal-BCDC-ECS] onApprove fired, orderId =', data.orderId)
                return fetch(urls.captureOrder, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ orderId: data.orderId }),
                })
                  .then(function (r) {
                    console.log('[PayPal-BCDC-ECS] capture response status =', r.status)
                    return r.json()
                  })
                  .then(function (order) {
                    console.log('[PayPal-BCDC-ECS] capture response body =', order)
                    if (order.error) { showResult('✗ ' + order.error, 'error'); return }
                    var capture =
                      order.purchase_units &&
                      order.purchase_units[0] &&
                      order.purchase_units[0].payments &&
                      order.purchase_units[0].payments.captures &&
                      order.purchase_units[0].payments.captures[0]
                    console.log('[PayPal-BCDC-ECS] capture object =', capture)
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
                console.log('[PayPal-BCDC-ECS] onCancel fired')
                showResult('Payment cancelled.', 'error')
              },
              onComplete: function (data) {
                console.log('[PayPal-BCDC-ECS] onComplete fired', data)
              },
              onError: function (err) {
                console.error('[PayPal-BCDC-ECS] onError fired, err =', err)
                showResult('✗ ' + (err.message || String(err)), 'error')
              },
              onWarn: function (data) {
                console.warn('[PayPal-BCDC-ECS] onWarn fired', data)
              },
            })
            console.log('[PayPal-BCDC-ECS] session created =', session)

            var container = clearLoading()
            var cardContainer = document.createElement('paypal-basic-card-container')
            var btn = document.createElement('paypal-basic-card-button')
            cardContainer.appendChild(btn)
            container.appendChild(cardContainer)
            console.log('[PayPal-BCDC-ECS] paypal-basic-card-button appended to container')

            async function handleClick() {
              console.log('[PayPal-BCDC-ECS] payment triggered')
              if (!validateAmount()) return
              console.log('[PayPal-BCDC-ECS] amount valid, calling createOrder...')
              // V6-2: get the promise reference without awaiting
              var orderPromise = fetch(urls.createOrder, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: getAmount(), currency: getCurrency() }),
              })
                .then(function (r) {
                  console.log('[PayPal-BCDC-ECS] createOrder response status =', r.status)
                  return r.json()
                })
                .then(function (d) {
                  console.log('[PayPal-BCDC-ECS] createOrder response body =', d)
                  if (d.error) throw new Error(d.error)
                  return { orderId: d.orderId }
                })
              try {
                await session.start({ presentationMode: 'auto' }, orderPromise)
              } catch (error) {
                console.error('[PayPal-BCDC-ECS] session.start() error:', error)
                showResult('✗ ' + (error.message || String(error)), 'error')
              }
            }

            btn.addEventListener('click', handleClick)
            console.log('[PayPal-BCDC-ECS] click listener attached')
          })
      })
      .catch(function (err) {
        console.error('[PayPal-BCDC-ECS] top-level error =', err)
        showResult('✗ ' + (err.message || String(err)), 'error')
      })
  })
})()
