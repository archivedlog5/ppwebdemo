# 需求 — Braintree Drop-in UI Demo

> 日期：2026-06-11 · 范围：demo-hub · provider=braintree · sdk_version=server-sdk · product_key=dropin-ui

## 1. 目标

在 demo-hub 新增 Braintree Drop-in UI 完整集成 demo，路由 `/braintree/server-sdk/dropin-ui`。一次 demo 覆盖 Drop-in 全量支付方式（信用卡、PayPal、Venmo、Apple Pay、Google Pay），配合 USD/EUR 双币种和完整 `transaction.sale` 参数，供开发者参考真实集成场景。

## 2. 硬性约束（用户明确要求）

1. **支付方式全量**：信用卡（持卡人姓名必填）、PayPal（checkout 流）、Venmo、Apple Pay、Google Pay，五种同时展示在 Drop-in 中。
2. **PayPal 用 checkout 流**（`flow: 'checkout'`），不用 vault 流——vault 流后续单独开 demo。
3. **币种：USD / EUR**，两种币种各对应不同 Braintree merchant account：
   - USD → `BRAINTREE_US_USD_MERCHANT_ACCOUNT_ID`（值：`cwen`）
   - EUR → `BRAINTREE_US_EUR_MERCHANT_ACCOUNT_ID`（值：`cwenEUR`）
4. **金额可编辑**，点 Update 按钮更新配置。金额变更：teardown + recreate；币种变更：页面 reload（见 3.1）。
5. **收集设备指纹**：`dataCollector: true`，`payload.deviceData` 随 nonce 一起发给后端，传入 `transaction.sale`。
6. **`transaction.sale` 参数尽量完整**：billing、shipping、customer、descriptor 等字段都填上，按 paymentType 追加专属参数。
7. **3D Secure 支持**（true/false checkbox 控制）：信用卡支付时可选开启 3DS 认证，使用 Drop-in 内置 3DS 流（`threeDSecure: true` at create time + `threeDSecureParameters` at requestPaymentMethod time）。

## 3. 关键设计决策（brainstorm 已确认）

### 3.1 金额 / 币种 / 3DS 变化处理策略

**（2026-06-12 修正）** 原设计"币种变化用 updateConfiguration 无需重载"已经不成立，原因见下。

| 操作 | 是否需要新 clientToken | 处理方式 |
|------|----------------------|---------|
| 修改 amount（同币种） | ❌ 否 | `instance.teardown()` + `dropin.create()` 重新初始化（同 clientToken） |
| 切换 currency | ✅ 是 | 页面 reload（`?currency=EUR&amount=...`），服务端用新 merchantAccountId 生成 clientToken |
| 切换 3DS checkbox | ❌ 否 | `instance.teardown()` + `dropin.create()` 重新初始化（加减 `threeDSecure: true`） |

**为什么币种变更需要页面 reload：**

根据 Braintree 3DS 文档：

> If using a non-default merchant account ID, specify `merchant_account_id` when generating the token. This ID **must match** the merchant account ID used to create the subsequent transaction or verification.

`clientToken.generate({ merchantAccountId })` 中的 `merchantAccountId` 决定：
- PayPal 按钮是否显示
- 3DS 认证流是否可被触发

若 token 始终用 default merchant account 生成（`generate({})`），在 EUR merchant account 上 3DS eligibility 无法保证。因此 dropin-ui 需要在 `generate` 时传入正确的 `merchantAccountId`，币种变更必须重新 generate token。

**实现方案：** `_factory.js` 增加可选回调 `clientTokenOptions(req)`，dropin-ui.js 传入实现：

```js
clientTokenOptions: function (req) {
  var currency = req.query.currency || 'USD'
  var mid = currency === 'EUR'
    ? process.env.BRAINTREE_US_EUR_MERCHANT_ACCOUNT_ID
    : process.env.BRAINTREE_US_USD_MERCHANT_ACCOUNT_ID
  return mid ? { merchantAccountId: mid } : {}
}
```

其余 Braintree 路由不传此回调，行为完全不变。

### 3.2 前端→后端 POST 字段

```json
{ "nonce": "...", "deviceData": "...", "paymentType": "...", "amount": "10.00", "currency": "USD" }
```

`paymentType` 取自 `payload.type`：`CreditCard` / `PayPalAccount` / `VenmoAccount` / `ApplePayCard` / `AndroidPayCard`（Google Pay 在 Braintree 里叫 AndroidPayCard）。

### 3.3 `transaction.sale` 参数结构

**所有支付方式共用（base）：**
- `amount`、`paymentMethodNonce`、`deviceData`、`merchantAccountId`（按 currency）
- `orderId`（`DEMO-BT-<timestamp>`）
- `customer`：firstName/lastName/email
- `billing`：firstName/lastName/streetAddress/extendedAddress/locality/region/postalCode/countryCodeAlpha2
- `shipping`：同 billing + `shippingMethod: 'ground'`
- `descriptor`：name / phone / url
- `options.submitForSettlement: true`

**按 paymentType 追加：**
- `PayPalAccount` → `options.paypal: { description, customField }`
- `VenmoAccount` → `descriptor` 只保留 `name`（Venmo max 22 chars，只支持 name）
- `CreditCard` / `ApplePayCard` / `AndroidPayCard` → base 参数已足够

### 3.4 Pay Now 按钮状态

- `paymentMethodRequestable` 事件 → enable
- `noPaymentMethodRequestable` 事件 → disable
- 初始化后调 `isPaymentMethodRequestable()` 检查（防 vaulted 方法漏掉）
- 交易失败后 `clearSelectedPaymentMethod()` 让用户重选

### 3.5 工厂路由

使用 `createBraintreeRoute` 工厂（两条路由：GET 渲染 + POST transaction），`buildTransaction` 按 `extra.paymentType` 和 `extra.currency` 组装完整参数。

### 3.7 3D Secure 集成（Drop-in UI 方式）

Drop-in UI 3DS 集成分两步（参考 `docs/reference/braintree/braintree-3d-secure-step-by-step-v3.md`）：

**步骤一：`dropin.create` 时传 `threeDSecure: true`（布尔值）**

```js
braintree.dropin.create({
  authorization: DEMO.clientToken,
  container: '#dropin-container',
  threeDSecure: true,   // ← 仅当 checkbox 勾选时传此选项
  // ...其他支付方式配置
}, function(err, instance) { ... })
```

**步骤二：`requestPaymentMethod` 时传 `threeDSecureParameters`（含 amount + billingAddress）**

```js
instance.requestPaymentMethod({
  threeDSecure: {
    amount: currentAmount,
    email: 'john.doe@example.com',
    billingAddress: {
      givenName: 'John', surname: 'Doe',
      phoneNumber: '3125551212',
      streetAddress: '1 E Main St', extendedAddress: 'Suite 403',
      locality: 'Chicago', region: 'IL',
      postalCode: '60622', countryCodeAlpha2: 'US',
    },
    collectDeviceData: true,
    additionalInformation: {
      shippingGivenName: 'John', shippingSurname: 'Doe',
      shippingAddress: {
        streetAddress: '1 E Main St', extendedAddress: 'Suite 403',
        locality: 'Chicago', region: 'IL',
        postalCode: '60622', countryCodeAlpha2: 'US',
      },
    },
  }
}, function(err, payload) {
  // payload.threeDSecureInfo.threeDSecureAuthenticationId（3DS 完成后存在）
})
```

**注意：**
- Drop-in UI 3DS 需 Drop-in 版本 ≥ 1.20.1（本 demo 用 1.46.1，满足）
- 3DS 完全在客户端（Drop-in 内置 challenge iframe），后端 `buildTransaction` 无需改动
- billing/shipping 地址与 `transaction.sale` 里的一致，复用相同数据

### 3.6 已知限制

- Apple Pay / Venmo 依赖浏览器/设备支持，Drop-in 自动隐藏不支持的选项
- Venmo（`allowNewBrowserTab: false`）桌面通常不显示
- `updateConfiguration` 后已授权的 PayPal 账号会被清除，需重新授权

## 4. 完成标准（可验证）

- [ ] `/braintree/server-sdk/dropin-ui` 渲染成功，Drop-in widget 出现，Pay Now 初始 disabled
- [ ] 测试卡 `4111 1111 1111 1111` + 3DS 关闭 → 交易成功，`✓ submitted_for_settlement · TX: <id> · CreditCard`
- [ ] PayPal 授权完成 → 交易成功，结果显示 `PayPalAccount`
- [ ] 修改金额 → 点 Update → Drop-in teardown+recreate → PayPal sheet 显示新金额
- [ ] 切换 USD → EUR → 点 Update → 页面 reload → 后端日志确认 `clientToken 含 merchantAccountId: cwenEUR`
- [ ] 切换 EUR → USD → 点 Update → 页面 reload → 后端日志确认 `merchantAccountId: cwen`
- [ ] 交易失败 → 显示错误 → `clearSelectedPaymentMethod()` → 用户可重选支付方式
- [ ] `console.log` 打印 payload（含 type / deviceData）
- [ ] 后端日志打印完整 `buildTransaction` 参数（含 billing/shipping/customer/descriptor）
- [ ] 勾选 Enable 3DS + 测试卡 `4000000000001091` → Drop-in 触发 3DS challenge → 通过后 TX 成功
- [ ] 不勾选 3DS + 测试卡 `4111 1111 1111 1111` → 无 3DS challenge → 正常 submitted_for_settlement

## 5. 关联文档

- BE 设计：`docs/design/braintree/2026-06-11-design-be-braintree-dropin-ui.md`
- FE 设计：`docs/design/braintree/2026-06-11-design-fe-braintree-dropin-ui.md`
- 实现计划：`docs/plans/braintree/2026-06-11-plan-braintree-dropin-ui-v1.md`
- 参考文档：
  - `docs/reference/braintree/braintree-drop-in-setup-integration-v3.md`
  - `docs/reference/braintree/braintree-web-drop-in-module.md`
  - `docs/reference/braintree/braintree-web-drop-in-Dropin.md`
  - `docs/reference/braintree/braintree-transaction-sale-node.md`
  - `docs/reference/braintree/simple-server.md`
- 总览：`docs/req/braintree/2026-06-11-req-braintree.md`
