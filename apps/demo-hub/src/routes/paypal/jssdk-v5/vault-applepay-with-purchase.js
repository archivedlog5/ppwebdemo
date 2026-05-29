/* Custom: Apple Pay Vault with Purchase — store_in_vault ON_SUCCESS + stored_credential */
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

const router = Router();
const PROVIDER = "paypal";
const SDK = "jssdk-v5";
const KEY = "vault-applepay-with-purchase";

router.get("/vault-applepay-with-purchase", (req, res) => {
  const product = getProduct(PROVIDER, SDK, KEY);
  const clientId = process.env.PAYPAL_CN_CLIENT_ID;
  res.render("paypal/jssdk-v5/vault-applepay-with-purchase", {
    title: product?.displayName ?? "Apple Pay Vault",
    provider: PROVIDER,
    sdkVersion: SDK,
    currentProductKey: KEY,
    currentSdkVersion: SDK,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    sdkUrl: `https://www.paypal.com/sdk/js?client-id=${clientId}&components=applepay&vault=true&currency=USD`,
  });
});

router.post(
  "/api/vault-applepay-with-purchase/create-order",
  async (req, res) => {
    try {
      const amount = req.body.amount || demoParams.DEFAULT_AMOUNT;
      const currency = resolveCurrency(req.body.currency);
      const amountErr = demoParams.validateAmount(amount, currency);
      if (amountErr) return res.status(400).json({ error: amountErr });

      const token = await getCNToken();
      const zd = demoParams.isZeroDecimal(currency);
      const value = zd
        ? String(Math.round(parseFloat(amount)))
        : parseFloat(amount).toFixed(2);
      const amtObj = (c) => ({ currency_code: c, value });

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
              value,
              breakdown: { item_total: amtObj(currency) },
            },
            items: [{ ...demoParams.DEMO_ITEM, unit_amount: amtObj(currency) }],
          },
        ],
        payment_source: {
          apple_pay: {
            experience_context: {
              return_url: `${req.protocol}://${req.get("host")}/paypal/jssdk-v5/vault-applepay-with-purchase`,
              cancel_url: `${req.protocol}://${req.get("host")}/paypal/jssdk-v5/vault-applepay-with-purchase`,
            },
            stored_credential: {
              payment_initiator: "CUSTOMER",
              payment_type: "RECURRING",
              usage: "FIRST",
            },
            attributes: {
              vault: {
                store_in_vault: "ON_SUCCESS",
              },
            },
          },
        },
      };

      const r = await fetch(`${API}/v2/checkout/orders`, {
        method: "POST",
        headers: getHeaders(token),
        body: JSON.stringify(body),
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
  },
);

router.post(
  "/api/vault-applepay-with-purchase/capture-order",
  async (req, res) => {
    try {
      const { orderID } = req.body;
      if (!orderID) return res.status(400).json({ error: "orderID required" });

      const token = await getCNToken();
      const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
        method: "POST",
        headers: getHeaders(token),
      });
      const data = await r.json();
      if (!r.ok)
        return res
          .status(r.status)
          .json({ error: data.message, details: data });

      const vaultInfo = data.payment_source?.apple_pay?.attributes?.vault;
      const vaultId = vaultInfo?.id || null;
      const customerId = vaultInfo?.customer?.id || null;
      const vaultStatus = vaultInfo?.status || null;
      console.log(
        `[${KEY}] capture — vaultId:`,
        vaultId,
        "| customerId:",
        customerId,
        "| vaultStatus:",
        vaultStatus,
      );

      res.json({ ...data, vaultId, customerId, vaultStatus });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

module.exports = router;
