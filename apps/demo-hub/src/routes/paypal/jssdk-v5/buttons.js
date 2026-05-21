/* Custom: dual SDK (CN account + US account for Venmo) */
const { Router } = require("express");
const fetch = require("node-fetch");
const { getProduct, getProviderProducts } = require("../../../config/products");
const {
  getCNToken,
  getUSToken,
  API,
  getHeaders,
} = require("../../../config/paypal");
const demoParams = require("../../../config/constants");
const {
  DEFAULT_AMOUNT,
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  validateAmount,
} = demoParams;

function resolveCurrency(v) {
  return SUPPORTED_CURRENCIES.includes(v) ? v : DEFAULT_CURRENCY;
}

function buildBody(amount, currency) {
  const zd = demoParams.isZeroDecimal(currency);
  const val = zd
    ? String(Math.round(parseFloat(amount)))
    : parseFloat(amount).toFixed(2);
  const amountObj = (curr) => ({ currency_code: curr, value: val });
  return {
    intent: demoParams.INTENT.CAPTURE,
    payment_source: {
      paypal: {
        ...demoParams.SANDBOX_BUYER,
        experience_context: demoParams.EXPERIENCE_CONTEXT,
      },
    },
    purchase_units: [
      {
        reference_id: demoParams.DEMO_REFERENCE_ID,
        description: demoParams.DEMO_DESCRIPTION,
        invoice_id: `INV-${Date.now()}`,
        custom_id: demoParams.DEMO_CUSTOM_ID,
        soft_descriptor: demoParams.DEMO_SOFT_DESCRIPTOR,
        amount: {
          currency_code: currency,
          value: val,
          breakdown: { item_total: amountObj(currency) },
        },
        items: [{ ...demoParams.DEMO_ITEM, unit_amount: amountObj(currency) }],
        shipping: demoParams.SANDBOX_SHIPPING,
      },
    ],
  };
}

function buildBodyVenmo(amount, currency) {
  const zd = demoParams.isZeroDecimal(currency);
  const val = zd
    ? String(Math.round(parseFloat(amount)))
    : parseFloat(amount).toFixed(2);
  const amountObj = (curr) => ({ currency_code: curr, value: val });
  return {
    intent: demoParams.INTENT.CAPTURE,
    payment_source: {
      venmo: {
        experience_context: {
          brand_name: "Cross Wen US Store",
          shipping_preference: "SET_PROVIDED_ADDRESS",
        },
      },
    },
    purchase_units: [
      {
        reference_id: demoParams.DEMO_REFERENCE_ID,
        description: demoParams.DEMO_DESCRIPTION,
        invoice_id: `INV-${Date.now()}`,
        custom_id: demoParams.DEMO_CUSTOM_ID,
        soft_descriptor: demoParams.DEMO_SOFT_DESCRIPTOR,
        amount: {
          currency_code: currency,
          value: val,
          breakdown: { item_total: amountObj(currency) },
        },
        items: [{ ...demoParams.DEMO_ITEM, unit_amount: amountObj(currency) }],
        shipping: 
          demoParams.VENMO_SHIPPING
      },
    ],
  };
}

const router = Router();
const PROVIDER = "paypal",
  SDK = "jssdk-v5",
  KEY = "buttons";

router.get("/buttons", (req, res) => {
  const product = getProduct(PROVIDER, SDK, KEY);
  const currency = resolveCurrency(req.query.currency);
  const amount = req.query.amount || DEFAULT_AMOUNT;
  const CN_ID = process.env.PAYPAL_CN_CLIENT_ID;
  const US_ID = process.env.PAYPAL_US_CLIENT_ID;
  res.render("paypal/jssdk-v5/buttons", {
    title: product?.displayName ?? "Standalone Buttons",
    provider: PROVIDER,
    sdkVersion: SDK,
    currentProductKey: KEY,
    currentSdkVersion: SDK,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    defaultAmount: amount,
    currency,
    cnSdkUrl: `https://www.paypal.com/sdk/js?client-id=${CN_ID}&commit=true&buyer-country=US&components=buttons,funding-eligibility&currency=${currency}&disable-funding=bancontact,blik,eps,giropay,ideal,mercadopago,mybank,p24,sepa,sofort`,
    usSdkUrl: `https://www.paypal.com/sdk/js?client-id=${US_ID}&commit=true&buyer-country=US&components=buttons,funding-eligibility&enable-funding=venmo&currency=${currency}&disable-funding=bancontact,blik,eps,giropay,ideal,mercadopago,mybank,p24,sepa,sofort`,
  });
});

// CN: PayPal / PayLater / BCDC
router.post("/api/buttons/create-order", async (req, res) => {
  try {
    const amount = req.body.amount || DEFAULT_AMOUNT;
    const currency = resolveCurrency(req.body.currency);
    const amountErr = validateAmount(amount, currency);
    if (amountErr) return res.status(400).json({ error: amountErr });
    const token = await getCNToken();
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify(buildBody(amount, currency)),
    });
    const order = await r.json();
    if (!r.ok)
      return res
        .status(r.status)
        .json({ error: order.message, details: order });
    res.json({ id: order.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// venmo test account pwv-test-user2/VenmoP@y12345 pwv-test-user3/VenmoP@y12345
// US: Venmo
router.post("/api/buttons/create-order-us", async (req, res) => {
  try {
    const amount = req.body.amount || DEFAULT_AMOUNT;
    const currency = resolveCurrency(req.body.currency);
    const amountErr = validateAmount(amount, currency);
    if (amountErr) return res.status(400).json({ error: amountErr });
    const token = await getUSToken();
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify(buildBodyVenmo(amount, currency)),
    });
    const order = await r.json();
    if (!r.ok)
      return res
        .status(r.status)
        .json({ error: order.message, details: order });
    res.json({ id: order.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Capture (handles both CN and US)
router.post("/api/buttons/capture-order", async (req, res) => {
  try {
    const { orderID, account } = req.body;
    if (!orderID) return res.status(400).json({ error: "orderID required" });
    const token = account === "us" ? await getUSToken() : await getCNToken();
    const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: getHeaders(token),
    });
    const data = await r.json();
    if (!r.ok)
      return res.status(r.status).json({ error: data.message, details: data });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
