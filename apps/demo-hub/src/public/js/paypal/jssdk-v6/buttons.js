(function () {
  "use strict";

  console.log("[Buttons-v6] buttons.js loaded");

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getCurrency() {
    return "USD";
  }

  function getAmount() {
    var inp = document.getElementById("demo-amount");
    return inp ? inp.value.trim() : "";
  }

  function validateAmount() {
    var raw = getAmount();
    var amt = parseFloat(raw);
    if (!raw || isNaN(amt) || amt <= 0 || !/^\d+(\.\d{1,2})?$/.test(raw)) {
      showResult("Please enter a valid amount (e.g. 100.00).", "error");
      return false;
    }
    return true;
  }

  function showResult(text, type) {
    console.log("[Buttons-v6] showResult() type=%s text=%s", type, text);
    var el = document.getElementById("result");
    if (!el) return;
    el.className = "result-msg " + type;
    el.textContent = text;
  }

  function clearContainer(id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = "";
    return el;
  }

  function showNotEligible(id, msg) {
    var el = document.getElementById(id);
    if (el)
      el.innerHTML =
        '<span style="font-size:11px;color:var(--fg-subtle)">' +
        msg +
        "</span>";
  }

  // ── Capture (shared) ───────────────────────────────────────────────────────

  function captureOrder(orderId, captureUrl) {
    return fetch(captureUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: orderId }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (order) {
        console.log("[Buttons-v6] capture response =", order);
        if (order.error) {
          showResult("✗ " + order.error, "error");
          return;
        }
        var capture =
          order.purchase_units &&
          order.purchase_units[0] &&
          order.purchase_units[0].payments &&
          order.purchase_units[0].payments.captures &&
          order.purchase_units[0].payments.captures[0];
        if (!capture || capture.status !== "COMPLETED") {
          showResult(
            "✗ Capture failed · status: " +
              (capture ? capture.status : "unknown"),
            "error",
          );
          return;
        }
        showResult("✓ Payment captured · Order: " + order.id, "success");
      });
  }

  // ── PayPal button ──────────────────────────────────────────────────────────

  function setupPayPalButton(cnInstance, urls) {
    console.log("[Buttons-v6] setting up PayPal button");
    var session = cnInstance.createPayPalOneTimePaymentSession({
      onApprove: function (data) {
        console.log("[Buttons-v6] PayPal onApprove, orderId =", data.orderId);
        return captureOrder(data.orderId, urls.captureOrderCn);
      },
      onCancel: function () {
        showResult("Payment cancelled.", "error");
      },
      onError: function (err) {
        showResult("✗ PayPal: " + (err.message || String(err)), "error");
      },
    });

    var container = clearContainer("btn-paypal");
    var btn = document.createElement("paypal-button");
    btn.setAttribute("type", "pay");
    btn.setAttribute("class", "paypal-gold");
    container.appendChild(btn);

    btn.addEventListener("click", function () {
      if (!validateAmount()) return;
      var orderPromise = fetch(urls.createOrderCn, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: getAmount(), currency: getCurrency() }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          if (d.error) throw new Error(d.error);
          return { orderId: d.orderId };
        });
      session
        .start({ presentationMode: "auto" }, orderPromise)
        .catch(function (err) {
          showResult("✗ PayPal: " + (err.message || String(err)), "error");
        });
    });
    console.log("[Buttons-v6] PayPal button ready");
  }

  // ── PayLater button ────────────────────────────────────────────────────────

  function setupPayLaterButton(cnInstance, paylaterDetails, urls) {
    console.log(
      "[Buttons-v6] setting up PayLater button, details =",
      paylaterDetails,
    );
    var session = cnInstance.createPayLaterOneTimePaymentSession({
      onApprove: function (data) {
        console.log("[Buttons-v6] PayLater onApprove, orderId =", data.orderId);
        return captureOrder(data.orderId, urls.captureOrderCn);
      },
      onCancel: function () {
        showResult("Payment cancelled.", "error");
      },
      onError: function (err) {
        showResult("✗ PayLater: " + (err.message || String(err)), "error");
      },
    });

    var container = clearContainer("btn-paylater");
    var btn = document.createElement("paypal-pay-later-button");
    btn.productCode = paylaterDetails.productCode;
    btn.countryCode = paylaterDetails.countryCode;
    container.appendChild(btn);

    btn.addEventListener("click", function () {
      if (!validateAmount()) return;
      var orderPromise = fetch(urls.createOrderCn, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: getAmount(), currency: getCurrency() }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          if (d.error) throw new Error(d.error);
          return { orderId: d.orderId };
        });
      session
        .start({ presentationMode: "auto" }, orderPromise)
        .catch(function (err) {
          showResult("✗ PayLater: " + (err.message || String(err)), "error");
        });
    });
    console.log("[Buttons-v6] PayLater button ready");
  }

  // ── Venmo button ───────────────────────────────────────────────────────────

  function setupVenmoButton(usInstance, urls) {
    console.log("[Buttons-v6] setting up Venmo button");
    var session = usInstance.createVenmoOneTimePaymentSession({
      onApprove: function (data) {
        console.log("[Buttons-v6] Venmo onApprove, orderId =", data.orderId);
        return captureOrder(data.orderId, urls.captureOrderUs);
      },
      onCancel: function () {
        showResult("Payment cancelled.", "error");
      },
      onError: function (err) {
        showResult("✗ Venmo: " + (err.message || String(err)), "error");
      },
    });

    var container = clearContainer("btn-venmo");
    var btn = document.createElement("venmo-button");
    btn.setAttribute("type", "pay");
    container.appendChild(btn);

    btn.addEventListener("click", function () {
      if (!validateAmount()) return;
      var orderPromise = fetch(urls.createOrderUs, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: getAmount() }), // Venmo always USD
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          if (d.error) throw new Error(d.error);
          return { orderId: d.orderId };
        });
      session
        .start({ presentationMode: "auto" }, orderPromise)
        .catch(function (err) {
          showResult("✗ Venmo: " + (err.message || String(err)), "error");
        });
    });
    console.log("[Buttons-v6] Venmo button ready");
  }

  // ── BCDC button (async session creation) ───────────────────────────────────

  async function setupBcdcButton(cnInstance, urls) {
    console.log("[Buttons-v6] setting up BCDC button");
    var session = await cnInstance.createPayPalGuestOneTimePaymentSession({
      onApprove: function (data) {
        console.log("[Buttons-v6] BCDC onApprove, orderId =", data.orderId);
        return captureOrder(data.orderId, urls.captureOrderCn);
      },
      onCancel: function () {
        showResult("Payment cancelled.", "error");
      },
      onComplete: function (data) {
        console.log("[Buttons-v6] BCDC onComplete", data);
      },
      onError: function (err) {
        showResult("✗ BCDC: " + (err.message || String(err)), "error");
      },
      onWarn: function (data) {
        console.warn("[Buttons-v6] BCDC onWarn", data);
      },
    });

    var container = clearContainer("btn-bcdc");
    var cardContainer = document.createElement("paypal-basic-card-container");
    var btn = document.createElement("paypal-basic-card-button");
    cardContainer.appendChild(btn);
    container.appendChild(cardContainer);

    btn.addEventListener("click", async function () {
      if (!validateAmount()) return;
      var orderPromise = fetch(urls.createOrderCn, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: getAmount(), currency: getCurrency() }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          if (d.error) throw new Error(d.error);
          return { orderId: d.orderId };
        });
      try {
        await session.start({ presentationMode: "auto" }, orderPromise);
      } catch (err) {
        showResult("✗ BCDC: " + (err.message || String(err)), "error");
      }
    });
    console.log("[Buttons-v6] BCDC button ready");
  }

  // ── SDK init ───────────────────────────────────────────────────────────────

  async function onPayPalWebSdkLoaded() {
    console.log("[Buttons-v6] onPayPalWebSdkLoaded()");
    var demo = window.DEMO || {};
    var urls = demo.urls;

    // CN instance via getPPInstance (clientId, reads window.DEMO.clientId = cnClientId)
    var cnPromise = getPPInstance();

    // Fetch US clientToken in parallel with CN instance creation
    var usTokenPromise = fetch(urls.usClientToken)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) throw new Error(d.error);
        return d.clientToken;
      });

    // CN buttons
    try {
      var cnInstance = await cnPromise;
      console.log("[Buttons-v6] CN instance ready", cnInstance);

      var cnEligibility = await cnInstance.findEligibleMethods({
        currencyCode: getCurrency(),
      });
      console.log(
        "[Buttons-v6] CN eligibility: paypal=%s paylater=%s basic_cards=%s",
        cnEligibility.isEligible("paypal"),
        cnEligibility.isEligible("paylater"),
        cnEligibility.isEligible("basic_cards"),
      );

      if (cnEligibility.isEligible("paypal")) {
        setupPayPalButton(cnInstance, urls);
      } else {
        showNotEligible("btn-paypal", "PayPal not eligible");
      }

      if (cnEligibility.isEligible("paylater")) {
        setupPayLaterButton(
          cnInstance,
          cnEligibility.getDetails("paylater"),
          urls,
        );
      } else {
        showNotEligible(
          "btn-paylater",
          "Pay Later not eligible in this region",
        );
      }

      if (cnEligibility.isEligible("basic_cards")) {
        await setupBcdcButton(cnInstance, urls);
      } else {
        showNotEligible("btn-bcdc", "BCDC not eligible in this region");
      }
    } catch (err) {
      console.error("[Buttons-v6] CN instance error =", err);
      showResult("✗ CN SDK error: " + (err.message || String(err)), "error");
    }

    // US buttons (Venmo) — clientToken keeps US credentials isolated from CN
    try {
      var usClientToken = await usTokenPromise;
      console.log("[Buttons-v6] US clientToken fetched");
      var usInstance = await paypal.createInstance({
        clientToken:      usClientToken,
        components:       ["venmo-payments"],
        pageType:         "checkout",
        testBuyerCountry: "US",
      });
      console.log("[Buttons-v6] US instance ready", usInstance);

      var usEligibility = await usInstance.findEligibleMethods({
        currencyCode: "USD",
      });
      console.log(
        "[Buttons-v6] Venmo eligible =",
        usEligibility.isEligible("venmo"),
      );

      if (usEligibility.isEligible("venmo")) {
        setupVenmoButton(usInstance, urls);
      } else {
        showNotEligible(
          "btn-venmo",
          "Venmo not eligible (US sandbox required)",
        );
      }
    } catch (err) {
      console.error("[Buttons-v6] US instance error =", err);
      showNotEligible(
        "btn-venmo",
        "Venmo error: " + (err.message || String(err)),
      );
    }
  }

  // ── Amount blur ────────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    var amtInp = document.getElementById("demo-amount");
    if (amtInp) {
      amtInp.addEventListener("blur", function () {
        var num = parseFloat(this.value);
        if (!isNaN(num) && num > 0) this.value = num.toFixed(2);
      });
    }
  });

  window.addEventListener("load", function () {
    console.log(
      "[Buttons-v6] window.load fired, typeof paypal =",
      typeof paypal,
    );
    if (typeof paypal === "undefined") {
      showResult("✗ PayPal SDK failed to load", "error");
      return;
    }
    if (
      typeof window.isBrowserSupportedByPayPal === "function" &&
      !window.isBrowserSupportedByPayPal()
    ) {
      showResult("✗ Your browser is not supported by PayPal.", "error");
      return;
    }
    onPayPalWebSdkLoaded();
  });
})();
