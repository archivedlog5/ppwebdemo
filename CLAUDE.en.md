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

**Supabase usage:**
- demo-hub: API key/config storage
- store-fashion: User authentication (Auth), simple order management
- admin-console: Payment channel configuration, on/off status, channel ordering per site

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

### demo-hub — One Route File Per Payment Product

Each payment product must have its own Express router file, mounted at the corresponding path:

```
/paypal/jssdk-v5          → routes/paypal/jssdk-v5.js
/paypal/jssdk-v6          → routes/paypal/jssdk-v6.js
/paypal/acdc              → routes/paypal/acdc.js
/paypal/applepay          → routes/paypal/applepay.js
/paypal/googlepay         → routes/paypal/googlepay.js
/paypal/vault             → routes/paypal/vault.js
/paypal/apm               → routes/paypal/apm.js
/paypal/invoice           → routes/paypal/invoice.js
/braintree/dropin-ui      → routes/braintree/dropin-ui.js
/braintree/hosted-fields  → routes/braintree/hosted-fields.js
/stripe/<product>         → routes/stripe/<product>.js
/adyen/<product>          → routes/adyen/<product>.js
```

Rules:
- Each router file handles exactly one product's logic — **cross-product sharing is not allowed**
- Router filenames must match the URL path segment (kebab-case)
- Each product has its own EJS views directory: `views/paypal/jssdk-v5/`

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
