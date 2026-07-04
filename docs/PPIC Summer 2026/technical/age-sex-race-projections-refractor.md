---
Topic: Population
Content Type: refractor plan
pinned: false
description: "As-built guide to the refactored Age-Sex-Race Projections (Demographic Projections) V3 pipeline: a non-technical overview of what it produces and how the five phases run, followed by a per-function programmer reference with legacy lineage. Covers the DoF P-3 projections and Census cc-est estimate sources merged into a single stratified contract CSV."
Date Published: June 22, 2026
Last Updated: 07/04/2026 - 09:20 AM
---

# Age-Sex-Race Projections Refractor Guide

> [!info] How to read this document
> This guide has two halves. The **first half** is for non-technical readers: it explains what the module produces, where the data comes from, the shape of the output dataset, and how the pipeline runs from raw download to saved CSV, phase by phase. The **second half** is a programmer reference: it walks every script and function, notes the libraries and performance choices, and records which piece of the legacy `projections_code.py` each function was derived from. The document describes the code **as it is actually built** in `scripts/projections/` and `scripts/orchestrators/projections_pipeline.py`, not a plan of what should be built. The original migration plan (with its proposed signatures and sequencing) is preserved in this file's git history. Related module guides: [[pophousing-pipeline-refractor]], [[components-of-change-refractor]], [[projectSpec]].

---

## What the Module Produces

The pipeline builds one file: `data/data-cleaned/demographic-projections/DemographicProjections_Current.csv`. It holds population counts broken out by **location, year, age group, sex, and race/ethnicity**, drawn from two sources and stacked into a single long-format table. A full run writes on the order of 1.5 million rows (roughly 1.58 million when both sources succeed).

The dataset blends two fundamentally different kinds of number:

- **Projections** - the California Department of Finance (DoF) P-3 series, which projects the state's population forward from 2020 to 2070.
- **Estimates** - the U.S. Census Bureau cc-est series, which records estimated population for all 50 states for the recent past (2020-2025).

Because the two are conceptually different (one looks forward, one looks back), every row carries a `Source` label so the frontend can keep them visually distinct and never let a user mistake a projection for observed data.

The refactor dissolved the legacy `Projections` class - whose entire ETL ran inside `__init__()` and whose `visualize_*` methods drew charts directly - into a set of single-responsibility functions coordinated by an orchestrator. Charting moved out of Python entirely and into the shared React frontend.

---

## Data Sources

| Source | Format | Geography | Years | Grain in the raw file |
|---|---|---|---|---|
| DoF P-3 projections | Zip archive containing one flat, comma-delimited CSV | 58 California counties (FIPS 6001-6115) | 2020-2070 (Baseline 2024, Vintage 2026) | One row per county, single-year age (0-110), sex, and 7-code race |
| Census cc-est estimates | Official wide-format `CC-EST{VINTAGE}-ALLDATA.csv`, Latin-1 encoded | All U.S. counties (aggregated to 50 states) | 2020-2025 | One row per county, coded year, coded 5-year age group, with race-by-sex population in wide columns |

The P-3 file is by far the larger input. Its raw dimensions are 58 counties x 51 years x 2 sexes x 7 race codes x 111 single-year ages, which is roughly 4.6 million rows before the pipeline bins single-year ages down to 18 five-year groups.

Each source is acquired independently through a **three-step fallback cascade**: try the live download strategies in order, then a manually placed CSV, then the last-saved rows already in the contract file. A source that falls all the way back to last-saved is flagged as "failed" so the run can still finish (with stale data for that source) rather than crash.

---

## The Dataset: Grain, Columns, and Geography

**Grain:** one row per `(Geographic Level, Location, Year, Age Group, Sex, Race/Ethnicity, Source)`.

**Columns (in output order):**

| Column | Meaning |
|---|---|
| `Geographic Level` | `County`, `Region` (9 CA regions), `State` (California from DoF), or `US State` (the 50 states from Census) |
| `Location` | County name, region name, `California`, or a U.S. state name |
| `Year` | Integer |
| `Age Group` | One of 18 canonical 5-year labels (`0-4` ... `80-84`, `85+`) or the aggregate `All Ages` |
| `Sex` | `Male`, `Female`, or the aggregate `Both Sexes` |
| `Race/Ethnicity` | `White`, `Black`, `Asian`, `NHPI`, `AIAN`, `Multiracial`, `Hispanic`, or the aggregate `All` |
| `Population` | Integer count |
| `Source` | `DoF P-3` or `Census cc-est` |

**Why California appears twice.** The DoF rollup of the 58 counties produces a `California` row at `Geographic Level = State`. The Census 50-state series also contains California, but at `Geographic Level = US State`. Both are legitimate and are distinguished by `Source`, so geographic-level assignment must look at **both** `Location` and `Source`.

**Aggregate ("marginal") rows are pre-computed and stored.** Rather than force the frontend to sum on every request, the pipeline writes the `All Ages`, `Both Sexes`, and `All`-race totals directly into the CSV. Coarser age presets (Under 18, 18-25, 26-64, 65+) are *not* stored - the API sums the stored 5-year groups into those presets on request.

**Age storage is lossy by design.** Single-year P-3 ages are binned to 5-year groups during cleaning (summing population within each bin) before anything is written. The `85+` bin folds together ages 85 through 110.

---

## How the Pipeline Runs: Five Phases

The orchestrator `build_projections_dataset()` runs five phases in sequence. Each is wrapped so that any exception is re-raised as a `ProjectionsPipelinePhaseError` tagged with the phase name, which makes a failure immediately traceable to a stage.

### Phase 1 - Setup and Load

Resolve the three config dicts (`paths`, `sources`, `schemas`) and read the existing contract CSV once into a `historical` DataFrame. That single read is reused everywhere a fallback might need last-saved rows, so the large file is parsed only once per run.

### Phase 2 - Acquisition

For each source, run the fallback coordinator. The **live strategies** differ by mode:

- **Online (default):** DoF tries link-text discovery, then a positional HTML fallback; Census constructs the canonical ALLDATA URL from the newest vintage directory. Each downloads (or reuses a cached file) and returns a path.
- **Offline** (`config={"offline": True}` or `PROJECTIONS_OFFLINE=1`): DoF reuses a local extracted P-3 CSV or extracts a local zip; Census reuses a local cc-est CSV. This lets the whole pipeline run from disk with no network.

If every live strategy fails, the coordinator tries a manually placed CSV, then last-saved rows. Live and manual paths hand a **file path** to the next phase; only the last-saved fallback hands back an already-cleaned **DataFrame** (paired with a `source_failed=True` flag so cleaning is skipped for it).

### Phase 3 - Cleaning

Each source is cleaned to the same canonical schema:

- **DoF P-3:** validate the header and values, map FIPS codes to county names, decode the 7 race codes, standardize sex labels, and bin single-year ages into 5-year groups (summing population). Output is tagged `Geographic Level = County`.
- **Census cc-est:** parse the Latin-1 wide file, keep only `SUMLEV=050` county rows, sum the 14 race-by-sex population columns to state totals by `(STNAME, YEAR, AGEGRP)`, confirm all 50 states are present, then reshape wide-to-long and decode the year and age-group codes. Output is tagged `Geographic Level = US State`.

If a cleaner raises, Phase 3 retries with the manual file, then falls back to last-saved rows (reduced back to base strata so aggregation doesn't double-count).

### Phase 4 - Merge and Aggregate

1. **Completeness gate + atomic merge.** Each cleaned source is validated for stratification completeness (every location/year must carry the full 18 x 2 x 7 base matrix), then merged with historical rows one full year at a time - overlapping years are replaced wholesale, never patched key by key.
2. **Concatenate** the DoF and Census frames.
3. **Geographic rollups** on the county rows: `add_state_total` sums the 58 counties into a `California` `State` row, and `add_regional_data` sums counties into the 9 CA `Region` rows. Both run unconditionally.
4. **Precomputed marginals:** `build_precomputed_totals` appends `All Ages`, then `Both Sexes`, then `All`-race rows, in that order so each aggregate correctly includes the previous ones.
5. **Change detection** compares the freshly cleaned rows against history to set the `dof_new_data` / `census_new_data` flags.

### Phase 5 - Finalize and Save

Assign each row's `Geographic Level` from `Location` + `Source`, enforce the contract column order and types, and run final validation (required columns, row-count bounds, expected geographic levels, year range, no duplicate keys). The set of **expected levels is derived from which sources actually succeeded**, so an offline DoF-only run still validates (it doesn't demand `US State`). If new data was detected, `archive_and_save` timestamps the prior file into the archive directory and writes the new CSV - but only if the bytes actually differ.

---

## Key Calculations

- **Age binning (lossy).** `pd.cut` with edges `[0, 5, ..., 85, inf]`, right-open, assigns each single-year age to a 5-year label; the pipeline then groups and sums population within each bin. Ages 85-110 collapse into `85+`.
- **County to region to state rollups.** Region and California-state populations are always summed from county rows (the P-3 source has no region or state row of its own). Census state rows are built earlier, from county observations, inside the Census cleaner.
- **Precomputed marginals cascade.** `All Ages` is summed first; `Both Sexes` is then summed over a frame that already contains `All Ages`; `All`-race is summed over a frame that already contains `Both Sexes`. This ordering is what makes the "grand total" rows (for example, `All Ages` + `Both Sexes` + `All`) internally consistent.
- **Stratification completeness.** For each `(Geographic Level, Location, Year, Source)` group, the validator counts distinct base `(Age Group, Sex, Race/Ethnicity)` tuples and compares against `18 x 2 x 7 = 252`. Aggregate rows are excluded from the count so precomputed totals can never mask a missing base stratum.

---

## Architecture and Boundaries

The module follows the standard three-layer V3 shape:

- **Shared layer** (`scripts/shared/`) - dataset-agnostic helpers: HTTP downloads, California geography, generic DataFrame validators. These never import anything projection-specific.
- **Domain layer** (`scripts/projections/`) - config, acquisition, cleaning, aggregation, merging, validation, and output modules specific to this dataset.
- **Orchestrator** (`scripts/orchestrators/projections_pipeline.py`) - wires the domain modules into the five phases and owns the fallback and offline logic.

The dependency direction is strict: shared -> projections -> orchestrator. Unlike the legacy module, there is **no Python visualization layer** - the legacy `visualize_line/bar/map()` methods were dropped and replaced by the shared React charting UI. The frontend deliverables (`lib/visualization/moduleSchemas/demographicProjections.js`, `lib/data/demographic_projections.js`, `app/api/projections/route.js`) consume the contract CSV over an HTTP API and are described at the interface level in the second half.

---

## Technical Reference

The rest of this document is a per-script, per-function reference. It is organized by phase, with configuration and shared helpers first. For each function it states what it does, notable libraries, any performance choices, and the legacy code it derived from. The legacy source is the single class `Projections` in `Visualization Tool/Age-Sex-Race-Projections/projections_code.py`; "derived from" points at the method or inline block that motivated each function.

---

## Configuration Modules

### `scripts/projections/config/paths.py`

**`get_paths()`** - builds every pipeline path from `lib.config.get_project_paths()`: the cleaned/raw/archive directories under `demographic-projections/`, the contract path `DemographicProjections_Current.csv`, and the two manual-fallback paths (`P-3_Downloaded.csv`, `cc-est_Downloaded.csv`). Returns `pathlib.Path` objects.

> Note: `historical_data_path` is set equal to `current_data_path` - the pipeline reads its own prior output as history. See Flagged Issues.

*Legacy lineage:* replaces the hard-coded `R:\UCF\...` Windows paths scattered through the legacy `__init__`.

### `scripts/projections/config/sources.py`

**`get_source_settings()`** - returns the DoF and Census base URLs, HTTP headers/timeout (from `lib.config.get_default_http_settings()`), cache windows (P-3 90 days, cc-est 30 days), a longer `ccest_download_timeout` (>= 300s, because the national ALLDATA file is ~100 MB from a slow host), the P-3 filename pattern, the expected raw-column lists (imported from `schemas.py`), and the change-detection boundary years (both 2019, so every observed year from 2020 on stays in scope).

*Legacy lineage:* consolidates the scattered URL literals and `sheet_names[1]` assumptions from `scrape_dof_projections()` / `scrape_census_estimates()`.

### `scripts/projections/config/schemas.py`

Owns all reference constants and the one accessor:

- Module constants: `P3_RAW_COLUMNS`, `CCEST_RAW_COLUMNS` (7 identifiers + 14 race-by-sex fields), the 58 FIPS-ordered county names, the 50 state names, canonical age groups, age-bin edges, canonical race groups and sexes, the P-3 race7 map, the Census race-prefix map, and the Census year-code map.
- **`_build_fips_to_county_map()`** - zips `range(6001, 6116, 2)` with the alphabetical county list (California FIPS are assigned alphabetically, so index N -> FIPS 6001 + 2N).
- **`get_schema_config()`** - assembles everything above plus the cleaning- and final-validation config blocks into one dict consumed by cleaning, aggregation, validation, and output. The Census year-code map is derived as `{code: 2018 + code for code in range(2, 8)}` (codes 2-7 -> 2020-2025); the age-group code map is `enumerate(canonical_age_groups, start=1)`.

*Legacy lineage:* replaces the inline race/age dictionaries and duplicated region definitions embedded in `clean_dof_projections()` and `clean_census_estimates()`.

---

## Shared Helpers Reused

- **`scripts/shared/geography/california_geography.py` -> `get_california_geography()`** - supplies `county_names`, `region_names`, and `regions_mapping` (county-to-region lists). The orchestrator and `add_state_total` / `add_regional_data` source their geography here instead of re-hardcoding the 9 regions, killing the legacy copy-paste duplication.
- **`scripts/shared/downloads/http_downloads.py` -> `fetch_response`, `download_file`** - used by both downloaders for page fetches and file downloads.
- **`scripts/shared/validation/dataframe_validators.py` -> `validate_required_columns`, `validate_null_counts`, `validate_numeric_range`, `find_duplicate_rows`** - composed by the projections validators.

---

## Phase 1: Setup and Load

Handled inline in the orchestrator plus one merging helper.

- **`load_canonical_dataset(current_data_path)`** (`merging/historical_merge.py`) - reads the contract CSV, or returns an empty DataFrame with the 8 contract columns if the file does not yet exist. Uses `pandas.read_csv`. *Derived from* the legacy history-load at the top of `combine_dof_and_census()`.
- **Orchestrator helpers:** `_is_offline(config)` reads the config flag or `PROJECTIONS_OFFLINE`; `_load_saved_source(paths, source, historical)` filters the already-loaded history to one `Source` (reused so the big CSV is parsed once).

---

## Phase 2: Acquisition

### `scripts/projections/acquisition/dof_p3_downloader.py`

- **`P3DiscoveryError`** - raised when no P-3 zip link is found.
- **`get_p3_file_url(base_url, headers, timeout)`** - BeautifulSoup over the DoF page; returns the first `href` matching `P-?3.*\.zip`. *Derived from* `scrape_dof_projections()` (link-text matching).
- **`get_p3_file_url_positional(base_url, headers, timeout)`** - fallback that walks `div.et_pb_text_inner` containers, finds one mentioning "P-3", and returns its `.zip` link. *Derived from* `scrape_dof_projections_spatially()`.
- **`download_p3_data(url, download_directory, headers, timeout, cache_max_age_days)`** - returns a cached CSV inside the cache window, else downloads the zip, extracts the CSV, and deletes the zip. Uses `urllib.parse` + shared `download_file`.
- **`extract_csv_from_zip(zip_path, download_directory)`** - opens the archive with `zipfile.ZipFile`, requires **exactly one** CSV member (else `ValueError`), and streams it to disk. *This is new* - the legacy P-3 was an Excel workbook; the current distribution is a zipped CSV.
- **`get_most_recent_p3_file(download_directory, filename_pattern, max_age_days)`** - scans the directory for the newest CSV matching the pattern and within the age window, via `re.fullmatch` and `stat().st_mtime`.
- **`validate_p3_csv(csv_path, expected_columns)`** - reads only the header line, `Counter`s the columns, and raises if any mandatory column is missing or duplicated (checked before pandas can mangle duplicate names). Performance: header-only read, no full parse.

### `scripts/projections/acquisition/census_ccest_downloader.py`

- **`get_census_ccest_url(base_url, headers, timeout)`** - scrapes the Census datasets index for vintage subdirectories (`YYYY-YYYY/`), picks the **latest end year**, and constructs `.../{vintage}/counties/asrh/cc-est{end}-alldata.csv` (the nested listing is too large to scrape directly). *Derived from* `scrape_census_estimates()`.
- **`download_census_ccest(url, download_directory, headers, timeout, cache_max_age_days)`** - returns the cached file inside the cache window, else downloads via shared `download_file`.
- **`validate_ccest_headers(csv_path, expected_columns)`** - header-only membership check; raises on any missing identifier or population column.

### `scripts/projections/acquisition/source_fallback.py`

- **`acquire_with_fallback(live_strategies, manual_path, saved_rows_fn, source_name)`** - tries each live strategy (returns `(path, False, False)` on the first success), then a manual CSV (`(path, False, True)`), then last-saved rows (`(df, True, False)`). If even last-saved fails, raises a `RuntimeError` with every prior error attached via `add_note`. *Derived from* the legacy inline try/except fallback cascade inside `__init__`; generalized to a reusable coordinator matching the Components/PopHousing pattern.

---

## Phase 3: Cleaning

### `scripts/projections/cleaning/dof_p3_cleaner.py`

- **`map_fips_to_county(df, fips_column, fips_to_county_map)`** - coerces FIPS to `Int64`, raises on any unmapped code, replaces the column with `Location`.
- **`standardize_sex_labels(df, sex_column, label_map)`** - maps `MALE`/`FEMALE` to `Male`/`Female`; raises on unmapped values.
- **`bin_single_year_ages(df, age_column, population_column, bin_edges, groupby_columns)`** - `pd.cut` with `right=False` and an appended `inf` edge, then `groupby(...).sum()`. Labels are reconstructed from the edges by `_labels_from_bin_edges` (last edge becomes `"85+"`). This is the lossy aggregation.
- **`clean_p3_projections(csv_path, schema_config)`** - the entry point: validate header, read **only** the mandatory columns via `usecols` (avoids loading unused columns and an extra copy), validate values (nulls, year range, age range, non-negative integer population), map FIPS/race/sex, bin ages, tag `Geographic Level = County`, and return the canonical 7-column frame.
- Helpers `_validate_p3_header` and `_validate_p3_values` enforce the "each mandatory column exactly once, values semantically valid" contract.

*Legacy lineage:* replaces `clean_dof_projections()`. The legacy reshape step is gone because the current P-3 CSV is already one-row-per-record.

### `scripts/projections/cleaning/census_ccest_cleaner.py`

- **`parse_ccest_csv(csv_path, schema_config)`** - `pd.read_csv(..., encoding="latin-1")` (accented county names such as "Doña Ana" are not valid UTF-8), then validates required columns.
- **`aggregate_ccest_counties_to_states(df, schema_config)`** - filters to `SUMLEV=050`, keeps only the configured 50 states, confirms none are missing (else `ValueError`), and sums the 14 population columns by `(STNAME, YEAR, AGEGRP)`.
- **`rename_ccest_columns(df, schema_config)`** - renames `STNAME/YEAR/AGEGRP` to `Location/Year/Age Group` via the configured map.
- **`reshape_ccest_to_long(df, schema_config)`** - builds the value-column list by parsing each `{RACE}_{SEX}` header (skipping `TOT`-prefixed totals, raising on any other unmapped race prefix), excludes `YEAR=1` and `AGEGRP=0`, `melt`s to long, maps prefixes/suffixes to canonical race/sex, and decodes year and age-group codes (raising on any unknown code).
- **`clean_census_estimates(csv_path, schema_config)`** - chains the four steps above and tags `Geographic Level = US State`.

*Legacy lineage:* replaces `clean_census_estimates()`, formalizing the `SUMLEV=050` filter and the county-to-state aggregation the legacy code did inline.

### `scripts/projections/cleaning/race_ethnicity_mapping.py`

Shared by both cleaners. **`get_canonical_race_groups()`**, **`map_race_ethnicity(df, raw_column, source_code_map)`** (raises on unmapped codes), and **`validate_race_mapping_completeness(df, race_column)`** (returns `(is_valid, messages)`). Owns `CANONICAL_RACE_GROUPS` and `P3_RACE7_CODE_MAP`. *Derived from* the inline race-mapping dictionaries duplicated across the two legacy cleaners.

### `scripts/projections/cleaning/age_group_standardizer.py`

Owns `AGE_BIN_EDGES` and `CANONICAL_AGE_GROUPS`. **`get_canonical_age_groups()`**, **`get_age_bin_edges()`**, **`assign_age_group_from_single_year(df, age_column)`** (integer-division label assignment, `min(age // 5, top_bin)`; raises on ages outside 0-110), **`standardize_age_group_labels(df, raw_column, label_map)`**, and **`validate_age_group_completeness(df, age_column)`**. *Derived from* the inline age-reshaping logic in `clean_dof_projections()`.

> Note: the P-3 cleaner does its binning through `bin_single_year_ages` (which reconstructs labels from the edges directly), so `assign_age_group_from_single_year` and `standardize_age_group_labels` here are used mainly by tests and helpers rather than on the hot path. The two label-construction routes (this module vs. `_labels_from_bin_edges`) must stay in sync.

---

## Phase 4: Merge and Aggregate

### `scripts/projections/merging/historical_merge.py`

- **`load_canonical_dataset(current_data_path)`** - (see Phase 1).
- **`combine_source_with_historical(new_df, historical_df, source, year_column, completeness_validator)`** - stamps `Source`, runs the completeness validator on the incoming frame **before** touching history (raises on failure), then retains historical years absent from the incoming set and appends the incoming years whole. No key-level upserts - replacement is atomic at `(Source, Year)` grain. *Derived from* the conditional-merge logic in `combine_dof_and_census()`.
- **`detect_new_source_data(new_df, historical_df, source, boundary_year)`** - compares the set of contract-keyed rows beyond the boundary year between incoming and history. Helper `_recent_row_set` builds the comparison set from `itertuples`.
- **`merge_dof_and_census(dof_df, census_df)`** - concatenates the two source frames, coerces `Year` to `int64`, and sorts. *Derived from* the final unify step of `combine_dof_and_census()`.

### `scripts/projections/aggregation/regional_aggregation.py`

- **`add_regional_data(df, regions_mapping, groupby_dimensions)`** - for each of the 9 regions, filters county rows, groups by the aggregation dimensions, sums `Population`, tags `Geographic Level = Region`, and appends.
- **`add_state_total(df, county_names, groupby_dimensions, state_name="California")`** - sums the 58 county rows into a `California` `State` row, but only for `(dimension)` keys that don't already have a DoF state row (so it never duplicates and never overwrites the separate Census `California`).

*Legacy lineage:* replaces the inline `add_region()` helper; the region membership now comes from shared geography rather than a copy-pasted dict.

### `scripts/projections/aggregation/precomputed_totals.py`

- **`add_all_ages_totals` / `add_both_sexes_totals` / `add_all_races_totals`** - each groups by "everything except the aggregated dimension and Population", sums, and stamps the aggregate label (`All Ages` / `Both Sexes` / `All`).
- **`build_precomputed_totals(df, schema_config)`** - runs the three in order (ages, then sexes, then races), each over the growing frame so the marginals nest correctly. Helper `_groupby_except` computes the group-by column list.

*This module is new* - the legacy code summed on the fly at chart time; storing marginals is a V3 performance decision to keep the browser from summing millions of rows.

---

## Phase 5: Finalize, Validate, and Save

### `scripts/projections/validation/projections_validators.py`

- **`validate_cleaning_output(df, schema_config)`** - a per-source post-clean validator (required columns, null key columns, non-negative population, canonical race/age values). See Flagged Issues: it is defined and tested but **not wired** into the running pipeline, and its null-count check reads a config key that doesn't exist.
- **`validate_projections_dataset(df, validation_config)`** - the final gate: required columns, row-count bounds, expected geographic levels, year range, and duplicate-key detection. Composes the shared validators.
- **`validate_stratification_completeness(df, schema_config)`** - the completeness gate used during merge: groups by `(Geographic Level, Location, Year, Source)`, counts distinct base `(Age, Sex, Race)` tuples against 252, and reports each incomplete group. Aggregate rows are excluded from the base count.

### `scripts/projections/output/finalize_dataset.py`

- **`assign_geographic_level(df, geography_config)`** - vectorized priority ladder (`Other` -> `Region` -> `County` -> `State` -> `US State`) via `Series.mask`, where the `US State` step is source-aware (`Source == "Census cc-est"` and location in the 50-state list). This is what lets California resolve to `State` for DoF and `US State` for Census.
- **`prepare_projections_output(df, schema_config)`** - checks contract columns, casts `Year` to `int64`, sorts, and returns columns in contract order.
- **`archive_and_save(df, current_path, archive_directory)`** - serializes the frame to CSV bytes, compares against the existing file by **streamed SHA-256** (no second full-file string in memory); on a match it returns `None` (no write, file left byte- and mtime-identical), otherwise it `shutil.copy2`s the old file into the archive with an `mm-dd-yy` stamp and writes the new bytes.

*Legacy lineage:* replaces the inline geographic-level tagging (legacy `np.select`-style ladder), the column ordering, and the conditional-save at the end of `combine_dof_and_census()`.

### `scripts/orchestrators/projections_pipeline.py`

- **`ProjectionsPipelinePhaseError` / `_raise_phase_error`** - tag failures with their phase.
- **Fallback and offline helpers:** `_load_saved_source`, `_reduce_to_base_strata` (strips an enriched saved frame back to base strata so re-aggregation doesn't double-count), `_clean_with_fallback`, `_newest_matching`, `_dof_local_strategy` / `_census_local_strategy`, `_dof_live_strategies` / `_census_live_strategies`, `_completeness_validator`, `_geography_config`.
- **`build_projections_dataset(config=None)`** - runs the five phases, derives `expected_levels` from which sources succeeded, and returns `{dataset, dof_new_data, census_new_data, dof_failed, census_failed, output_path, row_count}`.
- **CLI:** `python -m scripts.orchestrators.projections_pipeline` prints the row count, stale-data warnings, and the write status.

*Legacy lineage:* replaces the entire `Projections.__init__()` ETL body, now split across pure functions with explicit phase boundaries and fallback flags.

---

## The Frontend Layer

The Python pipeline stops at the contract CSV. The refactor moved all charting to the shared React UI, so there is no Python visualizer to document. For completeness, the three JavaScript deliverables that consume the contract are:

- **`lib/visualization/moduleSchemas/demographicProjections.js`** - the client-safe field catalog (temporal `Year`; dimensions `Geographic Level`, `Location`, `Age Group`, `Sex`, `Race/Ethnicity`, `Source`; `Population` measure with actual/numericChange/percentChange/indexed transforms; subsets and curated presets). Adds the module-specific `Age Group` / `Sex` / `Race/Ethnicity` filter dimensions that PopHousing and Components don't have.
- **`lib/data/demographic_projections.js`** - server-only data-access layer (`node:fs`) that caches the parsed CSV and does all age/sex/race/source filtering before shaping, mirroring `lib/data/pop_housing.js`.
- **`app/api/projections/route.js`** - thin API route that validates params (including `ageGrouping` for server-side coarser-bin summation) and returns JSON.

*Legacy lineage:* replaces `visualize_line()` (whose stateful `new_plot` trace-overlay maps to additive multi-series selection in React), `visualize_bar()`, and `visualize_map()`.

---

## Flagged Issues and Fragilities

> [!warning] These were found while documenting the code and are recorded here per the standing instruction not to modify code. None were changed. See the companion memory note for the running list.

> [!danger] Change detection compares mismatched grains, so the "new data" flags are effectively always true
> In Phase 4, `detect_new_source_data(dof_clean, historical, ...)` compares the **base-strata** cleaned rows (County / US State only, no marginals) against the **fully enriched** saved history (which contains Region/State rollups and all `All Ages`/`Both Sexes`/`All` rows for that source). Once a contract file exists, the two row sets can never match, so `dof_new_data` and `census_new_data` are essentially always `True`. The pipeline is still idempotent at the file level only because `archive_and_save` independently no-ops on a byte-identical hash - the change-detection flags themselves are unreliable and `archive_and_save` (a full-file hash) runs on every invocation. Unlike the Components module, there is no dtype-normalization fix here because the mismatch is structural, not numeric.

> [!warning] Census year-code map is hard-capped at 2025 while the downloader auto-selects the newest vintage
> `get_census_ccest_url` always builds the URL for the **latest** vintage directory, but `_CENSUS_YEAR_CODE_MAP` only decodes codes 2-7 (2020-2025). When the Census publishes `cc-est2026-alldata` (or later), it will contain `YEAR` codes beyond 7, and `reshape_ccest_to_long` will raise "Unknown cc-est YEAR code(s)". Cleaning then fails and the pipeline silently falls back to stale last-saved Census data (`census_failed=True`) instead of ingesting the new year. The year-code map should be derived from the vintage rather than hard-coded.

> [!warning] P-3 year range is hard-coded to 2020-2070 in two places
> Both `_validate_p3_values` (cleaning) and `final_validation_config["year_range"]` pin the horizon to `(2020, 2070)`. A future P-3 vintage with a shifted horizon (e.g. Baseline 2028 projecting 2025-2075) would fail cleaning validation and, like the Census case, silently degrade to stale last-saved DoF data. The horizon should track the P-3 vintage.

> [!warning] `validate_cleaning_output` is unused and its null check is a permanent no-op
> The function is defined and unit-tested but **never called** in the wired pipeline (the cleaners validate inline; the orchestrator imports only `validate_projections_dataset` and `validate_stratification_completeness`). Worse, even if it were wired, it reads `config.get("key_columns", [])` while `cleaning_validation_config` only defines `critical_columns` - so `validate_null_counts` always receives an empty list and never actually checks for nulls. This mirrors the "tested but unused" helper flagged in [[pophousing-refactor-flagged-issues]].

> [!note] Self-perpetuating history
> `config/paths.py` sets `historical_data_path == current_data_path` (both `DemographicProjections_Current.csv`). Phase 1 reads the contract as its own baseline and Phase 5 writes back to it; there is no immutable canonical source. This is the same pattern flagged for [[pophousing-refactor-flagged-issues]], [[components-of-change-refactor-flagged-issues]], and [[building-permits-migration]]; the completeness gate in Phase 4 is the only structural guard.

> [!note] Logging is stubbed
> `scripts/shared/logging/pipeline_logging.py` and `dataframe_logging.py` bodies are all `pass` ("Not yet implemented"), and the orchestrator does no logging despite the docstrings implying a logged run. Shared with the other modules.

> [!note] FIPS-to-county map is built by arithmetic
> `_build_fips_to_county_map` assumes P-3 county FIPS are exactly the odd sequence 6001-6115 mapped to the alphabetical county list. Any state-summary or non-county FIPS in a future P-3 file would raise `Unmapped FIPS code(s)` and trigger the stale fallback. Correct for the current file, but brittle against source-format drift.

> [!note] Retained-history double-aggregation is latent
> `combine_source_with_historical` retains historical rows for years absent from the incoming frame, and those retained rows are already enriched (they carry Region/State/marginal rows). Aggregation then runs over the full merged frame and would append **new** rollup rows alongside the retained old ones, double-counting for any partial-year release. This is dormant today because both sources deliver their full year spans on every run (so nothing is ever retained), but it would surface if a source ever shipped a subset of its years.

---

## Legacy-to-Refactored Mapping

| Legacy (`projections_code.py`) | Refactored home |
|---|---|
| `Projections.__init__()` ETL body | `orchestrators/projections_pipeline.py::build_projections_dataset` (five phases) |
| `scrape_dof_projections()` | `acquisition/dof_p3_downloader.py::get_p3_file_url` |
| `scrape_dof_projections_spatially()` | `acquisition/dof_p3_downloader.py::get_p3_file_url_positional` |
| `scrape_census_estimates()` | `acquisition/census_ccest_downloader.py::get_census_ccest_url` + `download_census_ccest` |
| inline fallback cascade | `acquisition/source_fallback.py::acquire_with_fallback` (+ orchestrator `_clean_with_fallback`) |
| (new: zipped-CSV distribution) | `dof_p3_downloader.py::extract_csv_from_zip` |
| `clean_dof_projections()` | `cleaning/dof_p3_cleaner.py::clean_p3_projections` |
| `clean_census_estimates()` | `cleaning/census_ccest_cleaner.py::clean_census_estimates` |
| inline race mapping | `cleaning/race_ethnicity_mapping.py` |
| inline age reshaping | `cleaning/age_group_standardizer.py` + `dof_p3_cleaner.py::bin_single_year_ages` |
| inline `add_region()` | `aggregation/regional_aggregation.py::add_regional_data` / `add_state_total` |
| (new: stored marginals) | `aggregation/precomputed_totals.py` |
| `combine_dof_and_census()` | `merging/historical_merge.py` + `output/finalize_dataset.py` |
| geographic-level + archive + save | `output/finalize_dataset.py` |
| `visualize_line/bar/map()` | dropped; replaced by the React frontend (`demographicProjections.js`, `demographic_projections.js`, `api/projections/route.js`) |

---

## Open Items

- [ ] Derive the Census `YEAR` code map from the selected vintage instead of hard-coding 2020-2025, so newer cc-est releases don't fall back to stale data.
- [ ] Make the P-3 year range track the vintage rather than the hard-coded `(2020, 2070)`.
- [ ] Either wire `validate_cleaning_output` into the pipeline (and fix its `key_columns` vs. `critical_columns` mismatch) or remove it.
- [ ] Fix change detection to compare like grains (base vs. base), so `dof_new_data` / `census_new_data` are meaningful and `archive_and_save` can be skipped when nothing changed.
- [ ] Decide whether to introduce an immutable canonical source instead of `historical_data_path == current_data_path`.
- [ ] Implement or remove the stubbed shared logging.
- [ ] Guard `combine_source_with_historical` against retained-year double aggregation if partial-year releases ever become possible.
