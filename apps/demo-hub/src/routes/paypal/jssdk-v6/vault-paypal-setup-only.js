/* Custom: Vault setup-only (no purchase) — uses /v3/vault/setup-tokens + /v3/vault/payment-tokens */
const { Router } = require("express");
const fetch = require("node-fetch");
const { getProduct, getProviderProducts } = require("../../../config/products");
const { getCNToken, API, getHeaders } = require("../../../config/paypal");

const router = Router();
const PROVIDER = "paypal",
  SDK = "jssdk-v6",
  KEY = "vault-paypal-setup-only";

router.get(`/${KEY}`, (req, res) => {
  const product = getProduct(PROVIDER, SDK, KEY);
  res.render(`paypal/jssdk-v6/${KEY}`, {
    title: product?.displayName ?? "Vault PayPal Setup Only",
    provider: PROVIDER,
    sdkVersion: SDK,
    currentProductKey: KEY,
    currentSdkVersion: SDK,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    clientId: process.env.PAYPAL_CN_CLIENT_ID,
    // Note: not passing sdkUrl, sdkUserIdToken, currency, or amount (zero-dollar, no fetchIdToken)
  });
});

router.post(`/api/${KEY}/create-setup-token`, async (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const token = await getCNToken();
    const r = await fetch(`${API}/v3/vault/setup-tokens`, {
      method: "POST",
      headers: getHeaders(token, {
        "PayPal-Request-Id": `setup-${Date.now()}`,
      }),
      body: JSON.stringify({
        customer: {
          merchant_customer_id: "MERCHANT_CUST_001",
        },
        payment_source: {
          paypal: {
            description:
              "Your PayPal will be saved to Cross Wen for future purchases",
            permit_multiple_payment_tokens: false,
            usage_pattern: "IMMEDIATE",
            usage_type: "MERCHANT",
            customer_type: "CONSUMER",
            experience_context: {
              shipping_preference: "NO_SHIPPING",
              payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
              brand_name: "Cross Wen",
              return_url: `${baseUrl}/paypal/jssdk-v6/${KEY}`,
              cancel_url: `${baseUrl}/paypal/jssdk-v6/${KEY}`,
            },
          },
        },
      }),
    });
    const data = await r.json();
    if (!r.ok)
      return res.status(r.status).json({ error: data.message, details: data });
    // v6: do not return approveLink — session.start() drives the popup internally
    res.json({ setupTokenId: data.id });
  } catch (err) {
    console.error(`[${KEY}] create-setup-token error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post(`/api/${KEY}/confirm-setup-token`, async (req, res) => {
  try {
    const { setupTokenId } = req.body;
    if (!setupTokenId)
      return res.status(400).json({ error: "setupTokenId required" });
    const token = await getCNToken();
    const r = await fetch(`${API}/v3/vault/payment-tokens`, {
      method: "POST",
      headers: getHeaders(token, {
        "PayPal-Request-Id": `confirm-${Date.now()}`,
      }),
      body: JSON.stringify({
        payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } },
      }),
    });
    const data = await r.json();
    if (!r.ok)
      return res.status(r.status).json({ error: data.message, details: data });
    const customerId = data.customer?.id || null;
    res.json({ paymentTokenId: data.id, customerId, data });
  } catch (err) {
    console.error(`[${KEY}] confirm-setup-token error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
