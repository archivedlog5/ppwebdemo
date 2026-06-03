/**
 * PayPal Google Pay ECM — JSSDK v6
 * Express Checkout Mark — merchant pre-fills shipping, shippingAddressRequired: false.
 *
 * v6 differences vs v5 (see jssdk-v6/CLAUDE.md "Google Pay 专属规则"):
 *   - SDK instance: getPPInstance() → instance.createGooglePayOneTimePaymentSession() (sync)
 *   - config: eligibility.getDetails('googlepay').config + session.formatConfigForPaymentRequest() (sync)
 *   - account eligibility gate: findEligibleMethods({currencyCode}).isEligible('googlepay')
 *   - confirmOrder from googlePaySession
 *   - ECM = PROMISE mode (v5-style): PaymentsClient carries NO paymentDataCallbacks; the
 *     loadPaymentData request has NO callbackIntents. loadPaymentData(req).then(paymentData)
 *     resolves when the sheet closes, then createOrder → confirmOrder → capture runs.
 *   - 3DS LIMITATION (v6, verified 2026-06-03): a PAYER_ACTION_REQUIRED order cannot be driven
 *     to completion here. googlePaySession.initiatePayerAction() is no-args + void (no-op once
 *     the sheet has closed) and the session has no resume(). Callback mode does NOT fix this.
 *     Frictionless (SCA_WHEN_REQUIRED) is the supported path; SCA_ALWAYS 3DS is unsupported.
 *
 * window.DEMO = {
 *   clientId, components:['googlepay-payments'], pageType,
 *   urls: { createOrder, getOrder, captureOrder },
 *   shipping: { name, addressLine1, adminArea2, adminArea1, postalCode, countryCode },
 * }
 */
(function () {
  "use strict";

  console.log("[GooglePay-ECM-v6] googlepay-ecm.js loaded");

  // ─── Constants ──────────────────────────────────────────────────────────────

  var ZERO_DECIMAL = ["JPY", "KRW", "TWD", "CLP", "IDR"];

  var BASE_REQUEST = {
    apiVersion: 2,
    apiVersionMinor: 0,
  };

  var MIN_AMOUNT = 1.0;
  var MAX_AMOUNT = 30000.0;

  // ─── Module-level state ──────────────────────────────────────────────────────

  var paymentsClient = null; // google.payments.api.PaymentsClient (with callbacks)
  var urls = null; // window.DEMO.urls

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
      console.group("[GOOGLEPAY-v6-PROBE] " + label);
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

  // ─── Google Pay: request builder ──────────────────────────────────────────────

  function getGooglePaymentDataRequest(config, amount, currency) {
    // config = formatConfigForPaymentRequest output (includes allowedPaymentMethods w/ tokenizationSpecification,
    // merchantInfo, apiVersion, apiVersionMinor). Promise mode: NO callbackIntents.
    var req = Object.assign({}, BASE_REQUEST, {
      allowedPaymentMethods: config.allowedPaymentMethods,
      merchantInfo: config.merchantInfo,
      transactionInfo: {
        countryCode: "US",
        currencyCode: currency,
        totalPriceStatus: "FINAL",
        totalPrice: amount,
        totalPriceLabel: "Total",
      },
      shippingAddressRequired: false,
      emailRequired: true,
    });
    inspect("paymentDataRequest", req);
    return req;
  }

  // ─── Core payment orchestration ───────────────────────────────────────────────

  function processPayment(orderId, paymentData, googlePaySession) {
    console.log(
      "[GooglePay-ECM-v6] processPayment() — orderId:",
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
          "[GooglePay-ECM-v6] confirmOrder status:",
          result && result.status,
        );

        if (result && result.status === "PAYER_ACTION_REQUIRED") {
          return handlePayerAction(orderId, googlePaySession);
        }
        return doCapture(orderId);
      });
  }

  // ─── 3DS handling ─────────────────────────────────────────────────────────────
  // KNOWN v6 LIMITATION (verified 2026-06-03): once the sheet closes the order may be
  // PAYER_ACTION_REQUIRED, but googlePaySession.initiatePayerAction() is no-args + void
  // (no-op, returns undefined) and the session has no resume() to await — so 3DS cannot
  // be completed from Promise mode. Callback mode does NOT fix it either. We still call
  // initiatePayerAction() + GET order for any environment where it might settle, then run
  // the v5 decision table; in practice SCA_ALWAYS surfaces an error here. Frictionless
  // (SCA_WHEN_REQUIRED) is the supported path.
  function handlePayerAction(orderId, googlePaySession) {
    console.warn(
      "[GooglePay-ECM-v6] PAYER_ACTION_REQUIRED — v6 cannot drive 3DS here (initiatePayerAction is void no-op)",
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
    console.log("[GooglePay-ECM-v6] GET", url);
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

  // Google Pay 3DS path: payment_source.google_pay.card.authentication_result
  // (one layer deeper than ACDC's payment_source.card). Decision table matches v5.
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
      "[GooglePay-ECM-v6] liability_shift:",
      ls,
      "| enrollment:",
      enrollment,
      "| authStatus:",
      authStatus,
    );

    if (ls === "POSSIBLE") {
      console.log(
        "[GooglePay-ECM-v6] 3DS: liability shifted to issuer — capturing",
      );
      return doCapture(orderId);
    }

    if (ls === "NO") {
      if (["N", "U", "B"].indexOf(enrollment) !== -1) {
        console.log(
          "[GooglePay-ECM-v6] 3DS: card not enrolled (" +
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
    console.log("[GooglePay-ECM-v6] ===== doCapture() — orderId:", orderId);

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
          "[GooglePay-ECM-v6] ===== capture COMPLETED ===== orderId:",
          order.id,
        );
        showResult("✓ Payment captured · Order: " + order.id, "success");
      });
  }

  // ─── Button click — opens the Google Pay sheet ────────────────────────────────

  function onGooglePayButtonClicked(googlePaySession, googlePayConfig) {
    console.log("[GooglePay-ECM-v6] ===== Google Pay button clicked =====");
    if (!validateAmount()) {
      console.warn("[GooglePay-ECM-v6] amount validation failed — aborting");
      return;
    }

    var amount = getAmount();
    var currency = getCurrency();
    var sca = getSCA();
    var shipping = window.DEMO && window.DEMO.shipping;
    var req = getGooglePaymentDataRequest(googlePayConfig, amount, currency);

    // Promise mode (v5-style): open sheet → resolve with paymentData (incl. email) →
    // createOrder → confirmOrder → capture. No paymentDataCallbacks involved.
    console.log(
      "[GooglePay-ECM-v6] calling loadPaymentData() — sheet opens (promise mode)",
    );
    paymentsClient
      .loadPaymentData(req)
      .then(function (paymentData) {
        inspect("loadPaymentData resolved paymentData", paymentData);
        var email = paymentData.email || null;
        console.log("[GooglePay-ECM-v6] email from sheet:", email);

        var createBody = {
          amount: amount,
          currency: currency,
          shipping: shipping,
          scaMethod: sca,
          email: email,
        };
        return fetch(urls.createOrder, {
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
            return processPayment(d.orderId, paymentData, googlePaySession); // v6: lowercase d
          });
      })
      .catch(function (err) {
        if (err && err.statusCode === "CANCELED") {
          console.log("[GooglePay-ECM-v6] user cancelled Google Pay sheet");
          return;
        }
        console.error("[GooglePay-ECM-v6] payment flow error:", err);
        showResult("✗ " + (err.message || String(err)), "error");
      });
  }

  // ─── Button setup ─────────────────────────────────────────────────────────────

  function setupGooglePayButton(instance, details) {
    // createGooglePayOneTimePaymentSession — sync per V6-GOOGLEPAY-5 (inspect to confirm)
    var googlePaySession = instance.createGooglePayOneTimePaymentSession();
    inspect("googlePaySession", googlePaySession);

    var googlePayConfig = googlePaySession.formatConfigForPaymentRequest(
      details.config,
    );
    inspect("googlePayConfig (formatConfigForPaymentRequest)", googlePayConfig);

    // Promise mode (v5-style): NO paymentDataCallbacks.
    paymentsClient = new google.payments.api.PaymentsClient({
      environment: "TEST",
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
            onGooglePayButtonClicked(googlePaySession, googlePayConfig);
          },
        });
        var container = clearLoading();
        container.appendChild(btn);
        console.log("[GooglePay-ECM-v6] official Google Pay button appended");

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
            onGooglePayButtonClicked(googlePaySession, googlePayConfig);
          });
          console.log("[GooglePay-ECM-v6] custom button enabled");
        }
      })
      .catch(function (err) {
        clearLoading();
        console.error("[GooglePay-ECM-v6] isReadyToPay error:", err);
        showResult(
          "✗ Google Pay error: " + (err.message || String(err)),
          "error",
        );
      });
  }

  // ─── SDK entry ─────────────────────────────────────────────────────────────────

  function onPayPalWebSdkLoaded() {
    console.log("[GooglePay-ECM-v6] onPayPalWebSdkLoaded()");

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
        console.error("[GooglePay-ECM-v6] config/init error:", err);
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
      "[GooglePay-ECM-v6] window.load, typeof paypal =",
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
