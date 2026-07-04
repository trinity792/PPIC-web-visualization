---
Topic: Population and Housing
Content Type: refractor guide
pinned: false
description: "Reference guide to the refactored Population and Housing pipeline: what it produces, how each phase works, and a per-script breakdown of the modern code with its lineage from the legacy tool. First half is for curious non-programmers; second half is for programmers."
Date Published: June 22, 2026
Last Updated: 07/04/2026 - 8:52 AM
Status: Finalized
---

# Population and Housing Refractor Guide

The Population and Housing module turns two families of California Department of Finance (DoF) housing reports into a single, validated, wide CSV of population and housing estimates for every California city, town, county, region, and the state as a whole, from 1991 to the present. This document describes the module in its refactored form: the shared and Population-and-Housing-specific scripts that replaced the legacy monolith, organized around the six phases the pipeline runs.

> [!info] Who this document is for and how to read it
> This document has two halves. The first half - through "Architecture and Boundaries" - is written for someone who wants to understand what the module does and how it works without reading code: the data sources, the phases, the calculations, and the outputs. The second half is a per-script, per-function technical reference for a programmer who wants to know what each piece does and what legacy code it was derived from, faster than reading the source line by line. Nothing here modifies code; a running list of subtle issues found while documenting the module is collected under "Flagged Issues and Fragilities."

---

## What the Module Produces

The pipeline emits one canonical dataset, `PopHousing_Current.csv`, written to the cleaned-data area under `housing-population/`. Each row is one geographic place in one year, carrying population counts, a housing-unit breakdown, occupancy, and two derived rates. The dataset spans five geographic levels - City, Town, County, Region, and State - and every year from 1991 through the latest DoF release, with San Francisco represented at both the City and County levels because DoF treats it as both.

The dataset is "wide" in the sense that all of a place-year's attributes live in one row rather than being melted into a long tidy frame. The frontend visualizations for this module read this CSV directly, so the pipeline's job is to guarantee that the schema, geography, and year coverage are always complete and internally consistent before the file is overwritten.

## Data Sources

The module draws on two DoF report families, both discovered by scraping the DoF estimates landing page rather than by hard-coding file URLs that change every year.

| Source | DoF report | Coverage | Role |
|---|---|---|---|
| Modern estimates | E-5 Population and Housing Estimates | Current vintage, roughly 2020 to present | The live, refreshed portion of the dataset. |
| Historical estimates | E-8 Historical Population and Housing Estimates | 1990 to 2020, in three decade workbooks | The deep-history baseline, built once and then reused. |

The E-5 workbook is an Excel file whose second worksheet holds the data. The E-8 workbooks come in three different column layouts across the three decades they cover, which is the single biggest source of complexity in the historical side of the module.

A third "source" is the module's own prior output. The historical baseline is materialized once into a CSV, and the main pipeline reads that CSV back as its pre-2020 history on every run. This self-perpetuating history is described under "How the Pipeline Runs" and flagged under "Flagged Issues and Fragilities."

## The Dataset: Grain, Columns, and Geography

The grain of the output is one row per `(Geographic Level, Location, Year)`. That triple is the key the pipeline deduplicates on at every merge point, and the key the final validator enforces uniqueness against.

The output schema is fixed by `config/schemas.py` and applied identically to historical and modern rows so the two can be concatenated. The columns fall into four groups.

| Group | Columns |
|---|---|
| Identity | `Geographic Level`, `Location`, `Year`, `Source` |
| Population | `Total Population`, `Household Population`, `Group Quarters Population` |
| Housing units | `Total Housing Units`, `Single Family Units`, `Multiple Family Units`, `Mobile Homes`, `Occupied Units`, `Vacant Units`, and the four raw DoF sub-columns (`Single Family Detached Units`, `Single Family Attached Units`, `Two to Four Family Units`, `Five Plus Family Units`) |
| Derived rates | `Vacancy Rate (%)`, `Persons Per Household` |

Geography is where the module carries the most domain knowledge. DoF workbooks list places hierarchically: a county header, then that county's cities and towns, then a "County Total" summary, with a "State Total" at the end. The pipeline has to walk that hierarchy, attach each city to its parent county, promote "County Total" and "State Total" rows into real County and State rows, classify each remaining place as City or Town, and finally roll counties up into the nine custom PPIC regions and the state. San Francisco is deliberately duplicated into a City row and a County row, and this happens exactly once, late in the pipeline, so it is never double-counted.

## How the Pipeline Runs: Six Phases

The orchestrator `scripts/orchestrators/pophousing_pipeline.py` runs six phases in sequence, wrapping each in error handling that reports which phase failed. Each phase hands a DataFrame to the next. The historical E-8 baseline is a prerequisite built by a separate driver (described as "Phase 0" in the technical half); the six live phases below assume that baseline CSV already exists.

### Phase 1: Setup and Validation

The pipeline first loads its four configuration bundles (paths, sources, schemas, geography), then does housekeeping and a safety check. It archives or deletes E-5 workbooks older than 60 days from the download cache and writes advance "this file will be deleted" warnings at 15, 10, 5, and 1 days out. It then loads the historical CSV and runs a battery of checks on it - required columns, year coverage back to 1991, presence of State and County and City levels, a plausible California population range, null counts, and duplicate keys. If the historical baseline is malformed, the whole run aborts before any scraping happens, so a bad baseline cannot silently corrupt the output.

### Phase 2: Data Acquisition

The pipeline discovers and downloads the current E-5 workbook. It scrapes the DoF estimates page for the E-5 report heading, follows either a direct workbook link or a year-range landing page to reach the `.xlsx`, and downloads it. A local cache avoids re-downloading a workbook that is still fresh. This phase is written defensively: if discovery fails, or the download fails, the pipeline falls back to the most recent workbook already sitting in the download directory that is still within the fallback age limit. Only if no workbook can be obtained at all does the phase raise.

### Phase 3: E-5 Cleaning

The raw E-5 worksheet becomes clean, canonical rows. This is the busiest phase. The pipeline names the raw positional columns, trims the metadata rows above the first real county (anchored on "Alameda"), renames DoF's `Region`/`City` columns to the pipeline's `County`/`Location`, forward-fills the county down each block, strips summary and header rows while protecting "County Total" and "State Total," fills blank location labels down the hierarchy, parses the year, filters to the modern years, coerces the numeric columns, derives the housing-unit totals, classifies each row's geographic level using California geography, standardizes city and town names, and finally validates the result. If the cleaned frame fails validation, the phase raises rather than passing malformed data downstream.

### Phase 4: Merge Historical and Modern

The pre-2020 history and the freshly cleaned modern data are combined. The pipeline loads the historical CSV, labels it as `E-8`, filters it to years at or before 2020, checks that its schema matches the modern frame exactly, concatenates the two, and resolves any overlapping `(Location, Level, Year)` keys by an explicit source priority that prefers `E-5` over `E-8`. The result is one continuous frame from 1991 to the present with no duplicate place-years.

### Phase 5: Enrichment

The merged county-and-place data gains its regional and state rollups, and its rates are sanity-corrected. The pipeline rebuilds all nine regions by summing their member counties, fills in any California state rows for years the merged data lacks by summing all counties, and recomputes `Vacancy Rate (%)` and `Persons Per Household` for those aggregated rows from the summed components rather than averaging child rates. It then detects vacancy rates that were accidentally stored as decimal fractions (for example 0.07 instead of 7.0) and scales them to percentages, and validates that every rate now falls in a plausible range.

### Phase 6: Finalize and Output

The enriched frame is normalized one last time, validated in full, and written. The pipeline runs a final missing-level classification pass, standardizes city and town names once more, duplicates San Francisco into City and County rows, enforces the exact output column order and types, and runs the comprehensive final validator (schema, duplicate keys, valid and required levels, a California state row, a complete year span, the San Francisco City-and-County invariant, and a Bay Area 2020 population sanity check). Only if all of that passes does it archive the previous `PopHousing_Current.csv` and atomically write the new one, returning a summary of row count, year range, and per-level counts.

## Key Calculations

The module computes a small number of values rather than passing DoF's numbers through unchanged.

| Value | Definition |
|---|---|
| `Single Family Units` | `Single Family Detached Units` + `Single Family Attached Units`. |
| `Multiple Family Units` | `Two to Four Family Units` + `Five Plus Family Units`. |
| `Vacant Units` | `Total Housing Units` - `Occupied Units`. |
| `Vacancy Rate (%)` | `Vacant Units` / `Total Housing Units` x 100, or 0 when there are no units. |
| `Persons Per Household` | `Household Population` / `Occupied Units`, or 0 when there are no occupied units. |

The two rates are recomputed - never averaged - whenever a Region or State row is built, because the correct rate for an aggregate comes from its summed numerator and denominator, not from the mean of its children's rates. The decimal-fraction correction exists because some DoF vintages express the vacancy rate as a fraction between 0 and 1; the pipeline detects recent non-state rates in that suspicious band and multiplies them by 100.

## Architecture and Boundaries

The refactor's organizing rule is a hard separation between project-independent mechanisms and Population-and-Housing domain knowledge.

- `scripts/shared/` holds generic, dataset-agnostic mechanisms - HTTP downloads, file retention, type coercion, row filtering, DataFrame validation, and the shared California reference geography. Shared code receives column names, patterns, paths, and thresholds as arguments; it never imports Population-and-Housing configuration.
- `scripts/pophousing/` holds E-5 and E-8 schemas, California geography rules, housing formulas, source-specific parsing, and pipeline-specific validation. It may import from `scripts/shared/` but nothing in `shared/` may import from it.
- `scripts/orchestrators/pophousing_pipeline.py` sequences the phases and owns error handling and the output summary. It contains no transformation logic of its own.

The dependency direction is strictly one-way: `shared helpers` are imported by `pophousing modules`, which are coordinated by the orchestrator. The same California geography reference in `scripts/shared/geography/california_geography.py` is deliberately shared with the Components of Change and Building Permits modules, so the county, region, and metro definitions have a single owner. This mirrors the structure adopted across the other module migrations; see [[projectSpec]] for the canonical five-phase pipeline model and the audit-status conventions.

---

## Technical Reference

The rest of this document walks every script the module comprises, grouped by the phase it serves, with configuration and shared helpers first because every phase depends on them. For each function it gives what the function does, the notable libraries it relies on, any performance or efficiency characteristic worth knowing, and what legacy code it was derived from. The legacy module was a small number of large files - `pophousing_pipeline.py` (the `main()` monolith), `data_cleaning_utils.py`, `enhanced_forward_fill_helpers.py`, `historical_data_processor.py`, `download_historical_data.py`, `run_original_pipeline.py`, `logging_config.py`, and `pophousing_config.py`. The refactor split those into the many small, single-responsibility modules below.

Every module follows the same file convention: a docstring header naming its data sources, outputs, usage, and test folder; banner comments separating sections; and one-line docstrings on each function that name the test file covering it.

## Configuration Modules

Configuration was one legacy file, `pophousing_config.py`, a flat list of module-level constants imported directly everywhere. The refactor keeps the raw constants in `lib/pophousing_config.py` but exposes them through four accessor modules that return defensive copies, so no pipeline module mutates shared state and each phase pulls only the slice of config it needs.

### `lib/pophousing_config.py`

The raw constant store. It defines the DoF base URL, request headers and timeout (pulled from the project-wide `lib/config.py`), all file paths, the fifteen raw E-5 column names, the region-to-county `REGIONS_MAPPING`, the county list, the town list, ambiguous city names, city-name mappings, historical name standardizations, and cache-age limits. This is the direct descendant of the legacy `pophousing_config.py`, trimmed to values that are genuinely Population-and-Housing-specific. It imports `get_default_http_settings` and `get_project_paths` from `lib/config.py` rather than hard-coding paths and headers.

> [!warning] `HISTORICAL_DATA_PATH` and `CURRENT_DATA_PATH` are the same file
> `HISTORICAL_DATA_PATH = CURRENT_DATA_PATH`, so the pipeline reads its own prior output as its historical baseline. See "Flagged Issues and Fragilities."

### `config/paths.py`

One function, `get_paths()`, returns a dict of `pathlib.Path` objects for the project root, download directory, archive directory, current output path, historical input path, and deletion-log directory. It wraps the raw string constants from `lib/pophousing_config.py` in `Path`. Derived from the path constants that were scattered through the legacy config and `main()`.

### `config/sources.py`

`get_source_settings()` returns the DoF base URL, a fresh copy of the request headers, the timeout, the E-5 cache and fallback age limits, and the four regex patterns used to find the E-5 heading, landing page, workbook link, and filename. Derived from the scraping constants formerly embedded in the legacy download functions. Isolating them here is what lets the acquisition scraper take all its policy as arguments.

### `config/schemas.py`

`get_schema_config()` builds the largest config bundle: the raw E-5 column names, the `Region`/`City` to `County`/`Location` rename mapping, the "Alameda" data anchor, the numeric and zero-fill column lists, the summary and header row patterns, the meaningful-data columns, the full ordered `output_columns`, and two nested validation configs (`cleaning_validation` and `final_validation`). It imports `date` from `datetime` so the final validator's `maximum_year` is always the current year. Derived from the column lists and the many inline validation thresholds that lived in legacy `data_cleaning_utils.py` and `main()`. The single source of the output schema now lives here, which is what guarantees historical and modern frames share an identical shape before concatenation.

### `config/geography.py`

`get_geography_config()` composes the shared California reference (state name, county names, region names, region-to-county mapping) from `scripts/shared/geography/california_geography.py` with the Population-and-Housing-specific town list, ambiguous city names, protected "proper names ending in City," city-name mappings, and historical name standardizations, plus the valid levels, default level, and the San Joaquin population threshold used to disambiguate the city from the county. Derived from the geography constants in the legacy `pophousing_config.py` and the classification thresholds hard-coded in `enhanced_forward_fill_helpers.py`.

> [!note] Config is rebuilt on every call
> `get_geography_config()` and `get_schema_config()` construct fresh dicts each call. Several cleaning functions call `get_geography_config()` internally rather than receiving it as an argument, so it can be rebuilt many times per run. This is a minor efficiency cost, noted per-function below.

## Shared Helpers

These are the dataset-agnostic mechanisms in `scripts/shared/`. They were extracted from the generic operations buried inside legacy `data_cleaning_utils.py`, `download_historical_data.py`, and the inline file work in `main()`.

### `shared/downloads/http_downloads.py`

Imports `requests` and `pathlib`. Defines `HTTPDownloadError`, a single normalized exception for every request failure. `fetch_response(url, headers, timeout)` performs a GET, raises on HTTP errors, and translates `requests.Timeout`, `ConnectionError`, `HTTPError`, and the general `RequestException` into `HTTPDownloadError` with a descriptive message. `download_file(url, destination_path, headers, timeout)` streams the response to a `.part` temporary file and then atomically `replace`s it into place, cleaning up the temp file in a `finally` block so a failed download never leaves a half-written workbook. Derived from the raw `requests.get` calls duplicated across the legacy E-5 and E-8 downloaders. The atomic-write pattern is new and is the reason a mid-download crash cannot corrupt the cache.

### `shared/archives/file_retention.py`

Imports `re`, `shutil`, `time`, and `pathlib`. `find_files_older_than(directory, max_age_days, filename_pattern)` returns the sorted list of files whose name fully matches the pattern and whose modification time is at or beyond the age cutoff, validating the directory exists first. `archive_or_delete_files(file_paths, archive_directory)` moves each file into the archive with a numeric suffix if a name collides, or permanently deletes it when no archive directory is given, skipping files that no longer exist. Derived from the inline `os.rename` archive step and the deletion logic in legacy `cleanup_old_e5_files()`, generalized so any module can reuse it.

### `shared/data_cleaning/type_conversions.py`

Imports `pandas`. `parse_year_from_date(dataframe, date_col, out_col)` parses a date column with `pd.to_datetime(..., format="mixed")` and extracts a nullable `Int64` year. `coerce_numeric_columns(dataframe, numeric_cols)` strips thousands separators and coerces each named column with `pd.to_numeric(errors="coerce")`. Both return copies and validate that the columns exist. Derived from the repeated date-parsing and numeric-coercion snippets in legacy `data_cleaning_utils.py`.

### `shared/data_cleaning/row_filters.py`

Imports `pandas`. Four vectorized row filters, each returning a reindexed copy: `filter_year_range` keeps rows within inclusive year bounds; `remove_summary_rows` drops rows matching configured "Balance of" / "Incorporated" patterns while protecting values like "County Total" and "State Total"; `remove_header_like_rows` drops rows matching header patterns such as "Cities and Towns"; and `drop_empty_rows_without_data` drops rows that have neither a real location nor any positive numeric value across the configured data columns. Derived from the inline filtering in legacy `clean_common_e5()`, which did the same work row by row.

> [!note] Vectorized where the legacy code looped
> These filters use boolean-mask indexing rather than the legacy per-row Python loops, which is the largest single performance improvement in the cleaning path.

### `shared/data_cleaning/dataframe_operations.py`

Pure pandas, no imports beyond the DataFrame API. `forward_fill_columns(dataframe, columns)` forward-fills the named columns in a copy. `assign_values_from_mapping(dataframe, source_col, target_col, value_mapping)` maps source values into a target column while keeping unmatched originals. Derived from the forward-fill and conditional-assignment helpers in legacy `data_cleaning_utils.py`. `assign_values_from_mapping` is not used by this module but is consumed by the Components of Change census cleaner, which is exactly the cross-module reuse the shared tree is meant to enable.

### `shared/validation/dataframe_validators.py`

Imports `pandas`. Five generic checks: `validate_required_columns` returns missing columns; `validate_not_empty` reports whether any rows exist; `find_duplicate_rows` returns every row participating in a duplicate key; `validate_null_counts` returns per-column positive null counts; and `validate_numeric_range` returns rows outside optional inclusive bounds, optionally restricted to a row mask that must align with the frame's index. Derived from the seven inline checks in legacy `validate_historical_data()` and the range checks scattered through `main()`. These are the primitives the Population-and-Housing validators compose.

### `shared/geography/california_geography.py`

Imports the county list and region mapping from `lib/pophousing_config.py`. `get_california_geography()` returns the state name, the county set (with San Francisco added as a county), the region names, the region-to-county mapping, and the 26 CBSA metros with their metro-to-county and derived metro-to-region groupings. The helper `_derive_metro_to_region` verifies each metro nests within exactly one region and raises otherwise. Derived from the county and region constants formerly private to `pophousing_config.py`, plus the `msa_mapping` lifted out of the legacy Building Permits `permits_code.py`. This is the single shared owner of California geography for three modules.

### `shared/logging/pipeline_logging.py` and `shared/logging/dataframe_logging.py`

Both files are present but every function body is `pass` and every test folder is "Not yet implemented." They define the planned interface - `setup_logging`, `get_logger`, `close_logging`, `log_processing_step`, `log_dataframe_info`, `log_data_quality_check` - that will replace the legacy `logging_config.py`. Until they are implemented, the pipeline runs without structured logging. See "Flagged Issues and Fragilities."

## Phase 0: Building the Historical E-8 Baseline

This is the prerequisite that produces the historical CSV the six live phases consume. It replaces the legacy `download_historical_data.py` and `historical_data_processor.py`. Its scripts are not wired into `pophousing_pipeline.py`; they are run as a one-time (or occasional re-seed) build. Because the E-8 workbooks come in three decade layouts, this side of the module carries the most format-detection logic.

### `acquisition/dof_historical_downloader.py`

Imports `re`, `pathlib`, `urllib.parse`, `bs4.BeautifulSoup`, and the shared HTTP helpers. Defines `E8DiscoveryError`. `get_historical_landing_page_urls(base_url, ...)` scrapes the DoF estimates page for the E-8 historical heading and returns the landing-page links beneath it. `find_geography_workbook_url(page_url, ...)` opens a landing page and returns the "Organized by Geography" workbook link, or `None` if absent. `download_historical_e8_files(download_dir, source_settings)` walks every landing page, downloads each geography workbook via the shared `download_file`, and continues past any single broken link so one dead report does not abort the batch. Derived from legacy `download_historical_data.py`, with the generic request and file-write mechanics moved into `shared/downloads/`.

### `historical/e8_format_detection.py`

Imports `pandas`. `detect_e8_file_format(raw_e8_df, search_rows=500)` scans up to 500 rows for the position of the "County Total" label: first column means the older 1990-2000 and 2000-2010 single-column layout (`old_format`), second column means the 2010-2020 layout that mirrors the modern E-5 (`new_format`), defaulting to `new_format`. Derived from the format-branching that was inline in legacy `historical_data_processor.py`. The label position is the cheapest reliable signal for distinguishing the layouts.

### `historical/e8_schema_normalizer.py`

Pure pandas. `normalize_e8_columns(raw_e8_df, format_config)` assigns a layout's positional column names to the first N columns, tolerating and dropping surplus trailing layout columns but raising if the frame is too narrow, then applies an optional rename mapping. Derived from the per-decade column-assignment code in legacy `historical_data_processor.py`. It is the E-8 analogue of the modern `e5_schema_normalizer.normalize_e5_columns`, but forgiving of extra columns because E-8 workbooks carry trailing junk.

### `historical/e8_era_cleaners.py`

Imports `pandas` and reuses the modern cleaning, classification, standardization, and metric functions plus the shared filters and type conversions - a deliberate demonstration that historical and modern data share one set of cleaners. It defines two column layouts (`_OLD_FORMAT_COLUMNS_12` and `_OLD_FORMAT_COLUMNS_13`, differing only in whether an explicit `Vacant Units` column is present).

- `clean_1990_2000` and `clean_2000_2010` both delegate to `_clean_old_format`, since those two decades share the single-column hierarchical layout.
- `clean_2010_2020` cleans the modern-style layout by reusing the exact E-5 steps: normalize columns, rename schema, forward-fill county, remove summary and header rows, forward-fill locations, drop empty rows, build county context, coerce numerics, derive housing columns, then classify and standardize. It keeps the raw date in the `Year` column so that census (April 1) rows can be dropped later during standardization.
- `_clean_old_format` flattens the single-column layout: it picks the 12- or 13-column schema by width, blanks placeholder locations, coerces numerics, derives `Vacant Units` when absent, identifies county-header rows, attaches each block's parent county, drops the header rows, forward-fills locations, drops empty rows, and classifies and standardizes.
- `_attach_block_county` forward-fills the parent county down each block, resetting to NA at state-total boundaries.
- `_classify_and_standardize` is the shared tail both paths call: resolve county-total rows, normalize state-total rows, assign missing levels, apply town overrides, sanitize levels, standardize names, and remove balance rows.

Derived from the three decade-specific branches of legacy `historical_data_processor.py`, refactored so the decade-specific work is only the column layout and the block-county handling, and everything downstream is the shared classification tail.

### `historical/e8_standardization.py`

Imports `pandas` and the shared `coerce_numeric_columns`. `extract_annual_year(date_series)` parses dates and returns the year, masking April 1 census rows and unparseable dates to NA so the January 1 annual estimate is the canonical row for each year. `standardize_e8_data(df, year_start, year_end)` parses years, drops census rows, bounds the frame to the era's years, coerces numerics, and scales pre-2020 fractional vacancy rates to percentages via `_normalize_decimal_vacancy_rates`. Derived from the common post-clean standardization step in legacy `historical_data_processor.py`. The census-row drop is the historical analogue of a subtlety that the modern E-5 does not have, since E-5 carries only annual estimates.

### `historical/boundary_year_resolution.py`

Pure pandas. `resolve_boundary_year_overlaps(df, source_priority)` keeps one row per `(Location, Level, Year)` when a boundary year such as 2000 or 2010 appears in two adjacent decade workbooks, preferring the higher-priority (more recent) source. It does this with a stable-sort-then-`drop_duplicates` strategy, defensively generating non-colliding temporary priority and original-order column names, and validates that every observed source is named in the priority list. Derived from the boundary-overlap resolution in legacy `historical_data_processor.py`. The same stable-sort dedup pattern is reused verbatim by the modern `resolve_source_overlap` and `deduplicate_geographic_rows`.

### `historical/missing_county_recovery.py`

Imports `pandas` and reuses the E-8 normalizer, the E-5 schema rename, the housing-metric derivation, the annual-year extractor, and the shared forward-fill and coercion helpers. `extract_missing_county_rows(raw_e8_df, target_years)` pulls the "County Total" rows for target years straight from the raw 2010-2020 workbook, promoting each to a real County row - recovering county totals that the era cleaner drops. `integrate_missing_county_rows(historical_df, missing_county_df)` appends only those recovered rows whose keys are not already present, computing existing keys as a set of tuples for an O(1) membership test. Derived from the missing-county repair step in legacy `historical_data_processor.py`.

### `historical/historical_pipeline.py`

Imports `pandas`, the schema config, and every historical module above. `build_historical_housing_dataset(file_configs)` is the Phase 0 entry point: it normalizes the per-era configs, loads each workbook (or accepts a pre-read frame for testing), runs the era cleaner, standardizes, tags each era with its source label, concatenates, resolves boundary overlaps, recovers missing counties, resolves overlaps again, and finalizes to the canonical schema and sort order. The private helpers `_normalize_file_configs`, `_resolve_clean_func`, `_load_raw_workbook`, and `_finalize_historical_dataset` handle config shapes, cleaner lookup by name or callable, workbook reading, and final schema enforcement. Derived from the top-level driver logic of legacy `historical_data_processor.py`. This function has no non-test caller, so it is run manually to seed or refresh the historical CSV; see "Flagged Issues and Fragilities."

## Phase 1: Setup and Validation

### `archives/e5_retention.py`

Imports `math`, `re`, `time`, `datetime`, `pathlib`, and the shared `file_retention` helpers. `cleanup_old_e5_files(...)` lists cached E-5 workbooks, optionally writes deletion warnings, then archives the expired ones via `find_files_older_than` and `archive_or_delete_files`. `write_deletion_warnings(file_paths, warning_days, deletion_log_directory, max_age_days=60)` computes each file's remaining days with `math.ceil` and writes one idempotent warning file per configured threshold, sanitizing the filename and skipping a warning that already exists. Derived from legacy `cleanup_old_e5_files()`, which did all of this inline; the generic age-lookup and disposition mechanics now live in `shared/archives/`.

### `validation/historical_data_validator.py`

Imports `pandas`, `pathlib`, and the shared validators. `validate_historical_housing_data(file_path, validation_config)` loads the historical CSV and runs the full battery: not-empty, required columns, valid and complete years, expected geographic levels, no negative populations, a minimum count of California state records, a plausible recent-state-population mean, per-column null limits, and duplicate keys. It returns `(is_valid, messages)` rather than raising, so the orchestrator decides how to react. Derived from the legacy `validate_historical_data()` worker, with the seven generic checks now delegated to `shared/validation/dataframe_validators.py` and only the Population-and-Housing-specific composition kept here.

## Phase 2: Data Acquisition

### `acquisition/dof_e5_downloader.py`

Imports `re`, `time`, `pathlib`, `urllib.parse`, `zipfile.BadZipFile`, `pandas`, `bs4.BeautifulSoup`, and the shared HTTP helpers. Defines `E5DiscoveryError` and the module-level `E5_FILENAME_PATTERN`.

- `get_e5_file_url(source_settings)` scrapes the estimates page for the E-5 heading, then either returns a direct workbook link found in the heading's list, or follows a year-range landing page and finds the workbook there. It raises `E5DiscoveryError` at each point discovery can fail. Derived from the legacy `get_e5_file_url()` two-request scraper.
- `get_e5_filename_from_url(url, filename_pattern=...)` extracts the filename from a URL path, URL-decoding it, and validates it against the E-5 pattern. Pure string work, derived from the legacy three-line worker of the same name.
- `download_e5_data(url, download_directory, cache_max_age_days, headers=None, timeout=60)` returns cached data when a fresh, readable workbook already exists, otherwise downloads and reads it. It tolerates a corrupt cache file by catching `BadZipFile`/`OSError`/`ValueError` and falling through to a fresh download. Derived from the legacy `download_e5_data()`, which handled caching and reading inline.
- `get_most_recent_e5_file(download_directory, filename_pattern, fallback_max_age_days)` is the fallback path: it sorts matching cached workbooks newest-first and returns the first one within the age limit that reads cleanly. Derived from the legacy `get_most_recent_e5_file()`.
- `_read_e5_workbook(workbook_path)` opens the `.xlsx` with `pd.ExcelFile`, requires at least two sheets, and reads the second sheet, raising a clear error if `openpyxl` is missing. This centralizes the "data lives on sheet two" rule.

The generic request and binary-write mechanics are gone from this file entirely; it composes `fetch_response` and `download_file` from `shared/downloads/`.

## Phase 3: E-5 Cleaning

This phase is coordinated by `e5_pipeline.py` and draws on five cleaning and calculation modules plus a validator. Together they replace legacy `clean_e5_data()`, `clean_common_e5()`, `add_geographic_level_e5()`, the classification helpers in `enhanced_forward_fill_helpers.py`, and the cleaning parts of `data_cleaning_utils.py`.

### `cleaning/e5_schema_normalizer.py`

Pure pandas. `normalize_e5_columns(raw_e5_df, column_names)` assigns the fifteen configured names after asserting the worksheet width matches exactly. `trim_to_first_data_row(raw_e5_df, anchor_value, column)` drops the metadata rows above the first "Alameda" row. `rename_e5_schema(raw_e5_df, mapping)` renames `Region`/`City` to `County`/`Location`. Derived from the column-assignment, header-trimming, and rename work that opened legacy `clean_e5_data()`.

### `cleaning/hierarchical_location_cleaning.py`

Imports `pandas` and `get_geography_config`. `has_meaningful_housing_data(row, value_columns)` reports whether any of a row's housing values is positive - a row-level check retained for parity but not wired into the live pipeline, which uses the vectorized `drop_empty_rows_without_data` instead. `identify_county_headers(df, county_names, location_col)` finds county-name rows that are followed within ten rows by a "County Total," marking them as headers; it is a Python scan with a bounded lookahead. `forward_fill_locations_with_context(df, location_col, county_col)` blanks empty location labels and forward-fills them - a vectorized `ffill` that replaces the legacy ~100-line row-by-row loop. `build_county_context_column(df, location_col, county_col, temp_col)` creates the `_temp_county` column used later to turn "County Total" rows into named counties, using a vectorized fill when a county column exists and a header-scan loop otherwise. Derived from `enhanced_forward_fill_helpers.py` and the forward-fill loop inside legacy `clean_common_e5()`.

### `cleaning/geographic_classification.py`

Imports `pandas` and `get_geography_config`. This module owns all geographic-level logic.

- `classify_ambiguous_location(...)` resolves a name that could be a city or a county using row context, a ten-row "County Total" lookahead, and the San Joaquin population threshold. It calls `get_geography_config()` on every invocation.
- `assign_geographic_level_with_context(location, county_context, population, housing_row, geography_config)` is the row classifier used across the module: State, Region, County, Town, ambiguous, or the default City. It receives config as an argument.
- `resolve_county_total_rows` replaces "County Total" labels with the block's county name and sets the level to County.
- `normalize_state_total_rows` renames "State Total" to California and sets the level to State.
- `assign_missing_geographic_levels(df, classifier_fn, ...)` classifies only the rows whose level is still missing, looping over those rows and writing each result with `.at`.
- `apply_town_overrides` forces configured towns to the Town level.
- `sanitize_geographic_levels` replaces any invalid level with the default.
- `remove_balance_rows` drops "Balance of" summary rows.
- `drop_helper_columns` removes the temporary `County` and `_temp_county` columns.
- `standardize_san_francisco_classification` duplicates San Francisco into a City row and a County row, deduplicating first so it never expands more than once.

Derived from legacy `add_geographic_level_e5()`, `add_geographic_level()`, `standardize_san_francisco_classification()`, and the classifier functions in `enhanced_forward_fill_helpers.py`. Keeping one classifier for both historical and modern data is the reason the historical era cleaners can import this module directly.

> [!note] The lookahead branch is bypassed in the missing-level pass
> When `assign_missing_geographic_levels` calls `assign_geographic_level_with_context`, ambiguous names route to `classify_ambiguous_location` with `housing_df=None`, so its ten-row "County Total" lookahead cannot fire in that path. See "Flagged Issues and Fragilities."

### `cleaning/location_standardization.py`

Imports `re`, `pandas`, and `get_geography_config`. `standardize_location_column(df, location_col, geo_col, only_levels)` maps city and town names through the canonical and historical name mappings and strips a trailing " City" suffix unless the name is a protected proper name (like "Daly City"), applying only to the selected levels via an inner `standardize_name` helper. Derived from the inline `clean_name()` inside legacy `clean_common_e5()` and the separate legacy `standardize_city_names()`, consolidated into one implementation that both Phase 3 and Phase 6 call.

### `calculations/housing_metrics.py`

Imports `numpy` and `pandas`. `add_housing_derived_columns(df)` computes `Single Family Units`, `Multiple Family Units`, and `Vacant Units` from the raw sub-columns, coercing to numeric and filling NA with 0. `recalculate_housing_rates(df, row_mask)` recomputes `Vacancy Rate (%)` and `Persons Per Household` for the masked rows using `np.where` to guard against division by zero, and requires the mask to align with the frame's index. Derived from the derived-column and rate calculations that were duplicated across legacy cleaning, regional, and state code; this module is now their single implementation. `add_housing_derived_columns` runs in Phase 3; `recalculate_housing_rates` is called from the Phase 5 aggregators.

### `validation/cleaning_validators.py`

Imports `pandas`. `validate_cleaned_e5_data(df, validation_config)` checks the cleaned frame for emptiness, required columns, null critical columns, duplicate keys, invalid levels, and negative numerics, returning `(is_valid, messages)`. Derived from the validation tail that legacy `clean_e5_data()` performed inline.

### `cleaning/e5_pipeline.py`

The Phase 3 orchestrator. `clean_e5_data(raw_e5_df, schema_config, geography_config)` runs the full sequence described in the phase narrative - normalize, trim, rename, forward-fill county, filter summary and header rows, forward-fill locations, drop empties, build county context, parse and filter year, coerce numerics, zero-fill, derive housing columns, resolve county and state totals, assign missing levels, apply town overrides, sanitize levels, standardize names, remove balance rows, drop helpers, set `Source` to `E-5`, enforce output columns, and validate - raising if validation fails. It imports from every Phase 3 module plus the shared filters, type conversions, and operations. Derived from the legacy `clean_e5_data()` hybrid function, which mixed orchestration with inline transformation; the transformation now lives in the imported modules and this file is pure sequencing.

## Phase 4: Merge Historical and Modern

### `merging/historical_modern_merge.py`

Imports `pathlib`, `pandas`, and the schema config. `load_historical_housing_data(historical_file_path)` reads the historical CSV, checks it is non-empty and schema-complete, selects the canonical columns, and labels every row `E-8`. `filter_historical_years(df, max_year)` validates the `Year` column, converts it to `Int64`, and keeps rows at or before the boundary. `merge_historical_and_modern_data(historical_df, modern_df)` verifies both frames have identical column sets, aligns column order, and concatenates. `resolve_source_overlap(df, key_columns, source_priority)` deduplicates overlapping keys by the `E-5`-over-`E-8` priority, using the same stable-sort strategy and defensive temp-column naming as the historical boundary resolver, and validates there are no null keys or unknown sources. Derived from the inline historical load, filter, concat, and `drop_duplicates` that legacy `main()` performed in Phase 4.

## Phase 5: Enrichment

### `aggregation/aggregation_utils.py`

Imports `pandas`. `remove_existing_geographic_level(df, level_col, level_name)` drops rows of a given level so aggregates can be rebuilt cleanly. `deduplicate_geographic_rows(df, location_col, year_col, level_col, preferred_level)` keeps one row per location-year, preferring a chosen level, via the stable-sort dedup pattern. `_aggregate_additive_columns(df, group_col, excluded_columns)` sums the additive numeric columns by group with `groupby(...).sum(min_count=1)`, dynamically detecting which columns are safely additive by checking that every originally non-null value converts to a number. Derived from the deduplication and groupby-aggregation logic inside legacy `add_regional_data()` and `add_state_data_for_modern_years()`.

### `aggregation/regional_aggregation.py`

Imports `pandas`, the aggregation helpers, and `recalculate_housing_rates`. `build_regional_rows(df, regions_mapping, ...)` deduplicates county rows, sums each region's member counties into a Region row, blanks the rate columns (to be recomputed), and labels the source `Aggregated`. `add_regional_data(df, regions_mapping)` strips existing Region rows, rebuilds them, concatenates, and recomputes the two rates for the new Region rows. Derived from legacy `add_regional_data()`, with the shared additive-sum and dedup moved into `aggregation_utils` and the rate recomputation moved into `housing_metrics`.

### `aggregation/state_aggregation.py`

Imports `pandas`, the aggregation helpers, and `recalculate_housing_rates`. `find_missing_state_years(df, state_name, year_col)` returns county years that lack a matching California state row. `build_state_rows_from_counties(df, missing_years, state_name)` sums all counties for those years into State rows with blanked rates and an `Aggregated` source. `add_state_data_for_missing_years(df, state_name)` appends those rows and recomputes their rates, masking exactly the newly added rows by index position. Derived from legacy `add_state_data_for_modern_years()`.

### `calculations/rate_normalization.py`

Imports `pandas`. `find_decimal_fraction_rates(df, year_col, rate_col, level_col, min_year)` returns a boolean mask of recent, non-state vacancy rates sitting in the suspicious 0.01-to-1.0 band. `normalize_decimal_fraction_rates(df, rate_col, mask)` multiplies the masked rates by 100 and rounds, requiring the mask to align with the index. Derived from legacy `fix_vacancy_rate_decimal_fractions()`, split into a pure detector and a pure transformer.

### `validation/aggregation_validators.py`

Imports `pandas` and the shared `validate_numeric_range`. `validate_normalized_housing_rates(df, year_col, rate_col, level_col)` confirms every vacancy rate is within 0 to 100 and that no recent non-state rate still looks like a decimal fraction, returning `(is_valid, messages)`. Derived from the validation portion of legacy `fix_vacancy_rate_decimal_fractions()`, composed on top of the shared range validator.

## Phase 6: Finalize and Output

Phase 6 reuses the Phase 3 classification and standardization functions as a final normalization pass, then finalizes and writes. The reused functions - `assign_missing_geographic_levels`, `standardize_location_column`, and `standardize_san_francisco_classification` - are documented under Phase 3; the point of the refactor is that Phase 6 owns no duplicate copies of them.

### `output/finalize_dataset.py`

Imports `pathlib` and `pandas`. `prepare_housing_output(df, source_name, output_columns, sort_columns)` sets the source, validates and stringifies the year, enforces the exact output column order, and sorts, all without mutating the input. `write_housing_output(df, output_path)` writes to a `.tmp` file and atomically `replace`s it into the final path, cleaning up on failure. Derived from the inline source-setting, column-reordering, sorting, and CSV-writing at the end of legacy `main()`. The atomic write is new and is what makes the "archive then overwrite" step safe.

### `validation/final_dataset_validator.py`

Imports `pandas` and the shared validators. `validate_final_housing_dataset(df, validation_config)` is the most thorough check in the module: schema completeness, duplicate output keys, null and invalid and missing geographic levels, presence of a California state row, a complete year span with no future years, the San Francisco City-and-County invariant (and never more than twice per year), a Bay Area 2020 population sanity range, and nonnegative and in-range numeric columns. It returns `(is_valid, messages)`. Derived from the final duplicate check, Bay Area sanity check, and schema enforcement that legacy `main()` did inline before writing.

### `orchestrators/pophousing_pipeline.py`

Imports `pandas` and every phase entry point. `main()` runs the six phases inside per-phase `try/except` blocks, wrapping any failure in `PipelinePhaseError` via `_raise_phase_error` so a failure is always attributed to a named phase. It owns the E-5 acquisition fallback chain (discover, download, most-recent-cache), the historical validation config, the merge keys and source priority, the enrichment calls, the final normalization and validation, the archive-then-write, and the returned summary dict. It contains no transformation logic. Derived from the legacy `main()` monolith and the subprocess-based `run_original_pipeline.py`, both of which are fully replaced; the interactive "continue after failure?" prompt of the legacy runner is gone in favor of structured exceptions.

## Flagged Issues and Fragilities

These were noted while documenting the module. Per the task, they are recorded here rather than fixed.

> [!warning] The historical baseline is the pipeline's own prior output
> `HISTORICAL_DATA_PATH = CURRENT_DATA_PATH` in `lib/pophousing_config.py`, so Phase 4 loads `PopHousing_Current.csv`, filters it to years at or before 2020, and Phase 6 writes back to the same file. The pre-2020 history therefore comes from the previous run's output, not from an immutable canonical E-8 file. The Phase 0 historical builder seeds this file once, but if a bad run ever writes malformed pre-2020 rows and passes validation, that corruption becomes the next run's "history." The Phase 1 historical validator is the main guard against this. This is the same self-perpetuating-history pattern noted for the Building Permits module.

> [!warning] The Phase 0 historical build is not wired into any orchestrator
> `build_historical_housing_dataset` and `download_historical_e8_files` have no non-test callers. Refreshing the historical baseline is a manual operation, and there is no automated check that the seeded CSV is current with the latest E-8 release. A reader expecting the main pipeline to rebuild history will not find that wiring.

> [!warning] Structured logging is unimplemented
> `scripts/shared/logging/pipeline_logging.py` and `dataframe_logging.py` are stubs whose bodies are all `pass`, with test folders marked "Not yet implemented." The orchestrator performs no logging, so a production run leaves no structured progress or data-quality record. Several module docstrings still describe logging behavior that does not yet exist.

> [!note] `has_meaningful_housing_data` is retained but unused in the live path
> The function exists in `hierarchical_location_cleaning.py` and is tested, but the wired pipeline uses the vectorized `drop_empty_rows_without_data` instead. It is effectively parity code kept for row-level callers that do not currently exist.

> [!note] The ambiguous-location lookahead is bypassed during the missing-level pass
> `assign_geographic_level_with_context` calls `classify_ambiguous_location` with `housing_df=None` and `row_index=None`, which disables that function's ten-row "County Total" lookahead. In the main `assign_missing_geographic_levels` loop, ambiguous names are therefore resolved only by the town list and the San Joaquin population threshold, not by the neighbor scan. Whether that is intended is worth confirming, since the lookahead branch is only reachable when the function is called directly with a DataFrame.

> [!note] Config bundles are rebuilt on every call
> `get_geography_config()` is invoked inside `classify_ambiguous_location`, `assign_missing_geographic_levels`, `build_county_context_column`, and `standardize_location_column` rather than being threaded through as an argument. During the per-row classification loop this rebuilds the geography dict repeatedly. The cost is small relative to the pandas work, but it is avoidable by passing the config down.

## Legacy-to-Refactored Mapping

A one-line index from each legacy unit to where its behavior now lives.

| Legacy unit | Refactored home |
|---|---|
| `main()` monolith | `orchestrators/pophousing_pipeline.py` |
| `run_original_pipeline.py` | Replaced by the orchestrator (subprocess runner removed) |
| `cleanup_old_e5_files()` | `archives/e5_retention.py` + `shared/archives/file_retention.py` |
| `validate_historical_data()` | `validation/historical_data_validator.py` + `shared/validation/dataframe_validators.py` |
| `get_e5_file_url()`, `download_e5_data()`, `get_most_recent_e5_file()`, `get_e5_filename_from_url()` | `acquisition/dof_e5_downloader.py` + `shared/downloads/http_downloads.py` |
| `clean_e5_data()` | `cleaning/e5_pipeline.py` (orchestration) + the Phase 3 modules |
| `clean_common_e5()` | `shared/data_cleaning/row_filters.py` + `cleaning/hierarchical_location_cleaning.py` + `cleaning/location_standardization.py` |
| `add_geographic_level_e5()`, `add_geographic_level()` | `cleaning/geographic_classification.py` |
| `enhanced_forward_fill_helpers.py` | `cleaning/hierarchical_location_cleaning.py` + `cleaning/geographic_classification.py` |
| `data_cleaning_utils.py` | Split across `shared/data_cleaning/`, `shared/validation/`, `cleaning/`, and `calculations/` |
| `standardize_city_names()` | `cleaning/location_standardization.py` |
| `standardize_san_francisco_classification()` | `cleaning/geographic_classification.py` |
| Phase 4 inline merge | `merging/historical_modern_merge.py` |
| `add_regional_data()` | `aggregation/regional_aggregation.py` + `aggregation/aggregation_utils.py` |
| `add_state_data_for_modern_years()` | `aggregation/state_aggregation.py` |
| `fix_vacancy_rate_decimal_fractions()` | `calculations/rate_normalization.py` + `validation/aggregation_validators.py` |
| Housing formulas and rate math | `calculations/housing_metrics.py` |
| Phase 6 finalize and write | `output/finalize_dataset.py` + `validation/final_dataset_validator.py` |
| `download_historical_data.py` | `acquisition/dof_historical_downloader.py` + `shared/downloads/http_downloads.py` |
| `historical_data_processor.py` | The seven `historical/` modules |
| `logging_config.py` | `shared/logging/` (interface defined, bodies unimplemented) |
| `pophousing_config.py` | `lib/pophousing_config.py` + the four `config/` accessor modules + `shared/geography/california_geography.py` |

## Open Items

- [ ] Decide whether the historical baseline should live in its own immutable file rather than sharing a path with the current output.
- [ ] Wire or document the Phase 0 historical build so refreshing deep history is a defined operation.
- [ ] Implement the `shared/logging/` interface, or remove the logging language from module docstrings until it exists.
- [ ] Confirm the intended behavior of the ambiguous-location lookahead during the missing-level pass.
- [ ] Consider threading the geography config through the classification loop instead of rebuilding it per row.
