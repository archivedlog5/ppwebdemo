/**
 * PayPal Apple Pay Vault with Purchase — Weekly Subscription
 * Trial: $25.00 USD / 7 days → Regular: $40.00 USD / week
 * store_in_vault: ON_SUCCESS
 *
 * window.DEMO = {
 *   urls: { createOrder, captureOrder },
 * }
 */
(function () {
  "use strict";

  var TRIAL_AMOUNT = "25.00";
  var REGULAR_AMOUNT = "40.00";
  var CURRENCY = "USD";

  var applepayInstance = null;
  var applepayConfig = null;
  var urls = null;

  // ─── UI helpers ──────────────────────────────────────────────────────────────

  function showResult(text, type) {
    var el = document.getElementById("result");
    if (!el) return;
    el.className = "result-msg " + type;
    el.textContent = text;
  }

  function showVaultResult(vaultId, customerId, vaultStatus) {
    var panel = document.getElementById("vault-result");
    var vaultIdEl = document.getElementById("vault-id");
    var customerEl = document.getElementById("customer-id");
    var statusEl = document.getElementById("vault-status");
    if (!panel) return;
    if (vaultIdEl) vaultIdEl.textContent = vaultId || "(not returned)";
    if (customerEl) customerEl.textContent = customerId || "(not returned)";
    if (statusEl) statusEl.textContent = vaultStatus || "(not returned)";
    panel.style.display = "block";
  }

  function clearLoading() {
    var container = document.getElementById("paypal-button-container");
    if (container) {
      container.classList.remove("sdk-loading");
      container.innerHTML = "";
    }
  }

  // ─── Apple Pay: setup ─────────────────────────────────────────────────────────

  function setupApplepay() {
    console.log("[Apple Pay Vault] setupApplepay() -- inside");

    if (!window.ApplePaySession) {
      console.warn(
        "[Apple Pay Vault] ApplePaySession not available (requires Safari on Apple device)",
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
        "[Apple Pay Vault] ApplePaySession.supportsVersion(4) = false",
      );
      clearLoading();
      showResult("Apple Pay v4 is not supported on this device.", "error");
      return;
    }

    if (!ApplePaySession.canMakePayments()) {
      console.warn(
        "[Apple Pay Vault] ApplePaySession.canMakePayments() = false",
      );
      clearLoading();
      showResult(
        "Apple Pay is not available — no cards configured in Apple Wallet.",
        "error",
      );
      return;
    }

    if (typeof paypalSDK === "undefined" || !paypalSDK.Applepay) {
      console.error("[Apple Pay Vault] paypalSDK.Applepay is not available");
      clearLoading();
      showResult("✗ PayPal Apple Pay SDK not loaded", "error");
      return;
    }

    console.log(
      "[Apple Pay Vault] Apple Pay available — calling paypalSDK.Applepay().config()...",
    );
    applepayInstance = paypalSDK.Applepay();

    applepayInstance
      .config()
      .then(function (config) {
        applepayConfig = config;
        console.log("[Apple Pay Vault] ===== applepay.config() response =====");
        console.log("[Apple Pay Vault] config:", config);
        console.log("[Apple Pay Vault] countryCode:", config.countryCode);
        console.log(
          "[Apple Pay Vault] merchantCapabilities:",
          config.merchantCapabilities,
        );
        console.log(
          "[Apple Pay Vault] supportedNetworks:",
          config.supportedNetworks,
        );

        var container = document.getElementById("paypal-button-container");
        container.classList.remove("sdk-loading");
        container.innerHTML = "";

        var applePayBtn = document.createElement("apple-pay-button");
        applePayBtn.setAttribute("buttonstyle", "black");
        applePayBtn.setAttribute("type", "subscribe");
        applePayBtn.setAttribute("locale", "en");
        applePayBtn.style.width = "100%";
        applePayBtn.style.height = "44px";
        applePayBtn.addEventListener("click", onApplePayButtonClicked);
        container.appendChild(applePayBtn);
        console.log(
          "[Apple Pay Vault] <apple-pay-button> created and appended",
        );

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
            "[Apple Pay Vault] custom button enabled and listeners attached",
          );
        }
      })
      .catch(function (err) {
        clearLoading();
        console.error("[Apple Pay Vault] config error:", err);
        showResult(
          "✗ Apple Pay config error: " + (err.message || String(err)),
          "error",
        );
      });
  }

  // ─── Apple Pay: button click ──────────────────────────────────────────────────

  function onApplePayButtonClicked() {
    console.log("[Apple Pay Vault] ===== Apple Pay button clicked =====");
    console.log(
      "[Apple Pay Vault] amount:",
      TRIAL_AMOUNT,
      "| currency:",
      CURRENCY,
    );

    var now = new Date();
    var sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    var nowIso = now.toISOString();
    var sevenDaysLaterIso = sevenDaysLater.toISOString();

    var paymentRequest = {
      countryCode: applepayConfig.countryCode,
      currencyCode: CURRENCY,
      merchantCapabilities: applepayConfig.merchantCapabilities,
      supportedNetworks: applepayConfig.supportedNetworks,
      requiredBillingContactFields: ["name", "phone", "email", "postalAddress"],
      requiredShippingContactFields: ["email"],
      lineItems: [
        {
          type: "final",
          label: "7-Day Trial", // useless seems
          amount: TRIAL_AMOUNT,
          paymentTiming: "recurring",
          recurringPaymentIntervalUnit: "day",
          recurringPaymentIntervalCount: 7,
          recurringPaymentStartDate: nowIso,
          recurringPaymentEndDate: sevenDaysLaterIso,
        },
      ],
      recurringPaymentRequest: {
        paymentDescription: "Weekly Subscription",
        regularBilling: {
          label: "Weekly Subscription",
          amount: REGULAR_AMOUNT,
          paymentTiming: "recurring",
          recurringPaymentIntervalUnit: "day",
          recurringPaymentIntervalCount: 7,
          recurringPaymentStartDate: sevenDaysLaterIso,
        },
        trialBilling: {
          label: "7-Day Trial",
          amount: TRIAL_AMOUNT,
          paymentTiming: "recurring",
          recurringPaymentIntervalUnit: "day",
          recurringPaymentIntervalCount: 7,
          recurringPaymentStartDate: nowIso,
          recurringPaymentEndDate: sevenDaysLaterIso,
        },
        billingAgreement:
          "USD " +
          TRIAL_AMOUNT +
          " for the first 7 days, then USD " +
          REGULAR_AMOUNT +
          " per week. Cancel anytime.",
        managementURL: "https://developer.paypal.com",
      },
      total: {
        type: "final",
        label: "CWEN VIP Subscription",
        amount: TRIAL_AMOUNT,
        paymentTiming: "recurring",
        recurringPaymentIntervalUnit: "day",
        recurringPaymentIntervalCount: 7,
        recurringPaymentStartDate: nowIso,
        recurringPaymentEndDate: sevenDaysLaterIso,
      },
    };

    console.log("[Apple Pay Vault] paymentRequest:", paymentRequest);

    var session = new ApplePaySession(4, paymentRequest);

    session.onvalidatemerchant = function (event) {
      console.log(
        "[Apple Pay Vault] onvalidatemerchant — validationURL:",
        event.validationURL,
      );
      applepayInstance
        .validateMerchant({ validationUrl: event.validationURL })
        .then(function (payload) {
          console.log("[Apple Pay Vault] validateMerchant success:", payload);
          session.completeMerchantValidation(payload.merchantSession);
        })
        .catch(function (err) {
          console.error("[Apple Pay Vault] validateMerchant failed:", err);
          session.abort();
          showResult(
            "✗ Merchant validation failed: " + (err.message || String(err)),
            "error",
          );
        });
    };

    session.onpaymentmethodselected = function (event) {
      console.log(
        "[Apple Pay Vault] onpaymentmethodselected:",
        event.paymentMethod,
      );
      session.completePaymentMethodSelection({
        newTotal: paymentRequest.total,
      });
    };

    session.onpaymentauthorized = function (event) {
      console.log("[Apple Pay Vault] ===== onpaymentauthorized =====");
      console.log("[Apple Pay Vault] event.payment:", event.payment);

      var paymentData = event.payment;
      var token = paymentData.token;
      var billingContact = paymentData.billingContact;
      var shippingContact = paymentData.shippingContact || null;
      var createdOrderId = null;

      console.log("[Apple Pay Vault] billingContact:", billingContact);
      console.log(
        "[Apple Pay Vault] token.paymentMethod.type:",
        token && token.paymentMethod && token.paymentMethod.type,
      );

      fetch(urls.createOrder, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: TRIAL_AMOUNT, currency: CURRENCY }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          console.log("[Apple Pay Vault] ===== createOrder response =====", d);
          if (d.error) throw new Error(d.error);
          createdOrderId = d.id;
          console.log(
            "[Apple Pay Vault] orderId:",
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
          console.log("[Apple Pay Vault] ===== confirmOrder() response =====");
          console.log("[Apple Pay Vault] confirmResult:", confirmResult);
          var approveApplePayPayment =
            confirmResult && confirmResult.approveApplePayPayment;
          console.log(
            "[Apple Pay Vault] approveApplePayPayment:",
            approveApplePayPayment,
          );
          console.log(
            "[Apple Pay Vault] status:",
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

          console.log("[Apple Pay Vault] approved — calling captureOrder...");
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
          console.log("[Apple Pay Vault] ===== captureOrder response =====");
          console.log("[Apple Pay Vault] order:", order);
          if (order.error) throw new Error(order.error);

          var capture =
            order.purchase_units &&
            order.purchase_units[0] &&
            order.purchase_units[0].payments &&
            order.purchase_units[0].payments.captures &&
            order.purchase_units[0].payments.captures[0];
          console.log("[Apple Pay Vault] capture object:", capture);

          if (!capture || capture.status !== "COMPLETED") {
            var status = capture ? capture.status : "undefined";
            console.error(
              "[Apple Pay Vault] capture NOT COMPLETED — status:",
              status,
            );
            session.completePayment({ status: ApplePaySession.STATUS_FAILURE });
            showResult("✗ Capture failed · status: " + status, "error");
            return;
          }

          console.log(
            "[Apple Pay Vault] ===== capture COMPLETED ===== orderId:",
            order.id,
          );
          console.log(
            "[Apple Pay Vault] vaultId:",
            order.vaultId,
            "| customerId:",
            order.customerId,
            "| vaultStatus:",
            order.vaultStatus,
          );

          session.completePayment({ status: ApplePaySession.STATUS_SUCCESS });
          showResult("✓ Payment captured · Order: " + order.id, "success");
          showVaultResult(order.vaultId, order.customerId, order.vaultStatus);
        })
        .catch(function (err) {
          console.error("[Apple Pay Vault] onpaymentauthorized error:", err);
          session.completePayment({ status: ApplePaySession.STATUS_FAILURE });
          showResult("✗ " + (err.message || String(err)), "error");
        });
    };

    session.oncancel = function (event) {
      console.log("[Apple Pay Vault] session cancelled by user");
    };

    console.log("[Apple Pay Vault] calling session.begin()...");
    session.begin();
  }

  // ─── Entry point ──────────────────────────────────────────────────────────────

  window.addEventListener("load", function () {
    console.log("[Apple Pay Vault] ===== window load =====");

    urls = window.DEMO && window.DEMO.urls;
    console.log("[Apple Pay Vault] window.DEMO.urls:", urls);

    if (typeof paypalSDK === "undefined") {
      console.error(
        "[Apple Pay Vault] paypalSDK is undefined — SDK failed to load",
      );
      showResult("✗ PayPal SDK failed to load", "error");
      return;
    }

    setupApplepay();
  });
})();
