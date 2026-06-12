const { createBraintreeRoute } = require("./_factory");
const C = require("../../../config/bt-constants");

module.exports = createBraintreeRoute({
  productKey: "dropin-ui",
  view: "braintree/server-sdk/dropin-ui",

  clientTokenOptions: function (req) {
    var currency = req.query.currency || "USD";
    var mid =
      currency === "EUR"
        ? process.env.BRAINTREE_US_EUR_MERCHANT_ACCOUNT_ID
        : process.env.BRAINTREE_US_USD_MERCHANT_ACCOUNT_ID;
    return mid ? { merchantAccountId: mid } : {};
  },

  buildTransaction: function (nonce, amount, extra) {
    var paymentType = extra.paymentType || "";
    var currency    = extra.currency    || "USD";

    var params = {
      amount:             amount,
      paymentMethodNonce: nonce,
      deviceData:         extra.deviceData,
      merchantAccountId:
        currency === "EUR"
          ? process.env.BRAINTREE_US_EUR_MERCHANT_ACCOUNT_ID
          : process.env.BRAINTREE_US_USD_MERCHANT_ACCOUNT_ID,
      orderId: "DEMO-BT-" + Date.now(),
      customer: {
        firstName:         C.BILLING_FIRST_NAME,
        lastName:          C.BILLING_LAST_NAME,
        email:             C.BILLING_EMAIL,
        internationalPhone: {
          countryCode:    C.COUNTRY_DIAL_MAP[C.BILLING_COUNTRY_CODE] || "1",
          nationalNumber: C.BILLING_PHONE,
        },
      },
      billing: {
        firstName:         C.BILLING_FIRST_NAME,
        lastName:          C.BILLING_LAST_NAME,
        streetAddress:     C.BILLING_STREET_ADDRESS,
        extendedAddress:   C.BILLING_EXTENDED_ADDRESS,
        locality:          C.BILLING_LOCALITY,
        region:            C.BILLING_REGION,
        postalCode:        C.BILLING_POSTAL_CODE,
        countryCodeAlpha2: C.BILLING_COUNTRY_CODE,
      },
      shipping: {
        firstName:         C.SHIPPING_FIRST_NAME,
        lastName:          C.SHIPPING_LAST_NAME,
        streetAddress:     C.SHIPPING_STREET_ADDRESS,
        extendedAddress:   C.SHIPPING_EXTENDED_ADDRESS,
        locality:          C.SHIPPING_LOCALITY,
        region:            C.SHIPPING_REGION,
        postalCode:        C.SHIPPING_POSTAL_CODE,
        countryCodeAlpha2: C.SHIPPING_COUNTRY_CODE,
        shippingMethod:    C.SHIPPING_METHOD,
        internationalPhone: {
          countryCode:    C.COUNTRY_DIAL_MAP[C.SHIPPING_COUNTRY_CODE] || "1",
          nationalNumber: C.BILLING_PHONE,
        },
      },
      taxAmount:           C.TAX_AMOUNT,           // Level 2；与前端 amountBreakdown.taxTotal 对应
      purchaseOrderNumber: C.PURCHASE_ORDER_NUMBER, // Level 2
      lineItems: [{
        name:            C.LINE_ITEM_NAME,
        kind:            C.LINE_ITEM_KIND,
        quantity:        C.LINE_ITEM_QUANTITY,
        unitAmount:      amount,         // 动态：与 transaction amount 一致
        totalAmount:     amount,         // quantity(1) × unitAmount
        description:     C.LINE_ITEM_DESCRIPTION,
        productCode:     C.LINE_ITEM_PRODUCT_CODE,
        commodityCode:   C.LINE_ITEM_COMMODITY_CODE,
        unitOfMeasure:   C.LINE_ITEM_UNIT_OF_MEASURE,
        url:             C.LINE_ITEM_URL,
      }],
      descriptor: {
        name:  C.DESCRIPTOR_NAME,
        phone: C.DESCRIPTOR_PHONE,
        url:   C.DESCRIPTOR_URL,
      },
      options: {
        submitForSettlement: true,
      },
    };

    if (paymentType === "PayPalAccount") {
      params.options.paypal = {
        description: C.PAYPAL_DESC,
        customField: C.PAYPAL_FIELD,
      };

      // 用 PayPal payload.details 里的真实买家联系方式覆盖默认常量
      if (extra.payerEmail) {
        params.customer.email = extra.payerEmail;
      }
      if (extra.payerPhone) {
        var dialCode = C.COUNTRY_DIAL_MAP[extra.payerCountry] || "1";
        var intlPhone = { countryCode: dialCode, nationalNumber: extra.payerPhone };
        params.customer.internationalPhone = intlPhone;
        params.shipping.internationalPhone = intlPhone;
      }
    }

    if (paymentType === "VenmoAccount") {
      params.descriptor = { name: C.DESCRIPTOR_NAME };
    }

    console.log(
      "[dropin-ui] buildTransaction params:",
      JSON.stringify(params, null, 2),
    );
    return params;
  },
});
