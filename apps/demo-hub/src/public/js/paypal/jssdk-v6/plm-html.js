;(function () {
  'use strict'

  console.log('[PLM-HTML] plm-html.js loaded')

  var COUNTRY_TO_CUR = {
    US: 'USD', AU: 'AUD', DE: 'EUR', ES: 'EUR',
    FR: 'EUR', IT: 'EUR', GB: 'GBP', CA: 'CAD',
  }

  function getAmount() {
    var inp = document.getElementById('demo-amount')
    return inp ? inp.value.trim() : (window.DEMO && window.DEMO.defaultAmount) || '100.00'
  }

  function syncAmount() {
    var num = parseFloat(getAmount())
    if (isNaN(num) || num <= 0) return
    var val = num.toFixed(2)
    var els = document.querySelectorAll('paypal-message')
    els.forEach(function (el) { el.setAttribute('amount', val) })
    console.log('[PLM-HTML] synced amount →', val, 'on', els.length, 'element(s)')
  }

  // ── DOMContentLoaded: control event listeners ─────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    var countrySel = document.getElementById('demo-country')
    var amountInp  = document.getElementById('demo-amount')

    if (countrySel) {
      countrySel.addEventListener('change', function () {
        var url = new URL(window.location.href)
        url.searchParams.set('country', this.value)
        url.searchParams.set('currency', COUNTRY_TO_CUR[this.value] || 'USD')
        if (amountInp) url.searchParams.set('amount', amountInp.value.trim())
        window.location.replace(url.toString())
      })
    }

    if (amountInp) {
      amountInp.addEventListener('change', syncAmount)
      amountInp.addEventListener('blur', function () {
        var num = parseFloat(this.value)
        if (!isNaN(num) && num > 0) this.value = num.toFixed(2)
        syncAmount()
      })
    }
  })

  // ── window.load: SDK init ─────────────────────────────────────────────────

  window.addEventListener('load', function () {
    console.log('[PLM-HTML] window.load fired, typeof paypal =', typeof paypal)
    if (typeof paypal === 'undefined') {
      console.error('[PLM-HTML] PayPal SDK not loaded!')
      return
    }
    // getPPInstance() calls createInstance({ clientId, components: ['paypal-messages'] })
    // auto-bootstrap on each <paypal-message> drives all content fetching
    getPPInstance()
      .then(function (sdkInstance) {
        console.log('[PLM-HTML] sdkInstance ready')
        var demo = window.DEMO || {}
        sdkInstance.createPayPalMessages({
          currencyCode: demo.currency    || 'USD',
          buyerCountry: demo.country     || 'US',
        })
        console.log('[PLM-HTML] createPayPalMessages() called — currencyCode:', demo.currency, 'buyerCountry:', demo.country)
      })
      .catch(function (err) {
        console.error('[PLM-HTML] SDK init error:', err)
      })
  })
})()
