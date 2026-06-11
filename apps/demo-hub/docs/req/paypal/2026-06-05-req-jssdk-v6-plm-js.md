# 需求 — JSSDK v6 PLM-JS

> 日期：2026-06-05 · 关联：design-fe / design-be / plan（同日 `*-jssdk-v6-plm-js.md`）
>
> ⚠️ 当前 Opus 模型下只能产出 markdown 文档。实际写代码需切换到非 Opus 模型（如 Sonnet）。

## 1. 背景

demo-hub 已完成 v6 PLM 的 **HTML 配置模式** demo（`plm-html`，`auto-bootstrap` + `<paypal-message>` 属性驱动）。本需求新增姊妹 demo **PLM-JS**（路由 `/paypal/jssdk-v6/plm-js`），演示 PayPal Messages SDK v6 的 **JavaScript 配置模式**：

- `messagesInstance.fetchContent({...})` 显式拉取内容 → `messageElement.setContent(content)` 渲染
- `content.update({ amount })` 走本地缓存路径更新金额
- `messagesInstance.createLearnMore({ presentationMode })` + 监听 `paypal-message-click` 事件控制 Learn More 展示

UI 参考 v5 `plm-js`（单条消息 + Current JS Config 展示 + Event Log），并升级为 v6 JS API。plm-html 与 plm-js 互为补集：前者属性驱动（auto-bootstrap），后者 JS 驱动（fetchContent）。

## 2. 目标用户

技术开发者（主）。展示 v6 PLM 的 JS 配置 API 全貌，并与 v5 plm-js 形成 v5↔v6 对照，与 v6 plm-html 形成"HTML 模式 ↔ JS 模式"对照。

## 3. 功能需求

| # | 需求 | 验收 |
|---|------|------|
| R1 | UI 骨架参考 v5 plm-js | Buyer Country + Amount 控件、单条渲染消息、Current JS Config `<pre>`、Event Log + Clear 按钮，布局与 v5 一致 |
| R2 | 纯 JS 配置渲染 | `<paypal-message id="paypal-message">` 无 `auto-bootstrap`、无属性；内容完全由 `fetchContent()` + `setContent()` 驱动 |
| R3 | 交互式样式控件（全展示） | 新增 `logoType`(WORDMARK/MONOGRAM/TEXT) / `logoPosition`(LEFT/RIGHT/TOP/INLINE) / `textColor`(BLACK/WHITE/MONOCHROME) 三个下拉框，改动即时重新 `fetchContent()` |
| R4 | 金额走缓存更新路径 | Amount 改动调 `content.update({ amount })`（不重新 fetch），触发 `onTemplateReady`（缓存命中）回调 |
| R5 | 样式改动走服务端 fetch 路径 | 任一样式下拉框改动重新调 `fetchContent()`，触发 `onContentReady`（服务端返回）回调 |
| R6 | Learn More presentationMode 选择器 | `AUTO / MODAL / POPUP / REDIRECT` 四值；改动重建 `createLearnMore({ presentationMode })`；REDIRECT 旁注"navigates away" |
| R7 | Learn More 点击联动 | 监听 `paypal-message-click` → `event.preventDefault()` → 当前 `learnMore.open(event.detail.config)` |
| R8 | Event Log 记录全量回调 | `onContentReady`(server) / `onTemplateReady`(cache) / `paypal-message-click` / learnMore `onShow` / `onApply` / `onCalculate` / `onClose`，带时间戳 |
| R9 | Current JS Config 实时反映 | `<pre>` 显示当前 `fetchContent` options（amount/currencyCode/logoType/logoPosition/textColor）JSON，随控件变化更新 |
| R10 | 国家切换刷页 | 改 Buyer Country → 刷页 `?country=&currency=&amount=`，服务端重新映射 currency；其余控件全部 live，不刷页（用户决策） |
| R11 | 八国市场支持 | US/AU/DE/ES/FR/IT/GB/CA，`currencyCode` + `buyerCountry` 据选择注入 `createPayPalMessages()` |

## 4. 非功能需求 / 约束

- **无订单 API**：PLM 是纯消息展示，无 create-order / capture，路由为 **GET-only 自定义路由**，不用 `_factory.js`（规则 V6-PLM-4）。
- **凭证**：CN 账号（`PAYPAL_CN_CLIENT_ID`），与 plm-html 一致。
- **v6 约定**：EJS 不传 sdkUrl（规则 V6-5）；脚本三段式加载（init.js → plm-js.js → `<script defer>` core，规则 V6-PLM-3，无需单独 `paypal-messages` script）。
- **createPayPalMessages 必传参**：`currencyCode` + `buyerCountry`，否则 messages API 422（规则 V6-PLM-1）。
- **EJS/JS 分离**：EJS 只注入 `window.DEMO`，逻辑全在 `public/js/.../plm-js.js`。
- **inspect/probe**：`fetchContent` 返回的 `content` 句柄、`createLearnMore` 返回的 `learnMore` 句柄、`event.detail.config` 先 inspect 探查再定逻辑（用户标准要求 [[feedback_v6_inspect_probe]]）。

## 5. 已知风险（需在实现阶段验证）

> **R-RISK-1**：`content.update({ amount })` 是否如文档所述只更新金额、走缓存触发 `onTemplateReady`，需 inspect 实测。若 `content` 句柄无 `update` 方法或形态不同，降级为对金额改动也重新 `fetchContent()`（记 debug-log）。
>
> **R-RISK-2**：样式（logoType/position/textColor）能否通过 `content.update()` 更新未在文档定义——按文档仅 `amount` 可 update。实现按"样式改动 = 重新 fetchContent"。若实测 `content.update` 支持样式则可优化（非必须）。
>
> **R-RISK-3**：`createPayPalMessages` 同步返回还是 Promise，需 inspect 确认（plm-html 当前按同步处理）。
>
> **R-RISK-4**：REDIRECT 模式离开页面后无法自动返回，靠浏览器后退；属预期行为，页面旁注说明即可。

## 6. 范围外（Out of Scope）

- 真实生产环境（仅 sandbox）。
- 多条消息 / placement gallery（那是 plm-html 的职责）。
- 国家切换的纯 JS 无刷页重建（用户决策采用刷页方案）。
- 订单创建 / 支付（PLM 无支付环节）。

## 7. 成功标准（Definition of Done）

1. 首页 v6 分组出现 PLM-JS 卡片，点击进入页面正常渲染单条消息。
2. 改 Amount → 消息金额更新，Event Log 出现 `onTemplateReady`（缓存路径）。
3. 改任一样式下拉框 → 消息样式变化，Event Log 出现 `onContentReady`（服务端路径），Current JS Config 同步更新。
4. 点击消息 → 按当前 presentationMode 弹出 Learn More，Event Log 记录 `paypal-message-click` + `onShow`；关闭记录 `onClose`。
5. 切换 presentationMode 后再点击消息 → 以新模式展示。
6. 切换 Buyer Country → 刷页，currency 与 buyerCountry 对应更新。
7. 各 v6 对象 `inspect()` 输出可见，API 形态结论记入 debug-log。
