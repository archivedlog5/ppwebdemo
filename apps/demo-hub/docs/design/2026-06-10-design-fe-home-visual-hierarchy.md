# 前端设计 — Demo Hub 首页视觉层级重构

> 日期：2026-06-10
> 类型：前端设计（design-fe）
> 范围：demo-hub 首页（`src/views/index.ejs` + `src/public/css/layout.css`）
> 关联：`DESIGN.md`（设计系统总纲）、`docs/design/2026-05-15-design-be-routing.md`（三层分组数据结构）

---

## 1. 背景与问题

首页按三层结构渲染产品目录：**provider（大类）→ sdk_version（小类）→ demo 卡片**。
用户反馈：分类看不清、不知道有分类、颜色不明显、折叠不明显。

### 1.1 根因诊断 — 层级「倒挂」

读 `layout.css` 现状，三层的视觉权重完全反了：

| 元素 | 现状字号 | 现状颜色 | 问题 |
| --- | --- | --- | --- |
| 大类 provider（`PAYPAL`） | **10px** | `--fg-muted` 灰 `#94A3B8` | 当成小标签渲染 |
| 小类 sdk（`jssdk-v5`） | **9px** | `--fg-subtle` 更暗灰 `#64748B` | 几乎隐形 |
| provider 圆点 | 8px 方块 | 品牌色 | 太小，颜色看不到 |
| 折叠箭头 | 9~11px | `--fg-subtle` | 不明显可折叠 |
| 卡片标题 `h3` | **12px** | `--fg` 亮白 | 比上面两层都更大更亮 |

**结论**：最该突出的「分类标题」反而比卡片标题更小、更灰。用户眼里只看到一片等权重的卡片，上面飘着两行近乎隐形的灰字 → 直接导致「不知道有分类」。

---

## 2. 设计目标（可验证的「完成」定义）

1. 三层层级一眼可辨：尺寸、颜色、缩进三重信号叠加，provider > sdk > 卡片，绝不再倒挂。
2. 每个 provider 是一个**视觉色块分区**，扫一眼就知道页面有几个分区、各是什么颜色。
3. sdk 小类清晰可见，且**同一 provider 下不同 sdk 颜色不同**（同品牌色系深浅变化，不彩虹化）。
4. demo 卡片按所属 sdk 上色，同 provider 下 v5 卡与 v6 卡明显有别但仍属同一品牌色家族。
5. 折叠（provider / sdk 两级）明显可点、可折叠。
6. 深色 + 浅色两套主题都达标，文字对比度 ≥ 4.5:1。
7. 改动只落在 `index.ejs` + `layout.css`，不碰路由、数据、其它页面。

---

## 3. 方案选型

讨论中评估过三档（均经用户确认）：

| 方案 | 描述 | 取舍 |
| --- | --- | --- |
| A 只修层级 | 仅放大标题、加色、放大箭头 | 改动最小，但分区感弱 |
| **B 色块分区（采纳）** | A 的层级修正 + provider 品牌色左边框/淡背景带 + sdk 同色系深浅 + 卡片按 sdk 上色 | 命中全部四个诉求，保留终端风 |
| C 强色彩卡片 | 卡片浓色、标题大色块横幅 | 最显眼但破坏极简沙盒气质 |

**最终决策（用户确认）：**
- 整体方向 = **B 色块分区**
- 卡片配色维度 = **按 sdk 小类**
- sdk 与 provider 品牌色关系 = **同色系深浅变化**

---

## 4. 详细设计

### 4.1 第 1 层 · Provider 大类

```
┌ 4px 品牌色左边框（贯穿整个 provider 段）
│  ▓ 极淡品牌色背景带（rgba 品牌色 ~0.05）
│
│  ● PAYPAL                                   2 demos   ▸
│  └ 12px 品牌色标记   └ 22px 亮白 mono 大写   └ pill   └ 16px 染色箭头
```

| 属性 | 现状 → 目标 |
| --- | --- |
| `provider-name` 字号 | 10px → **22px** |
| `provider-name` 颜色 | `--fg-muted` → **`--fg`**（亮白，两主题都高对比） |
| `provider-name` 字体 | 保持 `--font-mono`、大写、`font-weight:700` |
| `provider-dot` | 8px 方块 → **12px 品牌色标记**（圆点或短色条） |
| 分区色块 | 新增：provider 段 **4px 品牌色左边框** + **极淡品牌色背景带** |
| `provider-count` | 10px → **12px**，放进淡色 pill |
| 折叠箭头 | 9~11px `--fg-subtle` → **~16px 品牌色**，加 hover 圆底 |
| `provider-header` 可点性 | 新增整行 hover 背景（当前仅 sdk 有） |

> **对比度约束**：provider 名称文字始终用 `--fg`，**不**用品牌色作正文字色——
> 避免 Adyen 绿 `#0ABF53` 等低对比品牌色在浅色主题（白底）下文字不可读。
> 品牌色只用于：左边框、背景带、圆点/短条等装饰块。

### 4.2 第 2 层 · SDK 小类

由「隐形灰字」改为**带底色的 chip 标签**，缩进到 provider 左边框内侧。

```
   ┌ 缩进（嵌套在 provider 分区内）
   │  ◗ jssdk-v5                 ▸
   │  └ sdk 深浅色左圆点  └ 13px  └ 染色箭头
   │  └ chip 背景 = 同品牌色系淡色
```

| 属性 | 现状 → 目标 |
| --- | --- |
| `sdk-section-label` 字号 | 9px → **13px** |
| 颜色 | `--fg-subtle` → 提亮（`--fg-muted` 或更亮）|
| 容器样式 | 新增 **chip**：同品牌色系淡色背景 + 圆角 + 内边距 |
| sdk 标记 | 新增 **该 sdk 深浅色左圆点** |
| 缩进 | 新增 `padding-left`，嵌套在 provider 左边框内侧 |
| 折叠箭头 | 放大 + 染该 sdk 深浅色 |

### 4.3 第 3 层 · Demo 卡片（按 sdk 同色系深浅上色）

| 属性 | 现状 → 目标 |
| --- | --- |
| 顶部 2px 渐变条 `--card-accent` | provider 渐变 → **该 sdk 深浅色渐变** |
| 卡片背景 | `--surface` → 叠加**极淡 sdk 色背景调**（rgba sdk 色 ~0.03–0.05）|
| `card-tag` | 保持显示 provider（不改内容，避免范围蔓延）|
| `h3` 标题 | 12px → **13px**（与 sdk 同级、平衡可读性）|
| hover | 保持现有 `translateY(-2px)` + 阴影 |

效果：同一 provider 区内，v5 卡片与 v6 卡片色调明显不同，但都还在该品牌色家族内。

### 4.4 SDK 深浅色表（同色系派生规则）

品牌色基准（取自现有 `layout.css`）：

| provider | 浅基准 | 深基准 |
| --- | --- | --- |
| paypal | `#009CDE` | `#003087` |
| braintree | `#A855F7` | `#7B2FBE` |
| stripe | `#818CF8` | `#635BFF` |
| adyen | `#22C55E` | `#0ABF53` |

按 sdk 在品牌色家族内取一档（浅 → 深，按出现顺序）：

| provider / sdk_version | sdk 深浅色 | 说明 |
| --- | --- | --- |
| `paypal / jssdk-v5` | `#00B5E2`（浅青蓝） | PayPal 蓝家族 · 浅档 |
| `paypal / jssdk-v6` | `#0070BA`（深蓝） | PayPal 蓝家族 · 深档 |
| `braintree / web-sdk` | `#A855F7` | 紫家族 · 浅档 |
| `braintree / graphql` | `#7B2FBE` | 紫家族 · 深档 |
| `stripe / stripe-js` | `#818CF8` | 靛家族 |
| `adyen / web-components` | `#22C55E` | 绿家族 |

**兜底规则**：色表中未列出的 `provider/sdk_version`，用该 provider 的浅基准品牌色，
按其在该 provider 下的索引做明度微调（第 1 个 = 浅基准，第 2 个 = 深基准，第 3 个起在两者间插值）。
→ 新增 sdk 不配色也不会出错，只是退化为品牌色默认档。

---

## 5. 最终层级校验

| 层级 | 字号 | 颜色信号 | 缩进/形态信号 |
| --- | --- | --- | --- |
| Provider | 22px | 品牌色边框 + 背景带 | 顶层，4px 左边框 |
| SDK | 13px | 同色系深浅 chip + 圆点 | 缩进，chip 形态 |
| 卡片标题 | 13px | 卡片按 sdk 色调染色 | 网格内卡片 |

尺寸（22 > 13 = 13）+ 颜色（品牌色 → 深浅色 → 色调）+ 形态（边框 → chip → 卡片）
三重信号叠加，分类不可能再看不见。sdk(13) 与卡片标题(13) 同号但 sdk 以 chip 形态 + 大写 + 字距区分为「标签」，不与卡片标题混淆。

---

## 6. 双主题与可访问性

- 背景带、卡片色调一律用 **rgba(品牌色/sdk 色, 低透明度)** → 深浅主题自动适配。
- 所有正文/标题文字保持 `--fg` / `--fg-muted`，对比度 ≥ 4.5:1（两主题分别验证）。
- 低对比品牌色（Adyen 绿等）只用于装饰块（边框/背景/圆点），绝不作文字色。
- 折叠箭头保留 `aria-expanded` 切换；`prefers-reduced-motion` 下关闭过渡（现状已有，保留）。
- 焦点环（`:focus-visible`）保留现状。

---

## 7. 影响范围

| 文件 | 改动 |
| --- | --- |
| `src/views/index.ejs` | provider-header / sdk-section-label 结构微调；注入 sdk 深浅色（class 或 inline style）；coming-soon 段同步新样式 |
| `src/public/css/layout.css` | provider/sdk/card 三层样式重写；新增分区左边框、背景带、chip、sdk 色调 |
| （可选）sidebar | 若要左侧栏风格同步，另开任务，本次不含 |

**不改动**：路由、Supabase 数据、其它产品页、`base.css` token（仅复用现有 token + 局部新增颜色）。

---

## 8. 实施说明（Opus 限制）

本设计在 Opus 模型下完成（仅 markdown）。
代码实现（改 `index.ejs` + `layout.css`）需切换到非 Opus 模型（如 Sonnet）执行。
实施前建议先 `/design-review` 或人工对照本文档第 5、6 节验收标准。
