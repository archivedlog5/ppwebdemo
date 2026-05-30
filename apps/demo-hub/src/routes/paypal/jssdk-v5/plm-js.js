const { createStandardRoute } = require("./_factory");
const demoParams = require("../../../config/constants");

module.exports = createStandardRoute({
  productKey: "plm-js",
  sdkParams: "components=messages",
  view: "paypal/jssdk-v5/plm-js",

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
          ...demoParams.SANDBOX_BUYER,
          experience_context: demoParams.EXPERIENCE_CONTEXT,
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
          items: [{ ...demoParams.DEMO_ITEM, unit_amount: amountObj(currency) }],
          shipping: demoParams.SANDBOX_SHIPPING,
        },
      ],
    };
  },
});
