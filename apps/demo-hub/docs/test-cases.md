# demo-hub — Test Cases

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
