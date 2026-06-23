
# Project Specification, Architecture & API Reference
Web **Visualizations** Project
Last Updated: June 23rd, 2026

---

A single reference for the **web-data-visualization** project: what it is, how the codebase is laid out, the architecture every data module follows, and the conventions every contributor is expected to follow.

The project is organized as a set of **data modules** — one per dataset — that each flow from a public data source through an ETL (**Extract-Transform-Load** — it's the scrape → clean → save data flow) pipeline to interactive charts on a shared website. **Population & Housing (PopHousing)** is the first module to be refactored from the legacy notebooks/Shiny app into this structure, and currently the only one. This document covers the project-wide scaffolding first, then uses PopHousing as the **reference implementation** that future modules should mirror.

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

A **module** is one dataset's full vertical slice: its ETL pipeline under `scripts/<module>/`, its cleaned-data contract under `data/data-cleaned/<module>/`, its data-access layer under `lib/data/`, its API route under `app/api/<module>/`, and its chart components under `components/charts/`. Project-independent machinery they all share lives in `scripts/shared/`.

| Module | Source | Status |
|---|---|---|
| **Population & Housing** (PopHousing) | CA Dept. of Finance E-5 (modern) + E-8 (historical) estimates | **Active** — first module migrated. Modern path complete; historical (E-8) build and logging still stubbed. |
| **Demographic Projections** | (legacy notebook dataset) | **Planned** — directories reserved under `data/data-raw/demographic-projections/` and `data/data-cleaned/demographic-projections/`; no pipeline yet. |
| *Remaining legacy datasets* | V1 notebooks | **Not started** — to be migrated into the same module shape. |

The rest of this document documents the **project-wide architecture and conventions** (which apply to every module), then **The PopHousing Module** as the concrete reference implementation.

---
## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS 4, Plotly.js via `react-plotly.js` |
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
│   ├── api/pophousing/route.js   ← GET /api/pophousing endpoint        (PopHousing)
│   ├── layout.js  page.js        ← root layout + landing page
│   └── globals.css
├── components/
│   ├── Navbar.js                 ← shared site shell
│   └── charts/
│       ├── LineChart.js              ← shared presentational Plotly wrapper
│       └── PopHousingLineSection.js  ← client section (controls + fetch)  (PopHousing)
├── lib/
│   ├── config.py                 ← shared project paths + generic HTTP defaults
│   ├── pophousing_config.py      ← PopHousing source of truth: geography, regions, columns
│   ├── constants.js              ← shared brand palette + Plotly color cycle
│   └── data/pop_housing.js       ← server-only data-access layer over the CSV  (PopHousing)
├── scripts/                      ← Python ETL (see Module Reference)
│   ├── shared/                   ← project-independent mechanisms (cross-module)
│   ├── pophousing/               ← California / E-5 / E-8 domain logic  (PopHousing module)
│   ├── orchestrators/            ← per-module pipeline sequencing
│   └── unit_tests/               ← pytest suite (mirrors source tree)
├── data/                         ← raw, cleaned, and archived data (git-ignored)
│   ├── data-raw/housing-population/             ← PopHousing raw E-5 workbooks
│   ├── data-cleaned/housing-population/PopHousing_Current.csv   ← PopHousing contract
│   ├── data-raw/demographic-projections/        ← reserved for the next module
│   ├── data-cleaned/demographic-projections/    ← reserved for the next module
│   └── archive/housing-population/
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
   │   lib/data/<module>.js ──► /api/<module> ──► React chart components │
   │   (reads + caches CSV)     (validates query)    (Plotly charts)     │
   │                                                                     │
   └─────────────────────────────────────────────────────────────────── ┘
```

For PopHousing the source is the DOF website, the contract is `PopHousing_Current.csv`, the access layer is `lib/data/pop_housing.js`, and the route is `/api/pophousing`.
### The three-layer backend

The `scripts/` tree enforces a strict separation that is the central architectural theme of the project. Each module's pipeline is split into the same three layers:

| Layer | Directory | Role | May import from |
|---|---|---|---|
| **Shared** | `scripts/shared/` | Project-*independent* mechanisms (file retention, HTTP, generic DataFrame ops, generic validators, logging). Used by **every** module. | stdlib, third-party only |
| **Domain** | `scripts/<module>/` (e.g. `pophousing/`) | Dataset-specific knowledge: schemas, geography/business rules, formulas, source-specific parsing, domain validation. | `scripts/shared/` |
| **Orchestration** | `scripts/orchestrators/` | One entry point per module; sequences the phases, handles logging and errors. Contains no transformation logic. | shared + that module's domain |

**The dependency direction is one-way and non-negotiable:**

```
shared helpers  →  <module> domain modules  →  <module> pipeline orchestrator
```

The rules that follow from it:

- `scripts/shared/` **must never import from** any module's domain package.
- Shared functions receive column names, mappings, paths, and thresholds **as arguments** — they never reach for a specific dataset's columns or business rules on their own. If a shared function "knows" a California county name, the boundary has leaked.
- Before writing a new domain helper, check whether a shared equivalent already exists. Duplicate implementations are only allowed when the behavior genuinely differs and cannot be expressed through arguments or callbacks — and the reason must be documented beside the specialized copy.
- Modules do not import each other's domain packages; anything two modules both need belongs in `scripts/shared/`.

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

One entry per script. Each entry gives the file's **role**, a short explainer of what it does and why it exists, and a table of its public functions. Roles: **Shared mechanism** (domain-free), **Domain worker** (one transformation), **Domain orchestrator** (sequences workers), **Config**, **Stub** (signatures present, body `TODO` — see *Implementation Status*).

The reading order follows the dependency direction: the cross-module `scripts/shared/` layer first (used by every module, documented here because PopHousing is its only consumer so far), then PopHousing's own domain packages that compose it, then the orchestrator that runs everything.

---
### `scripts/shared/` — project-independent mechanisms

These modules know nothing about California, housing, or the DOF. They take column names, paths, patterns, and thresholds **as arguments**. They are the reusable foundation the domain layer builds on.

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
`get_geography_config()` — county/region/town/ambiguous-name sets, the region→county mapping, name-standardization maps, the five valid geographic levels, the default level, and population thresholds for ambiguous classification.

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

#### [`acquisition/dof_historical_downloader.py`](../../../scripts/pophousing/acquisition/dof_historical_downloader.py) — *Stub*
Intended **E-8** historical workbook discovery/download: `get_historical_landing_page_urls`, `find_geography_workbook_url`, `download_historical_e8_files`. Bodies are `TODO`.

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

### `scripts/pophousing/historical/` — the E-8 build path *(all stubs)*

Scaffolded but not yet implemented. When built, these turn raw E-8 workbooks into the historical dataset Phase 4 consumes, reusing the same cleaning/classification/metric helpers as the E-5 path (no duplicate logic).

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
> `paths.get_paths()` currently points both `historical_data_path` and `current_data_path` at the same file (`PopHousing_Current.csv`). The dedicated E-8 historical-build pipeline that would populate a separate historical source is still stubbed, so Phase 4 reads historical rows from the current output. Revisit this when the `historical/` modules are implemented.

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

## Frontend

PopHousing's read path: a thin, three-tier path mirroring the backend's worker/orchestrator split. Each module supplies its own access layer, route, and chart section; `LineChart`, `Navbar`, and `lib/constants.js` are shared across modules.

### `lib/data/pop_housing.js` — data-access layer (server-only)
Owns all reading, parsing, and filtering of the CSV. **Uses `node:fs`, so it must never be imported into a `"use client"` component.**

- `loadPopHousingData()` — reads and parses the CSV **once per server process** and caches the rows (`cachedRows`).
- `queryLineSeries({ parameter, subset, locations, startYear, endYear })` — geo-level filter → optional location filter → year filter → one `{location, years, values}` series per location, plus the observed `yearRange`.
- `getAvailableLocations(subset)` — distinct, sorted locations for a subset.
- Exports `AVAILABLE_PARAMETERS`, `AVAILABLE_SUBSETS`, `SUBSET_TO_LEVELS`.

A deliberately minimal CSV parser (`split(",")`) is used instead of a dependency, justified by the dataset's fixed, comma-free schema.

### `app/api/pophousing/route.js` — API endpoint (orchestrator)
`GET /api/pophousing` — validates query params and delegates to the data module. **No transformation logic of its own.**

| Param | Required | Meaning |
|---|---|---|
| `parameter` | yes | Metric column (must be in `AVAILABLE_PARAMETERS`). |
| `subset` | yes | Geographic grouping (`Regions`, `Counties`, `Cities`, `Towns`, `State`). |
| `locations` | no | Comma-separated location filter. |
| `startYear` / `endYear` | no | Integer year bounds. |

Responses identify their failure source per the project goal: `400` with `source: "pop_housing API: parameter validation"` on bad input, `500` with `source: "pop_housing API: data load / query"` on a load/query error. Success returns `{ parameter, subset, series, yearRange }`.

### React components
| Component | Role |
|---|---|
| `charts/PopHousingLineSection.js` | Client component: metric + location-preset controls, fetches `/api/pophousing`, manages `loading / ready / empty / error` states (errors render the message from the API). |
| `charts/LineChart.js` | Presentational, props-driven Plotly wrapper. One trace per series, colored from `BASE_PLOTLY_COLORS`. Plotly is dynamically imported with `ssr: false`. |
| `Navbar.js` / `app/page.js` / `app/layout.js` | Shell and landing page. |

`lib/constants.js` holds the brand palette (`COLORS`) and the Plotly color cycle — the single styling source for charts.

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
- Shared functions take config as arguments; they never embed a dataset's columns or business rules.
- One canonical implementation per policy within a module (in PopHousing: name standardization, geographic classification, housing formulas) — no duplicate copies across its sub-packages.
- Modules never import each other; shared needs go in `scripts/shared/`.

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

*Project-wide standard; the current suite covers the PopHousing module.*

The pytest suite lives in `scripts/unit_tests/`, **mirroring the source tree** (each source file → a `test_{module}.py` in the same relative position). Full requirements are in [`PopHouse-Unit-Tests-Guide.md`](./PopHouse-Unit-Tests-Guide.md). Highlights:

- **Arrange → Act → Assert**, named `test_{function}_{scenario}` (scenario describes the *condition*, not the return value).
- `tmp_path` for all file I/O; small inline DataFrame fixtures; **no real network calls** (HTTP is mocked, with an autouse safety net that fails any accidental real request).
- Shared tests use generic data; pophousing tests use real geography — mirroring the source boundary.
- Error messages are part of the contract and are asserted directly.
- Config: `pyproject.toml` sets `pythonpath = ["."]` so tests import as `from scripts.shared.… import …`; `testpaths = ["scripts/unit_tests"]`.
- Target: ~100 tests across Phases 1–5; run with `python -m pytest` (or `./.venv/bin/pytest -x` while developing).

---

## Implementation Status

**Project:** one module (PopHousing) is active; the rest of the legacy datasets are not yet migrated (see *Modules*). The cross-module `scripts/shared/` layer exists and is exercised by PopHousing.

**Within PopHousing:** the **modern E-5 path is fully implemented** end-to-end (acquisition → cleaning → merge → enrichment → validation → output) and the **frontend read path is complete**. These are scaffolded with signatures but `TODO` bodies:

| Area | Scripts | Effect |
|---|---|---|
| **E-8 historical build** | `pophousing/historical/*`, `acquisition/dof_historical_downloader.py` | The pipeline cannot yet *build* the historical dataset from raw E-8 workbooks; Phase 4 reads historical rows from the existing `PopHousing_Current.csv`. |
| **Logging** | `shared/logging/pipeline_logging.py`, `shared/logging/dataframe_logging.py` | The logging surface is defined but inert; orchestrators are structured to pass in a log directory once implemented. *(Cross-module — benefits every future module.)* |

When implementing these, follow the dependency boundary and reuse the canonical cleaning/classification/metric helpers rather than writing duplicates.

---

## Extending the Project

### Add a new module (the main growth path)
Migrate another legacy dataset by reproducing PopHousing's shape — it is the worked template:

1. `scripts/<module>/` — domain packages (acquisition, cleaning, calculations, validation, output…), composing `scripts/shared/` helpers. Add generic helpers to `shared/` only if they carry no domain knowledge.
2. `scripts/orchestrators/<module>_pipeline.py` — a `main()` that sequences the phases and tags failures with a `PipelinePhaseError`-style wrapper.
3. `data/data-cleaned/<module>/<Dataset>.csv` — the module's data contract.
4. `lib/data/<module>.js` — a server-only access layer that loads/caches/queries the CSV.
5. `app/api/<module>/route.js` — a thin validating route over that layer.
6. `components/charts/` — a client section + reuse of the shared `LineChart`.
7. `scripts/unit_tests/<module>/` — mirrored tests, written alongside the code.

### Extend the PopHousing module
- **Add a chart/metric** — extend `AVAILABLE_PARAMETERS` in `lib/data/pop_housing.js` (and the mirrored client list in `PopHousingLineSection.js`); reuse `LineChart` or add a presentational component beside it.
- **Add a geographic grouping** — extend `SUBSET_TO_LEVELS`; ensure the level exists in the data contract.
- **Add a pipeline transformation** — write a worker in the right `pophousing/` package (or a generic helper in `shared/` if it carries no domain knowledge), then call it from the relevant phase in the orchestrator. Add the mirrored test first.
- **Change a Population & Housing column or schema** — update `lib/pophousing_config.py` / `schemas.py`, the data contract, and the frontend `NUMERIC_COLUMNS` set together. This is an "ask first" change.
