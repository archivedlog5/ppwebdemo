/* Custom: Vault setup-only (no purchase) — uses /v3/vault/setup-tokens */
const { Router } = require("express");
const fetch = require("node-fetch");
const { getProduct, getProviderProducts } = require("../../../config/products");
const { getCNToken, API, getHeaders } = require("../../../config/paypal");

const router = Router();
const PROVIDER = "paypal",
  SDK = "jssdk-v5",
  KEY = "vault-paypal-setup-only";

async function fetchIdToken() {
  const cid = process.env.PAYPAL_CN_CLIENT_ID;
  const sec = process.env.PAYPAL_CN_CLIENT_SECRET;
  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${cid}:${sec}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&response_type=id_token",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`id_token fetch failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.id_token;
}

router.get("/vault-paypal-setup-only", async (req, res) => {
  try {
    const product = getProduct(PROVIDER, SDK, KEY);
    const clientId = process.env.PAYPAL_CN_CLIENT_ID;
    const idToken = await fetchIdToken();

    res.render("paypal/jssdk-v5/vault-paypal-setup-only", {
      title: product?.displayName ?? "PayPal Vault Setup",
      provider: PROVIDER,
      sdkVersion: SDK,
      currentProductKey: KEY,
      currentSdkVersion: SDK,
      sidebarProducts: getProviderProducts(PROVIDER),
      showSidebar: true,
      sdkUrl: `https://www.paypal.com/sdk/js?buyer-country=US&client-id=${clientId}&components=buttons&currency=USD`,
      sdkUserIdToken: idToken,
    });
  } catch (err) {
    console.error(`[${KEY}] GET error:`, err.message);
    res.status(500).send("Error loading demo: " + err.message);
  }
});

router.post(
  "/api/vault-paypal-setup-only/create-setup-token",
  async (req, res) => {
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
                return_url: `${baseUrl}/paypal/jssdk-v5/vault-paypal-setup-only`,
                cancel_url: `${baseUrl}/paypal/jssdk-v5/vault-paypal-setup-only`,
              },
            },
          },
        }),
      });
      const data = await r.json();
      if (!r.ok)
        return res
          .status(r.status)
          .json({ error: data.message, details: data });
      const approveLink = data.links?.find((l) => l.rel === "approve")?.href;
      res.json({ setupTokenId: data.id, approveLink });
    } catch (err) {
      console.error(`[${KEY}] create-setup-token error:`, err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

router.post(
  "/api/vault-paypal-setup-only/confirm-setup-token",
  async (req, res) => {
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
        return res
          .status(r.status)
          .json({ error: data.message, details: data });
      const customerId = data.customer?.id || null;
      res.json({ paymentTokenId: data.id, customerId, data });
    } catch (err) {
      console.error(`[${KEY}] confirm-setup-token error:`, err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
