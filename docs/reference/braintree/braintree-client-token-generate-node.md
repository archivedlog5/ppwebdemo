# Braintree Client Token: Generate (Node.js)

> Source: https://developer.paypal.com/braintree/docs/reference/request/client-token/generate/node/
> Fetched: 2026-06-12

---

## Overview

Returns a string containing all authorization and configuration information the client needs to initialize the client SDK for communicating with Braintree.

---

## Basic Usage

**Callback pattern:**

```js
gateway.clientToken.generate({}, (err, response) => {
    const clientToken = response.clientToken
});
```

**Promise pattern** is also available as an alternative to callbacks.

---

## Parameters

### `customerId` (String)

*Only applies to the Drop-in UI; not needed for custom integrations.*

A string representing an existing customer in your Vault. Passing this allows customers to manage their vaulted payment methods via the Drop-in UI.

### `merchantAccountId` (String)

Specify the merchant account ID to use for generating the client token. If omitted or if the ID doesn't match any of your merchant accounts, your default merchant account is used.

The merchant account determines:
- Whether the PayPal button should be displayed
- Whether the 3D Secure authentication flow can be invoked

### `options`

#### `failOnDuplicatePaymentMethod` (bool)

If this option is passed and the same payment method already exists in the Vault for **any** customer, the request will fail. Can only be passed with a `customerId`. If the check fails, the Drop-in is stopped from returning a paymentMethodNonce.

> Ignored for PayPal, Pay with Venmo, Apple Pay, Google Pay, and Samsung Pay.

#### `failOnDuplicatePaymentMethodForCustomer` (bool)

If this option is passed and the same payment method already exists in the Vault for **the specified** customer, the request will fail. Can only be passed with a `customerId`. If the check fails, the Drop-in is stopped from returning a paymentMethodNonce.

> Ignored for PayPal, Pay with Venmo, Apple Pay, Google Pay, and Samsung Pay.

#### `makeDefault` (bool)

Makes the specified payment method the default for the customer. Can only be passed with a `customerId`.

#### `verifyCard` (bool)

If the payment method is a credit card, this prompts the gateway to verify the card's number and expiration date. It also verifies AVS and CVV information if AVS/CVV rules are enabled. Can only be passed with a `customerId`. If verification fails, the Drop-in won't return a paymentMethodNonce.

> **Note:** Braintree strongly recommends verifying all cards before storing them in your Vault by enabling card verification for your entire account in the Control Panel. In some cases, cardholders may see a temporary authorization that falls off within a few days and never settles.

#### `version` (String)

The version of the client token to generate. Default is `2`. Supported versions are `1`, `2`, and `3`. Check your client-side SDKs before changing this value.

---

## Example: Specify a Customer ID

For returning customers with saved payment methods in the Drop-in UI, provide the customer's ID:

```js
gateway.clientToken.generate({ customerId: aCustomerId }, (err, response) => {
    // pass clientToken to your front-end
    const clientToken = response.clientToken
});
```

If the customer can't be found, the response contains a message stating "Customer specified by customer_id does not exist".

---

## Language Variants

| Language | Link |
|---|---|
| Java | `/braintree/docs/reference/request/client-token/generate/java/` |
| .NET | `/braintree/docs/reference/request/client-token/generate/dotnet/` |
| Node.js | `/braintree/docs/reference/request/client-token/generate/node/` |
| PHP | `/braintree/docs/reference/request/client-token/generate/php/` |
| Python | `/braintree/docs/reference/request/client-token/generate/python/` |
| Ruby | `/braintree/docs/reference/request/client-token/generate/ruby/` |
