const { Router } = require("express");
const fetch = require("node-fetch");
const { getProduct, getProviderProducts } = require("../../../config/products");
const { getCNToken, API, getHeaders } = require("../../../config/paypal");
const {
  validateAmount,
  isZeroDecimal,
  DEFAULT_AMOUNT,
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  INTENT,
  DEMO_DESCRIPTION,
  DEMO_ITEM,
  SANDBOX_SHIPPING,
} = require("../../../config/constants");

const PROVIDER = "paypal";
const SDK_VERSION = "jssdk-v6";
const PRODUCT_KEY = "vault-paypal-with-purchase";

function resolveCurrency(value) {
  return SUPPORTED_CURRENCIES.includes(value) ? value : DEFAULT_CURRENCY;
}

const router = Router();

router.get(`/${PRODUCT_KEY}`, (req, res) => {
  const product = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY);
  const currency = resolveCurrency(req.query.currency);
  const amount = req.query.amount || DEFAULT_AMOUNT;
  res.render(`paypal/jssdk-v6/${PRODUCT_KEY}`, {
    title: product?.displayName ?? "Vault PayPal with Purchase",
    provider: PROVIDER,
    sdkVersion: SDK_VERSION,
    currentProductKey: PRODUCT_KEY,
    currentSdkVersion: SDK_VERSION,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    clientId: process.env.PAYPAL_CN_CLIENT_ID,
    supportedCurrencies: SUPPORTED_CURRENCIES,
    defaultAmount: amount,
    currency,
  });
});

router.post(`/api/${PRODUCT_KEY}/create-order`, async (req, res) => {
  try {
    const amount = req.body.amount || DEFAULT_AMOUNT;
    const currency = resolveCurrency(req.body.currency);
    const amountErr = validateAmount(amount, currency);
    if (amountErr) return res.status(400).json({ error: amountErr });

    const zd = isZeroDecimal(currency);
    const val = zd
      ? String(Math.round(parseFloat(amount)))
      : parseFloat(amount).toFixed(2);
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const body = {
      intent: INTENT.CAPTURE,
      payment_source: {
        paypal: {
          attributes: {
            vault: {
              store_in_vault: "ON_SUCCESS",
              usage_type: "MERCHANT",
              customer_type: "CONSUMER",
              permit_multiple_payment_tokens: false,
              description:
                "After Purchase Your Payment Method Will Be Saved to Cross Wen China Store",
            },
            customer: {
              merchant_customer_id: "MERCHANT_CUST_001",
            },
          },
          experience_context: {
            brand_name: "Cross Wen China Store",
            shipping_preference: "SET_PROVIDED_ADDRESS",
            return_url: `${baseUrl}/paypal/jssdk-v6/${PRODUCT_KEY}`,
            cancel_url: `${baseUrl}/paypal/jssdk-v6/${PRODUCT_KEY}`,
          },
        },
      },
      purchase_units: [
        {
          amount: {
            currency_code: currency,
            value: val,
            breakdown: { item_total: { currency_code: currency, value: val } },
          },
          description: DEMO_DESCRIPTION,
          items: [
            {
              ...DEMO_ITEM,
              unit_amount: { currency_code: currency, value: val },
            },
          ],
          shipping: SANDBOX_SHIPPING,
        },
      ],
    };

    const token = await getCNToken();
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify(body),
    });
    const order = await r.json();
    if (!r.ok)
      return res.status(r.status).json({
        error: order.message || "Create order failed",
        details: order,
      });
    res.json({ orderId: order.id });
  } catch (err) {
    console.error(`[${PRODUCT_KEY}] create-order error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post(`/api/${PRODUCT_KEY}/capture-order`, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: "orderId required" });
    const token = await getCNToken();
    const r = await fetch(`${API}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: getHeaders(token),
    });
    const data = await r.json();
    if (!r.ok)
      return res
        .status(r.status)
        .json({ error: data.message || "Capture failed", details: data });

    const vaultInfo = data?.payment_source?.paypal?.attributes?.vault;
    const vaultId = vaultInfo?.id || null;
    const customerId = vaultInfo?.customer?.id || null;
    res.json({ ...data, vaultId, customerId });
  } catch (err) {
    console.error(`[${PRODUCT_KEY}] capture-order error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
