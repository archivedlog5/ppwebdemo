;(function () {
  'use strict'

  var LS_KEY = 'demo_hub_collapse'

  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY))
      if (s && typeof s.providers === 'object' && typeof s.sdks === 'object') return s
    } catch (e) {}
    return { providers: {}, sdks: {} }
  }

  function saveState(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)) } catch (e) {}
  }

  function applyState(trigger, body, expanded) {
    var icon = trigger.querySelector('.collapse-icon')
    if (expanded) {
      body.classList.remove('collapsed')
      trigger.setAttribute('aria-expanded', 'true')
      if (icon) icon.classList.add('expanded')
    } else {
      body.classList.add('collapsed')
      trigger.setAttribute('aria-expanded', 'false')
      if (icon) icon.classList.remove('expanded')
    }
  }

  function wireToggle(trigger, body, key, bucket, state) {
    // Apply saved state on page load; undefined = first visit = expanded
    var saved = bucket[key]
    applyState(trigger, body, saved === undefined ? true : saved)

    function toggle() {
      var nowExpanded = body.classList.contains('collapsed') // was collapsed → now expand
      applyState(trigger, body, nowExpanded)
      bucket[key] = nowExpanded
      saveState(state)
    }

    trigger.addEventListener('click', toggle)
    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggle()
      }
    })
  }

  document.addEventListener('DOMContentLoaded', function () {
    var state = loadState()

    document.querySelectorAll('[data-collapse-provider]').forEach(function (trigger) {
      var key  = trigger.getAttribute('data-collapse-provider')
      var body = document.getElementById(trigger.getAttribute('aria-controls'))
      if (body) wireToggle(trigger, body, key, state.providers, state)
    })

    document.querySelectorAll('[data-collapse-sdk]').forEach(function (trigger) {
      var key  = trigger.getAttribute('data-collapse-sdk')
      var body = document.getElementById(trigger.getAttribute('aria-controls'))
      if (body) wireToggle(trigger, body, key, state.sdks, state)
    })
  })
})()
