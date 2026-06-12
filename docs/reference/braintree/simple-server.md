---
title: Set Up Your Server
slug: /docs/start/hello-server/node/
createTime: "2025-04-02T00:27:23.637Z"
updateTime: "2025-04-02T00:27:23.723Z"
---

# Set Up Your Server

## Install and configure

Install the Braintree node package:

### bash

```bash

npm install braintree

```

In your code, configure the environment and [API credentials](/braintree/articles/control-panel/important-gateway-credentials#api-credentials) :

### Node

```javascript
const braintree = require("braintree");

const gateway = new braintree.BraintreeGateway({
  environment: braintree.Environment.Sandbox,
  merchantId: "useYourMerchantId",
  publicKey: "useYourPublicKey",
  privateKey: "useYourPrivateKey",
});
```

**NOTE**
See the [Braintree Node Version Changelog](https://github.com/braintree/braintree_node/blob/master/CHANGELOG.md).

## Generate a client token

Your server is responsible for[generating a client token](/braintree/docs/reference/request/client-token/generate), which contains all authorization and configuration information your client needs to initialize the client SDK to communicate with Braintree. Including awhen generating the client token lets returning customers select from previously used payment method options, improving user experience over multiple checkouts.

### Callback

```javascript
gateway.clientToken.generate(
  {
    customerId: aCustomerId,
  },
  (err, response) => {
    // pass clientToken to your front-end
    const clientToken = response.clientToken;
  },
);
```

### Promise

```javascript
gateway.clientToken
  .generate({
    customerId: aCustomerId,
  })
  .then((response) => {
    // pass clientToken to your front-end
    const clientToken = response.clientToken;
  });
```

If the customer can't be found, the response will contain a message stating "Customer specified by customer_id does not exist".

[Set Up Your Client](/braintree/docs/start/hello-client#get-a-client-token) covers the client side of the exchange.

### Send a client token to your client

Here is an example of how your server would generate and expose a client token:

### Callback

```javascript
app.get("/client_token", (req, res) => {
  gateway.clientToken.generate({}, (err, response) => {
    res.send(response.clientToken);
  });
});
```

### Promise

```javascript
app.get("/client_token", (req, res) => {
  gateway.clientToken.generate({}).then((response) => {
    res.send(response.clientToken);
  });
});
```

How the token is used by the client may vary. In JavaScript integrations the client token is often included in the generated HTML/JS, while in mobile apps the client token must be requested. These methods are discussed in the [client token setup section](/braintree/docs/start/hello-client#get-a-client-token).

## Receive a payment method nonce from your client

Once your client successfully obtains a customer payment method, it receives a payment_method_nonce representing customer payment authorization, which it then sends to your server.

Your server implementation is then responsible for receiving the payment_method_nonce and using it appropriately.

### Node

```javascript
app.post("/checkout", (req, res) => {
  const nonceFromTheClient = req.body.payment_method_nonce;
  // Use payment method nonce here
});
```

## Create a transaction

You can create a transaction using an`amount`and the`nonceFromTheClient`you received in the previous step.[Collect device data](/braintree/docs/guides/premium-fraud-management-tools/client-side)from the client and include the`deviceDataFromTheClient`in the transaction.

### Callback

```javascript
gateway.transaction.sale(
  {
    amount: "10.00",
    paymentMethodNonce: nonceFromTheClient,
    deviceData: deviceDataFromTheClient,
    options: {
      submitForSettlement: true,
    },
  },
  (err, result) => {},
);
```

### Promise

```javascript
gateway.transaction
  .sale({
    amount: "10.00",
    paymentMethodNonce: nonceFromTheClient,
    deviceData: deviceDataFromTheClient,
    options: {
      submitForSettlement: true,
    },
  })
  .then((result) => {});
```

The sale call returns a [Transaction Result Object](/braintree/docs/reference/response/transaction#result-object) which contains the transaction and information about the request.

## Test your integration

See our[Testing page](/braintree/docs/reference/general/testing)for values you can use for`nonceFromTheClient`in your sandbox account. These nonces can be passed as strings through server-side calls to generate payment methods in the desired state. To verify your integration, you can check in the[sandbox Control Panel](https://sandbox.braintreegateway.com/login), where transactions will immediately appear on success.
**IMPORTANT**
Always develop and test your code against your sandbox account before processing live transactions against a production account.

## Transition to production

At this point, you should be able to accept a payment method nonce and create a transaction in our sandbox. When you're ready to start charging real money, transition over to our production environment. We'll explain that process next.

## Further reading

- [Server SDK deprecation policy](/braintree/docs/reference/general/server-sdk-deprecation-policy/)
- [Best Practices](/braintree/docs/reference/general/best-practices/)

[Next Page: Go Live](/braintree/docs/start/go-live)
