# Design (FE) — JSSDK v6 PLM-JS

**Date:** 2026-06-05
**Product key:** `plm-js`
**Route:** `/paypal/jssdk-v6/plm-js`
**UI reference:** `jssdk-v5/plm-js`
**关联：** req / design-be（同日 `*-jssdk-v6-plm-js.md`）

---

## 1. 目标

演示 PayPal Messages SDK v6 的 **JavaScript 配置模式**：

- `messagesInstance.fetchContent({...})` → `messageElement.setContent(content)` 显式渲染
- `content.update({ amount })` 走缓存路径更新金额（触发 `onTemplateReady`）
- 样式改动重新 `fetchContent()`（触发 `onContentReady`）
- `createLearnMore({ presentationMode })` + `paypal-message-click` 事件控制 Learn More

plm-html（姊妹 demo）演示 `auto-bootstrap` HTML 属性模式；本 demo 是其 JS 模式补集。

---

## 2. 文件结构

```
routes/paypal/jssdk-v6/plm-js.js        ← GET-only 路由（见 design-be）
views/paypal/jssdk-v6/plm-js.ejs        ← 页面模板（新建）
public/js/paypal/jssdk-v6/plm-js.js     ← 前端 JS（新建）
```

---

## 3. 页面布局

```
┌─────────────────────────────────────────────┐
│  badge + title + description                  │
├─────────────────────────────────────────────┤
│  [Buyer Country ▼]      [Amount: 100.00 ]    │  ← Country 刷页 / Amount live
├─────────────────────────────────────────────┤
│  ── STYLE (live, JS fetchContent) ─────────── │
│  [logoType ▼] [logoPosition ▼] [textColor ▼] │  ← 改动重新 fetchContent
├─────────────────────────────────────────────┤
│  ── LEARN MORE ────────────────────────────── │
│  [presentationMode ▼]   (REDIRECT navigates…) │  ← 改动重建 learnMore
├─────────────────────────────────────────────┤
│  ── JS-CONFIGURED MESSAGE ─────────────────── │
│  [white card]  <paypal-message id=…>          │  ← 无 auto-bootstrap
├─────────────────────────────────────────────┤
│  ── CURRENT JS CONFIG ─────────────────────── │
│  <pre> { amount, currencyCode, logoType…} </pre>│
├─────────────────────────────────────────────┤
│  ── EVENT LOG ─────────────  [Clear]          │
│  [scroll box] timestamped rows                │
├─────────────────────────────────────────────┤
│  supported markets hint                       │
└─────────────────────────────────────────────┘
```

复用 v5 plm-js 的 class：`sandbox-page` / `sandbox-card` / `amount-row` / `currency-group` / `amount-group` / `field-label` / `currency-select` / `amount-input` / `test-hint`，以及 Config `<pre>` 与 Event Log 的内联样式（与 v5 plm-js 一致）。

---

## 4. 控件清单

| 控件 | id | 选项 | 行为 |
|---|---|---|---|
| Buyer Country | `demo-country` | US/AU/DE/ES/FR/IT/GB/CA | change → **刷页** `?country=&currency=&amount=` |
| Amount | `demo-amount` | 文本（decimal） | change/blur → `content.update({ amount })`（live，缓存路径） |
| Logo Type | `demo-logo-type` | WORDMARK/MONOGRAM/TEXT | change → **重新 fetchContent**（server 路径） |
| Logo Position | `demo-logo-position` | LEFT/RIGHT/TOP/INLINE | change → 重新 fetchContent |
| Text Color | `demo-text-color` | BLACK/WHITE/MONOCHROME | change → 重新 fetchContent |
| Presentation Mode | `demo-presentation` | AUTO/MODAL/POPUP/REDIRECT | change → 重建 `learnMore` |
| Clear Log | `clear-log-btn` | — | 清空 Event Log |

### 文档约束（标注在控件旁/或不强制限制选项）
- `logoType="MONOGRAM"` → `logoPosition` 须为 `LEFT`
- `logoType="TEXT"` → `logoPosition` 须为 `INLINE`
- 不在 UI 强制联动（保持选项自由，让用户观察 SDK 实际行为），仅在 description / hint 文案注明约束。
- `WHITE` textColor 在白色消息卡上不可见——消息卡背景沿用白色，`WHITE` 选项旁注"for dark backgrounds"。

---

## 5. 消息元素（纯 JS 配置）

```html
<div style="background:#fff;border-radius:8px;padding:14px 18px;margin-bottom:20px;min-height:40px">
  <paypal-message id="paypal-message"></paypal-message>
</div>
```

**关键：** 无 `auto-bootstrap`、无任何 `amount`/`currency-code`/`logo-*` 属性。内容 100% 由 JS `fetchContent()` + `setContent()` 驱动。这是与 plm-html 的核心区别。

---

## 6. `window.DEMO` 注入（EJS）

```js
window.DEMO = {
  clientId:         '<%= clientId %>',
  components:       ['paypal-messages'],
  pageType:         'product-details',
  testBuyerCountry: '<%= country %>',
  currency:         '<%= currency %>',
  country:          '<%= country %>',
  defaultAmount:    '<%= defaultAmount %>',
}
```

---

## 7. 脚本加载顺序（EJS body 底部，规则 V6-PLM-3）

```html
<script src="/js/paypal/jssdk-v6/init.js"></script>      <!-- 1. singleton getPPInstance -->
<script src="/js/paypal/jssdk-v6/plm-js.js"></script>    <!-- 2. 产品 JS -->
<script defer src="https://www.sandbox.paypal.com/web-sdk/v6/core"></script>  <!-- 3. v6 core -->
```

`components: ['paypal-messages']` 传给 `createInstance()`，core 按需加载 messages 组件，**无需**单独 `paypal-messages` script。

> 注：plm-html 当前 EJS 额外引了 `web-sdk/v6/paypal-messages` script。本 demo 按 CLAUDE.md 规则 V6-PLM-3 仅三段式（不单独引）。实现阶段 inspect 验证：若 `components:['paypal-messages']` 未能自动加载 messages 组件，再补单独 script（记 debug-log）。

---

## 8. JS 行为（`plm-js.js`，IIFE）

### 8.1 模块级状态

```js
var messagesInstance = null   // createPayPalMessages 返回
var content          = null   // fetchContent 返回的句柄（含 update）
var learnMore        = null   // createLearnMore 返回的句柄（含 open）
var logCount         = 0
```

### 8.2 入口 `window.load`

```
getPPInstance()                                  // init.js singleton, 用 window.DEMO
  → messagesInstance = sdkInstance.createPayPalMessages({ currencyCode, buyerCountry })
  → doFetch()                                    // 首次渲染
  → learnMore = messagesInstance.createLearnMore({ presentationMode: 当前值, ...callbacks })
  → messageEl.addEventListener('paypal-message-click', onMessageClick)
```

> `createPayPalMessages` 形态（同步/Promise）实测确认（R-RISK-3）。`createLearnMore` 同理 inspect（plm doc 示例中 `createLearnMore` 既有 `await` 也有非 await 写法，需探查；JS 示例用 `await`，hybrid 示例无）。

### 8.3 `doFetch()` —— 样式/首次渲染（server 路径）

```js
function doFetch() {
  var opts = buildOptions()          // 读三个样式 select + amount + currencyCode
  updateConfigDisplay(opts)          // 写 Current JS Config <pre>
  content = messagesInstance.fetchContent({
    amount:        opts.amount,
    currencyCode:  opts.currencyCode,
    logoType:      opts.logoType,
    logoPosition:  opts.logoPosition,
    textColor:     opts.textColor,
    onContentReady:  function (c) { logEvent('onContentReady',  { src: 'server' }); messageEl.setContent(c) },
    onTemplateReady: function (c) { logEvent('onTemplateReady', { src: 'cache'  }); messageEl.setContent(c) },
  })
}
```

> 文档示例 `fetchContent` 返回值赋给 `content`（含 `update` 方法）。是否需 `await` 视 inspect 结果（JS 示例用 `await`，但回调内已 setContent，可不依赖返回值即可渲染）。`content` 句柄用于金额 update。

### 8.4 金额更新（缓存路径）

```js
function onAmountChange() {
  var val = parseFloat(amountInput.value)
  if (isNaN(val) || val <= 0) return
  var amount = val.toFixed(2)
  if (content && typeof content.update === 'function') {
    content.update({ amount })       // 缓存路径 → onTemplateReady
  } else {
    doFetch()                        // 降级（R-RISK-1）
  }
  updateConfigDisplay(buildOptions())
}
```

PLM 八国货币均非零小数，金额统一 `toFixed(2)`，无需零小数逻辑。

### 8.5 样式更新（server 路径）

三个样式 select 的 change → 直接 `doFetch()`（文档仅 `amount` 支持 `content.update`，样式必须重新 fetch）。

### 8.6 Presentation Mode 更新

```js
function onPresentationChange() {
  learnMore = messagesInstance.createLearnMore({
    presentationMode: presentationSel.value,    // AUTO/MODAL/POPUP/REDIRECT
    onShow:      function () { logEvent('LearnMore.onShow', null) },
    onApply:     function () { logEvent('LearnMore.onApply', null) },
    onCalculate: function (d) { logEvent('LearnMore.onCalculate', d) },
    onClose:     function () { logEvent('LearnMore.onClose', null) },
  })
}
```

`learnMore` 重新赋值；点击 handler 始终引用模块级最新 `learnMore`。

### 8.7 消息点击 → Learn More

```js
function onMessageClick(event) {
  event.preventDefault()
  logEvent('paypal-message-click', event.detail && event.detail.config ? { hasConfig: true } : null)
  if (learnMore) learnMore.open(event.detail.config)
}
```

> `event.detail.config` 形态先 inspect（用户标准要求）。

### 8.8 国家切换（刷页）

```js
countrySel.addEventListener('change', function () {
  var url = new URL(window.location.href)
  url.searchParams.set('country', this.value)
  url.searchParams.set('currency', COUNTRY_TO_CUR[this.value] || 'USD')
  url.searchParams.set('amount', amountInput.value.trim())
  window.location.replace(url.toString())
})
```

刷页后服务端重新映射 currency，`createPayPalMessages({ currencyCode, buyerCountry })` 用新值重建。

### 8.9 Event Log / Config 展示

复用 v5 plm-js 的 `logEvent(name, detail)`（时间戳 + 名称 + JSON detail，insertBefore，封顶 30 行）与 `updateConfigDisplay(config)`（`JSON.stringify(config, null, 2)` 写入 `<pre>`）。Clear 按钮重置。

---

## 9. 与参照实现的差异表

| 对比点 | v5 plm-js | v6 plm-html | **v6 plm-js（本 demo）** |
|---|---|---|---|
| 渲染 API | `paypalSDK.Messages({...}).render('#c')` | `<paypal-message auto-bootstrap>` | `fetchContent()` + `setContent()` |
| 金额更新 | 重新 `Messages().render()` | `setAttribute('amount', v)` | `content.update({ amount })` |
| 样式控制 | 固定 text/inline | 静态 gallery（8 行） | **交互式下拉框 → 重新 fetchContent** |
| Learn More | onApply 事件 | 默认（无控制） | `createLearnMore` + presentationMode 选择器 |
| 缓存/服务端区分 | 无 | 无 | **onContentReady vs onTemplateReady** |
| 消息条数 | 1 | 多（placement + gallery） | 1（交互驱动） |
| 跨境 | `buyerCountry` 入参 | 刷页 currency-code | `buyerCountry` 入 createPayPalMessages + 刷页 |

---

## 10. 成功标准（FE）

- [ ] 页面加载渲染单条消息（server 路径，Event Log 见 `onContentReady`）。
- [ ] 改 Amount → 消息金额更新，Event Log 见 `onTemplateReady`（缓存路径）。
- [ ] 改 logoType/position/textColor → 消息样式变化，Event Log 见 `onContentReady`，Config `<pre>` 同步。
- [ ] 点击消息 → 按当前 presentationMode 弹 Learn More，记录 `paypal-message-click` + `LearnMore.onShow`；关闭记 `onClose`。
- [ ] 切 presentationMode 后点击 → 以新模式展示。
- [ ] 切 Buyer Country → 刷页，currency + buyerCountry 更新。
- [ ] WHITE textColor 旁注可见，REDIRECT 旁注"navigates away"。
