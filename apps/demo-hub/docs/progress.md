# demo-hub — Progress Log

---

## 2026-05-30 — PayPal JSSDK v6 基础实施（Tasks 1–10 + Task 22）

**背景：** 在已完成的 jssdk-v5 基础上，新增 `/paypal/jssdk-v6/` 路由前缀，首先实现 PayPal ECM / ECS 两个核心 demo，验证 v6 SDK 架构可行性。

**完成内容：**

### 设计与规划
- 完成 JSSDK v6 设计文档：`docs/superpowers/specs/2026-05-30-jssdk-v6-design.md`
- 完成 JSSDK v6 实现计划：`docs/superpowers/plans/2026-05-30-jssdk-v6.md`（20 个产品，Tasks 1–24）
- Supabase SQL 执行：插入 20 条 v6 产品记录（`demohub.products` 表），app 启动确认加载 36 个产品（16 v5 + 20 v6）

### 基础设施
- **`src/routes/paypal/jssdk-v6/_factory.js`**：v6 路由工厂
  - `createStandardRoute({ productKey, view, buildBody })`
  - `buildBody` 为必填参数（运行时 guard），签名：`function(amount, currency) → body`
  - 与 v5 工厂关键差异：注入 `clientId`（非 `sdkUrl`）；create-order 返回 `{ orderId: order.id }`；capture-order 读 `req.body.orderId`
  - JSDoc 提醒：零小数位货币（JPY 等）在 `buildBody` 内需 `Math.round()`
- **`src/public/js/paypal/jssdk-v6/init.js`**：browser-side 单例
  - `window.getPPInstance()` → `paypal.createInstance({ clientId, components })` 的 Promise 缓存
  - sessionStorage 记录 `pp_v6_clientId`（跨页面 SDK 缓存加速）

### PayPal ECM / ECS 路由 + 视图 + JS
- **`src/routes/paypal/jssdk-v6/paypal-ecm.js`**：buildBody 含 `shipping: SANDBOX_SHIPPING`、`shipping_preference: 'SET_PROVIDED_ADDRESS'`
- **`src/routes/paypal/jssdk-v6/paypal-ecs.js`**：无 shipping 字段、`shipping_preference: 'GET_FROM_FILE'`
- **`src/views/paypal/jssdk-v6/paypal-ecm.ejs`** / **`paypal-ecs.ejs`**：
  - `window.DEMO = { clientId, components: ['paypal-payments'], urls: { createOrder, captureOrder } }`
  - Script 加载顺序：`init.js` → `paypal.js` → `<script defer src="...web-sdk/v6/core">`（defer 保证 window.load 触发时 SDK 已就绪）
  - 无 `sdkUrl` 传给 header（header.ejs 条件跳过 SDK 注入）
- **`src/public/js/paypal/jssdk-v6/paypal.js`**（paypal-ecm + paypal-ecs 共用）：
  - 关键 V6-3 规则：`findEligibleMethods()` 嵌套在接收 `instance` 的 `.then()` 内部，保证 `instance` 在后续回调中可用
  - `session.start({ presentationMode: 'auto' }, orderPromise)` 传 Promise 引用（非 await 结果），防止弹窗被浏览器拦截
  - `onApprove` 读 `data.orderId`（小写 d）；capture 成功判断：`captures[0].status === 'COMPLETED'`
  - `validateAmount()` 含正则校验 `^\d+(\.\d{1,2})?$` + `isNaN` 检查
  - `onCancel` 使用 `'info'` type（非 error）

### 规则文档
- **`src/routes/paypal/jssdk-v6/CLAUDE.md`**：v6 专属 7 条规则（V6-1 到 V6-7）
- Symlinks：`src/views/paypal/jssdk-v6/CLAUDE.md` → 同文件；`src/public/js/paypal/jssdk-v6/CLAUDE.md` → 同文件

**修复的关键 Bug（Code Review 发现）：**
1. `instance` 作用域错误：Promise chain 从 flat `.then()` 改为嵌套 `.then()`（V6-3 规则来源）
2. 死代码：移除 EJS 中的 `#amount-error` div（`paypal.js` 从不写入该元素）
3. 弱校验：`validateAmount()` 补充 `isNaN` 和正则校验
4. 缺少服务端错误 guard：`onApprove` 内补充 `if (order.error)` 检查
5. `window.DEMO.urls` 不安全访问：改为 `(window.DEMO || {}).urls`
6. `_factory.js` 缺少 `buildBody` runtime guard：补充 `typeof` 检查

**状态：**
- Tasks 1–10、22：✅ 完成（subagent 实施 + spec + 代码质量双重审查）
- Task 4（Supabase）：✅ 用户已执行 SQL，36 产品加载确认
- Task 11（E2E 测试）：⏳ 用户人手测试中
- Tasks 12–21、23–24：⏸ 等待各产品 v6 markdown 文档

**下一步：**
- 等 Task 11 测试结果（pass → 继续后续产品；fail → 针对性修复）
- 用户提供 paylater/venmo/bcdc/acdc/applepay/googlepay/vault/plm 的 v6 markdown 后，继续 Tasks 8–21

---

## 2026-05-28 — Google Pay ECS Full Callback 模式

- 修复 `googlepay-ecs.js`：改为 Full Callback 模式（`paymentDataCallbacks: { onPaymentAuthorized, onPaymentDataChanged }`）
- 修复 `callbackIntents` 必须含 `PAYMENT_AUTHORIZATION`（否则 Google Pay OR_BIBED_06 错误）
- 修复 `shippingOptions` 格式：只含 `{id, label, description}`，不能含 `price` / `selected`
- 修复 `onPaymentDataChanged` 返回规则：SHIPPING_OPTION 时只返回 `newTransactionInfo`
- 新增 `shippingAmount` 注入 create-order，total = item + shipping

---

## 2026-05-20 ~ 2026-05-27 — JSSDK v5 完整实施

- PLM div / PLM JS（`plm-div.js`、`plm-js.js`）
- Google Pay ECM / ECS（Promise 模式 / Full Callback 模式）
- Apple Pay ECM / ECS
- Vault Return（`commit=true&buyer-country=US` 规则确认）
- ACDC Vault w/ Purchase / ACDC Vault Setup-only
- Apple Pay Vault w/ Purchase
- PayPal Vault w/ Purchase / PayPal Vault Setup-only
- 动态金额 + 币种选择器（30 种货币，零小数位格式化）
- `constants.js` 统一常量管理
- EJS/JS 分离重构（`window.DEMO` 模式）
