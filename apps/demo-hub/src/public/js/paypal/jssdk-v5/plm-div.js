;(function () {
  "use strict";

  var ZERO_DECIMAL = ["JPY", "KRW", "TWD", "CLP", "IDR"];
  var COUNTRY_TO_CUR = { US: "USD", AU: "AUD", DE: "EUR", ES: "EUR", FR: "EUR", IT: "EUR", GB: "GBP", CA: "CAD" };

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

  // ─── Update data-pp-amount on all PLM divs ────────────────────────────────

  function updateAllMessages() {
    var amount = getAmount();
    var num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return;
    var zd = isZeroDecimal(getCurrency());
    var val = zd ? String(Math.round(num)) : num.toFixed(2);
    var els = document.querySelectorAll("[data-pp-message]");
    for (var i = 0; i < els.length; i++) {
      els[i].setAttribute("data-pp-amount", val);
    }
    console.log("[plm-div] updated data-pp-amount →", val, "on", els.length, "element(s)");
  }

  // ─── Entry point ──────────────────────────────────────────────────────────

  window.addEventListener("load", function () {
    console.log("[plm-div] ===== window load =====");

    updateAllMessages();

    var amountInput = document.getElementById("demo-amount");
    var countrySel = document.getElementById("demo-country");

    if (amountInput) {
      amountInput.addEventListener("change", updateAllMessages);
      amountInput.addEventListener("blur", function () {
        var num = parseFloat(this.value);
        if (!isNaN(num) && num > 0) {
          this.value = isZeroDecimal(getCurrency())
            ? String(Math.round(num))
            : num.toFixed(2);
        }
        updateAllMessages();
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
  });
})();
