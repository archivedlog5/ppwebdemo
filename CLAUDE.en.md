# CLAUDE.en.md — payment-playground Project Guide

> This is the English version of `CLAUDE.md`. Both files must be kept in sync — any update to `CLAUDE.md` must be reflected here immediately.

## Project Overview

**payment-playground** is a comprehensive payment demo and cross-border e-commerce monorepo, containing:

- **demo-hub**: Standalone integration demos for PayPal, Braintree, Stripe, Adyen, and other payment products
- **store-fashion**: Fashion cross-border e-commerce site (Phase 1 prototype)
- **admin-console**: Payment channel management admin console

Remaining e-commerce site types (electronics, AI subscription, short drama, reading, airline, travel) are listed in `docs/pending.md` and will be launched incrementally.

---

## Directory Structure

```
payment-playground/
├── CLAUDE.md                        # Root project guide in Chinese (source of truth)
├── CLAUDE.en.md                     # Root project guide in English (this file)
├── docs/                            # Global documentation
│   ├── context.md                   # Project goals and decision log
│   ├── progress.md                  # Global progress journal
│   └── pending.md                   # Pending app list and priorities
├── apps/
│   ├── demo-hub/                    # Payment product demo collection
│   │   ├── CLAUDE.md
│   │   ├── docs/
│   │   │   ├── req/
│   │   │   ├── design/
│   │   │   ├── plans/
│   │   │   ├── todos.md
│   │   │   ├── context.md
│   │   │   ├── progress.md
│   │   │   ├── debug-log.md
│   │   │   └── test-cases.md
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── paypal/          # jssdk-v5, jssdk-v6, acdc, applepay,
│   │       │   │                    # googlepay, vault, apm, invoice, ...
│   │       │   ├── braintree/       # dropin-ui, hosted-fields, ...
│   │       │   ├── stripe/
│   │       │   └── adyen/
│   │       └── views/               # EJS templates
│   ├── store-fashion/               # Fashion e-commerce (React + Supabase)
│   │   ├── CLAUDE.md
│   │   └── docs/
│   │       ├── req/
│   │       ├── design/
│   │       ├── plans/
│   │       ├── todos.md
│   │       ├── context.md
│   │       ├── progress.md
│   │       ├── debug-log.md
│   │       └── test-cases.md
│   └── admin-console/               # Payment channel admin console (React + Supabase)
│       ├── CLAUDE.md
│       └── docs/
│           ├── req/
│           ├── design/
│           ├── plans/
│           ├── todos.md
│           ├── context.md
│           ├── progress.md
│           ├── debug-log.md
│           └── test-cases.md
└── shared/                          # Shared utilities, type definitions, constants
```

---

## Tech Stack

| App | Frontend | Backend | Database | Templating |
|-----|----------|---------|----------|------------|
| demo-hub | Vanilla JS | Node.js + Express | Supabase | EJS |
| store-fashion | React + Vite | Node.js + Express | Supabase | — |
| admin-console | React + Vite | Node.js + Express | Supabase | — |

**Supabase config: single project, multi-schema isolation**

Supabase free plan is limited to 2 projects. All data lives in one project, isolated by PostgreSQL schema:

| Schema | Owner | Key tables |
|--------|-------|-----------|
| `demohub` | demo-hub | `products` (display config) |
| `admin` | admin-console | `stores`, `payment_channels` |
| `fashion` | store-fashion | `profiles`, `orders` |
| `auth` | Supabase built-in | `users` (shared across all apps) |
| `public` | Shared | `update_updated_at()` helper function |

See: `docs/design/2026-05-15-design-db-supabase.md`

**admin-console → demo-hub config relationship:**
- admin-console writes to the `demohub.products` table (display_name, description, enabled, sort_order)
- demo-hub reads this table once at startup to determine which products appear on the homepage, their names, and their order
- Config changes take effect after restarting demo-hub (read once at startup, cached in memory)
- `product_key` (route slug) is bound to code routes — admin-console can read but not modify it
- In-memory Map key format: `provider/sdk_version/product_key` (e.g. `paypal/jssdk-v5/spb-ecm`)
- Unique constraint: `UNIQUE(provider, sdk_version, product_key)` (three-field composite)

---

## File Naming Conventions

### Requirements Documents
```
docs/req/YYYY-MM-DD-req-<topic>.md
```
Example: `docs/req/2026-05-15-req-demo-hub-paypal.md`

### Design Documents — Frontend and Backend Separated
```
docs/design/YYYY-MM-DD-design-fe-<topic>.md   # Frontend design
docs/design/YYYY-MM-DD-design-be-<topic>.md   # Backend / API design
docs/design/YYYY-MM-DD-design-db-<topic>.md   # Database schema design
```
Examples:
- `docs/design/2026-05-15-design-fe-store-fashion.md`
- `docs/design/2026-05-15-design-be-demo-hub.md`
- `docs/design/2026-05-15-design-db-supabase.md`

### Implementation Plans
```
docs/plans/YYYY-MM-DD-plan-<topic>-v<n>.md
```
Example: `docs/plans/2026-05-15-plan-demo-hub-v1.md`

### Fixed Documents (required in every app)
| File | Purpose |
|------|---------|
| `docs/todos.md` | Task checklist with checkboxes — check off on completion |
| `docs/context.md` | App goal, tech stack, and key decisions |
| `docs/progress.md` | Progress journal updated after each work session |
| `docs/debug-log.md` | Error log and resolution records |
| `docs/test-cases.md` | Test case descriptions and results |

---

## gstack Skills Workflow

Follow this sequence when starting any new app or feature module.

**After every phase, run the `find-skills` process:**
1. Search for high-scoring skills relevant to the current phase
2. Evaluate which skills can genuinely help with the current work (not everything found needs to be installed)
3. Install the valuable ones
4. **Immediately invoke the installed skills to serve the current phase** — installation is not the end goal, usage is

### Phase 1 — Requirements
```
/office-hours        → Discuss ideas, validate whether the requirement is worth building
/brainstorming       → Explore approaches, produce a spec design document
```
After phase: run find-skills → search "requirements / app domain" skills → evaluate → install → **invoke installed skills to refine requirements doc**
Output: `docs/req/YYYY-MM-DD-req-<topic>.md`

### Phase 2 — UI/UX Design
**All pages must go through the UI/UX skills process. This step cannot be skipped.**
```
ui-ux-pro-max        → Act as UI/UX expert to design pages (50+ styles, 161 palettes, 57 font pairings)
/design-consultation → Create the app's design system and DESIGN.md (first time per app)
/design-shotgun      → Generate multiple design variants for comparison
/plan-design-review  → Review UI/UX plan from a designer's perspective
frontend-design      → Review UI/UX patterns and produce high-quality frontend design specs
```
After phase: run find-skills → search "UI/UX / design system / frontend" skills → evaluate → install → **invoke installed skills to improve design output**
Output: `docs/design/YYYY-MM-DD-design-fe-<topic>.md`, `DESIGN.md` (in each app root)

### Phase 3 — Backend & Database Design
```
/plan-eng-review     → Review architecture from an engineering perspective
/plan-ceo-review     → Review plan from a product/business perspective
```
After phase: run find-skills → search "backend / Supabase / API / database" skills → evaluate → install → **invoke installed skills to optimize API design and DB schema**
Output: `docs/design/YYYY-MM-DD-design-be-<topic>.md`, `docs/design/YYYY-MM-DD-design-db-<topic>.md`

### Phase 4 — Planning
```
/writing-plans       → Generate a step-by-step implementation plan
/autoplan            → Auto-run the full review gauntlet
```
After phase: run find-skills → search "planning / task breakdown / implementation" skills → evaluate → install → **invoke installed skills to refine the implementation plan**
Output: `docs/plans/YYYY-MM-DD-plan-<topic>-v<n>.md`

### Phase 5 — Todo Generation
Break down the plan into `docs/todos.md` (categorized checkboxes with date labels)
After phase: run find-skills → search "automation / scaffolding / code generation" skills → evaluate → install → **invoke installed skills to assist project initialization**

### Phase 6 — Development
```
/qa              → Test and fix bugs
/design-review   → Visual QA, fix design issues (verify against ui-ux-pro-max output)
/review          → PR review before landing
/investigate     → Systematic debugging
```
After phase: run find-skills → search "testing / QA / security" skills → evaluate → install → **invoke installed skills to improve code quality and test coverage**

### Phase 7 — Release
```
/ship            → Ship workflow (version bump, changelog, PR)
/canary          → Post-deploy monitoring
/document-release → Update documentation
```
After phase: run find-skills → search "monitoring / deployment / docs" skills → evaluate → install → **invoke installed skills to strengthen deploy and monitoring workflows**

---

## Routing Conventions

### demo-hub — Three-Level Route Structure (all providers)

Route format: `/{provider}/{sdk_version}/{product_key}`

Each payment product must have its own Express router file. File path mirrors the URL exactly:

```
/paypal/jssdk-v6/paypal-button  → routes/paypal/jssdk-v6/paypal-button.js
/paypal/jssdk-v6/paylater       → routes/paypal/jssdk-v6/paylater.js
/paypal/jssdk-v6/venmo          → routes/paypal/jssdk-v6/venmo.js
/paypal/jssdk-v6/bcdc           → routes/paypal/jssdk-v6/bcdc.js
/paypal/jssdk-v6/acdc           → routes/paypal/jssdk-v6/acdc.js
/paypal/jssdk-v6/apple-pay      → routes/paypal/jssdk-v6/apple-pay.js
/paypal/jssdk-v6/google-pay     → routes/paypal/jssdk-v6/google-pay.js
/paypal/jssdk-v6/vault          → routes/paypal/jssdk-v6/vault.js
/paypal/jssdk-v5/paypal-button  → routes/paypal/jssdk-v5/paypal-button.js
/paypal/jssdk-v5/acdc           → routes/paypal/jssdk-v5/acdc.js
/braintree/web-sdk/dropin-ui    → routes/braintree/web-sdk/dropin-ui.js
/braintree/web-sdk/hosted-fields→ routes/braintree/web-sdk/hosted-fields.js
/braintree/graphql/<product>    → routes/braintree/graphql/<product>.js (reserved)
/stripe/stripe-js/<product>     → routes/stripe/stripe-js/<product>.js (reserved)
/adyen/web-components/<product> → routes/adyen/web-components/<product>.js (reserved)
```

**Naming conventions:**

| Level | Rule | Example |
|-------|------|---------|
| provider | lowercase, no hyphens | `paypal`, `braintree` |
| sdk_version | lowercase + kebab-case | `jssdk-v6`, `web-sdk`, `graphql` |
| product_key | lowercase + kebab-case | `paypal-button`, `acdc`, `apple-pay` |

Rules:
- Each router file handles exactly one product's logic — **cross-product sharing is not allowed**
- Filename = `product_key` (e.g. `acdc.js`, `apple-pay.js`)
- Each product has its own EJS view: `views/paypal/jssdk-v5/acdc.ejs`
- Supabase `demohub.products` uses `(provider, sdk_version, product_key)` as the unique composite key
- **EJS/JS separation**: EJS injects `window.DEMO = { urls: {...} }` only; SDK logic lives in `public/js/<provider>/<sdk>/<product>.js`, shareable across multiple products

### E-commerce Sites — Isolated Route Prefix Per Site

Each e-commerce site uses an isolated route prefix on both the React frontend and the Express backend API:

```
Frontend routes (React Router):
/fashion/*         → all pages for store-fashion
/electronics/*     → all pages for store-electronics (pending)
...

Backend API routes (Express):
/api/fashion/*     → all APIs for store-fashion
/api/electronics/* → all APIs for store-electronics (pending)
...
```

Rules:
- Each e-commerce site is an independent React app (`apps/store-<name>/`) — **no shared frontend entry point**
- Backend API routes are strictly isolated by prefix
- Payment channel config is written to Supabase via admin-console and read at runtime by each site

---

## Runtime Architecture

### Development mode (each app on its own port)

```bash
npm run dev:demo-hub    # → http://localhost:3000
npm run dev:fashion     # → http://localhost:5173  (Vite HMR)
npm run dev:admin       # → http://localhost:5174  (Vite HMR)
```

Each app runs fully independently. Vite dev server provides hot module replacement (HMR) for React apps.

### Production mode (unified gateway, single port)

Root `server.js` is the only entry point, mounting all apps on one port (443 or internal port behind a reverse proxy):

```
node server.js   (PORT=3000 local / PORT=443 production)
  /              → demo-hub (EJS server-rendered)
  /fashion/*     → store-fashion React dist static + /api/fashion/* API
  /electronics/* → store-electronics (future, same pattern)
```

**admin-console is always deployed separately** — it's an internal tool on its own domain or port, never included in this gateway.

Production deploy flow:
```bash
npm run build:fashion    # → apps/store-fashion/dist/
npm start                # node server.js
```

### Architecture diagram

```
Development                       Production
─────────────────────────────     ────────────────────────────────────
localhost:3000  demo-hub          PORT:3000/443  server.js (gateway)
localhost:5173  store-fashion  →    /            demo-hub EJS routes
localhost:5174  admin-console       /fashion/*   store-fashion dist/
                                    /api/fashion/ store-fashion API
                                  [separate]  admin-console
```

---

## Adding a New E-commerce Store

Follow these steps every time a new store is added (e.g., `store-electronics`):

### Step 1: Plan & Design (discuss before coding)
- [ ] Run `/office-hours` + `/brainstorming` for requirements
- [ ] Run `ui-ux-pro-max` + `/design-consultation` for UI/UX
- [ ] Run `/writing-plans` for implementation plan
- [ ] Create `apps/store-<name>/docs/` req/design/plans/todos files

### Step 2: Create React project
```bash
cd apps
npm create vite@latest store-<name> -- --template react
cd store-<name> && npm install
```

Set path prefix in `vite.config.js` (**critical — wrong base breaks production assets**):
```js
export default { base: '/<name>/' }
```

Set basename in React Router:
```jsx
<BrowserRouter basename="/<name>">
```

### Step 3: Supabase schema
```sql
CREATE SCHEMA IF NOT EXISTS <name>;
CREATE TABLE <name>.profiles ( ... );  -- see docs/design/2026-05-15-design-db-supabase.md
CREATE TABLE <name>.orders ( ... );
ALTER TABLE <name>.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE <name>.orders FORCE ROW LEVEL SECURITY;
CREATE POLICY "own_orders" ON <name>.orders FOR ALL USING ((select auth.uid()) = user_id);
-- Dashboard → Settings → API → Exposed schemas: add <name>
-- Run GRANT SQL (same pattern as demohub)
INSERT INTO admin.stores (store_type, display_name, enabled) VALUES ('<name>', 'Display Name', true);
```

### Step 4: Mount in gateway (`server.js`)
```js
const <name>Dist = path.join(__dirname, 'apps/store-<name>/dist')
if (fs.existsSync(<name>Dist)) {
  app.use('/api/<name>', require('./apps/store-<name>/src/routes'))
  app.use('/<name>', express.static(<name>Dist))
  app.get('/<name>/*', (req, res) => res.sendFile(path.join(<name>Dist, 'index.html')))
}
```

Add scripts to root `package.json`:
```json
"dev:<name>": "cd apps/store-<name> && npm run dev",
"build:<name>": "cd apps/store-<name> && npm run build"
```

### Step 5: Verify
```bash
npm run dev:<name>          # standalone: http://localhost:5173
npm run build:<name>
npm start                   # via gateway: http://localhost:3000/<name>/
```

---

## Adding a New Payment Demo

Every time a new payment product is added to demo-hub:

### Step 1: Route file
```js
// apps/demo-hub/src/routes/<provider>/<sdk>/<product>.js
const { createStandardRoute } = require('./_factory')
module.exports = createStandardRoute({
  productKey: '<product>',
  sdkParams:  'components=buttons&currency=USD',
  view:       '<provider>/<sdk>/<product>',
})
```

Custom products (CardFields, dual-SDK, Vault setup-only) — reference existing custom route files.

### Step 2: EJS view
Create `apps/demo-hub/src/views/<provider>/<sdk>/<product>.ejs`.
Use `views/paypal/jssdk-v5/spb-ecm.ejs` as template.

### Step 3: Mount route in `app.js`
```js
app.use(v5, require('./routes/paypal/jssdk-v5/<product>'))
```

### Step 4: Insert Supabase row
```sql
INSERT INTO demohub.products (provider, sdk_version, product_key, display_name, description, enabled, sort_order)
VALUES ('<provider>', '<sdk>', '<product>', 'Display Name', 'Short description', true, <order>);
```

### Step 5: Restart demo-hub
```bash
npm run dev:demo-hub     # nodemon auto-restarts, or type 'rs'
```

The homepage will automatically show the new product card.

---

## Adding a New Provider (e.g., Braintree GraphQL)

1. Create: `apps/demo-hub/src/routes/braintree/graphql/`
2. Add in `app.js`: `app.use('/braintree/graphql', require('./routes/braintree/graphql/index'))`
3. Create view directory: `views/braintree/graphql/`
4. Insert rows in Supabase with `sdk_version='graphql'`
5. Restart — homepage auto-groups the new provider

---

## New App Launch Checklist

Run this checklist in order every time a new app is started (e.g., `store-fashion`, `admin-console`):

**Requirements Phase**
- [ ] Invoke `/office-hours` to discuss requirements
- [ ] Invoke `/brainstorming` to produce a requirements spec
- [ ] Create `docs/req/YYYY-MM-DD-req-<app>.md`
- [ ] Run find-skills: search domain-relevant skills → evaluate → install → **invoke to refine requirements**

**UI/UX Design Phase (mandatory for all pages)**
- [ ] Invoke `ui-ux-pro-max` to design UI/UX style, color palette, and typography for all pages
- [ ] Invoke `/design-consultation` to create `DESIGN.md` (first time per app)
- [ ] Invoke `/design-shotgun` to generate multiple design variants
- [ ] Invoke `frontend-design` to produce frontend design specifications
- [ ] Create `docs/design/YYYY-MM-DD-design-fe-<app>.md`
- [ ] Run find-skills: search design/UI skills → evaluate → install → **invoke to improve design output**

**Backend & Database Design Phase**
- [ ] Invoke `/plan-eng-review` to review architecture
- [ ] Invoke `/plan-ceo-review` to review product direction
- [ ] Create `docs/design/YYYY-MM-DD-design-be-<app>.md`
- [ ] Create `docs/design/YYYY-MM-DD-design-db-<app>.md`
- [ ] Run find-skills: search backend/Supabase/API skills → evaluate → install → **invoke to optimize API and DB design**

**Planning & Todo Phase**
- [ ] Invoke `/writing-plans` to generate implementation plan
- [ ] Create `docs/plans/YYYY-MM-DD-plan-<app>-v1.md`
- [ ] Populate `docs/todos.md` from the plan (categorized checkboxes)
- [ ] Run find-skills: search implementation/testing skills → evaluate → install → **invoke to assist project initialization**

**Ready to Develop**
- [ ] Create this app's `CLAUDE.md` (derived from root CLAUDE.md, focused on this app)
- [ ] Confirm route structure follows the Routing Conventions section above

---

## Sub-Agent Routing

| Task Domain | Sub-Agent Type |
|-------------|---------------|
| Backend (Node.js, Supabase, payment integration) | `general-purpose` |
| Frontend (React, Vite, UI components) | `general-purpose` |
| Code review and simplification | `code-simplifier` |
| Large-scale parallel tasks | `superpowers:dispatching-parallel-agents` |

---

## Development Methodology

### Test-Driven Development (TDD)
- Invoke `superpowers:test-driven-development` before writing any implementation code
- Write test → watch it fail → implement → watch it pass
- Record all test results in `docs/test-cases.md`

### Systematic Debugging
- Invoke `superpowers:systematic-debugging` for any bug or unexpected behavior
- Log issue and resolution in `docs/debug-log.md`

### Code Review
- Invoke `superpowers:requesting-code-review` after completing each feature
- Invoke `superpowers:verification-before-completion` before marking any task done

---

## Session Resume (After Memory Compaction)

When resuming a session or after context compression, read in order:

1. `docs/context.md` — re-establish project goals
2. Current app's `docs/todos.md` — identify remaining tasks
3. Current app's `docs/progress.md` — understand where work left off
4. Current app's `docs/debug-log.md` — known issues

Continue from the last breakpoint. Do not restart or duplicate completed work.

---

## Pending Apps

See `docs/pending.md` for details. The following apps require requirements discussion before launch:

| App | Type | Status |
|-----|------|--------|
| store-electronics | Electronics e-commerce | Pending |
| store-ai-subscription | AI subscription service | Pending |
| store-short-drama | Short drama platform | Pending |
| store-reading | Reading platform | Pending |
| store-airline | Airline booking | Pending |
| store-travel | Custom travel | Pending |

Every app must complete the full New App Launch Checklist before coding begins.

---

## Git Rules

### Only commit when explicitly instructed
**Do NOT auto-commit after completing any task.** Only run `git commit` and `git push` when the user explicitly says "commit", "git commit", "push", or equivalent. Never commit proactively.

### .gitignore conventions
The following must not be tracked in version control:
- Playwright screenshots (`*.png`, `*.jpeg`, `.playwright-mcp/`, `playwright-report/`)
- Environment variable files (`.env`, `.env.local`)
- `node_modules/`, `dist/`, `build/`
- Temporary mockup files (`/tmp/*.html`)
- OS files (`.DS_Store`)

---

## Hooks

### PostToolUse — Auto Format
Run automatically after file edits:
- `prettier --write` (JS/TS/CSS/JSON)
- `eslint --fix` (JS/TS)

---

## Reference

- `prompt/` folder: reference markdown files prepared by the user — check before each task
- Available gstack skills: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`,
  `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`,
  `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`,
  `/open-gstack-browser`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`,
  `/setup-deploy`, `/retro`, `/investigate`, `/document-release`, `/codex`,
  `/cso`, `/autoplan`, `/pair-agent`, `/careful`, `/freeze`, `/guard`, `/unfreeze`,
  `/gstack-upgrade`, `/learn`, `/brainstorming`, `/writing-plans`
