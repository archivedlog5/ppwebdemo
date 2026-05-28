/**
 * PayPal Google Pay ECS
 * Express Checkout Shortcut — buyer selects shipping, email, phone inside the Google Pay sheet.
 * Order is created AFTER loadPaymentData resolves (using buyer-selected address).
 *
 * Key differences from ECM:
 *   - shippingAddressRequired: true, emailRequired: true, phoneNumberRequired: true
 *   - Order created AFTER sheet closes (not before)
 *   - shippingAddress, email, phoneNumber extracted from paymentData and sent to create-order
 *
 * window.DEMO = {
 *   urls: { createOrder, getOrder, captureOrder },
 * }
 */
;(function () {
  'use strict'

  // ─── Constants ──────────────────────────────────────────────────────────────

  var ZERO_DECIMAL = ['JPY', 'KRW', 'TWD', 'CLP', 'IDR']

  // ISO 3166-1 alpha-2 → calling code (covers our currency list + common countries)
  var COUNTRY_DIAL = {
    AE: '971', AU: '61',  BR: '55',  CA: '1',   CH: '41',  CL: '56',
    CN: '86',  CO: '57',  CZ: '420', DK: '45',  DE: '49',  FR: '33',
    GB: '44',  HK: '852', HU: '36',  ID: '62',  IL: '972', IN: '91',
    JP: '81',  KR: '82',  MX: '52',  MY: '60',  NO: '47',  NZ: '64',
    PE: '51',  PH: '63',  PL: '48',  SA: '966', SE: '46',  SG: '65',
    TH: '66',  TW: '886', UY: '598', US: '1',
  }

  // Google Pay returns phoneNumber in E.164 (e.g. "+14155552671").
  // PayPal wants { country_code: '1', national_number: '4155552671' }.
  // Strategy: strip non-digits → use isoCountry to look up dial code → remove prefix.
  function parsePhoneNumber(rawPhone, isoCountry) {
    if (!rawPhone) return null
    var digits = rawPhone.replace(/\D/g, '')
    if (!digits) return null
    var dialCode = COUNTRY_DIAL[isoCountry] || ''
    if (dialCode && digits.indexOf(dialCode) === 0) {
      return { country_code: dialCode, national_number: digits.slice(dialCode.length) }
    }
    return { country_code: dialCode, national_number: digits }
  }

  var BASE_REQUEST = {
    apiVersion: 2,
    apiVersionMinor: 0,
  }

  // ─── Module-level state ──────────────────────────────────────────────────────

  var paymentsClient = null
  var googlepayConfig = null
  var currentOrderID = null
  var urls = null

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

  var MIN_AMOUNT = 1.0
  var MAX_AMOUNT = 30000.0

  function validateAmount() {
    var input = document.getElementById('demo-amount')
    var errEl = document.getElementById('amount-error')
    if (!input) return true
    var val = input.value.trim()
    var num = parseFloat(val)
    var cur = getCurrency()
    var zd = isZeroDecimal(cur)
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
    console.log('[GooglePay ECS] getGooglePaymentsClient()')
    if (paymentsClient === null) {
      console.log('[GooglePay ECS] creating new PaymentsClient (environment: TEST)')
      paymentsClient = new google.payments.api.PaymentsClient({
        environment: 'TEST',
      })
    }
    return paymentsClient
  }

  // ─── Google Pay: config (cached) ─────────────────────────────────────────────

  function getGooglePayConfig() {
    console.log('[GooglePay ECS] getGooglePayConfig()')
    if (googlepayConfig !== null) {
      return Promise.resolve(googlepayConfig)
    }
    return paypalSDK.Googlepay().config().then(function (config) {
      googlepayConfig = config
      console.log('[GooglePay ECS] config:', config)
      return config
    })
  }

  // ─── Google Pay: request builders ────────────────────────────────────────────

  function getGoogleIsReadyToPayRequest(config) {
    return Object.assign({}, BASE_REQUEST, {
      allowedPaymentMethods: config.allowedPaymentMethods,
      existingPaymentMethodRequired: true,
    })
  }

  function getGooglePaymentDataRequest(config, amount, currency) {
    return Object.assign({}, BASE_REQUEST, {
      allowedPaymentMethods: config.allowedPaymentMethods,
      merchantInfo: config.merchantInfo,
      transactionInfo: {
        countryCode: 'US',
        currencyCode: currency,
        totalPriceStatus: 'FINAL',
        totalPrice: amount,
        totalPriceLabel: 'Total',
      },
      shippingAddressRequired: true,
      shippingAddressParameters: {
        phoneNumberRequired: true,
      },
      emailRequired: true,
    })
  }

  // ─── Google Pay: button ───────────────────────────────────────────────────────

  function addGooglePayButton(config) {
    console.log('[GooglePay ECS] addGooglePayButton()')
    var client = getGooglePaymentsClient()
    var container = document.getElementById('paypal-button-container')
    container.classList.remove('sdk-loading')
    container.innerHTML = ''

    var btn = client.createButton({
      buttonColor: 'black',
      buttonType: 'pay',
      buttonSizeMode: 'fill',
      onClick: function () {
        onGooglePaymentButtonClicked(config)
      },
    })
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
      customBtn.addEventListener('mousedown', function () {
        this.style.transform = 'scale(0.98)'
      })
      customBtn.addEventListener('mouseup', function () {
        this.style.transform = 'scale(1)'
      })
      customBtn.addEventListener('click', function () {
        console.log('[GooglePay ECS] custom button clicked — delegating to onGooglePaymentButtonClicked()')
        onGooglePaymentButtonClicked(config)
      })
      console.log('[GooglePay ECS] custom button enabled')
    }
  }

  // ─── ECS flow: sheet first, then create order ─────────────────────────────────
  //
  // ECM: createOrder → loadPaymentData → processPayment
  // ECS: loadPaymentData → extract address/email/phone → createOrder → processPayment

  function onGooglePaymentButtonClicked(config) {
    console.log('[GooglePay ECS] ===== Google Pay button clicked =====')

    if (!validateAmount()) {
      console.warn('[GooglePay ECS] amount validation failed — aborting')
      return
    }

    var amount = getAmount()
    var currency = getCurrency()
    var sca = getSCA()
    console.log('[GooglePay ECS] amount:', amount, '| currency:', currency, '| scaMethod:', sca)

    var paymentDataRequest = getGooglePaymentDataRequest(config, amount, currency)
    var client = getGooglePaymentsClient()

    console.log('[GooglePay ECS] calling loadPaymentData() — sheet opens for buyer to select shipping/email/phone')
    client
      .loadPaymentData(paymentDataRequest)
      .then(function (paymentData) {
        // Sheet closed — buyer has selected address, email, phone
        console.log('[GooglePay ECS] ===== loadPaymentData resolved =====')
        console.log('[GooglePay ECS] paymentData:', paymentData)

        var shippingAddress = paymentData.shippingAddress || null
        var buyerName  = shippingAddress ? shippingAddress.name        : null
        var email      = paymentData.email || null
        var rawPhone   = shippingAddress ? shippingAddress.phoneNumber  : null
        var isoCountry = shippingAddress ? shippingAddress.countryCode  : null
        var parsedPhone = parsePhoneNumber(rawPhone, isoCountry)

        console.log('[GooglePay ECS] shippingAddress:', shippingAddress)
        console.log('[GooglePay ECS] buyerName:', buyerName)
        console.log('[GooglePay ECS] email:', email)
        console.log('[GooglePay ECS] rawPhone:', rawPhone, '| isoCountry:', isoCountry, '| parsedPhone:', parsedPhone)

        // Now create order with buyer-selected data
        var createBody = {
          amount: amount,
          currency: currency,
          scaMethod: sca,
          shippingAddress: shippingAddress,
          buyerName: buyerName,
          email: email,
          parsedPhone: parsedPhone,
        }
        console.log('[GooglePay ECS] calling createOrder API:', urls.createOrder)
        console.log('[GooglePay ECS] createOrder request body:', createBody)

        return fetch(urls.createOrder, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createBody),
        })
          .then(function (r) {
            return r.json()
          })
          .then(function (d) {
            console.log('[GooglePay ECS] ===== createOrder response =====', d)
            if (d.error) throw new Error(d.error)
            currentOrderID = d.id
            console.log('[GooglePay ECS] order created — orderId:', currentOrderID)
            return processPayment(paymentData)
          })
      })
      .catch(function (err) {
        if (err && err.statusCode === 'CANCELED') {
          console.log('[GooglePay ECS] user cancelled Google Pay sheet')
          return
        }
        console.error('[GooglePay ECS] error in button click flow:', err)
        showResult('✗ ' + (err.message || String(err)), 'error')
      })
  }

  // ─── Core payment orchestration ───────────────────────────────────────────────

  function processPayment(paymentData) {
    console.log('[GooglePay ECS] processPayment() — orderId:', currentOrderID)

    return paypalSDK
      .Googlepay()
      .confirmOrder({
        orderId: currentOrderID,
        paymentMethodData: paymentData.paymentMethodData,
      })
      .then(function (result) {
        console.log('[GooglePay ECS] ===== confirmOrder() response =====')
        console.log('[GooglePay ECS] result:', result)
        console.log('[GooglePay ECS] status:', result.status)

        if (result.status === 'PAYER_ACTION_REQUIRED') {
          console.log('[GooglePay ECS] PAYER_ACTION_REQUIRED — calling initiatePayerAction()...')
          return paypalSDK
            .Googlepay()
            .initiatePayerAction({ orderId: currentOrderID })
            .then(function () {
              console.log('[GooglePay ECS] initiatePayerAction() completed — fetching order details for 3DS check...')
              return getOrderDetails(currentOrderID)
            })
            .then(function (order) {
              return handle3DS(order)
            })
        }

        console.log('[GooglePay ECS] status is "' + result.status + '" — calling doCapture() directly')
        return doCapture(currentOrderID)
      })
  }

  // ─── Order details fetch ──────────────────────────────────────────────────────

  function getOrderDetails(orderID) {
    var url = urls.getOrder + '/' + orderID
    console.log('[GooglePay ECS] GET', url)
    return fetch(url)
      .then(function (r) {
        return r.json()
      })
      .then(function (order) {
        console.log('[GooglePay ECS] ===== getOrderDetails() response =====')
        console.log('[GooglePay ECS] order:', order)
        return order
      })
  }

  // ─── 3DS result handling ──────────────────────────────────────────────────────
  //
  // Same path as ECM: payment_source.google_pay.card.authentication_result

  function handle3DS(order) {
    console.log('[GooglePay ECS] handle3DS()')

    var authResult =
      (order.payment_source &&
        order.payment_source.google_pay &&
        order.payment_source.google_pay.card &&
        order.payment_source.google_pay.card.authentication_result) ||
      {}
    var threeDS = authResult.three_d_secure || {}
    var ls = authResult.liability_shift
    var enrollment = threeDS.enrollment_status
    var authStatus = threeDS.authentication_status

    console.log('[GooglePay ECS] liability_shift:', ls)
    console.log('[GooglePay ECS] enrollment_status:', enrollment)
    console.log('[GooglePay ECS] authentication_status:', authStatus)

    if (ls === 'POSSIBLE') {
      console.log('[GooglePay ECS] 3DS: liability shifted — proceeding to capture')
      return doCapture(currentOrderID)
    }

    if (ls === 'NO') {
      var notEnrolled = ['N', 'U', 'B']
      if (notEnrolled.indexOf(enrollment) !== -1) {
        console.log('[GooglePay ECS] 3DS: card not enrolled (enrollment: ' + enrollment + ') — proceeding to capture')
        return doCapture(currentOrderID)
      }
      var msg = '3DS rejected · enrollment: ' + enrollment + ' · authStatus: ' + authStatus
      console.error('[GooglePay ECS]', msg)
      showResult('✗ ' + msg, 'error')
      return Promise.reject(new Error(msg))
    }

    if (ls === 'UNKNOWN') {
      console.warn('[GooglePay ECS] 3DS: UNKNOWN liability_shift — please retry')
      showResult('✗ 3DS result unknown · Please retry', 'error')
      return Promise.reject(new Error('3DS unknown'))
    }

    var fallback = '3DS error · liability_shift: ' + (ls || 'undefined')
    console.error('[GooglePay ECS] unhandled 3DS state:', fallback)
    showResult('✗ ' + fallback, 'error')
    return Promise.reject(new Error(fallback))
  }

  // ─── Capture order ────────────────────────────────────────────────────────────

  function doCapture(orderID) {
    console.log('[GooglePay ECS] ===== doCapture() — orderID:', orderID)

    return fetch(urls.captureOrder, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderID: orderID }),
    })
      .then(function (r) {
        return r.json()
      })
      .then(function (order) {
        console.log('[GooglePay ECS] ===== captureOrder response =====')
        console.log('[GooglePay ECS] response:', order)
        if (order.error) throw new Error(order.error)

        var capture =
          order.purchase_units &&
          order.purchase_units[0] &&
          order.purchase_units[0].payments &&
          order.purchase_units[0].payments.captures &&
          order.purchase_units[0].payments.captures[0]
        console.log('[GooglePay ECS] capture object:', capture)

        if (!capture || capture.status !== 'COMPLETED') {
          var status = capture ? capture.status : 'undefined'
          console.error('[GooglePay ECS] capture NOT COMPLETED — status:', status)
          showResult('✗ Capture failed · status: ' + (capture ? capture.status : 'unknown'), 'error')
          return
        }

        console.log('[GooglePay ECS] ===== capture COMPLETED ===== orderId:', order.id)
        showResult('✓ Payment captured · Order: ' + order.id, 'success')
      })
  }

  // ─── Entry point ──────────────────────────────────────────────────────────────

  window.addEventListener('load', function () {
    console.log('[GooglePay ECS] ===== window load =====')

    urls = window.DEMO && window.DEMO.urls
    console.log('[GooglePay ECS] urls:', urls)

    if (typeof paypalSDK === 'undefined') {
      console.error('[GooglePay ECS] paypalSDK undefined — SDK failed to load')
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }
    if (typeof google === 'undefined' || !google.payments) {
      console.error('[GooglePay ECS] google.payments undefined — Google Pay SDK failed to load')
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

    console.log('[GooglePay ECS] calling getGooglePayConfig()...')
    getGooglePayConfig()
      .then(function (config) {
        var client = getGooglePaymentsClient()
        var isReadyToPayReq = getGoogleIsReadyToPayRequest(config)
        console.log('[GooglePay ECS] calling isReadyToPay()...')
        return client.isReadyToPay(isReadyToPayReq).then(function (resp) {
          console.log('[GooglePay ECS] isReadyToPay response:', resp)
          if (!resp.result) {
            console.warn('[GooglePay ECS] Google Pay not available on this device/account')
            var container = document.getElementById('paypal-button-container')
            container.classList.remove('sdk-loading')
            container.innerHTML = ''
            showResult('Google Pay is not available on this device or account.', 'error')
            return
          }
          console.log('[GooglePay ECS] isReadyToPay: true — calling addGooglePayButton()')
          addGooglePayButton(config)
        })
      })
      .catch(function (err) {
        var container = document.getElementById('paypal-button-container')
        if (container) {
          container.classList.remove('sdk-loading')
          container.innerHTML = ''
        }
        console.error('[GooglePay ECS] config/init error:', err)
        showResult('✗ Google Pay config error: ' + (err.message || String(err)), 'error')
      })
  })
})()
