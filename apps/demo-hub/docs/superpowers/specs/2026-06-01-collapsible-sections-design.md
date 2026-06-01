# Collapsible Sections — Design Spec

**Date:** 2026-06-01  
**Scope:** demo-hub — List 页面 + Demo 详情页侧边栏  
**Status:** Approved

---

## 需求概述

两处 UI 需要可折叠分组：

1. **List 页面 (`/`)** — Provider（paypal、braintree 等）可折叠，Provider 内的 SDK 版本组（jssdk-v5、jssdk-v6 等）也可独立折叠。
2. **Demo 详情页侧边栏** — Provider 标签（paypal）可折叠所有 SDK 组，SDK 标签（jssdk-v6）可折叠该组内的 item 链接。

---

## 设计决策

| 维度 | 决策 | 原因 |
|------|------|------|
| 触发区域 | 整行可点击 + 右侧明显 ▼/▶ 图标 | 命中面积大、图标提供视觉引导 |
| 默认状态 | 全部展开 | 首次访问内容一目了然 |
| 状态持久化 | localStorage | 用户折叠后跨页面导航保持状态 |
| 动画 | max-height + opacity，0.3s ease | 流畅、符合 150–300ms 标准，easing 正确 |
| 移动端 | 横向 tabs（.sidebar-mobile）保持不变 | 滚动式 tabs 无需折叠逻辑 |

---

## 交互规格

### List 页面

- **Provider 标题行**（`.provider-header`）整行可点击
  - 折叠：隐藏该 provider 下所有 SDK 组 + 产品卡片
  - 图标：展开时 `▼`，折叠时 `▶`，置于行末
- **SDK 标签**（`.sdk-section-label`）整行可点击
  - 折叠：只隐藏该 SDK 的 `.product-grid`
  - 图标同上，字号略小
- 两级折叠独立，折叠 provider 不影响各 SDK 的已记忆状态

### 侧边栏

- **`.sidebar-provider`** 整行可点击 → 折叠/展开其下所有 SDK 组 + items
- **`.sidebar-sdk`** 整行可点击 → 只折叠/展开该 SDK 的 `.sidebar-item` 链接
- 图标同 List 页面逻辑

---

## localStorage 结构

```json
// key: "demo_hub_collapse"
{
  "providers": {
    "paypal": true,
    "braintree": false
  },
  "sdks": {
    "paypal/jssdk-v6": true,
    "paypal/jssdk-v5": false
  }
}
```

- `true` = 展开，`false` = 折叠
- 首次访问（无 key）：所有节点默认展开
- 写入时机：每次 toggle 后立即写入

---

## 无障碍要求（来自 ui-ux-pro-max 审查）

所有可折叠触发元素必须：

1. **`role="button"` + `tabindex="0"`** — `<div>` 元素需声明按钮语义
2. **`aria-expanded="true|false"`** — 随状态实时更新
3. **`aria-controls="<body-element-id>"`** — 指向被控制的内容区域
4. **`aria-hidden="true"` on icon** — ▼/▶ 文字图标对屏幕阅读器无意义，需隐藏
5. **`keydown` 处理 Enter/Space** — 键盘用户触发折叠
6. **`:focus-visible` 焦点环** — `outline: 2px solid #009CDE; outline-offset: -2px`

---

## CSS 规格

### 折叠容器

```css
.collapsible-body {
  overflow: hidden;
  max-height: 2000px;      /* 足够大，覆盖最长内容 */
  opacity: 1;
  transition: max-height 0.3s ease, opacity 0.25s ease;
}

.collapsible-body.collapsed {
  max-height: 0;
  opacity: 0;
}
```

### 触发元素通用样式

```css
.provider-header,
.sdk-section-label,
.sidebar-provider,
.sidebar-sdk {
  cursor: pointer;
  user-select: none;
}

.provider-header:hover,
.sdk-section-label:hover { background: #141928; }

/* 焦点环 */
.provider-header:focus-visible,
.sdk-section-label:focus-visible,
.sidebar-provider:focus-visible,
.sidebar-sdk:focus-visible {
  outline: 2px solid #009CDE;
  outline-offset: -2px;
}
```

### prefers-reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  .collapsible-body {
    transition: none;
  }
}
```

### 图标旋转

```css
.collapse-icon {
  font-size: 13px;
  color: #94a3b8;
  transition: transform 0.25s ease;
}

.collapse-icon.expanded {
  transform: rotate(90deg); /* ▶ → ▼ */
}
```

---

## JavaScript 规格（`collapse.js`）

```
public/js/collapse.js — 两个页面共用
```

### 职责

1. 页面加载时读取 localStorage，恢复折叠状态
2. 为所有触发元素绑定 click + keydown 事件
3. toggle 时：
   - 切换 `.collapsible-body.collapsed` class
   - 更新 `aria-expanded`
   - 切换图标 class（`.expanded`）
   - 写入 localStorage
4. 不依赖任何框架，IIFE 封装

### localStorage 读写示意

```js
var LS_KEY = 'demo_hub_collapse'

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || { providers: {}, sdks: {} }
  } catch (e) {
    return { providers: {}, sdks: {} }
  }
}

function saveState(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch (e) {}  // storage quota exceeded — fail silently
}
```

---

## 改动文件清单

| 操作 | 文件 | 改动内容 |
|------|------|---------|
| **NEW** | `src/public/js/collapse.js` | toggle 逻辑、localStorage、aria-expanded 更新、keydown 支持 |
| **EDIT** | `src/views/index.ejs` | provider-header + sdk-section-label 加图标（aria-hidden）、role、tabindex、collapsible wrapper div |
| **EDIT** | `src/views/partials/header.ejs` | sidebar-provider + sidebar-sdk 同上 |
| **EDIT** | `src/public/css/layout.css` | `.collapsible-body` transition、`.collapse-icon` 旋转、`:focus-visible`、`prefers-reduced-motion` |

**不改动的文件：** 路由文件、config、其余 EJS 视图、移动端 `.sidebar-mobile`

---

## 完成标准

- [ ] 点击 List 页面 provider 标题行 → 该 provider 内容折叠/展开，图标旋转
- [ ] 点击 List 页面 SDK 标签 → 只折叠/展开该 SDK 的产品卡片
- [ ] 折叠后刷新页面 → 状态保持（localStorage）
- [ ] 侧边栏 provider / SDK 标签同样可折叠
- [ ] Tab 键可聚焦到折叠触发元素，Enter/Space 触发折叠
- [ ] 焦点时有蓝色焦点环
- [ ] 系统"减少动态效果"时动画不触发
- [ ] 移动端横向 tabs 不受影响
