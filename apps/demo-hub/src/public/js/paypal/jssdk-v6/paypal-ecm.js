;(function () {
  'use strict'

  console.log('[PayPal-ECM] paypal-ecm.js loaded')

  // ── Helpers ────────────────────────────────────────────────────────────────

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
    console.log('[PayPal-ECM] showResult() type=%s text=%s', type, text)
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

  // ── Payment session options ────────────────────────────────────────────────

  var paymentSessionOptions = {
    onApprove: function (data) {
      console.log('[PayPal-ECM] onApprove fired, orderId =', data.orderId)
      var urls = (window.DEMO || {}).urls
      return fetch(urls.captureOrder, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: data.orderId }),
      })
        .then(function (r) {
          console.log('[PayPal-ECM] capture response status =', r.status)
          return r.json()
        })
        .then(function (order) {
          console.log('[PayPal-ECM] capture response body =', order)
          if (order.error) { showResult('✗ ' + order.error, 'error'); return }
          var capture =
            order.purchase_units &&
            order.purchase_units[0] &&
            order.purchase_units[0].payments &&
            order.purchase_units[0].payments.captures &&
            order.purchase_units[0].payments.captures[0]
          console.log('[PayPal-ECM] capture object =', capture)
          if (!capture || capture.status !== 'COMPLETED') {
            showResult('✗ Capture failed · status: ' + (capture ? capture.status : 'unknown'), 'error')
            return
          }
          showResult('✓ Payment captured · Order: ' + order.id, 'success')
        })
    },
    onCancel: function () {
      console.log('[PayPal-ECM] onCancel fired')
      showResult('Payment cancelled.', 'error')
    },
    onError: function (err) {
      console.error('[PayPal-ECM] onError fired, err =', err)
      showResult('✗ ' + (err.message || String(err)), 'error')
    },
  }

  // ── Button setup ───────────────────────────────────────────────────────────

  function configurePayPalButton(sdkInstance) {
    var session = sdkInstance.createPayPalOneTimePaymentSession(paymentSessionOptions)
    console.log('[PayPal-ECM] session created =', session)

    var container = clearLoading()
    var btn = document.createElement('paypal-button')
    container.appendChild(btn)
    console.log('[PayPal-ECM] paypal-button appended to container')

    btn.addEventListener('click', async function () {
      console.log('[PayPal-ECM] paypal-button clicked')
      if (!validateAmount()) return
      console.log('[PayPal-ECM] amount valid, calling createOrder...')
      var urls = (window.DEMO || {}).urls
      var modesToTry = getPresentationModesToTry()
      console.log('[PayPal-ECM] presentationModesToTry =', modesToTry)
      // V6-2: get the promise reference without awaiting — must not await before session.start()
      var orderPromise = fetch(urls.createOrder, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: getAmount(), currency: getCurrency() }),
      })
        .then(function (r) {
          console.log('[PayPal-ECM] createOrder response status =', r.status)
          return r.json()
        })
        .then(function (d) {
          console.log('[PayPal-ECM] createOrder response body =', d)
          if (d.error) throw new Error(d.error)
          return { orderId: d.orderId }
        })
      for (var _i = 0; _i < modesToTry.length; _i++) {
        var presentationMode = modesToTry[_i]
        console.log('[PayPal-ECM] trying presentationMode =', presentationMode)
        try {
          await session.start({ presentationMode: presentationMode }, orderPromise)
          break
        } catch (error) {
          console.log('[PayPal-ECM] session.start() error with mode "' + presentationMode + '":', error)
          if (error.isRecoverable) {
            console.log('[PayPal-ECM] error is recoverable, trying next mode...')
            continue
          }
          showResult('✗ ' + (error.message || String(error)), 'error')
          break
        }
      }
    })
    console.log('[PayPal-ECM] click listener attached to paypal-button')
  }

  // ── SDK init ───────────────────────────────────────────────────────────────

  function onPayPalWebSdkLoaded() {
    console.log('[PayPal-ECM] onPayPalWebSdkLoaded() called')
    console.log('[PayPal-ECM] window.DEMO =', window.DEMO)

    getPPInstance()
      .then(function (instance) {
        console.log('[PayPal-ECM] getPPInstance() resolved, instance =', instance)
        console.log('[PayPal-ECM] calling findEligibleMethods()...')
        return instance.findEligibleMethods()
          .then(function (eligibility) {
            console.log('[PayPal-ECM] findEligibleMethods() resolved')
            console.log('[PayPal-ECM] isEligible("paypal") =', eligibility.isEligible('paypal'))

            if (eligibility.isEligible('paypal')) {
              configurePayPalButton(instance)
            } else {
              showResult('PayPal not eligible in this region', 'error')
            }
          })
      })
      .catch(function (err) {
        console.error('[PayPal-ECM] top-level error =', err)
        showResult('✗ ' + (err.message || String(err)), 'error')
      })
  }

  // ── Currency selector ──────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    console.log('[PayPal-ECM] DOMContentLoaded fired')
    var currSel = document.getElementById('demo-currency')
    if (currSel) {
      currSel.addEventListener('change', function () {
        console.log('[PayPal-ECM] currency changed to', this.value)
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
    console.log('[PayPal-ECM] window.load fired, typeof paypal =', typeof paypal)
    if (typeof paypal === 'undefined') {
      console.error('[PayPal-ECM] PayPal SDK not loaded!')
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }
    onPayPalWebSdkLoaded()
  })
})()
