'use strict'

const { createStandardRoute } = require('./_factory')
const C = require('../../../config/constants')

module.exports = createStandardRoute({
  productKey: 'paylater-ecm',
  view: 'paypal/jssdk-v6/paylater-ecm',

  buildBody: function (amount, currency) {
    const zd = C.isZeroDecimal(currency)
    const val = zd ? String(Math.round(parseFloat(amount))) : parseFloat(amount).toFixed(2)
    const amountObj = (curr) => ({ currency_code: curr, value: val })

    return {
      intent: C.INTENT.CAPTURE,

      payment_source: {
        paypal: {
          ...C.SANDBOX_BUYER,
          experience_context: C.EXPERIENCE_CONTEXT,
        },
      },

      purchase_units: [
        {
          reference_id: C.DEMO_REFERENCE_ID,
          description: C.DEMO_DESCRIPTION,
          invoice_id: `INV-${Date.now()}`,
          custom_id: C.DEMO_CUSTOM_ID,
          soft_descriptor: C.DEMO_SOFT_DESCRIPTOR,

          amount: {
            currency_code: currency,
            value: val,
            breakdown: { item_total: amountObj(currency) },
          },

          items: [
            {
              ...C.DEMO_ITEM,
              unit_amount: amountObj(currency),
            },
          ],

          shipping: C.SANDBOX_SHIPPING,
        },
      ],
    }
  },
})
