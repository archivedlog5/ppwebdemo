# payment-playground — 项目上下文

## 项目目标

构建一个综合支付演示与跨境电商平台，用于：
1. 展示 PayPal、Braintree、Stripe、Adyen 等各支付产品的独立集成方式
2. 提供多种类型跨境电商网站的完整参考实现
3. 通过 admin-console 统一管理各网站的支付渠道配置

## 关键技术决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 仓库结构 | Monorepo + 每 app 独立 CLAUDE.md | 统一管理，各 app 独立演进 |
| Demo Hub 技术栈 | Node.js + Express + EJS + Vanilla JS | 轻量、易读，适合展示支付集成 |
| 电商网站前端 | React + Vite | 现代化，组件复用性强 |
| 数据库 | Supabase（全部 app） | 统一数据层，内置 Auth |
| 文档规范 | 日期前缀 + 类型标签命名 | 便于时序追踪和分类检索 |

## 当前阶段

**Phase 1**：搭建基础架构，完成 demo-hub + store-fashion + admin-console

## 启动时间

2026-05-15
