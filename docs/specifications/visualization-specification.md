---
Topic: Technical
Content Type: project specification
pinned: true
description: "Current product and technical specification for building, rendering, sharing, and exporting visualizations in the PPIC Data Explorer."
Date Published: July 27, 2026
Last Updated: 09/18/2026 - 03:18 PM
Status: Finalized
---

# Visualization Specification

> [!info] Who this document is for
> This specification is for research, product, design, editorial, and engineering readers. The first half explains the visualization experience without requiring code knowledge. The technical reference begins at *System design and ownership*.

This document describes the visualization feature as it works now. It replaces the retired spec v2 account of chart-shaped API requests, client-side calculations, and the old sidebar structure.

> [!important] Current format
> Every live visualization uses question specification version 3. Older version 1 and version 2 saved views are not converted. They are rejected with a plain-language message so the application never guesses at the meaning of an old chart.

---

## At a glance

The visualization feature turns a research question into a chart through three separate layers:

1. **Question** - What data should be compared?
2. **Answer** - Which observations, periods, and issues did the data service return?
3. **Presentation** - How should that answer look?

Keeping these layers separate is the central design rule. Changing a title, palette, or other styling does not redefine the research question. Changing an outcome, comparison, place, period, or calculation does. Chart type belongs to presentation, but a switch can require a compatible time contract or map geography before the same question can be drawn.

```text
Reader choices
    |
    v
Data question  --->  Observations and issues  --->  Chart presentation
                         |
                         +----------------------->  Data table and exports
```

### Plain-language glossary

| Term | Meaning |
|---|---|
| Topic | A curated PPIC dataset and its chart-building page, such as Population & Housing. |
| Question | The durable description of the data to retrieve: dataset, outcome, comparisons, geography, time, and calculation. |
| Comparison | One group the reader wants to see, such as women ages 25-29 or all households. A comparison may also use its own place or time selection. |
| Observation | One returned value with its period, place, source, status, and calculation history. |
| Presentation | The chart type, labels, formatting, colors, tabs, visibility, and other display choices. |
| Inline data | A typed table pasted or uploaded into the standalone Visualization Tool. |
| Workspace | One to four charts edited and exported together. |

> [!note] Legacy code names
> A few implementation identifiers still use `module`, including `/[module]`, `moduleId`, `ModuleWorkbench`, and `moduleRegistry.js`. They are literal code names. Product copy and this specification use **topic**.

---

## Two ways to build a visualization

The same question model and rendering pipeline support two interfaces.

| | Topic workbench | Visualization Tool |
|---|---|---|
| Route | A topic route implemented by `/[module]` | `/visualization-tool` |
| Data | A curated PPIC dataset | A table supplied by the reader |
| Layout | One screen with a persistent sidebar and chart card | Three steps: Import, Edit, Export |
| First view | A chart-shaped skeleton; no data request is made until the reader acts | Import begins with an empty inline question |
| Field mapping | The topic schema supplies outcomes, comparison dimensions, time, and geography | The tool infers column types and proposes chart-role mappings |
| Saved browser views | Not offered | Offered because the inline table must travel with the view |
| Preset and activity tools | Not offered | Available through the standalone capability set |
| Multi-chart workspace | Yes | Yes |
| Rendering | Observation adapters | The same observation adapters |

### Topic workbench

A topic page is designed for exploration. The left rail contains the settings that apply to the selected topic and chart. The chart card contains the preview, a Chart/Data toggle, topic documentation, and export controls.

A fresh topic page deliberately opens unfinished. It does not choose a comparison, geographic level, or location for the reader. The preview names the missing selections and stays on the skeleton until the question is answerable.

A complete built-in view, deep link, or embed may render immediately because it already records the reader's choices.

### Visualization Tool

The standalone tool is designed for a reader's own table:

1. **Import** - Paste or upload data and confirm column types.
2. **Edit** - Choose the chart and edit the shared sidebar settings beside a live preview.
3. **Export** - Download or embed the result.

The imported table is stored inside the question. Role-to-column bindings connect chart concepts such as outcome, time, category, and series to the actual column names.

### Shared behavior

Both interfaces use the same:

- question specification;
- chart catalog;
- calculation registry;
- observation contract;
- sidebar section registry;
- chart adapters;
- workspace layouts; and
- chart, data, and embed export paths.

A feature that changes the meaning of a question must behave consistently in both interfaces. Surface-specific tools may differ when the data source creates a real need, as browser-saved views do for inline data.

---

## How a reader builds a chart

The editor follows the question from broadest choice to finishing details.

1. **Choose the dataset**, when a topic has more than one.
2. **Choose a chart type.**
3. **Choose the outcome** and an allowed calculation.
4. **Define comparisons**, when the topic has comparison dimensions.
5. **Choose time.**
6. **Choose geography and locations**, when the topic has geographic levels.
7. **Adjust labels, appearance, and typography.**
8. **View, export, or add charts to the workspace.**

The editor can change which controls appear after a chart-type switch. It keeps compatible choices, parks chart-specific appearance choices for later reuse, and clears choices that cannot apply to the new chart. It does not silently invent missing research choices.

### Sidebar sections

The current section order is owned by `lib/visualization/sidebarSections.js`.

| Section | What the reader decides | When it appears |
|---|---|---|
| Datasets | Which published dataset or source answers the question | Only when the topic offers a real dataset choice |
| Chart Type | Which visual form to use | Always |
| Outcome | Which measure to show and which calculation to apply | Always in version 3 |
| Comparisons | Which demographic or categorical groups to compare and how to present them | When the topic declares comparison dimensions |
| Time | A range, snapshot, selected snapshots, or two periods | When the question has a time contract |
| Geographic Level | Geographic level, locations, and eligible ranking controls | When the topic has geographic subsets |
| Labels | Title, subtitle, axis labels, legend visibility, and related text | When the chart supports labels |
| Appearance | Palette, legend, chart-specific styling, comparison display, and annotations | When the chart supports appearance settings |
| Typography | Text sizes and decimal precision | When the chart supports appearance settings |

**Outcome** also contains calculation controls. `TransformSection` remains the component that supplies part of this content, but it is not a separate sidebar section.

### Advanced Mode

Advanced Mode reveals specialized choices without changing the basic workflow. Current advanced settings include:

- Top or Bottom ranking;
- difference from a benchmark;
- an explicit series binding for inline data;
- comparison colors and visibility;
- per-comparison geography or time overrides;
- custom diverging color stops; and
- hiding the horizontal axis where the chart supports it.

Multi-chart controls are not hidden behind Advanced Mode. If the interface supports a workspace, the reader can discover it directly.

---

## Chart catalog

There are twelve registered chart families. A chart can still be unavailable for a particular topic, calculation, or data source.

| Chart | Best used for | Important rule |
|---|---|---|
| Line | Change across an ordered sequence, usually time | Needs an ordered time axis and an outcome |
| Bar | Comparing categories, places, or selected periods | Can be vertical or horizontal; supports grouped and diverging variants |
| Choropleth Map | Geographic variation shown by area color | Requires joinable boundary geometry and stable place identifiers |
| Matrix Heatmap | Patterns across many rows and periods | Encodes the outcome with a color scale |
| Range | The gap between exactly two values per category | Uses two periods of the same measure |
| Dot Plot | Several series as dots on one shared value axis | Uses category, series, and value roles |
| Forest / Whisker Plot | Estimates and confidence intervals | Uses lower bound, upper bound, and an optional estimate |
| Scatter | The relationship between two numeric measures | Each point needs an observation unit |
| Bubble | A scatter plot with a third measure encoded as point area | Bubble size values must be non-negative |
| Pie / Donut | Parts of a whole at one point in time | Intended for a small number of slices |
| Symbol Map | Magnitude by place using proportional markers | Requires representative points and stable place identifiers |
| Data Table | Exact values in searchable, sortable rows | Uses the answered question without graphical marks |

The chart registry owns each chart's required roles, accepted field kinds, time contracts, calculation choices, comparison presentations, color behavior, defaults, and complexity guidance. The editor reads those declarations instead of maintaining separate chart lists.

### Availability

A chart is offered only when all relevant gates pass:

- the chart id is registered;
- the topic allows it;
- the selected calculation is compatible;
- its required fields can be supplied; and
- map geometry exists when the chart needs it.

Unavailable choices remain understandable. When useful, the editor explains why a chart cannot show the current question.

---

## Questions, comparisons, and calculations

### The question

A question records seven possible areas:

| Area | What it means |
|---|---|
| Dataset | A curated topic id or an inline table and its column bindings |
| Source | A selected published source when the topic exposes one |
| Outcome | The measure to analyze |
| Geography | Shared geographic level and locations |
| Time | The time contract and selected periods |
| Calculation | The calculation id and its parameters |
| Comparisons | Up to ten named comparison definitions |

Comparisons have stable ids. Their labels may be derived from selected dimensions or replaced with a custom label. In Advanced Mode, a comparison may override shared geography or time.

### Calculations

The shared calculation registry is the only owner of formulas for both curated and inline data.

| Calculation | Plain-language result |
|---|---|
| Actual value | The published value |
| Sum | A total, when the measure is additive |
| Weighted mean | An average that respects the measure's weights |
| Average selected years | The mean across two or more chosen periods |
| Numeric change | End value minus start value |
| Year over Year (Percentage) | Percentage change between adjacent periods |
| Percentage-point change | Change between rates or percentages |
| Index to Base Year | Change relative to a selected base period |
| Difference from benchmark | Value minus an aligned benchmark value |
| Ranking | Ordered Top or Bottom results |

The measure and chart determine which calculations are allowed. For example, percent change is not offered for rate measures where percentage-point change is the meaningful operation.

### Comparison presentation

The chart determines how multiple comparisons may appear:

- **Combined** - in one plotting area;
- **Tabs** - one comparison at a time;
- **Rows** - repeated row-like marks;
- **Slices** - parts of a whole.

The editor only offers presentations that the active chart can render.

---

## Data answers and missing values

A successful answer contains four arrays:

- `observations`;
- `comparisons`;
- `periods`; and
- `issues`.

Each observation carries its comparison, outcome, unit, period, value, source, geography or category when relevant, calculation metadata, and two status fields.

### Value status

| Status | Meaning |
|---|---|
| `available` | A finite numeric value can be shown |
| `missing` | No value exists for that requested cell |
| `suppressed` | A value exists conceptually but must not be disclosed |

Missing and suppressed values remain `null`. They are never converted to zero.

### Value kind

| Kind | Meaning |
|---|---|
| `observed` | A reported historical value |
| `projected` | A projected value |
| `derived` | A value produced by a calculation |

Derived observations record their included periods so exports and diagnostics can explain how the value was formed.

### Issues

Issues are explicit and machine-readable:

- **Blocking** issues stop the whole question.
- **Comparison** issues identify one comparison that cannot be answered.
- **Information** issues explain a non-blocking condition.

A response cannot mark a comparison invalid without attributing a comparison-level issue to it.

---

## Preview states and feedback

The preview has seven states.

| State | What the reader sees | Data request |
|---|---|---|
| `idle` | A chart-specific skeleton before the first workbench interaction | No |
| `unconfigured` | The skeleton plus the selections still needed | No |
| `loading` | A loading state while the answer or geometry is fetched | In progress |
| `invalid` | A clear reason the chosen question cannot be answered | Completed or blocked |
| `empty` | A valid question returned no displayable rows | Completed |
| `error` | The request or rendering failed unexpectedly | Failed |
| `ready` | The chart or data table | Completed |

An unfinished question is not an error. That distinction prevents the interface from scolding a reader who simply has not finished choosing settings.

Each chart declares its own skeleton shape, so the waiting state resembles the chart being built rather than defaulting to generic bars.

---

## Maps and geography

Map data is kept separate from the observation answer.

- Choropleth maps fetch polygons.
- Symbol maps fetch representative points and polygons.
- Observations carry stable geographic identifiers used for the join.
- Geometry is cached by geographic level.
- Changing a measure or period does not require downloading the same geometry again.

The current server geometry contract covers counties. A topic without the Counties subset does not offer map charts. The standalone tool does not accept pasted boundary or coordinate data, so map choices are unavailable there.

Representative points for symbol maps are derived from the existing polygons. This avoids adding a second geography file while keeping points inside irregular shapes when a plain centroid would fall outside.

---

## Labels, appearance, and accessibility

The editor derives useful labels from the question, then lets the reader override them. Clearing an override returns to the derived label rather than erasing the concept.

The current interface supports:

- title, subtitle, axis labels, and legend visibility;
- categorical palettes and sequential or diverging ramps;
- per-comparison legend labels, colors, and visibility;
- chart-specific controls such as orientation, reference lines, point styles, and value labels;
- font sizes and decimal precision; and
- footnotes, tooltips, and annotations where supported.

Accessibility and editorial guardrails include:

- one visible label for every form control;
- keyboard-operable standard controls;
- text explanations for unavailable and invalid states;
- status text for loading and empty results;
- chart-specific skeletons that do not imply real data;
- no silent conversion of missing values to zero;
- no silent mixing of incompatible sources or measures; and
- auto-derived labels that preserve canonical dataset names unless the reader intentionally overrides display text.

This specification does not claim that color alone is sufficient for every chart. Chart reviews should still check contrast, legend clarity, direct labels, and whether a table or alternate chart communicates the result more clearly.

---

## Workspaces, views, sharing, and export

### Workspaces

A workspace contains one to four charts. The available layouts are one chart, two side by side, two stacked, and a two-by-two grid. Each chart keeps its own question and presentation, while the workspace records the active chart and layout.

### Views and links

A saved or built-in view stores the declarative version 3 specification, not a rendered Plotly figure.

- Built-in topic views can open through `?view=`.
- The standalone tool can save named views in browser storage.
- A view can open only on the topic or inline-data interface that owns its dataset.
- Version 1 and version 2 views are rejected with `UNSUPPORTED_VERSION_MESSAGE`.
- Embed links serialize the workspace so multiple charts and their layout travel together.

### View Data

On a topic workbench, **View Data** loads the entire cleaned dataset, including all rows and columns, only when the reader opens it. It is not the narrowed table under the current chart.

On the standalone tool, the full imported table is already present, so no server request is needed.

### Export

Chart export supports:

- PNG;
- SVG;
- JPG;
- PDF; and
- an iframe embed.

Data export supports:

- the data as displayed; and
- the complete original dataset,

in CSV or Excel formats. A displayed-data export waits for a ready preview. A full topic dataset can still be exported before a chart is configured.

---

## System design and ownership

### Current request flow

```text
Question-changing edit
    |
    v
ChartConfigProvider
    |
    +--> missingQuestionSelections
    |        |
    |        +--> unfinished: skeleton, no request
    |
    +--> curated topic: POST the question to the topic API
    |        |
    |        +--> executeQuestion + topic adapter
    |
    +--> inline data: executeInlineQuestion in the browser
             |
             +--> shared calculation registry

Answer + optional geometry
    |
    v
adaptObservations
    |
    v
Plotly figure or DataTableView
```

Presentation-only edits such as label or palette changes reuse the existing answer when the data question has not changed. Chart switches can update an incompatible time contract, and map switches may set the supported geography and fetch the required geometry artifact.

### Ownership map

| Responsibility | Primary owner |
|---|---|
| Durable version 3 shape and chart-switch behavior | `lib/visualization/questionSpec.js` |
| Default topic and inline questions | `lib/visualization/defaultQuestions.js` |
| Missing-selection checks | `lib/visualization/questionReadiness.js` |
| Chart catalog and capabilities | `lib/visualization/chartRegistry.js` |
| Resolved editor choices | `lib/visualization/resolveEditorModel.js` |
| Ordered sidebar composition | `lib/visualization/sidebarSections.js` |
| Approved settings inventory | `lib/visualization/settingsRegistry.js` |
| Comparison creation, labels, overlap, and limit | `lib/visualization/comparisons.js` |
| Curated question execution | `lib/data/visualization/executeQuestion.js` |
| Calculation formulas | `lib/data/visualization/calculationRegistry.js` |
| Inline question execution | `lib/tabular/toObservations.js` |
| Observation and response validation | `lib/visualization/observationContract.js` |
| Client request and geometry boundary | `components/chart-builder/chartData.js` |
| Observations-to-figure rendering | `lib/visualization/adapters/index.js` |
| Workspace state and undo/redo | `components/chart-builder/chartConfigStore.js` |
| Saved view and workspace serialization | `components/chart-builder/savedViews.js` |
| Image, data, and embed export | `components/chart-builder/ExportMenu.js` and `lib/export/*` |

`toPlotly.js` is not the production editor renderer. It remains live for UI Kit examples. Production editor figures come from `adaptObservations`.

### Interface components and migration notes

| Name | Current role |
|---|---|
| `ModuleWorkbench` | Single-screen topic shell |
| `ModuleSidebar` | Topic sidebar boundary |
| `ChartContainer` | Chart/Data card |
| `ChartContainerFooter` | View toggle, documentation, and export actions |
| `DatasetsSection` | Dataset or source choice; public names come from `datasetLabels.js` |
| `ChartTypeSection` | Available chart tiles |
| `OutcomeSection` | Outcome, calculation, bindings, and relevant transform controls |
| `TransformSection` | Supplies calculation-related controls inside Outcome; no standalone section |
| `TimeSection` | Current version 3 time editor |
| `GeographySection` | Geographic level, places, and ranking; locations come from `useLocationOptions` |
| `CategoriesSection` | Compatibility fallback for older non-geographic category controls; not a primary version 3 section |
| `LabelsSection` | Display label overrides and visibility |
| `AppearanceSection` | Palette and chart-specific styling |
| `TypographySection` | Text size and decimal precision |
| `DateRangeSection` | Retired at the version 3 cutover and replaced by `TimeSection` |

Production chart requests no longer use chart-specific GET views such as line, category, matrix, or geo. Curated chart questions use one coordinated POST. The remaining GET requests serve location options, full-table data, and geography artifacts.

---

## Question specification version 3

The following example is illustrative. It asks for one demographic projection comparison and presents it as a line chart.

```json
{
  "version": 3,
  "question": {
    "dataset": {
      "kind": "module",
      "moduleId": "demographic-projections"
    },
    "source": "DoF P-3",
    "outcome": {
      "measureId": "Population"
    },
    "geography": {
      "subset": "Counties",
      "locations": ["Alameda County"]
    },
    "time": {
      "contract": "range",
      "startYear": 2020,
      "endYear": 2030
    },
    "calculation": {
      "id": "actual",
      "params": {}
    },
    "comparisons": [
      {
        "id": "cmp_example",
        "dimensions": {
          "Race/Ethnicity": "All",
          "Sex": "Both Sexes",
          "Age Group": "All Ages"
        },
        "customLabel": null,
        "color": null
      }
    ]
  },
  "presentation": {
    "chartType": "line",
    "comparisonPresentation": "combined",
    "labels": {},
    "format": {},
    "appearance": {},
    "annotations": []
  }
}
```

### Durable top-level fields

| Field | Purpose |
|---|---|
| `version` | Must be `3` |
| `question` | Data meaning; sent to a curated topic API or executed locally for inline data |
| `presentation` | Visual form; never sent as part of the curated data request |

The serializer keeps only approved question and presentation keys. Computed preview state, loaded observations, validation feedback, and rendered figures are not saved.

### Question keys

`normalizeQuestion` preserves:

- `dataset`;
- `source`;
- `outcome`;
- `geography`;
- `time`;
- `calculation`; and
- `comparisons`.

For inline data, `question.dataset` has `kind: "inline"`, the typed table in `inline`, and role-to-column `bindings`.

### Presentation keys

`normalizeQuestion` preserves:

- `chartType`;
- `comparisonPresentation`;
- `activeTab`;
- `activePeriod`;
- `primaryTabAxis`;
- `bindings`;
- `comparisonVisibility`;
- `labels`;
- `format`;
- `appearance`;
- `annotations`; and
- chart-specific parked settings in `charts`.

When the chart type changes, settings owned only by the old chart are parked under `presentation.charts`. If the reader returns to that chart, compatible parked settings are restored.

---

## Settings reference

This block is generated from `lib/visualization/settingsRegistry.js`. It is the factual inventory of approved question and presentation settings that require cross-layer ownership. Visual details with many chart-specific choices remain documented through the chart registry and section components.

<!-- settings-reference:start -->
| ID | Setting | Section | Mode | Applies to | Values or limits | Config key | Consumer |
|---|---|---|---|---|---|---|---|
| benchmarkDifference | Difference from benchmark | Outcome | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.calculation.params.benchmark | lib/data/visualization/calculationRegistry.js |
| calculation | Transformation | Outcome | standard | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.calculation.id | lib/data/visualization/calculationRegistry.js |
| comparisonColor | Comparison color | Appearance | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.comparisons[].color | lib/visualization/palettes.js |
| comparisonGeographyOverride | Comparison geography override | Comparisons | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.comparisons[].geography | lib/data/visualization/executeQuestion.js |
| comparisonLegendLabel | Comparison legend label | Appearance | standard | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.comparisons[].customLabel | lib/visualization/adapters/index.js |
| comparisonPresentation | Comparison presentation | Comparisons | standard | Charts: All; datasets: All | See resolved chart and dataset capabilities | presentation.comparisonPresentation | lib/visualization/adapters/index.js |
| comparisons | Comparisons | Comparisons | standard | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.comparisons | lib/data/visualization/executeQuestion.js |
| comparisonTimeOverride | Comparison time override | Comparisons | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.comparisons[].time | lib/data/visualization/executeQuestion.js |
| comparisonVisibility | Comparison visibility | Appearance | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | presentation.comparisonVisibility | lib/visualization/adapters/index.js |
| customDivergingStops | Custom diverging stops | Appearance | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | presentation.appearance.divergingStops | lib/visualization/palettes.js |
| hideXAxis | Hide horizontal axis | Appearance | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | presentation.appearance.hideXAxis | lib/visualization/adapters/index.js |
| outcome | Outcome | Outcome | standard | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.outcome.measureId | lib/data/visualization/executeQuestion.js |
| ranking | Ranking | Geography | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.calculation.params.ranking | lib/data/visualization/rankObservations.js |
| seriesBinding | Series binding | Outcome | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | presentation.bindings.series | lib/tabular/toObservations.js |
| time | Time | Time | standard | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.time | components/chart-builder/sections/TimeSection.js |
<!-- settings-reference:end -->

Run `npm run check:settings` to verify that this block matches the registry.

---

## Acceptance criteria

The feature is working as specified when all of the following are true:

- Every registered topic starts from a version 3 default question.
- Every registered chart type has an observation adapter.
- Both interfaces use the same question and observation contracts.
- Curated chart requests send only `version` and `question` by POST.
- Inline data uses the shared calculation registry rather than a second formula implementation.
- Unfinished questions make no data request.
- Missing and suppressed values remain distinct from zero.
- A chart type is hidden or explained when the active data cannot support it.
- Map geometry is loaded separately from observations.
- Presentation-only changes do not redefine the question.
- Saved views contain durable declarative state rather than loaded data or a rendered figure.
- Old saved-view versions fail clearly instead of being partially migrated.
- The generated settings reference is current.

### Verification

The most relevant automated checks are:

- `tests/js/architecture/visualizationV3Cutover.test.js`;
- `tests/js/fixtures/visualizationV3.contract.test.js`;
- `tests/js/lib/visualization/questionSpec.v3.test.js`;
- `tests/js/lib/visualization/questionReadiness.test.js`;
- `tests/js/lib/visualization/adapters/*`;
- `tests/js/lib/data/visualization/*`;
- `tests/js/components/chart-builder/sections/*`;
- `tests/js/components/chart-builder/wizard/*`;
- `tests/js/components/chart-builder/workbench/*`; and
- `tests/js/tools/generateSettingsReference.test.js`.

Use these commands for a documentation and behavior check:

```bash
npm run check:settings
npm test
npm run build
```

---

## Current limits

These are intentional current boundaries, not hidden fallback behavior:

- A question can contain at most ten comparisons.
- A workspace can contain at most four charts.
- Server-provided map geometry currently covers counties.
- Pasted tables cannot supply custom map geometry or coordinates.
- Browser-saved views are a standalone Visualization Tool feature.
- Old version 1 and version 2 views are unsupported.
- A topic's **View Data** table shows the full cleaned dataset, not only the chart's filtered rows.
- Chart availability varies by topic, calculation, field roles, and geometry.

---

## Related documents

- [[projectSpec]] - Whole-project architecture and topic inventory
- [[unit-tests]] - Testing strategy and suite organization
- [[topic-workbench-overhaul]] - Topic workbench decisions and implementation history
- [[visualization-backend-refractor]] - Version 3 backend goals and migration record
- [[visualization-backend-removal-changelog]] - Reviewed quarantine and removal ledger
