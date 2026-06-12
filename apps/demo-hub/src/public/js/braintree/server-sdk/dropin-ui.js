(function () {
  "use strict";

  console.log("[dropin-ui] dropin-ui.js loaded");

  // ── 常量 ────────────────────────────────────────────────────────────────────
  var MERCHANT_NAME = "CWEN5 BT DROPIN DEMO STORE";

  // 账单联系人 / 地址（3DS billingAddress）
  var BILLING_FIRST_NAME = "John";
  var BILLING_LAST_NAME = "Doe";
  var BILLING_EMAIL = "john.doe@example.com";
  var BILLING_PHONE = "3125551212";
  var BILLING_STREET_ADDRESS = "1 E Main St";
  var BILLING_EXTENDED_ADDRESS = "Suite 403";
  var BILLING_LOCALITY = "Chicago";
  var BILLING_REGION = "IL";
  var BILLING_POSTAL_CODE = "60622";
  var BILLING_COUNTRY_CODE = "US";

  // 收货联系人 / 地址（3DS additionalInformation.shippingAddress + PayPal shippingAddressOverride）
  var SHIPPING_FIRST_NAME = "Jane";
  var SHIPPING_LAST_NAME = "Smith";
  var SHIPPING_STREET_ADDRESS = "456 Market St";
  var SHIPPING_EXTENDED_ADDRESS = "Apt 12";
  var SHIPPING_LOCALITY = "San Francisco";
  var SHIPPING_REGION = "CA";
  var SHIPPING_POSTAL_CODE = "94105";
  var SHIPPING_COUNTRY_CODE = "US";

  // PayPal Drop-in 专属配置常量（前端无法 require bt-constants，故此处单独声明）
  var PAYPAL_DISPLAY_NAME = "Cross Wen BT Store";
  var PAYPAL_LANDING_PAGE = "login"; // 'login' | 'billing'
  // PayPal lineItems（字段与 Braintree transaction.sale lineItems 一致）
  var PP_ITEM_NAME = "Demo Product";
  var PP_ITEM_KIND = "debit";
  var PP_ITEM_QUANTITY = "1";
  var PP_ITEM_DESCRIPTION = "Braintree Drop-in Demo Purchase";
  var PP_ITEM_PRODUCT_CODE = "BT-DEMO-001";
  var PP_ITEM_URL = "https://cwen5.com";

  // Google Pay Drop-in 专属配置常量
  var GP_COUNTRY_CODE    = "US";
  var GP_TOTAL_LABEL     = "Total";
  var GP_CHECKOUT_OPTION = "COMPLETE_IMMEDIATE_PURCHASE"; // 按钮显示 "Pay now"
  var GP_BUTTON_COLOR    = "black";  // 'black' | 'white' | 'white-outline'
  var GP_BUTTON_TYPE     = "pay";    // 'pay' | 'buy' | 'checkout' | ...
  var GP_BUTTON_SIZE     = "fill";   // 'fill' | 'static'

  var currentAmount = DEMO.amount;
  var currentCurrency = DEMO.currency;
  var dropinInstance = null;

  // ── Debug probe ────────────────────────────────────────────────────────────
  function inspect(label, obj) {
    try {
      console.group("[dropin-PROBE] " + label);
      console.log("value:", obj);
      console.dir(obj);
      if (obj && typeof obj === "object") {
        console.log("own keys     :", Object.keys(obj));
        console.log("own props    :", Object.getOwnPropertyNames(obj));
        var proto = Object.getPrototypeOf(obj);
        console.log("proto        :", proto);
        if (proto)
          console.log("proto methods:", Object.getOwnPropertyNames(proto));
      }
    } finally {
      console.groupEnd();
    }
  }

  function showResult(msg, type) {
    var el = document.getElementById("result");
    el.textContent = msg;
    el.className = "result-msg " + type;
  }

  function showResponseData(data) {
    var el = document.getElementById("response-data");
    el.textContent = JSON.stringify(data, null, 2);
    el.style.display = "block";
  }

  function clearResponseData() {
    var el = document.getElementById("response-data");
    el.textContent = "";
    el.style.display = "none";
  }

  function buildDropInOptions() {
    // paypal 和 paypalCredit 共享同一份配置对象
    var paypalConfig = {
      flow:                    "checkout",
      intent:                  "capture",
      offerCredit:             true,
      amount:                  currentAmount,
      currency:                currentCurrency,
      displayName:             PAYPAL_DISPLAY_NAME,
      enableShippingAddress:   true,
      shippingAddressEditable: false,
      landingPageType:         PAYPAL_LANDING_PAGE,
      userAction:              "COMMIT",
      shippingAddressOverride: {
        line1:         SHIPPING_STREET_ADDRESS,
        line2:         SHIPPING_EXTENDED_ADDRESS,
        city:          SHIPPING_LOCALITY,
        state:         SHIPPING_REGION,
        postalCode:    SHIPPING_POSTAL_CODE,
        countryCode:   SHIPPING_COUNTRY_CODE,
        recipientName: SHIPPING_FIRST_NAME + " " + SHIPPING_LAST_NAME,
        phone:         BILLING_PHONE,
      },
      lineItems: [{
        name:        PP_ITEM_NAME,
        kind:        PP_ITEM_KIND,
        quantity:    PP_ITEM_QUANTITY,
        unitAmount:  currentAmount,
        description: PP_ITEM_DESCRIPTION,
        productCode: PP_ITEM_PRODUCT_CODE,
        url:         PP_ITEM_URL,
      }],
      amountBreakdown: {
        itemTotal: currentAmount,
      },
    };

    var opts = {
      authorization: DEMO.clientToken,
      container: "#dropin-container",
      dataCollector: true,
      translations: { chooseAWayToPay: "" },
      paymentOptionPriority: ["card", "paypal", "venmo", "paypalCredit", "applePay", "googlePay"],
      card: {
        vaultCard: false, // 3DS + CVV rules: default vaulting causes processor CVV error (Braintree docs)
        overrides: { fields: { cvv: { placeholder: "•••" } } },
      },
      paypal:       paypalConfig,
      paypalCredit: paypalConfig, // 同一对象，配置始终一致
      venmo: { allowNewBrowserTab: false },
      applePay: {
        displayName: MERCHANT_NAME,
        paymentRequest: {
          total: { label: MERCHANT_NAME, amount: currentAmount },
          currencyCode: currentCurrency,
        },
      },
      googlePay: {
        googlePayVersion: 2,
        transactionInfo: {
          countryCode:      GP_COUNTRY_CODE,
          currencyCode:     currentCurrency,
          totalPriceStatus: "FINAL",
          totalPrice:       currentAmount,
          totalPriceLabel:  GP_TOTAL_LABEL,
          checkoutOption:   GP_CHECKOUT_OPTION,
        },
        button: {
          buttonColor:    GP_BUTTON_COLOR,
          buttonType:     GP_BUTTON_TYPE,
          buttonSizeMode: GP_BUTTON_SIZE,
        },
      },
    };
    // threeDSecure: true must be passed at create time (cannot be added dynamically)
    if (document.getElementById("threeds-toggle").checked) {
      opts.threeDSecure = true;
    }
    return opts;
  }

  function recreateDropIn() {
    var payBtn = document.getElementById("pay-btn");
    payBtn.disabled = true;
    payBtn.style.display = "";
    document.getElementById("reset-btn").style.display = "none";
    document.getElementById("dropin-container").innerHTML = "";
    var dropInOpts = buildDropInOptions();
    console.log("[dropin-ui] dropin.create options:", dropInOpts);
    braintree.dropin.create(dropInOpts, function (err, instance) {
      if (err) {
        showResult("✗ Drop-in init failed: " + err.message, "error");
        return;
      }
      console.log("[dropin-ui] instance created");
      inspect("instance", instance);
      dropinInstance = instance;
      wireDropIn(instance);
    });
  }

  function teardownAndRecreate() {
    if (dropinInstance) {
      dropinInstance.teardown(function () {
        dropinInstance = null;
        recreateDropIn();
      });
    } else {
      recreateDropIn();
    }
  }

  function wireControls() {
    // 币种切换：需要新 clientToken（merchantAccountId 不同），自动 reload
    document
      .getElementById("demo-currency")
      .addEventListener("change", function () {
        var newCurrency = this.value;
        var newAmount =
          document.getElementById("demo-amount").value || currentAmount;
        window.location.href =
          "?currency=" + newCurrency + "&amount=" + newAmount;
      });

    // 金额变更：更新变量 + 通知 Drop-in 各支付方式同步新金额（无需重建）
    document
      .getElementById("demo-amount")
      .addEventListener("change", function () {
        currentAmount = this.value || currentAmount;
        if (!dropinInstance) return;
        var newLineItems = [{
          name: PP_ITEM_NAME, kind: PP_ITEM_KIND, quantity: PP_ITEM_QUANTITY,
          unitAmount: currentAmount, description: PP_ITEM_DESCRIPTION,
          productCode: PP_ITEM_PRODUCT_CODE, url: PP_ITEM_URL,
        }];
        var newBreakdown = { itemTotal: currentAmount };
        // paypal 和 paypalCredit 保持同步
        ["paypal", "paypalCredit"].forEach(function (key) {
          dropinInstance.updateConfiguration(key, "amount", currentAmount);
          dropinInstance.updateConfiguration(key, "lineItems", newLineItems);
          dropinInstance.updateConfiguration(key, "amountBreakdown", newBreakdown);
        });
        dropinInstance.updateConfiguration("applePay", "paymentRequest", {
          total: { label: MERCHANT_NAME, amount: currentAmount },
          currencyCode: currentCurrency,
        });
        dropinInstance.updateConfiguration("googlePay", "transactionInfo", {
          countryCode:      GP_COUNTRY_CODE,
          currencyCode:     currentCurrency,
          totalPriceStatus: "FINAL",
          totalPrice:       currentAmount,
          totalPriceLabel:  GP_TOTAL_LABEL,
          checkoutOption:   GP_CHECKOUT_OPTION,
        });
      });

    // 3DS toggle: threeDSecure option must be set at dropin.create time
    document
      .getElementById("threeds-toggle")
      .addEventListener("change", teardownAndRecreate);

    document.getElementById("reset-btn").addEventListener("click", function () {
      clearResponseData();
      var el = document.getElementById("result");
      el.textContent = "";
      el.className = "result-msg";
      teardownAndRecreate();
    });
  }

  function wireDropIn(instance) {
    var payBtn = document.getElementById("pay-btn");

    var requestable = instance.isPaymentMethodRequestable();
    console.log(
      "[dropin-ui] isPaymentMethodRequestable (initial):",
      requestable,
    );
    if (requestable) payBtn.disabled = false;

    instance.on("paymentMethodRequestable", function () {
      payBtn.disabled = false;
    });
    instance.on("noPaymentMethodRequestable", function () {
      payBtn.disabled = true;
    });

    // Use onclick assignment so each recreate replaces the old handler (avoids stale-instance calls)
    payBtn.onclick = function () {
      onPayClick(instance, payBtn);
    };
  }

  function onPayClick(instance, payBtn) {
    payBtn.disabled = true;

    var threeDsEnabled = document.getElementById("threeds-toggle").checked;

    var requestOpts = {};
    if (threeDsEnabled) {
      requestOpts.threeDSecure = {
        amount: currentAmount,
        email: BILLING_EMAIL,
        billingAddress: {
          givenName: BILLING_FIRST_NAME,
          surname: BILLING_LAST_NAME,
          phoneNumber: BILLING_PHONE,
          streetAddress: BILLING_STREET_ADDRESS,
          extendedAddress: BILLING_EXTENDED_ADDRESS,
          locality: BILLING_LOCALITY,
          region: BILLING_REGION,
          postalCode: BILLING_POSTAL_CODE,
          countryCodeAlpha2: BILLING_COUNTRY_CODE,
        },
        collectDeviceData: true,
        additionalInformation: {
          shippingGivenName: SHIPPING_FIRST_NAME,
          shippingSurname: SHIPPING_LAST_NAME,
          shippingAddress: {
            streetAddress: SHIPPING_STREET_ADDRESS,
            extendedAddress: SHIPPING_EXTENDED_ADDRESS,
            locality: SHIPPING_LOCALITY,
            region: SHIPPING_REGION,
            postalCode: SHIPPING_POSTAL_CODE,
            countryCodeAlpha2: SHIPPING_COUNTRY_CODE,
          },
        },
      };
    }

    console.log("[dropin-ui] requestPaymentMethod opts:", requestOpts);
    instance.requestPaymentMethod(requestOpts, function (err, payload) {
      if (err) {
        showResult("✗ " + err.message, "error");
        payBtn.disabled = false;
        return;
      }

      console.group("[dropin-PROBE] requestPaymentMethod payload");
      console.log("type       :", payload.type);
      console.log("nonce      :", payload.nonce);
      console.log(
        "deviceData :",
        payload.deviceData ? payload.deviceData.slice(0, 40) + "…" : undefined,
      );
      if (payload.threeDSecureInfo)
        console.log("3DS info   :", payload.threeDSecureInfo);
      console.log("full payload:", payload);
      console.groupEnd();

      fetch(DEMO.urls.transaction, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nonce:        payload.nonce,
          deviceData:   payload.deviceData,
          paymentType:  payload.type,
          amount:       currentAmount,
          currency:     currentCurrency,
          // PayPal：从 payload.details 提取买家联系方式传给后端
          payerEmail:   payload.details && payload.details.email   || undefined,
          payerPhone:   payload.details && payload.details.phone   || undefined,
          payerCountry: payload.details && payload.details.countryCode || undefined,
        }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          inspect("transaction", data.transaction || data);
          if (data.error) {
            showResult("✗ " + data.error, "error");
            clearResponseData();
            instance.clearSelectedPaymentMethod();
            payBtn.disabled = false;
          } else {
            showResult(
              "✓ " + data.status + " · TX: " + data.transactionId + " · " + payload.type,
              "success",
            );
            showResponseData(data.transaction || data);
            payBtn.style.display = "none";
            document.getElementById("reset-btn").style.display = "block";
          }
        })
        .catch(function (e) {
          showResult("✗ Network error: " + e.message, "error");
          payBtn.disabled = false;
        });
    });
  }

  wireControls();
  recreateDropIn();
})();
