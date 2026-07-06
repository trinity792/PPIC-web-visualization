---
Topic: UI/UX
Content Type: implementation plan
pinned: false
description: "A running checklist of UI/UX improvements and codebase cleanup tasks spanning the back end and front end. Tracks work such as integrating the UI Kit, building shared preset charts and validators, and creating navbar and sidebar components."
Date Published: June 27, 2026
Last Updated: 06/27/2026 - 08:09 PM
Status: Archive
---

# UI/UX Updates
## Back End
- [x] Update constants.js
- [x] Determine best way to Integrate UI Kit details to project root 
- [x] Build shared preset model charts
- [x] Build metadata catalogue for each module
- [x] Build "add line" feature
- [ ] Build validators for shared preset model chart
## Front End
- [x] Create navBar component
- [x] Create sideBar component
- [x] Update current landing to be the dashboard landing example fill in with real graphs & real data
### Reference Images
[[Dashboard Page.png]]
[[Detailed Module Page.png]]
### User Flow
- Main Dashboard Landing Page contains "containers" or boxes for each overarching category. Currently the only category is "CA population & housing" but more categories will be add such as Economics, CA State Law, Climate Change, etc.
1. User arrives on main dashboard landing page
2. Clicks the category name (ie. "California Population and Housing Trends") or "See More ->" button
   - redirected to [[Detailed Module Page.png]]
   - If clicked the see more button then the user is redirected to [[Detailed Module Page.png]] with the contents of the graph/chart/table they clicked loaded.

# Codebase Cleanup
- [x] Create markdown-conventions.md file
- [x] Create frontend-dev-skill.md file 
- [x] Create backend-dev-skill.md file
- [x] Add instructions to AGENT.md and CLAUDE.md to check `docs/agent` for the necessary skills
- [x] Add context to AGENT.md and CLAUDE.md about structure of `docs/`

# On the Horizon
- [ ] Setup logging

---
# Claude Plan for UI/UX Updates:

> [!info] 
> **Audience:** a developer or LLM implementing the editor-driven dashboard.
> **Source of truth for intent:** `docs/PPIC Summer 2026/trinitys_notes/main.md` (line 64 onward — preset model, field catalog, dynamic sidebar, per-chart-type requirements, guardrails) and the **User Flow** + reference mockups above (`Dashboard Page.png`, `Detailed Module Page.png`).
> **Design reference (read-only):** the UI Kit ships Figma-code mockups of both pages at `UI Kit for Data Visualization/src/imports/LandingDashboardPage` and `.../src/imports/DetailedModulePage` — mine these for layout/spacing, do not import them.
> **This document** translates intent into a concrete, file-level build plan against the current codebase. Read "Current architecture" first; it is the contract every later phase must preserve.

## 0. Orientation

### 0.1 What exists today (the contract to preserve)

A three-layer, server/client-separated pipeline already works end-to-end for **line charts only**:

| Layer | Files | Responsibility |
| --- | --- | --- |
| **Server-only data access** | `lib/data/pop_housing.js`, `lib/data/components_of_change.js` | Own all CSV read/parse/filter via `node:fs`. Export `AVAILABLE_PARAMETERS`, `AVAILABLE_SUBSETS`, `SUBSET_TO_LEVELS`, `getAvailableLocations()`, `queryLineSeries()` (+ `AVAILABLE_SOURCES` for Components of Change). **Must never be imported into a `"use client"` component.** |
| **API orchestrators** | `app/api/pophousing/route.js`, `app/api/components-of-change/route.js` | Thin. Validate query params, delegate to the data module, shape JSON. Errors return `{ error, source }` with a non-200 status. |
| **Client presentation** | `components/charts/LineChart.js` (presentational Plotly, `dynamic(..., { ssr:false })`), `components/charts/PopHousingLineSection.js`, `components/charts/ComponentsOfChangeLineSection.js` (stateful: hold UI state, `fetch` the API, manage `loading | ready | empty | error`) | Render charts from props. |
| **Shared constants** | `lib/constants.js` (`COLORS`, `BASE_PLOTLY_COLORS`, `GOOGLE_FONTS`) | Plotly palette + brand colors. |

**API response shape (line):** `{ parameter, subset, series: [{ location, years: number[], values: (number|null)[] }], yearRange: [min, max] }`.

**Known issues this plan resolves:**
- The client section components **duplicate** the curated parameter/subset lists that live in the server-only data modules (see the explanatory comment in `PopHousingLineSection.js`). There is no single client-safe catalog. → fixed by §2.
- Pages and sections use **inline styles** (`app/page.js`, the section components). No Tailwind/shadcn is used in app UI yet. → migrated to the design system in §1.
- Only one chart type and one query shape (`queryLineSeries`) exist. → extended in §3 / Phases M2–M4.

### 0.2 What was just migrated (available, not yet used)

- `components/ui/*.js` — ~29 shadcn/Radix primitives (button, select, command, tabs, accordion, popover, slider, checkbox, switch, sidebar, sheet, dialog, calendar, table, tooltip, etc.) converted to plain JS, plus `components/ui/utils.js` (`cn`) and `components/ui/use-mobile.js`.
- `app/globals.css` — full design-token layer (shadcn base tokens + `.dark` + PPIC brand ramps + the `@theme inline` mapping that makes `bg-primary`, `border-input`, etc. compile under Tailwind v4). Fonts wired to the existing `next/font` variables.
- Import convention: `import { Button } from "@/components/ui/button"`.
- `data/data-cleaned/california-counties.geojson` (58 county features, with `GEOID` + `NAME`) + `GET /api/geography?level=counties` (server module `lib/data/geography.js`) — county map geometry, wired and tested, ready for the M4 choropleth.

### 0.3 Two pages (from the User Flow above)

| Page | Route | Purpose | Design ref |
| --- | --- | --- | --- |
| **Main Dashboard Landing** | `app/page.js` (`/`) | A grid of **category containers** (cards). Each card = one overarching category (today only "California Population & Housing"; future: Economics, CA State Law, Climate Change…). Card has the category name (link) and a "See More →" button, plus preview chart/table tiles. | `Dashboard Page.png`, `src/imports/LandingDashboardPage` |
| **Detailed Module Page** | `app/[module]/page.js` (e.g. `/pophousing`) | The **editor**: dynamic sidebar + chart canvas + saved views. Clicking a category name opens it blank; clicking "See More →" on a specific tile opens it with that chart/config **preloaded** (via route param or `?view=` query). | `Detailed Module Page.png`, `src/imports/DetailedModulePage` |

This two-page split supersedes the current single `app/page.js` that renders both line sections inline.

### 0.4 Target architecture (layered)

```
Declarative chart config (JSON)  ── the saved-view / editor state, see §4.3
        │  drives
        ▼
lib/visualization/   (client-safe: NO node:fs)
  fieldTypes.js          field-catalog primitives & helpers
  formatters.js          value/label formatting (year, percent, people…)
  transformRegistry.js   actual / indexed / percentChange / pctPointChange…
  validation.js          binding & complexity rules (guardrails)
  chartRegistry.js       per-chart-type required/optional roles + sidebar layout
  presetRegistry.js      task-based presets (Trend over time, Ranking…)
  categoryRegistry.js    landing-page categories → modules (§6.1)
  moduleSchemas/
    pophousing.js        field catalog + subsets + canonical columns (client-safe)
    componentsOfChange.js  + sources (DoF/Census)
        │  consumed by
        ▼
components/chart-builder/  (the dynamic sidebar UI, built on components/ui/*)
components/charts/         (presentational Plotly renderers, props-only)
app/                       (shell: Navbar; / landing; /[module] editor page)
        │  data via
        ▼
app/api/* ──► lib/data/* (server-only CSV + GeoJSON access, unchanged boundary)
  e.g. /api/geography ──► lib/data/geography.js (county map geometry)
```

**Directory note:** `lib/` is already a mixed JS+Python directory (`lib/constants.js`, `lib/data/*.js` alongside `lib/config.py`). The new `lib/visualization/` JS layer fits there and keeps the client-safe schema next to the server-only `lib/data/` modules it mirrors. This satisfies main.md's guidance ("keep React presets out of `scripts/shared/`; use a frontend-specific layer") without inventing a new top-level dir.

---

## 1. Design-system foundation (cross-cutting)

Goal: stop hand-writing inline styles; render all app chrome and controls from `components/ui/*` + tokens.

1. **Adopt tokens in the shell.** In `app/layout.js`/`app/page.js`, replace inline `COLORS.*` backgrounds with token utilities (`bg-background`, `bg-card`, `text-muted-foreground`, `border-border`). Keep `lib/constants.js` **only** as the Plotly palette source (Plotly can't read CSS variables at config time); do not use it for DOM styling.
2. **Keep one source for brand color.** The PPIC ramps now exist both as CSS vars (`--ppic-orange-300`, used by tokens) and as JS hex (`lib/constants.js`, used by Plotly). Treat `lib/constants.js` `COLORS` as the canonical hex values and the CSS ramp as their mirror; keep them in sync.
3. **Fix the latent bug** in `lib/constants.js`: `primaryBackground: "COLORS.lightGray"` is a literal string, not a reference. Set it to `COLORS.lightGray` (or remove it). Flag-and-confirm per CLAUDE.md before editing.
4. **Verify the base layer.** `app/globals.css` applies `border-border` globally and `bg-background`/`text-foreground` to `body`. Run `npm run dev` and confirm the existing Navbar/landing still render acceptably; scope the base layer down if it regresses legacy pages.

**Acceptance:** the shell renders with zero inline `style={{…}}` color/spacing values; all chrome uses `ui/*` + token classes.

---

## 2. Visualization core — module schemas & field catalog

**Checklist item:** "Build metadata catalogue for each module."

Create the **client-safe** schema layer — the single source of truth for what fields/metrics/subsets exist and how they combine. It must not import `node:fs`, so both client components and the server data modules can consume it.

### 2.1 `lib/visualization/fieldTypes.js`
Define the field-descriptor vocabulary from main.md:
```js
// kind: "temporal" | "dimension" | "measure"
// measure: { kind:"measure", label, unit, comparisonGroup, aggregation, transforms:[...], chartRoles:[...] }
```
Export helpers: `isMeasure(field)`, `isDimension(field)`, `areComparable(a, b)` (true only when `comparisonGroup` matches), `allowedTransforms(field)`.

### 2.2 `lib/visualization/moduleSchemas/pophousing.js` and `componentsOfChange.js`
Port the `POPHOUSING_FIELDS` catalog from main.md (Year, Location, Geographic Level, Total Population, Total Housing Units, Vacancy Rate (%), …) and the Components-of-Change catalog (Births, Deaths, Natural Increase, Net Migration, crude rates, …). Each module exports:
```js
export const POPHOUSING_SCHEMA = {
  id: "pophousing",
  label: "Population & Housing",
  fields: POPHOUSING_FIELDS,         // the catalog above
  canonicalColumns: [...],           // every column the CSV can contain
  curatedMeasures: [...],            // == today's AVAILABLE_PARAMETERS
  subsets: SUBSET_TO_LEVELS,         // == today's value, moved here
  sources: null,                     // componentsOfChange.js sets ["DoF","Census"]
  apiPath: "/api/pophousing",
};
```
**De-duplication:** `lib/data/pop_housing.js` and the client components should both import `curatedMeasures`/`subsets` from here instead of re-declaring them; `NUMERIC_COLUMNS` in the data module derives from the schema's measure fields. Removes the duplicated lists flagged in §0.1.

### 2.3 `lib/visualization/formatters.js`
Named formatters keyed by `field.formatter`/`field.unit`: `year`, `people`, `housingUnits`, `percent`, `percentagePoint`, `number`. Each `(value) => string`. Used by tooltips, axis labels, value labels.

### 2.4 `lib/visualization/transformRegistry.js`
Pure functions keyed by id: `actual`, `indexed` (to base year), `numericChange`, `percentChange`, `percentagePointChange`, `differenceFromBenchmark`. Signature `(series, opts) => series`. Gate which transforms a field may use via `field.transforms` (enforces guardrail #4 — rates use percentage-point change, never percent change).

**Acceptance:** schemas import-clean in a client component (no `node:fs`); the server data modules consume the same catalog (one definition of the curated metric list).

---

## 3. Visualization core — chart & preset registries + validation

### 3.1 `lib/visualization/chartRegistry.js`
One descriptor per chart type (line, bar, choroplethMap, heatmap, dumbbell, scatter, bubble, slope) capturing the per-type requirement tables from main.md:
```js
LINE: {
  id: "line",
  requiredRoles: ["x", "y"],
  optionalRoles: ["series", "benchmark", "facet"],
  roleConstraints: { x: ["temporal"], y: ["measure"], series: ["dimension"] },
  sidebarSections: ["data", "encodings", "comparison", "labels", "appearance"],
  defaults: { markerMode: "auto", legendPosition: "right" },
  limits: { maxSeries: 6, minPeriods: 2 },
}
```
Pull each type's `requiredRoles`/`optionalRoles`/`limits` directly from the "What each graph type needs" tables (Bar, Line, Map, Heatmap, Dumbbell, Scatter, Bubble, Slope).

### 3.2 `lib/visualization/presetRegistry.js`
Task-based presets from main.md §6 — generic, not bound to specific fields. Port `TREND_OVER_TIME` verbatim as the model, then add: Growth comparison (indexed line), Latest-year ranking (horizontal bar), Two-period change (dumbbell), Before-and-after rank (slopegraph), Geographic pattern (choropleth), Pattern over time (heatmap), Relationship explorer (scatter), Scale-aware relationship (bubble), Composition (stacked bar). A preset references `chartType`, `requiredRoles`/`optionalRoles`, `defaults`, `sidebar` layout, `constraints`.

### 3.3 `lib/visualization/validation.js`
The enforcement point for main.md's "Sidebar behavior rules" and "Guardrails". Pure functions returning `{ ok, level:"error"|"warn", code, message, suggestion? }[]`:
- `validateBindings(chartType, bindings, schema)` — required roles present; each binding's field kind matches `roleConstraints`.
- `validateComparability(measures, schema)` — block mixing incompatible `comparisonGroup`s on one axis (population vs vacancy rate); recommend scatter/indexed/facet.
- `validateComplexity(chartType, series)` — too many series → recommend Top N / heatmap / small multiples (line max 6; heatmap 30–50 rows; dumbbell/slope 6–20 categories).
- `validateGeographyAndSource(bindings, schema)` — no silent geo-level mixing; Components of Change requires a deliberate source or source-comparison mode.

**Acceptance:** given a config object, `validation.js` reproduces every rule in main.md's "Sidebar behavior rules" and "Most important guardrails" tables, with machine-readable codes the sidebar can surface.

---

## 4. Chart-builder UI (the dynamic sidebar) — lives on the Detailed Module Page

**Checklist item:** "Create sideBar component." Built entirely on `components/ui/*`.

### 4.1 Config state — Context + reducer (no new deps)
`components/chart-builder/chartConfigStore.js`:
- `ChartConfigProvider` + `useChartConfig()` exposing `{ config, dispatch }`.
- `useReducer` actions: `SET_PRESET`, `SET_CHART_TYPE`, `SET_BINDING`, `ADD_LAYER`, `REMOVE_LAYER`, `SET_FILTER`, `SET_LABEL`, `SET_TRANSFORM`, `LOAD_VIEW`, `RESET`.
- On every chart-type/binding change the reducer **revalidates** via `validation.js` and stores `config.validation` so any section can render notices ("Changes chart type → revalidate all bindings").
- Display labels live in `config.labels` and are **never** written back to canonical field names (guardrail #1).

### 4.2 Sidebar components (map main.md §"Suggested implementation structure")
Under `components/chart-builder/`, each section generated from the active chart type's `sidebarSections` + the module field catalog:

| Component | Built from `ui/*` | Purpose |
| --- | --- | --- |
| `ChartSidebar.js` | `sidebar`, `scroll-area`, `accordion`/`collapsible`, `separator` | Shell; renders the sections the active chart/preset declares. |
| `PresetPicker.js` | `select` (or `command` for search) | Choose a task preset; seeds chart type + defaults. |
| `EncodingSection.js` | `select`, `label`, `button` ("+ Add line") | X / Y / series / color bindings, validated against `roleConstraints`. |
| `ComparisonSection.js` | `select`, `switch`/`checkbox`, `calendar`+`popover` (date range) | Benchmark, transform, base year, index toggle. Source selector appears **only** for Components of Change. |
| `LabelEditor.js` | `input`, `textarea` | Title/subtitle/axis/legend/tooltip display overrides. |
| `LayerEditor.js` | `dialog`/`popover`, `command`, `badge` | Add predefined trace layers (§4.4). |
| `ValidationNotice.js` | `alert`, `tooltip` | Surface `config.validation` errors/warnings with the suggested fix. |

Reference layout for the Graph-Editor portion is the ASCII mock in main.md ("Dynamic sidebar structure"); the full page chrome should match `Detailed Module Page.png` / `src/imports/DetailedModulePage`.

### 4.3 Saved-view JSON (declarative; copy-paste + localStorage)
Saved views use the exact declarative shape from main.md (guardrail #8 — store configs, never rendered figures):
```js
{ version:1, module, preset, bindings, period, filters, labels, referenceLines, layers }
```
- `components/chart-builder/savedViews.js`: `serialize(config)`, `deserialize(json)` (validates against schema + `version`), `listViews()/saveView()/deleteView()` backed by `localStorage` (key `ppic.savedViews.v1`).
- Copy/paste: "Export config" copies `serialize()` to clipboard; "Import config" accepts pasted JSON → `deserialize` → `LOAD_VIEW`. This is the "copy-pastable configurations" feature-list item.
- The landing-page "See More →" deep-link reuses this: a tile's saved-view id/JSON is passed to `/[module]?view=…` and hydrated via `LOAD_VIEW`.

### 4.4 "Add line / add variable" — predefined layer types (guardrail #2)
Implement main.md's line-layer model. A layer is `{ id, type, x, y, splitBy, values, filters, label }`. Allowed `type`s: `selectedPlaces`, `benchmark`, `secondSource` (Components of Change only), `secondMeasure` (same `comparisonGroup` only), `referenceValue`, `derivedComparison`. `LayerEditor` only offers types valid for the active chart/module; `validation.js` gates `secondMeasure` on comparability.

**Acceptance:** the sidebar regenerates its controls when chart type changes; invalid bindings show a `ValidationNotice`; a configured view round-trips through copy → paste with an identical chart.

---

## 5. Chart renderers (presentational)

Keep `components/charts/*` **props-only and stateless** (`LineChart.js` is the model: `dynamic` import, `ssr:false`, palette from `lib/constants.js`).

1. **Normalize the renderer contract.** An adapter `lib/visualization/toPlotly.js` maps `{ chartType, bindings, series, transforms, labels }` → Plotly `{ data, layout, config }`. Renderers stay dumb.
2. **Refactor `LineChart.js`** to consume the normalized spec (behavior-preserving) so the sidebar can drive it.
3. **Add renderers per phase** (M2–M4): `BarChart.js`, `DumbbellChart.js`, `SlopeChart.js`, `ScatterBubbleChart.js`, `HeatmapChart.js`, `ChoroplethMap.js`. Each maps to a `chartRegistry` descriptor.

---

## 6. App shell, landing & module pages

**Checklist items:** "Create navBar component", "Create sideBar component", "Update current landing to be the dashboard landing."

### 6.1 `lib/visualization/categoryRegistry.js`
Drive the landing grid from data so new categories are config, not code:
```js
export const CATEGORIES = [
  { id:"pophousing", title:"California Population & Housing Trends",
    modulePath:"/pophousing", status:"live",
    previews:[ /* saved-view ids/configs to render as tiles */ ] },
  // future: { id:"economics", status:"coming-soon" }, CA State Law, Climate Change…
];
```

### 6.2 Landing page — `app/page.js` (`/`)
- Replace the current inline two-section page with a **category-card grid** (`ui/card`, `ui/badge` for "coming soon", `ui/button` for "See More →"), one card per `CATEGORIES` entry, matching `Dashboard Page.png` / `src/imports/LandingDashboardPage`.
- Each card shows the category title (link → `modulePath`) and preview tiles (small charts/tables). "See More →" on a tile → `modulePath?view=<id>`.

### 6.3 Detailed Module Page — `app/[module]/page.js`
- Route param selects the module schema (`pophousing`, `components-of-change`). Layout = `ChartSidebar` (left, `ui/sidebar` + `ui/sheet` for mobile via `use-mobile`) + chart canvas (right) + saved-view bar.
- Read `?view=` (or param) and hydrate the config store via `LOAD_VIEW` to preload the clicked chart; otherwise open the module's default preset.
- This page hosts everything from §4–§5.

### 6.4 `components/Navbar.js`
Rebuild on `ui/*` (`navigation-menu`/`button`, tokens); replace inline styling; match `src/imports/Navbar`.

**Acceptance:** `/` shows the category grid; clicking a category or "See More →" routes to `/[module]` with (optionally) the chosen view preloaded; both pages use only `ui/*` + tokens.

---

## 7. Data/API extensions (per chart type)

The current API serves only `queryLineSeries`. New chart types need new server query shapes in `lib/data/*.js` + new (or parameterized) routes. Keep routes thin; keep all filtering in the data module (mirrors the existing pattern).

| Chart type | New data query | Notes |
| --- | --- | --- |
| Bar / ranking | `queryCategoryValues({ parameter, subset, period, topN, sort })` | Single-period values per category; Top N + sort. |
| Dumbbell / slope | `queryTwoPeriod({ parameter, subset, startYear, endYear, locations })` | Exactly two periods; same metric/unit both ends. |
| Scatter / bubble | `queryMeasurePairs({ xMeasure, yMeasure, sizeMeasure?, subset, period })` | One row per observation unit. |
| Heatmap | `queryMatrix({ parameter, rows:"location", cols:"year", subset })` | Preserve missing cells as missing, not 0. |
| Choropleth | `queryGeoValues({ parameter, subset, period })` | Per-geography values to color the map. **Geometry + route are in place:** `data/data-cleaned/california-counties.geojson` (58 features) is served by `GET /api/geography?level=counties` via `lib/data/geography.js`. Remaining: this value query + a county-name→`GEOID` crosswalk (data `Location` is the county name; geometry carries `NAME` + canonical `GEOID`, exposed as the `featureidkey` in `FEATURE_ID_KEYS`). Region/state geometry still to be added. |

Add the `{ error, source }` failure contract to every new route (matches existing routes). The geography route (`app/api/geography/route.js`) already follows it.

---

## 8. Milestones

Each milestone is shippable and leaves the app working.

### M1 — Foundation + line refactor + two-page shell *(highest priority)*
- §1 design-system adoption; fix `constants.js` bug.
- §2 module schemas + field catalog; de-duplicate curated lists shared with `lib/data/*`.
- §3 chartRegistry (line), presetRegistry (Trend over time, Growth comparison), validation.js core.
- §4 config store + `ChartSidebar` (Preset/Encoding/Comparison/Label) wired to the **existing** line API; §4.3 saved views + copy-paste.
- §5 normalize `LineChart.js`.
- §6 `categoryRegistry`, landing category grid (`/`), Detailed Module Page (`/pophousing`, `/components-of-change`) hosting the editor, Navbar rebuild.
- **Acceptance:** landing → module page flow works; the two current line charts are reproduced entirely through preset → sidebar → config → renderer with working save/load/export.

### M2 — Ranking & two-period
- chartRegistry + renderers for **bar/ranking** and **dumbbell/slope**; presets "Latest-year ranking", "Two-period change", "Before-and-after rank".
- §7 `queryCategoryValues`, `queryTwoPeriod` + routes. Complexity/ordering validation.

### M3 — Relationships & matrix
- **scatter/bubble** and **heatmap** renderers + presets ("Relationship explorer", "Scale-aware relationship", "Pattern over time").
- §7 `queryMeasurePairs`, `queryMatrix`. Comparability + size-encoding (area-not-radius) validation.

### M4 — Geographic
- **Choropleth** renderer + "Geographic pattern" preset, consuming `GET /api/geography?level=counties` (geometry + route already in place; `featureidkey` = `properties.GEOID`).
- Remaining: the `queryGeoValues` value query, a county-name→`GEOID` crosswalk for canonical-ID joins (guardrail #5), region/state geometry, and an explicit no-data state.

---

## 9. Guardrails → where enforced (main.md §8)

| Guardrail | Enforced in |
| --- | --- |
| 1. Labels editable; canonical names immutable | `chartConfigStore` (labels display-only), `LabelEditor` |
| 2. Traces only via supported layer types | `LayerEditor` + `validation.js` |
| 3. Field catalog determines valid encodings | `roleConstraints` in `chartRegistry` + `validateBindings` |
| 4. Rates never summed; pct-point not pct-change for rates | `field.transforms` + `transformRegistry`/`validation` |
| 5. No silent geographic-level mixing | `validateGeographyAndSource` |
| 6. No silent source comparison (DoF vs Census) | source selector gated to Components of Change; `validateGeographyAndSource` |
| 7. Auto-limit visual complexity | `validateComplexity` (Top N / heatmap / small-multiples suggestions) |
| 8. Saved views = declarative JSON, never figures | `savedViews.js` (serialize config only) |

---

## 10. Open dependencies & flags
- **Geography crosswalk & non-county geometry** (M4) — county geometry is now in repo (`data/data-cleaned/california-counties.geojson`, served by `GET /api/geography`). Still needed before the choropleth ships: a county-name→`GEOID` crosswalk (or a deliberate join on `NAME`) and region/state geometry. `lib/config.py` remains the source of truth for geographic classifications.
- **Future categories** (Economics, CA State Law, Climate Change) — only the landing grid (`categoryRegistry`) is built now; each needs its own `lib/data/*` + schema later. Render as "coming soon" cards until then.
- **Dark mode** — tokens (`.dark`) exist but no toggle/`next-themes` is wired. Out of scope unless requested.
- **Server/client boundary** — never import `lib/data/*` (uses `node:fs`) into a `"use client"` file; `lib/visualization/` is the client-safe seam. A lint guard is recommended.
- **Per-file workflow** — per CLAUDE.md, flag-and-confirm before batching edits across files; run `npm run dev` after shell/style changes and `python -m pytest` after any change touching Python-adjacent config.

---

## 11. Maps back to the checklists above
- Back End: "metadata catalogue" → §2; "shared preset model charts" → §3.2 + §5; "add line feature" → §4.4; "validators" → §3.3; "Integrate UI Kit to project root" → already done (migration of `components/ui/*` + tokens), §1 is its adoption.
- Front End: "navBar" → §6.4; "sideBar" → §4; "dashboard landing with real graphs & data" → §6.2–§6.3 + M1.