---
Topic: Process
Content Type: process documentation
pinned: false
description: "The process behind each module refactor and the key decisions made along the way, with the reasoning that justified them. A narrative companion to projectSpec (the architecture reference) and the per-module refractor guides (the per-function as-built docs)."
Date Published: June 22, 2026
Last Updated: 07/09/2026 - 5:00 PM
Status: Updating
---

# The Refactor Process

How each legacy dataset was migrated into the V3 architecture, and why the decisions that shaped each migration were made.

> [!info] Who this document is for and how it relates to the others
> This document is a **process and decision journal**. It records the *order* in which each module was built, the *choices* made during the migration, the *reasoning* behind them, and the *surprises* that only surfaced when the pipeline first met live data. It is deliberately narrative.
>
> It sits alongside three other documents and does not repeat them:
> - [[projectSpec]] is the **architecture and API reference** — what the system is and how it is structured.
> - The per-module refractor guides ([[pophousing-pipeline-refractor]], [[components-of-change-refractor]], [[age-sex-race-projections-refractor]], [[acs-housing-stress-refractor]], [[building-permits-refractor]]) are the **per-function as-built** documents.
> - [[previous_tool_analysis]] is the **legacy codebase breakdown** every migration started from.
>
> If you want to know *what the code does*, read the spec and the guides. If you want to know *why it was built the way it was, and what we learned building it*, read this.

---

## The Shared Refactor Playbook

Every module followed the same arc. The playbook was not designed up front; it emerged from **Population & Housing** (the first migration), was written down as a repeatable template, and each later module refined it. By the time all five legacy datasets were migrated, the sequence below was routine.

### The seven steps

| Step | What happens | Output |
|---|---|---|
| 1. Analyze the legacy module | Read the notebook / Shiny script, inventory every function, its data sources, and its fragilities. | A section of [[previous_tool_analysis]] and the "Legacy Module Summary" of the module's refractor guide. |
| 2. Write the refactor plan | Map legacy code to V3 targets, define the data contract (grain + columns), specify every pipeline phase as a docstring-only function signature, and resolve the open design decisions **with the user**. | A `*-refractor.md` planning doc. |
| 3. Write the tests (from module 3 onward) | For Projections, Housing Stress, and Building Permits the unit-test suite was written **first** and used as the authoritative contract. | A `scripts/unit_tests/<module>/` tree of red tests. |
| 4. Implement phase by phase | Build config → acquisition → cleaning → aggregation → merge → validation → output → orchestrator, confirming with the user before moving to the next phase. | Green tests, `ruff`-clean Python. |
| 5. Wire the frontend | Add the module schema, the `lib/data/<module>.js` access layer, and the `app/api/<module>/route.js` route; register the module. | A live `/<module>` chart-editor page. |
| 6. Run it against live sources | Take the pipeline off mocks and point it at the real upstream. **This is where every module broke** — see each module's "First live run" note below. | A verified end-to-end run and a set of regression tests. |
| 7. Audit and harden | Reliability, robustness, efficiency, and manual sign-off passes, tracked in the *Module Audit Status* table in [[projectSpec]]. | Audit chips advanced from Not Started toward Verified. |

> [!note] Five canonical phases, PopHousing is the expansion
> PopHousing runs **six** orchestrated phases (it validates input up front and keeps Enrichment as a separate phase after Merge). The four modules built after it settled on **five canonical phases** — Setup & Load, Acquisition, Transform, Merge, Finalize/Validate/Save. PopHousing is framed as *its own expansion* of that five-phase shape, not as the template the others must copy. See the *Architecture Overview* in [[projectSpec]].

### Project-wide decisions that hold for every module

These were settled once, early, and treated as requirements rather than preferences for the rest of the project.

| Decision | Justification |
|---|---|
| **Three-layer backend** (`shared/` mechanisms → `<module>/` domain → `orchestrators/` sequencing), one-way dependency. | Keeps shared code project-independent and testable with generic fixtures; a module can be understood and tested without reading any other module. |
| **One cleaned CSV per module is the contract.** The backend's only job is to produce it; the frontend's only input is to read it. | Decouples the ETL from the UI. Either half can be rebuilt without touching the other, and the contract is the single thing to validate. |
| **Acquisition degrades, it does not fail.** A failed live source falls back (manual file, then last-saved canonical) rather than aborting. | A transient upstream outage should not take the site down or blank a dataset. |
| **Writes are conditional.** The canonical CSV is re-archived and re-saved only when the data actually changed. | Prevents archive churn and keeps run history meaningful. (Change-detection got this wrong in more than one module — see *Cross-cutting patterns*.) |
| **Every failure names its source.** When error handling is exhausted, the system says which phase, which validator, or which API stage broke. | A researcher or a future contributor should never face a silent or generic failure. |
| **Documented for non-developers.** Each module ships a two-half refractor guide: a plain-language half and a per-function programmer half. | The project has to outlive its authors and be legible to the researchers who use it. |
| **Test-first from module 3 onward.** | Writing the contract as tests before the implementation caught schema drift early and made the phase-by-phase build mechanical. |

> [!warning] Mocked orchestrator tests hide integration seams
> The single most repeated lesson of the project: **a green test suite is not a working pipeline.** Every module's orchestrator tests mocked the network and the file seams, so they passed while the real run crashed on the first live attempt. The gaps were always at the seams the mocks papered over — filename patterns, encodings, the shape passed between acquisition and cleaning, config keys the orchestrator read but the config never defined. Step 6 (a real run) is non-negotiable, and each module below carries the specific reconciliation it needed.

---

## Population & Housing (PopHousing)

**Order: first.** PopHousing is the module that *defined* the template. There was no playbook yet; the three-layer boundary, the contract-CSV idea, the phase structure, and the two-half documentation convention were all worked out here and then generalized.

### Key decisions

| Decision | Justification |
|---|---|
| Split the source into **E-5 (modern estimates)** and **E-8 (historical)** with a separate historical sub-pipeline. | The two DoF products have different schemas and cadences; merging them into one contract needed a dedicated historical build ("Phase 0"). |
| Keep a **hierarchical location cleaner** that classifies State / County / Region / town rows with context lookahead. | The E-5 workbooks encode geography positionally and ambiguously; classification needs surrounding rows, not just the current one. |
| Put California county/region geography in **`scripts/shared/geography/`**, not in the module. | It is reference data two modules genuinely share (PopHousing and, later, Components of Change), which is exactly what the shared reference-data provider is for. |
| Cross-module run logging surfaced on **`/logs`** as structured JSONL + a per-run `.log`. | Operators need to see what each nightly run did without reading the server console. |

### First live run and what it taught

PopHousing was the proving ground for the whole shape, so its "surprises" were conceptual rather than a single crash: it established that the contract CSV, the conditional archive/save, and the degrade-don't-fail acquisition all needed to exist. Those ideas became the project-wide decisions above.

### Fragilities carried forward

Recorded in the guide's "Flagged Issues" section and **not fixed** (documenting a refactor does not license changing its code):

- **Self-perpetuating history.** `HISTORICAL_DATA_PATH == CURRENT_DATA_PATH`, so the orchestrator reads `PopHousing_Current.csv` as its own pre-2020 baseline and writes back to it. There is no immutable canonical E-8 file; the Phase 1 historical validator is the only guard. This pattern recurs in **every** module.
- **The E-8 historical build is unwired.** `build_historical_housing_dataset` has no non-test caller; refreshing deep history is a manual operation.
- **Logging is stubbed.** `scripts/shared/logging/*` bodies are all `pass` even though docstrings imply the orchestrator logs.
- **A validator is tested but unused** (`has_meaningful_housing_data`, superseded by a vectorized path), and the ambiguous-location lookahead is bypassed in the wired loop.

---

## Components of Change

**Order: second — the first module built by *following* PopHousing's template rather than defining it.** This was the project's first evidence that the module shape generalizes: someone could take the playbook and produce a working module without re-deriving the architecture.

### Key decisions

| Decision | Justification |
|---|---|
| Dual source: **DoF E-6** (state/county components) merged with **U.S. Census** county population component estimates. | The legacy notebook combined both; the V3 contract had to carry both in one grain (1991–2025). |
| Reuse the shared California geography and a shared additive-aggregation helper. | The regional roll-ups are the same operation PopHousing already had. |

### First live run and the fixes it forced (2026-07-01)

Both live acquisitions were broken, and the pipeline was **silently falling back to the saved CSV** — the `main()` summary hid the `dof_failed=True` / `census_failed=True` flags. Reconciled the same day; the pipeline then pulled live and produced 4,018 rows (1991–2025), up from the stale 3,716 / 1991–2024.

| Break | Cause | Fix |
|---|---|---|
| DoF E-6 scraper found nothing | It required a `et_pb_text_inner` CSS class DoF had removed in a site redesign. | Rewrote discovery to follow the anchor whose path slug is `e-6`, with a positional fallback (greatest year in link text) and a first-workbook-link helper. |
| Census download failed with a certificate error | It used `pd.read_csv(url)` (system certs) while discovery used the shared `fetch_response` (certifi). | Route `http(s)` URLs through `fetch_response` + `BytesIO`; keep local paths on `pd.read_csv`. |
| E-6 `.xlsx` read failed | `openpyxl` was not installed and there is no dependency manifest. | Installed it — but this is **not captured anywhere**; a fresh environment will hit it again. |
| Archive churned on every run | Freshly cleaned columns are nullable `Float64` (`pd.NA`) while the reloaded CSV is numpy `float64` (`np.nan`); the equality check treated them as different, so 68 first-year NaN rows always "differed." | Added `_normalize_numeric_dtypes` to cast both frames to numpy `float64` before comparing. A live re-run now reports no new data and writes nothing. |

### Fragilities carried forward

Truncated-county repair mixes exact-string replacement (keys with trailing spaces) with positional `zip`, so DoF whitespace or ordering changes can silently mislabel rows; the Census reshape assumes the first six columns are IDs; `aggregation/regional_aggregation.py` reaches into a **private** PopHousing helper (`_aggregate_additive_columns`), a layering smell that should be promoted into `shared/`; and the E-6 cleaner drops its earliest year every run, so a from-scratch rebuild is missing the first year until the second run.

---

## Age, Sex & Race Projections (Demographic Projections)

**Order: third — the first module built entirely test-first.** The unit-test suite existed before any implementation and was read as the contract for each phase. This is the largest module by row count.

### Key decisions

| Decision | Justification |
|---|---|
| Dual source: **DoF P-3 projections** (County/Region/State, 2020–2070) + **Census cc-est estimates** (US/State, 2020–2025) in one contract. | The legacy tool showed projections against estimates; the contract carries both, distinguished by a `Source` column. |
| Archive directory named **`archive`**, not `data-archive`. | User choice, pinned by tests. |
| The cc-est reshaper treats a `TOT`-prefixed male/female column as an ignorable total but **raises on any other unmapped race prefix**. | Fail loud on genuinely unknown Census columns rather than silently dropping data. |
| Offline mode via `build_projections_dataset(config={"offline": True})` or `PROJECTIONS_OFFLINE=1`. | Lets the pipeline be exercised end-to-end without the ~100MB live download. |

### First live run and the fixes it forced (2026-07-03)

All 199 unit tests passed while a real run crashed — the canonical example of the mocked-tests lesson. Fixed the same day; the live run now writes **1,718,208 rows**, is idempotent, and has zero duplicate keys (972 tests pass overall).

| Break | Cause | Fix |
|---|---|---|
| DoF scraper matched nothing | Its regex required `P-3.*` but DoF serves `P3_Complete.zip` (no hyphen). | Relaxed to `P-?3.*` across both discovery strategies and the cache pattern. |
| Census discovery never worked | The base URL lists vintage folders, not CSVs, and the nested listing is too large to scrape. | Rewrote discovery to parse the latest `YYYY-YYYY/` vintage from the root and **construct** the cc-est URL directly. |
| 1.84M duplicate keys | On source failure the fallback returned already-enriched saved rows (rollups + marginals), which Phase 4 then re-aggregated. | Added `_reduce_to_base_strata()` to strip fallback rows back to base County / US-State strata before aggregation. |
| Accented county names corrupted | `parse_ccest_csv` read UTF-8 but Census PEP files are Latin-1 ("Doña Ana"). | Read with `encoding="latin-1"`. |
| Cleaning missing a config key | `get_schema_config()` lacked `census_rename_map` (tests supplied their own). | Added it and added it to the required-keys contract test. |
| Silent failures | The CLI hid `dof_failed` / `census_failed`. | Print explicit WARNING lines. |

### Efficiency pass (also 2026-07-03)

The first module to get a real performance pass: `assign_geographic_level` vectorized (3.29s → 0.21s on 1.72M rows); `archive_and_save` streams a SHA-256 hash + `shutil.copy2` instead of reading two full files into strings (peak ~189MB → ~2MB); the canonical CSV is read once and threaded through; the DoF cleaner uses `usecols=` to drop a redundant 4.6M-row copy. The frontend `loadProjectionsData()` parsing the whole ~87MB CSV per server process remains the open efficiency item.

### Fragilities carried forward

Change detection compares mismatched grains (base strata vs. an enriched saved file) so the "new data" flags are effectively always true — real idempotency comes only from the byte-hash no-op in `archive_and_save`. The Census year-code map is hard-capped at 2025 while the downloader auto-selects the newest vintage, so cc-est2026 will raise. The P-3 horizon (2020, 2070) and a FIPS-to-county map built by arithmetic are both brittle against source drift.

---

## ACS Housing Stress

**Order: fourth — test-first.** Built from Census ACS table **B25140** (housing cost burden).

### Key decisions

| Decision | Justification |
|---|---|
| Keep **PUMA → county/region aggregation** as an approximation, documented as a caveat. | ACS publishes at PUMA grain; the county/region view the legacy tool showed is inherently approximate, and saying so is better than pretending otherwise. |
| Reconcile the **9 ACS race iterations toward 7 canonical groups** plus "Other" and "All"; rename legacy `Label` → `Tenure`. | Aligns with the race grouping the other modules use while keeping the ACS-specific tenure dimension. |
| Contract holds the **latest vintage only**; history accumulates across runs. | The pipeline fetches one vintage per run. The legacy 2012–2023 CSV used a different (wrong) schema and corrupted the merge, so it was set aside as `.legacy-2012-2023.csv.bak`; back-filling it is a separate, un-done migration. |
| Download each national `.dat` **once** and filter all 50 states in memory. | The naive approach issued ~900 requests (one per state × table); one download per table is dramatically cheaper. |

### First live run and the fixes it forced (2026-07-01)

Verified end-to-end against live ACS: resolved vintage 2024, wrote 4,525 rows, idempotent on re-run. The mocked tests had hidden three acquisition gaps:

- **Vintage resolution now advances past a timeout/connection error, not just a 404** — census.gov *hangs* rather than 404s for not-yet-published vintages (2025, 2026). A parse `ValueError` still raises.
- **A national-table download path was added** so the orchestrator could fetch once and filter in memory.
- **`paths.py` gained `manual_state_path` / `manual_ca_path`** the orchestrator already referenced.

A separate frontend bug surfaced here but affected **all** modules: navigating between modules (all under `/[module]`) reused one `ChartConfigProvider` instance, so the prior module's field bindings lingered and failed validation against the new schema ("Resolve the configuration errors" on every preset). Fixed with `key={moduleId}` to remount the provider per module.

### Fragilities carried forward

The most serious: the **manual and last-saved fallback tiers return a DataFrame where Phase 3 expects a dict of raw iteration frames**, so a live-acquisition failure *crashes* Phase 3 instead of degrading — only the live path is exercised end-to-end. A transient hang can silently resolve an older vintage; the vintage lookback window is only three years; the final-stage non-negative check is a silent no-op (it reads `number_columns` but the config supplies `nonnegative_columns`); and `validate_cleaning_output` is defined and tested but never wired.

---

## Building Permits

**Order: fifth — test-first, and the first monthly module. Its migration completed all five original legacy datasets.**

> [!success] Milestone (2026-07-03)
> With Building Permits migrated, **all five V1 legacy datasets run on the V3 architecture.** No original notebook dataset remains un-migrated; further work is enhancement, not net-new module migration.

### Key decisions

| Decision | Justification |
|---|---|
| Store data at **CBSA metro grain** (as a `Metro` level, plus `State`); make the 9-region roll-up a **frontend aggregate**, not a stored level. | County grain is not derivable (metros span multiple counties). Keeping metros as the stored grain and aggregating regions in the data-access layer avoids baking a lossy roll-up into the contract. Rural (no-CBSA) counties are under-counted in region aggregates — a documented caveat. |
| Lift the metro constants (`cbsa_metros`, `metro_to_county_mapping`, `metro_to_region_mapping`) into **shared** `california_geography.py`. | They are reference data, and the frontend needs a JS mirror (`lib/geography/californiaGeography.js`) of the same maps. |
| **Seed deep history from the legacy snapshot; let the live pipeline own the present.** | The Census `cbsamonthly_*.xls` / `statemonthly_*.xls` endpoints host only a **rolling ~2-year window** (as of 2026-07, back to 2024-01; 2010–2023 return 404). A cold-start run *cannot* rebuild deep history, so `BuildingPermits_06-16-25.csv` (2010-01 → 2025-01, already contract-shaped) was seeded into the contract path first. The result is 197 months / 14,691 rows. |
| Month-aware shaping (trailing-12 YTD, index-to-100, two-period change, region aggregate) lives in **`lib/data/building_permits.js`**, not shared `query_shapes.js`. | The shared render layer is year-centric; the monthly `Date` = "YYYY-MM" axis needs module-local shaping. |

### First live run and the constraints it exposed

The pipeline verified end-to-end against live Census BPS for the rolling window. The hard-won constraints:

- `acquire_months` **skips** not-yet-published months (logged) instead of aborting; contiguity is checked across the *present* range, not back to 2010-01.
- Current BPS has **25** CA metros, not 26 — **Madera** was de-delineated (older seeded months still carry it). Validation requires metros ⊆ the canonical 26 ("up to 26").
- **CBSA display names drift** (San Francisco is now "San Francisco-Oakland-Fremont"); a CBSA-*code* rename map (12540 / 41860 / 44700) pins canonical names through the drift.
- `.xls` parsing needs `xlrd>=2.0.1` in the pipeline venv.

### Fragilities carried forward

This module's self-perpetuating-history problem is **sharper** than the others: because deep history exists only in the seeded `Current.csv` and the source can never re-supply it, losing that file loses 2010–2023 permanently. `validate_cleaning_output` is again defined, tested, and unwired; month resolution has no fallback (a transient blip at the probe step aborts the run); and the cleaners `.astype(int)` after only `dropna(how="all")`, so a single blank measure cell raises. On the positive side, the generic-exception fallback here degrades *cleanly* (unlike Housing Stress) — an `isinstance`-dict guard yields empty frames, the merge becomes a no-op, and nothing is written.

---

## Cross-cutting patterns

Reading the five migrations together, the same shapes recur. They are worth calling out because a sixth module will hit them too.

### Mocked orchestrator tests hide integration seams

Stated once above, but it is the throughline: **Components, Projections, and Housing Stress all passed their full suites and then crashed on the first live run**, always at a seam the mocks abstracted away — a filename pattern, an encoding, the shape passed between phases, a config key the orchestrator read but the config never set. Budget for a real run and a round of regression tests after every "done" pipeline.

### Self-perpetuating history

In **every** module, `historical_data_path == current_data_path`. The orchestrator reads its own prior output as the historical baseline and writes back to the same file. There is no immutable canonical of record. It works because writes are conditional and validators guard the merge, but it means a corrupted or lost `Current.csv` cannot be re-derived — most dangerously in Building Permits, where the source cannot re-supply deep history.

### Stubbed logging

`scripts/shared/logging/pipeline_logging.py` and `dataframe_logging.py` have `pass` bodies and "Not yet implemented" tests across the whole project, even though orchestrator docstrings imply logging happens. The `/logs` feed is fed by the PopHousing JSONL path; wiring the shared logging module for every pipeline is outstanding work. (See [[logs notes]] for the intended log-card design.)

### Tested-but-unwired validators

`validate_cleaning_output` (Projections, Housing Stress, Building Permits) and `has_meaningful_housing_data` (PopHousing) are all defined and covered by tests but never called in the wired path. They look like safety nets and are not.

### Rolling-window sources need a seed

Building Permits is the clearest case, but the pattern is general: when an upstream only hosts recent data, a cold-start run is recent-only, and deep history has to be seeded from a snapshot the live pipeline then maintains forward. The contiguity check must be written to pass on the present range, and the seed becomes an irreplaceable system of record.

---

## The Graph-Editor Overhaul

**Completed and signed off 2026-07-07.** Once all five modules were migrated, the frontend work shifted from per-module wiring to a shared upgrade: turning the chart-builder into a Datawrapper-class editor. Full as-built detail is in [[graphEditor-overhaul]]; the process and the decisions are summarized here.

### How it was run

Eight phases (0–7), gated by the user, verified by **339 Vitest tests + eslint + `npm run build`**. Red acceptance tests for Phases 5–7 were written first (TDD); Phases 2–4 were implemented by the user's `code-implementer` subagent and reconciled by the orchestrator, which caught real bugs the subagent left (for example, inline-data mode still running schema-coupled validators, so every inline binding raised `UNKNOWN_FIELD`).

> [!warning] Verification was unit-test + lint + build only
> No in-browser click-through was done in any phase. Two non-blocking follow-ups need a running server: the Building Permits category/bar shared-view, and a monthly range control. Component visual styling is unverified.

### Key decisions

| Decision | Justification |
|---|---|
| **Bidirectional R / Stata code editor** — parse a recognized ggplot2 / Stata subset into the chart spec, not WebR execution. | A code-only researcher can *write* R or Stata and get a chart, symmetric across both languages, without shipping a language runtime to the browser. Unrecognized commands degrade to a `CODE_UNSUPPORTED` warning. |
| **Spec v2** replaces the v1 `filters`-smuggling of transform/chartType/appearance and adds `data.inline`, `format`, `appearance.palette`/`seriesColors` (brand-token ids, never raw hex), `annotations`, and `tier`. | Fixes a flagged frontend issue at its root and makes user-supplied data a first-class, client-only concept. |
| **Grow the catalog by variants, not components** — only three new registry ids (`pie`, `symbolMap`, `dataTable`); donut, pyramid, stacked, and area are appearance variants. | Keeps the chart catalog small and the code surface manageable; locator maps and mini-chart tables were dropped from v1 for the same reason. |
| **Module-owned presets.** | Replaces the deleted `PresetPicker`; each module declares its own presets that must pass validation, so Building Permits and Projections get bespoke chart shapes without a per-module React component. |
| **Export is the sharing story** — PNG/SVG/JPEG via Plotly.toImage, PDF via jsPDF + svg2pdf.js, data as CSV/XLSX. No server-side share links. **Telemetry off** — only a local in-memory Activity log. | The user chose local-only: user data never leaves the browser, and there is nothing to host or secure. |

The overhaul also resolved all six previously flagged frontend issues (transforms no-op off line charts, stale-preset hidden encodings, county-only maps with silent GEOID drops, base-year mismatch, savedViews overload, hand-synced palette), with the palette single-owner build step added as a seventh fix in Phase 0.

---

## The Audit Process

Migration builds a module; **auditing hardens it.** The *Module Audit Status* table in [[projectSpec]] tracks each module across six dimensions, using the shared design-system status chips (Verified / In Progress / Not Started).

| Dimension | What it certifies |
|---|---|
| **Reliability** | A deliberate audit of the live-source scrapers and failure paths, with regression tests. |
| **Robustness** | The pipeline degrades correctly under partial failure (missing source, malformed release, idempotent re-runs) and is tested for those paths. |
| **Efficiency** | A performance pass (memory, redundant reads, vectorization) has been done. |
| **Live functionality** | A verified end-to-end run against the live upstream source. |
| **Offline functionality** | A verified end-to-end run using local data, without the upstream. |
| **Manually verified** | Signed off by the project lead against the rendered site, not just a green pipeline. |

The dimensions are orthogonal to migration status: a module can be **Active** (migrated, live-verified) yet **un-audited** for robustness or efficiency. As of the last spec update, **Live functionality is Verified for all five modules** and **Offline functionality for four**, while the deeper Reliability / Robustness / Efficiency / Manual passes are mostly still Not Started — Demographic Projections is the furthest along, having received the first real reliability and efficiency passes on 2026-07-03.

---

## Open Items

The recurring, still-open work items across the project. None block the current site; all are hardening.

- [ ] **Wire the shared logging module** for every pipeline; today only the PopHousing JSONL path feeds `/logs`, and `scripts/shared/logging/*` is stubbed.
- [ ] **Add a dependency manifest.** There is no `requirements.txt` / `[project]` deps section; `openpyxl`, `xlrd>=2.0.1`, and others are environment-only and a fresh checkout will fail.
- [ ] **Give each module an immutable canonical of record** (or at least separate the read-baseline from the write-target) to end the self-perpetuating-history pattern — most urgent for Building Permits, whose deep history is irreplaceable.
- [ ] **Wire or remove the tested-but-unused validators** (`validate_cleaning_output`, `has_meaningful_housing_data`).
- [ ] **Fix the Housing Stress fallback tiers** so a live-acquisition failure degrades instead of crashing Phase 3.
- [ ] **Back-fill the set-aside historical series** (Housing Stress 2012–2023) into the V3 schema.
- [ ] **Reduce the Projections frontend parse cost** (`loadProjectionsData()` reads the whole ~87MB CSV per server process).
- [ ] **Close the graph-editor follow-ups** that need a running server: Building Permits category/bar shared-view and the monthly range control, plus an in-browser click-through of the new editor surfaces.
