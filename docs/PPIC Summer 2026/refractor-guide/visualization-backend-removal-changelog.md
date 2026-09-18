---
Topic: Visualization backend removal ledger
Status: Active
---

# Visualization backend removal changelog

This ledger records legacy visualization code before it is unwired, quarantined,
or deleted. No entry below authorizes deletion. A deletion requires a dated,
explicit developer decision and evidence that the named replacement passes its
tests and production build.

On 2026-08-31, the developer deferred every legacy-removal decision until the
v3 behavior has been reviewed on the development server. All `Pending` decisions
below therefore remain pending; this note is not approval to quarantine or
delete any item.

On 2026-09-14 the six module pages (`/[module]`) cut over to v3 together: each
opens on its `lib/visualization/defaultQuestions.js` question, the `?view=`
deep links in `lib/visualization/builtInViews.js` are v3 specs, and
`components/chart-builder/savedViews.js` reads v3 only for every registered
module (a v1 or v2 view or link gets the unsupported-version message).

Later the same day the standalone Visualization Tool (bring-your-own-data) cut
over as well: `app/visualization-tool/page.js` seeds an inline v3 question,
`lib/visualization/inlineQuestion.js` derives the outcome, comparisons, and
time from the pasted table's role→column bindings, and
`lib/tabular/toObservations.js` executes every chart family locally through
the shared calculation registry. With that, no editor surface can produce or
load a v1/v2 config any more. The legacy loader, reader, section, and
calculation bodies below are therefore no longer reachable from a live page;
their code paths still exist (the `config.version !== 3` branches in
`PreviewContext.js`, `chartConfigStore.js`, `savedViews.js`, and the section
registry) and their reviewed v2 unit tests still exercise them. Their "Last
consumer" columns say so; their states and decisions are unchanged - unwiring
those branches and quarantining the files is the next step and waits on the
developer's review.

| Legacy path or symbol | Last consumer | Replacement | State | Evidence | Recovery | Developer decision |
|---|---|---|---|---|---|---|
| `components/chart-builder/chartData.js` chart-shaped loader | None since 2026-09-14: `PreviewContext.js` and `ExportMenu.js` lost their `config.version !== 3` branches and import only the v3 exports | `components/chart-builder/chartData.js` now holds only `loadObservations`, `loadObservationGeometry`, and the full-table fetch; `lib/data/visualization/executeQuestion.js` answers on the server | unwired | `tests/js/components/chart-builder/chartData.test.js` (v3 loader and geometry), rebased `PreviewContext.*.test.js` and `ExportMenu.test.js`, full suite and build 2026-09-14 | The whole pre-cutover file is at `.trash/visualization-backend/components/chart-builder/chartData.js`; its v2 tests at `.trash/visualization-backend/tests/js/components/chart-builder/chartData.test.js` and `chartData.locations.test.js` | 2026-09-14: developer said "proceed" to unwiring and quarantine; permanent deletion still pending |
| `lib/visualization/transformRegistry.js` calculation bodies | `lib/visualization/toPlotly.js` on the v2 render path; inline data now calculates through `lib/tabular/toObservations.js` and the shared registry (2026-09-14) | `lib/data/visualization/calculationRegistry.js` | identified | Calculation ownership and inline parity tests | Original file remains live; future path is `.trash/visualization-backend/lib/visualization/transformRegistry.js` | Pending |
| `components/chart-builder/sections/DateRangeSection.js` chart-id time rules | None: removed from `lib/visualization/sidebarSections.js` on 2026-09-14 | `components/chart-builder/sections/TimeSection.js` | trashed | Capability-driven Time section tests; `sidebarSections.test.js` rebased to v3 questions; full suite and build 2026-09-14 | `.trash/visualization-backend/components/chart-builder/sections/DateRangeSection.js` (+ its test under `.trash/visualization-backend/tests/`) | 2026-09-14: developer said "proceed" to unwiring and quarantine; permanent deletion still pending |
| `lib/visualization/chartSpec.js` v1/v2 reader | The v2 branches of `components/chart-builder/chartConfigStore.js` `createChartConfig` and `components/chart-builder/savedViews.js` `deserialize`; since 2026-09-14 reachable only for an unregistered test schema | `lib/visualization/questionSpec.js` | identified | v3 serialization and saved-view tests | Original file remains live; future path is `.trash/visualization-backend/lib/visualization/chartSpec.js` | Pending |
| `filters.tabColumn`, `filters.tabValue`, and `filters.tabOrder` | `components/chart-builder/chartConfigStore.js` | `presentation.comparisonPresentation`, `presentation.activeTab`, and `lib/visualization/adapters/index.js` | identified | Presentation-only tab and adapter tests | Mixed live file; recover from `components/chart-builder/chartConfigStore.js` until quarantine is approved | Pending |
| `lib/data/demographic_projections.js` null-to-zero age aggregation | `stratifiedRows` | Status-aware null propagation in the same data boundary and `lib/data/visualization/aggregateObservations.js` | unwired | Aggregate-observation and Projections route tests | Recover the prior expression from version control | Pending |
| `lib/data/building_permits.js` null-to-zero derived and regional totals | Building Permits GET views and v3 generic adapter | Null propagation for derived multifamily values, totals, and two-period change | unwired | Building Permits data tests and shared calculation tests | Recover the prior expressions from version control | Pending |
| `lib/data/query_shapes.js` missing endpoints sorted as zero change | Legacy two-period GET views | Unavailable rows sort after calculated values; v3 ranking uses `lib/data/visualization/rankObservations.js` | unwired | Query-shape and ranking tests | Recover the prior comparator from version control | Pending |
| `components/chart-builder/LayerEditor.js` trace layers (benchmark, second source, second measure) | None: removed from `EditorSidebar.js`, `OutcomeSection.js`, and the `layers` editor capability on 2026-09-14 (it had crashed reading `config.bindings.y` on the v3 tool) | No v3 equivalent yet: a v3 question's comparisons carry what a benchmark or second-source layer did; a "reference line" presentation setting is the remaining gap | trashed | `editorCapabilities.test.js`, `EditorSidebar.test.js`, `OutcomeSection.test.js` updated; full suite and build 2026-09-14 | `.trash/visualization-backend/components/chart-builder/LayerEditor.js` | 2026-09-14: developer said "proceed" to unwiring and quarantine; permanent deletion still pending |
| The `config.version !== 3` halves of `components/chart-builder/chartConfigStore.js` (v2 `createChartConfig`, the v2 `reduceChartConfig` switch incl. `filters.tab*`, `revalidate`), `components/chart-builder/savedViews.js` (legacy `deserialize` branch), and the section components (`OutcomeSection.js` bindings grid, `AppearanceSection.js`, `GeographySection.js`, `ChartTypeSection.js`, `LabelsSection.js`, `ValidationNotice.js`, `wizard/PreviewPane.js`, `CategoriesSection.js`), plus the modules only they import: `lib/visualization/presetRegistry.js`, `lib/visualization/validation.js`, `lib/visualization/impliedRoles.js`, `lib/tabular/toSeries.js` shape builders, `components/chart-builder/sections/TransformSection.js`, `sections/PresetSection.js`, `sections/DatasetsSection.js` v2 branch, and `lib/visualization/toPlotly.js`'s transform path | Reachable only by a v2 config, which no page has produced or loaded since 2026-09-14; kept alive by ~30 reviewed v2 unit test files (`chartConfigStore.test.js`, `savedViews.test.js`, `validation.test.js`, `transformRegistry.test.js`, `toSeries.test.js`, `chartSpec.test.js`, the section tests' v2 fixtures, …) | The v3 store reducer, `questionSpec.js`, `questionReadiness.js`, `resolveEditorModel.js`, `inlineQuestion.js`, `toObservations.js`, and the v3 branches already in each section | identified | Not yet started: ~8,000 lines across ~18 source files and ~30 test files, to be unwired one component at a time with each test file rebased to v3 fixtures or quarantined beside its code | Version control until unwired; future paths under `.trash/visualization-backend/` at the same relative paths | 2026-09-14: developer said "proceed"; deferred to a dedicated pass because of its size, with `chartSpec.js` and `transformRegistry.js` (rows above) unwired as part of it |
| `app/visualization-v3-review/page.js` and `lib/visualization/developmentReview.js` (dev-only v3 review page and its seed specs) | `lib/visualization/topicRegistry.js` routed two landing topics to the review page | `app/[module]/page.js` seeding `lib/visualization/defaultQuestions.js` (the same specs, renamed); every topic routes to `/[module]` | deleted | `tests/js/lib/visualization/defaultQuestions.test.js`, `tests/js/lib/visualization/topicRegistry.test.js`, full suite and `npm run build` on 2026-09-14 | Commit preceding the cutover (the files were scaffolding, never a legacy path; not quarantined) | 2026-09-14: developer chose "module pages first ... retire the review page" when asked how to scope the cutover |
| `lib/data/pop_housing.js` missing region population sorted as zero | Population and Housing landing table | Unavailable rows sort after available population values | unwired | Population and Housing data tests | Recover the prior comparator from version control | Pending |
