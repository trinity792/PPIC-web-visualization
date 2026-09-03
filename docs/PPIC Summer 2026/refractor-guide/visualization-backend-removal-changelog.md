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

| Legacy path or symbol | Last consumer | Replacement | State | Evidence | Recovery | Developer decision |
|---|---|---|---|---|---|---|
| `components/chart-builder/chartData.js` chart-shaped loader | `components/chart-builder/wizard/PreviewContext.js` | `components/chart-builder/chartData.js` `loadObservations` and `lib/data/visualization/executeQuestion.js` | identified | Workstream C request and response tests | Original file remains live for reviewed v2 tests; future path is `.trash/visualization-backend/components/chart-builder/chartData.js` | Pending |
| `lib/visualization/transformRegistry.js` calculation bodies | `lib/visualization/toPlotly.js` | `lib/data/visualization/calculationRegistry.js` | identified | Calculation ownership and inline parity tests | Original file remains live; future path is `.trash/visualization-backend/lib/visualization/transformRegistry.js` | Pending |
| `components/chart-builder/sections/DateRangeSection.js` chart-id time rules | `components/chart-builder/sections/SidebarSections.js` | `components/chart-builder/sections/TimeSection.js` | identified | Capability-driven Time section tests | Original file remains live; future path is `.trash/visualization-backend/components/chart-builder/sections/DateRangeSection.js` | Pending |
| `lib/visualization/chartSpec.js` v1/v2 reader | `components/chart-builder/chartConfigStore.js` | `lib/visualization/questionSpec.js` | identified | v3 serialization and saved-view tests | Original file remains live; future path is `.trash/visualization-backend/lib/visualization/chartSpec.js` | Pending |
| `filters.tabColumn`, `filters.tabValue`, and `filters.tabOrder` | `components/chart-builder/chartConfigStore.js` | `presentation.comparisonPresentation`, `presentation.activeTab`, and `lib/visualization/adapters/index.js` | identified | Presentation-only tab and adapter tests | Mixed live file; recover from `components/chart-builder/chartConfigStore.js` until quarantine is approved | Pending |
| `lib/data/demographic_projections.js` null-to-zero age aggregation | `stratifiedRows` | Status-aware null propagation in the same data boundary and `lib/data/visualization/aggregateObservations.js` | unwired | Aggregate-observation and Projections route tests | Recover the prior expression from version control | Pending |
| `lib/data/building_permits.js` null-to-zero derived and regional totals | Building Permits GET views and v3 generic adapter | Null propagation for derived multifamily values, totals, and two-period change | unwired | Building Permits data tests and shared calculation tests | Recover the prior expressions from version control | Pending |
| `lib/data/query_shapes.js` missing endpoints sorted as zero change | Legacy two-period GET views | Unavailable rows sort after calculated values; v3 ranking uses `lib/data/visualization/rankObservations.js` | unwired | Query-shape and ranking tests | Recover the prior comparator from version control | Pending |
| `lib/data/pop_housing.js` missing region population sorted as zero | Population and Housing landing table | Unavailable rows sort after available population values | unwired | Population and Housing data tests | Recover the prior comparator from version control | Pending |
