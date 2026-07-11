---
Topic: Housing
Content Type: refractor guide
pinned: false
description: "As-built guide to the refactored ACS Housing Stress (cost-burden) V3 pipeline: a non-technical overview of what it produces and how the five phases run, followed by a per-function programmer reference with legacy lineage. Covers the single ACS 1-year B25140 source, PUMA-based county/region aggregation, and the tenure/cost-burden math."
Date Published: June 30, 2026
Last Updated: 07/11/2026 - 10:45 AM
Status: Finalized
---

# ACS Housing Stress Refractor Guide

> [!info] How to read this document
> This guide has two halves. The **first half** is for non-technical readers: it explains what the module produces, where the data comes from, the shape of the output dataset, and how the pipeline runs from raw download to saved CSV, phase by phase. The **second half** is a programmer reference: it walks every script and function, notes the libraries and performance choices, and records which piece of the legacy `housingstress_code.py` each function was derived from. The document describes the code **as it is actually built** in `scripts/housing_stress/` and `scripts/orchestrators/housing_stress_pipeline.py`, not a plan of what should be built. The original migration plan (with its proposed signatures and sequencing) is preserved in this file's git history. Related module guides: [[age-sex-race-projections-refractor]], [[components-of-change-refractor]], [[pophousing-pipeline-refractor]], [[projectSpec]].

---

## What the Module Produces

The pipeline builds one file: `data/data-cleaned/housing-stress/HousingStress_Current.csv`. It measures **housing cost burden** ("housing stress") - the number and share of households that pay more than 30% or 50% of their income on housing - broken out by **location, year, race/ethnicity of householder, and tenure** (renter vs. owner). A verified live run against ACS vintage 2024 wrote 4,525 rows (50 states + 58 CA counties + 9 CA regions, times 9 race categories and 5 tenures, minus small-population suppressed strata).

Two things about the data are worth stating up front:

- **The contract holds one vintage per run.** The pipeline fetches the single newest ACS 1-year vintage each time it runs and merges it into whatever history is already saved. The full "2012 through latest" series accumulates only by running the pipeline repeatedly over time (or by bootstrapping older years) - a fresh build on an empty file produces a single-year dataset. See Flagged Issues.
- **County and region numbers are approximate.** California counties and regions are built by aggregating PUMA-level estimates through a 2020 crosswalk. PUMAs do not nest inside county lines, so those figures are approximations; the state series is exact.

The refactor dissolved the legacy module's three near-identical geographic builders (`build_state_dataset`, `build_region_dataset`, `build_county_dataset`) - each of which re-declared its own download/clean/measure closures - into one shared code path, and it decoupled saving from charting (the legacy code only wrote the CSV as a side effect of rendering a chart). Charting moved entirely to the shared React frontend.

---

## Data Sources

One external source feeds the module:

| Source | Format | Geography | Years |
|---|---|---|---|
| U.S. Census Bureau **ACS 1-year table-based Summary File**, table **B25140** ("Tenure by Housing Costs as a Percentage of Household Income") plus its race iterations `B25140B`-`B25140I` | Two pipe-delimited files per (table, year): a `.dat` estimates file and a `Geos{year}1YR.txt` geography lookup, joined on `GEO_ID` | 50 US states, plus CA PUMAs aggregated to 58 counties and 9 regions | 2012 onward, **with a permanent gap at 2020** (ACS released no standard 1-year estimates that year) |

Nine table iterations are consumed. The base table (`b25140`) supplies the pre-aggregated "All" row; the eight suffixed tables supply the race categories. One deliberate choice is preserved from the legacy code: iteration **H** ("White alone, *not* Hispanic") is used for "White" instead of iteration **A** ("White alone", which includes Hispanic White), so that "White" and "Hispanic" do not double-count.

The source is acquired through a **three-step fallback cascade** (live download, then a manual CSV, then last-saved rows) - though, as noted in Flagged Issues, only the live tier currently feeds cleanly into the build step.

---

## The Dataset: Grain, Columns, and Geography

**Grain:** one row per `(Year, Geographic Level, Location, Race/Ethnicity, Tenure)`.

**Columns (in output order):**

| Column | Meaning |
|---|---|
| `Year` | Integer (2012+, never 2020) |
| `Geographic Level` | `State`, `Region` (9 CA regions), or `County` (58 CA counties) |
| `Location` | Two-letter USPS abbreviation for states, region name, or county name |
| `Race/Ethnicity` | One of 9: `All`, `White`, `Black`, `Asian`, `NHPI`, `AIAN`, `Multiracial`, `Hispanic`, `Other` |
| `Tenure` | `Total`, `Rented`, `Owned`, `Owned With Mortgage`, `Owned Without Mortgage` (renamed from the legacy `Label`) |
| `Number Over 30%` / `Number Over 50%` | Integer count of households paying >30% / >50% of income on housing |
| `Share Over 30%` / `Share Over 50%` | Proportion (0-1) of the tenure denominator; `NA` when the denominator is zero |

**Race reconciliation.** The 9 ACS iterations are reconciled toward the 7 canonical projections groups where the mapping is clean, plus two module-specific extras that have no projections counterpart: **"Other"** (some other race alone) and **"All"** (the base-table total). "All" is a *stored base row* from the un-suffixed table, **not** a sum of the race iterations - the iterations overlap and undercount by design, so summing them would not reproduce "All". Two semantic caveats are surfaced to the frontend: ACS "Multiracial" is two-or-more races of *any* ethnicity (projections defines it as non-Hispanic), and "Other" must never be folded into "Multiracial".

**Missing strata are absent, not imputed.** When ACS suppresses a race iteration for a small-population location-year, that `(Year, Location, Race)` group simply does not appear. Validation reports a missing *race* as a warning (suppression is expected) but a missing *tenure* for a race that is present as an error (the cost-burden math should always yield all five tenures).

---

## How the Pipeline Runs: Five Phases

The orchestrator `build_housing_stress_dataset()` runs five phases. Each is wrapped so any exception re-raises as a `HousingStressPipelinePhaseError` tagged with the phase name.

### Phase 1 - Setup and Load

Resolve the three config dicts (`paths`, `sources`, `schemas`) and the shared California geography, and read the existing contract CSV once into a `historical` frame.

### Phase 2 - Acquisition

First, **resolve the latest vintage**: probe backward from the current calendar year (skipping 2020) until the base `b25140` table for California downloads and parses. Then acquire two scopes with fallback:

- **State scope:** download each iteration's national `.dat` once and keep the state-summary rows (`GEO_ID` prefix `0400000US`) - not one request per state.
- **CA scope:** download each iteration filtered to California (its PUMA rows feed the county and region rollups).

Each scope has its own manual-CSV and last-saved fallback and its own `source_failed` / `used_manual` flag.

### Phase 3 - Build Levels

`build_all_levels` runs the one shared code path three times, differing only in the geography step:

- **State:** filter to the 50 state abbreviations (DC and PR excluded), use the USPS abbreviation as `Location`.
- **Region / County:** extract PUMA ids from `GEO_ID`, aggregate estimates to the target geography via the 2020 crosswalk, map region ids 1-9 to names.

After the geography step, all three apply the identical transforms: normalize columns, compute the tenure cost-burden measures, reconcile race labels, and stamp the year and geographic level. The three level-frames are concatenated and sorted.

### Phase 4 - Merge

Validate the incoming vintage's stratification completeness, then atomically replace any overlapping historical year (drop every historical row whose year is in the incoming frame, append the incoming rows whole - never a key-level upsert), and detect whether the merged result differs from history.

### Phase 5 - Finalize and Save

Enforce contract column order and types, run final validation (required columns, row-count bounds, all three levels present, year range and excluded-year checks, non-negative counts, shares in [0, 1], no duplicate keys), and - only if new data was detected - archive the prior file with a timestamp and write the new CSV.

---

## Key Calculations

**The cost-burden measures.** For each of five tenures, four measures are derived from the B25140 estimate columns `E001`-`E013`. The column semantics (from the B25140 data dictionary) are configured once in `schemas.py` rather than hard-coded three times as in the legacy module:

| Tenure | Number Over 30% | Number Over 50% | Denominator (for Share) |
|---|---|---|---|
| Total | `E003 + E007 + E011` | `E004 + E008 + E012` | `E001` |
| Rented | `E011` | `E012` | `E010` |
| Owned | `E003 + E007` | `E004 + E008` | `E002 + E006` |
| Owned With Mortgage | `E003` | `E004` | `E002` |
| Owned Without Mortgage | `E007` | `E008` | `E006` |

`Share Over 30%` = `Number Over 30% / Denominator` (and likewise for 50%). A **zero denominator yields `NA`, not infinity** - division-by-zero is handled explicitly (`np.errstate` + a `.where(denominator != 0)` mask) instead of being suppressed by the legacy global `warnings.filterwarnings("ignore")`.

**PUMA aggregation (the approximate step).** County and region estimates are built by inner-joining PUMA rows to the 2020 crosswalk on `PUMA_ID` (unmatched PUMAs drop, matching legacy behavior) and summing the estimate columns by target geography *before* the tenure math runs. Because a PUMA straddling two counties is assigned wholesale to one, county and region figures are approximations.

**Vintage resolution.** Unlike the legacy bare-`except` probe that decremented the year on *any* error, `resolve_latest_vintage` distinguishes "not published" (a 404, or a Census host that hangs) from "published but malformed" (a parse `ValueError`, which propagates rather than silently skipping the year).

---

## Architecture and Boundaries

The module follows the standard three-layer V3 shape:

- **Shared layer** (`scripts/shared/`) - HTTP downloads, California geography (canonical county/region names + region ordering), generic DataFrame validators. Never imports anything housing-stress-specific.
- **Domain layer** (`scripts/housing_stress/`) - config, acquisition, cleaning, geography, aggregation, merging, validation, and output.
- **Orchestrator** (`scripts/orchestrators/housing_stress_pipeline.py`) - wires the domain modules into the five phases and owns the fallback logic.

The dependency direction is strict: shared -> housing_stress -> orchestrator. There is **no Python visualization layer** - the legacy `visualize_line/bar()` methods (which also triggered the save as a side effect) were dropped in favor of the shared React charting UI. The frontend triad (`lib/visualization/moduleSchemas/housingStress.js`, `lib/data/housing_stress.js`, `app/api/housing-stress/route.js`) only ever *reads* the contract CSV and is described at the interface level in the second half.

---

## Technical Reference

The rest of this document is a per-script, per-function reference, organized by phase with configuration and shared helpers first. The legacy source is the flat function collection in `Visualization Tool/ACS-Housing-Stress/housingstress_code.py`; "derived from" points at the legacy function or inline block that motivated each function.

---

## Configuration Modules

### `scripts/housing_stress/config/paths.py`

**`get_paths()`** - builds every path from `lib.config.get_project_paths()`: the cleaned/raw/archive directories under `housing-stress/`, the contract path `HousingStress_Current.csv`, the two scope-specific manual-fallback paths (`HousingStress_States_Downloaded.csv`, `HousingStress_CA_Downloaded.csv`), and the two PUMA crosswalk paths (`puma_counties_xwalk_2020.csv`, `puma_regions_xwalk_2020.csv`). Returns `pathlib.Path` objects.

> Note: `historical_data_path` is set equal to `current_data_path`. See Flagged Issues.

*Legacy lineage:* replaces the hard-coded `R:\UCF\...` Windows paths for the historical CSV, crosswalks, and archive.

### `scripts/housing_stress/config/sources.py`

**`get_source_settings()`** - returns the ACS `.dat` and `Geos` URL patterns (templated on `{year}` and `{tblid}`), the dataset code `"1"`, HTTP headers/timeout, `earliest_year` (2012), `excluded_years` (`{2020}`), `max_year_lookback` (**3**), the ordered 9-iteration table map, and the expected geo/estimate column lists. Owns the `_TABLE_ITERATIONS` map (with iteration "a" deliberately omitted).

*Legacy lineage:* consolidates the URL literals and the year-fallback bounds scattered through the legacy `get_data()` copies.

### `scripts/housing_stress/config/schemas.py`

Owns the reference constants and one accessor:

- `_TENURE_FORMULAS` - the numerator/denominator column lists for all five tenures (the table above), configured once.
- `_RACE_ITERATION_MAP` (table id -> canonical label) and `_RACE_RECONCILIATION_MAP` (raw legacy label -> canonical label), the 9 `_CANONICAL_RACE_GROUPS`, the 50 `_STATE_ABBREVIATIONS`, and `_EXCLUDED_STATE_AREAS` (`{"DC", "PR"}`).
- **`get_schema_config()`** - assembles all of the above plus the cleaning- and final-validation config blocks into one dict consumed by cleaning, geography, validation, and output.

*Legacy lineage:* replaces the three inline copies of the tenure/burden formulas and the `table_id_to_race_dict`.

---

## Shared Helpers Reused

- **`scripts/shared/geography/california_geography.py` -> `get_california_geography()`** - supplies `regions_mapping` (used to build the 1-9 region-id -> region-name map by enumeration order) and canonical names, so the 9 regions are not re-hardcoded.
- **`scripts/shared/downloads/http_downloads.py` -> `fetch_response`, `HTTPDownloadError`** - used by the downloader for the `.dat` and `Geos` fetches.
- **`scripts/shared/validation/dataframe_validators.py` -> `validate_required_columns`, `validate_null_counts`, `validate_numeric_range`, `find_duplicate_rows`** - composed by the housing-stress validators.

---

## Phase 1: Setup and Load

- **`load_canonical_dataset(current_data_path)`** (`merging/historical_merge.py`) - reads the contract CSV, or returns an empty DataFrame with the 9 contract columns if absent. *Derived from* the history-load at the top of legacy `combine_with_historical()`.
- **Orchestrator helper** `_saved_rows_for_levels(historical_df, levels)` filters saved history to a set of geographic levels (used as the last-saved fallback source).

---

## Phase 2: Acquisition

### `scripts/housing_stress/acquisition/acs_sf_downloader.py`

- **`ACSTableUnavailableError`** - signals "not published" (404 / missing file), distinct from a parse failure.
- **`_is_missing_file_error(error)`** - inspects an `HTTPDownloadError` message for "404" / "Not Found".
- **`_read_pipe_delimited(content)`** - `pd.read_csv(io.BytesIO(content), sep="|", index_col="GEO_ID")`.
- **`download_national_table(tblid, year, dataset, source_settings, headers, timeout)`** - fetches the national `.dat` and the `Geos` lookup, joins them on `GEO_ID`, and returns **all** rows. Raises `ACSTableUnavailableError` on a missing file (so the caller can step back a year) but `ValueError` on a present-but-malformed file (missing geo columns), so a real defect is never mistaken for "not published". *This is the key dedup* - it downloads each table once nationally, and callers filter it (one state, 50 states, or CA PUMAs) in memory.
- **`get_acs_table(...)`** - thin wrapper that keeps only rows for one `STUSAB`. *Derived from* legacy `get_data()`.
- **`download_all_iterations(year, dataset, state, ...)`** - loops the 9 iterations, calling `get_acs_table` for each; records a suppressed non-base iteration in `missing_iterations` and skips it, but raises if the base table is missing. Returns `(frames, missing_iterations)`. *Derived from* the legacy per-iteration loops inside the three builders.

### `scripts/housing_stress/acquisition/source_fallback.py`

- **`resolve_latest_vintage(state, source_settings, headers, timeout, max_year_lookback, excluded_years)`** - probes backward from `datetime.now().year`, skipping `excluded_years`, accepting the first year whose base table downloads and parses. Advances on both `ACSTableUnavailableError` **and** a transient `HTTPDownloadError` (the Census host *hangs* rather than 404s for some unpublished vintages), but lets a parse `ValueError` propagate. Raises if nothing is found in the window. *Derived from* the legacy bare-`except` year-decrement loop, with the "not published vs. malformed" distinction added.
- **`acquire_with_fallback(live_download_fn, manual_path, saved_rows_fn)`** - tries the live download, then `pd.read_csv(manual_path)`, then `saved_rows_fn()`, returning `(raw, source_failed, used_manual)`. *Derived from* the legacy inline fallback. See Flagged Issues: the manual and saved tiers return contract-shaped frames that the Phase 3 builder cannot consume.

---

## Phase 3: Cleaning and Geographic Aggregation

### `scripts/housing_stress/cleaning/column_normalization.py`

- **`strip_table_prefix(df)`** - strips the `B25140xxx_` prefix via `str.replace(r"^.*_", "")`, then **validates** that each expected `E001`-`E013` column is present exactly once (raises otherwise) - hardening the fragile legacy regex.
- **`drop_margin_of_error_columns(df)`** - drops columns matching exactly `M\d{3}` (keeps `MARGIN_NOTE` etc.).
- **`rename_geography_columns(df, geography_names)`** - renames `NAME`/`STUSAB` to the pipeline's location/state columns.

*Legacy lineage:* replaces the inline `df.columns.str.replace(...)` prefix strip and MOE drop.

### `scripts/housing_stress/cleaning/cost_burden_measures.py`

- **`compute_tenure_measures(df, id_columns, schema_config)`** - the single shared implementation of the tenure math (the biggest dedup in the module). For each of the five tenures it sums the configured numerator/denominator columns, divides for the shares under `np.errstate(divide="ignore", invalid="ignore")`, masks zero-denominator shares to `NA`, and stacks one block per tenure. Raises if any formula-referenced estimate column is absent. Uses `numpy` + `pandas`. *Derived from* the tenure/burden math copy-pasted into all three legacy builders.

### `scripts/housing_stress/cleaning/race_ethnicity_mapping.py`

- **`get_canonical_race_groups()`** and **`reconcile_race_label(df, race_column, reconciliation_map)`** (maps raw iteration labels to canonical, raising on any unmapped label). Owns `CANONICAL_RACE_GROUPS` (9) and `RACE_ITERATION_MAP`. *Derived from* the legacy `table_id_to_race_dict` and its iteration loop.

### `scripts/housing_stress/geography/puma_aggregation.py`

- **`extract_puma_id(df)`** - keeps rows whose `NAME` contains "PUMA" and parses the trailing 5 digits of `GEO_ID` into an integer `PUMA_ID` (handling `GEO_ID` as either index or column). Raises on an unparseable id.
- **`aggregate_pumas_to_geography(df, crosswalk_path, crosswalk_geo_column, estimate_columns, output_location_column)`** - inner-joins on `PUMA_ID` to the crosswalk's `pumace` column (unmatched PUMAs drop), renames the target column, and sums the estimate columns by geography. The approximate step.
- **`map_region_ids_to_names(df, region_column, region_id_to_name)`** - replaces numeric region ids 1-9 with canonical names; raises on an unknown id.

*Legacy lineage:* replaces the legacy PUMA-id extraction, crosswalk merge, and group-by-sum inside `build_county_dataset` / `build_region_dataset`.

### `scripts/housing_stress/aggregation/geographic_levels.py`

- **`build_state_rows` / `build_region_rows` / `build_county_rows`** - the three builders, each iterating the iteration frames, applying the geography step, then the shared `_measure_and_tag` (reconcile race, compute tenure measures, stamp year and level). Region/county builders call the PUMA helpers; the state builder filters to the 50 abbreviations.
- **`build_all_levels(ca_frames, state_frames, year, paths, schema_config, geography)`** - runs all three and concatenates + sorts into one vintage frame.
- Helpers: `_contract_columns`, `_measure_and_tag`, `_prepared_estimates` (strip + drop MOE), `_region_id_to_name` (enumerate `regions_mapping`).

*Legacy lineage:* replaces the three duplicated closures `build_state_dataset` / `build_region_dataset` / `build_county_dataset`, collapsing them to one code path that differs only in the geography step.

---

## Phase 4: Merging

### `scripts/housing_stress/merging/historical_merge.py`

- **`load_canonical_dataset(current_data_path)`** - (see Phase 1).
- **`combine_with_historical(new_df, historical_df, year_column, completeness_validator)`** - validates the incoming vintage before touching history (raises on failure), then drops every historical row whose year is in `new_df` and appends the incoming rows whole. Atomic at `Year` grain, no key-level upserts. *Derived from* legacy `combine_with_historical()`.
- **`detect_new_data(merged_df, historical_df)`** - compares column lists, then sorts both frames by all columns and uses `DataFrame.equals`, ignoring row order and index. Replaces the legacy `assert_frame_equal` check.

---

## Phase 5: Validation and Output

### `scripts/housing_stress/validation/housing_stress_validators.py`

- **`validate_cleaning_output(df, schema_config)`** - a per-level post-build validator (required columns, null critical columns, non-negative counts, shares in [0, 1], canonical tenure/race). See Flagged Issues: it is defined and tested but **not wired** into the orchestrator.
- **`validate_stratification_completeness(df, schema_config)`** - the completeness gate used during merge: per `(Geographic Level, Location, Year)` group, a missing *race* is a WARNING (suppression expected) but a present race missing any *tenure* is an ERROR. Only errors fail the vintage.
- **`validate_housing_stress_dataset(df, validation_config)`** - the final gate: required columns, row-count bounds, all three levels present, year range, excluded-year (2020) check, non-negative counts, shares in [0, 1], and duplicate-key detection. Composes the shared validators.

> Note: the final config passes `share_columns` and `nonnegative_columns`, but `validate_housing_stress_dataset` reads `number_columns` (not `nonnegative_columns`) for its negative-value check - so the final-stage non-negative check on the count columns never runs. See Flagged Issues.

### `scripts/housing_stress/output/finalize_dataset.py`

- **`prepare_output(df, schema_config)`** - checks contract columns, casts `Year` to int and the measures to numeric/float, orders columns, and sorts. Raises on a missing contract column.
- **`archive_and_save(df, current_path, archive_directory)`** - compares the new CSV text against the existing file; on a match returns `None` (no write), otherwise copies the old file into the archive with an `mm-dd-yy` stamp and writes the new text. *Replaces* the legacy pattern where saving was a side effect of chart rendering.

### `scripts/orchestrators/housing_stress_pipeline.py`

- **`HousingStressPipelinePhaseError` / `_raise_phase_error`** - tag failures with their phase.
- **`_download_states(...)`** - downloads each iteration's national table once and keeps the `0400000US` state-summary rows (the fix that turned ~900 per-state requests into ~9).
- **`build_housing_stress_dataset(config=None)`** - runs the five phases and returns `{dataset, new_data, source_failed, used_manual, resolved_year, output_path, row_count}`.
- **CLI:** `python scripts/orchestrators/housing_stress_pipeline.py` prints the vintage, row count, and write status.

*Legacy lineage:* replaces `build_full_dataset()` and its three nested builder closures.

---

## The Frontend Layer

The Python pipeline stops at the contract CSV; all charting is in the shared React UI, so there is no Python visualizer. The three JavaScript deliverables that consume the contract:

- **`lib/visualization/moduleSchemas/housingStress.js`** - the field catalog: `Year` (temporal); `Geographic Level`, `Location`, `Race/Ethnicity`, `Tenure` (dimensions); the four measures with actual/numericChange/percentChange/indexed transforms (presented as a 30%/50% threshold selector x a Number/Share basis selector); subsets; the module-specific `Race/Ethnicity` (9) and `Tenure` (5) filter dimensions with the race-universe and PUMA-approximation caveats; and curated presets.
- **`lib/data/housing_stress.js`** - server-only data-access layer (`node:fs`) that caches the parsed CSV and filters by race/tenure/level before shaping; passes zero-denominator `NA` shares through as null (chart gaps), never coerced to 0.
- **`app/api/housing-stress/route.js`** - thin API route accepting `raceEthnicity`, `tenure`, `threshold`, `basis`, and `view`.

Four curated built-in views are registered in `lib/visualization/categoryRegistry.js` (share trend, renter cost-burden trend, county ranking, county map). *Legacy lineage:* replaces `visualize_line()` (stateful trace overlay) and `visualize_bar()` (two-period change).

---

## Flagged Issues and Fragilities

These were noted while documenting the module and then re-examined in a dedicated reliability, robustness, and efficiency audit (2026-07-11, against the code as it stands today). Per the task, they are recorded here rather than fixed: each entry states the problem and a detailed resolution plan, and calls out any decision that is yours to make. The section is in two parts — **Part A** revisits the issues flagged during the original documentation pass (one of which the code has since resolved), and **Part B** records new findings from the audit.

> [!info] Status note on the technical-reference body
> The technical-reference body does not carry a separate "logging is stubbed" passage (unlike the Population & Housing and Components guides), so no body correction was needed here. The original flagged "Logging is stubbed" note has been resolved and replaced by A8; the vintage-resolution docstrings that imply logging are now accurate.

### Part A — Previously Flagged Issues

#### A1. The manual and last-saved fallback tiers return the wrong shape for the build step

**Problem.** `acquire_with_fallback` returns a payload that Phase 3 (`build_all_levels` → `build_state_rows`/`build_region_rows`/`build_county_rows`) treats as a **dict of iteration frames**, iterating `.items()` and running each value through the estimate-column transforms. But the **manual** tier returns `pd.read_csv(manual_path)` — a single contract-shaped DataFrame — and the **last-saved** tier returns `_saved_rows_for_levels(...)`, already-cleaned historical rows. Iterating a DataFrame's `.items()` yields `(column_name, Series)` pairs, so the builder calls `strip_table_prefix` on a `Series` and raises `AttributeError`. When live acquisition fails and the pipeline falls back, Phase 3 **crashes** rather than degrading — the `source_failed`/`used_manual` flags are set but the lower two tiers never yield a runnable build. The tiers pass their isolated unit tests; the gap is at the acquisition-to-build seam, which the mocked orchestrator tests don't exercise. This is the highest-severity issue in the module: the entire fallback cascade is decorative.

**Resolution plan.**
- Decide the contract of each tier and make the build path branch on it. The cleanest shape: `acquire_with_fallback` returns a discriminated payload — `(kind, data, source_failed, used_manual)` where `kind ∈ {"iteration_frames", "contract_rows"}`. The orchestrator then either runs `build_all_levels` (live/iteration frames) or **skips the build entirely** and feeds the already-cleaned contract rows straight into Phase 4's merge (manual/last-saved), since those rows are already in output schema.
- Concretely, mirror the Projections/Components pattern: when `source_failed` (last-saved) or the manual tier fired, bypass Phase 3 and pass the contract-shaped frame directly to `combine_with_historical` (reducing to base strata first if the saved rows carry aggregates — Housing Stress has no marginal rollups, so this is simpler than Projections).
- The manual file's documented shape must match: either it is raw iteration data (then feed it through the build) or contract rows (then bypass). Pick one and enforce it with a shape check that raises a clear error instead of an opaque `AttributeError`.
- Add an integration test that drives the orchestrator with live acquisition forced to fail and asserts a degraded-but-valid dataset (or a clean, explicit skip), not a crash.

> [!question] Decision for you (A1)
> What should the manual CSV contain — **raw ACS iteration data** (fed through the build, closest to what live returns) or **finished contract rows** (bypass the build, simplest to hand-author)? And when live fails with history present, should the run **degrade to last-saved silently** or **fail loudly** so the stale vintage is obvious? My recommendation: manual = contract rows + bypass build, and degrade-to-last-saved with a `source_failed` flag that the run record surfaces (see A8/B4).

#### A2. The contract holds only the newest vintage per run, with no backfill path

**Problem.** The pipeline resolves and fetches a single latest vintage each run and merges it into saved history; deep history accumulates only by running repeatedly over time. The legacy 2012-2023 CSV had the old (wrong-schema) columns and was moved aside during migration, so a fresh V3 build starts from near-empty history and produces a **single-year** dataset, not the "2012 through latest" series the contract describes. Bootstrapping the historical years into the V3 schema is a separate, un-done migration.

**Resolution plan.**
- Write a one-time backfill driver that loops `resolve`/`build` across every ACS 1-year vintage from `earliest_year` (2012) to latest (skipping 2020), running each through the existing `build_all_levels` + `combine_with_historical` path, and seeds the contract CSV. This reuses the live code path with the year pinned rather than resolved, so no new cleaning logic is needed.
- Because each vintage's `.dat` files are still on the Census server, the backfill is a bounded batch job — but note it will amplify B1 (no caching) into a large number of redundant downloads unless caching is added first.
- Document the backfill as the deep-history seed and pair it with A7 (immutable history path) so the seeded years aren't at risk of being overwritten by a single bad current run.

> [!question] Decision for you (A2)
> Do you want deep history **backfilled once and committed** as a seed (fast subsequent runs, but a manual refresh) or **rebuilt on demand** by a driver that walks all vintages each time (always current, but slow and download-heavy)? Recommendation: backfill-and-commit once, then let the normal per-run merge accrue new vintages.

#### A3. A transient network hang silently resolves an older vintage

**Problem.** `resolve_latest_vintage` advances past both `ACSTableUnavailableError` **and** a transient `HTTPDownloadError` (timeout / connection failure). This is deliberate — the Census host hangs rather than 404s for some not-yet-published years — but it means a transient timeout on the base table for a vintage that *is* published causes the pipeline to resolve and build the **previous** year's data without erroring. It narrows the legacy bare-`except`, but the "silently serve an older vintage" failure mode survives for network faults.

**Resolution plan.**
- Add a bounded retry (e.g. 2-3 attempts with backoff) on the base-table probe before treating a `HTTPDownloadError` as "not published." A genuine not-yet-published hang will keep failing; a transient blip will recover, so the pipeline stops mistaking a network fault for an absent vintage.
- Distinguish the two outcomes in the result/run record: when the resolved year is *older* than the calendar-year expectation, surface it (a `resolved_year_is_stale` flag) so a silently-old vintage is visible rather than invisible.
- Keep the `ValueError`-propagates-on-malformed behavior (that part is correct).

#### A4. The vintage lookback window is only 3 years

**Problem.** `max_year_lookback = 3` probes the current year and the two prior (minus excluded years). If the newest published ACS 1-year vintage is more than ~two years behind the calendar year — realistic when Census is late, and made worse by A3 consuming probe slots on hangs — `resolve_latest_vintage` raises and the whole pipeline fails at Phase 2 instead of resolving the genuinely-latest available year. Note the 2020 exclusion also consumes a slot: from calendar 2026 the window (2026, 2025, 2024) is fine, but a window straddling 2020 loses a probe to the skip.

**Resolution plan.**
- Widen `max_year_lookback` to a safer window (e.g. 4-5) so a late Census release still resolves, and make the excluded-year skip *not* count against the lookback budget (skip without consuming a slot).
- Better: make it adaptive — probe backward until the first success or a hard floor of `earliest_year` (2012), rather than a fixed small count. Combined with A3's retry, this makes resolution robust to both lateness and transient faults.
- Add a test with a Census that's two years behind plus a 2020 in the window, asserting resolution still succeeds.

#### A5. Final-stage non-negative check on the count columns never runs

**Problem.** `validate_housing_stress_dataset` iterates `validation_config.get("number_columns", [])` for its negative-value check, but `final_validation_config` in `schemas.py` supplies the count columns under the key `nonnegative_columns` (not `number_columns`). So the final-stage negative-count check is a silent no-op. The cleaning-stage `validate_cleaning_output` reads the right key (`nonnegative_columns`) — but that function is unused (A6). So **no** stage in the live pipeline actually checks the count columns for negatives.

**Resolution plan.**
- One-line fix: change the reader to `validation_config.get("nonnegative_columns", [])` (or rename the config key to `number_columns` — but aligning on `nonnegative_columns` matches the cleaning config and the shared convention). Add a test with a crafted negative count that must fail final validation.
- While here, confirm the share-range check truly runs (both sides agree on `share_columns` — it does) so the fix is scoped to the count columns only.

#### A6. `validate_cleaning_output` is defined and tested but never wired

**Problem.** The orchestrator imports only `validate_stratification_completeness` (Phase 4) and `validate_housing_stress_dataset` (Phase 5); `validate_cleaning_output` has no caller. Same "tested but unused" pattern flagged in the Projections and Population & Housing guides.

**Resolution plan.**
- Wire it into Phase 3 right after `build_all_levels` (it's the natural per-vintage post-build gate, and it's the only place the count-column non-negative check currently reads the *correct* key), or delete it. Recommendation: **wire it** — it catches a malformed build before the merge and closes the A5 gap at the cleaning stage as a bonus. If wired, keep A5's final-stage fix too (defense in depth on the merged frame, which includes retained history the cleaning validator never saw).

#### A7. Self-perpetuating history

**Problem.** `config/paths.py` sets `historical_data_path == current_data_path` (both `HousingStress_Current.csv`); the pipeline reads the contract as its own baseline and writes back to it, with no immutable canonical source. Same pattern as the sibling modules. The completeness gate (Phase 4) is the only structural guard, and it validates only the *incoming* vintage, not the retained history — so a corrupt historical year that was written by a prior bad run is never re-checked.

**Resolution plan.**
- Give history its own immutable, seeded path (produced by the A2 backfill), read-only to the live pipeline, so a bad current write can't poison the baseline. This is especially valuable here because the completeness gate doesn't re-validate retained years.
- Pair with B2 (atomic write) so a partial write can't become the next run's history.
- Harden `load_canonical_dataset` — it already returns an empty contract-shaped frame when the file is absent (good; the module cold-starts), so the only change needed is the separate path plus the seed.

#### A8. Logging — RESOLVED since the original flag

**Update.** No longer an open issue. The shared logging layer (`pipeline_logging.py`, `dataframe_logging.py`, `run_records.py`) is fully implemented and this orchestrator uses it: `build_housing_stress_dataset(config=None, logger=None)` threads a logger, Phase 5 calls `log_data_quality_check`, and the `__main__` entry runs through `execute_pipeline_run`, appending one JSONL run record per run.

**Residual cleanup (small).**
- Coverage is thin (only the Phase 5 quality check). Add step logs at vintage resolution (which year was probed/skipped/resolved — the docstrings already speak of this), acquisition (which fallback tier fired), and merge.
- Run-record fallback-flag gap (see B4): the summary returns `source_failed` (which matches `run_records`' `FALLBACK_FLAG_PATTERN`) but `used_manual` does **not** match the pattern, so a manual-fallback run isn't marked `recovered`. Rename the key to `source_used_manual` (or similar) so a manual run is flagged.
- The guide body carries no separate "stubbed logging" passage, so no body correction was needed; the only logging work left is the coverage gaps above.

#### A9. Text-based fragilities in PUMA handling and change detection

**Problem.** Two independent brittleness points:
- `extract_puma_id` detects PUMA rows by `NAME.str.contains("PUMA")`, and `aggregate_pumas_to_geography` hard-codes crosswalk column names (`pumace`, and the geo column `region`/`cntynm` via `crosswalk[["pumace", crosswalk_geo_column]]`). A change in ACS `NAME` text silently drops rows; a renamed crosswalk header raises `KeyError` and fails the county/region build (→ Phase 3 crash).
- `detect_new_data` relies on `DataFrame.equals` across a CSV round-trip, so a dtype or float-precision drift between the in-memory build and the parsed history reports spurious "new data." Harmless because `archive_and_save` independently no-ops on identical text, but it makes the flag untrustworthy for any consumer (and always triggers the archive-compare work).

**Resolution plan.**
- PUMA detection: prefer the structural signal (SUMLEV or the `GEO_ID` PUMA prefix `795...`/`7950000US`) over the `NAME` substring; validate the parsed `PUMA_ID` count against the expected number of California PUMAs and warn on a large drop.
- Crosswalk columns: validate the crosswalk header on load (assert `pumace` and the geo column exist, with a clear error naming the file) rather than letting `[[...]]` raise an opaque `KeyError`; consider a small rename map so a header change is a one-line config edit.
- `detect_new_data`: normalize dtypes before comparing (mirror the Components module's `_normalize_numeric_dtypes` fix), or compare on the serialized CSV text directly (which is what `archive_and_save` already does) so the flag and the write decision use one definition of "changed."

### Part B — Additional Audit Findings

#### B1. No caching despite a configured cache window — national files are re-downloaded 2-3× per run (efficiency)

**Problem.** `sources.py` advertises `cache_max_age_days = 30`, but **nothing honors it**: `download_national_table` fetches the `.dat` and `Geos` files fresh every call, with no on-disk cache check. Worse, the same national files are pulled repeatedly within a single run:
- `resolve_latest_vintage` downloads the base `b25140` national table (for CA) to probe the vintage.
- `_download_states` then downloads **all 9** iteration national `.dat` files (and their geo files) and keeps the state-summary rows.
- `download_all_iterations("CA", ...)` downloads **all 9 again** (via `get_acs_table` → `download_national_table`) and filters to CA.

So each of the 9 national tables is downloaded at least twice per run (state scope + CA scope), plus the base table a third time during resolution — roughly 19 full national-file fetches (× 2 counting the paired geo files) for data that could be fetched once and filtered in memory. ACS national `.dat` files are not tiny, so this is real wall-clock and bandwidth cost, and it makes the A2 backfill (looping every vintage) far more expensive than it needs to be.

**Resolution plan.**
- Honor `cache_max_age_days`: have `download_national_table` write each fetched `.dat`/`Geos` pair to `download_directory` and return the cached copy when it's within the window (the pattern Population & Housing and Projections already use). This alone removes the cross-run and within-run redundancy.
- Fetch each iteration's national table **once per run** and derive both scopes from it: `_download_states` keeps the `0400000US` rows and the CA build keeps the PUMA rows from the *same* download. Restructure Phase 2 so the 9 national tables are downloaded once and both the state and CA frames are sliced from them, instead of two independent download passes.
- Fold the vintage-resolution probe into the cache too, so the base table fetched to resolve the year is reused rather than re-downloaded.
- Add a test asserting the number of `fetch_response` calls per run is ~9 (one per iteration), not ~19.

#### B2. The contract file is written non-atomically (robustness)

**Problem.** `archive_and_save` writes with `current_path.write_text(new_csv)` — a direct in-place overwrite, no `.tmp` + `replace`. Population & Housing and Components both write atomically precisely so a crash mid-write can't corrupt the output; this module (like Projections) dropped that. Because the contract file is also the history baseline (A7), a process killed mid-write leaves a truncated CSV that becomes the next run's history — and `load_canonical_dataset` will happily `read_csv` a truncated file into a short frame, silently losing rows. The prior good copy is archived first (good), but nothing auto-restores it.

**Resolution plan.**
- Restore atomic writes: write to `current_path.with_suffix(current_path.suffix + ".tmp")`, then `os.replace(tmp, current_path)`. Ordering: archive old → write tmp → atomic replace.
- Add a test that simulates a failed write and asserts the original file is intact.
- This is a small change that closes the sharpest interaction with the self-perpetuating history (A7).

#### B3. The region-id→name mapping is order-coupled across two independent sources (latent correctness)

**Problem.** `_region_id_to_name` builds `{1: first_region, 2: second_region, ...}` from `enumerate(geography["regions_mapping"], start=1)` — i.e. the **iteration order** of the shared geography's `regions_mapping` dict. The region crosswalk (`puma_regions_xwalk_2020.csv`) independently encodes region ids 1-9 as numbers. Nothing enforces that the crosswalk's numeric id N corresponds to the Nth region in `regions_mapping`. If the shared `regions_mapping` is ever reordered (a plausible edit, since it's shared across three modules and its order is not obviously load-bearing), every California region row is silently relabeled to the wrong region — counties still aggregate correctly, but the region *names* are wrong, and the error is invisible (all ids still map to *some* valid region).

**Resolution plan.**
- Break the order coupling: store the region-id→name mapping explicitly (a small dict keyed by the crosswalk's actual numeric ids) rather than deriving it from dict iteration order. Source it from the crosswalk itself if the crosswalk carries region names, or from an explicit config map that documents "crosswalk id 1 = Superior California," etc.
- If the enumeration approach is kept, add an assertion/test pinning the expected order of `regions_mapping` so a reorder fails CI loudly instead of silently mislabeling.
- Cross-reference the shared-geography owner: this is the kind of ordering assumption that should be documented at the `california_geography.py` source so the other modules don't inherit a hidden constraint.

#### B4. Parallel iteration maps and string-sniffed error classification (maintainability / robustness — minor)

**Problem.** Two smaller items:
- The 9-iteration table→label mapping is declared **twice**: `_TABLE_ITERATIONS` in `sources.py` (raw labels) and `_RACE_ITERATION_MAP` in `schemas.py` (canonical labels), with `_RACE_RECONCILIATION_MAP` bridging them. Editing the iteration set in one file but not the other drifts them, and the base-table-first ordering (load-bearing for the `index == 0` "is base table" check in `_download_states`/`download_all_iterations`) is an implicit invariant of the `sources.py` dict order.
- `_is_missing_file_error` classifies a 404 by substring-matching `"404"`/`"Not Found"` in the `HTTPDownloadError` message. If the shared downloader's message format changes, a real 404 could be misread as a transient fault (and vice versa), altering the vintage-resolution and iteration-skip behavior.

**Resolution plan.**
- Give the iteration mapping a single owner (one dict, imported by both `sources.py` and `schemas.py`) and assert the base table is first (or key the "is base" test on the table id `"b25140"` rather than positional index 0, removing the ordering dependency).
- Have the shared `HTTPDownloadError` carry a structured `status_code` attribute so `_is_missing_file_error` can test `error.status_code == 404` instead of sniffing the message. (This is a shared-layer improvement that benefits every module's downloader.)

---

## Legacy-to-Refactored Mapping

| Legacy (`housingstress_code.py`) | Refactored home |
|---|---|
| `build_full_dataset()` | `orchestrators/housing_stress_pipeline.py::build_housing_stress_dataset` (five phases) |
| `get_data()` (x2 copies) | `acquisition/acs_sf_downloader.py::download_national_table` + `get_acs_table` |
| per-iteration download loops | `acs_sf_downloader.py::download_all_iterations` + orchestrator `_download_states` |
| year-decrement fallback loops | `acquisition/source_fallback.py::resolve_latest_vintage` |
| inline fallback cascade | `source_fallback.py::acquire_with_fallback` |
| column prefix strip + MOE drop + rename | `cleaning/column_normalization.py` |
| tenure/burden math (x3 copies) | `cleaning/cost_burden_measures.py::compute_tenure_measures` |
| `table_id_to_race_dict` + iteration loop | `cleaning/race_ethnicity_mapping.py` |
| PUMA-id extraction + crosswalk merge + groupby-sum | `geography/puma_aggregation.py` |
| `build_state_dataset` / `build_region_dataset` / `build_county_dataset` | `aggregation/geographic_levels.py` |
| `combine_with_historical()` | `merging/historical_merge.py` |
| geographic-level tag + column order + archive/save | `output/finalize_dataset.py` |
| `visualize_line/bar()` | dropped; replaced by the React frontend (`housingStress.js`, `housing_stress.js`, `api/housing-stress/route.js`) |
| `print`-based progress | `shared/logging/` (`pipeline_logging.py` + `dataframe_logging.py` + `run_records.py`, fully implemented and wired via `execute_pipeline_run` — see A8) |

---

## Open Items

Each item links to the fuller problem statement and plan in "Flagged Issues and Fragilities." Ordered roughly by priority.

**Reliability / robustness**
- [ ] **(A1)** Fix the acquisition-to-build seam so a manual or last-saved fallback yields a payload the pipeline can consume — branch on the tier and bypass the build for contract-shaped rows — so a live-acquisition failure degrades instead of crashing Phase 3. *Decision pending: manual = raw vs. contract rows; degrade-silently vs. fail-loud.*
- [ ] **(B2)** Restore atomic contract writes (`.tmp` + `os.replace`) so a mid-write crash can't corrupt the file that doubles as history.
- [ ] **(A3 + A4)** Add a retry on the base-table probe and widen/adapt `max_year_lookback` (and don't spend a probe slot on the excluded 2020) so a transient hang doesn't resolve an older vintage and a late Census release doesn't fail Phase 2.
- [ ] **(A5)** Fix the `number_columns` → `nonnegative_columns` key mismatch so the final-stage non-negative check on the count columns actually runs.
- [ ] **(A9)** Replace text-substring PUMA detection and hard-coded crosswalk headers with structural signals + header validation; normalize dtypes (or compare serialized text) in `detect_new_data`.
- [ ] **(B3)** Break the region-id→name order coupling — store an explicit id→name map (or pin `regions_mapping` order with a test) so a shared-geography reorder can't silently mislabel regions.

**Data completeness / history**
- [ ] **(A2)** Write a backfill driver for 2012-onward history so a from-scratch build isn't single-year. *Decision pending: backfill-and-commit vs. rebuild-on-demand.*
- [ ] **(A7)** Introduce an immutable, seeded history path distinct from the live output (pair with A2 + B2).

**Efficiency**
- [ ] **(B1)** Honor `cache_max_age_days` and download each iteration's national table once per run (slice both the state and CA scopes from it) instead of re-fetching every national `.dat` 2-3×.

**Housekeeping**
- [ ] **(A6)** Wire `validate_cleaning_output` into Phase 3 or remove it.
- [ ] **(B4)** Give the 9-iteration map a single owner (assert base-table-first or key on `"b25140"`), and give `HTTPDownloadError` a structured `status_code` so `_is_missing_file_error` stops sniffing the message.
- [x] Logging body/notes reconciled (the guide had no separate "stubbed logging" body passage; the original flagged note is resolved — see A8). Still open: fill the resolution/acquisition/merge structured-logging coverage gaps.

**Resolved since the original pass**
- [x] **(A8)** ~~Implement or remove the stubbed shared logging~~ — done: `pipeline_logging.py`, `dataframe_logging.py`, and `run_records.py` are fully implemented and wired via `execute_pipeline_run` (with the small `used_manual` fallback-flag gap noted under A8/B4).
