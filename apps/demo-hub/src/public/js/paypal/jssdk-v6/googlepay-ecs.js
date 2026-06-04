/**
 * PayPal Google Pay ECS — JSSDK v6
 * Express Checkout Shortcut — buyer selects shipping address, email, phone, shipping method
 * inside the Google Pay sheet.
 *
 * v6 differences vs v5 ECS:
 *   - SDK instance: getPPInstance() → instance.createGooglePayOneTimePaymentSession() (sync)
 *   - config: eligibility.getDetails('googlepay').config + session.formatConfigForPaymentRequest() (sync)
 *   - account eligibility gate: findEligibleMethods({currencyCode}).isEligible('googlepay')
 *   - confirmOrder from googlePaySession (not paypalSDK.Googlepay())
 *   - ECS = FULL CALLBACK mode (required for onPaymentDataChanged real-time shipping):
 *     PaymentsClient carries paymentDataCallbacks:{onPaymentAuthorized, onPaymentDataChanged};
 *     callbackIntents:['SHIPPING_ADDRESS','SHIPPING_OPTION','PAYMENT_AUTHORIZATION']
 *   - orderId lowercase d throughout (v6 rule V6-1)
 *   - 3DS LIMITATION (v6, same as ECM): initiatePayerAction() is no-args + void (no-op);
 *     only SCA_WHEN_REQUIRED (frictionless) is supported; SCA_ALWAYS shows error (known limit).
 *   - R-RISK-1: callback-mode confirmOrder (sheet-open) may hit ERR_CONNECTION_RESET (CN→sandbox);
 *     if so, page shows yellow warning bar and resolves ERROR — non-silent, not downgraded to Promise.
 *
 * window.DEMO = {
 *   clientId, components:['googlepay-payments'], pageType,
 *   urls: { createOrder, getOrder, captureOrder },
 * }
 */
(function () {
  "use strict";

  console.log("[GooglePay-ECS-v6] googlepay-ecs.js loaded");

  // ─── Constants ──────────────────────────────────────────────────────────────

  var ZERO_DECIMAL = ["JPY", "KRW", "TWD", "CLP", "IDR"];

  var SHIPPING_OPTIONS = [
    {
      id: "standard",
      label: "Standard Shipping",
      description: "Arrives in 5–7 days",
      price: "5.00",
    },
    {
      id: "express",
      label: "Express Shipping",
      description: "Arrives in 2–3 days",
      price: "10.00",
    },
  ];

  // ISO 3166-1 alpha-2 → calling code
  var COUNTRY_DIAL = {
    AE: "971",
    AU: "61",
    BR: "55",
    CA: "1",
    CH: "41",
    CL: "56",
    CN: "86",
    CO: "57",
    CZ: "420",
    DK: "45",
    DE: "49",
    FR: "33",
    GB: "44",
    HK: "852",
    HU: "36",
    ID: "62",
    IL: "972",
    IN: "91",
    JP: "81",
    KR: "82",
    MX: "52",
    MY: "60",
    NO: "47",
    NZ: "64",
    PE: "51",
    PH: "63",
    PL: "48",
    SA: "966",
    SE: "46",
    SG: "65",
    TH: "66",
    TW: "886",
    UY: "598",
    US: "1",
  };

  var BASE_REQUEST = {
    apiVersion: 2,
    apiVersionMinor: 0,
  };

  var MIN_AMOUNT = 1.0;
  var MAX_AMOUNT = 30000.0;

  // ─── Module-level state ──────────────────────────────────────────────────────

  var paymentsClient = null;
  var urls = null;
  var chosenShipping = SHIPPING_OPTIONS[0];
  var currentOrderId = null;

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  // Google Pay returns E.164 ("+14155552671"). PayPal needs {country_code, national_number}.
  function parsePhoneNumber(rawPhone, isoCountry) {
    if (!rawPhone) return null;
    var digits = rawPhone.replace(/\D/g, "");
    if (!digits) return null;
    var dialCode = COUNTRY_DIAL[isoCountry] || "";
    if (dialCode && digits.indexOf(dialCode) === 0) {
      return { country_code: dialCode, national_number: digits.slice(dialCode.length) };
    }
    return { country_code: dialCode, national_number: digits };
  }

  function fmtAmt(num, zd) {
    return zd ? String(Math.round(num)) : num.toFixed(2);
  }

  function calcTotal(amount, zd) {
    var item = parseFloat(amount);
    var ship = parseFloat(chosenShipping.price);
    return fmtAmt(item + ship, zd);
  }

  // ─── UI helpers ──────────────────────────────────────────────────────────────

  function getCurrency() {
    var sel = document.getElementById("demo-currency");
    return sel ? sel.value : (window.DEMO && window.DEMO.currency) || "USD";
  }

  function getAmount() {
    var input = document.getElementById("demo-amount");
    return input
      ? input.value.trim()
      : (window.DEMO && window.DEMO.defaultAmount) || "100.00";
  }

  function getSCA() {
    var sel = document.getElementById("demo-sca");
    return sel ? sel.value : "SCA_WHEN_REQUIRED";
  }

  function isZeroDecimal(currency) {
    return ZERO_DECIMAL.indexOf(currency) !== -1;
  }

  function showResult(text, type) {
    var el = document.getElementById("result");
    if (!el) return;
    el.className = "result-msg " + type;
    el.textContent = text;
  }

  function clearLoading() {
    var container = document.getElementById("paypal-button-container");
    if (container) {
      container.classList.remove("sdk-loading");
      container.innerHTML = "";
    }
    return container;
  }

  function validateAmount() {
    var input = document.getElementById("demo-amount");
    var errEl = document.getElementById("amount-error");
    if (!input) return true;
    var val = input.value.trim();
    var num = parseFloat(val);
    var cur = getCurrency();
    var zd = isZeroDecimal(cur);
    var err = "";
    if (!val || isNaN(num) || !/^\d+(\.\d{1,2})?$/.test(val)) {
      err = "Please enter a valid number";
    } else if (num < MIN_AMOUNT) {
      err = "Minimum amount is " + MIN_AMOUNT.toFixed(zd ? 0 : 2);
    } else if (num > MAX_AMOUNT) {
      err = "Maximum amount is " + MAX_AMOUNT.toLocaleString();
    } else if (
      zd &&
      val.indexOf(".") !== -1 &&
      parseFloat(val) !== Math.round(parseFloat(val))
    ) {
      err = cur + " does not support decimal amounts";
    }
    if (err) {
      if (errEl) errEl.textContent = err;
      input.classList.add("amount-input--error");
      return false;
    }
    if (errEl) errEl.textContent = "";
    input.classList.remove("amount-input--error");
    return true;
  }

  // ─── Debug probe (ACDC-style) ────────────────────────────────────────────────

  function inspect(label, obj) {
    try {
      console.group("[GOOGLEPAY-ECS-v6-PROBE] " + label);
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

  // ─── Google Pay: shipping callback (Full Callback mode) ──────────────────────
  //
  // INITIALIZE / SHIPPING_ADDRESS → return newTransactionInfo + newShippingOptionParameters
  // SHIPPING_OPTION → return only newTransactionInfo
  // (Google Pay rule: shippingOptions only allow id/label/description — no price/selected)

  function onPaymentDataChanged(intermediatePaymentData) {
    var currency = getCurrency();
    var amount = getAmount();
    var zd = isZeroDecimal(currency);

    var trigger = intermediatePaymentData.callbackTrigger;
    if (trigger === "SHIPPING_OPTION") {
      var id =
        intermediatePaymentData.shippingOptionData &&
        intermediatePaymentData.shippingOptionData.id;
      var opt =
        SHIPPING_OPTIONS.filter(function (o) {
          return o.id === id;
        })[0] || SHIPPING_OPTIONS[0];
      chosenShipping = opt;
    }
    // INITIALIZE / SHIPPING_ADDRESS: chosenShipping stays SHIPPING_OPTIONS[0] (reset on button click)

    var total = calcTotal(amount, zd);
    var update = {};

    if (trigger === "INITIALIZE" || trigger === "SHIPPING_ADDRESS") {
      update.newShippingOptionParameters = {
        defaultSelectedOptionId: chosenShipping.id,
        shippingOptions: SHIPPING_OPTIONS.map(function (o) {
          return { id: o.id, label: o.label, description: o.description };
        }),
      };
    }

    update.newTransactionInfo = {
      countryCode: "US",
      currencyCode: currency,
      totalPriceStatus: "FINAL",
      totalPrice: total,
      totalPriceLabel: "Total",
      displayItems: [
        {
          label: "Item total",
          type: "SUBTOTAL",
          price: fmtAmt(parseFloat(amount), zd),
        },
        {
          label: chosenShipping.label,
          type: "LINE_ITEM",
          price: chosenShipping.price,
        },
      ],
    };

    return Promise.resolve(update);
  }

  // ─── Google Pay: payment authorization callback ───────────────────────────────
  //
  // Google Pay calls this after user taps Pay (sheet stays in "processing" until resolve).
  // Must return Promise<{ transactionState: 'SUCCESS' | 'ERROR' }>.

  function onPaymentAuthorized(paymentData, googlePaySession) {
    console.log("[GooglePay-ECS-v6] ===== onPaymentAuthorized =====");
    inspect("paymentData", paymentData);

    var amount = getAmount();
    var currency = getCurrency();
    var sca = getSCA();

    return new Promise(function (resolve) {
      var shippingAddress = paymentData.shippingAddress || null;
      var buyerName = shippingAddress ? shippingAddress.name : null;
      var email = paymentData.email || null;
      var rawPhone = shippingAddress ? shippingAddress.phoneNumber : null;
      var isoCountry = shippingAddress ? shippingAddress.countryCode : null;
      var parsedPhone = parsePhoneNumber(rawPhone, isoCountry);

      var selectedShippingId =
        paymentData.shippingOptionData && paymentData.shippingOptionData.id;
      var finalShipping =
        SHIPPING_OPTIONS.filter(function (o) {
          return o.id === selectedShippingId;
        })[0] || chosenShipping;

      console.log("[GooglePay-ECS-v6] shippingAddress:", shippingAddress);
      console.log(
        "[GooglePay-ECS-v6] buyerName:",
        buyerName,
        "| email:",
        email,
      );
      console.log(
        "[GooglePay-ECS-v6] rawPhone:",
        rawPhone,
        "| isoCountry:",
        isoCountry,
        "| parsedPhone:",
        parsedPhone,
      );
      console.log(
        "[GooglePay-ECS-v6] shippingOptionData:",
        paymentData.shippingOptionData,
        "| finalShipping:",
        finalShipping,
      );

      var createBody = {
        amount: amount,
        currency: currency,
        scaMethod: sca,
        shippingAddress: shippingAddress,
        buyerName: buyerName,
        email: email,
        parsedPhone: parsedPhone,
        shippingAmount: finalShipping.price,
      };
      console.log("[GooglePay-ECS-v6] calling createOrder:", urls.createOrder);
      console.log("[GooglePay-ECS-v6] createOrder body:", createBody);

      fetch(urls.createOrder, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createBody),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          inspect("createOrder response", d);
          if (d.error) throw new Error(d.error);
          currentOrderId = d.orderId; // v6: lowercase d
          console.log(
            "[GooglePay-ECS-v6] order created — orderId:",
            currentOrderId,
          );
          return processPayment(currentOrderId, paymentData, googlePaySession);
        })
        .then(function () {
          resolve({ transactionState: "SUCCESS" });
        })
        .catch(function (err) {
          console.error("[GooglePay-ECS-v6] onPaymentAuthorized error:", err);
          showResult("✗ " + (err.message || String(err)), "error");
          resolve({ transactionState: "ERROR" });
        });
    });
  }

  // ─── Core payment orchestration ───────────────────────────────────────────────

  function processPayment(orderId, paymentData, googlePaySession) {
    console.log(
      "[GooglePay-ECS-v6] processPayment() — orderId:",
      orderId,
      "— calling confirmOrder()...",
    );

    return googlePaySession
      .confirmOrder({
        orderId: orderId,
        paymentMethodData: paymentData.paymentMethodData,
      })
      .then(function (result) {
        inspect("confirmOrder result", result);
        console.log(
          "[GooglePay-ECS-v6] confirmOrder status:",
          result && result.status,
        );

        if (result && result.status === "PAYER_ACTION_REQUIRED") {
          return handlePayerAction(orderId, googlePaySession);
        }
        return doCapture(orderId);
      });
  }

  // ─── 3DS handling ─────────────────────────────────────────────────────────────
  // KNOWN v6 LIMITATION (same as ECM, verified 2026-06-03): initiatePayerAction() is
  // no-args + void (no-op). 3DS cannot complete. Callback mode does NOT fix it.
  // SCA_WHEN_REQUIRED (frictionless) is the only supported path.

  function handlePayerAction(orderId, googlePaySession) {
    console.warn(
      "[GooglePay-ECS-v6] PAYER_ACTION_REQUIRED — v6 cannot drive 3DS here (initiatePayerAction is void no-op)",
    );
    inspect("googlePaySession (3DS)", googlePaySession);

    if (typeof googlePaySession.initiatePayerAction === "function") {
      googlePaySession.initiatePayerAction(); // no args, void (best-effort)
    }

    return getOrderDetails(orderId).then(function (order) {
      return handle3DS(order, orderId);
    });
  }

  function getOrderDetails(orderId) {
    var url = urls.getOrder + "/" + orderId;
    console.log("[GooglePay-ECS-v6] GET", url);
    return fetch(url)
      .then(function (r) {
        return r.json();
      })
      .then(function (order) {
        inspect("getOrderDetails response", order);
        if (order.error) throw new Error(order.error);
        return order;
      });
  }

  function handle3DS(order, orderId) {
    var authResult =
      (order.payment_source &&
        order.payment_source.google_pay &&
        order.payment_source.google_pay.card &&
        order.payment_source.google_pay.card.authentication_result) ||
      {};
    var threeDS = authResult.three_d_secure || {};
    var ls = authResult.liability_shift;
    var enrollment = threeDS.enrollment_status;
    var authStatus = threeDS.authentication_status;

    inspect("3DS authentication_result", authResult);
    console.log(
      "[GooglePay-ECS-v6] liability_shift:",
      ls,
      "| enrollment:",
      enrollment,
      "| authStatus:",
      authStatus,
    );

    if (ls === "POSSIBLE") {
      console.log("[GooglePay-ECS-v6] 3DS: liability shifted — capturing");
      return doCapture(orderId);
    }

    if (ls === "NO") {
      if (["N", "U", "B"].indexOf(enrollment) !== -1) {
        console.log(
          "[GooglePay-ECS-v6] 3DS: card not enrolled (" +
            enrollment +
            ") — capturing",
        );
        return doCapture(orderId);
      }
      throw new Error(
        "3DS rejected · enrollment: " +
          enrollment +
          " · authStatus: " +
          authStatus,
      );
    }

    if (ls === "UNKNOWN") {
      throw new Error("3DS result unknown · Please retry");
    }

    throw new Error("3DS error · liability_shift: " + (ls || "undefined"));
  }

  // ─── Capture order ────────────────────────────────────────────────────────────

  function doCapture(orderId) {
    console.log("[GooglePay-ECS-v6] ===== doCapture() — orderId:", orderId);

    return fetch(urls.captureOrder, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: orderId }), // v6: lowercase d
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (order) {
        inspect("captureOrder response", order);
        if (order.error) throw new Error(order.error);

        var capture =
          order.purchase_units &&
          order.purchase_units[0] &&
          order.purchase_units[0].payments &&
          order.purchase_units[0].payments.captures &&
          order.purchase_units[0].payments.captures[0];
        inspect("capture object", capture);

        if (!capture || capture.status !== "COMPLETED") {
          throw new Error(
            "Capture failed · status: " +
              (capture ? capture.status : "unknown"),
          );
        }

        console.log(
          "[GooglePay-ECS-v6] ===== capture COMPLETED ===== orderId:",
          order.id,
        );
        showResult("✓ Payment captured · Order: " + order.id, "success");
      });
  }

  // ─── Button click — opens Google Pay sheet (callback mode) ───────────────────

  function onGooglePayButtonClicked(googlePayConfig) {
    console.log("[GooglePay-ECS-v6] ===== Google Pay button clicked =====");
    if (!validateAmount()) {
      console.warn("[GooglePay-ECS-v6] amount validation failed — aborting");
      return;
    }

    var amount = getAmount();
    var currency = getCurrency();
    var zd = isZeroDecimal(currency);

    chosenShipping = SHIPPING_OPTIONS[0]; // reset before each sheet open
    var itemPrice = fmtAmt(parseFloat(amount), zd);

    var req = Object.assign({}, BASE_REQUEST, {
      allowedPaymentMethods: googlePayConfig.allowedPaymentMethods,
      merchantInfo: googlePayConfig.merchantInfo,
      transactionInfo: {
        countryCode: "US",
        currencyCode: currency,
        totalPriceStatus: "ESTIMATED",
        totalPrice: itemPrice,
        totalPriceLabel: "Total",
        displayItems: [{ label: "Item total", type: "SUBTOTAL", price: itemPrice }],
      },
      shippingAddressRequired: true,
      shippingAddressParameters: { phoneNumberRequired: true },
      emailRequired: true,
      shippingOptionRequired: true,
      shippingOptionParameters: {
        defaultSelectedOptionId: SHIPPING_OPTIONS[0].id,
        shippingOptions: SHIPPING_OPTIONS.map(function (o) {
          return { id: o.id, label: o.label, description: o.description };
        }),
      },
      callbackIntents: ["SHIPPING_ADDRESS", "SHIPPING_OPTION", "PAYMENT_AUTHORIZATION"],
    });
    inspect("paymentDataRequest", req);

    // Callback mode: loadPaymentData without .then() — Google Pay drives flow via callbacks
    console.log(
      "[GooglePay-ECS-v6] calling loadPaymentData() — sheet opens (callback mode)",
    );
    paymentsClient.loadPaymentData(req).catch(function (err) {
      if (err && err.statusCode === "CANCELED") {
        console.log("[GooglePay-ECS-v6] user cancelled Google Pay sheet");
        return;
      }
      console.error("[GooglePay-ECS-v6] loadPaymentData error:", err);
      showResult("✗ " + (err.message || String(err)), "error");
    });
  }

  // ─── Button setup ─────────────────────────────────────────────────────────────

  function setupGooglePayButton(instance, details) {
    // createGooglePayOneTimePaymentSession — sync per V6-GOOGLEPAY-5
    var googlePaySession = instance.createGooglePayOneTimePaymentSession();
    inspect("googlePaySession", googlePaySession);

    var googlePayConfig = googlePaySession.formatConfigForPaymentRequest(
      details.config,
    );
    inspect("googlePayConfig (formatConfigForPaymentRequest)", googlePayConfig);

    // Full Callback mode: pass paymentDataCallbacks with closure over googlePaySession
    paymentsClient = new google.payments.api.PaymentsClient({
      environment: "TEST",
      paymentDataCallbacks: {
        onPaymentAuthorized: function (paymentData) {
          return onPaymentAuthorized(paymentData, googlePaySession);
        },
        onPaymentDataChanged: onPaymentDataChanged,
      },
    });
    inspect("paymentsClient", paymentsClient);

    paymentsClient
      .isReadyToPay({
        apiVersion: googlePayConfig.apiVersion || BASE_REQUEST.apiVersion,
        apiVersionMinor:
          googlePayConfig.apiVersionMinor || BASE_REQUEST.apiVersionMinor,
        allowedPaymentMethods: googlePayConfig.allowedPaymentMethods,
      })
      .then(function (resp) {
        inspect("isReadyToPay", resp);
        if (!resp.result) {
          clearLoading();
          showResult(
            "Google Pay is not available on this device or account.",
            "error",
          );
          return;
        }

        // Official Google Pay button
        var btn = paymentsClient.createButton({
          buttonColor: "black",
          buttonType: "pay",
          buttonSizeMode: "fill",
          onClick: function () {
            onGooglePayButtonClicked(googlePayConfig);
          },
        });
        var container = clearLoading();
        container.appendChild(btn);
        console.log("[GooglePay-ECS-v6] official Google Pay button appended");

        // Custom button — same handler
        var customBtn = document.getElementById("custom-googlepay-btn");
        if (customBtn) {
          customBtn.disabled = false;
          customBtn.style.opacity = "1";
          customBtn.style.cursor = "pointer";
          customBtn.addEventListener("mouseenter", function () {
            this.style.background = "var(--border)";
            this.style.borderColor = "var(--border-hi)";
          });
          customBtn.addEventListener("mouseleave", function () {
            this.style.background = "var(--surface2)";
            this.style.borderColor = "var(--border-hi)";
          });
          customBtn.addEventListener("mousedown", function () {
            this.style.transform = "scale(0.98)";
          });
          customBtn.addEventListener("mouseup", function () {
            this.style.transform = "scale(1)";
          });
          customBtn.addEventListener("click", function () {
            onGooglePayButtonClicked(googlePayConfig);
          });
          console.log("[GooglePay-ECS-v6] custom button enabled");
        }
      })
      .catch(function (err) {
        clearLoading();
        console.error("[GooglePay-ECS-v6] isReadyToPay error:", err);
        showResult(
          "✗ Google Pay error: " + (err.message || String(err)),
          "error",
        );
      });
  }

  // ─── SDK entry ─────────────────────────────────────────────────────────────────

  function onPayPalWebSdkLoaded() {
    console.log("[GooglePay-ECS-v6] onPayPalWebSdkLoaded()");

    getPPInstance()
      .then(function (instance) {
        inspect("instance", instance);

        // Google Pay SDK availability (browser)
        var googleSdkOk =
          window.google &&
          window.google.payments &&
          window.google.payments.api &&
          window.google.payments.api.PaymentsClient;
        if (!googleSdkOk) {
          clearLoading();
          showResult("Google Pay SDK is not available", "error");
          return;
        }

        // V6-3: nested .then() keeps instance in scope
        return instance
          .findEligibleMethods({ currencyCode: getCurrency() })
          .then(function (eligibility) {
            inspect("eligibility", eligibility);

            if (!eligibility.isEligible("googlepay")) {
              clearLoading();
              showResult(
                "Google Pay is not eligible for this account.",
                "error",
              );
              return;
            }

            var details = eligibility.getDetails("googlepay");
            inspect("getDetails(googlepay)", details);
            setupGooglePayButton(instance, details);
          });
      })
      .catch(function (err) {
        clearLoading();
        console.error("[GooglePay-ECS-v6] config/init error:", err);
        showResult(
          "✗ Google Pay config error: " + (err.message || String(err)),
          "error",
        );
      });
  }

  // ─── Currency selector ──────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    var currencySel = document.getElementById("demo-currency");
    if (!currencySel) return;
    currencySel.addEventListener("change", function () {
      var amtInput = document.getElementById("demo-amount");
      var url = new URL(window.location.href);
      url.searchParams.set("currency", this.value);
      if (amtInput) url.searchParams.set("amount", amtInput.value.trim());
      window.location.replace(url.toString());
    });
  });

  // ─── window.load entry ───────────────────────────────────────────────────────────

  window.addEventListener("load", function () {
    console.log(
      "[GooglePay-ECS-v6] window.load, typeof paypal =",
      typeof paypal,
    );

    urls = window.DEMO && window.DEMO.urls;
    inspect("window.DEMO", window.DEMO);

    if (typeof paypal === "undefined") {
      showResult("✗ PayPal SDK failed to load", "error");
      return;
    }

    var amountInput = document.getElementById("demo-amount");
    if (amountInput) {
      amountInput.addEventListener("blur", function () {
        var num = parseFloat(this.value);
        if (!isNaN(num) && num > 0) {
          this.value = isZeroDecimal(getCurrency())
            ? String(Math.round(num))
            : num.toFixed(2);
        }
        validateAmount();
      });
    }

    onPayPalWebSdkLoaded();
  });
})();
