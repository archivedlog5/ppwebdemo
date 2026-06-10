# 设计（前端）— Contact Module (contact-module) · JSSDK v5

> 日期：2026-06-10
> 关联需求：`docs/req/2026-06-10-req-jssdk-v5-contact-module.md`
> 关联后端：`docs/design/2026-06-10-design-be-jssdk-v5-contact-module.md`
> 状态：设计中（Opus 只写文档；代码须切换非 Opus 模型实现）

---

## 1. 页面结构（沿用 sandbox-card 极简风格）

参考 `views/paypal/jssdk-v5/spb-ecs.ejs`。文件：`views/paypal/jssdk-v5/contact-module.ejs`。

```
sandbox-header
  badge: PayPal · JSSDK v5 · Contact Module
  h1: <title>（Supabase display_name）
  p: 买家在 PayPal 结账查看/编辑 email 与电话（contact_preference）

sandbox-card
  ┌ US-only 提示条（醒目，复用现有 token，见 §6）──────────┐
  │ ⚠️ Contact Module 现阶段仅支持美国商户（US only）。       │
  │    本 demo 使用 US sandbox 商户，货币锁定 USD。           │
  └────────────────────────────────────────────────────────┘

  ┌ 控件行 ────────────────────────────────────────────────┐
  │ Contact preference:                                      │
  │   [ UPDATE_CONTACT_INFO ▾ ]                              │
  │     UPDATE_CONTACT_INFO  — 买家可看且可编辑              │
  │     RETAIN_CONTACT_INFO  — 买家可看不可编辑              │
  │     NO_CONTACT_INFO      — 买家看不到（默认隐藏）        │
  │   ↳ #pref-hint（随下拉动态更新，英文文案）              │
  │ Currency: USD（锁定，纯文本展示，无下拉）                │
  │ Amount:   [ 100.00 ]                                     │
  └────────────────────────────────────────────────────────┘

  ┌ 将发送的联系方式（只读展示）───────────────────────────┐
  │ Email: buyer-contact@example.com                        │
  │ Phone: +1 5555555555                                    │
  │ （固定 sandbox 值；UPDATE 模式下买家可在 PayPal 修改）   │
  └────────────────────────────────────────────────────────┘

  ⚡ Sandbox Mode
  #paypal-button-container  （SDK 按钮）
  #result                   （结果区）

  ℹ️ 说明条：选 UPDATE_CONTACT_INFO 后，可在 PayPal 弹窗里修改 email/电话；
     付款完成后结果行会显示「最终」联系方式（服务端 GET Order 取回）。
```

### 控件行为

| 控件 | 行为 |
|------|------|
| Contact preference 下拉 | 不 reload；值在 createOrder 时随 body 发送；**change 时更新 `#pref-hint` 文案**（见下） |
| Amount 输入 | blur 格式化 + 校验（沿用 spb.js 规则；USD 两位小数） |
| Currency | 纯文本 `USD`，不可改（无下拉） |

> 与 shipping-module 不同：**无 Merchant 下拉、无 Currency 下拉**（US-only + USD 锁定）。

### `#pref-hint` 动态提示（英文文案）

下拉下方一行说明，随选择实时更新（page load 时按默认值 UPDATE 初始化）。文案锁定英文：

| preference 值 | `#pref-hint` 文案（English） |
|---------------|------------------------------|
| `UPDATE_CONTACT_INFO` | `Buyer can view and edit contact at PayPal.` |
| `RETAIN_CONTACT_INFO` | `Buyer can view contact but cannot edit it.` |
| `NO_CONTACT_INFO` | `Buyer won't see contact, but it's still sent to the merchant.` |

> 目的：消除「NO_CONTACT_INFO 是否还发送联系方式」的歧义（会发送，买家只是看不到）。
> 用 `info` 样式（muted 字色但满足 ≥16px / 对比度 ≥4.5:1，见 §6）。

---

## 2. 配置注入（EJS → window.DEMO）

```html
<script>
  window.DEMO = {
    urls: {
      createOrder:  '/paypal/jssdk-v5/api/contact-module/create-order',
      captureOrder: '/paypal/jssdk-v5/api/contact-module/capture-order',
    },
  }
</script>
<script src="/js/paypal/jssdk-v5/contact-module.js"></script>
```

> 固定联系方式由服务端 `demoContact` 注入 EJS 只读展示区（非业务字段，仅供查看）。

---

## 3. 前端逻辑（`public/js/paypal/jssdk-v5/contact-module.js`）

IIFE + `'use strict'`，新建独立文件（规则 1 不跨产品共用）。

```js
;(function () {
  'use strict'

  function readControls() {
    return {
      amount:           document.getElementById('demo-amount').value.trim(),
      contactPreference: document.getElementById('contact-preference').value,
    }
  }

  // amount blur 校验（沿用 spb.js 规则，USD 两位小数）

  // #pref-hint 动态文案（英文，见 §1 表）
  var PREF_HINTS = {
    UPDATE_CONTACT_INFO: 'Buyer can view and edit contact at PayPal.',
    RETAIN_CONTACT_INFO: 'Buyer can view contact but cannot edit it.',
    NO_CONTACT_INFO:     "Buyer won't see contact, but it's still sent to the merchant.",
  }
  function updatePrefHint() {
    var v = document.getElementById('contact-preference').value
    document.getElementById('pref-hint').textContent = PREF_HINTS[v] || ''
  }
  // 绑定 change + page load 初始化（默认 UPDATE）
  document.getElementById('contact-preference').addEventListener('change', updatePrefHint)
  updatePrefHint()

  window.addEventListener('load', function () {
    if (typeof paypalSDK === 'undefined') { showResult('✗ SDK failed', 'error'); return }
    paypalSDK.Buttons({
      createOrder: function () {
        var c = readControls()
        if (!validateAmount()) return Promise.reject(new Error('Invalid amount'))
        return fetch(window.DEMO.urls.createOrder, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(c),
        }).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); return d.id })
      },
      onApprove: function (data) {
        return fetch(window.DEMO.urls.captureOrder, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderID: data.orderID }),
        }).then(r => r.json()).then(function (order) {
          if (order.error) throw new Error(order.error)
          // 规则 13：用后端返回的 raw 复判 captures[0].status
          var cap = order.raw && order.raw.purchase_units && order.raw.purchase_units[0] &&
                    order.raw.purchase_units[0].payments &&
                    order.raw.purchase_units[0].payments.captures &&
                    order.raw.purchase_units[0].payments.captures[0]
          if (!cap || cap.status !== 'COMPLETED') {
            showResult('✗ Capture failed · status: ' + (cap ? cap.status : 'unknown'), 'error'); return
          }
          // 展示最终联系方式（GET Order 取回）+ capture id
          var email = (order.contact && order.contact.email) || 'n/a'
          var phone = (order.contact && order.contact.phone) || 'n/a'
          showResult('✓ COMPLETED · Contact → ' + email + ' / ' + phone +
                     ' · Capture ID: ' + cap.id, 'success')
        })
      },
      onCancel: function () { showResult('Payment cancelled.', 'error') },
      onError:  function (e) { showResult('✗ ' + (e.message || e), 'error') },
    }).render('#paypal-button-container')
  })
})()
```

> 成功提示直接展示**最终 email / phone**——UPDATE 模式下买家若改过，这里就能看出区别（需求核心价值）。

---

## 4. SDK 加载参数

| 项 | 值 |
|----|----|
| components | `buttons` |
| currency | `USD`（锁定） |
| client-id | `PAYPAL_US_CLIENT_ID`（US-only） |
| buyer-country | `US`（sandbox 美国买家 + 触发 Contact Module） |

SDK URL 由 GET handler 拼装（固定 `currency=USD`，无动态币种）。

---

## 5. 样式

复用 `public/css/sandbox.css`：`sandbox-page` / `sandbox-card` / `amount-row` /
`field-label` / `result-msg`。新增控件（US-only 提示条、contact preference 下拉、
只读联系方式展示区、说明条）用页内 scoped `<style>` 做轻量布局，不动全局 css（surgical）。

---

## 6. 无障碍 / 交互状态

- 控件均有 `<label>` + `aria-label`。
- `#result` `role="alert" aria-live="polite"`。
- US-only 提示条**复用现有 token**（不新增 warning 色）：中性 `--color-surface2` 背景 +
  `--color-accent` 左边框/图标 + `--color-fg` 文字（满足对比度 ≥4.5:1）；置于卡片顶部，显著可见。
  不动 `sandbox.css` 全局 / DESIGN.md，仅页内 scoped `<style>` 拼装。
- preference 改变不触发 reload，下次点按钮时生效。

---

## 7. inspect/probe（前端，定稿）

- [ ] `console.log` createOrder 请求体（amount / contactPreference）。
- [ ] `console.log` create-order 响应（order id）。
- [ ] `console.log` capture-order 响应（核对 `contact.email` / `contact.phone` 与 preference 行为一致）。
- [ ] UPDATE 模式：在 PayPal 改联系方式 → 确认结果行显示改后值。
