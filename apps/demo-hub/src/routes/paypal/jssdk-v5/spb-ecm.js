const { createStandardRoute } = require("./_factory");
const demoParams = require("../../../config/constants");

module.exports = createStandardRoute({
  productKey: "spb-ecm",
  sdkParams:
    "components=buttons&commit=true&buyer-country=US&disable-funding=bancontact,blik,eps,giropay,ideal,mercadopago,mybank,p24,sepa,sofort",
  view: "paypal/jssdk-v5/spb-ecm",

  buildBody: function (amount, currency) {
    const zd = demoParams.isZeroDecimal(currency);
    const val = zd
      ? String(Math.round(parseFloat(amount)))
      : parseFloat(amount).toFixed(2);
    const amountObj = (curr) => ({ currency_code: curr, value: val });

    return {
      intent: demoParams.INTENT.CAPTURE,

      payment_source: {
        paypal: {
          ...demoParams.SANDBOX_BUYER, // email_address, name, address, phone
          experience_context: demoParams.EXPERIENCE_CONTEXT, // brand_name, landing_page, user_action, return_url, cancel_url
        },
      },

      purchase_units: [
        {
          reference_id: demoParams.DEMO_REFERENCE_ID,
          description: demoParams.DEMO_DESCRIPTION,
          invoice_id: `INV-${Date.now()}`, // 每次生成，不做常量
          custom_id: demoParams.DEMO_CUSTOM_ID,
          soft_descriptor: demoParams.DEMO_SOFT_DESCRIPTOR,

          amount: {
            currency_code: currency,
            value: val,
            breakdown: { item_total: amountObj(currency) },
          },

          items: [
            {
              ...demoParams.DEMO_ITEM, // name, sku, description, url, category, quantity
              unit_amount: amountObj(currency),
            },
          ],

          shipping: demoParams.SANDBOX_SHIPPING, // name.full_name + address
        },
      ],
    };
  },
});
