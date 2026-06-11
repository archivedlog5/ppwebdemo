# 前端设计 — Fastlane Payment UI (fastlane-pui) · JSSDK v5

> 日期：2026-06-08
> 关联需求：`docs/req/2026-06-08-req-fastlane-pui.md`
> 关联后端设计：`docs/design/2026-06-08-design-be-fastlane-pui.md`

---

## 1. 文件

| 文件 | 职责 |
|------|------|
| `src/views/paypal/jssdk-v5/fastlane-pui.ejs` | HTML 结构（三段式表单）+ `window.DEMO` 注入 + SDK 脚本（含 `data-sdk-client-token`） |
| `src/public/js/paypal/jssdk-v5/fastlane-pui.js` | Fastlane 初始化 + email/认证/收货/支付/下单全流程（IIFE） |

遵循 demo-hub **EJS/JS 分离**：EJS 只放结构与配置注入，所有 SDK 逻辑在静态 JS。

---

## 2. SDK 脚本加载（EJS）

```html
<script
  src="<%= sdkUrl %>"
  data-sdk-client-token="<%= sdkClientToken %>"
  data-sdk-integration-source="developer-studio"
></script>
```

- `sdkUrl` = `https://www.paypal.com/sdk/js?client-id=<US_CLIENT_ID>&components=fastlane&buyer-country=US&currency=USD`
  - 本期 `components=fastlane`（最小）。若初始化失败再加 `buttons`。
  - `buyer-country=US`：Fastlane 仅 US；便于非 US 沙盒环境测试。
- `data-sdk-client-token`：后端 `getUSClientToken({ intent: 'sdk_init' })` 现取（不缓存，每次 GET 新取）。
- **币种锁定 USD**：不渲染币种下拉，金额输入保留。

`window.DEMO` 注入：

```html
<script>
  window.DEMO = {
    urls: { createOrder: '/paypal/jssdk-v5/api/fastlane-pui/create-order' },
    amount: '<%= defaultAmount %>',
    currency: 'USD'
  }
</script>
<script src="/js/paypal/jssdk-v5/fastlane-pui.js"></script>
```

---

## 3. 页面结构与三态 CSS 系统

### 3.1 整体布局

标准 `sandbox-page` > `sandbox-header` > `sandbox-card`（max-width 480px）。
卡片内：金额行（fl-amount-row）+ `<form id="fl-form">` 含三步（fl-steps）。

```
┌─ sandbox-header ─────────────────────────────────────┐
│  PayPal · JSSDK v5 · Fastlane  badge                  │
│  Fastlane Payment UI  (h1)                            │
└──────────────────────────────────────────────────────┘
┌─ sandbox-card (480px) ───────────────────────────────┐
│  [fl-amount-row] Total  $ 100.00  USD                 │
│                                                       │
│  ①  Customer          [active, 展开]                  │
│     email input + watermark + [ Continue ]            │
│                                                       │
│  ②  Shipping          [locked, 折叠 dimmed]           │
│                                                       │
│  ③  Payment           [locked, 折叠 dimmed]           │
└──────────────────────────────────────────────────────┘
```

### 3.2 三态 CSS 系统

**三步（Customer / Shipping / Payment）始终在 DOM 中可见，不能 display:none 隐藏任何一步。**
通过 CSS 类控制视觉状态：

| 状态 | CSS 类 | 表现 |
|------|--------|------|
| **锁定**（未到达） | 无 `fl-active` 无 `fl-visited` | 圆圈 + 标题 opacity 0.35–0.4，body 隐藏 |
| **激活**（当前填写） | `fl-active` | 圆圈绿色实心，标题全亮，body 展开，header 加底边框 |
| **已完成**（已提交） | `fl-visited`（不含 `fl-active`） | 圆圈显示 ✓（`::before` 替换数字），摘要文字可见，Edit 按钮可点 |

```css
/* 锁定态 */
.fl-step:not(.fl-active):not(.fl-visited) .fl-step__num  { opacity: 0.35; }
.fl-step:not(.fl-active):not(.fl-visited) .fl-step__title { opacity: 0.40; }

/* 激活态 */
.fl-step.fl-active .fl-step__num    { background: var(--accent); color: #021a0e; }
.fl-step.fl-active .fl-step__body  { display: block; }
.fl-step.fl-active .fl-step__hd    { border-bottom: 1px solid var(--border); }

/* 完成态 */
.fl-step.fl-visited:not(.fl-active) .fl-step__num span { display: none; }
.fl-step.fl-visited:not(.fl-active) .fl-step__num::before { content: '✓'; }
.fl-step.fl-visited:not(.fl-active) .fl-step__summary { display: block; }
.fl-step.fl-visited:not(.fl-active) .fl-step__edit   { opacity: 1; pointer-events: auto; }
```

CSS 作用域：**全部写在 EJS 文件内的 `<style>` 块中**，不修改 sandbox.css（全局共享文件）。
使用 `var(--accent)`, `var(--border)`, `var(--fg-muted)` 等已有变量，与 DESIGN.md 保持一致。

### 3.3 各步初始/流程状态变化

```
初始：
  Customer = fl-active
  Shipping = locked（无 class）
  Payment  = locked（无 class）

Email submit → member 认证成功：
  Customer → fl-visited（summary 显示 email）
  Shipping → fl-visited（summary 显示 profileData.shippingAddress 地址）← 不隐藏，直接变完成态
  Payment  → fl-active（展开 FastlanePaymentComponent）

Email submit → guest（无 customerContextId）：
  Customer → fl-visited（summary 显示 email）
  Shipping → fl-active（展开地址表单）
  Payment  → locked（保持）

Shipping submit（guest）：
  Shipping → fl-visited（summary 显示填写的地址）
  Payment  → fl-active（展开 FastlanePaymentComponent）
```

---

## 4. 前端流程（fastlane-pui.js）

IIFE 包裹，`'use strict'`，从 `window.DEMO` 读配置。整体复刻官方 Quick Start + 用户 demo JS，
**精简掉 PayPal/Venmo/PayLater 多 funding 部分**。

### 4.1 初始化

```
loadFastlane():
  1. 校验 window.paypal.Fastlane 存在（否则抛 "no Fastlane module"）
  2. const { identity, profile, FastlanePaymentComponent, FastlaneWatermarkComponent }
       = await window.paypal.Fastlane({
           metadata: { geoLocOverride: 'US' },
           styles: { root: { backgroundColor: '#faf8f5' } }   // 可按 sandbox 主题微调
         })
  3. 渲染 watermark：
       (await FastlaneWatermarkComponent({ includeAdditionalInfo: true })).render('#watermark-container')
  4. 绑定各按钮事件（email-submit / shipping-submit / *-edit / checkout）
  5. 启用 email-submit 按钮
```

### 4.2 Email 提交 → 识别 + 认证

```
emailSubmit click:
  - 校验 email 非空/格式
  - disable 按钮；读取 email；重置状态（memberAuthenticated / shippingAddress / paymentToken = undefined）
  - 重置 stepShipping / stepPayment 的 fl-visited / fl-active class
  - customerContext = await identity.lookupCustomerByEmail(email)
  - 若 customerContext.customerContextId:
      authResponse = await identity.triggerAuthenticationFlow(customerContextId)   // 弹 OTP
      若 authResponse.authenticationState === 'succeeded':
        memberAuthenticated = true
        shippingAddress = authResponse.profileData.shippingAddress
        paymentToken    = authResponse.profileData.card
  - markVisited(stepCustomer)；customer-summary.innerText = email
  - 若 memberAuthenticated:
      setShippingSummary(shippingAddress)   // 显示会员地址
      markVisited(stepShipping)             // Shipping → 完成态（显示摘要 + Edit）
      paymentComponent = await FastlanePaymentComponent()
      paymentComponent.render('#payment-component')
      setActive(stepPayment)               // Payment → 激活态
  - 否则（guest）:
      setActive(stepShipping)              // Shipping → 激活态（展开地址表单）
  - finally: 重新启用按钮
```

**关键区别（与旧设计不同）**：会员路径下 Shipping 不再 `display:none`，而是直接 `markVisited` 显示地址摘要。Edit 按钮触发 `profile.showShippingAddressSelector()` 弹窗。

### 4.3 收货提交（访客）

**Checkbox 控制地址字段显隐（EJS + JS 联动）：**
- `#shipping-required-checkbox` change 事件绑定在 `load()` 阶段
- 勾选 → `#shipping-address-fields` `display:block`（默认）
- 取消 → `#shipping-address-fields` `display:none`，Continue 按钮可直接点击（不经过字段校验）

```
shippingSubmit click:
  - 读 isShippingRequired 复选框（form.elements['shipping-required'].checked）
  - 若未勾选：
      shippingAddress = undefined
      markVisited(stepShipping)；进 ensurePaymentComponent(null,null,null)
      setActive(stepPayment)；return
  - 若勾选：
      validateFields(['given-name','family-name','address-line1','address-level2',
                      'address-level1','postal-code','country','tel-country-code','tel-national'])
      若校验失败 → return（高亮第一个空字段）
  - 组装 shippingAddress 对象（camelCase，见 §5）
  - setShippingSummary(shippingAddress)；markVisited(stepShipping)
  - ensurePaymentComponent(telNational, postalCode, fullName)
      → 若 paymentComponent 未创建：FastlanePaymentComponent({ fields: { phoneNumber, postalCode, cardholderName } })
      → 若已存在：updatePrefills({ phoneNumber: telNational })
  - paymentComponent.setShippingAddress(shippingAddress)
  - setActive(stepPayment)
```

> `address-line2` 不在必填列表中，作为可选字段不参与校验。

### 4.4 收货编辑

```
shippingEdit click:
  - 若 member：
      const { selectionChanged, selectedAddress } = await profile.showShippingAddressSelector()
      若 selectionChanged：
        shippingAddress = selectedAddress
        setShippingSummary(shippingAddress)           ← 刷新 Shipping section 摘要 UI
        paymentComponent.setShippingAddress(shippingAddress)
  - 否则（guest）：setActive(stepShipping)（展开地址表单重新填写）
```

> **Bug 修复记录**：原实现漏调 `setShippingSummary`，导致弹窗选完新地址后控制台有数据但 UI 摘要不更新，已补。

### 4.5 Checkout 下单

```
checkout click:
  - disable 按钮；succeeded = false
  - paymentToken = await paymentComponent.getPaymentToken()
  - body = { paymentToken, amount: #demo-amount.value,
             ...(isShippingRequired && shippingAddress && { shippingAddress }) }
  - resp = await fetch(DEMO.urls.createOrder, { POST, json, body })
  - order = await resp.json()
  - 成功判定（CLAUDE 规则 13）：
      capture = order.purchase_units[0].payments.captures[0]
      若 !capture || capture.status !== 'COMPLETED':
        showResult('✗ Capture failed · status: ' + (capture?.status || order.error || 'unknown'), 'error')
        return
      showResult('✓ ' + capture.status + ' · Capture ID: ' + capture.id, 'success')
      succeeded = true
  - catch: showResult('✗ ' + e.message, 'error')
  - finally: 若 !succeeded → 重新启用按钮（失败/异常可重试；成功则永久 disabled）
```

**行为确认**：
1. 成功提示格式：`✓ COMPLETED · Capture ID: <id>`（明确显示 capture ID）
2. 成功后 Checkout 按钮**永久 disabled**（防止重复扣款），失败/异常则恢复可点
3. 成功后 **全部 Edit 按钮一并 disabled**（email-edit / shipping-edit / payment-edit），整个表单进入锁定态；如需重试请刷新页面

> 注：若后端经验证发现 `single_use_token` 不会自动 capture（返回 CREATED/APPROVED），
> 则改为「create-order 拿 id → 再调 capture-order」，前端 checkout 增加一次 capture fetch。
> 该不确定性在 QA 阶段确认，见后端设计 §自动扣款验证。

### 4.6 辅助函数（来自 demo JS，保留）

- `setActiveSection(section)`：切换 active/visited class。
- `getAddressSummary(addr)` / `setShippingSummary(addr)`：地址摘要文本。
- `validateFields(form, [names])`：HTML5 `checkValidity` 校验 + `reportValidity`。

---

## 5. 前端 shippingAddress 数据结构（发往后端）

```js
shippingAddress = {
  address: {
    addressLine1, addressLine2, adminArea2 /*city*/, adminArea1 /*state*/,
    postalCode, countryCode
  },
  name: { firstName, lastName, fullName },
  phoneNumber: { countryCode /*tel-country-code*/, nationalNumber /*tel-national*/ }
}
```

会员认证成功时，`shippingAddress` 直接取自 `authResponse.profileData.shippingAddress`（结构相同）。
后端负责把 camelCase 映射成 PayPal snake_case（见后端设计）。

---

## 6. Inspect / Probe（[[feedback_v6_inspect_probe]]）

新集成，定稿逻辑前在控制台逐个打印返回对象，核对真实字段后再写判定逻辑：

- `window.paypal.Fastlane(...)` 返回的 `{ identity, profile, FastlanePaymentComponent, FastlaneWatermarkComponent }`
- `identity.lookupCustomerByEmail(email)` → `customerContext`（含 `customerContextId`）
- `identity.triggerAuthenticationFlow(id)` → `authResponse`（`authenticationState` / `profileData.shippingAddress` / `profileData.card`）
- `FastlanePaymentComponent()` → `paymentComponent`
- `paymentComponent.getPaymentToken()` → `paymentToken`（重点确认 `paymentToken.id` 路径）
- `profile.showShippingAddressSelector()` → `{ selectionChanged, selectedAddress }`
- create-order 返回的完整 `order`（确认 captures 路径与是否自动扣款）

---

## 7. 边界情况

| 场景 | 处理 |
|------|------|
| 非 Fastlane email（访客） | `customerContextId` 为空 → 走访客收货 + 填卡流程 |
| OTP 失败 / 用户取消认证 | `authenticationState !== 'succeeded'` → 回落访客流程 |
| PayPal 会员选择不保存 | SDK 内部返回空 `profileData` → 当访客处理（无需额外代码） |
| 不需要收货（虚拟商品） | 取消勾选 shipping-required → 不发 shippingAddress |
| `getPaymentToken()` 抛错 | catch → showResult 错误；按钮恢复可重试 |
| Fastlane 模块缺失 | 抛 "no Fastlane module"；提示检查 SDK `components` 与 client token |
