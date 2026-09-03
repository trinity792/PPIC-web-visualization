---
Topic: Visualization backend
Content Type: implementation plan
pinned: false
description: "A tests-first implementation plan for replacing chart-shaped data requests with a shared question, comparison, capability, and observation system for programmers continuing the visualization refactor."
Date Published: August 28, 2026
Last Updated: 08/28/2026 - 05:49 PM
Status: Draft
---

# Visualization Backend Refactor: Implementation Plan

> [!info] Who this is for and how to read it
> This document hands the approved visualization-backend refactor to an implementer who has not participated in the design discussion. It specifies the target behavior, file boundaries, tests, cutover, and review gates. It does not contain finished implementation code. Write the named contract tests before each workstream's implementation, keep the new path unwired until every chart family is ready, and use the final cutover workstream only after the proving set and all remaining adapters pass.

This plan turns the decisions in [[visualization-backend-refractor]] into executable work. It covers the shared chart configuration, comparison editor, time and calculation controls, server query contract, render adapters, exports, settings reference, tests, and coordinated retirement of the old path. It does not change the cleaned dataset contracts or the Python acquisition pipelines.

The editor may change control names and forms, but the existing **Outcome** section keeps its name and position directly after Chart Type. The current minimal interface and orange accents remain. The official PPIC Data Visualization Style Guide displayed on `/ui-kit` is the visual authority.

No existing v1 or v2 saved view or shared link must continue to open. The new version must still save, restore, import, export, and share its own configurations. The old data and code remain recoverable during review, but the new runtime does not interpret them.

| # | Workstream | What it closes | Depends on |
|---|---|---|---|
| A | One contract describes the question before the chart | Configuration v3, stable comparisons, observations, capabilities, defaults, and labels | - |
| B | One calculation engine owns the meaning of every returned value | Backend calculation ownership, missing and suppressed data, aggregates, and ranking | A |
| C | One coordinated request returns all comparisons | Module API and data-access migration, partial comparison success, and inline-data parity | A, B |
| D | The editor exposes only valid question controls | Comparison cards, generated combinations, time controls, calculation placement, and Advanced Mode | A, B |
| E | Every renderer presents the common observations without redefining them | Tabs, labeled lines, stable PPIC colors, chart adapters, tables, and exports | A, C |
| F | The current test suite protects requirements instead of obsolete mechanics | Fixture contracts, current-test reconciliation, full flows, and visual regression | A, B, C, D, E |
| G | Every setting has an owner, a consumer, and readable documentation | Settings inventory, generated factual reference, additional-information toggle, and STE review | A, D, E |
| H | All chart families cut over together and legacy removal stays reversible | Single runtime cutover, new storage namespace, `.trash` quarantine, removal changelog, and approval gates | C, D, E, F, G |

> [!warning] The new and old editors must not split production traffic
> Internal implementation may proceed behind an unwired module or development-only flag. Do not expose the new request contract to some chart families while other chart families still mutate the v2 question through `filters`, `bindings`, and chart-shaped query URLs. The public cutover happens once, after every registered chart type has a v3 adapter and the whole acceptance suite passes.

---

## Decisions and Repository Findings

### Decisions this plan treats as closed

| Subject | Decision |
|---|---|
| Comparison scope | Standard Mode shares outcome, geography, and time. Advanced Mode may override geography and time per comparison. Outcome remains shared in v1 of the new model. |
| Comparison construction | Users can generate a regular cross-product from checkboxes or add irregular combinations one at a time. Both interfaces write the same comparison list. |
| Comparison limit | Ten comparisons are allowed. The interface prevents an eleventh. |
| Overlap | Aggregate and subgroup comparisons may overlap. Labels and additional information must make the overlap visible. |
| Multiple outcomes | Deferred in Standard and Advanced modes. |
| Time | Incompatible chart switches clear the active time selection and show `Select time to show this chart`. Projection snapshots default to the declared reporting year. |
| Multiple donut years | Users choose automatic year tabs or an arithmetic mean. The mean is labeled as an average and lists its included years. |
| Comparison display | Maps and heatmaps use tabs. Lines show one descriptively labeled line per comparison by default and may use tabs. Other chart families use only presentations declared in their capabilities. |
| Colors | Use the exact official PPIC schemes and ramps from the UI Kit. Attach assignments to stable comparison identifiers. |
| Validation | Mathematical errors block the affected comparison. Other valid comparisons continue. The whole chart blocks only when the shared question is invalid or no valid comparison remains. Crowding alone does not block. |
| Recommendations | Recommendations never change the selected chart automatically. |
| Visual tests | Line, Bar, Range, and Heatmap. |
| Data fixtures | Age, Sex & Race Projections and Components of Change. |
| Rollout | Prove Line, Bar, choropleth map, data table, and donut first behind the new boundary. Migrate every chart family before one public cutover. |
| Documentation | Generate factual settings data, keep explanations human-written, and let the reader hide all additional information. The developer approves every new or changed setting. |
| Legacy code | Unwire or quarantine replaced code during implementation. Record every item and replacement. Permanently delete one item at a time only after developer approval. |
| Language review | Apply Simplified Technical English to user-facing labels, help, validation, and the final documentation before implementation review. Later user feedback may change the first release. |

### Naming assumptions resolved from the repository

| Product name | Current implementation id | Plan meaning |
|---|---|---|
| Map | `choroplethMap` | The proving map because it exercises a value-based geographic color scale. `symbolMap` still migrates before cutover. |
| Range | `dumbbell` | The two-period range chart and one of the four visual-regression targets. |
| Donut | `pie` with `appearance.hole > 0` | The repository treats pie and donut as one chart family with a presentation variant. |
| Reporting year for the initial Projections fixture | Not represented in the current schema | Add explicit metadata and use 2025, the latest observed Census estimate year currently documented in the repository. Do not derive this default from the 2070 projection horizon. |

### The current request path is chart-shaped

`components/chart-builder/chartData.js` selects an API view from the chart id before it sends the request:

```js
const QUERY_SHAPES = Object.freeze({
  line: "line",
  bar: "category",
  dumbbell: "twoPeriod",
  heatmap: "matrix",
  choroplethMap: "geo",
});
```

This mapping makes the chart type part of the data question. It also divides calculations between the API, `chartData.js`, and `transformRegistry.js`. A switch from Line to Bar can therefore change both the response shape and where the calculation runs. Workstreams A through C replace this boundary with one question request and one observation response.

### Time controls infer meaning from chart ids

`components/chart-builder/sections/DateRangeSection.js` currently classifies a small set of chart ids as ranges and treats the rest as snapshots:

```js
const RANGE_CHART_TYPES = ["line", "heatmap", "dotPlot", "dumbbell"];
```

The same component then writes either `period.startYear` and `period.endYear` or `period.year`. This is why the present test suite correctly pins the current slider but cannot describe searchable years, selected snapshots, an average mode, source-specific reporting years, or a forest plot whose endpoints are measures rather than periods. Workstreams A and D move that decision into capabilities.

### Null population values can become zero

`lib/data/demographic_projections.js`, in `stratifiedRows`, currently uses zero as the fallback while it aggregates age groups:

```js
existing[PARAMETER] += row[PARAMETER] ?? 0;
```

That behavior conflicts with the approved missing-data contract. A missing or suppressed input cannot contribute zero to a sum, average, change, index, or rank. Workstream B replaces the coercion with status-aware aggregation and audits the other data modules for the same pattern.

### The runtime palette differs from the official source

`components/ui-kit/ppicSpec.js` transcribes the official ordered three-to-ten-group schemes. `lib/visualization/palettes.js` labels a different sequence as official and explains that Lime was moved as an editorial adjustment. The user selected the UI Kit guide as the authority. Workstream E makes the runtime consume one shared, guide-verbatim source and removes the contradictory official label from adjusted palettes.

### Configuration compatibility currently drives the store

`lib/visualization/chartSpec.js` declares `SPEC_VERSION = 2`, migrates v1, and preserves retired chart types and keys so old links continue to render. `components/chart-builder/savedViews.js` uses the `ppic.savedViews.v1` storage namespace. That work was valid for the prior requirement, but it is not a requirement for this cutover. Workstream H introduces a v3-only reader and a new storage namespace, while keeping the old reader recoverable in `.trash` until review.

### There is no visual-regression runner or settings inventory

The repository uses Vitest, Testing Library, and jsdom. `package.json` has no browser screenshot dependency or script. Advanced settings are gated inside several components, and the Settings Reference is a hand-maintained section of `visualization-specification.md`; there is no machine-readable inventory that can prove every visible or stored setting has a consumer. Workstreams F and G add these missing foundations.

---

## Workstream A - One contract describes the question before the chart

### The contract the rest of the work reads

Version 3 separates `question` from `presentation`. The question owns the module or inline dataset, source, one outcome, shared geography, shared time, one calculation, and the ordered list of comparisons. The presentation owns chart type, tab mode, chart-specific state, labels, formatting, annotations, and appearance.

Do not carry `Group`, `Series`, `comparisonMode`, `filters.tabColumn`, `filters.tabValue`, or `filters.tabOrder` into the v3 question as generic concepts. Keep a role only when a renderer genuinely needs that role. Keep presentation tabs as explicit presentation state, not as a filter that changes the stored population definition.

Each comparison contains a generated stable id, derived label inputs, an optional custom label, dimension selections, an optional PPIC color token, and optional Advanced Mode geography and time overrides. Generate the id once. Do not encode mutable selection values in it. When checkbox generation recreates a canonical combination that already exists, match it by canonical signature and retain its id, custom label, and color.

The observation response uses rows with these required meanings:

| Field | Meaning |
|---|---|
| `comparisonId` | Stable id from the request. |
| `comparisonLabel` | Resolved custom or derived label used by chart, table, and export. |
| `measureId`, `measureLabel`, `unit` | The one shared outcome and its display metadata. |
| `period` | The observation period, or the derived result's display period. |
| `geographyId`, `geographyLabel` | Stable geographic identity and display label when applicable. |
| `categoryId`, `categoryLabel` | A non-geographic category when the chart needs one. |
| `value` | A finite number only when `status` is `available`; otherwise null. |
| `status` | `available`, `missing`, or `suppressed`. |
| `valueKind` | `observed`, `projected`, or `derived`; this is separate from availability. |
| `calculation` | Applied calculation id and its parameters. |
| `includedPeriods` | Periods included in an average, change, or index result when applicable. |
| `source` | Source or vintage needed to interpret the value. |

The response also carries a comparison summary, ordered period metadata, and structured issues. An issue states its code, level, message, and optional `comparisonId`. Renderers must not infer missing comparisons by inspecting absent traces.

### Capability matrix to encode

Extend `lib/visualization/chartRegistry.js` or place a companion descriptor in `lib/visualization/chartCapabilities.js`, but expose one merged descriptor to consumers. Write the matrix below by hand in tests. Do not make a test read the registry and then use that same registry as its expectation.

| Chart id | Time contract | Comparison presentation | Calculation boundary |
|---|---|---|---|
| `line` | Range or ordered sequence | Combined labeled lines by default; optional comparison tabs | Actual, index, valid change, and benchmark difference |
| `bar` | One snapshot; selected snapshots use tabs; valid change uses exactly two periods | Grouped or stacked where valid; optional comparison tabs | Actual, valid change, benchmark difference, and backend ranking |
| `choroplethMap` | One snapshot; selected snapshots use tabs; valid change uses exactly two periods | Required comparison tabs | Actual, valid change, benchmark difference, and backend ranking |
| `heatmap` | Range or selected sequence | Required comparison tabs | Actual, valid change only when the resolved axes remain meaningful, and backend ranking |
| `dumbbell` | Exactly two periods for module data | One row or mark per comparison and category | Actual endpoints; do not apply a second change transform |
| `dotPlot` | Range when an axis is temporal; otherwise one snapshot or none | Combined labeled series or capability-declared tabs | Actual and backend ranking |
| `forest` | One snapshot or none; lower and upper bounds are measure roles, not time endpoints | One row or interval per comparison | Actual estimate and interval only |
| `scatter` | One snapshot or none | Combined labeled points or capability-declared tabs | Actual and backend ranking; separate x and y measures remain a chart-role exception, not multi-outcome comparisons |
| `bubble` | One snapshot or none | Combined labeled points or capability-declared tabs | Same as Scatter, with a nonnegative size measure |
| `pie` | One snapshot; selected snapshots use year tabs or a labeled average | Slices only for one categorical breakdown; otherwise comparison tabs | Actual or selected-year average only |
| `symbolMap` | One snapshot; selected snapshots use tabs | Required comparison tabs | Actual and backend ranking |
| `dataTable` | Any valid requested periods | All comparisons in labeled rows or columns | Every approved calculation returned by the backend |

Standard Mode hides chart choices and settings that the resolved question cannot support. Advanced Mode may expose a crowded or experimental presentation only if its calculations and encodings remain mathematically valid. A resolver returns both visible choices and reasons. It never changes `presentation.chartType` on the user's behalf.

### Derived labels and defaults

Add label metadata to each module schema. The metadata declares dimension order, aggregate labels to omit, and source or geography labels that must be retained for disambiguation. For Projections, derive labels in the order geography, race or ethnicity, sex, then age. Omit aggregate values such as `All`, `Both Sexes`, and `All Ages` unless omitting them would cause two labels to collide. A comparison for San Francisco, Latina, Female, and All Ages therefore becomes `San Francisco Latina Women`.

If two derived labels still collide, append the shortest differing source, time, or dimension label. A custom label always wins. The same resolved label must reach Plotly, the Data view, CSV, XLSX, saved v3 config, and accessible chart descriptions.

Add explicit time metadata to module schemas. Replace the assumption that every annual module can be described only by `[min, max]` with available periods, optional reporting periods, and a default reporting period. The Projections schema declares 2025 as the initial reporting-year default. Future pipeline or schema updates change that metadata; the editor does not use the 2070 maximum as a snapshot default.

### Implementation

1. Create `lib/visualization/questionSpec.js`. Define v3 normalization, canonical key order, current-version validation, structural-diff classification, and clean rejection of all non-v3 inputs. Preserve the inline-data size limit and workspace serialization behavior without importing v1 or v2 migration logic.
2. Create `lib/visualization/comparisons.js`. Own stable-id creation, canonical signatures, cross-product expansion, irregular-card edits, the ten-comparison guard, aggregate overlap metadata, and derived-label resolution.
3. Create `lib/visualization/observationContract.js`. Own status and value-kind constants, row validation, response validation, issue shapes, and deterministic ordering. Keep it client-safe so server routes, inline data, render adapters, tables, and exports can validate the same contract.
4. Extend `lib/visualization/chartRegistry.js` and create `lib/visualization/resolveEditorModel.js`. Add explicit time, comparison-presentation, calculation, geography, and appearance capabilities. The resolver combines the chart, module schema, v3 question, and Standard or Advanced mode into one immutable editor model.
5. Extend `lib/visualization/moduleSchemas/demographicProjections.js` and `componentsOfChange.js` with comparison-dimension metadata, label order, aggregation metadata, available period metadata, and reporting-year defaults. Extend the other module schemas before cutover in Workstream H.
6. Update `components/chart-builder/chartConfigStore.js` to store v3 question and presentation state. Keep undo, redo, multi-chart layout, and chart-specific remembered presentation state. When a chart switch changes the required time shape, clear the active time value, preserve it only in that chart family's remembered presentation state, and produce the empty-time state.

The store may remember an inapplicable chart-specific presentation setting for switching back. It must never leave that hidden setting active on the current chart. Shared question values remain only when the new capability accepts them.

### What this invalidates

This work makes the following sections of [[visualization-specification]] inaccurate: *The chart config*, *Advanced Mode*, *Outcome*, *Date Range*, *What a Series is for*, *Settings Reference*, and every table that describes `filters.tab*`, `transform`, or v2 migration. Do not rewrite those sections until Workstream G can document verified behavior.

It also invalidates the migration language in `lib/visualization/chartSpec.js`, exact v2 shapes in `components/chart-builder/savedViews.js`, and reducer tests that name the current action vocabulary. Preserve the files until Workstream H decides whether they are rewritten in place or quarantined.

### Tests

New file: `tests/js/lib/visualization/questionSpec.v3.test.js`.

| Test | What it verifies |
|---|---|
| `round-trips one v3 question without computed state` | Current-version serialization preserves the question and presentation and strips runtime metadata. |
| `rejects v1 and v2 without attempting a migration` | Older formats return an explicit unsupported-version result. |
| `classifies a comparison edit as structural` | A comparison filter change requires a new data request. |
| `classifies an active tab change as presentation-only` | Moving between already-loaded comparison tabs does not redefine the question. |
| `remembers inactive chart presentation without applying it` | Switching away and back restores chart-specific appearance, while the inactive value has no current effect. |

New file: `tests/js/lib/visualization/comparisons.test.js`.

| Test | What it verifies |
|---|---|
| `expands two races and two sexes into four comparisons` | Regular checkbox generation produces the exact cross-product. |
| `keeps only Black women and White men when added as irregular cards` | Irregular combinations do not create unwanted pairings. |
| `reuses identity when a generated signature returns` | Re-selecting an existing canonical combination retains id, label, and color. |
| `allows ten comparisons and rejects the eleventh` | The boundary is enforced before the list mutates. |
| `permits an aggregate beside an overlapping subgroup` | Overlap is valid and carries explanatory metadata. |
| `derives San Francisco Latina Women in schema order` | Aggregate labels are omitted and the required dimensions remain. |
| `disambiguates two otherwise identical labels` | The shortest differing geography, time, source, or dimension is added. |

New file: `tests/js/lib/visualization/observationContract.test.js`.

| Test | What it verifies |
|---|---|
| `accepts a finite available observation` | A normal row satisfies the contract. |
| `requires null for missing and suppressed values` | Unavailable rows cannot carry a plotted number. |
| `keeps availability separate from observed projected and derived kinds` | Suppression does not masquerade as a projection type. |
| `requires issues to identify an invalid comparison when one exists` | Partial failure remains attributable. |

Extend `tests/js/lib/visualization/chartRegistry.catalog.test.js`.

| Test | What it verifies |
|---|---|
| `declares the complete hand-written capability matrix for every chart id` | Each registered chart has explicit time, comparison, calculation, geography, and appearance behavior. |
| `treats forest endpoints as measures rather than periods` | Forest does not inherit Range's two-period rule. |
| `requires tabs for choropleth map heatmap and symbol map comparisons` | Scale-driven charts do not overload color with comparison identity. |

---

## Workstream B - One calculation engine owns the meaning of every returned value

### Calculation registry

Create one pure calculation layer that accepts status-aware observations and measure metadata. Module routes call it on the server. Inline data calls the same functions locally because bring-your-own-data has no server dataset. The execution location differs, but the formula, validation, status propagation, and metadata do not.

| Calculation | Availability | Required periods or inputs | Output rule |
|---|---|---|---|
| Actual value | Standard | One or more available observations | Preserve value and source kind. |
| Sum | Schema-owned aggregation | Additive measure and nonoverlapping base rows | Sum only approved base rows. Any suppressed input makes the result suppressed; any missing input makes it missing unless the schema explicitly defines a complete-domain exception. |
| Weighted mean | Schema-owned aggregation | Value field, positive weight field, and declared grouping | Divide the sum of value times weight by the sum of weights. Propagate missing or suppressed status. Reject a zero total weight. |
| Average selected years | Time mode | At least two explicitly selected years | Arithmetic mean only when every selected year is available and unsuppressed. Return `derived` and list every included year. |
| Numeric change | Standard when the measure permits it | Exactly two ordered periods | End minus start. |
| Percent change | Standard for counts and stocks | Exactly two ordered periods and nonzero start | `(end - start) / start * 100`. A zero start is invalid, not infinity or zero. |
| Percentage-point change | Standard for rates and percentages | Exactly two ordered periods | End minus start in percentage points. |
| Index to 100 | Standard for time series | A declared base period with a nonzero value | Divide each value by the base value and multiply by 100. |
| Difference from benchmark | Advanced | A valid benchmark observation aligned to each output period and geography | Value minus benchmark. Missing and suppressed status propagates from either side. |
| Ranking | Standard where the chart and geography support it | Available calculated values plus Top or Bottom and N | Calculate first, then sort. Put unavailable values after available values and outside Top or Bottom N. Break ties by stable display label. |

Sum and weighted mean are not general-purpose editor choices. Each measure declares its aggregation rule and required weight. Show it as additional information. Render a selector only when the schema deliberately declares more than one valid rule for that measure.

### Aggregate protection

The Projections CSV includes precomputed aggregate rows such as All Ages, Both Sexes, and All. A request for an aggregate must select that row. A request for several base age groups may sum only those base rows. It must not add an aggregate row to any of its components.

Every comparison dimension declares whether its values are aggregate, component, or derived groups. The calculation engine rejects a sum that mixes overlapping aggregate and component rows inside one comparison. Separate comparisons may overlap because the user may intentionally compare a subgroup with a total.

### Missing, suppressed, and partial results

The query engine materializes every requested comparison-period-geography cell. An absent record becomes a row with `status: missing` and `value: null`. A source-suppressed value becomes `status: suppressed` and `value: null`. It never becomes zero, never contributes to another result, and never disappears from the comparison summary.

An invalid comparison produces an issue and no plotted value for that comparison. Other comparisons continue. A shared error, such as an unknown outcome or malformed time request, blocks the response. If all comparisons fail, the response is blocking even if the shared fields were valid.

### Implementation

1. Create `lib/data/visualization/calculationRegistry.js`. Define calculation descriptors, measure and unit eligibility, required inputs, status propagation, formulas, and result metadata. Keep the functions pure and independent of a chart id.
2. Create `lib/data/visualization/aggregateObservations.js`. Own additive aggregation, weighted means, aggregate-row protection, input completeness, and the rule that no missing or suppressed input becomes zero.
3. Create `lib/data/visualization/rankObservations.js`. Rank calculated available values with deterministic ties. Return unavailable rows outside the ranked subset for tables and exports when the request asks for full data, but do not plot them as zero.
4. Replace module-specific transform ownership in `lib/visualization/transformRegistry.js` and `components/chart-builder/chartData.js`. Keep display-only reshaping in the browser. Move numeric change, percent change, percentage-point change, indexing, benchmark difference, ranking, selected-year average, sum, and weighted mean to the shared calculation layer.
5. Audit `lib/data/*.js` for numeric `?? 0` fallbacks. Change only cases where null means unavailable input. Preserve a real zero. Start with `lib/data/demographic_projections.js`, `query_shapes.js`, `building_permits.js`, and `pop_housing.js`, then record every changed semantic in the removal changelog.
6. Extend module field metadata in `lib/visualization/moduleSchemas/*.js` with aggregation, weight, transform, and unit rules. A field with `aggregation: notAllowed` remains unaggregated unless a domain-specific group declares a safe sum.

### What this invalidates

This work replaces the calculation descriptions in [[visualization-specification]] under *Outcome*, *Comparison*, *Ranked values*, and *Settings Reference*. It also invalidates `transformRegistry.js` comments that describe client-side ownership and `chartData.js` comments that treat two-period requests as a renderer concern.

### Tests

New file: `tests/js/lib/data/visualization/calculationRegistry.test.js`.

| Test | What it verifies |
|---|---|
| `calculates numeric change from two available periods` | The backend result is end minus start and names both periods. |
| `rejects percent change from a zero base` | A mathematically invalid denominator yields a structured comparison issue. |
| `offers percentage-point change for a rate and not percent change` | Unit metadata controls valid choices. |
| `indexes every available period to a declared base of 100` | Indexing uses one shared base and retains null gaps. |
| `aligns a benchmark by period and geography` | Difference from benchmark never subtracts mismatched rows. |
| `averages only a complete selected-year set` | All selected values are required and included periods are returned. |
| `does not average when one selected year is missing` | The result is missing and states the cause. |
| `does not average when one selected year is suppressed` | The result is suppressed and does not reveal an inferred value. |

New file: `tests/js/lib/data/visualization/aggregateObservations.test.js`.

| Test | What it verifies |
|---|---|
| `sums nonoverlapping age components` | A declared age group is the sum of its component rows. |
| `does not add All Ages to age components` | Aggregate rows cannot be double-counted. |
| `keeps a real zero in an additive measure` | Zero is data and is not mistaken for missing. |
| `propagates a missing additive input` | Missing does not contribute zero. |
| `calculates a weighted mean from declared weights` | The correct denominator and numerator are used. |
| `rejects a weighted mean with zero total weight` | The calculation fails mathematically instead of returning a misleading number. |

New file: `tests/js/lib/data/visualization/rankObservations.test.js`.

| Test | What it verifies |
|---|---|
| `ranks calculated values before applying Top N` | Ranking is based on the displayed calculation, not raw input. |
| `places missing and suppressed values outside the ranked marks` | Unavailable data is not ranked as zero. |
| `breaks equal values by stable label` | Repeated runs return the same order. |

Rewrite `tests/js/lib/visualization/transformRegistry.test.js` as eligibility and inline-parity tests. Preserve its existing null, zero-base, immutability, rate-unit, and benchmark assertions, but point them at the shared calculation registry instead of requiring browser ownership.

---

## Workstream C - One coordinated request returns all comparisons

### Request and response boundary

Add a POST query handler to each module's existing API route. The request body carries one v3 question. It includes all comparisons, the one shared outcome, shared geography and time, optional Advanced overrides, and the calculation. Do not encode ten comparison objects in URL parameters.

Keep narrow GET endpoints such as location-option lookups if the editor still needs them. Stop using GET chart views such as `line`, `category`, `twoPeriod`, `matrix`, and `geo` for v3 chart data. A POST response returns the common observation contract regardless of the selected renderer.

The first server implementations are Projections and Components of Change because their fixtures cover demographic strata, aggregates, rates, counts, source differences, projections, and observed data. The other module adapters must use the same request and response contract before cutover.

### Module adapter boundary

Create one server-only adapter per module. An adapter resolves field names, source rules, geography, periods, and domain-specific aggregate metadata. It returns base observations to the shared calculation engine. It does not know whether the caller will draw Line, Bar, Donut, or Map.

For Projections, preserve the valid source-to-geography pairing and the stored aggregate-row behavior. For Components of Change, preserve its source validation and distinct measure units. For every module, return stable geography ids where the dataset has them. The choropleth adapter may join geometry ids after the common calculation, but it must not change values or statuses.

Inline data uses `lib/tabular/toSeries.js` only for importing and typing the table. A new inline adapter converts typed rows into the same base observations and calls the same comparison and calculation functions locally. It must not retain a second formula implementation.

### Partial failure

Validate the shared request once. Then validate each comparison independently. The response includes observations and issues for every comparison. The HTTP response can remain successful when at least one comparison is valid, because partial comparison failure is an expected product result. Use a failing HTTP status for malformed JSON, an invalid shared question, a server failure, or a result with no valid comparisons.

### Implementation

1. Create `lib/data/visualization/executeQuestion.js`. Validate the shared question, execute module comparisons, materialize requested cells, call calculations, combine results, and return structured issues.
2. Create `lib/data/visualization/moduleAdapters.js`. Register module id to adapter without importing server-only data into client bundles.
3. Add Projections and Components of Change adapters beside `lib/data/demographic_projections.js` and `components_of_change.js`, or in `lib/data/visualization/adapters/`. Reuse their CSV loaders and domain validation. Do not reuse their chart-shaped builders as the v3 output.
4. Add POST handlers to `app/api/projections/route.js` and `app/api/components-of-change/route.js`. Validate the v3 body and call `executeQuestion`. Keep GET location queries temporarily if required by `useLocationOptions`.
5. Add equivalent adapters and POST handlers for `pophousing`, `housing-stress`, `building-permits`, and `rhna-progress`. Reconcile each module's measure metadata before registering it.
6. Replace `components/chart-builder/chartData.js` with a v3 loader that sends the question once, validates the observation response, and exposes observations plus issues. Move the old QUERY_SHAPES path to `.trash/visualization-backend/` only when no current caller imports it.
7. Create `lib/tabular/toObservations.js` for inline data. Preserve import typing, field binding, data-size limits, and local operation. Route all supported calculations through Workstream B.
8. Update location and geometry helpers so the v3 request uses stable geography identity. Keep map geometry loading separate from value calculation.

### What this invalidates

This work invalidates chart-shaped API descriptions in [[projectSpec]] and each module's frontend section. It does not invalidate the cleaned CSV grain or the Python pipeline guides. Update only the frontend and API paragraphs after verification.

### Tests

New file: `tests/js/lib/data/visualization/executeQuestion.test.js`.

| Test | What it verifies |
|---|---|
| `executes ten independent comparisons in one request` | One coordinated execution returns every id without ten client fetches. |
| `keeps valid observations when one comparison is invalid` | Partial success carries the invalid comparison issue and valid rows. |
| `blocks when the shared outcome is unknown` | Shared errors do not produce partial results. |
| `blocks when no comparison remains valid` | An empty valid set is a chart-level failure. |
| `materializes a requested missing cell` | Absence becomes an explicit missing row. |
| `preserves a requested suppressed cell` | Suppression remains null with no inferred value. |

New file: `tests/js/lib/data/projections_v3_route.test.js`.

| Test | What it verifies |
|---|---|
| `accepts a v3 POST with irregular age sex and race comparisons` | The route applies each comparison independently. |
| `defaults a snapshot to the declared 2025 reporting year` | Projection max year does not become the default. |
| `rejects an invalid source and geography pair as a comparison issue` | Existing source rules survive the new contract. |
| `returns observed and projected value kinds separately from status` | Source meaning is not stored in the availability field. |

New file: `tests/js/lib/data/components_of_change_v3_route.test.js`.

| Test | What it verifies |
|---|---|
| `returns count and rate calculations allowed by their units` | The module schema gates the calculation registry. |
| `ranks the displayed calculation on the server` | Top or Bottom N uses the calculated result. |
| `returns the same observation fields as Projections` | Module adapters do not create module-specific response shapes. |

Extend `tests/js/components/chart-builder/chartData.test.js`.

| Test | What it verifies |
|---|---|
| `sends one POST body for all comparisons` | The client no longer loops through chart-shaped GET requests. |
| `does not include chart id in the data question` | Changing presentation does not redefine the request unless time capability requires a cleared selection. |
| `surfaces partial issues without discarding valid observations` | The preview can draw valid comparisons and explain invalid ones. |

---

## Workstream D - The editor exposes only valid question controls

### Section and control placement

Keep the Outcome section directly after Chart Type. Place **Calculation** directly below the outcome measure. The Calculation control shows only choices allowed by the outcome metadata and resolved chart capability.

| Control | Section and mode | Behavior |
|---|---|---|
| Outcome measure | Outcome, Standard | One shared outcome for all comparisons. |
| Calculation | Outcome, Standard | Actual, numeric change, valid percent or percentage-point change, and index to 100 when applicable. |
| Difference from benchmark | Outcome, Advanced | Reveals benchmark selection only when the chart and measure support it. |
| Aggregation rule | Outcome additional information | Read-only Sum or Weighted mean from measure metadata, unless the schema declares multiple valid choices. |
| Base or comparison periods | Time, conditional | The Time section supplies the periods required by the selected calculation. Do not duplicate year selectors in Outcome. |
| Average selected years | Time display mode | Appears when selected snapshots support an average. Sends the calculation to the backend and displays an average note. |
| Top or Bottom and N | Geography or Categories | Defines which calculated rows appear. The backend performs ranking. |
| Comparison builder | Comparisons, Standard | Regular checkbox generation and irregular comparison cards. |
| Per-comparison geography and time | Comparison card, Advanced | Overrides shared values without changing the shared outcome. |
| Comparison presentation | Comparisons or chart-specific presentation area | Offers tabs only where the chart capability allows them; maps and heatmaps are fixed to tabs. |

The interface must prevent an eleventh comparison. Disable the Add comparison action and any checkbox combination that would produce more than ten. State `This chart has the maximum of 10 comparisons.` Do not create eleven and then show a validation error.

### Time controls

Replace the universal slider with small shared controls selected by the resolved capability:

| Time contract | Control |
|---|---|
| One snapshot | Searchable single select, defaulting to the module reporting period when declared. |
| Selected snapshots | Searchable checkbox list with selected count and clear action. |
| Exactly two periods | Two labeled selectors or a two-ended control that cannot select the same endpoint twice when the calculation requires distinct periods. |
| Range | Two-ended slider or range selectors over available periods. |
| No period | No Time section. |

For Donut, selected snapshots reveal `Show each year in tabs` and `Show the average of selected years`. The average option is unavailable with fewer than two years. The resulting chart note uses plain language, for example `Average of 2020, 2025, and 2030.`

When a chart switch cannot represent the active time selection, clear the active time and show `Select time to show this chart.` Do not silently choose endpoints or a snapshot. Remember the inactive chart family's time only in separated chart-specific state so the user can recover it by switching back.

### Comparison controls

Create one source-of-truth list. The checkbox generator is an editor over that list, not stored state beside it. Comparison cards show their derived label, selections, optional custom label, and Advanced overrides. A card edit retains its id.

Use existing form primitives and minimal orange-accent styling. Reuse the behavior of `GraphTabs` for accessible single selection, but create a comparison-aware wrapper if the tab value needs a stable id and label. Do not store the active tab inside question filters.

### Advanced Mode inventory

Create the inventory before changing Advanced Mode. The initial audit found these current gates:

| Current advanced feature | Current owner | Disposition to decide during implementation |
|---|---|---|
| Ranked values | `GeographySection.js`, `CategoriesSection.js` | Keep advanced unless developer approves a visibility change. Execute on backend. |
| Series binding and catalog escape hatch | `OutcomeSection.js` | Keep only where a renderer or inline-data adapter consumes it. Do not use it as a demographic comparison substitute. |
| Per-series legend labels, colors, and visibility | `PalettePicker.js`, `AppearanceSection.js` | Re-key comparison controls by stable comparison id. Preserve genuine category controls separately. |
| Custom diverging stops and Hide X-Axis | `AppearanceSection.js` | Keep only where the capability declares a consumer. |
| Presets, saved views, config export, activity, and trace layers | `EditorSidebar.js`, standalone capabilities | Preserve as surface capabilities. Remove duplicate Add line entry only after developer approval. |
| Per-comparison geography and time | New Comparison cards | Add as approved Advanced Mode features. |
| Crowded but valid presentations | New resolved editor model | Show a low-key information message. Never expose mathematically invalid controls. |

This inventory is evidence, not an instruction to keep every item. Each setting needs a capability, consumer, test, documentation row, and developer approval. An item without those requirements is recorded for unwiring in Workstream H.

### Implementation

1. Create `components/chart-builder/sections/ComparisonsSection.js`, `components/chart-builder/ComparisonCard.js`, and `components/chart-builder/ComparisonGenerator.js`. Use `comparisons.js` for every mutation.
2. Create `components/chart-builder/sections/TimeSection.js` and shared `SearchablePeriodSelect.js` and `SearchableCheckboxList.js` primitives. Select the control from `resolveEditorModel`, not from chart-id checks inside the component.
3. Refactor `components/chart-builder/sections/OutcomeSection.js` and `TransformSection.js`. Keep the Outcome heading and position. Render the Calculation control immediately after the measure, and remove demographic scalar filters after the Comparison section is live.
4. Add the Comparison section to `lib/visualization/sidebarSections.js`. Make section visibility and order read the resolved model. Preserve Dataset, Chart Type, Outcome, Geography, Labels, Appearance, and Typography workflows unless the capability removes them.
5. Update `components/chart-builder/sections/ChartTypeSection.js` to hide mathematically invalid chart choices in Standard Mode. In Advanced Mode, show only mathematically valid additional choices and attach a low-key information explanation where necessary. Never dispatch a chart switch from a recommendation.
6. Update `components/chart-builder/ValidationNotice.js` and empty preview states. Distinguish shared blocking errors, comparison-specific errors, unavailable data, and crowded information. Use plain sentences and active voice.
7. Update `components/chart-builder/advancedMode.js` only as needed to support the new inventory. Advanced Mode remains interface state, not part of the saved chart question.

### What this invalidates

This work replaces `DateRangeSection.js`, scalar stratification controls in `TransformSection.js`, generic Add tabs controls in `OutcomeSection.js`, and exact section-order descriptions in [[visualization-specification]]. It may reuse their low-level controls, but the current ownership and storage are obsolete.

### Tests

New file: `tests/js/components/chart-builder/sections/ComparisonsSection.test.js`.

| Test | What it verifies |
|---|---|
| `generates the selected regular combinations` | Checkbox choices produce the expected cards. |
| `adds an irregular comparison without changing existing cards` | Individual comparison construction remains independent. |
| `edits a card without changing its identity` | Stable id, color, and custom label survive an edit. |
| `prevents an eleventh comparison before mutation` | Add controls disable and the limit message appears. |
| `shows geography and time overrides only in Advanced Mode` | Standard Mode retains shared values. |
| `never shows an outcome override` | Multiple outcomes remain deferred in both modes. |

New file: `tests/js/components/chart-builder/sections/TimeSection.test.js`.

| Test | What it verifies |
|---|---|
| `renders a range control from a range capability` | The component does not check the chart id itself. |
| `renders a searchable snapshot checklist for Donut` | Every available year remains selectable. |
| `defaults Projections to reporting year 2025` | Reporting metadata controls the initial snapshot. |
| `offers tabs and average after several Donut years are selected` | The two approved display modes appear. |
| `labels an average and lists all included years` | The user can tell the result is derived. |
| `clears incompatible time on a chart switch` | The empty-time instruction replaces silent conversion. |

Extend `tests/js/components/chart-builder/sections/OutcomeSection.test.js`.

| Test | What it verifies |
|---|---|
| `places Calculation directly after the outcome measure` | The approved Outcome placement is preserved. |
| `offers percent change for a count and percentage-point change for a rate` | Measure metadata drives the options. |
| `shows benchmark controls only for an eligible Advanced question` | Advanced Mode exposes useful complexity only. |
| `shows a measure-owned aggregation as additional information` | Users cannot choose an invalid sum or weighted mean. |

Extend `tests/js/components/chart-builder/advancedMode.test.js`.

| Test | What it verifies |
|---|---|
| `shows every inventoried advanced setting only with its capability` | Advanced Mode alone cannot create an unsupported control. |
| `allows a crowded valid choice and blocks an invalid choice` | The mathematical boundary is the same in both modes. |
| `does not serialize Advanced Mode` | Mode remains local interface state. |

---

## Workstream E - Every renderer presents the common observations without redefining them

### Adapter boundary

Create one adapter per chart family that accepts validated observations, resolved presentation, and geometry when needed. An adapter may group, order, or pivot rows into Plotly traces. It may not calculate change, averages, indexes, ranks, or missing values.

Build and verify the proving set first behind the unwired boundary:

1. Line proves time series, several comparisons, full legend labels, and stable colors.
2. Bar proves snapshots, grouping, ranking, and comparison labels.
3. Choropleth Map proves stable geography ids, scale colors, and required comparison tabs.
4. Data Table proves raw values, statuses, comparison identity, and no chart-only loss.
5. Donut proves selected-year tabs, averages, included-year notes, and one categorical breakdown.

Then adapt Range, Heatmap, Dot Plot, Forest, Scatter, Bubble, and Symbol Map. No proving adapter enters the public runtime before the full set is complete.

### Tabs and combined presentations

Use tabs as presentation state. Map, Heatmap, and Symbol Map expose one active comparison at a time. If several years are also tabbed, use one tab axis at a time and a clearly labeled secondary selector rather than create nested indistinguishable tab rows. The resolved capability decides which axis is primary.

Line defaults to a combined chart with one trace per comparison. Each trace name is the full resolved label, such as `San Francisco Latina Women`. Line may switch to one comparison per tab without changing the question or comparison colors. A legend is required for a combined line with more than one comparison.

### Official PPIC colors

Make one client-safe source export the guide-verbatim tokens used by both `/ui-kit` and the renderer. Do not import from `components/` into `lib/`. The default categorical assignment is:

| Count | Official order |
|---|---|
| 1 | Orange |
| 2 | Orange, Navy |
| 3 | Orange, Navy, Gray |
| 4 | Orange, Navy, Lime, Blue |
| 5 | Orange, Navy, Lime, Blue, Dark Gray |
| 6 | Orange, Navy, Lime, Blue, Violet, Dark Gray |
| 7 | Orange, Navy, Lime, Blue, Violet, Seafoam, Dark Gray |
| 8 | Orange, Navy, Lime, Blue, Violet, Seafoam, Dark Gray, Gray |
| 9 | Orange, Navy, Lime, Blue, Violet, Seafoam, Gray, Red, Dark Gray |
| 10 | Orange, Navy, Lime, Blue, Violet, Seafoam, Gray, Red, Green, Dark Gray |

Apply the exact scheme when the comparison count changes. Assign tokens by comparison creation order, not the current sort order. That cardinality change is the one event that may recalculate default colors because the official four-group sequence is not the three-group sequence plus one color. Chart switches, comparison reordering, tab switches, rendering, and current-version save and restore must not recalculate the assignment. A user override remains attached to the comparison id and must use an allowed PPIC token.

Sequential and diverging charts use the official ramps already represented by `ppicRamps.js`. Follow the UI Kit chart anatomy for legend position, line weight, graph lines, and grid lines where the Plotly renderer exposes those properties. Do not change unrelated app-shell styling.

### Tables and exports

Chart, Data view, CSV, and XLSX use the same comparison labels and observation rows. Tables show `Not available` for missing and `Suppressed` for suppressed. CSV and XLSX leave the numeric cell empty and include a status column. Average exports include the calculation id and included periods. Do not export only the active tab unless the export action explicitly says `Export visible tab`; the normal data export includes all comparisons and selected years.

### Implementation

1. Create `lib/visualization/adapters/` with one adapter per base chart id or coherent family. Extract reusable observation grouping and label helpers without creating a generic adapter full of chart-id conditions.
2. Refactor `lib/visualization/toPlotly.js` into a dispatch boundary that calls these adapters. Preserve Plotly configuration, accessibility hooks, and image export. Remove calculations from adapters.
3. Create `components/charts/ComparisonTabs.js` around `GraphTabs.js`, keyed by stable comparison or period ids. Update `PreviewPane.js` and `PreviewContext.js` so active tabs are presentation state and loaded observations remain complete.
4. Refactor `lib/visualization/palettes.js`, `ppicRamps.js`, and `components/ui-kit/ppicSpec.js` to share the verbatim official tokens. Retire adjusted palettes that are labeled official; preserve a renamed custom palette only if the developer approves it as a distinct nonofficial option.
5. Update `components/charts/DataTableView.js`, `lib/export/exportTable.js`, and `components/chart-builder/ExportMenu.js` to consume observation status, labels, included periods, and all-tab data.
6. Update labels and notes in `deriveLabels.js` and renderer layouts so averages, projection kinds, and comparison identities remain visible in charts and exports.

### What this invalidates

This work invalidates chart-specific response assumptions throughout `toPlotly.js`, `chartData.js`, `exportTable.js`, and the Settings Reference. It does not require a visual redesign outside the official PPIC corrections and the approved comparison presentations.

### Tests

New file: `tests/js/lib/visualization/adapters/comparisonPresentation.test.js`.

| Test | What it verifies |
|---|---|
| `builds one named Line trace per comparison` | Combined Line uses full labels and stable ids. |
| `builds one active map from all loaded comparison observations` | Tabs filter presentation without a new question request. |
| `builds one active Heatmap comparison` | Value color remains available for the measure. |
| `builds a Donut average from a backend-derived row` | The adapter does not average raw rows. |
| `keeps a Forest interval tied to measure endpoints` | It does not treat bounds as years. |

Extend `tests/js/lib/visualization/toPlotly.palette.test.js` and `palettes.test.js`.

| Test | What it verifies |
|---|---|
| `matches every official one-to-ten comparison scheme exactly` | Expected colors are hand-written from the UI Kit source. |
| `keeps comparison colors through reorder and chart switch` | Stable ids, not trace order, control colors. |
| `reconciles defaults only when comparison count changes` | Four comparisons receive the official four-group scheme. |
| `uses official sequential and diverging ramps for scale charts` | Map and Heatmap do not consume categorical comparison colors as value ramps. |

Extend `tests/js/lib/export/exportTable.test.js` and `tests/js/components/charts/DataTableView.test.js`.

| Test | What it verifies |
|---|---|
| `shows Not available and Suppressed without numeric values` | Table and export agree on status language. |
| `exports every comparison when one tab is active` | Normal export is not limited to visible presentation state. |
| `exports average metadata and included years` | A derived value remains explainable outside the chart. |
| `uses custom and derived comparison labels consistently` | Chart, table, and export name the same population. |

---

## Workstream F - The test suite protects requirements instead of obsolete mechanics

### Fixture design

Add small, hand-readable JSON or JavaScript fixtures. Do not use extracts large enough to hide expected results.

| Fixture | Required cases |
|---|---|
| Age, Sex & Race Projections | Aggregate rows and base rows; Black, White, and Latino groups; Female, Male, and Both Sexes; at least two age groups plus All Ages; San Francisco and one other geography; observed 2020-2025 and projected 2025-2030 periods; a real zero; a missing value; a suppressed value; reporting year 2025. |
| Components of Change | Population stock, count, and rate measures; two sources; at least three geographies; two periods for change; ties for ranking; a zero base; a missing value; and a suppressed value. |

Store the shared fixtures under `tests/fixtures/visualization-v3/`. API route tests and renderer tests must derive their inputs from the same fixture contracts so they cannot disagree about what missing, suppressed, projected, or aggregate means.

### Current-test classification

The following classification answers the open repository question. It is a migration guide, not permission to delete a test without replacement.

| Classification | Current files | Required action |
|---|---|---|
| Preserve or adapt: public chart and field contracts | `chartRegistry.catalog.test.js`, `chartAvailability.test.js`, `validation.test.js`, `palettes.test.js`, `toPlotly*.test.js` | Keep the user-visible assertions. Rewrite inputs for v3 and add the hand-written capability matrix. |
| Preserve or adapt: data and API behavior | `query_shapes.test.js`, module data tests, `apiParams.test.js`, `chartData*.test.js` | Keep filtering, geometry, unit, and source rules. Replace chart-shaped URL assertions with one POST contract. |
| Preserve or adapt: table, export, and chart results | `exportTable.test.js`, `ExportMenu*.test.js`, `DataTableView.test.js`, `PlotlyChart.test.js`, `GraphTabs.test.js` | Keep outputs, accessibility, file behavior, and interaction semantics. Add status and all-tab cases. |
| Preserve or adapt: current-version persistence | `savedViews.test.js`, `chartSpec.test.js`, `ViewHydrator.shared.test.js` | Keep v3 round trips, malformed input, size caps, module mismatch, and current links. Remove the requirement that v1 or v2 opens. |
| Rewrite: exact current control mechanics | `DateRangeSection.test.js`, `OutcomeSection.test.js`, `AppearanceSection.test.js`, `EditorSidebar.test.js`, `EditStep.overhaul.test.js`, `ChartTypeSection.test.js` | Test resolved capabilities, accessible labels, and outcomes instead of exact slider structure or accordion order that the plan intentionally changes. |
| Rewrite: reducer and tab storage internals | `chartConfigStore.test.js`, `PreviewPane.test.js`, `toSeries.test.js` cases that name `filters.tab*` | Test comparison identity, presentation-only tabs, undo and redo, and chart-switch behavior without requiring action names or v2 keys. |
| Review before removal: architecture tombstones | `tests/js/architecture/*.removals.test.js`, module composition tests | Keep only tests for developer-approved retirements or load-bearing dependency boundaries. A file's absence is not a product requirement by itself. |

### Visual regression infrastructure

Add `@playwright/test` because the current jsdom suite cannot compare browser-rendered Plotly output. Add a `test:visual` script, a checked-in Playwright configuration, deterministic fixture page, and approved baseline images for Line, Bar, Range, and Heatmap.

Fix viewport, browser, device scale, fonts, fixture data, timezone, and locale. Disable Plotly animation and wait for the plot to report completion. Mask dynamic ids or timestamps. A baseline update is a review action, not an automatic consequence of a failing test.

### Full flows

Add browser flows for:

1. Generate several demographic comparisons, edit one irregular card, and draw a combined Line with complete legend labels.
2. Switch Line to tabs and confirm the question and colors do not change.
3. Draw a Bar ranked by calculated change.
4. Switch a multi-comparison map tab and retain all data in export.
5. Select several Donut years, compare tabs, switch to average, and read the average note.
6. Show a valid comparison beside a missing, suppressed, and invalid comparison across chart, table, and export.
7. Save and restore a v3 view, then reject a v2 fixture with a clear message.
8. Switch to an incompatible time chart and receive the empty-time instruction.

### Implementation

1. Add the two fixture families under `tests/fixtures/visualization-v3/` and document their grains in a local README.
2. Write the contract and component tests named in Workstreams A through E before their implementation changes.
3. Reconcile each current test using the table above. Record removed or replaced test intent in the removal changelog beside the code path it protected.
4. Add Playwright configuration, fixture route, scripts, and baseline storage. Keep visual tests separate from `npm test` if browser installation would make the unit suite unreliable; run both in acceptance.
5. Add the eight full flows after the proving set works and before remaining chart adapters cut over.
6. Run targeted tests after each workstream, then the full Vitest suite, visual suite, palette check, and production build before Workstream H.

### What this invalidates

This work replaces the current Testing section of [[visualization-specification]] and the test-boundary callout in [[visualization-backend-refractor]] once the final filenames and commands are verified.

### Tests

New file: `tests/visual/visualization-v3.spec.js`.

| Test | What it verifies |
|---|---|
| `matches the approved Line comparison layout` | Legend labels, colors, axes, and line placement remain stable. |
| `matches the approved Bar comparison layout` | Grouping, labels, and spacing remain stable. |
| `matches the approved Range layout` | Endpoints, connector, labels, and axes remain stable. |
| `matches the approved Heatmap tab layout` | Active comparison, scale legend, grid, and labels remain stable. |

New file: `tests/js/fixtures/visualizationV3.contract.test.js`.

| Test | What it verifies |
|---|---|
| `keeps fixture keys unique at their declared grain` | Test data cannot accidentally double-count. |
| `contains every required availability and value kind` | Missing, suppressed, observed, projected, and derived scenarios stay available. |
| `contains known hand-calculated expected results` | Tests do not calculate expectations with the implementation under test. |

---

## Workstream G - Every setting has an owner, a consumer, and readable documentation

### Settings inventory

Create `lib/visualization/settingsRegistry.js`. Each setting row contains a stable id, label, section, Standard or Advanced visibility, question or presentation classification, supported charts and datasets, valid values or limits, configuration path, consumer, chart-switch policy, and documentation id.

Keep human explanations in `lib/visualization/settingsCopy.js` or a documentation-side companion keyed by the same id. The registry supplies facts; a person writes purpose, implications, examples, and help. A test fails if a visible setting has no registry row, a stored setting has no consumer, a registry row has no copy, or a copy row has no setting.

The initial inventory must include every Advanced Mode item in Workstream D before any is renamed or removed. The inventory also lists declared-but-unwired settings separately. That list is not a to-do list. The developer decides whether each item receives an implementation or a removal-changelog entry.

### Settings Reference generation

Create a generator under `tools/generate-settings-reference.mjs`. Generate the factual tables into marked boundaries inside `docs/PPIC Summer 2026/specifications/visualization-specification.md`. Keep explanations outside the generated block or merge them by stable id without rewriting their prose.

Add a global **Show additional information** toggle to the rendered Settings Reference. It is on by default. Turning it off hides purpose, notes, implications, examples, and source or help text. It always leaves setting name, section, applicability, valid values or limits, and configuration key visible.

If the current Markdown renderer cannot host the toggle in a generated table, add one narrowly scoped document component and syntax extension in `components/documents/MarkdownArticle.js`. Do not turn the whole documentation system into an application-specific renderer.

### Approval and STE gate

Every new or changed setting enters the registry with `approval: pending`. The developer reviews its meaning, placement, default, capability, tests, and documentation. Change it to approved only after that review. The production build must reject a pending setting that is visible in the editor.

Before implementation review, apply Simplified Technical English to user-facing strings. Use one term for one concept, active voice, short direct sentences, explicit conditions, and concrete correction steps. Keep product terms such as Outcome, Comparison, Reporting year, Average, Missing, and Suppressed consistent. Do not replace domain terms that PPIC users need; define them in additional information.

### Implementation

1. Create `lib/visualization/settingsRegistry.js` and `settingsCopy.js`. Populate them from the new v3 controls and the existing Advanced Mode audit.
2. Add a development and test assertion that resolves editor controls and proves each visible control has an approved registry row and consumer.
3. Create `tools/generate-settings-reference.mjs` and `npm` scripts to generate and check the factual reference without editing human prose.
4. Add the Settings Reference additional-information toggle in the narrowest document-rendering boundary that can support it.
5. Reconcile [[visualization-specification]], [[projectSpec]], module frontend sections, and [[visualization-backend-refractor]] after code and tests are green. Describe observable v3 behavior, not temporary component structure.
6. Perform the STE pass and present the changed strings as a review list before the developer's implementation approval.

### What this invalidates

This work replaces the hand-maintained Settings Reference tables and the current Advanced Mode inventory in [[visualization-specification]]. Keep historical reasoning that still explains an approved behavior, but remove claims that v2 keys or inert roles are current.

### Tests

New file: `tests/js/lib/visualization/settingsRegistry.test.js`.

| Test | What it verifies |
|---|---|
| `inventories every resolved visible setting` | No control exists outside the product contract. |
| `gives every stored setting a named consumer` | Inert configuration cannot ship unnoticed. |
| `gives every setting one human explanation` | Generated facts do not replace readable help. |
| `rejects an unapproved visible setting` | Developer approval is a buildable gate. |
| `lists declared but unwired settings without treating them as supported` | The audit remains honest. |

New file: `tests/js/tools/generateSettingsReference.test.js`.

| Test | What it verifies |
|---|---|
| `generates stable factual rows from the registry` | Repeated generation does not churn prose or order. |
| `fails check mode when the committed factual block is stale` | Documentation drift is visible in CI. |
| `preserves human-written copy outside generated markers` | Regeneration cannot erase explanations. |

Extend `tests/js/components/documents/MarkdownArticle.test.js`.

| Test | What it verifies |
|---|---|
| `shows additional information by default` | The full reference remains the default. |
| `hides all additional information with one toggle` | A reader can reduce the reference globally. |
| `keeps names applicability limits and config keys visible` | Hiding help does not hide the factual contract. |

---

## Workstream H - All chart families cut over together and legacy removal stays reversible

### Cutover shape

Build the v3 path under its own imports and keep it unwired while work proceeds. The public shells switch only after all registered chart types, all module adapters, inline data, save and restore, exports, documentation checks, unit tests, full flows, visual tests, and the production build pass.

Use one v3 saved-view namespace, such as `ppic.savedViews.v3`. Do not delete or overwrite `ppic.savedViews.v1`. The v3 reader rejects v1 and v2 imports and shared links with `This view uses an older format and cannot open in this version.` Do not offer a migration that guesses at Group, Series, scalar demographic filters, or old tab state.

### Removal changelog

Create `docs/PPIC Summer 2026/refractor-guide/visualization-backend-removal-changelog.md` when implementation starts. Each entry contains:

| Field | Meaning |
|---|---|
| Legacy path or symbol | Exact file, export, key, route view, or test being retired. |
| Last consumer | The import or behavior that made it live before the refactor. |
| Replacement | Exact v3 path and behavior. |
| State | `identified`, `unwired`, `trashed`, `approved`, `denied`, or `deleted`. |
| Evidence | Tests, build, manual workflow, and documentation that cover the replacement. |
| Recovery | Original path in `.trash/visualization-backend/` or the commit that can restore it. |
| Developer decision | Date and explicit approve or deny note. |

When practical, move a fully replaced file to `.trash/visualization-backend/` and preserve its relative path. If a file mixes live and retired code, unwire the retired exports and copy the retired fragment into a descriptive tombstone document. Update `.trash/README.md` with the new subfolder and its review rule.

Do not use the application changelog in `data/changelog-overlay.json` as this ledger. That file is commit-based and records shipped changes. The removal changelog is change-by-change review evidence before deletion. Add the normal application changelog entry only after the implementation is committed and audited.

### Candidate legacy items for the first ledger

This table starts the audit. It does not preapprove deletion.

| Candidate | Expected replacement |
|---|---|
| v1-to-v2 migration and retired-key handling in `chartSpec.js` | v3-only `questionSpec.js` reader and explicit unsupported-version result. |
| `QUERY_SHAPES`, `changeRecords`, and chart-shaped request orchestration in `chartData.js` | One v3 POST loader plus render adapters. |
| Scalar `filterDimensions` values stored as one demographic filter | `question.comparisons[]`. Schema dimension metadata remains. |
| `filters.tabColumn`, `tabValue`, and `tabOrder` as question filters | Explicit presentation tabs keyed by comparison or period id. |
| `DateRangeSection.js` chart-id switch | Capability-driven `TimeSection.js`. |
| Client calculation bodies in `transformRegistry.js` | Shared calculation registry, with local reuse for inline data. |
| Old saved-view storage reader | New v3 namespace; old browser data remains untouched. |
| Tests that require obsolete files or v1 migration | Named v3 behavior tests from this plan. |

### Implementation

1. Finish the proving paths for Line, Bar, Choropleth Map, Data Table, and Donut without wiring them into the public editor.
2. Finish Range, Heatmap, Dot Plot, Forest, Scatter, Bubble, and Symbol Map against the same contracts.
3. Finish module adapters for all registered module schemas and inline data.
4. Create the removal changelog and `.trash/visualization-backend/README.md`. Record each candidate before it is unwired or moved.
5. Switch `ModuleWorkbench`, the standalone Visualization Tool, `PreviewContext`, export actions, saved views, and shared links to v3 in one integration change.
6. Run the acceptance suite below. Correct the new implementation without reviving a second live v2 path.
7. Present the removal changelog to the developer. Apply each approve or deny decision separately. A denied deletion stays in `.trash` or returns as an explicitly documented supported path; it does not remain as an accidental parallel route.
8. Update frontmatter and status in the affected documents after the implementation and developer review. Add the commit-based application changelog entry after a commit exists.

### What this invalidates

After cutover, all documentation that calls chart spec v2 current, promises legacy shared-link conversion, or describes chart-shaped GET views as the chart-data contract is historical. Mark superseded planning documents Archive where appropriate. Do not archive module pipeline guides whose cleaned-data contracts remain accurate.

### Tests

Extend `tests/js/components/chart-builder/savedViews.test.js`.

| Test | What it verifies |
|---|---|
| `uses the v3 storage namespace without mutating old saved data` | Cutover is non-destructive to browser storage. |
| `round-trips one chart and a multi-chart v3 workspace` | Current persistence remains supported. |
| `rejects v1 and v2 with the approved plain-language message` | No ambiguous conversion occurs. |
| `preserves comparison ids labels colors and presentation state` | Save and restore do not break identity. |

New file: `tests/js/architecture/visualizationV3Cutover.test.js`.

| Test | What it verifies |
|---|---|
| `routes every registered chart through the v3 observation adapter` | No chart family remains on the old request path. |
| `routes every registered module through a v3 question adapter` | No module requires a chart-shaped response. |
| `keeps quarantined code outside app component and lib import graphs` | `.trash` is recoverable but not executable. |
| `allows only developer-approved filesystem removals` | Absence assertions correspond to approved changelog entries. |

---

## Acceptance Sequence

Run these gates in order. A later gate does not excuse a failure in an earlier one.

1. **Contract tests:** All Workstream A observation, comparison, capability, and v3 serialization tests pass.
2. **Calculation tests:** All status propagation, aggregate protection, formulas, averages, and ranking tests pass with hand-calculated expectations.
3. **Proving set:** Line, Bar, Choropleth Map, Data Table, and Donut complete settings, request, response, rendering, table, export, and current-version save and restore flows.
4. **All chart families:** Range, Heatmap, Dot Plot, Forest, Scatter, Bubble, and Symbol Map use the same contracts and have no live fallback to chart-shaped requests.
5. **Fixture flows:** Projections and Components of Change cover regular, irregular, overlapping, missing, suppressed, observed, projected, average, change, index, and ranking cases.
6. **Visual regression:** Approved Line, Bar, Range, and Heatmap baselines pass in the fixed browser environment.
7. **Repository checks:** `npm test`, `npm run test:visual`, `npm run check:palette`, and `npm run build` pass.
8. **Manual editor review:** The developer completes the proving workflows in Standard and Advanced modes, checks tabs and chart switches, and confirms that no recommendation changes a chart automatically.
9. **STE review:** The assistant presents all new or changed user-facing strings and documentation after an STE pass. The developer accepts or edits them.
10. **Documentation check:** Generated settings facts are current, all visible settings are approved and have consumers, and the additional-information toggle preserves the factual rows.
11. **Cutover:** Both editor surfaces use v3 together. A v2 fixture receives the clear unsupported-version message. Old localStorage remains untouched.
12. **Removal review:** The developer approves or denies every permanent deletion one changelog entry at a time. Nothing leaves `.trash/visualization-backend/` without an approval record.

> [!success] Definition of done
> The refactor is complete when one v3 question can express up to ten regular or irregular comparisons; one coordinated execution returns common status-aware observations; every chart family presents those observations through declared capabilities; chart, table, and export agree; the official PPIC styles are applied; all editor surfaces cut over together; the settings and documentation checks pass; and every permanent legacy deletion has an explicit developer approval.

---

## Open Questions

There are no product questions blocking implementation. The implementation may discover a dataset field without enough metadata to decide its aggregation, weight, reporting period, or comparison dimension. Treat that as a module-schema gap: leave the affected control unavailable, record the gap, and ask the developer before inventing a rule.

# Dev Notes on http://localhost:3000/visualization-v3-review
