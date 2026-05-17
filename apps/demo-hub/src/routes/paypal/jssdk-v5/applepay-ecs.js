const { createStandardRoute } = require('./_factory')

module.exports = createStandardRoute({
  productKey: 'applepay-ecs',
  sdkParams:  'components=applepay&currency=USD',
  view:       'paypal/jssdk-v5/applepay-ecs',
})
