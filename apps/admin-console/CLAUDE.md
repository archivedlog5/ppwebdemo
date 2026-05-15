# CLAUDE.md — admin-console

> 派生自根目录 `CLAUDE.md`，聚焦 admin-console app。根 CLAUDE.md 的所有通用规则在此同样适用。

## App 定位

admin-console 是整个平台的管理后台，负责：
1. **demo-hub 产品展示配置**：控制哪些支付产品 demo 在首页显示、名称、描述、排序
2. **电商网站支付渠道管理**：控制各电商网站（store-fashion 等）启用哪些支付渠道、渠道顺序
3. **未来扩展**：其他平台级配置管理

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React + Vite |
| UI 组件 | TBD（由 ui-ux-pro-max 设计后确定） |
| 后端 | Node.js + Express |
| 数据库 | Supabase（Auth + 配置存储） |

## 目录结构

```
apps/admin-console/
├── CLAUDE.md                    # 本文件
├── DESIGN.md                    # UI/UX 设计系统（由 /design-consultation 生成）
├── docs/
│   ├── req/                     # 需求文档
│   ├── design/                  # 设计文档（fe/be/db 分开）
│   ├── plans/                   # 实现计划
│   ├── todos.md
│   ├── context.md
│   ├── progress.md
│   ├── debug-log.md
│   └── test-cases.md
├── src/
│   ├── frontend/                # React 前端
│   └── backend/                 # Express 后端 API
├── .env
├── .env.example
└── package.json
```

## Supabase 数据表职责

### `demo_hub_products` — demo-hub 产品展示配置

路由三层结构：`/{provider}/{sdk_version}/{product_key}`

```sql
id           uuid        PRIMARY KEY DEFAULT gen_random_uuid()
provider     text        NOT NULL  -- 'paypal' | 'braintree' | 'stripe' | 'adyen'
sdk_version  text        NOT NULL  -- 'jssdk-v6' | 'jssdk-v5' | 'web-sdk' | 'graphql' 等
product_key  text        NOT NULL  -- 叶子产品 slug，如 'acdc' | 'paypal-button'
display_name text        NOT NULL  -- 首页和产品页显示名称（可编辑）
description  text                  -- 首页卡片描述（可编辑）
enabled      boolean     NOT NULL DEFAULT true
sort_order   integer     NOT NULL DEFAULT 0
created_at   timestamptz NOT NULL DEFAULT now()
updated_at   timestamptz NOT NULL DEFAULT now()

UNIQUE(provider, sdk_version, product_key)  -- 三字段联合唯一
```

**admin-console 可操作字段：** `display_name`、`description`、`enabled`、`sort_order`
**只读字段：** `provider`、`sdk_version`、`product_key`（三者共同绑定代码路由）

### `payment_channels`（待设计）— 电商网站支付渠道配置

各电商网站的支付渠道启用/禁用状态和排序，在 store-fashion 等 app 需求讨论时再设计。

## admin-console 核心功能模块

### 模块 1：demo-hub 产品管理

| 功能 | 描述 |
|------|------|
| 产品列表 | 按 provider 分组展示所有产品，显示 enabled 状态 |
| 启用/禁用 | Toggle 控制首页是否展示该产品 |
| 编辑名称 | 修改 `display_name`（首页卡片和产品页标题） |
| 编辑描述 | 修改 `description`（首页卡片描述） |
| 排序调整 | 上移/下移箭头调整同 provider 内顺序 |
| 只读字段 | `provider` 和 `product_key` 展示但不可编辑 |

**配置变更说明：** 保存后写入 Supabase，重启 demo-hub 后生效。

### 模块 2：电商网站支付渠道管理（待设计）

需在 store-fashion 需求讨论完成后再细化。

## 路由规范（前端 React Router）

```
/                          → 重定向到 /demo-hub
/demo-hub                  → demo-hub 产品管理页
/demo-hub/:provider        → 某个 provider 的产品列表（如 /demo-hub/paypal）
/stores                    → 电商网站列表（待设计）
/stores/:storeName         → 某个电商网站的支付渠道配置（待设计）
```

## 关键开发规则

1. admin-console 只写 Supabase，不直接调用 demo-hub 或电商网站的接口
2. 所有配置变更通过 Supabase 传递，各 app 自行读取
3. 管理员登录通过 Supabase Auth 实现

## 记忆恢复（Memory Compaction 后）

1. 读 `docs/context.md`
2. 读 `docs/todos.md`
3. 读 `docs/progress.md`
4. 读 `docs/debug-log.md`

## 参考文档

- 根项目指南：`../../CLAUDE.md`
- demo-hub 需求：`../demo-hub/docs/req/2026-05-15-req-demo-hub.md`
