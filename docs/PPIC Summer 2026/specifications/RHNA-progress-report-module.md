---
Topic: Technical
Content Type: module specification
pinned: false
description: "Technical build specification for the RHNA Progress Report module"
Date Published: July 15, 2026
Last Updated: 07/15/2026
Status: Updating
Footnote: Document generated and updated by Claude Opus 4.8 on command. Outlined and verified by Trinity Jones.
---

# RHNA Progress Report Module Specification

> [!info] What this document is
> A forward-looking build spec for a **new** V3 module (there is no legacy predecessor to migrate). It follows the same shape as the other module refactor guides: a non-technical overview first (what the module produces, its source, its data contract), then a per-phase, per-function programmer reference with docstrings but no implementations, then the frontend deliverables, test plan, sequencing, resolved decisions, and open questions. The field catalog and grain below were verified against the live CKAN resources and both data dictionaries on 2026-07-15.

---

## Module Summary

The module publishes a single canonical dataset tracking each California jurisdiction's progress against its **Regional Housing Needs Allocation (RHNA)** - how many housing units have been permitted versus how many the state requires, split by the four income tiers (Very Low, Low, Moderate, Above Moderate).

- **Source:** [data.ca.gov RHNA Progress Report](https://data.ca.gov/dataset/rhna-progress-report), a CKAN package (id `ff082e96-72f7-4443-9747-8b8dadc15671`) published by the California Dept. of Housing and Community Development (HCD). Data is the sum of units reported on jurisdictions' annual progress reports (APR Tables A and A3 for 2013-2017, Table A2 from 2018 on).
- **Access:** the **CKAN API** (`package_show`), not HTML scraping. Each cycle is a separate CSV resource; each has a companion DOCX data dictionary. Resources redirect (HTTP 302) to signed S3 URLs, so the downloader must follow redirects.
- **Cadence:** HCD refreshes the CSVs **biweekly**, overwriting them in place. The files carry **no internal time axis** - each is a single cumulative snapshot of progress-to-date. Temporal history therefore exists only if we capture it, which drives the snapshot-versioning design below.
- **Coverage:** 539 jurisdictions (cities and counties) per cycle; two cycles live today (5th and 6th).
- **Geography:** jurisdictions are cities and counties (counties carry a `COUNTY` suffix). There is **no region or COG column in the source**; region is assigned by mapping each jurisdiction to its county and rolling that county up into one of the **9 shared PPIC regions**.

### What a "cycle" is

A **cycle** is an ~8-year RHNA planning period. Each jurisdiction has its **own** start and end dates within a cycle (COGs stagger adoption), carried in the source `Planning Period` field as a per-row date range (e.g. Alameda 5th = `01/31/2015 - 01/31/2023`, Angels Camp 5th = `06/30/2014 - 06/30/2019`). A new cycle appears in the package as a new `Nth Cycle RHNA Progress Report` resource; the module **enumerates resources dynamically** so a future 7th cycle is picked up without a code change. The 6th cycle file adds a `6th Cycle Started` boolean marking whether a jurisdiction has actually entered the current cycle yet.

---

## Data Contract

**Grain:** `(Jurisdiction, Cycle, Snapshot Date, Income Level)` - the dataset is **tidy/long on income level** (matching the Housing Stress house style), so each jurisdiction-cycle-snapshot contributes **five rows**: one per income tier (`Very Low`, `Low`, `Moderate`, `Above Moderate`) plus a summed `Total` row. This keeps the per-tier pace/status metrics first-class instead of ballooning into ~24 wide columns. Because the source overwrites a cumulative snapshot on each refresh, we stamp every pull with the resource's `last_modified` as `Snapshot Date` and accumulate them, turning the overwrite stream into a real time series. `Most Recent` flags the latest snapshot per `(Jurisdiction, Cycle)` for the default "current state" views.

**Canonical output** (`RHNAProgress_Current.csv`). The columns split into **income-level fields** (vary row to row within a jurisdiction-snapshot) and **jurisdiction-level fields** (identical across that jurisdiction's five rows).

*Income-level fields (one row each for Very Low, Low, Moderate, Above Moderate, Total):*

| Column | Type | Notes / lineage |
|---|---|---|
| `Income Level` | text | `Very Low` / `Low` / `Moderate` / `Above Moderate` / `Total`. Part of the grain. |
| `Units` | Int64 | Units completed at this level. Source `VLI/LI/MOD/ABOVE MOD UNITS`; `Total` = their sum (HCD "Total units completed"). |
| `RHNA` | Int64 | Allocation (target) at this level. Source `RHNA VLI/LI/MOD/ABOVE MOD`; `Total` = their sum (HCD "RHNA goal"). |
| `Percent` | Float64 | `Units / RHNA` (source-provided for tiers, so we validate rather than recompute; `Total` = HCD "Percent of goal"). Null when `RHNA` is 0 (the source `Infinity` / Excel `#DIV/0!` sentinel). |
| `Projected Units` | Float64 | Pace projection `Units / min(Percent Elapsed, 1.0)`. The **clamp** means a closed period projects to its actual built count, never below it. Null when `Percent Elapsed` is 0/NaN. |
| `On Track Score` | Float64 | `Projected Units / RHNA` (= `Percent / min(Percent Elapsed, 1.0)`). `>= 1.0` = on pace to meet this level's allocation; converges to `Percent` once the period closes. Null when `RHNA` or `Percent Elapsed` is 0. |
| `Status` | text | Per-level bucket from the four-quadrant rule (see callout): `Met`, `Behind`, `On Track`, `Nearly On Track`, `Somewhat Off Track`, `Far Off Track`, or `No Allocation`. |

*Jurisdiction-level fields (repeated across the five rows):*

| Column | Type | Notes / lineage |
|---|---|---|
| `Jurisdiction` | text | Standardized city/county name. Source `JURISDICTION` (539 values). |
| `Geographic Level` | text | `City` or `County`; derived (a `COUNTY` name suffix marks a county). **A `County` row is the unincorporated portion of that county only** (its incorporated cities are separate jurisdictions), per HCD's own "Type" note - so a whole county = its `County` row plus its city rows. |
| `County` | text | County the jurisdiction sits in; for county rows, itself. Joined via the jurisdiction crosswalk. |
| `Region` | text | One of the 9 shared PPIC regions; derived `County` to region via `california_geography`. |
| `Cycle` | int | `5`, `6`, ...; derived from the resource/filename, not a source column. |
| `Planning Period` | text | Per-jurisdiction date range string. Source `PLANNING PERIOD`. |
| `Planning Period Start` | date | Parsed left side of the range. |
| `Planning Period End` | date | Parsed right side of the range. |
| `Cycle Started` | bool | Source `6th Cycle Started`; `True` for cycles that omit the field (5th defaults `True`). |
| `Snapshot Date` | date | Resource `last_modified` at capture; part of the grain. |
| `Most Recent` | bool | `True` for the latest `Snapshot Date` within each `(Jurisdiction, Cycle)`. |
| `Total Days` | Int64 | `Planning Period End - Planning Period Start` in days. |
| `Elapsed Days` | Int64 | `Snapshot Date - Planning Period Start` in days (the snapshot is the "as of" date). |
| `Percent Elapsed` | Float64 | `Elapsed Days / Total Days`; kept at its true value for display (may exceed 1.0 for an ended period); the pace formulas use `min(Percent Elapsed, 1.0)`. |
| `Tiers Met` | Int64 | Count of the four tiers where `Units >= RHNA` (a tier win, timing aside). |
| `Tiers With Goal` | Int64 | Count of the four tiers where `RHNA > 0` (the denominator for `Tiers Met` and `Overall Progress`). |
| `Overall Progress` | Float64 | **Non-compensatory** roll-up: the capped average `mean over tiers-with-a-goal of min(Units / RHNA, 1.0)`. Overbuilding one tier cannot offset a shortfall in another. Distinct from the `Total` row's `Percent` (which is compensatory). |
| `Overall On Track Score` | Float64 | Pace-adjusted sibling of `Overall Progress`: `mean over tiers-with-a-goal of min(On Track Score_tier, 1.0)`. Used to bucket `Overall Category` fairly mid-cycle. |
| `Overall Category` | text | Jurisdiction-wide status from the four-quadrant rule applied to the tier set: `Met` (every tier with a goal reached it), `Behind` (deadline passed, not all met), else the pace bucket of `Overall On Track Score`, or `No Allocation`. |
| `Source Last Updated` | datetime | Package/resource `metadata_modified` at capture (provenance). |

> [!warning] Source quirks the cleaner must handle
> - **`Infinity` / `#DIV/0!` sentinel.** The dictionaries define `Infinity` (the CSV) / `#DIV/0!` (the worksheet) as the `Percent` placeholder when the `RHNA` denominator is 0. Coerce these strings to null before the float cast, or the parse fails.
> - **Percentages are pre-computed** in the source, so cleaning validates the tier `Percent` against `Units / RHNA` rather than recomputing; only the `Total` row and the pace/overall metrics are derived.
> - **Percentages exceed 1.0** routinely (a jurisdiction can overshoot one tier's allocation), which is expected - and is exactly why `Overall Progress` caps each tier at 100% before averaging.
> - **`Planning Period` varies row-by-row** within a cycle; it is descriptive per-jurisdiction metadata, not a cycle-level constant. `Cycle` (from the filename) is the stable key. A range that fails to parse is **quarantined** (dropped to a side file and logged), not written with null dates.

> [!note] The pace analytics are PPIC's headline framing
> Everything from `Projected Units` through `Overall Category` reproduces (and extends) the analysis PPIC already runs on this data by hand (verified against a supervisor worksheet, 2026-07-15). The pipeline computes it **once** in enrichment so the formulas have a single owner, not a spreadsheet or client-side JS. Because the "as of" date is each row's own `Snapshot Date` (the newest snapshot approximates "today"), the versioned snapshots yield a **time series** of every score. Two deliberately different "overall" reads are both stored for transparency: the `Total` row is **compensatory** (raw sums, overbuild counts - the supervisor's original headline), while `Overall Progress` / `Overall Category` are **non-compensatory** (each tier capped at its goal before aggregating), plus `Tiers Met` as the plainest "N of 4 income levels met" readout.

> [!note] The four-quadrant `Status` rule (per tier and overall)
> Reaching a goal is a terminal win regardless of timing, so the terminal label wins even mid-cycle:
> ```
> if RHNA == 0:                              "No Allocation"
> elif Units >= RHNA:                        "Met"          # reached the goal, any time
> elif Snapshot Date > Planning Period End:  "Behind"       # deadline passed, not met
> else:                                      pace bucket of On Track Score
>        # On Track >= 1.0 | Nearly 0.70-0.99 | Somewhat Off 0.50-0.69 | Far Off < 0.50
> ```
> Closed periods never touch the pace formula, so a jurisdiction that met its allocation late reads `Met`, not a shrunken pace score. `Overall Category` applies the same rule at the jurisdiction level ("every tier met" -> `Met`; deadline passed and not all met -> `Behind`; otherwise the pace bucket of `Overall On Track Score`).

**Immutable seed:** `RHNAProgress_Historical.csv` holds any snapshots captured before the module went live (initially, the first pull), read-only to the pipeline and unioned in during merge - mirroring the other modules' historical-seed pattern so a bad `Current` write cannot poison the accumulated series.

---

## Unique Challenges

1. **Overwrite-in-place source, no internal history.** The single hardest design point. The source hands us a moving cumulative snapshot; a naive "download and replace" throws away every prior state. We solve it by snapshot-versioning on `Snapshot Date` with content-aware change detection so unchanged biweekly pulls do not duplicate rows.
2. **Region is not in the data.** RHNA is allocated by COGs, but the shared geography knows counties to 9 PPIC regions. We assign region by jurisdiction to county to region, using a **committed city to county crosswalk seeded from the DoF E-5 hierarchy** (the same source PopHousing already downloads) for the ~480 city jurisdictions (counties self-map by suffix).
3. **DOCX dictionaries, not codebooks.** The field contract lives in `.docx`. Acquisition must fetch and store them; validation parses them to confirm the live columns still match what the dictionary declares.
4. **Signed-S3 redirects.** CKAN download URLs 302 to time-limited S3 links; the downloader must follow redirects (a plain non-following GET returns the redirect HTML, not the CSV).
5. **Two column shapes.** The 6th-cycle file has an extra `6th Cycle Started` column. Cleaning normalizes both to one schema, defaulting the flag where absent.

---

## Target Architecture

```
scripts/rhna_progress/
  config/
    paths.py              # get_paths()   - canonical, seed, raw, archive, codebook, details paths
    schemas.py            # get_schema_config() - output/required cols, dtypes, income tiers, validation configs
    sources.py            # get_source_config() - CKAN package id, resource-name pattern, endpoints, retry/window
  acquisition/
    ckan_downloader.py    # enumerate + fetch changed cycle CSVs, DOCX dictionaries, package metadata
    source_fallback.py    # live -> manual raw CSV -> last-saved snapshot ladder
  cleaning/
    column_normalization.py   # rename to canonical schema, standardize jurisdiction names, parse Planning Period (quarantine bad ranges)
    income_measures.py        # Infinity/#DIV-0 handling, Int64/Float64 coercion, tier column typing
    reshape_income_levels.py  # append the Total row, then melt the four tiers + Total into long Income Level rows
  geography/
    jurisdiction_crosswalk.py # jurisdiction -> county -> region using the committed crosswalk + california_geography
    geographic_levels.py      # classify City vs County; assign Region/County
  enrichment/
    pace_metrics.py       # per-row Total/Elapsed Days, Percent Elapsed, Projected Units, On Track Score, Status (clamped, four-quadrant)
    overall_progress.py   # jurisdiction-level Tiers Met, Overall Progress (capped avg), Overall On Track Score, Overall Category; set Most Recent
  merging/
    historical_merge.py   # load canonical + seed, union snapshots, dedupe on grain, detect_new_data
  validation/
    rhna_progress_validators.py  # cleaning + final validators; dictionary-vs-live column check
  output/
    finalize_dataset.py   # column order, atomic write, conditional save

scripts/orchestrators/rhna_progress_pipeline.py   # build_rhna_progress_dataset(config=None)

data/data-raw/RHNA-progress-report/        rhna_progress_5.csv, rhna_progress_6.csv, RHNAProgress_Downloaded.csv (manual), jurisdiction_county_crosswalk.csv (committed; seeded from DoF E-5)
data/data-cleaned/RHNA-progress-report/    RHNAProgress_Current.csv, RHNAProgress_Historical.csv (seed)
data/archive/RHNA-progress-report/         retention copies
data/details/RHNAInfo.json                 module metadata (coverage, cadence, granularity, last refresh)
docs/Codebooks/RHNA-progress-report/       5th/6th DOCX data dictionaries
```

V3 conventions this module follows: three-layer config as `get_*()` dicts; `scripts/shared/` for cross-module code (downloads, `geography/california_geography.py`, validation, logging, atomic writes); the orchestrator wraps each phase so any exception re-raises as a `RHNAProgressPipelinePhaseError` tagged with the phase; writes are conditional (only on a genuinely new snapshot); every function docstring ends with its `Test file:` path.

---

## Pipeline Phases

The entry point is `scripts/orchestrators/rhna_progress_pipeline.py`. `build_rhna_progress_dataset(config=None)` runs five phases, each wrapped so any exception re-raises as a `RHNAProgressPipelinePhaseError` tagged with the phase name. It returns a summary dict: dataframe, `new_snapshot` / `source_failed` / `used_manual` flags, the list of `acquired_cycles`, output path (`None` when nothing changed), and row count.

| # | Phase | Responsibility | Key modules |
|---|---|---|---|
| **1** | Setup & Load | Resolve paths/config/geography; load the existing canonical CSV as the change-detection base plus the immutable seed; read CKAN package metadata. | `config/*`, `merging/historical_merge` |
| **2** | Acquisition | Enumerate cycle resources; download only those whose `last_modified` is newer than the latest stored `Snapshot Date`; refresh DOCX dictionaries and `RHNAInfo.json`; degrade via the fallback ladder. | `acquisition/*` |
| **3** | Cleaning | Normalize both column shapes, standardize jurisdiction names, parse `Planning Period` (quarantine bad ranges), coerce types, handle `Infinity`/`#DIV/0!`, append the `Total` row and reshape to the long income-level grain, stamp `Cycle` / `Snapshot Date` / `Source Last Updated`. | `cleaning/*` |
| **4** | Enrichment & Merge | Classify `Geographic Level`, join county/region, derive time + per-level pace metrics + `Status`, derive `Tiers Met` / `Overall Progress` / `Overall Category`, set `Most Recent`; union with seed + prior snapshots and dedupe on grain. | `geography/*`, `enrichment/*`, `merging/*` |
| **5** | Validation & Finalize | Validate against the cleaning + final configs and the dictionary column contract; order columns; atomically write only if a new snapshot landed; archive per retention; log. | `validation/*`, `output/*` |

### `config/`

```python
def get_paths():
    """Return RHNA Progress pipeline paths as pathlib objects (canonical, immutable seed, raw
    download dir, manual-fallback CSV, jurisdiction crosswalk, archive, codebook, details, logs).
    Test file: scripts/unit_tests/rhna_progress/config/test_paths.py"""

def get_schema_config():
    """Return the output column order, required columns, per-column dtypes, the income-level values
    (Very Low / Low / Moderate / Above Moderate / Total) and their source-column mapping, the grain
    keys (Jurisdiction, Cycle, Snapshot Date, Income Level), the Status/On Track thresholds
    (>=1.0 / 0.70 / 0.50) and label wording, and the cleaning/final validation configs.
    Test file: scripts/unit_tests/rhna_progress/config/test_schemas.py"""

def get_source_config():
    """Return the CKAN package id, the API base URL, the resource-name regex that identifies a
    'Nth Cycle RHNA Progress Report' CSV and its cycle integer, the dictionary-resource pattern,
    request retry/timeout settings, and the User-Agent.
    Test file: scripts/unit_tests/rhna_progress/config/test_sources.py"""
```

### `acquisition/`

```python
def fetch_package_metadata(source_config):
    """Call CKAN package_show and return the resource inventory (name, format, url, last_modified)
    plus the package metadata_modified. Retries on transient HTTP failure; raises on a hard failure
    so acquisition can fall back.
    Test file: scripts/unit_tests/rhna_progress/acquisition/test_ckan_downloader.py"""

def enumerate_cycle_resources(resources, source_config):
    """Match CSV resources against the cycle name pattern and return an ordered list of
    (cycle_int, resource) - future cycles included automatically.
    Test file: scripts/unit_tests/rhna_progress/acquisition/test_ckan_downloader.py"""

def download_changed_cycles(cycle_resources, latest_snapshot_by_cycle, paths):
    """For each cycle whose resource last_modified is newer than the latest stored Snapshot Date,
    follow the 302 to S3 and download the CSV to the raw dir; skip unchanged cycles. Returns the
    downloaded (cycle, path, last_modified) records.
    Test file: scripts/unit_tests/rhna_progress/acquisition/test_ckan_downloader.py"""

def refresh_codebooks_and_details(resources, package_meta, paths):
    """Download the current DOCX dictionaries to docs/Codebooks and write/update
    data/details/RHNAInfo.json (coverage, cadence, granularity, last module refresh).
    Test file: scripts/unit_tests/rhna_progress/acquisition/test_ckan_downloader.py"""

def acquire_with_fallback(source_config, paths, latest_snapshot_by_cycle):
    """Try the live CKAN path; on failure fall back to a manually placed raw CSV
    (RHNAProgress_Downloaded.csv), then to the snapshots already saved in the canonical CSV.
    Records which path was taken via source_failed / used_manual flags.
    Test file: scripts/unit_tests/rhna_progress/acquisition/test_source_fallback.py"""
```

### `cleaning/`

```python
def normalize_columns(raw_df, cycle, schema_config):
    """Rename the source columns (either the 14-col 5th-cycle or 15-col 6th-cycle shape) to the
    canonical schema, default Cycle Started where absent, and attach the Cycle integer. Raise
    ValueError on an unexpected column set (names the expected vs found columns).
    Test file: scripts/unit_tests/rhna_progress/cleaning/test_column_normalization.py"""

def standardize_jurisdiction_names(df, geography):
    """Single canonical place-name pass: uppercase-normalize, trim, and reconcile jurisdiction
    names against the crosswalk keys so cities and counties join cleanly downstream.
    Test file: scripts/unit_tests/rhna_progress/cleaning/test_column_normalization.py"""

def parse_planning_period(df):
    """Split the 'mm/dd/yyyy - mm/dd/yyyy' range into Planning Period Start / End dates, leaving
    the original string intact. Rows whose range fails to parse are quarantined (returned in a
    separate frame written to a side file and logged), not emitted with null dates.
    Test file: scripts/unit_tests/rhna_progress/cleaning/test_column_normalization.py"""

def coerce_income_measures(df, schema_config):
    """Replace the 'Infinity' / '#DIV/0!' sentinels with null in the four % columns, cast Units/RHNA
    columns to Int64 and % columns to Float64. Never raises on a single bad cell (coerce + log).
    Test file: scripts/unit_tests/rhna_progress/cleaning/test_income_measures.py"""

def reshape_to_income_levels(wide_df, schema_config):
    """Append the summed Total row (Units/RHNA = tier sums, Percent = Total/goal) then melt the four
    tiers + Total into the long (Income Level, Units, RHNA, Percent) grain, one row per level.
    Test file: scripts/unit_tests/rhna_progress/cleaning/test_reshape_income_levels.py"""

def stamp_provenance(df, snapshot_date, source_last_updated):
    """Attach Snapshot Date (resource last_modified) and Source Last Updated (package
    metadata_modified) to every row of a cleaned cycle frame.
    Test file: scripts/unit_tests/rhna_progress/cleaning/test_income_measures.py"""
```

### `geography/`

```python
def load_jurisdiction_crosswalk(paths):
    """Read the committed jurisdiction -> county crosswalk CSV (seeded from the DoF E-5 hierarchy by
    the one-time builder). Raise with an actionable 'crosswalk missing' message on cold start rather
    than silently dropping region.
    Test file: scripts/unit_tests/rhna_progress/geography/test_jurisdiction_crosswalk.py"""

def build_jurisdiction_crosswalk(rhna_names, e5_hierarchy, name_mappings):
    """One-time (Phase 0-style) builder, run manually. Join RHNA's 539 jurisdiction names against the
    DoF E-5 city-under-county hierarchy (reconciled via the shared CITY_NAME_MAPPINGS), report any
    unmatched names for review, and write the committed jurisdiction_county_crosswalk.csv. Not on the
    per-run path; re-run when a new city incorporates or a new cycle's names appear.
    Test file: scripts/unit_tests/rhna_progress/geography/test_jurisdiction_crosswalk.py"""

def classify_geographic_level(df):
    """Assign Geographic Level = County when the name carries a COUNTY suffix, else City.
    Test file: scripts/unit_tests/rhna_progress/geography/test_geographic_levels.py"""

def assign_county_and_region(df, crosswalk, geography):
    """Join each jurisdiction to its County (self for county rows) and roll County up into one of
    the 9 shared PPIC regions via california_geography. Fail loud on an unmapped jurisdiction so a
    new incorporation is caught, not silently regionless.
    Test file: scripts/unit_tests/rhna_progress/geography/test_geographic_levels.py"""
```

### `enrichment/`

```python
def derive_time_elapsed(df):
    """Jurisdiction-level time fields, computed once and broadcast to all five income-level rows:
    Total Days (End - Start), Elapsed Days (Snapshot Date - Start), Percent Elapsed (kept at its
    true value, may exceed 1.0).
    Test file: scripts/unit_tests/rhna_progress/enrichment/test_pace_metrics.py"""

def derive_pace_metrics(df, schema_config):
    """Single owner of PPIC's per-level pace analysis, applied to every income-level row (tiers and
    Total). Projected Units = Units / min(Percent Elapsed, 1.0) (the clamp stops a closed period
    from projecting below actual); On Track Score = Projected Units / RHNA; Status via the
    four-quadrant rule (No Allocation if RHNA == 0; Met if Units >= RHNA; Behind if the deadline has
    passed; else the pace bucket of On Track Score using the schema_config thresholds). Null-safe:
    a zero/NaN denominator yields null Projected/Score, never a raise.
    Test file: scripts/unit_tests/rhna_progress/enrichment/test_pace_metrics.py"""

def derive_overall_progress(df, schema_config):
    """Jurisdiction-level roll-ups from the four tier rows, broadcast to all rows. Tiers With Goal
    (RHNA > 0) and Tiers Met (Units >= RHNA); Overall Progress = mean over tiers-with-a-goal of
    min(Units / RHNA, 1.0) (non-compensatory completion); Overall On Track Score = the same capped
    mean of the tier On Track Scores (pace-adjusted); Overall Category via the four-quadrant rule
    ('Met' when every tier with a goal is met, 'Behind' past the deadline, else the pace bucket of
    Overall On Track Score, 'No Allocation' when Tiers With Goal == 0).
    Test file: scripts/unit_tests/rhna_progress/enrichment/test_overall_progress.py"""

def mark_most_recent(df):
    """Set Most Recent = True on all rows sharing the maximum Snapshot Date within each
    (Jurisdiction, Cycle); False otherwise.
    Test file: scripts/unit_tests/rhna_progress/enrichment/test_overall_progress.py"""
```

### `merging/`

```python
def load_canonical_dataset(paths):
    """Return the existing canonical CSV (empty frame + loud UserWarning when absent, so a cold
    start proceeds on live data).
    Test file: scripts/unit_tests/rhna_progress/merging/test_historical_merge.py"""

def load_historical_seed(paths):
    """Read the immutable RHNAProgress_Historical.csv seed of pre-live snapshots (empty when absent).
    Test file: scripts/unit_tests/rhna_progress/merging/test_historical_merge.py"""

def combine_snapshots(existing, seed, new_snapshots):
    """Union the seed, the previously saved snapshots, and the newly captured ones; de-duplicate on
    (Jurisdiction, Cycle, Snapshot Date, Income Level), preferring the freshest capture; re-derive
    Most Recent.
    Test file: scripts/unit_tests/rhna_progress/merging/test_historical_merge.py"""

def detect_new_snapshot(existing, combined, grain_keys):
    """Order/index-insensitive comparison that returns True only when combined introduces a new
    (Jurisdiction, Cycle, Snapshot Date, Income Level) row or a changed measure, gating the
    conditional write.
    Test file: scripts/unit_tests/rhna_progress/merging/test_historical_merge.py"""
```

### `validation/`

```python
def validate_dictionary_columns(raw_columns, cycle, codebook_path):
    """Parse the cycle's DOCX dictionary and confirm the live CSV's columns match the declared
    Field Names; block-hard on a missing/renamed field, warn-soft on an extra one.
    Test file: scripts/unit_tests/rhna_progress/validation/test_rhna_progress_validators.py"""

def validate_cleaned(df, schema_config):
    """Wired cleaning-stage gate: required columns present, dtypes correct, no null grain keys,
    exactly the five Income Level values per (Jurisdiction, Cycle, Snapshot Date), Units/RHNA
    non-negative, tier Percent within tolerance of Units/RHNA where RHNA > 0.
    Test file: scripts/unit_tests/rhna_progress/validation/test_rhna_progress_validators.py"""

def validate_final(df, schema_config):
    """Final gate before write: grain uniqueness on (Jurisdiction, Cycle, Snapshot Date, Income
    Level); Total row Units/RHNA equal the tier sums; every Most Recent group has one value per
    (Jurisdiction, Cycle); Region in the 9 shared regions; each Status/Overall Category consistent
    with its score and the four-quadrant rule; Tiers Met <= Tiers With Goal.
    Test file: scripts/unit_tests/rhna_progress/validation/test_rhna_progress_validators.py"""
```

### `output/`

```python
def finalize_dataset(df, schema_config):
    """Order columns to the canonical schema and return the frame ready to persist.
    Test file: scripts/unit_tests/rhna_progress/output/test_finalize_dataset.py"""

def write_dataset(df, paths, new_snapshot):
    """Atomically write RHNAProgress_Current.csv (staged .tmp + os.replace) only when new_snapshot
    is True; refresh the archive per retention. Returns the output path or None.
    Test file: scripts/unit_tests/rhna_progress/output/test_finalize_dataset.py"""
```

### orchestrator

```python
def build_rhna_progress_dataset(config=None, logger=None):
    """Run the five phases, each wrapped as a RHNAProgressPipelinePhaseError. Return a summary dict
    {dataframe, new_snapshot, source_failed, used_manual, acquired_cycles, output_path, row_count}.
    Test file: scripts/unit_tests/rhna_progress/test_orchestrator.py"""
```

---

## Frontend Deliverables

1. **Module schema** - `lib/visualization/moduleSchemas/rhnaProgress.js`, mirroring `housingStress.js`: the client-safe single source of truth for the field catalog, curated metric list, subsets, canonical columns, and stratification filters. Temporal field = `Snapshot Date`; dimensions = `Location` (Jurisdiction), `Geographic Level`, `Region`, `Cycle`, `Income Level` (a real long dimension: Very Low / Low / Moderate / Above Moderate / Total), `Status`, and `Overall Category`; measures = `Units`, `RHNA`, `Percent`, and the pace family (`Projected Units`, `On Track Score`, plus the jurisdiction-level `Overall Progress`, `Overall On Track Score`, `Tiers Met`, `Percent Elapsed`), with `On Track Score` the curated headline metric. Register it in `lib/visualization/moduleRegistry.js` and `categoryRegistry.js`.
2. **Data-access layer** - `lib/data/rhna_progress.js` (server-only), loading `RHNAProgress_Current.csv`, defaulting to `Most Recent == true` and the **latest cycle per jurisdiction** (`Cycle Started == true`, highest `Cycle`) unless a trend-over-time (`Snapshot Date`) or historical-cycle view is requested. Pin one `Income Level` per request (default `Total`), the same way Housing Stress pins race/tenure.
3. **API route** - `app/api/rhna-progress/route.js`, following the other modules' route shape.
4. **Home dashboard** - a "California Regional Housing Needs Allocation" section with (a) a best/worst jurisdictions table ranked by `On Track Score` at the `Total` level, showing `Overall Category`, `Tiers Met` (e.g. "2 of 4"), and `Overall Progress` alongside so the compensatory and non-compensatory reads sit together; and (b) a **diverging bar chart** of `On Track Score` grouped by Region, centered on 1.0 (on-pace), with an `Income Level` selector so a viewer can see the Very Low / Low tiers where jurisdictions most often fall short. Color `Status` / `Overall Category` consistently (Met, On Track, Nearly, Somewhat Off, Far Off, Behind, No Allocation). Load the dataviz skill for palette and mark rules before building.

---

## Test Plan

Mirror-test each module file (the project convention is one test file per source file, named in each docstring). Target coverage: config (3 files), acquisition (2), cleaning (3: normalization + income measures + reshape), geography (2), enrichment (2: pace metrics + overall progress), merging (1), validation (1), output (1), orchestrator (1). Emphasis cases: dynamic enumeration picks up a synthetic 7th cycle; `Infinity`/`#DIV/0!` coercion; the two column shapes normalize identically; reshape yields exactly five income-level rows with a `Total` = tier sums; malformed `Planning Period` quarantined (not written with null dates); snapshot dedupe on unchanged pulls (no new row); `Most Recent` uniqueness; unmapped-jurisdiction fail-loud; cold-start (no canonical, no seed); dictionary-vs-live column drift. **Pace + status:** `On Track Score` against a worked example; `Status` across all four quadrants (No Allocation, Met before and after deadline, Behind, each pace bucket); boundary values at 0.50/0.70/1.00; the ended-period clamp (a closed tier projects to actual, not below); `Overall Progress` capped average and `Tiers Met` on a mixed jurisdiction (overbuilt one tier, short another); null-safety when `RHNA` or `Percent Elapsed` is 0. Record suite runs in the Pipeline Logs, not just the terminal.

---

## Sequencing

1. Config layer (`paths`, `schemas`, `sources`) + run the one-time crosswalk builder to seed the committed jurisdiction to county crosswalk from DoF E-5 (review unmatched names).
2. Acquisition (CKAN enumerate/download, DOCX + details refresh, fallback ladder).
3. Cleaning (both shapes to canonical, Planning Period parse + quarantine, Infinity, Total row + reshape to long, provenance).
4. Geography + enrichment (levels, county/region, per-level pace metrics + Status, Tiers Met + Overall Progress + Overall Category, Most Recent).
5. Merging + snapshot change detection + immutable seed.
6. Validation (dictionary check + cleaning/final gates) + output (atomic, conditional write).
7. Frontend (schema, data-access, API route, dashboard). Then a verified end-to-end run against live CKAN, logged, idempotent on re-run.

---

## Resolved Decisions

- **Geography = 9 PPIC regions.** Assign region by jurisdiction to county to region; `Geographic Level` is `City` or `County`. Requires a new committed jurisdiction to county crosswalk (counties self-map by suffix). Chosen for contract consistency with every other module over introducing a COG dimension.
- **History = version each snapshot; keep every one.** Add `Snapshot Date` (resource `last_modified`) and accumulate every biweekly pull (no retention cap); grain `(Jurisdiction, Cycle, Snapshot Date, Income Level)`; content-aware change detection prevents unchanged pulls from duplicating. Enables progress-over-time charts. History starts the day the module goes live (no backfill; the only pre-existing history is the closed 5th cycle already in the source).
- **Cycles = enumerate dynamically.** Discover all `Nth Cycle RHNA Progress Report` resources at runtime; `Cycle` int derived from the resource name. Future-proof for the 7th cycle.
- **Access = CKAN API, following 302 redirects to S3** (not HTML scraping).
- **Long on income level.** The contract is tidy on `Income Level` (Very Low / Low / Moderate / Above Moderate / Total), five rows per jurisdiction-snapshot, matching the Housing Stress pattern - so per-tier pace/status is first-class rather than ~24 wide columns.
- **Pace + status analytics are stored, computed once in enrichment.** Reproduce and extend PPIC's hand analysis in the pipeline (single owner), keyed on each row's `Snapshot Date` (newest ~= "today"). `Status` uses the four-quadrant rule (No Allocation / Met / Behind / pace bucket); the ended-period fix is a **clamp** - `Projected Units = Units / min(Percent Elapsed, 1.0)` - so a closed period projects to actual, never below, and `On Track Score` converges to `Percent`. Thresholds (>= 1.0, 0.70-0.99, 0.50-0.69, < 0.50) and labels live in schema config (labels confirmed). `On Track Score` at the `Total` level, not raw `Total %`, is the headline ranking metric.
- **Two overall reads, both stored (transparency).** The `Total` income-level row is **compensatory** (raw sums; overbuild counts - the supervisor's original). `Overall Progress` is **non-compensatory** = capped average `mean over tiers-with-a-goal of min(Units/RHNA, 1.0)`; `Tiers Met` is the plain "N of 4 met" count; `Overall Category` buckets the pace-adjusted `Overall On Track Score`. Terminal label wins mid-cycle (reach a goal -> `Met`).
- **`Overall Category` is pace-adjusted.** Its in-progress bucket keys off the pace-adjusted `Overall On Track Score` (fair early in a period), not raw completion; `Met`/`Behind` remain terminal. This means `Overall Category` and the completion-based `Overall Progress` **diverge by design** early in a cycle (a jurisdiction at 30% `Overall Progress` can still read `On Track`) - two intentional lenses.
- **Overbuilt tiers are capped at 1.0 before averaging** in both `Overall Progress` and `Overall On Track Score`, so a 300%-built tier contributes 1.0, not 3.0 - preserving the non-compensatory intent for the pace read as well.
- **Jurisdiction to county crosswalk = seeded from DoF E-5.** A one-time builder joins RHNA's 539 names against the DoF E-5 Geo workbook's city-under-county hierarchy (already downloaded by PopHousing) and writes a committed `jurisdiction_county_crosswalk.csv`, reconciled through the shared `CITY_NAME_MAPPINGS` and eyeballed for unmatched names. DoF assigns each city to exactly one county, so there is no multi-county split. The live pipeline reads it read-only and fails loud on any unmapped jurisdiction. DoF stays the provenance, with a later path to promote it into `california_geography` as an auto-derived map.
- **Defaults + edge cases.** Dashboard defaults to the **latest cycle per jurisdiction** (older cycles remain available as history); a malformed `Planning Period` range is **quarantined**; `Cycle Started` defaults `True` for the 5th cycle; category labels confirmed as-is.
- **A `County` row is the unincorporated portion of that county** (per HCD's Type note), not the whole county; the whole county is the `County` row plus its constituent city rows.

---

## Open Questions

All design questions raised during scoping are now resolved and folded into **Resolved Decisions** above (geography, history/snapshotting, dynamic cycles, CKAN access, long-on-income-level, pace + status analytics, the two overall reads, the pace-adjusted `Overall Category`, the tier cap, the DoF E-5 crosswalk, and the edge-case defaults). None remain blocking; the module is ready to build.

> [!todo] Deferred to the as-built rewrite
> When this planning spec is rewritten into an as-built guide, promote two implementation notes into an explanatory callout:
> - **`Overall Category` is pace-adjusted** (in-progress bucket keys off `Overall On Track Score`, `Met`/`Behind` stay terminal), so it and the completion-based `Overall Progress` **diverge by design** early in a cycle - two intentional lenses a dashboard viewer should understand.
> - **Tiers are capped at 1.0** before averaging in both overall reads, keeping the pace roll-up non-compensatory.
>
> Flag both in code comments during implementation so the as-built pass can lift them verbatim.
