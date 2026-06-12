# Braintree Web Drop-in Reference v1.46.1

> Source: https://braintree.github.io/braintree-web-drop-in/docs/current/index.html
> Fetched: 2026-06-11

- **CDN:** `https://js.braintreegateway.com/web/dropin/1.46.1/js/dropin.min.js`
- **npm:** `braintree-web-drop-in`

---

## Overview

Drop-in provides a pre-made payments UI for desktop and mobile browsers to be used with cards, PayPal, and PayPal Credit. It works for one-time guest checkout or can display saved payment methods when a client token uses a customer ID.

---

## Setup

### CDN (Script Tag)

```html
<script src="https://js.braintreegateway.com/web/dropin/1.46.1/js/dropin.min.js"></script>

<script>
braintree.dropin.create({ /* options */ }, callback);
</script>
```

### npm

```bash
npm install --save braintree-web-drop-in
```

```js
var dropin = require('braintree-web-drop-in');

dropin.create({ /* options */ }, callback);
```

---

## Usage

Drop-in provides a payment method object containing the nonce. Use `requestPaymentMethod` to retrieve it. With a script tag integration, a hidden `payment_method_nonce` input is added automatically to the form.

### Accepting Cards

By default, Drop-in is configured to accept cards and does not require any additional parameters in the create call. If cards are the only option, Drop-in renders as a card form. With multiple options, Card appears in the list. CVV and Postal Code inputs appear conditionally based on AVS/CVV settings.

Calling `requestPaymentMethod` validates the card form, returning a payload with the nonce on success. On failure, the UI shows an error and the callback receives an error. Use events to detect when the card form is considered valid.

### Accepting PayPal

Users click the PayPal button and go through the PayPal authentication flow. Upon completion, the PayPal account appears in the UI and the payment method can be requested via events.

### Accepting Venmo

Users click the Venmo button on their mobile device, which opens the Venmo app to authenticate the purchase. After completion, the Venmo account appears and the payment method can be requested.

### Accepting Apple Pay

Users click the Apple Pay button. After success, the payment method can be requested. Use events to track completion.

### Accepting Google Pay

Users click the Google Pay button. After success, the payment method can be requested. Use events to track completion.

### Localization

Pass a supported locale code in the `create` call:

```js
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  selector: '#dropin-container',
  locale: 'de_DE'
}, callback);
```

### Events

Use events to know whether or not a payment method is currently available from Drop-in. This can dynamically enable/disable a submit button or auto-submit a nonce after a PayPal flow.

### Styling

The stylesheet loads automatically on initialization. To use a custom stylesheet, provide a `<link>` tag with `id="braintree-dropin-stylesheet"` to prevent the external stylesheet from loading. With npm, the CSS is at `node_modules/braintree-web-drop-in/dropin.css`.

---

## Browser Support

Drop-in shares the same browser support as the Braintree JS SDK.

---

## Content Security Policy (CSP)

### Basic Directives

| Directive | Sandbox | Production |
|-----------|---------|------------|
| `script-src` | `js.braintreegateway.com`, `assets.braintreegateway.com` | `js.braintreegateway.com`, `assets.braintreegateway.com` |
| `style-src` | `assets.braintreegateway.com` | `assets.braintreegateway.com` |
| `img-src` | `assets.braintreegateway.com`, `data:` | `assets.braintreegateway.com`, `data:` |
| `child-src` | `assets.braintreegateway.com` | `assets.braintreegateway.com` |
| `frame-src` | `assets.braintreegateway.com` | `assets.braintreegateway.com` |
| `connect-src` | `api.sandbox.braintreegateway.com`, `client-analytics.sandbox.braintreegateway.com`, `*.braintree-api.com` | `api.braintreegateway.com`, `client-analytics.braintreegateway.com`, `*.braintree-api.com` |

### PayPal-Specific Directives

| Directive | Sandbox & Production |
|-----------|----------------------|
| `connect-src` | `*.paypal.com` |
| `script-src` | `www.paypalobjects.com`, `*.paypal.com`, `'unsafe-inline'` |
| `style-src` | `'unsafe-inline'` |
| `img-src` | `*.paypal.com` |
| `child-src` | `*.paypal.com` |
| `frame-src` | `*.paypal.com` |

### Google Pay-Specific Directives

| Directive | Sandbox & Production |
|-----------|----------------------|
| `script-src` | `pay.google.com` |
| `style-src` | `'unsafe-inline'` |
| `connect-src` | `pay.google.com`, `https://google.com/pay`, `https://pay.google.com`, `https://pay.google.com/about/redirect/` |

The `style-src 'unsafe-inline'` is required for Google Pay button styles. You may omit it if you include your own styles matching Google's brand guidelines.

### 3D Secure-Specific Directives

| Directive | Sandbox | Production |
|-----------|---------|------------|
| `script-src` | `songbirdstag.cardinalcommerce.com` | `songbird.cardinalcommerce.com` |
| `frame-src` | `*` | `*` |
| `connect-src` | `*.cardinalcommerce.com` | `*.cardinalcommerce.com` |

3D Secure 2 uses an iframe that requires the issuing bank's full ACS URL. Given that the list of possible ACS URLs changes regularly and varies between issuers and ACS providers, there is not a strict CSP configuration available. Merchants must set `frame-src *` to allowlist all potential ACS URLs.

3DS Method (Method URL Collection) also uses the ACS URL directly. Blocking this process through a CSP can potentially result in authentication failures and increased friction within the checkout experience.

### Data Collector-Specific Directives

For Kount with Data Collector, refer to the Kount CSP guide.

---

## API Reference

### Classes

#### `Dropin`

| Method | Description |
|--------|-------------|
| `clearSelectedPaymentMethod()` | Clears the currently selected payment method |
| `getAvailablePaymentOptions()` | Returns available payment options |
| `isPaymentMethodRequestable()` | Checks if a payment method can be requested |
| `off()` | Removes an event listener |
| `on()` | Registers an event listener |
| `requestPaymentMethod()` | Requests the payment method nonce |
| `teardown()` | Destroys the Drop-in instance |
| `updateConfiguration()` | Updates the Drop-in configuration |

### Modules

#### `braintree-web-drop-in`

| Method | Description |
|--------|-------------|
| `create()` | Initializes the Drop-in instance |

---

## Additional Resources

- [Braintree Drop-in Payment UI guide](https://developer.paypal.com/braintree/docs/guides/drop-in/overview/javascript/v3)
- [`braintree-web-drop-in` GitHub repo](https://github.com/braintree/braintree-web-drop-in)
