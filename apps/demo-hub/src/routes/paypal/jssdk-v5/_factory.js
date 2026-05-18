/**
 * Route factory for PayPal JSSDK v5 standard demos.
 * Eliminates boilerplate across 14 product route files.
 */
const { Router } = require("express");
const fetch = require("node-fetch");
const { getProduct, getProviderProducts } = require("../../../config/products");
const { getCNToken, API } = require("../../../config/paypal");

const PROVIDER = "paypal";
const SDK_VERSION = "jssdk-v5";

/**
 * createStandardRoute — for standard PayPal/ApplePay/GooglePay demos.
 * Backend: create-order + capture-order (same REST API for all).
 * Frontend: view handles SDK-specific initialization.
 *
 * @param {object} config
 * @param {string} config.productKey    - e.g. 'spb-ecm'
 * @param {string} config.sdkParams     - SDK URL query string, e.g. 'components=buttons&currency=USD'
 * @param {string} config.view          - EJS view path, e.g. 'paypal/jssdk-v5/spb-ecm'
 * @param {object} [config.orderBody]   - Extra fields merged into create-order body
 * @param {Array}  [config.extraScripts]- Extra scripts e.g. [{ url, namespace }] for Google Pay
 */
function createStandardRoute({
  productKey,
  sdkParams,
  view,
  orderBody = {},
  extraScripts = [],
}) {
  const router = Router();

  router.get(`/${productKey}`, (req, res) => {
    const product = getProduct(PROVIDER, SDK_VERSION, productKey);
    res.render(view, {
      title: product?.displayName ?? productKey,
      provider: PROVIDER,
      sdkVersion: SDK_VERSION,
      currentProductKey: productKey,
      currentSdkVersion: SDK_VERSION,
      sidebarProducts: getProviderProducts(PROVIDER),
      showSidebar: true,
      clientId: process.env.PAYPAL_CN_CLIENT_ID,
      sdkUrl: `https://www.paypal.com/sdk/js?client-id=${process.env.PAYPAL_CN_CLIENT_ID}&${sdkParams}`,
      extraScripts,
    });
  });

  router.post(`/api/${productKey}/create-order`, async (req, res) => {
    try {
      const token = await getCNToken();
      const body = {
        /*
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: '100.00' } }],
        */
        ...orderBody,
      };
      const r = await fetch(`${API}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const order = await r.json();
      if (!r.ok)
        return res
          .status(r.status)
          .json({
            error: order.message || "Create order failed",
            details: order,
          });
      res.json({ id: order.id });
    } catch (err) {
      console.error(`[${productKey}] create-order error:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post(`/api/${productKey}/capture-order`, async (req, res) => {
    try {
      const { orderID } = req.body;
      if (!orderID) return res.status(400).json({ error: "orderID required" });
      const token = await getCNToken();
      const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await r.json();
      if (!r.ok)
        return res
          .status(r.status)
          .json({ error: data.message || "Capture failed", details: data });
      res.json(data);
    } catch (err) {
      console.error(`[${productKey}] capture-order error:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

/**
 * createVaultWithPurchaseRoute — for Vault with-purchase demos.
 * Backend: create-order (with vault payment_source) + capture-order.
 *
 * @param {object} config
 * @param {string} config.productKey
 * @param {string} config.sdkParams
 * @param {string} config.view
 * @param {object} config.paymentSource  - payment_source block for vault instruction
 */
function createVaultWithPurchaseRoute({
  productKey,
  sdkParams,
  view,
  paymentSource,
}) {
  const router = Router();

  router.get(`/${productKey}`, (req, res) => {
    const product = getProduct(PROVIDER, SDK_VERSION, productKey);
    res.render(view, {
      title: product?.displayName ?? productKey,
      provider: PROVIDER,
      sdkVersion: SDK_VERSION,
      currentProductKey: productKey,
      currentSdkVersion: SDK_VERSION,
      sidebarProducts: getProviderProducts(PROVIDER),
      showSidebar: true,
      clientId: process.env.PAYPAL_CN_CLIENT_ID,
      sdkUrl: `https://www.paypal.com/sdk/js?client-id=${process.env.PAYPAL_CN_CLIENT_ID}&${sdkParams}`,
    });
  });

  router.post(`/api/${productKey}/create-order`, async (req, res) => {
    try {
      const token = await getCNToken();
      const r = await fetch(`${API}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{ amount: { currency_code: "USD", value: "100.00" } }],
          payment_source: paymentSource,
        }),
      });
      const order = await r.json();
      if (!r.ok)
        return res
          .status(r.status)
          .json({
            error: order.message || "Create order failed",
            details: order,
          });
      res.json({ id: order.id });
    } catch (err) {
      console.error(`[${productKey}] create-order error:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post(`/api/${productKey}/capture-order`, async (req, res) => {
    try {
      const { orderID } = req.body;
      if (!orderID) return res.status(400).json({ error: "orderID required" });
      const token = await getCNToken();
      const r = await fetch(`${API}/v2/checkout/orders/${orderID}/capture`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await r.json();
      if (!r.ok)
        return res
          .status(r.status)
          .json({ error: data.message || "Capture failed", details: data });

      // Extract vault token from response (varies by payment source type)
      const src = data?.payment_source;
      const vaultId =
        src?.paypal?.attributes?.vault?.id ||
        src?.card?.attributes?.vault?.id ||
        src?.apple_pay?.attributes?.vault?.id ||
        null;

      res.json({ ...data, vaultId });
    } catch (err) {
      console.error(`[${productKey}] capture-order error:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createStandardRoute, createVaultWithPurchaseRoute };
