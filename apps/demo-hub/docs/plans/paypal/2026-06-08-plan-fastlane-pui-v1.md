# Fastlane Payment UI (fastlane-pui) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **Opus 限制**：当前若为 Opus 模型，只能写 markdown，**不能执行本计划的任何代码改动**。实现前请切换到非 Opus 模型（如 Sonnet）。
>
> 🔧 **Git 由用户管理**：本项目规则禁止 Claude 执行任何 git 操作。各 Task 末尾的 commit 由用户自行执行。
>
> 🧪 **验证方式**：demo-hub 无自动化测试框架，验证 = 浏览器手动测 + `curl` 测 API，结果记入 `docs/test-cases.md`。

**Goal:** 在 demo-hub 新增 `paypal/jssdk-v5/fastlane-pui` 演示 —— Fastlane Quick Start（Payment UI 组件）的 guest/member 结账，后端用 `single_use_token` 调 Orders v2。

**Architecture:** 自定义 Express 路由（GET 渲染 + POST create-order）+ EJS 视图（三段式表单 + `data-sdk-client-token`）+ 静态 JS（Fastlane 初始化/认证/收货/下单）。复用 US 账户凭证；`getUSClientToken` 增加 `intent=sdk_init` 可选参数；订单用 `getUSToken()` 的 access token。

**Tech Stack:** Node.js + Express + EJS + Vanilla JS；PayPal JSSDK v5（`components=fastlane`）；PayPal Orders v2 API；Supabase（产品配置）。

**关联文档：**
- 需求：`docs/req/2026-06-08-req-fastlane-pui.md`
- 前端设计：`docs/design/2026-06-08-design-fe-fastlane-pui.md`
- 后端/DB 设计：`docs/design/2026-06-08-design-be-fastlane-pui.md`

---

## File Structure

| 文件 | 改动 | 责任 |
|------|------|------|
| `src/config/paypal.js` | Modify | `getUSClientToken({ intent })` 增加可选参数（非破坏性） |
| `src/routes/paypal/jssdk-v5/fastlane-pui.js` | Create | 路由：GET 渲染 + POST create-order（含 order body 组装 + shipping 映射） |
| `src/views/paypal/jssdk-v5/fastlane-pui.ejs` | Create | 三段式结账表单 + `window.DEMO` 注入 + SDK 脚本 |
| `src/public/js/paypal/jssdk-v5/fastlane-pui.js` | Create | Fastlane 初始化/email 认证/收货/支付/下单流程 |
| `src/app.js` | Modify | 挂载路由 |
| Supabase `demohub.products` | Data | INSERT 一行（用户手动执行）|
| `src/routes/paypal/jssdk-v5/CLAUDE.md` | Modify | 补 SDK params 表 + 自定义路由备注 |
| `docs/test-cases.md` / `docs/progress.md` / `docs/debug-log.md` | Modify | 记录验证与进度 |

---

## Task 1: client token 支持 intent 参数

**Files:**
- Modify: `src/config/paypal.js`（`getUSClientToken` 函数）

- [x] **Step 1: 修改 getUSClientToken 接受可选 intent**

把现有 `getUSClientToken()` 改为接受可选参数，默认行为不变：

```js
/**
 * Browser-safe client token (US account) with domain whitelisting.
 * @param {object} [opts]
 * @param {string} [opts.intent] - e.g. 'sdk_init' for Fastlane. Omit for default behavior.
 * Not cached — called once per page load.
 */
async function getUSClientToken({ intent } = {}) {
  const clientId = process.env.PAYPAL_US_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_US_CLIENT_SECRET;
  const domains = process.env.PAYPAL_US_MERCHANT_DOMAINS;

  const params = {
    grant_type: "client_credentials",
    response_type: "client_token",
    "domains[]": domains,
  };
  if (intent) params.intent = intent;

  const body = new URLSearchParams(params).toString();

  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal client token failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}
```

- [x] **Step 2: 确认现有 v6 调用不受影响**

Run: `grep -rn "getUSClientToken" apps/demo-hub/src`
Expected: 现有调用 `getUSClientToken()`（无参）仍合法（`{ intent } = {}` 默认空对象，`intent` undefined → 不加 intent，行为同改动前）。

- [x] **Step 3: 语法自检**

Run: `node -e "require('./apps/demo-hub/src/config/paypal.js'); console.log('ok')"`
Expected: 输出 `ok`，无 SyntaxError。

- [ ] **Step 4: Commit（用户执行）**

```bash
git add apps/demo-hub/src/config/paypal.js
git commit -m "feat(demo-hub): getUSClientToken supports optional intent (sdk_init for Fastlane)"
```

---

## Task 2: 路由文件 fastlane-pui.js

**Files:**
- Create: `src/routes/paypal/jssdk-v5/fastlane-pui.js`

参考 `src/routes/paypal/jssdk-v5/acdc.js` 的自定义路由结构。

- [x] **Step 1: 创建路由文件（GET + POST create-order）**

```js
/* Custom: Fastlane Quick Start — Payment UI component (single_use_token) */
const { Router } = require('express')
const fetch = require('node-fetch')
const { getProduct, getProviderProducts } = require('../../../config/products')
const { getUSToken, getUSClientToken, API, getHeaders } = require('../../../config/paypal')
const C = require('../../../config/constants')

const router = Router()
const PROVIDER = 'paypal', SDK = 'jssdk-v5', KEY = 'fastlane-pui'

// camelCase (前端) → PayPal snake_case shipping
function mapShipping(s) {
  if (!s || !s.address) return undefined
  const out = {
    type: 'SHIPPING',
    address: {
      address_line_1: s.address.addressLine1 || '',
      address_line_2: s.address.addressLine2 || '',
      admin_area_2:   s.address.adminArea2   || '',
      admin_area_1:   s.address.adminArea1   || '',
      postal_code:    s.address.postalCode   || '',
      country_code:   s.address.countryCode  || '',
    },
  }
  if (s.name && s.name.fullName) out.name = { full_name: s.name.fullName }
  if (s.phoneNumber && s.phoneNumber.countryCode && s.phoneNumber.nationalNumber) {
    out.phone_number = {
      country_code:    s.phoneNumber.countryCode,
      national_number: s.phoneNumber.nationalNumber,
    }
  }
  return out
}

function buildFastlaneOrderBody(amount, paymentToken, shippingAddress) {
  const value = parseFloat(amount).toFixed(2) // USD, 两位小数
  const pu = {
    amount: {
      currency_code: 'USD',
      value,
      breakdown: { item_total: { currency_code: 'USD', value } },
    },
    description: C.DEMO_DESCRIPTION,
    items: [{ ...C.DEMO_ITEM, unit_amount: { currency_code: 'USD', value } }],
  }
  const shipping = mapShipping(shippingAddress)
  if (shipping) pu.shipping = shipping
  return {
    intent: C.INTENT.CAPTURE,
    payment_source: { card: { single_use_token: paymentToken.id } },
    purchase_units: [pu],
  }
}

router.get('/fastlane-pui', async (req, res) => {
  try {
    const product = getProduct(PROVIDER, SDK, KEY)
    const clientId = process.env.PAYPAL_US_CLIENT_ID
    const sdkClientToken = await getUSClientToken({ intent: 'sdk_init' })
    res.render('paypal/jssdk-v5/fastlane-pui', {
      title: product?.displayName ?? 'Fastlane Payment UI',
      provider: PROVIDER, sdkVersion: SDK,
      currentProductKey: KEY, currentSdkVersion: SDK,
      sidebarProducts: getProviderProducts(PROVIDER),
      showSidebar: true,
      clientId,
      sdkClientToken,
      sdkUrl: `https://www.paypal.com/sdk/js?client-id=${clientId}&components=fastlane&buyer-country=US&currency=USD`,
      defaultAmount: req.query.amount || C.DEFAULT_AMOUNT,
      currency: 'USD',
    })
  } catch (err) {
    console.error('[fastlane-pui] render error:', err.message)
    res.status(500).send('Fastlane init failed: ' + err.message)
  }
})

router.post('/api/fastlane-pui/create-order', async (req, res) => {
  try {
    const { paymentToken, shippingAddress } = req.body
    const amount = req.body.amount || C.DEFAULT_AMOUNT
    if (!paymentToken || !paymentToken.id) {
      return res.status(400).json({ error: 'paymentToken.id required' })
    }
    const amountErr = C.validateAmount(amount, 'USD')
    if (amountErr) return res.status(400).json({ error: amountErr })

    const token = await getUSToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST',
      headers: getHeaders(token, { 'PayPal-Request-Id': Date.now().toString() }),
      body: JSON.stringify(buildFastlaneOrderBody(amount, paymentToken, shippingAddress)),
    })
    const order = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: order.message, details: order })
    res.json(order) // 完整 order；前端按 captures[0].status 判定
  } catch (err) {
    console.error('[fastlane-pui] create-order error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
```

- [x] **Step 2: 语法自检**

Run: `node --check apps/demo-hub/src/routes/paypal/jssdk-v5/fastlane-pui.js`
Expected: 无报错（Supabase env 不可用，改用 --check 只检语法）。

- [ ] **Step 3: Commit（用户执行）**

```bash
git add apps/demo-hub/src/routes/paypal/jssdk-v5/fastlane-pui.js
git commit -m "feat(demo-hub): add fastlane-pui route (Fastlane Quick Start create-order)"
```

---

## Task 3: EJS 视图 fastlane-pui.ejs

**Files:**
- Create: `src/views/paypal/jssdk-v5/fastlane-pui.ejs`

参考任一 v5 视图的 header/footer include 与 amount 控件（如 `acdc.ejs`），结构按前端设计 §3。

- [x] **Step 1: 创建视图文件**

> ⚠️ **实现与计划的重要差异（2026-06-08 更新）**：
> 1. 三步始终在 DOM 中可见（不再用 `display:none` wrapper 隐藏 Shipping）。
> 2. 视觉状态通过 CSS 三态控制：**locked**（无 class）/ **fl-active**（展开）/ **fl-visited**（完成 + 摘要）。
> 3. 页面使用完整 `sandbox-page` > `sandbox-header` > `sandbox-card` 结构。
> 4. 所有 Fastlane 专属样式写在 EJS 内的 `<style>` 块中（fl-step / fl-step__num / fl-input / fl-btn 等）。
> 5. 结果展示使用 `class="result-msg"` 配合 sandbox.css 现有 `.result-msg.success/.error` 样式。

```html
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar
}) %>

<!-- preload fastlane watermark asset -->
<link rel="preload"
  href="https://www.paypalobjects.com/fastlane-v1/assets/fastlane-with-tooltip_en_sm_light.0808.svg"
  as="image" type="image/avif" />

<div class="sandbox-card">
  <div class="amount-row">
    <label>Amount (USD)
      <input id="demo-amount" type="text" value="<%= defaultAmount %>" />
    </label>
  </div>

  <form id="fl-form">
    <!-- Customer -->
    <section id="customer" class="fl-section active visited">
      <div class="fl-header"><h3>Customer</h3>
        <button id="email-edit-button" type="button" class="fl-edit">Edit</button>
      </div>
      <div class="summary"></div>
      <fieldset class="email-input-with-watermark">
        <input id="email-input" name="email" type="email" placeholder="Email" autocomplete="email" />
        <div id="watermark-container"></div>
      </fieldset>
      <button id="email-submit-button" type="button" class="btn" disabled>Continue</button>
    </section>

    <hr />

    <!-- Shipping -->
    <section id="shipping" class="fl-section">
      <div class="fl-header"><h3>Shipping</h3>
        <button id="shipping-edit-button" type="button" class="fl-edit">Edit</button>
      </div>
      <div class="summary"></div>
      <fieldset>
        <label><input id="shipping-required-checkbox" name="shipping-required" type="checkbox" checked />
          This purchase requires shipping</label>
        <input name="given-name" placeholder="First name" autocomplete="given-name" />
        <input name="family-name" placeholder="Last name" autocomplete="family-name" />
        <input name="address-line1" placeholder="Street address" autocomplete="address-line1" />
        <input name="address-line2" placeholder="Apt., ste., bldg. (optional)" autocomplete="address-line2" />
        <input name="address-level2" placeholder="City" autocomplete="address-level2" />
        <input name="address-level1" placeholder="State" autocomplete="address-level1" />
        <input name="postal-code" placeholder="ZIP code" autocomplete="postal-code" />
        <input name="country" placeholder="Country (US)" autocomplete="country" value="US" />
        <input name="tel-country-code" placeholder="Country calling code" autocomplete="tel-country-code" value="1" />
        <input name="tel-national" type="tel" placeholder="Phone number" autocomplete="tel-national" />
      </fieldset>
      <button id="shipping-submit-button" type="button" class="btn">Continue</button>
    </section>

    <hr />

    <!-- Payment -->
    <section id="payment" class="fl-section">
      <div class="fl-header"><h3>Payment</h3>
        <button id="payment-edit-button" type="button" class="fl-edit">Edit</button>
      </div>
      <fieldset>
        <div id="payment-component"></div>
      </fieldset>
      <button id="checkout-button" type="button" class="btn">Checkout</button>
    </section>
  </form>

  <div id="demo-result" class="result"></div>
</div>

<script>
  window.DEMO = {
    urls: { createOrder: '/paypal/jssdk-v5/api/fastlane-pui/create-order' },
    amount: '<%= defaultAmount %>',
    currency: 'USD'
  };
</script>

<!-- Fastlane SDK with client token -->
<script
  src="<%= sdkUrl %>"
  data-sdk-client-token="<%= sdkClientToken %>"
  data-sdk-integration-source="developer-studio"></script>
<script src="/js/paypal/jssdk-v5/fastlane-pui.js"></script>

<%- include('../../partials/footer') %>
```

> 说明：`.fl-section` / `.fl-header` / `.fl-edit` 等 class 若 sandbox.css 未定义，按需在 Task 7 的 design-review 补最小样式；功能不依赖样式。`#demo-result` 的展示由 fastlane-pui.js 的 `showResult` 写入。

- [x] **Step 2: 确认 header/footer include 变量与现有视图一致**

Run: `sed -n '1,20p' apps/demo-hub/src/views/paypal/jssdk-v5/acdc.ejs`
Expected: 对照 `include('../../partials/header', {...})` 传参字段，与本视图一致（title/provider/sdkVersion/currentProductKey/currentSdkVersion/sidebarProducts/showSidebar）。如有差异以现有视图为准修正。

- [ ] **Step 3: Commit（用户执行）**

```bash
git add apps/demo-hub/src/views/paypal/jssdk-v5/fastlane-pui.ejs
git commit -m "feat(demo-hub): add fastlane-pui EJS view (3-section checkout, fl-* CSS system)"
```

---

## Task 4: 前端 JS fastlane-pui.js

**Files:**
- Create: `src/public/js/paypal/jssdk-v5/fastlane-pui.js`

按前端设计 §4 实现。IIFE，`'use strict'`，从 `window.DEMO` 读配置。**逐个 console.log Fastlane 返回对象**（inspect/probe）。

- [x] **Step 1: 创建前端 JS 文件**

> ⚠️ **实现与计划的重要差异（2026-06-08 更新）**：
> 1. **三步始终可见，CSS 三态**：`setActive(section)` 管理 `fl-active`，`markVisited(section)` 管理 `fl-visited`；两个函数独立，不再合并为 `setActiveSection`。
> 2. **Member 路径**：认证成功后调 `setShippingSummary(shippingAddress)` + `markVisited(stepShipping)` 显示地址摘要，然后 `setActive(stepPayment)`；Shipping 不隐藏。
> 3. **Guest 路径**：`setActive(stepShipping)` 展开地址表单；无需 show/hide 操作。
> 4. **重置逻辑**：email 重新提交时先 `stepShipping/Payment.classList.remove('fl-visited','fl-active')`。
> 5. **Continue 按钮动态启用**：email input 的 `input` 事件控制 `emailSubmitBtn.disabled`，Fastlane ready 后才绑定。
> 6. **`showResult`**：使用 `'result-msg'` 类（`el.className = 'result-msg ' + type`），对接 sandbox.css 已有样式。
> 7. **Shipping checkbox**：`#shipping-required-checkbox` change 事件控制 `#shipping-address-fields` 显隐；取消勾选时直接 Continue（跳过字段校验）；勾选时必须填完必填字段。
> 8. **Member shipping edit**：`showShippingAddressSelector` 选完新地址后须调 `setShippingSummary(shippingAddress)` 刷新摘要（原计划遗漏）。
> 9. **Checkout 成功**：提示格式 `✓ COMPLETED · Capture ID: <id>`；`succeeded` 标志使 Checkout 按钮成功后永久 disabled（防重复扣款）。
> 10. **成功后全部锁定**：`succeeded = true` 后遍历 `['email-edit-button','shipping-edit-button','payment-edit-button']` 全部 `setAttribute('disabled','')`；整个表单进入只读态，刷新页面才能重试。

```js
(function () {
  'use strict';
  var CFG = window.DEMO || {};

  // ---- result helper ----
  function showResult(msg, type) {
    var el = document.getElementById('demo-result');
    if (!el) { console.log(msg); return; }
    el.textContent = msg;
    el.className = 'result ' + (type || '');
  }

  // ---- state ----
  var identity, profile, FastlanePaymentComponent, FastlaneWatermarkComponent;
  var paymentComponent;
  var memberAuthenticatedSuccessfully, email, shippingAddress, paymentToken;

  var form = document.getElementById('fl-form');
  var customerSection = document.getElementById('customer');
  var shippingSection = document.getElementById('shipping');
  var paymentSection  = document.getElementById('payment');
  var emailSubmitButton = document.getElementById('email-submit-button');
  var checkoutButton    = document.getElementById('checkout-button');
  var activeSection = customerSection;

  function setActiveSection(section) {
    activeSection.classList.remove('active');
    section.classList.add('active', 'visited');
    activeSection = section;
  }

  function getAddressSummary(a) {
    a = a || {};
    var addr = a.address || {}, name = a.name || {}, ph = a.phoneNumber || {};
    var ne = function (f) { return !!f; };
    var lines = [
      name.fullName || [name.firstName, name.lastName].filter(ne).join(' '),
      [addr.addressLine1, addr.addressLine2].filter(ne).join(', '),
      [addr.adminArea2, [addr.adminArea1, addr.postalCode].filter(ne).join(' '), addr.countryCode].filter(ne).join(', '),
      [ph.countryCode, ph.nationalNumber].filter(ne).join('')
    ];
    return lines.filter(ne).join('\n');
  }
  function setShippingSummary(a) {
    shippingSection.querySelector('.summary').innerText = getAddressSummary(a);
  }
  function validateFields(f, names) {
    var ok = true, firstBad = null;
    (names || []).forEach(function (n) {
      var el = f.elements[n];
      if (el && !el.checkValidity()) { ok = false; if (!firstBad) firstBad = el; el.classList.add('input-invalid'); }
      else if (el) el.classList.remove('input-invalid');
    });
    if (firstBad) firstBad.reportValidity();
    return ok;
  }

  async function initFastlaneComponents() {
    if (!window.paypal || !window.paypal.Fastlane) {
      throw new Error('PayPal script loaded but no Fastlane module');
    }
    var fl = await window.paypal.Fastlane({
      metadata: { geoLocOverride: 'US' },
      styles: { root: { backgroundColor: '#faf8f5' } }
    });
    console.log('[fastlane] components:', fl);
    identity = fl.identity;
    profile = fl.profile;
    FastlanePaymentComponent = fl.FastlanePaymentComponent;
    FastlaneWatermarkComponent = fl.FastlaneWatermarkComponent;
  }

  async function renderWatermark() {
    (await FastlaneWatermarkComponent({ includeAdditionalInfo: true })).render('#watermark-container');
  }

  async function onEmailSubmit() {
    if (!validateFields(form, ['email'])) return;
    emailSubmitButton.setAttribute('disabled', '');
    try {
      email = form.elements['email'].value;
      // reset
      memberAuthenticatedSuccessfully = undefined;
      shippingAddress = undefined;
      paymentToken = undefined;
      shippingSection.classList.remove('visited');
      setShippingSummary({});
      paymentSection.classList.remove('visited', 'pinned');

      var customerContext = await identity.lookupCustomerByEmail(email);
      console.log('[fastlane] lookupCustomerByEmail:', customerContext);
      var ctxId = customerContext && customerContext.customerContextId;

      if (ctxId) {
        var authResponse = await identity.triggerAuthenticationFlow(ctxId);
        console.log('[fastlane] authResponse:', authResponse);
        if (authResponse && authResponse.authenticationState === 'succeeded') {
          memberAuthenticatedSuccessfully = true;
          shippingAddress = authResponse.profileData && authResponse.profileData.shippingAddress;
          paymentToken = authResponse.profileData && authResponse.profileData.card;
        }
      } else {
        console.log('[fastlane] no customerContextId (guest)');
      }

      customerSection.querySelector('.summary').innerText = email;
      if (shippingAddress) setShippingSummary(shippingAddress);

      if (memberAuthenticatedSuccessfully) {
        shippingSection.classList.add('visited');
        paymentSection.classList.add('pinned');
        paymentComponent = await FastlanePaymentComponent();
        console.log('[fastlane] paymentComponent(member):', paymentComponent);
        paymentComponent.render('#payment-component');
        setActiveSection(paymentSection);
      } else {
        setActiveSection(shippingSection);
      }
    } catch (e) {
      console.error(e);
      showResult('✗ ' + e.message, 'error');
    } finally {
      emailSubmitButton.removeAttribute('disabled');
    }
  }

  async function onShippingSubmit() {
    var required = form.elements['shipping-required'].checked;
    if (!required) {
      shippingAddress = undefined;
      setShippingSummary({});
      if (!paymentComponent) {
        paymentComponent = await FastlanePaymentComponent();
        console.log('[fastlane] paymentComponent(no-ship):', paymentComponent);
        paymentComponent.render('#payment-component');
      }
      setActiveSection(paymentSection);
      return;
    }
    if (!validateFields(form, ['given-name','family-name','address-line1','address-level2','address-level1','postal-code','country','tel-country-code','tel-national'])) return;

    var firstName = form.elements['given-name'].value;
    var lastName  = form.elements['family-name'].value;
    var telNational = form.elements['tel-national'].value;
    var postalCode  = form.elements['postal-code'].value;
    shippingAddress = {
      address: {
        addressLine1: form.elements['address-line1'].value,
        addressLine2: form.elements['address-line2'].value,
        adminArea2:   form.elements['address-level2'].value,
        adminArea1:   form.elements['address-level1'].value,
        postalCode:   postalCode,
        countryCode:  form.elements['country'].value,
      },
      name: { firstName: firstName, lastName: lastName, fullName: [firstName, lastName].filter(Boolean).join(' ') },
      phoneNumber: { countryCode: form.elements['tel-country-code'].value, nationalNumber: telNational },
    };
    setShippingSummary(shippingAddress);

    if (!paymentComponent) {
      paymentComponent = await FastlanePaymentComponent({
        fields: {
          phoneNumber:    { prefill: telNational },
          postalCode:     { prefill: postalCode },
          cardholderName: { prefill: shippingAddress.name.fullName },
        }
      });
      console.log('[fastlane] paymentComponent(guest):', paymentComponent);
      paymentComponent.render('#payment-component');
    } else {
      paymentComponent.updatePrefills({ phoneNumber: telNational });
    }
    paymentComponent.setShippingAddress(shippingAddress);
    setActiveSection(paymentSection);
  }

  async function onShippingEdit() {
    if (memberAuthenticatedSuccessfully) {
      var sel = await profile.showShippingAddressSelector();
      console.log('[fastlane] showShippingAddressSelector:', sel);
      if (sel && sel.selectionChanged) {
        shippingAddress = sel.selectedAddress;
        setShippingSummary(shippingAddress);
        paymentComponent.setShippingAddress(shippingAddress);
      }
    } else {
      setActiveSection(shippingSection);
    }
  }

  async function onCheckout() {
    checkoutButton.setAttribute('disabled', '');
    try {
      paymentToken = await paymentComponent.getPaymentToken();
      console.log('[fastlane] paymentToken:', paymentToken);

      var required = form.elements['shipping-required'].checked;
      var body = { paymentToken: paymentToken, amount: document.getElementById('demo-amount').value };
      if (required && shippingAddress) body.shippingAddress = shippingAddress;

      var resp = await fetch(CFG.urls.createOrder, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      var order = await resp.json();
      console.log('[fastlane] create-order response:', order);

      var capture = order && order.purchase_units && order.purchase_units[0] &&
        order.purchase_units[0].payments && order.purchase_units[0].payments.captures &&
        order.purchase_units[0].payments.captures[0];
      if (!capture || capture.status !== 'COMPLETED') {
        showResult('✗ Capture failed · status: ' + (capture ? capture.status : (order.error || 'unknown')), 'error');
        return;
      }
      showResult('✓ ' + capture.status + ' · ' + capture.id, 'success');
    } catch (e) {
      console.error(e);
      showResult('✗ ' + e.message, 'error');
    } finally {
      checkoutButton.removeAttribute('disabled');
    }
  }

  async function load() {
    try {
      await initFastlaneComponents();
      await renderWatermark();
      emailSubmitButton.addEventListener('click', onEmailSubmit);
      emailSubmitButton.removeAttribute('disabled');
      document.getElementById('email-edit-button').addEventListener('click', function () { setActiveSection(customerSection); });
      document.getElementById('shipping-submit-button').addEventListener('click', onShippingSubmit);
      document.getElementById('shipping-edit-button').addEventListener('click', onShippingEdit);
      document.getElementById('payment-edit-button').addEventListener('click', function () { setActiveSection(paymentSection); });
      checkoutButton.addEventListener('click', onCheckout);
    } catch (e) {
      console.error(e);
      showResult('✗ ' + e.message, 'error');
    }
  }

  load();
})();
```

- [ ] **Step 2: Commit（用户执行）**

```bash
git add apps/demo-hub/src/public/js/paypal/jssdk-v5/fastlane-pui.js
git commit -m "feat(demo-hub): add fastlane-pui frontend (fl-* 3-state, member/guest paths)"
```

---

## Task 5: 挂载路由

**Files:**
- Modify: `src/app.js`

- [x] **Step 1: 在 v5 区块追加挂载**

在现有 `app.use(v5, require("./routes/paypal/jssdk-v5/plm-js"));` 之后加：

```js
app.use(v5, require("./routes/paypal/jssdk-v5/fastlane-pui"));
```

- [x] **Step 2: 启动验证**

Run: `cd apps/demo-hub && npm run dev`（或根目录 `npm run dev:demo-hub`）
Expected: 启动无报错；终端无 require 异常。

- [ ] **Step 3: Commit（用户执行）**

```bash
git add apps/demo-hub/src/app.js
git commit -m "feat(demo-hub): mount fastlane-pui route"
```

---

## Task 6: Supabase 产品配置（用户手动）

**Files:**
- Data: Supabase `demohub.products`

- [ ] **Step 1: 执行 INSERT（自动取下一个 sort_order）**（⏳ 待用户在 Supabase SQL Editor 手动执行）

在 Supabase SQL Editor 执行：

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
SELECT
  'paypal', 'jssdk-v5', 'fastlane-pui', 'Fastlane Payment UI',
  'Fastlane Quick Start — guest/member checkout via prebuilt Payment UI component (single_use_token)',
  true,
  COALESCE(MAX(sort_order), 0) + 1
FROM demohub.products
WHERE provider = 'paypal' AND sdk_version = 'jssdk-v5';
```

> 需重跑先删除：`DELETE FROM demohub.products WHERE provider='paypal' AND sdk_version='jssdk-v5' AND product_key='fastlane-pui';`

- [ ] **Step 2: 重启 demo-hub 并确认首页卡片**

重启后访问 `http://localhost:3000/`，确认出现 "Fastlane Payment UI" 卡片，点击进入 `/paypal/jssdk-v5/fastlane-pui`。

---

## Task 7: 端到端验证 + 自动扣款确认（QA）

**Files:**
- Modify: `docs/test-cases.md`、`docs/debug-log.md`（如有问题）

- [ ] **Step 1: 页面与初始化**

访问 `/paypal/jssdk-v5/fastlane-pui`：
- [ ] 三段式表单渲染正常
- [ ] email 旁出现 Fastlane watermark
- [ ] 控制台打印 `[fastlane] components:` 对象（identity/profile/FastlanePaymentComponent/FastlaneWatermarkComponent 均存在）
- [ ] 无 "no Fastlane module" 报错

- [ ] **Step 2: 访客路径**

用全新 email（非已有 Fastlane 账号）→ Continue → 填收货地址 → Continue → Fastlane 支付组件渲染卡输入 → 用测试卡 `4005 5192 0000 0004`、有效手机号、opt-in 打开 → Checkout：
- [ ] 控制台打印 `[fastlane] paymentToken:`，确认 `paymentToken.id` 存在
- [ ] 控制台打印 `[fastlane] create-order response:`
- [ ] **确认 captures 路径**：`purchase_units[0].payments.captures[0].status === 'COMPLETED'`
- [ ] 结果区显示 `✓ COMPLETED · <captureId>`

- [ ] **Step 3: 自动扣款不确定性确认（关键）**

观察 Step 2 的 create-order response：
- 若已含 `captures[0].status === 'COMPLETED'` → ✅ 无需 capture 步骤，设计成立。
- 若返回 `status: 'CREATED'`/`'APPROVED'` 且无 captures → ❌ 需回退方案：
  - 在 `fastlane-pui.js` 路由新增 `POST /api/fastlane-pui/capture-order`（`/v2/checkout/orders/:id/capture`，复用 acdc.js capture 写法）。
  - 前端 `onCheckout` 改为：create-order 拿 `order.id` → 再 fetch capture-order → 用 capture 响应判定。
  - 记录到 `docs/debug-log.md`。

- [ ] **Step 4: 会员路径**

用 Step 2 完成后创建的 Fastlane email（记下该 email）重新走流程 → Continue → 弹 OTP 输 `111111`：
- [ ] 控制台打印 `[fastlane] authResponse:`，`authenticationState === 'succeeded'`
- [ ] 自动带出卡 + 地址，跳过收货直接到 Payment
- [ ] Checkout 成功 `✓ COMPLETED`
- [ ] （可选）点 Shipping Edit → `showShippingAddressSelector` 弹窗，换地址生效

- [ ] **Step 5: 失败/边界**

- [ ] OTP 输非 `111111` → 认证失败 → 回落访客流程（显示收货表单）
- [ ] 取消勾选 "requires shipping" → 不发 shippingAddress，仍能下单
- [ ] `curl` 直接打 API 校验：

```bash
curl -s -X POST http://localhost:3000/paypal/jssdk-v5/api/fastlane-pui/create-order \
  -H 'Content-Type: application/json' \
  -d '{"amount":"100.00"}' | head -c 300
```
Expected: 返回 400 `{"error":"paymentToken.id required"}`（缺 token 时的校验）。

- [ ] **Step 6: 记录测试结果**

把上述用例与结果写入 `docs/test-cases.md`。

---

## Task 8: 文档与 CLAUDE.md 更新

**Files:**
- Modify: `src/routes/paypal/jssdk-v5/CLAUDE.md`
- Modify: `docs/progress.md`
- Modify: `docs/todos.md`（见下方 todos 区块，应已含 deferred 项）

- [x] **Step 1: 更新 v5 CLAUDE.md 的 SDK params 表**

在「各产品 SDK Params 速查」表加一行：

```
| fastlane-pui | `components=fastlane&buyer-country=US&currency=USD` + `data-sdk-client-token`（intent=sdk_init） |
```

- [x] **Step 2: 更新 v5 CLAUDE.md 的自定义路由备注**

在「各自定义路由关键实现备注」加：

```
// fastlane-pui.js — Fastlane Quick Start（Payment UI 组件）；US 账户；client token 用 getUSClientToken({intent:'sdk_init'})，orders 用 getUSToken()；create-order body：payment_source.card.single_use_token + purchase_units（USD 锁定）；shipping camelCase→snake_case 映射；前端三段式 email→OTP 认证→收货→FastlanePaymentComponent→getPaymentToken；成功判定 captures[0].status==='COMPLETED'；自动扣款（无独立 capture），若沙盒返回 CREATED 再加 capture-order
```

- [x] **Step 3: 更新 progress.md**

追加一条本次工作记录（日期 2026-06-08，fastlane-pui 完成情况）。

- [ ] **Step 4: Commit（用户执行）**

```bash
git add apps/demo-hub/src/routes/paypal/jssdk-v5/CLAUDE.md apps/demo-hub/docs/
git commit -m "docs(demo-hub): record fastlane-pui in v5 CLAUDE.md + progress"
```

---

## Deferred Todos（写入 docs/todos.md）

- [ ] **fastlane-pui-multifunding**：Fastlane + PayPal/Venmo/PayLater 多 funding（Buttons 组件并存，参考用户提供的 demo code；SDK 加 `buttons&enable-funding=venmo,paylater`；radio 切换 Fastlane 卡 / PayPal / Venmo / PayLater；PayPal/Venmo 走 create+capture 两步）。
- [ ] **fastlane-flex**（可选未来产品）：Flexible 集成，单独使用 `FastlaneCardComponent` + watermark 自建表单。

---

## Self-Review

**1. Spec coverage（对照需求/设计）：**
- client token intent=sdk_init → Task 1 ✅
- 路由 GET + create-order（single_use_token）→ Task 2 ✅
- 三段式视图 + data-sdk-client-token → Task 3 ✅
- 前端 guest/member 流程 + inspect/probe → Task 4 ✅
- 挂载 → Task 5 ✅
- Supabase 配置 → Task 6 ✅
- guest/member/OTP/边界验证 + 自动扣款确认 + 成功判定（规则 13）→ Task 7 ✅
- 文档 → Task 8 ✅
- 多 funding / flex 延后 → Deferred Todos ✅

**2. Placeholder scan：** 无 TBD/TODO（除 Supabase 自动取 sort_order，已用 SQL 实现）。每个代码步骤含完整代码。

**3. Type/命名一致性：** `mapShipping` / `buildFastlaneOrderBody` / `getUSClientToken({intent})` / `getUSToken` / `showResult` / `setActiveSection` 在前后端命名一致；前端 shippingAddress 结构（camelCase）与后端 `mapShipping` 入参一致；create-order 返回完整 order，前端读 `purchase_units[0].payments.captures[0]` 一致。
