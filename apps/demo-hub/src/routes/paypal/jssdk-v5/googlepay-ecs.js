const { createStandardRoute } = require('./_factory')

module.exports = createStandardRoute({
  productKey: 'googlepay-ecs',
  sdkParams:  'components=googlepay&currency=USD',
  view:       'paypal/jssdk-v5/googlepay-ecs',
  extraScripts: [
    { url: 'https://pay.google.com/gp/p/js/pay.js' }
  ],
})
