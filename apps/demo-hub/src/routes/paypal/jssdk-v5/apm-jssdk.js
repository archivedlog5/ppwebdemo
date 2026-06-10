/**
 * PayPal JSSDK v5 — APM iDEAL（自定义路由）
 * iDEAL：荷兰 · EUR · 银行重定向 · 中国商户
 */
const { Router } = require("express");
const fetch = require("node-fetch");
const { randomUUID } = require("crypto");
const { getProduct, getProviderProducts } = require("../../../config/products");
const { getCNToken, API, getHeaders } = require("../../../config/paypal");
const C = require("../../../config/constants");

const PROVIDER = "paypal";
const SDK_VERSION = "jssdk-v5";
const PRODUCT_KEY = "apm-jssdk";

const router = Router();

function buildBody(amount) {
  const val = parseFloat(amount).toFixed(2);
  const eur = (v) => ({ currency_code: "EUR", value: v });

  return {
    intent: C.INTENT.CAPTURE,

    payment_source: {
      ideal: {
        country_code: "NL",
        name: "Cross Wen",
        experience_context: {
          brand_name: C.EXPERIENCE_CONTEXT.brand_name,
          locale: "nl-NL",
          return_url: C.EXPERIENCE_CONTEXT.return_url,
          cancel_url: C.EXPERIENCE_CONTEXT.cancel_url,
        },
      },
    },

    purchase_units: [
      {
        reference_id: C.DEMO_REFERENCE_ID,
        description: C.DEMO_DESCRIPTION,
        custom_id: C.DEMO_CUSTOM_ID,
        soft_descriptor: C.DEMO_SOFT_DESCRIPTOR,
        invoice_id: `INV-${Date.now()}`,

        amount: {
          currency_code: "EUR",
          value: val,
          breakdown: { item_total: eur(val) },
        },
        items: [{ ...C.DEMO_ITEM, unit_amount: eur(val) }],

        shipping: C.NL_SHIPPING,
      },
    ],
  };
}

router.get(`/${PRODUCT_KEY}`, (req, res) => {
  const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY);
  const amount = req.query.amount || C.DEFAULT_AMOUNT;
  const clientId = process.env.PAYPAL_CN_CLIENT_ID;
  const sdkUrl =
    `https://www.paypal.com/sdk/js?client-id=${clientId}` +
    `&components=buttons,marks&enable-funding=ideal&currency=EUR&buyer-country=NL`;

  res.render(`paypal/jssdk-v5/${PRODUCT_KEY}`, {
    title: product?.displayName ?? PRODUCT_KEY,
    provider: PROVIDER,
    sdkVersion: SDK_VERSION,
    currentProductKey: PRODUCT_KEY,
    currentSdkVersion: SDK_VERSION,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    clientId,
    sdkUrl,
    defaultAmount: amount,
  });
});

router.post(`/api/${PRODUCT_KEY}/create-order`, async (req, res) => {
  try {
    const amount = req.body.amount || C.DEFAULT_AMOUNT;
    const amountErr = C.validateAmount(amount, "EUR");
    if (amountErr) return res.status(400).json({ error: amountErr });

    const token = await getCNToken();
    const body = buildBody(amount);
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: "POST",
      headers: getHeaders(token, { "PayPal-Request-Id": randomUUID() }),
      body: JSON.stringify(body),
    });
    const order = await r.json();
    console.log("[apm-jssdk create-order]", JSON.stringify(order, null, 2));
    if (!r.ok)
      return res
        .status(r.status)
        .json({ error: order.message || "Create order failed", details: order });
    res.json({ id: order.id });
  } catch (err) {
    console.error("[apm-jssdk] create-order error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post(`/api/${PRODUCT_KEY}/capture-order`, async (req, res) => {
  try {
    const { orderID } = req.body;
    if (!orderID) return res.status(400).json({ error: "orderID required" });

    const token = await getCNToken();
    const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
      method: "POST",
      headers: getHeaders(token),
    });
    const data = await r.json();
    console.log("[apm-jssdk capture]", JSON.stringify(data, null, 2));
    if (!r.ok)
      return res
        .status(r.status)
        .json({ error: data.message || "Capture failed", details: data });

    res.json(data);
  } catch (err) {
    console.error("[apm-jssdk] capture-order error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
