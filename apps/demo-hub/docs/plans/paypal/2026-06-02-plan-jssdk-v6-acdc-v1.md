# 实现计划 — JSSDK v6 ACDC v1

> 日期：2026-06-02 · 关联：req / design-fe / design-be（同日 `*-jssdk-v6-acdc.md`）
>
> ⚠️ 当前 Opus 模型下只能产出本计划（markdown）。实际写代码需切换到 Sonnet 等非 Opus 模型。

## 目标（Definition of Done）

`/paypal/jssdk-v6/acdc` 上线，UI 与 v5 一致，create-order 参数与 v5 一致，3DS 处理与 v5 一致，满足 req 文档第 4 节全部完成标准。

## 改动文件清单（预期）

| # | 文件 | 动作 | 来源/参考 |
|---|------|------|-----------|
| 1 | `src/routes/paypal/jssdk-v6/acdc.js` | 新建 | 移植 v5 `routes/.../acdc.js` + v6 适配 |
| 2 | `src/views/paypal/jssdk-v6/acdc.ejs` | 新建 | 移植 v5 `views/.../acdc.ejs` + v6 适配 |
| 3 | `src/public/js/paypal/jssdk-v6/acdc.js` | 新建 | 命令式重写（基于 v5 逻辑 + v6 CardFields API） |
| 4 | `src/app.js` | 改：加一行 `app.use(v6, require('./routes/paypal/jssdk-v6/acdc'))` | — |
| 5 | `src/routes/paypal/jssdk-v6/CLAUDE.md` | 改：components 表 acdc 行 TBD→`['card-fields']`，新增 ACDC 专属规则段 | — |
| 6 | Supabase `demohub.products` | 插一行（用户执行 SQL） | design-be 第 8 节 |

> 文件 5、6 不是代码逻辑，但属于交付完整性的一部分。

## 步骤

### Step 1 — 后端路由 `acdc.js`
- 复制 v5 `acdc.js` 结构，常量改为 `const C = require('../../../config/constants')` 整体引入风格（与 v6 其他路由一致）或沿用 v5 解构（二选一，保持文件内自洽）。
- GET handler：传 `clientId` + `supportedCurrencies`，**删除 `sdkUrl`**。
- create-order：body 结构与 v5 **逐字一致**；返回 `{ orderId: order.id }`。
- GET order：路径 `:orderId`（小写 d）。
- capture-order：`req.body.orderId`（小写 d）。
- 验收：`curl` 三个端点（create → get → capture）返回结构正确。

### Step 2 — 视图 `acdc.ejs`
- 复制 v5 `acdc.ejs`；provider-badge 文案改 `PayPal · JSSDK v6 · ACDC`。
- 货币下拉改用 `supportedCurrencies.forEach`。
- header include 去掉 `sdkUrl`。
- 底部注入 `window.DEMO`（clientId / components:['card-fields'] / pageType / urls{create,capture,getOrder} / billing）。
- 三段式脚本：`init.js` → `acdc.js` → `<script defer ...v6/core>`。

### Step 3 — 前端 `public/js/paypal/jssdk-v6/acdc.js`
- IIFE + `'use strict'`。
- 搬运 v5 的辅助函数：`getCurrency/getAmount/getSCA/getName/validateAmount/isZeroDecimal/clearLoading/showResult` + 货币切换 reload + blur 格式化。
- `onPayPalWebSdkLoaded` → `getPPInstance()` → `findEligibleMethods({ currencyCode })` → **防御式** `isCardEligible(eligibility)`（合格或 key 缺失都渲染；仅明确不合格才拦截）→ `setupCardFields(instance)`。
- `setupCardFields`：同步 `createCardFieldsOneTimePaymentSession()` → 三个 `createCardFieldsComponent` → `appendChild` → 绑定 Pay 按钮。
- **不移植** v5 的 `inputEvents` 相关代码（`CONTAINER_BY_EMITTED` / `CONTAINER_BY_FIELD` / `updateFieldStates` / onChange/onFocus/onBlur）——documented-only，仅保留 `style: { '.invalid': {...} }`。
- **先加调试探查日志**（design-fe 第 8 节 `inspect()`）：对 `paypal` / `instance` / `eligibility` / `session` / 三个 field 组件 / `submit result` 逐一打印自身属性+原型方法，在 DevTools 排查 v6 是否暴露字段事件 API。结论确定后按 design-fe §8.4 处理：发现事件 API → 复核 documented-only；无 → 删除探查代码。
- `onPayClick`：`await createOrder()` → `await session.submit(orderId, { billingAddress })` → `handleSubmitResult`。
- `handleSubmitResult`：state 机（succeeded/canceled/failed/default）。
- `decide3DSAndCapture`：**逐行对照 v5 onApprove**（POSSIBLE/undefined→capture；否则 GET order→决策表）。
- `doCapture`：COMPLETED 判定（规则 13）。
- 验收：见下方测试矩阵。

### Step 4 — 挂载 + CLAUDE.md
- `app.js` 加挂载行（放在 v6 块、bcdc 之后）。
- 更新 `routes/paypal/jssdk-v6/CLAUDE.md`：
  - components 表：`acdc` → `['card-fields']`，状态 ✅。
  - 新增 "ACDC 专属规则" 段，至少记录：
    - eligibility key = `advanced_cards`；**防御式判定**（合格或 key 缺失都渲染，仅明确不合格才拦截）；
    - `createCardFieldsOneTimePaymentSession()` 同步返回；
    - 字段用 `createCardFieldsComponent({type}).appendChild`（非 button、非 v5 `.render()`）；
    - submit 是 `await session.submit(orderId, { billingAddress })` 返回 `{ data, state }`，**不套用 V6-2 Promise 传递**；
    - 3DS 与 v5 一致（POSSIBLE/undefined→capture，否则 GET order→表）。

### Step 5 — Supabase + 重启
- 执行 INSERT（design-be 第 8 节），`sort_order` 取 v6 组内最大值 +1。
- 重启 demo-hub，确认首页出现 ACDC v6 卡片。

## 测试矩阵（写入 `docs/test-cases.md`）

| 用例 | 操作 | 期望 |
|------|------|------|
| T1 正常付款 | 有效卡 `4032030176760800` + `SCA_WHEN_REQUIRED` | `✓ Payment captured · Order: ...` |
| T2 3DS 成功 | `SCA_ALWAYS` → 完成 3DS 弹窗 | capture 成功 |
| T3 3DS 取消 | `SCA_ALWAYS` → 关闭 3DS 弹窗 | `state==='canceled'`，红色取消提示，可重试 |
| T4 卡校验错误 | 错误卡号/过期 | `state==='failed'`，显示 `data.message` |
| T5 capture 非 COMPLETED | DECLINED 卡 | 显示 `Capture failed · status: ...`，不误报成功 |
| T6 POSSIBLE 直 capture | 触发 3DS 且 client `liabilityShift==='POSSIBLE'` | 不调 GET order，直接 capture（console 可见 client log） |
| T7 GET order 分支 | client liabilityShift 非 POSSIBLE/undefined | 调 GET order，按决策表（NO+[N/U/B]→capture，UNKNOWN→retry，else→decline） |
| T8 货币切换 | 切换 `#demo-currency` | reload 带 `?currency=&amount=`，金额保留 |
| T9 资格明确不符 | 明确 ineligible 信号 | 显示 "Card Fields not available" |
| T10 资格 key 缺失 | 响应中无 `advanced_cards` key | 防御式：卡域仍渲染，可正常付款 |

## 风险 / 待确认

1. ~~inputEvents 能力差异~~ **已定调（不再是风险）**：documented-only，仅 `.invalid` style，不实现 v5 的每字段边框/focus/卡种日志，也不尝试未文档化的 inputEvents。详见 design-fe 第 6 节。
2. **`createCardFieldsComponent` 返回值挂载方式**：文档示例用 `appendChild`。实现时先按 appendChild；若该方法返回的是带 `.render()` 的对象（与 v5 类似），以实测为准，二选一即可，不混用。
3. **3DS 弹窗与 transient activation**：CardFields `submit()` 走 `await createOrder()` 串行（官方写法）。若实测弹窗被拦截，再评估是否需调整调用时序（届时记 `docs/debug-log.md`）。

## 评审（计划写好后执行）

- `/plan-eng-review`（架构 / 边界）
- `/plan-design-review`（UI 一致性 / 交互态）
- 可选 `/autoplan` 一键跑全套
</content>
