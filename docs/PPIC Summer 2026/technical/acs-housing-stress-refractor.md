# ACS Housing Stress: Refactoring Plan

A plan for migrating the legacy `housingstress_code.py` module into the V3 architecture established by PopHousing, Components of Change, and Age-Sex-Race Projections.

---

## Legacy Module Summary

The current module lives at `Visualization Tool/ACS-Housing-Stress/housingstress_code.py`. It is a flat collection of functions built around three deeply-nested closures — `build_state_dataset()`, `build_region_dataset()`, and `build_county_dataset()` — each of which re-declares its own `get_data()`, `clean_data()`, and `build_race_data()` inner functions. The three closures are near-identical: the only real difference between them is how raw ACS records are mapped to a geography before the same tenure/cost-burden math runs. This triplication is the single largest structural problem in the module.

The module measures **housing cost burden** ("housing stress"): the share and number of households paying more than 30% or 50% of income on housing, split by tenure and by race/ethnicity of householder.

### Data source

One external source feeds the module:

- **U.S. Census Bureau ACS 1-year Table-Based Summary File**, table **B25140** ("Tenure by Housing Costs as a Percentage of Household Income in the Past 12 Months") plus its race-iteration variants (`B25140B`–`B25140I`). Each table is fetched as a pipe-delimited `.dat` data file joined to a `Geos*.txt` geography file on `GEO_ID`. Published annually; ACS did not release standard 1-year estimates for 2020, so that year is a permanent gap in the series.

The module downloads two files per (table, year):

- `.../table-based-SF/data/1YRData/acsdt1y{year}-{tblid}.dat` — pipe-delimited estimates keyed by `GEO_ID`.
- `.../table-based-SF/documentation/Geos{year}1YR.txt` — geography lookup (`NAME`, `STUSAB`) keyed by `GEO_ID`.

### Current function inventory

| Legacy function | Role |
|---|---|
| `get_data(tblid, year, dataset, state)` | Download one B25140 iteration's `.dat` + geos file, join on `GEO_ID`, filter to a state abbreviation. Re-declared inside `build_region_dataset`. |
| `build_full_dataset()` | Top-level orchestrator; concatenates state + region + county frames. |
| `build_state_dataset()` → `clean_data`, `build_race_data`, `build_national_data` | Direct state-level build: filter to the 50 state `NAME`s, compute tenure/burden measures, loop all 9 race iterations, loop all 50 states with a 10-year decrement fallback. |
| `build_county_dataset()` → `clean_data`, `build_race_data` | Filter to PUMA rows, extract PUMA ID from `GEO_ID`, crosswalk PUMA→county, sum estimate columns by county, then compute measures for all 9 race iterations. |
| `build_region_dataset()` → `get_data`, `clean_data`, `build_race_data` | Same as county but crosswalks PUMA→region (9 CA regions). |
| `combine_with_historical(df)` | Read saved CSV, drop overlapping years from history, concat, detect change via `assert_frame_equal`. |
| `visualize_line(...)` | Stateful multi-trace line chart with an optional index-to-100 transform; also triggers archive/save as a side effect. |
| `visualize_bar(...)` | Two-period ("start year" vs "end year") numeric- or percent-change bar chart; also triggers archive/save. |

### Cost-burden measure definition

For each of five **tenure** labels, the cleaner derives four measures from the B25140 estimate columns (`E001`–`E013`). The column semantics come from the B25140 data dictionary and are currently hard-coded inline three times:

| Tenure | Number Over 30% | Number Over 50% | Denominator (for Share) |
|---|---|---|---|
| Total | `E003 + E007 + E011` | `E004 + E008 + E012` | `E001` |
| Rented | `E011` | `E012` | `E010` |
| Owned | `E003 + E007` | `E004 + E008` | `E002 + E006` |
| Owned With Mortgage | `E003` | `E004` | `E002` |
| Owned Without Mortgage | `E007` | `E008` | `E006` |

`Share Over 30%` = `Number Over 30% / Denominator`; `Share Over 50%` likewise.

### Stratification dimensions

Location (58 CA counties + 9 CA regions + 50 US states) × Year × Race/Ethnicity of householder (9 ACS iterations) × Tenure (5 labels), with four measures per row.

### Race iterations

Nine B25140 table iterations are consumed:

| Table id | Legacy label | ACS iteration meaning |
|---|---|---|
| `b25140`  | All | All households |
| `b25140b` | Black | Black alone |
| `b25140c` | American Indian/Alaskan Native | AIAN alone |
| `b25140d` | Asian | Asian alone |
| `b25140e` | Native Hawaiian/Pacific Islander | NHPI alone |
| `b25140f` | Other | Some other race alone |
| `b25140g` | Multiracial | Two or more races |
| `b25140h` | White | **White alone, not Hispanic or Latino** |
| `b25140i` | Hispanic | Hispanic or Latino (any race) |

Note the deliberate omission: iteration **A** ("White alone", which includes Hispanic White) is skipped in favor of **H** ("White alone, not Hispanic") so that "White" and "Hispanic" do not double-count. This choice must be preserved.

### Legacy fragilities carried forward

- **Triplicated logic.** `get_data`, `clean_data`, and the tenure/burden math are copy-pasted across the three geographic builders. Any fix must be applied in three places.
- **Bare `except:` everywhere.** The year-fallback loops swallow *all* exceptions and silently decrement the year, so a transient parse error is indistinguishable from "this year isn't published yet." This can silently serve stale-year data.
- **Hard-coded `R:\UCF\...` Windows paths** for the historical CSV, crosswalks, and archive.
- **Historical CSV re-read inside the inner state loop** (`build_national_data`), once per state per year attempt.
- **`warnings.filterwarnings("ignore")`** hides pandas parse/division warnings (including divide-by-zero in share calculations).
- **Positional column munging.** `df.columns.str.replace(r'^.*_', '')` strips the table prefix by regex; a change in the SF column-naming convention breaks it silently.
- **PUMA→county / PUMA→region crosswalk uses an inner join.** PUMAs do not nest cleanly within counties; a PUMA spanning two counties is attributed by the crosswalk's single assignment, so county/region estimates are approximate. See Unique Challenges §2.
- **Commented-out imputation blocks** for missing race×location combinations were abandoned; missing strata simply drop out.
- **Save/archive is a side effect of visualization.** Data is only persisted when a user renders a chart.
- **No automated tests.**

### Legacy-to-target mapping

| Legacy element | Classification | Target home |
|---|---|---|
| `get_data()` (×2 copies) | Worker | `housing_stress/acquisition/acs_sf_downloader.py` |
| year-decrement fallback loops | Inline glue | `housing_stress/acquisition/source_fallback.py` |
| column prefix strip + MOE drop + rename | Hybrid | `housing_stress/cleaning/column_normalization.py` |
| tenure/burden math (×3 copies) | Hybrid | `housing_stress/cleaning/cost_burden_measures.py` |
| `table_id_to_race_dict` + iteration loop | Inline | `housing_stress/cleaning/race_ethnicity_mapping.py` |
| PUMA-ID extraction + crosswalk merge + groupby-sum | Worker | `housing_stress/geography/puma_aggregation.py` |
| `build_state_dataset` / `build_region_dataset` / `build_county_dataset` | Worker | `housing_stress/aggregation/geographic_levels.py` |
| `combine_with_historical()` | Worker | `housing_stress/merging/historical_merge.py` |
| geographic-level tag + column order + archive/save | Inline | `housing_stress/output/finalize_dataset.py` |
| `visualize_line/bar()` | Renderer | dropped (replaced by React frontend) |

---

## Unique Challenges

This module introduces concerns the previous migrations did not face. Each needs a deliberate design decision before coding begins.

### 1. Three geographic builders that are 90% duplicate

The legacy state/region/county builders differ only in how raw ACS rows are mapped to a geography *before* the shared tenure/burden math. The refactor must invert this: **aggregate estimate columns to the target geography first, then apply one shared `cost_burden_measures` transform.** The state path aggregates trivially (the ACS already reports at state level); the region and county paths aggregate PUMA rows via crosswalk. After aggregation all three feed the identical measure computation.

### 2. PUMA-to-county aggregation is inherently approximate (decided: keep, document)

California counties and regions are built by aggregating **PUMA-level** ACS estimates via a 2020 PUMA→county / PUMA→region crosswalk. PUMAs are drawn to ~100k population and do **not** nest within county lines — a PUMA straddling two counties is assigned wholesale to one. County and region cost-burden figures are therefore *approximations*, not exact county tabulations.

**Decision:** preserve the legacy PUMA-aggregation approach to keep current published numbers stable. This fragility is documented as a known methodological limitation of the county/region series (not the state series). A future migration to ACS **5-year** county tables (which publish B25140 directly at `SUMLEV=050`) is recorded as an open option in *Open Questions*, not adopted here.

The two crosswalks (`puma_counties_xwalk_2020.csv`, `puma_xwalk_2020.csv`) move into the repo under `data/data-raw/housing-stress/` and are loaded through config rather than an absolute Windows path.

### 3. Year availability and the 2020 gap

The ACS 1-year series begins in **2012** and has a permanent hole at **2020** (no standard 1-year release). The legacy code discovers "the latest available year" by trying `datetime.now().year` and decrementing up to 10 times on *any* exception. The refactor must replace this bare-except probe with an explicit, logged availability check that distinguishes "not yet published" (HTTP 404 / missing file) from "published but failed to parse" (which should raise, not silently skip). The contract's year coverage is "2012 through the latest published 1-year vintage, excluding 2020."

### 4. Race-set reconciliation toward the canonical 7 groups (decided)

The projections module standardized on 7 canonical race/ethnicity groups: White, Black, Asian, NHPI, AIAN, Multiracial, Hispanic. ACS Housing Stress carries **nine** categories: those seven plus **"Other"** (some other race alone) and **"All"** (the aggregate).

**Decision:** reconcile toward the canonical set where the mapping is clean (White ← iteration H = White non-Hispanic; Black; Asian; NHPI; AIAN; Multiracial ← iteration G = two-or-more; Hispanic), and retain two module-specific extras — **"Other"** (no projections counterpart) and **"All"** (the pre-aggregated total that ACS supplies directly as the base table). The schema flags two semantic caveats for the frontend and any cross-module comparison:

- **"Multiracial":** projections defines it as *non-Hispanic* two-or-more races; ACS iteration G is two-or-more races *of any ethnicity*. The labels match but the universes differ slightly.
- **"Other":** ACS iteration F ("some other race alone") has no projections equivalent; it must never be silently folded into "Multiracial" or dropped.

"All" is stored as a real base row (from the un-suffixed `b25140` table), **not** recomputed by summing the race iterations — the iterations overlap and undercount by design, so summing them would not reproduce "All."

### 5. Save/archive decoupled from visualization

Legacy code only writes the contract CSV as a side effect of rendering a chart. In V3 the pipeline is the writer: `housing_stress_pipeline.py` acquires, cleans, merges, validates, and conditionally archives/saves with no rendering involved. The React frontend only ever *reads* the contract CSV.

### 6. Stateful line overlay and two-period bar

`visualize_line` appends traces to a persistent figure and supports an index-to-100 transform; `visualize_bar` computes numeric/percent change between two chosen years. Both map onto existing shared frontend transforms (`indexed`, `numericChange`, `percentChange`) plus additive multi-series selection — no special backend architecture is needed. The module schema's presets should pre-configure an "overlay comparison" and a "two-period change" preset.

---

## Target Architecture

Following the established module pattern, the refactored module spans the standard config → acquisition → cleaning → geography → aggregation → merging → validation → output → orchestrator layout, plus the three frontend deliverables.

```
scripts/
  housing_stress/
    config/
      paths.py
      sources.py
      schemas.py
    acquisition/
      acs_sf_downloader.py
      source_fallback.py
    cleaning/
      column_normalization.py
      cost_burden_measures.py
      race_ethnicity_mapping.py
    geography/
      puma_aggregation.py
    aggregation/
      geographic_levels.py
    merging/
      historical_merge.py
    validation/
      housing_stress_validators.py
    output/
      finalize_dataset.py
  orchestrators/
    housing_stress_pipeline.py
  unit_tests/
    housing_stress/
      config/
        test_paths.py
        test_sources.py
        test_schemas.py
      acquisition/
        test_acs_sf_downloader.py
        test_source_fallback.py
      cleaning/
        test_column_normalization.py
        test_cost_burden_measures.py
        test_race_ethnicity_mapping.py
      geography/
        test_puma_aggregation.py
      aggregation/
        test_geographic_levels.py
      merging/
        test_historical_merge.py
      validation/
        test_housing_stress_validators.py
      output/
        test_finalize_dataset.py
    orchestrators/
      test_housing_stress_pipeline.py

data/
  data-raw/housing-stress/
    puma_counties_xwalk_2020.csv
    puma_regions_xwalk_2020.csv
  data-cleaned/housing-stress/
    HousingStress_Current.csv
  archive/housing-stress/

lib/
  data/housing_stress.js
  visualization/moduleSchemas/housingStress.js

app/
  api/housing-stress/route.js
```

Shared modules reused (not re-created): `scripts/shared/downloads/http_downloads.py`, `scripts/shared/geography/california_geography.py` (canonical county/region names + region→county mapping), `scripts/shared/validation/dataframe_validators.py`, `scripts/shared/data_cleaning/*`, `scripts/shared/archives/file_retention.py`.

---

## Data Contract

The pipeline's output is `data/data-cleaned/housing-stress/HousingStress_Current.csv`.

### Grain

One row per `(Year, Geographic Level, Location, Race/Ethnicity, Tenure)`.

### Columns (proposed)

```
Year, Geographic Level, Location, Race/Ethnicity, Tenure,
Number Over 30%, Number Over 50%, Share Over 30%, Share Over 50%
```

Where:

- `Year`: integer (2012+, excluding 2020).
- `Geographic Level`: `State`, `Region` (9 CA regions), `County` (58 CA counties). State rows use the two-letter USPS abbreviation as `Location` (mirroring the legacy dataset); California appears both as `State`/`CA` and as the parent of the region/county rows.
- `Location`: state abbreviation, region name, or county name.
- `Race/Ethnicity`: `All`, `White`, `Black`, `Asian`, `NHPI`, `AIAN`, `Multiracial`, `Hispanic`, `Other`.
- `Tenure`: `Total`, `Rented`, `Owned`, `Owned With Mortgage`, `Owned Without Mortgage`. (Renamed from the legacy `Label`; note the rename for the data-access layer.)
- `Number Over 30%` / `Number Over 50%`: integer household counts paying >30% / >50% of income on housing.
- `Share Over 30%` / `Share Over 50%`: proportion (0–1) of the tenure denominator.

### Geographic scope

- **State:** 50 US states (District of Columbia and Puerto Rico excluded, matching legacy). Sourced directly from state-level ACS rows.
- **Region / County:** 9 CA regions and 58 CA counties, built by PUMA aggregation (see Unique Challenges §2). Region and county numbers are approximate.

Canonical region and county name lists come from `scripts/shared/geography/california_geography.py`; the PUMA→region numeric map (1–9) resolves to those same region names.

### Race rows

`All` is a stored base row from the un-suffixed `b25140` table, not a sum of the eight race iterations. The eight iteration rows are stored as-is under their reconciled canonical labels. No "sum of races" aggregation row is computed.

### Year coverage

2012 through the latest published ACS 1-year vintage, excluding 2020. The pipeline resolves the latest available vintage explicitly and never silently substitutes an older year without logging it.

### Missing strata

When a race iteration is unavailable for a location-year (small-population suppression), that `(Year, Location, Race/Ethnicity)` group is **absent** rather than imputed. The legacy imputation blocks stay retired. Validation reports absent strata as warnings, not errors, because ACS suppression is expected.

---

## Pipeline Phases and Function Definitions

Each section defines one pipeline phase: its purpose, the files it contains, and every function signature with its docstring. No implementations are provided.

---

### Phase 1: Configuration

Three config modules expose one `get_*()` function each, returning plain dicts. If the ACS/PUMA constants grow large, a `lib/housing_stress_config.py` root config holds them; otherwise `schemas.py` inlines them.

#### `scripts/housing_stress/config/paths.py`

```python
"""
paths.py — exposes ACS Housing Stress pipeline paths as pathlib objects.

Data sources:
    - lib/housing_stress_config.py — project, data, archive, download, crosswalk, and log path settings

Outputs:
    - dict — named pathlib.Path values used throughout the pipeline

Usage:
    python scripts/housing_stress/config/paths.py

Test Folders:
    - scripts/unit_tests/housing_stress/config/
"""

from pathlib import Path


def get_paths():
    """Return configured pipeline paths as pathlib objects, including the two PUMA crosswalk paths under data/data-raw/housing-stress/. Test file: scripts/unit_tests/housing_stress/config/test_paths.py"""
```

#### `scripts/housing_stress/config/sources.py`

```python
"""
sources.py — exposes ACS Housing Stress source URLs, table iterations, request settings, and cache policy.

Data sources:
    - lib/housing_stress_config.py — ACS Summary File URL patterns, table-iteration list, year bounds, timeouts, cache ages

Outputs:
    - dict — source settings consumed by the acquisition phase

Usage:
    python scripts/housing_stress/config/sources.py

Test Folders:
    - scripts/unit_tests/housing_stress/config/
"""


def get_source_settings():
    """
    Return source-acquisition settings for the ACS 1-year table-based Summary File.

    Returns:
        dict with keys: data_url_pattern, geo_url_pattern (both templated on
        {year} and {tblid}), dataset ("1" for 1-year), request_headers, timeout,
        cache_max_age_days, earliest_year (2012), excluded_years ({2020}),
        max_year_lookback (number of years to probe backward for the latest
        vintage), table_iterations (ordered dict of the 9 B25140 table ids to
        raw race labels), expected_geo_columns (GEO_ID, NAME, STUSAB),
        expected_estimate_columns (E001..E013 after prefix stripping).

    Test file:
        scripts/unit_tests/housing_stress/config/test_sources.py
    """
```

#### `scripts/housing_stress/config/schemas.py`

```python
"""
schemas.py — exposes ACS Housing Stress column schemas, tenure formulas, race reconciliation, and validation configs.

Data sources:
    - lib/housing_stress_config.py — column names, tenure/burden formulas, race iteration reconciliation, validation thresholds

Outputs:
    - dict — schema settings consumed by cleaning, aggregation, validation, and output phases

Usage:
    python scripts/housing_stress/config/schemas.py

Test Folders:
    - scripts/unit_tests/housing_stress/config/
"""


def get_schema_config():
    """
    Return schema configuration for the ACS Housing Stress pipeline.

    Returns:
        dict with keys: output_columns, required_columns, year_column,
        location_column, level_column, race_column, tenure_column,
        measure_columns (Number Over 30%, Number Over 50%, Share Over 30%, Share Over 50%),
        estimate_columns (E001..E013),
        tenure_formulas — mapping of each tenure label to its numerator column
            lists for the 30% and 50% thresholds and its denominator column list
            (e.g. {"Total": {"num_30": ["E003","E007","E011"],
                             "num_50": ["E004","E008","E012"], "denom": ["E001"]}, ...}),
        canonical_tenures (5 labels),
        race_iteration_map — ordered {table_id: raw_label} for the 9 iterations,
        race_reconciliation_map — {raw_label: canonical_label} incl. "Other" and "All"
            passthrough, with White sourced from iteration H (non-Hispanic),
        canonical_race_groups (9: the 7 shared + "Other" + "All"),
        state_abbreviations (50), excluded_state_areas ({"DC","PR"}),
        completeness_group_columns (Geographic Level, Location, Year),
        cleaning_validation_config, final_validation_config.

    Test file:
        scripts/unit_tests/housing_stress/config/test_schemas.py
    """
```

---

### Phase 2: Data Acquisition

One downloader (the ACS Summary File is a single source) plus a fallback coordinator that owns the year-availability probe. The downloader replaces the two copies of legacy `get_data()`; it uses `scripts/shared/downloads/http_downloads.py` for HTTP.

#### `scripts/housing_stress/acquisition/acs_sf_downloader.py`

```python
"""
acs_sf_downloader.py — downloads ACS 1-year table-based Summary File B25140 tables and joins geography.

Data sources:
    - ACS Summary File data .dat (pipe-delimited, keyed by GEO_ID) per (year, table id)
    - ACS Summary File Geos{year}1YR.txt geography lookup (NAME, STUSAB, keyed by GEO_ID)

Outputs:
    - pandas.DataFrame — one raw table iteration joined to NAME/STUSAB, filtered to a state

Usage:
    Called by the housing stress pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/acquisition/
"""

from pathlib import Path

import pandas as pd


class ACSTableUnavailableError(RuntimeError):
    """Raised when a requested (year, table id) is not published (HTTP 404 / missing file). Distinct from a parse failure. Test file: scripts/unit_tests/housing_stress/acquisition/test_acs_sf_downloader.py"""


def get_acs_table(tblid, year, dataset, state, source_settings, headers, timeout):
    """
    Download one B25140 iteration and return it joined to geography and filtered to one state.

    Reads the pipe-delimited .dat estimates and the Geos lookup, joins on GEO_ID,
    attaches NAME and STUSAB, and returns only rows where STUSAB == state. Raises
    ACSTableUnavailableError on a 404/missing file (so the caller can decrement the
    year); raises ValueError on a file that downloads but fails to parse or lacks
    the expected geo columns (so a real defect is not mistaken for "not published").

    Args:
        tblid: B25140 table id (e.g. "b25140", "b25140h")
        year: 4-digit ACS vintage year
        dataset: "1" for the 1-year file
        state: two-letter USPS abbreviation to filter to (e.g. "CA")
        source_settings: dict from get_source_settings() (URL patterns, headers)
        headers: HTTP request headers
        timeout: request timeout in seconds

    Returns:
        pandas.DataFrame — indexed by GEO_ID with estimate columns plus NAME, STUSAB.

    Raises:
        ACSTableUnavailableError — the table/year is not published.
        ValueError — the file is present but malformed.

    Test file:
        scripts/unit_tests/housing_stress/acquisition/test_acs_sf_downloader.py
    """


def download_all_iterations(year, dataset, state, source_settings, headers, timeout):
    """
    Download all 9 B25140 race iterations for one (year, state).

    Iterates the configured table_iterations, calling get_acs_table for each and
    tagging the raw race label. A missing iteration (small-population suppression)
    is recorded and skipped, not fatal; a missing base table ("b25140") raises.

    Args:
        year: 4-digit ACS vintage year
        dataset: "1" for the 1-year file
        state: USPS abbreviation
        source_settings: dict from get_source_settings()
        headers: HTTP request headers
        timeout: request timeout in seconds

    Returns:
        tuple of (frames, missing_iterations):
            frames — dict {raw_race_label: DataFrame} for each available iteration
            missing_iterations — list of raw race labels that were suppressed/absent

    Raises:
        ACSTableUnavailableError — the base "b25140" table is unavailable for this year.

    Test file:
        scripts/unit_tests/housing_stress/acquisition/test_acs_sf_downloader.py
    """
```

#### `scripts/housing_stress/acquisition/source_fallback.py`

```python
"""
source_fallback.py — resilient acquisition coordinator: resolves the latest ACS vintage and provides fallbacks.

Data sources:
    - acs_sf_downloader.py — live ACS table downloads
    - data/data-raw/housing-stress/{FILENAME} — optional manual fallback files
    - data/data-cleaned/housing-stress/HousingStress_Current.csv — last-saved rows

Outputs:
    - dict of raw iteration frames from the newest resolvable vintage
    - int — the resolved year
    - bool flags — whether acquisition failed (fell back to last-saved) and whether a manual file was used

Usage:
    Called by the housing stress pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/acquisition/
"""

import pandas as pd


def resolve_latest_vintage(state, source_settings, headers, timeout, max_year_lookback, excluded_years):
    """
    Find the newest published ACS 1-year vintage by probing backward from the current year.

    Starts at the current calendar year and steps back up to max_year_lookback times.
    A year is accepted when its base "b25140" table downloads and parses. Years in
    excluded_years (e.g. 2020) are skipped without a probe. Unlike the legacy bare-except
    loop, this raises on a parse failure and only continues on ACSTableUnavailableError,
    so a malformed release does not masquerade as "not yet published". Each skipped
    year is logged.

    Args:
        state: USPS abbreviation used for the probe (e.g. "CA")
        source_settings: dict from get_source_settings()
        headers: HTTP request headers
        timeout: request timeout in seconds
        max_year_lookback: maximum number of years to step backward
        excluded_years: set of years with no 1-year release (e.g. {2020})

    Returns:
        int — the resolved latest available vintage year.

    Raises:
        ACSTableUnavailableError — no vintage found within the lookback window.

    Test file:
        scripts/unit_tests/housing_stress/acquisition/test_source_fallback.py
    """


def acquire_with_fallback(live_download_fn, manual_path, saved_rows_fn):
    """
    Try the live download, then a manual raw file, then last-saved rows.

    Args:
        live_download_fn: callable performing the live ACS acquisition (raises on failure)
        manual_path: pathlib.Path to a manually-placed raw file (may not exist)
        saved_rows_fn: callable returning the last-saved contract rows as a DataFrame

    Returns:
        tuple of (raw, source_failed, used_manual):
            raw — the acquired payload (iteration frames or a rows DataFrame)
            source_failed — True if live and manual both failed
            used_manual — True if the manual file was used

    Test file:
        scripts/unit_tests/housing_stress/acquisition/test_source_fallback.py
    """
```

---

### Phase 3: Cleaning

Three cleaners replace the triplicated inline logic. `column_normalization` handles the mechanical reshaping (prefix strip, MOE drop, rename). `cost_burden_measures` is the shared tenure/burden transform — the single biggest dedup. `race_ethnicity_mapping` reconciles the 9 iterations to canonical labels.

#### `scripts/housing_stress/cleaning/column_normalization.py`

```python
"""
column_normalization.py — normalizes raw ACS Summary File columns to the pipeline's estimate schema.

Data sources:
    - Raw joined table frame from acs_sf_downloader

Outputs:
    - pandas.DataFrame — with bare E-columns, geography columns renamed, MOE columns dropped

Usage:
    Called by geographic_levels.py and cost_burden_measures.py; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/cleaning/
"""

import pandas as pd


def strip_table_prefix(df):
    """
    Strip the "B25140xxx_" table prefix from estimate column names, leaving E001..E013 and M001..M013.

    Replaces the fragile inline regex with a validated transform: after stripping,
    the expected E-columns must be present exactly once.

    Args:
        df: pandas.DataFrame with prefixed ACS columns

    Returns:
        pandas.DataFrame — with bare column names.

    Raises:
        ValueError — if any expected estimate column is missing or duplicated after stripping.

    Test file:
        scripts/unit_tests/housing_stress/cleaning/test_column_normalization.py
    """


def drop_margin_of_error_columns(df):
    """
    Drop the ACS margin-of-error columns (those matching M\\d{3}).

    Args:
        df: pandas.DataFrame after strip_table_prefix

    Returns:
        pandas.DataFrame — estimate columns only.

    Test file:
        scripts/unit_tests/housing_stress/cleaning/test_column_normalization.py
    """


def rename_geography_columns(df, schema_config):
    """
    Rename NAME/STUSAB to the pipeline's geography column names.

    Args:
        df: pandas.DataFrame with raw NAME/STUSAB columns
        schema_config: dict from get_schema_config()

    Returns:
        pandas.DataFrame — with canonical geography column names.

    Test file:
        scripts/unit_tests/housing_stress/cleaning/test_column_normalization.py
    """
```

#### `scripts/housing_stress/cleaning/cost_burden_measures.py`

```python
"""
cost_burden_measures.py — derives the four cost-burden measures for each tenure label from B25140 estimate columns.

This is the single shared implementation of the tenure/burden math that the legacy
module copy-pasted into all three geographic builders. It consumes a frame whose
estimate columns (E001..E013) have already been aggregated to the target geography,
and emits one row per (input row) x (tenure label).

Data sources:
    - Aggregated estimate frame (state rows, or PUMA-summed county/region rows)
    - Schema config — tenure_formulas

Outputs:
    - pandas.DataFrame — long by tenure, with Number/Share Over 30%/50% columns

Usage:
    Called by geographic_levels.py; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/cleaning/
"""

import pandas as pd


def compute_tenure_measures(df, id_columns, schema_config):
    """
    Expand each geography row into 5 tenure rows and compute the four cost-burden measures.

    For each tenure in schema_config["tenure_formulas"], sums the configured
    numerator columns for the 30% and 50% thresholds, divides by the configured
    denominator to get shares, and stacks the results. Division by a zero
    denominator yields NA (not inf) and is surfaced explicitly rather than
    suppressed by a global warning filter.

    Args:
        df: pandas.DataFrame with E001..E013 and the id_columns, one row per geography
        id_columns: list of columns identifying each geography row to carry through
            (e.g. ["Location"] or ["Location", "Race/Ethnicity"])
        schema_config: dict from get_schema_config(), including tenure_formulas

    Returns:
        pandas.DataFrame — id_columns + Tenure + Number Over 30% + Number Over 50%
        + Share Over 30% + Share Over 50%, five rows per input row.

    Raises:
        ValueError — if any estimate column referenced by a tenure formula is missing.

    Test file:
        scripts/unit_tests/housing_stress/cleaning/test_cost_burden_measures.py
    """
```

#### `scripts/housing_stress/cleaning/race_ethnicity_mapping.py`

```python
"""
race_ethnicity_mapping.py — reconciles the 9 ACS B25140 race iterations to canonical labels.

Data sources:
    - Schema config — race_iteration_map and race_reconciliation_map

Outputs:
    - str/label reconciliation applied to a Race/Ethnicity column

Usage:
    Called by geographic_levels.py; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/cleaning/
"""

import pandas as pd


# ── Constants ─────────────────────────────────────────────────────────────────

# The 9 stored categories: the 7 canonical projections groups plus "Other" and "All".
# "White" is sourced from ACS iteration H (White alone, NOT Hispanic) so it does not
# double-count with "Hispanic". "Other" (iteration F) and "All" (base table) have no
# projections counterpart and must never be folded into "Multiracial" or dropped.
CANONICAL_RACE_GROUPS = [
    "All",
    "White",
    "Black",
    "Asian",
    "NHPI",
    "AIAN",
    "Multiracial",
    "Hispanic",
    "Other",
]

# ACS table iteration id -> raw label (base table has no suffix).
RACE_ITERATION_MAP = {
    "b25140": "All",
    "b25140b": "Black",
    "b25140c": "AIAN",       # American Indian or Alaska Native alone
    "b25140d": "Asian",
    "b25140e": "NHPI",       # Native Hawaiian / Pacific Islander alone
    "b25140f": "Other",      # some other race alone
    "b25140g": "Multiracial",  # two or more races (ANY ethnicity; see caveat)
    "b25140h": "White",      # White alone, NOT Hispanic or Latino
    "b25140i": "Hispanic",   # Hispanic or Latino (any race)
}


def get_canonical_race_groups():
    """Return the ordered list of 9 canonical race/ethnicity labels stored in the contract. Test file: scripts/unit_tests/housing_stress/cleaning/test_race_ethnicity_mapping.py"""


def reconcile_race_label(df, race_column, reconciliation_map):
    """
    Map raw iteration labels to canonical labels, validating that no raw label is unmapped.

    Args:
        df: pandas.DataFrame with a raw Race/Ethnicity column
        race_column: name of that column
        reconciliation_map: dict {raw_label: canonical_label}

    Returns:
        pandas.DataFrame — with race_column values reconciled to CANONICAL_RACE_GROUPS.

    Raises:
        ValueError — if any raw label has no canonical mapping.

    Test file:
        scripts/unit_tests/housing_stress/cleaning/test_race_ethnicity_mapping.py
    """
```

---

### Phase 4: Geographic Aggregation

Two modules. `puma_aggregation` owns the PUMA→county / PUMA→region crosswalk and estimate summation (the approximate step). `geographic_levels` orchestrates the three geographic builds and applies the shared cleaning transforms, replacing the three legacy closures.

#### `scripts/housing_stress/geography/puma_aggregation.py`

```python
"""
puma_aggregation.py — aggregates PUMA-level ACS estimates to CA counties and regions via crosswalk.

PUMAs do not nest within county lines, so county/region estimates produced here are
approximations (see the module refactor plan, Unique Challenges section). The crosswalks
live in data/data-raw/housing-stress/ and are loaded through config, not hardcoded paths.

Data sources:
    - data/data-raw/housing-stress/puma_counties_xwalk_2020.csv — PUMA code -> county name
    - data/data-raw/housing-stress/puma_regions_xwalk_2020.csv — PUMA code -> region id (1-9)

Outputs:
    - pandas.DataFrame — estimate columns summed to the target geography

Usage:
    Called by geographic_levels.py; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/geography/
"""

import pandas as pd


def extract_puma_id(df):
    """
    Filter to PUMA rows and extract the 5-digit PUMA code from GEO_ID.

    Keeps only rows whose NAME identifies a PUMA, then parses the trailing 5 digits
    of GEO_ID into an integer PUMA_ID.

    Args:
        df: pandas.DataFrame with GEO_ID and NAME (from acquisition)

    Returns:
        pandas.DataFrame — PUMA rows with a PUMA_ID column.

    Test file:
        scripts/unit_tests/housing_stress/geography/test_puma_aggregation.py
    """


def aggregate_pumas_to_geography(df, crosswalk_path, crosswalk_geo_column, estimate_columns, output_location_column):
    """
    Merge PUMA rows to a geography via crosswalk and sum estimate columns by that geography.

    Inner-joins df on PUMA_ID to the crosswalk (so unmatched PUMAs drop, matching
    legacy behavior), renames the crosswalk geography column to output_location_column,
    and sums estimate_columns grouped by that geography. This is the approximate
    PUMA->county / PUMA->region step.

    Args:
        df: pandas.DataFrame with PUMA_ID and estimate columns
        crosswalk_path: pathlib.Path to the PUMA crosswalk CSV
        crosswalk_geo_column: crosswalk column holding the target geography (county name or region id)
        estimate_columns: list of estimate columns to sum (E001..E013)
        output_location_column: name for the resulting geography column

    Returns:
        pandas.DataFrame — one row per target geography with summed estimate columns.

    Test file:
        scripts/unit_tests/housing_stress/geography/test_puma_aggregation.py
    """


def map_region_ids_to_names(df, region_column, region_id_to_name):
    """
    Replace numeric region ids (1-9) with canonical region names.

    Args:
        df: pandas.DataFrame with a numeric region id column
        region_column: name of that column
        region_id_to_name: dict {1: "Far North", ..., 9: "Los Angeles (Regional)"}

    Returns:
        pandas.DataFrame — with region ids replaced by canonical names.

    Raises:
        ValueError — if any region id has no name mapping.

    Test file:
        scripts/unit_tests/housing_stress/geography/test_puma_aggregation.py
    """
```

#### `scripts/housing_stress/aggregation/geographic_levels.py`

```python
"""
geographic_levels.py — builds State, Region, and County frames and applies the shared cleaning transforms.

Replaces the three legacy closures (build_state_dataset / build_region_dataset /
build_county_dataset). Each builder aggregates estimate columns to its geography,
then applies the shared cost_burden_measures transform, then reconciles race labels
and tags the geographic level. All three share one code path except for the geography
step.

Data sources:
    - Raw iteration frames from acquisition (per race iteration)
    - puma_aggregation.py for county/region rollups
    - scripts/shared/geography/california_geography.py for canonical names

Outputs:
    - pandas.DataFrame — long contract-shaped rows for one geographic level

Usage:
    Called by the housing stress pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/aggregation/
"""

import pandas as pd


def build_state_rows(iteration_frames, year, schema_config):
    """
    Build State-level contract rows for all 50 states from the raw iteration frames.

    Filters each iteration to the 50 state NAMEs (excluding DC and PR), normalizes
    columns, computes tenure measures, reconciles race labels, tags Geographic Level
    "State", and uses the USPS abbreviation as Location.

    Args:
        iteration_frames: dict {raw_race_label: DataFrame} from acquisition (state scope)
        year: resolved vintage year to stamp on the rows
        schema_config: dict from get_schema_config()

    Returns:
        pandas.DataFrame — State-level contract rows.

    Test file:
        scripts/unit_tests/housing_stress/aggregation/test_geographic_levels.py
    """


def build_region_rows(iteration_frames, year, paths, schema_config, geography):
    """
    Build Region-level contract rows for the 9 CA regions via PUMA aggregation.

    For each iteration: extract PUMA ids, aggregate to region id, map ids to names,
    compute tenure measures, reconcile race labels, tag Geographic Level "Region".

    Args:
        iteration_frames: dict {raw_race_label: DataFrame} from acquisition (CA scope)
        year: resolved vintage year
        paths: dict from get_paths() (region crosswalk path)
        schema_config: dict from get_schema_config()
        geography: dict from california_geography.get_california_geography()

    Returns:
        pandas.DataFrame — Region-level contract rows.

    Test file:
        scripts/unit_tests/housing_stress/aggregation/test_geographic_levels.py
    """


def build_county_rows(iteration_frames, year, paths, schema_config, geography):
    """
    Build County-level contract rows for the 58 CA counties via PUMA aggregation.

    Mirrors build_region_rows but crosswalks PUMA->county and tags Geographic Level
    "County". County estimates are approximate (PUMAs cross county lines).

    Args:
        iteration_frames: dict {raw_race_label: DataFrame} from acquisition (CA scope)
        year: resolved vintage year
        paths: dict from get_paths() (county crosswalk path)
        schema_config: dict from get_schema_config()
        geography: dict from california_geography.get_california_geography()

    Returns:
        pandas.DataFrame — County-level contract rows.

    Test file:
        scripts/unit_tests/housing_stress/aggregation/test_geographic_levels.py
    """


def build_all_levels(ca_frames, state_frames, year, paths, schema_config, geography):
    """
    Concatenate State, Region, and County rows into one sorted frame for the vintage.

    Args:
        ca_frames: dict of CA-scoped iteration frames (for region/county)
        state_frames: dict of 50-state-scoped iteration frames (for state)
        year: resolved vintage year
        paths: dict from get_paths()
        schema_config: dict from get_schema_config()
        geography: dict from california_geography.get_california_geography()

    Returns:
        pandas.DataFrame — all three levels for this year, sorted by
        Geographic Level, Location, Race/Ethnicity, Tenure.

    Test file:
        scripts/unit_tests/housing_stress/aggregation/test_geographic_levels.py
    """
```

---

### Phase 5: Merging

Mirrors the Components of Change / Projections `historical_merge.py` pattern. Historical replacement is atomic at `Year` grain: an incoming vintage year fully replaces any overlapping historical year only after it passes completeness validation. Key-level upserts are prohibited so rows from different vintages never mix within a year.

#### `scripts/housing_stress/merging/historical_merge.py`

```python
"""
historical_merge.py — combines the freshly built vintage with historical rows and detects new data.

Data sources:
    - data/data-cleaned/housing-stress/HousingStress_Current.csv — saved canonical data
    - Freshly built contract frame from geographic_levels.build_all_levels

Outputs:
    - pandas.DataFrame — merged dataset
    - bool — whether new data was detected

Usage:
    Called by the housing stress pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/merging/
"""

import pandas as pd


def load_canonical_dataset(current_data_path):
    """
    Read the existing contract CSV, or return an empty contract-shaped frame if absent.

    Args:
        current_data_path: pathlib.Path to HousingStress_Current.csv

    Returns:
        pandas.DataFrame — the saved dataset, or an empty frame with contract columns.

    Test file:
        scripts/unit_tests/housing_stress/merging/test_historical_merge.py
    """


def combine_with_historical(new_df, historical_df, year_column, completeness_validator):
    """
    Atomically merge a complete incoming vintage year with historical rows.

    Runs completeness_validator against the incoming vintage before touching history.
    On failure, raises without modifying either input. On success, drops every
    historical row whose Year appears in new_df and appends the incoming rows whole,
    preserving non-overlapping historical years. Never performs key-level upserts.

    Args:
        new_df: pandas.DataFrame — freshly built rows for the resolved vintage year
        historical_df: pandas.DataFrame — all historical rows
        year_column: name of the year column for overlap detection
        completeness_validator: callable(new_df) -> (is_valid, messages)

    Returns:
        pandas.DataFrame — merged dataset, sorted by Year, Geographic Level, Location,
        Race/Ethnicity, Tenure.

    Raises:
        ValueError — if the incoming vintage fails completeness validation.

    Test file:
        scripts/unit_tests/housing_stress/merging/test_historical_merge.py
    """


def detect_new_data(merged_df, historical_df):
    """
    Determine whether the merged dataset differs from the saved historical dataset.

    Replaces the legacy assert_frame_equal check with an explicit comparison that
    ignores row ordering and index.

    Args:
        merged_df: pandas.DataFrame — the newly merged dataset
        historical_df: pandas.DataFrame — the previously saved dataset

    Returns:
        bool — True if the merged data differs from history.

    Test file:
        scripts/unit_tests/housing_stress/merging/test_historical_merge.py
    """
```

---

### Phase 6: Validation and Output

#### `scripts/housing_stress/validation/housing_stress_validators.py`

```python
"""
housing_stress_validators.py — validates ACS Housing Stress data at the cleaning and final stages.

Data sources:
    - pandas.DataFrame — the dataset to validate
    - Schema config — expected value sets and thresholds

Outputs:
    - tuple of (is_valid, messages) — structured validation results

Usage:
    Called by geographic_levels, historical_merge, and the orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/validation/
"""

import pandas as pd


def validate_cleaning_output(df, schema_config):
    """
    Validate a built geographic-level frame before merging.

    Checks: required columns present; no nulls in key columns; tenure values all
    canonical; race values all canonical; shares within [0, 1] where not NA; numbers
    non-negative. Composes shared validators from scripts/shared/validation/.

    Args:
        df: pandas.DataFrame — output of a geographic-level builder
        schema_config: dict from get_schema_config()

    Returns:
        tuple of (is_valid, messages).

    Test file:
        scripts/unit_tests/housing_stress/validation/test_housing_stress_validators.py
    """


def validate_stratification_completeness(df, schema_config):
    """
    Validate the tenure x race matrix per (Geographic Level, Location, Year) group.

    For each group, counts distinct (Race/Ethnicity, Tenure) tuples. Because ACS
    small-population suppression legitimately removes race iterations for some
    locations, a group missing a *race* is reported as a warning (does not fail
    the vintage), while a group missing a *tenure* for a present race is an error
    (the cost-burden math should always yield all 5 tenures). Groups are never pooled.

    Args:
        df: pandas.DataFrame — level-tagged rows for one vintage
        schema_config: dict from get_schema_config()

    Returns:
        tuple of (is_valid, messages) where messages separates warnings from errors.

    Test file:
        scripts/unit_tests/housing_stress/validation/test_housing_stress_validators.py
    """


def validate_housing_stress_dataset(df, validation_config):
    """
    Validate the final merged dataset before writing.

    Checks: row count within bounds; all three geographic levels present; year range
    spans expected coverage (2012+, excluding 2020); no negative numbers; shares in
    [0, 1] where present; no duplicate (Year, Geographic Level, Location,
    Race/Ethnicity, Tenure) keys.

    Args:
        df: pandas.DataFrame — the fully merged dataset
        validation_config: dict with keys: required_columns, expected_levels,
            year_range, excluded_years, min_rows, max_rows, duplicate_key_columns

    Returns:
        tuple of (is_valid, messages).

    Test file:
        scripts/unit_tests/housing_stress/validation/test_housing_stress_validators.py
    """
```

#### `scripts/housing_stress/output/finalize_dataset.py`

```python
"""
finalize_dataset.py — orders columns, casts types, and performs conditional archival for the contract CSV.

Data sources:
    - pandas.DataFrame — the validated dataset ready for output
    - data/data-cleaned/housing-stress/HousingStress_Current.csv — existing output for comparison

Outputs:
    - data/data-cleaned/housing-stress/HousingStress_Current.csv — updated canonical dataset
    - data/archive/housing-stress/HousingStress_{TIMESTAMP}.csv — archived prior output (when data changed)

Usage:
    Called by the housing stress pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/housing_stress/output/
"""

import pandas as pd


def prepare_output(df, schema_config):
    """
    Enforce contract column order, sort rows, and cast types for the final CSV.

    Args:
        df: pandas.DataFrame — the validated dataset
        schema_config: dict from get_schema_config(), must contain output_columns

    Returns:
        pandas.DataFrame — ready to write.

    Test file:
        scripts/unit_tests/housing_stress/output/test_finalize_dataset.py
    """


def archive_and_save(df, current_path, archive_directory):
    """
    Save only when the data changed; archive the prior version with an mm-dd-yy timestamp.

    If the existing CSV is content-identical to what would be written, no file is
    touched. Otherwise the existing file is copied to archive_directory with a
    timestamp and the new data overwrites current_path. Replaces the legacy pattern
    where saving was a side effect of chart rendering.

    Args:
        df: pandas.DataFrame — the finalized dataset
        current_path: pathlib.Path — contract CSV path
        archive_directory: pathlib.Path — where to copy the old version

    Returns:
        pathlib.Path or None — the output path if written, None if skipped.

    Test file:
        scripts/unit_tests/housing_stress/output/test_finalize_dataset.py
    """
```

---

### Orchestrator

#### `scripts/orchestrators/housing_stress_pipeline.py`

```python
"""
housing_stress_pipeline.py — orchestrates acquisition, cleaning, geographic aggregation, merging, validation, and output of ACS Housing Stress data.

Data sources:
    - ACS 1-year table-based Summary File (B25140 + race iterations) via the downloader
    - data/data-raw/housing-stress/ — PUMA crosswalks and optional manual fallback files
    - data/data-cleaned/housing-stress/HousingStress_Current.csv — saved canonical fallback and historical source
    - scripts/shared/geography/california_geography.py — county/region reference names

Outputs:
    - pandas.DataFrame — merged ACS Housing Stress dataset
    - data/data-cleaned/housing-stress/HousingStress_Current.csv — updated when new data is detected
    - dict — dataset, change flag, fallback flags, resolved year, output path, and row count

Usage:
    python scripts/orchestrators/housing_stress_pipeline.py

Test Folders:
    - scripts/unit_tests/orchestrators/
    - scripts/unit_tests/housing_stress/
"""

from typing import NoReturn

import pandas as pd

from scripts.housing_stress.acquisition.acs_sf_downloader import download_all_iterations
from scripts.housing_stress.acquisition.source_fallback import (
    acquire_with_fallback,
    resolve_latest_vintage,
)
from scripts.housing_stress.aggregation.geographic_levels import build_all_levels
from scripts.housing_stress.config.paths import get_paths
from scripts.housing_stress.config.schemas import get_schema_config
from scripts.housing_stress.config.sources import get_source_settings
from scripts.housing_stress.merging.historical_merge import (
    combine_with_historical,
    detect_new_data,
    load_canonical_dataset,
)
from scripts.housing_stress.output.finalize_dataset import archive_and_save, prepare_output
from scripts.housing_stress.validation.housing_stress_validators import (
    validate_housing_stress_dataset,
    validate_stratification_completeness,
)
from scripts.shared.geography.california_geography import get_california_geography


class HousingStressPipelinePhaseError(RuntimeError):
    """Report failure of a named Housing Stress pipeline phase. Test file: scripts/unit_tests/orchestrators/test_housing_stress_pipeline.py"""


def _raise_phase_error(phase_name, error) -> NoReturn:
    """Wrap an exception with its pipeline phase. Test file: scripts/unit_tests/orchestrators/test_housing_stress_pipeline.py"""


def build_housing_stress_dataset(config=None):
    """
    Build the ACS Housing Stress dataset and save only when source data changed.

    Runs five phases, wrapping each so any exception re-raises as a
    HousingStressPipelinePhaseError tagged with the phase name:

    Phase 1 - Setup & Load: resolve config and geography; load the existing canonical CSV.
    Phase 2 - Acquisition: resolve the latest ACS vintage; download the 9 B25140
              iterations for the 50-state scope and the CA scope, with manual and
              last-saved fallbacks.
    Phase 3 - Build levels: aggregate PUMAs to counties/regions, compute tenure
              cost-burden measures, reconcile race labels, and tag Geographic Level
              across State/Region/County; validate each level.
    Phase 4 - Merge: validate the incoming vintage's completeness, atomically replace
              any overlapping historical year, and detect change.
    Phase 5 - Finalize & Save: validate the final dataset; archive and write only
              when new data was detected.

    Args:
        config: dict or None - override config for testing. When None, loads from
            get_paths(), get_source_settings(), get_schema_config(),
            get_california_geography().

    Returns:
        dict with keys:
            dataset - pandas.DataFrame of the final dataset
            new_data - bool, whether new data was detected
            source_failed - bool, whether acquisition fell back to saved rows
            used_manual - bool, whether a manual file was used
            resolved_year - int, the ACS vintage that was built
            output_path - pathlib.Path or None (None if no write occurred)
            row_count - int

    Test file:
        scripts/unit_tests/orchestrators/test_housing_stress_pipeline.py
    """


if __name__ == "__main__":
    result = build_housing_stress_dataset()
    print(f"  Vintage: {result['resolved_year']}")
    print(f"  Rows: {result['row_count']}")
    if result["output_path"]:
        print(f"  Written to: {result['output_path']}")
    else:
        print("  No new data detected; file unchanged.")
```

---

## Frontend Deliverables

These are JavaScript files and are not governed by the Python conventions doc, so they are described at the interface level. They mirror the PopHousing / Components of Change / Projections frontend triad.

### Module schema: `lib/visualization/moduleSchemas/housingStress.js`

The client-safe field catalog that plugs the module into the shared UI layer. It defines:

- `Year` as a temporal field.
- `Geographic Level`, `Location`, `Race/Ethnicity`, `Tenure` as dimension fields.
- Four measures: `Number Over 30%`, `Number Over 50%`, `Share Over 30%`, `Share Over 50%`, each with transforms: actual, numericChange, percentChange, indexed. (Presented in the UI as a burden-threshold selector 30%/50% × a basis selector Number/Share.)
- Subsets: "Counties" (58), "Regions" (9), "States" (50).
- Module-specific filter dimensions: `Race/Ethnicity` (9), `Tenure` (5). The sidebar renders these as additional filter controls when this module is active, with race-caveat tooltips for "Multiracial" (any-ethnicity two-or-more) and "Other" (some other race alone), and a note that county/region figures are PUMA-based approximations.
- Curated presets:
  - "Cost burden by race over time" (line, y=Share Over 30%, series=Race/Ethnicity, filters: one location, Tenure=Total)
  - "Rented vs. owned burden" (line, series=Tenure filtered to Rented/Owned, one location, one race)
  - "Overlay comparison" (line, additive trace selection mirroring legacy `new_plot` behavior)
  - "Two-period change" (bar, numericChange or percentChange between a start and end year across a location subset — mirrors legacy `visualize_bar`)
  - "Burden map" (choropleth, color=Share Over 30%, filters: one year, one race, Tenure=Total)

### Data-access layer: `lib/data/housing_stress.js`

Server-only module (uses `node:fs`). Pattern mirrors `lib/data/pop_housing.js`:

- `loadHousingStressData()`: read and parse the contract CSV once per server process; cache in memory.
- Query shapes: `queryLineSeries`, `queryCategoryValues`, `queryGeoValues`, `queryTwoPeriod`, delegating to `lib/data/query_shapes.js`.
- All filtering (by race, tenure, geographic level) happens here on the cached rows before shaping.
- Divide-by-zero shares arrive as null from the pipeline and are passed through as null (gaps in the chart), never coerced to 0.
- The numeric-column set and curated-metric list derive from `housingStress.js` (single source of truth).

### API route: `app/api/housing-stress/route.js`

Thin route that validates query params (using `lib/data/apiParams.js`), calls the data-access layer, and returns JSON. Accepts these parameters beyond the standard set:

- `raceEthnicity`: filter by race/ethnicity (or "All").
- `tenure`: filter by tenure (or "Total").
- `threshold`: 30 or 50 (selects the Over 30% / Over 50% measure family).
- `basis`: "number" or "share".
- `view`: the chart shape (line, category, twoPeriod, geoValues).

Register the module in `lib/visualization/moduleRegistry.js` alongside the existing modules.

---

## Test Plan

Tests mirror the source tree under `scripts/unit_tests/housing_stress/`, with the pipeline integration suite under `scripts/unit_tests/orchestrators/`.

### Config tests (~9 tests)
- `test_paths.py`: project root resolves, data/archive/crosswalk directories use expected segments, all values are Path objects, both crosswalk paths present.
- `test_sources.py`: required keys present, URL patterns template correctly on {year}/{tblid}, 9 table iterations present and ordered, earliest_year is 2012, 2020 in excluded_years, HTTPS + positive timeout.
- `test_schemas.py`: required keys present, 5 canonical tenures, 9 canonical race groups, tenure_formulas reference only valid E-columns and reproduce the legacy numerators/denominators, output columns match contract, White sourced from iteration H.

### Acquisition tests (~18 tests)
- `test_acs_sf_downloader.py`: get_acs_table joins data+geos on GEO_ID and filters by STUSAB; a 404 raises ACSTableUnavailableError; a malformed-but-present file raises ValueError (not ACSTableUnavailableError); download_all_iterations returns all 9 frames on success; a suppressed non-base iteration is recorded in missing_iterations and skipped; a missing base table raises.
- `test_source_fallback.py`: resolve_latest_vintage accepts the newest parseable year, steps back over an ACSTableUnavailableError, skips excluded 2020 without probing, raises on a parse error rather than masking it, and raises when nothing is found in the window; acquire_with_fallback prefers live, then manual, then saved rows, setting flags correctly.

### Cleaning tests (~28 tests)
- `test_column_normalization.py`: strip_table_prefix yields bare E-columns, raises on a missing/duplicated E-column; drop_margin_of_error_columns removes M-columns only; rename_geography_columns maps NAME/STUSAB.
- `test_cost_burden_measures.py`: each of the 5 tenures produces the legacy numerator/denominator (Total, Rented, Owned, Owned With/Without Mortgage); shares equal number/denominator; a zero denominator yields NA not inf; one input row expands to exactly 5 tenure rows; a missing formula column raises.
- `test_race_ethnicity_mapping.py`: RACE_ITERATION_MAP covers all 9 ids; reconcile_race_label maps every raw label, keeps "Other" and "All" distinct, raises on an unmapped label; canonical list returns 9; "White" traces to iteration H.

### Geography tests (~14 tests)
- `test_puma_aggregation.py`: extract_puma_id keeps only PUMA rows and parses the trailing 5 digits; aggregate_pumas_to_geography inner-joins the crosswalk (unmatched PUMAs drop), sums E-columns per geography, and a PUMA count equals the sum of its member rows; map_region_ids_to_names maps all 9 ids and raises on an unknown id.

### Aggregation tests (~16 tests)
- `test_geographic_levels.py`: build_state_rows yields exactly the 50 states (DC/PR excluded) with Location = USPS abbreviation and Geographic Level "State"; build_region_rows yields 9 regions; build_county_rows yields up to 58 counties tagged "County"; each level runs the shared measure and race transforms; build_all_levels concatenates and sorts; suppressed race iterations produce absent (not zero) strata.

### Merging tests (~10 tests)
- `test_historical_merge.py`: load_canonical_dataset returns an empty contract frame when the file is missing; combine_with_historical validates the incoming vintage before mutating, rejects an incomplete vintage, preserves non-overlapping historical years, atomically replaces an overlapping year without vintage mixing; detect_new_data ignores row order and returns True/False correctly.

### Validation tests (~14 tests)
- `test_housing_stress_validators.py`: validate_cleaning_output catches non-canonical tenure/race, negative numbers, and shares outside [0,1]; validate_stratification_completeness reports a missing race as a warning but a missing tenure as an error and never pools groups; validate_housing_stress_dataset catches missing levels, out-of-bounds row counts, a 2020 row, and duplicate keys.

### Output tests (~8 tests)
- `test_finalize_dataset.py`: prepare_output enforces column order and types; archive_and_save writes when data changed, skips when identical, and timestamps the archived file.

### Orchestrator tests (~9 tests)
- `test_housing_stress_pipeline.py`: full pipeline with mocked acquisition; phase-error wrapping tags the failing phase; source_failed flag when live acquisition fails; used_manual flag when the manual file is used; no write when no new data; resolved_year reflects the built vintage.

Total estimate: ~126 tests across 14 test files (13 under `scripts/unit_tests/housing_stress/` plus the orchestrator test file).

---

## Sequencing

The work is ordered so each step is independently testable and useful.

### Step 1: Configuration
Create `config/paths.py`, `sources.py`, `schemas.py`. Move the two PUMA crosswalks into `data/data-raw/housing-stress/`. Define paths, URL patterns, the 9 table iterations, tenure formulas, race reconciliation, and validation thresholds. Depends on: nothing.

### Step 2: Acquisition
Implement `acs_sf_downloader.py` and `source_fallback.py`, including the explicit vintage-resolution probe that distinguishes "not published" from "malformed." Write acquisition tests. Depends on: Step 1 + `scripts/shared/downloads/`.

### Step 3: Cleaning + Geography
Implement `column_normalization.py`, `cost_burden_measures.py`, `race_ethnicity_mapping.py`, and `puma_aggregation.py`. Write their tests against fixture frames. This collapses the triplicated legacy logic into one shared path. Depends on: Steps 1–2 + `scripts/shared/geography/california_geography.py`.

### Step 4: Geographic levels + Merge
Implement `geographic_levels.py` and `historical_merge.py`. Write aggregation and merge tests. At the end of this step the backend can build a full vintage and merge it with history. Depends on: Steps 1–3.

### Step 5: Validation + Output + Orchestrator
Implement `housing_stress_validators.py`, `finalize_dataset.py`, and `orchestrators/housing_stress_pipeline.py`. Write validation, output, and orchestrator tests. At the end, the pipeline runs as a single `build_housing_stress_dataset()` call with phase-tagged errors and conditional archival. Depends on: Steps 1–4.

### Step 6: Frontend schema + data-access layer + API route
Implement `lib/visualization/moduleSchemas/housingStress.js`, `lib/data/housing_stress.js`, and `app/api/housing-stress/route.js`. Register in `moduleRegistry.js`. Depends on: Step 5 (the contract CSV must exist); can be developed in parallel once the schema is agreed.

### Step 7: Presets and polish
Add the module-specific presets (burden-by-race, rented-vs-owned, two-period change, burden map) and the race/tenure sidebar controls with the approximation and race-universe caveats. Depends on: Step 6.

---

## Resolved Decisions

1. **County/region sourcing:** Preserve legacy PUMA aggregation via the 2020 crosswalks to keep published numbers stable. County and region figures are documented as approximations because PUMAs do not nest within county lines. A future move to ACS 5-year county tables is recorded in *Open Questions*, not adopted here.

2. **Race-set reconciliation:** Reconcile the 9 ACS iterations toward the canonical 7 projections groups where clean, and retain two module-specific categories — "Other" (some other race alone) and "All" (base table). "White" is sourced from iteration H (non-Hispanic) to avoid double-counting with Hispanic; iteration A is intentionally unused. Two caveats are surfaced to the frontend: ACS "Multiracial" is any-ethnicity two-or-more (vs projections' non-Hispanic), and "Other" has no projections counterpart and must never be folded into "Multiracial."

3. **"All" is a stored base row,** read from the un-suffixed `b25140` table, not summed from the race iterations (which overlap by design).

4. **Year coverage:** 2012 through the latest published ACS 1-year vintage, excluding 2020. Vintage resolution is explicit and logged; a parse failure raises rather than silently decrementing the year.

5. **Tenure renamed** from the legacy `Label` column to `Tenure`; the five values are unchanged. The data-access layer must account for the rename when reading any pre-migration archive.

6. **Save is a pipeline responsibility,** fully decoupled from chart rendering. Conditional archival writes only when the merged data differs from the saved file.

7. **Dataset filename:** `HousingStress_Current.csv` in `data/data-cleaned/housing-stress/`.

8. **Full frontend triad** (module schema, data-access layer, API route) is in scope, matching the age-sex-race-projections migration.

---

## Open Questions

1. **ACS 5-year county tables.** Should California counties eventually be sourced from ACS 5-year B25140 (direct `SUMLEV=050` tabulation) instead of PUMA aggregation? This would remove the PUMA-nesting approximation for counties but introduces a second dataset cadence (5-year vs 1-year) and would require a `Data Vintage` distinction in the contract and frontend. Deferred; PUMA aggregation ships first.

2. **Divide-by-zero share policy at the frontend.** The pipeline emits null for zero-denominator shares. Confirm the desired chart behavior (gap vs. dropped point vs. annotated) with the visualization team before finalizing the presets.

3. **Suppression reporting.** Should suppressed race×location strata be exposed to end users (e.g. a "data suppressed" annotation) or silently absent? Validation currently treats them as warnings; the frontend treatment is unspecified.
