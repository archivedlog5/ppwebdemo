;(function () {
  'use strict'

  console.log('[Apple-Pay-ECM-v6] applepay-ecm.js loaded')

  var ZERO_DECIMAL = ['JPY', 'KRW', 'TWD', 'CLP', 'IDR']

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getCurrency() {
    var sel = document.getElementById('demo-currency')
    return sel ? sel.value : 'USD'
  }

  function getAmount() {
    var inp = document.getElementById('demo-amount')
    return inp ? inp.value.trim() : (window.DEMO && window.DEMO.defaultAmount) || '100.00'
  }

  function isZeroDecimal(currency) {
    return ZERO_DECIMAL.indexOf(currency) !== -1
  }

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  var MIN_AMOUNT = 1.0
  var MAX_AMOUNT = 30000.0

  function validateAmount() {
    var input = document.getElementById('demo-amount')
    var errEl = document.getElementById('amount-error')
    if (!input) return true
    var val = input.value.trim()
    var num = parseFloat(val)
    var cur = getCurrency()
    var zd  = isZeroDecimal(cur)
    var err = ''
    if (!val || isNaN(num) || !/^\d+(\.\d{1,2})?$/.test(val)) {
      err = 'Please enter a valid number'
    } else if (num < MIN_AMOUNT) {
      err = 'Minimum amount is ' + MIN_AMOUNT.toFixed(zd ? 0 : 2)
    } else if (num > MAX_AMOUNT) {
      err = 'Maximum amount is ' + MAX_AMOUNT.toLocaleString()
    } else if (zd && val.indexOf('.') !== -1 && parseFloat(val) !== Math.round(parseFloat(val))) {
      err = cur + ' does not support decimal amounts'
    }
    if (err) {
      if (errEl) errEl.textContent = err
      input.classList.add('amount-input--error')
      return false
    }
    if (errEl) errEl.textContent = ''
    input.classList.remove('amount-input--error')
    return true
  }

  // ── Debug probe ────────────────────────────────────────────────────────────

  function inspect(label, obj) {
    try {
      console.group('[APPLEPAY-v6-PROBE] ' + label)
      console.log('value:', obj)
      console.dir(obj)
      if (obj && typeof obj === 'object') {
        console.log('own keys     :', Object.keys(obj))
        console.log('own props    :', Object.getOwnPropertyNames(obj))
        var proto = Object.getPrototypeOf(obj)
        console.log('proto        :', proto)
        if (proto) console.log('proto methods:', Object.getOwnPropertyNames(proto))
      }
    } finally { console.groupEnd() }
  }

  // ── Apple Pay: button click handler ────────────────────────────────────────

  function onApplePayClicked(applePaySession, details) {
    console.log('[Apple-Pay-ECM-v6] ===== Apple Pay button clicked =====')

    if (!validateAmount()) {
      console.warn('[Apple-Pay-ECM-v6] amount validation failed — aborting')
      return
    }

    var amount   = getAmount()
    var currency = getCurrency()
    var zd       = isZeroDecimal(currency)
    var value    = zd ? String(Math.round(parseFloat(amount))) : parseFloat(amount).toFixed(2)
    console.log('[Apple-Pay-ECM-v6] amount:', amount, '| currency:', currency, '| value:', value)

    // formatConfigForPaymentRequest returns merchantCapabilities + supportedNetworks (spread in)
    var formattedConfig = applePaySession.formatConfigForPaymentRequest(details.config)
    inspect('formatConfigForPaymentRequest result', formattedConfig)

    var paymentRequest = Object.assign({}, formattedConfig, {
      countryCode:                  'US',
      currencyCode:                 currency,
      requiredBillingContactFields: ['name', 'phone', 'email', 'postalAddress'],
      requiredShippingContactFields: [],
      total: {
        label:  'Total',
        amount: value,
        type:   'final',
      },
    })
    inspect('paymentRequest', paymentRequest)

    var session = new ApplePaySession(4, paymentRequest)

    session.onvalidatemerchant = function (event) {
      console.log('[Apple-Pay-ECM-v6] onvalidatemerchant — validationURL:', event.validationURL)
      inspect('validateMerchant event', event)
      applePaySession.validateMerchant({ validationUrl: event.validationURL })
        .then(function (payload) {
          inspect('validateMerchant response', payload)
          session.completeMerchantValidation(payload.merchantSession)
        })
        .catch(function (err) {
          console.error('[Apple-Pay-ECM-v6] validateMerchant failed:', err)
          session.abort()
          showResult('✗ Merchant validation failed: ' + (err.message || String(err)), 'error')
        })
    }

    session.onpaymentmethodselected = function (event) {
      console.log('[Apple-Pay-ECM-v6] onpaymentmethodselected:', event.paymentMethod)
      session.completePaymentMethodSelection({
        newTotal: { label: 'Total', amount: value, type: 'final' },
      })
    }

    session.onpaymentauthorized = function (event) {
      console.log('[Apple-Pay-ECM-v6] ===== onpaymentauthorized =====')
      inspect('onpaymentauthorized event.payment', event.payment)

      var paymentData    = event.payment
      var token          = paymentData.token
      var billingContact = paymentData.billingContact
      var shippingContact = paymentData.shippingContact || null
      var createdOrderId  = null
      var urls            = (window.DEMO || {}).urls

      fetch(urls.createOrder, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount: amount, currency: currency }),
      })
        .then(function (r) { return r.json() })
        .then(function (d) {
          inspect('createOrder response', d)
          if (d.error) throw new Error(d.error)
          createdOrderId = d.orderId  // v6: lowercase d
          console.log('[Apple-Pay-ECM-v6] orderId:', createdOrderId, '— calling confirmOrder()...')

          return applePaySession.confirmOrder({
            orderId:        createdOrderId,
            token:          token,
            billingContact: billingContact,
            shippingContact: shippingContact,
          })
        })
        .then(function (confirmResult) {
          inspect('confirmOrder result', confirmResult)

          // Defensive: if approveApplePayPayment.status exists, check APPROVED; otherwise rely on capture
          var approveApplePayPayment = confirmResult && confirmResult.approveApplePayPayment
          inspect('approveApplePayPayment', approveApplePayPayment)

          if (approveApplePayPayment && approveApplePayPayment.status) {
            if (approveApplePayPayment.status !== 'APPROVED') {
              throw new Error(
                'Apple Pay not approved · status: ' + approveApplePayPayment.status
              )
            }
          }

          console.log('[Apple-Pay-ECM-v6] confirmed — calling captureOrder...')
          return fetch(urls.captureOrder, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ orderId: createdOrderId }),  // v6: lowercase d
          })
        })
        .then(function (r) { return r.json() })
        .then(function (order) {
          inspect('captureOrder response', order)
          if (order.error) throw new Error(order.error)

          var capture = order.purchase_units &&
                        order.purchase_units[0] &&
                        order.purchase_units[0].payments &&
                        order.purchase_units[0].payments.captures &&
                        order.purchase_units[0].payments.captures[0]
          inspect('capture object', capture)

          if (!capture || capture.status !== 'COMPLETED') {
            var status = capture ? capture.status : 'unknown'
            console.error('[Apple-Pay-ECM-v6] capture NOT COMPLETED — status:', status)
            session.completePayment({ status: ApplePaySession.STATUS_FAILURE })
            showResult('✗ Capture failed · status: ' + status, 'error')
            return
          }

          console.log('[Apple-Pay-ECM-v6] ===== capture COMPLETED ===== orderId:', order.id)
          session.completePayment({ status: ApplePaySession.STATUS_SUCCESS })
          showResult('✓ Payment captured · Order: ' + order.id, 'success')
        })
        .catch(function (err) {
          console.error('[Apple-Pay-ECM-v6] onpaymentauthorized error:', err)
          session.completePayment({ status: ApplePaySession.STATUS_FAILURE })
          showResult('✗ ' + (err.message || String(err)), 'error')
        })
    }

    session.oncancel = function () {
      console.log('[Apple-Pay-ECM-v6] session cancelled by user')
    }

    console.log('[Apple-Pay-ECM-v6] calling session.begin()...')
    session.begin()
  }

  // ── setupApplePayButton ────────────────────────────────────────────────────

  function setupApplePayButton(instance, details) {
    // createApplePayOneTimePaymentSession — per plan: treat as sync first (inspect to confirm)
    var applePaySession = instance.createApplePayOneTimePaymentSession()
    inspect('createApplePayOneTimePaymentSession result', applePaySession)

    var container = document.getElementById('paypal-button-container')
    container.classList.remove('sdk-loading')
    container.innerHTML = ''

    // Official <apple-pay-button> web component
    var applePayBtn = document.createElement('apple-pay-button')
    applePayBtn.setAttribute('buttonstyle', 'black')
    applePayBtn.setAttribute('type', 'buy')
    applePayBtn.setAttribute('locale', 'en')
    applePayBtn.style.width  = '100%'
    applePayBtn.style.height = '44px'
    applePayBtn.addEventListener('click', function () {
      onApplePayClicked(applePaySession, details)
    })
    container.appendChild(applePayBtn)
    console.log('[Apple-Pay-ECM-v6] <apple-pay-button> created and appended')

    // Enable custom button
    var customBtn = document.getElementById('custom-applepay-btn')
    if (customBtn) {
      customBtn.disabled           = false
      customBtn.style.opacity      = '1'
      customBtn.style.cursor       = 'pointer'
      customBtn.style.setProperty('cursor', 'pointer')
      customBtn.addEventListener('mouseenter', function () {
        this.style.background   = 'var(--border)'
        this.style.borderColor  = 'var(--border-hi)'
      })
      customBtn.addEventListener('mouseleave', function () {
        this.style.background   = 'var(--surface2)'
        this.style.borderColor  = 'var(--border-hi)'
      })
      customBtn.addEventListener('mousedown', function () {
        this.style.transform = 'scale(0.98)'
      })
      customBtn.addEventListener('mouseup', function () {
        this.style.transform = 'scale(1)'
      })
      customBtn.addEventListener('click', function () {
        onApplePayClicked(applePaySession, details)
      })
      console.log('[Apple-Pay-ECM-v6] custom button enabled and listeners attached')
    }
  }

  // ── SDK entry ──────────────────────────────────────────────────────────────

  function onPayPalWebSdkLoaded() {
    console.log('[Apple-Pay-ECM-v6] onPayPalWebSdkLoaded()')

    // Browser capability checks before touching SDK
    if (!window.ApplePaySession) {
      console.warn('[Apple-Pay-ECM-v6] ApplePaySession not available (requires Safari on Apple device)')
      document.getElementById('paypal-button-container').classList.remove('sdk-loading')
      document.getElementById('paypal-button-container').innerHTML = ''
      showResult('Apple Pay is not available. Please use Safari on a supported Apple device.', 'error')
      return
    }
    if (!ApplePaySession.supportsVersion(4)) {
      console.warn('[Apple-Pay-ECM-v6] ApplePaySession.supportsVersion(4) = false')
      document.getElementById('paypal-button-container').classList.remove('sdk-loading')
      document.getElementById('paypal-button-container').innerHTML = ''
      showResult('Apple Pay v4 is not supported on this device.', 'error')
      return
    }
    if (!ApplePaySession.canMakePayments()) {
      console.warn('[Apple-Pay-ECM-v6] ApplePaySession.canMakePayments() = false')
      document.getElementById('paypal-button-container').classList.remove('sdk-loading')
      document.getElementById('paypal-button-container').innerHTML = ''
      showResult('Apple Pay is not available — no cards configured in Apple Wallet.', 'error')
      return
    }

    getPPInstance()
      .then(function (instance) {
        inspect('instance', instance)

        // V6-3: nested .then() to keep instance in scope
        return instance.findEligibleMethods({ currencyCode: getCurrency() })
          .then(function (eligibility) {
            inspect('eligibility', eligibility)

            if (!eligibility.isEligible('applepay')) {
              document.getElementById('paypal-button-container').classList.remove('sdk-loading')
              document.getElementById('paypal-button-container').innerHTML = ''
              showResult('Apple Pay is not eligible for this account.', 'error')
              return
            }

            // getDetails is called on eligibility (synchronous), not on instance
            var details = eligibility.getDetails('applepay')
            inspect('getDetails(applepay)', details)
            setupApplePayButton(instance, details)
          })
      })
      .catch(function (err) {
        console.error('[Apple-Pay-ECM-v6] error:', err)
        document.getElementById('paypal-button-container').classList.remove('sdk-loading')
        document.getElementById('paypal-button-container').innerHTML = ''
        showResult('✗ ' + (err.message || String(err)), 'error')
      })
  }

  // ── Currency selector ──────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    var currSel = document.getElementById('demo-currency')
    if (currSel) {
      currSel.addEventListener('change', function () {
        var url = new URL(window.location.href)
        url.searchParams.set('currency', this.value)
        var amt = document.getElementById('demo-amount')
        if (amt) url.searchParams.set('amount', amt.value.trim())
        window.location.replace(url.toString())
      })
    }
  })

  // ── window.load ────────────────────────────────────────────────────────────

  window.addEventListener('load', function () {
    console.log('[Apple-Pay-ECM-v6] window.load, typeof paypal =', typeof paypal)
    if (typeof paypal === 'undefined') {
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }

    var amountInput = document.getElementById('demo-amount')
    if (amountInput) {
      amountInput.addEventListener('blur', function () {
        var num = parseFloat(this.value)
        if (!isNaN(num) && num > 0) {
          this.value = isZeroDecimal(getCurrency()) ? String(Math.round(num)) : num.toFixed(2)
        }
        validateAmount()
      })
    }

    onPayPalWebSdkLoaded()
  })
})()
