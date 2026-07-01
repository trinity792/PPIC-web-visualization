# Age-Sex-Race Projections: Refactoring Plan

A plan for migrating the legacy `projections_code.py` module into the V3 architecture established by PopHousing and Components of Change.

---

## Legacy Module Summary

The current module lives at `Visualization Tool/Age-Sex-Race-Projections/projections_code.py`. It is structurally unique among the five legacy modules: it is the only one built as a class (`Projections`) rather than a collection of standalone functions. The full ETL runs once inside `__init__()`, and the `visualize_*` methods read a cached `self.Projections` DataFrame without re-scraping. `visualize_line()` is also stateful, appending traces to a persistent `self.fig` so successive calls can overlay series on one figure.

### Data sources

Two external sources feed the module:

- DoF P-3 demographic projections (county and state sheets): population projected by age, sex, and race/ethnicity. Published periodically (not annually).
- Census Bureau cc-est demographic estimates (county and state): actual population estimates by the same stratification dimensions. Published annually.

### Current method inventory

| Legacy method | Role |
|---|---|
| `__init__()` | Loads history, scrapes both sources (three-tier fallback), cleans, merges, and saves. All side effects fire on instantiation. |
| `scrape_dof_projections()` | P-3 download via link-text matching. |
| `scrape_dof_projections_spatially()` | P-3 positional fallback scraper. |
| `scrape_census_estimates()` | Census cc-est download. |
| `clean_dof_projections()` | Reshape age/sex/race columns; map to 7 race-ethnicity groups; compute regional and state aggregations. |
| `clean_census_estimates()` | Same reshape and aggregation for Census data. |
| `combine_dof_and_census()` | Unify both sources into a single DataFrame; conditional-save to CSV. |
| `visualize_line()` | Renders line chart from `self.Projections`; stateful trace overlay via `new_plot` flag. |
| `visualize_bar()` | Renders bar chart from `self.Projections`. |
| `visualize_map()` | Renders choropleth from `self.Projections` using local GeoJSON files. |

### Stratification dimensions

Location (58 CA counties + 9 regions + California + 50 US states) x Year x Age (5-year groups) x Sex x Race/Ethnicity (White, Black, Asian, NHPI, AIAN, Multiracial, Hispanic).

### Legacy fragilities carried forward

- Three-tier fallback scraping depends on DoF CSS classes (`et_pb_text_inner`) and positional `<ul>` indices. A site redesign breaks all tiers at once.
- Excel sheet-index assumptions (`sheet_names[1]`). A reordered workbook silently loads the wrong data.
- `warnings.filterwarnings("ignore")` hides pandas parse warnings.
- Hard-coded `R:\UCF\...` Windows paths.
- Duplicated region definitions (same 9 regions copy-pasted from other modules).
- No automated tests.
- Positional column renaming that breaks if DoF inserts or removes a column.

### Legacy method-to-target mapping

| Legacy method | Classification | Target home |
|---|---|---|
| `scrape_dof_projections()` | Worker | `projections/acquisition/dof_p3_downloader.py` |
| `scrape_dof_projections_spatially()` | Worker | `dof_p3_downloader.get_p3_file_url_positional` |
| `scrape_census_estimates()` | Worker | `projections/acquisition/census_ccest_downloader.py` |
| inline DoF/Census fallback cascade | Inline glue | `projections/acquisition/source_fallback.py` |
| `clean_dof_projections()` | Hybrid | `projections/cleaning/dof_p3_cleaner.py` (+ race/age helpers) |
| `clean_census_estimates()` | Hybrid | `projections/cleaning/census_ccest_cleaner.py` (+ race/age helpers) |
| inner race-ethnicity mapping | Inline | `projections/cleaning/race_ethnicity_mapping.py` |
| inner age-group reshaping | Inline | `projections/cleaning/age_group_standardizer.py` |
| inner `add_region()` | Worker | `projections/aggregation/regional_aggregation.py` |
| `combine_dof_and_census()` | Worker | `projections/merging/historical_merge.py` |
| geographic-level + archive + save | Inline | `projections/output/finalize_dataset.py` |
| `visualize_line/bar/map()` | Renderer | dropped (replaced by React frontend) |

---

## Unique Challenges

This module introduces several concerns the previous two migrations (PopHousing and Components of Change) did not face. Each needs a deliberate design decision before coding begins.

### 1. Class-to-function decomposition

The legacy module wraps everything in one class whose `__init__` is a 300+ line ETL pipeline. In V3, the class must be dissolved into the standard three-layer structure (shared / domain / orchestrator) with pure functions. The stateful `self.Projections` cache becomes the contract CSV, and the stateful `self.fig` trace-overlay pattern becomes a React UI concern (multi-select + additive trace rendering).

### 2. Two data sources with different update cadences

P-3 projections are published periodically (when DoF updates its projection baseline), while cc-est estimates are annual. The pipeline needs to handle each source independently and then merge, similar to how Components of Change handles DoF E-6 and Census components. A `Source` column in the contract CSV should preserve provenance, and the frontend should offer source-aware filtering.

### 3. High-dimensional output and data volume

The P-3 file is far larger than anything the other modules handle. Its raw dimensions are 58 counties x 51 years (2020-2070) x 2 sexes x 7 race codes x 111 single-year ages (0-110), producing roughly 45.8 million rows. Even after binning single-year ages into 5-year groups (23 bins including 85+), the P-3 county data alone is ~9.5 million rows. Adding Census cc-est for all 50 US states multiplies the problem further.

This has cascading implications:

- The pipeline must bin single-year ages to 5-year groups during Phase 3 (cleaning), not defer it to the frontend. This is a lossy aggregation (sum of `perwt` within each bin), so it must happen before the contract CSV is written.
- The contract CSV will still be large (order of millions of rows). The `loadProjectionsData()` server cache that works for PopHousing's 19K rows may need a more efficient parsing strategy (e.g. streaming parse, column-typed arrays, or a build step that converts to a binary format). This is a performance decision to evaluate once the contract CSV size is known.
- Server-side filtering is mandatory. The full dataset cannot be shipped to the browser. The API route needs to accept age group, sex, race/ethnicity, and source as query parameters alongside the existing location/year/measure/subset patterns.
- Precomputed aggregation rows ("All Ages", "Both Sexes", "All" race) should be stored in the CSV to avoid forcing the data-access layer to sum on every request, but they also increase the row count further. The enrichment phase must be deliberate about which combinations to precompute.
- Age-group consolidation from 5-year groups into user-defined presets (Under 18, 18-25, 26-64, 65+) happens server-side in the API route, not in the pipeline. The 5-year groups are the granularity stored in the contract; the API sums them into coarser bins on request.

### 4. Projections vs. estimates

Unlike all other modules, this one blends forward-looking projections (P-3) with backward-looking estimates (cc-est). The frontend must make this distinction visible so users do not mistake a projection for observed data. A "Data Type" dimension (Projection / Estimate) or a clear source label in chart annotations would serve this purpose.

### 5. Stateful line chart overlay

The legacy `visualize_line()` appends traces to a persistent figure via a `new_plot` flag. In React, this maps naturally to a multi-series line chart driven by an additive selection UI (e.g. the user picks race groups one at a time and each appears as a new trace). No special architecture is needed, but the frontend schema's preset definitions should include an "overlay comparison" preset that pre-configures this behavior.

---

## Target Architecture

Following the established module pattern, the refactored module spans seven deliverables.

```
scripts/
  projections/
    config/
      paths.py
      sources.py
      schemas.py
    acquisition/
      dof_p3_downloader.py
      census_ccest_downloader.py
      source_fallback.py
    cleaning/
      dof_p3_cleaner.py
      census_ccest_cleaner.py
      race_ethnicity_mapping.py
      age_group_standardizer.py
    aggregation/
      regional_aggregation.py
      precomputed_totals.py
    merging/
      historical_merge.py
    validation/
      projections_validators.py
    output/
      finalize_dataset.py
  orchestrators/
    projections_pipeline.py
  unit_tests/
    projections/
      config/
        test_paths.py
        test_sources.py
        test_schemas.py
      acquisition/
        test_dof_p3_downloader.py
        test_census_ccest_downloader.py
        test_source_fallback.py
      cleaning/
        test_dof_p3_cleaner.py
        test_census_ccest_cleaner.py
        test_race_ethnicity_mapping.py
        test_age_group_standardizer.py
      aggregation/
        test_regional_aggregation.py
        test_precomputed_totals.py
      merging/
        test_historical_merge.py
      validation/
        test_projections_validators.py
      output/
        test_finalize_dataset.py
    orchestrators/
      test_projections_pipeline.py

data/
  data-raw/demographic-projections/
  data-cleaned/demographic-projections/
    DemographicProjections_Current.csv

lib/
  data/demographic_projections.js
  visualization/moduleSchemas/demographicProjections.js

app/
  api/projections/route.js
```

---

## Data Contract

The pipeline's output is `data/data-cleaned/demographic-projections/DemographicProjections_Current.csv`.

### Grain

One row per `(Location, Geographic Level, Year, Age Group, Sex, Race/Ethnicity, Source)`.

### Columns (proposed)

```
Geographic Level, Location, Year, Age Group, Sex, Race/Ethnicity,
Population, Source
```

Where:

- `Geographic Level`: State, County, Region (9 CA regions), US State (50 states).
- `Location`: county name, region name, "California", or US state name.
- `Year`: integer.
- `Age Group`: standardized 5-year labels (e.g. "0-4", "5-9", ..., "85+", "All Ages").
- `Sex`: "Male", "Female", "Both Sexes".
- `Race/Ethnicity`: White, Black, Asian, NHPI, AIAN, Multiracial, Hispanic, "All".
- `Population`: integer count.
- `Source`: "DoF P-3" or "Census cc-est".

### Aggregation rows

The pipeline must write pre-aggregated rows for "All Ages", "Both Sexes", and "All" (race) to enable fast filtering without client-side summation. These follow the same grain; the population values are summed from their component rows during the aggregation phase.

### P-3 geographic scope

The P-3 file contains only California county-level data (58 FIPS codes, 6001-6115). There is no state-level row in the source. The pipeline must compute the "California" state total by summing all 58 county rows for each (Year, Age Group, Sex, Race/Ethnicity) combination during the aggregation phase. The 9 CA region rows are also computed from county sums. All 50 US state data comes exclusively from Census cc-est.

### Year coverage

P-3 projections: 2020-2070 (Baseline 2024, Vintage 2026). Census cc-est estimates: earliest available cc-est year through the most recent release. The frontend distinguishes them via the `Source` column.

### Age-group storage

The contract CSV stores 5-year age groups (pipeline bins single-year ages during cleaning), not single-year ages. The canonical groups are: 0-4, 5-9, 10-14, 15-19, 20-24, 25-29, 30-34, 35-39, 40-44, 45-49, 50-54, 55-59, 60-64, 65-69, 70-74, 75-79, 80-84, 85+. The "85+" bin aggregates ages 85-110 from the P-3 source.

User-defined coarser groupings (the default frontend presets are Under 18, 18-25, 26-64, 65+) are computed server-side in the API route by summing the stored 5-year groups. These are not stored in the CSV because they are a frontend presentation concern.

---

## Pipeline Phases and Function Definitions

Each section below defines one pipeline phase: its purpose, the files it contains, and every function signature with its docstring. No implementations are provided.

---

### Phase 1: Configuration

Three config modules expose one `get_*()` function each, returning plain dicts. The projections module should have its own `lib/projections_config.py` root config if the P-3/cc-est source constants are substantial enough to warrant one; otherwise the schemas file can inline them.

#### `scripts/projections/config/paths.py`

```python
"""
paths.py — exposes Demographic Projections pipeline paths as pathlib objects.

Data sources:
    - lib/projections_config.py — project, data, archive, download, and log path settings

Outputs:
    - dict — named pathlib.Path values used throughout the pipeline

Usage:
    python scripts/projections/config/paths.py

Test Folders:
    - scripts/unit_tests/projections/config/
"""

from pathlib import Path


def get_paths():
    """Return configured pipeline paths as pathlib objects. Test file: scripts/unit_tests/projections/config/test_paths.py"""
```

#### `scripts/projections/config/sources.py`

```python
"""
sources.py — exposes Demographic Projections source URLs, request settings, and cache policy.

Data sources:
    - lib/projections_config.py — DoF P-3 and Census cc-est URL patterns, timeouts, and cache ages

Outputs:
    - dict — source settings consumed by the acquisition phase

Usage:
    python scripts/projections/config/sources.py

Test Folders:
    - scripts/unit_tests/projections/config/
"""


def get_source_settings():
    """
    Return source-acquisition settings for both DoF P-3 and Census cc-est.

    Returns:
        dict with keys: dof_base_url, census_base_url, request_headers, timeout,
        p3_cache_max_age_days, p3_fallback_max_age_days, ccest_cache_max_age_days,
        p3_filename_pattern, p3_expected_csv_columns, ccest_expected_columns.

    Test file:
        scripts/unit_tests/projections/config/test_sources.py
    """
```

#### `scripts/projections/config/schemas.py`

```python
"""
schemas.py — exposes Demographic Projections column schemas, canonical value sets, and validation configs.

Data sources:
    - lib/projections_config.py — column names, race-ethnicity mappings, age-group labels

Outputs:
    - dict — schema settings consumed by cleaning, validation, and output phases

Usage:
    python scripts/projections/config/schemas.py

Test Folders:
    - scripts/unit_tests/projections/config/
"""


def get_schema_config():
    """
    Return schema configuration for the Demographic Projections pipeline.

    Returns:
        dict with keys: output_columns, required_columns, population_column,
        year_column, location_column, level_column, source_column,
        age_group_column, sex_column, race_column,
        p3_raw_columns (fips, year, sex, race7, agerc, perwt),
        fips_to_county_map ({6001: "Alameda", ...}),
        p3_race7_code_map ({1: "White", 2: "Black", ...}),
        census_race_code_map,
        age_bin_edges ([0, 5, 10, ..., 85] with 85+ as the open-ended top bin),
        canonical_age_groups, canonical_sexes, canonical_race_groups,
        sex_label_map ({"MALE": "Male", "FEMALE": "Female"}),
        cleaning_validation_config, final_validation_config.

    Test file:
        scripts/unit_tests/projections/config/test_schemas.py
    """
```

---

### Phase 2: Data Acquisition

Two downloaders (one per source) plus a shared fallback coordinator. The P-3 downloader handles zip extraction (the DoF distributes P-3 as a compressed zip containing a CSV). Each downloader uses `scripts/shared/downloads/http_downloads.py` for HTTP and follows the PopHousing/Components resilience pattern: primary discovery, positional fallback, manual CSV, last-saved rows.

#### `scripts/projections/acquisition/dof_p3_downloader.py`

```python
"""
dof_p3_downloader.py — discovers and downloads the DoF P-3 demographic projections zip archive.

Data sources:
    - California Department of Finance projections page — HTML page with links to P-3 zip files
    - P-3 zip archive — contains a comma-delimited CSV with columns: fips, year, sex, race7, agerc, perwt

Outputs:
    - {download_directory}/P-3_{FILENAME}.csv — extracted P-3 CSV on disk (zip is discarded after extraction)

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/acquisition/
"""

from pathlib import Path

import pandas as pd


"""
========================================================================================================================
Discovery Errors
========================================================================================================================
"""


class P3DiscoveryError(RuntimeError):
    """Raised when the P-3 zip URL cannot be found on the DoF site. Test file: scripts/unit_tests/projections/acquisition/test_dof_p3_downloader.py"""


# ── URL Discovery ─────────────────────────────────────────────────────────────


def get_p3_file_url(base_url, headers, timeout):
    """
    Discover the current P-3 zip URL by matching link text on the DoF projections page.

    Args:
        base_url: DoF demographic projections landing page URL
        headers: HTTP request headers (User-Agent, etc.)
        timeout: request timeout in seconds

    Returns:
        str — direct download URL for the P-3 zip archive.

    Raises:
        P3DiscoveryError — if no matching link is found on the page.

    Test file:
        scripts/unit_tests/projections/acquisition/test_dof_p3_downloader.py
    """


def get_p3_file_url_positional(base_url, headers, timeout):
    """
    Fallback URL discovery using positional HTML element matching.

    Args:
        base_url: DoF demographic projections landing page URL
        headers: HTTP request headers
        timeout: request timeout in seconds

    Returns:
        str — direct download URL for the P-3 zip archive.

    Raises:
        P3DiscoveryError — if positional matching fails.

    Test file:
        scripts/unit_tests/projections/acquisition/test_dof_p3_downloader.py
    """


# ── Download and Extraction ───────────────────────────────────────────────────


def download_p3_data(url, download_directory, headers, timeout, cache_max_age_days):
    """
    Download the P-3 zip and extract its CSV, or return a cached CSV if one exists within the cache window.

    The DoF distributes P-3 data as a compressed zip containing a single comma-delimited
    CSV file. This function downloads the zip, extracts the CSV, and removes the zip.
    If a local CSV matching the filename pattern is younger than cache_max_age_days,
    the download is skipped.

    Args:
        url: direct URL to the P-3 zip file (or None if discovery failed)
        download_directory: pathlib.Path where extracted CSV files are stored
        headers: HTTP request headers
        timeout: request timeout in seconds
        cache_max_age_days: reuse a local CSV younger than this many days

    Returns:
        pathlib.Path — path to the local extracted P-3 CSV.

    Raises:
        HTTPDownloadError — if the download fails and no cache is available.

    Test file:
        scripts/unit_tests/projections/acquisition/test_dof_p3_downloader.py
    """


def extract_csv_from_zip(zip_path, download_directory):
    """
    Extract the single CSV from a P-3 zip archive.

    Args:
        zip_path: pathlib.Path to the downloaded zip file
        download_directory: pathlib.Path where the CSV should be written

    Returns:
        pathlib.Path — path to the extracted CSV file.

    Raises:
        ValueError — if the zip does not contain exactly one CSV file.

    Test file:
        scripts/unit_tests/projections/acquisition/test_dof_p3_downloader.py
    """


def get_most_recent_p3_file(download_directory, filename_pattern, max_age_days):
    """
    Scan the download directory for the newest P-3 CSV within the fallback window.

    Args:
        download_directory: pathlib.Path to scan
        filename_pattern: regex pattern matching valid P-3 CSV filenames
        max_age_days: ignore files older than this

    Returns:
        pathlib.Path or None — path to the most recent valid file, or None if none found.

    Test file:
        scripts/unit_tests/projections/acquisition/test_dof_p3_downloader.py
    """


def validate_p3_csv(csv_path, expected_columns):
    """
    Confirm that the extracted CSV contains the expected column headers (fips, year, sex, race7, agerc, perwt).

    Args:
        csv_path: pathlib.Path to the extracted CSV
        expected_columns: list of column name strings that must be present

    Raises:
        ValueError — if any expected column is missing, with an actionable message.

    Test file:
        scripts/unit_tests/projections/acquisition/test_dof_p3_downloader.py
    """
```

#### `scripts/projections/acquisition/census_ccest_downloader.py`

```python
"""
census_ccest_downloader.py — discovers and downloads Census Bureau cc-est demographic estimate files.

Data sources:
    - U.S. Census Bureau population estimates page — cc-est CSV files by state/county

Outputs:
    - {download_directory}/cc-est_{FILENAME}.csv — downloaded cc-est CSV on disk

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/acquisition/
"""

from pathlib import Path

import pandas as pd


# ── URL Discovery ─────────────────────────────────────────────────────────────


def get_census_ccest_url(base_url, headers, timeout):
    """
    Discover the current cc-est CSV URL on the Census Bureau site.

    Args:
        base_url: Census population estimates landing page URL
        headers: HTTP request headers
        timeout: request timeout in seconds

    Returns:
        str — direct download URL for the cc-est CSV.

    Raises:
        RuntimeError — if no matching link is found.

    Test file:
        scripts/unit_tests/projections/acquisition/test_census_ccest_downloader.py
    """


# ── Download ──────────────────────────────────────────────────────────────────


def download_census_ccest(url, download_directory, headers, timeout, cache_max_age_days):
    """
    Download the cc-est CSV or return a cached copy if one exists within the cache window.

    Args:
        url: direct URL to the cc-est CSV (or None if discovery failed)
        download_directory: pathlib.Path where downloaded files are stored
        headers: HTTP request headers
        timeout: request timeout in seconds
        cache_max_age_days: reuse a local file younger than this many days

    Returns:
        pathlib.Path — path to the local cc-est CSV.

    Raises:
        HTTPDownloadError — if the download fails and no cache is available.

    Test file:
        scripts/unit_tests/projections/acquisition/test_census_ccest_downloader.py
    """


def validate_ccest_headers(csv_path, expected_columns):
    """
    Confirm that the downloaded CSV contains the expected column headers.

    Args:
        csv_path: pathlib.Path to the CSV file
        expected_columns: list of column names that must be present

    Raises:
        ValueError — if any expected column is missing, with an actionable message.

    Test file:
        scripts/unit_tests/projections/acquisition/test_census_ccest_downloader.py
    """
```

#### `scripts/projections/acquisition/source_fallback.py`

```python
"""
source_fallback.py — resilient acquisition coordinator for Demographic Projections sources.

Data sources:
    - dof_p3_downloader.py — live DoF P-3 strategies
    - census_ccest_downloader.py — live Census cc-est strategies
    - data/data-raw/demographic-projections/{FILENAME} — optional manual fallback files
    - data/data-cleaned/demographic-projections/DemographicProjections_Current.csv — last-saved rows

Outputs:
    - pandas.DataFrame — raw data from the best available source
    - bool — whether acquisition failed (fell back to last-saved)
    - bool — whether a manual file was used

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/acquisition/
"""

import pandas as pd


def acquire_with_fallback(live_strategies, manual_path, saved_rows_fn, source_name):
    """
    Try each live acquisition strategy in order, then a manual CSV, then last-saved rows.

    Args:
        live_strategies: list of callables, each returning a pathlib.Path or raising on failure
        manual_path: pathlib.Path to the manually-placed raw file (may not exist)
        saved_rows_fn: callable returning a DataFrame of last-saved rows for this source
        source_name: str label for error messages (e.g. "DoF P-3")

    Returns:
        tuple of (raw_df, source_failed, used_manual):
            raw_df — DataFrame of raw data from the best available source
            source_failed — True if all live strategies and the manual file failed
            used_manual — True if the manual CSV was used instead of a live download

    Test file:
        scripts/unit_tests/projections/acquisition/test_source_fallback.py
    """
```

---

### Phase 3: Cleaning

Each source gets its own cleaner. Two shared helpers (race mapping and age-group standardization) are extracted because both cleaners need them and the mapping logic must stay synchronized.

The P-3 cleaner does not need wide-to-long reshaping because the source CSV is already one-row-per-record. Its primary operations are: FIPS-to-county-name mapping, race7 code decoding, single-year-age binning to 5-year groups (summing population within each bin), and sex label standardization. The cc-est cleaner handles whatever format the Census source uses and normalizes to the same canonical schema.

#### `scripts/projections/cleaning/dof_p3_cleaner.py`

```python
"""
dof_p3_cleaner.py — cleans the DoF P-3 demographic projections CSV.

The P-3 source is a flat, long-format CSV (one population count per row) with columns:
fips (county FIPS code), year, sex (MALE/FEMALE), race7 (1-7), agerc (0-110), perwt (population).
The data is already one-row-per-record, so no wide-to-long reshaping is needed. Cleaning
consists of: FIPS-to-county-name mapping, race code decoding, single-year-age binning to
5-year groups (summing perwt within each bin), and sex label standardization.

Data sources:
    - {download_directory}/P-3_{FILENAME}.csv — extracted P-3 CSV (columns: fips, year, sex, race7, agerc, perwt)

Outputs:
    - pandas.DataFrame — cleaned rows matching the canonical cleaning-stage schema

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/cleaning/
"""

import pandas as pd


"""
========================================================================================================================
Column Mapping
========================================================================================================================
"""


def map_fips_to_county(df, fips_column, fips_to_county_map):
    """
    Replace numeric FIPS codes with county names and rename the column to Location.

    Args:
        df: pandas.DataFrame containing the raw fips column
        fips_column: name of the column holding FIPS codes (e.g. "fips")
        fips_to_county_map: dict mapping FIPS int codes to county name strings
            (e.g. {6001: "Alameda", 6003: "Alpine", ...})

    Returns:
        pandas.DataFrame — with fips_column replaced by a "Location" column.

    Raises:
        ValueError — if any FIPS code has no mapping (unmapped codes listed in the message).

    Test file:
        scripts/unit_tests/projections/cleaning/test_dof_p3_cleaner.py
    """


def standardize_sex_labels(df, sex_column, label_map):
    """
    Replace raw sex strings with canonical labels ("MALE" to "Male", "FEMALE" to "Female").

    Args:
        df: pandas.DataFrame containing the raw sex column
        sex_column: name of the column (e.g. "sex")
        label_map: dict mapping raw strings to canonical labels (e.g. {"MALE": "Male", "FEMALE": "Female"})

    Returns:
        pandas.DataFrame — with sex_column renamed to "Sex" and values standardized.

    Test file:
        scripts/unit_tests/projections/cleaning/test_dof_p3_cleaner.py
    """


"""
========================================================================================================================
Age Binning
========================================================================================================================
"""


def bin_single_year_ages(df, age_column, population_column, bin_edges, groupby_columns):
    """
    Bin single-year ages (0-110) into 5-year groups and sum population within each bin.

    Uses pd.cut with bin_edges to assign each single-year age to a 5-year group label.
    Ages 85-110 are collapsed into a single "85+" bin. After labeling, groups by
    groupby_columns + the new age group column and sums population_column.

    This is a lossy aggregation: the output has fewer rows than the input and
    single-year resolution is lost.

    Args:
        df: pandas.DataFrame with one row per (location, year, sex, race, single-year age)
        age_column: name of the column holding integer ages (0-110)
        population_column: name of the column holding population counts (perwt)
        bin_edges: list of integers defining bin boundaries (e.g. [0, 5, 10, ..., 85])
        groupby_columns: list of columns to group by alongside the new age group column
            (e.g. ["Location", "Year", "Sex", "Race/Ethnicity"])

    Returns:
        pandas.DataFrame — with age_column replaced by "Age Group" (5-year labels)
        and population_column summed within each bin.

    Test file:
        scripts/unit_tests/projections/cleaning/test_dof_p3_cleaner.py
    """


"""
========================================================================================================================
Entry Point
========================================================================================================================
"""


def clean_p3_projections(csv_path, schema_config):
    """
    Full P-3 cleaner entry point: read CSV, map FIPS to county names, decode race7,
    standardize sex labels, bin ages, validate.

    Orchestrates map_fips_to_county, map_race_ethnicity (from race_ethnicity_mapping),
    standardize_sex_labels, and bin_single_year_ages. No wide-to-long reshape is needed
    because the P-3 CSV is already one-row-per-record.

    Args:
        csv_path: pathlib.Path to the extracted P-3 CSV file
        schema_config: dict from get_schema_config()

    Returns:
        pandas.DataFrame — cleaned DataFrame with columns: Location, Year, Sex,
        Race/Ethnicity, Age Group, Population. One row per (Location, Year, Sex,
        Race/Ethnicity, Age Group) with Population summed from single-year ages.

    Raises:
        ValueError — if FIPS codes, race codes, or sex values cannot be mapped.

    Test file:
        scripts/unit_tests/projections/cleaning/test_dof_p3_cleaner.py
    """
```

#### `scripts/projections/cleaning/census_ccest_cleaner.py`

```python
"""
census_ccest_cleaner.py — cleans and reshapes Census Bureau cc-est demographic estimate files.

Data sources:
    - {download_directory}/cc-est_{FILENAME}.csv — raw cc-est CSV

Outputs:
    - pandas.DataFrame — cleaned long-format rows matching the canonical cleaning-stage schema

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/cleaning/
"""

import pandas as pd


"""
========================================================================================================================
Parsing and Reshaping
========================================================================================================================
"""


def parse_ccest_csv(csv_path, schema_config):
    """
    Read the raw cc-est CSV and return a DataFrame with validated headers.

    Args:
        csv_path: pathlib.Path to the cc-est CSV file
        schema_config: dict from get_schema_config()

    Returns:
        pandas.DataFrame — raw cc-est rows.

    Raises:
        ValueError — if expected columns are missing.

    Test file:
        scripts/unit_tests/projections/cleaning/test_census_ccest_cleaner.py
    """


def reshape_ccest_to_long(df, schema_config):
    """
    Reshape the cc-est data to match the canonical long format if the raw layout differs.

    The cc-est format may use coded columns for age, sex, and race. This function
    decodes and pivots as needed to produce one row per (Location, Year, Age Group,
    Sex, Race/Ethnicity).

    Args:
        df: pandas.DataFrame from parse_ccest_csv
        schema_config: dict from get_schema_config()

    Returns:
        pandas.DataFrame — long-format rows with canonical column names.

    Test file:
        scripts/unit_tests/projections/cleaning/test_census_ccest_cleaner.py
    """


def rename_ccest_columns(df, schema_config):
    """
    Rename raw cc-est column headers to canonical pipeline names using the header-text map.

    Args:
        df: pandas.DataFrame with raw cc-est column names
        schema_config: dict from get_schema_config(), must contain the Census rename map

    Returns:
        pandas.DataFrame — with canonical column names.

    Raises:
        ValueError — if expected header text is not found.

    Test file:
        scripts/unit_tests/projections/cleaning/test_census_ccest_cleaner.py
    """


def clean_census_estimates(csv_path, schema_config):
    """
    Full cc-est cleaner entry point: parse, rename, reshape, map race and age, validate.

    Orchestrates parse_ccest_csv, rename_ccest_columns, reshape_ccest_to_long,
    map_race_ethnicity, and standardize_age_groups.

    Args:
        csv_path: pathlib.Path to the raw cc-est CSV file
        schema_config: dict from get_schema_config()

    Returns:
        pandas.DataFrame — cleaned long-format DataFrame matching the cleaning-stage schema.

    Test file:
        scripts/unit_tests/projections/cleaning/test_census_ccest_cleaner.py
    """
```

#### `scripts/projections/cleaning/race_ethnicity_mapping.py`

```python
"""
race_ethnicity_mapping.py — maps raw race/ethnicity codes to the canonical 7-group set.

Data sources:
    - Schema config — source-specific code-to-label maps from get_schema_config()

Outputs:
    - pandas.DataFrame — with a canonical Race/Ethnicity column replacing raw codes

Usage:
    Called by dof_p3_cleaner.py and census_ccest_cleaner.py; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/cleaning/
"""

import pandas as pd


# ── Constants ─────────────────────────────────────────────────────────────────

CANONICAL_RACE_GROUPS = [
    "White",
    "Black",
    "AIAN",
    "Asian",
    "NHPI",
    "Multiracial",
    "Hispanic",
]

# P-3 race7 codes from the DoF data dictionary (Baseline 2024, Vintage 2026).
# Order matches CANONICAL_RACE_GROUPS for readability but the map is keyed by code.
P3_RACE7_CODE_MAP = {
    1: "White",        # White, Non-Hispanic
    2: "Black",        # Black, Non-Hispanic
    3: "AIAN",         # American Indian or Alaska Native, Non-Hispanic
    4: "Asian",        # Asian, Non-Hispanic
    5: "NHPI",         # Native Hawaiian or Pacific Islander, Non-Hispanic
    6: "Multiracial",  # Multiracial (two or more of above races), Non-Hispanic
    7: "Hispanic",     # Hispanic (any race)
}


# ── Functions ─────────────────────────────────────────────────────────────────


def get_canonical_race_groups():
    """Return the ordered list of 7 canonical race/ethnicity group labels. Test file: scripts/unit_tests/projections/cleaning/test_race_ethnicity_mapping.py"""


def map_race_ethnicity(df, raw_column, source_code_map):
    """
    Replace raw race/ethnicity codes with canonical group labels.

    Args:
        df: pandas.DataFrame containing the raw race column
        raw_column: name of the column holding raw codes (e.g. "ORIGIN", "RACE7")
        source_code_map: dict mapping raw codes (int or str) to canonical labels

    Returns:
        pandas.DataFrame — with raw_column replaced by "Race/Ethnicity" containing
        only values from CANONICAL_RACE_GROUPS.

    Raises:
        ValueError — if any raw code has no mapping (unmapped codes listed in the message).

    Test file:
        scripts/unit_tests/projections/cleaning/test_race_ethnicity_mapping.py
    """


def validate_race_mapping_completeness(df, race_column):
    """
    Assert that every row has a mapped value and no raw codes remain.

    Args:
        df: pandas.DataFrame after mapping
        race_column: name of the mapped column (should be "Race/Ethnicity")

    Returns:
        tuple of (is_valid, messages) where is_valid is bool and messages is a list of strings.

    Test file:
        scripts/unit_tests/projections/cleaning/test_race_ethnicity_mapping.py
    """
```

#### `scripts/projections/cleaning/age_group_standardizer.py`

```python
"""
age_group_standardizer.py — defines canonical 5-year age groups and provides binning/normalization utilities.

The P-3 source provides single-year ages (0-110) that must be binned into 5-year groups.
The Census cc-est source may provide pre-grouped labels that need normalizing to the
same canonical set. This module owns the bin edges, the canonical labels, and both
conversion paths so the two cleaners produce identical age group values.

Data sources:
    - Schema config — bin edges and label normalization maps from get_schema_config()

Outputs:
    - pandas.DataFrame — with a canonical Age Group column

Usage:
    Called by dof_p3_cleaner.py and census_ccest_cleaner.py; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/cleaning/
"""

import pandas as pd


# ── Constants ─────────────────────────────────────────────────────────────────

# Bin edges for converting single-year ages to 5-year groups.
# Ages 0-4 go into the first bin, 5-9 into the second, etc.
# Ages 85-110 all go into the open-ended "85+" bin.
AGE_BIN_EDGES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85]

CANONICAL_AGE_GROUPS = [
    "0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34",
    "35-39", "40-44", "45-49", "50-54", "55-59", "60-64",
    "65-69", "70-74", "75-79", "80-84", "85+",
]

# Default frontend presets for coarser age groupings (applied server-side in the API).
# These are not stored in the contract CSV; the API sums 5-year groups on request.
DEFAULT_AGE_PRESETS = {
    "Under 18": ["0-4", "5-9", "10-14", "15-19"],
    "18-25": ["20-24"],       # note: 15-19 bin overlaps; see implementation note below
    "26-64": ["25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64"],
    "65+": ["65-69", "70-74", "75-79", "80-84", "85+"],
}
# Implementation note: the preset boundaries (18, 25, 26) do not align with 5-year
# bin edges (15, 20, 25, 30). The API should document which bins map to which preset.
# The 15-19 bin maps to "Under 18" by convention (majority of the bin is under 18).
# The 20-24 bin maps to "18-25". These are approximations inherent to 5-year binning.


# ── Functions ─────────────────────────────────────────────────────────────────


def get_canonical_age_groups():
    """Return the ordered list of canonical 5-year age group labels. Test file: scripts/unit_tests/projections/cleaning/test_age_group_standardizer.py"""


def get_age_bin_edges():
    """Return the bin edge list for single-year-to-5-year conversion. Test file: scripts/unit_tests/projections/cleaning/test_age_group_standardizer.py"""


def assign_age_group_from_single_year(df, age_column):
    """
    Map single-year integer ages to 5-year group labels using AGE_BIN_EDGES.

    Ages 0-4 map to "0-4", 5-9 to "5-9", ..., 85-110 to "85+".
    This does NOT aggregate rows; it only adds the label. Aggregation (summing
    population within bins) is done by the caller (bin_single_year_ages in the P-3 cleaner).

    Args:
        df: pandas.DataFrame containing the single-year age column
        age_column: name of the column holding integer ages (0-110)

    Returns:
        pandas.DataFrame — with a new "Age Group" column added (original age column retained).

    Test file:
        scripts/unit_tests/projections/cleaning/test_age_group_standardizer.py
    """


def standardize_age_group_labels(df, raw_column, label_map):
    """
    Normalize variant age-group labels from non-P-3 sources (e.g. Census cc-est) to canonical labels.

    Handles common variants: "0 to 4" vs "0-4" vs "Under 5", "85 and over" vs "85+", etc.

    Args:
        df: pandas.DataFrame containing the raw age group column
        raw_column: name of the column holding variant labels
        label_map: dict mapping raw labels (str) to canonical labels

    Returns:
        pandas.DataFrame — with raw_column replaced by "Age Group" containing
        only values from CANONICAL_AGE_GROUPS.

    Raises:
        ValueError — if any raw label has no mapping (unmapped labels listed in the message).

    Test file:
        scripts/unit_tests/projections/cleaning/test_age_group_standardizer.py
    """


def validate_age_group_completeness(df, age_column):
    """
    Assert that every row has a mapped value and no raw labels or ages remain.

    Args:
        df: pandas.DataFrame after binning or normalization
        age_column: name of the mapped column (should be "Age Group")

    Returns:
        tuple of (is_valid, messages) where is_valid is bool and messages is a list of strings.

    Test file:
        scripts/unit_tests/projections/cleaning/test_age_group_standardizer.py
    """
```

---

### Phase 4: Merging

Mirrors the Components of Change `merging/historical_merge.py` pattern. One parametrized function replaces the near-identical DoF and Census merge variants from the legacy code.

#### `scripts/projections/merging/historical_merge.py`

```python
"""
historical_merge.py — combines cleaned sources with historical rows and detects new data.

Data sources:
    - data/data-cleaned/demographic-projections/DemographicProjections_Current.csv — saved canonical data
    - Cleaned DoF P-3 DataFrame from dof_p3_cleaner
    - Cleaned Census cc-est DataFrame from census_ccest_cleaner

Outputs:
    - pandas.DataFrame — merged dataset with both sources
    - bool flags — whether new data was detected for each source

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/merging/
"""

import pandas as pd


"""
========================================================================================================================
Historical Data Access
========================================================================================================================
"""


def load_canonical_dataset(current_data_path):
    """
    Read the existing contract CSV and return it as a DataFrame.

    Args:
        current_data_path: pathlib.Path to DemographicProjections_Current.csv

    Returns:
        pandas.DataFrame — the full saved dataset, or an empty DataFrame with contract
        columns if the file does not yet exist.

    Test file:
        scripts/unit_tests/projections/merging/test_historical_merge.py
    """


"""
========================================================================================================================
Source Merging
========================================================================================================================
"""


def combine_source_with_historical(new_df, historical_df, source, year_column):
    """
    Merge a freshly cleaned source with its historical rows, keeping new years and deduplicating.

    Filters historical_df to rows matching the given source, identifies year overlap,
    and concatenates with the new data. New data wins on overlap.

    Args:
        new_df: pandas.DataFrame — freshly cleaned rows for one source
        historical_df: pandas.DataFrame — all historical rows (will be filtered to source)
        source: str — source label to filter by (e.g. "DoF P-3" or "Census cc-est")
        year_column: str — name of the year column for overlap detection

    Returns:
        pandas.DataFrame — combined rows for this source.

    Test file:
        scripts/unit_tests/projections/merging/test_historical_merge.py
    """


def detect_new_source_data(new_df, historical_df, source, boundary_year):
    """
    Determine whether the freshly cleaned source contains genuinely new data.

    Compares row counts and year ranges beyond the boundary year.

    Args:
        new_df: pandas.DataFrame — freshly cleaned rows for one source
        historical_df: pandas.DataFrame — historical rows for comparison
        source: str — source label
        boundary_year: int — ignore years at or before this threshold for change detection

    Returns:
        bool — True if new source data was detected.

    Test file:
        scripts/unit_tests/projections/merging/test_historical_merge.py
    """


def merge_dof_and_census(dof_df, census_df):
    """
    Concatenate the DoF and Census DataFrames into a single unified dataset.

    Ensures the Year column is integer-typed and sorts by Location, Year, Age Group, Sex,
    and Race/Ethnicity.

    Args:
        dof_df: pandas.DataFrame — combined DoF rows (historical + new)
        census_df: pandas.DataFrame — combined Census rows (historical + new)

    Returns:
        pandas.DataFrame — full merged dataset.

    Test file:
        scripts/unit_tests/projections/merging/test_historical_merge.py
    """
```

---

### Phase 5: Aggregation

Two modules: geographic rollups (9 CA regions + California state total, both computed by summing county rows since the P-3 source is county-only) and precomputed totals for the "All Ages" / "Both Sexes" / "All" race aggregation rows.

#### `scripts/projections/aggregation/regional_aggregation.py`

```python
"""
regional_aggregation.py — builds the 9 CA region rows and the California state row by summing county-level population.

The P-3 source contains only county-level data (58 FIPS codes). Both the 9 CA region rows
and the California state total must be computed by summing county rows. Census cc-est data
already includes state-level rows, so the state computation applies only to DoF P-3 rows.

Data sources:
    - Cleaned DataFrame from the merge phase
    - scripts/shared/geography/california_geography.py — county-to-region mapping

Outputs:
    - pandas.DataFrame — input rows plus newly computed region-level and state-level rows

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/aggregation/
"""

import pandas as pd


def add_regional_data(df, regions_mapping, groupby_dimensions):
    """
    Compute region-level population by summing county rows within each of the 9 CA regions.

    For each region, groups county rows by (Year, Age Group, Sex, Race/Ethnicity), sums
    Population, and appends the result with Geographic Level = "Region".

    Args:
        df: pandas.DataFrame — must contain County-level rows with a Population column
        regions_mapping: dict mapping region name to list of county names
            (sourced from shared geography, not re-hardcoded)
        groupby_dimensions: list of column names to group by alongside Location
            (e.g. ["Year", "Age Group", "Sex", "Race/Ethnicity"])

    Returns:
        pandas.DataFrame — original rows plus region-level rows appended.

    Test file:
        scripts/unit_tests/projections/aggregation/test_regional_aggregation.py
    """


def add_state_total(df, county_names, groupby_dimensions, state_name="California"):
    """
    Compute the California state total by summing all 58 county rows.

    Only adds state rows for source/year combinations where no state row already
    exists (Census cc-est may already provide state-level data).

    Args:
        df: pandas.DataFrame — must contain County-level rows
        county_names: list of the 58 CA county name strings
        groupby_dimensions: list of column names to group by
            (e.g. ["Year", "Age Group", "Sex", "Race/Ethnicity", "Source"])
        state_name: str — the Location label for the state row (default "California")

    Returns:
        pandas.DataFrame — original rows plus state-level rows appended where missing.

    Test file:
        scripts/unit_tests/projections/aggregation/test_regional_aggregation.py
    """
```

#### `scripts/projections/aggregation/precomputed_totals.py`

```python
"""
precomputed_totals.py — generates pre-aggregated "All Ages", "Both Sexes", and "All" race rows.

Data sources:
    - Merged DataFrame from the merge/regional aggregation phase

Outputs:
    - pandas.DataFrame — input rows plus newly computed aggregation rows

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/aggregation/
"""

import pandas as pd


# ── Individual Aggregators ────────────────────────────────────────────────────


def add_all_ages_totals(df, age_column, population_column, groupby_columns):
    """
    Sum population across all age groups and append rows labeled "All Ages".

    Groups by groupby_columns (which should exclude the age column), sums population,
    and sets the age column to "All Ages" on the result rows.

    Args:
        df: pandas.DataFrame — must not already contain "All Ages" rows
        age_column: str — name of the age group column
        population_column: str — name of the population column to sum
        groupby_columns: list of str — columns to group by (e.g. Location, Year, Sex, Race/Ethnicity)

    Returns:
        pandas.DataFrame — original rows plus "All Ages" rows appended.

    Test file:
        scripts/unit_tests/projections/aggregation/test_precomputed_totals.py
    """


def add_both_sexes_totals(df, sex_column, population_column, groupby_columns):
    """
    Sum population across Male and Female and append rows labeled "Both Sexes".

    Args:
        df: pandas.DataFrame — must not already contain "Both Sexes" rows
        sex_column: str — name of the sex column
        population_column: str — name of the population column to sum
        groupby_columns: list of str — columns to group by (e.g. Location, Year, Age Group, Race/Ethnicity)

    Returns:
        pandas.DataFrame — original rows plus "Both Sexes" rows appended.

    Test file:
        scripts/unit_tests/projections/aggregation/test_precomputed_totals.py
    """


def add_all_races_totals(df, race_column, population_column, groupby_columns):
    """
    Sum population across all 7 race/ethnicity groups and append rows labeled "All".

    Args:
        df: pandas.DataFrame — must not already contain "All" race rows
        race_column: str — name of the race/ethnicity column
        population_column: str — name of the population column to sum
        groupby_columns: list of str — columns to group by (e.g. Location, Year, Age Group, Sex)

    Returns:
        pandas.DataFrame — original rows plus "All" race rows appended.

    Test file:
        scripts/unit_tests/projections/aggregation/test_precomputed_totals.py
    """


# ── Orchestrator ──────────────────────────────────────────────────────────────


def build_precomputed_totals(df, schema_config):
    """
    Orchestrate all three aggregation dimensions, respecting the correct order.

    Calls add_all_ages_totals, add_both_sexes_totals, and add_all_races_totals in sequence.
    Order matters: "Both Sexes" rows include all age groups (including "All Ages"),
    and "All" race rows include all sex values (including "Both Sexes").

    Args:
        df: pandas.DataFrame — merged dataset without any aggregation rows
        schema_config: dict from get_schema_config()

    Returns:
        pandas.DataFrame — full dataset including all precomputed aggregation rows.

    Test file:
        scripts/unit_tests/projections/aggregation/test_precomputed_totals.py
    """
```

---

### Phase 6: Validation, Output, and Finalization

#### `scripts/projections/validation/projections_validators.py`

```python
"""
projections_validators.py — validates Demographic Projections data at cleaning and final stages.

Data sources:
    - pandas.DataFrame — the dataset to validate
    - Schema config — validation thresholds and expected value sets

Outputs:
    - tuple of (is_valid, messages) — structured validation results

Usage:
    Called by dof_p3_cleaner, census_ccest_cleaner, and the orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/validation/
"""

import pandas as pd


"""
========================================================================================================================
Cleaning-Stage Validators
========================================================================================================================
"""


def validate_cleaning_output(df, schema_config):
    """
    Validate a single-source DataFrame after cleaning, before the merge phase.

    Checks: required columns present, no nulls in key columns, population values non-negative,
    race/ethnicity values are all canonical, age group values are all canonical.

    Args:
        df: pandas.DataFrame — output of clean_p3_projections or clean_census_estimates
        schema_config: dict from get_schema_config()

    Returns:
        tuple of (is_valid, messages) where is_valid is bool and messages is a list of strings
        describing each violation.

    Test file:
        scripts/unit_tests/projections/validation/test_projections_validators.py
    """


"""
========================================================================================================================
Final Dataset Validators
========================================================================================================================
"""


def validate_projections_dataset(df, validation_config):
    """
    Validate the final merged dataset before writing to CSV.

    Checks: row count within expected bounds, all expected geographic levels present,
    no negative populations, year range spans expected coverage, no duplicate key tuples.
    Composes shared validators (validate_required_columns, validate_not_empty,
    find_duplicate_rows, validate_numeric_range) from scripts/shared/validation/.

    Args:
        df: pandas.DataFrame — the fully merged, enriched dataset
        validation_config: dict with keys: required_columns, expected_levels, year_range,
            min_rows, max_rows, population_column, duplicate_key_columns

    Returns:
        tuple of (is_valid, messages) where is_valid is bool and messages is a list of strings.

    Test file:
        scripts/unit_tests/projections/validation/test_projections_validators.py
    """


def validate_stratification_completeness(df, location, year, schema_config):
    """
    Assert that a given (location, year) pair has the full age x sex x race matrix.

    Counts the distinct (Age Group, Sex, Race/Ethnicity) tuples for this location and year
    and compares against the expected count (len(canonical_ages) x len(canonical_sexes)
    x len(canonical_races)).

    Args:
        df: pandas.DataFrame — the final dataset
        location: str — the location to check
        year: int — the year to check
        schema_config: dict from get_schema_config()

    Returns:
        tuple of (is_valid, messages).

    Test file:
        scripts/unit_tests/projections/validation/test_projections_validators.py
    """
```

#### `scripts/projections/output/finalize_dataset.py`

```python
"""
finalize_dataset.py — assigns geographic levels, orders columns, and performs conditional archival.

Data sources:
    - pandas.DataFrame — the validated dataset ready for output
    - data/data-cleaned/demographic-projections/DemographicProjections_Current.csv — existing output for comparison

Outputs:
    - data/data-cleaned/demographic-projections/DemographicProjections_Current.csv — updated canonical dataset
    - data/archive/demographic-projections/{FILENAME}_{TIMESTAMP}.csv — archived prior output (when data changed)

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/output/
"""

import pandas as pd


"""
========================================================================================================================
Geographic Level Assignment
========================================================================================================================
"""


def assign_geographic_level(df, geography_config):
    """
    Tag each row with its Geographic Level based on its Location value.

    Uses np.select with conditions for State ("California"), County (58 county names),
    Region (9 region names), and US State (50 state names). Sources the name lists
    from geography_config rather than hardcoding them.

    Args:
        df: pandas.DataFrame — must have a Location column
        geography_config: dict with keys: california_counties, region_names, us_state_names

    Returns:
        pandas.DataFrame — with a Geographic Level column set.

    Test file:
        scripts/unit_tests/projections/output/test_finalize_dataset.py
    """


"""
========================================================================================================================
Output Preparation
========================================================================================================================
"""


def prepare_projections_output(df, schema_config):
    """
    Enforce contract column order, sort rows, and cast types for the final CSV.

    Args:
        df: pandas.DataFrame — with geographic level assigned
        schema_config: dict from get_schema_config(), must contain output_columns

    Returns:
        pandas.DataFrame — ready to write to CSV.

    Test file:
        scripts/unit_tests/projections/output/test_finalize_dataset.py
    """


def archive_and_save(df, current_path, archive_directory):
    """
    Compare the new dataset against the existing file and save only when data changed.

    If the existing CSV is byte-identical to what would be written, no file is touched.
    Otherwise, the existing file is copied to archive_directory with a mm-dd-yy timestamp,
    and the new data overwrites current_path.

    Args:
        df: pandas.DataFrame — the finalized dataset
        current_path: pathlib.Path — contract CSV path
        archive_directory: pathlib.Path — where to copy the old version

    Returns:
        pathlib.Path or None — the output path if written, None if skipped.

    Test file:
        scripts/unit_tests/projections/output/test_finalize_dataset.py
    """
```

---

### Orchestrator

#### `scripts/orchestrators/projections_pipeline.py`

```python
"""
projections_pipeline.py — orchestrates acquisition, cleaning, merging, aggregation, validation, and output of Demographic Projections data.

Data sources:
    - California Department of Finance projections page — P-3 workbook discovery and download
    - U.S. Census Bureau population estimates — cc-est CSV discovery and download
    - data/data-raw/demographic-projections/{FILENAME} — optional manual fallback downloads
    - data/data-cleaned/demographic-projections/DemographicProjections_Current.csv — saved canonical fallback and historical source
    - scripts/shared/geography/california_geography.py — county-to-region mapping

Outputs:
    - pandas.DataFrame — merged Demographic Projections dataset
    - data/data-cleaned/demographic-projections/DemographicProjections_Current.csv — updated canonical dataset when new data is detected
    - dict — dataset, source change flags, fallback flags, output path, and row count

Usage:
    python scripts/orchestrators/projections_pipeline.py

Test Folders:
    - scripts/unit_tests/orchestrators/
    - scripts/unit_tests/projections/
"""

from typing import NoReturn

import pandas as pd

from scripts.projections.acquisition.census_ccest_downloader import (
    download_census_ccest,
    get_census_ccest_url,
    validate_ccest_headers,
)
from scripts.projections.acquisition.dof_p3_downloader import (
    P3DiscoveryError,
    download_p3_data,
    extract_csv_from_zip,
    get_most_recent_p3_file,
    get_p3_file_url,
    get_p3_file_url_positional,
    validate_p3_csv,
)
from scripts.projections.acquisition.source_fallback import acquire_with_fallback
from scripts.projections.aggregation.precomputed_totals import build_precomputed_totals
from scripts.projections.aggregation.regional_aggregation import add_regional_data
from scripts.projections.cleaning.census_ccest_cleaner import clean_census_estimates
from scripts.projections.cleaning.dof_p3_cleaner import clean_p3_projections
from scripts.projections.config.paths import get_paths
from scripts.projections.config.schemas import get_schema_config
from scripts.projections.config.sources import get_source_settings
from scripts.projections.merging.historical_merge import (
    combine_source_with_historical,
    detect_new_source_data,
    load_canonical_dataset,
    merge_dof_and_census,
)
from scripts.projections.output.finalize_dataset import (
    archive_and_save,
    assign_geographic_level,
    prepare_projections_output,
)
from scripts.projections.validation.projections_validators import (
    validate_projections_dataset,
)


"""
========================================================================================================================
Pipeline Errors
========================================================================================================================
"""


class ProjectionsPipelinePhaseError(RuntimeError):
    """Report failure of a named Projections pipeline phase. Test file: scripts/unit_tests/orchestrators/test_projections_pipeline.py"""


def _raise_phase_error(phase_name, error) -> NoReturn:
    """Wrap an exception with its pipeline phase. Test file: scripts/unit_tests/orchestrators/test_projections_pipeline.py"""


# ── Helpers ───────────────────────────────────────────────────────────────────


def _load_saved_source(paths, source):
    """Load last-saved rows for one source from the canonical CSV. Test file: scripts/unit_tests/orchestrators/test_projections_pipeline.py"""


def _clean_with_fallback(raw_df, clean_fn, schema_config, source, paths, source_failed, used_manual, manual_path):
    """
    Clean source data or fall back to manual and last-saved rows.

    Attempts to clean raw_df with clean_fn. On failure, tries reading and cleaning
    the manual file. On second failure, loads last-saved rows for this source.

    Args:
        raw_df: pandas.DataFrame — raw data from acquisition
        clean_fn: callable — the source-specific cleaner (clean_p3_projections or clean_census_estimates)
        schema_config: dict from get_schema_config()
        source: str — source label for loading saved rows
        paths: dict from get_paths()
        source_failed: bool — whether acquisition already failed
        used_manual: bool — whether the manual file was already used during acquisition
        manual_path: pathlib.Path — path to the manual fallback CSV

    Returns:
        tuple of (cleaned_df, cleaning_failed, used_manual).

    Test file:
        scripts/unit_tests/orchestrators/test_projections_pipeline.py
    """


"""
========================================================================================================================
Projections Pipeline
========================================================================================================================
"""


def build_projections_dataset(config=None):
    """
    Build the Demographic Projections dataset and save only when source data changed.

    Runs five phases in sequence, wrapping each so any exception re-raises as a
    ProjectionsPipelinePhaseError tagged with the phase name:

    Phase 1 — Setup & Load: resolve config, load the existing canonical CSV.
    Phase 2 — Acquisition: acquire DoF P-3 zip (extract CSV) and Census cc-est with fallback.
    Phase 3 — Cleaning: map FIPS to counties, decode race7 codes, bin single-year ages
              to 5-year groups, standardize sex labels, validate cleaning output.
    Phase 4 — Merge & Aggregate: merge sources with history, compute state total and
              regions from county sums, build precomputed totals, detect change.
    Phase 5 — Finalize & Save: assign geographic level, validate final dataset,
              archive and write only when new data was detected.

    Args:
        config: dict or None — override config for testing. When None, loads from
            get_paths(), get_source_settings(), get_schema_config().

    Returns:
        dict with keys:
            dataset — pandas.DataFrame of the final dataset
            dof_new_data — bool, whether new DoF data was detected
            census_new_data — bool, whether new Census data was detected
            dof_failed — bool, whether DoF acquisition/cleaning fell back to saved rows
            census_failed — bool, whether Census acquisition/cleaning fell back to saved rows
            output_path — pathlib.Path or None (None if no write occurred)
            row_count — int

    Test file:
        scripts/unit_tests/orchestrators/test_projections_pipeline.py
    """


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    result = build_projections_dataset()
    print(f"  Rows: {result['row_count']}")
    if result["output_path"]:
        print(f"  Written to: {result['output_path']}")
    else:
        print("  No new data detected; file unchanged.")
```

---

## Frontend Deliverables

These are JavaScript files and are not governed by the Python conventions doc, so they are described at the interface level rather than with Python function signatures.

### Module schema: `lib/visualization/moduleSchemas/demographicProjections.js`

This is the client-safe field catalog that plugs the module into the shared UI layer. It defines:

- `Year` as a temporal field.
- `Geographic Level`, `Location`, `Age Group`, `Sex`, `Race/Ethnicity`, `Source` as dimension fields.
- `Population` as the primary measure, with transforms: actual, numericChange, percentChange, indexed.
- Subsets: "Counties" (58), "Regions" (9), "US States" (50), "California" (1).
- Module-specific filter dimensions: `Age Group`, `Sex`, `Race/Ethnicity`. These don't exist in PopHousing or Components of Change, so the sidebar UI will need to render additional filter controls when this module is active.
- Curated presets:
  - "Population by race over time" (line, y=Population, series=Race/Ethnicity, filters: one location, All Ages, Both Sexes)
  - "Age pyramid" (horizontal bar, y=Age Group, x=Population, series=Sex, filters: one location, one year, All Races)
  - "Race composition map" (choropleth, color=Population share by selected race, filters: one year, All Ages, Both Sexes)
  - "Overlay comparison" (line, additive trace selection mirroring legacy `new_plot` behavior)
  - "Projection vs. estimate" (line with a visual break or annotation at the estimates/projections boundary, series=Source)

### Data-access layer: `lib/data/demographic_projections.js`

Server-only module (uses `node:fs`). Pattern mirrors `lib/data/pop_housing.js`:

- `loadProjectionsData()`: read and parse the contract CSV once per server process; cache in memory.
- Query shapes: `queryLineSeries`, `queryCategoryValues`, `queryGeoValues`, etc., delegating to `lib/data/query_shapes.js`.
- All filtering (by age, sex, race, source) happens here on the cached rows before shaping.
- The numeric-column set and curated-metric list derive from `demographicProjections.js` (single source of truth).

### API route: `app/api/projections/route.js`

Thin route that validates query params (using `lib/data/apiParams.js`), calls the data-access layer, and returns JSON. Accepts these parameters beyond the standard set:

- `ageGroup`: filter by 5-year age group (or "All Ages").
- `ageGrouping`: optional preset name or custom bin list for coarser age consolidation. When provided, the API sums 5-year groups into the requested bins server-side before returning. Default presets: "Under 18", "18-25", "26-64", "65+" (mapped from the stored 5-year groups). Custom groupings are also supported as a JSON array of bin definitions.
- `sex`: filter by sex (or "Both Sexes").
- `raceEthnicity`: filter by race/ethnicity (or "All").
- `source`: filter by source (or both).
- `view`: the chart shape (line, category, twoPeriod, geoValues, matrix).

---

## Test Plan

Tests mirror the source tree under `scripts/unit_tests/projections/`. Estimated scope:

### Config tests (~10 tests)
- `test_paths.py`: project root resolves correctly, data directories use expected path segments, all values are Path objects.
- `test_sources.py`: required keys present, filename patterns match canonical names, cache ages are consistent, request config uses HTTPS and positive timeout.
- `test_schemas.py`: required keys present, canonical race groups total 7, canonical age groups total 18, FIPS map covers all 58 counties, output columns match contract.

### Acquisition tests (~25 tests)
- `test_dof_p3_downloader.py`: URL discovery succeeds on well-formed HTML, positional fallback works, cache hit skips HTTP, network failure falls back to cached CSV, extract_csv_from_zip handles a valid zip, extract_csv_from_zip rejects a zip with no CSV, validate_p3_csv rejects missing columns (fips, year, sex, race7, agerc, perwt).
- `test_census_ccest_downloader.py`: URL discovery succeeds, cache hit skips HTTP, validate_ccest_headers rejects missing columns.
- `test_source_fallback.py`: first live strategy wins, second strategy used when first fails, manual file used when all live strategies fail, saved rows used as last resort, flags set correctly for each path.

### Cleaning tests (~55 tests)
- `test_dof_p3_cleaner.py`: FIPS-to-county mapping covers all 58 codes, unmapped FIPS raises ValueError, sex label standardization ("MALE" to "Male"), age binning sums population correctly within 5-year groups, ages 85-110 collapse into "85+", full cleaner produces expected row count for a small fixture, rejects CSV with unexpected columns.
- `test_census_ccest_cleaner.py`: CSV parsing, reshape, column renaming, full cleaner end-to-end.
- `test_race_ethnicity_mapping.py`: P3_RACE7_CODE_MAP maps all 7 codes, maps all Census codes to 7 groups, rejects unmapped codes with actionable message, canonical list returns 7 items.
- `test_age_group_standardizer.py`: assign_age_group_from_single_year maps age 0 to "0-4", maps age 84 to "80-84", maps age 110 to "85+", standardize_age_group_labels normalizes variant labels, canonical list returns 18 items, bin edges list has 18 entries.

### Merging tests (~15 tests)
- `test_historical_merge.py`: load_canonical_dataset returns empty DataFrame when file missing, combine_source_with_historical keeps historical years absent from new data, new data wins on overlap, detect_new_source_data returns True when new years present, merge_dof_and_census concatenates and sorts.

### Aggregation tests (~35 tests)
- `test_regional_aggregation.py`: produces exactly 9 region rows per (year, age, sex, race), region population equals sum of constituent county populations, does not modify existing rows. add_state_total computes California total from 58 counties, skips state row when one already exists from cc-est, state total equals sum of all county populations.
- `test_precomputed_totals.py`: "All Ages" rows sum correctly, "Both Sexes" rows sum correctly, "All" race rows sum correctly, combined "Both Sexes" + "All Ages" row equals grand total, build_precomputed_totals runs all three in correct order, no double-counting.

### Validation tests (~15 tests)
- `test_projections_validators.py`: validate_cleaning_output catches missing columns, catches non-canonical race values, catches negative populations. validate_projections_dataset catches missing geographic levels, catches row count outside bounds, catches duplicate keys. validate_stratification_completeness catches incomplete age x sex x race matrix.

### Output tests (~10 tests)
- `test_finalize_dataset.py`: assign_geographic_level tags counties, regions, and states correctly. prepare_projections_output enforces column order. archive_and_save writes when data changed, skips when identical, archive file receives timestamp.

### Orchestrator tests (~10 tests)
- `test_projections_pipeline.py`: full pipeline with mocked acquisition, phase error wrapping, dof_failed flag when DoF acquisition fails, census_failed flag when Census fails, no write when no new data.

Total estimate: ~175 tests across 14 test files.

---

## Sequencing

The work is ordered so each step is independently testable and useful.

### Step 1: Configuration

Create `scripts/projections/config/paths.py`, `sources.py`, and `schemas.py`. Define paths, URLs, expected sheet names, column schemas, race-ethnicity mapping table, age-group labels, and validation thresholds.

Depends on: nothing. Produces: importable config for all downstream steps.

### Step 2: Acquisition

Implement `dof_p3_downloader.py`, `census_ccest_downloader.py`, and `source_fallback.py`. Write acquisition tests. At the end of this step, running the downloaders produces raw files in `data/data-raw/demographic-projections/`.

Depends on: Step 1 + `scripts/shared/downloads/`.

### Step 3: Cleaning

Implement `dof_p3_cleaner.py`, `census_ccest_cleaner.py`, `race_ethnicity_mapping.py`, and `age_group_standardizer.py`. Write cleaning tests against fixture DataFrames. At the end of this step, each cleaner can take a raw file and return a cleaned, schema-validated DataFrame.

Depends on: Steps 1-2.

### Step 4: Merge + Aggregation

Implement `historical_merge.py`, `regional_aggregation.py`, and `precomputed_totals.py`. Write merge and aggregation tests. At the end of this step, the full backend pipeline can run end-to-end and produce a complete dataset.

Depends on: Steps 1-3 + `scripts/shared/geography/california_geography.py`.

### Step 5: Validation + Output + Orchestrator

Implement `projections_validators.py`, `finalize_dataset.py`, and `scripts/orchestrators/projections_pipeline.py`. Write validation, output, and orchestrator tests. At the end of this step, the pipeline is runnable as a single `build_projections_dataset()` call with proper error tagging and conditional archival.

Depends on: Steps 1-4.

### Step 6: Frontend schema + data-access layer + API route

Implement `lib/visualization/moduleSchemas/demographicProjections.js`, `lib/data/demographic_projections.js`, and `app/api/projections/route.js`. Register the module in `moduleRegistry.js`. At the end of this step, the existing shared chart UI can render projections data.

Depends on: Step 5 (the contract CSV must exist). Can be developed in parallel once the contract schema is agreed on.

### Step 7: Presets and polish

Add the module-specific presets (age pyramid, race composition map, projection-vs-estimate annotation) to the schema and verify they render correctly in the chart builder. Add any module-specific sidebar controls (age/sex/race filters).

Depends on: Step 6.

---

## Resolved Decisions

These questions were answered before implementation began.

1. **P-3 file format:** The current P-3 is a compressed zip archive containing a comma-delimited CSV, not an Excel workbook. Columns are: `fips` (county FIPS code), `year`, `sex` (MALE/FEMALE), `race7` (1-7), `agerc` (single-year age 0-110), `perwt` (population count). Baseline 2024, Vintage 2026. The downloader handles zip extraction.

2. **Projection horizon:** 2020-2070 (51 years). No special "projection horizon" selector is needed; the year range slider in the frontend covers this naturally.

3. **Census cc-est scope:** All 50 US states are included, matching the legacy module's scope. This increases the contract CSV size significantly given the high dimensionality; the performance implications should be evaluated once the CSV is built.

4. **Age-group consolidation:** The pipeline stores 5-year groups in the contract CSV (binned from single-year ages during cleaning). Coarser groupings are user-defined at the frontend, with default presets of Under 18, 18-25, 26-64, 65+. The API route sums the stored 5-year bins into the requested preset server-side. Because these preset boundaries (18, 25, 26) do not align perfectly with 5-year bin edges (15, 20, 25, 30), each preset maps to the nearest whole bins, and the API documents which bins feed which preset.

5. **Dataset filename:** `DemographicProjections_Current.csv` in the `data/data-cleaned/demographic-projections/` directory.