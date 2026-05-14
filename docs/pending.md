# Pending Apps — 待启动应用列表

每个 app 启动前需完整走一遍 CLAUDE.md 中的"新 App 启动检查清单"，
包括需求讨论、设计文档、实现计划、todos 文件，再开始编码。

## 电商网站

| App 目录名 | 类型 | 核心支付场景 | 优先级 | 状态 |
|-----------|------|------------|--------|------|
| store-electronics | 电子产品电商 | 大额、分期、B2C | P2 | 待启动 |
| store-ai-subscription | AI 订阅服务 | 订阅、自动续费、Vault | P2 | 待启动 |
| store-short-drama | 短剧平台 | 小额高频、APM、本地支付 | P3 | 待启动 |
| store-reading | 阅读平台 | 订阅、积分、APM | P3 | 待启动 |
| store-airline | 航空公司 | 大额、分期、行程险 | P3 | 待启动 |
| store-travel | 旅游定制化 | 大额、分期、多币种 | P3 | 待启动 |

## Demo Hub 待补充产品

启动 demo-hub 需求讨论时，以下产品需逐一确认集成方式：

### PayPal
- [ ] JSSDK v5
- [ ] JSSDK v6
- [ ] ACDC（Advanced Credit/Debit Card）
- [ ] Apple Pay
- [ ] Google Pay
- [ ] Vault（支付方式保存）
- [ ] APM（Alternative Payment Methods）
- [ ] Invoice（发票支付）
- [ ] 其他（待补充）

### Braintree
- [ ] Drop-in UI
- [ ] Hosted Fields
- [ ] 其他（待补充）

### 竞争对手
- [ ] Stripe（Elements、Payment Intents 等）
- [ ] Adyen（Web Components 等）
- [ ] 其他（待补充）

## 说明

- 列表会随需求讨论更新
- 每次讨论一个 app，完成一个再启动下一个
- 优先级：P1=当前阶段，P2=第二阶段，P3=第三阶段
