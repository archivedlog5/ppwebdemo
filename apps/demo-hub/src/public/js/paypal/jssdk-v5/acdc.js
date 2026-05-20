/**
 * PayPal Advanced Credit/Debit Card (ACDC) — CardFields
 * 用于：acdc, vault-acdc-with-purchase, vault-acdc-setup-only
 *
 * window.DEMO = {
 *   urls: { createOrder: '/...', captureOrder: '/...' },
 *   mode: 'standard' | 'vault-purchase' | 'vault-setup',
 *   defaultAmount: '100.00'
 * }
 */
;(function () {
  'use strict'

  var ZERO_DECIMAL = ['JPY', 'KRW', 'TWD', 'CLP', 'IDR']

  // emittedBy value → container element ID (used for onFocus/onBlur)
  var CONTAINER_BY_EMITTED = {
    number: 'card-number-container',
    expiry: 'card-expiry-container',
    cvv:    'card-cvv-container',
  }

  // stateObject.fields key → container element ID (used for onChange validation)
  var CONTAINER_BY_FIELD = {
    cardNumberField: 'card-number-container',
    cardExpiryField: 'card-expiry-container',
    cardCvvField:    'card-cvv-container',
  }

  function getCurrency() {
    var sel = document.getElementById('demo-currency')
    return sel ? sel.value : (window.DEMO && window.DEMO.currency) || 'USD'
  }

  function getSCA() {
    var sel = document.getElementById('demo-sca')
    return sel ? sel.value : 'SCA_WHEN_REQUIRED'
  }

  function getName() {
    var input = document.getElementById('card-name')
    return input ? input.value.trim() : ''
  }

  function isZeroDecimal(currency) {
    return ZERO_DECIMAL.indexOf(currency) !== -1
  }

  // Currency change → reload page with ?currency=X&amount=Y
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

  function showResult(text, type) {
    var el = document.getElementById('result')
    if (!el) return
    el.className = 'result-msg ' + type
    el.textContent = text
  }

  function getAmount() {
    var input = document.getElementById('demo-amount')
    return input ? input.value.trim() : (window.DEMO && window.DEMO.defaultAmount) || '100.00'
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

  function clearLoading(id) {
    var el = document.getElementById(id)
    if (!el) return
    el.classList.remove('sdk-loading')
    el.innerHTML = ''
  }

  // Update container border class based on per-field validity state
  function updateFieldStates(fields) {
    Object.keys(CONTAINER_BY_FIELD).forEach(function (key) {
      var el = document.getElementById(CONTAINER_BY_FIELD[key])
      if (!el) return
      var f = fields[key]
      if (!f) return
      el.classList.remove('field-host--valid', 'field-host--invalid')
      if (!f.isEmpty) {
        if (f.isValid) {
          el.classList.add('field-host--valid')
        } else if (!f.isPotentiallyValid) {
          el.classList.add('field-host--invalid')
        }
      }
    })
  }

  window.addEventListener('load', function () {
    if (typeof paypalSDK === 'undefined') {
      showResult('✗ PayPal SDK failed to load', 'error')
      return
    }

    // Format amount on blur
    var amountInput = document.getElementById('demo-amount')
    if (amountInput) {
      amountInput.addEventListener('blur', function () {
        var num = parseFloat(this.value)
        if (!isNaN(num) && num > 0) this.value = isZeroDecimal(getCurrency()) ? String(Math.round(num)) : num.toFixed(2)
        validateAmount()
      })
    }

    clearLoading('card-number-container')

    var urls = window.DEMO && window.DEMO.urls

    function doCapture(orderID) {
      return fetch(urls.captureOrder, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderID: orderID }),
      })
        .then(function (r) { return r.json() })
        .then(function (order) {
          if (order.error) throw new Error(order.error)
          var capture = order.purchase_units &&
                        order.purchase_units[0] &&
                        order.purchase_units[0].payments &&
                        order.purchase_units[0].payments.captures &&
                        order.purchase_units[0].payments.captures[0]
          if (!capture || capture.status !== 'COMPLETED') {
            showResult('✗ Capture failed · status: ' + (capture ? capture.status : 'unknown'), 'error')
            return
          }
          showResult('✓ Payment captured · Order: ' + order.id, 'success')
        })
    }

    var cardFields = paypalSDK.CardFields({
      createOrder: function () {
        if (!validateAmount()) return Promise.reject(new Error('Invalid amount'))
        return fetch(urls.createOrder, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ amount: getAmount(), currency: getCurrency(), scaMethod: getSCA(), cardholderName: getName(), billingAddress: (window.DEMO && window.DEMO.billing) || {} }),
        })
          .then(function (r) { return r.json() })
          .then(function (d) {
            if (d.error) throw new Error(d.error)
            return d.id
          })
      },
      onApprove: function (data) {
        var liabilityShift = data.liabilityShift
        console.log('[ACDC] 3DS liabilityShift (client):', liabilityShift)

        // POSSIBLE → liability shifts to issuer; undefined → 3DS not triggered → capture
        if (!liabilityShift || liabilityShift === 'POSSIBLE') {
          return doCapture(data.orderID)
        }

        // Otherwise fetch server-side enrollment_status + authentication_status
        // and apply the recommended action table
        var getOrderUrl = urls.getOrder.replace(':orderID', data.orderID)
        return fetch(getOrderUrl)
          .then(function (r) { return r.json() })
          .then(function (result) {
            var authResult = (result.payment_source && result.payment_source.card && result.payment_source.card.authentication_result) || {}
            var threeDS    = authResult.three_d_secure || {}
            var ls         = authResult.liability_shift
            var enrollment = threeDS.enrollment_status
            var authStatus = threeDS.authentication_status
            console.log('[ACDC] 3DS server — liabilityShift:', ls,
              '| enrollment:', enrollment, '| auth:', authStatus)

            // Continue cases from recommended action table:
            // enrollment N / U / B with liability_shift NO → continue
            if (ls === 'NO' && (enrollment === 'N' || enrollment === 'U' || enrollment === 'B')) {
              return doCapture(data.orderID)
            }

            // All other cases: do not continue
            if (ls === 'UNKNOWN') {
              showResult('✗ 3D Secure unavailable — please retry.', 'error')
            } else {
              showResult('✗ 3D Secure declined (enrollment: ' + enrollment +
                ', auth: ' + authStatus + ') — please try another card.', 'error')
            }
          })
      },
      onError: function (err) {
        showResult('✗ ' + (err.message || String(err)), 'error')
      },

      onCancel: function () {
        showResult('3D Secure cancelled — payment not completed.', 'error')
        var payBtn = document.getElementById('acdc-pay-btn')
        if (payBtn) payBtn.disabled = false
      },

      style: {
        input: {
          'font-family': "'Space Mono', monospace",
          'font-size':   '13px',
          color:         'inherit',
        },
        '.invalid': {
          color: '#EF4444',
        },
      },

      inputEvents: {
        onChange: function (data) {
          // Card type detection → console
          if (data.cards && data.cards.length > 0) {
            var card = data.cards[0]
            console.log('[ACDC] Card type:', card.niceType, '(' + card.type + ')')
            console.log('[ACDC]', card.code.name + ':', card.code.size + ' digits | form valid:', data.isFormValid)
            if (data.errors && data.errors.length > 0) {
              console.log('[ACDC] Errors:', data.errors.join(', '))
            }
          }
          // Per-field valid/invalid border state
          if (data.fields) updateFieldStates(data.fields)
        },

        onFocus: function (data) {
          var id = CONTAINER_BY_EMITTED[data.emittedBy]
          if (id) {
            var el = document.getElementById(id)
            if (el) el.classList.add('focused')
          }
        },

        onBlur: function (data) {
          var id = CONTAINER_BY_EMITTED[data.emittedBy]
          if (id) {
            var el = document.getElementById(id)
            if (el) el.classList.remove('focused')
          }
        },
      },
    })

    if (cardFields.isEligible()) {
      cardFields.NumberField({ placeholder: '4032030176760800' }).render('#card-number-container')
      cardFields.ExpiryField({ placeholder: 'MM / YY' }).render('#card-expiry-container')
      cardFields.CVVField({ placeholder: '•••' }).render('#card-cvv-container')
    } else {
      document.getElementById('card-number-container').innerHTML =
        '<p style="color:var(--fg-muted);font-size:12px;text-align:center">Card Fields not available for this account.</p>'
    }

    var payBtn = document.getElementById('acdc-pay-btn')
    if (payBtn) {
      payBtn.addEventListener('click', function () {
        if (!validateAmount()) return
        payBtn.disabled = true
        var billing = (window.DEMO && window.DEMO.billing) || {}
        cardFields.submit({
          billingAddress: {
            addressLine1: billing.addressLine1 || '',
            addressLine2: billing.addressLine2 || '',
            adminArea1:   billing.adminArea1   || '',
            adminArea2:   billing.adminArea2   || '',
            countryCode:  billing.countryCode  || '',
            postalCode:   billing.postalCode   || '',
          },
        }).catch(function (err) {
          showResult('✗ ' + (err.message || String(err)), 'error')
          payBtn.disabled = false
        })
      })
    }
  })
})()
