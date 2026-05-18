const { createStandardRoute } = require("./_factory");

module.exports = createStandardRoute({
  productKey: "spb-ecm",
  sdkParams:
    "components=buttons&currency=USD&buyer-country=US&disable-funding=bancontact,blik,eps,giropay,ideal,mercadopago,mybank,p24,sepa,sofort",
  view: "paypal/jssdk-v5/spb-ecm",
  orderBody: {
    intent: "CAPTURE",
    purchase_units: [{ amount: { currency_code: "USD", value: "100.00" } }],
  },
});
