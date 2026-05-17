const { createStandardRoute } = require('./_factory')

module.exports = createStandardRoute({
  productKey: 'spb-ecm',
  sdkParams:  'components=buttons&currency=USD',
  view:       'paypal/jssdk-v5/spb-ecm',
})
