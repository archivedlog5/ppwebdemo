const { createVaultWithPurchaseRoute } = require('./_factory')

module.exports = createVaultWithPurchaseRoute({
  productKey: 'vault-acdc-with-purchase',
  sdkParams:  'components=card-fields&vault=true&currency=USD',
  view:       'paypal/jssdk-v5/vault-acdc-with-purchase',
  paymentSource: {
    card: {
      attributes: {
        vault: { store_in_vault: 'ON_SUCCESS' }
      }
    }
  }
})
