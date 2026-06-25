# Components of Change Script

Legacy source: `Previous Tool/Visualization Tool/Components-Of-Change/components_code.py` (1,867 lines). It powers the three legacy notebooks (`VISUALIZE_COMPONENTS_LINEPLOT`, `_BARPLOT`, `_MAP`): it scrapes the California DOF **E-6** workbook and the Census **FTP2 component estimates**, cleans both, merges them with a hardcoded `R:\UCF\...` historical CSV, and renders Plotly line / bar / choropleth charts.

This document mirrors [[pophousing-pipeline-refractor]]: it inventories every legacy function, classifies it, and states where its core responsibility lands in the target `scripts/` tree — **reusing the shared helpers the Pop & Housing refactor already built** rather than re-creating them.

> [!note] Why this refactor matters
> - **Massive triplication.** The scrape → fallback → clean → combine → archive → save → geographic-level block (~250 lines) is copy-pasted verbatim inside `visualize_line`, `visualize_bar`, and `visualize_map`, then *again* inside each function's `except` fallback. Roughly 70% of the file is duplicated logic.
> - **Mixed concerns.** Acquisition, cleaning, persistence, and chart rendering all live inside the three "visualize" entry points.
> - **Hardcoded configuration.** The 9 region→county mappings appear 3×; the state↔abbreviation dicts 2×; the state/region/county classification lists 3×; absolute `R:\UCF\Visualization Tool\...` paths ~15×.
> - **No reuse of the shared layer** that already exists for downloads, type coercion, row filters, validation, archiving, and regional aggregation.

---

## Phase 1: Acquisition

**`scrape_dof_e6()`** — **Worker.** Two `requests.get` calls and two rounds of BeautifulSoup parsing: finds the E-6 landing link on the DOF estimates page by matching `e-6`/`e6` in the href, follows it, selects the first workbook link in the first `<ul>`, downloads it into `io.BytesIO`, and reads the **second** Excel sheet. Calls no project functions.

**`scrape_dof_e6_spatially()`** — **Worker.** Identical to `scrape_dof_e6()` except it selects the E-6 landing link *positionally* (the 7th `<ul>` on the page) as a fallback for when DOF removes "e-6" from the href text. Pure DOF page-structure knowledge.

**`scrape_census_components()`** — **Worker.** Walks the current year backward up to 10× building the `https://www2.census.gov/.../co-est{YEAR}-alldata.csv` URL until one loads. Census-specific URL pattern.

> [!flag] Create New Scripts
> - `scripts/components_of_change/acquisition/dof_e6_downloader.py`
>   - `get_e6_file_url(source_settings)` should contain DOF estimates-page traversal and link-text E-6 selection.
>   - `get_e6_file_url_positional(source_settings)` should contain the positional (7th `<ul>`) fallback selection.
>   - `download_e6_workbook(url, headers, timeout)` should fetch the workbook and load its second sheet.
> - `scripts/components_of_change/acquisition/census_components_downloader.py`
>   - `get_census_components_url(base_url, max_lookback_years)` should perform the year-walk URL discovery.
>   - `download_census_components(url)` should load the CSV (`engine='python'`, `encoding='latin1'`).
> - `scripts/components_of_change/acquisition/source_fallback.py`
>   - `acquire_with_fallback(scrape_fns, manual_path, last_saved_loader)` should encode the **scrape → spatial/positional scrape → manual-download CSV → last-saved CSV** cascade currently inlined (and duplicated 3×) inside every visualizer. Returns `(dataframe, source_failed, used_manual)`.
> - Reuse `scripts/shared/downloads/http_downloads.py` (`fetch_response`, `download_file`); do not duplicate `requests` or binary-write logic in the Components downloaders.

---

## Phase 2: Cleaning

**`clean_e6(df)`** — **Hybrid, leans worker.** Inline work: drop all-NaN columns, assign the 11 canonical E-6 column names, trim every row before the first `California`/`Alameda`, drop the `Apr-Jun 2010/2020` census rows, repair truncated county names (`'Contra '`→`Contra Costa`, `'Los'`→`Los Angeles`, `'San'`→`San Francisco`/`San Joaquin`, `'San Luis'`→`San Luis Obispo`, `'Santa'`→`Santa Barbara`/`Santa Clara`, …), block-forward-fill `Location` across each year span, drop the minimum year, trim rows after the last `Yuba`, retype with comma-stripping, set `Source='DoF'`, rename `California`→`CA`. **Defines an inner `add_region()`** and calls it for all 9 regions, then adds the five crude rates.

**`clean_census_components(df)`** — **Hybrid, leans worker.** Inline work: filter to California + the 49 other states, map state name→abbreviation, `melt` wide→long then `pivot_table` to the canonical schema, rename source columns (`BIRTHS`→`Births`, `DOMESTICMIG`→`Net Domestic Migration`, …), strip `" County"`, retype, compute `Percent`/`Numeric Change in Population` via grouped `pct_change`/`diff`, drop 2020, set `Source='Census'`. **Defines the same inner `add_region()`** and adds the five crude rates.

> [!flag] Create New Scripts
> - `scripts/components_of_change/cleaning/e6_cleaner.py`
>   - `clean_e6(raw_e6_df, columns_config, geography_config)` should orchestrate the steps below.
>   - `normalize_e6_columns(raw_e6_df, column_names)` should absorb the initial E-6 column assignment and row trimming around the first/last real data row.
>   - `repair_truncated_county_names(e6_df, repair_mapping)` should absorb the truncated-county fixups.
>   - `forward_fill_locations_by_year_block(e6_df, location_col, year_col)` should absorb the year-span `Location` fill (E-6-shaped; no generic equivalent).
> - `scripts/components_of_change/cleaning/census_cleaner.py`
>   - `clean_census_components(raw_census_df, columns_config, geography_config)` should orchestrate.
>   - `reshape_census_wide_to_long(raw_census_df, schema)` should absorb the `melt`/`pivot_table` reshape.
>   - `map_state_abbreviations(census_df, mapping)` should apply the state→abbreviation mapping.
> - Reuse `scripts/shared/data_cleaning/type_conversions.py::coerce_numeric_columns` (comma-stripping retype), `row_filters` (year/header trimming), and `dataframe_operations.assign_values_from_mapping` (state-abbreviation apply).
> - **Remove both duplicate inner `add_region()` definitions** — see Phase 4. The crude-rate and population-change blocks move to Phase 3.

---

## Phase 3: Calculations

The five-line crude-rate block and the `Percent`/`Numeric Change in Population` block are duplicated across `clean_e6`, `clean_census_components`, `combine_dof_with_historical`, and `combine_census_with_historical`.

> [!flag] Create New Script (`scripts/components_of_change/calculations/demographic_rates.py`)
> - `add_crude_rates(df, population_col, components_map)` should be the single implementation of the Crude Birth / Death / Migration / Domestic Migration / Foreign Migration rates (`value / Total Population * 1000`).
> - `recalculate_population_change(df, group_col, population_col)` should be the single implementation of `Percent Change in Population` (grouped `pct_change * 100`, rounded to 2) and `Numeric Change in Population` (grouped `diff`). Used by the cleaners, the historical-merge functions, and aggregation.
> - Do not retain per-source copies of these formulas.

---

## Phase 4: Aggregation

The inner `add_region(df, regions_to_combine, new_region)` (groupby `Year`, sum, relabel `Location`, concat) is defined **twice** and is mechanically the same county→region rollup as Pop & Housing's `build_regional_rows`. The 9 region→county groups are byte-identical to `lib/pophousing_config.py::REGIONS_MAPPING`.

> [!flag] Create New Script (`scripts/components_of_change/aggregation/regional_aggregation.py`)
> - `add_regional_data(df, regions_mapping)` should be the Components entry point: build the 9 regions by additive groupby-sum (reusing the `build_regional_rows` pattern in `scripts/pophousing/aggregation/regional_aggregation.py`), then call `demographic_rates.add_crude_rates` to recompute rates on the aggregate rows.
> - Source `regions_mapping` from `scripts/pophousing/config/geography.py::get_geography_config()` — do not re-hardcode the 9 region groups.
> - Do not keep `add_region` as a nested function inside the cleaners.

---

## Phase 5: Merging with Historical

**`combine_dof_with_historical(df)`** — **Worker.** Reads the canonical CSV (hardcoded `R:\` path), drops `Geographic Level`, filters to `Source=='DoF'`, keeps the historical years absent from the new pull, concatenates, sorts by `Location`/`Year`, recomputes change, re-stamps `Source='DoF'`.

**`combine_census_with_historical(df)`** — **Worker.** The same logic for `Source=='Census'`.

**`combine_dof_and_census(dof, census)`** — **Worker.** Reads the canonical CSV and uses `pd.testing.assert_frame_equal` (excluding boundary years 1990 for DoF / 2010 for Census) to detect whether the freshly scraped data differs from what's saved, then concatenates. Returns `(merged_df, new_dof_data_exists, new_census_data_exists)`.

> [!flag] Create New Script (`scripts/components_of_change/merging/historical_merge.py`)
> - `load_canonical_dataset(current_data_path)` should perform the single read of the current CSV (path from config, not `R:\`).
> - `combine_source_with_historical(new_df, historical_df, source, year_col)` should be one parametrized implementation replacing the near-identical DoF and Census variants.
> - `detect_new_source_data(new_df, historical_df, source, boundary_year)` should own the `assert_frame_equal` change-detection, returning one bool per source.
> - `merge_dof_and_census(dof_df, census_df)` should perform the final concat and `Year` retype.
> - Reuse `scripts/shared/validation/dataframe_validators.py` (`find_duplicate_rows`, `validate_required_columns`) for post-merge sanity.

---

## Phase 6: Output — Geographic Level, Archive, Save

Inline in every visualizer (and duplicated again in their `except` blocks): on new data, archive the current CSV with a `%m-%d-%y` date stamp, assign `Geographic Level` via `np.select` over hardcoded state/region/county lists, reorder columns so `Geographic Level` is first, and write back to the canonical CSV.

> [!flag] Create New Script (`scripts/components_of_change/output/finalize_dataset.py`)
> - `assign_geographic_level(df, geography_config)` should replace the 3× duplicated `np.select` block (levels State / Region / County / Other). California counties and regions come from the shared geography config; US states come from the new Components national config (below).
> - `archive_and_save(df, current_data_path, archive_directory)` should archive the prior CSV — reusing `scripts/shared/archives/file_retention.py::archive_or_delete_files` — then write the new one.
> - This save step should run **once** in the orchestrator, gated on `new_*_data_found`, not inside each chart function.

---

## Phase 7: Validation

Input validation is currently inline at the top of each visualizer: valid `parameter` / `location` / `source` / `subset` / year lists, plus rules such as "national data only for Census", "DoF must start ≥ 1991", "Census must start ≥ 2011", and "no Census data for 2020".

> [!flag] Create New Scripts
> - `scripts/components_of_change/validation/input_validators.py`
>   - `validate_parameters(parameters)`, `validate_locations(locations, source)`, `validate_source(source)`, `validate_subset(subset, source)`, and `validate_year_bounds(source, start_year, end_year, available)` should return structured results or raise, instead of `print` + `return None`.
> - `scripts/components_of_change/validation/dataset_validator.py`
>   - `validate_components_dataset(df, columns_config)` should compose the shared `validate_required_columns`, `validate_not_empty`, and `find_duplicate_rows` checks before save.

---

## The Three Visualizers

**`visualize_line(locations, parameters, source, start_year, end_year, indexed=False)`** — **Orchestrator + renderer (~460 lines).** Input validation → expands `All Counties`/`All Regions` → inline DoF acquisition cascade → inline Census acquisition cascade → combine → drop 1990 / Census-2010 → year + source filter → optional indexing-from-100 → builds a Plotly line chart → archive/level/save → a giant `except` block that re-loads last-saved data and **re-implements the entire render**.

**`visualize_bar(subset, parameter, metric_of_change, start_year, end_year, source)`** — **Orchestrator + renderer (~490 lines).** Same acquisition/clean/combine prologue and save/`except` epilogue; the middle pivots by year and computes `Percent Change` / `Numeric Change` / `Total`, then a sorted bar chart with California highlighted.

**`visualize_map(subset, parameter, metric_of_change, start_year, end_year, source, bins_range, num_bins)`** — **Orchestrator + renderer (~540 lines).** Same prologue/epilogue; the middle adds GeoJSON loading, on-the-fly region geometry dissolve (`unary_union`), bin-edge computation, missing-bin imputation, `abbreviation→state` remap, and a choropleth (CA counties/regions vs. US states).

> [!flag] Split each visualizer into orchestrator + shared renderer
> - `scripts/orchestrators/components_of_change_pipeline.py`
>   - `build_components_dataset(config)` should run acquisition (with fallback), cleaning, calculations, aggregation, historical merge, change-detection, and the conditional archive/save **exactly once**. Returns the merged DataFrame plus `new_dof_data_found` / `new_census_data_found`. This single function replaces the prologue + epilogue copied across all three visualizers and their `except` blocks.
> - `scripts/shared/visualizations/line_chart.py`
>   - `build_line_chart(df, locations, parameters, sources, indexed, color_palette)` — generic Plotly line builder (palette + SVG export config), no scraping or IO.
> - `scripts/shared/visualizations/bar_chart.py`
>   - `compute_change_metric(df, parameter, metric_of_change, start_year, end_year)` and `build_bar_chart(result, ...)` — generic change/total bar builder.
> - `scripts/shared/visualizations/choropleth_map.py`
>   - `build_choropleth(result, geojson, ...)`, `compute_bins(values, bins_range, num_bins)`, and `dissolve_regions(counties_gdf, regions_mapping)` — generic map utilities.
> - `scripts/components_of_change/` keeps thin notebook-facing wrappers `visualize_line/bar/map` that: validate inputs → call `build_components_dataset()` → filter → call the shared chart builder.
> - The `except`-block re-render disappears: fallback to last-saved data lives inside `acquire_with_fallback` / `build_components_dataset`, so rendering code exists exactly once.

---

## Configuration to Extract

The legacy file hardcodes its configuration repeatedly. These values move out of the code.

> [!flag] Create New Scripts
> - `scripts/components_of_change/config/paths.py`
>   - Current, archive, and downloaded CSV paths plus the county/state GeoJSON paths — replaces every hardcoded `R:\UCF\Visualization Tool\Components-Of-Change\...` literal.
> - `scripts/components_of_change/config/sources.py`
>   - DOF estimates URL, Census FTP2 URL template, request headers, the second-sheet rule, manual-download filenames, and the boundary years (1990 DoF, 2010 Census).
> - `scripts/components_of_change/config/columns.py`
>   - The 11 canonical columns, the valid `parameters` list, the crude-rate component map, and the Census source-column rename map.
> - `scripts/components_of_change/config/geography.py`
>   - `get_components_geography()` should compose `scripts/pophousing/config/geography.py::get_geography_config()` (California counties / regions / state) **plus** the US `state↔abbreviation` dicts and the national `State`-level list, so the choropleth and `assign_geographic_level` stop hardcoding them.

---

## Reusing the Existing Shared Layer

These already exist in `scripts/` from the Pop & Housing refactor. **Do not recreate them.**

| Need in Components | Reuse this existing function |
|---|---|
| HTTP GET + binary download | `scripts/shared/downloads/http_downloads.py` → `fetch_response`, `download_file` |
| Numeric coercion (strip commas → float) | `scripts/shared/data_cleaning/type_conversions.py` → `coerce_numeric_columns` |
| Year-range / summary-row / empty-row filtering | `scripts/shared/data_cleaning/row_filters.py` → `filter_year_range`, `remove_summary_rows`, `drop_empty_rows_without_data` |
| Forward-fill, value mapping | `scripts/shared/data_cleaning/dataframe_operations.py` → `forward_fill_columns`, `assign_values_from_mapping` |
| Schema / emptiness / duplicate / null checks | `scripts/shared/validation/dataframe_validators.py` → `validate_required_columns`, `validate_not_empty`, `find_duplicate_rows`, `validate_null_counts` |
| Archive previous CSV before overwrite | `scripts/shared/archives/file_retention.py` → `archive_or_delete_files` |
| Console / file logging (replace `print`) | `scripts/shared/logging/pipeline_logging.py`, `dataframe_logging.py` |
| CA county / region names + region→county mapping | `scripts/pophousing/config/geography.py` → `get_geography_config()` (the 9 regions are identical to those hardcoded in `components_code.py`) |
| County→region groupby-sum aggregation | `scripts/pophousing/aggregation/regional_aggregation.py` → `build_regional_rows` pattern; `aggregation_utils.deduplicate_geographic_rows` |

---

## Summary Table

This table describes the current legacy implementation. The phase callouts above describe the proposed replacement architecture.

| Legacy function | Classification | Target home |
|---|---|---|
| `scrape_dof_e6()` | **Worker** | `components_of_change/acquisition/dof_e6_downloader.py` |
| `scrape_dof_e6_spatially()` | **Worker** | `dof_e6_downloader.get_e6_file_url_positional` |
| `scrape_census_components()` | **Worker** | `acquisition/census_components_downloader.py` |
| inline DoF/Census fallback cascade (×6) | **Inline glue** | `acquisition/source_fallback.py` |
| `clean_e6()` | **Hybrid** | `cleaning/e6_cleaner.py` (+ shared cleaners, calculations) |
| `clean_census_components()` | **Hybrid** | `cleaning/census_cleaner.py` (+ shared cleaners, calculations) |
| inner `add_region()` (×2) | **Worker** | `aggregation/regional_aggregation.py` (reuse pophousing pattern) |
| crude-rate / population-change blocks (×4) | **Inline** | `calculations/demographic_rates.py` |
| `combine_dof_with_historical()` | **Worker** | `merging/historical_merge.py` |
| `combine_census_with_historical()` | **Worker** | `merging/historical_merge.py` (same parametrized fn) |
| `combine_dof_and_census()` | **Worker** | `merging/historical_merge.py` |
| geographic-level + archive + save (×3) | **Inline** | `output/finalize_dataset.py` (+ shared archives) |
| input-validation blocks (×3) | **Inline** | `validation/input_validators.py` |
| `visualize_line()` | **Orchestrator + renderer** | orchestrator + `shared/visualizations/line_chart.py` |
| `visualize_bar()` | **Orchestrator + renderer** | orchestrator + `shared/visualizations/bar_chart.py` |
| `visualize_map()` | **Orchestrator + renderer** | orchestrator + `shared/visualizations/choropleth_map.py` |

---

## Proposed Directory Structure

> [!flag] Create New Folders
> - `scripts/components_of_change/`
>   - `config/` — paths, sources, columns/parameters, national-state geography
>   - `acquisition/` — DOF E-6 + Census downloaders (with fallback policy)
>   - `cleaning/` — E-6 and Census cleaners
>   - `calculations/` — crude-rate + population-change formulas
>   - `aggregation/` — regional rollups
>   - `merging/` — combine-with-historical + DoF/Census merge
>   - `output/` — geographic-level tagging, archive, save
>   - `validation/` — input validation + dataset validation
> - `scripts/shared/visualizations/` — generic Plotly builders (`line_chart.py`, `bar_chart.py`, `choropleth_map.py`)
> - `scripts/orchestrators/components_of_change_pipeline.py` — single data-prep entry point

---

## Dependency Direction

The final dependency direction should be:

`shared helpers + shared/visualizations` → imported by → `components_of_change modules` → coordinated by → `orchestrators/components_of_change_pipeline.py`

The following should be prohibited:

- `scripts/shared/` importing anything from `scripts/components_of_change/` or `scripts/pophousing/`.
- Any module re-hardcoding the region mapping, the state↔abbreviation dicts, the geographic-level classification lists, the crude-rate formulas, or `R:\` paths.
- Chart functions performing scraping or file IO.
- Components and Pop & Housing maintaining separate copies of regional aggregation, geography configuration, or shared cleaning/validation logic.
