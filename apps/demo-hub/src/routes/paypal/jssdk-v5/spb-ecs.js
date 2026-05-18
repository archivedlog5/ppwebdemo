const { createStandardRoute } = require("./_factory");
const demoParams = require("../../../config/constants");

module.exports = createStandardRoute({
  productKey: "spb-ecs",
  sdkParams:
    "components=buttons&commit=false&buyer-country=US&disable-funding=bancontact,blik,eps,giropay,ideal,mercadopago,mybank,p24,sepa,sofort",
  view: "paypal/jssdk-v5/spb-ecs",

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
          // ECS: no pre-filled buyer info, just experience_context
          experience_context: {
            ...demoParams.EXPERIENCE_CONTEXT, // brand_name, landing_page, return_url, cancel_url
            shipping_preference: "GET_FROM_FILE", // PayPal gets address from buyer account
            user_action: "CONTINUE", // buyer sees "Continue" not "Pay Now"
          },
        },
      },

      purchase_units: [
        {
          reference_id: demoParams.DEMO_REFERENCE_ID,
          description: demoParams.DEMO_DESCRIPTION,
          invoice_id: `INV-${Date.now()}`,
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

          // No shipping — GET_FROM_FILE: PayPal fetches address from buyer's account
        },
      ],
    };
  },
});
