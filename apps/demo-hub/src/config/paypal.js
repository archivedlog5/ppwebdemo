const fetch = require('node-fetch')

const API = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com'

// Token cache: { accessToken, expiresAt }
const _cache = { cn: null, us: null }

async function _fetchToken(clientId, clientSecret) {
  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PayPal auth failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  return {
    accessToken: data.access_token,
    expiresAt:   Date.now() + 8 * 60 * 60 * 1000, // 8 hours
  }
}

async function getCNToken() {
  if (!_cache.cn || Date.now() > _cache.cn.expiresAt) {
    _cache.cn = await _fetchToken(
      process.env.PAYPAL_CN_CLIENT_ID,
      process.env.PAYPAL_CN_CLIENT_SECRET
    )
  }
  return _cache.cn.accessToken
}

async function getUSToken() {
  if (!_cache.us || Date.now() > _cache.us.expiresAt) {
    _cache.us = await _fetchToken(
      process.env.PAYPAL_US_CLIENT_ID,
      process.env.PAYPAL_US_CLIENT_SECRET
    )
  }
  return _cache.us.accessToken
}

module.exports = { getCNToken, getUSToken, API }
