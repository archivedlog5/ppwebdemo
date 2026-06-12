# Braintree Transaction: Sale API Reference (Node.js)

> Source: https://developer.paypal.com/braintree/docs/reference/request/transaction/sale/node/
> Fetched: 2026-06-11

---

## Overview

To create a transaction, you must include an **amount** and either a **paymentMethodNonce**, a **paymentMethodToken**, or a **customerId**. Passing a customerId is equivalent to passing the paymentMethodToken of the customer's default payment method.

Braintree offers products that manage risk and fraud. These products require adequate data support, which can be added during SDK or GraphQL integration and must be done before using risk products.

---

## Basic Example

```javascript
gateway.transaction.sale({
    amount: "10.00",
    paymentMethodNonce: nonceFromTheClient,
    deviceData: deviceDataFromTheClient,
    options: {
        submitForSettlement: true
    }
}, (err, result) => {
    if (result.success) {
        // See result.transaction for details
    } else {
        // Handle errors
    }
});
```

---

## Parameters

### `amount` (String) — **Required**

The billing amount. Must be greater than 0 and match the currency format of the merchant account. Can only contain numbers and one decimal point (e.g. `x.xx`). Cannot exceed processor maximums.

### `billing`

Billing address information associated with a specific customer ID. AVS rules are not applied when creating from a Vault record using a payment method token.

| Sub-field | Type | Description |
|-----------|------|-------------|
| `company` | String | 255 character max |
| `countryCodeAlpha2` | String | ISO 3166-1 alpha-2; PayPal transactions *must* use this format |
| `countryCodeAlpha3` | String | ISO 3166-1 alpha-3 |
| `countryCodeNumeric` | String | ISO 3166-1 numeric |
| `countryName` | String | Only accepts specific country names |
| `extendedAddress` | String | Apt/suite number, 255 char max |
| `firstName` | String | ≤ 255 characters |
| `internationalPhone` | Object | Structured with country code and national number |
| `internationalPhone.countryCode` | String | 1-3 digits, **required** |
| `internationalPhone.nationalNumber` | String | 4-12 digits, **required** |
| `lastName` | String | ≤ 255 characters |
| `locality` | String | City, 255 char max |
| `phoneNumber` | String | **Deprecated** — use `internationalPhone` |
| `postalCode` | String | 4-9 alphanumeric characters, optionally with dash/space |
| `region` | String | State/province; for PayPal must meet PayPal's state restrictions |
| `streetAddress` | String | 255 char max, **required** when AVS rules require street address |

### `billingAddressId` (String)

A two-letter value for an address associated with a specific customer ID. Max 50 addresses per customer.

### `channel` (String)

For partners and shopping carts only. Maps to `paypal.bn_code` for PayPal transactions.

### `creditCard`

**Requires PCI SAQ D compliance.** Braintree recommends using `paymentMethodNonce` to avoid PCI concerns.

| Sub-field | Type | Description |
|-----------|------|-------------|
| `cardholderName` | String | ≤ 175 characters |
| `cvv` | String | 3 or 4 digit CVV; never stored in gateway |
| `expirationDate` | String | `MM/YY` or `MM/YYYY` |
| `expirationMonth` | Number | `MM` format |
| `expirationYear` | Number | `YYYY` or `YY` format |
| `number` | String | 12-19 digit BIN + PAN |
| `token` | String | ≤ 36 characters, references a Vault payment method |

#### `creditCard.networkTokenizationAttributes`

For processing third-party card-on-file network token transactions:

| Sub-field | Type | Description |
|-----------|------|-------------|
| `cryptogram` | String | The token cryptogram |
| `ecommerceIndicator` | String | ECI value |
| `tokenRequestorId` | String | The token requestor ID |

#### `creditCard.paymentReaderCardDetails`

For transactions initiated through manual key entry on a payment reader:

| Sub-field | Type | Description |
|-----------|------|-------------|
| `encryptedCardData` | String | Encrypted payload with credit card data |
| `keySerialNumber` | String | Key serial number for data decryption |

### `customFields`

A collection of custom field/value pairs. Must be strings or integers, max 255 characters each. Must be set up in the Control Panel first.

### `customer`

Used when storing a new customer in the Vault with a new payment method.

| Sub-field | Type | Description |
|-----------|------|-------------|
| `company` | String | 255 char max |
| `email` | String | ASCII characters, 255 char max |
| `fax` | String | 255 char max |
| `firstName` | String | ≤ 255 characters |
| `id` | String | 36 char max, unique in Vault; valid: letters, numbers, `-`, `_`; cannot use "all" or "new" |
| `internationalPhone` | Object | Structured with country code and national number |
| `internationalPhone.countryCode` | String | 1-3 digits, **required** |
| `internationalPhone.nationalNumber` | String | 4-12 digits, **required** |
| `lastName` | String | ≤ 255 characters |
| `phone` | String | **Deprecated** — use `internationalPhone` |
| `website` | String | ≤ 255 characters; URL scheme optional |

### `customerId` (String)

A string value representing an existing customer in your Vault that you want to charge.

### `descriptor`

Dynamic descriptors define what appears on credit card statements. Not enabled by default on all accounts.

| Sub-field | Type | Description |
|-----------|------|-------------|
| `name` | String | Business name on statement; length limits depend on processor |
| `phone` | String | 10-14 characters; can contain numbers, hyphens, parentheses |
| `url` | String | ≤ 13 characters |

### `deviceData` (String) — **Required for:**

- Premium Fraud Management Tools
- One-time Vaulted PayPal transactions
- Venmo transactions

Can be a raw PayPal Risk Correlation ID or a JSON-escaped hash string from the Braintree client SDK.

### `deviceSessionId` (String) — **Deprecated**

Use `deviceData` instead.

### `discountAmount` (String)

A Level 3 field specifying the discount amount included in the total transaction amount. Cannot be negative.

### `exchangeRateQuoteId` (String)

The ID of a previously generated exchange rate quote for presentment-to-settlement currency conversion.

### `externalVault`

Options for externally vaulted payment methods.

| Sub-field | Type | Description |
|-----------|------|-------------|
| `previousNetworkTransactionId` | String | Network transaction identifier from card brand networks |
| `status` | String | `"vaulted"` or `"will_vault"` |

### `fraudMerchantId` (String) — Deprecated

Required only when you have a direct relationship with Kount.

### `lineItems`

Up to 249 line items. Passed to processor for Level 3 processing.

| Sub-field | Type | Description |
|-----------|------|-------------|
| `commodityCode` | String | UNSPSC code, max 12 chars. For US Visa CEDP, required for Level 3 |
| `description` | String | Max 127 characters |
| `discountAmount` | String | Up to 2 decimal places. Cannot be negative |
| `kind` | String | `"debit"` or `"credit"` |
| `name` | String | Max 35 chars (127 for PayPal). For US Visa CEDP, must differ from merchant name |
| `productCode` | String | Max 12 chars (127 for PayPal). For US Visa CEDP, required for Level 3 |
| `quantity` | String | Up to 4 decimal places. Cannot be negative or zero |
| `taxAmount` | String | Up to 2 decimal places. Cannot be negative |
| `totalAmount` | String | Quantity × unit amount. Up to 2 decimal places |
| `unitAmount` | String | Max 4 decimal places (2 for PayPal). Cannot be negative or zero |
| `unitOfMeasure` | String | Max 12 chars. For US Visa CEDP, required for Level 3 |
| `unitTaxAmount` | String | Up to 2 decimal places. Cannot be negative |
| `upcCode` | String | Max 17 characters. Requires `upcType` |
| `upcType` | String | `"UPC-A"`, `"UPC-B"`, `"UPC-C"`, `"UPC-D"`, `"UPC-E"`, `"UPC-2"`, or `"UPC-5"` |
| `url` | String | URL to product information |

### `merchantAccountId` (String)

The merchant account ID used to create a transaction. Currency is determined by this ID. Defaults to your default merchant account.

### `options`

| Sub-field | Type | Description |
|-----------|------|-------------|
| `addBillingAddressToPaymentMethod` | bool | Adds billing address to new payment methods |
| `holdInEscrow` | bool | For Marketplace merchants — holds funds in escrow |
| `skipAdvancedFraudChecking` | boolean | Skips Premium Fraud Management Tools evaluation |
| `skipAvs` | boolean | Skips AVS checks |
| `skipCvv` | boolean | Skips CVV checks |
| `storeInVault` | bool | Stores payment method regardless of transaction success |
| `storeInVaultOnSuccess` | bool | Stores payment method only on success |
| `storeShippingAddressInVault` | bool | Associates shipping address with customer; always stores payment method |
| `submitForSettlement` | bool | Submits authorized transaction for settlement |
| `threeDSecure.required` | bool | Requires 3D Secure verification to succeed |

#### `options.creditCard`

| Sub-field | Type | Description |
|-----------|------|-------------|
| `accountType` | String | `"credit"` (default) or `"debit"` |

#### `options.paypal`

| Sub-field | Type | Description |
|-----------|------|-------------|
| `customField` | String | Passed directly to PayPal for tracking |
| `description` | String | Displayed in PayPal email receipts, max 127 chars |

##### `options.paypal.selectedFinancingOption`

| Sub-field | Type | Description |
|-----------|------|-------------|
| `currencyCode` | String | Currency code |
| `discountAmount` | String | Optional discount amount |
| `discountPercentage` | String | Optional discount percentage on interest rates |
| `monthlyPayment` | String | Monthly payment amount |
| `term` | String | Agreed term in months |

#### `options.processingOverrides`

These values will be used by the processor, taking precedence over similar fields. They will not be returned in responses.

| Sub-field | Type | Description |
|-----------|------|-------------|
| `customerEmail` | String | ASCII email address |
| `customerFirstName` | String | ≤ 255 characters |
| `customerLastName` | String | ≤ 255 characters |
| `customerTaxIdentifier` | String | SSN analogue for the corresponding country |

#### `options.venmo`

| Sub-field | Type | Description |
|-----------|------|-------------|
| `profileId` | String | Specify which Venmo business profile to use |

### `orderId` (String)

Additional transaction information. For PayPal, maps to invoice number (must be unique). Max 255 chars (127 for PayPal).

### `paymentMethodNonce` (String)

One-time-use reference to customer payment information (credit card, PayPal, etc.). Alternative to `paymentMethodToken`.

### `paymentMethodToken` (String)

≤ 36 characters, references a Vault-stored payment method.

### `processingMerchantCategoryCode` (String)

MCC used for processing, overriding the static MCC on the merchant account. ≤ 4 numeric characters.

### `purchaseOrderNumber` (String)

Level 2 field. Up to 12 ASCII characters (AIB) or 17 characters (all other processors).

### `recurring` (bool) — **Deprecated**

Use `transactionSource` with value `"recurring"` instead.

### `riskData`

Customer device information sent directly to processors for fraud analysis. Currently available only for Amex Direct.

| Sub-field | Type | Description |
|-----------|------|-------------|
| `customerBrowser` | String | User-Agent header, max 255 characters |
| `customerIp` | String | Customer's IP address |

### `scaExemption` (String)

SCA exemption claim. Accepted values: `"low_value"`, `"secure_corporate"`, `"trusted_beneficiary"`.

### `serviceFeeAmount` (String)

Portion of sub-merchant transaction revenue routed to master merchant account. Must be ≥ 0. For Marketplace merchants.

### `sharedBillingAddressId` (String)

For Shared Vault only. Address ID belonging to the OAuth application owner.

### `sharedCustomerId` (String)

For Shared Vault only. Customer ID belonging to the OAuth application owner.

### `sharedPaymentMethodNonce` (String)

For Shared Vault only. Payment method nonce belonging to the OAuth application owner. Mutually exclusive with `sharedPaymentMethodToken`.

### `sharedPaymentMethodToken` (String)

For Shared Vault only. Token of a payment method belonging to the OAuth application owner.

### `sharedShippingAddressId` (String)

For Shared Vault only. Address ID belonging to the OAuth application owner.

### `shipping`

Shipping address information.

| Sub-field | Type | Description |
|-----------|------|-------------|
| `company` | String | 255 char max |
| `countryCodeAlpha2` | String | ISO 3166-1 alpha-2 |
| `countryCodeAlpha3` | String | ISO 3166-1 alpha-3 |
| `countryCodeNumeric` | String | ISO 3166-1 numeric |
| `countryName` | String | Specific country names only |
| `extendedAddress` | String | Apt/suite, 255 char max |
| `firstName` | String | ≤ 255 chars. **Required** for PayPal shipping address |
| `internationalPhone` | Object | Structured phone number |
| `internationalPhone.countryCode` | String | 1-3 digits, **required** |
| `internationalPhone.nationalNumber` | String | 4-12 digits, **required** |
| `lastName` | String | ≤ 255 chars. **Required** for PayPal shipping address |
| `locality` | String | City, 255 char max. **Required** for PayPal shipping address |
| `phoneNumber` | String | **Deprecated** |
| `postalCode` | String | 4-9 alphanumeric chars. **Required** for PayPal shipping address. CEDP US: 5 digits, 5+4, or 5-4 format |
| `region` | String | State/province. **Required** for PayPal shipping address |
| `shippingMethod` | String | `sameDay`, `expedited`, `priority`, `ground`, `electronicDelivery`, `shipToStore`, or `pickupInStore` |
| `streetAddress` | String | 255 char max. **Required** for PayPal shipping address |

### `shippingAddressId` (String)

A shipping address associated with a specific customer ID. Max 50 per customer.

### `shippingAmount` (String)

Level 3 field specifying shipping cost. Cannot be negative.

### `shippingTaxAmount` (String)

Level 3 field specifying tax charged on shipping. Cannot be negative.

### `shipsFromPostalCode` (String)

Level 3 field for the shipping location postal code. CEDP US: 5 digits, 5+4, or 5-4 format.

### `surchargeAmount` (String)

Surcharge amount included in total. Cannot be negative. Merchant account must be registered for surcharging.

### `taxAmount` (String)

Level 2 field specifying tax in total amount. Cannot be negative. For US Visa CEDP, must be calculated according to total transaction amount. Tax estimation is not allowed.

### `taxExempt` (bool)

Level 2 field indicating tax exemption eligibility. Does not affect total amount.

### `threeDSecureAuthenticationId` (String)

ID of the 3D Secure authentication performed for this transaction.

### `threeDSecurePassThru`

Results of merchant-performed 3D Secure authentication (for merchants with their own MPI integration).

| Sub-field | Type | Description |
|-----------|------|-------------|
| `cavv` | String | Cardholder authentication verification value (CAVV/AVV/AEVV) |
| `directoryResponse` | String | TransStatus from 3D Secure provider, single character (Y, N, I for DCAP) |
| `dsTransactionId` | String | Transaction identifier from 3DS 2 authentication. Required for Mastercard Identity Check |
| `eciFlag` | String | ECI flag value. Mastercard: `00`, `01`, `02`, `04`. Others: `07`, `06`, `05`. DCAP US: `07` |
| `network` | String | Payment network: `eftpos`, `Visa`, or `Mastercard` (case-insensitive) |
| `threeDSecureVersion` | String | Version of 3DS (e.g. `1.0.2`). Required on Visa and Mastercard |
| `xid` | String | Base64-encoded transaction identifier from 3DS. Not used in 3DS 2 |

### `transactionSource` (String)

- **Merchant-initiated:** `"recurring"`, `"unscheduled"`, `"installment"`
- **Customer-initiated:** `"recurring_first"`, `"moto"`, `"installment_first"`, `"estimated"`, `"estimated_moto"`

### `usBankAccount`

| Sub-field | Type | Description |
|-----------|------|-------------|
| `achMandateAcceptedAt` | String | ISO 8601 date/time of ACH mandate acceptance |
| `achMandateText` | String | Text of the ACH mandate |

---

## Full Example

```javascript
gateway.transaction.sale({
    amount: "10.00",
    orderId: "order id",
    merchantAccountId: "aMerchantAccountId",
    paymentMethodNonce: nonceFromTheClient,
    deviceData: deviceDataFromTheClient,
    customer: {
        firstName: "Drew",
        lastName: "Smith",
        company: "Braintree",
        phone: "312-555-1234",
        fax: "312-555-12346",
        website: "http://www.example.com",
        email: "drew@example.com"
    },
    billing: {
        firstName: "Paul",
        lastName: "Smith",
        company: "Braintree",
        streetAddress: "1 E Main St",
        extendedAddress: "Suite 403",
        locality: "Chicago",
        region: "IL",
        postalCode: "60622",
        countryCodeAlpha2: "US"
    },
    shipping: {
        firstName: "Jen",
        lastName: "Smith",
        company: "Braintree",
        streetAddress: "1 E 1st St",
        extendedAddress: "5th Floor",
        locality: "Bartlett",
        region: "IL",
        postalCode: "60103",
        countryCodeAlpha2: "US"
    },
    options: {
        submitForSettlement: true
    },
}, (err, result) => {
    // Handle result
});
```

### Response on success

```javascript
result.success; // true
result.transaction.type; // "credit"
result.transaction.status; // "submitted_for_settlement"
```

---

## Storing in Vault

### Existing customer with new payment method

```javascript
gateway.transaction.sale({
    amount: "10.00",
    paymentMethodNonce: nonceFromTheClient,
    customerId: "theCustomerId",
    options: {
        storeInVaultOnSuccess: true
    }
}, (err, result) => {
    // Handle result
});
```

### New customer with new payment method

```javascript
gateway.transaction.sale({
    amount: "10.00",
    paymentMethodNonce: nonceFromTheClient,
    customer: {
        id: "aCustomerId"
    },
    options: {
        storeInVaultOnSuccess: true
    }
}, (err, result) => {
    // Handle result
});
```

> The `customer` parameter should only be used when creating a new customer with a new payment method, and `storeInVaultOnSuccess` only vaults the payment method if the transaction is successful.

---

## Using a Vaulted Payment Method

```javascript
gateway.transaction.sale({
    paymentMethodToken: "theToken",
    amount: "10.00"
}, (err, result) => {
    // Handle result
});
```

Or using a `customerId` (uses the customer's default payment method):

```javascript
gateway.transaction.sale({
    customerId: "theCustomerId",
    amount: "10.00"
}, (err, result) => {
    // Handle result
});
```

---

## CVV-Only Nonce

```javascript
gateway.transaction.sale({
    paymentMethodToken: "theToken",
    paymentMethodNonce: cvvOnlyNonceFromClient,
    amount: "10.00"
}, (err, result) => {
    // Handle result
});
```

---

## Specify Merchant Account ID

```javascript
gateway.transaction.sale({
    amount: "100.00",
    merchantAccountId: "yourMerchantAccount",
    paymentMethodNonce: nonceFromTheClient
}, (err, result) => {
    // Handle result
});
```

If you don't specify a merchant account, Braintree uses your default merchant account.

---

## Using Stored Addresses

```javascript
gateway.transaction.sale({
    customerId: "theCustomerId",
    amount: "10.00",
    billingAddressId: "AA",
    shippingAddressId: "AB"
}, (err, result) => {
    // Handle result
});
```

---

## Custom Fields Example

```javascript
gateway.transaction.sale({
    amount: "100.00",
    paymentMethodNonce: nonceFromTheClient,
    customFields: {
        customFieldOne: "value one",
        customFieldTwo: "value two"
    }
}, (err, result) => {
    if (result.success) {
        result.transaction.customFields; // {customFieldOne: "value one", customFieldTwo: "value two"}
    }
});
```

---

## Dynamic Descriptors

Dynamic descriptors are typically composed of a name and phone number or URL. The name must include the business name, followed by a product name or identifier, separated by an asterisk (`*`).

```javascript
gateway.transaction.sale({
    amount: "10.00",
    paymentMethodNonce: nonceFromTheClient,
    descriptor: {
        name: "company*my production",
        phone: "3125551212",
        url: "company.com"
    }
}, (err, result) => {
    result.transaction.descriptor.name; // "company*my production"
    result.transaction.descriptor.phone; // "3125551212"
});
```

### Venmo Descriptor Rules

Venmo supports only the `name` dynamic descriptor. Format allows alphanumeric characters and `+-.` (space included). The full descriptor is structured as: `VENMO *` (two spaces) + `Business Name` + `Dynamic Descriptor Name`. Limited to **22 characters** total. If exceeded, portions are truncated as needed.

### PayPal Descriptor Rules

For PayPal, the dynamic descriptor is limited to **22 characters** and includes:
- Default prefix `PAYPAL *`
- Your PayPal hard descriptor
- The product portion of the `name`

The DBA portion must be 3, 7, or 12 characters long and will be dropped from the dynamic descriptor.

### Braintree Marketplace Descriptor Rules

Only the name value is passed (no phone or URL). The name can contain ASCII characters a-z, A-Z, 0-9, `.`, `-`, `+`, and spaces. **Max 18 characters.** The descriptor starts with `"BT *"` followed by your name. For names ≤ 12 characters, a randomly generated 6-character string is appended (e.g., `"BT *MYDESCRIPTOR123abc"`). For names ≥ 13 characters, no 6-character string is appended.

---

## Escrow (Braintree Marketplace)

```javascript
gateway.transaction.sale({
    amount: "100.00",
    merchantAccountId: "blue_ladders_store",
    paymentMethodNonce: nonceFromTheClient,
    options: {
        submitForSettlement: true,
        holdInEscrow: true,
    },
    serviceFeeAmount: "10.00"
}, (err, result) => {
});
```
