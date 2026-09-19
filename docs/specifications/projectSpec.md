---
Topic: Technical
Content Type: project specification
pinned: true
description: "The current source of truth for the PPIC Data Explorer product, topic pipelines, application architecture, API boundaries, operational logs, documentation, and contributor standards."
Date Published: June 23, 2026
Last Updated: 09/18/2026 - 03:24 PM
Status: Updating
---

# Project Specification and Architecture Reference

> [!info] Who this document is for
> Researchers, product staff, designers, and editors can use the first four sections to understand what the project produces and how the parts fit together. Engineers and future contributors should also read the architecture, API, operations, testing, and extension sections.

This is the cross-project specification for the PPIC Data Explorer. It explains the shared system and the boundaries every topic follows. Detailed field definitions, source caveats, and per-function histories belong in the linked topic guides rather than being duplicated here.

> [!important] Current state
> Six data topics are registered in the application. All production visualization pages use question specification version 3. The original notebook and partial Shiny systems are historical inputs, not active application paths.

> [!note] Legacy code names
> Product language uses **topic**. Some implementation identifiers still use `module`, including `/[module]`, `moduleId`, `moduleRegistry.js`, and several component names. Treat those as literal code identifiers, not current user-facing terminology.

---

## Project Overview

The repository combines two systems that publish one research product:

1. **Python data pipelines** acquire, clean, merge, enrich, validate, version, and publish canonical CSV datasets.
2. **A Next.js application** lets readers explore those datasets as charts and tables, bring their own table to the standalone visualization tool, read project documentation, and inspect pipeline activity.

```text
Public data sources
        |
        v
Python topic pipeline
        |
        +--> canonical cleaned CSV
        +--> archived prior version
        +--> structured run record
        |
        v
Server-side data access and API
        |
        v
Version 3 data question
        |
        v
Status-aware observations
        |
        +--> chart
        +--> data table
        +--> image, spreadsheet, or embed export
```

### Project history

| Generation | Role |
|---|---|
| V1 | Fourteen Jupyter notebooks across five legacy datasets |
| V2 | A partial Shiny application and production ETL work |
| V3 | The current Python pipeline and Next.js application architecture |

The five legacy datasets were migrated into the shared architecture. RHNA Progress was added later as the first topic built without a notebook predecessor.

### Design requirements

The following are project requirements:

- **One canonical dataset per topic.** The frontend reads validated outputs rather than re-running cleaning logic.
- **Named failure sources.** A failed pipeline phase, API request, comparison, or render must identify where it failed.
- **No silent data substitution.** Fallbacks, missing values, suppressed values, and stale-source recovery stay visible.
- **Question and presentation stay separate.** Data meaning is not stored inside chart styling.
- **Shared mechanisms remain shared.** Archive, download, validation, logging, calculation, export, and visualization rules should not be copied into each topic.
- **Topic rules remain local.** Source URLs, schemas, geographic details, and domain calculations belong to the topic that owns them.
- **Non-technical readers can follow the system.** Documentation defines terms before relying on them and links to deeper technical references.

---

## Product Surfaces

The application exposes six primary surfaces.

| Route | Purpose | Primary owner |
|---|---|---|
| `/` | Directory of the six data topics | `app/page.js`, `lib/visualization/topicRegistry.js` |
| `/[module]` | Single-screen topic workbench | `app/[module]/page.js`, `ModuleWorkbench` |
| `/visualization-tool` | Import, edit, and export charts from a reader-supplied table | `VisualizationWizard` |
| `/documents` | Searchable catalog and reader for committed Markdown documents | `lib/docs/documents.js` |
| `/logs` | Pipeline run records and curated changelog | `lib/logs/*`, `lib/changelog/*` |
| `/ui-kit` | Design-system and chart examples for implementation review | `components/ui-kit/*` |

The landing page is a synchronous server component. It reads the topic registry and performs no data fetch. Topic routes resolve their schema and default question, while the standalone tool begins with an empty inline dataset.

The global navigation links to Home, Topic, Custom visualizations, Documents, Logs, and UI Kit. Topic links are derived from the registry so the landing page and navigation cannot maintain different topic lists.

---

## Topics and Data Products

A topic is one complete vertical slice:

```text
scripts/<topic>/                     Python source-specific workers
scripts/orchestrators/               end-to-end pipeline entry points
data/data-cleaned/<topic>/           canonical dataset and durable history
lib/data/                            server-side dataset readers
app/api/<topic>/                     HTTP boundary
lib/visualization/moduleSchemas/     client-safe field and capability schema
lib/data/visualization/              version 3 question adapters
docs/topic-guides/                   as-built human and programmer reference
```

### Current topic inventory

| Topic | Primary sources | Canonical grain | Current schema coverage | Important consideration |
|---|---|---|---|---|
| Population & Housing | California DoF E-5 and E-8 | Place by year | California state, regions, counties, cities, and towns; 1991-2026 | Only topic with city-level detail; E-8 deep history is a separate immutable baseline |
| Components of Change | California DoF E-6 and U.S. Census population components | Place, source, and year | California state, regions, counties, and U.S. states; 1991 onward | DoF and Census remain distinct sources because their measures are not interchangeable |
| Age, Sex & Race Projections | California DoF P-3 and U.S. Census cc-est | Place, year, age group, sex, race/ethnicity, and source | California projections through 2070 and recent U.S. state estimates | Observed and projected values must remain distinguishable |
| ACS Housing Stress | Census ACS 1-year B25140 family | Place, year, race/ethnicity, and tenure | States, California counties, and PPIC regions; 2012 onward except 2020 | County and region values are PUMA-based approximations |
| Building Permits | Census Building Permits Survey | Place and month | States and California metros; 2010 onward | The live source exposes a rolling window, so older months depend on an immutable history seed |
| RHNA Progress Report | California HCD CKAN RHNA Progress resources | Jurisdiction, cycle, income level, and snapshot | California cities and unincorporated county areas across cycles 5 and 6 | The chart defaults to the latest snapshot; the manual historical snapshot picker is not yet exposed |

All six canonical datasets are present under `data/data-cleaned/`, have registered application schemas, and are served through the version 3 visualization path.

### Topic references

| Topic | Detailed reference |
|---|---|
| Population & Housing | [[population-and-housing-topic-guide]] |
| Components of Change | [[components-of-change-topic-guide]] |
| Age, Sex & Race Projections | [[age-sex-race-projections-topic-guide]] |
| ACS Housing Stress | [[acs-housing-stress-topic-guide]] |
| Building Permits | [[building-permits-topic-guide]] |
| RHNA Progress Report | [[rhna-progress-report-topic-specification]] |

The topic guides own exact column definitions, source discovery rules, cleaning steps, data-quality caveats, and function inventories. When this specification and a topic guide appear to disagree about a topic-specific detail, inspect the current schema and pipeline and correct both documents.

---

## Technology and Commands

### Technology stack

| Area | Current technology |
|---|---|
| Web application | Next.js 16 and React 19 |
| Styling and components | Tailwind CSS 4, Radix-based UI components, shared PPIC tokens |
| Charting | Plotly.js through `react-plotly.js` |
| Pipeline language | Python 3.12 |
| Data processing | pandas and NumPy |
| Source access | Requests, Beautiful Soup, OpenPyXL, and xlrd |
| Frontend tests | Vitest, Testing Library, jsdom, and Playwright |
| Python tests and linting | pytest and Ruff |
| Documentation | Markdown, gray-matter, react-markdown, GFM, KaTeX, and custom plugins |

Python dependency groups and exact versions live in `pyproject.toml`. JavaScript dependency versions live in `package.json`.

### Development commands

```bash
npm install
npm run dev

npm test
npm run build
npm run check:palette
npm run check:settings

web-viz-venv/bin/python -m pytest
web-viz-venv/bin/python -m ruff check .
```

Use focused tests while editing, then run the relevant full suites before handoff. A documentation-only change still needs document tests and a production build because every published document becomes a statically generated route.

---

## Repository Layout

| Path | Responsibility |
|---|---|
| `app/` | Next.js pages, dynamic topic route, and API routes |
| `components/` | Application shell, chart builder, charts, documents, logs, landing page, and UI primitives |
| `lib/visualization/` | Question model, topic schemas, chart catalog, adapters, palettes, settings, and validation helpers |
| `lib/data/` | Server-only CSV readers, query helpers, geography, and topic access |
| `lib/export/` | Image, tabular, spreadsheet, and embed export support |
| `lib/docs/` | Document discovery, frontmatter, slugs, assets, and Markdown plugins |
| `lib/logs/` | Pipeline run-record readers |
| `lib/changelog/` | Changelog assembly and filtering |
| `scripts/<topic>/` | Topic-specific pipeline workers |
| `scripts/orchestrators/` | Pipeline entry points and named phase boundaries |
| `scripts/shared/` | Shared archives, downloads, cleaning, geography, logging, validation, and visualization helpers |
| `scripts/unit_tests/` | Python unit and integration tests |
| `tests/js/` | Frontend, data, architecture, document, and tooling tests |
| `tests/visual/` | Playwright visual and flow checks |
| `data/data-cleaned/` | Canonical published datasets and immutable history seeds |
| `data/data-raw/` | Cached or manually supplied source artifacts |
| `data/archive/` | Prior canonical outputs |
| `logs/` | Per-pipeline text logs and structured JSONL run records |
| `docs/` | Project documentation published through `/documents` |
| `.trash/` | Recoverable quarantined material that must stay outside live import paths |

### Sources of truth

Topic configuration has several owners by design.

| Scope | Owner |
|---|---|
| Shared project paths and HTTP defaults | `lib/config.py` |
| Population & Housing geography and legacy-compatible constants | `lib/pophousing_config.py` |
| Topic-specific Python paths, sources, and schemas | `scripts/<topic>/config/` |
| Client-safe fields, measures, time, geography, and capabilities | `lib/visualization/moduleSchemas/` |
| Landing and navigation topic directory | `lib/visualization/topicRegistry.js` |
| Chart families and their capabilities | `lib/visualization/chartRegistry.js` |
| Version 3 question wire format | `lib/visualization/questionSpec.js` |
| Approved settings inventory | `lib/visualization/settingsRegistry.js` |
| Shared Python dependency declarations | `pyproject.toml` |
| JavaScript dependencies and commands | `package.json` |

No one file is a universal schema. Python pipeline contracts and browser-safe visualization contracts serve different runtimes and should agree on public field names without importing across that boundary.

---

## Data Pipeline Architecture

### Standard lifecycle

Most pipelines use five named phases. Population & Housing uses an additional phase because its historical build and source retention are more involved.

| Phase | Responsibility |
|---|---|
| Configuration and bootstrap | Resolve paths, schemas, sources, saved canonical data, and immutable history |
| Acquisition | Discover and download live sources or select an explicit fallback |
| Cleaning and enrichment | Normalize columns, types, names, geography, and domain measures |
| Merge and change detection | Combine sources and history, resolve overlaps, and identify new or revised values |
| Validation and output | Enforce the contract, archive the prior version, and atomically publish changed data |

The orchestrator coordinates these phases. Worker functions perform one bounded operation and must not silently take over unrelated phases.

### Worker and orchestrator boundaries

A **worker** receives explicit inputs and returns data or a structured result. Examples include downloading one workbook, normalizing a frame, assigning geographic levels, calculating a rate, or validating a contract.

An **orchestrator** owns sequence and policy. It decides when to call workers, when a fallback is acceptable, which validation blocks publication, and what summary is recorded.

This separation makes workers testable and keeps operational decisions visible in one place.

### Source acquisition and fallback

Topic pipelines may use live downloads, cached files, manually supplied files, or the last canonical dataset. The exact order is topic-specific, but these rules are shared:

- A fallback must be explicit in the returned summary.
- Last-saved rows are already contract-shaped and must not be sent through raw-source cleaning again.
- A recovered run is not presented as a clean success.
- A fallback cannot bypass final validation.
- Source discovery should tolerate expected filename changes without accepting an unrelated file.
- Network access uses shared timeout and user-agent defaults unless the source requires a documented exception.

### Historical data

Several public sources expose only recent history. The project preserves deep history through dedicated, read-only seed files.

| Topic | Durable history strategy |
|---|---|
| Population & Housing | `PopHousing_Historical_E8.csv` plus metadata |
| Components of Change | `ComponentsOfChange_Historical.csv` |
| ACS Housing Stress | `HousingStress_Historical.csv` |
| Building Permits | `BuildingPermits_Historical.csv` |
| RHNA Progress Report | Snapshot rows accumulate in the canonical dataset |
| Age, Sex & Race Projections | Source vintages and the canonical merge provide the active horizon |

A live pipeline may read an immutable seed but must not overwrite it as a side effect of a routine refresh. A separate, reviewed build or backfill path owns seed creation.

### Validation and publication

Validation happens before publication. Topic validators cover the dimensions that can make a technically readable file analytically wrong, including:

- required columns and order;
- allowed values;
- key uniqueness;
- time coverage;
- geographic completeness;
- numeric ranges and internal identities;
- source-specific coverage;
- missing or suppressed data rules; and
- preservation of immutable history.

Hard failures block the write. Soft checks are logged with enough context for review.

### Archive and save

`scripts/shared/archives/dataset_archive.py` owns the shared publication mechanism.

1. Serialize the prepared frame.
2. Compare it with the current file.
3. If byte-identical, do not rewrite the canonical file or change its modification time.
4. If changed, copy the prior file to the topic archive.
5. Write the new bytes to a sibling temporary file.
6. Atomically replace the canonical file.

The canonical dataset therefore remains present during archival and cannot be left half-written by an interrupted save.

Archive filenames include the topic id, dataset prefix, and ISO date. Same-day replacement is an accepted current limitation for routine pipeline refreshes.

### Revision reporting

New periods and revisions to existing periods are different events. Pipelines use shared revision-diff helpers to identify:

- added periods;
- changed periods;
- removed periods;
- added or removed keys;
- changed cell counts; and
- a bounded sample of changed cells.

The revision summary appears in pipeline logs and can be included in the reviewer-facing change report used by automated refresh workflows.

---

## Data Contracts

A canonical CSV is an application contract, not a temporary pipeline artifact.

### Required qualities

Every topic contract must have:

- a documented row grain;
- a stable column order;
- stable public labels;
- an explicit time representation;
- an explicit geography representation;
- sufficient source or provenance information;
- deterministic sorting;
- unique keys at the declared grain; and
- validation that runs before publication.

Numbers intended for calculation are numeric or null. Missing and suppressed values must not be encoded as zero. Display labels may be friendly, but canonical field names should not be rewritten by presentation code.

### Geography

Python owns source-specific geographic cleaning and aggregation. The browser receives already-labeled geographic rows through the canonical CSV and topic schema.

County maps use `data/data-cleaned/geography/california-counties.geojson`. `lib/data/geography.js` is server-only and provides polygon geometry, a county-name-to-GEOID lookup, and representative points. Current shared map geometry covers counties.

### Time

Topics may use annual years, monthly `YYYY-MM` tokens, or snapshot timestamps. The visualization question preserves the topic's period tokens rather than coercing every source to a year.

The topic schema declares the periods an editor can offer. RHNA Progress intentionally publishes no static historical snapshot list, so its current question resolves to the latest available snapshot on the server.

---

## Frontend Architecture (UI Layer)

The frontend is one shared editor system with two interfaces: a single-screen topic workbench and a three-step bring-your-own-data tool. Both use the same question model, chart catalog, sidebar sections, observation contract, and rendering adapters.

For detailed chart behavior, see [[visualization-specification]].

### Application shell and registries

| Responsibility | Owner |
|---|---|
| Topic directory and documentation links | `topicRegistry.js` |
| Client-safe topic schemas | `moduleRegistry.js`, `moduleSchemas/*` |
| Default questions | `defaultQuestions.js` |
| Chart families | `chartRegistry.js` |
| Chart availability | `chartAvailability.js` |
| Sidebar order and gates | `sidebarSections.js` |
| Question readiness | `questionReadiness.js` |
| Editor choices | `resolveEditorModel.js` |
| Settings inventory | `settingsRegistry.js` |

The topic page resolves a schema and a default version 3 question, then renders `ModuleWorkbench`, `ModuleSidebar`, `ChartContainer`, and `ChartContainerFooter`.

The standalone tool renders `VisualizationWizard` with Import, Edit, and Export steps. `DataSourcePanel` and `InputTableEditor` parse and correct reader-supplied data. The shared Edit step uses the same chart-type and setting sections as the topic workbench.

### The question specification

The durable state has three top-level fields:

| Field | Meaning |
|---|---|
| `version` | The wire-format version, currently `3` |
| `question` | Dataset, source, outcome, geography, time, calculation, and comparisons |
| `presentation` | Chart type, comparison layout, labels, `format`, appearance, `annotations`, and chart-specific parked state |

A curated topic stores `question.dataset.kind: "module"` with a literal `moduleId`. An inline question stores the typed table and its role-to-column bindings inside `question.dataset`.

The application serializes only approved durable keys. Loaded observations, issues, preview status, undo history, and Plotly figures are computed state and do not belong in a saved view.

### End-to-end chart flow

```text
Reader edits a setting
        |
        v
ChartConfigProvider
        |
        +--> incomplete question: chart-specific skeleton, no request
        |
        +--> curated topic: POST { version, question } to topic API
        |
        +--> inline table: execute the same question locally
        |
        v
{ observations, comparisons, periods, issues }
        |
        +--> optional county geometry
        |
        v
adaptObservations
        |
        v
PlotlyChart or DataTableView
```

`PreviewContext` owns the preview states: idle, unconfigured, loading, invalid, empty, error, and ready. Presentation-only edits reuse the answered question when possible.

### API boundary

Every topic API exposes a production version 3 POST handler through `handleQuestionPost`.

```js
// Request
{
  version: 3,
  question: {
    dataset: { kind: "module", moduleId: "pophousing" },
    outcome: { measureId: "Total Population" },
    geography: { subset: "Counties", locations: ["Alameda"] },
    time: { contract: "range", startYear: 2020, endYear: 2026 },
    calculation: { id: "actual", params: {} },
    comparisons: [{ id: "cmp_locations", dimensions: {} }]
  }
}
```

A response contains `status`, `observations`, `comparisons`, `periods`, and `issues`. A blocked question returns a non-success HTTP status and a machine-readable blocking issue.

The topic APIs also retain GET endpoints for supporting and compatibility uses:

| Request | Current use |
|---|---|
| `?view=locations` | Location chooser; response shape `{ locations: string[], subset: string }` |
| `?view=table&full=1` | Full cleaned dataset for View Data and original-data export |
| Historical chart-shaped views | Compatibility code; the production editor does not call them |

Other application APIs are:

| Route | Purpose |
|---|---|
| `/api/geography` | County polygons or representative points |
| `/api/module-status` | Latest successful pipeline timestamp for a schema id |
| `/api/doc-asset` | Validated image assets stored inside `docs/` |
| `/api/pophousing/update` | Starts the Population & Housing pipeline and reports whether it is running |

> [!warning] Refresh route deployment boundary
> `/api/pophousing/update` starts a server-side Python process. It uses a fixed command and a single-process lock, but a shared deployment must place this route behind authentication and an execution environment that supports the pipeline.

### Observations and calculations

Curated topic adapters and inline tables both produce the observation contract defined in `observationContract.js`. Each row records its comparison, measure, unit, period, value, source, status, value kind, and calculation.

`calculationRegistry.js` owns formulas for actual values, aggregation, selected-year averages, numeric and percentage changes, percentage-point change, indexing, benchmark differences, and ranking. Inline data calls the same registry rather than implementing formulas in a browser component.

### Rendering and exports

`lib/visualization/adapters/index.js` converts observations into Plotly figures. Production editor charts do not render through `toPlotly.js`; that file remains live for UI Kit examples.

`ExportMenu` and `lib/export/*` own image, data, spreadsheet, and embed output. `DataTableView` renders exact values both as a chart family and inside the topic workbench's data view.

### Views and persistence

A view stores the declarative question and presentation. Version 1 and spec v2 saved views are rejected rather than guessed into the current format.

The standalone Visualization Tool can save views in browser storage because its inline table must survive navigation. Topic workbenches do not expose browser-saved views. Both interfaces support multi-chart workspaces and embed serialization.

### Retired frontend history

The current architecture replaced two earlier editor shapes:

- The first shared editor used a step sequence and chart-shaped API responses.
- **spec v2** introduced top-level `version`, `data`, `format`, and `annotations`; inline tables lived at `data.inline`.
- The workbench split topic exploration from the standalone wizard.
- The version 3 cutover replaced chart-shaped requests with questions and observations.

Several names remain useful when reading history or compatibility branches: `DataSourcePanel`, `InputTableEditor`, `ExportMenu`, `lib/export`, `DataTableView`, `ModuleWorkbench`, `ChartContainer`, and `sidebarSections.js`.

Retired files and replaced implementations move to `.trash/` when recovery matters. The visualization-specific quarantine and its review decisions are recorded in [[visualization-backend-removal-changelog]].

### Frontend — Flagged Issues

The earlier frontend issues were resolved by the graph-editor overhaul and the version 3 cutover. The current acceptance contracts require one question format, one calculation registry, an adapter for every registered chart, one section registry, explicit map availability, clear unfinished states, and rejection of unsupported saved-view versions.

Current product limits are documented in [[visualization-specification]] rather than repeated as unresolved migration defects here.

---

## Conventions & Standards

### Python

Python code follows [[python-skill]]. The important project-wide boundaries are:

- Use snake_case and explicit, descriptive names.
- Keep imports at the top of the file.
- Separate configuration, acquisition, cleaning, enrichment, validation, and output.
- Give public functions docstrings that state inputs, outputs, and the owning test file.
- Prefer vectorized pandas operations to row-by-row loops.
- Never hide a failed validation or source fallback.
- Do not combine data publication with chart rendering.
- Run Ruff and pytest after Python changes.

### Frontend

Frontend code follows [[frontend-skill]]. Shared rules include:

- Use existing UI primitives and design tokens.
- Keep server-only readers out of client bundles.
- Derive repeated product lists from registries.
- Let chart descriptors and topic schemas declare capability instead of hard-coding ids in components.
- Preserve the question/presentation boundary.
- Use accessible labels, native controls, visible focus, and explicit status text.
- Run Vitest and a production build after frontend changes.

### Markdown

Documentation follows [[markdown-skill]]. Every published document needs valid frontmatter, one H1, ordered headings, meaningful callouts, and a current `Last Updated` value.

Use wikilinks for documents and ordinary Markdown links for external pages. Content must render in both Obsidian and the web reader.

### Naming

| Item | Convention |
|---|---|
| Product concept | Topic |
| Python packages and variables | snake_case |
| JavaScript functions and variables | camelCase |
| React components | PascalCase |
| Markdown filenames | kebab-case |
| Canonical CSV fields | Stable public title case where already established |
| Topic ids and routes | Stable kebab-case |
| Tests | Mirror the implementation path and name the behavior under test |

Existing code identifiers that use `module` remain valid until a deliberate code migration changes them.

### Dependency boundary

`scripts/<topic>/` may import `scripts/shared/`. Shared code must not import topic-specific code.

Server-side `lib/data/` may import client-safe schemas. Client components must not import server-only readers that use `node:fs`.

The browser receives serializable data through props, context, or HTTP. It never reads canonical CSV files directly.

### Generated artifacts

Two frontend references are generated:

- PPIC palette CSS in `app/globals.css` from `lib/constants.js`;
- the visualization settings table in [[visualization-specification]] from `settingsRegistry.js`.

Edit the owner, regenerate, and check the result. Do not hand-edit generated blocks.

---

## Error Handling and Failure Surfacing

Errors should answer three questions:

1. What failed?
2. Where did it fail?
3. What can the reader or maintainer do next?

### Pipeline failures

Orchestrators wrap failures with a named phase. `execute_pipeline_run` records the error type, message, repository-relative file, function, line, and traceback, then re-raises the exception.

A fallback sets explicit flags. The run record labels it `recovered`, not `success`.

### API failures

API responses use a non-success status and a body that names the source of the failure. Invalid parameters fail before data loading. A malformed or blocked version 3 question returns structured issues rather than a partial chart.

### Visualization failures

An unfinished question remains `unconfigured` and makes no request. Invalid questions show blocking explanations. Empty results, request failures, and renderer failures have distinct preview states.

### Privacy in logs

Structured run records remove absolute machine paths before writing JSONL. Repository paths remain useful for debugging without publishing a maintainer's home directory.

---

## Logs, Changelog, and Refresh Reporting

### Pipeline records

Every orchestrator runs through `scripts/shared/logging/run_records.py`. One run produces:

- a topic text log;
- one JSON object appended to `logs/pipeline-runs.jsonl`; and
- a returned summary for the caller.

Severity is `success`, `recovered`, or `error`. Results contain JSON-safe summary fields, while dataframes are represented by shape rather than serialized into the log.

### Logs page

The `/logs` page has two feeds:

- **Pipeline Logs** reads structured run records and exposes filters, severity, summaries, fallback flags, and optional technical details.
- **Changelog** reads the generated application changelog and its curated overlay.

Raw technical details are hidden by default but remain available per entry.

### Change reports

`scripts/shared/logging/change_report.py` turns the newest run record for one topic into reviewer-facing Markdown. It includes the output, row count, new-data indicators, fallback flags, revision summary, and Git line diff where available.

This is the common reporting boundary for scheduled refresh workflows. See [[github-actions-workflow-reference]].

---

## Documents Library

Markdown under `docs/` is both an Obsidian vault and a published document library.

### Catalog

`lib/docs/documents.js` recursively discovers Markdown, parses frontmatter, derives titles and slugs, and builds the catalog.

The catalog excludes:

- documents with `Status: Archive`;
- `Content Type: landing page`;
- files without a content type; and
- empty documents.

Pinned documents sort first, then published date. Content types, statuses, and topics are derived from document frontmatter rather than hard-coded.

### Reader

`/documents/[slug]` statically generates a reader page with:

- article metadata;
- a table of contents;
- GFM tables and task lists;
- Obsidian callouts;
- internal wikilinks;
- local image embeds;
- KaTeX math;
- syntax-highlighted code blocks; and
- trusted inline SVG fences.

Image assets stored under `docs/` are served through the guarded `/api/doc-asset` route.

### Documentation ownership

| Document | Owns |
|---|---|
| This project specification | Cross-project product, architecture, API, operations, and extension rules |
| [[visualization-specification]] | Complete chart-editor and question behavior |
| Topic guides | Topic sources, contracts, pipeline details, and caveats |
| [[unit-tests]] | Test organization and behavior expectations |
| Agent skills | How contributors should perform Markdown, Python, frontend, planning, and changelog work |
| Refactor guides | Historical rationale, migration sequencing, and reviewed removals |

---

## Testing

The repository has three complementary test layers.

| Layer | Location | Purpose |
|---|---|---|
| Python unit and integration tests | `scripts/unit_tests/` | Pipeline workers, orchestrators, fallbacks, validators, archives, logs, and data contracts |
| JavaScript unit and architecture tests | `tests/js/` | Components, routes, data readers, question behavior, rendering adapters, documentation, and architectural boundaries |
| Playwright tests | `tests/visual/` | Browser workflows and visual behavior |

### Required checks by change type

| Change | Minimum checks |
|---|---|
| Markdown only | Relevant document tests and `npm run build` |
| Frontend behavior | Focused Vitest tests, `npm test`, generated checks, and `npm run build` |
| Python pipeline | Focused pytest tests, full pytest suite, and Ruff |
| Visualization setting or palette | Corresponding generated check plus frontend tests and build |
| Topic contract | Pipeline tests, adapter/data tests, API tests, and build |
| Cross-cutting architecture | Full frontend and Python suites, generated checks, and build |

Tests should verify behavior and boundaries rather than copy the implementation. Architecture tests intentionally guard against split request paths, client-side formula duplicates, unsupported imports, and unreviewed deletion of quarantined code.

---

## Extending the Project

### Add a new topic

A new topic is complete only when its data, application, operations, tests, and documentation agree.

1. Define the source, row grain, canonical columns, time tokens, geography, provenance, and missing-value rules.
2. Add topic configuration under `scripts/<topic>/config/`.
3. Implement bounded acquisition, cleaning, enrichment, merging, validation, and output workers.
4. Add an orchestrator using named phase errors and `execute_pipeline_run`.
5. Publish a canonical CSV only through validated archive-and-save behavior.
6. Add a server-only reader under `lib/data/`.
7. Add a client-safe schema under `lib/visualization/moduleSchemas/`.
8. Add or configure a version 3 question adapter.
9. Add the API route with POST question handling and the required location and full-table GET helpers.
10. Add a default question, topic registry entry, documentation route, and any built-in views.
11. Add mirrored Python tests and frontend contract tests.
12. Write or finalize the topic guide.
13. Run the full relevant checks and verify the rendered topic manually.

See [[new-topic-process]] for the working process and templates.

### Add a chart family

1. Add one chart descriptor and capabilities entry to `chartRegistry.js`.
2. Define required roles, time contracts, calculations, comparison presentations, color encoding, defaults, limits, and skeleton shape.
3. Add an observation adapter branch.
4. Add only the settings the chart consumes.
5. Confirm topic and inline availability rules.
6. Add adapter, catalog, readiness, section, export, and visual tests.
7. Update [[visualization-specification]] and regenerate the settings reference if an approved setting changed.

### Add a setting

A setting needs:

- one durable owner in `question` or `presentation`;
- one visible control with an accessible label;
- a declared standard or advanced mode;
- a consumer;
- chart and dataset gates;
- chart-switch behavior;
- serialization behavior;
- tests; and
- a settings-registry entry when it is cross-layer state.

A control with no consumer is not complete.

### Add a scheduled refresh

Use the existing pipeline orchestrator, run-record wrapper, change report, and dataset path. The workflow should install declared dependencies, run the topic pipeline, run relevant tests, detect tracked changes, and create a reviewer-facing change rather than silently publishing unreviewed data.

---

## Current Constraints and Follow-Ups

These are the important current boundaries:

- Shared map geometry covers California counties only.
- Housing Stress county and region estimates are approximate because PUMAs cross county boundaries.
- Building Permits deep history depends on its immutable seed because the live source exposes only a rolling window.
- RHNA Progress stores snapshot history, but the editor currently resolves the latest snapshot instead of offering a static historical picker.
- Version 1 and spec v2 saved visualization views are unsupported.
- Historical chart-shaped GET handlers remain in topic routes for compatibility, although production chart rendering uses POST questions.
- `/api/pophousing/update` needs an authenticated, process-capable deployment boundary.
- Some live code still uses legacy `module` identifiers.
- Quarantined visualization code remains recoverable until its removal ledger records a reviewed decision.
- The project specification remains `Updating` because topics and product capabilities continue to evolve; each section describes current behavior unless explicitly marked historical.

---

## Acceptance Checklist

The project is in a healthy state when:

- [ ] Every registered topic has a canonical validated dataset, schema, default question, adapter, API route, tests, and documentation.
- [ ] Pipeline failures and fallbacks produce structured run records with no absolute machine paths.
- [ ] Unchanged datasets are not rewritten.
- [ ] Changed datasets archive the prior canonical file before atomic replacement.
- [ ] Every production chart uses version 3 questions and observations.
- [ ] Every registered chart has a renderer adapter and declared capabilities.
- [ ] Inline and curated data use the same calculation registry.
- [ ] Archived documents are hidden from the Documents catalog.
- [ ] Generated palette and settings references are current.
- [ ] Frontend tests, Python tests, and the production build pass for releases.
- [ ] Topic-specific caveats remain current in their topic guides.

