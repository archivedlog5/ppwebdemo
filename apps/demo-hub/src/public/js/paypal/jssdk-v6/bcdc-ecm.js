;(function () {
  'use strict'

  console.log('[PayPal-BCDC-ECM] bcdc-ecm.js loaded')

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
    console.log('[PayPal-BCDC-ECM] showResult() type=%s text=%s', type, text)
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  // ── Payment session options ────────────────────────────────────────────────

  var paymentSessionOptions = {
    onApprove: function (data) {
      console.log('[PayPal-BCDC-ECM] onApprove fired, orderId =', data.orderId)
      var urls = (window.DEMO || {}).urls
      return fetch(urls.captureOrder, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: data.orderId }),
      })
        .then(function (r) {
          console.log('[PayPal-BCDC-ECM] capture response status =', r.status)
          return r.json()
        })
        .then(function (order) {
          console.log('[PayPal-BCDC-ECM] capture response body =', order)
          if (order.error) { showResult('✗ ' + order.error, 'error'); return }
          var capture =
            order.purchase_units &&
            order.purchase_units[0] &&
            order.purchase_units[0].payments &&
            order.purchase_units[0].payments.captures &&
            order.purchase_units[0].payments.captures[0]
          console.log('[PayPal-BCDC-ECM] capture object =', capture)
          if (!capture || capture.status !== 'COMPLETED') {
            showResult('✗ Capture failed · status: ' + (capture ? capture.status : 'unknown'), 'error')
            return
          }
          showResult('✓ Payment captured · Order: ' + order.id, 'success')
        })
    },
    onCancel: function () {
      console.log('[PayPal-BCDC-ECM] onCancel fired')
      showResult('Payment cancelled.', 'error')
    },
    onComplete: function (data) {
      console.log('[PayPal-BCDC-ECM] onComplete fired', data)
    },
    onError: function (err) {
      console.error('[PayPal-BCDC-ECM] onError fired, err =', err)
      showResult('✗ ' + (err.message || String(err)), 'error')
    },
    onWarn: function (data) {
      console.warn('[PayPal-BCDC-ECM] onWarn fired', data)
    },
  }

  // ── Button setup ───────────────────────────────────────────────────────────

  async function configurePayPalButton(sdkInstance) {
    var session = await sdkInstance.createPayPalGuestOneTimePaymentSession(paymentSessionOptions)
    console.log('[PayPal-BCDC-ECM] session created =', session)

    var container = clearLoading()
    var cardContainer = document.createElement('paypal-basic-card-container')
    var btn = document.createElement('paypal-basic-card-button')
    cardContainer.appendChild(btn)
    container.appendChild(cardContainer)
    console.log('[PayPal-BCDC-ECM] paypal-basic-card-button appended to container')

    async function handleClick() {
      console.log('[PayPal-BCDC-ECM] payment triggered')
      if (!validateAmount()) return
      console.log('[PayPal-BCDC-ECM] amount valid, calling createOrder...')
      var urls = (window.DEMO || {}).urls
      // V6-2: get the promise reference without awaiting — must not await before session.start()
      var orderPromise = fetch(urls.createOrder, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: getAmount(), currency: getCurrency() }),
      })
        .then(function (r) {
          console.log('[PayPal-BCDC-ECM] createOrder response status =', r.status)
          return r.json()
        })
        .then(function (d) {
          console.log('[PayPal-BCDC-ECM] createOrder response body =', d)
          if (d.error) throw new Error(d.error)
          return { orderId: d.orderId }
        })
      try {
        await session.start({ presentationMode: 'auto' }, orderPromise)
      } catch (error) {
        console.error('[PayPal-BCDC-ECM] session.start() error:', error)
        showResult('✗ ' + (error.message || String(error)), 'error')
      }
    }

    btn.addEventListener('click', handleClick)
    console.log('[PayPal-BCDC-ECM] click listener attached')
  }

  // ── SDK init ───────────────────────────────────────────────────────────────

  function onPayPalWebSdkLoaded() {
    console.log('[PayPal-BCDC-ECM] onPayPalWebSdkLoaded() called')
    console.log('[PayPal-BCDC-ECM] window.DEMO =', window.DEMO)

    getPPInstance()
      .then(function (instance) {
        console.log('[PayPal-BCDC-ECM] getPPInstance() resolved, instance =', instance)
        console.log('[PayPal-BCDC-ECM] calling findEligibleMethods()...')
        return instance.findEligibleMethods({ currencyCode: getCurrency() })
          .then(function (eligibility) {
            console.log('[PayPal-BCDC-ECM] findEligibleMethods() resolved')
            console.log('[PayPal-BCDC-ECM] isEligible("basic_cards") =', eligibility.isEligible('basic_cards'))

            if (eligibility.isEligible('basic_cards')) {
              return configurePayPalButton(instance)
            } else {
              showResult('BCDC not eligible in this region', 'error')
            }
          })
      })
      .catch(function (err) {
        console.error('[PayPal-BCDC-ECM] top-level error =', err)
        showResult('✗ ' + (err.message || String(err)), 'error')
      })
  }

  // ── Currency selector ──────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    console.log('[PayPal-BCDC-ECM] DOMContentLoaded fired')
    var currSel = document.getElementById('demo-currency')
    if (currSel) {
      currSel.addEventListener('change', function () {
        console.log('[PayPal-BCDC-ECM] currency changed to', this.value)
        var url = new URL(window.location.href)
        url.searchParams.set('currency', this.value)
        var amt = document.getElementById('demo-amount')
        if (amt) url.searchParams.set('amount', amt.value.trim())
        window.location.replace(url.toString())
      })
    }
  })

  window.addEventListener('load', function () {
    console.log('[PayPal-BCDC-ECM] window.load fired, typeof paypal =', typeof paypal)
    if (typeof paypal === 'undefined') {
      console.error('[PayPal-BCDC-ECM] PayPal SDK not loaded!')
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }
    if (typeof window.isBrowserSupportedByPayPal === 'function' && !window.isBrowserSupportedByPayPal()) {
      console.warn('[PayPal-BCDC-ECM] browser not supported by PayPal')
      showResult('✗ Your browser is not supported by PayPal.', 'error')
      return
    }
    onPayPalWebSdkLoaded()
  })
})()
