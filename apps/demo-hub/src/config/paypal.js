const fetch = require("node-fetch");

const API = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

// Token cache: { accessToken, expiresAt }
const _cache = { cn: null, us: null };

async function _fetchToken(clientId, clientSecret) {
  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal auth failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000, // 8 hours
  };
}

async function getCNToken() {
  if (!_cache.cn || Date.now() > _cache.cn.expiresAt) {
    _cache.cn = await _fetchToken(
      process.env.PAYPAL_CN_CLIENT_ID,
      process.env.PAYPAL_CN_CLIENT_SECRET,
    );
  }
  return _cache.cn.accessToken;
}

async function getUSToken() {
  if (!_cache.us || Date.now() > _cache.us.expiresAt) {
    _cache.us = await _fetchToken(
      process.env.PAYPAL_US_CLIENT_ID,
      process.env.PAYPAL_US_CLIENT_SECRET,
    );
  }
  return _cache.us.accessToken;
}

/**
 * Browser-safe client token for PayPal v6 SDK (US account).
 * Uses response_type=client_token with domain whitelisting.
 * Not cached — called once per page load.
 */
async function getUSClientToken() {
  const clientId = process.env.PAYPAL_US_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_US_CLIENT_SECRET;
  const domains = process.env.PAYPAL_US_MERCHANT_DOMAINS;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    response_type: "client_token",
    "domains[]": domains,
  }).toString();

  console.log("[getUSClientToken] formBody:", body);

  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal client token failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

/**
 * Standard headers for PayPal REST API calls.
 * @param {string} token  - Bearer access token
 * @param {object} [extra] - Additional headers (e.g. PayPal-Request-Id)
 */
function getHeaders(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

module.exports = { getCNToken, getUSToken, getUSClientToken, API, getHeaders };
