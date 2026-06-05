# Debug Log — demo-hub

---

## 2026-06-05 — vault-acdc-setup-only (v6) — P3 Finding

**Probe:** P3 — does save-payment session `submit()` accept `{ billingAddress }` as 2nd arg?

**Finding:** The save-payment session's `BillingAddress` GraphQL schema uses `addressLine1` (not `streetAddress`). Passing `{ streetAddress, city, ... }` causes:

```
Field "streetAddress" is not defined by type "BillingAddress"
```

The one-time payment session (`createCardFieldsOneTimePaymentSession`) accepts `streetAddress` (per V6-ACDC-4 / `acdc.js` mapBilling). The save payment session (`createCardFieldsSavePaymentSession`) walks a different GraphQL mutation that expects `addressLine1`.

Both `streetAddress` and `addressLine1` were tried — both rejected. The one-time payment session (`createCardFieldsOneTimePaymentSession`) accepts `streetAddress` (acdc.js); the save payment session (`createCardFieldsSavePaymentSession`) rejects all tested field names.

**Fix applied:** Removed `billingAddress` from `session.submit(setupTokenId)` entirely. Billing is covered by `payment_source.card.billing_address` in the `create-setup-token` body (snake_case, already in place).

**TODO:** Confirm correct `billingAddress` field names for the save payment session when PayPal publishes explicit schema docs for `createCardFieldsSavePaymentSession`.

**File:** `src/public/js/paypal/jssdk-v6/vault-acdc-setup-only.js`
