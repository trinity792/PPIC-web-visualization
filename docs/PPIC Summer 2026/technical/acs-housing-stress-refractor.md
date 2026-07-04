---
Topic: Housing
Content Type: refractor plan
pinned: false
description: "As-built guide to the refactored ACS Housing Stress (cost-burden) V3 pipeline: a non-technical overview of what it produces and how the five phases run, followed by a per-function programmer reference with legacy lineage. Covers the single ACS 1-year B25140 source, PUMA-based county/region aggregation, and the tenure/cost-burden math."
Date Published: June 30, 2026
Last Updated: 07/04/2026 - 09:20 AM
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

> [!warning] These were found while documenting the code and are recorded here per the standing instruction not to modify code. None were changed.

> [!danger] The manual and last-saved fallback tiers return the wrong shape for the build step
> `acquire_with_fallback` returns a raw payload that Phase 3 (`build_all_levels`) treats as a **dict of iteration frames** (`state_frames` / `ca_frames`), iterating `.items()` and running each value through the estimate-column transforms. But the **manual** tier returns `pd.read_csv(manual_path)` - a single contract-shaped DataFrame - and the **last-saved** tier returns already-cleaned historical rows. Iterating a DataFrame's `.items()` yields `(column_name, Series)` pairs, so the builder would call the column transforms on a `Series` and raise `AttributeError`. In other words, when live acquisition fails and the pipeline falls back to a manual file or last-saved rows, Phase 3 **crashes** rather than producing a degraded dataset - the `source_failed` / `used_manual` flags are set and returned, but the lower two fallback tiers never actually yield a runnable build. (The tiers pass their isolated unit tests; the gap is at the acquisition-to-build seam, which the mocked orchestrator tests don't exercise. This is the same class of seam bug the memory notes were fixed for the live path.)

> [!warning] The contract holds only the newest vintage per run, with no backfill path
> The pipeline resolves and fetches a single latest vintage each run and merges it into saved history; deep history accumulates only by running repeatedly over time. The legacy 2012-2023 CSV had the old (wrong-schema) columns and was moved aside during migration, so a fresh V3 build starts from near-empty history and produces a **single-year** dataset, not the "2012 through latest" series the contract describes. Bootstrapping the historical years into the V3 schema is a separate, un-done migration. Anyone regenerating the file from scratch should expect one year until the pipeline has been run across multiple vintages (or a backfill is written).

> [!warning] A transient network hang silently resolves an older vintage
> `resolve_latest_vintage` advances past both `ACSTableUnavailableError` and a transient `HTTPDownloadError` (timeout / connection failure). This is deliberate - the Census host hangs rather than 404s for some not-yet-published years - but it means a transient timeout on the base table for a vintage that *is* published causes the pipeline to resolve and build the previous year's data without erroring. It trades the legacy bare-`except` for a narrower one, but the "silently serve an older vintage" failure mode survives for network faults.

> [!warning] The vintage lookback window is only 3 years
> `max_year_lookback = 3` probes the current year and the two prior (minus excluded years). If the newest published ACS 1-year vintage is more than about two years behind the calendar year - a real possibility when Census is late, and made worse by the transient-hang behavior above consuming probe slots - `resolve_latest_vintage` raises "No vintage found" and the whole pipeline fails at Phase 2 rather than resolving the genuinely-latest available year.

> [!note] Final-stage non-negative check on the count columns never runs
> `validate_housing_stress_dataset` iterates `validation_config.get("number_columns", [])` for its negative-value check, but the `final_validation_config` in `schemas.py` supplies the count columns under the key `nonnegative_columns` (not `number_columns`). So the final-stage negative-count check is a silent no-op. (The cleaning-stage `validate_cleaning_output` does check them under `nonnegative_columns` - but that function is unused; see below.) The share-range check is unaffected because both sides agree on `share_columns`.

> [!note] `validate_cleaning_output` is defined and tested but never wired
> The orchestrator imports only `validate_stratification_completeness` (Phase 4) and `validate_housing_stress_dataset` (Phase 5); `validate_cleaning_output` has no caller in the running pipeline. This mirrors the "tested but unused" validators flagged in [[projections-refactor-flagged-issues]] and [[pophousing-refactor-flagged-issues]].

> [!note] Self-perpetuating history
> `config/paths.py` sets `historical_data_path == current_data_path` (both `HousingStress_Current.csv`); the pipeline reads the contract as its own baseline and writes back to it, with no immutable canonical source. Same pattern as [[projections-refactor-flagged-issues]], [[components-of-change-refactor-flagged-issues]], [[pophousing-refactor-flagged-issues]], and [[building-permits-migration]].

> [!note] Logging is stubbed
> `scripts/shared/logging/*` bodies are all `pass` ("Not yet implemented") and the orchestrator does no logging, though the vintage-resolution docstrings speak of "logging" each skipped year. Shared with the other modules.

> [!note] Text-based fragilities in PUMA handling and change detection
> `extract_puma_id` detects PUMA rows by `NAME.str.contains("PUMA")`, and `aggregate_pumas_to_geography` hard-codes the crosswalk column names (`pumace`, `region`, `cntynm`); a change in ACS `NAME` text or in a crosswalk header would silently drop rows or fail the merge. Separately, `detect_new_data` relies on `DataFrame.equals` across a CSV round-trip, so a dtype or float-precision drift between the in-memory build and the parsed history could report spurious "new data" - harmless, because `archive_and_save` independently no-ops on identical bytes, but it makes the flag less trustworthy than it looks.

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

---

## Open Items

- [ ] Fix the acquisition-to-build seam so the manual and last-saved fallback tiers yield a payload `build_all_levels` can consume (or have the orchestrator branch on `source_failed` and skip the build), so a live-acquisition failure degrades gracefully instead of crashing Phase 3.
- [ ] Decide on a backfill path for the 2012-onward history (bootstrap the legacy years into the V3 schema) so a from-scratch build isn't single-year.
- [ ] Reconsider advancing the vintage probe on transient `HTTPDownloadError`, or add a retry, so a network hang doesn't silently resolve an older vintage.
- [ ] Widen or make `max_year_lookback` adaptive so a late Census release doesn't fail Phase 2.
- [ ] Fix the `number_columns` vs. `nonnegative_columns` key mismatch so the final-stage non-negative check on the count columns actually runs.
- [ ] Either wire `validate_cleaning_output` into the pipeline or remove it.
- [ ] Decide whether to introduce an immutable canonical source instead of `historical_data_path == current_data_path`.
- [ ] Implement or remove the stubbed shared logging.
- [ ] Consider name-based (not text-substring / hard-coded-header) PUMA and crosswalk handling.
