const { createVaultWithPurchaseRoute } = require('./_factory')
const demoParams = require('../../../config/constants')

module.exports = createVaultWithPurchaseRoute({
  productKey: 'vault-paypal-with-purchase',
  sdkParams:  'components=buttons&vault=true',
  view:       'paypal/jssdk-v5/vault-paypal-with-purchase',
  buildBody: function (amount, currency) {
    const zd = demoParams.isZeroDecimal(currency)
    const val = zd ? String(Math.round(parseFloat(amount))) : parseFloat(amount).toFixed(2)
    const amountObj = (curr) => ({ currency_code: curr, value: val })
    return {
      intent: demoParams.INTENT.CAPTURE,
      purchase_units: [{
        amount: { currency_code: currency, value: val, breakdown: { item_total: amountObj(currency) } },
        description: demoParams.DEMO_DESCRIPTION,
        items: [{ ...demoParams.DEMO_ITEM, unit_amount: amountObj(currency) }],
        shipping: demoParams.SANDBOX_SHIPPING,
        payment_source: {
          paypal: {
            attributes: { vault: { store_in_vault: 'ON_SUCCESS', usage_type: 'MERCHANT' } },
            experience_context: {
              return_url: 'http://localhost:3000',
              cancel_url: 'http://localhost:3000',
            }
          }
        },
      }]
    }
  },
})
