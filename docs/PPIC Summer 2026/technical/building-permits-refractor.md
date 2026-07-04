---
Topic: tbd
Content Type: refractor plan
pinned: false
description: "Refactoring plan for migrating the legacy permits_code.py module into the V3 architecture established by the prior module refactors."
Date Published: June 30, 2026
Last Updated: 07/03/2026 - 06:20 PM
---

# Building Permits: Refactoring Plan

A plan for migrating the legacy `permits_code.py` module into the V3 architecture established by PopHousing, Components of Change, Age-Sex-Race Projections, and ACS Housing Stress.

---

## Implementation Status (2026-07-03)

The full backend (Steps 1–5), the shared-geography additions, and the frontend triad (Step 6) are **implemented and green** (967 Python tests pass; the JS data-access layer and API route are smoke-tested against the live dataset). The contract CSV has been generated: `data/data-cleaned/building-permits/BuildingPermits_Current.csv`, **197 months, 2010-01 → 2026-05, 14,691 rows**.

Several realities surfaced during implementation that refine (not contradict) the plan below; each is called out inline in the relevant section and summarized here:

1. **The Census only hosts a rolling ~2-year window of monthly `.xls` files.** As of 2026-07 the `cbsamonthly_*.xls` endpoint serves back to **2024-01** only; 2010–2023 return HTTP 404. The legacy PPIC tool *accumulated* history month-by-month since 2010, so a cold-start run cannot rebuild the deep history from the live source. Acquisition now **skips** not-published months (logged) instead of aborting, and final-dataset contiguity is checked across the *present* range rather than back to the aspirational 2010-01 floor.
2. **Deep history is seeded from the legacy accumulated snapshot.** The newest previous-tool export, `data/data-raw/building-permits/BuildingPermits_06-16-25.csv` (2010-01 → 2025-01, already contract-shaped), seeds 2010-01 … 2023-12; the live pipeline owns 2024-01 onward. Seeding runs through the module's own `prepare_output` → `validate_building_permits_dataset` → `archive_and_save`, so the result is validated like any pipeline output.
3. **The metro grain is "up to 26," not exactly 26.** Current BPS data carries **25** CA metropolitan CBSAs — **Madera** was de-delineated as a standalone MSA and no longer appears (older seeded months still carry it). Final validation therefore requires metros to be a *subset* of the canonical 26 (and flags any non-canonical name), rather than requiring all 26 every month. All 50 states are still required per month.
4. **CBSA display-name drift is absorbed by code-based renames.** The SF metro is now published as "San Francisco-Oakland-**Fremont**" (was "…-Berkeley"); Bakersfield as "Bakersfield-Delano"; Stockton as "Stockton-Lodi". The CBSA-*code* rename map (12540/41860/44700) pins these to canonical display names regardless of the Census label churn.
5. **`.xls` parsing needs `xlrd>=2.0.1`** (legacy Excel format); install it in the pipeline environment.
6. **Frontend monthly axis.** Building Permits is the first *monthly* module; the shared render layer is year-centric. The month-aware shaping (trailing-12 "year-to-date", index-to-100, two-period change, region aggregation, derived `2+ Units`/`Rest of US`) lives in `lib/data/building_permits.js`; the shared year-granular slider is a known integration limitation to smooth over in Step 7.

---

## Legacy Module Summary

The current module lives at `Visualization Tool/Building-Permits/permits_code.py`. It is a flat collection of functions with an unusually severe duplication problem: the full acquisition → clean → merge → derive → save → archive pipeline is copy-pasted **six times** — once in the "try" branch and once in the "except" fallback branch of each of the three `visualize_*` functions — and the two cleaners exist in four copies (once inside each `clean_and_scrape_*` closure and once as a standalone module function). Consolidating this repetition is the single largest structural win of the refactor.

The module measures **residential building permits**: monthly counts of authorized new housing units, split by structure size (1 unit, 2 units, 3–4 units, 5-or-more units, and their total), for California metropolitan areas and for all 50 US states.

### Data source

One external source feeds the module — the **U.S. Census Bureau Building Permits Survey (BPS)** monthly release, fetched as two `.xls` files per month:

- **CBSA monthly:** `https://www.census.gov/construction/bps/xls/cbsamonthly_{YYYYMM}.xls` — permits by Core-Based Statistical Area (metro/micro). The module keeps only California **metropolitan** CBSAs (drops micropolitan, `Metro /Micro Code == 5`).
- **State monthly:** `https://www.census.gov/construction/bps/xls/statemonthly_{YYYYMM}.xls` — permits by state. The module keeps the 50 states.

Data is published monthly with roughly a two-month lag. The saved series begins **2010-01**; the tool restricts user-selected start dates to **2011-01+**.

> **Availability caveat (discovered 2026-07-03):** the `cbsamonthly_*.xls` / `statemonthly_*.xls` endpoints only host a **rolling ~2-year window** of monthly files (as of 2026-07, back to 2024-01; earlier months 404). The full 2010-onward series is not rebuildable from the live source; it is **seeded once** from the legacy accumulated snapshot and maintained incrementally thereafter. See *Implementation Status* §1–2.

### Current function inventory

| Legacy function | Role |
|---|---|
| `clean_and_scrape_metro_permits()` → inner `clean_metro_permits` | Read the saved CSV to find the latest stored month, then walk months backward from "now," downloading each CBSA `.xls`, cleaning it, and appending until it reaches the last stored month. |
| `clean_and_scrape_state_permits()` → inner `clean_state_permits` | Same walk for the state monthly files. |
| `clean_metro_permits(df, year, month)` | Standalone duplicate of the metro cleaner: header re-seat, drop-all-NaN, split `Name` into Location/State, filter CA + metropolitan, numeric cast, CBSA-code renames, "per Hans" metro renames, stamp `Date`. |
| `clean_state_permits(df, year, month)` | Standalone duplicate of the state cleaner: drop-all-NaN, slice 6 columns, rename, filter to 50 states, numeric cast, stamp `Date`. |
| `combine_permits_with_historical(df)` | Read saved CSV, drop history rows whose `Date` overlaps the incoming frame, concat, sort, and detect change via `assert_frame_equal`. |
| `visualize_line(...)` | Multi-trace line chart with optional index-to-100 and 12-month rolling ("year-to-date") transforms; derives `Rest of US` and `2+ Units`; triggers archive/save as a side effect; carries a full duplicate of the pipeline in its `except` branch. |
| `visualize_bar(...)` | Two-period ("start" vs "end" month) numeric- or percent-change bar chart across a metro or state subset; archive/save side effect; duplicate fallback branch. |
| `visualize_map(...)` | Choropleth of two-period change; unions county geometries into metro shapes via a hard-coded `msa_mapping`, bins the values, and (a correctness hazard) **imputes random values into empty bins**; archive/save side effect; duplicate fallback branch. |

### Measure definition

Each row carries five raw structure-size counts taken directly from the BPS file, plus two values the legacy code derives at render time:

| Measure | Source |
|---|---|
| `Total`, `1 Unit`, `2 Units`, `3 and 4 Units`, `5 Units or More` | Raw BPS columns. |
| `2+ Units` | Derived: `2 Units + 3 and 4 Units + 5 Units or More`. |
| `Rest of US` (a *location*, not a measure) | Derived: sum of all state rows except California, per month. |

### Stratification dimensions

Location (California metros + 50 US states) × Date (monthly `YYYY-MM`) × Structure size (5 raw counts). There is **no** race, tenure, or age dimension — this is the simplest of the five modules on the measurement axis, and the most complex on the geography/duplication axis.

### Geography (legacy)

The legacy geography is bespoke: **26 California CBSA metros** carrying PPIC-specific display names, plus **50 US states**. The metro names diverge from Census labels via two inline dicts — a CBSA-code lookup (`12540 → Bakersfield`, etc.) and a "per Hans' request" rename map (`Riverside-San Bernardino-Ontario → Inland Empire`, `San Francisco-Oakland-Berkeley → San Francisco`, `Sacramento-Roseville-Folsom → Sacramento`, …). A stored `Geographic Level` column tags each row `State`, `Metro`, or `Other` via a copy-pasted `np.select`. The map view additionally unions whole counties into metro polygons via `msa_mapping`.

### Legacy fragilities carried forward

- **Six-fold pipeline duplication.** The acquire→clean→merge→derive→save→archive sequence is copy-pasted into the try and except branches of all three `visualize_*` functions; the two cleaners exist in four copies. Any fix must currently be applied in up to six places.
- **Bare `except:` in the scrape loops.** The month-decrement walk swallows *all* exceptions and silently steps back a month, so a transient parse error is indistinguishable from "this month isn't published yet." This can silently skip a real month or serve stale data.
- **`warnings.filterwarnings("ignore")`** hides pandas parse and divide-by-zero warnings (the percent-change math divides by a possibly-zero baseline).
- **Hard-coded `R:\UCF\...` Windows paths**, re-read many times (the historical CSV is loaded repeatedly, including once per `visualize_*` call and again inside the archive branch).
- **Positional column munging.** `df.columns = df.iloc[6]`, `df.iloc[:, 0:8]`, `df.iloc[:, 2:]` — a change to the BPS spreadsheet layout breaks cleaning silently.
- **Random-value bin imputation in the map.** `visualize_map` inserts `np.random.uniform(...)` rows into empty choropleth bins and appends `"No Data"` string rows. This fabricates data and must be dropped.
- **Save/archive is a side effect of visualization.** Data is only persisted when a user renders a chart, and the persistence logic is duplicated across all three renderers.
- **Derived values computed at render time.** `Rest of US`, `2+ Units`, index-to-100, and the 12-month rolling sum are all recomputed inline in each renderer.
- **No automated tests.**

### Legacy-to-target mapping

| Legacy element | Classification | Target home |
|---|---|---|
| `clean_and_scrape_metro/state_permits()` download walk | Worker | `building_permits/acquisition/census_bps_downloader.py` |
| month-decrement fallback loop | Inline glue | `building_permits/acquisition/source_fallback.py` |
| `clean_metro_permits()` (×2 copies) | Hybrid | `building_permits/cleaning/metro_permits_cleaner.py` |
| `clean_state_permits()` (×2 copies) | Hybrid | `building_permits/cleaning/state_permits_cleaner.py` |
| CBSA-code + "per Hans" rename dicts | Inline | config-driven maps in `cleaning/metro_permits_cleaner.py` |
| `msa_mapping` metro→county union + region grouping | Reference data | shared `california_geography.py` (`metro_to_county_mapping`, `metro_to_region_mapping`) |
| `Geographic Level` `np.select` tag (×3) | Inline | `building_permits/geography/geographic_levels.py` |
| `combine_permits_with_historical()` | Worker | `building_permits/merging/historical_merge.py` |
| `Rest of US` + `2+ Units` derivations | Inline | frontend data-access layer (derived) |
| index-to-100 / 12-month rolling / numeric-percent change | Renderer transforms | frontend shared transforms |
| archive/save side effect (×3 + ×3 fallback) | Inline | `building_permits/output/finalize_dataset.py` |
| `visualize_line/bar/map()` | Renderer | dropped (replaced by React frontend) |

---

## Unique Challenges

### 1. Six-fold pipeline duplication (the defining problem)

Unlike the other migrations, the core issue here is not algorithmic complexity but sheer repetition: the same acquire→clean→merge→save sequence appears six times, guarded by ad-hoc try/except fallbacks. The refactor collapses this into **one** orchestrator whose phases are individually testable, with fallback handled once in the acquisition layer rather than re-implemented per renderer.

### 2. CBSA metro grain is preserved and promoted to shared config (decided)

**Decision: keep the CBSA-metro grain as a stored geographic level, and lift the metro definitions into the shared geography config** so the pipeline, the frontend, and any future module reference one canonical source. The contract stores **State** and **Metro** rows at their native BPS grain; **Region** is produced as an *aggregate* (see §3), not stored. This preserves PPIC's historically-published 26 metro figures while still reconciling everything onto the shared geography framework.

The bespoke metro definitions that were previously trapped inside `permits_code.py` (the 26 metro display names, the `msa_mapping` metro→county composition, and the derived metro→region grouping) move into `scripts/shared/geography/california_geography.py` (backed by `lib/pophousing_config.py`), alongside the existing county/region reference data:

- `cbsa_metros` — the 26 canonical CA metro display names.
- `metro_to_county_mapping` — each metro → its whole member counties (the legacy `msa_mapping`).
- `metro_to_region_mapping` — each metro → its shared region, derived by composing `metro_to_county_mapping` with the existing `regions_mapping` (every CA CBSA is a union of whole counties nesting within one region).

Deriving metro→region is clean because every CA CBSA is a union of whole counties, each belonging to exactly one of the 9 shared regions:

| Shared region | Member metros |
|---|---|
| Far North | Chico, Redding, Yuba City |
| Bay Area | San Francisco, San Jose, Santa Rosa, Vallejo, Napa |
| San Diego (Regional) | San Diego, El Centro |
| Inland Empire | Inland Empire |
| Sacramento (Regional) | Sacramento |
| North San Joaquin Valley | Stockton, Modesto, Merced |
| South San Joaquin Valley | Bakersfield, Fresno, Hanford, Madera, Visalia |
| Central Coast | Salinas, San Luis Obispo, Santa Cruz, Santa Barbara |
| Los Angeles (Regional) | Los Angeles, Ventura |

### 3. Region aggregation is a frontend rendering option, not a stored level (decided)

Rather than pre-aggregating regions in the pipeline, the frontend offers a **subset toggle** — render by **Metro**, by **Region aggregate**, or by **State**. The Region view sums member metros on demand in the data-access layer using the shared `metro_to_region_mapping`. This keeps the stored dataset at its minimal native grain (consistent with the "derived values are not stored" principle) while giving users both the metro detail and the regional roll-up.

**Key limitation, documented, not hidden:** BPS publishes CA permits only at CBSA grain, and CA regions contain rural counties covered by **no** CBSA (Modoc, Alpine, Sierra, Trinity, and ~18 others — the legacy `missing_counties` list). A Region aggregate is therefore the sum of its *metropolitan* counties only and **under-counts** the region's true permits. The data-access layer exposes region-coverage metadata and the frontend carries a caveat tooltip.

### 4. County-level permits are not directly derivable (decided: defer)

Because a multi-county CBSA total (e.g. Los Angeles metro = Los Angeles + Orange; San Francisco metro = 5 counties) **cannot be split into its constituent counties** from the source, a genuine per-county permit series is not obtainable from the CBSA files. County is neither stored nor offered as an aggregate.

Two follow-ups are recorded rather than adopted here:
- The frontend map may still **broadcast** a metro/region value across its member-county polygons for display (as the legacy map did by unioning county shapes) — a rendering choice, not a stored county datum.
- Sourcing the Census **`countymonthly` / county-annual BPS files** directly would yield a true county grain. Recorded in *Open Questions*.

### 5. Month availability and the publication lag

BPS releases monthly with a ~2-month lag. The legacy code discovers the latest available month by trying `datetime.now()` and decrementing on *any* exception. The refactor replaces this bare-except probe with an explicit, logged availability check that distinguishes "not yet published" (HTTP 404 / missing file → step back) from "published but failed to parse" (→ raise, don't silently skip). Acquisition fetches only the months **between the last stored month and the latest available month**, not a blind 36-month sweep.

### 6. Derived values move out of the renderer

`Rest of US`, `2+ Units`, index-to-100, the 12-month rolling ("year-to-date") sum, and two-period numeric/percent change are all legacy render-time computations. In V3 the contract stores only the **five raw structure-size counts**; every derived value becomes a shared frontend transform or a data-access-layer derivation. This keeps the stored dataset minimal and the derivations single-sourced.

### 7. Save/archive decoupled from visualization

Legacy code writes the contract CSV only as a side effect of rendering, in six places. In V3 the pipeline is the sole writer: `building_permits_pipeline.py` acquires, cleans, aggregates, merges, validates, and conditionally archives/saves with no rendering involved. The React frontend only ever *reads* the contract CSV.

---

## Target Architecture

Following the established module pattern: config → acquisition → cleaning → geography → merging → validation → output → orchestrator, plus the three frontend deliverables.

```
scripts/
  building_permits/
    config/
      paths.py
      sources.py
      schemas.py
    acquisition/
      census_bps_downloader.py
      source_fallback.py
    cleaning/
      metro_permits_cleaner.py
      state_permits_cleaner.py
    geography/
      geographic_levels.py
    merging/
      historical_merge.py
    validation/
      building_permits_validators.py
    output/
      finalize_dataset.py
  orchestrators/
    building_permits_pipeline.py
  unit_tests/
    building_permits/
      config/
        test_paths.py
        test_sources.py
        test_schemas.py
      acquisition/
        test_census_bps_downloader.py
        test_source_fallback.py
      cleaning/
        test_metro_permits_cleaner.py
        test_state_permits_cleaner.py
      geography/
        test_geographic_levels.py
      merging/
        test_historical_merge.py
      validation/
        test_building_permits_validators.py
      output/
        test_finalize_dataset.py
    orchestrators/
      test_building_permits_pipeline.py

data/
  data-cleaned/building-permits/
    BuildingPermits_Current.csv
  archive/building-permits/

lib/
  data/building_permits.js
  visualization/moduleSchemas/buildingPermits.js

app/
  api/building-permits/route.js
```

Shared modules reused (not re-created): `scripts/shared/downloads/http_downloads.py`, `scripts/shared/validation/dataframe_validators.py`, `scripts/shared/data_cleaning/*`, `scripts/shared/archives/file_retention.py`, `scripts/shared/logging/*`.

**Shared config extended (new work in this module):** `scripts/shared/geography/california_geography.py` (and its backing `lib/pophousing_config.py`) gains the CBSA-metro reference data so the metro grain is owned centrally rather than by this module:

- `cbsa_metros` — the 26 canonical CA metro display names.
- `metro_to_county_mapping` — metro → whole member counties (the legacy `msa_mapping`).
- `metro_to_region_mapping` — metro → shared region, derived by composing the above with the existing `regions_mapping`; used by the frontend's region-aggregate view.

`get_california_geography()` returns these three additions alongside its existing `state_name`, `county_names`, `region_names`, and `regions_mapping` keys. A JS mirror is exposed to the frontend (see Frontend Deliverables).

---

## Data Contract

The pipeline's output is `data/data-cleaned/building-permits/BuildingPermits_Current.csv`.

### Grain

One row per `(Date, Geographic Level, Location)`.

### Columns

```
Geographic Level, Location, Date,
Total, 1 Unit, 2 Units, 3 and 4 Units, 5 Units or More
```

Where:

- `Geographic Level`: `State` or `Metro`.
- `Location`: for `State`, the state name (`California`, `Texas`, …, 50 states); for `Metro`, one of the 26 canonical CA metro display names (`Los Angeles`, `San Francisco`, `Inland Empire`, `Sacramento`, `Bakersfield`, …). California appears as a `State` row; its metros appear as `Metro` rows.
- `Date`: month as `YYYY-MM` (2010-01 onward).
- `Total`, `1 Unit`, `2 Units`, `3 and 4 Units`, `5 Units or More`: integer counts of authorized housing units. `Total` is the source total, not a recomputed sum.

### Derived / aggregated values (NOT stored)

`2+ Units`, `Rest of US`, index-to-100, 12-month rolling sums, two-period change, **and the 9-region aggregate** are all computed downstream (frontend transforms / data-access layer), never persisted. The region aggregate sums member metros on demand via the shared `metro_to_region_mapping` (see Unique Challenges §3).

### Geographic scope and coverage

- **State:** 50 US states, sourced directly from the state monthly file.
- **Metro:** 26 CA metropolitan CBSAs at native BPS grain, using the canonical display names in `california_geography.cbsa_metros`.
- **Region (frontend aggregate, not stored):** 9 CA regions, produced by summing member-metro rows in the data-access layer. **Region aggregates cover metropolitan counties only and under-count rural counties** — a documented methodological limitation surfaced in the frontend.
- **County:** not stored and not aggregated (see Unique Challenges §4).

The canonical metro list, metro→county composition, and metro→region grouping all come from `scripts/shared/geography/california_geography.py`.

### Date coverage

2010-01 through the latest published BPS month. The pipeline resolves the latest available month explicitly and never silently skips a month without logging it. Because the live source hosts only a rolling ~2-year window (see *Implementation Status* §1), 2010-01 … 2023-12 is **seeded** from the legacy accumulated snapshot and 2024-01 onward is pulled live; the two join contiguously. Contiguity is enforced across the present range, so a mid-series gap is still caught, but the series legitimately starts wherever the seed does rather than being forced back to 2010-01.

---

## Pipeline Phases and Function Definitions

Each section defines one pipeline phase: its purpose, the files it contains, and every function signature with its docstring. No implementations are provided.

---

### Phase 1: Configuration

Three config modules expose one `get_*()` function each, returning plain dicts. Large constant tables (rename maps, crosswalk-derived mappings) live in a root `lib/building_permits_config.py` if they grow; otherwise `schemas.py` inlines them.

#### `scripts/building_permits/config/paths.py`

```python
"""
paths.py — exposes Building Permits pipeline paths as pathlib objects.

Data sources:
    - lib/building_permits_config.py — project, data, archive, download, and log path settings

Outputs:
    - dict — named pathlib.Path values used throughout the pipeline

Usage:
    python scripts/building_permits/config/paths.py

Test Folders:
    - scripts/unit_tests/building_permits/config/
"""

from pathlib import Path


def get_paths():
    """Return configured pipeline paths (data-cleaned, archive, download cache, logs) as pathlib objects. Test file: scripts/unit_tests/building_permits/config/test_paths.py"""
```

#### `scripts/building_permits/config/sources.py`

```python
"""
sources.py — exposes Building Permits source URLs, request settings, and month-availability policy.

Data sources:
    - lib/building_permits_config.py — Census BPS URL patterns, month bounds, timeouts, cache ages

Outputs:
    - dict — source settings consumed by the acquisition phase

Usage:
    python scripts/building_permits/config/sources.py

Test Folders:
    - scripts/unit_tests/building_permits/config/
"""


def get_source_settings():
    """
    Return source-acquisition settings for the Census Building Permits Survey monthly files.

    Returns:
        dict with keys: cbsa_url_pattern, state_url_pattern (both templated on
        {yyyymm}), request_headers, timeout, cache_max_age_days, earliest_month
        ("2010-01"), max_month_lookback (how many months to probe backward for the
        latest published release), expected_metro_columns, expected_state_columns.

    Test file:
        scripts/unit_tests/building_permits/config/test_sources.py
    """
```

#### `scripts/building_permits/config/schemas.py`

```python
"""
schemas.py — exposes Building Permits column schemas, rename maps, and validation configs.

Data sources:
    - lib/building_permits_config.py — column names, metro rename maps, geographic-level rules, validation thresholds

Outputs:
    - dict — schema settings consumed by cleaning, geography, validation, and output phases

Usage:
    python scripts/building_permits/config/schemas.py

Test Folders:
    - scripts/unit_tests/building_permits/config/
"""


def get_schema_config():
    """
    Return schema configuration for the Building Permits pipeline.

    Returns:
        dict with keys: output_columns, required_columns, date_column,
        location_column, level_column,
        measure_columns (Total, 1 Unit, 2 Units, 3 and 4 Units, 5 Units or More),
        cbsa_code_renames — {CBSA code: display name} (the legacy location_dict),
        metro_display_renames — {Census metro name: PPIC display name}
            (the legacy "per Hans" location_dict2),
        state_names (50), micro_metro_code (the Metro /Micro Code value 5 to drop),
        geographic_levels ("State", "Metro"),
        completeness_group_columns (Geographic Level, Date),
        cleaning_validation_config, final_validation_config.

    Test file:
        scripts/unit_tests/building_permits/config/test_schemas.py
    """
```

---

### Phase 2: Data Acquisition

One downloader (two file families, same shape) plus a fallback coordinator that owns the month-availability probe. Replaces the two `clean_and_scrape_*` walks and their bare-except loops; uses `scripts/shared/downloads/http_downloads.py` for HTTP.

#### `scripts/building_permits/acquisition/census_bps_downloader.py`

```python
"""
census_bps_downloader.py — downloads Census BPS monthly CBSA and state .xls files.

Data sources:
    - Census BPS cbsamonthly_{yyyymm}.xls (permits by Core-Based Statistical Area)
    - Census BPS statemonthly_{yyyymm}.xls (permits by state)

Outputs:
    - pandas.DataFrame — one raw monthly spreadsheet, unmodified beyond parsing

Usage:
    Called by the building permits pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/acquisition/
"""

import pandas as pd


class BPSMonthUnavailableError(RuntimeError):
    """Raised when a requested month's file is not published (HTTP 404 / missing file). Distinct from a parse failure. Test file: scripts/unit_tests/building_permits/acquisition/test_census_bps_downloader.py"""


def download_cbsa_month(year, month, source_settings, headers, timeout):
    """
    Download one month's CBSA permits spreadsheet.

    Raises BPSMonthUnavailableError on a 404/missing file (so the caller can step
    the month back); raises ValueError on a file that downloads but fails to parse
    (so a real defect is not mistaken for "not published").

    Args:
        year: 4-digit year
        month: 1-12
        source_settings: dict from get_source_settings() (URL patterns, headers)
        headers: HTTP request headers
        timeout: request timeout in seconds

    Returns:
        pandas.DataFrame — the raw parsed CBSA spreadsheet.

    Raises:
        BPSMonthUnavailableError — the month is not published.
        ValueError — the file is present but malformed.

    Test file:
        scripts/unit_tests/building_permits/acquisition/test_census_bps_downloader.py
    """


def download_state_month(year, month, source_settings, headers, timeout):
    """
    Download one month's state permits spreadsheet. Mirrors download_cbsa_month.

    Args:
        year: 4-digit year
        month: 1-12
        source_settings: dict from get_source_settings()
        headers: HTTP request headers
        timeout: request timeout in seconds

    Returns:
        pandas.DataFrame — the raw parsed state spreadsheet.

    Raises:
        BPSMonthUnavailableError — the month is not published.
        ValueError — the file is present but malformed.

    Test file:
        scripts/unit_tests/building_permits/acquisition/test_census_bps_downloader.py
    """
```

#### `scripts/building_permits/acquisition/source_fallback.py`

```python
"""
source_fallback.py — resilient acquisition coordinator: resolves the month window and provides fallbacks.

Data sources:
    - census_bps_downloader.py — live BPS downloads
    - data/data-cleaned/building-permits/BuildingPermits_Current.csv — last-saved rows

Outputs:
    - list of (year, month) — the months to acquire
    - dict of raw monthly frames
    - bool flag — whether acquisition failed and fell back to last-saved data

Usage:
    Called by the building permits pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/acquisition/
"""

import pandas as pd


def resolve_latest_month(source_settings, headers, timeout, max_month_lookback):
    """
    Find the newest published BPS month by probing backward from the current month.

    Starts at the current calendar month and steps back up to max_month_lookback
    times, accepting the first month whose CBSA and state files both download and
    parse. Unlike the legacy bare-except walk, a parse failure raises rather than
    being treated as "not yet published"; only a BPSMonthUnavailableError advances
    the probe. Each skipped month is logged.

    Args:
        source_settings: dict from get_source_settings()
        headers: HTTP request headers
        timeout: request timeout in seconds
        max_month_lookback: maximum number of months to step backward

    Returns:
        tuple (year, month) — the latest available published month.

    Raises:
        BPSMonthUnavailableError — no published month found within the window.

    Test file:
        scripts/unit_tests/building_permits/acquisition/test_source_fallback.py
    """


def months_to_acquire(last_stored_month, latest_available_month, excluded_months=None):
    """
    Enumerate the months strictly after last_stored_month through latest_available_month.

    Replaces the legacy "decrement from now until the stored month" walk with an
    explicit forward enumeration, so no month is skipped and none is re-downloaded.

    Args:
        last_stored_month: "YYYY-MM" of the newest month already saved (or None if empty)
        latest_available_month: tuple (year, month) from resolve_latest_month
        excluded_months: optional set of "YYYY-MM" to skip

    Returns:
        list of (year, month) tuples in ascending order (possibly empty).

    Test file:
        scripts/unit_tests/building_permits/acquisition/test_source_fallback.py
    """


def acquire_months(months, download_cbsa_fn, download_state_fn, saved_rows_fn):
    """
    Download all requested months' CBSA and state frames, with a last-saved fallback.

    For each (year, month), downloads both files. If live acquisition fails entirely,
    falls back to the last-saved contract rows and flags source_failed.

    Args:
        months: list of (year, month) tuples from months_to_acquire
        download_cbsa_fn: callable(year, month) -> DataFrame
        download_state_fn: callable(year, month) -> DataFrame
        saved_rows_fn: callable returning the last-saved contract rows as a DataFrame

    Returns:
        tuple (cbsa_frames, state_frames, source_failed):
            cbsa_frames — dict {"YYYY-MM": DataFrame}
            state_frames — dict {"YYYY-MM": DataFrame}
            source_failed — True if live acquisition failed and saved rows were used

    Test file:
        scripts/unit_tests/building_permits/acquisition/test_source_fallback.py
    """
```

---

### Phase 3: Cleaning

Two cleaners replace the four legacy cleaner copies. Each consumes one raw monthly frame and emits tidy rows stamped with `Date`. All positional munging is replaced by named, validated transforms; the two rename maps come from config, not inline dicts.

#### `scripts/building_permits/cleaning/metro_permits_cleaner.py`

```python
"""
metro_permits_cleaner.py — cleans one raw CBSA monthly spreadsheet into tidy CA-metro rows.

Data sources:
    - Raw CBSA frame from census_bps_downloader.download_cbsa_month
    - Schema config — CBSA-code renames, metro display renames, micro code, measure columns

Outputs:
    - pandas.DataFrame — one row per CA metropolitan CBSA with Location, Date, and 5 measures

Usage:
    Called by the building permits pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/cleaning/
"""

import pandas as pd


def clean_metro_permits(df, year, month, schema_config):
    """
    Clean one raw CBSA spreadsheet into tidy California metropolitan permit rows.

    Reseats the header row, drops all-NaN rows/columns, splits the "Name" field into
    Location and State, keeps California metropolitan CBSAs (dropping micropolitan via
    the configured micro code), casts the 5 measures to int, applies the CBSA-code and
    display rename maps from config, and stamps Date = "YYYY-MM". Replaces the fragile
    positional slicing with named-column selection that raises if an expected column is
    absent (so a BPS layout change fails loudly instead of silently mis-slicing).

    Args:
        df: raw CBSA DataFrame from the downloader
        year: 4-digit year of this file
        month: 1-12 month of this file
        schema_config: dict from get_schema_config()

    Returns:
        pandas.DataFrame — columns: Location, Date, Total, 1 Unit, 2 Units,
        3 and 4 Units, 5 Units or More.

    Raises:
        ValueError — if an expected source column is missing after reseating.

    Test file:
        scripts/unit_tests/building_permits/cleaning/test_metro_permits_cleaner.py
    """
```

#### `scripts/building_permits/cleaning/state_permits_cleaner.py`

```python
"""
state_permits_cleaner.py — cleans one raw state monthly spreadsheet into tidy 50-state rows.

Data sources:
    - Raw state frame from census_bps_downloader.download_state_month
    - Schema config — state name list, measure columns

Outputs:
    - pandas.DataFrame — one row per state with Location, Date, and 5 measures

Usage:
    Called by the building permits pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/cleaning/
"""

import pandas as pd


def clean_state_permits(df, year, month, schema_config):
    """
    Clean one raw state spreadsheet into tidy 50-state permit rows.

    Drops all-NaN rows, selects and renames the 6 relevant columns, filters to the 50
    configured state names, casts the 5 measures to int, and stamps Date = "YYYY-MM".

    Args:
        df: raw state DataFrame from the downloader
        year: 4-digit year of this file
        month: 1-12 month of this file
        schema_config: dict from get_schema_config()

    Returns:
        pandas.DataFrame — columns: Location, Date, Total, 1 Unit, 2 Units,
        3 and 4 Units, 5 Units or More.

    Raises:
        ValueError — if an expected source column is missing.

    Test file:
        scripts/unit_tests/building_permits/cleaning/test_state_permits_cleaner.py
    """
```

---

### Phase 4: Geographic Levels

One module tags the two stored levels and validates metro names against the shared config. Region aggregation is **not** performed here — it is a frontend rendering option (see Unique Challenges §3 and Frontend Deliverables). The metro→county / metro→region reference data lives in `california_geography.py`; this module only consumes the metro name set to validate. It owns the `Geographic Level` tag that the legacy code copy-pasted as an `np.select` in three places.

#### `scripts/building_permits/geography/geographic_levels.py`

```python
"""
geographic_levels.py — validates CA metro names against shared config and tags geographic level.

Data sources:
    - Cleaned CA-metro rows from metro_permits_cleaner
    - Cleaned 50-state rows from state_permits_cleaner
    - scripts/shared/geography/california_geography.py — canonical cbsa_metros set

Outputs:
    - pandas.DataFrame — level-tagged State/Metro contract rows

Usage:
    Called by the building permits pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/geography/
"""

import pandas as pd


def validate_metro_names(metro_df, geography):
    """
    Confirm every cleaned metro Location is one of the canonical shared metro names.

    Guards against a BPS label change or a rename-map miss silently introducing an
    unknown metro. Raises if any Location is not in california_geography's cbsa_metros.

    Args:
        metro_df: cleaned CA-metro rows (Location = metro display name)
        geography: dict from california_geography.get_california_geography()

    Returns:
        pandas.DataFrame — metro_df unchanged (validated pass-through).

    Raises:
        ValueError — if a metro Location is not a canonical shared metro name.

    Test file:
        scripts/unit_tests/building_permits/geography/test_geographic_levels.py
    """


def tag_geographic_levels(state_df, metro_df):
    """
    Concatenate state and metro frames with a Geographic Level column.

    Replaces the three copy-pasted np.select blocks. State rows are tagged "State",
    metro rows "Metro". Returns the combined frame sorted by
    Geographic Level, Location, Date.

    Args:
        state_df: cleaned 50-state rows
        metro_df: validated CA-metro rows

    Returns:
        pandas.DataFrame — combined, level-tagged, sorted contract-shaped rows.

    Test file:
        scripts/unit_tests/building_permits/geography/test_geographic_levels.py
    """
```

---

### Phase 5: Merging

Mirrors the Components of Change / Projections `historical_merge.py` pattern. Replacement is atomic at `Date` grain: an incoming month fully replaces any overlapping stored month; rows from different scrapes never partially mix within a month.

#### `scripts/building_permits/merging/historical_merge.py`

```python
"""
historical_merge.py — combines freshly built months with historical rows and detects new data.

Data sources:
    - data/data-cleaned/building-permits/BuildingPermits_Current.csv — saved canonical data
    - Freshly built contract frame from geographic_levels.tag_geographic_levels

Outputs:
    - pandas.DataFrame — merged dataset
    - bool — whether new data was detected

Usage:
    Called by the building permits pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/merging/
"""

import pandas as pd


def load_canonical_dataset(current_data_path):
    """
    Read the existing contract CSV, or return an empty contract-shaped frame if absent.

    Args:
        current_data_path: pathlib.Path to BuildingPermits_Current.csv

    Returns:
        pandas.DataFrame — the saved dataset, or an empty frame with contract columns.

    Test file:
        scripts/unit_tests/building_permits/merging/test_historical_merge.py
    """


def latest_stored_month(historical_df, date_column):
    """
    Return the newest "YYYY-MM" present in the saved dataset, or None if empty.

    Used by acquisition to decide which months to fetch.

    Args:
        historical_df: pandas.DataFrame — the saved dataset
        date_column: name of the Date column

    Returns:
        str "YYYY-MM" or None.

    Test file:
        scripts/unit_tests/building_permits/merging/test_historical_merge.py
    """


def combine_with_historical(new_df, historical_df, date_column):
    """
    Atomically merge freshly built months with historical rows.

    Drops every historical row whose Date appears in new_df and appends the incoming
    rows whole, preserving non-overlapping historical months. Never performs
    key-level upserts, so a month is always fully one scrape's data. Sorts the result.

    Args:
        new_df: pandas.DataFrame — freshly built rows for the acquired months
        historical_df: pandas.DataFrame — all historical rows
        date_column: name of the Date column for overlap detection

    Returns:
        pandas.DataFrame — merged dataset, sorted by Date, Geographic Level, Location.

    Test file:
        scripts/unit_tests/building_permits/merging/test_historical_merge.py
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
        scripts/unit_tests/building_permits/merging/test_historical_merge.py
    """
```

---

### Phase 6: Validation and Output

#### `scripts/building_permits/validation/building_permits_validators.py`

```python
"""
building_permits_validators.py — validates Building Permits data at the cleaning and final stages.

Data sources:
    - pandas.DataFrame — the dataset to validate
    - Schema config — expected value sets and thresholds

Outputs:
    - tuple of (is_valid, messages) — structured validation results

Usage:
    Called by geography, historical_merge, and the orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/validation/
"""

import pandas as pd


def validate_cleaning_output(df, schema_config):
    """
    Validate a cleaned monthly frame before aggregation/merging.

    Checks: required columns present; Date matches YYYY-MM; no nulls in key columns;
    measures non-negative integers; Location values within the expected set for the
    frame's scope (states or metros). Composes shared validators from
    scripts/shared/validation/.

    Args:
        df: pandas.DataFrame — output of a cleaner
        schema_config: dict from get_schema_config()

    Returns:
        tuple of (is_valid, messages).

    Test file:
        scripts/unit_tests/building_permits/validation/test_building_permits_validators.py
    """


def validate_building_permits_dataset(df, validation_config):
    """
    Validate the final merged dataset before writing.

    Checks: row count within bounds; both geographic levels present; 50 states and up
    to 26 metros present per month within coverage; Date range contiguous monthly from
    the earliest expected month; measures non-negative; no duplicate
    (Date, Geographic Level, Location) keys.

    Region-coverage reporting (the rural-county under-count) is not checked here because
    regions are a frontend aggregate, not a stored level; that caveat lives in the
    data-access layer and frontend.

    Args:
        df: pandas.DataFrame — the fully merged dataset
        validation_config: dict with keys: required_columns, expected_levels,
            expected_states, expected_metros, earliest_month, min_rows, max_rows,
            duplicate_key_columns

    Returns:
        tuple of (is_valid, messages).

    Test file:
        scripts/unit_tests/building_permits/validation/test_building_permits_validators.py
    """
```

#### `scripts/building_permits/output/finalize_dataset.py`

```python
"""
finalize_dataset.py — orders columns, casts types, and performs conditional archival for the contract CSV.

Data sources:
    - pandas.DataFrame — the validated dataset ready for output
    - data/data-cleaned/building-permits/BuildingPermits_Current.csv — existing output for comparison

Outputs:
    - data/data-cleaned/building-permits/BuildingPermits_Current.csv — updated canonical dataset
    - data/archive/building-permits/BuildingPermits_{TIMESTAMP}.csv — archived prior output (when data changed)

Usage:
    Called by the building permits pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/building_permits/output/
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
        scripts/unit_tests/building_permits/output/test_finalize_dataset.py
    """


def archive_and_save(df, current_path, archive_directory):
    """
    Save only when the data changed; archive the prior version with an mm-dd-yy timestamp.

    If the existing CSV is content-identical to what would be written, no file is
    touched. Otherwise the existing file is copied to archive_directory with a
    timestamp and the new data overwrites current_path. Replaces the legacy pattern
    where saving was a side effect of chart rendering (in six places).

    Args:
        df: pandas.DataFrame — the finalized dataset
        current_path: pathlib.Path — contract CSV path
        archive_directory: pathlib.Path — where to copy the old version

    Returns:
        pathlib.Path or None — the output path if written, None if skipped.

    Test file:
        scripts/unit_tests/building_permits/output/test_finalize_dataset.py
    """
```

---

### Orchestrator

#### `scripts/orchestrators/building_permits_pipeline.py`

```python
"""
building_permits_pipeline.py — orchestrates acquisition, cleaning, geographic tagging, merging, validation, and output of Building Permits data.

Data sources:
    - Census BPS monthly CBSA and state .xls files via the downloader
    - data/data-cleaned/building-permits/BuildingPermits_Current.csv — saved canonical fallback and historical source
    - scripts/shared/geography/california_geography.py — canonical CBSA metro names and metro→region reference

Outputs:
    - pandas.DataFrame — merged Building Permits dataset
    - data/data-cleaned/building-permits/BuildingPermits_Current.csv — updated when new data is detected
    - dict — dataset, change flag, fallback flag, acquired months, output path, and row count

Usage:
    python scripts/orchestrators/building_permits_pipeline.py

Test Folders:
    - scripts/unit_tests/orchestrators/
    - scripts/unit_tests/building_permits/
"""

from typing import NoReturn

import pandas as pd

from scripts.building_permits.acquisition.census_bps_downloader import (
    download_cbsa_month,
    download_state_month,
)
from scripts.building_permits.acquisition.source_fallback import (
    acquire_months,
    months_to_acquire,
    resolve_latest_month,
)
from scripts.building_permits.cleaning.metro_permits_cleaner import clean_metro_permits
from scripts.building_permits.cleaning.state_permits_cleaner import clean_state_permits
from scripts.building_permits.config.paths import get_paths
from scripts.building_permits.config.schemas import get_schema_config
from scripts.building_permits.config.sources import get_source_settings
from scripts.building_permits.geography.geographic_levels import (
    tag_geographic_levels,
    validate_metro_names,
)
from scripts.building_permits.merging.historical_merge import (
    combine_with_historical,
    detect_new_data,
    latest_stored_month,
    load_canonical_dataset,
)
from scripts.building_permits.output.finalize_dataset import archive_and_save, prepare_output
from scripts.building_permits.validation.building_permits_validators import (
    validate_building_permits_dataset,
)
from scripts.shared.geography.california_geography import get_california_geography


class BuildingPermitsPipelinePhaseError(RuntimeError):
    """Report failure of a named Building Permits pipeline phase. Test file: scripts/unit_tests/orchestrators/test_building_permits_pipeline.py"""


def _raise_phase_error(phase_name, error) -> NoReturn:
    """Wrap an exception with its pipeline phase. Test file: scripts/unit_tests/orchestrators/test_building_permits_pipeline.py"""


def build_building_permits_dataset(config=None):
    """
    Build the Building Permits dataset and save only when source data changed.

    Runs five phases, wrapping each so any exception re-raises as a
    BuildingPermitsPipelinePhaseError tagged with the phase name:

    Phase 1 - Setup & Load: resolve config and geography; load the existing canonical
              CSV and determine the latest stored month.
    Phase 2 - Acquisition: resolve the latest published BPS month, enumerate the months
              after the last stored one, and download each month's CBSA and state files,
              with a last-saved fallback.
    Phase 3 - Clean & Tag: clean each monthly CBSA and state frame, validate metro names
              against the shared config, and tag Geographic Level across State/Metro.
    Phase 4 - Merge: atomically replace any overlapping stored month and detect change.
    Phase 5 - Finalize & Save: validate the final dataset; archive and write only when
              new data was detected.

    Args:
        config: dict or None - override config for testing. When None, loads from
            get_paths(), get_source_settings(), get_schema_config(),
            get_california_geography().

    Returns:
        dict with keys:
            dataset - pandas.DataFrame of the final dataset
            new_data - bool, whether new data was detected
            source_failed - bool, whether acquisition fell back to saved rows
            acquired_months - list of "YYYY-MM" that were fetched
            output_path - pathlib.Path or None (None if no write occurred)
            row_count - int

    Test file:
        scripts/unit_tests/orchestrators/test_building_permits_pipeline.py
    """


if __name__ == "__main__":
    result = build_building_permits_dataset()
    print(f"  Acquired months: {result['acquired_months']}")
    print(f"  Rows: {result['row_count']}")
    if result["output_path"]:
        print(f"  Written to: {result['output_path']}")
    else:
        print("  No new data detected; file unchanged.")
```

---

## Frontend Deliverables

These are JavaScript files and are not governed by the Python conventions doc, so they are described at the interface level. They mirror the PopHousing / Components of Change / Projections / Housing Stress frontend triad.

### Module schema: `lib/visualization/moduleSchemas/buildingPermits.js`

The client-safe field catalog that plugs the module into the shared UI layer. It defines:

- `Date` as a temporal field (monthly).
- `Geographic Level`, `Location` as dimension fields.
- Measures: `Total`, `1 Unit`, `2 Units`, `3 and 4 Units`, `5 Units or More`, plus the **derived** `2+ Units` (`2 Units + 3 and 4 Units + 5 Units or More`), each with transforms: actual, numericChange, percentChange, indexed, **trailing-12-month sum** (the legacy "aggregated"/year-to-date view).
- A derived `Rest of US` location (sum of all non-California states per month), computed in the data-access layer.
- **Subset toggle: "Metros" (26 CA CBSAs), "Regions" (9 CA region aggregates), "States" (50).** Choosing "Regions" renders the metro rows aggregated up to the 9 shared regions on demand — the primary new option requested for this migration.
- A region-coverage caveat tooltip shown whenever the "Regions" subset is active: region totals reflect metropolitan counties only and under-count rural counties.
- Curated presets:
  - "Permits over time" (line, y=Total, series=Location, monthly)
  - "Region overview" (line, subset=Regions, y=Total, series=Region — the region-aggregate view)
  - "Overlay comparison" (line, additive multi-series selection across any subset, mirroring legacy `visualize_line`)
  - "Indexed to 100" (line, indexed transform from a chosen baseline month)
  - "Year-to-date" (line, trailing-12-month rolling sum)
  - "Two-period change" (bar, numericChange or percentChange between a start and end month across a subset — mirrors legacy `visualize_bar`)
  - "Change map" (choropleth over metros or region aggregates, color=two-period change — mirrors legacy `visualize_map`, **without** the random-bin imputation)

### Data-access layer: `lib/data/building_permits.js`

Server-only module (uses `node:fs`). Pattern mirrors `lib/data/pop_housing.js`:

- `loadBuildingPermitsData()`: read and parse the contract CSV once per server process; cache in memory.
- Derives `2+ Units` and the `Rest of US` location on the cached rows.
- **`aggregateToRegions(rows)`: sums the 26 metro rows into the 9 region aggregates per month**, using a JS mirror of the shared `metro_to_region_mapping` (kept in `lib/geography/californiaGeography.js` so the Python and JS grouping never drift). Invoked when the request's subset is "Regions".
- Query shapes: `queryLineSeries`, `queryTwoPeriod`, `queryGeoValues`, delegating to `lib/data/query_shapes.js`; each accepts the resolved subset (Metros / Regions / States) and applies the region aggregation before shaping.
- Percent-change against a zero baseline arrives as null and is passed through as null (gap in the chart), never coerced to 0 or infinity — closing the legacy divide-by-zero hole.
- The numeric-column set and curated-metric list derive from `buildingPermits.js` (single source of truth).

### API route: `app/api/building-permits/route.js`

Thin route that validates query params (using `lib/data/apiParams.js`), calls the data-access layer, and returns JSON. Accepts these parameters beyond the standard set:

- `permitType`: `Total`, `1 Unit`, `2 Units`, `3 and 4 Units`, `5 Units or More`, or `2+ Units`.
- `subset`: `Metros`, `Regions` (metro rows aggregated to the 9 shared regions), or `States`.
- `aggregated`: boolean (trailing-12-month rolling sum).
- `indexed`: boolean (index to 100 from the start month).
- `view`: the chart shape (line, twoPeriod, geoValues).

Register the module in `lib/visualization/moduleRegistry.js` alongside the existing modules.

---

## Test Plan

Tests mirror the source tree under `scripts/unit_tests/building_permits/`, with the pipeline integration suite under `scripts/unit_tests/orchestrators/`.

### Config tests (~9 tests)
- `test_paths.py`: project root resolves, data/archive/crosswalk directories use expected segments, all values are Path objects, crosswalk path present.
- `test_sources.py`: required keys present, URL patterns template correctly on {yyyymm}, earliest_month is 2010-01, HTTPS + positive timeout, positive lookback.
- `test_schemas.py`: required keys present, 5 measure columns, 50 state names, both rename maps present and non-overlapping, micro code = 5, output columns match contract.

### Acquisition tests (~16 tests)
- `test_census_bps_downloader.py`: download_cbsa_month / download_state_month parse a fixture .xls; a 404 raises BPSMonthUnavailableError; a malformed-but-present file raises ValueError (not BPSMonthUnavailableError).
- `test_source_fallback.py`: resolve_latest_month accepts the newest parseable month, steps back over a BPSMonthUnavailableError, raises on a parse error rather than masking it, and raises when nothing is found in the window; months_to_acquire enumerates the correct forward window (empty when up to date, correct across a year boundary); acquire_months prefers live and flags source_failed on fallback.

### Cleaning tests (~22 tests)
- `test_metro_permits_cleaner.py`: header reseat + all-NaN drop; Name splits into Location/State; keeps CA metropolitan CBSAs and drops micropolitan (code 5); CBSA-code and display renames applied (e.g. Riverside-San Bernardino-Ontario → Inland Empire); measures cast to int; Date stamped; a missing expected column raises ValueError.
- `test_state_permits_cleaner.py`: 6-column select + rename; filters to exactly the 50 states; measures cast to int; Date stamped; a missing column raises.

### Geography tests (~10 tests)
- `test_geographic_levels.py`: validate_metro_names passes canonical metros and raises on an unknown metro; tag_geographic_levels concatenates state + metro rows, tags State/Metro, and sorts by Geographic Level, Location, Date.

### Shared geography additions (~8 tests, under `scripts/unit_tests/shared/geography/`)
- Extend `test_california_geography.py`: `get_california_geography()` returns `cbsa_metros` (26), `metro_to_county_mapping`, and `metro_to_region_mapping`; every metro maps to exactly one region; the metro→region derivation matches composing metro→county with region→county (e.g. Bay Area = SF + San Jose + Santa Rosa + Vallejo + Napa); no metro's counties span two regions.

### Merging tests (~10 tests)
- `test_historical_merge.py`: load_canonical_dataset returns an empty contract frame when the file is missing; latest_stored_month returns the newest month or None; combine_with_historical atomically replaces an overlapping month without mixing, preserves non-overlapping months, and sorts; detect_new_data ignores row order and returns True/False correctly.

### Validation tests (~10 tests)
- `test_building_permits_validators.py`: validate_cleaning_output catches bad Date format, negative measures, and out-of-scope locations; validate_building_permits_dataset catches a missing level, out-of-bounds row counts, duplicate (Date, Level, Location) keys, and a non-contiguous month.

### Output tests (~8 tests)
- `test_finalize_dataset.py`: prepare_output enforces column order and types; archive_and_save writes when data changed, skips when identical, and timestamps the archived file.

### Orchestrator tests (~9 tests)
- `test_building_permits_pipeline.py`: full pipeline with mocked acquisition; phase-error wrapping tags the failing phase; source_failed flag when live acquisition fails; no write when no new data; acquired_months reflects the fetched window; State and Metro levels both present in the final frame.

Total estimate: ~95 tests across 12 test files (11 under `scripts/unit_tests/building_permits/` plus the orchestrator test file), plus ~8 added to the shared `test_california_geography.py`.

---

## Sequencing

The work is ordered so each step is independently testable and useful. **Status (2026-07-03): Steps 1–6 complete; Step 7 (presets + caveat polish) remaining.** The monthly-axis shaping that would otherwise depend on the shared year-based transforms lives in `lib/data/building_permits.js`, and a JS geography mirror lives at `lib/geography/californiaGeography.js`.

### Step 1: Configuration + shared geography ✅
Create `config/paths.py`, `sources.py`, `schemas.py`. **Add the CBSA-metro grain to the shared config:** put `cbsa_metros`, `metro_to_county_mapping` (the legacy `msa_mapping`), and the derived `metro_to_region_mapping` into `scripts/shared/geography/california_geography.py` (backed by `lib/pophousing_config.py`), and extend its unit tests. Define paths, URL patterns, the two rename maps, the state list, and validation thresholds. Depends on: nothing.

### Step 2: Acquisition ✅
Implement `census_bps_downloader.py` and `source_fallback.py`, including the explicit month-resolution probe that distinguishes "not published" from "malformed" and the forward month enumeration. Write acquisition tests. Depends on: Step 1 + `scripts/shared/downloads/`.

### Step 3: Cleaning ✅
Implement `metro_permits_cleaner.py` and `state_permits_cleaner.py`, replacing the four legacy cleaner copies and all positional munging with named, validated transforms. Write cleaning tests against fixture spreadsheets. Depends on: Steps 1–2.

### Step 4: Geographic levels + Merge ✅
Implement `geographic_levels.py` (validate metro names against shared config + tag State/Metro) and `historical_merge.py`. Write geography and merge tests. At the end of this step the backend can build a full month and merge it with history. Depends on: Steps 1–3.

### Step 5: Validation + Output + Orchestrator ✅
Implement `building_permits_validators.py`, `finalize_dataset.py`, and `orchestrators/building_permits_pipeline.py`. Write validation, output, and orchestrator tests. At the end, the pipeline runs as a single `build_building_permits_dataset()` call with phase-tagged errors and conditional archival. Depends on: Steps 1–4.

### Step 6: Frontend schema + data-access layer + API route ✅
Implement `lib/visualization/moduleSchemas/buildingPermits.js`, `lib/data/building_permits.js`, and `app/api/building-permits/route.js`. Add the JS mirror of the shared metro→region grouping (`lib/geography/californiaGeography.js`) and the `aggregateToRegions` data-access helper so the **Metros / Regions / States** subset toggle works. Register in `moduleRegistry.js`. Depends on: Step 5 (the contract CSV must exist); can be developed in parallel once the schema is agreed.

### Step 7: Presets and polish ⏳ (remaining)
Add the module-specific presets (region overview, overlay, indexed, year-to-date, two-period change, change map) and the region-coverage caveat tooltip that appears when the Regions subset is active. Depends on: Step 6.

---

## Resolved Decisions

1. **CBSA metro grain preserved and stored.** The 26 CA metros are stored at native BPS grain as the `Metro` geographic level, alongside the 50 `State` rows. The metro definitions (`cbsa_metros`, `metro_to_county_mapping`, `metro_to_region_mapping`) are lifted out of `permits_code.py` into the **shared** `california_geography.py` so the grain is owned centrally and reusable.

2. **Region is a frontend aggregate, not a stored level.** The 9 shared regions are produced by the data-access layer summing member metros on demand (via the shared `metro_to_region_mapping`), and exposed through a **Metros / Regions / States** subset toggle. The stored dataset stays at its minimal native grain.

3. **Region aggregates are metropolitan-coverage approximations.** CA regions include rural counties covered by no CBSA, so region aggregates under-count. This is surfaced as a frontend caveat tooltip when the Regions subset is active — not silently hidden.

4. **County level is neither stored nor aggregated.** BPS cannot disaggregate a multi-county CBSA into individual counties, so a genuine county series is unavailable from this source. The frontend map may broadcast metro/region values across county polygons for display only.

5. **Month coverage:** 2010-01 through the latest published BPS month. Month resolution is explicit and logged; a parse failure raises rather than silently decrementing the month.

6. **Derived values are not stored.** `2+ Units`, `Rest of US`, index-to-100, the trailing-12-month sum, and two-period change are all frontend/data-access derivations, single-sourced there rather than recomputed in each renderer.

7. **Save is a pipeline responsibility,** fully decoupled from chart rendering (the legacy side effect appeared in six places). Conditional archival writes only when the merged data differs from the saved file.

8. **Random-bin imputation is removed.** The legacy map's `np.random.uniform` empty-bin fill and `"No Data"` string rows are dropped entirely; empty choropleth bins render as empty.

9. **Dataset filename:** `BuildingPermits_Current.csv` in `data/data-cleaned/building-permits/`.

10. **Full frontend triad** (module schema, data-access layer, API route) is in scope, matching the age-sex-race-projections and housing-stress migrations.

---

## Open Questions

1. **True county-level permits.** Should CA counties eventually be sourced from the Census **`countymonthly` / county-annual BPS files** directly, giving a real county grain instead of a metro-broadcast display? This would add a genuine County level but introduces a third file family and its own coverage quirks. Deferred.

2. **Metro display names vs. current Census labels.** The stored metro names follow PPIC's "per Hans" conventions (`Inland Empire`, `San Francisco` for the SF-Oakland CBSA, etc.). Confirm these remain the canonical display names in the shared config, or whether any should be reconciled toward current Census CBSA titles.

3. **Percent-change zero-baseline policy at the frontend.** The data-access layer emits null for zero-baseline percent change. Confirm the desired chart behavior (gap vs. dropped point vs. annotated) with the visualization team before finalizing presets — the legacy code produced `inf` and dropped those locations with a printed note.

4. **Micropolitan areas.** The legacy tool drops micropolitan CBSAs (`Metro /Micro Code == 5`). Confirm micropolitan permits should remain excluded, or whether their whole counties should contribute to the region aggregates (which would improve rural coverage).

5. **History preservation given the rolling source window (new, 2026-07-03).** The live `cbsamonthly/statemonthly` endpoints only expose ~2 years; the deep 2010–2023 history now lives *only* in `BuildingPermits_Current.csv` (seeded from the legacy snapshot) and its archives. Two things to decide: (a) treat the seeded `Current.csv` as the durable system of record and never re-derive pre-2024 (current behavior), and (b) whether to also pull the Census **annual** BPS files (or the `place`/`county` archives) to reconstruct or cross-check deep history independently of the legacy PPIC export. Until then, losing `Current.csv` means losing pre-2024 unless the seed file is retained.

6. **Monthly axis in the shared UI (new, 2026-07-03).** The shared sidebar/slider and `query_shapes.js` are year-integer based; Building Permits is monthly. The data-access layer carries its own month-aware shaping, but Step 7 must decide how the shared slider exposes a monthly range (month picker vs. year slider that expands to Jan–Dec vs. generalizing `query_shapes`/the temporal control to a configurable granularity).
