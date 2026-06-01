# Collapsible Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two-level collapsible UI (provider + SDK) to the demo-hub list page and demo detail sidebar, with localStorage persistence and full keyboard/ARIA accessibility.

**Architecture:** Shared `collapse.js` reads `data-collapse-provider` / `data-collapse-sdk` attributes to locate toggle triggers; CSS `max-height` + `opacity` transition on `.collapsible-body` wrappers; state JSON stored in localStorage under key `demo_hub_collapse`. Both list page and sidebar share the same JS file — no page-specific branching needed.

**Tech Stack:** Vanilla JS (IIFE, no dependencies), EJS, native CSS, localStorage.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/public/js/collapse.js` | **CREATE** | All toggle logic, localStorage read/write, keyboard (Enter/Space), ARIA updates |
| `src/public/css/layout.css` | **MODIFY** | `.collapsible-body`, `.collapse-icon`, cursor/hover, `:focus-visible`, `prefers-reduced-motion` |
| `src/views/index.ejs` | **MODIFY** | Wrap provider+SDK content in collapsible divs; add icons + data/ARIA attrs; add script include |
| `src/views/partials/header.ejs` | **MODIFY** | Same treatment for desktop sidebar |
| `src/views/partials/footer.ejs` | **MODIFY** | Add `collapse.js` script include for all demo pages |

---

## Task 1: CSS — Add collapsible styles

**Files:**
- Modify: `src/public/css/layout.css`

- [ ] **Step 1: Append collapse rules to the end of layout.css**

```css
/* ── Collapsible Sections ── */
.collapsible-body {
  overflow: hidden;
  max-height: 2000px;
  opacity: 1;
  transition: max-height 0.3s ease, opacity 0.25s ease;
}

.collapsible-body.collapsed {
  max-height: 0;
  opacity: 0;
}

/* Trigger elements: pointer + no text-select */
.provider-header,
.sdk-section-label,
.sidebar-provider,
.sidebar-sdk {
  cursor: pointer;
  user-select: none;
}

/* Hover backgrounds */
.sdk-section-label:hover { background: var(--surface2); }
.sidebar-provider:hover  { background: var(--surface2); }
.sidebar-sdk:hover       { background: var(--surface2); }

/* Sidebar rows: flex so icon aligns right */
.sidebar-provider,
.sidebar-sdk {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* sdk-section-label: flex for inline icon */
.sdk-section-label {
  display: flex;
  align-items: center;
}

/* Arrow icon */
.collapse-icon {
  font-size: 11px;
  color: var(--fg-subtle);
  transition: transform 0.25s ease;
  flex-shrink: 0;
  margin-left: auto;
}

.collapse-icon.expanded {
  transform: rotate(90deg);
}

/* sdk-section-label icon slightly smaller */
.sdk-section-label .collapse-icon {
  font-size: 9px;
}

/* Focus rings (keyboard navigation) */
.provider-header:focus-visible,
.sdk-section-label:focus-visible,
.sidebar-provider:focus-visible,
.sidebar-sdk:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* Respect system motion preference */
@media (prefers-reduced-motion: reduce) {
  .collapsible-body,
  .collapse-icon {
    transition: none;
  }
}
```

- [ ] **Step 2: Verify file reads without error**

```bash
node -e "require('fs').readFileSync('apps/demo-hub/src/public/css/layout.css','utf8'); console.log('OK')"
```

Expected output: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/demo-hub/src/public/css/layout.css
git commit -m "style(demo-hub): add collapsible section CSS — transition, focus ring, reduced-motion"
```

---

## Task 2: Create collapse.js

**Files:**
- Create: `src/public/js/collapse.js`

- [ ] **Step 1: Create the file with full implementation**

```js
;(function () {
  'use strict'

  var LS_KEY = 'demo_hub_collapse'

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY)) || { providers: {}, sdks: {} }
    } catch (e) {
      return { providers: {}, sdks: {} }
    }
  }

  function saveState(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)) } catch (e) {}
  }

  function applyState(trigger, body, expanded) {
    var icon = trigger.querySelector('.collapse-icon')
    if (expanded) {
      body.classList.remove('collapsed')
      trigger.setAttribute('aria-expanded', 'true')
      if (icon) icon.classList.add('expanded')
    } else {
      body.classList.add('collapsed')
      trigger.setAttribute('aria-expanded', 'false')
      if (icon) icon.classList.remove('expanded')
    }
  }

  function wireToggle(trigger, body, key, bucket, state) {
    // Apply saved state on page load; undefined = first visit = expanded
    var saved = bucket[key]
    applyState(trigger, body, saved === undefined ? true : saved)

    function toggle() {
      var nowExpanded = body.classList.contains('collapsed') // was collapsed → now expand
      applyState(trigger, body, nowExpanded)
      bucket[key] = nowExpanded
      saveState(state)
    }

    trigger.addEventListener('click', toggle)
    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggle()
      }
    })
  }

  document.addEventListener('DOMContentLoaded', function () {
    var state = loadState()

    document.querySelectorAll('[data-collapse-provider]').forEach(function (trigger) {
      var key  = trigger.getAttribute('data-collapse-provider')
      var body = document.getElementById(trigger.getAttribute('aria-controls'))
      if (body) wireToggle(trigger, body, key, state.providers, state)
    })

    document.querySelectorAll('[data-collapse-sdk]').forEach(function (trigger) {
      var key  = trigger.getAttribute('data-collapse-sdk')
      var body = document.getElementById(trigger.getAttribute('aria-controls'))
      if (body) wireToggle(trigger, body, key, state.sdks, state)
    })
  })
})()
```

- [ ] **Step 2: Check syntax**

```bash
node -c apps/demo-hub/src/public/js/collapse.js && echo "Syntax OK"
```

Expected output: `Syntax OK`

- [ ] **Step 3: Commit**

```bash
git add apps/demo-hub/src/public/js/collapse.js
git commit -m "feat(demo-hub): collapse.js — toggle, localStorage, keyboard nav, ARIA updates"
```

---

## Task 3: Update index.ejs (List page)

**Files:**
- Modify: `src/views/index.ejs`

Two changes: (a) restructure the provider+SDK loop to add collapsible wrappers and ARIA attributes, (b) add the script include.

- [ ] **Step 1: Replace the provider forEach block (lines 61–100)**

Find this block in `index.ejs` (starts at the `<% Object.entries(grouped)` line inside `.home-body`):

```ejs
    <% Object.entries(grouped).forEach(function([provider, sdkVersions]) { %>

      <section aria-labelledby="provider-<%= provider %>">
        <div class="provider-header">
          <%
            const providerColors = {
              paypal: '#009CDE',
              braintree: '#A855F7',
              stripe: '#818CF8',
              adyen: '#0ABF53'
            };
            const dotColor = providerColors[provider] || '#94A3B8';
            const productCount = Object.values(sdkVersions).reduce(function(acc, ps) { return acc + ps.length; }, 0);
          %>
          <div class="provider-dot" style="background:<%= dotColor %>" aria-hidden="true"></div>
          <span class="provider-name" id="provider-<%= provider %>"><%= provider %></span>
          <span class="provider-count"><%= productCount %> demo<%= productCount !== 1 ? 's' : '' %></span>
        </div>

        <% Object.entries(sdkVersions).forEach(function([sdkVersion, products]) { %>
          <div class="sdk-section-label"><%= sdkVersion %></div>
          <div class="product-grid">
            <% products.forEach(function(product) { %>
              <a href="/<%= provider %>/<%= sdkVersion %>/<%= product.productKey %>"
                 class="product-card <%= provider %>"
                 aria-label="<%= product.displayName %> demo">
                <span class="card-tag tag-<%= provider %>"><%= provider %></span>
                <h3><%= product.displayName %></h3>
                <p><%= product.description %></p>
                <div class="card-footer">
                  <span class="card-link" aria-hidden="true">Run demo →</span>
                  <span class="status-dot" title="Live in sandbox" aria-hidden="true"></span>
                </div>
              </a>
            <% }) %>
          </div>
        <% }) %>
      </section>

    <% }) %>
```

Replace with:

```ejs
    <% Object.entries(grouped).forEach(function([provider, sdkVersions]) { %>

      <section aria-labelledby="provider-<%= provider %>">
        <div class="provider-header"
             role="button"
             tabindex="0"
             aria-expanded="true"
             aria-controls="prov-<%= provider %>-body"
             data-collapse-provider="<%= provider %>">
          <%
            const providerColors = {
              paypal: '#009CDE',
              braintree: '#A855F7',
              stripe: '#818CF8',
              adyen: '#0ABF53'
            };
            const dotColor = providerColors[provider] || '#94A3B8';
            const productCount = Object.values(sdkVersions).reduce(function(acc, ps) { return acc + ps.length; }, 0);
          %>
          <div class="provider-dot" style="background:<%= dotColor %>" aria-hidden="true"></div>
          <span class="provider-name" id="provider-<%= provider %>"><%= provider %></span>
          <span class="provider-count"><%= productCount %> demo<%= productCount !== 1 ? 's' : '' %></span>
          <span class="collapse-icon expanded" aria-hidden="true">&#9658;</span>
        </div>

        <div class="collapsible-body" id="prov-<%= provider %>-body">
          <% Object.entries(sdkVersions).forEach(function([sdkVersion, products]) { %>
            <div class="sdk-section-label"
                 role="button"
                 tabindex="0"
                 aria-expanded="true"
                 aria-controls="sdk-<%= provider %>-<%= sdkVersion %>-body"
                 data-collapse-sdk="<%= provider %>/<%= sdkVersion %>">
              <%= sdkVersion %>
              <span class="collapse-icon expanded" aria-hidden="true">&#9658;</span>
            </div>
            <div class="collapsible-body" id="sdk-<%= provider %>-<%= sdkVersion %>-body">
              <div class="product-grid">
                <% products.forEach(function(product) { %>
                  <a href="/<%= provider %>/<%= sdkVersion %>/<%= product.productKey %>"
                     class="product-card <%= provider %>"
                     aria-label="<%= product.displayName %> demo">
                    <span class="card-tag tag-<%= provider %>"><%= provider %></span>
                    <h3><%= product.displayName %></h3>
                    <p><%= product.description %></p>
                    <div class="card-footer">
                      <span class="card-link" aria-hidden="true">Run demo →</span>
                      <span class="status-dot" title="Live in sandbox" aria-hidden="true"></span>
                    </div>
                  </a>
                <% }) %>
              </div>
            </div>
          <% }) %>
        </div>
      </section>

    <% }) %>
```

Note: `&#9658;` is `▶` (U+25BA). The icon starts with class `expanded` because the initial state is fully expanded; `collapse.js` will remove it if localStorage says collapsed.

- [ ] **Step 2: Add script include before `</body>` in index.ejs**

Find the closing tags at the bottom of `index.ejs`:
```html
</body>
</html>
```

Replace with:
```html
<script src="/js/collapse.js"></script>
</body>
</html>
```

- [ ] **Step 3: Start dev server and verify list page**

```bash
npm run dev:demo-hub
```

Open http://localhost:3000. Verify:
- Each provider header has a `▶` icon on the right
- Clicking the header animates the content closed (smooth 0.3s), icon rotates to `▼`
- Clicking again expands
- Clicking an SDK label collapses only that SDK's product grid, not the others

- [ ] **Step 4: Commit**

```bash
git add apps/demo-hub/src/views/index.ejs
git commit -m "feat(demo-hub): collapsible provider/sdk sections on list page"
```

---

## Task 4: Update header.ejs and footer.ejs (Sidebar)

**Files:**
- Modify: `src/views/partials/header.ejs`
- Modify: `src/views/partials/footer.ejs`

- [ ] **Step 1: Replace the desktop sidebar block in header.ejs**

Find the desktop sidebar block (look for the comment `<%# Desktop sidebar %>`):

```html
  <%# Desktop sidebar %>
  <aside class="sidebar" aria-label="Product list">
    <% if (typeof sidebarProducts !== 'undefined') { %>
      <div class="sidebar-provider"><%= provider %></div>
      <% Object.entries(sidebarProducts).forEach(function([sdkVer, products]) { %>
        <div class="sidebar-sdk"><%= sdkVer %></div>
        <% products.forEach(function(p) { %>
          <a href="/<%= provider %>/<%= sdkVer %>/<%= p.productKey %>"
             class="sidebar-item <%= (p.productKey === currentProductKey && sdkVer === currentSdkVersion) ? 'active' : '' %>"
             aria-current="<%= (p.productKey === currentProductKey && sdkVer === currentSdkVersion) ? 'page' : 'false' %>">
            <%= p.displayName %>
          </a>
        <% }) %>
      <% }) %>
    <% } %>
  </aside>
```

Replace with:

```html
  <%# Desktop sidebar %>
  <aside class="sidebar" aria-label="Product list">
    <% if (typeof sidebarProducts !== 'undefined') { %>
      <div class="sidebar-provider"
           role="button"
           tabindex="0"
           aria-expanded="true"
           aria-controls="sb-prov-<%= provider %>-body"
           data-collapse-provider="<%= provider %>">
        <%= provider %>
        <span class="collapse-icon expanded" aria-hidden="true">&#9658;</span>
      </div>
      <div class="collapsible-body" id="sb-prov-<%= provider %>-body">
        <% Object.entries(sidebarProducts).forEach(function([sdkVer, products]) { %>
          <div class="sidebar-sdk"
               role="button"
               tabindex="0"
               aria-expanded="true"
               aria-controls="sb-sdk-<%= provider %>-<%= sdkVer %>-body"
               data-collapse-sdk="<%= provider %>/<%= sdkVer %>">
            <%= sdkVer %>
            <span class="collapse-icon expanded" aria-hidden="true">&#9658;</span>
          </div>
          <div class="collapsible-body" id="sb-sdk-<%= provider %>-<%= sdkVer %>-body">
            <% products.forEach(function(p) { %>
              <a href="/<%= provider %>/<%= sdkVer %>/<%= p.productKey %>"
                 class="sidebar-item <%= (p.productKey === currentProductKey && sdkVer === currentSdkVersion) ? 'active' : '' %>"
                 aria-current="<%= (p.productKey === currentProductKey && sdkVer === currentSdkVersion) ? 'page' : 'false' %>">
                <%= p.displayName %>
              </a>
            <% }) %>
          </div>
        <% }) %>
      </div>
    <% } %>
  </aside>
```

- [ ] **Step 2: Add script include to footer.ejs**

Current `footer.ejs`:
```html
<%# Close page-layout and main-content divs (opened in header.ejs when showSidebar=true) %>
<% if (typeof showSidebar !== 'undefined' && showSidebar) { %>
  </div><%# /main-content %>
</div><%# /page-layout %>
<% } %>

</body>
</html>
```

Replace with:
```html
<%# Close page-layout and main-content divs (opened in header.ejs when showSidebar=true) %>
<% if (typeof showSidebar !== 'undefined' && showSidebar) { %>
  </div><%# /main-content %>
</div><%# /page-layout %>
<% } %>

<script src="/js/collapse.js"></script>
</body>
</html>
```

- [ ] **Step 3: Verify sidebar on a demo page**

Dev server should still be running. Open any demo page (e.g., http://localhost:3000/paypal/jssdk-v6/paypal-ecm).

Verify:
- Sidebar shows `paypal` with `▶` icon on the right
- Clicking `paypal` collapses all SDK groups below it (smooth animation)
- Clicking an SDK label (e.g., `jssdk-v6`) collapses only that group's links
- The active item (blue highlight) is still visible when its SDK group is expanded

- [ ] **Step 4: Commit**

```bash
git add apps/demo-hub/src/views/partials/header.ejs apps/demo-hub/src/views/partials/footer.ejs
git commit -m "feat(demo-hub): collapsible provider/sdk groups in demo detail sidebar"
```

---

## Task 5: Full verification against acceptance criteria

- [ ] **Step 1: localStorage persistence**

1. Open http://localhost:3000
2. Collapse the PayPal provider section
3. Click into any Braintree demo card
4. Click the browser Back button
5. Expected: PayPal section is still collapsed; Braintree is expanded

- [ ] **Step 2: Cross-page state sharing**

1. On the list page, collapse `paypal/jssdk-v6` (the SDK group, not the whole provider)
2. Navigate to a PayPal jssdk-v6 demo via the sidebar
3. Expected: In the sidebar, `jssdk-v6` is collapsed (same localStorage key `paypal/jssdk-v6`)

- [ ] **Step 3: Keyboard navigation**

1. On http://localhost:3000, press Tab until a provider header receives focus
2. Expected: Blue `outline: 2px solid` focus ring visible
3. Press Space or Enter
4. Expected: Provider collapses/expands; icon rotates

- [ ] **Step 4: Reduced-motion**

In Chrome DevTools → Rendering tab → enable "Emulate CSS media feature prefers-reduced-motion: reduce".

1. Click any collapsible header
2. Expected: Content hides/shows instantly with no animation

Disable the override after testing.

- [ ] **Step 5: Mobile layout unchanged**

Resize browser to 375px wide. Verify:
- Mobile horizontal tabs (`.sidebar-mobile`) appear at top of demo pages — no collapse icons, no collapse behavior
- List page shows no visible regression in layout

- [ ] **Step 6: Verify all acceptance criteria from spec**

- [ ] Clicking List page provider header → content folds/unfolds, icon rotates
- [ ] Clicking List page SDK label → only that SDK's product grid folds/unfolds
- [ ] Refresh page → collapsed/expanded states restored from localStorage
- [ ] Sidebar provider label folds/unfolds all SDK groups
- [ ] Sidebar SDK label folds/unfolds only that group's items
- [ ] Tab + Enter/Space triggers fold (keyboard)
- [ ] Focused header shows blue outline
- [ ] Mobile horizontal tabs untouched
- [ ] `prefers-reduced-motion` skips animation
