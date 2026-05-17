/**
 * Production Gateway — payment_playground
 *
 * 统一入口，把所有 app 挂载到同一端口（生产 443）。
 * 开发模式：各 app 独立端口（demo-hub:3000, store-fashion:5173 等）。
 *
 * 路由结构：
 *   /                → demo-hub (EJS, all payment demos)
 *   /fashion/*       → store-fashion React build (静态文件)
 *   /api/fashion/*   → store-fashion Express API
 *   /electronics/*   → 未来其他电商站（结构相同）
 *
 * admin-console 始终独立部署（不在此 gateway 内）。
 */

require('dotenv').config()
const express = require('express')
const path    = require('path')

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── 收集所有 loadProductConfig 函数，统一在启动时调用 ────────────────
const bootTasks = []

// ── demo-hub (挂载到 /) ──────────────────────────────────────────────
const { app: demohubApp, loadProductConfig } = require('./apps/demo-hub/src/app')
bootTasks.push(loadProductConfig)
app.use('/', demohubApp)

// ── store-fashion (挂载到 /fashion) ──────────────────────────────────
// 开发时 Vite 独立跑在 5173；生产时 build 后由此服务静态文件。
const fashionDist = path.join(__dirname, 'apps/store-fashion/dist')
try {
  const fs = require('fs')
  if (fs.existsSync(fashionDist)) {
    // API routes (server-side, 先挂 API 再挂静态，避免 /api 被静态文件拦截)
    // app.use('/api/fashion', require('./apps/store-fashion/src/routes'))

    // React 静态文件
    app.use('/fashion', express.static(fashionDist))

    // React Router fallback（所有 /fashion/* 都回到 index.html）
    app.get('/fashion/*', (req, res) => {
      res.sendFile(path.join(fashionDist, 'index.html'))
    })
    console.log('[gateway] store-fashion dist found, serving at /fashion')
  } else {
    console.log('[gateway] store-fashion dist not found, skipping (run: cd apps/store-fashion && npm run build)')
  }
} catch (e) {
  console.log('[gateway] store-fashion not yet created, skipping')
}

// ── 未来电商站在此按相同模式添加 ────────────────────────────────────
// const electronicsDist = path.join(__dirname, 'apps/store-electronics/dist')
// app.use('/electronics', express.static(electronicsDist))
// app.get('/electronics/*', (req, res) => res.sendFile(path.join(electronicsDist, 'index.html')))

// ── 启动 ─────────────────────────────────────────────────────────────
async function start() {
  // 串行执行所有 app 的初始化（加载 Supabase 配置等）
  for (const task of bootTasks) {
    await task()
  }
  const port = process.env.PORT || 3000
  app.listen(port, () => {
    console.log(`[gateway] payment_playground running at http://localhost:${port}`)
    console.log(`  demo-hub  → http://localhost:${port}/`)
    console.log(`  fashion   → http://localhost:${port}/fashion/`)
  })
}

start().catch(err => {
  console.error('[gateway] Startup failed:', err)
  process.exit(1)
})
