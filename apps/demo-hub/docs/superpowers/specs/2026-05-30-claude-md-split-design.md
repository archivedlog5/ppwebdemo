# Spec: demo-hub CLAUDE.md Split

**Date:** 2026-05-30
**Scope:** `apps/demo-hub/`
**Goal:** Trim `CLAUDE.md` from 587 lines to ~230 lines by extracting SDK-specific rules and long reference guides into focused files, without duplicating content.

---

## Problem

`apps/demo-hub/CLAUDE.md` has grown to 587 lines containing:
- General project rules (applicable to all providers)
- JSSDK v5–specific implementation rules (13–19)
- A 175-line step-by-step guide for adding new demos
- Per-product route annotations (~40 lines)
- A JS file → EJS mapping table (~20 lines)

As jssdk-v6 and other providers (Braintree, Stripe, Adyen) are added, the file will keep growing and rules will be harder to find.

---

## Approach: Direction B + Symlinks

**Core principle:** `apps/demo-hub/CLAUDE.md` is the only file loaded from all subdirectory paths (routes, public/js, views). General rules stay there. Only content that is clearly SDK-specific or reference-only moves out.

**Cross-directory coverage problem:** A `CLAUDE.md` placed in `src/routes/paypal/jssdk-v5/` is not loaded when editing files in `src/public/js/paypal/jssdk-v5/` or `src/views/paypal/jssdk-v5/`. Solved with symlinks — one real file, three filesystem entry points.

---

## File Map

### Stays in `apps/demo-hub/CLAUDE.md` (~230 lines)

- Karpathy 4 principles
- App positioning + tech stack table
- Directory structure diagram
- Route naming conventions (3-layer structure, vault naming)
- Factory pattern summary (`createStandardRoute`, `createVaultWithPurchaseRoute`, `buildBody`)
- Supabase product config pattern (startup load, memory Map, access token cache)
- Page design principles
- Response format rule
- General dev rules 1–13 (capture check, constants import, amount passing, currency validation, etc.)
  - Rule 13 (Capture 成功判断) stays here — applies to all PayPal integrations, not just v5
- EJS/JS separation concept + `window.DEMO` injection pattern
- Dev commands
- Memory recovery checklist
- References section — updated to point to new files

### Moves to `docs/guides/add-product.md` (NEW, ~175 lines)

Verbatim content from CLAUDE.md lines 383–557: the complete "新增支付产品 Demo 完整步骤" including:
- Step 1: Create route file (buildBody pattern, vault variants, custom routes)
- Step 2: Create/reuse static JS file (IIFE template)
- Step 3: Create EJS view (template)
- Step 4: Mount route in `app.js`
- Step 5: Insert Supabase row (SQL)
- Step 6: Restart and verify

### Moves to `src/routes/paypal/jssdk-v5/CLAUDE.md` (NEW real file)

Content extracted from `apps/demo-hub/CLAUDE.md`:
- Rules 14–19 (v5-specific):
  - 14: Google Pay ECM Promise mode vs ECS Full Callback mode
  - 15: Google Pay 3DS path (google_pay.card.authentication_result)
  - 16: Google Pay ECS phone format (E.164 → country_code + national_number)
  - 17: Google Pay ECM vs ECS phone source difference
  - 18: Apple Pay flow rules (ECM/ECS differences, completePayment, confirmOrder response shape)
  - 19: Vault Return Buyer — SDK must include `commit=true&buyer-country=US`
- Per-product route annotations block (the long comment listing each custom route's specifics)
- SDK params reference table (all 14 v5 products with their `sdkParams` strings)
- JSSDK v5 file speed-lookup section

### Symlinks (NEW, no new content)

```
src/public/js/paypal/jssdk-v5/CLAUDE.md  →  ../../../../routes/paypal/jssdk-v5/CLAUDE.md
src/views/paypal/jssdk-v5/CLAUDE.md      →  ../../../../routes/paypal/jssdk-v5/CLAUDE.md
```

Both symlinks are committed to git. Claude Code follows symlinks when auto-loading CLAUDE.md files, so editing any `.js` or `.ejs` file under `jssdk-v5/` will load the v5 rules.

### Placeholder stubs (NEW, ~5 lines each)

Each stub contains one line: a pointer back to `apps/demo-hub/CLAUDE.md` for general rules, and a note that SDK-specific rules are TBD.

```
src/routes/paypal/jssdk-v6/CLAUDE.md
src/routes/braintree/CLAUDE.md
src/routes/stripe/CLAUDE.md
src/routes/adyen/CLAUDE.md
```

---

## File Change Summary

| Operation | File | Lines |
|-----------|------|-------|
| Shrink | `apps/demo-hub/CLAUDE.md` | 587 → ~230 |
| New (real) | `docs/guides/add-product.md` | +175 |
| New (real) | `src/routes/paypal/jssdk-v5/CLAUDE.md` | ~180 |
| New (symlink) | `src/public/js/paypal/jssdk-v5/CLAUDE.md` | — |
| New (symlink) | `src/views/paypal/jssdk-v5/CLAUDE.md` | — |
| New (stub) | `src/routes/paypal/jssdk-v6/CLAUDE.md` | ~5 |
| New (stub) | `src/routes/braintree/CLAUDE.md` | ~5 |
| New (stub) | `src/routes/stripe/CLAUDE.md` | ~5 |
| New (stub) | `src/routes/adyen/CLAUDE.md` | ~5 |

Total new files: 9 (2 real, 2 symlinks, 4 stubs, 1 guide).

---

## What Does NOT Change

- Root `CLAUDE.md` and `CLAUDE.en.md` — untouched
- All route, view, and JS source files — untouched
- `docs/design/`, `docs/plans/`, `docs/req/` — untouched
- The JS file → EJS mapping table in `docs/design/2026-05-18-design-be-jssdk-v5-file-map.md` — already exists there; the duplicate in `CLAUDE.md` is removed

---

## Maintenance Rules Going Forward

1. **General rules** → edit `apps/demo-hub/CLAUDE.md`
2. **v5-specific rules** → edit `src/routes/paypal/jssdk-v5/CLAUDE.md` (symlinks update automatically)
3. **Adding a new demo** → follow `docs/guides/add-product.md`
4. **Starting v6** → populate `src/routes/paypal/jssdk-v6/CLAUDE.md`; add symlinks to `public/js/paypal/jssdk-v6/` and `views/paypal/jssdk-v6/`
5. **Starting a new provider** → populate `src/routes/<provider>/CLAUDE.md`
