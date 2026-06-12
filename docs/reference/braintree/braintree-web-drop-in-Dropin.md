# Dropin Class Reference

> Source: https://braintree.github.io/braintree-web-drop-in/docs/current/Dropin.html
> Fetched: 2026-06-11

This class represents a Drop-in component that creates a pre-made UI for accepting cards and PayPal on your page. Instances provide methods for requesting a payment method and subscribing to events.

---

## Constructor

### `new Dropin(options)`

**Do not use this constructor directly. Use `dropin.create` instead.**

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | object | For create options, see `dropin.create` |

---

## Methods

### `clearSelectedPaymentMethod()` → `{void}`

Removes the currently selected payment method and returns the customer to the payment options view. Does not remove vaulted payment methods. Useful when a transaction fails and you want the user to pick a different payment method.

**Example:**

```js
dropinInstance.requestPaymentMethod(function (requestPaymentMethodError, payload) {
  if (requestPaymentMethodError) {
    // handle errors
    return;
  }

  functionToSendNonceToServer(payload.nonce, function (transactionError, response) {
    if (transactionError) {
      // transaction sale with selected payment method failed
      // clear the selected payment method and add a message
      // to the checkout page about the failure
      dropinInstance.clearSelectedPaymentMethod();
      divForErrorMessages.textContent = 'my error message about entering a different payment method.';
    } else {
      // redirect to success page
    }
  });
});
```

---

### `getAvailablePaymentOptions()` → `{Array.<string>}`

Returns a list of available payment methods presented to the user. Helpful for detecting browser-dependent options like Apple Pay, Google Pay, and Venmo.

**Possible values:** `applePay`, `card`, `googlePay`, `paypalCredit`, `paypal`, `venmo`

**Example:**

```js
var paymentOptions = dropinInstance.getAvailablePaymentOptions(); // ['card', 'venmo', 'paypal']

if (paymentOptions.includes('venmo')) {
  // special logic for when venmo is displayed
}
```

---

### `isPaymentMethodRequestable()` → `{Boolean}`

Returns a boolean indicating if a payment method is available through `requestPaymentMethod`. Useful for detecting if a client token with a customer ID is showing vaulted payment methods.

---

### `off(event, handler)` → `{void}`

Unsubscribes a handler function from a named event.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event` | string | The name of the event to unsubscribe from |
| `handler` | function | A callback to unsubscribe |

**Example:**

```js
var callback = function (event) {
  // do something
};
dropinInstance.on('paymentMethodRequestable', callback);

// later on
dropinInstance.off('paymentMethodRequestable', callback);
```

---

### `on(event, handler)` → `{void}`

Subscribes a handler function to a named event.

| Parameter | Type | Description |
|-----------|------|-------------|
| `event` | string | The name of the event to subscribe to |
| `handler` | function | A callback to handle the event |

**Available events:**

**General events:**
- `changeActiveView`
- `paymentMethodRequestable`
- `noPaymentMethodRequestable`
- `paymentOptionSelected`

**Card View Specific Events:**
- `card:binAvailable`
- `card:blur`
- `card:cardTypeChange`
- `card:empty`
- `card:focus`
- `card:inputSubmitRequest`
- `card:notEmpty`
- `card:validityChange`

**3DS Specific Events:**
- `3ds:customer-canceled`
- `3ds:authentication-modal-render`
- `3ds:authentication-modal-close`

**Example 1 — Dynamically enable/disable submit button:**

```js
var submitButton = document.querySelector('#submit-button');

braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container'
}, function (err, dropinInstance) {
  submitButton.addEventListener('click', function () {
    dropinInstance.requestPaymentMethod(function (err, payload) {
      // Send payload.nonce to your server.
    });
  });

  if (dropinInstance.isPaymentMethodRequestable()) {
    submitButton.removeAttribute('disabled');
  }

  dropinInstance.on('paymentMethodRequestable', function (event) {
    console.log(event.type);
    console.log(event.paymentMethodIsSelected);
    submitButton.removeAttribute('disabled');
  });

  dropinInstance.on('noPaymentMethodRequestable', function () {
    submitButton.setAttribute('disabled', true);
  });
});
```

**Example 2 — Auto-submit nonce when available:**

```js
var submitButton = document.querySelector('#submit-button');

braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container'
}, function (err, dropinInstance) {
  function sendNonceToServer() {
    dropinInstance.requestPaymentMethod(function (err, payload) {
      if (err) {
        // handle errors
      }
      // send payload.nonce to your server
    });
  }

  submitButton.addEventListener('click', sendNonceToServer);

  dropinInstance.on('paymentMethodRequestable', function (event) {
    if (event.paymentMethodIsSelected) {
      sendNonceToServer();
    }
  });
});
```

**Example 3 — Listen for view changes:**

```js
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container'
}, function (err, dropinInstance) {
  dropinInstance.on('changeActiveView', function (event) {
    event.oldActivePaymentViewId; // card
    event.newActivePaymentViewId; // methods
  });
});
```

**Example 4 — Listen for card view events:**

```js
braintree.dropin.create({
  authorization: 'CLIENT_AUTHORIZATION',
  container: '#dropin-container'
}, function (err, dropinInstance) {
  dropinInstance.on('card:focus', function (event) {
    // a card field was focussed
  });
  dropinInstance.on('card:blur', function (event) {
    // a card field was blurred
  });
  dropinInstance.on('card:validityChange', function (event) {
    // the card form went from invalid to valid or valid to invalid
  });
});
```

---

### `requestPaymentMethod(options?, callback?)` → `{void|Promise}`

Requests a payment method object including the nonce for use with the Braintree Server SDKs. If no payment method is available, an error appears in the UI.

| Parameter | Type | Attributes | Description |
|-----------|------|------------|-------------|
| `options` | object | optional | All options for requesting a payment method |
| `callback` | callback | optional | Receives error or payload containing nonce |

**Options properties:**

| Property | Type | Attributes | Description |
|----------|------|------------|-------------|
| `threeDSecure` | object | optional | Options from the Braintree 3D Secure client reference except `nonce`, `bin`, and `onLookupComplete`. If `amount` is provided, it overrides the 3DS create options `amount`. Recommended fields for 3DS v2: `email`, `mobilePhoneNumber`, `billingAddress` |

**Example 1 — Basic usage:**

```js
var form = document.querySelector('#my-form');
var hiddenNonceInput = document.querySelector('#my-nonce-input');

form.addEventListener('submit', function (event) {
 event.preventDefault();

 dropinInstance.requestPaymentMethod(function (err, payload) {
   if (err) {
     // handle error
     return;
   }
   hiddenNonceInput.value = payload.nonce;
   form.submit();
 });
});
```

**Example 2 — With data collector:**

```js
var form = document.querySelector('#my-form');
var hiddenNonceInput = document.querySelector('#my-nonce-input');
var hiddenDeviceDataInput = document.querySelector('#my-device-data-input');

form.addEventListener('submit', function (event) {
 event.preventDefault();

 dropinInstance.requestPaymentMethod(function (err, payload) {
   if (err) {
     // handle error
     return;
   }
   hiddenNonceInput.value = payload.nonce;
   hiddenDeviceDataInput.value = payload.deviceData;
   form.submit();
 });
});
```

**Example 3 — With 3D Secure:**

```js
var form = document.querySelector('#my-form');
var hiddenNonceInput = document.querySelector('#my-nonce-input');

form.addEventListener('submit', function (event) {
 event.preventDefault();

 dropinInstance.requestPaymentMethod(function (err, payload) {
   if (err) {
     // Handle error
     return;
   }

   if (payload.liabilityShifted || (payload.type !== 'CreditCard' && payload.type !== 'AndroidPayCard')) {
     hiddenNonceInput.value = payload.nonce;
     form.submit();
   } else {
     dropinInstance.clearSelectedPaymentMethod();
   }
 });
});
```

---

### `teardown(callback?)` → `{void|Promise}`

Cleanly removes everything set up by `dropin.create`. Useful in single-page apps.

| Parameter | Type | Attributes | Description |
|-----------|------|------------|-------------|
| `callback` | callback | optional | Called on completion, containing an error if one occurred |

---

### `updateConfiguration(property, key, value)` → `{void}`

Modifies configuration initially set in `dropin.create`. If called after PayPal authorization completes, any PayPal accounts not stored in the Vault record will be removed.

| Parameter | Type | Description |
|-----------|------|-------------|
| `property` | string | Top-level property to update: `paypal`, `paypalCredit`, `applePay`, or `googlePay` |
| `key` | string | The key of the property to update (e.g., `amount` or `currency`) |
| `value` | any | The value to set, matching the type in `dropin.create` |

**Example:**

```js
dropinInstance.updateConfiguration('paypal', 'amount', '10.00');
```

---

## Type Definitions

### `applePayPaymentMethodPayload` : `object`

| Property | Type | Attributes | Description |
|----------|------|------------|-------------|
| `nonce` | string | | Payment method nonce for charging the Apple Pay card |
| `vaulted` | boolean | nullable | If present and true, indicates a vaulted payment method |
| `details.cardType` | string | | Type of card (Visa, Mastercard, etc.) |
| `details.cardHolderName` | string | | Name of the card holder |
| `details.dpanLastTwo` | string | | Last two digits of card number |
| `details.rawPaymentData` | external:ApplePayPayment | | Raw response from Apple Pay flow |
| `description` | string | | Human-readable description |
| `type` | string | | Always `ApplePayCard` |
| `binData` | object | | Card BIN information (see binData) |
| `deviceData` | string | nullable | Device data if data collector is configured |

---

### `binData` : `object`

Information about the card based on the BIN.

| Property | Type | Description |
|----------|------|-------------|
| `commercial` | string | Values: 'Yes', 'No', 'Unknown' |
| `countryOfIssuance` | string | Country of issuance |
| `debit` | string | Values: 'Yes', 'No', 'Unknown' |
| `durbinRegulated` | string | Values: 'Yes', 'No', 'Unknown' |
| `healthcare` | string | Values: 'Yes', 'No', 'Unknown' |
| `issuingBank` | string | The issuing bank |
| `payroll` | string | Values: 'Yes', 'No', 'Unknown' |
| `prepaid` | string | Values: 'Yes', 'No', 'Unknown' |
| `productId` | string | The product id |

---

### `cardPaymentMethodPayload` : `object`

| Property | Type | Attributes | Description |
|----------|------|------------|-------------|
| `nonce` | string | | Payment method nonce for charging the card |
| `details` | object | | Additional account details |
| `description` | string | | Human-readable description |
| `type` | string | | Always `CreditCard` |
| `binData` | object | | BIN information (see binData) |
| `vaulted` | boolean | nullable | If present and true, indicates a vaulted payment method |
| `deviceData` | string | nullable | Device data if data collector is configured |
| `liabilityShifted` | boolean | nullable | If 3DS is configured, whether liability shifted |
| `liabilityShiftPossible` | boolean | nullable | If 3DS is configured, whether liability shift is possible |
| `threeDSecureInfo` | object | nullable | If 3DS is configured, the threeDSecureInfo object |

---

### `changeActiveView` : `object`

The event payload for the `changeActiveView` event.

| Property | Type | Description |
|----------|------|-------------|
| `previousViewId` | string | The id for the previously active view. Possible values: `card`, `paypal`, `paypalCredit`, `venmo`, `googlePay`, `applePay`, `methods`, `options`, `delete-confirmation` |
| `newViewId` | string | The id for the new active view (same possible values as `previousViewId`) |

---

### `googlePayPaymentMethodPayload` : `object`

| Property | Type | Attributes | Description |
|----------|------|------------|-------------|
| `nonce` | string | | Payment method nonce for charging the Google Pay card |
| `vaulted` | boolean | nullable | If present and true, indicates a vaulted payment method |
| `details.cardType` | string | | Type of card (Visa, Mastercard, etc.) |
| `details.lastFour` | string | | Last 4 digits of the card |
| `details.lastTwo` | string | | Last 2 digits of the card |
| `details.isNetworkTokenized` | boolean | | True if the card is network tokenized (DPAN) |
| `details.bin` | string | | First six digits of card number |
| `details.rawPaymentData` | external:GooglePayPaymentData | | Raw response from the Google Pay flow |
| `type` | string | | Always `AndroidPayCard` |
| `binData` | object | | BIN information (see binData) |
| `deviceData` | string | nullable | Device data if data collector is configured |

---

### `paymentMethodRequestablePayload` : `object`

The event payload for the `paymentMethodRequestable` event.

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | Type of payment method: `CreditCard` or `PayPalAccount` |
| `paymentMethodIsSelected` | boolean | True if a payment method is visibly selected in the UI (e.g., after PayPal authentication or stored method selection). False when a card form is filled with valid values but not yet submitted |

---

### `paymentOptionSelectedPayload` : `object`

The event payload for the `paymentOptionSelected` event.

| Property | Type | Description |
|----------|------|-------------|
| `paymentOption` | string | The selected payment option view: `card`, `paypal`, or `paypalCredit` |

---

### `paypalPaymentMethodPayload` : `object`

| Property | Type | Attributes | Description |
|----------|------|------------|-------------|
| `nonce` | string | | Payment method nonce for charging the PayPal account |
| `vaulted` | boolean | nullable | If present and true, indicates a vaulted payment method |
| `details` | object | | Additional PayPal account details |
| `type` | string | | Always `PayPalAccount` |
| `deviceData` | string | nullable | Device data if data collector is configured |

---

### `venmoPaymentMethodPayload` : `object`

| Property | Type | Attributes | Description |
|----------|------|------------|-------------|
| `nonce` | string | | Payment method nonce for charging the Venmo account |
| `vaulted` | boolean | nullable | If present and true, indicates a vaulted payment method |
| `details.username` | string | | The Venmo username |
| `type` | string | | Always `VenmoAccount` |
| `deviceData` | string | nullable | Device data if data collector is configured |

---

## Events

### `card:binAvailable`

The underlying hosted fields `binAvailable` event.

### `card:blur`

The underlying hosted fields `blur` event.

### `card:cardTypeChange`

The underlying hosted fields `cardTypeChange` event.

### `card:empty`

The underlying hosted fields `empty` event.

### `card:focus`

The underlying hosted fields `focus` event.

### `card:inputSubmitRequest`

The underlying hosted fields `inputSubmitRequest` event.

### `card:notEmpty`

The underlying hosted fields `notEmpty` event.

### `card:validityChange`

The underlying hosted fields `validityChange` event.

### `3ds:authentication-modal-close`

The underlying 3D Secure `authentication-modal-close` event.

### `3ds:authentication-modal-render`

The underlying 3D Secure `authentication-modal-render` event.

### `3ds:customer-canceled`

The underlying 3D Secure `customer-canceled` event.

### `changeActiveView`

Emitted when the Drop-in view changes what is presented as the active view.

### `noPaymentMethodRequestable`

Emitted when there is no payment method available in Drop-in. Not fired if no payment method is available on initialization — use `isPaymentMethodRequestable` for that check. No payload is available in the callback.

### `paymentMethodRequestable`

Emitted when the available payment method in Drop-in changes, including transitions from unavailable to available and changes in payment method type. Not fired if no payment method is available on initialization.

### `paymentOptionSelected`

Emitted when the customer selects a new payment option type (e.g., PayPal, PayPal Credit, credit card). Not emitted when changing between existing saved payment methods. Only relevant when multiple payment options are accepted.
