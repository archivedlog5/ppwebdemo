# 实现计划 — JSSDK v6 Vault PayPal with Purchase v1

> 日期：2026-06-05 · 关联：req / design-fe / design-be（同日 `*-jssdk-v6-vault-paypal-with-purchase.md`）
>
> ⚠️ 当前 Opus 模型下只能产出本计划（markdown）。实际写代码需切换到 Sonnet 等非 Opus 模型。
>
> 📌 本仓库 demo 无单元测试框架，验证靠"手动测试矩阵 + curl"。Git 由用户自行管理（项目规则：不执行任何 git 操作），故本计划不含 commit 步骤。

## 目标（Definition of Done）

`/paypal/jssdk-v6/vault-paypal-with-purchase` 上线，UI 与 v5 一致（v5 UI only），create-order body 与 v5 一致，认证走 clientId，vault token 从 capture 响应提取并展示，满足 req 文档第 4 节全部完成标准。

## 架构概述

移植 v5 同名 demo 到 v6：后端写**自定义路由**（照 v5，capture 提取 vault token/customer id 回传），前端用 v6 `createInstance({ clientId })` + `createPayPalOneTimePaymentSession({ savePayment:true })`，资格走 `findEligibleMethods({ paymentFlow:'VAULT_WITH_PAYMENT' })`。仅 PayPal 按钮，无 presentation-mode 下拉/custom-trigger。

## 改动文件清单（预期）

| # | 文件 | 动作 | 来源/参考 |
|---|------|------|-----------|
| 1 | `src/routes/paypal/jssdk-v6/vault-paypal-with-purchase.js` | 新建 | 移植 v5 `routes/.../vault-paypal-with-purchase.js` + v6 适配 |
| 2 | `src/views/paypal/jssdk-v6/vault-paypal-with-purchase.ejs` | 新建 | 移植 v5 `views/.../vault-paypal-with-purchase.ejs` + v6 适配 |
| 3 | `src/public/js/paypal/jssdk-v6/vault-paypal-with-purchase.js` | 新建 | 基于 `paypal-ecm.js` 模板，裁掉 presentation-mode/custom-trigger，加 vault flow |
| 4 | `src/app.js` | 改：加一行挂载 | — |
| 5 | `src/routes/paypal/jssdk-v6/CLAUDE.md` | 改：components 表加行 + vault 专属规则段 | — |
| 6 | Supabase `demohub.products` | 插一行（用户执行 SQL） | design-be 第 7 节 |
| 7 | `docs/test-cases.md` | 追加本 demo 测试矩阵 | 本计划测试矩阵 |

---

## Task 1 — 后端路由 `vault-paypal-with-purchase.js`

**Files:**
- Create: `src/routes/paypal/jssdk-v6/vault-paypal-with-purchase.js`
- 参考: `src/routes/paypal/jssdk-v5/vault-paypal-with-purchase.js`

- [ ] **Step 1：复制 v5 路由骨架**
  - 复制 v5 文件全文为起点。删除 v5 的 `fetchIdToken()`（v6 不需要 id_token）。
  - 顶部常量：`PROVIDER='paypal'`、`SDK_VERSION='jssdk-v6'`、`PRODUCT_KEY='vault-paypal-with-purchase'`。
  - 引入与 v5 相同的 constants：`validateAmount, isZeroDecimal, DEFAULT_AMOUNT, DEFAULT_CURRENCY, SUPPORTED_CURRENCIES, INTENT, DEMO_DESCRIPTION, DEMO_ITEM, SANDBOX_SHIPPING`。

- [ ] **Step 2：改写 GET handler（v6 适配）**

```js
router.get(`/${PRODUCT_KEY}`, (req, res) => {
  const product  = getProduct(PROVIDER, SDK_VERSION, PRODUCT_KEY)
  const currency = resolveCurrency(req.query.currency)
  const amount   = req.query.amount || DEFAULT_AMOUNT
  res.render(`paypal/jssdk-v6/${PRODUCT_KEY}`, {
    title: product?.displayName ?? 'Vault PayPal with Purchase',
    provider: PROVIDER, sdkVersion: SDK_VERSION,
    currentProductKey: PRODUCT_KEY, currentSdkVersion: SDK_VERSION,
    sidebarProducts: getProviderProducts(PROVIDER),
    showSidebar: true,
    clientId: process.env.PAYPAL_CN_CLIENT_ID,   // v6 新增
    supportedCurrencies: SUPPORTED_CURRENCIES,    // v6 货币下拉
    defaultAmount: amount,
    currency,
  })
  // 注意：不传 sdkUrl、不传 sdkUserIdToken
})
```

- [ ] **Step 3：create-order（body 与 v5 逐字一致，仅 url+返回 key 改）**

```js
router.post(`/api/${PRODUCT_KEY}/create-order`, async (req, res) => {
  try {
    const amount = req.body.amount || DEFAULT_AMOUNT
    const currency = resolveCurrency(req.body.currency)
    const amountErr = validateAmount(amount, currency)
    if (amountErr) return res.status(400).json({ error: amountErr })

    const zd = isZeroDecimal(currency)
    const val = zd ? String(Math.round(parseFloat(amount))) : parseFloat(amount).toFixed(2)
    const baseUrl = `${req.protocol}://${req.get('host')}`

    const body = {
      intent: INTENT.CAPTURE,
      payment_source: {
        paypal: {
          attributes: {
            vault: {
              store_in_vault: 'ON_SUCCESS',
              usage_type: 'MERCHANT',
              customer_type: 'CONSUMER',
              permit_multiple_payment_tokens: false,
              description: 'After Purchase Your Payment Method Will Be Saved to Cross Wen China Store',
            },
            customer: { merchant_customer_id: 'MERCHANT_CUST_001' },
          },
          experience_context: {
            brand_name: 'Cross Wen China Store',
            shipping_preference: 'SET_PROVIDED_ADDRESS',
            return_url: `${baseUrl}/paypal/jssdk-v6/${PRODUCT_KEY}`,   // v6 路径
            cancel_url: `${baseUrl}/paypal/jssdk-v6/${PRODUCT_KEY}`,   // v6 路径
          },
        },
      },
      purchase_units: [
        {
          amount: {
            currency_code: currency, value: val,
            breakdown: { item_total: { currency_code: currency, value: val } },
          },
          description: DEMO_DESCRIPTION,
          items: [{ ...DEMO_ITEM, unit_amount: { currency_code: currency, value: val } }],
          shipping: SANDBOX_SHIPPING,
        },
      ],
    }

    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders`, {
      method: 'POST', headers: getHeaders(token), body: JSON.stringify(body),
    })
    const order = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: order.message || 'Create order failed', details: order })
    res.json({ orderId: order.id })   // v6: 小写 d
  } catch (err) {
    console.error(`[${PRODUCT_KEY}] create-order error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 4：capture-order（提取 vault，参数小写 d）**

```js
router.post(`/api/${PRODUCT_KEY}/capture-order`, async (req, res) => {
  try {
    const { orderId } = req.body
    if (!orderId) return res.status(400).json({ error: 'orderId required' })
    const token = await getCNToken()
    const r = await fetch(`${API}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST', headers: getHeaders(token),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message || 'Capture failed', details: data })

    const vaultInfo = data?.payment_source?.paypal?.attributes?.vault
    const vaultId = vaultInfo?.id || null
    const customerId = vaultInfo?.customer?.id || null
    res.json({ ...data, vaultId, customerId })
  } catch (err) {
    console.error(`[${PRODUCT_KEY}] capture-order error:`, err.message)
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 5：验收（路由未挂载前先静态检查）**
  - 文件 `require()` 不报错（语法正确）；`module.exports = router`。
  - 实挂载后用 curl 验证（见 Task 4 后）。

---

## Task 2 — 视图 `vault-paypal-with-purchase.ejs`

**Files:**
- Create: `src/views/paypal/jssdk-v6/vault-paypal-with-purchase.ejs`
- 参考: `src/views/paypal/jssdk-v5/vault-paypal-with-purchase.ejs`

- [ ] **Step 1：复制 v5 视图为起点**，header include 去掉 `sdkUrl` 和 `sdkUserIdToken`：

```ejs
<%- include('../../partials/header', {
  title, provider, sdkVersion, currentProductKey, currentSdkVersion,
  sidebarProducts, showSidebar,
}) %>
```

- [ ] **Step 2：badge 文案改 v6**：`PayPal · JSSDK v6 · Vault`。

- [ ] **Step 3：货币下拉改用注入列表**（替换 v5 硬编码数组）：

```ejs
<% supportedCurrencies.forEach(function(c) { %>
  <option value="<%= c %>" <%= c === currency ? 'selected' : '' %>><%= c %></option>
<% }) %>
```

- [ ] **Step 4：保留 v5 的 Vault Behavior 框、`#paypal-button-container`（带 spinner）、`#result`、`#vault-result`（含 `#vault-id` / `#customer-id`，默认 `display:none`）**——结构原样不动。

- [ ] **Step 5：底部 `window.DEMO` + 三段式脚本（替换 v5 的 DEMO/script 块）**：

```ejs
<script>
  window.DEMO = {
    clientId:   '<%= clientId %>',
    components: ['paypal-payments'],
    pageType:   'checkout',
    urls: {
      createOrder:  '/paypal/jssdk-v6/api/vault-paypal-with-purchase/create-order',
      captureOrder: '/paypal/jssdk-v6/api/vault-paypal-with-purchase/capture-order',
    },
    defaultAmount: '<%= defaultAmount || "100.00" %>',
  }
</script>
<script src="/js/paypal/jssdk-v6/init.js"></script>
<script src="/js/paypal/jssdk-v6/vault-paypal-with-purchase.js"></script>
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>

<%- include('../../partials/footer', { showSidebar }) %>
```

- [ ] **Step 6：验收**：页面渲染后控件齐全，无 presentation-mode 下拉、无 custom-trigger 按钮。

---

## Task 3 — 前端 `public/js/paypal/jssdk-v6/vault-paypal-with-purchase.js`

**Files:**
- Create: `src/public/js/paypal/jssdk-v6/vault-paypal-with-purchase.js`
- 参考: `src/public/js/paypal/jssdk-v6/paypal-ecm.js`

- [ ] **Step 1：IIFE 骨架 + 辅助函数（搬 paypal-ecm，去掉 presentation-mode 相关）**
  - 保留：`getCurrency()`、`getAmount()`、`validateAmount()`、`clearLoading()`、`showResult(text, type)`。
  - 删除：`getPresentationMode()`、`PRESENTATION_MODE_DESCRIPTIONS`、`updatePresentationModeDesc()`、`getPresentationModesToTry()`（无 UI 选择器）。
  - DOMContentLoaded 里只保留货币切换 reload（删掉 presentation-mode 监听）。

- [ ] **Step 2：paymentSessionOptions（含 savePayment + vault 展示）**

```js
var paymentSessionOptions = {
  onApprove: function (data) {            // data.orderId 小写 d
    return captureAndShowVault(data.orderId)
  },
  onCancel: function () { showResult('Payment cancelled.', 'error') },
  onError:  function (err) { showResult('✗ ' + (err.message || String(err)), 'error') },
  savePayment: true,                       // vault 专属
}
```

- [ ] **Step 3：capture + vault 结果（核心）**

```js
function captureAndShowVault(orderId) {
  var urls = window.DEMO.urls
  return fetch(urls.captureOrder, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: orderId }),
  })
    .then(function (r) { return r.json() })
    .then(function (order) {
      if (order.error) { showResult('✗ ' + order.error, 'error'); return }
      var capture = order.purchase_units && order.purchase_units[0] &&
                    order.purchase_units[0].payments &&
                    order.purchase_units[0].payments.captures &&
                    order.purchase_units[0].payments.captures[0]
      if (!capture || capture.status !== 'COMPLETED') {
        showResult('✗ Capture failed · status: ' + (capture ? capture.status : 'unknown'), 'error')
        return
      }
      showResult('✓ Payment captured · Order: ' + order.id, 'success')

      var vault = (order.payment_source && order.payment_source.paypal &&
                   order.payment_source.paypal.attributes &&
                   order.payment_source.paypal.attributes.vault) || {}
      var vaultId = order.vaultId || vault.id || null
      var customerId = order.customerId || (vault.customer && vault.customer.id) || null
      showVaultResult(vaultId, customerId)
    })
}

function showVaultResult(vaultId, customerId) {
  var box = document.getElementById('vault-result')
  if (!box) return
  document.getElementById('vault-id').textContent = vaultId || '—'
  document.getElementById('customer-id').textContent = customerId || '—'
  box.style.display = 'block'
}
```

- [ ] **Step 4：按钮配置 + start fallback（无 UI 选择器）**

```js
var FALLBACK_MODES = ['auto', 'popup', 'redirect', 'modal']

function configurePayPalButton(instance) {
  var session = instance.createPayPalOneTimePaymentSession(paymentSessionOptions)
  if (session.hasReturned()) { session.resume(); return }

  var container = clearLoading()
  var btn = document.createElement('paypal-button')
  btn.setAttribute('type', 'pay')
  btn.setAttribute('class', 'paypal-gold')
  container.appendChild(btn)

  btn.addEventListener('click', function () { handleClick(session) })
}

function handleClick(session) {
  if (!validateAmount()) return
  var urls = window.DEMO.urls
  // V6-2：不 await，保留 transient activation
  var orderPromise = fetch(urls.createOrder, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: getAmount(), currency: getCurrency() }),
  })
    .then(function (r) { return r.json() })
    .then(function (d) { if (d.error) throw new Error(d.error); return { orderId: d.orderId } })

  startWithFallback(session, orderPromise)
}

async function startWithFallback(session, orderPromise) {
  for (var i = 0; i < FALLBACK_MODES.length; i++) {
    try {
      await session.start({ presentationMode: FALLBACK_MODES[i] }, orderPromise)
      return
    } catch (error) {
      if (error && error.isRecoverable) continue
      showResult('✗ ' + (error.message || String(error)), 'error')
      return
    }
  }
}
```

- [ ] **Step 5：SDK init + eligibility（vault flow）**

```js
function onPayPalWebSdkLoaded() {
  getPPInstance()
    .then(function (instance) {
      return instance.findEligibleMethods({
        currencyCode: getCurrency(),
        paymentFlow: 'VAULT_WITH_PAYMENT',
      }).then(function (eligibility) {
        if (eligibility.isEligible('paypal')) {
          configurePayPalButton(instance)
        } else {
          showResult('PayPal not eligible in this region', 'error')
        }
      })
    })
    .catch(function (err) { showResult('✗ ' + (err.message || String(err)), 'error') })
}
```

- [ ] **Step 6：window.load 守卫（搬 paypal-ecm）**：`typeof paypal === 'undefined'` 与 `isBrowserSupportedByPayPal()` 检查，通过后调 `onPayPalWebSdkLoaded()`。

- [ ] **Step 7：临时探查日志（memory：v6 新集成先 inspect）**
  - 在 `captureAndShowVault` 拿到 `order` 后 `console.dir(order)`，确认 `payment_source.paypal.attributes.vault.{id, customer.id}` 真实结构；
  - 在 `findEligibleMethods().then` 内打印 eligibility，确认含 `paypal`。
  - 确认结构与 v5 一致后**删除探查日志**（结论记入 `docs/debug-log.md`）。

---

## Task 4 — 挂载 + CLAUDE.md

**Files:**
- Modify: `src/app.js`
- Modify: `src/routes/paypal/jssdk-v6/CLAUDE.md`

- [ ] **Step 1：app.js 加挂载行**（v6 块内，放在现有 paypal 系列之后）：

```js
app.use(v6, require('./routes/paypal/jssdk-v6/vault-paypal-with-purchase'))
```

- [ ] **Step 2：CLAUDE.md components 表新增一行**：`vault-paypal-with-purchase` → `['paypal-payments']`，状态 ✅。

- [ ] **Step 3：CLAUDE.md 新增 "Vault PayPal with Purchase 专属规则" 段**，至少记录：
  - 认证 = clientId（vault 标准路径，非 clientToken）；
  - eligibility 用 `findEligibleMethods({ paymentFlow:'VAULT_WITH_PAYMENT' })`，key = `paypal`；
  - session 加 `savePayment: true`（因 order 带 `store_in_vault`）；
  - vault token 来源 = capture 响应 `payment_source.paypal.attributes.vault.{id, customer.id}`（后端已提取为顶层 `vaultId`/`customerId`）；
  - create-order body 与 v5 逐字一致（含 vault 属性 inline）。

- [ ] **Step 4：curl 验收**（demo-hub 已启动）：

```bash
# create
curl -s -X POST http://localhost:3000/paypal/jssdk-v6/api/vault-paypal-with-purchase/create-order \
  -H 'Content-Type: application/json' -d '{"amount":"100.00","currency":"USD"}'
# 期望：{"orderId":"..."}
```
  - capture 需经真实 approve，无法纯 curl 完成 → 留待浏览器手测（测试矩阵 T1/T2）。

---

## Task 5 — Supabase + 重启

- [ ] **Step 1：用户在 Supabase SQL Editor 执行 INSERT**（design-be 第 7 节）：

```sql
INSERT INTO demohub.products
  (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES
  ('paypal', 'jssdk-v6', 'vault-paypal-with-purchase', 'Vault PayPal with Purchase',
   'Vault the PayPal account during a one-time purchase (v6)', true, <下一个可用 sort_order>);
```
  - `sort_order` = v6 分组内当前最大值 +1。

- [ ] **Step 2：重启 demo-hub**（nodemon 自动重启或手动 rs），确认首页出现新卡片。

---

## 测试矩阵（写入 `docs/test-cases.md`）

| 用例 | 操作 | 期望 |
|------|------|------|
| T1 正常付款入会 | PayPal 按钮 → sandbox 买家 approve | `✓ Payment captured · Order: ...`；Vault Result 框显示非空 Vault Token + Customer ID |
| T2 redirect 返回 | presentation 走 redirect → 返回页面 | `hasReturned()` 真，`resume()` 续跑，最终成功并显示 vault |
| T3 取消 | 关闭 PayPal 弹窗 | `Payment cancelled.`（红色） |
| T4 capture 非 COMPLETED | 触发 DECLINED/PENDING | `Capture failed · status: ...`，不误报成功 |
| T5 货币切换 | 切 `#demo-currency` | reload 带 `?currency=&amount=`，金额保留 |
| T6 不合格 | eligibility 不含 paypal | `PayPal not eligible in this region` |
| T7 create body 校验 | 抓 create-order 请求 | body 与 v5 逐字一致（vault 属性齐全；return/cancel 为 v6 路径） |
| T8 SDK 加载守卫 | 断网/SDK 失败 | `✗ PayPal SDK failed to load` |

---

## 自检（Self-Review）

- **Spec 覆盖**：req §4 各条 → T1（付款+vault 展示）、T4（COMPLETED 判定）、T3（取消）、T6（eligibility）、T5（货币）、T7（body 一致）；req §2 约束 → Task 1（body/认证/capture 提取）、Task 2（v5 UI only）、Task 3（仅 PayPal+savePayment+paymentFlow）。✅ 无遗漏。
- **占位符**：仅 `<下一个可用 sort_order>`（SQL 执行时取值，与既有 acdc 计划一致），非代码占位。✅
- **命名一致性**：全链路 `orderId`（小写 d）；函数 `captureAndShowVault` / `showVaultResult` / `configurePayPalButton` / `handleClick` / `startWithFallback` / `onPayPalWebSdkLoaded` 在 Task 3 内自洽；`window.DEMO.urls.{createOrder,captureOrder}` 与 Task 2 注入一致。✅

## 风险 / 待确认

1. **`findEligibleMethods` 的 `paymentFlow:'VAULT_WITH_PAYMENT'` 是否被当前 SDK 接受**：官方 demo code 使用该参数。若该值导致 reject 或不返回 paypal，实现阶段按 Task 3 Step 7 的探查日志定位，必要时回退为不带 paymentFlow（记 `docs/debug-log.md`）。
2. **capture 响应是否直接带 `vault.customer.id`**：v5 即从 capture 取，预期一致；Step 7 探查确认。若 sandbox 偶发不返回 customer.id，则该字段显示 `—`（不阻断主流程）。
3. **savePayment:true 与 clientId 路径组合**：集成文档以 clientId 为 vault 标准路径；savePayment 来自官方 demo。若组合下行为异常，Step 7 探查时一并核对。

## 评审（计划写好后执行，可选）

- `/plan-eng-review`（架构 / 边界）✅ 已执行（见下方报告）
- `/plan-design-review`（UI 一致性 / 交互态）
- `/autoplan`（一键全套）

---

## Eng Review 输出（2026-06-05）

### NOT in scope（已考虑、明确不做）
- **前端共享 helper 抽取**：`vault-paypal-with-purchase.js` 与 `paypal-ecm.js` 重复 `getCurrency/getAmount/validateAmount/clearLoading/showResult` 等——这是本仓库既有的"每产品独立 JS"约定，抽取会动多个无关文件，本 PR 不做。
- **`GET /order/:id` 端点**：vault token 从 capture 响应取（同 v5），不另开端点。
- **PayLater / Credit 按钮**：官方 demo code 有，本 demo 仅 PayPal。
- **presentation-mode 下拉 / custom-trigger**：v5 UI only，不引入 v6 ECM 的这两个控件。

### What already exists（复用而非重建）
| 子问题 | 复用对象 | 是否重建 |
|--------|----------|----------|
| clientId 实例创建 | `init.js` `getPPInstance()` | 否，直接复用 |
| 后端 create/capture 骨架 | v5 `vault-paypal-with-purchase.js` | 移植 |
| 前端 button + start fallback | `paypal-ecm.js` | 模板裁剪 |
| 金额/币种/常量 | `config/constants.js`、`config/paypal.js` | 否，直接复用 |

### Failure modes（每条新 codepath 一个真实生产失败场景）
| codepath | 失败场景 | 有测试? | 有错误处理? | 用户可见? |
|----------|----------|---------|-------------|-----------|
| create-order | PayPal 4xx/5xx | T7 间接 | 是（透传 message+details） | 是（红色） |
| capture-order | 非 COMPLETED（DECLINED/PENDING） | T4 | 是（status 判定） | 是（红色） |
| capture 成功但无 vault token | vaulting 静默失败 | （用户定调：不额外测/不警告） | 否 | 部分：success + Vault Token `—`（**已知非阻断，用户接受**） |
| findEligibleMethods | reject / 不含 paypal | T6 | 是（top-level catch / not eligible 文案） | 是 |
| session.start | 所有 presentation mode 失败 | T8 间接 | 是（fallback 循环 + 文案） | 是 |
| redirect resume | hasReturned 后 resume 失败 | T2 | 部分（依赖 SDK） | 取决于 SDK |

> **无 critical gap**（无"既无测试、又无错误处理、且静默"的路径）。capture-无-token 一项为已知静默项，经评审用户明确接受为现状。

### 并行化策略
顺序实现，无并行机会：3 个新文件强依赖（路由 → 视图注入 URL → 前端读 URL），且都属同一 product 模块。建议单线推进 Task 1→2→3→4→5。

### Completion Summary
- Step 0 Scope Challenge：scope accepted as-is（6 文件 / 0 新类，未触发复杂度阈值）
- Architecture Review：0 blocking issues（1 条 informational：fallback 去掉 payment-handler，intentional）
- Code Quality Review：0 blocking issues（重复 helper = 既有约定，列入 NOT in scope）
- Test Review：矩阵 T1–T8，1 处 vault-specific gap → 用户定调"保持现状"，不新增用例
- Performance Review：0 issues
- NOT in scope / What already exists / Failure modes：已写
- Outside voice：未运行（小范围移植，可按需 `/plan-eng-review` 重跑或 codex）
- Lake Score：完整版（错误路径 + COMPLETED 判定 + redirect resume 均覆盖）

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 0 critical gaps, 1 finding resolved (vault-token-missing → keep current) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED — ready to implement（UI 为 v5 移植，可选跑 `/plan-design-review` 复核交互态）
