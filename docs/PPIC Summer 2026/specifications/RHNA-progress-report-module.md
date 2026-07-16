---
Topic: Technical
Content Type: module specification
pinned: false
description: "Technical module specification for the RHNA Progress Report module"
Date Published: July 15, 2026
Last Updated: 07/16/2026 - 2:05 PM
Status: Updating
Footnote: Document generated and updated by Claude Opus 4.8 on command. Outlined and verified by Trinity Jones.
---

# RHNA Progress Report Module Specification

> [!info] What this document is
> This is the **specification** for the RHNA Progress Report module - a **new** module with no legacy predecessor, so there is no migration path to trace; the document simply specifies the module as it stands, kept current with the implementation (backend and frontend both landed 2026-07-16). It has two halves. The **first half is non-technical**: what the module produces, where the data comes from, the dataset grain and columns, the geography, how the pipeline runs phase by phase, and the headline calculations. The **second half is a programmer reference**: per script, per function - what each does, the notable libraries it uses, efficiency notes, and the source fact or design decision behind it. The field catalog and grain were verified against the live CKAN resources, both data dictionaries, and the built pipeline's own output.

> [!warning] Status: built and green, not yet live-verified
> The backend (15 source modules plus the orchestrator) passes **115 unit tests**, and the frontend is covered inside the repository's **380-test Vitest suite**; both are green and lint-clean. Two things stand between here and `Finalized`:
> - A **verified end-to-end run against live CKAN**, logged to the Pipeline Logs. The committed `RHNAProgress_Current.csv` was seeded **offline** from the two saved cycle files with a stand-in `Snapshot Date` of `2026-07-15`; the real run stamps the resource's own `last_modified`.
> - The **snapshot trend line** in the chart editor stays deferred until several biweekly snapshots have accumulated something to plot (see the Frontend section).

---

## Module Summary

The module publishes a single canonical dataset tracking each California jurisdiction's progress against its **Regional Housing Needs Allocation (RHNA)** - how many housing units have been permitted versus how many the state requires, split by the four income tiers (Very Low, Low, Moderate, Above Moderate) plus a Total. On top of the raw counts it computes PPIC's **pace analysis**: whether each jurisdiction is on track to meet its allocation given how much of its planning period has elapsed.

- **Source:** [data.ca.gov RHNA Progress Report](https://data.ca.gov/dataset/rhna-progress-report), a CKAN package (id `ff082e96-72f7-4443-9747-8b8dadc15671`) published by the California Dept. of Housing and Community Development (HCD). The counts are the sum of units on jurisdictions' annual progress reports (APR Tables A and A3 for 2013-2017, Table A2 from 2018 on).
- **Access:** the **CKAN API** (`package_show`), not HTML scraping. Each cycle is a separate CSV resource with a companion DOCX data dictionary. Resources redirect (HTTP 302) to signed S3 URLs, so the downloader follows redirects.
- **Cadence:** HCD refreshes the CSVs **biweekly**, overwriting them in place. The files carry **no internal time axis** - each is a single cumulative snapshot of progress-to-date. Temporal history therefore exists only because we capture it, which drives the snapshot-versioning design below.
- **Coverage:** 539 jurisdictions (cities and counties) per cycle; two cycles live today (5th and 6th). The committed dataset holds `539 x 5 income levels x 2 cycles = 5,390` rows.
- **Geography:** jurisdictions are cities and counties (counties carry a `COUNTY` suffix). There is **no region or COG column in the source**; region is assigned by mapping each jurisdiction to its county and rolling that county up into one of the **9 shared PPIC regions**.

### What a "cycle" is

A **cycle** is an ~8-year RHNA planning period. Each jurisdiction has its **own** start and end dates within a cycle (COGs stagger adoption), carried in the source `Planning Period` field as a per-row date range (for example Alameda 5th = `01/31/2015 - 01/31/2023`). A new cycle appears in the package as a new `Nth Cycle RHNA Progress Report` resource; the module **enumerates resources dynamically**, so a future 7th cycle is picked up without a code change. The 6th cycle file adds a `6th Cycle Started` boolean marking whether a jurisdiction has actually entered the current cycle yet.

---

## Data Contract

**Grain:** `(Jurisdiction, Cycle, Snapshot Date, Income Level)` - the dataset is **tidy/long on income level** (matching the Housing Stress house style), so each jurisdiction-cycle-snapshot contributes **five rows**: one per income tier (`Very Low`, `Low`, `Moderate`, `Above Moderate`) plus a summed `Total` row. This keeps the per-tier pace/status metrics first-class instead of ballooning into ~24 wide columns. Because the source overwrites a cumulative snapshot on each refresh, every pull is stamped with the resource's `last_modified` as `Snapshot Date` and accumulated, turning the overwrite stream into a real time series. `Most Recent` flags the latest snapshot per `(Jurisdiction, Cycle)` for the default "current state" views.

**Canonical output** (`RHNAProgress_Current.csv`, 27 columns in this order). The columns split into **income-level fields** (vary row to row within a jurisdiction-snapshot) and **jurisdiction-level fields** (identical across that jurisdiction's five rows).

*Income-level fields (one row each for Very Low, Low, Moderate, Above Moderate, Total):*

| Column | Type | Notes / derivation |
|---|---|---|
| `Income Level` | text | `Very Low` / `Low` / `Moderate` / `Above Moderate` / `Total`. Part of the grain. |
| `Units` | Int64 | Units completed at this level. Source `VLI/LI/MOD/ABOVE MOD UNITS`; `Total` = their sum (HCD "Total units completed"). |
| `RHNA` | Int64 | Allocation (target) at this level. Source `RHNA VLI/LI/MOD/ABOVE MOD`; `Total` = their sum (HCD "RHNA goal"). |
| `Percent` | Float64 | `Units / RHNA` (source-provided for tiers, so cleaning validates rather than recomputes; `Total` = `Total Units / Total RHNA`). Null when `RHNA` is 0 (the source `Infinity` / Excel `#DIV/0!` sentinel). |
| `Projected Units` | Float64 | Pace projection `Units / min(Percent Elapsed, 1.0)`. The **clamp** means a closed period projects to its actual built count, never below it. Null when `Percent Elapsed` is 0/NaN. |
| `On Track Score` | Float64 | `Projected Units / RHNA` (= `Percent / min(Percent Elapsed, 1.0)`). `>= 1.0` = on pace to meet this level's allocation; converges to `Percent` once the period closes. Null when `RHNA` or `Percent Elapsed` is 0. |
| `Status` | text | Per-level bucket from the four-quadrant rule (see callout): `Met`, `Behind`, `On Track`, `Nearly On Track`, `Somewhat Off Track`, `Far Off Track`, or `No Allocation`. |

*Jurisdiction-level fields (repeated across the five rows):*

| Column | Type | Notes / derivation |
|---|---|---|
| `Jurisdiction` | text | Standardized city/county name. Source `Jurisdiction` (539 values). |
| `Geographic Level` | text | `City` or `County`; a `COUNTY` name suffix marks a county. **A `County` row is the unincorporated portion of that county only** (its incorporated cities are separate jurisdictions), per HCD's own "Type" note - so a whole county = its `County` row plus its city rows. |
| `County` | text | County the jurisdiction sits in; for county rows, itself. Joined via the committed crosswalk. |
| `Region` | text | One of the 9 shared PPIC regions; derived `County` to region via `california_geography`. |
| `Cycle` | int | `5`, `6`, ...; derived from the resource/filename, not a source column. |
| `Planning Period` | text | Per-jurisdiction date range string. Source `Planning Period`. |
| `Planning Period Start` | date | Parsed left side of the range. |
| `Planning Period End` | date | Parsed right side of the range. |
| `Cycle Started` | bool | Source `6th Cycle Started`; `True` for cycles that omit the field (5th defaults `True`). |
| `Snapshot Date` | date | Resource `last_modified` at capture; part of the grain. |
| `Most Recent` | bool | `True` for the latest `Snapshot Date` within each `(Jurisdiction, Cycle)`. |
| `Total Days` | Int64 | `Planning Period End - Planning Period Start` in days. |
| `Elapsed Days` | Int64 | `Snapshot Date - Planning Period Start` in days (the snapshot is the "as of" date). |
| `Percent Elapsed` | Float64 | `Elapsed Days / Total Days`; kept at its true value for display (may exceed 1.0 for an ended period); the pace formulas use `min(Percent Elapsed, 1.0)`. |
| `Tiers Met` | Int64 | Count of the four tiers where `Units >= RHNA` and `RHNA > 0`. |
| `Tiers With Goal` | Int64 | Count of the four tiers where `RHNA > 0` (the denominator for `Tiers Met` and `Overall Progress`). |
| `Overall Progress` | Float64 | **Non-compensatory** roll-up: the capped average `mean over tiers-with-a-goal of min(Units / RHNA, 1.0)`. Overbuilding one tier cannot offset a shortfall in another. Distinct from the `Total` row's `Percent` (which is compensatory). |
| `Overall On Track Score` | Float64 | Pace-adjusted sibling of `Overall Progress`: `mean over tiers-with-a-goal of min(On Track Score_tier, 1.0)`. Used to bucket `Overall Category` fairly mid-cycle. |
| `Overall Category` | text | Jurisdiction-wide status from the four-quadrant rule applied to the tier set: `Met` (every tier with a goal reached it), `Behind` (deadline passed, not all met), else the pace bucket of `Overall On Track Score`, or `No Allocation`. |
| `Source Last Updated` | datetime | Package `metadata_modified` at capture (provenance). |

> [!warning] Source quirks the cleaner handles
> - **`Infinity` / `#DIV/0!` sentinel.** The dictionaries define `Infinity` (the CSV) / `#DIV/0!` (the worksheet) as the `Percent` placeholder when the `RHNA` denominator is 0. `coerce_income_measures` replaces these strings with null before the float cast, or the parse would fail.
> - **Percentages are pre-computed** in the source, so cleaning validates the tier `Percent` against `Units / RHNA` (within tolerance) rather than recomputing; only the `Total` row and the pace/overall metrics are derived.
> - **Percentages exceed 1.0** routinely (a jurisdiction can overshoot one tier's allocation), which is expected - and is exactly why `Overall Progress` caps each tier at 100% before averaging.
> - **`Planning Period` varies row-by-row** within a cycle; it is descriptive per-jurisdiction metadata, not a cycle-level constant. `Cycle` (from the filename) is the stable key. A range that fails to parse is **quarantined** (returned in a separate frame and logged), not written with null dates.

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
> Closed periods never touch the pace formula, so a jurisdiction that met its allocation late reads `Met`, not a shrunken pace score. `Overall Category` applies the same rule at the jurisdiction level ("every tier met" -> `Met`; deadline passed and not all met -> `Behind`; otherwise the pace bucket of `Overall On Track Score`). One function, `classify_status`, owns this rule and is called by tier `Status`, `Overall Category`, and the final validator so the three can never drift.

> [!tip] Two "overall" lenses that diverge by design (read this before charting the overall reads)
> The module stores **two intentional lenses** on a jurisdiction's overall performance, and they are meant to disagree early in a cycle:
> - **`Overall Progress`** is **completion**: the capped average of `min(Units / RHNA, 1.0)` over tiers with a goal. A jurisdiction three years into an eight-year cycle that has built 30% of every allocation reads `Overall Progress = 0.30`.
> - **`Overall Category`** is **pace-adjusted**: its in-progress bucket keys off `Overall On Track Score` (which divides completion by how much of the period has elapsed), not raw completion. That same jurisdiction, on pace, reads `Overall Category = On Track`.
> So a jurisdiction can legitimately show `Overall Progress = 0.30` and `Overall Category = On Track` at the same time - completion is low, but the pace is fine. `Met` and `Behind` stay terminal in both. When you put these on a dashboard, label them so a viewer understands they are answering different questions ("how much is built" versus "are they keeping pace").
>
> **The tier cap applies to both overall reads.** Before averaging, each tier is capped at 1.0 in *both* `Overall Progress` (`min(Units / RHNA, 1.0)`) and `Overall On Track Score` (`min(On Track Score_tier, 1.0)`). A tier built to 300% therefore contributes 1.0, not 3.0, so overbuilding one income level can never mask a shortfall in another. This is what makes both reads **non-compensatory**, in deliberate contrast to the `Total` row's `Percent`, which sums raw units and *is* compensatory (and is kept precisely so the compensatory view is still available).

**Immutable seed:** `RHNAProgress_Historical.csv` holds any snapshots captured before the module went live, read-only to the pipeline and unioned in during merge - mirroring the other modules' historical-seed pattern so a bad `Current` write cannot poison the accumulated series. It is empty today (history starts the day the module goes live).

---

## How the Pipeline Runs

The entry point is `scripts/orchestrators/rhna_progress_pipeline.py`. `build_rhna_progress_dataset(config=None, logger=None)` runs five phases, each wrapped so any exception re-raises as a `RHNAProgressPipelinePhaseError` tagged with the phase name. It returns a summary dict: `dataframe`, `new_snapshot` / `source_failed` / `used_manual` flags, the list of `acquired_cycles`, `output_path` (`None` when nothing changed), and `row_count`.

| # | Phase | Responsibility | Key modules |
|---|---|---|---|
| **1** | Setup & Load | Resolve paths/config/geography; load the committed crosswalk, the existing canonical CSV (change-detection base), and the immutable seed; compute the latest stored snapshot per cycle. | `config/*`, `geography/jurisdiction_crosswalk`, `merging/historical_merge` |
| **2** | Acquisition | Enumerate cycle resources; download only those whose `last_modified` is newer than the latest stored `Snapshot Date`; refresh DOCX dictionaries and `RHNAInfo.json`; degrade via the fallback ladder. | `acquisition/*` |
| **3** | Cleaning | Normalize both column shapes, standardize jurisdiction names, parse `Planning Period` (quarantine bad ranges), coerce types, handle `Infinity`/`#DIV/0!`, append the `Total` row and reshape to the long income-level grain, stamp `Snapshot Date` / `Source Last Updated`; run the cleaning validator. | `cleaning/*`, `validation/*` |
| **4** | Enrichment & Merge | Classify `Geographic Level`, join county/region, derive time + per-level pace metrics + `Status`, derive `Tiers Met` / `Overall Progress` / `Overall Category`, set `Most Recent`; union with seed + prior snapshots, dedupe on grain, and detect whether a genuinely new snapshot landed. | `geography/*`, `enrichment/*`, `merging/*` |
| **5** | Validation & Finalize | Validate against the final config and the four-quadrant rule; order columns; atomically write only if a new snapshot landed; archive per retention. | `validation/*`, `output/*` |

**Acquisition degrades, it does not fail.** The ladder is live CKAN -> a manually placed raw CSV (`RHNAProgress_Downloaded.csv`) -> the snapshots already saved in the canonical CSV. Which rung produced the payload is reported via `source_failed` / `used_manual`: live = `(False, False)`, manual = `(False, True)`, saved-canonical = `(True, False)`. When the last-resort saved canonical is used, the orchestrator returns it unchanged with `new_snapshot = False` rather than re-running the transforms on already-finished data.

**Writes are conditional.** `detect_new_snapshot` compares the sorted, stringified existing and combined frames, so an unchanged biweekly pull produces no new row and no write; `write_dataset` only touches disk when a new snapshot actually landed, and it does so atomically (staged `.tmp` then `os.replace`).

---

## Frontend (What the User Sees)

Three surfaces, all built and green:

1. **Landing dashboard** - a live "California Regional Housing Needs Allocation" category on the home page (`components/landing/dashboards/RHNAProgressDashboard.js`). Three rows: three stat cards; a **diverging bar chart of median On Track Score by region** (`RegionalOnTrackBars.js`) centered on `1.0`, with an **Income Level toggle**; then the **best/worst standings tables** side by side (`On Track Score` beside the non-compensatory `Tiers Met` and `Overall Progress`, so the two lenses sit together). A gray-italic **source footnote** at the bottom-left notes when HCD last updated the data, with the time in Pacific Time.
2. **Chart editor** - `/rhna-progress` opens the shared `ModuleEditor` on the **cross-sectional ranking view** (`compare-places` bar), Income Level pinned in the sidebar. The module schema declares `defaultPreset: "compare-places"` and `supportedChartTypes: ["bar"]`, and deliberately carries **no `yearRange`**, so the sidebar's temporal/period sliders stay hidden.
3. **Reusable control** - the dashboard's Income Level toggle is the general `components/charts/GraphTabs.js` pill selector, meant to be wired into future graph editors and the standalone Visualization Tool as the common "visualize by group" control (see [[graph-tabs-facet-selector]]).

> [!note] Why the trend line is deferred
> RHNA's temporal axis is `Snapshot Date`, and each source file is a *cumulative snapshot with no within-file time series*. `Snapshot Date` and `Source Last Updated` are effectively the same signal (both capture HCD's biweekly refresh), so at launch there is exactly one distinct value - a trend line would be a single point. The trend preset and the choropleth map (no jurisdiction-level geometry exists) are therefore intentionally not offered yet; the ranking view is RHNA's headline anyway. The trend line comes online once biweekly captures accumulate something to plot.

---

# Programmer Reference

The rest of this document is the per-script, per-function reference. Because this is a new module there is no legacy code to trace; each entry instead notes the **source fact or design decision** it was built from. Every source function's docstring ends with its `Test file:` path (one test file per source file). Backend tests: `scripts/unit_tests/rhna_progress/**` (115 passing).

## `config/`

`get_paths()` (`config/paths.py`) - returns the pipeline's pathlib objects: canonical + immutable seed (`data-cleaned/RHNA-progress-report/`), raw download dir + manual fallback + committed crosswalk (`data-raw/RHNA-progress-report/`), archive, codebook dir (`docs/Codebooks/RHNA-progress-report/`), `details/RHNAInfo.json`, and logs. Built on `lib.config.get_project_paths`. *Design fact: the crosswalk and manual-fallback CSVs live under `data-raw` because they are inputs, not pipeline outputs.*

`get_schema_config()` (`config/schemas.py`) - the single source of truth for the 27-column output order, dtypes, the five income levels and the four tiers, the tier -> source-column map (`VLI UNITS` etc.), the grain keys, the `status_thresholds` (`1.0 / 0.70 / 0.50`) and label wording, and the cleaning/final validation configs. The nine PPIC region names in `final_validation_config["regions"]` are derived from the shared `california_geography` so they cannot drift from the rest of the project. *Design fact: thresholds and labels live here, not in the pace code, so the buckets are tunable in one place.*

`get_source_config()` (`config/sources.py`) - CKAN package id, the API base URL, the resource-name regex that identifies a `Nth Cycle RHNA Progress Report` CSV and captures its cycle integer (the named `(?P<cycle>\d+)` group), the separate dictionary-resource regex, request retry/timeout settings, and the User-Agent. *Source fact: the cycle regex excludes the `... Data Dictionary` resources by anchoring on `$` after `Report`.*

## `acquisition/`

`ckan_downloader.py` uses `requests` directly (the tests monkeypatch `ckan_downloader.requests.get`).

- `fetch_package_metadata(source_config)` - calls `package_show` and returns `{metadata_modified, resources}`. Retries up to `retry_attempts` on any transient failure, re-raising the last error on a hard failure. *Efficiency: one metadata call per run; the resource list drives everything else.*
- `enumerate_cycle_resources(resources, source_config)` - matches CSV resources against the cycle regex and returns `(cycle_int, resource)` sorted ascending, so a future 7th cycle is included automatically. *Design fact: dynamic enumeration is decision #3 - no hard-coded cycle list.*
- `download_changed_cycles(cycle_resources, latest_snapshot_by_cycle, paths)` - for each cycle whose `last_modified` is strictly newer than the latest stored `Snapshot Date` (parsed with `pd.Timestamp` so a date string compares cleanly to a datetime), follows the 302 with `allow_redirects=True` and writes `rhna_progress_{cycle}.csv`; skips unchanged cycles. *Design fact: the strict `>` is what makes an unchanged biweekly pull a no-op at the acquisition layer.*
- `refresh_codebooks_and_details(resources, package_meta, paths)` - downloads the current DOCX dictionaries (filename = the resource name lowercased with spaces hyphenated) and writes `RHNAInfo.json` (coverage, cadence, granularity, `source_last_updated`).

`source_fallback.py`

- `acquire_with_fallback(source_config, paths, latest_snapshot_by_cycle)` - runs the live -> manual -> saved-canonical ladder described above. On the live path it stamps each record's `source_last_updated` from the package `metadata_modified`. Imports the four `ckan_downloader` functions at module scope so the tests can monkeypatch each rung. *Design fact: `source_failed` means "fell back to the saved canonical" (no fresh data at all), which is why the manual rung reports `False` for it.*

## `cleaning/`

`column_normalization.py`

- `normalize_columns(raw_df, cycle, schema_config)` - renames either the 14-column 5th-cycle or 15-column 6th-cycle shape to the canonical `Very Low Units` etc. via the schema's tier map, coerces the `Nth Cycle Started` flag to a real bool (defaulting `True` where absent), and attaches the `Cycle` integer. Raises `ValueError` naming the missing source columns on an unexpected set. Copies its input (never mutates). *Source fact: the two column shapes are the "two shapes" challenge; both normalize to one schema.*
- `standardize_jurisdiction_names(df, geography)` - one canonical place-name pass. Builds a lookup from the crosswalk's `Source Name` (raw HCD spelling) and `Jurisdiction` (canonical) columns, normalizing on trimmed-uppercase, and reconciles each name (for example `SAN BUENAVENTURA` -> `Ventura`). Fails loud (`ValueError` naming the offender) on an unknown name rather than silently dropping it.
- `parse_planning_period(df)` - splits the `mm/dd/yyyy - mm/dd/yyyy` range into `Planning Period Start` / `End` with an explicit format, leaving the original string intact, and returns `(clean, quarantined)`. A row that fails to parse goes to `quarantined` with a `Quarantine Reason`, never into `clean` with null dates. *Design fact: quarantine, not null-fill, so a malformed period can never silently zero out a jurisdiction's elapsed time.*

`income_measures.py`

- `coerce_income_measures(df, schema_config)` - for each tier casts Units/RHNA to `Int64` and `Percent` to `Float64`, first replacing the `Infinity` / `#DIV/0!` / `inf` sentinels with null (case-insensitively) so `pd.to_numeric` does not parse them as `inf`. Never raises on a single bad cell (coerce to null). Copies its input.
- `stamp_provenance(df, snapshot_date, source_last_updated)` - attaches `Snapshot Date` (resource `last_modified`) and `Source Last Updated` (package `metadata_modified`) as timestamps to every row.

`reshape_income_levels.py`

- `reshape_to_income_levels(wide_df, schema_config)` - appends the summed `Total` row (Units/RHNA = tier sums via `sum(axis=1)`, `Percent` = `Total Units / Total RHNA`, null when `Total RHNA` is 0), then melts the four tiers plus Total into the long `(Income Level, Units, RHNA, Percent)` grain, carrying every jurisdiction-metadata column onto all five rows. *Design fact: this is where the contract becomes tidy-on-income-level.*

## `geography/`

`jurisdiction_crosswalk.py`

- `load_jurisdiction_crosswalk(paths)` - reads the committed `jurisdiction_county_crosswalk.csv`; raises `FileNotFoundError` with an actionable "crosswalk missing" message (and how to rebuild it) on cold start, rather than silently regionless output. On the per-run path, read-only.
- `build_jurisdiction_crosswalk(rhna_names, e5_hierarchy, name_mappings)` - the one-time (Phase 0-style) builder, run manually. A county name self-maps (strip the ` County` suffix); a city name is matched against the DoF E-5 city-under-county hierarchy, trying the `CITY_NAME_MAPPINGS` value, then the title-cased raw, then the raw (upper-cased fallback for each). Unmatched names are returned for eyeball review; the committed CSV keeps a `Source Name` column so the per-run cleaner can reconcile raw HCD spellings. *Source fact: DoF assigns each city exactly one county, so there is no multi-county split; E-5 is already downloaded by PopHousing.*

`geographic_levels.py`

- `classify_geographic_level(df)` - `Geographic Level = County` when the name carries a `COUNTY` suffix, else `City`. Copies its input.
- `assign_county_and_region(df, crosswalk, geography)` - county rows self-map their `County`; city rows join it from the crosswalk; both roll up to one of the nine regions via `california_geography`'s `regions_mapping`. Fails loud on an unmapped jurisdiction (a new incorporation) or a county with no region, so neither is silently dropped.

## `enrichment/`

`pace_metrics.py` (owns the pace math and the four-quadrant rule)

- `classify_status(units, rhna, snapshot_date, planning_end, on_track_score, thresholds, labels)` and `bucket_pace_score(...)` - the single implementation of the four-quadrant rule and its pace buckets, imported by `Status`, `Overall Category`, and the final validator.
- `derive_time_elapsed(df)` - `Total Days`, `Elapsed Days`, and the true `Percent Elapsed` (may exceed 1.0), computed once per row with vectorized `pd.to_datetime` differences.
- `derive_pace_metrics(df, schema_config)` - vectorized `Projected Units = Units / min(Percent Elapsed, 1.0)` and `On Track Score = Projected / RHNA`, null-safe where the clamped denominator or RHNA is 0, then the row-wise `Status`. *Design fact: the clamp is the ended-period fix - a closed period projects to actual, so `On Track Score` converges to `Percent` instead of shrinking below it.*

`overall_progress.py`

- `derive_overall_progress(df, schema_config)` - groups by `(Jurisdiction, Cycle, Snapshot Date)` and, over the four tier rows only, computes `Tiers With Goal`, `Tiers Met`, the capped-average `Overall Progress` and `Overall On Track Score` (each tier `min(..., 1.0)` via NumPy), and the pace-adjusted `Overall Category`; broadcasts all five values to every row. The `Total` row is intentionally excluded from the roll-up. *Design decision, now a first-half callout: the cap makes both reads non-compensatory, and `Overall Category` keys off the pace-adjusted score so it diverges from completion-based `Overall Progress` early in a cycle.*
- `mark_most_recent(df)` - `Most Recent = True` on all rows sharing the max `Snapshot Date` within each `(Jurisdiction, Cycle)`.

## `merging/`

`historical_merge.py`

- `load_canonical_dataset(paths)` / `load_historical_seed(paths)` - read the canonical CSV (empty contract frame + loud `UserWarning` on cold start) and the immutable seed (empty when absent).
- `combine_snapshots(existing, seed, new_snapshots)` - concatenates `seed < existing < new` and `drop_duplicates(subset=grain, keep="last")`, so the freshest capture wins on any repeated grain key, then re-derives `Most Recent`. Copies inputs.
- `detect_new_snapshot(existing, combined, grain_keys)` - returns `True` only when `combined` introduces a new grain row or a changed measure, by comparing the two frames sorted-by-grain and stringified (`.astype(str).to_csv`), which is insensitive to row order and dtype drift. Gates the conditional write.

## `validation/`

`rhna_progress_validators.py`

- `validate_dictionary_columns(raw_columns, cycle, codebook_path)` - parses the DOCX dictionary's first-column Field Names using `xml.etree.ElementTree` over the unzipped `word/document.xml` (no `python-docx` dependency), block-hard on a declared field missing from the live data and warn-soft on an extra live column. *Efficiency/lineage: parsing the XML directly keeps the pipeline dependency-free; the DOCX dictionaries are the "codebook, not codebook file" challenge.*
- `validate_cleaned(df, schema_config)` - the wired cleaning gate: required columns, no null grain keys, exactly the five income levels per group, non-negative Units/RHNA, and tier `Percent` within tolerance of `Units / RHNA`.
- `validate_final(df, schema_config)` - the pre-write gate: grain uniqueness, `Total` = tier sums per group, one `Most Recent` value per group, `Region` in the nine, each `Status` consistent with `classify_status`, and `Tiers Met <= Tiers With Goal`.

## `output/`

`finalize_dataset.py`

- `finalize_dataset(df, schema_config)` - orders to the 27-column contract (raising on a missing contract column), and casts the core types (Units/RHNA/counts to `Int64`, the scores/percents to `Float64`, the flags to `bool`). Copies its input.
- `write_dataset(df, paths, new_snapshot)` - archives the prior `Current.csv` (timestamped) then writes atomically (`.tmp` + `Path.replace`) only when `new_snapshot` is `True`, returning the path or `None`. The temp file is cleaned in a `finally`, so a failed replace leaves the original intact.

## orchestrator

`rhna_progress_pipeline.py` - `build_rhna_progress_dataset(config=None, logger=None)` wires the five phases inside per-phase `try` blocks that re-raise as `RHNAProgressPipelinePhaseError`. Helpers: `_latest_snapshot_by_cycle` (change-detection base), `_infer_cycle_from_columns` (manual-fallback cycle inference from the `Nth Cycle Started` column), `_as_records` (normalizes the list/Path/DataFrame acquisition payloads), and `_clean_record` (runs one cycle file through the cleaning chain). The saved-canonical DataFrame rung short-circuits to `new_snapshot = False`. The CLI wraps the build in `execute_pipeline_run` so the run is recorded in the Pipeline Logs.

## Frontend files

- `lib/visualization/moduleSchemas/rhnaProgress.js` - the client-safe field catalog (temporal `Snapshot Date`; dimensions `Location` [aliased from `Jurisdiction`], `Geographic Level`, `Region`, `Cycle`, `Income Level`, `Status`, `Overall Category`; the measure family with `On Track Score` curated headline), subsets, the `Income Level` filter dimension (default `Total`), `defaultPreset`, and `supportedChartTypes`. Registered in `moduleRegistry.js`.
- `lib/data/rhna_progress.js` - server-only data access. Carries its **own** snapshot-aware shaping (like Building Permits, not the Year-based shared `query_shapes`): CSV parse (aliasing `Location = Jurisdiction`), `filteredRows` (subset + Income Level pin + most-recent + latest-cycle-per-jurisdiction defaults), the chart shapes (`queryCategoryValues`, `queryLineSeries`, `queryFullTable`), and the dashboard shapes (`queryBestWorst`, `queryRegionalOnTrack` median-by-region, `queryDataSources`).
- `app/api/rhna-progress/route.js` - views `category`, `line`, `table`, `bestWorst`, `regional`, validating subset/income-level/measure.
- Dashboard: `RHNAProgressDashboard.js` (+ registered in `dashboards/index.js`), `RegionalOnTrackBars.js` (client diverging bar), `GraphTabs.js` (reusable pill selector), and the `DashboardShell.js` `sources` footnote.
- Shared editor mechanisms added for this module (general, other modules can use them): `schema.defaultPreset` (honored in `chartConfigStore.createChartConfig`) and `schema.supportedChartTypes` (gated in `wizard/steps/ChartTypeStep.js`).

---

## Flagged Issues and Fragilities

> [!bug] Things to watch
> - **The committed `Current.csv` is offline-seeded.** Its `Snapshot Date` is the stand-in `2026-07-15`, and `Snapshot Date` equals `Source Last Updated`'s date because both came from the seeding script, not a live pull. The first live run replaces both with real CKAN timestamps; until then, dashboard "last updated" reads `July 15, 2026`.
> - **`build_jurisdiction_crosswalk` is name-matching heuristics.** New incorporations or HCD spelling changes surface as `unmatched` (builder) or a loud `ValueError` (per-run `assign_county_and_region` / `standardize_jurisdiction_names`). That is by design - fix the crosswalk, do not soften the failure - but it means a new city blocks the run until the crosswalk is re-seeded.
> - **`Percent Elapsed` can be negative** for a jurisdiction whose 6th cycle has not started (`Snapshot Date` before `Planning Period Start`). The pace formulas are null-safe (clamp `> 0` guards the denominator), and `Cycle Started` marks these rows, but any future consumer that reads `Percent Elapsed` directly should expect values below 0 as well as above 1.
> - **The dictionary check is not wired into the orchestrator yet.** `validate_dictionary_columns` exists and is tested, but the per-run pipeline does not currently call it (the cleaning and final validators are wired). Wire it in Phase 2/3 when the live run lands, so a silent HCD column rename is caught.
> - **Chart types are not gated in edit mode.** `supportedChartTypes` gates the wizard's Chart Type step; if a future edit-sidebar path lets a user switch chart type directly, gate it there too.

## Source Facts and Design Decisions

| Fact / decision | Where it lives |
|---|---|
| CKAN package `ff082e96-...`, biweekly overwrite, 302 to signed S3 | `config/sources.py`, `acquisition/ckan_downloader.py` |
| `Infinity` / `#DIV/0!` = null `Percent` sentinel | `cleaning/income_measures.py` |
| Snapshot-versioning turns the overwrite stream into a series | `cleaning/stamp_provenance`, `merging/historical_merge.py` |
| 9 PPIC regions via jurisdiction -> county -> region | `geography/*`, seeded from DoF E-5 |
| Clamp fixes ended-period projection | `enrichment/pace_metrics.derive_pace_metrics` |
| Tier cap makes both overall reads non-compensatory | `enrichment/overall_progress.derive_overall_progress` |
| `Overall Category` is pace-adjusted (diverges from `Overall Progress`) | `enrichment/overall_progress` + first-half callout |
| One `classify_status` owner for the four-quadrant rule | `enrichment/pace_metrics`, reused by the final validator |
| Snapshot temporal -> ranking-first editor, trend deferred | `moduleSchemas/rhnaProgress.js`, `chartConfigStore`, `ChartTypeStep` |

## Open Items

- [ ] Verified end-to-end run against live CKAN, logged to the Pipeline Logs; confirm idempotent on re-run (a second run detects no new snapshot).
- [ ] Wire `validate_dictionary_columns` into the orchestrator's acquisition/cleaning phase.
- [ ] Bring the **snapshot trend line** online in the editor once several biweekly snapshots have accumulated (then reconsider `supportedChartTypes`).
- [ ] Consider defaulting the dashboard's editor ranking to `sort: ascending` (worst-first), the more policy-relevant end.
- [ ] Promote the module to `Finalized` in this doc and mark it verified in `projectSpec.md` once the live run is logged.
