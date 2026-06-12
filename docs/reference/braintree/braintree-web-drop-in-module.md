# braintree-web-drop-in Module Reference

> Source: https://braintree.github.io/braintree-web-drop-in/docs/current/module-braintree-web-drop-in.html
> Fetched: 2026-06-11

---

## Overview

There are two ways to integrate Drop-in: a **script tag integration** (fastest) and a **JavaScript integration** using `dropin.create`.

---

## Script Tag Integration

Add the Drop-in script inside your form element with a `data-braintree-dropin-authorization` property containing your tokenization key or client token. On form submission, Drop-in intercepts it, attempts tokenization, and inserts the payment method nonce into a hidden input named `payment_method_nonce`. If data collector is enabled, device data goes into a hidden input named `device_data`.

### Configurable Data Attributes

| Attribute | Description |
|---|---|
| `data-locale` | Language/locale |
| `data-card.cardholder-name.required` | Cardholder name requirement |
| `data-payment-option-priority` | Order of payment options |
| `data-data-collector.kount` | Kount data collection |
| `data-data-collector.paypal` | PayPal data collection |
| `data-paypal.amount` | PayPal amount |
| `data-paypal.currency` | PayPal currency |
| `data-paypal.flow` | PayPal flow type |
| `data-paypal-credit.amount` | PayPal Credit amount |
| `data-paypal-credit.currency` | PayPal Credit currency |
| `data-paypal-credit.flow` | PayPal Credit flow type |

### Script Tag Examples

**Basic — cards only:**

```html
<form id="payment-form" action="/" method="post">
  <script src="https://js.braintreegateway.com/web/dropin/1.46.1/js/dropin.min.js"
   data-braintree-dropin-authorization="CLIENT_AUTHORIZATION"
  ></script>
  <input type="submit" value="Purchase"></input>
</form>
```

**Cards, PayPal, and PayPal Credit:**

```html
<form id="payment-form" action="/" method="post">
  <script src="https://js.braintreegateway.com/web/dropin/1.46.1/js/dropin.min.js"
   data-braintree-dropin-authorization="CLIENT_AUTHORIZATION"
   data-paypal.flow="checkout"
   data-paypal.amount="10.00"
   data-paypal.currency="USD"
   data-paypal-credit.flow="vault"
  ></script>
  <input type="submit" value="Purchase"></input>
</form>
```

**Locale and payment option priority:**

```html
<form id="payment-form" action="/" method="post">
  <script src="https://js.braintreegateway.com/web/dropin/1.46.1/js/dropin.min.js"
   data-braintree-dropin-authorization="CLIENT_AUTHORIZATION"
   data-locale="de_DE"
   data-payment-option-priority='["paypal","card", "paypalCredit"]'
   data-paypal.flow="checkout"
   data-paypal.amount="10.00"
   data-paypal.currency="USD"
   data-paypal-credit.flow="vault"
  ></script>
  <input type="submit" value="Purchase"></input>
</form>
```

**Optional cardholder name:**

```html
<form id="payment-form" action="/" method="post">
  <script src="https://js.braintreegateway.com/web/dropin/1.46.1/js/dropin.min.js"
   data-braintree-dropin-authorization="CLIENT_AUTHORIZATION"
   data-card.cardholder-name.required="false"
  ></script>
  <input type="submit" value="Purchase"></input>
</form>
```

**Required cardholder name:**

```html
<form id="payment-form" action="/" method="post">
  <script src="https://js.braintreegateway.com/web/dropin/1.46.1/js/dropin.min.js"
   data-braintree-dropin-authorization="CLIENT_AUTHORIZATION"
   data-card.cardholder-name.required="true"
  ></script>
  <input type="submit" value="Purchase"></input>
</form>
```

---

## Static Member

### `VERSION` : `string`

The current version string, e.g., `1.46.1`.

---

## Methods

### `create(options, callback?)` → `{void|Promise}`

The entry point for `braintree.dropin`, used to create `Dropin` instances.

#### Parameters — `options` Object

| Property | Type | Default | Description |
|---|---|---|---|
| `authorization` | `string` | — | Tokenization key or client token. If client token uses a customer ID, saved payment methods render and new ones vault automatically. |
| `container` | `string\|HTMLElement` | — | Empty element reference or selector (e.g., `#dropin-container`) where Drop-in renders. |
| `selector` | `string` | — | **Deprecated** — alias for `container`. |
| `locale` | `string` | `en_US` | Language/terminology. |
| `translations` | `object` | — | Custom translation strings. Omitted strings fall back to the provided `locale` or `en_US`. |
| `paymentOptionPriority` | `Array<string>` | `['card', 'paypal', 'paypalCredit', 'venmo', 'applePay', 'googlePay']` | Order of payment options. Omitted options are not offered. |
| `hiddenVaultedPaymentMethodTypes` | `Array<string>` | — | Hide vaulted payment method types. Options: `'card'`, `'paypal'`, `'paypalCredit'`. |
| `card` | `boolean\|object` | — | Card configuration. Omitted = cards appear. Pass `false` to remove. |
| `paypal` | `object` | — | PayPal configuration. Requires PayPal enabled in Control Panel. |
| `paypalCredit` | `object` | — | PayPal Credit configuration. |
| `venmo` | `object\|boolean` | — | Venmo options. Renders only if browser supports it. |
| `applePay` | `object` | — | Apple Pay options. Renders only if browser supports it. |
| `googlePay` | `object` | — | Google Pay options. Renders only if browser supports it. |
| `dataCollector` | `object\|boolean` | — | If `true`, collects fraud data. Use `{kount: true}` for Kount. |
| `threeDSecure` | `boolean\|object` | — | If `true`, creates 3D Secure with default config. |
| `vaultManager` | `boolean` | `false` | Allow customers to delete saved payment methods. |
| `preselectVaultedPaymentMethod` | `boolean` | `true` | Whether to pre-select a vaulted payment method on init. |
| `showDefaultPaymentMethodFirst` | `boolean` | `true` | When `true`, default payment method displays first. |

**Supported locales:** `ar_EG`, `cs_CZ`, `da_DK`, `de_DE`, `el_GR`, `en_AU`, `en_GB`, `en_IN`, `en_US`, `es_ES`, `es_XC`, `fi_FI`, `fr_CA`, `fr_FR`, `fr_XC`, `he_IL`, `hu_HU`, `id_ID`, `it_IT`, `ja_JP`, `ko_KR`, `nl_NL`, `no_NO`, `pl_PL`, `pt_BR`, `pt_PT`, `ru_RU`, `sk_SK`, `sv_SE`, `th_TH`, `zh_CN`, `zh_HK`, `zh_TW`, `zh_XC`

#### Callback

The second argument, `data`, is the `Dropin` instance. Returns a promise if no callback is provided.

---

## Create Examples

### Credit cards with callback API

```html
<div id="dropin-container"></div>
<button id="submit-button">Purchase</button>

<script src="https://js.braintreegateway.com/web/dropin/1.46.1/js/dropin.min.js"></script>
<script>
  var submitButton = document.querySelector('#submit-button');

  braintree.dropin.create({
    authorization: 'CLIENT_AUTHORIZATION',
    container: '#dropin-container'
  }, function (err, dropinInstance) {
    if (err) {
      console.error(err);
      return;
    }
    submitButton.addEventListener('click', function () {
      dropinInstance.requestPaymentMethod(function (err, payload) {
        if (err) {
          // Handle errors in requesting payment method
        }
        // Send payload.nonce to your server
      });
    });
  });
</script>
```

### Credit cards with promise API

```html
<div id="dropin-container"></div>
<button id="submit-button">Purchase</button>

<script src="https://js.braintreegateway.com/web/dropin/1.46.1/js/dropin.min.js"></script>
<script>
  var submitButton = document.querySelector('#submit-button');

  braintree.dropin.create({
    authorization: 'CLIENT_AUTHORIZATION',
    container: '#dropin-container'
  }).then(function (dropinInstance) {
    submitButton.addEventListener('click', function () {
      dropinInstance.requestPaymentMethod().then(function (payload) {
        // Send payload.nonce to your server
      }).catch(function (err) {
        // Handle errors in requesting payment method
      });
    });
  }).catch(function (err) {
    console.error(err);
  });
</script>
```

### Multiple payment methods (cards, PayPal, PayPal Credit, Venmo, Apple Pay)

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  applePay: {
    displayName: 'Merchant Name',
    paymentRequest: {
      total: {
        label: 'Localized Name',
        amount: '10.00'
      }
    }
  },
  paypal: {
    flow: 'checkout',
    amount: '10.00',
    currency: 'USD'
  },
  paypalCredit: {
    flow: 'checkout',
    amount: '10.00',
    currency: 'USD'
  },
  venmo: true
}, function (err, dropinInstance) {
  // Set up a handler to request a payment method
});
```

### Venmo with restricted browser support (no new tab)

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  venmo: {
    allowNewBrowserTab: false
  }
}, function (err, dropinInstance) {
  // Set up a handler to request a payment method
});
```

### Form-based nonce submission

```html
<form id="payment-form" action="/" method="post">
  <div id="dropin-container"></div>
  <input type="submit" value="Purchase"></input>
  <input type="hidden" id="nonce" name="payment_method_nonce"></input>
</form>

<script src="https://js.braintreegateway.com/web/dropin/1.46.1/js/dropin.min.js"></script>
<script>
  var form = document.querySelector('#payment-form');
  var nonceInput = document.querySelector('#nonce');

  braintree.dropin.create({
    authorization: 'CLIENT_AUTHORIZATION',
    container: '#dropin-container'
  }, function (err, dropinInstance) {
    if (err) {
      console.error(err);
      return;
    }
    form.addEventListener('submit', function (event) {
      event.preventDefault();

      dropinInstance.requestPaymentMethod(function (err, payload) {
        if (err) {
          return;
        }
        nonceInput.value = payload.nonce;
        form.submit();
      });
    });
  });
</script>
```

### Custom translations

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  translations: {
    payingWith: 'You are paying with {{paymentSource}}',
    chooseAnotherWayToPay: 'My custom chooseAnotherWayToPay string'
    // Any other custom translation strings
  }
}, callback);
```

### Custom card form overrides (placeholders, styles, removing CVV)

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  card: {
    overrides: {
      fields: {
        number: {
          placeholder: '1111 1111 1111 1111'
        },
        postalCode: {
          minlength: 5
        },
        cvv: null
      },
      styles: {
        input: {
          'font-size': '18px'
        },
        ':focus': {
          color: 'red'
        }
      }
    }
  }
}, callback);
```

### Mask card inputs

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  card: {
    overrides: {
      fields: {
        number: {
          maskInput: {
            showLastFour: true
          }
        },
        cvv: {
          maskInput: true
        }
      }
    }
  }
}, callback);
```

### Cardholder name (optional)

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  card: {
    cardholderName: true
  }
}, callback);
```

### Cardholder name (required)

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  card: {
    cardholderName: {
      required: true
    }
  }
}, callback);
```

### 3D Secure enabled

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  threeDSecure: true
}, function (err, dropinInstance) {
  btn.addEventListener('click', function (e) {
    e.preventDefault();

    dropinInstance.requestPaymentMethod({
      threeDSecure: {
        amount: '100.00',
        billingAddress: {
          givenName: 'Jill',
          surname: 'Doe',
          phoneNumber: '8101234567',
          streetAddress: '555 Smith St.',
          extendedAddress: '#5',
          locality: 'Oakland',
          region: 'CA',
          postalCode: '12345',
          countryCodeAlpha2: 'US'
        }
      }
    }, function (err, payload) {
      // inspect payload.liabilityShifted
      // send payload.nonce to server
    });
  });
});
```

### Vault Manager enabled

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  vaultManager: true
}, callback);
```

---

## Type Definitions

### `applePayCreateOptions` : `object`

| Property | Type | Default | Description |
|---|---|---|---|
| `buttonStyle` | `string` | `black` | Valid: `black`, `white`, `white-outline` |
| `displayName` | `string` | — | Canonical store name, max 128 utf-8 characters |
| `domainName` | `string` | auto-detected | Required for cross-origin iframes |
| `applePaySessionVersion` | `number` | `2` | ApplePaySession version to use |
| `paymentRequest` | `external:ApplePayPaymentRequest` | — | Payment request details on top of Braintree defaults |

### `cardCreateOptions` : `object`

Internally uses Hosted Fields. `overrides.fields` and `overrides.styles` customize the card form.

| Property | Type | Default | Description |
|---|---|---|---|
| `cardholderName` | `boolean\|object` | — | Enables cardholder name field. Object with `required` (boolean, default `false`) |
| `overrides.fields` | `object` | — | Hosted Fields field overrides for `number`, `cvv`, `expirationDate`, `postalCode`. `selector` cannot be modified. |
| `overrides.styles` | `object` | — | Hosted Fields style overrides for the iframes |
| `clearFieldsAfterTokenization` | `boolean` | `true` | When `false`, card form keeps data on return after successful tokenization |
| `vault` | `object` | — | Vaulting config (only with customer ID client token) |

#### `vault` sub-properties:

| Property | Type | Default | Description |
|---|---|---|---|
| `allowVaultCardOverride` | `boolean` | `false` | Show option for customer to opt out of vaulting |
| `vaultCard` | `boolean` | `true` | Whether to vault the card on tokenization |

### `dataCollectorOptions` : `object`

Requires advanced fraud protection enabled in Braintree gateway.

| Property | Type | Description |
|---|---|---|
| `kount` | `boolean` | If true, enables Kount fraud data collection |

### `googlePayCreateOptions` : `object`

| Property | Type | Default | Description |
|---|---|---|---|
| `merchantId` | `string` | — | Google-provided merchant ID (not needed for sandbox) |
| `googlePayVersion` | `string` | `1` | Version of Google Pay API (1 or 2) |
| `transactionInfo` | `external:GooglePayTransactionInfo` | — | Transaction details for payment processing |
| `button` | `external:GooglePayButtonOptions` | — | Button appearance options; `onClick` cannot be overwritten |

### `paypalCreateOptions` : `object`

| Property | Type | Description |
|---|---|---|
| `flow` | `string` | `'checkout'` (one-time) or `'vault'` — **required** |
| `amount` | `string\|number` | Transaction amount — required for Checkout flow |
| `currency` | `string` | Currency code like `USD` — required for Checkout flow |
| `buttonStyle` | `object` | PayPal button style (color, shape, size, label) |
| `commit` | `boolean` | If `true`, shows "Pay Now" on review page; `false` shows "Continue" |
| `vault` | `object` | Sub-property: `vaultPayPal` (boolean, default `true`) — whether to vault PayPal account |

### `threeDSecureOptions` : `object`

| Property | Type | Description |
|---|---|---|
| `cardinalSDKConfig` | `options` | Cardinal SDK configuration |
| `amount` | `string` | **Deprecated** — pass amount in `requestPaymentMethod` options instead |

### `venmoCreateOptions` : `object|boolean`

| Property | Type | Default | Description |
|---|---|---|---|
| `allowNewBrowserTab` | `boolean` | `true` | If `false`, restricts to browsers that can app-switch without opening new tabs |

---

## Dropin Instance Methods

The `Dropin` class provides these methods:

| Method | Description |
|---|---|
| `clearSelectedPaymentMethod()` | Clear the currently selected payment method |
| `getAvailablePaymentOptions()` | Get list of available payment options |
| `isPaymentMethodRequestable()` | Check if a payment method can be requested |
| `off(event)` | Remove an event listener |
| `on(event, handler)` | Add an event listener |
| `requestPaymentMethod(options?, callback?)` | Request a payment method nonce |
| `teardown()` | Destroy the Drop-in instance |
| `updateConfiguration(options)` | Update Drop-in configuration |
