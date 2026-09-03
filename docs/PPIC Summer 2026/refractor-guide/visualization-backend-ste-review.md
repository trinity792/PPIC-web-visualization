---
Topic: Visualization backend STE review
Status: Approved
---

# Visualization backend STE review

This is the Workstream G review list for new or changed production-facing copy.
The implementation has been checked for spelling, terminology, and plain
language. Exact strings required by the approved implementation plan remain
unchanged. Test-only fixture labels under `app/%5F%5Fvisual/` are not production
copy and are excluded.

## Comparison editor

- `Comparisons`
- `Comparison presentation`
- `Show together`
- `Show in tabs`
- `Generate comparisons`
- `Add comparison`
- `This chart has the maximum of 10 comparisons.`
- `Comparison {number}`
- `Custom label`
- `Comparison color`
- `Automatic PPIC color`
- `Show this comparison`
- `Override geography`
- `Geographic level for this comparison`
- `Override time`
- `Start period`
- `End period`
- `Remove comparison`
- `This subgroup is included in the aggregate comparison.`

## Time and calculation editor

- `Time`
- `Select time to show this chart.`
- `Select a year`
- `Start year`
- `End year`
- `Year`
- `Years`
- `Reporting year`
- `First year`
- `Second year`
- `Find a year`
- `{number} years selected`
- `Clear years`
- `Year display`
- `Show each year in tabs`
- `Show the average of selected years`
- `Average of {joined years}.`
- `Outcome`
- `Transformation`
- `Benchmark`
- `Weighted mean`
- `Sum`
- `Weighted by {weight field}.`

## Status, import, and saved-view messages

- `Not available`
- `Suppressed`
- `This view uses an older format and cannot open in this version.`
- `This request uses an unsupported version.`
- `This view has no data question.`
- `This view has no chart presentation.`
- `This view belongs to dataset "{requested dataset}", not "{current dataset}".`
- `This saved view is too large because it contains inline data.`
- `Send valid JSON.`
- `Import data and select an outcome before you build the chart.`
- `This calculation is not available for the selected outcome.`

## Settings Reference explanations

- Outcome: `Select the measure that every comparison uses.`
- Transformation: `Select how the service expresses the outcome, such as an actual value or a change.`
- Time: `Select the reporting periods that answer the question.`
- Comparisons: `Define up to 10 populations that use the same outcome.`
- Comparison presentation: `Show loaded comparisons together or in tabs without changing the question.`
- Ranking: `Limit the display to the highest or lowest calculated values.`
- Benchmark difference: `Subtract an aligned benchmark value from each observation.`
- Series binding: `Assign an imported dimension to a renderer's series role.`
- Comparison legend label: `Replace a comparison's derived legend label with approved display text.`
- Comparison color: `Keep an official PPIC color attached to one stable comparison id.`
- Comparison visibility: `Hide a comparison from the chart without removing its data.`
- Custom diverging stops: `Select approved shades for a diverging value scale.`
- Hide X-axis: `Hide the horizontal axis when its labels are not needed.`
- Comparison geography override: `Use a different geography for one Advanced Mode comparison.`
- Comparison time override: `Use different periods for one Advanced Mode comparison.`

## Documentation changed with this implementation

- `docs/PPIC Summer 2026/specifications/visualization-specification.md`
- `docs/PPIC Summer 2026/refractor-guide/visualization-backend-refractor.md`
- Generated Settings Reference block in the visualization specification
- `docs/PPIC Summer 2026/refractor-guide/visualization-backend-removal-changelog.md`

## Developer decision

Approved on 2026-08-31. The developer approved the complete copy list in this
document without edits. This satisfies the Workstream G STE gate; it does not
approve the coordinated public v3 cutover or any legacy-code removal.
