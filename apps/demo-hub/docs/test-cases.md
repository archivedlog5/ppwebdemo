# demo-hub — Test Cases

---

## JSSDK v6 Google Pay ECM（2026-06-03）

> 路由：`/paypal/jssdk-v6/googlepay-ecm` · 需 Chrome + Google Pay 沙盒钱包卡 · **付款模式：Promise（v5-style），实测无 OR_BIBED_06**

| ID | 用例 | 操作步骤 | 期望结果 | 状态 |
|----|------|----------|----------|------|
| T1 | 官方按钮付款 | Chrome + 沙盒 Google Pay 卡，点官方按钮 | 拉起 sheet → `✓ Payment captured · Order: ...` | ✅ |
| T2 | 客制按钮付款 | 点 `#custom-googlepay-btn` | 同 T1（同一 handler） | ✅ |
| T3 | 无 Google Pay SDK | `window.google.payments` 缺失（脚本被拦） | 显示 "Google Pay SDK is not available"，无未捕获异常 | ⬜ |
| T4 | isReadyToPay false | 设备/账号无 Google Pay | 清 spinner，显示 "not available on this device or account" | ⬜ |
| T5 | 账号不合格 | `isEligible('googlepay')` false | 显示 "not eligible"，不渲染按钮 | ⬜ |
| T6 | 用户取消 | sheet 内取消（statusCode CANCELED） | 静默，无红错，可重试 | ⬜ |
| T7 | 3DS（SCA_ALWAYS）| `#demo-sca`=SCA_ALWAYS → 触发 PAYER_ACTION_REQUIRED | **已知限制（不支持）**：v6 `initiatePayerAction()` 是 void no-op、session 无 `resume()`，3DS 无法完成；显示 3DS 错误。callback 模式也修不了。详见 CLAUDE.md V6-GOOGLEPAY-7 | ⚠️ N/A |
| T8 | capture 非 COMPLETED | 触发非完成态 | `✗ Capture failed · status: ...`，不误报成功 | ⬜ |
| T9 | 货币切换 | 切 `#demo-currency` | reload 带 `?currency=&amount=`，金额保留 | ⬜ |
| T10 | inspect 输出 | 任意流程 | console 可见各对象属性+原型方法（重点 googlePaySession 是否含 initiatePayerAction、confirmOrder 返回形态、formatConfigForPaymentRequest 输出） | ⬜ |
| T11 | create-order curl | `curl POST .../api/googlepay-ecm/create-order`（body `{amount,currency,scaMethod}`）| 返回 `{ orderId }`，body 结构（payment_source.google_pay + shipping + verification.method）= v5；免 Chrome | ⬜ |
| T12 | eligibility 网络错误 | findEligibleMethods 抛错 | `.catch` 捕获，显示 `✗ ...`，不静默失败 | ⬜ |
| T13 | GET order curl | `curl GET .../api/googlepay-ecm/order/<id>` | 返回原始 PayPal order JSON | ⬜ |

### 验收备注

- T1/T2 正常付款（免挑战）已实测通过（Promise 模式，无 OR_BIBED_06）。
- T7 3DS（SCA_ALWAYS）**实测确认为已知限制、不支持**：v6 `googlePaySession.initiatePayerAction()` 无参 + void no-op、session 无 `resume()`；Promise 模式拿不到 auth 结果，callback 模式 confirmOrder 又遇 `ERR_CONNECTION_RESET`（CN→sandbox.paypal.com）。用户拍板：ship Promise 模式，3DS 列为已知限制。详见 CLAUDE.md V6-GOOGLEPAY-7。

---

## JSSDK v6 Apple Pay ECS（2026-06-02）

> 路由：`/paypal/jssdk-v6/applepay-ecs` · 需 Safari + Apple Pay 沙盒钱包卡 · 浏览器非 Safari 时 T5 验证

| ID | 用例 | 操作步骤 | 期望结果 | 状态 |
|----|------|----------|----------|------|
| T1 | 官方按钮付款 | Safari + 沙盒钱包卡，点 `<apple-pay-button>` | 拉起 sheet → 选地址/邮箱/电话/配送方式 → `✓ Payment captured · Order: ...` | ⬜ |
| T2 | 客制按钮付款 | 点 `#custom-applepay-btn` | 同 T1（同一 handler） | ⬜ |
| T3 | 切 shipping method | sheet 内 Standard↔Express | total 实时更新（item + 5 或 item + 10）；最终 create-order 金额 = sheet total | ⬜ |
| T4 | 默认配送 | 不切换，直接付款 | chosenShipping = Standard($5)，total = item + 5 | ⬜ |
| T5 | 非 Safari | Chrome 打开 | 显示 "Apple Pay is not available..."，无未捕获异常 | ⬜ |
| T6 | 无钱包卡 | Safari 但钱包无卡 | 显示 "no cards configured" 类提示 | ⬜ |
| T7 | 账号不合格 | isEligible('applepay') 返回 false | 显示 "not eligible for this account"，不渲染按钮 | ⬜ |
| T8 | 商户验证失败 | validateMerchant 失败（域名未注册等） | abort() + 错误提示，sheet 关闭 | ⬜ |
| T9 | 用户取消 | sheet 内取消 | oncancel log，无红错，可重试 | ⬜ |
| T10 | capture 非 COMPLETED | 触发非完成态 | `✗ Capture failed · status: ...`，completePayment(FAILURE) | ⬜ |
| T11 | 货币切换 | 切 `#demo-currency` | reload 带 `?currency=&amount=`，金额保留 | ⬜ |
| T12 | inspect 输出 | 任意流程 | console 可见各对象属性+原型方法；重点确认 shippingContact / shippingMethod 事件 v6 形态 | ⬜ |
| T13 | create-order curl | `curl POST .../api/applepay-ecs/create-order`（带 shippingContact/shippingAmount） | 返回 `{ orderId }`，body = item+shipping breakdown + apple_pay name/email/phone | ⬜ |
| T14 | eligibility 网络错误 | findEligibleMethods 抛错 | .catch 捕获，显示 `✗ ...`，不静默失败 | ⬜ |
| T15 | shippingMethod identifier 不匹配 | event.shippingMethod.identifier 非 standard/express | fallback SHIPPING_METHODS[0]，不崩溃 | ⬜ |

---

## JSSDK v6 ACDC（2026-06-02）

> 路由：`/paypal/jssdk-v6/acdc` · 测试卡：`4032030176760800` · SCA 默认：`SCA_WHEN_REQUIRED`

| ID | 用例 | 操作步骤 | 期望结果 | 状态 |
|----|------|----------|----------|------|
| T1 | 正常付款 | 有效卡 `4032030176760800` + `SCA_WHEN_REQUIRED` → Pay Now | `✓ Payment captured · Order: ...` | ⬜ |
| T2 | 3DS 成功 | `SCA_ALWAYS` → 填卡 → Pay Now → 完成 3DS 弹窗 | capture 成功，显示 ✓ | ⬜ |
| T3 | 3DS 取消 | `SCA_ALWAYS` → 填卡 → Pay Now → 关闭 3DS 弹窗 | `state==='canceled'`，红色取消提示，Pay 按钮重新可用，可重试 | ⬜ |
| T4 | 卡校验错误 | 错误卡号或过期日期 → Pay Now | `state==='failed'`，显示 `data.message`，不误报成功 | ⬜ |
| T5 | capture 非 COMPLETED | DECLINED 场景卡 → Pay Now | 显示 `✗ Capture failed · status: DECLINED`，不误报成功 | ⬜ |
| T6 | POSSIBLE 直 capture | 触发 3DS 且 client `liabilityShift==='POSSIBLE'` | 不调 GET order，直接 capture；console 可见 `[ACDC] 3DS liabilityShift: POSSIBLE` | ⬜ |
| T7 | GET order 分支 | liabilityShift 非 POSSIBLE/undefined | 调 GET order；console.group 打印完整 authentication_result；按决策表（NO+N/U/B→capture，UNKNOWN→retry，else→decline） | ⬜ |
| T8 | 货币切换 | 切换 `#demo-currency` 下拉 | 页面 reload，URL 带 `?currency=&amount=`，金额保留，字段重新加载 | ⬜ |
| T9 | 资格明确不符 | SDK 返回明确 ineligible 信号 | 显示 "Card Fields not available for this account." | ⬜ |
| T10 | 资格 key 缺失 | eligibility 响应中无 `advanced_cards` key | 防御式：卡域仍正常渲染，可完成付款（不误拦） | ⬜ |
| T11 | 金额校验 | 输入非法金额（字母/0/负数/超 30000） | `#amount-error` 显示错误，Pay 按钮不触发 | ⬜ |
| T12 | 零小数位货币 | 切换 JPY → 输入 `100.50` → blur | 金额自动取整为 `101`，不允许小数 | ⬜ |
| T13 | 调试探查 | 打开 DevTools Console → 加载页面 | console 输出 `[ACDC-PROBE] session` / `numberField` / `expiryField` / `cvvField` 完整对象；可展开查看 API | ⬜ |

### 验收标准

- [ ] 所有 T1–T4 通过（核心支付路径）
- [ ] T7 进入 GET order 分支时，console.group 打印所有 3DS 字段（liability_shift / enrollment_status / authentication_status / cavv / eci_indicator）
- [ ] T8 货币切换后字段重新渲染，无报错
- [ ] T11–T12 金额校验行为正确
- [ ] T13 explore 探查日志完整，可在 DevTools 确认 v6 CardFields 字段对象 API 结构

---

## JSSDK v6 BCDC（2026-06-01）

> 路由：`/paypal/jssdk-v6/bcdc-ecm` / `/paypal/jssdk-v6/bcdc-ecs`

| ID | 用例 | 状态 |
|----|------|------|
| B1 | ECM 正常付款（merchant shipping 预填） | ⬜ |
| B2 | ECS 正常付款（buyer 在 sheet 填地址） | ⬜ |
| B3 | 取消付款（关闭 sheet） | ⬜ |
| B4 | 卡错误（onWarn 可恢复） | ⬜ |

---

## JSSDK v6 Standalone Buttons（2026-06-01）

> 路由：`/paypal/jssdk-v6/buttons`

| ID | 用例 | 状态 |
|----|------|------|
| S1 | PayPal 按钮正常付款 | ⬜ |
| S2 | PayLater 按钮正常付款 | ⬜ |
| S3 | BCDC 按钮正常付款 | ⬜ |
| S4 | Venmo 按钮正常付款 | ⬜ |
| S5 | CN/US 双实例顺序加载，无 NotSupportedError | ⬜ |

---

## JSSDK v6 Venmo ECM/ECS（2026-06-01）

> 路由：`/paypal/jssdk-v6/venmo-ecm` / `/paypal/jssdk-v6/venmo-ecs`

| ID | 用例 | 状态 |
|----|------|------|
| V1 | ECM 正常付款 | ⬜ |
| V2 | ECS 正常付款 | ⬜ |
| V3 | 非 US 环境：isEligible('venmo') false，显示 not eligible | ⬜ |

---

## JSSDK v6 PayPal ECM/ECS（2026-05-30）

> 路由：`/paypal/jssdk-v6/paypal-ecm` / `/paypal/jssdk-v6/paypal-ecs`

| ID | 用例 | 状态 |
|----|------|------|
| P1 | ECM 正常付款（merchant shipping） | ⬜ |
| P2 | ECS 正常付款（buyer 填地址） | ⬜ |
| P3 | 取消付款 | ⬜ |
| P4 | Custom Trigger Button 触发付款 | ⬜ |
| P5 | redirect 模式（presentation mode 切换） | ⬜ |
