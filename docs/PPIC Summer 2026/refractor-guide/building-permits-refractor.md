---
Topic: Housing
Content Type: refractor guide
pinned: false
description: "As-built guide to the refactored Building Permits V3 pipeline: a non-technical overview of what it produces and how the five phases run, followed by a per-function programmer reference with legacy lineage. Covers the single Census BPS monthly source, the metro/state grain, the seed-from-snapshot deep history, and the derived values pushed to the frontend."
Date Published: June 30, 2026
Last Updated: 07/11/2026 - 10:45 AM
Status: Finalized
---

# Building Permits Refractor Guide

> [!info] How to read this document
> This guide has two halves. The **first half** is for non-technical readers: it explains what the module produces, where the data comes from, the shape of the output dataset, and how the pipeline runs from raw download to saved CSV, phase by phase. The **second half** is a programmer reference: it walks every script and function, notes the libraries and performance choices, and records which piece of the legacy `permits_code.py` each function was derived from. The document describes the code **as it is actually built** in `scripts/building_permits/` and `scripts/orchestrators/building_permits_pipeline.py`, not a plan of what should be built. The original migration plan (with its proposed signatures and sequencing) is preserved in this file's git history. Related module guides: [[age-sex-race-projections-refractor]], [[acs-housing-stress-refractor]], [[components-of-change-refractor]], [[pophousing-pipeline-refractor]], [[projectSpec]].

---

## What the Module Produces

The pipeline builds one file: `data/data-cleaned/building-permits/BuildingPermits_Current.csv`. It records **residential building permits** - monthly counts of authorized new housing units, split by structure size (1 unit, 2 units, 3-4 units, 5-or-more, and their total) - for California metropolitan areas and for all 50 US states. The generated contract holds **197 months (2010-01 through 2026-05), 14,691 rows**.

This is the simplest of the five modules on the *measurement* axis (no race, tenure, or age dimension - just five structure-size counts) and the most distinctive on two others:

- **It is the only monthly module.** The `Date` column is `YYYY-MM`, not a year.
- **Its deep history cannot be rebuilt from the live source.** The Census only hosts a rolling ~2-year window of monthly `.xls` files (as of 2026-07, back to 2024-01; earlier months return 404). So 2010-01 through 2023-12 was **seeded once** from the legacy accumulated snapshot `BuildingPermits_06-16-25.csv`, and the live pipeline owns 2024-01 onward; the two join contiguously. A from-scratch run without the seed would produce only the recent rolling window. See Flagged Issues.

The refactor's defining win was structural: the legacy module copy-pasted the full acquire → clean → merge → derive → save sequence **six times** (the try and except branches of all three `visualize_*` functions), with the two cleaners existing in four copies. That collapses here into one orchestrator with individually testable phases, fallback handled once in the acquisition layer, and saving decoupled entirely from charting.

---

## Data Sources

One external source feeds the module - the **U.S. Census Bureau Building Permits Survey (BPS)** monthly release, fetched as two `.xls` files per month:

| File | URL pattern | Content | Kept |
|---|---|---|---|
| CBSA monthly | `.../bps/xls/cbsamonthly_{YYYYMM}.xls` | Permits by Core-Based Statistical Area | California **metropolitan** CBSAs (micropolitan, `Metro /Micro Code == 5`, dropped) |
| State monthly | `.../bps/xls/statemonthly_{YYYYMM}.xls` | Permits by state | The 50 states |

BPS publishes monthly with a ~2-month lag. Parsing the legacy `.xls` format requires `xlrd>=2.0.1` in the pipeline environment.

**Availability caveat:** the monthly endpoints host only a rolling ~2-year window. The pipeline acquires only the months **between the last stored month and the latest available month**, and it **skips** (with a log) any month that returns a 404 rather than aborting - so the 2010-2023 months, which now 404, are simply not re-fetched and are supplied by the seed instead.

---

## The Dataset: Grain, Columns, and Geography

**Grain:** one row per `(Date, Geographic Level, Location)`.

**Columns (in output order):**

| Column | Meaning |
|---|---|
| `Geographic Level` | `State` or `Metro` |
| `Location` | A state name (`California`, `Texas`, ..., 50 states) for `State` rows, or a canonical CA metro display name (`Los Angeles`, `San Francisco`, `Inland Empire`, `Sacramento`, `Bakersfield`, ...) for `Metro` rows |
| `Date` | Month as `YYYY-MM` |
| `Total`, `1 Unit`, `2 Units`, `3 and 4 Units`, `5 Units or More` | Integer counts of authorized housing units. `Total` is the source total, not a recomputed sum |

**Derived and aggregated values are NOT stored.** `2+ Units`, `Rest of US`, index-to-100, the trailing-12-month ("year-to-date") rolling sum, two-period change, **and the 9-region aggregate** are all computed downstream in the frontend data-access layer, never persisted. This keeps the stored dataset at its minimal native grain.

**Geography:**

- **State:** 50 states, sourced directly from the state monthly file.
- **Metro:** CA metropolitan CBSAs at native BPS grain, using canonical display names from the shared `california_geography.cbsa_metros`. The grain is "up to 26" - **Madera** was de-delineated as a standalone MSA and no longer appears in current data, though older seeded months still carry it, so validation allows a *subset* of the canonical 26.
- **Region:** a **frontend aggregate, not stored** - the data-access layer sums member metros into the 9 shared regions on demand. Region aggregates cover metropolitan counties only and **under-count** rural counties covered by no CBSA (a documented, surfaced caveat).
- **County:** not stored and not derivable (a multi-county CBSA total cannot be split into its counties).

**Metro name drift is absorbed by code-based renames.** The SF metro is now published as "San Francisco-Oakland-Fremont" (was "-Berkeley"), Bakersfield as "Bakersfield-Delano", Stockton as "Stockton-Lodi". A rename map keyed on the stable **CBSA code** (12540, 41860, 44700) pins these to canonical display names regardless of the Census label churn.

---

## How the Pipeline Runs: Five Phases

The orchestrator `build_building_permits_dataset()` runs five phases. Each is wrapped so any exception re-raises as a `BuildingPermitsPipelinePhaseError` tagged with the phase name.

### Phase 1 - Setup and Load

Resolve the three config dicts (`paths`, `sources`, `schemas`) and the shared California geography, read the existing contract CSV into a `historical` frame, and find the latest stored month.

### Phase 2 - Acquisition

Resolve the latest published BPS month by probing backward from the current calendar month (a 404 advances the probe; a parse error raises). Enumerate the months strictly after the last stored month through the latest available one, then download each month's CBSA and state files. On a cold start (empty history) the enumeration reaches back to `earliest_month`, but any not-yet-hosted month is skipped with a log; if a live download fails outright, acquisition falls back to the last-saved rows and flags `source_failed`.

### Phase 3 - Clean and Tag

Clean each monthly CBSA frame (reseat the header, split `Name` into location/state, keep CA metros, apply the code-based and display renames, stamp `Date`) and each state frame (select and rename the six columns, filter to the 50 states, stamp `Date`), validate every metro name against the shared config, and concatenate into one `Geographic Level`-tagged frame.

### Phase 4 - Merge

Atomically replace any overlapping stored month (drop every historical row whose `Date` is in the incoming frame, append the incoming rows whole - never a key-level upsert), and detect whether the merged result differs from history.

### Phase 5 - Finalize and Save

Enforce contract column order and integer types, run final validation (row-count bounds, both levels present, 50 states per month, metros within the canonical set, a **contiguous** monthly range across the present series, non-negative measures, no duplicate keys), and - only if new data was detected - archive the prior file with a timestamp and write the new CSV.

---

## Key Calculations

There is very little math in the stored dataset by design - the five counts come straight from the BPS spreadsheet and `Total` is the source's own total. The interesting logic is elsewhere:

- **Header reseating and named selection.** The BPS spreadsheet has a banner above the real header, and it repeats each measure name across a "Current Month" block and a "Year to Date" block. The metro cleaner locates the true header row by finding the row carrying `Name` and `CBSA`, keeps only the first (current-month) occurrence of each duplicated column, and then selects by **name** - raising if an expected column is absent. This replaces the legacy positional slicing (`df.iloc[6]`, `df.iloc[:, 0:8]`) that broke silently on a layout change.
- **Forward month enumeration.** `months_to_acquire` enumerates months *forward* from the last stored month, so no month is skipped or re-downloaded - replacing the legacy "decrement from now until you hit the stored month" walk with its bare `except`.
- **Metro to region aggregation** (frontend only) sums member metros using the shared `metro_to_region_mapping`, which is derived by composing `metro_to_county_mapping` with the existing `regions_mapping` (every CA CBSA is a union of whole counties nesting within one region).

---

## Architecture and Boundaries

The module follows the standard three-layer V3 shape - shared -> `building_permits` -> orchestrator - and this migration **extended the shared layer**: the CBSA-metro reference data (`cbsa_metros`, `metro_to_county_mapping`, `metro_to_region_mapping`) was lifted out of the legacy module into `scripts/shared/geography/california_geography.py` so the metro grain is owned centrally, with a JS mirror (`lib/geography/californiaGeography.js`) so the Python and frontend groupings never drift.

There is **no Python visualization layer** - the legacy `visualize_line/bar/map()` methods (each of which also triggered the save as a side effect and carried a full duplicate pipeline in its `except` branch) were dropped. The frontend triad (`lib/visualization/moduleSchemas/buildingPermits.js`, `lib/data/building_permits.js`, `app/api/building-permits/route.js`) only ever *reads* the contract CSV and owns all the month-aware shaping and derived values.

---

## Technical Reference

The rest of this document is a per-script, per-function reference, organized by phase with configuration and shared helpers first. The legacy source is the flat function collection in `Visualization Tool/Building-Permits/permits_code.py`; "derived from" points at the legacy function or inline block that motivated each function.

---

## Configuration Modules

### `scripts/building_permits/config/paths.py`

**`get_paths()`** - builds every path from `lib.config.get_project_paths()`: the cleaned/raw/archive directories under `building-permits/`, the contract path `BuildingPermits_Current.csv`, the logs directory, and the county GeoJSON path used by the frontend map to broadcast metro/region values. Returns `pathlib.Path` objects.

> Note: `historical_data_path` is set equal to `current_data_path`. See Flagged Issues.

*Legacy lineage:* replaces the hard-coded, repeatedly re-read `R:\UCF\...` Windows paths.

### `scripts/building_permits/config/sources.py`

**`get_source_settings()`** - returns the CBSA and state URL patterns (templated on `{yyyymm}`), HTTP headers/timeout, `earliest_month` (`"2010-01"`), `max_month_lookback` (**6**), and the expected metro/state column lists (used to fail loudly on a layout change).

### `scripts/building_permits/config/schemas.py`

Owns the reference constants and one accessor:

- `_MEASURE_COLUMNS` (the five counts), `_OUTPUT_COLUMNS`, the 50 `_STATE_NAMES`.
- `_CBSA_CODE_RENAMES` - `{12540: "Bakersfield", 41860: "San Francisco-Oakland-Berkeley", 44700: "Stockton"}` (the legacy `location_dict`; keyed on stable CBSA code).
- `_METRO_DISPLAY_RENAMES` - the "per Hans" `location_dict2` (e.g. `"Riverside-San Bernardino-Ontario" -> "Inland Empire"`, `"San Francisco-Oakland-Berkeley" -> "San Francisco"`).
- `_MICRO_METRO_CODE` (5).
- **`get_schema_config()`** - pulls the canonical metro name list from `get_california_geography()["cbsa_metros"]` and assembles everything, plus the cleaning- and final-validation config blocks.

*Legacy lineage:* replaces the two inline rename dicts and the copy-pasted `np.select` level rules.

---

## Shared Helpers Reused (and Extended)

- **`scripts/shared/geography/california_geography.py` -> `get_california_geography()`** - **extended by this module** to add `cbsa_metros` (26 canonical metro names), `metro_to_county_mapping` (the legacy `msa_mapping`), and the derived `metro_to_region_mapping`, alongside the existing county/region keys.
- **`scripts/shared/downloads/http_downloads.py` -> `fetch_response`, `HTTPDownloadError`** - used by the downloader.
- **`scripts/shared/validation/dataframe_validators.py` -> `validate_required_columns`, `validate_null_counts`, `validate_numeric_range`, `find_duplicate_rows`** - composed by the validators.

---

## Phase 1: Setup and Load

- **`load_canonical_dataset(current_data_path)`** (`merging/historical_merge.py`) - reads the contract CSV or returns an empty 8-column frame.
- **`latest_stored_month(historical_df, date_column)`** - returns `max(Date)` or `None` if empty.
- **Orchestrator helpers:** `_parse_month_key`, `_month_before` (used to reach back to `earliest_month` on a cold start), `_clean_monthly_frames` (cleans each keyed monthly frame; returns an empty typed frame when given a non-dict, which is how the fallback path degrades cleanly).

*Legacy lineage:* replaces the repeated historical-CSV reads scattered through the legacy renderers.

---

## Phase 2: Acquisition

### `scripts/building_permits/acquisition/census_bps_downloader.py`

- **`BPSMonthUnavailableError`** - signals "not published" (404 / missing file), distinct from a parse failure.
- **`_is_missing_file_error(error)`** - inspects an `HTTPDownloadError` message for "404" / "Not Found".
- **`_download_month(url_pattern_key, year, month, ...)`** - formats the `{yyyymm}` URL, fetches, translates a 404 into `BPSMonthUnavailableError`, and parses with `pd.read_excel` (a malformed-but-present file raises `ValueError`, never masqueraded as "not published").
- **`download_cbsa_month` / `download_state_month`** - thin wrappers over `_download_month`. *Derived from* the download step inside the two legacy `clean_and_scrape_*` walks.

### `scripts/building_permits/acquisition/source_fallback.py`

- **Month arithmetic:** `_month_index`, `_from_month_index`, `_previous_month`.
- **`resolve_latest_month(source_settings, headers, timeout, max_month_lookback)`** - probes backward from the current month, accepting the first month whose CBSA **and** state files both download and parse; only `BPSMonthUnavailableError` advances the probe (a parse error propagates). Raises if nothing is found in the window. *Derived from* the legacy `datetime.now()` bare-`except` decrement.
- **`months_to_acquire(last_stored_month, latest_available_month, excluded_months=None)`** - forward-enumerates the months strictly after the last stored one through the latest available. *Replaces* the legacy backward walk.
- **`acquire_months(months, download_cbsa_fn, download_state_fn, saved_rows_fn)`** - downloads each month's two files; **skips** a `BPSMonthUnavailableError` month with a `print` log; on any other exception falls back to the last-saved rows and returns `source_failed=True`. Returns `(cbsa_frames, state_frames, source_failed)`. *Derived from* the legacy scrape loop and its ad-hoc fallback.

---

## Phase 3: Cleaning and Geographic Tagging

### `scripts/building_permits/cleaning/metro_permits_cleaner.py`

- **`_locate_header_row(df)`** - scans for the row carrying both `Name` and `CBSA`; raises if absent.
- **`clean_metro_permits(df, year, month, schema_config)`** - reseats the header, drops all-NaN rows/columns, de-duplicates the repeated measure columns (keeps the current-month block), validates the required source columns by **name**, splits `Name` into `Location`/`State`, keeps CA metropolitan CBSAs (drops micropolitan via the configured code), casts the five measures to int, applies the CBSA-code rename then the display rename, and stamps `Date`. *Derived from* the two `clean_metro_permits` copies, with all positional slicing replaced by named selection.

### `scripts/building_permits/cleaning/state_permits_cleaner.py`

- **`clean_state_permits(df, year, month, schema_config)`** - drops all-NaN rows, slices the first `1 + len(measures)` columns (raising if too few), renames to `Location` + measures, filters to the 50 states, casts to int, stamps `Date`. *Derived from* the two `clean_state_permits` copies.

### `scripts/building_permits/geography/geographic_levels.py`

- **`validate_metro_names(metro_df, geography)`** - raises if any metro `Location` is not in the shared `cbsa_metros`, guarding against a label change or rename-map miss.
- **`tag_geographic_levels(state_df, metro_df)`** - tags `State`/`Metro`, concatenates, orders to the contract columns, and sorts. *Replaces* the three copy-pasted `np.select` blocks.

---

## Phase 4: Merging

### `scripts/building_permits/merging/historical_merge.py`

- **`load_canonical_dataset` / `latest_stored_month`** - (see Phase 1).
- **`combine_with_historical(new_df, historical_df, date_column)`** - drops historical rows whose `Date` is in the incoming frame, concatenates (skipping empty frames to avoid dtype upcasting), and sorts. Atomic at `Date` grain. *Derived from* legacy `combine_permits_with_historical()`.
- **`detect_new_data(merged_df, historical_df)`** - compares column lists, then sorts both by all columns and uses `DataFrame.equals`. Replaces the legacy `assert_frame_equal`.

---

## Phase 5: Validation and Output

### `scripts/building_permits/validation/building_permits_validators.py`

- **`validate_cleaning_output(df, schema_config)`** - a per-frame post-clean validator (required columns, `YYYY-MM` date format, null key columns, non-negative integer measures, known locations). See Flagged Issues: **not wired** into the orchestrator.
- **`validate_building_permits_dataset(df, validation_config)`** - the final gate: required columns, row-count bounds, both levels present, every state present each month, metros within the canonical set ("up to 26"), a **contiguous** monthly range across the *present* series, non-negative measures, and duplicate-key detection. Helpers `_month_index` / `_month_from_index` drive the contiguity check.

### `scripts/building_permits/output/finalize_dataset.py`

- **`prepare_output(df, schema_config)`** - checks contract columns, casts `Date` to str and measures to int, orders, and sorts.
- **`archive_and_save(df, current_path, archive_directory)`** - compares the new CSV text against the existing file; on a match returns `None`, otherwise copies the old file into the archive with an `mm-dd-yy` stamp and writes the new text. *Replaces* the six copies of the legacy render-time save side effect.

### `scripts/orchestrators/building_permits_pipeline.py`

- **`BuildingPermitsPipelinePhaseError` / `_raise_phase_error`** - tag failures with their phase.
- **`build_building_permits_dataset(config=None)`** - runs the five phases and returns `{dataset, new_data, source_failed, acquired_months, output_path, row_count}`.
- **CLI:** `python scripts/orchestrators/building_permits_pipeline.py` prints the acquired months, row count, and write status.

*Legacy lineage:* replaces the six-fold duplicated pipeline embedded in the three `visualize_*` functions.

---

## The Frontend Layer

The Python pipeline stops at the contract CSV; all charting and every derived value live in the React UI. The three JavaScript deliverables:

- **`lib/visualization/moduleSchemas/buildingPermits.js`** - the field catalog: `Date` (monthly temporal); `Geographic Level`, `Location` (dimensions); the five measures plus the **derived** `2+ Units`, with transforms including the trailing-12-month sum; a derived `Rest of US` location; and the **Metros / Regions / States** subset toggle with the region-coverage caveat.
- **`lib/data/building_permits.js`** - server-only data-access layer (`node:fs`) that caches the parsed CSV, derives `2+ Units` and `Rest of US`, and - via `aggregateToRegions` using the JS mirror of `metro_to_region_mapping` - sums metros into the 9 regions on demand. Zero-baseline percent change passes through as null (chart gap), never `inf`. Because Building Permits is the first monthly module and the shared render layer is year-centric, the month-aware shaping (trailing-12 YTD, index-to-100, two-period change) lives here rather than in shared `query_shapes.js`.
- **`app/api/building-permits/route.js`** - thin API route accepting `permitType`, `subset`, `aggregated`, `indexed`, and `view`.

*Legacy lineage:* replaces `visualize_line/bar/map()` - including dropping the map's `np.random.uniform` empty-bin imputation and its `"No Data"` string rows entirely.

---

## Flagged Issues and Fragilities

These were noted while documenting the module and then re-examined in a dedicated reliability, robustness, and efficiency audit (2026-07-11, against the code as it stands today). Per the task, they are recorded here rather than fixed: each entry states the problem and a detailed resolution plan, and calls out any decision that is yours to make. The section is in two parts — **Part A** revisits the issues flagged during the original documentation pass (one of which the code has since resolved), and **Part B** records new findings from the audit.

> [!info] Status note on the technical-reference body
> The original flagged "Logging is stubbed" note has been resolved and replaced by A6; logging is implemented and this orchestrator is the best-instrumented of the five (it logs both a Phase 2 processing step and the Phase 5 quality check). The guide body carries no separate "stubbed logging" passage, so no body correction was needed — the only remaining logging item is routing the `acquire_months` skipped-month `print` through the logger.

### Part A — Previously Flagged Issues

#### A1. A from-scratch run produces only the rolling window; the deep history depends entirely on the seed

**Problem.** The live `cbsamonthly`/`statemonthly` endpoints host only a ~2-year rolling window of files. On a cold start the orchestrator enumerates months back to `earliest_month` (2010-01) via `_month_before(earliest_month)`, but every not-yet-hosted month 404s and is **skipped**, so a cold run yields only the recent rolling window — not the 2010-onward series. The 197-month dataset exists only because `BuildingPermits_06-16-25.csv` was seeded into the contract path first. Final validation's contiguity check runs across the **present** range (`present_months[0]` … `present_months[-1]`), so a recent-only series passes validation and the missing deep history is silent.

**Resolution plan.**
- This is inherent to the source (the deep history genuinely cannot be re-fetched month-by-month), so the "fix" is operational, not a code change to the enumeration: treat the seed as the deep-history system of record (A2) and make the pipeline's dependence on it explicit and enforced.
- Cross-check/augment against the Census **annual** BPS files, which *do* reach back to 2010 (see the Open Items). An annual reconstruction won't reproduce monthly grain, but it gives an independent way to validate the seeded monthly totals roll up correctly — turning "the seed is trusted blindly" into "the seed is verified against an independent source."
- Add a validation guard that distinguishes "legitimately recent-only (cold start, no seed)" from "unexpectedly lost the deep history": if history was previously present and the new series suddenly starts much later, fail loudly rather than silently accepting a truncated series. Today the contiguity check across the present range cannot catch a wholesale loss of the early months.

#### A2. The seeded history is the sole, irreplaceable system of record for pre-2024, and the pipeline reads and writes the same file

**Problem.** `config/paths.py` sets `historical_data_path == current_data_path` (both `BuildingPermits_Current.csv`), so the pipeline reads the contract as its own baseline and writes back to it, with no immutable canonical source. Combined with the rolling-window source (A1), **losing or corrupting `BuildingPermits_Current.csv` means losing 2010-2023 permanently** unless the legacy seed snapshot is retained separately — the deep history is not rebuildable from the live source. This is the same self-perpetuating pattern as the sibling modules, but here the consequence is the sharpest of all five: the other modules can, in principle, re-derive their history from a live source or a re-runnable Phase 0 build; this one cannot.

**Resolution plan.**
- Treat the pre-2024 seed as a **durable, read-only artifact** stored separately from the live output: commit `BuildingPermits_06-16-25.csv` (or a normalized V3 copy) into the repo/data tree as the immutable deep-history seed, and point `historical_data_path` at a baseline composed of (seed + accrued live months) rather than at the live output itself.
- At minimum, guarantee the seed is preserved outside the write path so a bad `Current.csv` write can never destroy it. The current archive-on-change behavior helps (it copies the old file before overwrite), but archives are timestamped-and-pruned, not a guaranteed permanent record of the irreplaceable base.
- Pair with B1 (atomic write) — given irreplaceability, a non-atomic overwrite of this specific file is the single highest-consequence robustness gap in the whole module set.

> [!question] Decision for you (A2)
> How should the irreplaceable deep history be safeguarded: **(a)** commit the seed snapshot as a permanent read-only artifact and rebuild the baseline as seed+live each run, or **(b)** keep the single-file model but add belt-and-suspenders (atomic writes + a protected, never-pruned archive of the seed)? I strongly recommend (a) — the deep history should not live only in a mutable working file plus rotating archives.

#### A3. `validate_cleaning_output` is defined and tested but never wired

**Problem.** The orchestrator imports only `validate_building_permits_dataset`; `validate_cleaning_output` has no caller in the running pipeline (the cleaners don't call it, and Phase 3 doesn't either). So its per-frame `YYYY-MM` Date-format, null-key, non-negative-integer, and known-location checks never run on live data. Same "tested but unused" smell flagged in the Housing Stress and Projections guides.

**Resolution plan.**
- Wire it into Phase 3 after `_clean_monthly_frames` (per scope) so a malformed monthly frame is caught before the merge, or delete it. Recommendation: **wire it** — the final validator does not check the `YYYY-MM` format or non-integer measures on the *incoming* rows (only non-negativity), so this validator closes a real gap at the point the raw spreadsheet is freshly parsed. It also catches an unknown location before it reaches `validate_metro_names` (which raises rather than returning messages).

#### A4. Month resolution has no fallback, though acquisition does

**Problem.** `resolve_latest_month` advances only on `BPSMonthUnavailableError`; a transient non-404 `HTTPDownloadError` (timeout / connection) or a parse `ValueError` on the newest month **propagates and fails Phase 2 outright**. Meanwhile `acquire_months` *does* fall back to saved rows on a generic exception. The asymmetry means a transient network blip during the latest-month probe aborts the whole run rather than degrading.

**Resolution plan.**
- Decide the intended posture and make it consistent. Two defensible options:
  - **Fail-fast is fine, but only on genuine faults:** add a bounded retry (2-3 attempts with backoff) on the probe's downloads so a transient blip recovers before the run aborts. A real outage still fails Phase 2, which is arguably correct (better than silently serving stale data — the opposite of the Housing Stress choice).
  - **Degrade like acquisition:** if the latest-month probe can't complete, fall back to "no new months this run" (build nothing, keep history) with a `source_failed`-style flag, matching `acquire_months`' graceful degrade.
- My recommendation: retry-then-fail-fast (keep the strictness, remove the brittleness to a single transient blip), and surface the failure clearly rather than degrading silently — the run record already carries `source_failed` for the acquisition path.

> [!question] Decision for you (A4)
> When the latest-month probe hits a transient fault, should the run **fail loudly** (current behavior, minus the single-blip brittleness once a retry is added) or **degrade to no-new-data** like `acquire_months`? I lean fail-loud-with-retry, since a wrong "latest month" silently caps the series; confirm your preference.

#### A5. Cleaner casts assume clean numeric cells

**Problem.** `clean_metro_permits` and `clean_state_permits` cast the five measures with `.astype(int)` after only a `dropna(how="all")`; a single blank or non-numeric measure cell in an otherwise-populated row raises rather than being coerced or reported. Loud failure is defensible, but it makes the cleaners brittle to a partially-populated BPS row, and the resulting error (`ValueError: invalid literal for int()`) is opaque about *which* row/month failed.

**Resolution plan.**
- Coerce explicitly and report: `pd.to_numeric(col, errors="coerce")`, then either fail with a clear message naming the offending `(Date, Location, column)` or apply a documented policy (e.g. treat a blank as 0 only where BPS semantics justify it, otherwise raise). Prefer an explicit, located error over the bare `.astype(int)` traceback.
- Tie into A3: `validate_cleaning_output` already checks non-integer measures — wiring it (A3) gives a clean, message-returning check that complements a more informative cast.

#### A6. Logging — RESOLVED since the original flag (skipped-month `print` remains)

**Update.** The "logging is stubbed" half of the original note is no longer true. The shared logging layer is fully implemented, and this orchestrator uses it more completely than the others: Phase 2 calls `log_processing_step` (acquired-month count + `source_failed`), Phase 5 calls `log_data_quality_check`, and the `__main__` entry runs through `execute_pipeline_run`, appending a JSONL run record (with `source_failed` matching the fallback-flag pattern, so a degraded run is recorded as `recovered`).

**Residual cleanup (small).**
- `acquire_months` still reports skipped (unpublished) months via `print(...)` rather than the logger. Since the skip is the *normal* cold-start path (hundreds of 404s), route it through `log_processing_step`/`log_dataframe_info` (or accept a `logger` argument) so the notice lands in the structured record instead of stdout.
- The guide body carries no separate "stubbed logging" passage, so no body correction was needed; the only remaining logging item is the skipped-month `print` above.

#### A7. `detect_new_data` relies on `DataFrame.equals` across a CSV round-trip

**Problem.** `detect_new_data` sorts both frames by all columns and uses `DataFrame.equals`. The merged frame carries in-memory dtypes (measures as `int`, freshly built) while `historical_df` came from `pd.read_csv` (dtypes inferred from the file); a dtype or precision drift reports spurious "new data." Harmless because `archive_and_save` independently no-ops on identical text, but it makes the flag untrustworthy for any consumer and always triggers the archive-compare work.

**Resolution plan.**
- Normalize dtypes before comparing (cast both frames through the same `prepare_output`-style coercion), or — simpler and authoritative — compare on the serialized CSV text, which is exactly what `archive_and_save` already uses as the real write gate. Making `detect_new_data` and the write decision share one definition of "changed" removes the discrepancy and lets the flag be trusted.

### Part B — Additional Audit Findings

#### B1. The irreplaceable contract file is written non-atomically (robustness — highest consequence of the five modules)

**Problem.** `archive_and_save` writes with `current_path.write_text(new_csv)` — a direct in-place overwrite, no `.tmp` + `replace`. Population & Housing and Components write atomically precisely to prevent a crash mid-write from corrupting the output; this module (like Projections and Housing Stress) dropped that. Here the stakes are uniquely high: the file being overwritten is the **only** copy of the irreplaceable 2010-2023 deep history (A1/A2). A process killed partway through writing the 14,691-row CSV leaves a truncated file, and `load_canonical_dataset` will `read_csv` it into a silently short frame on the next run — permanently losing deep history that cannot be re-fetched. The archive copies the old file first, so a *recent* archive exists, but archives are timestamped and subject to pruning, so this is not a guaranteed permanent safeguard of the base.

**Resolution plan.**
- Restore atomic writes: write to `current_path.with_suffix(current_path.suffix + ".tmp")`, then `os.replace(tmp, current_path)` (atomic on one filesystem). Ordering: archive old → write tmp → atomic replace.
- Combine with A2's immutable seed so that even a catastrophic loss of `Current.csv` is recoverable from the committed deep-history artifact.
- Add a test simulating a failed write and asserting the original file is intact.
- Of all the non-atomic-write findings across the five modules, this is the one to fix first: it is the only one where a single bad write destroys data that cannot be regenerated.

#### B2. The CBSA-code rename and micropolitan filter are coupled to how `xlrd` types the numeric cells (latent robustness)

**Problem.** `clean_metro_permits` renames metros by looking up `row["CBSA"]` in `_CBSA_CODE_RENAMES` (keys are Python ints `12540`, `41860`, `44700`) and drops micropolitan areas via `work["Metro /Micro Code"] != schema_config["micro_metro_code"]` (an int `5`). Both comparisons depend on the CBSA/code cells being read as **ints**. `xlrd` commonly reads numeric `.xls` cells as **floats** (e.g. `41860.0`, `5.0`), in which case `dict.get(41860.0, ...)` misses the int key and `!= 5` compares float-to-int. If the code cells come back as floats, the SF/Bakersfield/Stockton code-based renames silently no-op — leaving, for SF, the current `"San Francisco-Oakland-Fremont"` label, which is *not* in `_METRO_DISPLAY_RENAMES` (keyed on the older `"-Berkeley"` string) and therefore *not* mapped to `"San Francisco"` — so `validate_metro_names` would then raise. The module works today, which means the cells currently read as ints (or as text), but that is an implicit dependency on the parse dtype, not an enforced contract.

**Resolution plan.**
- Coerce the code columns to a canonical type before comparison: `work["CBSA"] = pd.to_numeric(work["CBSA"]).astype("Int64")` (and likewise the micro/metro code), so the int-keyed lookups and the `!= 5` filter are dtype-stable regardless of how `xlrd` typed the cell.
- Alternatively, key `_CBSA_CODE_RENAMES` and `_MICRO_METRO_CODE` on strings and stringify the cell, whichever is cleaner — the point is to remove the reliance on the parser's incidental numeric type.
- Add a test that feeds the cleaner a CBSA-code column typed as float and asserts the SF/Bakersfield/Stockton renames still fire.

#### B3. Minor: resolution re-downloads the latest month, and 404-detection sniffs the error message

**Problem.** Two smaller items:
- `resolve_latest_month` downloads (and discards) the CBSA and state `.xls` for the probed month to test availability; `acquire_months` then downloads the same latest month again. There is no caching, so the latest month's two files are fetched twice per run. This is small (two files, not the whole series) — unlike the Housing Stress caching gap — but it's avoidable.
- `_is_missing_file_error` classifies a 404 by substring-matching `"404"`/`"Not Found"` in the `HTTPDownloadError` message. If the shared downloader's message format changes, a real 404 could be misread as a transient fault (→ `resolve_latest_month` would then propagate and fail Phase 2 per A4, or `acquire_months` would fall back instead of skipping). This is the same shared-layer brittleness noted in the Housing Stress audit.

**Resolution plan.**
- Have the resolution probe return the fetched frames (or cache them keyed by month) so the resolved latest month isn't re-downloaded in `acquire_months`.
- Give the shared `HTTPDownloadError` a structured `status_code` attribute so `_is_missing_file_error` can test `error.status_code == 404` instead of sniffing the message — a shared-layer fix that benefits every module's downloader (and would let `resolve_latest_month`/`acquire_months` reliably distinguish 404 from transient faults, which A4 depends on).

#### B4. Positive: the fallback path degrades cleanly — preserve this property

**Not a defect — a strength to protect.** Unlike Housing Stress (whose fallback tiers crash the build with an `AttributeError`), this module's fallback degrades gracefully: when `acquire_months` hits a non-404 error it returns the saved rows as a *non-dict*, and `_clean_monthly_frames` detects the non-dict and returns an empty typed frame, so Phase 3 produces empty metro/state frames, `combine_with_historical` retains all history unchanged, and `detect_new_data` reports no change — the run finishes on existing history with `source_failed=True`. The `_clean_monthly_frames` non-dict guard is the mechanism. Any refactor of the acquisition/build seam (e.g. while addressing A4) should keep this clean-degrade behavior and add a regression test that a forced live failure yields the unchanged historical dataset, not a crash and not an empty output.

---

## Legacy-to-Refactored Mapping

| Legacy (`permits_code.py`) | Refactored home |
|---|---|
| six-fold pipeline in `visualize_*` try/except branches | `orchestrators/building_permits_pipeline.py::build_building_permits_dataset` (five phases) |
| `clean_and_scrape_metro/state_permits()` download walk | `acquisition/census_bps_downloader.py` |
| month-decrement fallback loop | `acquisition/source_fallback.py::resolve_latest_month` + `months_to_acquire` |
| ad-hoc scrape fallback | `source_fallback.py::acquire_months` |
| `clean_metro_permits()` (x2 copies) | `cleaning/metro_permits_cleaner.py` |
| `clean_state_permits()` (x2 copies) | `cleaning/state_permits_cleaner.py` |
| CBSA-code + "per Hans" rename dicts | `config/schemas.py` (`cbsa_code_renames`, `metro_display_renames`) |
| `msa_mapping` metro->county union + region grouping | shared `california_geography.py` (`metro_to_county_mapping`, `metro_to_region_mapping`) |
| `Geographic Level` `np.select` tag (x3) | `geography/geographic_levels.py::tag_geographic_levels` |
| `combine_permits_with_historical()` | `merging/historical_merge.py` |
| `Rest of US` + `2+ Units` derivations | frontend data-access layer (`lib/data/building_permits.js`) |
| index-to-100 / 12-month rolling / two-period change | frontend transforms |
| archive/save side effect (x6) | `output/finalize_dataset.py` |
| `visualize_line/bar/map()` (incl. random-bin imputation) | dropped; replaced by the React frontend (imputation removed) |

---

## Open Items

Each item links to the fuller problem statement and plan in "Flagged Issues and Fragilities." Ordered roughly by priority; A2 + B1 (protecting the irreplaceable deep history) are the crux and belong together.

**Data integrity (irreplaceable history)**
- [ ] **(A2 + B1)** Protect the pre-2024 deep history: commit the seed snapshot as an immutable read-only artifact, compose the baseline as seed+live, and restore atomic writes so a bad `Current.csv` write can't destroy the only copy of 2010-2023. *Decision pending: immutable seed + rebuilt baseline vs. single-file model with atomic-write + protected archive.*
- [ ] **(A1)** Cross-check the seeded monthly history against the Census **annual** BPS files (which reach back to 2010), and add a guard that fails loudly if a previously-present deep history suddenly truncates instead of silently accepting a recent-only series.

**Reliability / robustness**
- [ ] **(A4)** Add a bounded retry to `resolve_latest_month` (and decide fail-loud vs. degrade-to-no-new-data) so a transient blip on the latest-month probe doesn't abort Phase 2. *Decision pending.*
- [ ] **(B2)** Coerce the CBSA/micro code columns to a canonical dtype before the code-based rename and micropolitan filter, so the renames don't silently no-op when `xlrd` reads the codes as floats.
- [ ] **(A5)** Coerce or explicitly report non-numeric measure cells (`pd.to_numeric` + a located error) instead of letting `.astype(int)` raise an opaque traceback.
- [ ] **(A7)** Make `detect_new_data` share one definition of "changed" with the write gate (normalize dtypes, or compare serialized CSV text).
- [ ] **(B3)** Reuse the resolution probe's downloads in `acquire_months`, and give `HTTPDownloadError` a structured `status_code` so 404-vs-transient classification stops sniffing the message.

**Housekeeping**
- [ ] **(A3)** Wire `validate_cleaning_output` into Phase 3 or remove it.
- [ ] **(A6 / B4)** Route the skipped-month notice through the logger instead of `print`, and keep a regression test proving the fallback path degrades to unchanged history (not a crash) — a property this module has and Housing Stress lacks. (The stale "logging is stubbed" note is already resolved — see A6.)

**Migration**
- [ ] Step 7 (remaining): the module-specific presets and the monthly-axis integration with the year-centric shared slider (`query_shapes.js` / the temporal control granularity).

**Resolved since the original pass**
- [x] **(A6)** ~~Implement or remove the stubbed shared logging~~ — done: fully implemented and wired via `execute_pipeline_run`, and this orchestrator is the best-instrumented of the five (Phase 2 `log_processing_step` + Phase 5 `log_data_quality_check`). Only the `acquire_months` skipped-month `print` remains to route through the logger.
