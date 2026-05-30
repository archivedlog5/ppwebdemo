;(function () {
  "use strict";

  var ZERO_DECIMAL = ["JPY", "KRW", "TWD", "CLP", "IDR"];
  var COUNTRY_TO_CUR = { US: "USD", AU: "AUD", DE: "EUR", ES: "EUR", FR: "EUR", IT: "EUR", GB: "GBP", CA: "CAD" };
  var logCount = 0;

  function getCurrency() {
    return (window.DEMO && window.DEMO.currency) || "USD";
  }

  function isZeroDecimal(c) {
    return ZERO_DECIMAL.indexOf(c) !== -1;
  }

  function getAmount() {
    var inp = document.getElementById("demo-amount");
    return inp ? inp.value.trim() : (window.DEMO && window.DEMO.defaultAmount) || "100.00";
  }

  // ─── Event log ────────────────────────────────────────────────────────────

  function logEvent(name, detail) {
    var log = document.getElementById("plm-event-log");
    if (!log) return;

    if (logCount === 0) log.innerHTML = "";
    logCount++;

    var time = new Date().toLocaleTimeString();
    var row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:baseline;gap:10px;padding:5px 0;" +
      "border-bottom:1px solid var(--border);font-size:12px";
    row.innerHTML =
      '<span style="color:var(--fg-muted);font-family:var(--font-mono);flex-shrink:0">' + time + "</span>" +
      '<span style="color:var(--accent);font-weight:700;flex-shrink:0;min-width:80px">' + name + "</span>" +
      (detail
        ? '<span style="color:var(--fg-muted);font-family:var(--font-mono)">' +
          JSON.stringify(detail) +
          "</span>"
        : "");
    log.insertBefore(row, log.firstChild);

    while (log.children.length > 30) log.removeChild(log.lastChild);
  }

  // ─── Update config display ────────────────────────────────────────────────

  function updateConfigDisplay(config) {
    var el = document.getElementById("plm-js-config");
    if (el) el.textContent = JSON.stringify(config, null, 2);
  }

  // ─── Render messages with current amount + buyerCountry ──────────────────

  function renderMessages(amount) {
    var container = document.getElementById("plm-js-container");
    if (!container) return;

    if (typeof paypalSDK === "undefined" || !paypalSDK.Messages) {
      container.innerHTML =
        '<div style="color:var(--fg-muted);font-size:13px;padding:12px 0">' +
        "PayPal SDK not loaded or Messages component unavailable." +
        "</div>";
      return;
    }

    var buyerCountry = (window.DEMO && window.DEMO.buyerCountry) || undefined;
    var config = {
      amount: amount,
      placement: "product",
      style: { layout: "text", logo: { type: "inline" } },
    };
    if (buyerCountry) config.buyerCountry = buyerCountry;

    updateConfigDisplay(config);

    paypalSDK
      .Messages({
        amount: config.amount,
        placement: config.placement,
        buyerCountry: buyerCountry,
        style: config.style,
        onRender: function () {
          logEvent("onRender", { amount: amount });
        },
        onClick: function () {
          logEvent("onClick", null);
        },
        onApply: function () {
          logEvent("onApply", null);
        },
      })
      .render("#plm-js-container");

    console.log("[plm-js] Messages rendered, amount:", amount, "buyerCountry:", buyerCountry);
  }

  // ─── Entry point ──────────────────────────────────────────────────────────

  window.addEventListener("load", function () {
    console.log("[plm-js] ===== window load =====");

    var num = parseFloat(getAmount()) || 100;
    renderMessages(isZeroDecimal(getCurrency()) ? Math.round(num) : parseFloat(num.toFixed(2)));

    var amountInput = document.getElementById("demo-amount");
    var countrySel = document.getElementById("demo-country");
    var clearBtn = document.getElementById("clear-log-btn");

    if (amountInput) {
      amountInput.addEventListener("change", function () {
        var n = parseFloat(this.value);
        if (isNaN(n) || n <= 0) return;
        var val = isZeroDecimal(getCurrency()) ? Math.round(n) : parseFloat(n.toFixed(2));
        renderMessages(val);
      });
      amountInput.addEventListener("blur", function () {
        var n = parseFloat(this.value);
        if (!isNaN(n) && n > 0) {
          this.value = isZeroDecimal(getCurrency())
            ? String(Math.round(n))
            : n.toFixed(2);
        }
      });
    }

    if (countrySel) {
      countrySel.addEventListener("change", function () {
        var url = new URL(window.location.href);
        url.searchParams.set("country", this.value);
        url.searchParams.set("currency", COUNTRY_TO_CUR[this.value] || "USD");
        if (amountInput) url.searchParams.set("amount", amountInput.value.trim());
        window.location.replace(url.toString());
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        var log = document.getElementById("plm-event-log");
        if (log) {
          log.innerHTML =
            '<div style="color:var(--fg-subtle);font-size:12px">Events will appear here...</div>';
          logCount = 0;
        }
      });
    }
  });
})();
