# Setup and Integration — Braintree Drop-in UI (JavaScript v3)

> Source: https://developer.paypal.com/braintree/docs/guides/drop-in/setup-and-integration/javascript/v3/
> Fetched: 2026-06-11

---

## Configuration

To use the Drop-in UI, you'll need to either get a tokenization key from the Control Panel or generate a client token on your server. This authorization is used when creating Drop-in.

---

## Setup

Drop-in is available directly from Braintree's servers via a script tag, or can be downloaded and hosted locally.

### HTML via CDN

```html
<script src="https://js.braintreegateway.com/web/dropin/1.44.1/js/dropin.min.js"></script>
```

This adds a global `braintree` object that includes `dropin`:

```javascript
braintree.dropin.create({
  authorization: "CLIENT_AUTHORIZATION"
}, callback);
```

> **Note:** By default, credit card is the only payment method enabled. Additional payment methods require configuration options. See the [web-drop-in reference](https://braintree.github.io/braintree-web-drop-in/docs/current/module-braintree-web-drop-in.html#.create).

### npm Installation

```bash
npm install --save braintree-web-drop-in
```

When using the npm module, `create` is on the top level of the exported object:

```javascript
var dropin = require('braintree-web-drop-in');

dropin.create({ /* options */ }, callback);
```

---

## Client-side Implementation

You need three things to get started:

1. **Client authorization** — a tokenization key or client token
2. **A container element** — a DOM element where Drop-in will appear
3. **A button** — to trigger `requestPaymentMethod`

When loaded, the UI appears in the container. Wire your button to call `requestPaymentMethod` to retrieve the payment method object (including the nonce), then submit that nonce to your server.

### Basic Example

```html
<head>
  <meta charset="utf-8">
  <script src="https://js.braintreegateway.com/web/dropin/1.46.1/js/dropin.min.js"></script>
</head>
<body>
  <div id="dropin-container"></div>
  <button id="submit-button">Request payment method</button>
  <script>
    var button = document.querySelector('#submit-button');

    braintree.dropin.create({
      authorization: 'CLIENT_AUTHORIZATION',
      container: '#dropin-container'
    }, function (createErr, instance) {
      button.addEventListener('click', function () {
        instance.requestPaymentMethod(function (requestPaymentMethodErr, payload) {
          // Submit payload.nonce to your server
        });
      });
    });
  </script>
</body>
```

---

## Configuring Payment Methods

Additional steps are required for payment methods other than cards. After completing setup, follow the instructions per payment method type.

### Credit Cards

Cards are enabled by default. CVV and Postal Code inputs appear conditionally based on your AVS and CVV settings. Call `requestPaymentMethod` to get a card payment method payload with a nonce at `payload.nonce`.

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
}, callback);
```

### PayPal

Include a `paypal` configuration object to render a PayPal option.

**Vault Flow:**

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  paypal: {
    flow: 'vault'
  }
}, callback);
```

**Checkout Flow (with amount and currency):**

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  paypal: {
    flow: 'checkout',
    amount: '10.00',
    currency: 'USD'
  }
}, callback);
```

**With Custom Event Listeners:**

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  paypal: {
    flow: 'vault'
  }
}, function (err, dropinInstance) {
    dropinInstance.on('changeActiveView', function() {
      alert('activeView changed!');
    })
});
```

### Venmo

> Complete the Venmo configuration guide first before using this option.

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  venmo: {} // No required properties
}, callback);
```

> **Note:** Venmo behavior may vary on mobile devices. This example applies to web JavaScript only.

**Preventing Redirects in SPAs:**

To prevent redirects that could break single-page apps, pass `allowNewBrowserTab: false`:

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  venmo: {
    allowNewBrowserTab: false
  }
}, callback);
```

> When using a client token with a customer ID, the Venmo account is not automatically vaulted. Use the nonce to create a payment method server-side.

### Apple Pay

> **Requirement:** Your website must be served over HTTPS for Apple Pay to appear.

The `applePay` object requires a `displayName` and a `paymentRequest` with a `total` (label + amount):

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  applePay: {
    displayName: 'My Store',
    paymentRequest: {
      total: {
        label: 'My Store',
        amount: '19.99'
      },
      requiredBillingContactFields: ["postalAddress"]
    }
  }
}, callback);
```

All `ApplePayPaymentRequest` options are supported in `paymentRequest`; Braintree supplies required values automatically except `total`.

**Supported Browsers:** Safari on iOS 10+ and macOS 10.12+.

### Google Pay

> **Requirement:** Your website must be served over HTTPS (or localhost in sandbox) for Google Pay to appear.

Available in Chrome 61+ on Android. The `googlePay` object requires a `merchantId` (in production) and a `transactionInfo` object:

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  googlePay: {
    googlePayVersion: 2,
    merchantId: 'merchant-id-from-google',
    transactionInfo: {
      totalPriceStatus: 'FINAL',
      totalPrice: '123.45',
      currencyCode: 'USD'
    },
    allowedPaymentMethods: [{
      type: 'CARD',
      parameters: {
        billingAddressRequired: true,
        billingAddressParameters: {
          format: 'FULL'
        }
      }
    }]
  }
}, callback);
```

---

## 3D Secure

Drop-in supports 3D Secure 2 verification. Follow the implementation guide and complete the server-side implementation.

---

## Error Handling

Errors should be handled in both the `create` and `requestPaymentMethod` callbacks:

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container'
}, function (createErr, instance) {
  if (createErr) {
    // Likely incorrect configuration or network issues.
    console.error(createErr);
    return;
  }

  button.addEventListener('click', function () {
    instance.requestPaymentMethod(function (requestPaymentMethodErr, payload) {
      if (requestPaymentMethodErr) {
        // No payment method is available.
        console.error(requestPaymentMethodErr);
        return;
      }

      // Submit payload.nonce to your server
    });
  });
});
```

---

## Localization

Drop-in supports 23 languages. Include a `locale` in configuration:

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  locale: 'de_DE'
}, callback);
```

Custom translations can be provided with a `translations` object:

```javascript
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container',
  translations: {
    expirationDateLabel: 'Expiry Date',
    // Any other custom translation strings...
  }
}, callback);
```

---

## Next Steps

- Read the [Set Up Your Server](https://developer.paypal.com/braintree/docs/start/hello-server) guide to learn about server SDKs and sending a nonce to your server
- Explore [customization options](https://developer.paypal.com/braintree/docs/guides/drop-in/customization) for appearance and functionality
- Learn about managing [payment methods](https://developer.paypal.com/braintree/docs/guides/payment-methods)
