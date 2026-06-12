/**
 * Braintree API 常量与 Demo 默认数据
 * 所有 Braintree 路由文件从此处引用，不在路由文件里硬编码
 */

// ── 账单联系人（billing / customer / 3DS billingAddress）─────────────────
const BILLING_FIRST_NAME = "John";
const BILLING_LAST_NAME = "Doe";
const BILLING_EMAIL = "john.doe@example.com";
const BILLING_PHONE = "3125551212";

// ── 账单地址 ──────────────────────────────────────────────────────────────
const BILLING_STREET_ADDRESS = "1 E Main St";
const BILLING_EXTENDED_ADDRESS = "Suite 403";
const BILLING_LOCALITY = "Chicago";
const BILLING_REGION = "IL";
const BILLING_POSTAL_CODE = "60622";
const BILLING_COUNTRY_CODE = "US";

// ── 收货联系人（shipping / 3DS additionalInformation）────────────────────
const SHIPPING_FIRST_NAME = "Jane";
const SHIPPING_LAST_NAME = "Smith";

// ── 收货地址 ──────────────────────────────────────────────────────────────
const SHIPPING_STREET_ADDRESS = "456 Market St";
const SHIPPING_EXTENDED_ADDRESS = "Apt 12";
const SHIPPING_LOCALITY = "San Francisco";
const SHIPPING_REGION = "CA";
const SHIPPING_POSTAL_CODE = "94105";
const SHIPPING_COUNTRY_CODE = "US";

// ── 收货方式 ──────────────────────────────────────────────────────────────
const SHIPPING_METHOD = "ground";

// ── 描述符（transaction.sale descriptor）────────────────────────────────
// name: DBA 段必须为 3、7 或 12 字符；产品段对应最多 18、14、9 字符；总长 ≤ 22
//   3 DBA + * + 18 product | 7 DBA + * + 14 product | 12 DBA + * + 9 product
// phone: digits only
// url: max 13 chars, letters/numbers/slashes/periods only
const DESCRIPTOR_NAME = "CWEN5BT*DROPIN"; // 7 + * + 6 = 14 chars
const DESCRIPTOR_PHONE = "2407808080";
const DESCRIPTOR_URL = "cwen5.com";

// ── Demo 商品行项（transaction.sale lineItems，Level 3 数据）─────────────
// unitAmount / totalAmount 是动态值（等于 transaction amount），在路由里注入
// kind: "debit"（扣款）| "credit"（退款/折扣）
const LINE_ITEM_NAME = "Demo Product";
const LINE_ITEM_KIND = "debit";
const LINE_ITEM_QUANTITY = "1";
const LINE_ITEM_UNIT_OF_MEASURE = "each";
const LINE_ITEM_DESCRIPTION = "Braintree Drop-in Demo Purchase";
const LINE_ITEM_PRODUCT_CODE = "BT-DEMO-001"; // max 12 chars
const LINE_ITEM_COMMODITY_CODE = "43231500"; // UNSPSC: e-commerce software
const LINE_ITEM_URL = "https://cwen5.com";

// ── 国家码 → 电话区号映射（用于 internationalPhone.countryCode）────────────
// PayPal payload.details.countryCode 是 ISO 3166-1 alpha-2，需转换为 1-3 位数字区号
const COUNTRY_DIAL_MAP = {
  US: "1",
  CA: "1",
  GB: "44",
  AU: "61",
  DE: "49",
  FR: "33",
  ES: "34",
  IT: "39",
  NL: "31",
  JP: "81",
  CN: "86",
  KR: "82",
  BR: "55",
  MX: "52",
  IN: "91",
  SG: "65",
  HK: "852",
  AE: "971",
};

// ── Level 2 税务与采购单 ──────────────────────────────────────────────────
// taxAmount 对应前端 paypal.amountBreakdown.taxTotal
const TAX_AMOUNT = "0.00"; // Level 2，与 amountBreakdown.taxTotal 一致
const PURCHASE_ORDER_NUMBER = "PO-DEMO-001"; // Level 2，max 17 chars (non-PayPal) / 12 chars (AIB)

// ── PayPal（Braintree Drop-in PayPal 专属选项）───────────────────────────
const PAYPAL_DESC = "CWEN5 Drop-in Demo Purchase";
const PAYPAL_FIELD = "cwen5-dropin-demo";

module.exports = {
  COUNTRY_DIAL_MAP,
  TAX_AMOUNT,
  PURCHASE_ORDER_NUMBER,
  LINE_ITEM_NAME,
  LINE_ITEM_KIND,
  LINE_ITEM_QUANTITY,
  LINE_ITEM_UNIT_OF_MEASURE,
  LINE_ITEM_DESCRIPTION,
  LINE_ITEM_PRODUCT_CODE,
  LINE_ITEM_COMMODITY_CODE,
  LINE_ITEM_URL,
  BILLING_FIRST_NAME,
  BILLING_LAST_NAME,
  BILLING_EMAIL,
  BILLING_PHONE,
  BILLING_STREET_ADDRESS,
  BILLING_EXTENDED_ADDRESS,
  BILLING_LOCALITY,
  BILLING_REGION,
  BILLING_POSTAL_CODE,
  BILLING_COUNTRY_CODE,
  SHIPPING_FIRST_NAME,
  SHIPPING_LAST_NAME,
  SHIPPING_STREET_ADDRESS,
  SHIPPING_EXTENDED_ADDRESS,
  SHIPPING_LOCALITY,
  SHIPPING_REGION,
  SHIPPING_POSTAL_CODE,
  SHIPPING_COUNTRY_CODE,
  SHIPPING_METHOD,
  DESCRIPTOR_NAME,
  DESCRIPTOR_PHONE,
  DESCRIPTOR_URL,
  PAYPAL_DESC,
  PAYPAL_FIELD,
};
