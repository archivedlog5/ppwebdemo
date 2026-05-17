const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// In-memory config map
// key: 'paypal/jssdk-v5/spb-ecm' → { displayName, description, enabled, sortOrder, ... }
let productConfig = new Map()

async function loadProductConfig() {
  const { data, error } = await supabase
    .schema('demohub')
    .from('products')
    .select('*')
    .order('provider')
    .order('sort_order')

  if (error) throw new Error(`Failed to load product config: ${error.message}`)

  productConfig = new Map(
    data.map(row => [
      `${row.provider}/${row.sdk_version}/${row.product_key}`,
      {
        displayName: row.display_name,
        description: row.description,
        enabled:     row.enabled,
        sortOrder:   row.sort_order,
        provider:    row.provider,
        sdkVersion:  row.sdk_version,
        productKey:  row.product_key,
      }
    ])
  )

  console.log(`[config] Loaded ${productConfig.size} products from demohub.products`)
}

function getProduct(provider, sdkVersion, productKey) {
  return productConfig.get(`${provider}/${sdkVersion}/${productKey}`) ?? null
}

// Returns enabled products grouped: { paypal: { 'jssdk-v5': [...] }, braintree: { ... } }
function getGroupedProducts() {
  const grouped = {}
  for (const product of productConfig.values()) {
    if (!product.enabled) continue
    if (!grouped[product.provider]) grouped[product.provider] = {}
    if (!grouped[product.provider][product.sdkVersion]) grouped[product.provider][product.sdkVersion] = []
    grouped[product.provider][product.sdkVersion].push(product)
  }
  return grouped
}

// Returns all enabled products for a provider, grouped by sdkVersion
function getProviderProducts(provider) {
  const grouped = {}
  for (const product of productConfig.values()) {
    if (product.provider !== provider || !product.enabled) continue
    if (!grouped[product.sdkVersion]) grouped[product.sdkVersion] = []
    grouped[product.sdkVersion].push(product)
  }
  return grouped
}

function productUrl({ provider, sdkVersion, productKey }) {
  return `/${provider}/${sdkVersion}/${productKey}`
}

module.exports = { loadProductConfig, getProduct, getGroupedProducts, getProviderProducts, productUrl }
