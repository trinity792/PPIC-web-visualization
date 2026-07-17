---
Topic: tbd
Content Type: implementation plan
pinned: false
description: "Section outline for the Zillow housing-market module implementation guide, structured on the project's refactoring-plan template and driven by the intended visualizations, with the real V3 file locations each phase touches."
Date Published: July 17, 2026
Last Updated: 07/17/2026 - 12:00 PM
---

# Zillow Market Module: Implementation Guide Outline

An outline for the full implementation guide of the proposed Zillow housing-market module. It follows the project's refactoring-plan arc (adapted for a new module rather than a legacy migration) and is sequenced so the ETL contract satisfies the visualizations specified in the visualization and dashboard plan. Each section names the real files it will add or touch, patterned on the existing [[pophousing]] module. This is a section skeleton with per-section intent, not the guide itself.

> [!info] How to read this outline
> Every H2 is a section the finished guide will contain; the prose under each says what that section must decide or produce and which real files it involves. Data definitions are in the Zillow data fact-sheet; the charts this pipeline must feed are in the visualization and dashboard plan. Where a new name is proposed (module id, file names), it is marked as a proposal to confirm, because no Zillow module exists in the repo yet.

> [!warning] New names are proposals, not existing paths
> The repo currently has no Zillow module. Directory and file names below are proposed by analogy to the observed modules ([[pophousing]], components of change, building permits, RHNA progress, housing stress, demographic projections). The module id, the Python package name, the API route slug, and the schema file name are decisions the guide's "Resolved Decisions" section must fix before code is written. This outline uses the working id `housingMarket` and Python package `housingmarket` purely as placeholders.

---

## Naming and Placement Conventions (Observed)

Before the phases, the guide fixes names against the patterns already in the codebase, so the new module matches its siblings.

| Layer | Observed pattern (existing modules) | Proposed Zillow instance (confirm) |
|---|---|---|
| Python ETL package | `scripts/pophousing/` with `config/`, `acquisition/`, `cleaning/`, `aggregation/`, `calculations/`, `merging/`, `historical/`, `archives/`, `validation/`, `output/` | `scripts/housingmarket/` (subset of those packages) |
| Python unit tests | `scripts/unit_tests/pophousing/` mirroring the package tree | `scripts/unit_tests/housingmarket/` |
| Server data layer | `lib/data/pop_housing.js`, `components_of_change.js`, `building_permits.js`, shared `lib/data/query_shapes.js` and `lib/data/apiParams.js` | `lib/data/housing_market.js` |
| Client schema | `lib/visualization/moduleSchemas/pophousing.js` (camelCase file, `*_SCHEMA` export) | `lib/visualization/moduleSchemas/housingMarket.js` |
| Schema registry | `lib/visualization/moduleRegistry.js` (`MODULE_SCHEMAS`) | Add one import + registry entry |
| API route | `app/api/pophousing/route.js` + `app/api/pophousing/update/route.js` (note: sibling routes use kebab dirs like `app/api/housing-stress/`) | `app/api/housing-market/route.js` + `.../update/route.js` (slug to confirm) |
| Field-type + format helpers | `lib/visualization/fieldTypes.js`, `formatters.js` | Reused, not duplicated |

> [!note] Two naming conventions coexist for API routes
> `app/api/pophousing/` has no dash while `app/api/housing-stress/`, `app/api/rhna-progress/`, and `app/api/components-of-change/` are kebab-case. The guide must pick one for the new route and state it, rather than inheriting the older no-dash form by default.

---

## Legacy / Source Summary

Unlike the DoF modules, this module has no legacy PPIC tool to migrate; the "source" is the Zillow Research public catalog. This section replaces the refactoring template's "Legacy Module Summary" with a source summary: which files (metric x geography x cut) are fetched, their wide-CSV shape, their update cadence, and the fact that many single-metric files must be combined into one module dataset. It cross-references the fact-sheet rather than repeating it.

---

## Unique Challenges

The section that flags what makes this module unlike the annual DoF pipelines, each of which shapes a later phase.

The first is **monthly, ragged-start time series**: the grain is month, not year, and different families begin in different years, so the temporal axis and the cleaned schema must carry months and tolerate uneven coverage. The second is **wide-to-long reshaping and multi-file joins**: each Zillow file is one metric in wide form and must be melted and joined on `RegionID` into a long, multi-measure frame. The third is **uneven geographic coverage**: ZHVI and ZORI reach county and ZIP, but listings, sales, days-on-market, and market heat are metro-and-U.S. only, so the schema must record per-measure geography support. The fourth is the **Zillow-to-PPIC geography crosswalk**: Zillow's `RegionName`/FIPS must map to the project's `Location`/`Geographic Level`, and Zillow has no PPIC `Region`. The fifth is **non-additivity and nowcast latency**: no aggregation from finer geographies, and the newest nowcast month is provisional.

---

## Target Architecture

A diagram-and-prose section showing the data flowing from Zillow CSVs through the Python ETL to a cleaned canonical CSV, served by an API route, described by a client schema, and drawn by the existing chart pipeline. It states explicitly what is reused unchanged (`lib/data/query_shapes.js`, `lib/data/apiParams.js`, `lib/visualization/toPlotly.js`, `chartRegistry.js`, `transformRegistry.js`, `presetRegistry.js`, `fieldTypes.js`, `formatters.js`) and what is new (the Python package, the data-layer module, the schema, the routes, and any module-specific chart component under `components/charts/`).

---

## Data Contract

The section that pins the cleaned dataset the frontend can rely on, the analog of the DoF `PopHousing_Current.csv` contract.

### Grain

One row per place per month per... resolved shape: the guide chooses between a long frame keyed on `Geographic Level`, `Location`, `Date` with one column per measure, versus fully long with a `Measure` column. The measures-as-columns shape aligns with the existing `POPHOUSING_CANONICAL_COLUMNS` precedent and is the leaning default.

### Columns

Identifier columns (`Geographic Level`, `Location`, `Date`, plus provenance such as `RegionID`, FIPS, and the cut/smoothing used) followed by the selected measure columns. This section produces the canonical column order that both the Python `output` schema and the client `canonicalColumns` must match exactly, the guardrail the [[pophousing]] schema calls out.

---

## Pipeline Phases and Function Definitions

The core of the guide: each phase gets its target files, function signatures, and the validation gate it must pass. Phases map onto the observed `scripts/pophousing/` package layout, minus the historical-baseline packages the DoF module needs and this one does not.

### Phase 1: Configuration

`scripts/housingmarket/config/` with `sources.py` (Zillow file catalog: the metric x geography x cut matrix and their filename cut-tokens, patterned on `get_source_settings()`), `schemas.py` (canonical output columns, measure list, per-measure geography support, and validation rules, patterned on `get_schema_config()`), `paths.py`, and `geography.py` (the Zillow-to-PPIC crosswalk). Client-side, the measure catalog is mirrored in the schema file, single-sourced the way [[pophousing]] mirrors its field catalog.

### Phase 2: Data Acquisition

`scripts/housingmarket/acquisition/` downloaders that fetch each selected file, keyed on filename cut-tokens (not hardcoded URLs), with cache-age and header validation before use. One acquisition unit per family (values, rents, listings, sales) is the proposed decomposition.

### Phase 3: Cleaning and Reshaping

`scripts/housingmarket/cleaning/` performing the wide-to-long melt, the California filter (`StateName`/`State` equals `CA`; metros by reviewed allow-list; `California` for the state file; national retained as benchmark), the geography crosswalk to canonical `Location`/`Geographic Level`, and type coercion of the month columns. This is the phase with no DoF analog and the guide's largest.

### Phase 4: Merging

`scripts/housingmarket/merging/` joining the per-metric long frames on `RegionID` + `Date` into one multi-measure frame. Distinct from the DoF module's historical-modern merge; here it is a metric-union join, not a time-era splice.

### Phase 5: Calculations

`scripts/housingmarket/calculations/` for any server-side derived measures the schema exposes as first-class (candidate: price-to-rent). Growth and index transforms that are chart-time stay client-side in `transformRegistry.js`; this phase covers only measures materialized into the CSV.

### Phase 6: Validation

`scripts/housingmarket/validation/` gating the cleaned frame: expected identifier columns, plausible latest month, per-measure geography coverage, non-negative counts, ratio bounds, and a named notice (never a silent drop) on empty geography joins, patterned on the `cleaning_validators`/`final_dataset_validator` split.

### Phase 7: Output

`scripts/housingmarket/output/` writing the canonical cleaned CSV in the contracted column order, with the refresh-safety guard that a bad fetch cannot overwrite good data.

---

## Frontend Deliverables

The section that turns the cleaned CSV into charts, driven directly by the visualization and dashboard plan.

### Server data layer

`lib/data/housing_market.js` exposing `query*` functions for the shapes the charts need (`line`, `category`, `twoPeriod`, `pairs`, `matrix`, `geo`, `table`), built on the shared `lib/data/query_shapes.js` and validated through `lib/data/apiParams.js`, exactly as `lib/data/pop_housing.js` does. The section lists each query function against the chart(s) it serves.

### API routes

`app/api/housing-market/route.js` as the thin orchestrator dispatching on `view` (patterned on the pophousing route's `VIEWS` switch and parameter validation) plus `app/api/housing-market/update/route.js` for the refresh trigger, since the module is refreshable.

### Client schema

`lib/visualization/moduleSchemas/housingMarket.js` exporting `HOUSING_MARKET_SCHEMA` with `id`, `label`, `apiPath`, the `fields` catalog (each measure built via a `measure()` helper carrying `unit`, `comparisonGroup`, `transforms`, and `chartRoles`, gating growth/index transforms per measure and encoding roles per measure), `canonicalColumns`, `numericColumns`, `curatedMeasures`, `subsets` (the geographic levels), `refreshable: true`, and a monthly temporal range. Registered in `lib/visualization/moduleRegistry.js`.

### Temporal control and presets

The monthly `TemporalRangeSection` (from the graph-editor overhaul) is required rather than the year-only slider. Presets are added to `lib/visualization/presetRegistry.js` for the four default dashboard views named in the visualization plan.

### Chart components

Any module-specific composition lives under `components/charts/` following the existing `PopHousing*Section` pattern, but the plan reuses base chart types and variants from `chartRegistry.js` and adds no new primitives.

---

## Test Plan

A `scripts/unit_tests/housingmarket/` tree mirroring the package layout, patterned on the ~350-test [[pophousing]] suite, plus JS tests under `tests/js/lib/data/` for the new data-layer and route. The section lists, per phase, the fixtures and the specific behaviors to assert (melt correctness, CA filtering, crosswalk mapping, coverage gating, provisional-month handling, non-additivity guards), following the project's unit-test-plan document shape.

---

## Sequencing

The build order as a checklist, each step gated by the prior contract.

- [ ] Fix names and the data contract (config + schema columns).
- [ ] Stand up acquisition for one family (values) end to end.
- [ ] Clean, reshape, and crosswalk that family to the canonical CSV.
- [ ] Wire the data layer, route, and schema for that family; render one `line` chart.
- [ ] Add the remaining families and their geography-coverage gating.
- [ ] Add derived measures, the map, ranking, scatter, and table charts.
- [ ] Add presets and the dashboard assembly.
- [ ] Backfill the test suite to the coverage bar.

---

## Resolved Decisions

Reserved in the guide to record, with rationale, the naming choices (module id, package, route slug, schema file), the canonical grain (measures-as-columns vs long), the canonical cut (smoothed+SA vs raw), the v1 metric subset per family, whether weekly cadence and forecasts are in scope, and the crosswalk's authoritative source. Empty until the planning session fills it, mirroring how the graph-editor overhaul recorded its signed-off decisions.

---

## Open Questions

Carries forward the unresolved items from the fact-sheet and visualization plan: the crosswalk source of truth, price-to-rent as schema measure vs chart field, the CA county GeoJSON for the choropleth, weekly-cadence scope, and the default KPI set, each to be promoted into Resolved Decisions as it is settled.
