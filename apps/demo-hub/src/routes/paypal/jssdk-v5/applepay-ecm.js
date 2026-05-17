const { createStandardRoute } = require('./_factory')

module.exports = createStandardRoute({
  productKey: 'applepay-ecm',
  sdkParams:  'components=applepay&currency=USD',
  view:       'paypal/jssdk-v5/applepay-ecm',
})
