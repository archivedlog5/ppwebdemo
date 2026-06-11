/**
 * Braintree gateway — multi-region lazy init
 *
 * Usage:
 *   const { getGateway } = require('./_config')
 *   const gateway = getGateway()        // US (default)
 *   const gateway = getGateway('hk')    // HK (when configured)
 *
 * Env vars per region (replace REGION with us, hk, etc.):
 *   BRAINTREE_<REGION>_MERCHANT_ID
 *   BRAINTREE_<REGION>_PUBLIC_KEY
 *   BRAINTREE_<REGION>_PRIVATE_KEY
 */
const braintree = require('braintree')

const gateways = new Map()

function getGateway(region = 'us') {
  if (gateways.has(region)) return gateways.get(region)

  const prefix = `BRAINTREE_${region.toUpperCase()}_`
  const merchantId = process.env[`${prefix}MERCHANT_ID`]
  const publicKey  = process.env[`${prefix}PUBLIC_KEY`]
  const privateKey = process.env[`${prefix}PRIVATE_KEY`]

  if (!merchantId || !publicKey || !privateKey) {
    throw new Error(`Braintree credentials not configured for region: ${region} (missing ${prefix}*)`)
  }

  const gateway = new braintree.BraintreeGateway({
    environment: braintree.Environment.Sandbox,
    merchantId,
    publicKey,
    privateKey,
  })

  gateways.set(region, gateway)
  return gateway
}

module.exports = { getGateway }
