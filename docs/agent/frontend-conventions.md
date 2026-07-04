---
name: frontend-conventions
description: >
  Enforces structure, documentation, and reuse conventions for React/Next.js components and
  frontend files. Use this skill for ANY frontend coding task — new components, page routes,
  data-fetching hooks, chart wrappers, or any .js/.jsx file in the web project. Triggers on:
  "create a component", "add a page", "build a chart", "frontend", "React", ".jsx", or any
  request to create or modify a frontend file. Also trigger when the user asks to refactor,
  document, or style an existing component. This skill defines HOW component files are
  structured internally, HOW they're documented, and WHEN to create vs. reuse. Always consult
  this skill even for single-component tasks — consistent documentation matters at every scale.
  Works alongside web-architecture (which defines WHERE files go) and frontend-design (which
  defines visual aesthetics).
Topic: Convention Guide
Content Type: agent instructions
pinned: false
Date Published: June 30, 2026
Last Updated: 06/30/2026 - 10:17 AM
---

# Frontend Conventions Skill

Conventions for writing well-structured, self-documenting React/Next.js components. Every component should be understandable by someone who has never seen the codebase, just by reading the file header and prop definitions.

---

## Guiding Principle

**Reuse what exists before building something new.** The first step for any frontend task is to check the UI Kit page and the existing `components/` tree. If an existing component can serve the need (with or without minor extension), use it. A new component is created only after confirming with the user that nothing existing fits.

---

## Component Reuse Policy (Required)

Before creating any new component, follow this checklist in order:

1. **Check the UI Kit page** on the main website for an existing pattern that fits (see [UI Kit Reference](#ui-kit-reference))
2. **Search `components/`** for an existing component that does the same or similar thing
3. **Evaluate extension** — can an existing component be extended with a new prop or variant rather than duplicated?
4. **Confirm with the user** — if none of the above apply, describe what the new component will do and ask for approval before creating it

Only after step 4 gets a clear yes should a new component file be created.

### When Reuse Applies

- A button with different text is not a new component — it is a prop
- A card with a slightly different layout is a variant, not a new component — add a `variant` prop
- A chart wrapper that filters differently is a configuration change — parameterize the existing wrapper
- A completely new interaction pattern with no existing analog is a legitimate new component — confirm first

### Anti-patterns

- Creating `SpecialButton.js` when `Button.js` exists and accepts `variant`/`size` props
- Copying an existing component, tweaking two lines, and saving it as a new file
- Building a one-off layout wrapper when the UI Kit already defines that pattern
- Bypassing the UI Kit because "it's faster to just write it from scratch"

---

## UI Kit Reference

The project maintains a **UI Kit as a page on the main website** (not a standalone app or separate design system site). This page is the canonical visual reference for every reusable element: buttons, cards, form controls, typography specimens, color swatches, chart containers, and layout patterns.

### How to Use It

- **Before building any UI element**, check the UI Kit page to see if the pattern already exists
- **Match the UI Kit's implementation** — use the same component, the same props, the same class names. Do not approximate it with fresh markup
- **When the UI Kit lacks a pattern you need**, flag it to the user. The correct response is to add the pattern to the UI Kit first, then use it — not to build a one-off and skip the Kit
- **When the UI Kit and `constants.js` conflict**, `constants.js` is the source of truth for token values (colors, spacing, fonts), and the UI Kit is the source of truth for how those tokens are composed into components

### Keeping the Kit Current

Any new shared component that gets approved through the reuse policy should eventually be documented on the UI Kit page. This is not a blocker for shipping, but it is a follow-up task.

---

## Component File Header (Required)

Every component file begins with a JSDoc block containing these sections in order:

1. **Filename and purpose** — one line: `ComponentName.js — what it renders`
2. **Props** — every prop with its type and a brief description
3. **Data sources** — what data the component expects and where it originates
4. **UI Kit reference** — whether this component implements a UI Kit pattern (or is unique)

```js
/**
 * RegionLineChart.js — time-series line chart for a selected set of regions.
 *
 * Props:
 *   data          {Array<Object>}  — rows from PopHousing_Current, pre-filtered by the page
 *   locations     {Array<string>}  — selected location names to plot
 *   parameter     {string}         — column name to chart (e.g., "Total Population")
 *   baseYear      {number|null}    — if set, index all series to 100 at this year
 *   yearRange     {[number,number]} — start and end year for the x-axis
 *
 * Data sources:
 *   - /api/pophousing (Next.js API route, sourced from PopHousing_Current.csv)
 *
 * UI Kit reference:
 *   - Implements the "Chart Container" pattern from the UI Kit page
 */
```

### Rules

- The **first line** is always `ComponentName.js — short description`
- **Props** lists every prop the component accepts, with its type in braces and a brief annotation
- **Data sources** names where the data originates — an API route, a static JSON file, a parent component's fetch, or props drilled from a page orchestrator
- **UI Kit reference** states which UI Kit pattern this component implements, or `None — unique to this page` if it has no Kit analog
- Server components that load data directly should list those sources under **Data sources**; client components that receive data via props should say `Via props from parent`

---

## Internal Structure

### Section Headers

Use the same two-level visual header system as the Python conventions, adapted for JS files.

**Level 1 — Major sections** (top-level logical blocks within large components or utility files):

```js
/**
 * ======================================================================
 * Section Name
 * ======================================================================
 */
```

**Level 2 — Subsections** (helper groups, related hooks, logical groupings):

```js
// ── Helpers ──────────────────────────────────────────────────────────
```

Most components are short enough that only Level 2 headers are needed (or none at all). Reserve Level 1 for files over ~200 lines, such as complex page orchestrators or large utility modules.

### Standard Section Order

Component files follow this top-to-bottom order:

```
1. "use client" directive (if needed — omit for server components)
2. JSDoc file header (the block described above)
3. Imports (React/Next → third-party → local components → lib/utils → constants)
4. Constants / static config local to this file
5. Helper functions (pure functions used only by this component)
6. Component definition (export default function)
7. Sub-components (if tightly coupled and not reused elsewhere)
```

### Example Skeleton

```js
"use client";

/**
 * LocationSelector.js — multi-select dropdown for choosing geographic locations.
 *
 * Props:
 *   locations       {Array<string>}  — available location names
 *   selected        {Array<string>}  — currently selected locations
 *   onSelectionChange {Function}     — callback with updated selection array
 *   geoLevel        {string}         — geographic level filter ("County"|"City"|"Region")
 *   presets         {Object|null}    — named preset groups (e.g., { "Major Counties": [...] })
 *
 * Data sources:
 *   - Via props from parent (page orchestrator fetches location list from API)
 *
 * UI Kit reference:
 *   - Implements the "Multi-Select Dropdown" pattern from the UI Kit page
 */

import { useState, useMemo } from "react";

import { REGIONS_MAPPING } from "@/lib/constants";

// ── Helpers ──────────────────────────────────────────────────────────

function filterByGeoLevel(locations, geoLevel) {
  // Filter logic...
}

// ── Component ────────────────────────────────────────────────────────

export default function LocationSelector({
  locations,
  selected,
  onSelectionChange,
  geoLevel,
  presets = null,
}) {
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = useMemo(
    () => filterByGeoLevel(locations, geoLevel),
    [locations, geoLevel]
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Component JSX */}
    </div>
  );
}
```

---

## Styling Conventions

### Tailwind CSS First

All styling uses Tailwind CSS utility classes. No inline `style` objects except for truly dynamic values that Tailwind cannot express (e.g., a computed width from data, a Plotly chart dimension).

```jsx
// Correct — Tailwind utilities
<div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">

// Correct — dynamic value that must be computed
<div style={{ width: `${percentage}%` }}>

// Wrong — static values in style objects
<div style={{ borderRadius: "8px", padding: "16px", backgroundColor: "#FFFFFF" }}>
```

### Design Tokens from `constants.js`

Colors, fonts, spacing values, and brand tokens come from `lib/constants.js`. Never hard-code a hex color, font family, or layout dimension inside a component.

```js
// Correct
import { colors } from "@/lib/constants";
// ... then use colors.primary in Plotly config or rare inline styles

// Wrong
const HIGHLIGHT_COLOR = "#CA4F1A"; // defined inside the component file
```

If a token does not yet exist in `constants.js`, add it there first, then import it.

### Class Organization

When a Tailwind `className` string gets long, group utilities in this order for readability: **layout → sizing → spacing → typography → colors → borders → effects → responsive**.

```jsx
<h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 border-b pb-2 md:text-xl">
```

---

## Prop Conventions

### Destructure in the Signature

Always destructure props in the function signature, not inside the body. This makes the component's interface visible at a glance.

```js
// Correct
export default function ChartCard({ title, children, className = "" }) {

// Wrong
export default function ChartCard(props) {
  const { title, children, className } = props;
```

### Default Values

Provide defaults for optional props directly in the destructuring. Do not use `defaultProps` (deprecated in React 19).

```js
export default function MetricDisplay({
  value,
  label,
  format = "number",     // "number" | "percent" | "currency"
  trend = null,          // { direction: "up"|"down", magnitude: number } or null
  size = "md",           // "sm" | "md" | "lg"
}) {
```

### Prop Naming

- Boolean props use `is`/`has`/`show` prefixes: `isLoading`, `hasError`, `showLegend`
- Callback props use `on` prefix: `onSelect`, `onYearChange`, `onLocationChange`
- Data props use descriptive nouns: `locations`, `yearRange`, `chartData`
- Avoid generic names like `data` or `items` when a more specific name exists

---

## Data & State Conventions

### Server Components Load, Client Components Display

Follow the page-orchestrator pattern from web-architecture: server components (pages, layouts) fetch data; client components receive it via props and handle interaction.

```js
// app/population/page.js (server component — no "use client")
import PopulationDashboard from "@/components/population/PopulationDashboard";

export default async function PopulationPage() {
  const res = await fetch(`${process.env.API_URL}/api/pophousing`);
  const data = await res.json();

  return <PopulationDashboard data={data} />;
}
```

### State Ownership

State lives in the lowest common ancestor of the components that need it. Avoid lifting state higher than necessary.

- **Page-level state:** active tab, selected geographic level, year range — lives in the page's top-level client component
- **Component-level state:** dropdown open/closed, search input text, hover highlight — lives in the component itself
- **Derived values:** filtered data, computed aggregations — use `useMemo`, not separate state

### Data Fetching

- **API routes** (`app/api/`) are preferred over static JSON for datasets that update on a schedule. The route handles server-side filtering; the client sends query parameters
- **Static JSON** (`public/data/`) is acceptable for small, rarely-changing reference data (geojson, region mappings, metadata)
- **Never fetch inside a render loop.** One fetch per page load, filter client-side or via query params

---

## Chart Component Conventions

Since this project relies heavily on Plotly.js via `react-plotly.js`, chart components follow additional conventions.

### Wrapper Pattern

Every chart type gets a single reusable wrapper. The wrapper accepts data and configuration as props and builds the Plotly `data`/`layout`/`config` objects internally.

```js
/**
 * TimeSeriesChart.js — Plotly line chart wrapper for multi-location time series.
 *
 * Props:
 *   traces    {Array<Object>}  — array of { name, x, y } trace definitions
 *   title     {string}         — chart title
 *   yLabel    {string}         — y-axis label
 *   baseYear  {number|null}    — if set, index to 100 at this year
 *   height    {number}         — chart height in pixels (default: 500)
 *
 * Data sources:
 *   - Via props from parent
 *
 * UI Kit reference:
 *   - Implements the "Chart Container" pattern from the UI Kit page
 */
```

### Configuration Defaults

Plotly `config` and `layout` defaults live in a shared utility, not repeated per chart:

```js
// lib/chartDefaults.js
import { colors, fonts } from "@/lib/constants";

export const defaultConfig = {
  responsive: true,
  toImageButtonOptions: { format: "svg" },
  displaylogo: false,
};

export const defaultLayout = {
  font: { family: fonts.sans },
  paper_bgcolor: "transparent",
  plot_bgcolor: "transparent",
  margin: { t: 40, r: 20, b: 40, l: 60 },
};
```

### Brand Colors in Charts

Chart colors reference the brand palette from `constants.js`. The highlight color for California / statewide aggregates is the PPIC orange. Do not hard-code hex values inside chart component files.

---

## Documentation Standards

### Inline Comments

The same rules as the Python conventions:

- Comment **why**, not **what**. `// Filter to counties` above `.filter(d => d.geoLevel === "County")` is noise. `// Counties only — cities dwarf the bar chart scale` is useful
- Comment non-obvious business logic, threshold values, and workarounds
- Never comment out code and leave it — delete it (git has the history)

### TODO Format

Use a consistent format so TODOs are greppable:

```js
// TODO(trinity): add mobile breakpoint for chart height — currently overflows on small screens
```

Format: `TODO(author): description`. No bare `// TODO` without attribution.

---

## Error & Loading State Handling

### Every Async Boundary Needs Three States

Any component that depends on fetched data must handle: **loading**, **error**, and **success**. Do not render a chart with `undefined` data and let it crash silently.

```js
if (isLoading) return <ChartSkeleton height={height} />;
if (error) return <ChartError message={error.message} />;
return <Plot data={traces} layout={layout} config={config} />;
```

### Error Messages Are Actionable

Error states tell the user what went wrong and what they can do. "Failed to load data" is insufficient. "Population data unavailable — try refreshing, or select a different year range" is useful.

### Fail Gracefully on Missing Data

If a location has no data for a selected year range, omit it from the chart with a note — do not crash the entire page. This mirrors the Python convention of skipping with a warning rather than halting.

---

## Accessibility Baseline

These are non-negotiable minimums, not aspirational goals:

- Every interactive element is reachable and operable by keyboard
- Every `<img>` has a descriptive `alt` (or `alt=""` if purely decorative)
- Form controls have associated `<label>` elements
- Color is never the sole means of conveying information — pair it with text, pattern, or icon
- Chart components include a visually hidden summary or data table for screen readers when feasible

---

## Import Order

Imports are grouped with a blank line between each group, in this order:

```js
// 1. React / Next.js
import { useState, useMemo } from "react";
import Link from "next/link";

// 2. Third-party libraries
import dynamic from "next/dynamic";
import Papa from "papaparse";

// 3. Local components
import ChartCard from "@/components/shared/ChartCard";
import LocationSelector from "@/components/shared/LocationSelector";

// 4. Utilities and data helpers
import { filterByGeoLevel, computeIndexed } from "@/lib/utils";
import { loadPopHousingData } from "@/lib/loadData";

// 5. Constants and config
import { colors, REGIONS_MAPPING } from "@/lib/constants";
```

Always use the `@/` path alias. Never use relative paths like `../../lib/constants`.

---