const { createStandardRoute } = require('./_factory')
const C = require('../../../config/constants')

module.exports = createStandardRoute({
  productKey: 'spb-ecm',
  sdkParams:  'components=buttons&buyer-country=US&disable-funding=bancontact,blik,eps,giropay,ideal,mercadopago,mybank,p24,sepa,sofort',
  view:       'paypal/jssdk-v5/spb-ecm',

  /**
   * buildBody(amount, currency) — 完整 order body 在这里定义
   * amount 和 currency 由前端传入，工厂注入
   * 用 C.xxx 引用常量（C = config/constants.js）
   */
  buildBody: function (amount, currency) {
    return {
      intent: C.INTENT.CAPTURE,
      purchase_units: [{
        amount: {
          currency_code: currency,
          value: C.isZeroDecimal(currency) ? String(Math.round(parseFloat(amount))) : parseFloat(amount).toFixed(2),
          breakdown: {
            item_total: {
              currency_code: currency,
              value: C.isZeroDecimal(currency) ? String(Math.round(parseFloat(amount))) : parseFloat(amount).toFixed(2),
            }
          }
        },
        description: C.DEMO_DESCRIPTION,
        items: [{
          ...C.DEMO_ITEM,
          unit_amount: {
            currency_code: currency,
            value: C.isZeroDecimal(currency) ? String(Math.round(parseFloat(amount))) : parseFloat(amount).toFixed(2),
          },
        }],
        shipping: C.SANDBOX_SHIPPING,
      }],
    }
  },
})
