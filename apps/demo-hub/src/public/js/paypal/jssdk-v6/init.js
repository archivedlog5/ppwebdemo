;(function () {
  'use strict'
  var _promise = null

  window.getPPInstance = function () {
    if (_promise) return _promise
    _promise = window.paypal
      .createInstance({
        clientId: window.DEMO.clientId,
        components: window.DEMO.components || ['paypal-payments'],
      })
      .then(function (inst) {
        try {
          sessionStorage.setItem('pp_v6_clientId', window.DEMO.clientId)
        } catch (e) {}
        return inst
      })
    return _promise
  }
})()
