;(function () {
  'use strict'

  console.log('[PayPal-ECS] paypal-ecs.js loaded')

  function getCurrency() {
    var sel = document.getElementById('demo-currency')
    return sel ? sel.value : 'USD'
  }

  function getPresentationMode() {
    var sel = document.getElementById('demo-presentation-mode')
    return sel ? sel.value : 'auto'
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
    console.log('[PayPal-ECS] showResult() type=%s text=%s', type, text)
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  // ── Presentation mode descriptions ────────────────────────────────────────

  var PRESENTATION_MODE_DESCRIPTIONS = {
    auto: 'Recommended. SDK automatically selects the best experience — tries popup first, falls back to modal if blocked.',
    'payment-handler': 'Experimental. Uses the browser\'s Payment Handler API for a native sheet experience. Modern browsers only.',
    popup: 'Opens PayPal in a popup window. May be blocked by popup blockers.',
    redirect: 'Full page redirect to PayPal. Recommended for mobile devices. Requires a return URL.',
    modal: 'Creates an iframe overlay on the current page. Recommended only for WebView scenarios.',
  }

  function updatePresentationModeDesc() {
    var desc = document.getElementById('demo-presentation-mode-desc')
    if (!desc) return
    desc.textContent = PRESENTATION_MODE_DESCRIPTIONS[getPresentationMode()] || ''
  }

  var DEFAULT_MODES = ['auto', 'payment-handler', 'popup', 'redirect', 'modal']

  function getPresentationModesToTry() {
    var selected = getPresentationMode()
    if (selected === DEFAULT_MODES[0]) return DEFAULT_MODES.slice()
    return [selected].concat(DEFAULT_MODES.filter(function (m) { return m !== selected }))
  }

  // ── Currency + presentation mode selector ──────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    console.log('[PayPal-ECS] DOMContentLoaded fired')
    var currSel = document.getElementById('demo-currency')
    if (currSel) {
      currSel.addEventListener('change', function () {
        console.log('[PayPal-ECS] currency changed to', this.value)
        var url = new URL(window.location.href)
        url.searchParams.set('currency', this.value)
        var amt = document.getElementById('demo-amount')
        if (amt) url.searchParams.set('amount', amt.value.trim())
        window.location.replace(url.toString())
      })
    }
    var modeSel = document.getElementById('demo-presentation-mode')
    if (modeSel) {
      modeSel.addEventListener('change', updatePresentationModeDesc)
      updatePresentationModeDesc()
    }
  })

  window.addEventListener('load', function () {
    console.log('[PayPal-ECS] window.load fired, typeof paypal =', typeof paypal)
    if (typeof paypal === 'undefined') {
      console.error('[PayPal-ECS] PayPal SDK not loaded!')
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }
    if (typeof window.isBrowserSupportedByPayPal === 'function' && !window.isBrowserSupportedByPayPal()) {
      console.warn('[PayPal-ECS] browser not supported by PayPal')
      showResult('✗ Your browser is not supported by PayPal.', 'error')
      return
    }

    console.log('[PayPal-ECS] window.DEMO =', window.DEMO)
    var urls = (window.DEMO || {}).urls

    getPPInstance()
      .then(function (instance) {
        console.log('[PayPal-ECS] getPPInstance() resolved, instance =', instance)
        console.log('[PayPal-ECS] calling findEligibleMethods()...')
        return instance.findEligibleMethods()
          .then(function (eligibility) {
            console.log('[PayPal-ECS] findEligibleMethods() resolved')
            console.log('[PayPal-ECS] isEligible("paypal") =', eligibility.isEligible('paypal'))

            if (!eligibility.isEligible('paypal')) {
              showResult('PayPal not eligible in this region', 'error')
              return
            }

            var container = clearLoading()
            var btn = document.createElement('paypal-button')
            btn.setAttribute('type', 'pay')
            btn.setAttribute('class', 'paypal-gold')
            container.appendChild(btn)
            console.log('[PayPal-ECS] paypal-button appended to container')

            var session = instance.createPayPalOneTimePaymentSession({
              onApprove: function (data) {
                console.log('[PayPal-ECS] onApprove fired, orderId =', data.orderId)
                return fetch(urls.captureOrder, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ orderId: data.orderId }),
                })
                  .then(function (r) {
                    console.log('[PayPal-ECS] capture response status =', r.status)
                    return r.json()
                  })
                  .then(function (order) {
                    console.log('[PayPal-ECS] capture response body =', order)
                    if (order.error) { showResult('✗ ' + order.error, 'error'); return }
                    var capture =
                      order.purchase_units &&
                      order.purchase_units[0] &&
                      order.purchase_units[0].payments &&
                      order.purchase_units[0].payments.captures &&
                      order.purchase_units[0].payments.captures[0]
                    console.log('[PayPal-ECS] capture object =', capture)
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
                console.log('[PayPal-ECS] onCancel fired')
                showResult('Payment cancelled.', 'error')
              },
              onError: function (err) {
                console.error('[PayPal-ECS] onError fired, err =', err)
                showResult('✗ ' + (err.message || String(err)), 'error')
              },
            })
            console.log('[PayPal-ECS] session created =', session)

            if (session.hasReturned()) {
              console.log('[PayPal-ECS] redirect returned, resuming session...')
              session.resume()
              return
            }

            async function handleClick() {
              console.log('[PayPal-ECS] payment triggered')
              if (!validateAmount()) return
              console.log('[PayPal-ECS] amount valid, calling createOrder...')
              var modesToTry = getPresentationModesToTry()
              console.log('[PayPal-ECS] presentationModesToTry =', modesToTry)
              // V6-2: get the promise reference without awaiting
              var orderPromise = fetch(urls.createOrder, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: getAmount(), currency: getCurrency() }),
              })
                .then(function (r) {
                  console.log('[PayPal-ECS] createOrder response status =', r.status)
                  return r.json()
                })
                .then(function (d) {
                  console.log('[PayPal-ECS] createOrder response body =', d)
                  if (d.error) throw new Error(d.error)
                  return { orderId: d.orderId }
                })
              for (var _i = 0; _i < modesToTry.length; _i++) {
                var presentationMode = modesToTry[_i]
                console.log('[PayPal-ECS] trying presentationMode =', presentationMode)
                try {
                  await session.start({ presentationMode: presentationMode }, orderPromise)
                  break
                } catch (error) {
                  console.log('[PayPal-ECS] session.start() error with mode "' + presentationMode + '":', error)
                  if (error.isRecoverable) {
                    console.log('[PayPal-ECS] error is recoverable, trying next mode...')
                    continue
                  }
                  showResult('✗ ' + (error.message || String(error)), 'error')
                  break
                }
              }
            }

            btn.addEventListener('click', handleClick)

            var wrap = document.getElementById('custom-trigger-wrap')
            var customBtn = document.getElementById('custom-trigger-btn')
            if (wrap && customBtn) {
              wrap.style.display = 'block'
              customBtn.addEventListener('click', handleClick)
              console.log('[PayPal-ECS] custom trigger button activated')
            }

            console.log('[PayPal-ECS] click listeners attached')
          })
      })
      .catch(function (err) {
        console.error('[PayPal-ECS] top-level error =', err)
        showResult('✗ ' + (err.message || String(err)), 'error')
      })
  })
})()
