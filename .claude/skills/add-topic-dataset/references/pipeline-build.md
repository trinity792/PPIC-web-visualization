# Pipeline Build Recipe

The technical recipe for Stage 3 (build) and Stage 4 (prove it works) of Mode A, and for any code fix in Mode B. The researcher doesn't see this work, so hold yourself to the standard a developer or programmer will review it against.

**Contents:** 1 Read first · 2 Names · 3 Folder layout · 4 Reuse before writing · 5 Data contract · 6 Orchestrator and phases · 7 Validation · 8 Saving, history, and idempotency · 9 Tests · 10 Commands · 11 Specification · 12 Hand-off items

---

## 1. Read first

| Read | Why |
|---|---|
| `docs/agent/python-skill.md` | File header, section banners, and docstring rules every `.py` file must follow, including the `Test file:` line in each function docstring |
| `docs/specifications/projectSpec.md` → "Data Pipeline Architecture", "Data Contracts" | The shared rules this pipeline must obey |
| `scripts/orchestrators/rhna_progress_pipeline.py` and `scripts/rhna_progress/` | **The model to copy.** It's the newest topic and was built specification → tests → code |
| `docs/specifications/rhna-progress-report-topic-specification.md` | The model for the topic specification |
| `scripts/building_permits/` | Predictable sources: probing backward for the newest period, plus a rolling window backed by a history file |
| `scripts/pophousing/` or `scripts/projections/` acquisition | Findable sources discovered from a landing page |

Copy the *patterns*, not the code. Each topic's cleaning is specific to its source.

---

## 2. Names

Choose a short kebab-case **topic slug** with the researcher's input (e.g. `childcare-costs`). First check that it doesn't collide with an existing folder under `scripts/`, `data/data-cleaned/`, or `app/api/`.

| Thing | Name |
|---|---|
| Module id (run logs, archive names, app) | `<topic-slug>` |
| Python package | `scripts/<topic_snake>/` |
| Orchestrator | `scripts/orchestrators/<topic_snake>_pipeline.py` |
| Finished table | `data/data-cleaned/<topic-slug>/<PascalName>_Current.csv` |
| History file (only if needed) | `data/data-cleaned/<topic-slug>/<PascalName>_Historical.csv` |
| Raw downloads and manual files | `data/data-raw/<topic-slug>/` (gitignored) |
| Manual fallback file | `data/data-raw/<topic-slug>/<PascalName>_Downloaded.<ext>` |
| Archive | `data/archive/<topic-slug>/` (gitignored) |
| Phase error class | `<PascalName>PipelinePhaseError` |
| Tests | `scripts/unit_tests/<topic_snake>/` mirroring the package, plus `scripts/unit_tests/orchestrators/test_<topic_snake>_pipeline.py` |

---

## 3. Folder layout

Mirror RHNA. Include only the folders the topic needs, and put an `__init__.py` in each.

```text
scripts/<topic_snake>/
├── config/
│   ├── paths.py          get_paths(): every path, built from lib.config.get_project_paths()
│   ├── sources.py        get_source_config(): URLs or patterns, discovery settings, HTTP defaults
│   └── schemas.py        get_schema_config(): column order, dtypes, grain keys, allowed values, validation configs
├── acquisition/
│   ├── <source>_downloader.py   one bounded download or discovery operation per source
│   └── source_fallback.py       the live → manual file → last saved ladder
├── cleaning/             normalize columns, types, names, and missing-value markers; reshape to the grain
├── geography/            (if needed) geographic level, county/region assignment
├── enrichment/           (if needed) derived measures: rates, shares, totals
├── merging/
│   └── historical_merge.py      load saved table and history file, combine, detect new data, summarize revisions
├── validation/
│   └── <topic_snake>_validators.py   validate_cleaned() and validate_final()
└── output/
    └── finalize_dataset.py      column order and dtypes, plus write via archive_and_save
```

**Workers** do one bounded job, take explicit inputs, and return data. **Only the orchestrator** decides sequence, fallback, and what blocks a save. Don't let a worker quietly take over another phase's job (for example, a downloader that also cleans).

---

## 4. Reuse before writing

Search `scripts/shared/` before writing any helper. Use these where they fit:

| Need | Shared owner |
|---|---|
| Project paths, HTTP headers and timeout | `lib/config.py` → `get_project_paths()`, `get_default_http_settings()` |
| HTTP requests and downloads | `scripts/shared/downloads/http_downloads.py` → `fetch_response()`, `download_file()` (raises with `status_code`, so a 404 is distinguishable from a network fault) |
| California counties, PPIC regions, metros | `scripts/shared/geography/california_geography.py` → `get_california_geography()` |
| Common dataframe checks | `scripts/shared/validation/dataframe_validators.py` |
| Type coercion, row filters, aggregation | `scripts/shared/data_cleaning/` |
| Revision detection and log text | `scripts/shared/logging/revision_diff.py` → `diff_revisions()`, `format_revision_summary()` |
| Safe, idempotent save with archive | `scripts/shared/archives/dataset_archive.py` → `archive_and_save()` |
| Run records for the Logs page | `scripts/shared/logging/run_records.py` → `execute_pipeline_run()` |
| Log lines | `scripts/shared/logging/pipeline_logging.py` → `log_message()` |

**Do not modify shared code**, `lib/config.py`, `lib/pophousing_config.py`, or other topics. If a shared helper almost fits, write a small topic-local helper and record a "needs a developer or programmer" item suggesting the shared change. Do the same for any new pip dependency: stop, design around it if you can, and record it. Use the HTTP and parsing libraries already in `web-viz-venv`.

---

## 5. Data contract (`schemas.py`)

The approved dataset plan is the input. Turn it into code.

- **Column names match existing topics where the meaning matches:** `Geographic Level`, `Location`, `Year` (or `Date` for monthly data, `YYYY-MM`), and `Source` for provenance. The app relies on shared conventions, so don't invent `Geo_Type` when `Geographic Level` already exists.
- **Geographic Level vocabulary** in use: `State`, `Region`, `County`, `City`, `Town`, `Metro`. Reuse these values. Region and county names come from `get_california_geography()`. Never type them out by hand.
- **Grain keys:** the columns that make a row unique (e.g. `Geographic Level`, `Location`, `Year`, plus any breakdowns like `Race/Ethnicity`).
- **Column order and dtypes**, enforced in `finalize_dataset()`. Pin integer columns with nullable `Int64` so a missing value doesn't silently turn the column into floats.
- **Missing and suppressed values stay missing** (`NaN`). Never fill with `0`. Zero is a real value and would change every average and total. If the source distinguishes "suppressed" from "not collected", keep that distinction (for example in a flag column) when the researcher said it matters.
- **Provenance:** at least a `Source` column when there's more than one source, and a source-updated date when the publisher gives one.
- **Derived measures** (rates, shares) are computed from the stored counts in `enrichment/`, with the formula written in the specification.

---

## 6. Orchestrator and phases

Copy the structure of `rhna_progress_pipeline.py`:

- a `<PascalName>PipelinePhaseError(RuntimeError)` class and a `_raise_phase_error(phase_name, error)` helper;
- one `build_<topic_snake>_dataset(config=None, logger=None)` function running five phases, each in its own `try` that re-raises the phase error and wraps anything else as `"Phase N - <Name> failed: …"` (the Logs page parses that wording);
- a `__main__` block calling `execute_pipeline_run({"module_id": "<topic-slug>", "module_label": "<Display Name>", "phase_total": 5}, build_<topic_snake>_dataset, get_paths()["logs_directory"])`.

| Phase | Does |
|---|---|
| 1 - Setup & Load | paths, source config, schema config, geography, saved table, history file |
| 2 - Acquisition | `acquire_with_fallback()` returns `(payload, source_failed, source_used_manual)` |
| 3 - Cleaning | raw → grain-shaped frame, then `validate_cleaned()`, which is a hard failure on any problem |
| 4 - Enrichment & Merge | geography and derived measures, combine with saved table and history, detect new data, summarize revisions into the log |
| 5 - Validation & Finalize | `finalize_dataset()`, `validate_final()` (hard failures block the write), then `archive_and_save()` |

**Fallback rules** (see `link-stability.md`):

- When acquisition returns the **last saved table**, it's already contract-shaped. Return it straight away with `new_data=False` and `source_failed=True`. Don't send it through cleaning again.
- A **manual file** *is* raw, so it goes through cleaning and validation like a live download.
- If all three rungs fail, raise a clear error that names every rung that was tried.

**Return a summary dict** with at least `dataframe`, `new_data`, `source_failed`, `source_used_manual`, `output_path` (None when unchanged), `row_count`, and `revisions`. `execute_pipeline_run` marks a run "recovered" instead of "success" only when a truthy key matches `FALLBACK_FLAG_PATTERN` in `run_records.py`: keys ending in `_failed` or `used_manual`. Check that pattern before inventing a new flag name. A fallback flag it doesn't recognize would make a manual-file or last-saved run look like a clean success on the Logs page.

**Make it automation-ready.** It must run with no arguments and no prompts, and need nothing a scheduled job wouldn't have.

---

## 7. Validation

Two validators, both returning `(is_valid, messages)`:

- `validate_cleaned()` runs after Phase 3 and catches source surprises early.
- `validate_final()` runs in Phase 5 and is the gate to saving.

Cover every check that applies:

| Check | Example |
|---|---|
| Required columns and order | exactly the schema's output columns |
| Not empty | at least one row per expected source |
| Key uniqueness | no duplicate grain keys |
| Allowed values | `Geographic Level` in the vocabulary; categories in the schema's lists |
| Time coverage | every expected year or month present; none in the future |
| Geographic completeness | all 58 counties when county-level; all PPIC regions when region-level |
| Numeric ranges | counts ≥ 0; shares between 0 and 100 |
| Internal identities | parts sum to the total within a stated tolerance |
| History preserved | no grain key in the history file or saved table disappears |

**Hard** checks block the save. **Soft** checks (plausibility, such as a year-over-year jump above a threshold) are logged with enough context to review. Decide which is which in the specification, with a one-line reason for each.

Never relax a check to make real data pass. If real data fails a check, either the check is wrong (fix it, explain why in the specification, and add a test with the real case) or the data is wrong (that's a finding to report). Either way, tell the researcher.

---

## 8. Saving, history, and idempotency

- Save **only** through `archive_and_save(prepared, current_path, archive_directory, "<topic-slug>")`. It skips the write when the bytes are identical, archives the previous version, and writes atomically.
- **Idempotency:** a second run with no new source data must return `new_data=False`, `output_path=None`, and leave the file's bytes *and* modification time unchanged. The usual culprits when it doesn't: unstable sort order (sort by grain keys in `finalize_dataset()`), float formatting drift, timestamps stamped at run time instead of taken from the source, and dtype changes between a fresh build and a reload of the saved table.
- **History file** (needed when the live source has a rolling window, per `link-stability.md`): build it once with a separate, clearly named builder script, `scripts/<topic_snake>/historical/build_historical_seed.py`, and have the researcher confirm its coverage. The routine pipeline only *reads* it, unions it in during merge, and never writes it.

---

## 9. Tests

**Specification → tests → code.** Write each worker's tests from the specification before writing the worker. Then write code until they pass.

- **Layout:** mirror the package under `scripts/unit_tests/<topic_snake>/` (`config/`, `acquisition/`, `cleaning/`, … each with `__init__.py`), with shared synthetic frames in `helpers.py` like RHNA's. The orchestrator test goes in `scripts/unit_tests/orchestrators/test_<topic_snake>_pipeline.py`.
- **No network.** An autouse fixture in `scripts/unit_tests/conftest.py` makes `requests.get` and `requests.post` raise. Mock at the downloader or `fetch_response` boundary. (Using the shared HTTP helpers keeps you inside that guard. A different HTTP library would slip past it, which is one more reason not to add one.)
- **Fixtures:** small synthetic frames by default. A few real source rows are fine when the layout itself is what's under test (header offsets, footnote rows). Keep them tiny and public, and use the real column names.
- **Must-have tests:**
  - each cleaning step against the real source layout, including suppressed and missing markers;
  - each validator: one passing frame, plus one failing frame per check;
  - the fallback ladder: live OK; live fails → manual file; manual missing → last saved, not re-cleaned; all fail → clear error;
  - discovery: picks the newest valid link or period, and rejects a look-alike file;
  - the orchestrator end to end, offline (mocked acquisition, `tmp_path` paths): first run writes the table, second run returns `new_data=False` and leaves the file untouched (`frozen_archive_clock` fixture available), and the history file is never written;
  - a phase failure surfaces as `<PascalName>PipelinePhaseError` with the phase name.

---

## 10. Commands

Run from the project root. The researcher never runs these.

```bash
web-viz-venv/bin/python -m pytest scripts/unit_tests/<topic_snake>/ scripts/unit_tests/orchestrators/test_<topic_snake>_pipeline.py -q   # topic tests
web-viz-venv/bin/python -m pytest -q                                   # whole backend suite: must stay green
web-viz-venv/bin/ruff check scripts/<topic_snake>/ scripts/orchestrators/<topic_snake>_pipeline.py scripts/unit_tests/<topic_snake>/
web-viz-venv/bin/python -m scripts.orchestrators.<topic_snake>_pipeline   # real run against live sources
```

Each real run appends a record to `logs/pipeline-runs.jsonl` (gitignored), which feeds the `/logs` page. Read it to confirm the run's severity and that its paths are repo-relative. Record the test counts (passed/failed) for the hand-off. Never report a result you didn't see.

---

## 11. Specification

Extend the Checkpoint 1 draft in `docs/specifications/<topic-slug>-topic-specification.md` into a full topic specification. Follow the RHNA specification's two halves:

- **Plain-language half:** Topic Summary, Data Contract (every column: meaning, units, dtype, allowed values, missing rules), Sources (with link-stability class and cadence), How the Pipeline Runs, Updating this topic (Hand-delivered sources only), Caveats.
- **Programmer Reference:** one section per folder listing each function's job, inputs, outputs, and test file. Add Validation (hard vs. soft, with reasons), Flagged Issues and Fragilities, Source Facts and Design Decisions (including every judgment call the researcher made and why), and Open Items.

Write it before the tests, and keep it in sync as the code settles. Keep `Status: Draft` and update `Last Updated` on each substantive change. A developer or programmer moves it to `Updating` or `Finalized` after review.

---

## 12. Hand-off items to record

Collect these as you go. They go in the pull request's "Needs a developer or programmer" section:

- shared-code or config changes you designed around instead of making;
- any new dependency the topic would benefit from;
- adding the topic to `projectSpec.md` ("Current topic inventory", "Topic references", "Historical data");
- setting up a scheduled refresh (none exists yet: the pipeline is ready for one);
- app wiring, if the researcher chose data only;
- anything you could not verify, and every soft-check warning from the real run.
