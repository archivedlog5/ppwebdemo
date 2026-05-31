;(function () {
  'use strict'

  console.log('[Venmo-ECS] venmo-ecs.js loaded')

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
    console.log('[Venmo-ECS] showResult() type=%s text=%s', type, text)
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  var paymentSessionOptions = {
    onApprove: function (data) {
      console.log('[Venmo-ECS] onApprove fired, orderId =', data.orderId)
      var urls = (window.DEMO || {}).urls
      return fetch(urls.captureOrder, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: data.orderId }),
      })
        .then(function (r) {
          console.log('[Venmo-ECS] capture response status =', r.status)
          return r.json()
        })
        .then(function (order) {
          console.log('[Venmo-ECS] capture response body =', order)
          if (order.error) { showResult('✗ ' + order.error, 'error'); return }
          var capture =
            order.purchase_units &&
            order.purchase_units[0] &&
            order.purchase_units[0].payments &&
            order.purchase_units[0].payments.captures &&
            order.purchase_units[0].payments.captures[0]
          console.log('[Venmo-ECS] capture object =', capture)
          if (!capture || capture.status !== 'COMPLETED') {
            showResult('✗ Capture failed · status: ' + (capture ? capture.status : 'unknown'), 'error')
            return
          }
          showResult('✓ Payment captured · Order: ' + order.id, 'success')
        })
    },
    onCancel: function () {
      console.log('[Venmo-ECS] onCancel fired')
      showResult('Payment cancelled.', 'error')
    },
    onError: function (err) {
      console.error('[Venmo-ECS] onError fired, err =', err)
      showResult('✗ ' + (err.message || String(err)), 'error')
    },
  }

  function configureVenmoButton(sdkInstance) {
    var session = sdkInstance.createVenmoOneTimePaymentSession(paymentSessionOptions)
    console.log('[Venmo-ECS] session created =', session)

    var container = clearLoading()
    var btn = document.createElement('venmo-button')
    btn.setAttribute('type', 'pay')
    container.appendChild(btn)
    console.log('[Venmo-ECS] venmo-button appended to container')

    function handleClick() {
      console.log('[Venmo-ECS] payment triggered')
      if (!validateAmount()) return
      var urls = (window.DEMO || {}).urls
      // V6-2: pass Promise reference — must not await before session.start()
      var orderPromise = fetch(urls.createOrder, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: getAmount() }),
      })
        .then(function (r) {
          console.log('[Venmo-ECS] createOrder response status =', r.status)
          return r.json()
        })
        .then(function (d) {
          console.log('[Venmo-ECS] createOrder response body =', d)
          if (d.error) throw new Error(d.error)
          return { orderId: d.orderId }
        })
      session.start({ presentationMode: 'auto' }, orderPromise)
        .catch(function (err) {
          console.error('[Venmo-ECS] session.start() error:', err)
          showResult('✗ ' + (err.message || String(err)), 'error')
        })
    }

    btn.addEventListener('click', handleClick)

    var wrap = document.getElementById('custom-trigger-wrap')
    var customBtn = document.getElementById('custom-trigger-btn')
    if (wrap && customBtn) {
      wrap.style.display = 'block'
      customBtn.addEventListener('click', handleClick)
      console.log('[Venmo-ECS] custom trigger button activated')
    }

    console.log('[Venmo-ECS] click listeners attached')
  }

  function onPayPalWebSdkLoaded() {
    console.log('[Venmo-ECS] onPayPalWebSdkLoaded() called')
    console.log('[Venmo-ECS] window.DEMO =', window.DEMO)

    getPPInstance()
      .then(function (instance) {
        console.log('[Venmo-ECS] getPPInstance() resolved, instance =', instance)
        return instance.findEligibleMethods({ currencyCode: 'USD' })
          .then(function (eligibility) {
            console.log('[Venmo-ECS] findEligibleMethods() resolved')
            console.log('[Venmo-ECS] isEligible("venmo") =', eligibility.isEligible('venmo'))

            if (eligibility.isEligible('venmo')) {
              configureVenmoButton(instance)
            } else {
              showResult('Venmo is not eligible for this session. Use a US sandbox account.', 'error')
            }
          })
      })
      .catch(function (err) {
        console.error('[Venmo-ECS] top-level error =', err)
        showResult('✗ ' + (err.message || String(err)), 'error')
      })
  }

  window.addEventListener('load', function () {
    console.log('[Venmo-ECS] window.load fired, typeof paypal =', typeof paypal)
    if (typeof paypal === 'undefined') {
      console.error('[Venmo-ECS] PayPal SDK not loaded!')
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }
    if (typeof window.isBrowserSupportedByPayPal === 'function' && !window.isBrowserSupportedByPayPal()) {
      console.warn('[Venmo-ECS] browser not supported by PayPal')
      showResult('✗ Your browser is not supported by PayPal.', 'error')
      return
    }
    onPayPalWebSdkLoaded()
  })
})()
