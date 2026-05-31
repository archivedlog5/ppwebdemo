;(function () {
  'use strict'

  console.log('[PayLater-ECM] paylater-ecm.js loaded')

  // ── Helpers ────────────────────────────────────────────────────────────────

  var COUNTRY_TO_CURRENCY = {
    US: 'USD',
    AU: 'AUD',
    IT: 'EUR',
    ES: 'EUR',
    FR: 'EUR',
    GB: 'GBP',
    CA: 'CAD',
  }

  function getCurrency() {
    var sel = document.getElementById('demo-country')
    return COUNTRY_TO_CURRENCY[sel ? sel.value : 'US'] || 'USD'
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
    console.log('[PayLater-ECM] showResult() type=%s text=%s', type, text)
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
      console.log('[PayLater-ECM] onApprove fired, orderId =', data.orderId)
      var urls = (window.DEMO || {}).urls
      return fetch(urls.captureOrder, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: data.orderId }),
      })
        .then(function (r) {
          console.log('[PayLater-ECM] capture response status =', r.status)
          return r.json()
        })
        .then(function (order) {
          console.log('[PayLater-ECM] capture response body =', order)
          if (order.error) { showResult('✗ ' + order.error, 'error'); return }
          var capture =
            order.purchase_units &&
            order.purchase_units[0] &&
            order.purchase_units[0].payments &&
            order.purchase_units[0].payments.captures &&
            order.purchase_units[0].payments.captures[0]
          console.log('[PayLater-ECM] capture object =', capture)
          if (!capture || capture.status !== 'COMPLETED') {
            showResult('✗ Capture failed · status: ' + (capture ? capture.status : 'unknown'), 'error')
            return
          }
          showResult('✓ Payment captured · Order: ' + order.id, 'success')
        })
    },
    onCancel: function () {
      console.log('[PayLater-ECM] onCancel fired')
      showResult('Payment cancelled.', 'error')
    },
    onError: function (err) {
      console.error('[PayLater-ECM] onError fired, err =', err)
      showResult('✗ ' + (err.message || String(err)), 'error')
    },
  }

  // ── Button setup ───────────────────────────────────────────────────────────

  function configurePayLaterButton(sdkInstance, paylaterDetails) {
    var session = sdkInstance.createPayLaterOneTimePaymentSession(paymentSessionOptions)
    console.log('[PayLater-ECM] session created =', session)

    if (session.hasReturned()) {
      console.log('[PayLater-ECM] redirect returned, resuming session...')
      session.resume()
      return
    }

    var container = clearLoading()
    var btn = document.createElement('paypal-pay-later-button')
    btn.productCode = paylaterDetails.productCode
    btn.countryCode = paylaterDetails.countryCode
    container.appendChild(btn)
    console.log('[PayLater-ECM] paypal-pay-later-button appended, productCode=%s countryCode=%s', paylaterDetails.productCode, paylaterDetails.countryCode)

    async function handleClick() {
      console.log('[PayLater-ECM] payment triggered')
      if (!validateAmount()) return
      console.log('[PayLater-ECM] amount valid, calling createOrder...')
      var urls = (window.DEMO || {}).urls
      var modesToTry = getPresentationModesToTry()
      console.log('[PayLater-ECM] presentationModesToTry =', modesToTry)
      // V6-2: get the promise reference without awaiting — must not await before session.start()
      var orderPromise = fetch(urls.createOrder, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: getAmount(), currency: getCurrency() }),
      })
        .then(function (r) {
          console.log('[PayLater-ECM] createOrder response status =', r.status)
          return r.json()
        })
        .then(function (d) {
          console.log('[PayLater-ECM] createOrder response body =', d)
          if (d.error) throw new Error(d.error)
          return { orderId: d.orderId }
        })
      for (var _i = 0; _i < modesToTry.length; _i++) {
        var presentationMode = modesToTry[_i]
        console.log('[PayLater-ECM] trying presentationMode =', presentationMode)
        try {
          await session.start({ presentationMode: presentationMode }, orderPromise)
          break
        } catch (error) {
          console.log('[PayLater-ECM] session.start() error with mode "' + presentationMode + '":', error)
          if (error.isRecoverable) {
            console.log('[PayLater-ECM] error is recoverable, trying next mode...')
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
      console.log('[PayLater-ECM] custom trigger button activated')
    }

    console.log('[PayLater-ECM] click listeners attached')
  }

  // ── SDK init ───────────────────────────────────────────────────────────────

  function onPayPalWebSdkLoaded() {
    console.log('[PayLater-ECM] onPayPalWebSdkLoaded() called')
    console.log('[PayLater-ECM] window.DEMO =', window.DEMO)

    getPPInstance()
      .then(function (instance) {
        console.log('[PayLater-ECM] getPPInstance() resolved, instance =', instance)
        console.log('[PayLater-ECM] calling findEligibleMethods()...')
        return instance.findEligibleMethods({ currencyCode: getCurrency() })
          .then(function (eligibility) {
            console.log('[PayLater-ECM] findEligibleMethods() resolved')
            console.log('[PayLater-ECM] isEligible("paylater") =', eligibility.isEligible('paylater'))

            if (eligibility.isEligible('paylater')) {
              var paylaterDetails = eligibility.getDetails('paylater')
              console.log('[PayLater-ECM] paylater details =', paylaterDetails)
              configurePayLaterButton(instance, paylaterDetails)
            } else {
              showResult('Pay Later not eligible in this region', 'error')
            }
          })
      })
      .catch(function (err) {
        console.error('[PayLater-ECM] top-level error =', err)
        showResult('✗ ' + (err.message || String(err)), 'error')
      })
  }

  // ── Currency selector ──────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    console.log('[PayLater-ECM] DOMContentLoaded fired')
    var countrySel = document.getElementById('demo-country')
    if (countrySel) {
      countrySel.addEventListener('change', function () {
        console.log('[PayLater-ECM] country changed to', this.value)
        var url = new URL(window.location.href)
        url.searchParams.set('country', this.value)
        url.searchParams.set('currency', COUNTRY_TO_CURRENCY[this.value] || 'USD')
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
    console.log('[PayLater-ECM] window.load fired, typeof paypal =', typeof paypal)
    if (typeof paypal === 'undefined') {
      console.error('[PayLater-ECM] PayPal SDK not loaded!')
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }
    if (typeof window.isBrowserSupportedByPayPal === 'function' && !window.isBrowserSupportedByPayPal()) {
      console.warn('[PayLater-ECM] browser not supported by PayPal')
      showResult('✗ Your browser is not supported by PayPal.', 'error')
      return
    }
    onPayPalWebSdkLoaded()
  })
})()
