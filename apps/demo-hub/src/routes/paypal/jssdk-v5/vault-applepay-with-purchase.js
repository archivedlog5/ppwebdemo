const { createVaultWithPurchaseRoute } = require('./_factory')

module.exports = createVaultWithPurchaseRoute({
  productKey: 'vault-applepay-with-purchase',
  sdkParams:  'components=applepay&vault=true&currency=USD',
  view:       'paypal/jssdk-v5/vault-applepay-with-purchase',
  paymentSource: {
    apple_pay: {
      attributes: {
        vault: { store_in_vault: 'ON_SUCCESS', usage_type: 'MERCHANT' }
      }
    }
  }
})
