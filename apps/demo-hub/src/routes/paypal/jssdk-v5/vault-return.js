/* Custom: Vault return buyer — list saved payment methods + charge */
const { Router } = require("express");
const fetch = require("node-fetch");
const { randomUUID } = require("crypto");
const { getProduct, getProviderProducts } = require("../../../config/products");
const { getCNToken, API, getHeaders } = require("../../../config/paypal");
const demoParams = require("../../../config/constants");

function resolveCurrency(v) {
  return demoParams.SUPPORTED_CURRENCIES.includes(v)
    ? v
    : demoParams.DEFAULT_CURRENCY;
}

const router = Router();
const PROVIDER = "paypal",
  SDK = "jssdk-v5",
  KEY = "vault-return";

const DEMO_CUSTOMER_ID = "crosswen5";

async function fetchIdToken(customerId) {
  const r = await fetch(`${API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.PAYPAL_CN_CLIENT_ID}:${process.env.PAYPAL_CN_CLIENT_SECRET}`,
        ).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=client_credentials&response_type=id_token&target_customer_id=${encodeURIComponent(customerId)}`,
  });
  const data = await r.json();
  return data.id_token || null;
}

router.get("/vault-return", async (req, res) => {
  const product = getProduct(PROVIDER, SDK, KEY);
  const clientId = process.env.PAYPAL_CN_CLIENT_ID;
  const currency = resolveCurrency(req.query.currency);

  let idToken = null;

  try {
    idToken = await fetchIdToken(DEMO_CUSTOMER_ID);
    console.log("[vault-return] id_token fetched:", idToken ? "ok" : "null");
    console.log("[vault-return] id_token fetched:", idToken);
  } catch (e) {
    console.error("[vault-return] fetch id_token error:", e.message);
  }

  res.render("paypal/jssdk-v5/vault-return", {
    title: product?.displayName ?? "Vault Return Buyer",
    provider: PROVIDER,
    sdkVersion: SDK,
    currentProductKey: KEY,
    currentSdkVersion: SDK,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    sdkUrl: `https://www.paypal.com/sdk/js?client-id=${clientId}&buyer-country=US&components=buttons&commit=true&currency=${currency}`,
    sdkUserIdToken: idToken,
    clientId,
    defaultAmount: req.query.amount || demoParams.DEFAULT_AMOUNT,
    currency,
    customerId: DEMO_CUSTOMER_ID,
  });
});

// Fetch vaulted payment methods for the demo customer
router.get("/api/vault-return/payment-tokens", async (req, res) => {
  try {
    const accessToken = await getCNToken();
    const r = await fetch(
      `${API}/v3/vault/payment-tokens?customer_id=${encodeURIComponent(DEMO_CUSTOMER_ID)}&total_required=true`,
      { headers: getHeaders(accessToken) },
    );
    const data = await r.json();
    if (!r.ok)
      return res.status(r.status).json({ error: data.message, details: data });
    const payment_tokens = data.payment_tokens || [];
    const total_items = data.total_items || payment_tokens.length;
    console.log(
      `[vault-return] fetched ${total_items} tokens for ${DEMO_CUSTOMER_ID}`,
    );
    res.json({ payment_tokens, total_items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Non-PayPal: create order with vault token (card/apple_pay) — CAPTURE intent returns COMPLETED directly
router.post("/api/vault-return/create-and-capture", async (req, res) => {
  try {
    const { paymentTokenId, tokenType, amount, currency } = req.body;
    if (!paymentTokenId)
      return res.status(400).json({ error: "paymentTokenId required" });
    if (!tokenType || !["card", "apple_pay"].includes(tokenType))
      return res
        .status(400)
        .json({ error: "tokenType must be 'card' or 'apple_pay'" });
    const cur = resolveCurrency(currency);
    const amountErr = demoParams.validateAmount(
      amount || demoParams.DEFAULT_AMOUNT,
      cur,
    );
    if (amountErr) return res.status(400).json({ error: amountErr });

    const accessToken = await getCNToken();
    const zd = demoParams.isZeroDecimal(cur);
    const value = zd
      ? String(Math.round(parseFloat(amount)))
      : parseFloat(amount).toFixed(2);
    const amtObj = { currency_code: cur, value };

    const paymentSource =
      tokenType === "card"
        ? { card: { vault_id: paymentTokenId } }
        : { apple_pay: { vault_id: paymentTokenId } };

    const body = {
      intent: demoParams.INTENT.CAPTURE,
      payment_source: paymentSource,
      purchase_units: [
        {
          reference_id: demoParams.DEMO_REFERENCE_ID,
          description: demoParams.DEMO_DESCRIPTION,
          invoice_id: `INV-${Date.now()}`,
          custom_id: demoParams.DEMO_CUSTOM_ID,
          soft_descriptor: demoParams.DEMO_SOFT_DESCRIPTOR,
          amount: {
            currency_code: cur,
            value,
            breakdown: { item_total: amtObj },
          },
          items: [{ ...demoParams.DEMO_ITEM, unit_amount: amtObj }],
          shipping: demoParams.SANDBOX_SHIPPING,
        },
      ],
    };

    const orderRes = await fetch(`${API}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        ...getHeaders(accessToken),
        "PayPal-Request-Id": randomUUID(),
      },
      body: JSON.stringify(body),
    });
    const order = await orderRes.json();
    if (!orderRes.ok)
      return res
        .status(orderRes.status)
        .json({ error: order.message, details: order });

    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    console.log(
      `[vault-return] ${tokenType} vault order ${order.id} capture ${capture?.id} status ${capture?.status}`,
    );
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PayPal returning payer: create order (same params as spb-ecm; SDK resolves returning buyer via data-user-id-token)
router.post("/api/vault-return/create-order", async (req, res) => {
  try {
    const { paymentSource, amount, currency } = req.body;
    const cur = resolveCurrency(currency);
    const amountErr = demoParams.validateAmount(
      amount || demoParams.DEFAULT_AMOUNT,
      cur,
    );
    if (amountErr) return res.status(400).json({ error: amountErr });

    const accessToken = await getCNToken();
    const zd = demoParams.isZeroDecimal(cur);
    const value = zd
      ? String(Math.round(parseFloat(amount)))
      : parseFloat(amount).toFixed(2);
    const amtObj = { currency_code: cur, value };

    console.log(
      `[vault-return] PayPal create-order paymentSource: ${paymentSource}`,
    );
    const body = {
      intent: demoParams.INTENT.CAPTURE,
      payment_source: {
        paypal: {
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
            currency_code: cur,
            value,
            breakdown: { item_total: amtObj },
          },
          items: [{ ...demoParams.DEMO_ITEM, unit_amount: amtObj }],
          shipping: demoParams.SANDBOX_SHIPPING,
        },
      ],
    };

    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        ...getHeaders(accessToken),
        "PayPal-Request-Id": randomUUID(),
      },
      body: JSON.stringify(body),
    });
    const order = await r.json();
    if (!r.ok)
      return res
        .status(r.status)
        .json({ error: order.message, details: order });
    console.log(`[vault-return] PayPal create-order ${order.id}`);
    res.json({ id: order.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PayPal returning payer: capture after onApprove
router.post("/api/vault-return/capture-order", async (req, res) => {
  try {
    const { orderID } = req.body;
    if (!orderID) return res.status(400).json({ error: "orderID required" });
    const accessToken = await getCNToken();
    const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: getHeaders(accessToken),
    });
    const data = await r.json();
    if (!r.ok)
      return res.status(r.status).json({ error: data.message, details: data });
    const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
    console.log(
      `[vault-return] PayPal capture ${capture?.id} status ${capture?.status}`,
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
