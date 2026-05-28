/**
 * PayPal ACDC Vault Setup-Only (no purchase)
 * 用于：vault-acdc-setup-only
 *
 * window.DEMO = {
 *   urls: {
 *     createSetupToken:  '/paypal/jssdk-v5/api/vault-acdc-setup-only/create-setup-token',
 *     getSetupToken:     '/paypal/jssdk-v5/api/vault-acdc-setup-only/setup-token/',
 *     confirmSetupToken: '/paypal/jssdk-v5/api/vault-acdc-setup-only/confirm-setup-token',
 *   },
 *   billing: { addressLine1, adminArea2, adminArea1, postalCode, countryCode },
 * }
 *
 * onApprove 3DS decision (setup-only):
 *   liabilityShift 'YES'|'POSSIBLE' → confirm directly
 *   otherwise → GET setup token → token.status === 'APPROVED' && verification_status === 'VERIFIED' → confirm
 */
(function () {
  "use strict";

  var CONTAINER_BY_EMITTED = {
    number: "card-number-container",
    expiry: "card-expiry-container",
    cvv: "card-cvv-container",
  };

  var CONTAINER_BY_FIELD = {
    cardNumberField: "card-number-container",
    cardExpiryField: "card-expiry-container",
    cardCvvField: "card-cvv-container",
  };

  function getSCA() {
    var sel = document.getElementById("demo-sca");
    return sel ? sel.value : "SCA_WHEN_REQUIRED";
  }

  function showResult(text, type) {
    var el = document.getElementById("result");
    if (!el) return;
    el.className = "result-msg " + type;
    el.textContent = text;
  }

  function showVaultResult(paymentTokenId, customerId) {
    var panel = document.getElementById("vault-result");
    var tokenEl = document.getElementById("payment-token-id");
    var customerEl = document.getElementById("customer-id");
    if (!panel) return;
    if (tokenEl) tokenEl.textContent = paymentTokenId || "(not returned)";
    if (customerEl) customerEl.textContent = customerId || "(not returned)";
    panel.style.display = "block";
  }

  function clearLoading(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("sdk-loading");
    el.innerHTML = "";
  }

  function updateFieldStates(fields) {
    Object.keys(CONTAINER_BY_FIELD).forEach(function (key) {
      var el = document.getElementById(CONTAINER_BY_FIELD[key]);
      if (!el) return;
      var f = fields[key];
      if (!f) return;
      el.classList.remove("field-host--valid", "field-host--invalid");
      if (!f.isEmpty) {
        if (f.isValid) {
          el.classList.add("field-host--valid");
        } else if (!f.isPotentiallyValid) {
          el.classList.add("field-host--invalid");
        }
      }
    });
  }

  window.addEventListener("load", function () {
    if (typeof paypalSDK === "undefined") {
      showResult("✗ PayPal SDK failed to load", "error");
      return;
    }

    clearLoading("card-number-container");

    var urls = window.DEMO && window.DEMO.urls;

    function doConfirm(setupTokenId) {
      return fetch(urls.confirmSetupToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupTokenId: setupTokenId }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data.error) throw new Error(data.error);
          console.log(
            "[ACDC-Setup] Payment token created:",
            data.paymentTokenId,
            "| customer:",
            data.customerId,
          );
          showResult(
            "✓ Card saved · Payment Token: " + data.paymentTokenId,
            "success",
          );
          showVaultResult(data.paymentTokenId, data.customerId);
        });
    }

    var cardFields = paypalSDK.CardFields({
      createVaultSetupToken: function () {
        return fetch(urls.createSetupToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scaMethod: getSCA() }),
        })
          .then(function (r) {
            return r.json();
          })
          .then(function (d) {
            if (d.error) throw new Error(d.error);
            console.log("[ACDC-Setup] Setup token:", d.setupTokenId);
            return d.setupTokenId;
          });
      },

      onApprove: function (data) {
        var liabilityShift = data.liabilityShift;
        var vaultSetupToken = data.vaultSetupToken;

        console.group("[ACDC-Setup] onApprove");
        console.log("  liabilityShift  :", liabilityShift);
        console.log("  vaultSetupToken :", vaultSetupToken);
        console.groupEnd();

        if (liabilityShift === "YES" || liabilityShift === "POSSIBLE") {
          console.log(
            "[ACDC-Setup] → 3DS passed (liabilityShift:",
            liabilityShift,
            ") → confirm directly",
          );
          return doConfirm(vaultSetupToken);
        }

        console.log(
          "[ACDC-Setup] → liabilityShift",
          JSON.stringify(liabilityShift),
          "— fetching setup token …",
        );
        return fetch(urls.getSetupToken + vaultSetupToken)
          .then(function (r) {
            return r.json();
          })
          .then(function (tokenData) {
            var tokenStatus = tokenData.status;
            var verificationStatus =
              tokenData.payment_source &&
              tokenData.payment_source.card &&
              tokenData.payment_source.card.verification_status;

            console.group("[ACDC-Setup] setup token details");
            console.log("  liabilityShift     :", liabilityShift);
            console.log("  token.status       :", tokenStatus);
            console.log("  verification_status:", verificationStatus);
            console.groupEnd();

            if (
              tokenStatus === "APPROVED" &&
              verificationStatus === "VERIFIED"
            ) {
              console.log(
                "[ACDC-Setup] → verification_status VERIFIED → confirm",
              );
              return doConfirm(vaultSetupToken);
            }
            var msg = verificationStatus
              ? "verification: " + verificationStatus
              : "liabilityShift: " +
                (liabilityShift || "none") +
                " · token: " +
                (tokenStatus || "unknown");
            console.warn("[ACDC-Setup] → rejected ·", msg);
            showResult("✗ Card not saved · " + msg, "error");
          });
      },

      onError: function (err) {
        showResult("✗ " + (err.message || String(err)), "error");
      },

      onCancel: function () {
        showResult("3D Secure cancelled — card not saved.", "error");
        var saveBtn = document.getElementById("acdc-save-btn");
        if (saveBtn) saveBtn.disabled = false;
      },

      style: {
        input: {
          "font-family": "'Space Mono', monospace",
          "font-size": "13px",
          color: "inherit",
        },
        ".invalid": {
          color: "#EF4444",
        },
      },

      inputEvents: {
        onChange: function (data) {
          if (data.cards && data.cards.length > 0) {
            var card = data.cards[0];
            console.log(
              "[ACDC-Setup] Card type:",
              card.niceType,
              "(" + card.type + ")",
            );
            console.log(
              "[ACDC-Setup]",
              card.code.name + ":",
              card.code.size + " digits | form valid:",
              data.isFormValid,
            );
            if (data.errors && data.errors.length > 0) {
              console.log("[ACDC-Setup] Errors:", data.errors.join(", "));
            }
          }
          if (data.fields) updateFieldStates(data.fields);
        },
        onFocus: function (data) {
          var id = CONTAINER_BY_EMITTED[data.emittedBy];
          if (id) {
            var el = document.getElementById(id);
            if (el) el.classList.add("focused");
          }
        },
        onBlur: function (data) {
          var id = CONTAINER_BY_EMITTED[data.emittedBy];
          if (id) {
            var el = document.getElementById(id);
            if (el) el.classList.remove("focused");
          }
        },
      },
    });

    if (cardFields.isEligible()) {
      cardFields
        .NumberField({ placeholder: "4012000033330026" })
        .render("#card-number-container");
      cardFields
        .ExpiryField({ placeholder: "MM / YY" })
        .render("#card-expiry-container");
      cardFields.CVVField({ placeholder: "•••" }).render("#card-cvv-container");
    } else {
      document.getElementById("card-number-container").innerHTML =
        '<p style="color:var(--fg-muted);font-size:12px;text-align:center">Card Fields not available for this account.</p>';
    }

    var saveBtn = document.getElementById("acdc-save-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        saveBtn.disabled = true;
        var billing = (window.DEMO && window.DEMO.billing) || {};
        cardFields
          .submit({
            billingAddress: {
              addressLine1: billing.addressLine1 || "",
              addressLine2: billing.addressLine2 || "",
              adminArea1: billing.adminArea1 || "",
              adminArea2: billing.adminArea2 || "",
              countryCode: billing.countryCode || "",
              postalCode: billing.postalCode || "",
            },
          })
          .catch(function (err) {
            showResult("✗ " + (err.message || String(err)), "error");
            saveBtn.disabled = false;
          });
      });
    }
  });
})();
