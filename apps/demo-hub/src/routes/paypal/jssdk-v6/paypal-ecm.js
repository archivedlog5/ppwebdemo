'use strict'

const { createStandardRoute } = require('./_factory')
const C = require('../../../config/constants')

module.exports = createStandardRoute({
  productKey: 'paypal-ecm',
  view: 'paypal/jssdk-v6/paypal-ecm',
  buildBody: function (amount, currency) {
    const zero = C.isZeroDecimal(currency)
    const value = zero ? String(Math.round(parseFloat(amount))) : parseFloat(amount).toFixed(2)
    return {
      intent: C.INTENT.CAPTURE,
      purchase_units: [
        {
          amount: {
            currency_code: currency,
            value,
            ...(zero ? {} : { breakdown: { item_total: { currency_code: currency, value } } }),
          },
          ...(zero
            ? {}
            : {
                items: [
                  {
                    name: C.DEMO_ITEM.name,
                    unit_amount: { currency_code: currency, value },
                    quantity: '1',
                  },
                ],
              }),
          shipping: C.SANDBOX_SHIPPING,
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            ...C.EXPERIENCE_CONTEXT,
            shipping_preference: 'SET_PROVIDED_ADDRESS',
          },
        },
      },
    }
  },
})
