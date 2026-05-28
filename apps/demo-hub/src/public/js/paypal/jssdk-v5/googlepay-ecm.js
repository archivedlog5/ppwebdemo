/**
 * PayPal Google Pay ECM
 * Express Checkout Mark — merchant pre-fills shipping, shippingAddressRequired: false
 *
 * window.DEMO = {
 *   urls: { createOrder, getOrder, captureOrder },
 *   shipping: { name, addressLine1, adminArea2, adminArea1, postalCode, countryCode },
 * }
 */
;(function () {
  'use strict'

  // ─── Constants ──────────────────────────────────────────────────────────────

  var ZERO_DECIMAL = ['JPY', 'KRW', 'TWD', 'CLP', 'IDR']

  var BASE_REQUEST = {
    apiVersion:      2,
    apiVersionMinor: 0,
  }

  // ─── Module-level state ──────────────────────────────────────────────────────

  var paymentsClient  = null   // singleton google.payments.api.PaymentsClient
  var googlepayConfig = null   // cached { allowedPaymentMethods, merchantInfo, apiVersion, ... }
  var currentOrderID  = null
  var urls            = null   // from window.DEMO.urls (set on load)

  // ─── UI helpers ──────────────────────────────────────────────────────────────

  function getCurrency() {
    var sel = document.getElementById('demo-currency')
    return sel ? sel.value : (window.DEMO && window.DEMO.currency) || 'USD'
  }

  function isZeroDecimal(currency) {
    return ZERO_DECIMAL.indexOf(currency) !== -1
  }

  function getSCA() {
    var sel = document.getElementById('demo-sca')
    return sel ? sel.value : 'SCA_WHEN_REQUIRED'
  }

  function getAmount() {
    var input = document.getElementById('demo-amount')
    return input ? input.value.trim() : (window.DEMO && window.DEMO.defaultAmount) || '100.00'
  }

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
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

  // ─── Google Pay: client singleton ────────────────────────────────────────────

  function getGooglePaymentsClient() {
    console.log('[GooglePay ECM] getGooglePaymentsClient() -- inside')
    if (paymentsClient === null) {
      console.log('[GooglePay ECM] paymentsClient is null — creating new PaymentsClient (environment: TEST)...')
      paymentsClient = new google.payments.api.PaymentsClient({
        environment: 'TEST',
      })
      console.log('[GooglePay ECM] paymentsClient created:', paymentsClient)
    } else {
      console.log('[GooglePay ECM] returning cached paymentsClient')
    }
    return paymentsClient
  }

  // ─── Google Pay: config (cached) ─────────────────────────────────────────────

  function getGooglePayConfig() {
    console.log('[GooglePay ECM] getGooglePayConfig() -- inside')
    if (googlepayConfig !== null) {
      console.log('[GooglePay ECM] returning cached googlepayConfig:', googlepayConfig)
      return Promise.resolve(googlepayConfig)
    }
    console.log('[GooglePay ECM] no cached config — calling paypalSDK.Googlepay().config()...')
    return paypalSDK.Googlepay().config()
      .then(function (config) {
        googlepayConfig = config
        console.log('[GooglePay ECM] ===== googlepay.config() response =====')
        console.log('[GooglePay ECM] config:', config)
        console.log('[GooglePay ECM] allowedPaymentMethods:', config.allowedPaymentMethods)
        console.log('[GooglePay ECM] merchantInfo:', config.merchantInfo)
        console.log('[GooglePay ECM] apiVersion:', config.apiVersion, 'apiVersionMinor:', config.apiVersionMinor)
        return config
      })
  }

  // ─── Google Pay: request builders ────────────────────────────────────────────

  function getGoogleIsReadyToPayRequest(config) {
    console.log('[GooglePay ECM] getGoogleIsReadyToPayRequest() -- inside')
    var req = Object.assign({}, BASE_REQUEST, {
      allowedPaymentMethods:         config.allowedPaymentMethods,
      existingPaymentMethodRequired: true,
    })
    console.log('[GooglePay ECM] isReadyToPay request:', req)
    return req
  }

  function getGooglePaymentDataRequest(config, amount, currency) {
    console.log('[GooglePay ECM] getGooglePaymentDataRequest() -- inside')
    var req = Object.assign({}, BASE_REQUEST, {
      allowedPaymentMethods: config.allowedPaymentMethods,
      merchantInfo:          config.merchantInfo,
      transactionInfo: {
        countryCode:      'US',
        currencyCode:     currency,
        totalPriceStatus: 'FINAL',
        totalPrice:       amount,
        totalPriceLabel:  'Total',
      },
      shippingAddressRequired: false,
      emailRequired: true,
    })
    console.log('[GooglePay ECM] paymentDataRequest:', req)
    return req
  }

  // ─── Google Pay: button ───────────────────────────────────────────────────────

  function addGooglePayButton(config) {
    console.log('[GooglePay ECM] addGooglePayButton() -- inside')
    var client    = getGooglePaymentsClient()
    var container = document.getElementById('paypal-button-container')
    container.classList.remove('sdk-loading')
    container.innerHTML = ''

    console.log('[GooglePay ECM] calling createButton() — onClick: onGooglePaymentButtonClicked')
    var btn = client.createButton({
      buttonColor:    'black',
      buttonType:     'pay',
      buttonSizeMode: 'fill',
      onClick:        function () { onGooglePaymentButtonClicked(config) },
    })
    console.log('[GooglePay ECM] button created — appending to container')
    container.appendChild(btn)

    var customBtn = document.getElementById('custom-googlepay-btn')
    if (customBtn) {
      customBtn.disabled = false
      customBtn.style.opacity = '1'
      customBtn.style.cursor = 'pointer'
      customBtn.addEventListener('mouseenter', function () {
        this.style.background = 'var(--border)'
        this.style.borderColor = 'var(--border-hi)'
      })
      customBtn.addEventListener('mouseleave', function () {
        this.style.background = 'var(--surface2)'
        this.style.borderColor = 'var(--border-hi)'
      })
      customBtn.addEventListener('mousedown', function () { this.style.transform = 'scale(0.98)' })
      customBtn.addEventListener('mouseup',   function () { this.style.transform = 'scale(1)' })
      customBtn.addEventListener('click', function () {
        console.log('[GooglePay ECM] custom button clicked — delegating to onGooglePaymentButtonClicked()')
        onGooglePaymentButtonClicked(config)
      })
      console.log('[GooglePay ECM] custom button enabled and listeners attached')
    }
  }

  function onGooglePaymentButtonClicked(config) {
    console.log('[GooglePay ECM] ===== Google Pay button clicked =====')

    if (!validateAmount()) {
      console.warn('[GooglePay ECM] amount validation failed — aborting')
      return
    }

    var amount   = getAmount()
    var currency = getCurrency()
    var sca      = getSCA()
    var shipping = window.DEMO && window.DEMO.shipping
    console.log('[GooglePay ECM] amount:', amount, '| currency:', currency, '| sca:', sca)
    console.log('[GooglePay ECM] shipping (merchant pre-filled):', shipping)

    // ECM flow (with email): sheet first → extract email → create order → process
    // Email is only available after loadPaymentData resolves, so we open the sheet first.
    // Shipping address stays merchant-pre-filled (shippingAddressRequired: false).
    var paymentDataRequest = getGooglePaymentDataRequest(config, amount, currency)
    var client = getGooglePaymentsClient()
    console.log('[GooglePay ECM] calling loadPaymentData() — sheet opens (email only, no address selection)')

    client.loadPaymentData(paymentDataRequest)
      .then(function (paymentData) {
        // Sheet is now closed — email available
        console.log('[GooglePay ECM] ===== loadPaymentData resolved =====')
        console.log('[GooglePay ECM] paymentData:', paymentData)
        var email = paymentData.email || null
        console.log('[GooglePay ECM] email from sheet:', email)

        var createBody = { amount: amount, currency: currency, shipping: shipping, scaMethod: sca, email: email }
        console.log('[GooglePay ECM] calling createOrder API:', urls.createOrder)
        console.log('[GooglePay ECM] createOrder request body:', createBody)

        return fetch(urls.createOrder, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(createBody),
        })
          .then(function (r) { return r.json() })
          .then(function (d) {
            console.log('[GooglePay ECM] ===== createOrder response =====', d)
            if (d.error) throw new Error(d.error)
            currentOrderID = d.id
            console.log('[GooglePay ECM] order created — orderId:', currentOrderID)
            return processPayment(paymentData)
          })
      })
      .catch(function (err) {
        if (err && err.statusCode === 'CANCELED') {
          console.log('[GooglePay ECM] user cancelled Google Pay sheet')
          return
        }
        console.error('[GooglePay ECM] error in button click flow:', err)
        showResult('✗ ' + (err.message || String(err)), 'error')
      })
  }

  // ─── Core payment orchestration ───────────────────────────────────────────────

  function processPayment(paymentData) {
    console.log('[GooglePay ECM] processPayment() -- inside')
    console.log('[GooglePay ECM] calling confirmOrder() — orderId:', currentOrderID)

    return paypalSDK.Googlepay().confirmOrder({
      orderId:           currentOrderID,
      paymentMethodData: paymentData.paymentMethodData,
    })
      .then(function (result) {
        console.log('[GooglePay ECM] ===== confirmOrder() response =====')
        console.log('[GooglePay ECM] result:', result)
        console.log('[GooglePay ECM] status:', result.status)

        if (result.status === 'PAYER_ACTION_REQUIRED') {
          console.log('[GooglePay ECM] PAYER_ACTION_REQUIRED — calling initiatePayerAction()...')
          return paypalSDK.Googlepay().initiatePayerAction({ orderId: currentOrderID })
            .then(function () {
              console.log('[GooglePay ECM] initiatePayerAction() completed — fetching order details for 3DS check...')
              return getOrderDetails(currentOrderID)
            })
            .then(function (order) {
              return handle3DS(order)
            })
        }

        console.log('[GooglePay ECM] status is "' + result.status + '" — calling doCapture() directly')
        return doCapture(currentOrderID)
      })
  }

  // ─── Order details fetch ──────────────────────────────────────────────────────

  function getOrderDetails(orderID) {
    console.log('[GooglePay ECM] getOrderDetails() -- inside, orderID:', orderID)
    var url = urls.getOrder + '/' + orderID
    console.log('[GooglePay ECM] GET', url)
    return fetch(url)
      .then(function (r) { return r.json() })
      .then(function (order) {
        console.log('[GooglePay ECM] ===== getOrderDetails() response =====')
        console.log('[GooglePay ECM] order:', order)
        return order
      })
  }

  // ─── 3DS result handling ──────────────────────────────────────────────────────
  //
  // Google Pay 3DS path differs from ACDC:
  //   payment_source.google_pay.card.authentication_result  (extra layer: google_pay → card)
  // No client-side liabilityShift from SDK — must GET order details and read from API response.

  function handle3DS(order) {
    console.log('[GooglePay ECM] handle3DS() -- inside')

    var authResult = (
      order.payment_source &&
      order.payment_source.google_pay &&
      order.payment_source.google_pay.card &&
      order.payment_source.google_pay.card.authentication_result
    ) || {}
    var threeDS    = authResult.three_d_secure || {}
    var ls         = authResult.liability_shift
    var enrollment = threeDS.enrollment_status
    var authStatus = threeDS.authentication_status

    console.log('[GooglePay ECM] ===== 3DS authentication_result =====')
    console.log('[GooglePay ECM] full authResult:', authResult)
    console.log('[GooglePay ECM] liability_shift:', ls)
    console.log('[GooglePay ECM] enrollment_status:', enrollment)
    console.log('[GooglePay ECM] authentication_status:', authStatus)

    if (ls === 'POSSIBLE') {
      console.log('[GooglePay ECM] 3DS: liability shifted to issuer — proceeding to capture')
      return doCapture(currentOrderID)
    }

    if (ls === 'NO') {
      var notEnrolled = ['N', 'U', 'B']
      if (notEnrolled.indexOf(enrollment) !== -1) {
        console.log('[GooglePay ECM] 3DS: card not enrolled (enrollment: ' + enrollment + ') — proceeding to capture')
        return doCapture(currentOrderID)
      }
      var msg = '3DS rejected · enrollment: ' + enrollment + ' · authStatus: ' + authStatus
      console.error('[GooglePay ECM]', msg)
      showResult('✗ ' + msg, 'error')
      return Promise.reject(new Error(msg))
    }

    if (ls === 'UNKNOWN') {
      console.warn('[GooglePay ECM] 3DS: UNKNOWN liability_shift — please retry')
      showResult('✗ 3DS result unknown · Please retry', 'error')
      return Promise.reject(new Error('3DS unknown'))
    }

    var fallback = '3DS error · liability_shift: ' + (ls || 'undefined')
    console.error('[GooglePay ECM] unhandled 3DS state:', fallback)
    showResult('✗ ' + fallback, 'error')
    return Promise.reject(new Error(fallback))
  }

  // ─── Capture order ────────────────────────────────────────────────────────────

  function doCapture(orderID) {
    console.log('[GooglePay ECM] ===== doCapture() -- orderID:', orderID)
    console.log('[GooglePay ECM] calling captureOrder API:', urls.captureOrder)

    return fetch(urls.captureOrder, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ orderID: orderID }),
    })
      .then(function (r) { return r.json() })
      .then(function (order) {
        console.log('[GooglePay ECM] ===== captureOrder response =====')
        console.log('[GooglePay ECM] response:', order)
        if (order.error) throw new Error(order.error)

        var capture = order.purchase_units &&
                      order.purchase_units[0] &&
                      order.purchase_units[0].payments &&
                      order.purchase_units[0].payments.captures &&
                      order.purchase_units[0].payments.captures[0]
        console.log('[GooglePay ECM] capture object:', capture)

        if (!capture || capture.status !== 'COMPLETED') {
          var status = capture ? capture.status : 'undefined'
          console.error('[GooglePay ECM] capture NOT COMPLETED — status:', status)
          showResult('✗ Capture failed · status: ' + (capture ? capture.status : 'unknown'), 'error')
          return
        }

        console.log('[GooglePay ECM] ===== capture COMPLETED ===== orderId:', order.id)
        showResult('✓ Payment captured · Order: ' + order.id, 'success')
      })
  }

  // ─── Entry point ──────────────────────────────────────────────────────────────

  window.addEventListener('load', function () {
    console.log('[GooglePay ECM] ===== window load =====')

    urls = window.DEMO && window.DEMO.urls
    console.log('[GooglePay ECM] window.DEMO.urls:', urls)
    console.log('[GooglePay ECM] window.DEMO.shipping:', window.DEMO && window.DEMO.shipping)

    if (typeof paypalSDK === 'undefined') {
      console.error('[GooglePay ECM] paypalSDK is undefined — SDK failed to load')
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }
    if (typeof google === 'undefined' || !google.payments) {
      console.error('[GooglePay ECM] google.payments is undefined — Google Pay SDK failed to load')
      showResult('✗ Google Pay SDK failed to load', 'error')
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

    console.log('[GooglePay ECM] calling getGooglePayConfig()...')
    getGooglePayConfig()
      .then(function (config) {
        var client          = getGooglePaymentsClient()
        var isReadyToPayReq = getGoogleIsReadyToPayRequest(config)
        console.log('[GooglePay ECM] calling isReadyToPay()...')
        return client.isReadyToPay(isReadyToPayReq)
          .then(function (resp) {
            console.log('[GooglePay ECM] ===== isReadyToPay() response =====')
            console.log('[GooglePay ECM] response:', resp)
            if (!resp.result) {
              console.warn('[GooglePay ECM] Google Pay not available on this device/account')
              var container = document.getElementById('paypal-button-container')
              container.classList.remove('sdk-loading')
              container.innerHTML = ''
              showResult('Google Pay is not available on this device or account.', 'error')
              return
            }
            console.log('[GooglePay ECM] isReadyToPay: true — calling addGooglePayButton()...')
            addGooglePayButton(config)
          })
      })
      .catch(function (err) {
        var container = document.getElementById('paypal-button-container')
        if (container) {
          container.classList.remove('sdk-loading')
          container.innerHTML = ''
        }
        console.error('[GooglePay ECM] config/init error:', err)
        showResult('✗ Google Pay config error: ' + (err.message || String(err)), 'error')
      })
  })
})()
