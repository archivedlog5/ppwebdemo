const { createStandardRoute } = require('./_factory')
const demoParams = require('../../../config/constants')

module.exports = createStandardRoute({
  productKey:   'applepay-ecm',
  sdkParams:    'components=applepay',
  view:         'paypal/jssdk-v5/applepay-ecm',
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
      }]
    }
  },
})
