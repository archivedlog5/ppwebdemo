/**
 * PayPal Apple Pay ECM
 * Express Checkout Mark — merchant pre-fills shipping, buyer provides billing via Apple Pay sheet
 *
 * window.DEMO = {
 *   urls: { createOrder, captureOrder },
 * }
 */
(function () {
  "use strict";

  // ─── Constants ──────────────────────────────────────────────────────────────

  var ZERO_DECIMAL = ["JPY", "KRW", "TWD", "CLP", "IDR"];

  // ─── Module-level state ──────────────────────────────────────────────────────

  var applepayInstance = null;
  var applepayConfig = null;
  var urls = null;

  // ─── UI helpers ──────────────────────────────────────────────────────────────

  function getCurrency() {
    var sel = document.getElementById("demo-currency");
    return sel ? sel.value : (window.DEMO && window.DEMO.currency) || "USD";
  }

  function isZeroDecimal(currency) {
    return ZERO_DECIMAL.indexOf(currency) !== -1;
  }

  function getAmount() {
    var input = document.getElementById("demo-amount");
    return input
      ? input.value.trim()
      : (window.DEMO && window.DEMO.defaultAmount) || "100.00";
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
  }

  var MIN_AMOUNT = 1.0;
  var MAX_AMOUNT = 30000.0;

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

  // ─── Currency selector ────────────────────────────────────────────────────────

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

  // ─── Apple Pay: setup ─────────────────────────────────────────────────────────

  function setupApplepay() {
    console.log("[Apple Pay ECM] setupApplepay() -- inside");

    if (!window.ApplePaySession) {
      console.warn(
        "[Apple Pay ECM] ApplePaySession not available (requires Safari on Apple device)",
      );
      clearLoading();
      showResult(
        "Apple Pay is not available. Please use Safari on a supported Apple device.",
        "error",
      );
      return;
    }

    if (!ApplePaySession.supportsVersion(4)) {
      console.warn(
        "[Apple Pay ECM] ApplePaySession.supportsVersion(4) = false",
      );
      clearLoading();
      showResult("Apple Pay v4 is not supported on this device.", "error");
      return;
    }

    if (!ApplePaySession.canMakePayments()) {
      console.warn("[Apple Pay ECM] ApplePaySession.canMakePayments() = false");
      clearLoading();
      showResult(
        "Apple Pay is not available — no cards configured in Apple Wallet.",
        "error",
      );
      return;
    }

    if (typeof paypalSDK === "undefined" || !paypalSDK.Applepay) {
      console.error("[Apple Pay ECM] paypalSDK.Applepay is not available");
      clearLoading();
      showResult("✗ PayPal Apple Pay SDK not loaded", "error");
      return;
    }

    console.log(
      "[Apple Pay ECM] Apple Pay available — calling paypalSDK.Applepay().config()...",
    );
    applepayInstance = paypalSDK.Applepay();

    applepayInstance
      .config()
      .then(function (config) {
        applepayConfig = config;
        console.log("[Apple Pay ECM] ===== applepay.config() response =====");
        console.log("[Apple Pay ECM] config:", config);
        console.log("[Apple Pay ECM] countryCode:", config.countryCode);
        console.log(
          "[Apple Pay ECM] merchantCapabilities:",
          config.merchantCapabilities,
        );
        console.log(
          "[Apple Pay ECM] supportedNetworks:",
          config.supportedNetworks,
        );

        var container = document.getElementById("paypal-button-container");
        container.classList.remove("sdk-loading");
        container.innerHTML = "";

        // Create <apple-pay-button> web component (styled via Apple Pay button CSS)
        var applePayBtn = document.createElement("apple-pay-button");
        applePayBtn.setAttribute("buttonstyle", "black");
        applePayBtn.setAttribute("type", "buy");
        applePayBtn.setAttribute("locale", "en");
        applePayBtn.style.width = "100%";
        applePayBtn.style.height = "44px";
        applePayBtn.addEventListener("click", onApplePayButtonClicked);
        container.appendChild(applePayBtn);
        console.log("[Apple Pay ECM] <apple-pay-button> created and appended");

        // Enable custom button
        var customBtn = document.getElementById("custom-applepay-btn");
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
          customBtn.addEventListener("click", onApplePayButtonClicked);
          console.log(
            "[Apple Pay ECM] custom button enabled and listeners attached",
          );
        }
      })
      .catch(function (err) {
        clearLoading();
        console.error("[Apple Pay ECM] config error:", err);
        showResult(
          "✗ Apple Pay config error: " + (err.message || String(err)),
          "error",
        );
      });
  }

  // ─── Apple Pay: button click ──────────────────────────────────────────────────

  function onApplePayButtonClicked() {
    console.log("[Apple Pay ECM] ===== Apple Pay button clicked =====");

    if (!validateAmount()) {
      console.warn("[Apple Pay ECM] amount validation failed — aborting");
      return;
    }

    var amount = getAmount();
    var currency = getCurrency();
    var zd = isZeroDecimal(currency);
    var value = zd
      ? String(Math.round(parseFloat(amount)))
      : parseFloat(amount).toFixed(2);
    console.log(
      "[Apple Pay ECM] amount:",
      amount,
      "| currency:",
      currency,
      "| value:",
      value,
    );

    var paymentRequest = {
      countryCode: applepayConfig.countryCode,
      currencyCode: currency,
      merchantCapabilities: applepayConfig.merchantCapabilities,
      supportedNetworks: applepayConfig.supportedNetworks,
      requiredBillingContactFields: ["name", "phone", "email", "postalAddress"],
      total: {
        label: "Total",
        amount: value,
        type: "final",
      },
    };
    console.log("[Apple Pay ECM] paymentRequest:", paymentRequest);

    var session = new ApplePaySession(4, paymentRequest);

    session.onvalidatemerchant = function (event) {
      console.log(
        "[Apple Pay ECM] onvalidatemerchant — validationURL:",
        event.validationURL,
      );
      applepayInstance
        .validateMerchant({ validationUrl: event.validationURL })
        .then(function (payload) {
          console.log("[Apple Pay ECM] validateMerchant success:", payload);
          session.completeMerchantValidation(payload.merchantSession);
        })
        .catch(function (err) {
          console.error("[Apple Pay ECM] validateMerchant failed:", err);
          session.abort();
          showResult(
            "✗ Merchant validation failed: " + (err.message || String(err)),
            "error",
          );
        });
    };

    session.onpaymentmethodselected = function (event) {
      console.log(
        "[Apple Pay ECM] onpaymentmethodselected:",
        event.paymentMethod,
      );
      session.completePaymentMethodSelection({
        newTotal: { label: "Total", amount: value, type: "final" },
      });
    };

    session.onpaymentauthorized = function (event) {
      console.log("[Apple Pay ECM] ===== onpaymentauthorized =====");
      console.log("[Apple Pay ECM] event.payment:", event.payment);

      var paymentData = event.payment;
      var token = paymentData.token;
      var billingContact = paymentData.billingContact;
      var shippingContact = paymentData.shippingContact || null;
      var createdOrderId = null;

      console.log("[Apple Pay ECM] billingContact:", billingContact);
      console.log(
        "[Apple Pay ECM] token.paymentMethod.type:",
        token && token.paymentMethod && token.paymentMethod.type,
      );

      // ECM flow: create order (with payment_source.apple_pay context) → confirmOrder (injects token) → capture
      fetch(urls.createOrder, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amount, currency: currency }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          console.log("[Apple Pay ECM] ===== createOrder response =====", d);
          if (d.error) throw new Error(d.error);
          createdOrderId = d.id;
          console.log(
            "[Apple Pay ECM] orderId:",
            createdOrderId,
            "— calling applepay.confirmOrder()...",
          );

          return applepayInstance.confirmOrder({
            orderId: createdOrderId,
            token: token,
            billingContact: billingContact,
            shippingContact: shippingContact,
          });
        })
        .then(function (confirmResult) {
          console.log("[Apple Pay ECM] ===== confirmOrder() response =====");
          console.log("[Apple Pay ECM] confirmResult:", confirmResult);
          var approveApplePayPayment =
            confirmResult && confirmResult.approveApplePayPayment;
          console.log(
            "[Apple Pay ECM] approveApplePayPayment:",
            approveApplePayPayment,
          );
          console.log(
            "[Apple Pay ECM] status:",
            approveApplePayPayment && approveApplePayPayment.status,
          );

          if (
            !approveApplePayPayment ||
            approveApplePayPayment.status !== "APPROVED"
          ) {
            throw new Error(
              "Apple Pay not approved · status: " +
                (approveApplePayPayment
                  ? approveApplePayPayment.status
                  : "undefined"),
            );
          }

          console.log("[Apple Pay ECM] approved — calling captureOrder...");
          return fetch(urls.captureOrder, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderID: createdOrderId }),
          });
        })
        .then(function (r) {
          return r.json();
        })
        .then(function (order) {
          console.log("[Apple Pay ECM] ===== captureOrder response =====");
          console.log("[Apple Pay ECM] order:", order);
          if (order.error) throw new Error(order.error);

          var capture =
            order.purchase_units &&
            order.purchase_units[0] &&
            order.purchase_units[0].payments &&
            order.purchase_units[0].payments.captures &&
            order.purchase_units[0].payments.captures[0];
          console.log("[Apple Pay ECM] capture object:", capture);

          if (!capture || capture.status !== "COMPLETED") {
            var status = capture ? capture.status : "undefined";
            console.error(
              "[Apple Pay ECM] capture NOT COMPLETED — status:",
              status,
            );
            session.completePayment({ status: ApplePaySession.STATUS_FAILURE });
            showResult("✗ Capture failed · status: " + status, "error");
            return;
          }

          console.log(
            "[Apple Pay ECM] ===== capture COMPLETED ===== orderId:",
            order.id,
          );
          session.completePayment({ status: ApplePaySession.STATUS_SUCCESS });
          showResult("✓ Payment captured · Order: " + order.id, "success");
        })
        .catch(function (err) {
          console.error("[Apple Pay ECM] onpaymentauthorized error:", err);
          session.completePayment({ status: ApplePaySession.STATUS_FAILURE });
          showResult("✗ " + (err.message || String(err)), "error");
        });
    };

    session.oncancel = function (event) {
      console.log("[Apple Pay ECM] session cancelled by user");
    };

    console.log("[Apple Pay ECM] calling session.begin()...");
    session.begin();
  }

  // ─── Entry point ──────────────────────────────────────────────────────────────

  window.addEventListener("load", function () {
    console.log("[Apple Pay ECM] ===== window load =====");

    urls = window.DEMO && window.DEMO.urls;
    console.log("[Apple Pay ECM] window.DEMO.urls:", urls);

    if (typeof paypalSDK === "undefined") {
      console.error(
        "[Apple Pay ECM] paypalSDK is undefined — SDK failed to load",
      );
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

    setupApplepay();
  });
})();
