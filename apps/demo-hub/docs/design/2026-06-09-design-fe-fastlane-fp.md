# 前端设计 — Fastlane Flexible (fastlane-fp) · JSSDK v5

> 日期：2026-06-09
> 关联需求：`docs/req/2026-06-09-req-fastlane-fp.md`
> 关联后端设计：`docs/design/2026-06-09-design-be-fastlane-fp.md`
> 参考实现：`fastlane-pui` 的 fe 设计 `docs/design/2026-06-08-design-fe-fastlane-pui.md`（复用三态 CSS 与多数辅助函数）

---

## 1. 文件

| 文件 | 职责 |
|------|------|
| `src/views/paypal/jssdk-v5/fastlane-fp.ejs` | HTML 结构（**四段式**表单）+ `window.DEMO` 注入 + SDK 脚本（`data-sdk-client-token`，`components=fastlane,three-domain-secure`） |
| `src/views/paypal/jssdk-v5/fastlane-fp-return.ejs` | API 3DS return 结果页（服务端渲染，见后端设计 §5；本文件不含逻辑） |
| `src/public/js/paypal/jssdk-v5/fastlane-fp.js` | Fastlane Flexible 初始化 + email/认证/收货/账单/卡/3DS/下单全流程（IIFE） |

遵循 demo-hub **EJS/JS 分离**：EJS 只放结构与配置注入，所有 SDK 逻辑在静态 JS。
三态 CSS（`fl-active` / `fl-visited` / locked）**复用 pui 的 scoped `<style>` 块**（直接复制到本 EJS，遵守"页面专属样式写在 EJS 内"约定，不改全局 sandbox.css）。

---

## 2. SDK 脚本加载（EJS）

```html
<script
  src="<%= sdkUrl %>"
  data-sdk-client-token="<%= sdkClientToken %>"
  data-sdk-integration-source="developer-studio"
></script>
```

- `sdkUrl` = `https://www.paypal.com/sdk/js?client-id=<US_CLIENT_ID>&components=fastlane,three-domain-secure&buyer-country=US&currency=USD`
  - **与 pui 区别**：加 `three-domain-secure`（ThreeDomainSecureClient 需要）。
  - `buyer-country=US`：Fastlane 仅 US；便于非 US 沙盒环境测试。
- `data-sdk-client-token`：后端 `getUSClientToken({ intent:'sdk_init' })` 现取（不缓存）。
- **币种锁定 USD**：不渲染币种下拉，金额输入保留。

`window.DEMO` 注入：

```html
<script>
  window.DEMO = {
    urls: { createOrder: '/paypal/jssdk-v5/api/fastlane-fp/create-order' },
    amount: '<%= defaultAmount %>',
    currency: 'USD'
  }
</script>
<script src="/js/paypal/jssdk-v5/fastlane-fp.js"></script>
```

> return 路由是整页跳转，**不经过** `window.DEMO`；return 结果页由服务端渲染。

---

## 3. 页面结构（四段式）与三态 CSS

### 3.1 整体布局

标准 `sandbox-page` > `sandbox-header` > `sandbox-card`（max-width 480px）。
卡片内：金额行（`fl-amount-row`）+ `<form id="fl-form">` 含**四步**（`fl-steps`）。

```
┌─ sandbox-header ─────────────────────────────────────┐
│  PayPal · JSSDK v5 · Fastlane  badge                  │
│  Fastlane Flexible  (h1)                              │
│  小字：Flexible — FastlaneCardComponent + own billing │
└──────────────────────────────────────────────────────┘
┌─ sandbox-card (480px) ───────────────────────────────┐
│  [fl-amount-row] Total  $ 100.00  USD                 │
│                                                       │
│  ①  Customer          [active, 展开]                  │
│     email input + watermark + [ Continue ]            │
│  ②  Shipping          [locked]                        │
│  ③  Billing           [locked]   ← Flexible 新增      │
│  ④  Payment           [locked]                        │
│       3DS Flow: [ JSSDK ▾ | API ]                     │
│       #card-component  +  #payment-watermark           │
│       [ Checkout ]                                     │
└──────────────────────────────────────────────────────┘
```

### 3.2 三态 CSS 系统（复用 pui）

四步（Customer / Shipping / Billing / Payment）**始终在 DOM 中可见**，通过 CSS 类控制视觉状态：

| 状态 | CSS 类 | 表现 |
|------|--------|------|
| 锁定（未到达） | 无 `fl-active` 无 `fl-visited` | 圆圈 + 标题 dimmed，body 隐藏 |
| 激活（当前填写） | `fl-active` | 圆圈绿色实心，body 展开，header 加底边框 |
| 已完成（已提交） | `fl-visited`（不含 `fl-active`） | 圆圈显 ✓，摘要可见，Edit 按钮可点 |

> 直接复制 pui EJS 的 `<style>` 块（`.fl-step` / `.fl-step__num` / `.fl-input` / `.fl-btn` 等），
> 仅把步骤序号 `1/2/3` 扩展为 `1/2/3/4`。`#payment-watermark` 复用 `.fl-watermark` 样式。
>
> **追加规则**：Payment 步（member-有卡路径）需同时展示内容与 Edit 按钮，因此加：
> ```css
> /* Payment 步 member-有卡：fl-active + fl-visited 同时存在时 Edit 按钮可见 */
> .fl-step.fl-active.fl-visited .fl-step__edit { opacity: 1; pointer-events: auto; }
> ```

### 3.3 Billing 步骤的特殊性：会员有卡时隐藏

Billing 步骤额外支持 `hidden` 属性（参考用户 demo `billingSection.setAttribute("hidden")`）：

```css
/* Billing 在会员有存卡时整步隐藏（账单地址取自卡 profile） */
#step-billing[hidden] { display: none; }
```

### 3.4 各步初始/流程状态变化

```
初始：
  Customer = fl-active
  Shipping = locked
  Billing  = locked
  Payment  = locked

Email submit → member 认证成功（有存卡）：
  Customer → fl-visited（email 摘要）
  Shipping → fl-visited（profileData.shippingAddress 摘要）
  Billing  → hidden（账单取自卡 profile，不展示）
  Payment  → fl-active + fl-visited（显示存卡摘要 + watermark；Edit 按钮可见，触发 showCardSelector）
  // markVisited(stepPayment) 紧接 setActive(stepPayment) 后调用

Email submit → member 认证成功（无存卡）：
  Customer → fl-visited
  Shipping → fl-visited
  Billing  → fl-active（展开账单表单）
  Payment  → locked

Email submit → guest（无 customerContextId）：
  Customer → fl-visited
  Shipping → fl-active（展开收货表单）
  Billing / Payment → locked

Shipping submit（guest/member-无卡）：
  Shipping → fl-visited
  Billing  → fl-active

Billing submit（guest/member-无卡）：
  Billing  → fl-visited
  Payment  → fl-active（渲染 FastlaneCardComponent + watermark）
```

---

## 4. Payment 步内结构（EJS）

```html
<div class="fl-step" id="step-payment">
  <div class="fl-step__hd">… 圆圈 ④ + 标题 Payment + #payment-edit-button …</div>
  <div class="fl-step__body">
    <!-- 3DS Flow 选择 -->
    <div class="fl-field">
      <label class="fl-label" for="three-ds-flow">3DS Flow</label>
      <select id="three-ds-flow" name="three-ds-flow" class="fl-input">
        <option value="none">None / When Required (direct payment, no 3DS enforcement)</option>
        <option value="jssdk">JSSDK 3DS (client-side, SCA_ALWAYS)</option>
        <option value="api">API 3DS (full-page redirect → return page, SCA_ALWAYS)</option>
      </select>
    </div>
    <!-- 会员存卡摘要（member-有卡时显示） -->
    <div id="selected-card" class="fl-selected-card"></div>
    <!-- Flexible 卡组件挂载点（guest/member-无卡时渲染） -->
    <div id="card-component"></div>
    <!-- watermark（紧贴卡下方，Flexible 要求） -->
    <div id="payment-watermark" class="fl-watermark"></div>
    <button id="checkout-button" type="button" class="fl-btn">Checkout</button>
  </div>
</div>
```

> Billing 步骤的 HTML 字段与 pui 的 Shipping 地址字段类似，但 **id/name 前缀用 `billing-`**
> （`billing-address-line1` / `billing-address-level2` / `billing-address-level1` /
> `billing-postal-code` / `billing-country`；账单无需姓名/电话，姓名复用持卡人）。

---

## 5. 前端流程（fastlane-fp.js）

IIFE 包裹，`'use strict'`，从 `window.DEMO` 读配置。结构复刻用户 Flexible demo JS，
**删掉 PayPal/Venmo/PayLater 多 funding 部分**，保留 Fastlane 卡 + 两套 3DS。

### 5.1 状态变量

```
identity, profile, FastlaneCardComponent, FastlaneWatermarkComponent
fastlaneCardComponent            // 实例（getPaymentToken 用）
memberAuthenticated              // 认证成功
memberHasSavedCard               // 认证成功且 profileData.card 存在
email, shippingAddress, billingAddress, paymentToken
prefillTel, prefillZip, prefillCardholderName
activeSection
```

### 5.2 初始化

```
loadFastlane():
  1. 校验 window.paypal.Fastlane 存在（否则抛 "no Fastlane module"）
  2. const fl = await window.paypal.Fastlane({
       metadata: { geoLocOverride: 'US' },
       styles: { root: { backgroundColor: 'transparent' } }
     })
     identity = fl.identity; profile = fl.profile
     FastlaneCardComponent = fl.FastlaneCardComponent           // ← Flexible 用 Card 组件
     FastlaneWatermarkComponent = fl.FastlaneWatermarkComponent
  3. 渲染 email 旁 watermark：
       (await FastlaneWatermarkComponent({ includeAdditionalInfo: true })).render('#watermark-container')
  4. 绑定按钮事件（email / shipping / billing / *-edit / checkout）
  5. 启用 email-submit
  inspect/probe：console.log 打印 fl、各组件
```

### 5.3 Email 提交 → 识别 + 认证

```
emailSubmit:
  - 校验 email；disable 按钮
  - 重置状态（memberAuthenticated / memberHasSavedCard / shippingAddress / billingAddress
    / paymentToken / fastlaneCardComponent = undefined）；清空各步 visited/active class；
    清空 #card-component / #payment-watermark / #selected-card；恢复 Billing 的 hidden 解除
  - ctx = await identity.lookupCustomerByEmail(email)            // inspect
  - if ctx.customerContextId:
      auth = await identity.triggerAuthenticationFlow(ctx.customerContextId)   // OTP，inspect
      if auth.authenticationState === 'succeeded':
        memberAuthenticated = true
        shippingAddress = auth.profileData?.shippingAddress
        paymentToken    = auth.profileData?.card
        billingAddress  = paymentToken?.paymentSource?.card?.billingAddress    // 取自卡 profile
        memberHasSavedCard = !!paymentToken
  - customerSummary = email；markVisited(stepCustomer)
  - 分支（见 §5.4）
  - finally: 重新启用 email-submit
```

### 5.4 认证后 UI 分支

```
if memberAuthenticated:
    setShippingSummary(shippingAddress); markVisited(stepShipping)
    if memberHasSavedCard:
        stepBilling.hidden = true                  // 账单取自卡 profile，整步隐藏
        renderSelectedCard(paymentToken)           // #selected-card 显示 •••• lastDigits
        (await FastlaneWatermarkComponent({ includeAdditionalInfo:false })).render('#payment-watermark')
        setActive(stepPayment)                     // 不渲染卡组件
    else:
        setActive(stepBilling)                     // 会员无卡 → 填账单
else:                                              // guest
    setActive(stepShipping)
```

### 5.5 收货提交（guest / member-无卡）

与 pui 完全一致逻辑（checkbox 控制地址字段显隐）：

```
shippingSubmit:
  - required = #shipping-required-checkbox.checked
  - 若未勾选：shippingAddress = undefined; markVisited(stepShipping); setActive(stepBilling); return
  - 校验收货字段（given/family/address-line1/level2/level1/postal/country/tel-country/tel-national）
  - 组装 shippingAddress（camelCase，结构见 §6）
  - 记录 prefill：prefillTel = formatPhone(telNational); prefillZip = postalCode;
    prefillCardholderName = firstName + ' ' + lastName
  - setShippingSummary; markVisited(stepShipping); setActive(stepBilling)
```

### 5.6 账单提交（Flexible 新增，guest / member-无卡）

```
billingSubmit:
  - 校验账单字段（billing-address-line1 / billing-address-level2 / billing-address-level1
    / billing-postal-code / billing-country）
  - 组装 billingAddress（camelCase，结构见 §6）
  - setBillingSummary; markVisited(stepBilling)
  - 渲染卡组件（带 prefill）：
      fastlaneCardComponent = await FastlaneCardComponent({
        fields: {
          phoneNumber:    { prefill: prefillTel },
          postalCode:     { prefill: prefillZip || billingAddress.postalCode },
          cardholderName: { prefill: prefillCardholderName, enabled: true },
        }
      })
      fastlaneCardComponent.render('#card-component')
      (await FastlaneWatermarkComponent({ includeAdditionalInfo:false })).render('#payment-watermark')
  - setActive(stepPayment)
  inspect/probe：console.log 打印 fastlaneCardComponent
```

### 5.7 编辑按钮

```
email-edit  → setActive(stepCustomer)
shipping-edit:
  if memberAuthenticated:
     { selectionChanged, selectedAddress } = await profile.showShippingAddressSelector()  // inspect
     if selectionChanged: shippingAddress = selectedAddress; setShippingSummary(...)
  else: setActive(stepShipping)
billing-edit → setActive(stepBilling)        // member-有卡时 Billing 隐藏，无此按钮交互
payment-edit:
  if memberHasSavedCard:
     { selectionChanged, selectedCard } = await profile.showCardSelector()                // inspect
     if selectionChanged: paymentToken = selectedCard; renderSelectedCard(paymentToken)
  else: setActive(stepPayment)
```

### 5.8 Checkout 下单（核心：两套 3DS）

```
checkout:
  - disable 按钮；succeeded = false
  - threeDSFlow = #three-ds-flow.value           // 'none' | 'jssdk' | 'api'
  - 取 paymentToken：
      if !memberHasSavedCard:
        paymentToken = await fastlaneCardComponent.getPaymentToken({ billingAddress })   // inspect
      // member-有卡：paymentToken 已是 profile card
  - amount = #demo-amount.value

  ── 0. None / When Required flow ───────────────────────────
  if threeDSFlow === 'none':
      // 直接下单，不做任何 3DS 处理，PayPal 按需决定
      await createAndJudge(paymentToken, 'none', shippingAddress, amount)

  ── A. JSSDK flow ──────────────────────────────────────────
  else if threeDSFlow === 'jssdk':
      tds = window.paypal.ThreeDomainSecureClient
      params = {
        amount, currency: 'USD',
        nonce: paymentToken.id,
        verificationMethod: 'SCA_ALWAYS',          // ← inspect/probe 字段名
        transactionContext: {
          experience_context: { brand_name:'Demo Hub US Store', locale:'en-US',
            return_url:'https://example.com/return', cancel_url:'https://example.com/cancel' },
          transaction_context: { soft_descriptor:'Demo Hub Fastlane' },
        },
      }
      eligible = await tds.isEligible(params)       // inspect
      if eligible:
        results = await tds.show()                  // 弹 3DS 挑战，inspect
        if results.authenticationState === 'succeeded' && results.liabilityShift === 'POSSIBLE':
          paymentToken.id = results.nonce           // 用 3DS nonce 替换
          await createAndJudge(paymentToken, 'jssdk', shippingAddress, amount)
        else:
          showResult('✗ 3DS not authenticated · state: ' + results.authenticationState, 'error'); return
      else:
        // 不符合 3DS 资格 → 直接下单
        await createAndJudge(paymentToken, 'jssdk', shippingAddress, amount)

  ── B. API flow (SCA_ALWAYS，全页跳转) ─────────────────────
  else if threeDSFlow === 'api':
      order = await createOrder(paymentToken, 'api', shippingAddress, amount)   // POST，inspect
      if order.status === 'PAYER_ACTION_REQUIRED':
        href = (order.links||[]).find(l => l.rel === 'payer-action')?.href
        if href: window.location.href = href        // 全页跳转 → 完成后回 return 页（服务端 capture）
        else: showResult('✗ no payer-action link', 'error')
      else:
        // 未触发挑战 → 直接判定（可能已 captures）
        judgeInline(order)
  - catch / finally：失败恢复按钮；成功（JSSDK 内联）则锁表单
```

**`createAndJudge(token, flow, shipping, amount)`**（JSSDK / 非挑战路径，单页内联）：

```
order = await createOrder(token, flow, shipping, amount)
judgeInline(order)
```

**`judgeInline(order)`**（规则 13）：

```
capture = order.purchase_units?.[0]?.payments?.captures?.[0]
if !capture || capture.status !== 'COMPLETED':
   showResult('✗ Capture failed · status: ' + (capture?.status || order.error || 'unknown'), 'error'); return
showResult('✓ ' + capture.status + ' · Capture ID: ' + capture.id, 'success')
// 成功后锁定整表单（email/shipping/billing/payment edit 全 disabled），刷新重试
```

**`createOrder(token, flow, shipping, amount)`**：

```
body = { paymentToken: token, threeDSFlow: flow, amount,
         ...(shipping && { shippingAddress: shipping }),
         ...(billingAddress && { billingAddress }) }
resp = await fetch(DEMO.urls.createOrder, { POST, json, body })
return await resp.json()      // inspect：打印完整 order
```

> **API flow 不在前端判定成功**：跳转后由 return 页（服务端 capture）渲染结果。前端只负责发起跳转。

### 5.9 辅助函数（来自 pui / demo JS，保留）

- `setActive(section)` / `markVisited(section)`：三态 class 切换。
- `getAddressSummary(addr)` / `setShippingSummary(addr)` / `setBillingSummary(addr)`：地址摘要文本。
- `renderSelectedCard(token)`：`#selected-card.innerText = '💳 •••• ' + token.paymentSource.card.lastDigits`。
- `validateFields([names])`：HTML5 `checkValidity` + 高亮。
- `formatPhone(national)`：10 位 → `xxx-xxx-xxxx`（来自 demo `formatPhoneNumber`）。

---

## 6. 前端数据结构（发往后端）

```js
// 收货（与 pui 一致）
shippingAddress = {
  address: { addressLine1, addressLine2, adminArea2/*city*/, adminArea1/*state*/, postalCode, countryCode },
  name:    { firstName, lastName, fullName },
  phoneNumber: { countryCode, nationalNumber },
}

// 账单（Flexible 新增；getPaymentToken({ billingAddress }) 用，无姓名/电话）
billingAddress = {
  addressLine1, addressLine2, adminArea2/*city*/, adminArea1/*state*/, postalCode, countryCode,
}
```

> 注意：`getPaymentToken({ billingAddress })` 期望的 billing 结构以 SDK 实际要求为准
> （inspect/probe 确认；demo 里 billing 为扁平 `{ addressLine1, adminArea2, adminArea1, postalCode, countryCode }`）。
> 会员认证成功时，`billingAddress` 取自 `paymentToken.paymentSource.card.billingAddress`。

---

## 7. Inspect / Probe（[[feedback_v6_inspect_probe]]）

新集成，定稿逻辑前在控制台逐个打印返回对象，核对真实字段后再写判定逻辑：

- `window.paypal.Fastlane(...)` → `{ identity, profile, FastlaneCardComponent, FastlaneWatermarkComponent }`
- `identity.lookupCustomerByEmail(email)` → `customerContext`（`customerContextId`）
- `identity.triggerAuthenticationFlow(id)` → `authResponse`（`authenticationState` / `profileData.shippingAddress` / `profileData.card` / `profileData.card.paymentSource.card.billingAddress` / `.lastDigits`）
- `FastlaneCardComponent(opts)` → `fastlaneCardComponent`
- `fastlaneCardComponent.getPaymentToken({ billingAddress })` → `paymentToken`（确认 `paymentToken.id`、`paymentToken.paymentSource.card.lastDigits`）
- `profile.showShippingAddressSelector()` → `{ selectionChanged, selectedAddress }`
- `profile.showCardSelector()` → `{ selectionChanged, selectedCard }`
- `ThreeDomainSecureClient.isEligible(params)` → boolean
- `ThreeDomainSecureClient.show()` → `{ authenticationState, liabilityShift, nonce }`
- create-order（jssdk）返回 `order` → captures 路径
- create-order（api）返回 `order` → `status:PAYER_ACTION_REQUIRED` + `links[].rel='payer-action'`
- （服务端）return 页 capture 返回 `order` → captures 路径

---

## 8. 边界情况

| 场景 | 处理 |
|------|------|
| 非 Fastlane email（访客） | `customerContextId` 为空 → guest：收货 + 账单 + 卡组件 |
| 会员认证成功但无存卡 | `paymentToken` 空 → 走 Billing + 卡组件流程 |
| OTP 失败 / 取消 | `authenticationState !== 'succeeded'` → 回落访客流程 |
| PayPal 会员选择不保存 | SDK 返回空 `profileData` → 当访客（无需额外代码） |
| 不需要收货（虚拟商品） | 取消勾选 shipping-required → 不发 shippingAddress（仍需账单） |
| JSSDK 3DS 不符合资格 | `isEligible` false → 直接 create-order（不弹挑战） |
| JSSDK 3DS 认证失败 / liabilityShift 非 POSSIBLE | showResult 错误，不下单，按钮恢复 |
| API 3DS 无 payer-action link | showResult 错误（不跳转） |
| API 3DS 用户取消 | 跳回 `return?fp_cancel=1` → return 页显示取消提示 |
| `getPaymentToken()` 抛错 | catch → showResult 错误；按钮恢复重试 |
| Fastlane / ThreeDomainSecureClient 模块缺失 | 抛错；提示检查 SDK `components`（需 `fastlane,three-domain-secure`）与 client token |

---

## 9. 与 pui 的复用与差异小结

**复用**：三态 CSS、`sandbox-card` 布局、watermark 渲染、收货表单与映射、`setActive/markVisited/validateFields` 等辅助函数、规则 13 判定、成功后锁表单。

**差异**：
1. `FastlaneCardComponent`（非 `FastlanePaymentComponent`）。
2. 新增独立 **Billing 步骤**（会员有卡时隐藏）。
3. `getPaymentToken({ billingAddress })`。
4. Payment 步内 **3DS Flow 下拉** + 两套 3DS 逻辑。
5. API 3DS **整页跳转 + 独立 return 页**（服务端 capture）。
6. `profile.showCardSelector()`（会员换卡）。
7. SDK `components` 加 `three-domain-secure`。
