/* Custom: Google Pay ECS (v6) — buyer selects shipping, email, phone in the Google Pay sheet.
 * Full Callback mode (onPaymentDataChanged + onPaymentAuthorized); orderId lowercase d (v6 rule).
 * REST API identical to v5 ECS; v6 adaptations: inject clientId, drop sdkUrl/extraScripts,
 * response { orderId }, :orderId / req.body.orderId, experience_context → v6 path. */
const { Router } = require("express");
const fetch = require("node-fetch");
const { getProduct, getProviderProducts } = require("../../../config/products");
const { getCNToken, API, getHeaders } = require("../../../config/paypal");
const demoParams = require("../../../config/constants");

function resolveCurrency(v) {
  return demoParams.SUPPORTED_CURRENCIES.includes(v)
    ? v
    : demoParams.DEFAULT_CURRENCY;
}

const SCA_METHODS = ["SCA_WHEN_REQUIRED", "SCA_ALWAYS"];

// Google Pay address format → PayPal shipping format
function mapGooglePayAddress(sh) {
  if (!sh || !sh.countryCode) return null;
  return {
    name: { full_name: sh.name || "" },
    address: {
      address_line_1: sh.address1 || "",
      ...(sh.address2 ? { address_line_2: sh.address2 } : {}),
      admin_area_2: sh.locality || "",
      admin_area_1: sh.administrativeArea || "",
      postal_code: sh.postalCode || "",
      country_code: sh.countryCode,
    },
  };
}

const router = Router();
const PROVIDER = "paypal",
  SDK = "jssdk-v6",
  KEY = "googlepay-ecs";

router.get("/googlepay-ecs", (req, res) => {
  const product = getProduct(PROVIDER, SDK, KEY);
  const currency = resolveCurrency(req.query.currency);
  const clientId = process.env.PAYPAL_CN_CLIENT_ID;
  res.render("paypal/jssdk-v6/googlepay-ecs", {
    title: product?.displayName ?? "Google Pay ECS",
    provider: PROVIDER,
    sdkVersion: SDK,
    currentProductKey: KEY,
    currentSdkVersion: SDK,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    clientId,
    supportedCurrencies: demoParams.SUPPORTED_CURRENCIES,
    defaultAmount: req.query.amount || demoParams.DEFAULT_AMOUNT,
    currency,
    // No sandboxShipping / sandboxPhone — buyer selects inside Google Pay sheet (ECS)
  });
});

router.post("/api/googlepay-ecs/create-order", async (req, res) => {
  try {
    const amount = req.body.amount || demoParams.DEFAULT_AMOUNT;
    const currency = resolveCurrency(req.body.currency);
    const scaMethod = SCA_METHODS.includes(req.body.scaMethod)
      ? req.body.scaMethod
      : "SCA_WHEN_REQUIRED";
    const shippingRaw = req.body.shippingAddress || null;
    const buyerName = req.body.buyerName || null;
    const email = req.body.email || null;
    const parsedPhone = req.body.parsedPhone || null; // { country_code, national_number }
    const shippingAmount = req.body.shippingAmount || "0.00";

    const amountErr = demoParams.validateAmount(amount, currency);
    if (amountErr) return res.status(400).json({ error: amountErr });

    console.log(
      "[GooglePay ECS v6] create-order — buyerName:",
      buyerName,
      "| email:",
      email,
      "| parsedPhone:",
      parsedPhone,
    );
    console.log(
      "[GooglePay ECS v6] shippingAddress from sheet:",
      shippingRaw,
      "| shippingAmount:",
      shippingAmount,
    );

    const token = await getCNToken();
    const zd = demoParams.isZeroDecimal(currency);
    const value = zd
      ? String(Math.round(parseFloat(amount)))
      : parseFloat(amount).toFixed(2);
    const shipVal = zd
      ? String(Math.round(parseFloat(shippingAmount)))
      : parseFloat(shippingAmount).toFixed(2);
    const totalVal = zd
      ? String(Math.round(parseFloat(value) + parseFloat(shipVal)))
      : (parseFloat(value) + parseFloat(shipVal)).toFixed(2);
    const amtObj = (c, v) => ({ currency_code: c, value: v });

    const shippingPayPal = mapGooglePayAddress(shippingRaw);

    const body = {
      intent: demoParams.INTENT.CAPTURE,
      purchase_units: [
        {
          reference_id: demoParams.DEMO_REFERENCE_ID,
          description: demoParams.DEMO_DESCRIPTION,
          invoice_id: `INV-${Date.now()}`,
          custom_id: demoParams.DEMO_CUSTOM_ID,
          soft_descriptor: demoParams.DEMO_SOFT_DESCRIPTOR,
          amount: {
            currency_code: currency,
            value: totalVal,
            breakdown: {
              item_total: amtObj(currency, value),
              shipping: amtObj(currency, shipVal),
            },
          },
          items: [
            { ...demoParams.DEMO_ITEM, unit_amount: amtObj(currency, value) },
          ],
          ...(shippingPayPal ? { shipping: shippingPayPal } : {}),
        },
      ],
      payment_source: {
        google_pay: {
          ...(buyerName ? { name: buyerName } : {}),
          ...(email ? { email_address: email } : {}),
          ...(parsedPhone ? { phone_number: parsedPhone } : {}),
          experience_context: {
            return_url: `${req.protocol}://${req.get("host")}/paypal/jssdk-v6/googlepay-ecs`,
            cancel_url: `${req.protocol}://${req.get("host")}/paypal/jssdk-v6/googlepay-ecs`,
          },
          attributes: { verification: { method: scaMethod } },
        },
      },
    };

    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify(body),
    });
    const order = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: order.message, details: order });
    res.json({ orderId: order.id }); // v6: lowercase d
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/googlepay-ecs/order/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params; // v6: lowercase d
    if (!orderId) return res.status(400).json({ error: "orderId required" });
    const token = await getCNToken();
    const r = await fetch(`${API}/v2/checkout/orders/${orderId}`, {
      method: "GET",
      headers: getHeaders(token),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/googlepay-ecs/capture-order", async (req, res) => {
  try {
    const { orderId } = req.body; // v6: lowercase d
    if (!orderId) return res.status(400).json({ error: "orderId required" });
    const token = await getCNToken();
    const r = await fetch(`${API}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: getHeaders(token),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message, details: data });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
