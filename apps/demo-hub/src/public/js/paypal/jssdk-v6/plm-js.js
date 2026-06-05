;(function () {
  'use strict'

  console.log('[PLM-JS] plm-js.js loaded')

  var COUNTRY_TO_CUR = {
    US: 'USD', AU: 'AUD', DE: 'EUR', ES: 'EUR',
    FR: 'EUR', IT: 'EUR', GB: 'GBP', CA: 'CAD',
  }

  var messagesInstance = null
  var content          = null
  var learnMore        = null
  var logCount         = 0
  var messageEl        = null

  // ── Inspect helper ────────────────────────────────────────────────────────

  function inspect(label, obj) {
    try {
      var proto = obj && Object.getPrototypeOf(obj) ? Object.getOwnPropertyNames(Object.getPrototypeOf(obj)) : []
      console.log('[PLM-JS] inspect:', label, {
        type:      typeof obj,
        isPromise: obj != null && typeof obj.then === 'function',
        ownKeys:   obj != null ? Object.getOwnPropertyNames(obj) : [],
        protoKeys: proto,
        value:     obj,
      })
    } catch (e) {
      console.log('[PLM-JS] inspect:', label, obj, '(inspect error:', e.message, ')')
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getAmount() {
    var inp = document.getElementById('demo-amount')
    return inp ? inp.value.trim() : (window.DEMO && window.DEMO.defaultAmount) || '100.00'
  }

  function buildOptions() {
    var logoTypeSel  = document.getElementById('demo-logo-type')
    var logoPosSel   = document.getElementById('demo-logo-position')
    var textColorSel = document.getElementById('demo-text-color')
    return {
      amount:       parseFloat(getAmount()).toFixed(2),
      currencyCode: (window.DEMO && window.DEMO.currency) || 'USD',
      logoType:     logoTypeSel  ? logoTypeSel.value  : 'WORDMARK',
      logoPosition: logoPosSel   ? logoPosSel.value   : 'LEFT',
      textColor:    textColorSel ? textColorSel.value : 'BLACK',
    }
  }

  // ── Event log ─────────────────────────────────────────────────────────────

  function logEvent(name, detail) {
    var log = document.getElementById('plm-event-log')
    if (!log) return

    if (logCount === 0) log.innerHTML = ''
    logCount++

    var time = new Date().toLocaleTimeString()
    var row = document.createElement('div')
    row.style.cssText =
      'display:flex;align-items:baseline;gap:10px;padding:5px 0;' +
      'border-bottom:1px solid var(--border);font-size:12px'
    row.innerHTML =
      '<span style="color:var(--fg-muted);font-family:var(--font-mono);flex-shrink:0">' + time + '</span>' +
      '<span style="color:var(--accent);font-weight:700;flex-shrink:0;min-width:150px">' + name + '</span>' +
      (detail
        ? '<span style="color:var(--fg-muted);font-family:var(--font-mono)">' +
          JSON.stringify(detail) + '</span>'
        : '')
    log.insertBefore(row, log.firstChild)

    while (log.children.length > 30) log.removeChild(log.lastChild)
  }

  // ── Config display ────────────────────────────────────────────────────────

  function updateConfigDisplay(config) {
    var el = document.getElementById('plm-js-config')
    if (el) el.textContent = JSON.stringify(config, null, 2)
  }

  // ── doFetch — server path (style change or first render) ──────────────────

  function doFetch() {
    if (!messagesInstance) return
    var opts = buildOptions()
    updateConfigDisplay(opts)

    var result = messagesInstance.fetchContent({
      amount:       opts.amount,
      currencyCode: opts.currencyCode,
      logoType:     opts.logoType,
      logoPosition: opts.logoPosition,
      textColor:    opts.textColor,
      onContentReady: function (c) {
        logEvent('onContentReady', { src: 'server' })
        messageEl.setContent(c)
        content = c
        inspect('content handle (onContentReady)', c)
      },
      onTemplateReady: function (c) {
        logEvent('onTemplateReady', { src: 'cache' })
        messageEl.setContent(c)
        content = c
      },
    })
    inspect('fetchContent return', result)
    // Sync return: result is already the content handle with .update()
    if (result && typeof result.update === 'function') {
      content = result
    }
  }

  // ── Amount update — cache path ────────────────────────────────────────────

  function onAmountChange() {
    var inp = document.getElementById('demo-amount')
    if (!inp) return
    var val = parseFloat(inp.value)
    if (isNaN(val) || val <= 0) return
    var amount = val.toFixed(2)
    if (content && typeof content.update === 'function') {
      content.update({ amount: amount })
      updateConfigDisplay(buildOptions())
    } else {
      // R-RISK-1 fallback: content.update not available, re-fetch instead
      console.warn('[PLM-JS] content.update not available, falling back to doFetch()')
      doFetch()
    }
  }

  // ── Presentation mode — rebuild learnMore ─────────────────────────────────

  function onPresentationChange() {
    if (!messagesInstance) return
    var presentationSel = document.getElementById('demo-presentation')
    var mode = presentationSel ? presentationSel.value : 'AUTO'

    var result = messagesInstance.createLearnMore({
      presentationMode: mode,
      onShow:      function ()  { logEvent('LearnMore.onShow', null) },
      onApply:     function ()  { logEvent('LearnMore.onApply', null) },
      onCalculate: function (d) { logEvent('LearnMore.onCalculate', d) },
      onClose:     function ()  { logEvent('LearnMore.onClose', null) },
    })
    inspect('createLearnMore return', result)
    if (result && typeof result.then === 'function') {
      result.then(function (lm) {
        learnMore = lm
        inspect('learnMore resolved', lm)
      }).catch(function (e) {
        console.error('[PLM-JS] createLearnMore error:', e)
      })
    } else {
      learnMore = result
      inspect('learnMore (sync)', learnMore)
    }
  }

  // ── Message click → Learn More open ──────────────────────────────────────

  function onMessageClick(event) {
    event.preventDefault()
    inspect('paypal-message-click event.detail', event && event.detail)
    var cfg = event.detail && event.detail.config
    logEvent('paypal-message-click', cfg ? { hasConfig: true } : null)
    if (learnMore && typeof learnMore.open === 'function') {
      learnMore.open(cfg)
    } else {
      console.warn('[PLM-JS] learnMore.open not available, learnMore =', learnMore)
    }
  }

  // ── SDK setup ─────────────────────────────────────────────────────────────

  function setupMessages(sdkInstance) {
    var demo = window.DEMO || {}
    inspect('sdkInstance', sdkInstance)

    var ppResult = sdkInstance.createPayPalMessages({
      currencyCode: demo.currency || 'USD',
      buyerCountry: demo.country  || 'US',
    })
    inspect('createPayPalMessages return (R-RISK-3)', ppResult)

    function init(instance) {
      messagesInstance = instance
      inspect('messagesInstance', messagesInstance)
      doFetch()
      onPresentationChange()
      if (messageEl) {
        messageEl.addEventListener('paypal-message-click', onMessageClick)
      }
    }

    if (ppResult && typeof ppResult.then === 'function') {
      ppResult.then(function (inst) { init(inst) }).catch(function (e) {
        console.error('[PLM-JS] createPayPalMessages async error:', e)
      })
    } else {
      init(ppResult)
    }
  }

  // ── DOMContentLoaded: cache element refs + bind controls ──────────────────

  document.addEventListener('DOMContentLoaded', function () {
    messageEl = document.getElementById('paypal-message')

    var countrySel      = document.getElementById('demo-country')
    var amountInp       = document.getElementById('demo-amount')
    var logoTypeSel     = document.getElementById('demo-logo-type')
    var logoPosSel      = document.getElementById('demo-logo-position')
    var textColorSel    = document.getElementById('demo-text-color')
    var presentationSel = document.getElementById('demo-presentation')
    var redirectNote    = document.getElementById('redirect-note')
    var clearBtn        = document.getElementById('clear-log-btn')

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
      amountInp.addEventListener('change', onAmountChange)
      amountInp.addEventListener('blur', function () {
        var n = parseFloat(this.value)
        if (!isNaN(n) && n > 0) this.value = n.toFixed(2)
      })
    }

    if (logoTypeSel)  logoTypeSel.addEventListener('change',  doFetch)
    if (logoPosSel)   logoPosSel.addEventListener('change',   doFetch)
    if (textColorSel) textColorSel.addEventListener('change', doFetch)

    if (presentationSel) {
      presentationSel.addEventListener('change', function () {
        onPresentationChange()
        if (redirectNote) {
          redirectNote.textContent = this.value === 'REDIRECT' ? '⚠ navigates away from page' : ''
        }
      })
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        var log = document.getElementById('plm-event-log')
        if (log) {
          log.innerHTML = '<div style="color:var(--fg-subtle);font-size:12px">Events will appear here...</div>'
          logCount = 0
        }
      })
    }
  })

  // ── window.load: SDK init ─────────────────────────────────────────────────

  window.addEventListener('load', function () {
    console.log('[PLM-JS] window.load fired, typeof paypal =', typeof paypal)
    if (typeof paypal === 'undefined') {
      console.error('[PLM-JS] PayPal SDK not loaded!')
      return
    }
    getPPInstance()
      .then(function (sdkInstance) {
        setupMessages(sdkInstance)
      })
      .catch(function (err) {
        console.error('[PLM-JS] SDK init error:', err)
      })
  })

})()
