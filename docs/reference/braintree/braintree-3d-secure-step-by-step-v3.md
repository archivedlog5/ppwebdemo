# Step by Step Integration for 3D Secure (JavaScript v3)

> Source: https://developer.paypal.com/braintree/docs/guides/3d-secure/step-by-step-integration/javascript/v3/
> Fetched: 2026-06-12

---

## 3DS Client-Side Flow

### Generate a Client Token

Before initializing the JavaScript SDK, generate a client token on your server. The token must be accessible from your checkout page's JavaScript.

If using a non-default merchant account ID, specify `merchant_account_id` when generating the token. This ID **must match** the merchant account ID used to create the subsequent transaction or verification.

### Verify a Card Using 3DS

Create an object containing relevant customer and transaction data to minimize authentication challenges from issuing banks. Include as many fields as possible.

**3D Secure parameters object:**

```javascript
var threeDSecureParameters = {
    amount: '500.00',
    email: 'jill@example.com',
    billingAddress: {
      givenName: 'Jill', // ASCII-printable characters required
      surname: 'Doe', // ASCII-printable characters required
      phoneNumber: '8101234567',
      streetAddress: '555 Smith St.',
      extendedAddress: '#5',
      locality: 'Oakland',
      region: 'CA', // ISO-3166-2 code
      postalCode: '12345',
      countryCodeAlpha2: 'US'
    },
    collectDeviceData: true,
    additionalInformation: {
      workPhoneNumber: '8101234567',
      shippingGivenName: 'Jill',
      shippingSurname: 'Doe',
      shippingPhone: '8101234567',
      shippingAddress: {
        streetAddress: '555 Smith St.',
        extendedAddress: '#5',
        locality: 'Oakland',
        region: 'CA', // ISO-3166-2 code
        postalCode: '12345',
        countryCodeAlpha2: 'US'
      }
    },
  };
```

> **Important:** As of Braintree version 3.94.0, setting `collectDeviceData` to `true` enables collection of additional device data, which may reduce lookup failures or authentication challenges.

---

### Drop-in UI Integration

3DS support requires Braintree Web Drop-in **version 1.20.1 or higher**.

> **Note:** If using Drop-in with CVV rules and running 3DS verifications, default vaulting will cause a processor error. Disable vaulting via Drop-in by setting `vaultCard` to `false` and instead vault the card server-side using `vault_on_success=true` with `transaction:sale` or a GraphQL mutation.

Load the Drop-in script:

```html
<script src="https://js.braintreegateway.com/web/dropin/1.46.1/js/dropin.min.js"></script>
```

The `threeDSecureParameters` object **must** include the `amount` field:

```javascript
var threeDSecureParameters = {
    amount: '500.00',
    // Pass other 3DS parameters here
  };
```

**Callback version:**

```javascript
braintree.dropin.create({
      authorization: 'CLIENT_AUTHORIZATION',
      container: '#dropin-container',
      threeDSecure: true
  }, function (err, dropinInstance) {
      if (err) {
          console.error(err);
          return;
      }

      submitButton.addEventListener('click', function (e) {
          e.preventDefault();
          dropinInstance.requestPaymentMethod({
            threeDSecure: threeDSecureParameters
          }, function (err, payload) {
              if (err) {
                  // Handle errors in requesting payment method
              }
              // Send payload.nonce to your server
              // The 3D Secure Authentication ID can be found
              //  at payload.threeDSecureInfo.threeDSecureAuthenticationId
          });
      });
  });
```

---

### Hosted Fields Integration

3DS support requires Braintree SDK **version 3.92.0 or higher**.

Load the required scripts:

```html
<script src="https://js.braintreegateway.com/web/3.142.0/js/client.min.js"></script>
<script src="https://js.braintreegateway.com/web/3.142.0/js/three-d-secure.min.js"></script>
<script src="https://js.braintreegateway.com/web/3.142.0/js/hosted-fields.min.js"></script>
```

The `threeDSecureParameters` object must include:
- `amount`
- `nonce`
- `bin`

```javascript
var threeDSecureParameters = {
    amount: '500.00',
    nonce: NONCE_FROM_INTEGRATION, // Example: hostedFieldsTokenizationPayload.nonce
    bin: BIN_FROM_INTEGRATION, // Example: hostedFieldsTokenizationPayload.details.bin
    // Pass other 3DS parameters here
  };
```

> **Note:** To verify vaulted cards, generate the nonce on the server first, then pass it in `threeDSecureParameters`.

#### Handle Lookup Response

Implement the `onLookupComplete` callback, invoked after receiving the 3DS lookup response but before initializing the challenge:

```javascript
var threeDSecureParameters = {
  // Pass 3DS parameters here
  onLookupComplete: function (data, next) {
    // use 'data' here, then call 'next()'
    next();
  }
};
```

Specify `version: 2` in the options object when calling `threeDSecure.create()`. Version 1 is deprecated.

**Callback version:**

```javascript
var threeDSecure;

braintree.client.create({
  authorization: 'CLIENT_TOKEN_FROM_SERVER'
}, function (clientErr, clientInstance) {
  if (clientErr) {
    return;
  }

  braintree.threeDSecure.create({
    version: 2, // Will use 3DS2
    client: clientInstance
  }, function (threeDSecureErr, threeDSecureInstance) {
    if (threeDSecureErr) {
      return;
    }

    threeDSecure = threeDSecureInstance;
  });
});
```

Once created, verify cards by passing `threeDSecureParameters` into `verifyCard()`:

```javascript
threeDSecure.verifyCard(threeDSecureParameters, function (err, response) {
  if (err) {
    return;
  }
  // Send response.nonce to your server
  // The 3D Secure Authentication ID can be found
  //  at response.threeDSecureInfo.threeDSecureAuthenticationId
});
```

If a field doesn't follow Cardinal's documentation, Braintree returns a validation error.

---

## 3DS Server-Side Flow

An alternative approach performs the 3DS call from the server. To meet device data collection requirements, merchants must either make a prerequisite `prepareLookup` call in the client SDK or pass browser fields directly as input parameters.

### Prepare the 3DS Lookup

`prepareLookup` returns data needed for a server-side 3DS lookup. Trigger it from the client's device and pass the payload to the server:

```javascript
threeDSecure.prepareLookup({
    nonce: hostedFieldsTokenizationPayload.nonce,
    bin: hostedFieldsTokenizationPayload.details.bin
  }, function (err, payload) {
    if (err) {
      console.error(err);
      return;
    }

    // send payload to server to do server side lookup
  });
```

### Make the 3DS Lookup Call

Use the GraphQL mutation `performThreeDSecureLookup` to attempt 3DS authentication on a credit card. This may consume the payment method and return a new single-use one.

Including device data is mandatory — either via `dfReferenceId` or `browserInformation`.

**Mutation:**

```graphql
mutation PerformThreeDSecureLookup($input: PerformThreeDSecureLookupInput!) {
    performThreeDSecureLookup(input: $input) {
      clientMutationId
      threeDSecureLookupData {
        authenticationId
      }
      paymentMethod {
        id
        details {
          ... on CreditCardDetails {
            bin
            threeDSecure {
              authentication {
                cavv
                eciFlag
                liabilityShifted
                liabilityShiftPossible
              }
            }
          }
        }
      }
    }
  }
```

**Variables:**

```json
{
    "input": {
      "paymentMethodId": "single_use_payment_method_id",
      "amount": "10.00",
      "transactionInformation": {
        "browserInformation": {
          "javaEnabled": false,
          "acceptHeader": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
          "language": "en-GB",
          "colorDepth": 24,
          "screenHeight": 720,
          "screenWidth": 1280,
          "timeZone": "0",
          "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.110 Safari/537.36",
          "javascriptEnabled": true
        },
        "ipAddress": "82.34.105.112",
        "deviceChannel": "BROWSER"
      }
    }
  }
```

### Trigger 3DS Challenge

This launches the iframe challenge using a server-side lookup response. Only necessary when a challenge is required:

```javascript
threeDSecure.initializeChallengeWithLookupResponse(lookupResponseFromServer).then(function (payload) {
    if (payload.liabilityShifted) {
      // Liability has shifted
      submitNonceToServer(payload.nonce);
    } else if (payload.liabilityShiftPossible) {
      // Liability may still be shifted
      // Decide if you want to submit the nonce
    } else {
      // Liability has not shifted and will not shift
      // Decide if you want to submit the nonce
    }
  });
```

---

## See Also

- [3D Secure component reference](https://braintree.github.io/braintree-web/current/ThreeDSecure.html)
- [3D Secure 2 with Hosted Fields integration example](https://codepen.io/braintree/pen/ezvymm)
- [3D Secure 2 with Drop-in integration example](https://codepen.io/braintree/pen/KjWqGx)
- [Next: Applying 3DS to Transactions and Verifications](https://developer.paypal.com/braintree/docs/guides/3d-secure/applying-3ds-to-transactions-and-verifications)
