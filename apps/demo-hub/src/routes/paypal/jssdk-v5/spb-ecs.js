const { createStandardRoute } = require('./_factory')

module.exports = createStandardRoute({
  productKey: 'spb-ecs',
  sdkParams:  'components=buttons&currency=USD',
  view:       'paypal/jssdk-v5/spb-ecs',
  orderBody: {
    payment_source: {
      paypal: {
        experience_context: {
          payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
          user_action: 'PAY_NOW',
        }
      }
    }
  }
})
