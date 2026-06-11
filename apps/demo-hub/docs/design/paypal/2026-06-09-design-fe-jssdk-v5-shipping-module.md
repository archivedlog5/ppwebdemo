# 设计（前端）— Shipping Module (shipping-module) · JSSDK v5

> 日期：2026-06-09
> 关联需求：`docs/req/2026-06-09-req-jssdk-v5-shipping-module.md`
> 关联后端：`docs/design/2026-06-09-design-be-jssdk-v5-shipping-module.md`
> 状态：设计中（Opus 只写文档；代码须切换非 Opus 模型实现）

---

## 1. 页面结构（沿用 sandbox-card 极简风格）

参考 `views/paypal/jssdk-v5/spb-ecs.ejs`。文件：`views/paypal/jssdk-v5/shipping-module.ejs`。

```
sandbox-header
  badge: PayPal · JSSDK v5 · Shipping Module
  h1: <title>（Supabase display_name）
  p: Server-side shipping callbacks — 运送选项 + 金额动态重算

sandbox-card
  ┌ 控件行 ────────────────────────────────────────────┐
  │ Merchant: [ CN ▾ | US ]   ← change → reload ?merchant=  │
  │ Currency: [ USD ▾ ]       ← 沿用现有 reload 模式          │
  │ Amount:   [ 100.00 ]                                    │
  │ ☑ Subscribe SHIPPING_OPTIONS  （SHIPPING_ADDRESS 常开）  │
  │ Simulate decline: [ none ▾ ]                            │
  │   none / COUNTRY_ERROR / ZIP_ERROR / STATE_ERROR /      │
  │   ADDRESS_ERROR / METHOD_UNAVAILABLE / STORE_UNAVAILABLE│
  └────────────────────────────────────────────────────────┘
  ⚡ Sandbox Mode

  #paypal-button-container  （SDK 按钮）
  #result                   （结果区）

  ℹ️ 说明条：本地 callback 不触发（PayPal 需公网回调）；真实运送选项/金额更新在
     部署到 PUBLIC_BASE_URL 后于 review 页可见。
```

### 控件行为

| 控件 | 行为 |
|------|------|
| Merchant 下拉 | change → `reload ?merchant=<v>&currency=&amount=`（同 currency 选择器逻辑） |
| Currency 下拉 | 沿用现有：change → reload `?currency=&amount=`（保留 merchant） |
| Amount 输入 | blur 格式化 + 校验（沿用 spb.js 规则，零小数币种取整） |
| Subscribe 复选框 | 不 reload；值在 createOrder 时随 body 发送 |
| Simulate decline | 不 reload；值在 createOrder 时随 body 发送 |

---

## 2. 配置注入（EJS → window.DEMO）

```html
<script>
  window.DEMO = {
    urls: {
      createOrder:  '/paypal/jssdk-v5/api/shipping-module/create-order',
      captureOrder: '/paypal/jssdk-v5/api/shipping-module/capture-order',
    },
    merchant: '<%= merchant %>',   // 'cn' | 'us'，GET 注入
    currency: '<%= currency %>',
  }
</script>
<script src="/js/paypal/jssdk-v5/shipping-module.js"></script>
```

> 注意 reload 类控件（merchant / currency）的当前值由服务端注入并选中（sticky），
> 参考 spb-ecs.ejs 的 currency `selected` 写法。

---

## 3. 前端逻辑（`public/js/paypal/jssdk-v5/shipping-module.js`）

IIFE + `'use strict'`，结构参考 `spb.js`（本期不复用 spb.js，因需多发 merchant/subscribe/decline 字段，
**新建独立文件**，规则 1 不跨产品共用）。

```js
;(function () {
  'use strict'

  function readControls() {
    return {
      amount:   document.getElementById('demo-amount').value.trim(),
      currency: document.getElementById('demo-currency').value,
      merchant: (window.DEMO && window.DEMO.merchant) || 'cn',
      subscribeOptions: document.getElementById('subscribe-options').checked,
      decline:  document.getElementById('simulate-decline').value, // 'none' | 'COUNTRY_ERROR' | ...
    }
  }

  // Merchant + Currency change → reload（保留彼此的值）
  // amount blur 校验（沿用 spb.js 规则）

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
          body: JSON.stringify({ orderID: data.orderID, merchant: readControls().merchant }),
        }).then(r => r.json()).then(function (order) {
          if (order.error) throw new Error(order.error)
          var cap = order.purchase_units && order.purchase_units[0] &&
                    order.purchase_units[0].payments &&
                    order.purchase_units[0].payments.captures &&
                    order.purchase_units[0].payments.captures[0]
          if (!cap || cap.status !== 'COMPLETED') {
            showResult('✗ Capture failed · status: ' + (cap ? cap.status : 'unknown'), 'error'); return
          }
          // 展示最终金额（含所选运费）
          var amt = order.purchase_units[0].amount
          showResult('✓ Captured · ' + amt.currency_code + ' ' + amt.value + ' · Order: ' + order.id, 'success')
        })
      },
      onCancel: function () { showResult('Payment cancelled.', 'error') },
      onError:  function (e) { showResult('✗ ' + (e.message || e), 'error') },
    }).render('#paypal-button-container')
  })
})()
```

> capture 成功提示带**最终金额**（`amount.value`），便于核对运费已计入（规则 13 判定不变）。

---

## 4. SDK 加载参数

| 项 | 值 |
|----|----|
| components | `buttons` |
| currency | 动态（`?currency`） |
| client-id | 按 merchant：CN → `PAYPAL_CN_CLIENT_ID`，US → `PAYPAL_US_CLIENT_ID` |
| buyer-country | CN：`buyer-country=US`（沙盒美国买家）；US：可省略 |
| 其他 | 沿用 spb 的 `disable-funding`（可选，仅留 PayPal 按钮更聚焦） |

SDK URL 由 GET handler 拼装（参考 _factory `stripCurrency` + 动态 currency），按 merchant 选 client-id。

---

## 5. 样式

复用 `public/css/sandbox.css`：`sandbox-page` / `sandbox-card` / `amount-row` / `currency-select` /
`field-label` / `result-msg`。新增控件（subscribe 复选框、decline 下拉、merchant 下拉、说明条）
用页内 scoped `<style>` 做轻量布局，不动全局 css（surgical）。

---

## 6. 无障碍 / 交互状态

- 控件均有 `<label>` + `aria-label`。
- `#result` `role="alert" aria-live="polite"`。
- decline / subscribe 改变不触发 reload，避免打断；下次点按钮时生效。
- 说明条（本地不触发回调）用 `info` 样式，避免用户误判 demo 坏了。

---

## 7. inspect/probe（前端，服务器定稿）

- [ ] `console.log` createOrder 请求体（merchant/subscribe/decline/amount/currency）。
- [ ] `console.log` create-order 响应（order id）。
- [ ] `console.log` capture 响应（核对 `amount.breakdown` 含 tax + shipping）。
- [ ] review 页交互（服务器）：观察 PayPal 是否刷新选项/金额 —— 回调命中在**后端**控制台核对。
