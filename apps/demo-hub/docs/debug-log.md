# Debug Log — demo-hub

---

## 2026-06-10 — contact-module — 结果区不显示

**现象：** capture 成功后 `#result` 区域无任何显示（静默，无报错）。

**根因：** `showResult` 设置的 CSS 类名错误。

```js
// 错误（类不存在）
el.className = 'result-msg result-' + type   // → 'result-msg result-success'

// 正确（与 sandbox.css 选择器 .result-msg.success / .result-msg.error 一致）
el.className = 'result-msg ' + type          // → 'result-msg success'
```

`sandbox.css` 定义 `display:none` 在 `.result-msg`，`display:block` 在 `.result-msg.success` 和 `.result-msg.error`。类名不匹配时元素永远 `display:none`，文字虽写入 `textContent` 但不可见。

**Fix：** `src/public/js/paypal/jssdk-v5/contact-module.js` `showResult` 函数改用 `'result-msg ' + type`（无 `result-` 前缀）。

**适用：** 所有新建产品 JS 文件中的 `showResult` 应照此模式，不加 `result-` 前缀。

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
