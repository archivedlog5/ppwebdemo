---
title: Applying 3DS to Transactions and Verifications
slug: /docs/guides/3d-secure/applying-3ds-to-transactions-and-verifications/node/
createTime: "2025-04-02T01:53:56.765Z"
updateTime: "2026-01-07T10:57:42.194Z"
---

# Applying 3DS to Transactions and Verifications

## Create a transaction

### Using 3D Secure upgraded single-use-token

To create a 3D Secure transaction, make a server-side sale call using the payment method single-use-token you received from your client when you verified the credit card on the client side.

[Collect device data](/braintree/docs/guides/premium-fraud-management-tools/client-side) from the client and include the device_data_from_the_client in the transaction.

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
  (err, result) => {
    // Handle response
  },
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
  .then((result) => {
    // Handle result
  });
```

**IMPORTANT**
3D Secure information is lost when a 3D Secured payment_method_nonce is used in a [Customer.create()](/braintree/docs/reference/request/customer/create) or [PaymentMethod.create()](/braintree/docs/reference/request/payment-method/create) call without a verify_card flag.

### Using 3DS authentication ID

To create a 3D Secure transaction using an authentication ID, make a server-side sale call using the authentication ID you received from your client when you verified the credit card on the client side. You can use a payment method token instead of a payment method single-use-token if you provide the 3D Secure authentication via an authentication ID.

### Callback

```javascript
gateway.transaction.sale(
  {
    amount: "10.00",
    paymentMethodToken: token,
    paymentMethodNonce: cvvOnlyNonce,
    threeDSecureAuthenticationId: threeDSecureAuthenticationId,
    deviceData: deviceDataFromTheClient,
    options: {
      submitForSettlement: true,
    },
  },
  (err, result) => {
    // Handle response
  },
);
```

### Promise

```javascript
gateway.transaction
  .sale({
    amount: "10.00",
    paymentMethodToken: token,
    paymentMethodNonce: cvvOnlyNonce,
    threeDSecureAuthenticationId: threeDSecureAuthenticationId,
    options: {
      submitForSettlement: true,
    },
  })
  .then((result) => {
    // Handle result
  });
```

If you want to use a CVV-only nonce when creating a transaction with 3D Secure, you will need to pass a [3D Secure Authentication ID](/braintree/docs/reference/request/transaction/sale#three_d_secure_authentication_id) together with the CVV-only nonce.

## Create a verification

### Create a new customer with a payment method

Make a server-side call using the 3D Secure upgraded `paymentMethodNonce` you received from your client when you verified the credit card on the client side as shown [in the customer guide](/braintree/docs/guides/customers/node#create-with-payment-method).

As an alternative to passing the 3D Secure upgraded single-use-token, you can pass a `threeDSecureAuthenticationId` using the authentication ID you received from your client when you verified the credit card on the client side. You can use a payment method token instead of a payment method single-use-token if you provide a `threeDSecureAuthenticationId`.

### Create a new payment method

Make a server-side call using the payment method single-use-token you received from your client when you verified the credit card on the client side as shown [in the payment method guide](/braintree/docs/reference/request/payment-method/create/node#payment-method:-create).

As an alternative to passing the 3D Secure upgraded single-use-token, you can pass a `threeDSecureAuthenticationId` using the authentication ID you received from your client when you verified the credit card on the client side. You can use a payment method token instead of a payment method single-use-token if you provide a `threeDSecureAuthenticationId`.

## Requiring 3D Secure

We expose additional information about the authentication request that you can use for more advanced UI flows or risk assessment. You should be aware that making such assessments may result in accepting the liability for fraudulent transactions.

You can pass a parameter called required with the transaction,to specify whether or not you require 3D Secure authentication to have succeeded on a transaction. When you create a transaction with a 3D Secure enriched single-use-token, the [options.threeDSecure.required](/braintree/docs/reference/request/transaction/sale/node#options-three_d_secure-required) parameter defaults to true. This implies that all transactions without a successful 3D Secure authentication will be rejected. If 3D Secure is not present, the required parameter defaults to false, which means that transactions will not be rejected based on 3D Secure.

We strongly recommend you allow this parameter to default to true, as it helps protect against malicious users tampering with your front-end code and bypassing 3D Secure completely. That being said, you do have the option of determining your own level of risk and pushing the transaction through regardless of its 3D Secure status by setting required to false on a per-transaction basis.

**IMPORTANT**
If you pass required as true on transactions that do not go through 3D Secure, those transactions will be [gateway rejected](/braintree/articles/control-panel/transactions/gateway-rejections) .

## 3DS Status codes

Below are the possible 3D secure statuses, along with their expected 3D Secure [liability shift](/braintree/docs/guides/3d-secure/advanced-options/javascript/v3/#liability-shift). This table also shows whether a transaction will be rejected by the PayPal Braintree gateway when [options.three_d_secure.required](/braintree/docs/reference/request/transaction/sale/node#options-three_d_secure-required) is set to true when creating a transaction, or when creating or updating a subscription.

| Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Liability Shift Possible | Liability Shifted | Reject if 3DS is required |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------- | ------------------------- |
| authenticate_attempt_successful The associated card brand authenticated this 3D Secure transaction using its Attempts server because the card issuer's authentication server was unavailable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | true                     | true              | No                        |
| authenticate_error An error occurred within the 3D Secure authentication system; have the customer attempt the transaction again.[Contact our Support team](/braintree/help/FraudProtectionQuestion)if most attempted 3D Secure transactions receive this error message.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | true                     | false             | Yes                       |
| authenticate_failed The customer entered an incorrect 3D Secure password or they took too long to enter in a password value and the 3D Secure authentication timed out. Have the customer attempt the transaction again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | true                     | false             | Yes                       |
| authenticate_successful The transaction was successfully authenticated with 3D Secure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | true                     | true              | No                        |
| authenticate_unable_to_authenticate A downstream error occurred with the card-issuing bank that caused the 3D Secure authentication to fail. Have the customer attempt the transaction again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | true                     | false             | Yes                       |
| authentication_unavailable The card network is unavailable to verify the customer's card using 3D Secure. Your PayPal Braintree gateway may not be set up to accept the customer’s provided card type; 3D Secure transactions on this card type will be unavailable until the setup process is complete. If you have just enabled 3D Secure, the setup process for MasterCard can take 2-3 business days and American Express can take up to 7 business days. If you continue to see this status for all 3D Secure transactions for a particular card type after the setup process is complete, please[Contact our Support team](/braintree/help/FraudProtectionQuestion). This status could also indicate the 3D Secure authentication timed out; if you believe this to be the case, have the customer attempt the transaction again. | false                    | false             | No                        |
| lookup_bypassed The customer's card was issued by a bank where 3D Secure verifications are bypassed and opportunity for liability shift is negated. If you prefer not to continue transactions with this status, ask the customer for a different payment method.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | false                    | false             | No                        |
| lookup_error An error occurred during the lookup and caused 3D Secure authentication to fail.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | false                    | false             | No                        |
| lookup_not_enrolled Your customer is not enrolled in 3D Secure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | false                    | false             | No                        |
| unsupported_card Your account is not set up to authenticate the customer's provided card brand with 3D Secure. Only the following card brands are currently supported: Visa, MasterCard, American Express, and Maestro.[Contact our Support team](/braintree/help/FraudProtectionQuestion)to confirm your 3D Secure configuration. 3D Secure for zero amount is not supported for any card brand in Brazil.                                                                                                                                                                                                                                                                                                                                                                                                                             | false                    | false             | No                        |
| unsupported_account_type Your merchant account is not set up to accept this card type. Only credit and debit can be accepted, but accepted values depend on your configuration.[Contact our Support team](/braintree/help/FraudProtectionQuestion)to confirm your 3D Secure configuration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | false                    | false             | No                        |
| unsupported_three_d_secure_version Your merchant account is not set up to use the 3D Secure version requested.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | false                    | false             | No                        |
| challenge_required The issuer requires a challenge to complete the 3D Secure authentication.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | true                     | false             | Yes                       |
| authenticate_rejected The issuer has rejected the 3D Secure authentication. It is not recommended to proceed to a payment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | false                    | false             | Yes                       |
| authenticate_frictionless_failed The issuer is not allowing the customer to complete a 3D Secure challenge, but may be willing to accept a payment without liability shift.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | false                    | false             | Yes                       |
| lookup_failed_acs_error An error occurred in the issuer's system during the 3D Secure lookup and caused the authentication to fail.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | false                    | false             | No                        |
| authenticate_failed_acs_error An error occurred in the issuer's system during the 3D Secure challenge and caused the authentication to fail.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | false                    | false             | Yes                       |
| data_only_successful A status returned when using data-only to collect data but skip authentication.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | false                    | false             | No                        |
| lookup_card_error A status returned when using there is an issue validating the card by the MPI provider.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | false                    | false             | Yes                       |
| lookup_server_error A status returned when there is an issue with directory server.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | false                    | false             | Yes                       |
| exemption_low_value_successful Successfully applied a low value exemption.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | false                    | false             | No                        |
| exemption_tra_successful Successfully applied a transaction risk analysis exemption.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | false                    | false             | No                        |
| mpi_server_error An error occurred on the 3D Secure MPI providers system.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | false                    | false             | No                        |
| skipped_due_to_rule 3D Secure was skipped as stated by the matched 3D Secure Rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | false                    | false             | No                        |

## Recurring Transactions

### Recurring Billing

If you use Braintree's recurring billing, follow the steps below to apply 3D Secure to subscriptions.

- Generate a[payment method nonce](/braintree/docs/reference/request/payment-method-nonce/create)out of a vaulted payment method token.
- Launch the 3D Secure authentication flow for your customer.

- For JavaScript, use the client-side[verifyCard()](https://developer.paypal.com/braintree/docs/guides/3d-secure/advanced-options/javascript/v3#verifying-a-vaulted-card)function. The resulting nonce inverifyPayloadwill contain a new, 3D Secure enriched nonce.
- See the 3D Secure verification information for[Android](https://developer.paypal.com/braintree/docs/guides/3d-secure/advanced-options/android/v5/#verifying-a-vaulted-card)and[iOS](https://developer.paypal.com/braintree/docs/guides/3d-secure/advanced-options/ios/v6/#verifying-a-vaulted-card). Successful results have a new payment method nonce that is enriched with 3D Secure data.

- Use the generated 3D Secure enriched nonce in the[Subscription.create()](/braintree/docs/reference/request/subscription/create#create-with-3d-secure-enriched-payment-method-nonce)call.

Sometimes, you will need to re-establish SCA on an existing subscription, for example, if the price of the subscription has increased or the subscription will be updated with a new payment method. If you need to re-establish SCA then repeat the above steps but call Subscription.update() instead of Subscription.create()

### Recurring Transactions with fixed amount and schedule

For other types of recurring transactions that don't involve Braintree's recurring billing, the recommended flow for recurring billing would be to [request a cardholder challenge](/braintree/docs/guides/3d-secure/step-by-step-integration#requesting-a-cardholder-challenge) in order to establish Strong Customer Authentication (SCA) when the card is **first authorized** as part of storing it within the Braintree vault. This can be with a verification, or the first transaction of a recurring billing event. By applying 3D Secure to the first transaction or verification, you signal to the card issuer that you have established a mandate between you and your customer to charge their payment method for subsequent recurring payments as detailed in your terms and conditions. Such subsequent transactions are out of scope from PSD2 SCA requirements.

Establishing SCA on verifications will be useful for scenarios where the cardholder will not be present when the charge is issued, and the amount isn’t known when the payment method is stored. For example, if you have a metered billing flow and invoice customers at the end of a month based on their usage, you can use 3D Secure on your initial card verification to establish a mandate to create future merchant initiated transactions (MIT) without requiring 3D Secure authentication.

For subsequent transactions from that payment method, use the recurring value in the [TransactionSource](/braintree/docs/reference/request/transaction/sale/ruby#transaction_source) parameter of the Transaction.Sale() API call.

### Subsequent Transactions without fixed amount or schedule

Other MIT transactions will be processed much the same way that recurring transactions would be. You would again [request a cardholder challenge](/braintree/docs/guides/3d-secure/step-by-step-integration#requesting-a-cardholder-challenge) to establish SCA when the card is **first authorized**, establishing a mandate between you and your customer.

For subsequent transactions from that payment method, which would be outside of the scope of PSD2 SCA, use the unscheduled value in the [TransactionSource](/braintree/docs/reference/request/transaction/sale/ruby#transaction_source) parameter of the Transaction.Sale() API call.

### Exception for payment methods stored before September 2019

Exceptions would apply for recurring transactions using a payment method that has been vaulted prior to September 14, 2019. Recurring transactions from these payment methods will be considered outside of the scope of PSD2 SCA as long as the payment method was successfully charged at least once prior to September 14, 2019.

For any vaulted payment methods not successfully charged prior to this date, the first recurring transaction attempt will result in a [2099 - Cardholder Authentication Required](/braintree/docs/reference/general/processor-responses/authorization-responses#code-2099) soft decline code. Some issuers may not yet support this decline code, and will instead return other soft decline codes. In this case, the cardholder must perform 3D Secure authentication in order to process the transaction.
