# PayPalCheckout Component Reference

> Source: https://braintree.github.io/braintree-web/current/PayPalCheckout.html
> Fetched: 2026-06-12

---

## Overview

This class represents a PayPal Checkout component that coordinates with the PayPal SDK. Instances can generate payment data and tokenize authorized payments.

All UI (including preventing parent page actions during authentication) is managed by the PayPal SDK. You must provide your PayPal `client-id` as a query parameter. You can retrieve this value from the PayPal Dashboard.

---

## Constructor

### `new PayPalCheckout(options)`

**Do not use this constructor directly. Use `braintree.paypalCheckout.create` instead.**

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | object | See `paypal-checkout.create` |

---

## Integration Guides

### Checkout Flow with PayPal SDK

Load PayPal's script with query parameters:

```html
<script src="https://www.paypal.com/sdk/js?client-id=your-sandbox-or-prod-client-id"></script>
<div id="paypal-button"></div>
```

```javascript
braintree.client.create({
  authorization: 'authorization'
}).then(function (clientInstance) {
  return braintree.paypalCheckout.create({
    client: clientInstance
  });
}).then(function (paypalCheckoutInstance) {
  return paypal.Buttons({
    createOrder: function () {
      return paypalCheckoutInstance.createPayment({
        flow: 'checkout',
        currency: 'USD',
        amount: '10.00',
        intent: 'capture'
      });
    },

    onApprove: function (data, actions) {
      return paypalCheckoutInstance.tokenizePayment(data).then(function (payload) {
        // Submit payload.nonce to your server
      });
    },

    onCancel: function () {
      // handle case where user cancels
    },

    onError: function (err) {
      // handle case where error occurs
    }
  }).render('#paypal-button');
}).catch(function (err) {
 console.error('Error!', err);
});
```

### Vault Flow with PayPal SDK

```html
<script src="https://www.paypal.com/sdk/js?client-id=your-sandbox-or-prod-client-id&vault=true"></script>
<div id="paypal-button"></div>
```

```javascript
braintree.client.create({
  authorization: 'authorization'
}).then(function (clientInstance) {
  return braintree.paypalCheckout.create({
    client: clientInstance
  });
}).then(function (paypalCheckoutInstance) {
  return paypal.Buttons({
    createBillingAgreement: function () {
      return paypalCheckoutInstance.createPayment({
        flow: 'vault'
      });
    },

    onApprove: function (data, actions) {
      return paypalCheckoutInstance.tokenizePayment(data).then(function (payload) {
        // Submit payload.nonce to your server
      });
    },

    onCancel: function () {
      // handle case where user cancels
    },

    onError: function (err) {
      // handle case where error occurs
    }
  }).render('#paypal-button');
}).catch(function (err) {
 console.error('Error!', err);
});
```

### AppSwitch Flow with PayPal SDK

```javascript
braintree.client.create({
  authorization: 'authorization'
}).then(function (clientInstance) {
  return braintree.paypalCheckout.create({
    client: clientInstance
  });
}).then(function (paypalCheckoutInstance) {
  const buttons = paypal.Buttons({

    appSwitchWhenAvailable: true,

    createOrder: function () {
      return paypalCheckoutInstance.createPayment({
        flow: 'checkout',
        currency: 'USD',
        amount: '10.00',
        intent: 'capture',
        returnUrl: 'www.example.com/return',
        cancelUrl: 'www.example.com/cancel',
      });
    },

    onApprove: function (data, actions) {
      return paypalCheckoutInstance.tokenizePayment(data).then(function (payload) {
        // Submit payload.nonce to your server
      });
    },

    onCancel: function () {
      // handle case where user cancels
    },

    onError: function (err) {
      // handle case where error occurs
    }
  });

  if (buttons.hasReturned()) {
    buttons.resume();
  } else {
    buttons.render('#paypal-button');
  };
}).catch(function (err) {
 console.error('Error!', err);
});
```

### Integration with Checkout.js (Deprecated)

For new PayPal integrations, use the current PayPal SDK. Use this only if already integrated with Checkout.js.

```html
<script src="https://www.paypalobjects.com/api/checkout.js" data-version-4 log-level="warn"></script>
```

```javascript
braintree.client.create({
  authorization: 'authorization'
}).then(function (clientInstance) {
  return braintree.paypalCheckout.create({
    client: clientInstance
  });
}).then(function (paypalCheckoutInstance) {
  return paypal.Button.render({
    env: 'production',

    payment: function () {
      return paypalCheckoutInstance.createPayment({
        // your createPayment options here
      });
    },

    onAuthorize: function (data, actions) {
      return paypalCheckoutInstance.tokenizePayment(data).then(function (payload) {
        // Submit payload.nonce to your server
      });
    }
  }, '#paypal-button');
}).catch(function (err) {
 console.error('Error!', err);
});
```

---

## Methods

### `createPayment(options, [callback])` → `{promise|void}`

Creates a PayPal payment ID or billing token using the given options. Meant to be passed to the PayPal JS SDK. When a callback is defined, returns undefined and invokes the callback with the id. Otherwise, returns a Promise that resolves with the id.

#### Options Properties

| Name | Type | Attributes | Default | Description |
|------|------|------------|---------|-------------|
| `flow` | string | | | `'checkout'` for one-time payment, `'vault'` for Vault flow |
| `intent` | string | optional | `authorize` | `authorize`, `order`, or `capture` (alias `sale`) |
| `offerCredit` | boolean | optional | false | Offers PayPal Credit as default funding instrument |
| `amount` | string\|number | optional | | Transaction amount. Required for Checkout flow. Supports up to 2 decimal digits |
| `currency` | string | optional | | Currency code like `'USD'`. Required for Checkout flow |
| `displayName` | string | optional | | Merchant name in PayPal lightbox; defaults to Braintree account company name |
| `requestBillingAgreement` | boolean | optional | | If `true` and `flow = checkout`, prompts billing agreement consent. Ignored when `flow = vault` |
| `billingAgreementDetails` | object | optional | | Details for billing agreement portion of flow |
| `shippingOptions` | Array.\<shippingOption\> | optional | | List of shipping options. Cannot be combined with `enableShippingAddress: false` or `shippingAddressEditable: false` |
| `enableShippingAddress` | boolean | optional | false | Returns shipping address object in `tokenizePayment`. Mutually exclusive with `shippingOptions` |
| `contactPreference` | string | optional | | `'NO_CONTACT_INFO'`, `'RETAIN_CONTACT_INFO'`, or `'UPDATE_CONTACT_INFO'`. US-based merchants only |
| `shippingAddressOverride` | object | optional | | Pre-collected shipping address |
| `shippingAddressEditable` | boolean | optional | true | Set to false to disable editing. Not compatible with `shippingOptions` |
| `billingAgreementDescription` | string | optional | | Description of preapproved payment agreement. Max 255 characters |
| `landingPageType` | string | optional | | `'login'` or `'billing'` |
| `lineItems` | Array.\<lineItem\> | optional | | Up to 249 line items |
| `planType` | string | optional | | `'RECURRING'`, `'SUBSCRIPTION'`, `'UNSCHEDULED'`, or `'INSTALLMENTS'` |
| `planMetadata` | planMetadata | optional | | Plan metadata when plan type is defined |
| `userAuthenticationEmail` | string | optional | | Merchant-provided buyer email to streamline sign-in |
| `returnUrl` | string | optional | | URL for app switch after successful authentication |
| `cancelUrl` | string | optional | | URL for app switch after unsuccessful authentication |
| `shippingCallbackUrl` | string | optional | | Server-side shipping callback URL |
| `riskCorrelationId` | string | optional | | Merchant-provided risk correlation ID |
| `paymentReadySessionId` | string | optional | | Session identifier from `PaymentReady.createCustomerSession` |
| `userAction` | string | optional | `CONTINUE` | `CONTINUE`, `COMMIT`, or `SETUP_NOW` |
| `amountBreakdown` | object | optional | | Collection of amounts breaking down the total |

#### `billingAgreementDetails` Properties

| Name | Type | Attributes | Description |
|------|------|------------|-------------|
| `description` | string | optional | Description of the billing agreement |
| `vaultInitiatedCheckoutPaymentMethodToken` | string | optional | Payment method nonce for a PayPal account with Billing Agreement ID. Checkout flow only |

#### `shippingAddressOverride` Properties

| Name | Type | Attributes | Description |
|------|------|------------|-------------|
| `line1` | string | | Street address |
| `line2` | string | optional | Extended street address |
| `city` | string | | City |
| `state` | string | | State |
| `postalCode` | string | | Postal code |
| `countryCode` | string | | Country |
| `phone` | string | optional | Phone number |
| `recipientName` | string | optional | Recipient's name |
| `recipientEmail` | string | optional | Recipient's email |
| `internationalPhone.countryCode` | string | optional | Phone country code |
| `internationalPhone.nationalNumber` | string | optional | Phone national number |

#### `amountBreakdown` Properties

| Name | Type | Attributes | Description |
|------|------|------------|-------------|
| `itemTotal` | string | | Item amount |
| `taxTotal` | string | optional | Tax amount. Required when `lineItem.unitTaxAmount` is used |
| `shipping` | string | optional | Shipping amount |
| `handling` | string | optional | Handling amount. Not accepted with planMetadata |
| `insurance` | string | optional | Insurance amount. Not accepted with planMetadata |
| `shippingDiscount` | string | optional | Shipping discount amount. Not accepted with planMetadata |
| `discount` | string | optional | Discount amount. Not accepted with planMetadata |

#### Examples

**Basic checkout:**

```javascript
paypal.Buttons({
  createOrder: function () {
    return paypalCheckoutInstance.createPayment({
      flow: 'checkout',
      amount: '10.00',
      currency: 'USD',
      intent: 'capture'
    });
  },
}).render('#paypal-button');
```

**With shipping options:**

```javascript
paypal.Button.render({
  env: 'production',
  payment: function () {
    return paypalCheckoutInstance.createPayment({
      flow: 'checkout',
      amount: '10.00',
      currency: 'USD',
      shippingOptions: [
        {
          id: 'UUID-9',
          type: 'PICKUP',
          label: 'Store Location Five',
          selected: true,
          amount: { value: '1.00', currency: 'USD' }
        },
        {
          id: 'shipping-speed-fast',
          type: 'SHIPPING',
          label: 'Fast Shipping',
          selected: false,
          amount: { value: '1.00', currency: 'USD' }
        },
        {
          id: 'shipping-speed-slow',
          type: 'SHIPPING',
          label: 'Slow Shipping',
          selected: false,
          amount: { value: '1.00', currency: 'USD' }
        }
      ]
    });
  },
  onAuthorize: function (data, actions) {
    return paypalCheckoutInstance.tokenizePayment(data).then(function (payload) {
      // Submit payload.nonce to your server
    });
  }
}, '#paypal-button');
```

**With plan features (vault flow):**

```javascript
paypal.Button.render({
  env: 'production',
  payment: function () {
    return paypalCheckoutInstance.createPayment({
      flow: 'vault',
      planType: 'RECURRING',
      planMetadata: {
        billingCycles: [
          {
             billingFrequency: "1",
             billingFrequencyUnit: "MONTH",
             numberOfExecutions: "1",
             sequence: "1",
             startDate: "2024-04-06T00:00:00Z",
             trial: true,
             pricingScheme: {
               pricingModel: "FIXED",
             },
          },
        ],
        currencyIsoCode: "USD",
        name: "Netflix with Ads",
        productDescription: "iPhone 13",
        productQuantity: "1.0",
        oneTimeFeeAmount: "10",
        shippingAmount: "3.0",
        productPrice: "200",
        taxAmount: "20",
      };
    });
  },
  onAuthorize: function (data, actions) {
    return paypalCheckoutInstance.tokenizePayment(data).then(function (payload) {
      // Submit payload.nonce to your server
    });
  }
}, '#paypal-button');
```

**Vault Flow with Purchase (Billing Agreement with Recurring Payment):**

```javascript
paypal.Buttons({
  createBillingAgreement: function () {
    return paypalCheckoutInstance.createPayment({
      flow: 'vault',
      amount: '12.50',
      currency: 'USD',
      planType: 'SUBSCRIPTION',
      planMetadata: {
        billingCycles: [{
          billingFrequency: 1,
          billingFrequencyUnit: "MONTH",
          sequence: 1,
          pricingScheme: {
            pricingModel: "FIXED",
            price: "10.00"
          },
        }],
        currencyIsoCode: "USD",
        totalAmount: "10.00",
        name: "My Recurring Product"
      }
    });
  },
  onApprove: function (data) {
    return paypalCheckoutInstance.tokenizePayment(data);
  }
}).render('#paypal-button');
```

---

### `getClientId([callback])` → `{Promise|void}`

Resolves with the PayPal client id for loading the PayPal SDK.

**Example:**

```javascript
paypalCheckoutInstance.getClientId().then(function (id) {
 var script = document.createElement('script');

 script.src = 'https://www.paypal.com/sdk/js?client-id=' + id;
 script.onload = function () {
   // setup the PayPal SDK
 };

 document.body.appendChild(script);
});
```

---

### `loadPayPalSDK([options], [callback])` → `{Promise|void}`

Resolves when the PayPal SDK has been successfully loaded onto the page.

#### Options Properties

| Name | Type | Attributes | Default | Description |
|------|------|------------|---------|-------------|
| `client-id` | string | optional | | Client ID from the authorization. Can speed up loading when used with `authorization` in component creation |
| `intent` | string | optional | "authorize" | Must match intent in `createPayment`. `sale` converts to `capture`. With `vault: true`, defaults to `tokenize` |
| `locale` | string | optional | en_US | Language/terminology for PayPal flow |
| `currency` | string | optional | "USD" | Must match currency in `createPayment` |
| `vault` | boolean | optional | | Must be `true` when using `flow: vault` in `createPayment` |
| `components` | string | optional | buttons | `'buttons'`, `'messages'`, or `'buttons,messages'` |
| `dataAttributes` | object | optional | | Data attributes for the script |

**`dataAttributes` Properties:**

| Name | Type | Attributes | Description |
|------|------|------------|-------------|
| `client-token` | string | optional | Client token (usually not needed) |
| `csp-nonce` | string | optional | Content security nonce |

**Examples:**

```javascript
// Without options
paypalCheckoutInstance.loadPayPalSDK().then(function () {
  // window.paypal.Buttons is now available to use
});

// With options
paypalCheckoutInstance.loadPayPalSDK({
  'client-id': 'PayPal Client Id',
  intent: 'capture',
  currency: 'USD',
}).then(function () {
  // window.paypal.Buttons is now available to use
});

// With Vaulting
paypalCheckoutInstance.loadPayPalSDK({
  vault: true
}).then(function () {
  // window.paypal.Buttons is now available to use
});
```

---

### `teardown([callback])` → `{Promise|void}`

Cleanly tear down anything set up by `create`.

```javascript
paypalCheckoutInstance.teardown();

// With callback
paypalCheckoutInstance.teardown(function () {
  // teardown is complete
});
```

---

### `tokenizePayment(tokenizeOptions, [callback])` → `{Promise|void}`

Tokenizes the authorize data from the PayPal JS SDK when completing a buyer approval flow.

| Parameter | Type | Attributes | Default | Description |
|-----------|------|------------|---------|-------------|
| `tokenizeOptions` | object | | | Tokens and IDs required to tokenize |
| `payerId` | string | | | Payer ID from PayPal `onApproved` callback |
| `paymentId` | string | optional | | Payment ID from PayPal `onApproved` callback |
| `billingToken` | string | optional | | Billing Token from PayPal `onApproved` callback |
| `vault` | boolean | optional | true | Whether to vault the resulting PayPal account |
| `callback` | callback | optional | | Second arg is a `tokenizePayload` |

**Example — Opt out of auto-vaulting:**

```javascript
paypal.Buttons({
  createBillingAgreement: function () {
    return paypalCheckoutInstance.createPayment({
      flow: 'vault'
    });
  },
  onApproved: function (data) {
    data.vault = false;

    return paypalCheckoutInstance.tokenizePayment(data);
  },
}).render('#paypal-button');
```

---

### `updatePayment(options, [callback])` → `{Promise|void}`

Updates line items and/or shipping options associated with a PayPalCheckout flow (`paymentId`).

#### Options Properties

| Name | Type | Attributes | Description |
|------|------|------------|-------------|
| `paymentId` | string | | PayPal `paymentId` |
| `amount` | string\|number | | Transaction amount including selected shipping option and all line_items. Supports up to 2 decimal digits |
| `currency` | string | | Currency code like `'USD'`. Required for Checkout flow |
| `recipientEmail` | string | optional | Email of contact and shipping recipient |
| `shippingOptions` | Array.\<shippingOption\> | optional | List of shipping options |
| `lineItems` | Array.\<lineItem\> | optional | Up to 249 line items |
| `amountBreakdown` | object | optional | Collection of amounts breaking down the total |

**`amountBreakdown` Properties (for updatePayment):**

| Name | Type | Attributes | Description |
|------|------|------------|-------------|
| `itemTotal` | string | optional | Item amount |
| `shipping` | string | optional | Shipping amount |
| `handling` | string | optional | Handling amount |
| `taxTotal` | string | optional | Tax amount |
| `insurance` | string | optional | Insurance amount |
| `shippingDiscount` | string | optional | Shipping discount amount |
| `discount` | string | optional | Discount amount |

**Example:**

```javascript
paypal.Buttons({
  createOrder: function () {
    return paypalCheckoutInstance.createPayment({
      //
    });
  },
  onShippingChange: function (data) {
    return paypalCheckoutInstance.updatePayment({
        paymentId: data.paymentId,
        amount: '15.00',
        currency: 'USD',
        shippingOptions: [
          {
            id: 'shipping-speed-fast',
            type: 'SHIPPING',
            label: 'Fast Shipping',
            selected: true,
            amount: { value: '5.00', currency: 'USD' }
          },
          {
            id: 'shipping-speed-slow',
            type: 'SHIPPING',
            label: 'Slow Shipping',
            selected: false,
            amount: { value: '1.00', currency: 'USD' }
          }
        ]
    });
  }
}).render('#paypal-button');
```

---

## Type Definitions

### `billingCycles` : `Object`

| Name | Type | Description |
|------|------|-------------|
| `billingFrequency` | string \| number | Frequency value. Must be a whole number, can't be negative or zero |
| `billingFrequencyUnit` | string | `'DAY'`, `'WEEK'`, `'MONTH'`, or `'YEAR'` |
| `numberOfExecutions` | string \| number | Number of executions for the billing cycle |
| `sequence` | string \| number | Order in upcoming billing cycles |
| `startDate` | string | Start date in ISO 8601 format (`2024-04-06T00:00:00Z`). Use current time if charging at checkout |
| `trial` | boolean | Indicates if this is a trial billing cycle |
| `pricingScheme` | pricingScheme | The pricing scheme object for this billing cycle |

---

### `lineItem` : `object`

| Name | Type | Attributes | Description |
|------|------|------------|-------------|
| `quantity` | string | | Number of units. Must be a whole number, can't be negative or zero |
| `unitAmount` | string | | Per-unit price. Up to 2 decimal places. Can't be negative or zero |
| `name` | string | | Item name. Maximum 127 characters |
| `kind` | string | | `'debit'` (sale) or `'credit'` (refund) |
| `unitTaxAmount` | string | nullable | Per-unit tax price. Up to 2 decimal places. Can't be negative or zero |
| `description` | string | nullable | Item description. Maximum 127 characters |
| `productCode` | string | nullable | Product or UPC code. Maximum 127 characters |
| `url` | string | nullable | URL to product information |

---

### `planMetadata` : `Object`

| Name | Type | Attributes | Description |
|------|------|------------|-------------|
| `billingCycles` | Array.\<billingCycles\> | optional | Array of billing cycles |
| `currencyIsoCode` | string | | ISO currency code, e.g. `'USD'` |
| `name` | string | | Name of the plan |
| `oneTimeFeeAmount` | string \| number | | The one-time fee amount |
| `productDescription` | string | | Description of the product |
| `productPrice` | string \| number | | Price of the product |
| `productQuantity` | string \| number | | Quantity of the product |
| `shippingAmount` | string \| number | | Amount for shipping |
| `taxAmount` | string \| number | | Amount of tax |
| `totalAmount` | string | | For vault with purchase only. Up to 2 decimal places. Can't be negative or zero |

---

### `pricingScheme` : `object`

| Name | Type | Description |
|------|------|-------------|
| `pricingModel` | string | `'FIXED'`, `'VARIABLE'`, or `'AUTO_RELOAD'` |
| `price` | string | Price for the billing cycle |
| `reloadThresholdAmount` | string | Amount at which to reload on auto_reload plans |

---

### `shippingOption` : `object`

| Name | Type | Description |
|------|------|-------------|
| `id` | string | Unique ID identifying payer-selected shipping option |
| `label` | string | Description the payer sees (e.g., "Free Shipping"). Localize to payer's locale |
| `selected` | boolean | If `true` in request, represents pre-selected option. Only 1 can be `selected = true` |
| `type` | string | `'SHIPPING'` (deliver to address) or `'PICKUP'` (pick up at address) |
| `amount` | object | The shipping cost: `{ currency: string, value: string }` |

---

### `tokenizePayload` : `object`

PayPal Checkout tokenized payload. Returned in `tokenizePayment`'s callback as the second argument.

| Name | Type | Attributes | Description |
|------|------|------------|-------------|
| `nonce` | string | | The payment method nonce |
| `type` | string | | Always `'PayPalAccount'` |
| `details` | object | | Additional PayPal account details |

**`details` Properties:**

| Name | Type | Attributes | Description |
|------|------|------------|-------------|
| `email` | string | | User's email address |
| `payerId` | string | | User's payer ID |
| `firstName` | string | | User's given name |
| `lastName` | string | | User's surname |
| `countryCode` | string | nullable | User's 2 character country code |
| `phone` | string | nullable | User's phone number (e.g. 555-867-5309) |
| `shippingAddress` | object | nullable | Shipping address details (only if shipping address is enabled) |
| `billingAddress` | object | nullable | Billing address details. Not available to all merchants |
| `creditFinancingOffered` | object | nullable | Present when customer pays with PayPal Credit |

**`shippingAddress` / `billingAddress` Properties:**

| Name | Type | Description |
|------|------|-------------|
| `recipientName` | string | Recipient of postage (shipping only) |
| `line1` | string | Street number and name |
| `line2` | string | Extended address |
| `city` | string | City or locality |
| `state` | string | State or region |
| `postalCode` | string | Postal code |
| `countryCode` | string | 2 character country code (e.g. US) |

**`creditFinancingOffered` Properties:**

| Name | Type | Description |
|------|------|-------------|
| `totalCost` | object | `{ value, currency }` — Estimated total payment including interest and fees |
| `term` | number | Length of financing terms in months |
| `monthlyPayment` | object | `{ value, currency }` — Estimated monthly payment |
| `totalInterest` | object | `{ value, currency }` — Estimated interest or fees |
| `payerAcceptance` | boolean | Whether customer was approved for and chose installment credit |
| `cartAmountImmutable` | boolean | Whether cart amount is editable after payer's acceptance |
