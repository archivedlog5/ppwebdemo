# 前端设计 — Braintree Drop-in UI

> 日期：2026-06-11 · 文件：`views/braintree/server-sdk/dropin-ui.ejs` + `public/js/braintree/server-sdk/dropin-ui.js`

## 1. UI 结构

页面沿用项目 sandbox 风格，Drop-in 本身提供完整卡片 UI，不需要手动搭 card field 容器。

```
sandbox-header
  ├── provider-badge（Braintree · server-sdk · Drop-in UI）
  ├── h1（title）
  └── p（"Pre-built payment UI with card, PayPal, Venmo, Apple Pay, Google Pay"）

sandbox-card
  ├── amount-row
  │   ├── #demo-currency（select：USD / EUR，change 自动 reload）
  │   └── #demo-amount（input，可编辑，默认 10.00，change 自动更新金额）
  ├── 3ds-row
  │   ├── <input class="threeds-input">（hidden，position:absolute）
  │   ├── <label for="threeds-toggle" class="threeds-switch">（仅包裹视觉 pill，点文字不触发）
  │   └── <span class="threeds-label">Enable 3DS Verification</span>（独立文字，非 label）
  ├── ⚡ Sandbox Mode badge
  ├── #dropin-container         ← Drop-in 渲染目标（保持空）
  ├── #pay-btn（Pay Now，初始 disabled；成功后隐藏）
  ├── #reset-btn（New Payment，初始 display:none；成功后显示，class="pay-btn pay-btn-braintree"）
  ├── #result（role=alert aria-live=polite，单行状态文字）
  ├── #response-data（<pre>，初始 display:none；成功后展示完整 transaction JSON；max-height:280px + overflow-y:auto 滚动条）
  └── test-hint（No 3DS: 4111 1111 1111 1111 · 3DS Mastercard: 5200000000002151 · 3DS Amex: 340000000002534）
```

**按钮切换逻辑：**

| 阶段 | #pay-btn | #reset-btn |
|------|----------|-----------|
| 初始化 / recreate | `display:''`，`disabled=true` | `display:none` |
| 填好支付方式 | `disabled=false` | `display:none` |
| 支付成功 | `display:none` | `display:block` |
| 点击 New Payment | → teardown+recreate → 回到第一行 | — |

**CVV 与 3DS 注意事项：**
- `card.overrides.fields.cvv` 显式声明 CVV 字段，让 Drop-in 始终渲染它（不依赖 merchant account AVS/CVV 设置）
- `card.vaultCard: false` 是 3DS + CVV rules 组合下的必要设置：Drop-in 默认 vault 行为在此组合下会导致 processor CVV 错误（来源：Braintree 3DS 文档）
- 如需 vault，应在后端 `transaction.sale` 的 `options.storeInVaultOnSuccess: true` 处理，不在 Drop-in 层做

**3DS Toggle Switch 实现要点：**

```html
<!-- label 只包裹视觉 pill，text 是独立 span → 点文字不触发 checkbox -->
<input type="checkbox" id="threeds-toggle" class="threeds-input" />
<label for="threeds-toggle" class="threeds-switch" aria-label="Enable 3DS Verification"></label>
<span class="threeds-label">Enable 3DS Verification</span>
```

```css
.threeds-input  { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; }
.threeds-switch { width:36px; height:20px; border:1.5px solid var(--border-hi);
                  border-radius:20px; background:rgba(128,128,128,0.12); cursor:pointer; }
.threeds-switch::after { /* 滑块 */ width:14px; height:14px; background:var(--fg-muted);
                          top:2px; left:2px; border-radius:50%; transition:transform 0.2s; }
.threeds-input:checked + .threeds-switch { background:rgba(34,197,94,0.18);
                                            border-color:var(--accent); }
.threeds-input:checked + .threeds-switch::after { transform:translateX(16px);
                                                   background:var(--accent); }
.threeds-label { font-family:var(--font-mono); font-size:12px; color:var(--fg-muted);
                 user-select:none; } /* 独立 span，不关联 input */
```

边框使用 `var(--border-hi)`（dark: `#475569`，light: `#CBD5E1`），两主题下均可见。

**Drop-in 内置元素注意：**

| 元素 / 行为 | 处理 |
|---|---|
| `translations: { chooseAWayToPay: '' }` | 清空标题文字，但 `.braintree-placeholder` 元素仍占位 |
| `.braintree-placeholder { display: none }` | 彻底消除标题空白，写在 scoped `<style>` 中 |

**控件触发行为（无 Update 按钮，全部自动）：**

| 用户操作 | 触发事件 | 处理方式 |
|---------|---------|---------|
| 切换 currency | `change` | 页面 reload `?currency=EUR&amount=...`（需新 clientToken，merchantAccountId 不同） |
| 修改 amount | `change`（失焦且值变化） | 更新 `currentAmount` + `updateConfiguration` 通知 Drop-in（PayPal/ApplePay/GooglePay）；无需 teardown |
| 切换 3DS checkbox | `change` | `teardownAndRecreate()`（`threeDSecure: true` 必须在 `dropin.create` 时决定，无法动态加） |

**为什么 amount 不需要 teardown：** Drop-in 的职责只是收集支付方式并返回 nonce，金额通过 POST body 传给后端。只需用 `updateConfiguration` 同步 PayPal/ApplePay/GooglePay 弹窗中显示的金额即可。

## 2. `window.DEMO` 注入（EJS）

```html
<script>
  window.DEMO = {
    clientToken: '<%- clientToken %>',
    amount:      '<%= defaultAmount %>',
    currency:    '<%= currency %>',
    urls: {
      transaction: '/braintree/server-sdk/api/dropin-ui/transaction',
    },
  }
</script>
```

## 3. 脚本加载顺序（EJS 底部）

```html
<script src="https://js.braintreegateway.com/web/dropin/1.46.1/js/dropin.min.js"></script>
<script src="/js/braintree/server-sdk/dropin-ui.js"></script>
```

Drop-in CDN 必须先于业务 JS 加载，否则 `braintree.dropin` 不可用。

## 4. Drop-in 初始化（`dropin-ui.js`）

文件用 IIFE 包裹，从 `window.DEMO` 读取配置。核心函数 `buildDropInOptions()` + `recreateDropIn()`：

```js
;(function () {
  'use strict'

  var currentAmount   = DEMO.amount
  var currentCurrency = DEMO.currency
  var dropinInstance  = null

  // PayPal 常量（略）...
  // Google Pay Drop-in 专属常量
  var GP_COUNTRY_CODE    = 'US'
  var GP_TOTAL_LABEL     = 'Total'
  var GP_CHECKOUT_OPTION = 'COMPLETE_IMMEDIATE_PURCHASE' // sheet 按钮显示 "Pay now"
  var GP_BUTTON_COLOR    = 'black'   // 'black' | 'white' | 'white-outline'
  var GP_BUTTON_TYPE     = 'pay'     // Google Pay 标准 Pay 按钮
  var GP_BUTTON_SIZE     = 'fill'    // 宽度填满容器

  // ── 构建 dropin.create 选项 ─────────────────────────────
  function buildDropInOptions() {
    // paypal / paypalCredit 共享同一份配置，新增参数只改一处
    var paypalConfig = {
      flow:                    'checkout',
      intent:                  'capture',
      offerCredit:             true,
      amount:                  currentAmount,
      currency:                currentCurrency,
      displayName:             PAYPAL_DISPLAY_NAME,
      enableShippingAddress:   true,
      shippingAddressEditable: false,
      landingPageType:         PAYPAL_LANDING_PAGE,
      userAction:              'COMMIT',
      shippingAddressOverride: {
        line1: SHIPPING_STREET_ADDRESS, line2: SHIPPING_EXTENDED_ADDRESS,
        city: SHIPPING_LOCALITY, state: SHIPPING_REGION,
        postalCode: SHIPPING_POSTAL_CODE, countryCode: SHIPPING_COUNTRY_CODE,
        recipientName: SHIPPING_FIRST_NAME + ' ' + SHIPPING_LAST_NAME,
        phone: BILLING_PHONE,
      },
      lineItems: [{
        name: PP_ITEM_NAME, kind: PP_ITEM_KIND, quantity: PP_ITEM_QUANTITY,
        unitAmount: currentAmount, description: PP_ITEM_DESCRIPTION,
        productCode: PP_ITEM_PRODUCT_CODE, url: PP_ITEM_URL,
      }],
      amountBreakdown: { itemTotal: currentAmount },
    };

    var opts = {
      authorization: DEMO.clientToken,
      container:     '#dropin-container',
      dataCollector: true,
      translations: { chooseAWayToPay: '' },
      paymentOptionPriority: ['card', 'paypal', 'venmo', 'paypalCredit', 'applePay', 'googlePay'],
      card: {
        vaultCard: false,
        overrides: { fields: { cvv: { placeholder: '•••' } } },
      },
      paypal:       paypalConfig,  // 共享同一对象
      paypalCredit: paypalConfig,  // 配置始终一致
      venmo:    { allowNewBrowserTab: false },
      applePay: {
        displayName:    MERCHANT_NAME,
        paymentRequest: {
          total:        { label: MERCHANT_NAME, amount: currentAmount },
          currencyCode: currentCurrency,
        },
      },
      googlePay: {
        googlePayVersion: 2,
        transactionInfo: {
          countryCode:      GP_COUNTRY_CODE,      // 收单行国家码（EEA 必须，其他建议填）
          currencyCode:     currentCurrency,
          totalPriceStatus: 'FINAL',
          totalPrice:       currentAmount,
          totalPriceLabel:  GP_TOTAL_LABEL,       // 金额旁标签
          checkoutOption:   GP_CHECKOUT_OPTION,   // 'COMPLETE_IMMEDIATE_PURCHASE' → sheet 按钮显示 "Pay now"
        },
        button: {
          buttonColor:    GP_BUTTON_COLOR,        // 'black' | 'white' | 'white-outline'
          buttonType:     GP_BUTTON_TYPE,         // 'pay' → Google Pay 标准按钮
          buttonSizeMode: GP_BUTTON_SIZE,         // 'fill' → 宽度填满容器
        },
      },
    }
    // 3DS：threeDSecure: true 必须在 create 时传入（不能运行时动态添加）
    if (document.getElementById('threeds-toggle').checked) {
      opts.threeDSecure = true
    }
    return opts
  }

  // ── 初始化 / 重新初始化 Drop-in ─────────────────────────
  function recreateDropIn() {
    var payBtn = document.getElementById('pay-btn')
    payBtn.disabled = true
    payBtn.style.display = ''              // 保证 pay-btn 可见（成功后 display:none 需重置）
    document.getElementById('reset-btn').style.display = 'none'
    document.getElementById('dropin-container').innerHTML = ''
    braintree.dropin.create(buildDropInOptions(), function (err, instance) {
      if (err) { showResult('✗ Drop-in init failed: ' + err.message, 'error'); return }
      dropinInstance = instance
      wireDropIn(instance)
    })
  }

  // ── teardown → recreate ─────────────────────────────────
  function teardownAndRecreate() {
    if (dropinInstance) {
      dropinInstance.teardown(function () { dropinInstance = null; recreateDropIn() })
    } else {
      recreateDropIn()
    }
  }

  recreateDropIn()   // 首次初始化
})()
```

## 5. 控件事件绑定（`wireControls`）

无 Update 按钮，所有控件自动触发对应行为：

```js
function wireControls() {
  // 币种切换：需要新 clientToken（merchantAccountId 与 currency 绑定），自动 reload
  document.getElementById('demo-currency').addEventListener('change', function () {
    var newCurrency = this.value
    var newAmount   = document.getElementById('demo-amount').value || currentAmount
    window.location.href = '?currency=' + newCurrency + '&amount=' + newAmount
  })

  // 金额变更：只更新变量 + updateConfiguration 通知 Drop-in，无需 teardown
  document.getElementById('demo-amount').addEventListener('change', function () {
    currentAmount = this.value || currentAmount
    if (!dropinInstance) return
    dropinInstance.updateConfiguration('paypal', 'amount', currentAmount)
    dropinInstance.updateConfiguration('applePay', 'paymentRequest', {
      total: { label: MERCHANT_NAME, amount: currentAmount },
      currencyCode: currentCurrency,
    })
    dropinInstance.updateConfiguration('googlePay', 'transactionInfo', {
      countryCode:      GP_COUNTRY_CODE,
      currencyCode:     currentCurrency,
      totalPriceStatus: 'FINAL',
      totalPrice:       currentAmount,
      totalPriceLabel:  GP_TOTAL_LABEL,
      checkoutOption:   GP_CHECKOUT_OPTION,
    })
  })

  // 3DS checkbox：threeDSecure: true 必须在 dropin.create 时传入，无法动态更改
  document.getElementById('threeds-toggle').addEventListener('change', teardownAndRecreate)

  // 支付成功后点 New Payment → 清空结果 → teardown+recreate
  document.getElementById('reset-btn').addEventListener('click', function () {
    clearResponseData()
    var el = document.getElementById('result')
    el.textContent = ''
    el.className = 'result-msg'
    teardownAndRecreate()
  })
}

wireControls()
```

**为什么币种变更需要页面 reload：** Braintree 3DS 文档要求 `clientToken.generate({ merchantAccountId })` 中的 merchantAccountId 必须与后续 transaction 一致，且决定 3DS eligibility 和 PayPal 按钮显示。切换币种必须重新生成 token。

**为什么金额变更不需要 teardown：** Drop-in 只收集支付方式 nonce，金额通过 POST body 传给后端，Drop-in 本身不关心金额。`updateConfiguration` 只是同步 PayPal/ApplePay/GooglePay 弹窗中显示的金额，不触发任何重建。`updateConfiguration` 对不可用的支付方式会静默忽略。

## 6. Pay Now 按钮状态管理

```js
function wireDropIn(instance) {
  var payBtn = document.getElementById('pay-btn')

  if (instance.isPaymentMethodRequestable()) payBtn.disabled = false

  instance.on('paymentMethodRequestable',   function () { payBtn.disabled = false })
  instance.on('noPaymentMethodRequestable', function () { payBtn.disabled = true })

  // 用 onclick 赋值（非 addEventListener），每次 recreate 自动替换旧 instance 的监听（D2 决策）
  payBtn.onclick = function () { onPayClick(instance, payBtn) }
}
```

## 7. 支付主流程（`onPayClick`）

3DS 开启时，`threeDSecureParameters` 在 `requestPaymentMethod` 时传入（不在 create 时传）：

```js
function onPayClick(instance, payBtn) {
  payBtn.disabled = true

  var threeDsEnabled = document.getElementById('threeds-toggle').checked

  var requestOpts = {}
  if (threeDsEnabled) {
    requestOpts.threeDSecure = {
      amount: currentAmount,
      email:  'john.doe@example.com',
      billingAddress: {
        givenName:         'John',
        surname:           'Doe',
        phoneNumber:       '3125551212',
        streetAddress:     '1 E Main St',
        extendedAddress:   'Suite 403',
        locality:          'Chicago',
        region:            'IL',
        postalCode:        '60622',
        countryCodeAlpha2: 'US',
      },
      collectDeviceData: true,
      additionalInformation: {
        shippingGivenName: 'John',
        shippingSurname:   'Doe',
        shippingAddress: {
          streetAddress:     '1 E Main St',
          extendedAddress:   'Suite 403',
          locality:          'Chicago',
          region:            'IL',
          postalCode:        '60622',
          countryCodeAlpha2: 'US',
        },
      },
    }
  }

  instance.requestPaymentMethod(requestOpts, function (err, payload) {
    if (err) {
      showResult('✗ ' + err.message, 'error')
      payBtn.disabled = false
      return
    }

    // payload.type:       'CreditCard' | 'PayPalAccount' | 'VenmoAccount'
    //                     'ApplePayCard' | 'AndroidPayCard'
    // payload.deviceData: 设备指纹（dataCollector: true 时存在）
    // payload.threeDSecureInfo: 3DS 认证信息（3DS 开启时存在）
    console.log('[dropin] requestPaymentMethod payload:', payload)

    fetch(DEMO.urls.transaction, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nonce:        payload.nonce,
        deviceData:   payload.deviceData,
        paymentType:  payload.type,
        amount:       currentAmount,
        currency:     currentCurrency,
        // PayPal：从 payload.details 提取真实买家联系方式，后端用于 customer/shipping internationalPhone
        payerEmail:   payload.details && payload.details.email   || undefined,
        payerPhone:   payload.details && payload.details.phone   || undefined,
        payerCountry: payload.details && payload.details.countryCode || undefined,
      }),
    })
      .then(function (r) { return r.json() })
      .then(function (data) {
        inspect('transaction', data.transaction || data)  // 控制台展示完整 tx，不分支付方式
        if (data.error) {
          showResult('✗ ' + data.error, 'error')
          clearResponseData()
          instance.clearSelectedPaymentMethod()
          payBtn.disabled = false
        } else {
          showResult(
            '✓ ' + data.status + ' · TX: ' + data.transactionId + ' · ' + payload.type,
            'success'
          )
          showResponseData(data.transaction || data)  // 显示完整 transaction 对象
          payBtn.style.display = 'none'
          document.getElementById('reset-btn').style.display = 'block'
        }
      })
      .catch(function (e) {
        showResult('✗ Network error: ' + e.message, 'error')
        payBtn.disabled = false
      })
  })
}
```

## 8. 辅助函数

```js
function showResult(msg, type) {
  var el = document.getElementById('result')
  el.textContent = msg
  el.className   = 'result-msg ' + type   // 注意：类名用空格分隔（'result-msg success'），与 sandbox.css .result-msg.success 匹配
}

// 成功后在 #response-data <pre> 块展示格式化 JSON 响应
function showResponseData(data) {
  var el = document.getElementById('response-data')
  el.textContent    = JSON.stringify(data, null, 2)
  el.style.display  = 'block'
}

// 失败 / 重置时清空 response-data 块
function clearResponseData() {
  var el = document.getElementById('response-data')
  el.textContent   = ''
  el.style.display = 'none'
}
```

**⚠️ 注意 CSS 类名：** `sandbox.css` 中的选择器是 `.result-msg.success` / `.result-msg.error`（无前缀），因此 `showResult` 必须生成 `'result-msg success'`，而不是 `'result-msg--success'`（双横线前缀的类名无法匹配，结果不会显示）。

## 8a. Inspect/Probe 探针（dropin-ui 专属）

> 通用 inspect 规范 → `apps/demo-hub/CLAUDE.md` §「Inspect/Probe 调试规范」

本 demo 使用与 PayPal v6 ACDC 相同的 `inspect()` 函数（前缀 `[dropin-PROBE]`）。

### 探针清单

| # | 位置 | 探针 | 关注点 |
|---|------|------|--------|
| P1 | 文件顶部 | `console.log('[dropin-ui] dropin-ui.js loaded')` | 确认 JS 正常加载 |
| P2 | `recreateDropIn` — `dropin.create` 调用前 | `console.log('[dropin-ui] dropin.create options:', dropInOpts)` | 确认 threeDSecure / paypal / applePay / googlePay 等配置正确传入 |
| P3 | `dropin.create` 回调成功后 | `console.log('[dropin-ui] instance created')` + `inspect('instance', instance)` | 探查 Drop-in instance 的方法集（teardown / on / isPaymentMethodRequestable / requestPaymentMethod 等） |
| P4 | `wireDropIn` — `isPaymentMethodRequestable` 调用后 | `console.log('[dropin-ui] isPaymentMethodRequestable (initial):', requestable)` | 确认初始状态（有 vault 卡时可能为 true）|
| P5 | `onPayClick` — `requestPaymentMethod` 调用前 | `console.log('[dropin-ui] requestPaymentMethod opts:', requestOpts)` | 确认 3DS 参数（amount / billingAddress / collectDeviceData）是否正确组装 |
| P6 | `requestPaymentMethod` 回调成功后 | `console.group('[dropin-PROBE] requestPaymentMethod payload')` + type / nonce / deviceData（截断）/ threeDSecureInfo | 确认 payload.type（CreditCard/PayPalAccount 等）、deviceData 存在、3DS 时 threeDSecureInfo 字段 |
| P7 | fetch transaction 响应后 | `console.group('[dropin-PROBE] transaction response')` + transactionId / status / error / full | 确认服务端返回结构，排查 400 错误原因 |

### 各探针样本输出（正常路径）

```
[dropin-ui] dropin-ui.js loaded
[dropin-ui] dropin.create options: { authorization: '...', container: '#dropin-container', dataCollector: true, card: {}, paypal: {...}, ... }
[dropin-ui] instance created
[dropin-PROBE] instance
  value: { ... }
  proto methods: ['teardown', 'on', 'off', 'isPaymentMethodRequestable', 'requestPaymentMethod', 'clearSelectedPaymentMethod', ...]
[dropin-ui] isPaymentMethodRequestable (initial): false
[dropin-ui] requestPaymentMethod opts: {}                    ← 3DS 关闭时
[dropin-PROBE] requestPaymentMethod payload
  type       : CreditCard
  nonce      : tokencc_bh_...
  deviceData : {"correlation_id":"..."}…
  full payload: { nonce, type, details, binData, deviceData }
[dropin-PROBE] transaction response
  transactionId : 3kx2ge0c
  status        : submitted_for_settlement
  error         : undefined
  full response : { transactionId, status }
```

## 9. Drop-in 事件与方法速查

| 方法 / 事件 | 本 demo 用途 |
|---|---|
| `dropin.create(opts, cb)` | 初始化（含 `threeDSecure: true` 时启用 3DS） |
| `instance.teardown(cb)` | 销毁当前实例（币种 reload 前 / 3DS toggle 时） |
| `instance.isPaymentMethodRequestable()` | 初始化后检查是否已有可用支付方式 |
| `instance.on('paymentMethodRequestable')` | enable Pay Now 按钮 |
| `instance.on('noPaymentMethodRequestable')` | disable Pay Now 按钮 |
| `instance.requestPaymentMethod(opts, cb)` | 获取 nonce；3DS 时 opts 含 `threeDSecure` 参数 |
| `instance.clearSelectedPaymentMethod()` | 交易失败后清除已选支付方式，让用户重选 |
| `instance.getAvailablePaymentOptions()` | （可选）控制台打印实际可用支付方式 |

## 10. 各支付方式沙盒测试方法

| 支付方式 | `payload.type` | 测试卡 / 方法 |
|---|---|---|
| 信用卡（无 3DS） | `CreditCard` | `4111 1111 1111 1111`（Visa） · 任意未来日期 · 任意 CVV |
| 信用卡（3DS Mastercard） | `CreditCard` | `5200000000002151` · 勾选 Enable 3DS |
| 信用卡（3DS Amex） | `CreditCard` | `340000000002534` · 勾选 Enable 3DS |
| PayPal | `PayPalAccount` | Drop-in 内弹 PayPal 沙盒登录窗口 |
| Venmo | `VenmoAccount` | 需移动端或支持 app-switch 的浏览器（桌面通常不显示） |
| Apple Pay | `ApplePayCard` | 需 Safari + 已配置 Apple Pay 的设备 |
| Google Pay | `AndroidPayCard` | 需 Chrome + Google 账号（沙盒用测试卡） |

## 11. 已知限制

- **Apple Pay / Venmo** 依赖浏览器 / 设备支持，Drop-in 自动隐藏不支持的选项
- **Apple Pay** 需 HTTPS；localhost 沙盒环境可用
- **Venmo**（`allowNewBrowserTab: false`）在桌面通常不显示，因为桌面不支持 app-switch
- **updateConfiguration 后 PayPal 授权状态重置**：用户已授权的 PayPal 账号会被清除，需重新授权，页面可视需要加提示

## 12. 成功标准（前端）

- [ ] 页面加载：Drop-in 渲染，card form 显示，Pay Now 按钮 disabled
- [ ] 填入测试卡 `4111 1111 1111 1111`（3DS 关闭）→ Pay Now enabled → `✓ submitted_for_settlement · CreditCard`
- [ ] 勾选 Enable 3DS + 测试卡 `4000000000001091` → 触发 3DS challenge → 通过后 TX 成功
- [ ] PayPal 授权完成 → Pay Now enabled → `✓ submitted_for_settlement · PayPalAccount`
- [ ] 修改金额 `20.00` → 点 Update → Drop-in teardown+recreate → PayPal sheet 显示 `$20.00`
- [ ] 切换到 EUR → 点 Update → 页面 reload（`?currency=EUR&amount=...`）→ 新 clientToken 含 merchantAccountId cwenEUR
- [ ] 交易失败 → 显示错误 + `clearSelectedPaymentMethod` → 用户可重选支付方式
- [ ] `console.log` 打印 payload（含 type / deviceData / threeDSecureInfo）
