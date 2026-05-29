/**
 * Vault Return Buyer
 * Renders saved payment method radio cards; PayPal uses SDK Buttons, others use Pay Now.
 *
 * window.DEMO = {
 *   paymentTokens: [...],   // from /v3/vault/payment-tokens
 *   currency: 'USD',
 *   defaultAmount: '100.00',
 *   urls: { createAndCapture, createOrder, captureOrder }
 * }
 */
;(function () {
  "use strict";

  var ZERO_DECIMAL = ["JPY", "KRW", "TWD", "CLP", "IDR"];

  var urls = null;
  var paymentTokens = [];
  var selectedToken = null;
  var paypalButtonsInited = false;

  // ─── Brand badge styles ───────────────────────────────────────────────────────

  var BRAND = {
    VISA: {
      bg: "rgba(26,69,148,0.15)",
      border: "rgba(26,69,148,0.45)",
      color: "#60a5fa",
      label: "VISA",
    },
    MASTERCARD: {
      bg: "rgba(235,87,36,0.12)",
      border: "rgba(235,87,36,0.4)",
      color: "#f97316",
      label: "MC",
    },
    AMEX: {
      bg: "rgba(0,160,120,0.12)",
      border: "rgba(0,160,120,0.4)",
      color: "#34d399",
      label: "AMEX",
    },
    DISCOVER: {
      bg: "rgba(255,130,0,0.12)",
      border: "rgba(255,130,0,0.35)",
      color: "#fb923c",
      label: "DISC",
    },
  };

  function brandStyle(name) {
    return (
      BRAND[name] || {
        bg: "rgba(255,255,255,0.06)",
        border: "rgba(255,255,255,0.15)",
        color: "var(--fg-muted)",
        label: name || "??",
      }
    );
  }

  function brandBadge(name) {
    var s = brandStyle(name);
    return (
      '<span style="display:inline-flex;align-items:center;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.05em;' +
      "background:" +
      s.bg +
      ";border:1px solid " +
      s.border +
      ";color:" +
      s.color +
      '">' +
      s.label +
      "</span>"
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function getCurrency() {
    var sel = document.getElementById("demo-currency");
    return sel ? sel.value : (window.DEMO && window.DEMO.currency) || "USD";
  }

  function isZeroDecimal(c) {
    return ZERO_DECIMAL.indexOf(c) !== -1;
  }

  function getAmount() {
    var inp = document.getElementById("demo-amount");
    return inp
      ? inp.value.trim()
      : (window.DEMO && window.DEMO.defaultAmount) || "100.00";
  }

  function showResult(text, type) {
    var el = document.getElementById("result");
    if (!el) return;
    el.className = "result-msg " + (type || "");
    el.textContent = text;
  }

  function validateAmount() {
    var inp = document.getElementById("demo-amount");
    var errEl = document.getElementById("amount-error");
    if (!inp) return true;
    var val = inp.value.trim();
    var num = parseFloat(val);
    var cur = getCurrency();
    var zd = isZeroDecimal(cur);
    var err = "";
    if (!val || isNaN(num) || !/^\d+(\.\d{1,2})?$/.test(val)) {
      err = "Please enter a valid number";
    } else if (num < 1) {
      err = "Minimum amount is " + (zd ? "1" : "1.00");
    } else if (num > 30000) {
      err = "Maximum amount is 30,000";
    } else if (zd && val.indexOf(".") !== -1 && num !== Math.round(num)) {
      err = cur + " does not support decimal amounts";
    }
    if (errEl) errEl.textContent = err;
    inp.classList[err ? "add" : "remove"]("amount-input--error");
    return !err;
  }

  // ─── Label builders ───────────────────────────────────────────────────────────

  function fmtExpiry(e) {
    if (!e) return "";
    var p = e.split("-");
    return p.length === 2 ? p[1] + "/" + p[0] : e;
  }

  function sourceType(token) {
    var s = token.payment_source;
    if (s.paypal) return "paypal";
    if (s.apple_pay) return "apple_pay";
    if (s.card) return "card";
    return "unknown";
  }

  function buildLabel(token) {
    var s = token.payment_source;

    if (s.paypal) {
      var pp = s.paypal;
      return (
        '<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:rgba(0,112,240,0.12);border:1px solid rgba(0,112,240,0.35);color:#60a5fa">PayPal</span>' +
        '<span style="margin-left:10px;font-size:13px;color:var(--fg)">' +
        (pp.email_address || "") +
        "</span>" +
        (pp.name && pp.name.full_name
          ? '<span style="margin-left:8px;font-size:11px;color:var(--fg-muted)">(' +
            pp.name.full_name +
            ")</span>"
          : "")
      );
    }

    if (s.apple_pay && s.apple_pay.card) {
      var ac = s.apple_pay.card;
      return (
        '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);color:var(--fg-muted)"> Apple Pay</span>' +
        '<span style="margin-left:8px;font-size:11px;color:var(--fg-muted)">via</span> ' +
        brandBadge(ac.brand) +
        '<span style="margin-left:8px;font-family:var(--font-mono);font-size:13px;color:var(--fg)">•••• ' +
        ac.last_digits +
        "</span>"
      );
    }

    if (s.card) {
      var c = s.card;
      return (
        brandBadge(c.brand) +
        '<span style="margin-left:10px;font-family:var(--font-mono);font-size:13px;color:var(--fg)">•••• ' +
        c.last_digits +
        "</span>" +
        (c.expiry
          ? '<span style="margin-left:10px;font-size:11px;color:var(--fg-muted)">exp ' +
            fmtExpiry(c.expiry) +
            "</span>"
          : "") +
        (c.verification_status === "VERIFIED"
          ? '<span style="margin-left:10px;font-size:10px;color:#22c55e">✓ Verified</span>'
          : "")
      );
    }

    return (
      '<span style="font-size:12px;color:var(--fg-muted)">' +
      token.id +
      "</span>"
    );
  }

  // ─── Render radio cards ───────────────────────────────────────────────────────

  function setLabelStyle(idx, selected) {
    var label = document.getElementById("vr-label-" + idx);
    if (!label) return;
    label.style.borderColor = selected
      ? "var(--accent)"
      : "var(--border)";
    label.style.background = selected
      ? "rgba(34,197,94,0.05)"
      : "transparent";
  }

  function renderPaymentMethods(tokens) {
    var container = document.getElementById("payment-methods-list");
    if (!container) return;

    if (!tokens || tokens.length === 0) {
      container.innerHTML =
        '<div style="padding:24px;text-align:center;color:var(--fg-muted);font-size:13px;border:1px dashed var(--border);border-radius:8px">No saved payment methods found for this customer.</div>';
      return;
    }

    var html = "";
    tokens.forEach(function (token, i) {
      var type = sourceType(token);
      var disabled = type === "apple_pay";
      html +=
        '<label id="vr-label-' +
        i +
        '" for="vr-radio-' +
        i +
        '" ' +
        'style="display:flex;align-items:flex-start;gap:14px;padding:13px 16px;border:1px solid var(--border);border-radius:9px;' +
        (disabled ? "cursor:not-allowed;opacity:0.45;" : "cursor:pointer;") +
        'margin-bottom:8px;transition:border-color 150ms,background 150ms;background:transparent">' +
        '<input type="radio" id="vr-radio-' +
        i +
        '" name="vr-payment-token" value="' +
        token.id +
        '" data-type="' +
        type +
        '" data-idx="' +
        i +
        '"' +
        (disabled ? " disabled" : "") +
        ' style="accent-color:var(--accent);width:16px;height:16px;flex-shrink:0;margin-top:2px;' +
        (disabled ? "cursor:not-allowed;" : "cursor:pointer;") +
        '">' +
        '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">' +
        buildLabel(token) +
        "</div>" +
        (disabled
          ? '<div style="margin-top:5px;font-size:11px;color:var(--fg-muted);line-height:1.4">Note: Apple Pay can’t be used as a payment method for returning buyers, according to Apple guidelines.</div>'
          : "") +
        "</div>" +
        "</label>";
    });
    container.innerHTML = html;

    tokens.forEach(function (token, i) {
      var type = sourceType(token);
      if (type === "apple_pay") return;

      var radio = document.getElementById("vr-radio-" + i);
      var label = document.getElementById("vr-label-" + i);

      if (label) {
        label.addEventListener("mouseenter", function () {
          var r = document.getElementById("vr-radio-" + i);
          if (!r || !r.checked) {
            this.style.borderColor = "var(--border-hi)";
            this.style.background = "rgba(255,255,255,0.02)";
          }
        });
        label.addEventListener("mouseleave", function () {
          var r = document.getElementById("vr-radio-" + i);
          if (!r || !r.checked) {
            this.style.borderColor = "var(--border)";
            this.style.background = "transparent";
          }
        });
      }

      if (radio) {
        radio.addEventListener("change", function () {
          if (!this.checked) return;
          tokens.forEach(function (_, j) {
            setLabelStyle(j, j === i);
          });
          onTokenSelected(token);
        });
      }
    });
  }

  // ─── Selection handler ────────────────────────────────────────────────────────

  function onTokenSelected(token) {
    selectedToken = token;
    var type = sourceType(token);
    var ppWrap = document.getElementById("paypal-btn-wrap");
    var payNowBtn = document.getElementById("pay-now-btn");
    showResult("", "");

    console.log("[vault-return] selected token:", token.id, "type:", type);

    if (type === "paypal") {
      if (ppWrap) ppWrap.style.display = "block";
      if (payNowBtn) payNowBtn.style.display = "none";
      if (!paypalButtonsInited) {
        initPaypalButtons();
        paypalButtonsInited = true;
      }
    } else {
      if (ppWrap) ppWrap.style.display = "none";
      if (payNowBtn) payNowBtn.style.display = "block";
    }
  }

  // ─── PayPal Buttons (returning payer) ─────────────────────────────────────────

  function initPaypalButtons() {
    var container = document.getElementById("paypal-button-container");
    if (!container) return;

    console.log("[vault-return] ===== initPaypalButtons");

    if (typeof paypalSDK === "undefined" || !paypalSDK.Buttons) {
      container.classList.remove("sdk-loading");
      container.innerHTML =
        '<div style="color:var(--fg-muted);font-size:12px;padding:10px 0">PayPal SDK not available — check that the SDK loaded correctly.</div>';
      return;
    }

    container.classList.remove("sdk-loading");
    container.innerHTML = "";

    paypalSDK
      .Buttons({
        fundingSource: paypalSDK.FUNDING.PAYPAL,
        createOrder: function () {
          if (!validateAmount()) return Promise.reject(new Error("Invalid amount"));
          var payload = {
            amount: getAmount(),
            currency: getCurrency(),
          };
          console.log("[vault-return] createOrder payload:", payload);
          return fetch(urls.createOrder, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
            .then(function (r) {
              return r.json();
            })
            .then(function (d) {
              console.log("[vault-return] createOrder response:", d);
              if (d.error) throw new Error(d.error);
              return d.id;
            });
        },

        onApprove: function (data) {
          console.log("[vault-return] onApprove orderID:", data.orderID);
          return fetch(urls.captureOrder, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderID: data.orderID }),
          })
            .then(function (r) {
              return r.json();
            })
            .then(function (order) {
              console.log("[vault-return] captureOrder response:", order);
              if (order.error) throw new Error(order.error);
              var cap =
                order.purchase_units &&
                order.purchase_units[0] &&
                order.purchase_units[0].payments &&
                order.purchase_units[0].payments.captures &&
                order.purchase_units[0].payments.captures[0];
              if (!cap || cap.status !== "COMPLETED") {
                showResult(
                  "✗ Capture not COMPLETED · status: " +
                    (cap ? cap.status : "unknown"),
                  "error",
                );
                return;
              }
              showResult("✓ Payment captured · Order: " + order.id, "success");
            });
        },

        onCancel: function () {
          console.log("[vault-return] PayPal payment cancelled");
          showResult("Payment cancelled.", "error");
        },

        onError: function (err) {
          console.error("[vault-return] PayPal error:", err);
          showResult("✗ " + (err.message || String(err)), "error");
        },
      })
      .render("#paypal-button-container");
  }

  // ─── Pay Now (card / Apple Pay) ───────────────────────────────────────────────

  function initPayNowButton() {
    var btn = document.getElementById("pay-now-btn");
    if (!btn) return;

    btn.addEventListener("mouseenter", function () {
      this.style.opacity = "0.9";
    });
    btn.addEventListener("mouseleave", function () {
      this.style.opacity = "1";
    });
    btn.addEventListener("mousedown", function () {
      this.style.transform = "scale(0.98)";
    });
    btn.addEventListener("mouseup", function () {
      this.style.transform = "scale(1)";
    });

    btn.addEventListener("click", function () {
      if (!selectedToken) {
        showResult("✗ Please select a payment method", "error");
        return;
      }
      if (!validateAmount()) return;

      btn.disabled = true;
      btn.textContent = "Processing...";
      showResult("", "");

      var payload = {
        paymentTokenId: selectedToken.id,
        tokenType: sourceType(selectedToken),
        amount: getAmount(),
        currency: getCurrency(),
      };
      console.log("[vault-return] Pay Now payload:", payload);

      fetch(urls.createAndCapture, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (order) {
          console.log("[vault-return] create-and-capture response:", order);
          if (order.error) throw new Error(order.error);
          var cap =
            order.purchase_units &&
            order.purchase_units[0] &&
            order.purchase_units[0].payments &&
            order.purchase_units[0].payments.captures &&
            order.purchase_units[0].payments.captures[0];
          if (!cap || cap.status !== "COMPLETED") {
            showResult(
              "✗ Capture not COMPLETED · status: " +
                (cap ? cap.status : "unknown"),
              "error",
            );
            return;
          }
          showResult("✓ Payment captured · Order: " + order.id, "success");
        })
        .catch(function (err) {
          showResult("✗ " + (err.message || String(err)), "error");
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = "Pay Now";
        });
    });
  }

  // ─── Entry point ──────────────────────────────────────────────────────────────

  function initGetTokensButton() {
    var btn = document.getElementById("get-tokens-btn");
    var countLabel = document.getElementById("token-count-label");
    if (!btn) return;

    btn.addEventListener("click", function () {
      btn.disabled = true;
      btn.textContent = "Loading…";
      if (countLabel) countLabel.textContent = "Fetching…";

      fetch(urls.paymentTokens)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) throw new Error(data.error);
          paymentTokens = data.payment_tokens || [];
          var total = data.total_items || paymentTokens.length;
          if (countLabel)
            countLabel.textContent =
              total + " payment method" + (total !== 1 ? "s" : "") + " on file";
          console.log("[vault-return] fetched", paymentTokens.length, "tokens");
          renderPaymentMethods(paymentTokens);
          btn.textContent = "Refresh";
          btn.disabled = false;
        })
        .catch(function (err) {
          console.error("[vault-return] fetch tokens error:", err);
          if (countLabel) countLabel.textContent = "Failed to load";
          btn.textContent = "Retry";
          btn.disabled = false;
        });
    });
  }

  window.addEventListener("load", function () {
    console.log("[vault-return] ===== window load =====");
    urls = window.DEMO && window.DEMO.urls;

    // Currency change → reload page
    var currencySel = document.getElementById("demo-currency");
    if (currencySel) {
      currencySel.addEventListener("change", function () {
        var amtInput = document.getElementById("demo-amount");
        var url = new URL(window.location.href);
        url.searchParams.set("currency", this.value);
        if (amtInput) url.searchParams.set("amount", amtInput.value.trim());
        window.location.replace(url.toString());
      });
    }

    // Amount blur format
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

    initGetTokensButton();
    initPayNowButton();
  });
})();
