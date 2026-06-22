# Pop Housing Pipeline Script
From Claude edited by Myself & ChatGPT:

---

## Phase 1: Setup & Validation

**`cleanup_old_e5_files()`** — **Worker.** All logic is inline: lists the download directory, checks each file's age, and deletes old ones. Calls no other project functions.

> [!flag] Create New Scripts
> - `scripts/shared/archives/file_retention.py`
>   - `file_retention.find_files_older_than(directory, max_age_days, filename_pattern)` should provide the shared file-age lookup mechanism.
>   - `file_retention.archive_or_delete_files(file_paths, archive_directory)` should provide the shared file disposition mechanism.
> - `scripts/pophousing/archives/e5_retention.py`
>   - `e5_retention.cleanup_old_e5_files(download_directory, archive_directory, max_age_days)` should apply the E-5 retention policy to files in `data/data-raw/housing-population`.
>   - `e5_retention.write_deletion_warnings(file_paths, warning_days, deletion_log_directory)` should create warning files 15, 10, 5, and 1 days before deletion in `logs/deletions`.

**`validate_historical_data(file_path)`** — **Worker.** Loads the CSV itself, then runs seven checks (required columns, year coverage, geographic levels, California data, population sanity, null counts, duplicates) all with inline pandas operations. Calls no other project functions.

> [!flag] Create New Scripts
> - `scripts/shared/validation/dataframe_validators.py`
>   - `dataframe_validators.validate_required_columns(dataframe, required_columns)` should provide generic schema validation.
>   - `dataframe_validators.find_duplicate_rows(dataframe, key_columns)` should provide generic duplicate detection.
>   - `dataframe_validators.validate_null_counts(dataframe, columns)` should provide generic null-count checks.
> - `scripts/pophousing/validation/historical_data_validator.py`
>   - `historical_data_validator.validate_historical_housing_data(file_path, validation_config)` should compose shared validators with Population & Housing checks for year coverage, geographic levels, California records, and population ranges.

---

## Phase 2: Data Acquisition

**`get_e5_file_url()`** — **Worker.** Does everything itself: two HTTP requests, two rounds of BeautifulSoup parsing, regex matching, URL joining. Calls no other project functions.

**`download_e5_data(url)`** — **Mostly worker, one delegation.** Handles caching logic, downloading, file saving, and Excel reading all inline. The one delegation is calling **`get_e5_filename_from_url(url)`** to derive the cache filename.


**`get_e5_filename_from_url(url)`** — **Worker.** Pure string manipulation: a regex extraction from the URL. Three lines of logic.

**`get_most_recent_e5_file()`** — **Worker.** Scans the download directory, finds the newest file by modification time, checks its age, reads the Excel sheet. Calls no other project functions.

> [!flag] Create New Scripts
> - `scripts/shared/downloads/http_downloads.py`
>   - `http_downloads.fetch_response(url, headers, timeout)` should provide the shared HTTP request mechanism.
>   - `http_downloads.download_file(url, destination_path, headers, timeout)` should provide shared binary file downloading.
> - `scripts/pophousing/acquisition/dof_e5_downloader.py`
>   - `dof_e5_downloader.get_e5_file_url(source_settings)` should contain DOF page traversal and E-5 link selection.
>   - `dof_e5_downloader.get_e5_filename_from_url(url, filename_pattern)` should derive and validate the E-5 cache filename.
>   - `dof_e5_downloader.download_e5_data(url, download_directory, cache_max_age_days)` should coordinate cache checks, downloading, and workbook loading.
>   - `dof_e5_downloader.get_most_recent_e5_file(download_directory, filename_pattern, fallback_max_age_days)` should select and load the newest valid fallback workbook.

---

## Phase 3: Clean the Raw E-5 Data

> [!flag] Create New Scripts:
> - `scripts/shared/data_cleaning/`
>   - `type_conversions.py`
>   - `row_filters.py`
> - `scripts/pophousing/cleaning/`
>   - `e5_schema_normalizer.py`
>   - `hierarchical_location_cleaning.py`
>   - `location_standardization.py`
>   - `geographic_classification.py`
> - `scripts/pophousing/calculations/`
>   - `housing_metrics.py`
> - `scripts/pophousing/validation/`
>   - `cleaning_validators.py`

**`clean_e5_data(raw_e5_df)`** — **Hybrid, leans orchestrator.** It does some inline work (renaming columns via `config.E5_COLUMN_NAMES`, slicing off header rows above "Alameda", renaming `Region`→`County` and `City`→`Location`, forward-filling `County`, parsing dates, filtering to years ≥ 2020, numeric type coercion, computing `Single Family Units` / `Multiple Family Units` / `Vacant Units`). But the two heaviest tasks are delegated:
- Calls **`clean_common_e5(housing_df)`** for row filtering and context-aware forward-filling
- Calls **`add_geographic_level_e5(housing_df)`** for geographic classification

> [!flag] Create New Scripts
> - `scripts/pophousing/cleaning/e5_schema_normalizer.py`
>   - `e5_schema_normalizer.normalize_e5_columns(raw_e5_df, column_names)` should absorb the initial E-5 column assignment.
>   - `e5_schema_normalizer.trim_to_first_data_row(raw_e5_df, anchor_value, column)` should absorb the header-row trimming before the first real county block.
>   - `e5_schema_normalizer.rename_e5_schema(raw_e5_df, mapping)` should absorb the schema renaming from raw E-5 columns to pipeline columns.
> - `scripts/shared/data_cleaning/type_conversions.py`
>   - `type_conversions.parse_year_from_date(dataframe, date_col, out_col)` should absorb date parsing and year extraction.
>   - `type_conversions.coerce_numeric_columns(dataframe, numeric_cols)` should absorb numeric type conversion for housing and population fields.
> - `scripts/shared/data_cleaning/row_filters.py`
>   - `row_filters.filter_year_range(dataframe, year_col, min_year, max_year)` should absorb the 2020+ filter.
> - `scripts/pophousing/calculations/housing_metrics.py`
>   - `housing_metrics.add_housing_derived_columns(housing_df)` should absorb the `Single Family Units`, `Multiple Family Units`, and `Vacant Units` calculations.


**`clean_common_e5(housing_df)`** — **Mostly worker, with helper calls.** The bulk of this function is a ~100-line inline loop that walks every row, tracks county context, and forward-fills location names. It also handles summary-row removal, header-row filtering, empty-row filtering, and the `County Total`/`State Total` preservation logic — all inline. The delegations are:

- Calls `enhanced_forward_fill_helpers.has_meaningful_data()` — to check if a row has nonzero population/housing values
- Calls `enhanced_forward_fill_helpers.classify_ambiguous_location()` — to resolve cases where a location name matches both a city and county
- Defines and calls an inner function **`clean_name()`** — which consults `config.CITY_NAME_MAPPINGS`, `config.HISTORICAL_NAME_STANDARDIZATION`, and strips suffixes. This is technically a delegation but it's defined *inside* the function, so it's self-contained.

> [!flag] Create New Scripts
> - `scripts/shared/data_cleaning/row_filters.py`
>   - `row_filters.remove_summary_rows(dataframe, location_col, keep_values)` should absorb summary-row filtering while preserving configured values such as `County Total` and `State Total`.
>   - `row_filters.remove_header_like_rows(dataframe, location_col, patterns)` should absorb header-row removal.
>   - `row_filters.drop_empty_rows_without_data(dataframe, location_col, data_cols)` should absorb empty-row cleanup using caller-provided data columns.
> - `scripts/pophousing/cleaning/hierarchical_location_cleaning.py`
>   - `hierarchical_location_cleaning.forward_fill_locations_with_context(housing_df, location_col, county_col)` should absorb the main row-by-row county/city context loop.
>   - `hierarchical_location_cleaning.build_county_context_column(housing_df, location_col, county_col, temp_col)` should absorb `_temp_county` creation for later county-total reassignment.
> - `scripts/pophousing/cleaning/location_standardization.py`
>   - `location_standardization.standardize_location_column(housing_df, location_col, geo_col, only_levels)` should absorb the inline `clean_name()` standardization pass.

**`add_geographic_level_e5(housing_df)`** — **Hybrid.** It does substantial inline work: identifying `County Total` rows and replacing their location with the actual county name from the `_temp_county` column, renaming `State Total` → `California`, applying town classification from `config.ALL_TOWNS`, running post-processing name standardization via `config.HISTORICAL_NAME_STANDARDIZATION`, removing "Balance of" rows, and dropping temp columns. The one delegation is:

- Calls `enhanced_forward_fill_helpers.enhanced_assign_geographic_level_with_context()` — for rows that still lack a geographic level after the explicit assignments

> [!flag] Create New Script (`scripts/pophousing/cleaning/geographic_classification.py`)
> - `geographic_classification.resolve_county_total_rows(housing_df, location_col, temp_county_col)` should absorb reassignment of `County Total` rows to real county names.
> - `geographic_classification.normalize_state_total_rows(housing_df, location_col, state_name)` should absorb renaming `State Total` to `California`.
> - `geographic_classification.assign_missing_geographic_levels(housing_df, classifier_fn, location_col, county_col, population_col, level_col)` should absorb fallback row classification using context.
> - `geographic_classification.apply_town_overrides(housing_df, town_list, location_col, level_col)` should absorb explicit town overrides from config.
> - `geographic_classification.sanitize_geographic_levels(housing_df, valid_levels, default_level)` should absorb fill/default cleanup for invalid or blank geographic levels.
> - `geographic_classification.remove_balance_rows(housing_df, location_col)` should absorb final balance-row removal.
> - `geographic_classification.drop_helper_columns(housing_df, columns)` should absorb temp-column cleanup.

---

## Phase 4: Merge Historical + Modern

This phase has **no named functions** — it's inline work inside `main()`:

- `pd.read_csv()` to load the historical CSV
- Filters historical data to years ≤ 2020
- `pd.concat()` to merge
- `drop_duplicates()` on `(Location, Geographic Level, Year)`

> [!flag] Create New Script (`scripts/pophousing/merging/historical_modern_merge.py`)
> - `historical_modern_merge.load_historical_housing_data(historical_file_path)` should load the historical CSV using the expected Population & Housing schema.
> - `historical_modern_merge.filter_historical_years(historical_housing_df, max_year)` should apply the historical-data year boundary.
> - `historical_modern_merge.merge_historical_and_modern_data(historical_housing_df, modern_housing_df)` should concatenate both sources and enforce their shared schema.
> - `historical_modern_merge.resolve_source_overlap(merged_housing_df, key_columns, source_priority)` should deduplicate overlapping location, geographic-level, and year records using an explicit source policy.

---

## Phase 5: Enrich the Merged Dataset
> [!flag] Create New Scripts:
> - `scripts/pophousing/aggregation/`
>   - `aggregation_utils.py`
>   - `regional_aggregation.py`
>   - `state_aggregation.py`
> - `scripts/pophousing/calculations/`
>   - `housing_metrics.py`
>   - `rate_normalization.py`
> - `scripts/shared/validation/`
>   - `dataframe_validators.py`
> - `scripts/pophousing/validation/`
>   - `aggregation_validators.py`

**`add_regional_data(housing_df)`** — **Worker.** Everything is inline: strips existing Region rows, deduplicates county data with an explicit loop over location/year pairs, iterates over `config.REGIONS_MAPPING` to groupby-aggregate counties into regions, recalculates Vacancy Rate and Persons Per Household. Calls no other project functions.

> [!flag] Create New Scripts
> - `scripts/pophousing/aggregation/aggregation_utils.py`
>   - `aggregation_utils.remove_existing_geographic_level(housing_df, level_col, level_name)` should absorb removal of existing region rows before rebuilding aggregates.
>   - `aggregation_utils.deduplicate_geographic_rows(housing_df, location_col, year_col, level_col, preferred_level)` should absorb county-level deduplication before aggregation.
> - `scripts/pophousing/aggregation/regional_aggregation.py`
>   - `regional_aggregation.build_regional_rows(housing_df, regions_mapping, location_col, level_col, year_col)` should absorb creation of grouped region rows from county inputs.
>   - `regional_aggregation.add_regional_data(housing_df, regions_mapping)` should become the main Population & Housing entry point for region enrichment.
> - `scripts/pophousing/calculations/housing_metrics.py`
>   - `housing_metrics.recalculate_housing_rates(housing_df, row_mask)` should provide the single implementation of Vacancy Rate and Persons Per Household recalculation for region rows.

**`add_state_data_for_modern_years(housing_df)`** — **Worker.** Inline logic: identifies which years lack California data, aggregates county data for those years via `groupby`, recalculates rates. Calls no other project functions.

> [!flag] Create New Scripts
> - `scripts/pophousing/aggregation/state_aggregation.py`
>   - `state_aggregation.find_missing_state_years(housing_df, state_name, year_col)` should absorb detection of missing California years.
>   - `state_aggregation.build_state_rows_from_counties(housing_df, missing_years, state_name)` should absorb county-to-state aggregation for missing years.
>   - `state_aggregation.add_state_data_for_missing_years(housing_df, state_name)` should become the main Population & Housing state rollup entry point.
> - `scripts/pophousing/calculations/housing_metrics.py`
>   - `housing_metrics.recalculate_housing_rates(housing_df, row_mask)` should provide the same canonical Vacancy Rate and Persons Per Household calculations used for region rows.

**`fix_vacancy_rate_decimal_fractions(housing_df)`** — **Worker.** All inline: builds a boolean mask for problematic records (2020+, non-State, rate between 0.01 and 1.0), multiplies by 100, rounds, validates against key locations, checks for remaining suspicious values. Calls no other project functions.

> [!flag] Create New Scripts
> - `scripts/pophousing/calculations/rate_normalization.py`
>   - `rate_normalization.find_decimal_fraction_rates(housing_df, year_col, rate_col, level_col, min_year)` should absorb identification of suspicious decimal-form vacancy rates.
>   - `rate_normalization.normalize_decimal_fraction_rates(housing_df, rate_col, mask)` should absorb the actual percent conversion and rounding logic.
> - `scripts/shared/validation/dataframe_validators.py`
>   - `dataframe_validators.validate_numeric_range(dataframe, value_col, min_value, max_value, row_mask)` should provide generic numeric-range validation.
> - `scripts/pophousing/validation/aggregation_validators.py`
>   - `aggregation_validators.validate_normalized_housing_rates(housing_df, year_col, rate_col, level_col)` should compose the shared numeric-range validator with Population & Housing rate rules.

---

## Phase 6: Archive & Finalize

**Archive step** — Inline in `main()`: `os.rename()` to move the old CSV to the archive directory.

> [!flag] Use Existing Shared Script (`scripts/shared/archives/file_retention.py`)
> - `file_retention.archive_or_delete_files(file_paths, archive_directory)` should archive the previous output before replacement.

**`add_geographic_level(housing_df)`** — **Delegator with thin wrapper.** The inline work is minimal: checking which rows still lack a `Geographic Level`, and reporting improvements afterward. The actual classification is entirely delegated to:

- `enhanced_forward_fill_helpers.enhanced_assign_geographic_level_with_context()` — applied row-by-row via `df.apply()`

This is the most delegation-heavy function in the script.

> [!flag] Use Canonical Script (`scripts/pophousing/cleaning/geographic_classification.py`)
> - `geographic_classification.assign_missing_geographic_levels(housing_df, classifier_fn, location_col, county_col, population_col, level_col)` should perform the final missing-level pass using the same classifier as Phase 3.
> - Do not retain a separate `add_geographic_level()` implementation after migration.

**`standardize_city_names(housing_df)`** — **Worker.** Two inline loops: one over `config.HISTORICAL_NAME_STANDARDIZATION`, one over `config.CITY_NAME_MAPPINGS`, applying name replacements to city-level rows. Calls no other project functions.

> [!flag] Use Canonical Script (`scripts/pophousing/cleaning/location_standardization.py`)
> - `location_standardization.standardize_location_column(housing_df, location_col, geo_col, only_levels)` should apply the same configured name mappings used in Phase 3.
> - Do not retain a separate `standardize_city_names()` implementation after migration.

**`standardize_san_francisco_classification(housing_df)`** — **Worker.** Inline logic: finds SF rows, creates two copies (City and County), removes the originals, concatenates the copies back. Calls no other project functions.

> [!flag] Use Canonical Script (`scripts/pophousing/cleaning/geographic_classification.py`)
> - `geographic_classification.standardize_san_francisco_classification(housing_df, location_col, level_col)` should own the City and County duplication policy.
> - Invoke this function exactly once in Phase 6 after historical and modern data have been merged; Phase 3 should not duplicate San Francisco rows independently.

**Final cleanup** — Inline in `main()`: sets `Source`, reorders columns, sorts, converts `Year` to string, runs a final duplicate check, validates Bay Area 2020, and writes CSV.

> [!flag] Create New Scripts
> - `scripts/pophousing/output/finalize_dataset.py`
>   - `finalize_dataset.prepare_housing_output(housing_df, source_name, output_columns, sort_columns)` should set the source, enforce output columns and types, and sort the final dataset.
>   - `finalize_dataset.write_housing_output(housing_df, output_path)` should write the finalized CSV.
> - `scripts/pophousing/validation/final_dataset_validator.py`
>   - `final_dataset_validator.validate_final_housing_dataset(housing_df, validation_config)` should compose duplicate, schema, geographic, year, and Bay Area checks before output.

---

## `main()` Itself

**Orchestrator with inline glue.** Its primary role is calling the functions above in sequence. But it also does non-trivial inline work that isn't delegated to any function: loading the historical CSV, filtering it to ≤ 2020, concatenating the two DataFrames, deduplicating, archiving the old file, setting `Source`, reordering columns, sorting, the final duplicate check, the Bay Area sanity check, and writing the CSV. It's roughly 60% delegation, 40% inline work.

> [!flag] Rewrite Existing Script (`scripts/orchestrators/pophousing_pipeline.py`)
> - The rewritten `main()` should coordinate the phase entry points, logging, and error handling only.
> - Phase 4 transformations should be delegated to `scripts/pophousing/merging/historical_modern_merge.py`.
> - Phase 6 transformation and output work should be delegated to `scripts/pophousing/output/finalize_dataset.py` and `scripts/pophousing/validation/final_dataset_validator.py`.

---

## Summary Table

This table describes the current legacy implementation. The phase callouts describe the proposed replacement architecture.

| Function | Classification | Delegates to |
|---|---|---|
| `main()` | **Orchestrator** (with inline glue) | Everything below |
| `cleanup_old_e5_files()` | **Worker** | — |
| `validate_historical_data()` | **Worker** | — |
| `get_e5_file_url()` | **Worker** | — |
| `download_e5_data()` | **Worker** (one small delegation) | `get_e5_filename_from_url()` |
| `get_e5_filename_from_url()` | **Worker** | — |
| `get_most_recent_e5_file()` | **Worker** | — |
| `clean_e5_data()` | **Hybrid** (leans orchestrator) | `clean_common_e5()`, `add_geographic_level_e5()` |
| `clean_common_e5()` | **Worker** (with helper calls) | `has_meaningful_data()`, `classify_ambiguous_location()`, inner `clean_name()` |
| `add_geographic_level_e5()` | **Hybrid** | `enhanced_assign_geographic_level_with_context()` |
| `add_regional_data()` | **Worker** | — |
| `add_state_data_for_modern_years()` | **Worker** | — |
| `fix_vacancy_rate_decimal_fractions()` | **Worker** | — |
| `add_geographic_level()` | **Delegator** (thin wrapper) | `enhanced_assign_geographic_level_with_context()` |
| `standardize_city_names()` | **Worker** | — |
| `standardize_san_francisco_classification()` | **Worker** | — |

# Pop Housing Dependencies

## Separation Standard

Shared scripts and Population & Housing scripts must remain in separate directory trees.

- `scripts/shared/` contains project-independent mechanisms that can operate without importing Population & Housing configuration.
- `scripts/pophousing/` contains E-5/E-8 schemas, housing calculations, California geography rules, source-specific parsing, and pipeline-specific validation.
- `scripts/orchestrators/` coordinates the workflow but should not contain transformation logic.
- `scripts/pophousing/` may import from `scripts/shared/`.
- `scripts/shared/` must never import from `scripts/pophousing/`.
- Shared functions receive column names, mappings, paths, and thresholds as arguments rather than importing Population & Housing configuration.
- Before adding a Population & Housing helper, check whether an equivalent shared helper already exists.
- Duplicate implementations should only be permitted when the project requires materially different behavior that cannot be expressed through arguments or callbacks. The reason should be documented beside the specialized implementation.

## Proposed Directory Structure

> [!flag] Create New Folders
> - `scripts/shared/`
>   - `archives/`
>   - `data_cleaning/`
>   - `downloads/`
>   - `logging/`
>   - `validation/`
> - `scripts/pophousing/`
>   - `acquisition/`
>   - `aggregation/`
>   - `archives/`
>   - `calculations/`
>   - `cleaning/`
>   - `config/`
>   - `historical/`
>   - `merging/`
>   - `output/`
>   - `validation/`
> - `scripts/orchestrators/`
>   - `pophousing_pipeline.py`

## `config.py`

**What it does:** Defines source URLs, request settings, file paths, E-5 column names, California counties, towns, regions, city-name mappings, incorporation dates, cache limits, and historical file configurations.

**How it works:** Exposes module-level constants that are imported directly throughout the legacy pipeline.

**Migration:** Keep the configuration Population & Housing-specific. Shared scripts should not import it.

> [!flag] Move and Split
> - `scripts/pophousing/config/paths.py`
>   - Data, download, archive, output, and log paths
> - `scripts/pophousing/config/sources.py`
>   - DOF URLs, request headers, timeouts, cache limits, and file patterns
> - `scripts/pophousing/config/schemas.py`
>   - E-5 and E-8 column definitions and historical file schemas
> - `scripts/pophousing/config/geography.py`
>   - California counties, towns, regions, ambiguous names, and city-name mappings
> - Do not create a duplicate shared configuration module.
> - Pass required configuration values into shared functions as arguments.

## `logging_config.py`

**What it does:** Configures console, daily file, and error logging. It also records DataFrame metadata, data-quality results, and processing-step summaries.

**How it works:** Creates Python logging handlers and currently derives its log directory from Population & Housing configuration.

**Migration:** Move the logging mechanism to shared code and remove its dependency on `config.py`.

> [!flag] Move and Modify
> - `scripts/shared/logging/pipeline_logging.py`
>   - `setup_logging(script_name, logs_dir, log_level)`
>   - `get_logger(script_name, logs_dir, log_level)`
>   - `close_logging(logger)`
>   - `log_processing_step(logger, step_name, start_shape, end_shape, **details)`
> - `scripts/shared/logging/dataframe_logging.py`
>   - `log_dataframe_info(logger, dataframe, description)`
>   - `log_data_quality_check(logger, check_name, condition, level)`
> - The Population & Housing orchestrator supplies its configured log directory.
> - Do not create a separate Population & Housing logging implementation.

## `download_historical_data.py`

**What it does:** Finds historical E-8 landing pages, locates each “Organized by Geography” workbook, downloads the files, and saves them locally.

**How it works:** Uses `requests`, BeautifulSoup, regular expressions, and URL joining. The HTML labels and page structure are specific to the California Department of Finance.

**Migration:** Separate generic HTTP/file-download operations from DOF-specific page parsing.

> [!flag] Move and Split
> - `scripts/shared/downloads/http_downloads.py`
>   - `fetch_response(url, headers, timeout)`
>   - `download_file(url, destination_path, headers, timeout)`
> - `scripts/pophousing/acquisition/dof_historical_downloader.py`
>   - `get_historical_landing_page_urls(base_url)`
>   - `find_geography_workbook_url(page_url)`
>   - `download_historical_e8_files(download_dir, source_settings)`
> - Keep “E-8” and “Organized by Geography” parsing in `scripts/pophousing/`.
> - Do not duplicate request or binary file-writing logic in the Population & Housing downloader.

## Modern E-5 Acquisition Functions

**What they do:** Locate the current E-5 workbook, derive its filename, apply cache and fallback rules, download it, and load it into a DataFrame.

**How they work:** Combine generic HTTP and file operations with DOF-specific page traversal, E-5 filename patterns, cache limits, and workbook-reading rules.

**Migration:** Reuse the shared HTTP implementation while keeping all E-5 selection and caching policy under Population & Housing.

> [!flag] Move and Split
> - `scripts/shared/downloads/http_downloads.py`
>   - `fetch_response(url, headers, timeout)`
>   - `download_file(url, destination_path, headers, timeout)`
> - `scripts/pophousing/acquisition/dof_e5_downloader.py`
>   - `get_e5_file_url(source_settings)`
>   - `get_e5_filename_from_url(url, filename_pattern)`
>   - `download_e5_data(url, download_directory, cache_max_age_days)`
>   - `get_most_recent_e5_file(download_directory, filename_pattern, fallback_max_age_days)`
> - Do not duplicate HTTP requests or binary file-writing inside `dof_e5_downloader.py`.

## `enhanced_forward_fill_helpers.py`

**What it does:** Detects meaningful housing rows, identifies county headers, resolves ambiguous city/county names, and assigns geographic levels using California geography context.

**How it works:** Examines Population & Housing columns, neighboring rows, county and town configuration, and special geographic cases.

**Migration:** Treat this file as Population & Housing-specific despite its general filename.

> [!flag] Move and Split
> - `scripts/pophousing/cleaning/hierarchical_location_cleaning.py`
>   - `has_meaningful_housing_data(housing_row, value_columns)`
>   - `identify_county_headers(housing_df, county_names, location_col)`
>   - `forward_fill_locations_with_context(housing_df, location_col, county_col)`
> - `scripts/pophousing/cleaning/geographic_classification.py`
>   - `classify_ambiguous_location(location, county_context, population, housing_row, housing_df, row_index)`
>   - `assign_geographic_level_with_context(location, county_context, population, housing_row, geography_config)`
> - Do not place California counties, towns, population thresholds, or E-5 row rules in `scripts/shared/`.
> - Reuse these functions for both historical and modern Population & Housing processing instead of creating separate E-5 and E-8 classifiers.

## `data_cleaning_utils.py`

**What it does:** Standardizes location names, classifies geographic levels, calculates housing columns, forward-fills values, performs conditional assignments, and validates cleaned data.

**How it works:** Combines generic DataFrame operations with Population & Housing-specific configuration and formulas.

**Migration:** Do not move this file intact. Split generic operations from project-specific policies and remove functions that duplicate the new phase modules.

> [!flag] Move, Split, and Consolidate
> - `scripts/shared/data_cleaning/dataframe_operations.py`
>   - `forward_fill_columns(dataframe, columns)`
>   - `assign_values_from_mapping(dataframe, source_col, target_col, value_mapping)`
> - `scripts/shared/data_cleaning/type_conversions.py`
>   - `parse_year_from_date(dataframe, date_col, out_col)`
>   - `coerce_numeric_columns(dataframe, numeric_cols)`
> - `scripts/shared/data_cleaning/row_filters.py`
>   - `filter_year_range(dataframe, year_col, min_year, max_year)`
>   - `remove_summary_rows(dataframe, location_col, keep_values)`
>   - `remove_header_like_rows(dataframe, location_col, patterns)`
>   - `drop_empty_rows_without_data(dataframe, location_col, data_cols)`
> - `scripts/shared/validation/dataframe_validators.py`
>   - `validate_required_columns(dataframe, required_columns)`
>   - `validate_not_empty(dataframe)`
>   - `find_duplicate_rows(dataframe, key_columns)`
>   - `validate_null_counts(dataframe, columns)`
>   - `validate_numeric_range(dataframe, value_col, min_value, max_value, row_mask)`
> - `scripts/pophousing/cleaning/location_standardization.py`
>   - Population & Housing location-name mappings and suffix rules
> - `scripts/pophousing/cleaning/geographic_classification.py`
>   - California geographic-level assignment and San Francisco handling
> - `scripts/pophousing/calculations/housing_metrics.py`
>   - `add_housing_derived_columns(housing_df)` owns housing unit totals and vacant-unit calculations.
>   - `recalculate_housing_rates(housing_df, row_mask)` owns Vacancy Rate and Persons Per Household calculations for both source rows and aggregate rows.
> - Remove `universal_data_cleaner()` rather than preserving a second cleaning pipeline.
> - Phase-specific entry points should compose the canonical helpers listed above.
> - Do not create separate derived-column or rate-calculation implementations in cleaning, historical, regional, or state modules.

## Inline Merge, Archive, and Finalization Work

**What it does:** Loads and filters historical data, merges it with modern E-5 data, resolves overlap, archives the previous output, applies final normalization, validates the result, and writes the current CSV.

**How it works:** These operations are currently performed inline by `main()` using pandas and filesystem operations.

**Migration:** Move each transformation into a Population & Housing module while keeping generic file-retention mechanics shared.

> [!flag] Extract from `pophousing_pipeline.py`
> - `scripts/pophousing/merging/historical_modern_merge.py`
>   - `load_historical_housing_data(historical_file_path)`
>   - `filter_historical_years(historical_housing_df, max_year)`
>   - `merge_historical_and_modern_data(historical_housing_df, modern_housing_df)`
>   - `resolve_source_overlap(merged_housing_df, key_columns, source_priority)`
> - `scripts/shared/archives/file_retention.py`
>   - `find_files_older_than(directory, max_age_days, filename_pattern)`
>   - `archive_or_delete_files(file_paths, archive_directory)`
> - `scripts/pophousing/archives/e5_retention.py`
>   - `cleanup_old_e5_files(download_directory, archive_directory, max_age_days)`
>   - `write_deletion_warnings(file_paths, warning_days, deletion_log_directory)`
> - `scripts/pophousing/output/finalize_dataset.py`
>   - `prepare_housing_output(housing_df, source_name, output_columns, sort_columns)`
>   - `write_housing_output(housing_df, output_path)`
> - `scripts/pophousing/validation/final_dataset_validator.py`
>   - `validate_final_housing_dataset(housing_df, validation_config)`
> - The orchestrator should call these functions but should not reproduce their pandas or filesystem logic.

## Canonical Phase 3 and Phase 6 Transformations

**What they do:** Standardize location names, fill missing geographic levels, and apply the San Francisco City and County policy.

**How they work:** Phase 3 performs these transformations during E-5 cleaning. The legacy Phase 6 functions repeat some of the same mappings and classification rules after enrichment.

**Migration:** Keep one implementation for each policy and allow Phase 6 to invoke it as a final pass when required.

> [!flag] Consolidate
> - `scripts/pophousing/cleaning/location_standardization.py`
>   - `standardize_location_column(housing_df, location_col, geo_col, only_levels)` replaces the inline Phase 3 `clean_name()` function and Phase 6 `standardize_city_names()`.
> - `scripts/pophousing/cleaning/geographic_classification.py`
>   - `assign_missing_geographic_levels(housing_df, classifier_fn, location_col, county_col, population_col, level_col)` replaces the Phase 3 and Phase 6 missing-level implementations.
>   - `standardize_san_francisco_classification(housing_df, location_col, level_col)` is the only implementation of the San Francisco duplication policy.
> - Phase 6 may call location standardization and missing-level assignment as final normalization passes after aggregation.
> - San Francisco duplication should run exactly once in Phase 6 so both historical and modern records receive the same treatment without duplicate expansion.
> - Phase 6 must not maintain separate mappings, classifiers, or row-duplication logic.

## `historical_data_processor.py`

**What it does:** Reads multiple E-8 workbook formats, applies decade-specific cleaning, fills hierarchical locations, standardizes years and columns, resolves boundary-year overlaps, repairs missing county records, classifies geography, deduplicates records, and writes the historical dataset.

**How it works:** Uses separate branches for the 1990–2000, 2000–2010, and 2010–2020 formats, followed by common standardization and deduplication.

**Migration:** Keep E-8 format knowledge under Population & Housing while reusing shared DataFrame mechanisms.

> [!flag] Rewrite and Split
> - `scripts/pophousing/historical/e8_format_detection.py`
>   - `detect_e8_file_format(raw_e8_df)`
> - `scripts/pophousing/historical/e8_schema_normalizer.py`
>   - `normalize_e8_columns(raw_e8_df, format_config)`
> - `scripts/pophousing/historical/e8_era_cleaners.py`
>   - `clean_1990_2000(raw_e8_df)`
>   - `clean_2000_2010(raw_e8_df)`
>   - `clean_2010_2020(raw_e8_df)`
> - `scripts/pophousing/historical/e8_standardization.py`
>   - `standardize_e8_data(historical_housing_df, year_start, year_end)`
> - `scripts/pophousing/historical/boundary_year_resolution.py`
>   - `resolve_boundary_year_overlaps(historical_housing_df, source_priority)`
> - `scripts/pophousing/historical/missing_county_recovery.py`
>   - `extract_missing_county_rows(raw_e8_df, target_years)`
>   - `integrate_missing_county_rows(historical_housing_df, missing_county_df)`
> - `scripts/pophousing/historical/historical_pipeline.py`
>   - `build_historical_housing_dataset(file_configs)`
> - Use shared numeric conversion, date parsing, duplicate detection, and required-column validation where their behavior is genuinely generic.
> - Use the same Population & Housing location and geographic-classification modules used for E-5 processing.
> - Use `scripts/pophousing/calculations/housing_metrics.py` for housing-derived columns and rate calculations.
> - Do not retain duplicate classification or derived-column implementations inside the historical modules.

## `run_original_pipeline.py`

**What it does:** Runs the historical downloader, historical processor, and final Population & Housing pipeline as subprocesses.

**How it works:** Changes the working directory, executes each script in sequence, checks return codes, and asks whether execution should continue after a failure.

**Migration:** Replace it with the rewritten orchestrator. Do not preserve a second pipeline runner.

> [!flag] Replace
> - `scripts/orchestrators/pophousing_pipeline.py`
>   - Calls acquisition, historical processing, modern cleaning, merging, enrichment, validation, archival, and output functions directly
>   - Returns or raises structured errors instead of prompting for interactive input
> - Do not create a shared subprocess runner unless another pipeline has an established need to execute standalone scripts.
> - The orchestrator should contain sequencing and status reporting only.

## Dependency Direction

The final dependency direction should be:

`shared helpers` → imported by → `pophousing modules` → coordinated by → `pophousing_pipeline.py`

The following imports should be prohibited:

- `scripts/shared/` importing anything from `scripts/pophousing/`
- Population & Housing cleaning modules importing the orchestrator
- Historical and modern modules maintaining separate copies of location standardization, geographic classification, housing formulas, or validation rules
- Shared modules containing E-5, E-8, DOF, California, county, town, region, or housing-specific defaults
