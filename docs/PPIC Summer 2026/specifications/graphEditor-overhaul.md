---
Topic: Technical
Content Type: as-built reference guide
pinned: false
description: "As-built guide for the graph-editor overhaul: a Datawrapper-class chart editor with a GUI ⇄ code-editor toggle, user-supplied data, palette control, tiered settings, image/data export, and an expanded chart-type catalog — built by extending the existing chart-builder with variants rather than replacing it."
Date Published: July 6, 2026
Last Updated: 07/07/2026
Status: Shipped & signed off (2026-07-07) — Phases 0–7 complete
---

# Graph Editor Overhaul — As-Built Guide

> [!info] How to read this document
> This is an **as-built reference guide** — the editor described here is shipped and verified. The **first half** is for non-technical readers: what the overhauled editor does, who it serves, and how a researcher uses it. The **second half** is a programmer reference: every new file with its header docstring, every modified file with the exact change, plus the unit-test, error-handling, logging, and performance strategies. It follows the as-built conventions in [[refactor-doc-as-built-rewrite-process]]. Related: [[projectSpec]] (esp. *Frontend Architecture (UI Layer)* and its *Flagged Issues*), the graph-editor notes this work implemented, and the per-module refractor guides.

> [!info] Gate cleared: design signed off (2026-07-06), editor shipped & signed off (2026-07-07)
> The **design, scope, and dependency choices were signed off** (2026-07-06): ExcelJS confirmed as the spreadsheet reader (legacy `.xls`/`.ods`/`.dbf` deferred), the recognized-subset boundary for the R/Stata code editor accepted, and the new-dependency list approved (ask-first per `AGENTS.md`). The build proceeded phase by phase per *Part 10* and reached **final supervisor sign-off on 2026-07-07** (see *Sign-off status*).

---

## Part 1 — Overview (non-technical)

### Why we are doing this

PPIC researchers currently build publication charts in a fragmented workflow: analysis in **R, Stata, or Excel**, then a manual re-build of the chart in **Datawrapper**. The V3 site already has a working chart editor, but it only charts the five migrated modules' data, offers no color control, no image/data export, and no way to bring your own table. The overhaul turns the existing editor into a **general-purpose graph editor** that can replace the R/Stata/Excel → Datawrapper hop:

1. **Bring your own data** — paste a table from Excel/Google Sheets or upload a file, correct it in place, and chart it — alongside the existing module datasets.
2. **Two synchronized editing modes** — a GUI sidebar (what exists today, improved) and a **code editor** over the same chart configuration, with a toggle between them. Researchers who think in code get code; researchers who think in menus get menus; both edit the same chart.
3. **Take your work with you** — export the chart as PNG/SVG/JPG/PDF (with transparency and compression options), export the displayed data as CSV/Excel, export/import the chart's configuration as JSON, and copy generated **R or Stata code** that reproduces the chart offline.
4. **More chart forms, fewer components** — bar/column/line/area/pie/scatter/map/table families configured as **variants of base types** (a population pyramid is a mirrored split bar; a donut is a pie with a hole) rather than dozens of bespoke chart components.
5. **Three settings tiers** — *Basic*, *Moderate*, *Advanced* — so a first-time user sees five controls and a power user sees all of them.

### What "code editor for R, Stata, Excel" means here (key design decision)

The editor's single source of truth remains the **declarative chart config** (the same JSON object that already powers the GUI, saved views, and deep links — see [[projectSpec]]). Everything the code editor does funnels through that config, so the GUI, JSON, export, and saved-view machinery keep working unchanged. The code editor offers **three languages**, all editing the same underlying chart:

- **Spec (JSON)** — edit the config directly, with validation and inline diagnostics.
- **R** and **Stata** — a researcher who lives in R or Stata can **write chart code and get a chart** from their own uploaded table or a module/preset dataset. This is **bidirectional**: the editor generates R/Stata from the current chart (config → code), *and* parses R/Stata back into a chart (code → config).

**How code → chart works (decided 2026-07-06): parse a recognized subset.** We define a **chart-oriented subset** of ggplot2 (R) and `twoway`/`graph` (Stata) syntax and parse it into the chart config; Plotly then renders it, so an R-authored chart and a GUI-authored chart look identical and share every downstream feature (theming, tooltips, export, saved views). This was chosen over executing real R in-browser (WebR) because it is **symmetric across R and Stata** (there is no in-browser Stata runtime), keeps a single consistent chart rendering, and reuses the whole config pipeline instead of producing a static image outside it.

**The honest limit of this approach:** only *recognized* commands map to a chart. An arbitrary, full-power script will **not** execute — the parser recognizes the documented chart-building grammar (data reference, aesthetic mappings, one or more geoms/graph types, labels, scales, basic theme) and surfaces every unrecognized line as a **named warning** (`CODE_UNSUPPORTED`, listing the command), never a silent drop or a broken render. Recognized code round-trips losslessly with the generator; unrecognized constructs are reported, not guessed at. Data analysis code (models, wrangling beyond the provided derived-column operations) is out of scope — the editor charts a table, it does not run a statistics package. Real-R execution via WebR is recorded as a possible future escape hatch (Open Questions), not built in v1.

Excel is served by the **data export** path (download the chart's table as `.xlsx`/`.csv`), not by code generation.

### What a researcher will be able to do (user flow)

**Flow A — chart a module dataset (exists today, improved):**
1. Open `/pophousing` (or any module). Pick a preset ("Trend over time") or a chart type.
2. The sidebar shows **Basic** controls: preset, chart type, place, measure, date range. Toggle to **Moderate**/**Advanced** for encodings, comparisons, layers, annotations, per-series colors.
3. The chart re-renders live. Validation notices explain any problem in plain language.

**Flow B — bring your own data (new):**
1. In the editor's **Data** panel, switch from the module dataset to **"Your data"**.
2. Paste a table (Excel/Sheets clipboard) or upload a file. **v1 supports CSV / TSV / TXT and XLSX**; legacy binary formats (XLS, ODS, DBF) are deferred (see *Additional Libraries* — the leaning ExcelJS reader doesn't cover them, and they're rare for our researchers).
3. The **input table editor** shows the parsed table with per-cell color grading — **numbers green, text black, headings orange, malformed red, empty gray** — and auto-detected column types (text/number/date). Fix cells in place, rename headers, mark the first row as header or data, transpose, force a column's type, add derived columns (arithmetic, conditional logic, text transforms), or revert to the original upload.
4. Bind columns to chart roles exactly as with module data. **The uploaded table never leaves the browser** — nothing is sent to any server (see *Security*).

**Flow C — the GUI ⇄ code toggle (new):**
1. A **GUI / Code** toggle sits at the top of the editor. Switching to Code opens a real code editor (syntax highlighting, folding, inline errors) with a language tab: **Spec (JSON)**, **R**, or **Stata**.
2. In **Spec** mode the editor shows the current config as pretty-printed JSON. In **R**/**Stata** mode it shows generated code for the current chart, which the user can freely rewrite.
3. **Small edits** (a label, a color, a number) apply automatically after a short pause. **Large edits** (changed chart type, changed bindings, changed data source — anything that re-queries or restructures) light up a **Run** button and apply on demand. The classification is mechanical (see `diffSpec`), so behavior is predictable. R/Stata is always parsed on **Run** (never mid-keystroke), because a partially-typed statement isn't valid to parse.
4. **A researcher who only wants R or Stata** can ignore the GUI entirely: pick a dataset (their upload or a module/preset), write chart code, press Run, and get a chart — then export the image, the data, or the config. Unrecognized commands are reported as warnings, not silently dropped.
5. Switching back to GUI is instant — the sidebar always reflects the config, whichever language produced it.

**Flow D — export (new):**
1. **Export image**: PNG / SVG / JPG / PDF, with a transparent-background toggle (PNG/SVG), a size/scale control, and a JPG quality (compression) slider. PDF is a vector export (SVG → PDF), suited to print.
2. **Export data**: the exact table the chart is displaying (post-filter, post-transform) as CSV or Excel — a cleaned, curated file whether the data came from an upload or a preset.
3. **Export config**: copy or download the chart's JSON config; import by paste or file upload. Round-trips through saved views and `?view=` deep links unchanged.
4. **Sharing is these exports, not a server link.** "Share the chart" = hand someone the PNG/SVG/PDF; "share the data" = hand them the exported CSV/Excel. Nothing is uploaded or stored server-side (see *Backend Changes*).

### What already exists and is kept

The overhaul **extends** the current architecture rather than replacing it. Kept as-is: the declarative config store and reducer, the module-schema plug-in system, the validation guardrails, `toPlotly`, the API/query-shape server layer, saved views and deep links, and the shadcn/Radix design system. The five module pipelines and their Python backends are **untouched** (see *Backend Changes*).

### Acceptance criteria inherited from the flagged issues

Per [[projectSpec]] *Frontend — Flagged Issues*, the overhaul is not done until, **by design in the new code**:

1. Transforms (indexed / % change / …) work on **every** chart type they are offered for — or the control is hidden where they don't (issue 1).
2. Every chart type shows its **own** encoding roles; no stale-preset role lists (issue 2).
3. Choropleths support **every geographic level** the schema offers, and records that fail the GEOID join surface a **notice**, never a silent drop (issue 3).
4. **Base year** is validated against the loaded range; an out-of-range base is a warning, not a silent re-base (issue 4).
5. Saved-view serialization stores `transform`/`chartType`/`appearance` **top-level**, never smuggled inside `filters` (issue 6) — handled by the spec v2 migration.
6. The **palette single-owner** build step ships (CSS ramp generated from `lib/constants.js` `COLORS`; decided 2026-07-04).

---

## Part 2 — Design

### Design rule: variants over new components

Every new surface must first try to be a **variant of an existing component**:

| Need | Build as | Not as |
|---|---|---|
| GUI/Code toggle | `ui/tabs` (`Tabs`/`TabsList`) variant at the editor header | a bespoke switcher |
| Palette picker | `Popover` + swatch grid reusing `ui-kit/ColorPalette`'s token mapping | a color-picker library |
| Export menu | `ui/dropdown-menu` with a `Dialog` for options | a custom modal stack |
| Settings tiers | `ui/toggle-group` (3 items) + metadata on existing sections | three parallel sidebars |
| Input table editor | `ui/table` + `Input` cells, following `landing/RegionTable.js` patterns | a grid framework |
| Chart-as-table view | a `chartRegistry` **chart type** whose renderer is a table (RegionTable generalized) | a separate page |
| Editor activity log | `components/logs/LogCard` **variant** + `SeverityChip` | a new log UI |
| Pie/donut, stacked/grouped bar, area, pyramid | **variants of base chart types** via `appearance` (donut = pie + `hole`; stacked/grouped = bar + `stackMode`; area = line + `area`; pyramid = split bar + `mirror`) | one registry id per visual form |
| Monthly date control | the existing `YearRangeSection` slider generalized to a `TemporalRangeSection` with a granularity prop | a second slider component |

The chart-type catalog grows by **three registry ids** (`pie`, `symbolMap`, `dataTable`), not twenty-one: the notes' 21 named chart forms map onto base types + appearance variants, exactly as Datawrapper itself does ("a slope chart is configured from a line chart").

### The chart spec, version 2

The config object is versioned (`version: 1` today). The overhaul introduces **spec v2** — a superset with a lossless v1→v2 migration (old saved views keep loading). New/changed keys:

```text
{
  version: 2,
  module,  preset,  chartType,                       // unchanged
  data: {                                            // NEW — data-source selector
    source: "module" | "inline",
    inline?: { columns: [{name, type, format?}], rows: [[...]], meta: {importedAt, originalName?} }
  },
  bindings, period, filters,                         // unchanged; filters is ONLY filters now
  transform, comparisonMode,                         // unchanged, but serialized top-level (fixes issue 6)
  labels,                                            // unchanged
  format: { [fieldName]: { decimals?, thousands?, percent?, currency?, prefix?, suffix?, unitLabel?, dateFormat?, locale? } },  // NEW
  appearance: {
    ...existing keys,
    palette: "<palette id>",                         // NEW — named palette (token ids, never raw hex)
    seriesColors: { [seriesName]: "<color token>" }, // NEW — per-series overrides
    hole?, mirror?, stackMode?, area?, ...           // variant switches per base type
  },
  annotations: [ { type: "text"|"arrow"|"range", ... } ],   // NEW — beyond referenceLines
  layers, referenceLines,                            // unchanged
  tier: "basic" | "moderate" | "advanced",           // NEW — last-used settings tier (UI state, serialized for convenience)
  seriesCount, validation                            // computed, never serialized (unchanged)
}
```

Rules:

- **Colors are stored as token ids** (e.g. `"blue3"`), resolved through `lib/visualization/palettes.js` → `lib/constants.js` `COLORS`. A raw hex in a spec is a validation warning. This is what makes the palette single-owner cleanup safe.
- **`data.inline` is excluded from `?view=` deep links** (URL size) and **size-capped in localStorage saved views** (default cap 1 MB with a clear error naming the limit). Config *file* export may include it behind an explicit "include data" checkbox.
- The serialized wire shape and the in-memory shape are now **identical minus computed keys** — `savedViews.serialize`/`deserialize` v2 drop the `filters`-smuggling quirk and keep a v1 reader for migration.

### GUI ⇄ code synchronization

Both modes edit the same store. The code panel works on a **draft**:

1. On entering Code mode, the current config is pretty-printed into the editor (stable key order, via `chartSpec.printSpec`).
2. On each edit, the draft is parsed and diffed against the live config with `chartSpec.diffSpec(live, draft)` → `{ classification: "none" | "small" | "structural", errors: [...] }`.
   - **`small`** — changes confined to `labels`, `format`, `appearance`, `annotations`, `referenceLines`, `tier`: auto-applied ~400 ms after typing stops (single debounced `LOAD_SPEC` dispatch).
   - **`structural`** — anything touching `data`, `module`, `chartType`, `bindings`, `filters`, `period`, `transform`, `layers`: the **Run** button activates; nothing applies until pressed. This is the notes' "small edits update automatically / large edits require run" requirement, made mechanical.
   - **parse/validation errors** — shown inline (CodeMirror diagnostics) + as the standard `ValidationNotice` findings; the live chart keeps rendering the last good config.
3. The **R** and **Stata** tabs are **editable** (this is the primary flow for a code-only researcher). On entering a language tab, `codebridge` generates code for the current chart; the user edits freely and presses **Run** to parse it back into the config (`parseRCode` / `parseStataCode`). Auto-apply-on-keystroke is deliberately off for R/Stata — a half-typed statement isn't parseable — so these languages always apply on Run. Generation is cached per config hash; each tab has a copy button (reusing the docs `CodeBlock` copy pattern). Unrecognized commands render as `CODE_UNSUPPORTED` warnings; the chart still builds from what *was* recognized.

### Settings tiers

Every sidebar control gets a `tier` tag in a small registry (`settingsTiers.js`). The sidebar filters by the active tier; the tier toggle shows a count of hidden controls ("14 more in Advanced"). Assignments (initial; the table in `settingsTiers.js` is the source of truth):

- **Basic** — preset, chart type, data source, geographic level, measure, date range, title.
- **Moderate** — + encodings, comparison/transform, labels, legend position, palette, Top N, export.
- **Advanced** — + layers, per-series colors, annotations, reference lines, format overrides, code editor, derived columns.

The Code toggle itself is visible from **Moderate** up; tiers never *change* the config — hiding a control never resets its value.

### Security (config + data import/export)

- **Inline data never leaves the browser.** The `data.inline` path renders entirely client-side (`toSeries` replaces the API fetch). No new API accepts user data. This resolves the notes' "review data/user security stuff" concern by construction.
- **Config import stays fail-loud** — the existing `deserialize` precedent (version/module check + re-validation, throw with findings) extends to v2, plus: unknown top-level keys rejected by name, color values must be token ids, `data.inline` shape-checked (row width = column count, types coerced or flagged) before a single cell renders.
- **No `eval`.** Derived-column formulas run through a purpose-built expression evaluator (`derivedColumns.js`) with a whitelisted grammar (arithmetic, comparison, ternary, a fixed function set) — never `Function`/`eval`.
- Imported file parsing happens in the browser (papaparse for delimited text, ExcelJS for XLSX); files are read via `FileReader`, size-capped (default 20 MB, named error beyond).

---

## Part 3 — Frontend Changes (new files, with required docstrings)

*Conventions per the existing codebase: interactive components open with `"use client"` and a **Props / Data sources / UI Kit reference** header; `lib/` modules carry a plain JSDoc header with the `CLIENT-SAFE (no node:fs)` marker. Import order: React → third-party → `@/components/*` → `@/lib/*` → `@/lib/constants`.*

### 3.1 `lib/visualization/chartSpec.js` — spec v2 core

```js
/**
 * chartSpec.js — chart-spec v2: versioning, migration, printing, and diff
 * classification for the graph editor's code mode.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   SPEC_VERSION            — current spec version (2)
 *   migrateSpec(spec)       — lossless v1 → v2 upgrade (unpacks the legacy
 *                             transform/chartType/appearance keys smuggled in
 *                             `filters`; adds `data`, `format`, `appearance.palette`)
 *   normalizeSpec(spec, schema) — fill defaults, order keys, strip computed keys
 *   printSpec(spec)         — deterministic pretty-printed JSON (stable key
 *                             order) for the code editor and config export
 *   parseSpec(text, schema) — JSON.parse + normalize + validate; returns
 *                             { spec, errors } — never throws on user input
 *   diffSpec(live, draft)   — { classification: "none"|"small"|"structural",
 *                             changedPaths } driving auto-apply vs Run
 *   STRUCTURAL_KEYS         — the key set that forces "structural"
 *
 * Data sources:
 *   - none (pure functions over plain objects); validation delegates to
 *     `lib/visualization/validation.js`
 */
```

Replaces the ad-hoc shape knowledge currently split between `chartConfigStore.createChartConfig` and `savedViews.savedShape`; both are refactored to call it.

### 3.2 `lib/visualization/palettes.js` — named palettes & series colors

```js
/**
 * palettes.js — named color palettes for charts, built on the brand tokens in
 * `lib/constants.js` (COLORS / BASE_PLOTLY_COLORS). The single place that
 * resolves a palette id or color token to a hex value.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   PALETTES               — { id: { label, kind: "categorical"|"sequential"|
 *                            "diverging", tokens: [...] } }; includes the
 *                            default 10-color brand cycle, a colorblind-safe
 *                            variant, and the choropleth ramps
 *   resolveToken(token)    — color token → hex (throws a named error on an
 *                            unknown token; raw hex input returns a warning)
 *   seriesColor(spec, seriesName, index) — override → palette → base cycle
 *   paletteForScale(kind)  — sequential/diverging ramp lookup (replaces the
 *                            hardcoded CHOROPLETH_BLUES / "RdBu" in toPlotly)
 *
 * Data sources:
 *   - `lib/constants.js` COLORS (the palette single-owner source of truth)
 */
```

### 3.3 `lib/visualization/settingsTiers.js` — tier registry

```js
/**
 * settingsTiers.js — Basic / Moderate / Advanced visibility registry for
 * every graph-editor control. The sidebar and code-mode toggle read this;
 * nothing else defines tier membership.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   TIERS                  — ["basic", "moderate", "advanced"] (ordered)
 *   CONTROL_TIERS          — { controlId: tier } for every sidebar section
 *                            and control (single source of truth table)
 *   isVisible(controlId, activeTier) — tier-inclusive visibility test
 *   hiddenCount(sectionId, activeTier) — count for the "N more in Advanced" hint
 *
 * Data sources:
 *   - none (static table)
 */
```

### 3.4 `lib/visualization/codebridge/` — bidirectional R/Stata ⇄ config

Both directions live in one directory so the recognized grammar has a single owner: the generator (`config → code`) and the parser (`code → config`) share one `grammar.js` describing which chart features each language expresses, so they cannot drift. A feature the generator emits is, by construction, a feature the parser recognizes.

```js
/**
 * grammar.js — the single source of truth for the recognized R (ggplot2) and
 * Stata (twoway/graph) chart grammar: the mapping between chart-spec features
 * (chart type, aesthetic role, geom/graph command, scale, label, theme token)
 * and their surface syntax in each language. The generator and the parser both
 * read this table, so config→code and code→config can never disagree about
 * what is supported.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   R_GRAMMAR / STATA_GRAMMAR — { chartType, geoms, aesthetics, scales, labels,
 *                               theme } descriptors keyed by spec feature
 *   SUPPORTED_CHART_TYPES     — { r: [...], stata: [...] } the bridge covers
 *   featureCoverage(spec, lang) — spec features the language cannot express
 *                               (drives generator warnings + the code tab notice)
 *
 * Data sources:
 *   - none (static grammar tables)
 */
```

```js
/**
 * toRCode.js — generate a self-contained R (ggplot2) script that reproduces
 * the current chart from its exported CSV (config → code). The inverse of
 * parseRCode.js; both bind to grammar.js.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   toRCode(spec, table, schema) — { code, warnings } — a readr::read_csv of
 *     the exported filename + a ggplot2 build per chart family (line/area, bar
 *     variants, scatter, pie via coord_polar, choropleth stubbed with a
 *     comment naming the geo dependency); `warnings` lists any spec feature R
 *     cannot express (via grammar.featureCoverage), each named
 *
 * Data sources:
 *   - the spec + the same display table `lib/export/exportTable.js` writes,
 *     so the script, the CSV export, and the round-tripped chart all agree
 */
```

```js
/**
 * toStataCode.js — generate a Stata .do snippet (import delimited + twoway /
 * graph bar / graph pie) reproducing the current chart from its exported CSV.
 * Same contract, exports, and warning behavior as toRCode.js against
 * STATA_GRAMMAR:
 *   toStataCode(spec, table, schema) — { code, warnings }
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Data sources:
 *   - the spec + the exported display table (shared with toRCode.js)
 */
```

```js
/**
 * parseRCode.js — parse a recognized subset of ggplot2 into a chart spec
 * (code → config). Tokenizes the pipeline of `ggplot(...) + geom_*(...) +
 * ...`, maps aes()/geom/labs/scale calls to spec bindings/chartType/labels via
 * R_GRAMMAR, resolves the data reference to the active dataset (inline upload
 * or module id), and returns { spec, warnings, errors }. Never executes R —
 * a static parser only; unrecognized calls become CODE_UNSUPPORTED warnings,
 * syntax errors become CODE_PARSE_ERROR with line/column, and NOTHING throws
 * to the UI.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   parseRCode(text, { schema, table }) — { spec, warnings, errors }
 *   R_DATA_REF_PATTERNS — how a data reference (read_csv("...") / a bound name)
 *                         resolves to the active data source
 *
 * Data sources:
 *   - the R text + the active dataset descriptor (never fetches or runs code)
 */
```

```js
/**
 * parseStataCode.js — parse a recognized subset of Stata graph syntax
 * (twoway line/scatter/bar/connected, graph bar, graph pie, + `title()`,
 * `ytitle()`, `by()`, `over()`) into a chart spec. Same static-parser contract,
 * exports, and error/warning surfacing as parseRCode.js, against STATA_GRAMMAR:
 *   parseStataCode(text, { schema, table }) — { spec, warnings, errors }
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module. Never executes Stata (no in-browser Stata runtime exists).
 *
 * Data sources:
 *   - the Stata text + the active dataset descriptor
 */
```

### 3.5 `lib/tabular/` — the user-data layer (all CLIENT-SAFE, new directory)

```js
/**
 * parseTable.js — turn pasted text or an uploaded file into the editor's
 * inline-table shape { columns:[{name,type}], rows, issues }.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module. Heavy parsers (papaparse, ExcelJS) are loaded via
 * dynamic import so they never enter the main bundle.
 *
 * Exports:
 *   parsePaste(text)             — clipboard TSV/CSV sniffing (Excel/Sheets
 *                                  paste is TSV) → inline table
 *   parseFile(file)              — CSV/TSV/TXT via papaparse (worker mode for
 *                                  >1 MB); XLSX via ExcelJS; extension+MIME
 *                                  dispatch, named errors. Legacy XLS/ODS/DBF
 *                                  are rejected with a named UNSUPPORTED_FORMAT
 *                                  error naming the deferral (v1 scope)
 *   detectHeaderRow(rows)        — heuristic + user-overridable header flag
 *   MAX_FILE_BYTES               — hard cap (named error beyond)
 *
 * Data sources:
 *   - user clipboard / user-selected local files only; nothing is fetched
 *     and nothing is uploaded to any server
 */
```

```js
/**
 * columnTypes.js — column type detection and coercion for inline tables:
 * text | number | date, with locale-aware thousands/decimal handling.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   inferColumnType(values)      — majority-vote inference with confidence;
 *                                  ties resolve to text (never guess numeric)
 *   coerceColumn(values, type, {locale}) — returns { values, failures } where
 *                                  failures carry row indexes for red-grading
 *   parseNumber(text, locale)    — "1,234.5" / "1.234,5" / "45%" / "$1,200"
 *   parseDateToken(text)         — years, YYYY-MM, quarters, ISO dates
 *
 * Data sources:
 *   - none (pure functions)
 */
```

```js
/**
 * tableChecker.js — per-cell grading for the input table editor's colored
 * feedback: numbers green, text black, headings orange, malformed red,
 * empty gray.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   CELL_GRADES              — { NUMBER:"number", TEXT:"text", HEADING:
 *                              "heading", MALFORMED:"malformed", EMPTY:"empty" }
 *   gradeTable(table)        — grade matrix aligned to rows×columns, derived
 *                              from declared column types + coercion failures
 *   gradeSummary(grades)     — counts per grade for the panel's health strip
 *   GRADE_CLASSNAMES         — grade → Tailwind classes (green/black/orange/
 *                              red text, gray cell) so styling stays in one place
 *
 * Data sources:
 *   - none (pure functions over the inline-table shape)
 */
```

```js
/**
 * derivedColumns.js — safe formula evaluation for user-defined columns:
 * arithmetic, conditional logic, and text transforms over existing columns.
 * No eval/Function — a hand-rolled tokenizer + recursive-descent parser over
 * a whitelisted grammar.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   FORMULA_FUNCTIONS        — the whitelist: round, abs, min, max, trim,
 *                              upper, lower, concat, if
 *   compileFormula(text, columns) — { evaluate(row), referencedColumns } or
 *                              a named parse error with position
 *   addDerivedColumn(table, name, formula) — new table (immutably), with
 *                              per-row failures graded MALFORMED, never thrown
 *
 * Data sources:
 *   - none (pure functions)
 */
```

```js
/**
 * toSeries.js — shape an inline table into the exact series/record shapes the
 * server query layer returns ({location, years[], values[]}, category records,
 * pairs, matrix), so `toPlotly` and the transform registry work identically
 * for module data and user data.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module. It is the client-side mirror of
 * `lib/data/query_shapes.js` and must be kept behaviorally aligned with it
 * (shared fixture tests enforce this).
 *
 * Exports:
 *   buildShapes(table, spec)   — dispatch on the spec's query shape; returns
 *                                { series | records | matrix, meta }
 *   supportedShapes(table)     — which chart families the table can feed,
 *                                used to gray out chart types in the sidebar
 *
 * Data sources:
 *   - the inline table in the spec (`spec.data.inline`); no network access
 */
```

### 3.6 `lib/export/` — image, data, and config export (new directory)

```js
/**
 * exportImage.js — chart image export via Plotly.toImage: PNG, SVG, JPG, and
 * PDF, with transparent background (PNG/SVG), pixel-scale control, and JPG
 * quality re-encoding through an offscreen canvas. PDF is produced vector-first
 * by rendering to SVG then converting with jsPDF + svg2pdf.js (lazy-imported),
 * so print output stays sharp.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module. It imports nothing from plotly directly — the caller
 * hands it the mounted graph div, keeping this module testable.
 *
 * Exports:
 *   IMAGE_FORMATS            — [{id:"png"|"svg"|"jpeg"|"pdf", label,
 *                              supportsAlpha, vector}]
 *   exportImage(graphDiv, {format, scale, transparent, quality, filename})
 *                            — resolves to a triggered download; every failure
 *                              rejects with a named EXPORT_* error
 *   suggestFilename(spec)    — "<module-or-data>-<chartType>-<date>.<ext>"
 *
 * Data sources:
 *   - the rendered Plotly graph div (client-side only)
 */
```

```js
/**
 * exportTable.js — "export the data displayed in the graph": the post-filter,
 * post-transform table behind the current chart, as CSV text or an .xlsx
 * workbook, plus config-JSON download/copy helpers.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module. ExcelJS is loaded via dynamic import for .xlsx only.
 *
 * Exports:
 *   displayTable(spec, loaded)  — the canonical rows/columns the chart is
 *                                 showing (shared with codebridge, so exported
 *                                 CSV + generated R/Stata always agree)
 *   toCsv(table)                — RFC-4180 CSV text (quotes, CRLF)
 *   toXlsxBlob(table)           — one-sheet workbook
 *   downloadBlob(blob, filename) / copyText(text) — shared download/copy
 *
 * Data sources:
 *   - the loaded chart data already in memory; no re-fetch
 */
```

### 3.7 `lib/logs/editorLog.js` — client-side activity log

```js
/**
 * editorLog.js — in-browser activity log for the graph editor: imports,
 * parses, exports, code-mode runs, and their failures, in the same
 * plain-language + technical dual shape as the pipeline /logs feed.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module. Entries live in a bounded in-memory ring buffer —
 * never localStorage, since entries may contain data-derived strings.
 *
 * Exports:
 *   logEditorEvent({severity, code, summary, detail?, source})
 *                            — append (severity: "info"|"warn"|"error");
 *                              `source` names the failing layer, matching the
 *                              project's failure-surfacing rule
 *   useEditorLog()           — React hook: entries + clear()
 *   MAX_ENTRIES              — ring size (200)
 *   toDownloadText(entries)  — plain-text dump for bug reports
 *
 * Data sources:
 *   - events emitted by the editor components in this session only
 */
```

### 3.8 New components (`components/chart-builder/` unless noted)

```js
"use client";

/**
 * EditorModeToggle.js — the GUI / Code mode switch at the top of the module
 * editor, plus the settings-tier toggle (Basic / Moderate / Advanced).
 *
 * Props:
 *   mode         {string}   — "gui" | "code"
 *   onModeChange {function} — called with the next mode
 *   tier         {string}   — active settings tier
 *   onTierChange {function} — called with the next tier
 *
 * Data sources:
 *   - `lib/visualization/settingsTiers.js` for tier metadata
 *
 * UI Kit reference:
 *   - Variant of the "Tabs" pattern (ui/tabs) for mode; "Toggle Group"
 *     (ui/toggle-group) for tier — no new primitives
 */
```

```js
"use client";

/**
 * CodeEditorPanel.js — the code mode: a CodeMirror editor over the live chart,
 * with a language tab for Spec (JSON) / R / Stata. Spec and "small" edits
 * auto-apply; structural JSON edits and every R/Stata Run apply on demand via
 * the Run button. Editable in all three languages: JSON round-trips through
 * chartSpec; R/Stata round-trip through codebridge (generate on entry, parse
 * on Run). Inline diagnostics for parse errors and unsupported-command
 * warnings.
 *
 * Props:
 *   (none — reads/dispatches through useChartConfig())
 *
 * Data sources:
 *   - the chart config store (source of truth)
 *   - `lib/visualization/chartSpec.js` (printSpec/parseSpec/diffSpec) for JSON
 *   - `lib/visualization/codebridge/*` for R/Stata both directions
 *     (toRCode/toStataCode on entry — cached per config hash; parseRCode/
 *     parseStataCode on Run)
 *
 * UI Kit reference:
 *   - Language tabs (Spec / R / Stata) via ui/tabs; the CodeMirror language
 *     mode swaps per tab; copy button reuses the documents CodeBlock copy
 *     affordance; diagnostics reuse ValidationNotice
 */
```

```js
"use client";

/**
 * DataSourcePanel.js — the sidebar Data section, extended: choose between the
 * module dataset and "Your data" (paste or upload), and manage the inline
 * table (open editor, revert to original, remove).
 *
 * Props:
 *   (none — reads/dispatches through useChartConfig())
 *
 * Data sources:
 *   - `lib/tabular/parseTable.js` for paste/upload; dispatches SET_DATA_SOURCE
 *   - module schema for the module-dataset option (existing behavior)
 *
 * UI Kit reference:
 *   - Extends the existing DataSourcesSection (ChartSidebar) rather than
 *     replacing it; upload via a styled file input + Button, paste via Textarea
 */
```

```js
"use client";

/**
 * InputTableEditor.js — the editable grid over an inline table: per-cell
 * color grading (number green / text black / heading orange / malformed red /
 * empty gray), in-place cell editing, header-row toggle, rename headers,
 * add/delete/hide rows and columns, force column type, transpose, derived-
 * column builder, and revert-to-original.
 *
 * Props:
 *   table     {Object}   — the inline table (columns, rows, issues)
 *   onChange  {function} — next-table callback (immutably produced)
 *   onRevert  {function} — restore the original upload
 *
 * Data sources:
 *   - `lib/tabular/{tableChecker,columnTypes,derivedColumns}.js`
 *
 * UI Kit reference:
 *   - Built from ui/table + ui/input following landing/RegionTable.js
 *     conventions; paginates past 100 rows (no grid library)
 */
```

```js
"use client";

/**
 * PalettePicker.js — palette selection + per-series color overrides for the
 * Appearance section: a named-palette select, then one swatch row per active
 * series with a Popover swatch grid of brand tokens.
 *
 * Props:
 *   (none — reads/dispatches through useChartConfig(); series names come from
 *   the last loaded data via seriesCount feedback)
 *
 * Data sources:
 *   - `lib/visualization/palettes.js` (PALETTES, resolveToken)
 *
 * UI Kit reference:
 *   - Popover + swatch grid reusing the ui-kit ColorPalette token names;
 *     select via ui/select — deliberately NOT a free color wheel (brand
 *     tokens only, which keeps palette single-ownership intact)
 */
```

```js
"use client";

/**
 * ExportMenu.js — the editor's Export control: image (PNG/SVG/JPG with
 * transparency, scale, and JPG quality), data (CSV/XLSX of the displayed
 * table), and config (copy / download / import JSON).
 *
 * Props:
 *   graphDivRef {Object} — ref to the mounted Plotly graph div (for toImage)
 *
 * Data sources:
 *   - `lib/export/{exportImage,exportTable}.js`; config round-trip via
 *     `components/chart-builder/savedViews.js` serialize/deserialize
 *
 * UI Kit reference:
 *   - ui/dropdown-menu for the format list; ui/dialog for the options pane;
 *     absorbs FooterActions' existing Import/Export JSON dialog (one export
 *     surface, not two)
 */
```

```js
"use client";

/**
 * EditorActivityLog.js — collapsible "Activity" drawer listing this session's
 * editor events (imports, exports, code runs, failures) with the same
 * plain-language / technical-details duality as the /logs page.
 *
 * Props:
 *   (none — reads `useEditorLog()`)
 *
 * Data sources:
 *   - `lib/logs/editorLog.js`
 *
 * UI Kit reference:
 *   - Each entry is a compact LogCard variant with SeverityChip + CopyButton
 *     (components/logs/); the drawer is ui/collapsible inside the sidebar footer
 */
```

```js
"use client";

/**
 * DataTableView.js (components/charts/) — renders the "dataTable" chart type:
 * a searchable, sortable, paginated table of the displayed data, with
 * optional heatmap cell shading — the notes' Table family, phase-one scope.
 *
 * Props:
 *   table      {Object} — displayTable() output (columns, rows)
 *   format     {Object} — spec.format overrides (per-column formatters)
 *   appearance {Object} — { search, sortable, pageSize, heatmapColumn? }
 *
 * Data sources:
 *   - the same loaded chart data as any chart type (no separate fetch)
 *
 * UI Kit reference:
 *   - Generalizes landing/RegionTable.js over ui/table; search via ui/input;
 *     pagination buttons via ui/button — RegionTable becomes a thin preset
 *     of this component (variant, not a second table)
 */
```

### 3.9 Modified files (exact changes)

| File | Change |
|---|---|
| `components/chart-builder/chartConfigStore.js` | Adopt spec v2 via `chartSpec.normalizeSpec`; new actions: `SET_DATA_SOURCE` (module ⇄ inline + table payload), `SET_FORMAT`, `SET_PALETTE`, `SET_SERIES_COLOR`, `ADD_ANNOTATION`/`REMOVE_ANNOTATION`, `SET_TIER`, `LOAD_SPEC` (code-mode apply; `LOAD_VIEW` stays for saved views). `SET_CHART_TYPE` re-derives the encoding role list from the chart type when no preset matches (**fixes flagged issue 2**). |
| `components/chart-builder/savedViews.js` | v2 wire shape (top-level `transform`/`chartType`/`appearance` — **fixes flagged issue 6**); reads v1 via `migrateSpec`; size cap + named error for inline data; `SAVED_VIEW_VERSION = 2`. |
| `components/chart-builder/ChartSidebar.js` | Sections tier-filtered via `settingsTiers.isVisible`; `YearRangeSection` → `TemporalRangeSection` (granularity `"year" \| "month"` from the schema — unblocks Building Permits); `AppearanceSection` gains `PalettePicker`; `FooterActions`' import/export dialog moves into `ExportMenu`; the Transform select is gated by the chart type's `transformCapable` flag (**issue 1's UI half**). |
| `components/chart-builder/ModuleEditor.js` | Hosts `EditorModeToggle`, swaps `ChartSidebar` ⇄ `CodeEditorPanel` by mode; passes the graph-div ref to `ExportMenu`; mounts `EditorActivityLog`. |
| `components/chart-builder/chartData.js` | Branches on `spec.data.source`: `"inline"` → `lib/tabular/toSeries.js` locally (no fetch); `"module"` → existing path. Choropleth geometry level comes from `filters.subset` instead of hard-coded `"counties"` (**fixes flagged issue 3, client half**). |
| `lib/visualization/toPlotly.js` | Transforms applied in **every** builder via one shared pre-step (**fixes flagged issue 1**); series colors resolved through `palettes.seriesColor` (overrides honored); new `pieSpec`, `symbolMapSpec` builders; `dataTable` short-circuits to a `{ table }` result consumed by `DataTableView`; the `annotations` array rendered by extending `withReferenceLines`. |
| `lib/visualization/chartRegistry.js` | New ids: `pie` (variants: donut via `appearance.hole`, multiples via `appearance.facet`), `symbolMap`, `dataTable`; variant switches documented per type (`stackMode`, `mirror`, `area`); every descriptor gains `transformCapable` (drives issue 1's control visibility) and per-control tier hints. |
| `lib/visualization/validation.js` | New checks: `validateBaseYear` (out-of-loaded-range base = warning — **fixes flagged issue 4**); `validateSpecKeys` (unknown key / raw hex / oversized inline data); `validateInlineBindings` (bindings must exist in the inline table). Geo-join misses arrive as a `warn` finding from the API response (`unmatched`) via the `SET_SERIES_COUNT` reducer path (**fixes flagged issue 3, notice half**). |
| `lib/visualization/presetRegistry.js` | Presets become **module-aware**: each module schema may contribute presets (`schema.presets`), unblocking the deferred Demographic Projections shapes (age pyramid = bar + `mirror`) and Building Permits presets; add presets for scatter/dumbbell/heatmap so every chart type has one (closes the issue-2 gap from the other side). |
| `lib/visualization/moduleSchemas/buildingPermits.js` | Drop `underConstruction`; declare `temporalGranularity: "month"` + presets. |
| `components/charts/PlotlyChart.js` | Expose the graph-div ref (`onGraphDiv` callback prop) for `exportImage`; disable the modebar's built-in PNG button in favor of `ExportMenu` (one export path). |
| `lib/data/*` + `app/api/*` | See *Backend Changes*. |
| `lib/constants.js` + `app/globals.css` | Palette single-owner build step: generate the `--ppic-*` ramp from `COLORS` (decided 2026-07-04); unify the numbering schemes. |
| `app/[module]/page.js` | No structural change; Building Permits stops short-circuiting to `UnderConstruction`. |

---

## Part 4 — Backend Changes

**Python ETL: none.** The overhaul is a UI-layer project; the five pipelines, their contracts, and `scripts/shared/` are untouched. User-supplied data deliberately never reaches Python.

**Node server layer (`lib/data/` + `app/api/`):** three contained changes.

1. **Geo view generalization** (`lib/data/geography.js`, each module's `queryGeoValues`, `app/api/geography/route.js`) — parameterize the geometry level (`counties` today; `regions`/`states` as GeoJSON becomes available), and return `unmatched: [names]` alongside the joined records instead of silently filtering (**flagged issue 3, server half**). Response stays backward-compatible (new key only).
2. **Month-granular period params** (`lib/data/apiParams.js`, `query_shapes.js` callers) — accept `startPeriod`/`endPeriod` as `YYYY` or `YYYY-MM`; Building Permits' data-access layer already shapes months, so this is parameter plumbing, not new shaping.
3. **Nothing else.** No new API routes; no route accepts POSTed data; image/data/config export are all client-side. (A `format=csv` API variant was considered and rejected: the client already holds the displayed data, and a server CSV endpoint would duplicate the transform logic that lives client-side.)

Each change keeps the existing error contract: `invalid(message, source)` 400s and `{ error, source }` 500s.

---

## Part 5 — Error Handling

The project rule — *every failure surfaces a message identifying its source* — applied to the new surfaces. All editor-facing failures become either a **validation finding** (`{ level, code, message, suggestion }`, rendered by `ValidationNotice`) or an **activity-log entry** (`editorLog`, for event-shaped failures like a failed export), never a bare `console.error` or a silent fallback.

Error-code taxonomy (new codes; existing codes unchanged):

| Code | Layer | Trigger | Surface |
|---|---|---|---|
| `TABLE_PARSE_FAILED` | parseTable | unreadable file / undecodable paste | finding (error) + log |
| `TABLE_TOO_LARGE` | parseTable | > `MAX_FILE_BYTES` or row cap | finding (error), names the cap |
| `COLUMN_COERCE_FAILED` | columnTypes | forced type fails on N cells | finding (warn) + red cells |
| `FORMULA_PARSE_ERROR` | derivedColumns | bad formula, with position | inline under the formula input |
| `SPEC_PARSE_ERROR` | chartSpec | invalid JSON in code mode | CodeMirror diagnostic + finding |
| `SPEC_UNKNOWN_KEY` / `SPEC_RAW_HEX` | chartSpec | unknown key / non-token color | finding (warn) |
| `SPEC_VERSION_UNSUPPORTED` | chartSpec | future/corrupt version | finding (error) on import |
| `BASE_YEAR_OUT_OF_RANGE` | validation | base year outside loaded range | finding (warn) — issue 4 |
| `GEO_JOIN_UNMATCHED` | API → validation | records missing from GEOID join | finding (warn) listing places — issue 3 |
| `EXPORT_RENDER_FAILED` / `EXPORT_ENCODE_FAILED` | exportImage | toImage / canvas / PDF re-encode failure | log entry (error) + workspace alert |
| `CODEGEN_UNSUPPORTED` | codebridge (generate) | chart feature R/Stata can't express | notice inside the code tab, per feature |
| `CODE_UNSUPPORTED` | codebridge (parse) | an unrecognized R/Stata command on Run | finding (warn), names the command; chart builds from what parsed |
| `CODE_PARSE_ERROR` | codebridge (parse) | R/Stata syntax the parser can't tokenize | CodeMirror diagnostic + finding (error), with line/column |
| `VIEW_TOO_LARGE` | savedViews | inline data past the localStorage cap | finding (error), suggests file export |

Principles carried over: user input **never throws to the UI** (parse functions return `{ value, errors }`); import stays **fail-loud** (a bad config refuses to load, listing findings — existing `deserialize` behavior); the last good chart keeps rendering while code-mode drafts are broken.

---

## Part 6 — Log Integration

The site's logging today is pipeline-side (JSONL run records → `/logs`). The editor gets a client-side analogue with the same reading experience, not a new system:

- **`lib/logs/editorLog.js`** (docstring above) holds a bounded ring of session events: data imported (rows/columns/source kind — never cell contents), export succeeded/failed, code-mode Run applied, config imported, validation errors on import. Severity vocabulary matches `/logs` (`info`/`warn`/`error` → the same `SeverityChip` colors).
- **`EditorActivityLog`** renders them as compact `LogCard` variants with the plain-language line first and a "Show technical details" disclosure for the raw entry — mirroring the logs-page pattern (`lib/logs/presentation.js` conventions) so users learn one idiom.
- **Privacy rule:** log entries may name shapes ("2,340 rows × 6 columns from paste"), codes, and filenames, but never cell values; the ring is memory-only and clears on unload.
- **Telemetry is off, by decision (2026-07-06).** No editor activity is ever sent to a server — not automatically, not sampled. The log is purely local and for the user's own benefit.
- **Voluntary bug reports via "Copy technical details".** The Activity drawer and each failure alert carry a *Copy technical details* button (`editorLog.toDownloadText`) that copies the recent local log to the clipboard, so a user can paste it into the existing site-wide `ReportProblemDialog` (`components/feedback/`) if — and only if — they choose to. This is the one, opt-in bridge from the local log to a report; nothing crosses it automatically.
- Pipeline logging is unaffected; module data fetch errors continue to surface the API's `source` string in the workspace error state.

---

## Part 7 — Unit Tests

Backend pytest (967 passing per [[projectSpec]]) is untouched. The overhaul introduces the project's first **JavaScript test suite**, because the new logic is overwhelmingly pure functions in `lib/`:

- **Runner:** Vitest + jsdom + React Testing Library (dev-dependencies; `npm test` script). Chosen over Jest for native ESM (the repo is `"type": "module"`) and Next 16 compatibility.
- **Layout mirrors the source tree**, like pytest: `tests/js/lib/visualization/chartSpec.test.js`, `tests/js/lib/tabular/parseTable.test.js`, … Naming follows the pytest convention translated: `describe(functionName)` / `it("<condition>, …")`.
- **No network:** module-data paths are tested with fixture responses; a global fetch stub fails any accidental real request (mirroring the pytest autouse safety net).

Coverage plan (highest-value first):

| Suite | Representative cases |
|---|---|
| `chartSpec` | v1→v2 migration unpacks `filters`-smuggled keys exactly; `printSpec` stable ordering; `parseSpec` never throws; `diffSpec` classifies each STRUCTURAL_KEY structural and label/format/appearance edits small; unknown keys rejected by name |
| `palettes` | every token resolves; unknown token names the token; override → palette → cycle precedence; sequential/diverging lookup replaces hardcoded ramps |
| `columnTypes` / `parseTable` | numeric with thousands/percent/currency, both locales; date tokens (YYYY, YYYY-MM, quarters); tie → text; TSV paste sniff; oversized file yields `TABLE_TOO_LARGE`; each supported extension dispatches |
| `tableChecker` | grade matrix for a mixed fixture (heading row orange, blanks gray, coercion failures red); summary counts |
| `derivedColumns` | each whitelisted function; division by zero → null not Infinity; unknown identifier errors with position; **no access to globals** (an attempted `window` reference fails to parse) |
| `toSeries` | produces shapes identical to `query_shapes.js` on a shared fixture (the alignment test); unsupported-shape detection |
| `transformRegistry` × chart types | transforms now applied for bar/twoPeriod/heatmap/choropleth builders — fixture in, expected transformed values out (**regression for flagged issue 1**) |
| `validation` (new checks) | base year outside range warns (**issue 4**); raw hex warns; inline binding to a missing column errors; geo `unmatched` surfaces (**issue 3**) |
| `savedViews` v2 | round-trip identity minus computed keys; v1 fixture loads; `transform` no longer inside `filters` (**issue 6**); inline-data cap errors with `VIEW_TOO_LARGE` |
| `exportTable` | RFC-4180 quoting; displayTable equals codebridge's input table (shared fixture); XLSX round-trips through ExcelJS |
| `codebridge` (generate) | generated R/Stata snapshot tests per chart family; unexpressible features produce named `CODEGEN_UNSUPPORTED` warnings, not broken code |
| `codebridge` (parse) | **round-trip: `parseR(toRCode(spec)) ≈ spec`** for every supported chart family (same for Stata); an unrecognized command yields `CODE_UNSUPPORTED` and still builds the recognized part; malformed syntax yields `CODE_PARSE_ERROR` with position; a `read_csv`/`use` data reference resolves to the active dataset |
| `chartConfigStore` (RTL) | `SET_CHART_TYPE` with no matching preset shows the type's own roles (**issue 2**); `SET_DATA_SOURCE` swap keeps labels; `LOAD_SPEC` applies a small edit without refetch (requestKey unchanged) |
| `CodeEditorPanel` (RTL) | structural draft arms Run and does not auto-apply; parse error keeps the last good chart rendering |

The two Node-layer server changes (geo `unmatched`, month params) get JS tests too, since `lib/data/` is JavaScript; no pytest changes are needed.

---

## Part 8 — Performance & Efficiency

- **Bundle discipline.** CodeMirror (~150 kB), papaparse, ExcelJS (~250 kB), and the PDF pair jsPDF + svg2pdf.js load via dynamic `import()` only when Code mode, a paste, an upload/xlsx-export, or a PDF export actually happens. The default editor path ships zero new bytes of these. Plotly (already the heaviest asset) is unchanged.
- **Parse off the main thread.** Papaparse worker mode for files > 1 MB; ExcelJS parsing wrapped in a yielding chunk loop for large workbooks; row cap (default 50k rows) with a named error rather than a frozen tab.
- **Refetch only when the server answer can change.** The existing `requestKey` digest already scopes refetches; spec v2 keeps `format`/`appearance`/`annotations`/`labels`/`tier` out of it, so palette and label edits never refetch. Inline-data mode skips the network entirely — `toSeries` memoizes on `(tableRef, shapeKey)`.
- **Debounced code mode.** JSON small-edit auto-apply is a single 400 ms-debounced dispatch; the diff runs on the parsed draft (no re-stringify). R/Stata parse only on Run, never per keystroke. Code generation is lazy (on tab open) and cached per config hash.
- **Table editor stays light.** Pagination past 100 rows (no virtualization library); cell edits update one row immutably; grading is computed per visible page, memoized on `(table, page)`.
- **Export cost is bounded.** `Plotly.toImage` at scale > 2 on a large choropleth can allocate hundreds of MB; the scale control caps at 3 and the dialog states the output pixel size before rendering. JPG re-encode reuses one offscreen canvas.
- **No new server work.** All export, code generation/parsing, and table parsing are client-side; the two API changes add one lookup and one list to existing responses.

---

## Part 9 — Additional Libraries

| Library | For | Why this one | Notes |
|---|---|---|---|
| `@uiw/react-codemirror` + `@codemirror/lang-json` + `@codemirror/lint` | Code mode | CodeMirror 6 is modular/tree-shakable; Monaco is ~10× heavier and overkill for JSON | dynamic-imported; MIT |
| `papaparse` | CSV/TSV/TXT parse | battle-tested delimiter sniffing + worker mode | dynamic-imported; MIT |
| `exceljs` | XLSX read + write | installs cleanly from npm (no vendor registry), MIT, actively maintained; **confirmed 2026-07-06** | dynamic-imported. **Coverage tradeoff (accepted):** covers `.xlsx` (and `.csv`) only — **not** legacy `.xls` (BIFF), `.ods`, or `.dbf`. Those are deferred from v1; papaparse covers all delimited text. If legacy/ODS/DBF support becomes required, revisit SheetJS (which covers them but installs from its own registry) |
| `jspdf` + `svg2pdf.js` | PDF export | vector SVG → PDF in-browser, no server round-trip; keeps print output sharp | dynamic-imported (PDF export only); MIT |
| `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom` | JS test suite | see *Unit Tests* | dev-only |

Deliberately **not** added: a color-picker library (brand-token swatches only), a table/grid framework (`ui/table` + pagination suffices at our scale), `file-saver` (a 10-line `downloadBlob` helper), zod (validation.js + chartSpec already own the schema), any R/Stata *parsing library* (the recognized-subset parser is hand-rolled against `codebridge/grammar.js` — see 3.4 — so no dependency is pulled in), and any in-browser R runtime such as WebR (the parsed-subset design renders through Plotly instead). Per `AGENTS.md`, **new dependencies are an ask-first change** — this table is the ask.

---

## Part 10 — Implementation Phases

Each phase is shippable and ends with its tests green (`python -m pytest` stays green throughout; `npm test` grows per phase).

> [!success] Build complete (2026-07-07)
> **Phases 0–7 shipped** — 339 Vitest tests green (eslint clean, `npm run build` compiles). Phases 2–4 were implemented by the `code-implementer` subagent; Phases 5–7 directly by the orchestrator against pre-written acceptance tests. The orchestrator ran the gates (tests/lint/build) and reviewed for gaps each phase. Verification is **unit-test + lint + build**; no in-browser click-through was performed. Final supervisor sign-off recorded 2026-07-07 (see *Sign-off status*).

| Phase | Scope | Exit criteria | Status |
|---|---|---|---|
| **0. Pre-approved cleanup** | Palette single-owner build step (`COLORS` → generated CSS ramp); Vitest scaffolding + first tests for existing pure modules (`transformRegistry`, `validation`) | site renders pixel-identical; `npm test` exists and passes | ✅ Shipped |
| **1. Spec v2 + store** | `chartSpec.js`, store/savedViews migration, new reducer actions, `settingsTiers.js`, tier toggle in sidebar | old saved views + deep links load; **issue 6 fixed**; tiers filter the sidebar | ✅ Shipped |
| **2. GUI hardening** | transforms in all `toPlotly` builders (+ control gating), per-type encoding fallback, geo level + `unmatched` (client+server), base-year validation, `PalettePicker`, month-granular temporal control, Building Permits editor enabled | **issues 1–4 fixed**; permits module out of `UnderConstruction` | ✅ Shipped¹ |
| **3. Code mode** | `EditorModeToggle`, `CodeEditorPanel`, diff-classified auto-apply/Run, `codebridge/*` **bidirectional** R + Stata (generate + parse) against one grammar, `editorLog` + `EditorActivityLog` + Copy-technical-details | Flow C works end-to-end **including code→chart**; the `parseX(toXCode(spec)) ≈ spec` round-trip test passes per chart family | ✅ Shipped |
| **4. Your-data path** | `lib/tabular/*` (papaparse + ExcelJS), `DataSourcePanel`, `InputTableEditor` with cell grading, inline shaping via `toSeries` | Flow B works; alignment test vs `query_shapes` passes; no network traffic with inline data | ✅ Shipped |
| **5. Export** | `lib/export/*` (image incl. **PDF**, data CSV/XLSX, config), `ExportMenu`, modebar consolidation | Flow D works; PDF/PNG/SVG/JPG all export; exported CSV equals codebridge's input table | ✅ Shipped |
| **6. Catalog growth** | `pie`/`symbolMap`/`dataTable` registry ids + builders, `DataTableView`, variant switches (donut/pyramid/stacked/area), module-aware presets incl. the Projections age pyramid + Building Permits | every chart type has ≥1 preset; RegionTable re-based on DataTableView | ✅ Shipped² |
| **7. Docs + sign-off** | rewrite this doc as-built per [[refactor-doc-as-built-rewrite-process]]; projectSpec *Frontend Architecture* update; module audit statuses | supervisor sign-off on the shipped editor | ✅ Shipped |

¹ Phase 2 shipped except **Building Permits shared-view wiring**, deferred to Phase 6: `/api/building-permits` speaks only `line|twoPeriod|geoValues` with `permitType`/`startMonth`/`endMonth`, not the shared query views, so the module stayed `underConstruction` until Phase 6.

² Phase 6 shipped the catalog, presets, and `DataTableView`, and lifted Building Permits out of `underConstruction` with presets on the **supported** shapes (line + twoPeriod) plus a `parameter`→`permitType` translation in `chartData`. Two items remain a **server-tested follow-up** (not covered by the acceptance tests, can't be verified without a running server): the **category/bar shared-view** for `/api/building-permits`, and a **monthly `TemporalRangeSection`** UI. The bar preset was intentionally not shipped for this module until the category view exists.

### As-built notes (concise; refined into the full as-built rewrite in Phase 7)

- **Phase 0** — `tools/generate-palette-css.mjs` regenerates the `--ppic-*` CSS ramp from `COLORS` between markers in `globals.css` (byte-identical first run; `prebuild` hook + drift-guard test). Vitest scaffold: a custom `ppic:jsx-in-js` pre-plugin (`transformWithOxc`) because Vitest 4/rolldown ignores esbuild opts; `tests/js/setup.js` installs a MemoryStorage (jsdom's localStorage is a broken stub), an `afterEach(cleanup)` (RTL auto-cleanup doesn't self-register with `globals:false`), and a fetch stub that throws.
- **Phase 1** — `chartSpec.js` (SPEC_VERSION=2; `migrateSpec` unpacks the v1 `filters`-smuggled `transform`/`chartType`/`appearance` — **issue 6**; `normalizeSpec`/`printSpec`/`parseSpec` never throws/`diffSpec` small-vs-structural; `INLINE_DATA_MAX_BYTES`=1 MB). `settingsTiers.js` (basic/moderate/advanced, unknown controls fail open). Store + `savedViews` on the v2 wire shape; sidebar tier toggle.
- **Phase 2** — transforms run in every `toPlotly` builder gated by a `transformCapable` flag; bar/choropleth change-transforms fetch differently (bar→`twoPeriod` view, choropleth→two geo fetches joined). `palettes.js` + `PalettePicker` (brand tokens, never raw hex). `validateBaseYear` (**issue 4**) + geo `unmatched` client+server (**issue 3**); `/api/geography?level=` parameterized. Orchestrator gap-fixes: `requestKey` includes a `fetchTransform` term; dual-handle year window for change-transforms.
- **Phase 3** — `codebridge/` is one shared `grammar.js` read by both `toRCode`/`toStataCode` (generate) and `parseRCode`/`parseStataCode` (static, never-executing parsers that overlay onto the live config: `CODE_UNSUPPORTED` warns per unrecognized call, `CODE_PARSE_ERROR` carries a line). `parseX(toXCode(spec)) ≈ spec` round-trips pass per family. `CodeEditorPanel` hosts Spec/R/Stata CodeMirror tabs via `next/dynamic` (out of the default bundle); decision logic in a pure `codePanelController.js`. `editorLog` (in-memory ring, never localStorage) + `EditorActivityLog` + Copy-technical-details.
- **Phase 4** — `lib/tabular/` (client-safe; papaparse + ExcelJS **dynamic-imported** so neither enters the bundle): `parseTable` (paste/upload, legacy formats rejected by name, size cap), `columnTypes` (locale-aware, ties→text), `tableChecker` (per-cell colour grades), `derivedColumns` (**no `eval`** — hand-rolled parser, div-by-zero→null, no global access), `toSeries` (calls the real `query_shapes.js` builders so inline shapes are byte-identical — the alignment test drives both off one fixture). `DataSourcePanel` + color-graded `InputTableEditor`; `chartData` shapes inline data locally (no network). Orchestrator fix: `validateConfig` was raising schema-coupled false positives (`UNKNOWN_FIELD`/`SOURCE_REQUIRED`) on inline bindings — now gated off for inline mode, with a regression test.
- **Phase 5** — `lib/export/exportTable.js` (`displayTable` flattens the loaded result to `{filename, columns, rows}` per chart family, filename `<module>-<chartType>.csv` matching codebridge so exported CSV + generated R/Stata agree; `toCsv` RFC-4180; `toXlsxBlob` via **dynamic-imported** ExcelJS; `copyText`/`downloadBlob`) and `lib/export/exportImage.js` (`IMAGE_FORMATS` png/svg/jpeg/pdf; `suggestFilename`; `exportImage` drives `Plotly.toImage` off the **caller-supplied graph div** — never imports Plotly; PNG/SVG/JPEG via data-URL anchor; **PDF renders SVG then converts via dynamic-imported jsPDF + svg2pdf.js**; failures → named `EXPORT_RENDER_FAILED`/`EXPORT_ENCODE_FAILED`). `ExportMenu` is one dropdown (image / CSV-XLSX / copy-download-import config; copy = compact spec JSON); `PlotlyChart` gained `onGraphDiv` and drops Plotly's built-in `toImage` modebar button so ExportMenu is the sole export path; `ModuleEditor` captures the graph-div ref and mounts `ExportMenu`. New deps: `jspdf`, `svg2pdf.js` (dynamic-imported, PDF only).
- **Phase 6** — three new base chart ids (`pie`, `symbolMap`, `dataTable`); named forms stay **variants** (`appearance.hole` donut, `appearance.mirror` pyramid, `stackMode` stacked/percent, `line appearance.area`), and every descriptor gained per-control `controlTiers`. `toPlotly` grew `pieSpec`/`symbolMapSpec` and a `dataTable` short-circuit to `{ table }`; `DataTableView` (search/sort/paginate) is the renderer and `RegionTable` now delegates to it. Presets became **module-aware**: 8 generic presets give every chart type a starting point, and `schema.presets` (validating configs) landed for Building Permits (out of `underConstruction`, on line + twoPeriod shapes) and the Projections **age pyramid** (mirrored bar). A `chartData` `parameter`→`permitType` translation wires the Building Permits measure selector to the shared encoding path. Remaining (server-tested follow-up, per footnote ²): the category/bar view + monthly slider for Building Permits.

### Adding a preset (the repeatable recipe the notes asked for)

A preset is data, not code. Given requirements or an exported config: **(1)** build the chart in the editor and export its config; **(2)** strip instance noise (period to defaults, no inline data); **(3)** add it to the owning module schema's `presets` array as `{ id, title, question, config }`; **(4)** a generic Vitest case iterates every `schema.presets` entry and asserts it validates against its schema, so new presets are tested automatically; **(5)** optionally register a landing tile in `categoryRegistry`. No component changes — this is the whole procedure.

---

## Decisions (resolved 2026-07-06)

The open questions from the first draft were reviewed and resolved:

1. **Code → chart for R/Stata — IN SCOPE.** The code editor is bidirectional: a researcher can write R or Stata and get a chart, via the recognized-subset parser (`codebridge/`). Chosen over in-browser R execution (WebR) because it is symmetric across R and Stata and renders through Plotly like every other chart. Scope limit: only the documented chart grammar is recognized; other commands warn.
2. **Spreadsheet library — ExcelJS, confirmed (2026-07-06).** ExcelJS installs cleanly from npm and covers `.xlsx` + `.csv`. The accepted tradeoff is that legacy `.xls`/`.ods`/`.dbf` are **deferred from v1**; revisit SheetJS only if those formats later become required.
3. **PDF export — IN SCOPE.** Added as a vector export (SVG → PDF via jsPDF + svg2pdf.js), alongside PNG/SVG/JPG.
4. **Locator maps & mini-chart tables — DROPPED.** Neither is in v1. `symbolMap` (a proportional-symbol map) and the plain `dataTable` remain; the `dataTable` ships without embedded mini-charts.
5. **Sharing — no server links; sharing *is* export.** Two independent actions: share the **chart** by handing over its PNG/SVG/PDF, and/or share the **data** by handing over the exported (cleaned, curated) CSV/Excel — user-supplied or preset. Nothing is uploaded or stored server-side; there is no share URL to build.
6. **Telemetry — off.** No editor activity is sent anywhere. Only the local Activity log exists, plus a **Copy technical details** button so a user can *voluntarily* paste the log into a bug report.

### Sign-off status (2026-07-07)

Design-level sign-off was **granted** (2026-07-06); **final supervisor sign-off on the shipped editor was granted 2026-07-07**. All seven phases are complete (see *Part 10*).

- ✅ **ExcelJS confirmed** — accepted, with legacy `.xls`/`.ods`/`.dbf` deferred from v1.
- ✅ **Recognized-subset boundary for R/Stata accepted** — the code editor charts the documented grammar and warns on the rest; arbitrary-script execution is not expected. This bounded Phase 3.
- ✅ **New-dependency list approved** — the *Additional Libraries* table (CodeMirror 6, papaparse, ExcelJS, jsPDF + svg2pdf.js, Vitest/RTL) was cleared under the `AGENTS.md` ask-first rule and installed.
- ✅ **Supervisor sign-off (2026-07-07)** — the shipped editor is **accepted**: Phases 0–7 delivered, 339 Vitest tests green, eslint clean, `npm run build` compiles. Two non-blocking follow-ups are tracked in footnote ² (the Building Permits category/bar shared-view and a monthly `TemporalRangeSection`), to be verified against a running server.

### Deferred (post-v1, not blocking)

- **Real-R execution (WebR)** as an optional escape hatch for R users who need beyond the recognized subset.
- **WebR-style Stata** — not possible (no in-browser runtime); Stata stays subset-parse + code-gen.
