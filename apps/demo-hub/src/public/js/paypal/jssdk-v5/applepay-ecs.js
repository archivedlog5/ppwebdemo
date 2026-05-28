/**
 * PayPal Apple Pay ECS
 * Express Checkout Shortcut — buyer selects shipping address, email, phone, shipping method inside Apple Pay sheet
 *
 * Key differences from ECM:
 *   - requiredShippingContactFields added
 *   - shippingMethods array in paymentRequest
 *   - onshippingmethodselected + onshippingcontactselected handlers
 *   - shippingContact extracted in onpaymentauthorized → sent to create-order
 *   - payment_source.apple_pay includes name/email/phone from shippingContact
 *
 * window.DEMO = {
 *   urls: { createOrder, captureOrder },
 * }
 */
;(function () {
  'use strict'

  // ─── Constants ──────────────────────────────────────────────────────────────

  var ZERO_DECIMAL = ['JPY', 'KRW', 'TWD', 'CLP', 'IDR']

  var SHIPPING_METHODS = [
    { label: 'Standard Shipping', amount: '5.00',  detail: 'Arrives in 5–7 days', identifier: 'standard' },
    { label: 'Express Shipping',  amount: '10.00', detail: 'Arrives in 2–3 days', identifier: 'express'  },
  ]

  // ─── Module-level state ──────────────────────────────────────────────────────

  var applepayInstance = null
  var applepayConfig   = null
  var urls             = null
  var chosenShipping   = SHIPPING_METHODS[0]   // reset at each button click

  // ─── UI helpers ──────────────────────────────────────────────────────────────

  function getCurrency() {
    var sel = document.getElementById('demo-currency')
    return sel ? sel.value : (window.DEMO && window.DEMO.currency) || 'USD'
  }

  function isZeroDecimal(currency) {
    return ZERO_DECIMAL.indexOf(currency) !== -1
  }

  function getAmount() {
    var input = document.getElementById('demo-amount')
    return input ? input.value.trim() : (window.DEMO && window.DEMO.defaultAmount) || '100.00'
  }

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className  = 'result-msg ' + type
    el.textContent = text
  }

  function clearLoading() {
    var container = document.getElementById('paypal-button-container')
    if (container) {
      container.classList.remove('sdk-loading')
      container.innerHTML = ''
    }
  }

  var MIN_AMOUNT = 1.00
  var MAX_AMOUNT = 30000.00

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

  // ─── Currency selector ────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    var currencySel = document.getElementById('demo-currency')
    if (!currencySel) return
    currencySel.addEventListener('change', function () {
      var amtInput = document.getElementById('demo-amount')
      var url = new URL(window.location.href)
      url.searchParams.set('currency', this.value)
      if (amtInput) url.searchParams.set('amount', amtInput.value.trim())
      window.location.replace(url.toString())
    })
  })

  // ─── Contact normalizer ───────────────────────────────────────────────────────
  // Apple Pay may return phoneNumber in E.164 ("+14089741010"). PayPal's confirmOrder
  // maps it to national_number and rejects the leading "+". Strip it here.

  function normalizeContact(contact) {
    if (!contact || !contact.phoneNumber) return contact
    var phone = String(contact.phoneNumber)
    if (phone.charAt(0) !== '+') return contact
    var copy = {}
    for (var k in contact) { if (Object.prototype.hasOwnProperty.call(contact, k)) copy[k] = contact[k] }
    copy.phoneNumber = phone.replace(/\D/g, '')
    return copy
  }

  // ─── Amount helpers ───────────────────────────────────────────────────────────

  function fmtAmt(raw, zd) {
    return zd ? String(Math.round(parseFloat(raw))) : parseFloat(raw).toFixed(2)
  }

  function calcTotal(itemVal, shipping, zd) {
    return zd
      ? String(Math.round(parseFloat(itemVal) + parseFloat(shipping.amount)))
      : (parseFloat(itemVal) + parseFloat(shipping.amount)).toFixed(2)
  }

  // ─── Apple Pay: setup ─────────────────────────────────────────────────────────

  function setupApplepay() {
    console.log('[Apple Pay ECS] setupApplepay()')

    if (!window.ApplePaySession) {
      console.warn('[Apple Pay ECS] ApplePaySession not available (requires Safari on Apple device)')
      clearLoading()
      showResult('Apple Pay is not available. Please use Safari on a supported Apple device.', 'error')
      return
    }

    if (!ApplePaySession.supportsVersion(4)) {
      console.warn('[Apple Pay ECS] ApplePaySession.supportsVersion(4) = false')
      clearLoading()
      showResult('Apple Pay v4 is not supported on this device.', 'error')
      return
    }

    if (!ApplePaySession.canMakePayments()) {
      console.warn('[Apple Pay ECS] ApplePaySession.canMakePayments() = false')
      clearLoading()
      showResult('Apple Pay is not available — no cards configured in Apple Wallet.', 'error')
      return
    }

    if (typeof paypalSDK === 'undefined' || !paypalSDK.Applepay) {
      console.error('[Apple Pay ECS] paypalSDK.Applepay is not available')
      clearLoading()
      showResult('✗ PayPal Apple Pay SDK not loaded', 'error')
      return
    }

    console.log('[Apple Pay ECS] Apple Pay available — calling paypalSDK.Applepay().config()...')
    applepayInstance = paypalSDK.Applepay()

    applepayInstance.config()
      .then(function (config) {
        applepayConfig = config
        console.log('[Apple Pay ECS] config:', config)

        clearLoading()

        // Create <apple-pay-button> web component
        var container   = document.getElementById('paypal-button-container')
        var applePayBtn = document.createElement('apple-pay-button')
        applePayBtn.setAttribute('buttonstyle', 'black')
        applePayBtn.setAttribute('type', 'buy')
        applePayBtn.setAttribute('locale', 'en')
        applePayBtn.style.width  = '100%'
        applePayBtn.style.height = '44px'
        applePayBtn.addEventListener('click', onApplePayButtonClicked)
        container.appendChild(applePayBtn)
        console.log('[Apple Pay ECS] <apple-pay-button> created')

        // Enable custom button
        var customBtn = document.getElementById('custom-applepay-btn')
        if (customBtn) {
          customBtn.disabled    = false
          customBtn.style.opacity = '1'
          customBtn.style.cursor  = 'pointer'
          customBtn.addEventListener('mouseenter', function () {
            this.style.background  = 'var(--border)'
            this.style.borderColor = 'var(--border-hi)'
          })
          customBtn.addEventListener('mouseleave', function () {
            this.style.background  = 'var(--surface2)'
            this.style.borderColor = 'var(--border-hi)'
          })
          customBtn.addEventListener('mousedown', function () { this.style.transform = 'scale(0.98)' })
          customBtn.addEventListener('mouseup',   function () { this.style.transform = 'scale(1)' })
          customBtn.addEventListener('click', onApplePayButtonClicked)
          console.log('[Apple Pay ECS] custom button enabled')
        }
      })
      .catch(function (err) {
        clearLoading()
        console.error('[Apple Pay ECS] config error:', err)
        showResult('✗ Apple Pay config error: ' + (err.message || String(err)), 'error')
      })
  }

  // ─── Apple Pay: button click ──────────────────────────────────────────────────

  function onApplePayButtonClicked() {
    console.log('[Apple Pay ECS] ===== Apple Pay button clicked =====')

    if (!validateAmount()) {
      console.warn('[Apple Pay ECS] amount validation failed — aborting')
      return
    }

    var amount   = getAmount()
    var currency = getCurrency()
    var zd       = isZeroDecimal(currency)
    var value    = fmtAmt(amount, zd)
    chosenShipping = SHIPPING_METHODS[0]   // reset to standard on each click
    console.log('[Apple Pay ECS] amount:', amount, '| currency:', currency, '| value:', value)

    var paymentRequest = {
      countryCode:          applepayConfig.countryCode,
      currencyCode:         currency,
      merchantCapabilities: applepayConfig.merchantCapabilities,
      supportedNetworks:    applepayConfig.supportedNetworks,
      requiredBillingContactFields:  ['name', 'phone', 'email', 'postalAddress'],
      requiredShippingContactFields: ['name', 'phone', 'email', 'postalAddress'],
      shippingType: 'shipping',
      shippingMethods: SHIPPING_METHODS.map(function (m) {
        return { label: m.label, amount: fmtAmt(m.amount, zd), detail: m.detail, identifier: m.identifier }
      }),
      lineItems: [
        { label: 'Item Total',              amount: value,                           type: 'final' },
        { label: chosenShipping.label,      amount: fmtAmt(chosenShipping.amount, zd), type: 'final' },
      ],
      total: { label: 'Total', amount: calcTotal(value, chosenShipping, zd), type: 'final' },
    }
    console.log('[Apple Pay ECS] paymentRequest:', paymentRequest)

    var session = new ApplePaySession(4, paymentRequest)

    // ── onvalidatemerchant ───────────────────────────────────────────────────
    session.onvalidatemerchant = function (event) {
      console.log('[Apple Pay ECS] onvalidatemerchant — validationURL:', event.validationURL)
      applepayInstance.validateMerchant({ validationUrl: event.validationURL })
        .then(function (payload) {
          console.log('[Apple Pay ECS] validateMerchant success:', payload)
          session.completeMerchantValidation(payload.merchantSession)
        })
        .catch(function (err) {
          console.error('[Apple Pay ECS] validateMerchant failed:', err)
          session.abort()
          showResult('✗ Merchant validation failed: ' + (err.message || String(err)), 'error')
        })
    }

    // ── onpaymentmethodselected ──────────────────────────────────────────────
    session.onpaymentmethodselected = function (event) {
      console.log('[Apple Pay ECS] onpaymentmethodselected:', event.paymentMethod)
      session.completePaymentMethodSelection({
        newTotal: { label: 'Total', amount: calcTotal(value, chosenShipping, zd), type: 'final' },
      })
    }

    // ── onshippingcontactselected ────────────────────────────────────────────
    session.onshippingcontactselected = function (event) {
      console.log('[Apple Pay ECS] onshippingcontactselected:', event.shippingContact)
      // In this demo we do not recalculate based on address; just confirm current totals
      session.completeShippingContactSelection({
        newTotal:     { label: 'Total', amount: calcTotal(value, chosenShipping, zd), type: 'final' },
        newLineItems: [
          { label: 'Item Total',         amount: value,                              type: 'final' },
          { label: chosenShipping.label, amount: fmtAmt(chosenShipping.amount, zd), type: 'final' },
        ],
      })
    }

    // ── onshippingmethodselected ─────────────────────────────────────────────
    session.onshippingmethodselected = function (event) {
      console.log('[Apple Pay ECS] onshippingmethodselected:', event.shippingMethod)
      var selected = null
      for (var i = 0; i < SHIPPING_METHODS.length; i++) {
        if (SHIPPING_METHODS[i].identifier === event.shippingMethod.identifier) {
          selected = SHIPPING_METHODS[i]; break
        }
      }
      chosenShipping = selected || SHIPPING_METHODS[0]
      console.log('[Apple Pay ECS] chosen shipping:', chosenShipping)
      session.completeShippingMethodSelection({
        newTotal:     { label: 'Total', amount: calcTotal(value, chosenShipping, zd), type: 'final' },
        newLineItems: [
          { label: 'Item Total',         amount: value,                              type: 'final' },
          { label: chosenShipping.label, amount: fmtAmt(chosenShipping.amount, zd), type: 'final' },
        ],
      })
    }

    // ── onpaymentauthorized ──────────────────────────────────────────────────
    session.onpaymentauthorized = function (event) {
      console.log('[Apple Pay ECS] ===== onpaymentauthorized =====')
      console.log('[Apple Pay ECS] event.payment:', event.payment)

      var paymentData     = event.payment
      var token           = paymentData.token
      var billingContact  = paymentData.billingContact
      var shippingContact = paymentData.shippingContact
      var createdOrderId  = null

      console.log('[Apple Pay ECS] shippingContact:', shippingContact)
      console.log('[Apple Pay ECS] billingContact:', billingContact)
      console.log('[Apple Pay ECS] chosenShipping:', chosenShipping)

      // ECS flow: create order (with shippingContact + shipping amount) → confirmOrder → capture
      fetch(urls.createOrder, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount:          value,
          currency:        currency,
          shippingContact: shippingContact,
          billingContact:  billingContact,
          shippingAmount:  chosenShipping.amount,
        }),
      })
        .then(function (r) { return r.json() })
        .then(function (d) {
          console.log('[Apple Pay ECS] ===== createOrder response =====', d)
          if (d.error) throw new Error(d.error)
          createdOrderId = d.id
          console.log('[Apple Pay ECS] orderId:', createdOrderId, '— calling confirmOrder()...')

          return applepayInstance.confirmOrder({
            orderId:         createdOrderId,
            token:           token,
            billingContact:  normalizeContact(billingContact),
            shippingContact: normalizeContact(shippingContact),
          })
        })
        .then(function (confirmResult) {
          console.log('[Apple Pay ECS] ===== confirmOrder() response =====', confirmResult)
          var approveApplePayPayment = confirmResult && confirmResult.approveApplePayPayment
          console.log('[Apple Pay ECS] approveApplePayPayment:', approveApplePayPayment)

          if (!approveApplePayPayment || approveApplePayPayment.status !== 'APPROVED') {
            throw new Error('Apple Pay not approved · status: ' + (approveApplePayPayment ? approveApplePayPayment.status : 'undefined'))
          }

          console.log('[Apple Pay ECS] approved — calling captureOrder...')
          return fetch(urls.captureOrder, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ orderID: createdOrderId }),
          })
        })
        .then(function (r) { return r.json() })
        .then(function (order) {
          console.log('[Apple Pay ECS] ===== captureOrder response =====', order)
          if (order.error) throw new Error(order.error)

          var capture = order.purchase_units &&
                        order.purchase_units[0] &&
                        order.purchase_units[0].payments &&
                        order.purchase_units[0].payments.captures &&
                        order.purchase_units[0].payments.captures[0]
          console.log('[Apple Pay ECS] capture:', capture)

          if (!capture || capture.status !== 'COMPLETED') {
            var status = capture ? capture.status : 'undefined'
            console.error('[Apple Pay ECS] capture NOT COMPLETED — status:', status)
            session.completePayment({ status: ApplePaySession.STATUS_FAILURE })
            showResult('✗ Capture failed · status: ' + status, 'error')
            return
          }

          console.log('[Apple Pay ECS] ===== capture COMPLETED ===== orderId:', order.id)
          session.completePayment({ status: ApplePaySession.STATUS_SUCCESS })
          showResult('✓ Payment captured · Order: ' + order.id, 'success')
        })
        .catch(function (err) {
          console.error('[Apple Pay ECS] onpaymentauthorized error:', err)
          session.completePayment({ status: ApplePaySession.STATUS_FAILURE })
          showResult('✗ ' + (err.message || String(err)), 'error')
        })
    }

    session.oncancel = function () {
      console.log('[Apple Pay ECS] session cancelled')
    }

    session.begin()
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────

  window.addEventListener('load', function () {
    urls = window.DEMO && window.DEMO.urls

    if (typeof paypalSDK === 'undefined') {
      showResult('✗ PayPal SDK failed to load', 'error'); return
    }
    setupApplepay()
  })
})()
