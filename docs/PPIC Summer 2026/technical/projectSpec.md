---
Topic: tbd
Content Type: project specification
pinned: true
description: "The single source of truth for the web-data-visualization project's specification, architecture, and API reference. A living document for programmers and researchers that uses PopHousing as the reference implementation future data modules should mirror."
Date Published: June 23, 2026
Last Updated: 07/02/2026 - 12:48 PM
---


# Project Specification, Architecture & API Reference
Web **Visualizations** Project
Last Updated: July 1st, 2026

---

A single reference for the **web-data-visualization** project: what it is, how the codebase is laid out, the architecture every data module follows, and the conventions every contributor is expected to follow.

The project is organized as a set of **data modules** — one per dataset — that each flow from a public data source through an ETL (**Extract-Transform-Load** — it's the scrape → clean → save data flow) pipeline to interactive charts on a shared website. **Population & Housing (PopHousing)** is the first module refactored from the legacy notebooks/Shiny app into this structure, and **Components of Change** is the second — the first module built by *following* PopHousing's template rather than defining it, which is the project's first evidence that the module shape generalizes. This document covers the project-wide scaffolding first, uses PopHousing as the **reference implementation** that future modules should mirror, documents Components of Change as a second worked example, **Age, Sex & Race Projections (Demographic Projections)** as a third — the first module built entirely **test-first** (its unit-test suite was written before the implementation and used as the contract) — and **ACS Housing Stress** as a fourth, also built test-first.

### How to read this document:

- **Researchers / non-developers** — read *Project Overview*, *Modules*, *Architecture Overview*, and (for the worked example) *The PopHousing Module*. These explain what the system produces and the themes behind how it's organized, without requiring you to read code.
- **Programmers** — every section applies. The project-wide sections define the structure and rules; *The PopHousing Module* (its pipeline, *Module Reference*, *Configuration Reference*, *Data Contract*, and *Frontend*) gives you a complete, working example to copy when adding a module.

---
## Project Overview
This is a **migration/refactor project at PPIC (Public Policy Institute of California)**. The legacy tooling existed in two disconnected pieces:

- **V1** — Jupyter notebooks (14 notebooks across 5 datasets) that visualized California demographic data.
- **V2** — a partial Shiny web app plus a production ETL pipeline.

**This project (V3)** consolidates everything into one system: a **Next.js / React website** backed by **Python ETL pipelines**, organized so that each legacy dataset becomes a self-contained **module**. Every module follows the same shape:

1. A **Python ETL pipeline** that acquires, cleans, merges, enriches, validates, and publishes a single canonical dataset.
2. A **data-access layer + API route + React charts** that read that dataset and reproduce the legacy visualizations, with room to add new ones.

The work proceeds **module by module**: a dataset is lifted out of its notebook/Shiny form, rebuilt against the shared architecture below, and added to the site. **PopHousing is the first module to complete this migration** and is the template for the rest.

Two design goals run through the entire codebase and should be treated as requirements, not aspirations:

- **Every failure surfaces a message identifying its source.** When error handling is exhausted, the system says *where* it broke (which pipeline phase, which validation, which API stage) rather than failing silently or generically.
- **It is documented for non-developers.** A researcher should be able to understand the structure and a future contributor should be able to extend it.

> [!flag] Workspace boundary
> The VS Code workspace contains two folders. `web-data-visualization/` is the new project root — **all work happens here.** `Previous Tool/` is **read-only legacy reference** (the V1 notebooks and V2 Shiny app/pipeline) and must never be modified.

---
## Modules

A **module** is one dataset's full vertical slice: its ETL pipeline under `scripts/<module>/`, its cleaned-data contract under `data/data-cleaned/<module>/`, its data-access layer under `lib/data/`, its API route under `app/api/<module>/`, and its **frontend field catalog** under `lib/visualization/moduleSchemas/` (which plugs it into the shared UI layer — chart editor + landing dashboards; see *Frontend Architecture (UI Layer)*). Project-independent machinery they all share lives in `scripts/shared/` (backend) and `lib/visualization/` + `components/{ui,chart-builder,charts,landing}/` (frontend).

| Module | Source | Status |
|---|---|---|
| **Population & Housing** (PopHousing) | CA Dept. of Finance E-5 (modern) + E-8 (historical) estimates | **Active** — first module migrated. End-to-end complete, including the E-8 historical build; only cross-module logging remains stubbed. |
| **Components of Change** | CA Dept. of Finance E-6 + U.S. Census county population component estimates | **Active** — second module migrated, built by mirroring PopHousing. Full pipeline, data contract, API route, and charts complete, with a **verified end-to-end run** against the live DoF E-6 + Census sources (4,018 rows, 1991–2025). |
| **Age, Sex & Race Projections** (Demographic Projections) | CA Dept. of Finance **P-3** projections + U.S. Census **cc-est** estimates | **Active** — third module migrated, built **test-first** against the shared architecture. Full Python pipeline, data contract, API route, and chart wiring are complete and the pipeline runs end-to-end. It runs **DoF P-3 only** today — no Census cc-est file is present yet, so the `US State` level is absent until one is added. See *The Demographic Projections Module* for the remaining caveats. |
| **ACS Housing Stress** | U.S. Census Bureau **ACS 1-year** table-based Summary File, table **B25140** (housing cost burden) | **Active** — fourth module migrated, built **test-first** (136 mirrored tests pass). Full Python pipeline, data contract, API route, module schema, and built-in chart views are complete, with a **verified end-to-end run** against live ACS. It contains the **latest vintage only** (2024, 4,525 rows) — the pipeline fetches one vintage per run and accumulates history over time; the legacy 2012–2023 series was set aside pending a schema migration. See *The ACS Housing Stress Module* for caveats. |
| *Remaining legacy datasets* | V1 notebooks | **Not started** — to be migrated into the same module shape. |

The rest of this document documents the **project-wide architecture and conventions** (which apply to every module), then **The PopHousing Module** as the concrete reference implementation and **The Components of Change Module** as a second worked example.

---
## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS 4, Plotly.js via `react-plotly.js`, shadcn/Radix UI primitives (`components/ui/`) |
| **Backend / ETL** | Python 3.12, pandas, `requests`, BeautifulSoup (`bs4`), `openpyxl` |
| **Testing** | pytest (backend); error handling surfaces messages identifying the failure source |
| **Tooling** | `ruff` (lint + import sort), `.venv` for Python, ESLint for JS |
| **Dev environment** | macOS, VS Code multi-folder workspace |
### Commands

```bash
npm run dev          # start the Next.js dev server
npm run build        # production build
npm run start        # serve the production build
python -m pytest     # run backend tests (from project root, .venv active)
ruff check scripts   # lint the Python pipeline
```

---

## Repository Layout

Folders marked *(PopHousing)* are this first module's slice; the same shape repeats per module.

```
web-data-visualization/
├── app/                          ← Next.js App Router
│   ├── page.js  layout.js  globals.css   ← landing (category dashboards) + shell + design tokens
│   ├── [module]/page.js                  ← detailed module page = the chart editor   (per module)
│   └── api/
│       ├── pophousing/route.js           ← GET /api/pophousing             (PopHousing)
│       ├── components-of-change/route.js ← GET /api/components-of-change    (Components)
│       ├── projections/route.js          ← GET /api/projections            (Demographic Projections)
│       ├── housing-stress/route.js        ← GET /api/housing-stress         (ACS Housing Stress)
│       └── geography/route.js            ← GET /api/geography (county GeoJSON, choropleth)
├── components/
│   ├── Navbar.js                 ← shared site shell
│   ├── ui/                       ← shadcn/Radix primitives (button, select, slider, dialog, table, …) + cn util
│   ├── charts/                   ← PlotlyChart wrapper, ChartPreview, legacy line sections
│   ├── chart-builder/            ← the dynamic chart editor (sidebar, config store, saved views, layers)
│   └── landing/                  ← dashboard shell, chart tiles, stat cards, region table, dashboards/<category>
├── lib/
│   ├── config.py                 ← shared project paths + generic HTTP defaults
│   ├── pophousing_config.py      ← PopHousing source of truth: geography, regions, columns
│   ├── constants.js              ← shared brand palette + Plotly color cycle
│   ├── data/pop_housing.js              ← server-only data-access layer over the CSV  (PopHousing)
│   ├── data/components_of_change.js     ← server-only data-access layer over the CSV  (Components)
│   ├── data/demographic_projections.js  ← server-only data-access layer over the CSV  (Projections)
│   ├── data/housing_stress.js           ← server-only data-access layer over the CSV  (Housing Stress)
│   ├── data/geography.js                ← server-only county GeoJSON access  (choropleth)
│   ├── data/query_shapes.js             ← shared row → line/category/two-period/pairs/matrix shaping
│   ├── data/apiParams.js                ← shared API-route query-param helpers
│   └── visualization/                   ← CLIENT-SAFE chart catalog + registries (no node:fs)
│       ├── moduleSchemas/{pophousing,componentsOfChange,demographicProjections,housingStress}.js  ← per-module field catalog
│       ├── fieldTypes.js  formatters.js  transformRegistry.js  toPlotly.js
│       ├── chartRegistry.js  presetRegistry.js  validation.js
│       └── categoryRegistry.js          ← landing categories + built-in dashboard views
├── scripts/                      ← Python ETL (see Module Reference)
│   ├── shared/                   ← cross-module mechanisms + reference data (downloads, data_cleaning, validation, visualizations, logging, geography)
│   ├── pophousing/               ← California / E-5 / E-8 domain logic  (PopHousing module)
│   ├── components_of_change/     ← E-6 / Census components domain logic  (Components module)
│   ├── projections/             ← P-3 / cc-est age-sex-race domain logic  (Projections module)
│   ├── housing_stress/          ← ACS B25140 cost-burden domain logic  (Housing Stress module)
│   ├── orchestrators/            ← per-module pipeline sequencing
│   └── unit_tests/               ← pytest suite (mirrors source tree)
├── data/                         ← raw, cleaned, and archived data (git-ignored)
│   ├── data-raw/housing-population/             ← PopHousing raw E-5 workbooks
│   ├── data-cleaned/housing-population/PopHousing_Current.csv   ← PopHousing contract
│   ├── data-raw/components-of-change/           ← Components raw E-6 / Census downloads + GeoJSON
│   ├── data-cleaned/components-of-change/ComponentsOfChange_Current.csv  ← Components contract
│   ├── data-cleaned/geography/california-counties.geojson   ← county polygons (shared, choropleth)
│   ├── data-raw/demographic-projections/        ← Projections raw P-3 zip/CSV (+ optional cc-est)
│   ├── data-cleaned/demographic-projections/DemographicProjections_Current.csv  ← Projections contract
│   ├── data-raw/housing-stress/                 ← Housing Stress PUMA crosswalks (+ optional manual raw)
│   ├── data-cleaned/housing-stress/HousingStress_Current.csv  ← Housing Stress contract
│   ├── archive/housing-population/
│   ├── archive/demographic-projections/         ← Projections archived prior CSVs
│   └── archive/housing-stress/                  ← Housing Stress archived prior CSVs
├── logs/deletions/               ← retention warning files
├── docs/                         ← this documentation set
├── pyproject.toml                ← pytest + ruff config
└── package.json                  ← Next.js / npm config
```

A new module adds a folder under `scripts/<module>/`, a `data/data-cleaned/<module>/` contract, a `lib/data/<module>.js` access layer, an `app/api/<module>/` route, and its chart components — without touching `scripts/shared/` except to *add* generic helpers.

---
## Architecture Overview

This is the architecture **every module follows**. A module has two halves connected by one artifact — a single cleaned CSV (the module's *contract*). PopHousing is shown as the concrete instance; `<module>` marks the parts that vary per dataset.

```
   ┌─────────────────────── BACKEND (Python ETL) ───────────────────────┐
   │                                                                     │
   │   source ──► acquisition ──► cleaning ──► merge ──► enrich          │
   │   (e.g. DOF)                                        │                │
   │                                                     ▼                │
   │                       validation ──► data/data-cleaned/<module>/*.csv │
   │                                                                     │
   └─────────────────────────────────────────────────┬───────────────── ┘
                                                      │  (the contract)
   ┌──────────────────────── FRONTEND (Next.js) ──────▼──────────────────┐
   │                                                                     │
   │   lib/data/<module>.js ──► /api/<module> ──► UI layer: chart editor │
   │   (reads + caches CSV)     (validate +       + category dashboards  │
   │                            view-dispatch)    (config ─► toPlotly ─► Plotly) │
   │                                                                     │
   │   client-safe lib/visualization/ catalog drives fields · charts · presets │
   │                                                                     │
   └─────────────────────────────────────────────────────────────────── ┘
```

For PopHousing the source is the DOF website, the contract is `PopHousing_Current.csv`, the access layer is `lib/data/pop_housing.js`, and the route is `/api/pophousing`. The **UI layer above the route is shared across all modules** — see *Frontend Architecture (UI Layer)*; a module plugs into it through its `lib/visualization/moduleSchemas/<module>.js` catalog.
### The three-layer backend

The `scripts/` tree enforces a strict separation that is the central architectural theme of the project. Each module's pipeline is split into the same three layers:

| Layer | Directory | Role | May import from |
|---|---|---|---|
| **Shared** | `scripts/shared/` | Project-*independent* **mechanisms** (file retention, HTTP, generic DataFrame ops, generic validators, logging, chart builders) **plus cross-module reference data** (e.g. `geography/california_geography.py`). Used by **every** module. | stdlib, third-party, and the project config layer (`lib/`) for reference data |
| **Domain** | `scripts/<module>/` (e.g. `pophousing/`) | Dataset-specific knowledge: schemas, geography/business rules, formulas, source-specific parsing, domain validation. | `scripts/shared/` |
| **Orchestration** | `scripts/orchestrators/` | One entry point per module; sequences the phases, handles logging and errors. Contains no transformation logic. | shared + that module's domain |

**The dependency direction is one-way and non-negotiable:**

```
shared helpers  →  <module> domain modules  →  <module> pipeline orchestrator
```

The rules that follow from it:

- `scripts/shared/` **must never import from** any module's domain package.
- Shared **mechanisms** receive column names, mappings, paths, and thresholds **as arguments** — they never reach for a specific dataset's columns or business rules on their own. If a shared *mechanism* "knows" a California county name, the boundary has leaked. The exception is an explicit shared **reference-data** provider (`shared/geography/california_geography.py`): reference data that two or more modules genuinely share *does* live in shared and may name real places — that is the point of it, and it reads only from the project config layer (`lib/`), never from a module.
- Before writing a new domain helper, check whether a shared equivalent already exists. Duplicate implementations are only allowed when the behavior genuinely differs and cannot be expressed through arguments or callbacks — and the reason must be documented beside the specialized copy.
- Modules do not import each other's domain packages; anything two modules both need belongs in `scripts/shared/` — as a generic mechanism if it is one, or as a reference-data provider if it is shared data (this is why California county/region geography lives in `shared/geography/`, consumed by both PopHousing and Components of Change).

This is the same boundary the unit-testing guide enforces: tests for `scripts/shared/` use generic DataFrames and generic filenames; a module's tests use its real domain data.
### Worker vs. orchestrator functions

Within a domain layer, functions are written as either **workers** (do one transformation inline) or **orchestrators** (sequence workers, little inline logic). In PopHousing, `clean_e5_data()` and `main()` are orchestrators; almost everything else is a worker. Keeping these roles distinct is what makes a pipeline testable function-by-function.

---
# The PopHousing Module

Everything from here through *Performance Handling* documents the **Population & Housing module** specifically — the first dataset migrated into the architecture above. Read it as the **reference implementation**: a new module reuses the same layering, the same shared helpers, and the same frontend read-path shape, swapping in its own source, schema, and domain rules. (The *Conventions*, *Error Handling*, and *Testing* sections that follow are project-wide and apply to every module.)

The module covers California population & housing estimates from the **CA Department of Finance**: the modern **E-5** series (2020+) and the historical **E-8** series (1991–2020), merged into one dataset.

## Pipeline

The entry point is [`scripts/orchestrators/pophousing_pipeline.py`](../../../scripts/orchestrators/pophousing_pipeline.py). `main()` runs six phases in sequence. Each phase is wrapped so that any exception is re-raised as a **`PipelinePhaseError`** tagged with the phase name — this is how the pipeline satisfies the "identify the failure source" goal. On success, `main()` returns a summary dict: output path, row count, year range, and per-geographic-level row counts.

| Phase | Name | What happens | Primary modules |
|---|---|---|---|
| **1** | Setup & Validation | Resolve paths/config; archive E-5 workbooks older than 60 days (writing deletion warnings at 15/10/5/1 days); validate the existing historical dataset. | `config/*`, `archives/e5_retention`, `validation/historical_data_validator` |
| **2** | Data Acquisition | Scrape the DOF site for the current E-5 workbook URL; download it (with a 60-day cache); fall back to the most recent local workbook if the network fails. | `acquisition/dof_e5_downloader`, `shared/downloads/http_downloads` |
| **3** | Clean the Raw E-5 Data | Normalize the raw Excel layout into the canonical schema: assign columns, trim header rows, forward-fill the hierarchical county/city structure, filter, coerce types, derive housing columns, classify geography. | `cleaning/*`, `calculations/housing_metrics`, `shared/data_cleaning/*` |
| **4** | Merge Historical + Modern | Load historical (≤2020) data, concatenate with cleaned modern (E-5) data, resolve overlapping records by source priority (`E-5` over `E-8`). | `merging/historical_modern_merge` |
| **5** | Enrich the Merged Dataset | Build region rollups from counties; build California state rows for years missing them; normalize decimal-fraction vacancy rates to percentages; validate rates. | `aggregation/*`, `calculations/rate_normalization`, `validation/aggregation_validators` |
| **6** | Archive & Finalize | Final geographic-level assignment, name standardization, San Francisco City/County duplication; order/sort columns; validate the final dataset; archive the previous CSV; write `PopHousing_Current.csv`. | `cleaning/*`, `output/finalize_dataset`, `validation/final_dataset_validator` |

### Data acquisition resilience (Phase 2)

The acquisition step is deliberately defensive because the DOF website is the single most fragile external dependency:

1. Try to discover the current E-5 URL by scraping (`get_e5_file_url`). On `E5DiscoveryError`, set the URL to `None` instead of crashing.
2. If a URL was found, download it (`download_e5_data`). The download is **cache-aware**: a local workbook younger than `e5_cache_max_age_days` (60) is read directly with no HTTP request. On `HTTPDownloadError`, fall back.
3. If no fresh download is available, `get_most_recent_e5_file` scans the download directory for the newest workbook within `e5_fallback_max_age_days` (60) and loads that.
4. Only if *all three* fail does the phase raise `RuntimeError("No current E-5 workbook could be acquired")`.

### The hierarchical-cleaning problem (Phase 3)

The raw E-5 workbook is not tabular. A county name appears once as a header row, followed by its cities with **blank** county fields; `County Total` and `State Total` are summary rows. Phase 3's job is to flatten this into one clean row per (Location, Geographic Level, Year). This is the densest logic in the pipeline and lives in [`cleaning/hierarchical_location_cleaning.py`](../../../scripts/pophousing/cleaning/hierarchical_location_cleaning.py) and [`cleaning/geographic_classification.py`](../../../scripts/pophousing/cleaning/geographic_classification.py).

---
## Module Reference

One entry per script. Each entry gives the file's **role**, a short explainer of what it does and why it exists, and a table of its public functions. Roles: **Shared mechanism** (domain-free), **Shared reference data** (cross-module data), **Domain worker** (one transformation), **Domain orchestrator** (sequences workers), **Config**, **Stub** (signatures present, body `TODO` — see *Implementation Status*).

The reading order follows the dependency direction: the cross-module `scripts/shared/` layer first (used by every module), then PopHousing's own domain packages that compose it, then the orchestrator that runs everything.

---
### `scripts/shared/` — project-independent mechanisms

Most of these modules know nothing about California, housing, or the DOF — they take column names, paths, patterns, and thresholds **as arguments** and are the reusable foundation the domain layer builds on. The one deliberate exception is the **reference-data** provider `geography/california_geography.py`, which owns California place names that more than one California module needs (see *The dependency boundary*).

#### [`shared/geography/california_geography.py`](../../../scripts/shared/geography/california_geography.py) — *Shared reference data*
The single owner of California county, region, and state reference geography, consumed by both PopHousing and Components of Change so neither reaches into the other's config. Reads the canonical county list and region-to-county mapping from the project config layer (`lib/pophousing_config.py`) and returns fresh, independently-mutable copies.

| Function | Responsibility |
|---|---|
| `get_california_geography()` | Return `{state_name, county_names (incl. San Francisco), region_names, regions_mapping}` as fresh copies. |

#### [`shared/archives/file_retention.py`](../../../scripts/shared/archives/file_retention.py) — *Shared mechanism*
Generic file-age lookup and disposition. The mechanical half of the retention policy: find old files, then move or delete them. The *policy* (which files, how old, archive vs. delete) is supplied by the caller, so the same code serves E-5 retention today and any future dataset.

| Function                                                           | Responsibility                                                                                                                                                                                                  |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |

#### [`shared/archives/file_retention.py`](../../../scripts/shared/archives/file_retention.py) — *Shared mechanism*
Generic file-age lookup and disposition. The mechanical half of the retention policy: find old files, then move or delete them. The *policy* (which files, how old, archive vs. delete) is supplied by the caller, so the same code serves E-5 retention today and any future dataset.

| Function                                                           | Responsibility                                                                                                                                                                                                  |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `find_files_older_than(directory, max_age_days, filename_pattern)` | Return file paths at/beyond an **inclusive** age threshold. `filename_pattern` is a regex matched with `re.fullmatch`, **not** a glob. Ignores subdirectories; raises a clear error on a missing directory.     |
| `archive_or_delete_files(file_paths, archive_directory)`           | Move files into `archive_directory`, or **delete** them when it is `None`. Creates the archive dir, skips files that no longer exist, and renames (numeric suffix) on a name collision rather than overwriting. |

#### [`shared/downloads/http_downloads.py`](../../../scripts/shared/downloads/http_downloads.py) — *Shared mechanism*
The single place the project performs HTTP. Wraps `requests` so that every network failure becomes a typed, message-bearing `HTTPDownloadError` instead of a bare `requests` exception — this is what lets callers up the stack report *why* the network step failed.

| Function | Responsibility |
|---|---|
| `fetch_response(url, headers, timeout)` | GET a URL; return the response on success, raise **`HTTPDownloadError`** with timeout / connection / HTTP-status context otherwise. |
| `download_file(url, destination_path, headers, timeout)` | Stream binary content to a path; create parent dirs; never leave a partial file when the request fails. |

#### [`shared/data_cleaning/type_conversions.py`](../../../scripts/shared/data_cleaning/type_conversions.py) — *Shared mechanism*
Type-normalization helpers used across cleaning phases. Kept generic (column names like `"date"`, not `"Date"`) so historical and modern paths share one implementation.

| Function | Responsibility |
|---|---|
| `parse_year_from_date(dataframe, date_col, out_col)` | Extract a 4-digit year into a new numeric column; the original column is untouched and nulls stay null. |
| `coerce_numeric_columns(dataframe, numeric_cols)` | Force the listed columns to numeric; unparseable values (`"N/A"`, `""`, …) become `NaN`, not errors. |

#### [`shared/data_cleaning/row_filters.py`](../../../scripts/shared/data_cleaning/row_filters.py) — *Shared mechanism*
Row-removal predicates. Each filter does one kind of drop and preserves any caller-named exceptions, so domain modules can compose them without re-implementing pandas masking.

| Function | Responsibility |
|---|---|
| `filter_year_range(dataframe, year_col, min_year, max_year)` | Keep rows within an **inclusive** year range; either bound may be `None` for an open end. |
| `remove_summary_rows(dataframe, location_col, keep_values, patterns)` | Drop summary-pattern rows (e.g. "Balance of", "Incorporated") while preserving configured values like `County Total` / `State Total`. |
| `remove_header_like_rows(dataframe, location_col, patterns)` | Drop rows whose location matches header-like regexes (section labels, not places). |
| `drop_empty_rows_without_data(dataframe, location_col, data_cols)` | Drop rows that are blank/null in `location_col` **and** zero/null across all `data_cols`. |

#### [`shared/data_cleaning/dataframe_operations.py`](../../../scripts/shared/data_cleaning/dataframe_operations.py) — *Shared mechanism*
Two small, widely-reused DataFrame transforms.

| Function | Responsibility |
|---|---|
| `forward_fill_columns(dataframe, columns)` | Scoped pandas forward-fill: fills nulls from the preceding row in the named columns only; leading nulls stay null. |
| `assign_values_from_mapping(dataframe, source_col, target_col, value_mapping)` | Write `target_col` from a dict lookup of `source_col`; non-matching rows are left unchanged; creates `target_col` if absent. |

#### [`shared/validation/dataframe_validators.py`](../../../scripts/shared/validation/dataframe_validators.py) — *Shared mechanism*
Generic data-quality checks. Each **returns structured results** (lists, counts, DataFrames, booleans) rather than printing or raising — the caller decides what is fatal. Domain validators compose these with domain-specific rules.

| Function | Returns |
|---|---|
| `validate_required_columns(dataframe, required_columns)` | List of missing column names (empty = all present). |
| `validate_not_empty(dataframe)` | Bool — true if the frame has ≥1 row. |
| `find_duplicate_rows(dataframe, key_columns)` | DataFrame of rows duplicated on the composite key. |
| `validate_null_counts(dataframe, columns)` | Per-column null counts (both `NaN` and `None` count as null). |
| `validate_numeric_range(dataframe, value_col, min_value, max_value, row_mask)` | Rows where the value is outside `[min, max]`; nulls are not violations; bounds may be `None`; `row_mask` limits which rows are checked. |

#### [`shared/logging/pipeline_logging.py`](../../../scripts/shared/logging/pipeline_logging.py) · [`dataframe_logging.py`](../../../scripts/shared/logging/dataframe_logging.py) — *Stub*
The intended logging surface: `setup_logging` / `get_logger` / `close_logging` / `log_processing_step`, plus `log_dataframe_info` / `log_data_quality_check`. Bodies are `TODO`. By design the **orchestrator supplies the log directory** as an argument, keeping logging free of pophousing config.

---

### `scripts/pophousing/config/` — single source of truth

Each pipeline config module exposes one `get_*()` function returning a plain dict. Population & Housing modules re-package constants from `lib/pophousing_config.py`; nothing else in the pipeline hard-codes paths, URLs, schemas, or geography. `lib/config.py` contains only module-neutral repository paths and HTTP defaults for current and future modules.

> [!flag] Configuration boundary
> [`lib/config.py`](../../../lib/config.py) is project-wide and must not contain dataset-specific rules. Population & Housing configuration derives from [`lib/pophousing_config.py`](../../../lib/pophousing_config.py), which owns regions, counties, towns, E-5 column names, and city-name mappings. Read the module-specific config before changing domain data; modifying either root config is an "ask first" action.

#### [`config/paths.py`](../../../scripts/pophousing/config/paths.py) — *Config*
`get_paths()` — every filesystem path as a `pathlib.Path`, resolved relative to the repo root: download dir, archive dir, current/historical data paths, deletion-log dir. *(Currently `historical_data_path` and `current_data_path` are the same file — see Configuration Reference.)*

#### [`config/sources.py`](../../../scripts/pophousing/config/sources.py) — *Config*
`get_source_settings()` — the DOF base URL, request headers (a Chrome User-Agent to avoid blocking), timeout, E-5 cache/fallback ages (60 days), and every regex pattern used to scrape and match E-5 pages and filenames.

#### [`config/schemas.py`](../../../scripts/pophousing/config/schemas.py) — *Config*
`get_schema_config()` — E-5 column names, the raw→pipeline rename map, the numeric/output/required column lists, the anchor row (`Alameda`), summary/header patterns, and the **cleaning** and **final** validation configs consumed by the validators.

#### [`config/geography.py`](../../../scripts/pophousing/config/geography.py) — *Config*
`get_geography_config()` — county/region/town/ambiguous-name sets, the region→county mapping, name-standardization maps, the five valid geographic levels, the default level, and population thresholds for ambiguous classification. The county/region/state names and region→county mapping come from the shared [`california_geography`](../../../scripts/shared/geography/california_geography.py) provider; the town, ambiguous-name, and city-name-mapping pieces remain PopHousing-specific (from `lib/pophousing_config.py`).

---

### `scripts/pophousing/acquisition/` — getting the source workbooks

#### [`acquisition/dof_e5_downloader.py`](../../../scripts/pophousing/acquisition/dof_e5_downloader.py) — *Domain worker*
Locates, caches, downloads, and loads the current **E-5** workbook. Combines the shared HTTP layer with DOF-specific page traversal, E-5 filename rules, and caching policy. `get_e5_file_url` is the project's **#1 fragility point** — the DOF site *will* change — so it raises `E5DiscoveryError` naming the exact assumption (heading, link container, or workbook link) that broke.

| Function | Responsibility |
|---|---|
| `get_e5_file_url(source_settings)` | Scrape the DOF estimates page → E-5 landing page → workbook link, resolving relative URLs. Raises **`E5DiscoveryError`** with the failed structural/network assumption. |
| `get_e5_filename_from_url(url, filename_pattern=…)` | Pure string logic: extract and validate the E-5 filename, stripping query params; raises `ValueError` on a non-E-5 URL. |
| `download_e5_data(url, download_directory, cache_max_age_days, headers=None, timeout=60)` | Cache-aware: read a fresh local copy without a request, otherwise download; returns a **DataFrame**. |
| `get_most_recent_e5_file(download_directory, filename_pattern, fallback_max_age_days)` | Offline fallback: load the newest valid local workbook within the age limit, or `None`. |
| `_read_e5_workbook(path)` | Read the **second** worksheet (the data sheet); convert a missing `openpyxl` into a clear `RuntimeError`. |

#### [`acquisition/dof_historical_downloader.py`](../../../scripts/pophousing/acquisition/dof_historical_downloader.py) — *Domain worker*
**E-8** historical workbook discovery/download over the shared HTTP layer: `get_historical_landing_page_urls`, `find_geography_workbook_url`, `download_historical_e8_files`. Raises **`E8DiscoveryError`** naming the broken structural/network assumption, mirroring the E-5 downloader.

---

### `scripts/pophousing/cleaning/` — turning the raw E-5 sheet into clean rows

#### [`cleaning/e5_pipeline.py`](../../../scripts/pophousing/cleaning/e5_pipeline.py) — *Domain orchestrator*
**Phase 3's entry point.** `clean_e5_data(raw_e5_df, schema_config, geography_config)` composes every step below — normalize → trim → rename → forward-fill → filter rows → context-fill locations → derive housing columns → classify geography → standardize names → finalize — and ends with a `validate_cleaned_e5_data` gate that raises on failure. Little inline logic; almost pure sequencing.

#### [`cleaning/e5_schema_normalizer.py`](../../../scripts/pophousing/cleaning/e5_schema_normalizer.py) — *Domain worker*
Reshapes the raw workbook's positional columns into the pipeline schema before any cleaning.

| Function | Responsibility |
|---|---|
| `normalize_e5_columns(raw_e5_df, column_names)` | Assign canonical E-5 column names; raise `ValueError` on a column-count mismatch (names the expected vs. found counts). |
| `trim_to_first_data_row(raw_e5_df, anchor_value, column)` | Drop header/metadata rows above the first county (`Alameda`); reset the index; raise if the anchor is absent. |
| `rename_e5_schema(raw_e5_df, mapping)` | Apply `Region→County` / `City→Location`; preserve unmapped columns. |

#### [`cleaning/hierarchical_location_cleaning.py`](../../../scripts/pophousing/cleaning/hierarchical_location_cleaning.py) — *Domain worker*
The most intricate logic in the pipeline. The raw sheet is hierarchical — a county name heads a block of its cities, whose own county field is blank — and these functions flatten it while preserving which county each city belongs to.

| Function | Responsibility |
|---|---|
| `has_meaningful_housing_data(housing_row, value_columns)` | Row check: any nonzero, non-null value column? |
| `identify_county_headers(housing_df, county_names, location_col)` | Tag county-header rows using known county names (won't misread a city that shares a county's name). |
| `forward_fill_locations_with_context(housing_df, location_col, county_col)` | The core row-by-row loop that fills location names within each county block and stops at county boundaries. **The main performance hotspot.** |
| `build_county_context_column(housing_df, location_col, county_col, temp_col)` | Record each row's parent county in `_temp_county` for later County-Total resolution; `State Total` gets none. |

#### [`cleaning/geographic_classification.py`](../../../scripts/pophousing/cleaning/geographic_classification.py) — *Domain worker*
Owns every "what geographic level is this row?" decision, plus the San Francisco policy. Reused by both Phase 3 and Phase 6 so there is exactly one classifier.

| Function | Responsibility |
|---|---|
| `classify_ambiguous_location(location, county_context, population, housing_row, housing_df, row_index)` | Resolve names that are both a city and a county, using context and population. |
| `assign_geographic_level_with_context(location, county_context, population, housing_row, geography_config)` | The row-level classifier passed into the fallback pass. |
| `resolve_county_total_rows(df, location_col, temp_county_col)` | Replace `County Total` with the real county name from `_temp_county`. |
| `normalize_state_total_rows(df, location_col, state_name)` | Rename `State Total` → `California`. |
| `assign_missing_geographic_levels(df, classifier_fn, location_col, county_col, population_col, level_col)` | Apply `classifier_fn` to rows still lacking a level. |
| `apply_town_overrides(df, town_list, location_col, level_col)` | Force configured towns to the `Town` level. |
| `sanitize_geographic_levels(df, valid_levels, default_level)` | Replace invalid/blank levels with the default. |
| `remove_balance_rows(df, location_col)` · `drop_helper_columns(df, columns)` | Final "Balance of" cleanup and temp-column removal. |
| `standardize_san_francisco_classification(df, location_col, level_col)` | The **only** implementation of the SF City+County duplication policy; runs once in Phase 6. |

#### [`cleaning/location_standardization.py`](../../../scripts/pophousing/cleaning/location_standardization.py) — *Domain worker*
`standardize_location_column(df, location_col, geo_col, only_levels)` — the single canonical place-name standardization pass (consumes `CITY_NAME_MAPPINGS` + `HISTORICAL_NAME_STANDARDIZATION`, strips suffixes), applied only to the given levels. Replaces both the legacy Phase 3 `clean_name()` and Phase 6 `standardize_city_names()`.

---

### `scripts/pophousing/calculations/` — derived metrics

#### [`calculations/housing_metrics.py`](../../../scripts/pophousing/calculations/housing_metrics.py) — *Domain worker*
The one home for housing arithmetic, so cleaning, regional, and state code never re-derive formulas.

| Function | Responsibility |
|---|---|
| `add_housing_derived_columns(df)` | Derive `Single Family Units`, `Multiple Family Units`, and `Vacant Units` from the raw E-5 unit breakdown. |
| `recalculate_housing_rates(df, row_mask)` | **The single implementation** of Vacancy Rate and Persons Per Household — reused for region and state aggregate rows. |

#### [`calculations/rate_normalization.py`](../../../scripts/pophousing/calculations/rate_normalization.py) — *Domain worker*
Fixes a known data defect where some modern vacancy rates arrive as fractions instead of percentages.

| Function | Responsibility |
|---|---|
| `find_decimal_fraction_rates(df, year_col, rate_col, level_col, min_year)` | Boolean mask for suspicious decimal-form rates (2020+, non-State, between 0.01 and 1.0). |
| `normalize_decimal_fraction_rates(df, rate_col, mask)` | Multiply the masked rates by 100 and round. |

---

### `scripts/pophousing/merging/` — combining the two sources

#### [`merging/historical_modern_merge.py`](../../../scripts/pophousing/merging/historical_modern_merge.py) — *Domain worker*
**Phase 4.** Joins historical (E-8, ≤2020) and modern (E-5, ≥2020) data into one frame and resolves the overlap year.

| Function | Responsibility |
|---|---|
| `load_historical_housing_data(path)` | Load the historical CSV with the expected schema. |
| `filter_historical_years(df, max_year)` | Apply the historical year boundary (≤2020). |
| `merge_historical_and_modern_data(historical, modern)` | Concatenate both sources under one shared schema. |
| `resolve_source_overlap(df, key_columns, source_priority)` | Deduplicate overlapping (Location, Level, Year) records by source priority (`E-5` wins over `E-8`). |

---

### `scripts/pophousing/aggregation/` — building regions and state rows

#### [`aggregation/aggregation_utils.py`](../../../scripts/pophousing/aggregation/aggregation_utils.py) — *Domain worker*
Reusable building blocks shared by the region and state rollups.

| Function | Responsibility |
|---|---|
| `remove_existing_geographic_level(df, level_col, level_name)` | Strip a level before rebuilding it (avoids double-counting). |
| `deduplicate_geographic_rows(df, location_col, year_col, level_col, preferred_level)` | Dedupe county inputs before aggregating. |
| `_aggregate_additive_columns(df, group_col, excluded_columns)` | Sum additive columns by group (rates are recomputed separately, not summed). |

#### [`aggregation/regional_aggregation.py`](../../../scripts/pophousing/aggregation/regional_aggregation.py) — *Domain worker*
| Function | Responsibility |
|---|---|
| `build_regional_rows(df, regions_mapping, location_col, level_col, year_col)` | Roll counties up into the 9 custom regions. |
| `add_regional_data(df, regions_mapping)` | **Region enrichment entry point** — rebuild region rows and recalc their rates. |

#### [`aggregation/state_aggregation.py`](../../../scripts/pophousing/aggregation/state_aggregation.py) — *Domain worker*
| Function | Responsibility |
|---|---|
| `find_missing_state_years(df, state_name, year_col)` | Identify years with no California row. |
| `build_state_rows_from_counties(df, missing_years, state_name)` | Aggregate counties into a state row for those years. |
| `add_state_data_for_missing_years(df, state_name)` | **State rollup entry point** — fill the gaps and recalc rates. |

---

### `scripts/pophousing/archives/` — E-5 retention policy

#### [`archives/e5_retention.py`](../../../scripts/pophousing/archives/e5_retention.py) — *Domain worker*
The E-5-specific retention policy layered over the shared `file_retention` mechanics. Archives (never silently deletes) old workbooks and warns ahead of deletion.

| Function | Responsibility |
|---|---|
| `cleanup_old_e5_files(download_directory, archive_directory, max_age_days, filename_pattern, warning_days, deletion_log_directory)` | Archive workbooks past `max_age_days` (60); returns archived + warning path lists for visibility. |
| `write_deletion_warnings(file_paths, warning_days, deletion_log_directory, max_age_days=60)` | Write warning files at 15/10/5/1 days before deletion, with the projected date inside; idempotent per threshold. |

---

### `scripts/pophousing/validation/` — domain gates

Each composes the shared validators with domain rules and returns `(is_valid, messages)` so the orchestrator decides severity. The `messages` name the offending column, level, or value.

#### [`validation/historical_data_validator.py`](../../../scripts/pophousing/validation/historical_data_validator.py) — *Domain worker*
`validate_historical_housing_data(file_path, config)` — Phase 1 gate. Checks required columns, year coverage (1991–2020), geographic levels, California presence, population ranges, nulls, and duplicates; raises `FileNotFoundError` if the file is missing.

#### [`validation/cleaning_validators.py`](../../../scripts/pophousing/validation/cleaning_validators.py) — *Domain worker*
`validate_cleaned_e5_data(df, config)` — the gate at the end of Phase 3 (cleaned-E-5 schema, critical columns, valid levels, no duplicates, non-negative numerics).

#### [`validation/aggregation_validators.py`](../../../scripts/pophousing/validation/aggregation_validators.py) — *Domain worker*
`validate_normalized_housing_rates(df, year_col, rate_col, level_col)` — Phase 5 vacancy-rate sanity check after decimal-fraction normalization.

#### [`validation/final_dataset_validator.py`](../../../scripts/pophousing/validation/final_dataset_validator.py) — *Domain worker*
`validate_final_housing_dataset(df, config)` — the last gate before write: schema, duplicates, valid/required levels, year bounds, non-negative columns, vacancy-rate and persons-per-household ranges, and a Bay Area 2020 population sanity check.

---

### `scripts/pophousing/output/` — writing the contract

#### [`output/finalize_dataset.py`](../../../scripts/pophousing/output/finalize_dataset.py) — *Domain worker*
| Function | Responsibility |
|---|---|
| `prepare_housing_output(df, source_name, output_columns, sort_columns)` | Set `Source`, enforce the output column order/types, and sort. |
| `write_housing_output(df, output_path)` | Write the finalized `PopHousing_Current.csv`. |

---

### `scripts/pophousing/historical/` — the E-8 build path

Implemented: these turn raw E-8 workbooks into the historical dataset Phase 4 consumes, reusing the same cleaning/classification/metric helpers as the E-5 path (no duplicate logic). `build_historical_housing_dataset(file_configs)` is the entry point; per-era cleaners flatten each decade's layout, `standardize_e8_data` drops census-date rows and bounds years, and boundary-year resolution + missing-county recovery reconcile the decade seams.

| Script | Intended responsibility |
|---|---|
| [`historical/e8_format_detection.py`](../../../scripts/pophousing/historical/e8_format_detection.py) | `detect_e8_file_format(raw_e8_df)` — identify which decade format a workbook uses. |
| [`historical/e8_schema_normalizer.py`](../../../scripts/pophousing/historical/e8_schema_normalizer.py) | `normalize_e8_columns(raw_e8_df, format_config)` — map each format's columns to the pipeline schema. |
| [`historical/e8_era_cleaners.py`](../../../scripts/pophousing/historical/e8_era_cleaners.py) | `clean_1990_2000` / `clean_2000_2010` / `clean_2010_2020` — per-decade cleaning branches. |
| [`historical/e8_standardization.py`](../../../scripts/pophousing/historical/e8_standardization.py) | `standardize_e8_data(df, year_start, year_end)` — common post-clean standardization. |
| [`historical/boundary_year_resolution.py`](../../../scripts/pophousing/historical/boundary_year_resolution.py) | `resolve_boundary_year_overlaps(df, source_priority)` — reconcile decade-boundary duplicates. |
| [`historical/missing_county_recovery.py`](../../../scripts/pophousing/historical/missing_county_recovery.py) | `extract_missing_county_rows` / `integrate_missing_county_rows` — recover counties dropped by format quirks. |
| [`historical/historical_pipeline.py`](../../../scripts/pophousing/historical/historical_pipeline.py) | `build_historical_housing_dataset(file_configs)` — the E-8 build entry point. |

---

### `scripts/orchestrators/pophousing_pipeline.py` — *Domain orchestrator*
[The pipeline entry point.](../../../scripts/orchestrators/pophousing_pipeline.py) `main()` runs Phases 1–6 in sequence, wrapping each in a `try/except` that re-raises as `PipelinePhaseError("Phase N failed: …")`, and returns the run summary dict (output path, row count, year range, per-level counts). It is the only module permitted to import freely across both layers, and it contains sequencing, validation gating, and error tagging — **no transformation logic**.

---

## Configuration Reference (PopHousing)

All of the module's tunable behavior lives in its `config/` functions, not scattered literals. Key values currently set:

| Setting | Value | Source |
|---|---|---|
| DOF base URL | `https://dof.ca.gov/forecasting/demographics/estimates/` | `sources.py` |
| Request timeout | 60 s | `sources.py` |
| E-5 cache / fallback age | 60 days each | `sources.py` |
| E-5 filename pattern | `E-5-\d{4}_Geo_InternetVersion\.xlsx` | `sources.py` |
| Retention max age / warnings | 60 days / 15,10,5,1 days | orchestrator + `e5_retention` |
| Modern data lower bound | Year ≥ 2020 | `schemas.py` |
| Historical data upper bound | Year ≤ 2020 | orchestrator |
| Valid geographic levels | City, County, Region, State, Town | `schemas.py`, `geography.py` |
| Source priority on overlap | `E-5` over `E-8` | orchestrator |

> [!flag] Current wiring note
> `paths.get_paths()` currently points both `historical_data_path` and `current_data_path` at the same file (`PopHousing_Current.csv`), so Phase 4 reads historical rows from the current output. The `historical/` E-8 build is now implemented as a standalone entry point (`build_historical_housing_dataset`) returning the canonical historical dataset, but it is **not yet wired into the main pipeline** to populate a separate historical source. Revisit this wiring (and split the two paths) when promoting the E-8 build into the orchestrated run.

---

## Data Contract (PopHousing)

The pipeline's output — `data/data-cleaned/housing-population/PopHousing_Current.csv` — is the module's **contract** between backend and frontend. Both sides agree on it; changing it is an "ask first" action. Every module defines an equivalent contract for its own dataset.

**Grain:** one row per `(Location, Geographic Level, Year)`.

**Geographic levels:** `City`, `Town`, `County`, `Region` (9 custom multi-county regions), `State` (California). San Francisco appears at **both** City and County level by policy.

**Year coverage:** 1991–present. Historical (E-8) ≤2020, modern (E-5) ≥2020, deduplicated with E-5 winning the overlap year.

**Columns** (output order, from `schemas.get_schema_config()`):

```
Geographic Level, Location, Year,
Total Population, Household Population, Group Quarters Population,
Total Housing Units, Single Family Units, Multiple Family Units, Mobile Homes,
Occupied Units, Vacancy Rate (%), Persons Per Household,
Single Family Detached Units, Single Family Attached Units,
Two to Four Family Units, Five Plus Family Units, Vacant Units, Source
```

The detailed unit-breakdown columns (`Single Family Detached`, etc.) are blank for older historical rows; the frontend treats blank numeric cells as `null`, never `0`.

---

## Frontend (PopHousing)

PopHousing feeds the shared **UI layer** documented in *Frontend Architecture (UI Layer)* below. This section covers the two **module-specific server pieces** — the data-access layer and the API route. The client-safe field catalog both the server and the browser read from lives in [`lib/visualization/moduleSchemas/pophousing.js`](../../../lib/visualization/moduleSchemas/pophousing.js).

### `lib/data/pop_housing.js` — data-access layer (server-only)
Owns all reading, parsing, and filtering of the CSV. **Uses `node:fs`, so it must never be imported into a `"use client"` component.** Its numeric-column set, curated metric list, and subset map are **derived from the module schema** (single source of truth, no longer hand-listed here), and it shapes rows through the shared `lib/data/query_shapes.js` helpers.

- `loadPopHousingData()` — reads and parses the CSV **once per server process**, caching the rows (`cachedRows`).
- **Query shapes**, one per chart family: `queryLineSeries`, `queryCategoryValues` (bar/ranking), `queryTwoPeriod` (dumbbell/slope), `queryMeasurePairs` (scatter/bubble), `queryMatrix` (heatmap), `queryGeoValues` (choropleth — joins county rows to GeoJSON `GEOID` via `lib/data/geography.js`).
- **Landing helpers**: `queryStatewideStats(parameters)` and `queryRegionTable()` — latest-year statewide values + per-region totals for the dashboard, read server-side.
- `getAvailableLocations(subset)`; exports `AVAILABLE_PARAMETERS` / `AVAILABLE_MEASURES` / `AVAILABLE_SUBSETS` / `SUBSET_TO_LEVELS` (all schema-derived).

A deliberately minimal CSV parser (`split(",")`) avoids a dependency, justified by the dataset's fixed, comma-free schema.

### `app/api/pophousing/route.js` — API endpoint (orchestrator)
`GET /api/pophousing` — a thin validator/dispatcher with **no transformation logic**. A `view` param selects the query shape; param parsing and the `{ error, source }` 400 helper come from the shared `lib/data/apiParams.js`.

| Param | Required | Meaning |
|---|---|---|
| `view` | no (default `line`) | Query shape: `line`, `category`, `twoPeriod`, `pairs`, `matrix`, `geo`. |
| `subset` | yes | Geographic grouping (`Regions`, `Counties`, `Cities`, `Towns`, `State`). |
| `parameter` | most views | Metric column (valid measure). For `pairs`, use `xMeasure` / `yMeasure` (+ optional `sizeMeasure`) instead. |
| `locations` | no | Comma-separated location filter. |
| `startYear` / `endYear` | no | Integer year bounds (range views). |
| `period` | no | Single year (`category` / `pairs` / `geo`). |
| `topN` / `sort` | no | Ranking controls (`category` view). |

Errors carry a `source` string (`"pop_housing API: <stage>"`) identifying the failed stage. Success returns `{ view, parameter, subset, …shape }` — `series` for line, `records` for category/pairs/geo, `matrix` for heatmap — with the observed period / `yearRange`.

> The legacy `charts/PopHousingLineSection.js` (self-contained metric + location-preset line section) still exists and now renders through `toPlotly` + `PlotlyChart`, but the editor + dashboard (UI layer below) are the primary surface.

---

## Performance Handling

PopHousing's performance choices — the patterns below carry over to any module with a scraped source and a CSV-backed read path.

| Concern | Approach |
|---|---|
| **Re-downloading / re-scraping DOF** | 60-day cache: a fresh local E-5 workbook is read directly with no HTTP request. A network failure falls back to the newest valid local file rather than failing the run. |
| **CSV read on every request** | `lib/data/pop_housing.js` parses the CSV once per server process and caches the parsed rows in module scope (`cachedRows`). |
| **CSV parser cost / dependencies** | A minimal `split(",")` parser avoids pulling in a CSV library, valid because the cleaned schema has no quoted or comma-bearing fields. |
| **Plotly bundle / SSR** | `react-plotly.js` is loaded via `next/dynamic` with `ssr: false`, keeping it out of the server bundle and avoiding `window`/`document` errors. |
| **Vectorized transforms** | Phase 3/5 transformations are vectorized pandas operations wherever possible. |
| **The one hotspot** | `forward_fill_locations_with_context` is an intentional row-by-row loop (the hierarchical layout requires sequential context). It is the place to look first for pipeline slowdowns; keep new per-row work out of it. |

---

# The Components of Change Module

The **Components of Change** module is the **second dataset migrated** into the architecture above, and the first one built by *following* the PopHousing template rather than defining it — the project's first confirmation that the module shape generalizes. It tracks the drivers of annual population change — births, deaths, and the migration flows beneath them — for California counties, the nine custom regions, the state, and (from the Census source) every U.S. state.

It departs from PopHousing in two deliberate ways, both worth understanding before reading the code:

- **Two sources stay side by side in the contract.** Instead of collapsing to one canonical row per place-year, it keeps both the **DoF** and **Census** rows, tagged by `Source`; the frontend picks which to show. The contract grain is therefore `(Location, Year, Source)`.
- **It saves incrementally.** PopHousing rewrites its CSV every run; Components writes **only when new source years are detected**, so the frequent re-runs its dual-source acquisition invites do not churn the contract.

## Sources & Pipeline

| Source | Provides | Boundary year |
|---|---|---|
| **CA Dept. of Finance E-6** | California county / region / state components of change | DoF rows start 1990 (`dof_boundary_year`) |
| **U.S. Census county population estimates** | National county + state components | Census rows start 2010 (`census_boundary_year`) |

The entry point is [`scripts/orchestrators/components_of_change_pipeline.py`](../../../scripts/orchestrators/components_of_change_pipeline.py). `build_components_dataset()` runs five phases, each wrapped so any exception re-raises as a **`ComponentsPipelinePhaseError`** tagged with the phase name. It returns a summary dict: dataframe, per-source *new-data* and *fallback* flags, output path (`None` when nothing changed), and row count.

| Phase | Name | What happens | Primary modules |
|---|---|---|---|
| **1** | Setup & Load | Resolve config; load the existing canonical CSV as the historical + fallback source. | `config/*`, `merging/historical_merge` |
| **2** | Acquisition (resilient) | Acquire each source through `acquire_with_fallback`: live discovery/download → manual raw CSV → last-saved rows for that source. The DoF step has two URL-discovery strategies — primary follows the current `/E-6` landing-page slug, fallback picks the most recent E-6 link by year — since the DOF site structure is the module's #1 fragility point. | `acquisition/*`, `shared/downloads/http_downloads` |
| **3** | Cleaning | `clean_e6` and `clean_census_components` normalize each source to the canonical schema; on failure they fall back to manual/saved rows so one broken source never fails the run. | `cleaning/*`, `calculations/demographic_rates` |
| **4** | Merge & Change Detection | Combine each cleaned source with its historical rows, merge DoF + Census, and flag whether genuinely new source years arrived. | `merging/historical_merge`, `aggregation/regional_aggregation` |
| **5** | Finalize, Validate & Save | Assign geographic level, enforce output column order, validate, and **archive + save only when new source data was detected** (otherwise the run is read-only). | `output/finalize_dataset`, `validation/dataset_validator` |

### Acquisition & cleaning resilience (Phases 2–3)

`acquire_with_fallback` is the module's analogue of PopHousing's defensive E-5 acquisition, generalized into a shared-style helper: it tries each live strategy in turn, then a manually-placed raw CSV (`E6_Downloaded.csv` / `Census_Components_Downloaded.csv` under `data/data-raw/components-of-change/`), then the rows already saved for that source in the canonical CSV. Cleaning repeats the same ladder, so a DoF outage still yields a complete dataset from Census plus saved DoF rows — with the run's `*_failed` / `*_used_manual` flags recording exactly which path was taken.

Both sources — including the Census CSV read — download through the shared `fetch_response` (`requests`) HTTP layer rather than letting pandas fetch a URL directly, so TLS/certificate handling is uniform and a discovery request that succeeds is never followed by a download that fails on the same host.

---

## Module Reference (Components of Change)

Same layering as PopHousing: `scripts/shared/` mechanisms (documented above) → `scripts/components_of_change/` domain packages → the orchestrator. Only the domain packages are listed here.

#### `acquisition/` — getting the two sources
| Script | Public functions |
|---|---|
| `dof_e6_downloader.py` | `get_e6_file_url` (follows the current `/E-6` landing-page slug to the workbook), `get_e6_file_url_positional` (fallback: the most recent E-6 link by year), `download_e6_workbook` |
| `census_components_downloader.py` | `get_census_components_url` (walks back through recent years), `download_census_components(url, source_settings=None)` (fetches URLs through the shared HTTP layer; reads local paths directly) |
| `source_fallback.py` | `acquire_with_fallback` — generic *live → manual → saved* ladder used by both sources |

#### `cleaning/` — normalizing each source to the canonical schema
| Script | Public functions |
|---|---|
| `e6_cleaner.py` | `normalize_e6_columns`, `repair_truncated_county_names`, `forward_fill_locations_by_year_block`, `clean_e6` (orchestrator) |
| `census_cleaner.py` | `map_state_abbreviations`, `reshape_census_wide_to_long`, `clean_census_components` (orchestrator) |

#### `calculations/` · `aggregation/` — derived metrics and regions
| Script | Public functions |
|---|---|
| `calculations/demographic_rates.py` | `add_crude_rates` (per-1,000 birth/death/migration rates), `recalculate_population_change` |
| `aggregation/regional_aggregation.py` | `build_regional_rows`, `add_regional_data` — roll California counties into the nine regions |

#### `merging/` — combining sources and detecting change
| Script | Public functions |
|---|---|
| `historical_merge.py` | `load_canonical_dataset`, `combine_source_with_historical`, `detect_new_source_data` (drives the incremental save; normalizes numeric columns to numpy floats first so a freshly-cleaned `Float64`/`pd.NA` frame and the reloaded CSV's `float64`/`np.nan` don't read as a change), `merge_dof_and_census` |

#### `output/` · `validation/` — contract and gates
| Script | Public functions |
|---|---|
| `output/finalize_dataset.py` | `assign_geographic_level`, `prepare_components_output`, `write_components_output`, `archive_and_save` |
| `validation/dataset_validator.py` | `validate_components_dataset` — the final gate before save |
| `validation/input_validators.py` | `validate_parameters` / `validate_locations` / `validate_source` / `validate_subset` / `validate_metric_of_change` / `validate_year_bounds`, plus `expand_locations`, `locations_for_subset` (shared by the notebook/API surfaces) |

#### `visualizations.py` — notebook-facing charts
Thin line / bar / choropleth wrappers over the new cross-module [`scripts/shared/visualizations/`](../../../scripts/shared/visualizations/) (`line_chart`, `bar_chart`, `choropleth_map`) — generic Plotly figure builders added with this module and available to every future one.

---

## Configuration Reference (Components of Change)

| Setting | Value | Source |
|---|---|---|
| DoF estimates URL | `https://dof.ca.gov/forecasting/demographics/estimates/` | `sources.py` |
| Census CSV template | `…/2020-{year}/counties/totals/co-est{year}-alldata.csv` | `sources.py` |
| Census lookback | start at current year, up to `max_lookback_years` (10) back | `sources.py` |
| E-6 worksheet index | 1 (second sheet) | `sources.py` |
| DoF / Census boundary years | 1990 / 2010 | `sources.py` |
| Manual fallback filenames | `E6_Downloaded.csv`, `Census_Components_Downloaded.csv` | `sources.py`, `paths.py` |
| Valid geographic levels | State, Region, County, Other | `geography.py` |
| Duplicate key | `Location, Year, Source` | `columns.py` |

Components sources its California county/region names from the shared [`california_geography`](../../../scripts/shared/geography/california_geography.py) provider — the same single source of truth PopHousing uses — so the geography no longer crosses the module boundary.

> [!flag] Remaining cross-module import
> One boundary crossing still exists outside geography: [`components_of_change/aggregation/regional_aggregation.py`](../../../scripts/components_of_change/aggregation/regional_aggregation.py) imports the private `_aggregate_additive_columns` helper from `pophousing.aggregation.aggregation_utils`. That additive-sum helper is the natural next thing to promote into `scripts/shared/` (it carries no domain knowledge); it was left in place here because the requested change was scoped to geography.

---

## Data Contract (Components of Change)

The pipeline's output — `data/data-cleaned/components-of-change/ComponentsOfChange_Current.csv` — is the module's contract; changing it is an "ask first" action.

**Grain:** one row per `(Location, Year, Source)` — both `DoF` and `Census` rows can coexist for the same place and year.

**Geographic levels:** `County` (CA), `Region` (9 custom CA regions), `State` (California **and** every U.S. state, by two-letter abbreviation, from Census). National `States` data is Census-only.

**Year coverage:** 1991–present (currently through 2025).

**Columns** (output order, from `columns.get_columns_config()`):

```
Geographic Level, Location, Year,
Total Population, Percent Change in Population, Numeric Change in Population,
Births, Deaths, Natural Increase,
Net Migration, Net Foreign Immigration, Net Domestic Migration,
Crude Birth Rate, Crude Death Rate, Crude Migration Rate,
Crude Domestic Migration Rate, Crude Foreign Migration Rate, Source
```

The five `Crude … Rate` columns are per-1,000-population rates derived in `calculations/demographic_rates.py`.

---

## Frontend (Components of Change)

Same module-specific server pieces as PopHousing, with one extra dimension — **source** — feeding the same shared UI layer below.

### `lib/data/components_of_change.js` — data-access layer (server-only)
Owns reading, parsing, and filtering of the CSV (`node:fs`, never imported into a client component). Mirrors PopHousing's query shapes (`queryLineSeries`, `queryCategoryValues`, `queryTwoPeriod`, `queryMeasurePairs`, `queryMatrix`, `queryGeoValues`), each taking the extra `source` filter, via the shared `query_shapes.js`. Numeric columns, curated metrics, subsets, and sources are derived from [`lib/visualization/moduleSchemas/componentsOfChange.js`](../../../lib/visualization/moduleSchemas/componentsOfChange.js). Exports `AVAILABLE_PARAMETERS` / `AVAILABLE_MEASURES`, `AVAILABLE_SOURCES` (`DoF`, `Census`), `AVAILABLE_SUBSETS`, `SUBSET_TO_LEVELS`.

### `app/api/components-of-change/route.js` — API endpoint (orchestrator)
`GET /api/components-of-change` — the same `view`-based dispatcher as PopHousing, plus `source` validation (defaulting to `DoF`) and the rule that the `States` subset is **Census-only**. Errors carry a `source` string (`"components_of_change API: …"`).

The module reuses the entire UI layer below unchanged; its schema simply advertises `sources: ["DoF", "Census"]`, which makes the editor render a **Source** selector and gate silent source comparison (guardrail #6).

---

# The Demographic Projections Module

The **Age, Sex & Race Projections** module (directory name `demographic-projections`) is the **third dataset migrated**, and the first built **test-first**: its full unit-test suite existed before any implementation and was treated as the authoritative contract for every function. It projects California population by **age, sex, and race/ethnicity** forward to 2070, alongside recent national estimates.

It departs from the earlier modules in ways worth understanding before reading the code:

- **The legacy source was a class, not functions.** The V1 `projections_code.py` wrapped its whole ETL in a `Projections` class whose `__init__` ran the pipeline. This migration dissolves it into the standard three-layer worker/orchestrator shape; the stateful `self.Projections` cache becomes the contract CSV.
- **One measure, three extra stratification dimensions.** Every other module has many measures and few dimensions; this one has a single measure (`Population`) but adds **Age Group**, **Sex**, and **Race/Ethnicity** dimensions. The pipeline stores the base strata **plus** precomputed `All Ages` / `Both Sexes` / `All` aggregate rows so the API can pin one value per dimension without summing on every request.
- **Projections blended with estimates.** Like Components it keeps two sources side-by-side (`Source`), but here they differ in *kind*: DoF **P-3** is forward-looking projections (2020–2070); Census **cc-est** is backward-looking estimates (2020–2025). The frontend distinguishes them via `Source` so a projection is never mistaken for observed data.
- **High volume.** The P-3 source is far larger than anything the other modules handle (4.6M raw single-year-age rows). Ages are **binned to 5-year groups during cleaning** (a lossy sum), and the enriched contract is on the order of ~1.6M rows even DoF-only.
- **It saves incrementally**, like Components — writing only when new source data is detected.

## Sources & Pipeline

| Source | Provides | Cadence / coverage |
|---|---|---|
| **CA Dept. of Finance P-3** | California county population by age × sex × race7 (7 groups) | Periodic re-baseline; 2020–2070. Distributed as a **zip containing one CSV** (`fips, year, sex, race7, agerc, perwt`). |
| **U.S. Census cc-est** | 50-state population by age group × sex × race/ethnicity | Annual; 2020–2025. Official wide `CC-EST{VINTAGE}-ALLDATA` CSV, filtered to `SUMLEV=050` and summed to states. |

The entry point is [`scripts/orchestrators/projections_pipeline.py`](../../../scripts/orchestrators/projections_pipeline.py). `build_projections_dataset(config=None)` runs five phases, each wrapped so any exception re-raises as a **`ProjectionsPipelinePhaseError`** tagged with the phase name. It returns a summary dict: dataframe, per-source *new-data* and *fallback* flags, output path (`None` when nothing changed), and row count.

| Phase | Name | What happens | Primary modules |
|---|---|---|---|
| **1** | Setup & Load | Resolve config; load the existing canonical CSV as historical + fallback source. | `config/*`, `merging/historical_merge` |
| **2** | Acquisition (resilient) | Acquire each source through `acquire_with_fallback`: live discovery/download → manual raw CSV → last-saved rows. The P-3 downloader **extracts the CSV from the zip**; the DoF step has primary + positional URL-discovery strategies. Offline mode swaps live strategies for local-file ones (see caveats). | `acquisition/*`, `shared/downloads/http_downloads` |
| **3** | Cleaning | `clean_p3_projections` maps FIPS→county, decodes `race7`, **bins single-year ages to 5-year groups (summing `perwt`)**, standardizes sex, tags `Geographic Level = County`. `clean_census_estimates` filters `SUMLEV=050`, sums counties to the 50 states, reshapes wide→long, decodes year/age codes, tags `US State`. | `cleaning/*` (+ shared `race_ethnicity_mapping`, `age_group_standardizer`) |
| **4** | Merge & Aggregate | Validate each incoming source/year's **stratification completeness** before any atomic replacement; merge DoF + Census; build the 9 CA regions and the California state total by summing counties; add precomputed `All Ages` / `Both Sexes` / `All` rows; detect new data. | `merging/historical_merge`, `aggregation/regional_aggregation`, `aggregation/precomputed_totals` |
| **5** | Finalize, Validate & Save | Source-aware geographic-level assignment, enforce output column order, validate, and **archive + save only when new source data was detected**. | `output/finalize_dataset`, `validation/projections_validators` |

### Acquisition, offline mode & the source→clean seam (Phases 2–3)

`acquire_with_fallback` tries each live strategy, then a manually-placed raw CSV (`P-3_Downloaded.csv` / `cc-est_Downloaded.csv` under `data/data-raw/demographic-projections/`), then the rows already saved for that source. **Live and manual strategies yield a raw file *path* the cleaner reads; only the last-saved fallback returns an already-cleaned DataFrame** (paired with `source_failed=True` so the orchestrator skips re-cleaning it). `_clean_with_fallback` mirrors the ladder.

**Offline mode** — set `config={"offline": True}` or the env var `PROJECTIONS_OFFLINE=1` and the orchestrator swaps live network strategies for local-file strategies: DoF reuses an already-extracted `P*3*.csv` else extracts a local `*.zip`; Census reuses a local `cc-est*.csv`. This is how the pipeline runs with no network:

```bash
PROJECTIONS_OFFLINE=1 python -m scripts.orchestrators.projections_pipeline
```

Final validation's `expected_levels` is **derived from which sources actually succeeded**, so a single-source (e.g. offline DoF-only) run still validates instead of failing on the absent `US State` level.

---

## Module Reference (Demographic Projections)

Same layering as the other modules: `scripts/shared/` mechanisms → `scripts/projections/` domain packages → the orchestrator. Domain packages only:

#### `config/` — single source of truth
| Script | Public function |
|---|---|
| `paths.py` | `get_paths()` — current/historical/download/archive paths + `manual_dof_path` / `manual_census_path`. |
| `sources.py` | `get_source_settings()` — DoF/Census URLs, headers, timeout, cache/fallback ages, P-3 filename pattern, expected raw columns, and `dof_boundary_year` / `census_boundary_year`. |
| `schemas.py` | `get_schema_config()` — output/required columns, canonical age (18) / sex (2) / race (7) sets, the 58-county FIPS map, `race7` and Census race/year/age code maps, the 50 state names, age-bin edges, completeness grain, and cleaning/final validation configs. |

#### `acquisition/` — getting the two sources
| Script | Public functions |
|---|---|
| `dof_p3_downloader.py` | `get_p3_file_url`, `get_p3_file_url_positional`, `download_p3_data`, `extract_csv_from_zip`, `get_most_recent_p3_file`, `validate_p3_csv` (raw-header check catching duplicate columns before pandas mangles them). |
| `census_ccest_downloader.py` | `get_census_ccest_url`, `download_census_ccest`, `validate_ccest_headers`. |
| `source_fallback.py` | `acquire_with_fallback` — the *live → manual → saved* ladder (path for live/manual, DataFrame for saved). |

#### `cleaning/` — normalizing each source to the canonical schema
| Script | Public functions |
|---|---|
| `dof_p3_cleaner.py` | `map_fips_to_county`, `standardize_sex_labels`, `bin_single_year_ages`, `clean_p3_projections` (orchestrator). |
| `census_ccest_cleaner.py` | `parse_ccest_csv`, `aggregate_ccest_counties_to_states`, `rename_ccest_columns`, `reshape_ccest_to_long`, `clean_census_estimates` (orchestrator). |
| `race_ethnicity_mapping.py` | `get_canonical_race_groups`, `map_race_ethnicity`, `validate_race_mapping_completeness` (+ `P3_RACE7_CODE_MAP`) — shared by both cleaners. |
| `age_group_standardizer.py` | `get_canonical_age_groups`, `get_age_bin_edges`, `assign_age_group_from_single_year`, `standardize_age_group_labels`, `validate_age_group_completeness`. |

#### `merging/` · `aggregation/` — combining sources, rollups, and totals
| Script | Public functions |
|---|---|
| `merging/historical_merge.py` | `load_canonical_dataset`, `combine_source_with_historical` (atomic per-`(Source, Year)` replacement, gated on completeness), `detect_new_source_data`, `merge_dof_and_census`. |
| `aggregation/regional_aggregation.py` | `add_regional_data` (9 CA regions), `add_state_total` (California from 58 counties; skips a DoF state row that already exists, keeps a separate Census `US State` row). |
| `aggregation/precomputed_totals.py` | `add_all_ages_totals`, `add_both_sexes_totals`, `add_all_races_totals`, `build_precomputed_totals` (runs them in order so the grand total is correct). |

#### `validation/` · `output/` — gates and contract
| Script | Public functions |
|---|---|
| `validation/projections_validators.py` | `validate_cleaning_output`, `validate_projections_dataset`, `validate_stratification_completeness` (base age × sex × race matrix per `Geographic Level × Location × Year × Source`, excluding the `All …` aggregate rows so totals can't hide gaps). |
| `output/finalize_dataset.py` | `assign_geographic_level` (source-aware: California → `State` under DoF, `US State` under Census), `prepare_projections_output`, `archive_and_save` (byte-identical skip; `mm-dd-yy` archive timestamp). |

---

## Configuration Reference (Demographic Projections)

| Setting | Value | Source |
|---|---|---|
| DoF projections URL | `https://dof.ca.gov/forecasting/demographics/projections/` | `sources.py` |
| Census cc-est base URL | `https://www2.census.gov/programs-surveys/popest/datasets/` | `sources.py` |
| P-3 cache / fallback age | 90 days each | `sources.py` |
| cc-est cache age | 30 days | `sources.py` |
| P-3 filename pattern | `P-3_.+\.csv` | `sources.py` |
| DoF / Census boundary years | 2019 / 2019 (both series start 2020) | `sources.py` |
| Manual fallback filenames | `P-3_Downloaded.csv`, `cc-est_Downloaded.csv` | `paths.py` |
| Canonical age groups | 18 five-year groups (`0-4` … `85+`) | `schemas.py` |
| Race/ethnicity groups | White, Black, Asian, NHPI, AIAN, Multiracial, Hispanic | `schemas.py` |
| Valid geographic levels | County, Region, State, US State | `schemas.py` |
| Offline switch | `config={"offline": True}` or `PROJECTIONS_OFFLINE=1` | orchestrator |

The module sources its California county/region names from the shared [`california_geography`](../../../scripts/shared/geography/california_geography.py) provider; the 58-county **FIPS map** and the 50 U.S. state names are projections-specific and live in `schemas.py`.

---

## Data Contract (Demographic Projections)

The pipeline's output — `data/data-cleaned/demographic-projections/DemographicProjections_Current.csv` — is the module's contract; changing it is an "ask first" action.

**Grain:** one row per `(Geographic Level, Location, Year, Age Group, Sex, Race/Ethnicity, Source)`.

**Geographic levels:** `County` (58 CA), `Region` (9 custom CA regions), `State` (California, DoF), `US State` (50 states, Census). California occurs under both sources — as `State` (DoF) and `US State` (Census) — so level assignment uses **both** `Location` and `Source`.

**Year coverage:** DoF P-3 2020–2070; Census cc-est 2020–2025.

**Age-group storage:** the CSV stores the **18 five-year groups** (binned from single-year ages during cleaning), never single-year ages. Coarser presets (Under 18 / 18-25 / 26-64 / 65+) are summed **server-side in the API**, not stored.

**Aggregation rows:** the pipeline writes precomputed `All Ages`, `Both Sexes`, and `All` (race) rows so filtering never requires client-side summation.

**Columns** (output order, from `schemas.get_schema_config()`):

```
Geographic Level, Location, Year, Age Group, Sex, Race/Ethnicity, Population, Source
```

---

## Frontend (Demographic Projections)

Same module-specific server pieces as the others, plus **module-specific stratification filters** feeding the shared UI layer.

### `lib/data/demographic_projections.js` — data-access layer (server-only)
Owns reading/parsing/filtering of the CSV (`node:fs`). Every query pins one value per stratification dimension (defaulting to the precomputed `All Ages` / `Both Sexes` / `All` rows), then **sums to one `Population` per `(Location, Year)`** before shaping — so a single 5-year group, a precomputed aggregate, or an `ageGrouping` preset (summed from its 5-year bins) all reduce to a clean per-location series. Exposes `queryLineSeries`, `queryCategoryValues`, `queryTwoPeriod`, `queryMatrix`, `queryGeoValues` over the shared `query_shapes.js`. Numeric columns, subsets, sources, and the age presets derive from [`lib/visualization/moduleSchemas/demographicProjections.js`](../../../lib/visualization/moduleSchemas/demographicProjections.js).

### `app/api/projections/route.js` — API endpoint (orchestrator)
`GET /api/projections` — the same `view`-based dispatcher, plus the extra params `ageGroup`, `ageGrouping` (preset name or explicit 5-year list), `sex`, `raceEthnicity`, and `source`. It enforces the source↔subset rule (**US States is Census-only; CA county/region/state subsets are DoF-only**). Errors carry a `source` string (`"projections API: …"`).

### Module-specific sidebar filters
The schema advertises `filterDimensions` (Age Group / Sex / Race/Ethnicity, each with its API `param` and default) and a `subsetSource` map. These drive **schema-generic** additions to the shared editor: `chart-builder/ChartSidebar.js` renders a `StratificationFilters` control per dimension in the Data Sources section; `chart-builder/chartConfigStore.js` seeds their defaults; `chart-builder/chartData.js` appends them to the API request; and `chart-builder/EncodingSection.js` pins the source from `subsetSource` when the subset changes. All of this is a **no-op for modules that declare no `filterDimensions`** (PopHousing, Components), so nothing else changed behavior. The module is linked from `components/Navbar.js` and served by the existing dynamic `app/[module]/page.js` route (no per-module page code).

---

## Current-State Notes & Caveats (Demographic Projections)

The module is complete and runs end-to-end, but a few things about *today's* state are worth recording:

- **DoF-only until a Census file lands.** No `cc-est*.csv` is present in `data/data-raw/demographic-projections/`, so real runs produce **DoF P-3 only**: the `US State` level and Census years (2020–2025) are absent until a cc-est file (or `cc-est_Downloaded.csv` manual fallback) is added, after which the pipeline picks it up automatically. The verified end-to-end run wrote **1,581,408 rows (~82 MB)** and is idempotent on re-run ("No new data detected").
- **Integration gaps fixed after the first real run** (the mocked orchestrator tests had hidden them): the acquisition→cleaning **seam** now passes a *path* to cleaners (not a DataFrame); `sources.py` gained the `dof_boundary_year` / `census_boundary_year` keys the orchestrator reads; and `paths.py` manual-path keys were renamed to `manual_dof_path` / `manual_census_path` to match the orchestrator. The `test_source_fallback.py` contract was updated accordingly.
- **Run it as a module.** `python -m scripts.orchestrators.projections_pipeline` (the `Usage:` docstrings in all three orchestrators were corrected from the direct `python scripts/…py` form, which never worked with the repo's absolute imports).
- **Deferred bespoke presets.** The shared `presetRegistry` is intentionally module-agnostic (presets reference roles/kinds, never specific fields), so the doc's **age pyramid** (Age Group on an axis), **projection-vs-estimate** (Source series with a boundary annotation), and **overlay comparison** presets are **not implemented** — they would need per-module preset support. "Population by race over time" and "race composition map" are already achievable via the generic line/map presets plus the new race filter.
- **Contract size / performance.** The DoF-only contract is already ~1.6M rows and will grow substantially once Census is added. `loadProjectionsData()` parses the whole CSV into memory once per server process (the pattern that suits the other modules' ~20K rows); this is the first place to revisit if request latency or memory becomes a concern (streaming parse, typed arrays, or a binary build step).
- **Age-preset approximation.** The default coarse presets don't align with 5-year bin edges (18/25/26 vs 15/20/25/30); each maps to the nearest whole bins (the 15-19 bin counts as "Under 18", 20-24 as "18-25") — an inherent approximation the API documents.
- **cc-est reshape rule.** `reshape_ccest_to_long` treats a `TOT`-prefixed `_MALE/_FEMALE` column as an ignorable total but **raises** on any other unmapped race prefix; in the real flow this is moot because aggregation already narrows to the 14 canonical race×sex columns.
- **Archive location.** Prior contracts archive to `data/archive/demographic-projections/` (chosen for consistency with the other modules' `archive/`).

---

# The ACS Housing Stress Module

The **ACS Housing Stress** module (directory name `housing_stress`) is the **fourth dataset migrated** and the second built **test-first** — its full unit-test suite (132 tests) existed before any implementation. It measures **housing cost burden**: the number and share of households paying more than **30%** or **50%** of income on housing, split by **tenure** and by **race/ethnicity of householder**.

Things worth understanding before reading the code:

- **The legacy source was triplicated.** V1 `housingstress_code.py` built State, Region, and County datasets in three deeply-nested closures, each re-declaring its own `get_data`/`clean_data`/tenure math. The migration collapses this into **one shared code path**: aggregate estimate columns to the target geography first, then apply a single cost-burden transform.
- **One source, four measures, two extra dimensions.** The measures are a 2×2 of **basis** (Number vs Share) × **threshold** (30% vs 50%), derived from Census table **B25140** estimate columns; the extra dimensions are **Tenure** (5) and **Race/Ethnicity** of householder (9).
- **County & region are PUMA approximations.** The ACS 1-year file publishes California sub-state data at **PUMA** level; counties and regions are built by aggregating PUMAs through a 2020 crosswalk. PUMAs do not nest within county lines, so those figures are documented approximations — only the **State** series is an exact tabulation.
- **Race set reconciled toward the canonical 7.** The 9 ACS iterations map to the 7 canonical projection groups **plus** `Other` (some-other-race-alone) and `All` (the base table). `White` is sourced from iteration **H** (White, *not Hispanic*) so it never double-counts with `Hispanic`; iteration A is intentionally unused.
- **It saves incrementally**, writing only when new source data is detected.

## Sources & Pipeline

| Source | Provides | Cadence / coverage |
|---|---|---|
| **U.S. Census ACS 1-year, table B25140** (+ race iterations `B25140B`–`I`) | Households by tenure × cost-burden bracket, per race-of-householder iteration | Annual; **2012 onward, excluding 2020** (no 1-year release). Pipe-delimited `.dat` estimates joined to a `Geos*.txt` geography file on `GEO_ID`. |

The entry point is [`scripts/orchestrators/housing_stress_pipeline.py`](../../../scripts/orchestrators/housing_stress_pipeline.py). `build_housing_stress_dataset(config=None)` runs five phases, each wrapped so any exception re-raises as a **`HousingStressPipelinePhaseError`** tagged with the phase name. It returns a summary dict: dataframe, `new_data` / `source_failed` / `used_manual` flags, the resolved ACS vintage year, output path (`None` when nothing changed), and row count.

| Phase | Name | What happens | Primary modules |
|---|---|---|---|
| **1** | Setup & Load | Resolve config + shared geography; load the existing canonical CSV as historical + fallback. | `config/*`, `merging/historical_merge` |
| **2** | Acquisition (resilient) | **Resolve the latest published vintage** by probing backward from the current year (skipping 2020; advancing only on a "not published" 404, *raising* on a parse error so a malformed release isn't mistaken for an absent one). Then acquire two scopes — the 50 states and the CA PUMAs — each through `acquire_with_fallback` (live → manual raw CSV → last-saved rows). | `acquisition/*`, `shared/downloads/http_downloads` |
| **3** | Build levels | For each of the 9 race iterations: normalize columns, aggregate PUMAs→county/region (or filter to the 50 states), compute the 5 tenures' cost-burden measures, reconcile the race label, and tag `Geographic Level`. Validate each level. | `cleaning/*`, `geography/puma_aggregation`, `aggregation/geographic_levels` |
| **4** | Merge | Validate the incoming vintage's **stratification completeness**, atomically replace any overlapping year in full (no key-level vintage mixing), and detect new data. | `merging/historical_merge` |
| **5** | Finalize, Validate & Save | Enforce output column order + types, validate the final dataset, and **archive + save only when new data was detected**. | `output/finalize_dataset`, `validation/housing_stress_validators` |

### Vintage resolution & the shared cost-burden transform (Phases 2–3)

`resolve_latest_vintage` replaces the legacy bare-`except` year loop: it distinguishes "not yet published" (a 404, which steps to the previous year) from "published but malformed" (a parse error, which raises) — so the pipeline never silently serves a stale year. The single biggest de-duplication is `cost_burden_measures.compute_tenure_measures`: it expands each geography row into the 5 tenure rows and computes all four measures from the configured B25140 column formulas, replacing the three copy-pasted legacy blocks. A zero denominator yields **NA (never `inf`)**, passed through to the frontend as a chart gap.

---

## Module Reference (ACS Housing Stress)

Same layering as the other modules: `scripts/shared/` mechanisms → `scripts/housing_stress/` domain packages → the orchestrator. Domain packages only:

#### `config/` — single source of truth
| Script | Public function |
|---|---|
| `paths.py` | `get_paths()` — current/download/archive paths, the manual-fallback path, and both PUMA crosswalk paths. |
| `sources.py` | `get_source_settings()` — ACS data/geo URL patterns, `dataset="1"`, `earliest_year=2012`, `excluded_years={2020}`, `max_year_lookback`, the ordered 9 table iterations, and expected geo/estimate columns. |
| `schemas.py` | `get_schema_config()` — output/required columns, the 5 **tenure formulas** (B25140 numerator/denominator column lists), race iteration + reconciliation maps, the 50 state abbreviations (DC/PR excluded), completeness grain, and cleaning/final validation configs. |

#### `acquisition/` — getting the ACS Summary File
| Script | Public functions |
|---|---|
| `acs_sf_downloader.py` | `get_acs_table` (download `.dat` + geos, join on `GEO_ID`, filter to a state; `ACSTableUnavailableError` on 404 vs `ValueError` on a malformed file), `download_all_iterations` (9 iterations; suppressed non-base iterations are recorded, a missing base table raises). |
| `source_fallback.py` | `resolve_latest_vintage`, `acquire_with_fallback` (live → manual → last-saved ladder). |

#### `cleaning/` · `geography/` — normalizing and geographic rollup
| Script | Public functions |
|---|---|
| `cleaning/column_normalization.py` | `strip_table_prefix` (validated — catches missing/duplicate `E`-columns), `drop_margin_of_error_columns`, `rename_geography_columns`. |
| `cleaning/cost_burden_measures.py` | `compute_tenure_measures` — the shared tenure/burden transform (NA on zero denominator). |
| `cleaning/race_ethnicity_mapping.py` | `get_canonical_race_groups`, `reconcile_race_label` (+ `RACE_ITERATION_MAP`, `CANONICAL_RACE_GROUPS`). |
| `geography/puma_aggregation.py` | `extract_puma_id`, `aggregate_pumas_to_geography` (inner-join crosswalk, sum estimates), `map_region_ids_to_names`. |

#### `aggregation/` · `merging/` — levels, and combining with history
| Script | Public functions |
|---|---|
| `aggregation/geographic_levels.py` | `build_state_rows` (50 states, USPS abbreviation as Location), `build_region_rows` (9 CA regions), `build_county_rows` (58 CA counties), `build_all_levels` (concatenate + sort). Replaces the three legacy closures. |
| `merging/historical_merge.py` | `load_canonical_dataset`, `combine_with_historical` (validate-before-mutate; atomic whole-year replacement), `detect_new_data` (order/index-insensitive). |

#### `validation/` · `output/` — gates and contract
| Script | Public functions |
|---|---|
| `validation/housing_stress_validators.py` | `validate_cleaning_output`, `validate_stratification_completeness` (per `Geographic Level × Location × Year`; a missing **race** is a warning — ACS suppression is expected — but a missing **tenure** for a present race is an error), `validate_housing_stress_dataset`. |
| `output/finalize_dataset.py` | `prepare_output` (contract column order + types), `archive_and_save` (byte-identical skip; `mm-dd-yy` archive timestamp). |

---

## Configuration Reference (ACS Housing Stress)

| Setting | Value | Source |
|---|---|---|
| ACS data URL pattern | `…/summary_file/{year}/table-based-SF/data/1YRData/acsdt1y{year}-{tblid}.dat` | `sources.py` |
| ACS geo URL pattern | `…/summary_file/{year}/table-based-SF/documentation/Geos{year}1YR.txt` | `sources.py` |
| Earliest year / excluded years | 2012 / `{2020}` | `sources.py` |
| Cache age | 30 days | `sources.py` |
| Race iterations | 9 (`b25140` base + `b25140b…i`) | `sources.py` |
| Tenure labels | Total, Rented, Owned, Owned With Mortgage, Owned Without Mortgage | `schemas.py` |
| Race/ethnicity groups | All, White, Black, Asian, NHPI, AIAN, Multiracial, Hispanic, Other (9) | `schemas.py` |
| Valid geographic levels | State (50 US), Region (9 CA), County (58 CA) | `schemas.py` |
| State scope | 50 states; DC & PR excluded | `schemas.py` |

The module sources its California county/region names from the shared [`california_geography`](../../../scripts/shared/geography/california_geography.py) provider (the numeric 1–9 region ids map onto that region order); the two 2020 **PUMA crosswalks** live under `data/data-raw/housing-stress/`.

---

## Data Contract (ACS Housing Stress)

The pipeline's output — `data/data-cleaned/housing-stress/HousingStress_Current.csv` — is the module's contract; changing it is an "ask first" action.

**Grain:** one row per `(Year, Geographic Level, Location, Race/Ethnicity, Tenure)`.

**Geographic levels:** `State` (50 US states, USPS abbreviation as `Location`), `Region` (9 CA regions), `County` (58 CA counties). Region and County are PUMA-aggregation **approximations**.

**Year coverage:** 2012 through the latest published ACS 1-year vintage, **excluding 2020**.

**Measures:** `Number Over 30%`, `Number Over 50%` (household counts) and `Share Over 30%`, `Share Over 50%` (proportions, `NA` where the tenure denominator is zero). Missing race×location strata are **absent, not imputed** (ACS small-population suppression).

**Columns** (output order, from `schemas.get_schema_config()`):

```
Year, Geographic Level, Location, Race/Ethnicity, Tenure, Number Over 30%, Number Over 50%, Share Over 30%, Share Over 50%
```

---

## Frontend (ACS Housing Stress)

Same module-specific server pieces as the others, feeding the shared UI layer through two extra stratification filters and a measure selector.

### `lib/data/housing_stress.js` — data-access layer (server-only)
Owns reading/parsing/filtering of the CSV (`node:fs`). Pinning one race and one tenure already yields exactly one row per `(Location, Year)`, so — unlike Projections — **no cross-stratum summation** is needed; null shares pass through as gaps. `resolveMeasureColumn` maps an explicit `parameter` or a `basis`+`threshold` pair to one of the four measure columns. Exposes `queryLineSeries`, `queryCategoryValues`, `queryTwoPeriod`, `queryMatrix`, `queryGeoValues` over the shared `query_shapes.js`. Numeric columns, subsets, and the measure matrix derive from [`lib/visualization/moduleSchemas/housingStress.js`](../../../lib/visualization/moduleSchemas/housingStress.js).

### `app/api/housing-stress/route.js` — API endpoint (orchestrator)
`GET /api/housing-stress` — the same `view`-based dispatcher, plus the extra params `raceEthnicity`, `tenure`, `basis` (`number`/`share`), `threshold` (30/50), and `parameter`. Errors carry a `source` string (`"housing-stress API: …"`).

### Module schema, filters & built-in views
The schema declares four curated measures (counts and shares use distinct `comparisonGroup`s so they never share an axis) and `filterDimensions` for **Race/Ethnicity** and **Tenure** — the shared `ChartSidebar` renders these automatically (no per-module code). Registering it in `moduleRegistry.js` makes the `/housing-stress` editor and the `components/Navbar.js` tab work through the existing dynamic `app/[module]/page.js` route. Four **built-in views** in `categoryRegistry.js` (`housing-stress-share-trend`, `renter-cost-burden-trend`, `housing-stress-county-ranking`, `housing-stress-county-map`) provide curated starting points; the county ranking/map subtitles carry the PUMA-approximation caveat.

---

## Current-State Notes & Caveats (ACS Housing Stress)

The module is complete, its tests pass, and it has run end-to-end against live ACS. A few things about *today's* state are worth recording:

- **Verified run — latest vintage only.** `python -m scripts.orchestrators.housing_stress_pipeline` resolved vintage **2024** and wrote `HousingStress_Current.csv` (**4,525 rows**: State 50, County 58, Region 9 × 9 races × 5 tenures, minus ACS-suppressed strata), and is idempotent on re-run ("No new data detected"). The pipeline fetches **one vintage per run** and accumulates earlier years over successive runs, so the contract holds **2024 only** today.
- **Legacy 2012–2023 set aside.** A legacy-format `HousingStress_Current.csv` (old `Race/ethnicity`/`Label` columns, including forbidden 2020 rows) was sitting at the contract path and corrupted the merge; it was moved to `HousingStress_Current.legacy-2012-2023.csv.bak`. Bootstrapping that history into the V3 contract (rename + reconcile race labels, drop 2020, append) is a separate one-time migration, not yet done.
- **Two acquisition fixes made during the first real run** (the mocked orchestrator tests had hidden them, same pattern as Projections): (1) `resolve_latest_vintage` now advances past a **timeout/connection error**, not just a 404 — the Census server *hangs* rather than 404s for some not-yet-published vintages (e.g. 2026/2025), so a probe timeout must step to the previous year while a *parse* error still raises; (2) state acquisition now downloads each national `.dat` **once** via `download_national_table` and filters all 50 states in memory, instead of re-downloading it per state (was ~900 requests). `paths.py` also gained `manual_state_path` / `manual_ca_path` to match the orchestrator. Tests were added for all three.
- **County/region are approximate.** They come from PUMA aggregation (PUMAs cross county lines); only the State series is exact. A future move to ACS **5-year** county tables (direct `SUMLEV=050`) is recorded as an open option, not adopted.
- **Cross-module editor fix shipped alongside this module.** The shared chart editor kept the previous module's config when navigating between modules (all under `/[module]`), so arriving at a new module validated the old module's field bindings against the new schema and blocked every preset with a configuration error. Fixed by keying `<ChartConfigProvider>` on `moduleId` in `components/chart-builder/ModuleEditor.js` so the editor rebuilds a fresh config per module — a project-wide fix that benefits every module.
- **Full-suite test collection fixed.** Adding this module's tests surfaced a pre-existing pytest duplicate-basename collision; `__init__.py` package files were added across the `projections`, `components_of_change`, and `housing_stress` test trees (matching the pophousing convention). `python -m pytest scripts/unit_tests` is green (840 passed).
- **Landing surface deferred.** The module is reachable from the navbar and its built-in views, but it is **not** yet placed on a landing-page `CATEGORIES` card in `categoryRegistry.js` (a product/design decision).

---

## Frontend Architecture (UI Layer)

*Cross-module — every module renders through this shared layer; only the per-module data-access layer + API route (above) and the module schema differ.*

The site has **two pages**, both built from the shared layer:

| Page | Route | What it is |
|---|---|---|
| **Landing** | `/` (`app/page.js`) | A stack of **category dashboards** — one self-contained dashboard component per dataset category. |
| **Detailed module page** | `/[module]` (`app/[module]/page.js`) | The **chart editor**: a dynamic sidebar + a live chart canvas + saved views, for one module. |

A third, non-data page exists at `/ui-kit` (`app/ui-kit/page.js`, built from `components/ui-kit/`): a static **design-system showcase** of the PPIC palette, typography, components, and example charts. It is a reference surface, not part of the module data flow.

Three ideas hold it together:

- **A client-safe visualization layer** (`lib/visualization/`, no `node:fs`) is the single source of truth for fields, chart types, presets, transforms, validation, and category/built-in views. Both the browser and the server data modules import from it.
- **Declarative configs, not figures.** A chart is plain JSON (`{ module, preset, chartType, bindings, filters, period, labels, appearance, layers }`); `toPlotly` turns config + fetched data into Plotly props. Saved views store the config, never a rendered figure.
- **One server/client boundary.** `lib/data/*` (CSV / GeoJSON, `node:fs`) is server-only; `lib/visualization/*` is the client-safe seam the editor and dashboards import.

### The client-safe visualization layer (`lib/visualization/`)

| File                        | Responsibility                                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moduleSchemas/<module>.js` | The module's **field catalog**: each field's kind / unit / comparison group / allowed transforms / chart roles, plus curated metrics, subsets, sources, `yearRange`, canonical columns. Read by both the editor and the server data module. |
| `fieldTypes.js`             | Field vocabulary + helpers (`isMeasure`, `areComparable`, `allowedTransforms`, `supportsRole`).                                                                                                                                             |
| `chartRegistry.js`          | Per-chart-type descriptors: required/optional roles, role→kind constraints, sidebar sections, limits, defaults; `CATALOG_ROLE_FOR_BINDING`.                                                                                                 |
| `presetRegistry.js`         | Task-based presets ("Trend over time", "Latest-year ranking", …) → a chart type + default bindings + sidebar layout.                                                                                                                        |
| `transformRegistry.js`      | Pure series transforms (`actual`, `indexed`, `percentChange`, `percentagePointChange`, `differenceFromBenchmark`, …), gated by each field's allowed transforms.                                                                             |
| `validation.js`             | Bindings / comparability / complexity / geography-source checks → `{ level, code, message, suggestion }` findings (the guardrail enforcement point).                                                                                        |
| `formatters.js`             | Named value formatters (year, people, percent, …).                                                                                                                                                                                          |
| `toPlotly.js`               | The adapter: `(config + fetched data) → { data, layout, config }` for every chart type. Builds each layout from the shared `plotlyDefaults` tokens and rules.                                                                                |
| `plotlyDefaults.js`         | Shared Plotly defaults — the chart `config`, base-layout tokens (font, white surfaces, grid color), legend-placement rules (incl. the bottom-legend overlap anchor), and `wrapTitle`. Imported by both `toPlotly` and hand-built figures (the UI-kit showcase) so they render as one family. |
| `categoryRegistry.js`       | Landing **categories** and **built-in views** — the declarative configs the dashboard tiles and "See more" deep-links use.                                                                                                                  |

> [!flag] Plotly mutates `layout` in place
> Plotly's `cleanLayout` writes to the layout object it is handed (it normalizes `layout.font.color`, among others). Any **shared or frozen** default must therefore be spread into a fresh object **per layout** — `font: { ...PLOTLY_FONT }`, never `font: PLOTLY_FONT` — or Plotly throws *"Cannot assign to read only property 'color'"*. `react-plotly.js` swallows that error (no `onError` prop is passed), so the only visible symptom is a **blank chart**: the div has `data` but no `_fullLayout`/SVG. `toPlotly` makes this fresh copy; `plotlyDefaults.js` documents the rule beside `PLOTLY_FONT`.
> **Still outstanding (note, not fixed):** the `/ui-kit` `GraphsShowcase` reuses one module-level `baseLayout` (with nested `font`/`legend` objects) across its four charts, and Plotly mutates each chart's layout in place. It renders today only because those objects are not frozen — it is the same footgun and should build a fresh layout per chart.

### Detailed component map — what renders each thing, front and back

**Landing page (`/`)** — `app/page.js` renders one dashboard per live category via `components/landing/dashboards/` (a registry keyed by category id, so adding a category = add a dashboard component + a `categoryRegistry` entry).

| Displayed element | Front end | Back end / data source |
|---|---|---|
| Page → one dashboard per category | `app/page.js` → `getDashboard(category.id)` → `<…Dashboard>` | `categoryRegistry.CATEGORIES` (live vs coming-soon) |
| Dashboard container (title, description, grid) | `landing/DashboardShell.js` + `landing/dashboards/PopulationHousingDashboard.js` (async server component) | — (chrome) |
| Chart tile (preview + "See more") | `landing/ChartTile.js` → `charts/ChartPreview.js` → `toPlotly` → `charts/PlotlyChart.js` | built-in view config (`categoryRegistry`) → `chartData.loadChartData` → `/api/<module>` (+ `/api/geography` for maps) |
| Stat cards (population / household size / housing units) | `landing/StatCard.js` (server-rendered values) | `lib/data/pop_housing.js` `queryStatewideStats()` — latest State-level row |
| Region table | `landing/RegionTable.js` (uses `ui/table`) | `lib/data/pop_housing.js` `queryRegionTable()` — latest Region rows |
| "Coming soon" category cards | `app/page.js` + `ui/card`, `ui/badge` | `categoryRegistry` (status `coming-soon`) |

**Detailed module page (`/[module]`)** — `app/[module]/page.js` resolves the module schema, optionally hydrates a `?view=` deep-link, and renders `components/chart-builder/ModuleEditor.js` (config store + sidebar + canvas).

| Sidebar / canvas part | Front end | What it drives / where data comes from |
|---|---|---|
| Config state + validation | `chart-builder/chartConfigStore.js` (`useReducer` + context) | Holds the declarative config; re-runs `validation.js` on every change; feeds `seriesCount` back for complexity checks. |
| Preset picker | `chart-builder/PresetPicker.js` | `presetRegistry` → seeds chart type + bindings. |
| Chart-type select | `ChartSidebar.js` | `chartRegistry.CHART_TYPE_IDS`. |
| Data section (module, geographic level, **Year-range slider**) | `ChartSidebar.js` (`ui/select`, `ui/slider`) | `schema.subsets`, `schema.yearRange`; sets `filters.subset` + `period`. |
| Encodings (X / Y / series / color / size, "+ Add line") | `chart-builder/EncodingSection.js` | `chartRegistry` role constraints + `schema.fields` (only fields whose catalog allows the role). |
| Comparison (source, transform, base year, benchmark, Top N) | `chart-builder/ComparisonSection.js` | `schema.sources`, `transformRegistry` (allowed transforms per field). |
| Labels (title / subtitle / axes / legend / tooltip) | `chart-builder/LabelEditor.js` | Display-only overrides; never rewrite canonical field names (guardrail #1). |
| Appearance (legend, markers, orientation, color scale, **PPIC watermark**) | `ChartSidebar.js` (`ui/select`, `ui/switch`) | `config.appearance`; consumed by `toPlotly`. |
| Trace layers (selected places, benchmark, second source / measure, derived) | `chart-builder/LayerEditor.js` | Predefined layer types only (guardrail #2); validated in `validation.js`. |
| Validation notices | `chart-builder/ValidationNotice.js` (`ui/alert`) | `config.validation` from `validation.js`. |
| Saved views (Reset / Save / Export-Import / saved list) | `ChartSidebar.js` + `chart-builder/savedViews.js` | `localStorage` (`ppic.savedViews.v1`); serialize/deserialize the declarative config. |
| Chart canvas | `ModuleEditor.js` `ChartWorkspace` → `toPlotly` → `charts/PlotlyChart.js` | `chart-builder/chartData.js` `loadChartData` → `/api/<module>` (+ `/api/geography`); `loading / empty / invalid / error / ready` states. |

**Shared shell & rendering**

| Element | Front end | Notes |
|---|---|---|
| Masthead / nav | `components/Navbar.js` | Brand bar; Tailwind tokens + `lib/constants.js` palette. |
| Plotly wrapper | `charts/PlotlyChart.js` | `react-plotly.js` via `next/dynamic({ ssr: false })`; mobile mode-bar off. |
| Data fetching | `chart-builder/chartData.js` | Picks the `view` per chart type, fans out trace-layer requests in parallel, caches geometry client-side, returns `{ response, series, geometry }`. |
| Design system | `components/ui/*` + `app/globals.css` tokens | shadcn/Radix primitives; PPIC brand ramps + shadcn tokens drive the Tailwind v4 utilities. |

### Request flow (one chart)

```
editor edits config ──► chartConfigStore (revalidate) ──► chartData.loadChartData
        │                                                      │ picks view by chartType
        │                                                      ▼
        │                                    GET /api/<module>?view=…  (+ /api/geography)
        │                                                      │ server-only lib/data/* + query_shapes
        ▼                                                      ▼
   toPlotly(config + data + geometry) ──► { data, layout, config } ──► PlotlyChart
```

The same `loadChartData` + `toPlotly` path renders both the editor canvas and every landing dashboard tile (`ChartPreview`), so a built-in view and a user-built view differ only in **where the config comes from**, not in kind.

### Saved views & deep-links
A saved or built-in view is the declarative config serialized to JSON (guardrail #8 — never a rendered figure). The landing "See more" button links to `/[module]?view=<id>`, which the module page hydrates into the editor via the config store's `LOAD_VIEW`. Users export/import the same JSON (copy-paste) and save named views to `localStorage`.

---

## Conventions & Standards

*Project-wide — these apply to every module, not just PopHousing.*

### Python script conventions
Every `.py` file follows [`docs/agent/python_conventions.md`](../agent/python_conventions.md):

- **Header docstring** (required): `filename.py — purpose` (em dash), then *Data sources*, *Outputs*, *Usage*.
- **Section order**: docstring → imports (stdlib → third-party → local) → constants → helpers → core logic → CLI → `if __name__ == "__main__"`.
- **CLI**: `argparse` only; GNU long flags (`--states`, never `-s`); the main block is just parse + one call.
- **Docstrings**: one line per function; expand only for non-obvious params/returns.
- **Comments explain *why*, not *what*.** No commented-out code (git has history).
- `pathlib.Path` over `os.path`; `mkdir(parents=True, exist_ok=True)` before writing.

### Naming & data conventions
- Domain DataFrames are named descriptively (`housing_df` in PopHousing) or `df`; columns use their exact contract names (e.g. `"Total Population"`, `"Geographic Level"`).
- A module's categorical values (PopHousing's geographic levels) are always one of its canonical set.
- Regex file patterns are matched with `re.fullmatch` and treated as regexes, not globs.

### Linting
`ruff` with rule families `E`, `F`, `I` (import sorting); `target-version = py312`; `line-length = 250`.

### The dependency boundary (restated, because it matters)
- `scripts/shared/` may not import any module's domain package.
- Shared *mechanisms* take config as arguments; they never embed a dataset's columns or business rules. Shared *reference-data* providers (e.g. `geography/california_geography.py`) are the explicit exception — they own data multiple modules share and may name real places, reading only from `lib/`.
- One canonical implementation per policy within a module (in PopHousing: name standardization, geographic classification, housing formulas) — no duplicate copies across its sub-packages.
- Modules never import each other; shared needs go in `scripts/shared/` (a mechanism if generic, a reference-data provider if shared data).

### Working agreements (`AGENTS.md`)
- Make the smallest working change; match existing patterns; don't touch unrelated files.
- **Ask first**: new dependencies, editing `lib/config.py` or a module-specific root config, changing schemas/output formats, restructuring `scripts/` or `lib/`.
- **Never**: modify `Previous Tool/`, commit raw/cleaned data, rewrite working pipeline logic without instruction, or silence warnings with a blanket `warnings.filterwarnings("ignore")`.
- Run `python -m pytest` after backend changes.

---

## Error Handling & Failure Surfacing

The "identify the failure source" goal is implemented at every layer:

- **Pipeline** — each phase wraps its work and raises `PipelinePhaseError("Phase N failed: …")`; validation gates raise `ValueError` listing every failed check.
- **Acquisition** — typed errors (`E5DiscoveryError`, `HTTPDownloadError`) carry the exact failed assumption (which heading, which link, which network step), so when the DOF site changes the message points at the broken assumption.
- **Validation** — validators return `(is_valid, messages)` and let the caller decide severity; `messages` name the offending column, level, or value.
- **API** — error responses include a `source` string identifying the stage; the React layer renders that message to the user.

Validators **return structured results rather than printing**; only the orchestrator decides what is fatal. This keeps every check independently testable.

---

## Testing

*Project-wide standard; the current suite covers the PopHousing, Components of Change, and Demographic Projections modules.*

The pytest suite lives in `scripts/unit_tests/`, **mirroring the source tree** (each source file → a `test_{module}.py` in the same relative position). Full requirements are in [`PopHouse-Unit-Tests-Guide.md`](./PopHouse-Unit-Tests-Guide.md). Highlights:

- **Arrange → Act → Assert**, named `test_{function}_{scenario}` (scenario describes the *condition*, not the return value).
- `tmp_path` for all file I/O; small inline DataFrame fixtures; **no real network calls** (HTTP is mocked, with an autouse safety net that fails any accidental real request).
- Shared tests use generic data; pophousing tests use real geography — mirroring the source boundary.
- Error messages are part of the contract and are asserted directly.
- Config: `pyproject.toml` sets `pythonpath = ["."]` so tests import as `from scripts.shared.… import …`; `testpaths = ["scripts/unit_tests"]`. (This is also why orchestrators run as `python -m scripts.orchestrators.<name>` rather than by file path.)
- **Demographic Projections was written test-first** — its ~200-test suite (`scripts/unit_tests/projections/` + the orchestrator test) predated the implementation and defined the contract for every function.
- Run with `python -m pytest` (or `./.venv/bin/pytest -x` while developing).

---

## Implementation Status

**Project:** four modules (PopHousing, Components of Change, Demographic Projections, ACS Housing Stress) are active and run end-to-end. The rest of the legacy datasets are not yet migrated (see *Modules*). The cross-module `scripts/shared/` layer is now exercised by all four.

**Within PopHousing:** the **E-5 modern path and E-8 historical build are both implemented** end-to-end (acquisition → cleaning → merge → enrichment → validation → output), and the **frontend read path is complete**. The E-8 build (`pophousing/historical/*`, `acquisition/dof_historical_downloader.py`) reuses the canonical E-5 cleaning/classification/metric helpers rather than duplicating them, with mirrored unit tests.

**Within Components of Change:** the full pipeline, dual-source acquisition with fallback, data contract, API route, and charts are complete.

**Within Demographic Projections:** the full Python pipeline (config → acquisition → cleaning → merge → aggregation → validation → output), orchestrator, data contract, API route, module schema, data-access layer, and the module-specific stratification filter controls are complete, with a verified end-to-end run. It runs **DoF P-3 only** today (no Census cc-est file present), and the doc's bespoke chart-shape presets (age pyramid, projection-vs-estimate, overlay comparison) are deferred pending per-module preset support — see *Current-State Notes & Caveats (Demographic Projections)*.

**Within ACS Housing Stress:** the full Python pipeline (config → acquisition → cleaning + geography → build-levels → merge → validation → output), orchestrator, data contract, API route, module schema, data-access layer, the Race/Ethnicity + Tenure sidebar filters, four built-in views, and the navbar tab are complete, with 136 mirrored tests passing and a **verified end-to-end run** (vintage 2024, 4,525 rows). The contract holds the **latest vintage only** today (the pipeline fetches one vintage per run); the legacy 2012–2023 series was set aside pending a schema migration. Shipped alongside it: two acquisition robustness fixes (probe advances past Census-server hangs; download-once-per-table), a cross-module editor fix (`key={moduleId}` on `ChartConfigProvider`), and `__init__.py` package files that fix full-suite pytest collection — see *Current-State Notes & Caveats (ACS Housing Stress)*.

The remaining scaffolded-but-`TODO` surface is project-wide:

| Area | Scripts | Effect |
|---|---|---|
| **Logging** | `shared/logging/pipeline_logging.py`, `shared/logging/dataframe_logging.py` | The logging surface is defined but inert; orchestrators are structured to pass in a log directory once implemented. *(Cross-module — benefits every module.)* |

When implementing it, follow the dependency boundary and reuse shared helpers rather than writing duplicates.

---

## Extending the Project

### Add a new module (the main growth path)
Migrate another legacy dataset by reproducing PopHousing's shape — it is the worked template:

1. `scripts/<module>/` — domain packages (acquisition, cleaning, calculations, validation, output…), composing `scripts/shared/` helpers. Add generic helpers to `shared/` only if they carry no domain knowledge.
2. `scripts/orchestrators/<module>_pipeline.py` — a `main()` that sequences the phases and tags failures with a `PipelinePhaseError`-style wrapper.
3. `data/data-cleaned/<module>/<Dataset>.csv` — the module's data contract.
4. `lib/data/<module>.js` — a server-only access layer that loads/caches/queries the CSV.
5. `app/api/<module>/route.js` — a thin `view`-dispatching route over that layer (reuse `lib/data/apiParams.js`).
6. `lib/visualization/moduleSchemas/<module>.js` — the module's **field catalog**; registering it in `moduleRegistry.js` makes the `/[module]` editor work automatically (no per-module chart code). Optionally add built-in views in `categoryRegistry.js` and a dashboard component in `components/landing/dashboards/` to give the category a landing dashboard.
7. `scripts/unit_tests/<module>/` — mirrored tests, written alongside the code.

### Extend the PopHousing module
- **Add a chart/metric** — add (or mark `curated`) the field in the module's catalog `lib/visualization/moduleSchemas/pophousing.js`. That single source feeds both the server data layer's `NUMERIC_COLUMNS`/`AVAILABLE_MEASURES` and the editor's metric list — there is no separate client list to keep in sync.
- **Add a geographic grouping** — extend `subsets` in the module schema; ensure the level exists in the data contract.
- **Add a pipeline transformation** — write a worker in the right `pophousing/` package (or a generic helper in `shared/` if it carries no domain knowledge), then call it from the relevant phase in the orchestrator. Add the mirrored test first.
- **Change a Population & Housing column or schema** — update `lib/pophousing_config.py` / `schemas.py`, the data contract, and the frontend field catalog `lib/visualization/moduleSchemas/pophousing.js` (which derives `NUMERIC_COLUMNS`/curated metrics/canonical columns) together. This is an "ask first" change.

---

## The Documents Library & Markdown Renderer

The `/documents` section publishes this `docs/` library as a browsable, filterable
catalog (`app/documents/page.js`) whose cards are derived from each file's YAML
frontmatter (`lib/docs/documents.js`). Each document renders at `/documents/<slug>`
through a Markdown reader (`app/documents/[slug]/page.js` → `components/documents/`)
that reproduces the team's Obsidian formatting on the web:

- **Engine** — `react-markdown` with `remark-gfm` (tables, task lists, strikethrough,
  footnotes), `remark-math` + `rehype-katex` (LaTeX), `rehype-slug` (heading ids), and
  `rehype-raw`.
- **Callouts** — a custom `remarkCallouts` plugin renders Obsidian `> [!TYPE]`
  admonitions (including collapsible `+`/`-` and custom titles) via `Callout`.
- **Wikilinks & embeds** — a custom `remarkWikilinks` plugin resolves `[[doc]]` to
  internal links and `![[image.png]]` to images served by `app/api/doc-asset/route.js`.
- **Symbols** — a custom `remarkSymbols` plugin prettifies ASCII sequences
  (`->`→→, `>=`→≥, …).
- **Code blocks** — `CodeBlock` adds a language header, line numbers, and a copy button.
- **Table of contents** — `extractToc` + `DocTableOfContents` build an H1–H3 outline
  with scrollspy, matching the UI Kit's contents sidebar.

### Acknowledgements

Portions of the document renderer were inspired by the following Obsidian community
plugins; our implementations are independent reimplementations for the web:

- **Code block styling** — inspired by *Code Styler* by [Mayuran Visakan](https://github.com/mayurankv).
- **Symbol prettification** — inspired by *Symbols Prettifier* by [Florian Woelki](https://florianwoelki.com).
- **Math rendering** — inspired by *MathType* by [slateblua](https://slateblua.github.io).

---

## Typography — Serif Font

The global serif (`--font-serif`, used for headings, document titles, and the article reader) is **[Source Serif 4](https://fonts.google.com/specimen/Source+Serif+4)** — a transitional, variable serif (weight axis 200–900) loaded via `next/font/google` in `app/layout.js`. A variable weight axis matters here: static two-weight faces (e.g. Georgia) snap every requested weight to 400 or 700, collapsing the heading hierarchy; a variable serif renders intermediate weights (500/600/…) distinctly.
To change the serif, swap the `next/font/google` import in `app/layout.js` and update the `--font-serif` fallback stack in `app/globals.css`. Candidate serifs (all business/expressive):
- **[Source Serif 4](https://fonts.google.com/specimen/Source+Serif+4)** — transitional, **variable** (current).
- **[Domine](https://fonts.google.com/specimen/Domine)** — modern serif, weights 400–700 designed for body/headline legibility on screen.
- **[Roboto Serif](https://fonts.google.com/specimen/Roboto+Serif)** — modern, **variable**(multi-axis: weight, optical size, grade, width).
- **[Gelasio](https://fonts.google.com/specimen/Gelasio)** — transitional, **variable** metrically compatible with Georgia (drop-in replacement).
