const { createVaultWithPurchaseRoute } = require('./_factory')

module.exports = createVaultWithPurchaseRoute({
  productKey: 'vault-paypal-with-purchase',
  sdkParams:  'components=buttons&vault=true&currency=USD',
  view:       'paypal/jssdk-v5/vault-paypal-with-purchase',
  paymentSource: {
    paypal: {
      attributes: {
        vault: { store_in_vault: 'ON_SUCCESS', usage_type: 'MERCHANT' }
      },
      experience_context: {
        return_url: 'http://localhost:3000',
        cancel_url: 'http://localhost:3000',
      }
    }
  }
})
