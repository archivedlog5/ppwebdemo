const { createStandardRoute } = require('./_factory')

module.exports = createStandardRoute({
  productKey: 'googlepay-ecm',
  sdkParams:  'components=googlepay&currency=USD',
  view:       'paypal/jssdk-v5/googlepay-ecm',
  extraScripts: [
    { url: 'https://pay.google.com/gp/p/js/pay.js' }
  ],
})
