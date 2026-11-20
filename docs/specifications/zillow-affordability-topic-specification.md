---
Topic: Technical
Content Type: topic specification
pinned: false
description: "Topic specification for Zillow Housing Affordability: monthly cost of buying or renting a typical home, and the income needed, across California's 26 metro areas and the US"
Date Published: November 18, 2026
Last Updated: 11/20/2026 - 10:00 AM
Status: Draft
Footnote: Drafted by Claude Opus 5.5 through the add-topic-dataset skill; dataset plan approved by the researcher 2026-11-18.
---

# Zillow Housing Affordability Topic Specification

> [!info] What this document is
> This is the **specification** for the Zillow Housing Affordability topic, a **new** topic with no legacy predecessor. The **first half is non-technical**: what the table holds, what each column means, where the data comes from and how it updates. The **second half is a programmer reference**: the data contract, the pipeline phases, every function and its test file, the validation rules, and the decisions behind them.

> [!warning] Draft: built on a review branch, not yet reviewed
> The dataset plan was approved by the researcher on 2026-11-18. Everything else is waiting on review by a developer or programmer, including the **terms-of-use question** in [Caveats](#caveats).

> [!danger] Bring up at the next Zillow refresh: 2013 values blanked by hand
> Zillow's 2026-11-16 release has a broken **Total Monthly Payment** for **Hanford, Santa Rosa and Yuba City in every month of 2013**. It runs 13.5 to 23.9 times the mortgage payment, against 1.15 to 1.80 times in every other month. The four columns computed from it are blanked for those 36 place-months (216 cells), by an explicit list rather than a rule (owner decision 2026-11-18). Every pipeline run logs a reminder with the current raw ratio. **At each refresh, check whether Zillow has corrected these values, and remove the entry from `known_source_errors` in `config/schemas.py` once it has.** See [Known Source Errors](#known-source-errors).

---

## Topic Summary

The topic answers one question across California: **how much does it cost to buy or rent a typical home, and how much income does a household need to afford it?** It covers California's 26 metro areas plus the United States as a benchmark, monthly, from January 2012 (buying) and January 2015 (renting) to the latest month Zillow has published.

- **Publisher:** Zillow Research, [Housing Data](https://www.zillow.com/research/data/) page, "Affordability" and "Home values" sections.
- **Inputs:** 12 metro-level CSV files, each one wide table with one row per metro and one column per month.
- **Output:** one table, `ZillowAffordability_Current.csv`, holding the **latest release**, plus one permanent snapshot file per release in `snapshots/`.

---

## What the Table Holds

**One row** = one place × one month × one housing scenario, from one Zillow release.

| Column | What it means | Units | Example |
|---|---|---|---|
| `Release Date` | The date Zillow published the release the numbers came from | date (`YYYY-MM-DD`) | 2026-11-16 |
| `Geographic Level` | `Metro` or `Nation` | | Metro |
| `Location` | Zillow's metro name without the state suffix, or `United States` | | Fresno |
| `Date` | The month the value describes | month (`YYYY-MM`) | 2026-10 |
| `Housing Scenario` | `Buy (5% down)`, `Buy (10% down)`, `Buy (20% down)`, or `Rent` | | Buy (20% down) |
| `Mortgage Payment` | Monthly mortgage payment on a newly bought typical home, at that month's average interest rate. Below 20% down it includes 1% mortgage insurance | $ / month | 2,223 |
| `Total Monthly Payment` | Mortgage payment plus homeowner's insurance, property taxes, and maintenance worth 0.5% of the home's value | $ / month | 2,820 |
| `Income Needed` | Yearly household income at which the monthly cost is 30% of income. Buying: total monthly payment at 20% down. Renting: the typical new lease | $ / year | 112,784 |
| `Share of Income` | Share of the **median household's** income spent on the monthly cost. Above 0.30 is generally considered unaffordable | share (0–1) | 0.442 |
| `Affordable Home Price` | Highest home price whose total monthly payment stays within 30% of the median household's income, with 20% down | $ | 274,441 |
| `Years to Save` | Years for the median household to save a 20% down payment, saving 10% of income with no interest | years | 10.6 |

"Typical home" is Zillow's Home Value Index (ZHVI): homes in the 35th–65th percentile of value, all single-family homes, condos and co-ops, smoothed and seasonally adjusted. "Typical rental" is Zillow's Observed Rent Index for all homes plus multifamily.

### Which columns apply to which scenario

| Scenario | Mortgage Payment | Total Monthly Payment | Income Needed | Share of Income | Affordable Home Price | Years to Save |
|---|---|---|---|---|---|---|
| Buy (5% down) | ✓ | ✓ | blank | blank | blank | blank |
| Buy (10% down) | ✓ | ✓ | blank | blank | blank | blank |
| Buy (20% down) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Rent | blank | blank | ✓ | ✓ | blank | blank |

Blank means Zillow does not publish that combination. Blanks are never filled with zero. The `Rent` scenario puts renter income and share on the same columns as buying, so one chart can compare "income to buy" with "income to rent" directly.

### Coverage

- **Places:** 26 California metros (Bakersfield, Chico, El Centro, Fresno, Hanford, Los Angeles, Madera, Merced, Modesto, Napa, Oxnard, Redding, Riverside, Sacramento, Salinas, San Diego, San Francisco, San Jose, San Luis Obispo, Santa Cruz, Santa Maria, Santa Rosa, Stockton, Vallejo, Visalia, Yuba City) and the United States.
- **Time:** buying from January 2012, renting from January 2015, to the latest published month (October 2026 in the 2026-11-16 release). Zillow publishes monthly, about two weeks after a month ends.
- **Gaps:** some early renter months are blank for some metros (312 cells in the 2026-11-16 release). Buying series have no gaps.

---

## Sources and How the Topic Updates

| Source | How the pipeline finds it | Class | Cadence | Researcher action each release |
|---|---|---|---|---|
| Zillow Research, 12 affordability CSVs | One permanent link per file under `https://files.zillowstatic.com/research/public_csvs/`; each always serves the newest release | **Fixed** | Monthly | None |

All 12 links were checked on 2026-11-18. The release date is read from each file's `Last-Modified` header, so a re-run of the same release is recognized as nothing new.

**Snapshots.** Zillow recalculates past months in every release, because the series are smoothed and seasonally adjusted. Each release that changes anything is kept as its own permanent file. Snapshots start with the **2026-11-16** release; Zillow does not publish its older releases.

The topic needs nothing from the researcher between releases. If Zillow renames a file, the run log says which link failed, and the pipeline keeps the last saved table until a developer or programmer updates the link.

---

## Caveats

- **Terms of use not confirmed.** The Housing Data page offers the files "for use in your own analyses" and carries a "© Zillow Group, Inc. All rights reserved" footer. It has no explicit license or redistribution wording. A developer or programmer should confirm that publishing these numbers on the PPIC site is allowed before the topic goes live.
- **Metros, not counties.** Metro areas follow federal metro definitions and don't line up with PPIC regions. San Francisco, for example, covers five counties.
- **Older metro definitions.** Zillow still reports Madera as its own metro. The 2023 federal update merged Madera County into the Fresno metro, so the 2023 boundary file's Fresno shape includes Madera. Maps should draw Fresno and Madera from the county outlines (decision 2026-11-18).
- **Some 2013 values are blank on purpose.** For Hanford, Santa Rosa and Yuba City, Zillow's 2013 total monthly payment is wrong in its own files, so that column and the three computed from it (Income Needed, Share of Income, Affordable Home Price) are blank for 2013. Their mortgage payment and years to save are kept. Charts show a gap for those months.
- **Values are revised every release.** Comparing two releases can show different numbers for the same past month. That is expected, and both are kept.
- **Interest rate is the month's average,** so payments move with rates even when prices don't.

---

# Programmer Reference

## Data Contract

| Item | Value |
|---|---|
| Topic slug / module id | `zillow-affordability` |
| Python package | `scripts/zillow_affordability/` |
| Orchestrator | `scripts/orchestrators/zillow_affordability_pipeline.py` |
| Finished table | `data/data-cleaned/zillow-affordability/ZillowAffordability_Current.csv` |
| Snapshots | `data/data-cleaned/zillow-affordability/snapshots/ZillowAffordability_Release_<YYYY-MM-DD>.csv` |
| Raw downloads | `data/data-raw/zillow-affordability/` (gitignored) |
| Manual fallback | `data/data-raw/zillow-affordability/manual/`, all 12 files under Zillow's own filenames |
| Archive | `data/archive/zillow-affordability/` |

**Columns, in order:** `Release Date`, `Geographic Level`, `Location`, `Date`, `Housing Scenario`, `Mortgage Payment`, `Total Monthly Payment`, `Income Needed`, `Share of Income`, `Affordable Home Price`, `Years to Save`.

**Dtypes:** the first five are strings; the six measures are `float64` and stored at the source's full precision (no rounding, so values round-trip exactly and match the source cell).

**Grain:** `(Location, Date, Housing Scenario)` within the current table. Every row of `ZillowAffordability_Current.csv` carries the same `Release Date`; across snapshot files the grain extends to `(Release Date, Location, Date, Housing Scenario)`.

**Sort order:** `Geographic Level` (`Nation` first), `Location`, `Housing Scenario` in the order listed above, `Date`.

### Source-to-column map

| Series key | Zillow file (under `public_csvs/`) | Column | Scenario |
|---|---|---|---|
| `mortgage_payment_05` | `mortgage_payment/Metro_mortgage_payment_downpayment_0.05_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv` | Mortgage Payment | Buy (5% down) |
| `mortgage_payment_10` | `mortgage_payment/…downpayment_0.10…` | Mortgage Payment | Buy (10% down) |
| `mortgage_payment_20` | `mortgage_payment/…downpayment_0.20…` | Mortgage Payment | Buy (20% down) |
| `total_monthly_payment_05` / `_10` / `_20` | `total_monthly_payment/Metro_total_monthly_payment_downpayment_0.0X…` | Total Monthly Payment | Buy (5/10/20% down) |
| `new_homeowner_income_needed` | `new_homeowner_income_needed/…downpayment_0.20…` | Income Needed | Buy (20% down) |
| `new_homeowner_affordability` | `new_homeowner_affordability/…downpayment_0.20…` | Share of Income | Buy (20% down) |
| `affordable_price` | `affordable_price/…downpayment_0.20…` | Affordable Home Price | Buy (20% down) |
| `years_to_save` | `years_to_save/…downpayment_0.20…` | Years to Save | Buy (20% down) |
| `new_renter_income_needed` | `new_renter_income_needed/Metro_new_renter_income_needed_uc_sfrcondomfr_sm_sa_month.csv` | Income Needed | Rent |
| `new_renter_affordability` | `new_renter_affordability/Metro_new_renter_affordability_uc_sfrcondomfr_sm_sa_month.csv` | Share of Income | Rent |

The full filenames live in `config/sources.py`; this table abbreviates the repeated middle.

**Row selection:** `RegionType == "msa"` with `StateName == "CA"`, plus the single `RegionType == "country"` row. `Location` strips the trailing `", CA"`. `Geographic Level` maps `msa → Metro`, `country → Nation`.

**Row coverage:** a scenario has a row for every place and every month column present in that scenario's files. Rent rows therefore start at the renter files' first month (2015-01), and no rows are invented before it. A row stays even when all its values are blank (early renter months), so the grain is complete.

---

## Pipeline Phases

`build_zillow_affordability_dataset(config=None, logger=None)` runs five phases. Each wraps failures as `ZillowAffordabilityPipelinePhaseError("Phase N - <Name> failed: …")`. `config` may carry a `"paths"` override (used by tests).

| Phase | Does |
|---|---|
| 1 - Setup & Load | Paths, source config, schema config; load the saved current table (or `None`). |
| 2 - Acquisition | `acquire_with_fallback()` → `(payload, source_failed, source_used_manual)`. |
| 3 - Cleaning | Read each file, select California metros and the US, melt months, join the 12 series onto the grain, stamp `Release Date`; blank the hand-listed [known source errors](#known-source-errors) and build their reminders; `validate_cleaned()` is a hard gate. |
| 4 - Merge | `detect_new_data()` compares measures (ignoring `Release Date`) with the saved table; on new data, `summarize_revisions()` logs what changed. When nothing changed the saved table is kept as-is, including its original `Release Date`. |
| 5 - Validation & Finalize | `finalize_dataset()`, `validate_final()` (hard), `collect_warnings()` (soft, logged), then, only on new data, `write_release_snapshot()` followed by `write_current_dataset()`. |

**Fallback ladder.** Live (all 12 files) → manual folder (all 12 files present) → saved current table. Flags: live `(False, False)`, manual `(False, True)`, saved `(True, False)`. The saved table is returned unchanged with `new_data=False` and is not re-cleaned. If all three rungs fail, the error names each rung's failure. The ladder is all-or-nothing per rung: a release is never stitched together from live and manual files.

**Release date on the manual rung** is the newest modification date among the manual files, since a hand-copied file has no `Last-Modified` header. The run log says so.

**Write order.** The snapshot is written before the current table. If the current-table write then fails, the next run sees the same release as new again, finds an identical snapshot already saved, and finishes the write.

**Summary dict:** `dataframe`, `new_data`, `source_failed`, `source_used_manual`, `release_date`, `output_path`, `snapshot_path`, `row_count`, `revisions`, `warnings` (known-error reminders first, then soft checks), `known_source_errors` (per-error report).

---

## Functions

### `config/`

- `paths.get_paths()`: every path above, built from `lib.config.get_project_paths()`. Test file: `scripts/unit_tests/zillow_affordability/config/test_paths.py`
- `sources.get_source_config()`: base URL, the 12 series (key, relative path, column, scenario), HTTP headers and timeout from `lib.config.get_default_http_settings()`. Test file: `scripts/unit_tests/zillow_affordability/config/test_sources.py`
- `schemas.get_schema_config()`: output columns, measure columns, grain keys, scenario order, geographic-level map, expected locations, per-scenario applicable measures, earliest months, and soft-check tolerances. Test file: `scripts/unit_tests/zillow_affordability/config/test_schemas.py`

### `acquisition/`

- `zillow_downloader.download_all_series(source_config, download_directory)`: fetches all 12 files through the shared `fetch_response()`, writes each atomically, and returns `{"files": {key: path}, "release_date": "YYYY-MM-DD"}`. The release date is the newest `Last-Modified` date across the files. A 404 raises `ZillowLinkNotFoundError` naming the series, so the log says a link moved rather than that the code broke. Test file: `scripts/unit_tests/zillow_affordability/acquisition/test_zillow_downloader.py`
- `source_fallback.find_manual_files(source_config, manual_directory)`: returns the same payload shape from the manual folder, or raises naming the missing files. Test file: `scripts/unit_tests/zillow_affordability/acquisition/test_source_fallback.py`
- `source_fallback.acquire_with_fallback(source_config, paths, logger=None)`: the three-rung ladder. Test file: `scripts/unit_tests/zillow_affordability/acquisition/test_source_fallback.py`

### `cleaning/`

- `reshape_series.read_series_file(path)`: reads one Zillow CSV, failing loudly if the ID columns are missing or no month columns are found. Test file: `scripts/unit_tests/zillow_affordability/cleaning/test_reshape_series.py`
- `reshape_series.select_places(raw, schema_config)`: keeps California metros and the US row. Test file: same.
- `reshape_series.melt_series(selected, column, scenario, schema_config)`: wide months → long rows on the grain. Test file: same.
- `reshape_series.build_cleaned_dataset(files, release_date, source_config, schema_config)`: runs the three steps for every series, outer-joins them on the grain, adds blank columns for measures a scenario doesn't have, stamps `Release Date`. Fails if any series lacks an expected place. Test file: same.
- `known_source_errors.blank_known_source_errors(df, known_errors)`: blanks exactly the listed cells (places × months × scenarios × columns) on a copy. Returns a report per error: rows matched, cells blanked, and the raw total/mortgage ratio range before blanking. Never infers cells by rule. Test file: `scripts/unit_tests/zillow_affordability/cleaning/test_known_source_errors.py`

### `merging/`

- `historical_merge.load_current_dataset(paths)`: the saved table with string-typed key columns, or `None`. Test file: `scripts/unit_tests/zillow_affordability/merging/test_historical_merge.py`
- `historical_merge.detect_new_data(existing, new, schema_config)`: `True` when there is no saved table or any grain key or measure differs; ignores `Release Date`. Test file: same.
- `historical_merge.summarize_revisions(existing, new, schema_config)`: delegates to the shared `diff_revisions()` with `Date` as the period. Test file: same.

### `validation/`

- `zillow_affordability_validators.validate_cleaned(df, schema_config)`: hard checks 1–5 below. Test file: `scripts/unit_tests/zillow_affordability/validation/test_zillow_affordability_validators.py`
- `zillow_affordability_validators.validate_final(df, schema_config, existing=None)`: all hard checks. Test file: same.
- `zillow_affordability_validators.collect_warnings(df, schema_config)`: soft checks, returned as messages. Test file: same.

### `output/`

- `finalize_dataset.finalize_dataset(df, schema_config)`: column order, dtypes, sort. Test file: `scripts/unit_tests/zillow_affordability/output/test_finalize_dataset.py`
- `finalize_dataset.write_current_dataset(df, paths)`: shared `archive_and_save()`; returns the path or `None` when bytes are identical. Test file: same.
- `finalize_dataset.write_release_snapshot(df, paths)`: writes the release's snapshot once. An identical existing snapshot is left alone; a **different** one with the same release date raises, because a snapshot is never overwritten. Test file: same.

---

## Validation

### Hard checks (block the save)

| # | Check | Why |
|---|---|---|
| 1 | Columns exactly match the contract, in order | The app reads columns by name |
| 2 | Not empty | An empty table means the source changed shape |
| 3 | No duplicate `(Location, Date, Housing Scenario)` | Duplicates double-count in charts |
| 4 | `Geographic Level` and `Housing Scenario` values are in the allowed lists | Catches mislabelled rows |
| 5 | All 27 expected places present in every scenario | A missing metro means Zillow renamed or dropped it; a human should look |
| 6 | One `Release Date`, a real date, not in the future | The current table holds one release |
| 7 | `Date` is `YYYY-MM`, contiguous per place and scenario, starts no later than the configured first month, and ends no later than the release month | Catches dropped or future months |
| 8 | Measures that don't apply to a scenario are blank | Keeps the scenario table above true |
| 9 | All measures ≥ 0 | Costs, incomes, shares and years can't be negative |
| 10 | `Total Monthly Payment` ≥ `Mortgage Payment` where both are present | The total includes the mortgage |
| 11 | No `(Location, Date, Housing Scenario)` in the saved table disappears | Zillow doesn't drop history; a lost month signals a truncated file |

### Soft checks (logged, never block)

| Check | Why soft |
|---|---|
| `Total Monthly Payment × 12 ÷ Income Needed` at 20% down is within 0.30 ± 0.005 | Zillow's own identity; a drift is worth reading about, but the source is the authority |
| `Share of Income` above 1.0 | Possible in extreme markets, but worth a look |
| A place has no value in the latest month for a scenario | Zillow sometimes lags a series by a month |

---

## Frontend

| Piece | File |
|---|---|
| Client schema (fields, subsets, comparison dimension, monthly periods) | `lib/visualization/moduleSchemas/zillowAffordability.js` |
| Server reader (CSV parse, `queryLocations`, `queryFullTable`) | `lib/data/zillow_affordability.js` |
| Adapter | `zillowAffordabilityAdapter` in `lib/data/visualization/moduleAdapters.js` (generic adapter, no custom code) |
| API route (POST charts; GET `locations` and `table` only) | `app/api/zillow-affordability/route.js` |
| Default question | `lib/visualization/defaultQuestions.js`: Total Monthly Payment, Buy (10% down), San Francisco / Los Angeles / Sacramento / US, 2015-01 to latest (owner's chosen view, 2026-11-20); title reads "Total monthly payment over time by metro" via `labelMeta.subsetScopes` |
| Landing card, icon, freshness date | `lib/visualization/topicRegistry.js`, `components/landing/topicIcons.js`, `app/api/module-status/route.js` |
| Tests | `tests/js/lib/data/zillow_affordability_route.test.js`, plus the topic lists in the default-question, registry, generic-route, locations-view and Navbar tests |

- **Subsets:** `Metros and US` (Metro + Nation, the default, so metros can sit against the benchmark) and `Metros`, which is the level maps draw on. The US has no shape.
- **Comparison dimension:** `Housing Scenario`. Every comparison pins one scenario, because the scenarios carry different measures and never add up.
- **Which scenarios carry which measure:** each measure field declares `availableFor: { "Housing Scenario": [...] }`, mirroring the scenario table above. The comparison picker offers only those scenarios, and changing the outcome moves a comparison off a scenario that lacks the new measure (`reconcileComparisonsWithOutcomes` in `lib/visualization/comparisons.js`). Before this, Buy (5%/10% down) drew no line for Income Needed, and switching to Years to Save with a Rent comparison emptied the chart (found in the first preview, 2026-11-18). A test checks every `availableFor` list against where the committed CSV actually has values.
- **Units:** dollar measures use `usd`, Share of Income uses `share` (stored 0–1, shown as a percent) and Years to Save uses `years`. These are new self-formatting units in `lib/visualization/fieldTypes.js`. When a chart shows a measure's actual values and the reader has picked no number type, the axis and tooltips read `$2,820`, `44.2%` or `10.6`, so the labels carry no unit suffix. Other topics' units are unaffected.
- **Maps:** the `Metros` subset draws from `data/data-cleaned/geography/california-metros.geojson`; see [Metro Map Geometry](#metro-map-geometry).
- **Latest month is hard-coded** (`LATEST_MONTH` in the schema), the same convention as Building Permits. It must be bumped when new months land, or the editor's period list stops at the old month.

---

## Metro Map Geometry

The 26 metro shapes are shared app geometry, not part of this topic's pipeline. Building Permits' `Metros` subset uses them too.

| Step | File |
|---|---|
| Cut California out of the national CBSA file, split Fresno/Madera, rebuild shared borders | `scripts/shared/geography/extract_california_metros.py` → `assets/ca_metros.geojson` |
| Simplify, round, wind for drawing, check coverage | `scripts/shared/geography/simplify_geometries.py` (`metros` layer) → `data/data-cleaned/geography/california-metros.geojson` (26 features, about 1,500 points, 33 KB) |
| Serve and join | `lib/data/geography.js` (`metros` level; joins on `NAME` or `ALT_NAME`), `GEOMETRY_LEVEL_BY_SUBSET.Metros` in `lib/visualization/chartAvailability.js` |

- **Source:** the 2023 OMB CBSA boundaries (NTAD), saved by the researcher at `data/data-raw/zillow/NTAD_Core_Based_Statistical_Areas_*.geojson` (935 areas, 135 MB, gitignored). Only the 25 California metropolitan areas are kept. Micropolitan areas and out-of-state areas are dropped.
- **Fresno and Madera:** the 2023 delineation merged Madera County into the Fresno metro, but Zillow still reports them separately. Madera is the 2023 Fresno shape clipped to Madera County, and Fresno is the rest, so both keep the metro file's outer edge. Their areas match the counties within 1 km².
- **Join keys:** `GEOID` is the CBSA code (Madera keeps its pre-2023 code, 31460). `NAME` is Zillow's short label. `ALT_NAME` holds Building Permits' label where the two differ: Inland Empire (Riverside), Santa Barbara (Santa Maria) and Ventura (Oxnard).
- **Shared borders:** splitting Fresno adds a corner on Merced's border that Merced's ring lacks, and a sliver under the 11 m grid collapsed into a spike when rounded. Both failed the simplifier's coverage check. The extractor rounds to the simplifier's grid first, then rebuilds every shape from one noded set of border lines (`as_valid_coverage`), so neighbors share identical edges.
- **Water:** CBSA shapes include water, so San Francisco Bay and other bays fill in, where the county outlines show the shoreline.
- **Building Permits caveat:** the Census permit survey stopped reporting Madera after 2023-12, so recent Building Permits maps show 25 metros. Its post-2023 Fresno figures likely cover Fresno and Madera together, while the Fresno shape is Fresno County only. A developer should confirm this before publishing Building Permits metro maps.
- **Rebuild:** run the extractor with `--source <national CBSA file>`, then `simplify_geometries`. Both refuse to write when a check fails.

---

## Known Source Errors

Cells confirmed wrong in Zillow's own files are listed in `known_source_errors` in `config/schemas.py` and blanked in Phase 3. Each entry names its places, months, scenarios and columns explicitly, plus when it was recorded, the release it was found in, and why.

| Id | Places | Months | Scenarios | Columns blanked | Found in release |
|---|---|---|---|---|---|
| `zillow-2013-tax-insurance-spike` | Hanford, Santa Rosa, Yuba City | 2013-01 to 2013-12 | Buy (5%, 10%, 20% down) | Total Monthly Payment, Income Needed, Share of Income, Affordable Home Price | 2026-11-16 |

**Evidence.** Santa Rosa's total monthly payment at 20% down reads $1,788 in December 2012, $26,412 in January 2013, $31,950 in December 2013 and $2,319 in January 2014. The mortgage payment moves smoothly through the same months ($1,245 → $1,277 → $1,742 → $1,758), so the fault is in the tax, insurance or maintenance component. Hanford and Yuba City show the same pattern. Income Needed, Share of Income and Affordable Home Price are computed from the total, so they carry the error (for example, Hanford's 2013 affordable price reads about $15,000 against $226,000 a month earlier).

**Why a list, not a rule (owner decision 2026-11-18).** A ratio rule ("blank wherever total exceeds 3× mortgage") would separate these rows cleanly today: normal months run 1.15–1.80×. But it would also silently blank any future value that trips it, with nobody deciding. For now only cells a person has confirmed are blanked.

**Recheck at every refresh.** Each run adds a `known source error …` reminder to the run's warnings and log, with the matched rows' raw total/mortgage ratio for that release. If the ratio is back in the normal range, Zillow has fixed the data: remove the entry, re-run, and the corrected values flow in as a revision. If the entry matches no rows, Zillow has changed the series and the entry needs review.

---

## Source Facts and Design Decisions

- **Housing Scenario column (researcher, 2026-11-18).** The researcher asked for a down-payment breakdown for mortgage and total payments. Adding `Rent` as a fourth value puts renter income and share in the same columns as buying, which serves the topic's headline question better than separate renter columns.
- **Latest table plus per-release snapshots (researcher, 2026-11-18).** Keeping every release in one table would add about 2 MB a month and slow the app. Where the snapshot files are stored long term is a developer decision (see Open Items).
- **Fresno and Madera drawn from county outlines (researcher, 2026-11-18).** See [Caveats](#caveats).
- **Fixed links verified (2026-11-18).** All 12 links returned 200, and three were byte-identical in size to the researcher's downloads, with `Last-Modified` 2026-11-16.
- **Definitions** come from the Zillow Housing Data page as saved by the researcher on 2026-11-18. The 30% identity was also checked against the data: `Total Monthly Payment × 12 ÷ Income Needed = 0.300` for Fresno, Los Angeles and the US in October 2026.
- **`Nation` is a new `Geographic Level` value.** The existing vocabulary has no country level.
- **2013 values blanked by explicit list (owner decision 2026-11-18).** See [Known Source Errors](#known-source-errors).
- **No rounding.** Values keep the source's full precision so cross-checks match exactly. The app formats them for display.

---

## Open Items

- [ ] **At the next Zillow refresh:** recheck the 2013 [known source error](#known-source-errors) and remove it once Zillow corrects the data. Consider reporting it to Zillow Research.
- [ ] Decide whether known source errors should stay hand-listed or move to a reviewed rule (the 3× ratio separates them cleanly today).
- [ ] Confirm Zillow's terms allow republishing on the PPIC site.
- [ ] Decide where snapshot files live long term (committed, or external storage). About 2 MB per release.
- [ ] Add the topic to `projectSpec.md` and the `docs/agent/AGENTS.md` topic list.
- [ ] Confirm what Building Permits' post-2023 "Fresno" covers (see [Metro Map Geometry](#metro-map-geometry)).
- [ ] Consider moving `availableFor` and the self-formatting units into `projectSpec.md`'s shared field-catalog docs, since other topics can use them.
- [ ] Derive the schema's latest month from the data, or bump `LATEST_MONTH` with each refresh (shared issue with Building Permits).
- [ ] Schedule a monthly refresh. The pipeline runs unattended with no arguments.
- [ ] Review this specification and move it out of `Draft`.
