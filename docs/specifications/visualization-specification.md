---
Topic: Technical
Content Type: project specification
pinned: true
description: "Current product and technical specification for building, rendering, sharing, and exporting visualizations in the PPIC Data Explorer."
Date Published: July 27, 2026
Last Updated: 10/01/2026 - 02:00 PM
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
| Labels | Title, subtitle, and axis labels, each with a show switch | When the chart supports labels |
| Appearance | Palette, Legend Position, footnote and the source box switch, number formats, and chart-specific styling | When the chart supports appearance settings |
| Typography | Text sizes and decimal precision | In Advanced Mode, when the chart supports appearance settings |

**Outcome** also contains calculation controls. `TransformSection` remains the component that supplies part of this content, but it is not a separate sidebar section.

### Advanced Mode

Advanced Mode reveals specialized choices without changing the basic workflow. Current advanced settings include:

- Top or Bottom ranking, with an **Off** choice that removes it;
- difference from a benchmark;
- an explicit series binding for inline data;
- the Comparison appearance block (each comparison's label, color, and visibility);
- per-comparison geography or time overrides;
- custom diverging color stops;
- hiding the horizontal axis where the chart supports it;
- the Typography section (text sizes and decimal places);
- horizontal and vertical line spacing and both tick increments; and
- the line chart's Markers switch and dashed range.

Settings saved from these controls still apply when Advanced Mode is off; only the controls are hidden. The section-level gate is the `advanced: true` flag on a `sidebarSections.js` descriptor.

Ranking a time series ranks whole series: each place is ranked by its latest available value, and every period is kept for the places that make the cut (`rankObservations.js`). Rows with no period, such as an unbound snapshot, are still ranked one by one.

Multi-chart controls are not hidden behind Advanced Mode. If the interface supports a workspace, the reader can discover it directly.

---

## Chart catalog

There are twelve registered chart families. A chart can still be unavailable for a particular topic, calculation, or data source.

| Chart | Best used for | Important rule |
|---|---|---|
| Line | Change across an ordered sequence, usually time | Needs an ordered time axis and an outcome. Drawn with visx by default (see [Chart renderers](#chart-renderers)) |
| Bar | Comparing categories, places, or selected periods | Vertical or horizontal; grouped, stacked, stacked to 100%, and diverging variants; optional value labels. A visx drawing exists (see [Chart renderers](#chart-renderers)) |
| Choropleth Map | Geographic variation shown by area color | Requires joinable boundary geometry and stable place identifiers |
| Matrix Heatmap | Patterns across many rows and periods | Encodes the outcome with a color scale |
| Range | The gap between exactly two values per category | Uses two periods of the same measure. Drawn with visx by default (see [Chart renderers](#chart-renderers)) |
| Dot Plot | Several series as dots on one shared value axis | Uses category, series, and value roles |
| Forest / Whisker Plot | Estimates and confidence intervals | Uses lower bound, upper bound, and an optional estimate |
| Scatter | The relationship between two numeric measures | Each point needs an observation unit |
| Bubble | A scatter plot with a third measure encoded as point area | Bubble size values must be non-negative |
| Pie / Donut | Parts of a whole at one point in time | Intended for a small number of slices |
| Symbol Map | Magnitude by place using proportional markers | Requires representative points and stable place identifiers |
| Data Table | Exact values in searchable, sortable rows | Uses the answered question without graphical marks |

The chart registry owns each chart's required roles, accepted field kinds, time contracts, calculation choices, comparison presentations, color behavior, renderer, defaults, and complexity guidance. The editor reads those declarations instead of maintaining separate chart lists.

### Chart renderers

Charts are moving from Plotly to visx one type at a time, following [[chart-renderer-implementation-plan]]. Every registry descriptor declares `renderer: "plotly" | "visx"`.

| Chart | Default renderer | Notes |
|---|---|---|
| Line | visx | Default since September 29, 2026, ahead of the export rebuild |
| Bar | visx | Default since September 30, 2026, ahead of the export rebuild |
| Range | visx | Default since October 1, 2026, ahead of the export rebuild |
| Choropleth Map, Symbol Map | Plotly | Stay on Plotly permanently |
| Every other chart | Plotly | Each moves to visx in its own plan workstream |

- `rendererFor(type, preview)` picks the renderer. A `?renderer=visx` or `?renderer=plotly` page-address parameter previews the other drawing for comparison. It is honored only when that drawing exists (`VISX_CHART_TYPES`) and is ignored in embeds (`embed=1`), so a shared embed always shows the default.
- A visx chart is drawn from a chart model (`lib/visualization/models/`) inside `ChartFrame`, which draws the PPIC frame: eyebrow, title, subtitle, the drawing and its key, and the source-and-notes box.
- Plotly charts keep their titles inside Plotly until export can draw the frame (Workstream M).

#### The visx line chart

- **Lines.** Lines are 2px and solid. Horizontal grid lines only. Lines break at missing and suppressed values, never drawing them as zero.
- **Markers.** Off unless saved on, as the style guide asks; the Plotly line chart follows the same rule. A point with no neighbour always gets a marker, so it is never invisible.
- **Dashed range.** Solid unless the reader turns it on (`appearance.dashedRange = { from, to, label }`), for example for projected years. A segment is dashed when both of its ends are inside the range.
- **Key.** With Legend Position set to **Automatic** (the line default), each line is labeled at its end in its own color when the labels fit and there are no more than four lines; otherwise the key sits on the right. A series color too pale to read as text is darkened, keeping its hue, to 4.5:1 contrast.
- **Hover label.** This matches PPIC's published Datawrapper charts. It labels only the point nearest the pointer, measured across and up and down, with a gray ring and a boxless label: the series name in bold, then the period and value in gray, with a white outline. The label reads leftward on the right half of the chart and drops below the point near the top. Values use the View Data number format.
- **Keyboard.** The chart takes focus. Left and Right move along a line, Up and Down move between lines, Home and End jump to the ends, and Escape closes the label.
- **Year labels.** The axis always labels the latest period, then steps back evenly by 1, 2, 5, 10, or more years; for example, 1991 to 2026 reads 1991, 1996, ..., 2026. The step is never finer than the data's own spacing, and a tick increment sets it.
- **Line spacing.** Horizontal spacing adds pixels between neighbouring value gridlines and Vertical spacing between neighbouring periods. The drawing grows to fit and scrolls sideways when it is wider than the preview.

#### The visx bar chart

Built September 30, 2026 (Workstream E), following the style guide and the PPIC bar charts in `mockups/bar chart reference/`. It is the default bar drawing; `?renderer=plotly` shows the Plotly version.

- **Bars.** The value axis starts at zero, and no bar is narrower than 10px: the gap between groups shrinks first, and when even that is not enough the chart asks for fewer categories. Vertical bars draw horizontal grid lines; horizontal bars draw none, since theirs would be vertical. Missing and suppressed values are gaps, never zero-height bars.
- **Layouts.** Orientation, Stacking (side by side, stacked, or stacked to 100%), and Diverging bars (bars grow from a center value, with an optional reference line, manual value range, and threshold colors). A stack is shaded dark to light: the series' own colors are handed out darkest first from the bottom segment up. In Advanced Mode, **Bars along** puts periods on the axis instead of locations, and **Color bars by** (shown when the bars have several comparisons and several periods) colors by comparison or period and nests the other inside each location, with dividers on vertical bars and bold header rows on horizontal ones.
- **Order.** **Sort** chooses data order, largest first, or smallest first; a dragged location order wins and shows as Custom. A view saved with the old `sort: "value"` default draws in data order, as it always did. **Bar order within groups** is a drag list of the series (for example the years), which also orders each stack from its base up and the key; each series keeps its color.
- **Labels.** Category labels wrap onto two lines, then angle 45 degrees when that is not enough, and turn 90 degrees only when the bars are too close for angled labels. Horizontal bars use left-aligned row labels, as PPIC's published charts do. **Show values** writes each value inside the bar (white or dark text, whichever reads better) or just past its end; Automatic places them outside for one series or when only some series are labeled, and moves any label that does not fit. **Stack totals** adds a bold total past each stack. Labels never overlap; a value that cannot be labeled stays in hover and View Data.
- **Key.** The key sits above the chart by default. With one series, its entry names what the bars measure and the value axis title is not repeated above the axis (unless the key is hidden). With **Automatic**, stacked vertical bars name each series beside the last stack instead, falling back to a key on the right when the names do not fit.
- **Track rail and minimal axis.** Both work on every bar chart, not only diverging ones. Track rail is in Advanced Mode.
- **Threshold colors.** Only the style guide's ten official colors are offered.
- **Hover.** This matches PPIC's published bar charts: the information goes on the chart, with no floating box. With several series, the hovered series keeps its color and shows all of its values, the others fade to a 30% tint, and so do their swatches in the key. A stack labels the hovered series in every segment only when all of them fit; otherwise only the hovered value shows, past the end of its stack. With one series, the hovered bar darkens (official orange to official red) and shows its value above it in bold, unless it is already labeled. Hover numbers take the hovered bar's color, darkened just enough to read outside a bar, and white or dark gray inside one. The hovered category label turns bold; the others keep their gray. Screen readers hear the series, category, value, and any stack total.
- **Keyboard.** The chart takes focus; the arrow keys step through the bars, Home and End jump to the first and last, and Escape clears the hover.
- **Axis labels.** X-Axis and Y-Axis name the horizontal and vertical axes, so a horizontal bar's automatic labels put the measure on X.

#### The visx range chart

Built October 1, 2026 (Workstream F), following PPIC's published range plots in `mockups/range chart reference/`. It is the default range drawing; `?renderer=plotly` shows the Plotly version.

- **Rows.** One row per category, labeled at the left, with a dotted guide line along it. With several comparisons and several locations, each location becomes a group with a bold header row, holding one row per comparison. With several comparisons and one location, each row is a comparison. Rows keep data order until the reader drags the locations in the Geographic Level list, which orders the rows (or the groups); Ranked values sits there too in Advanced Mode. The empty Categories panel no longer shows for range charts.
- **Ends.** Each end has its own color on every row: Navy for the start and Orange for the end, or the first two colors of a chosen categorical palette. **Range style** chooses Dots (a filled dot at each end, joined by a thick light gray bar) or Arrow (an arrow from the start to the end in the end's color, pointing left for a decline). A row missing either value keeps its label and the mark it has, with no connector.
- **Key.** A key names the two ends' periods with a dot in each end's color, above the chart by default. Range charts offer no Automatic position; a view saved with "automatic" draws the key on top. The chart is only as tall as its rows, so the source box follows it directly.
- **Row labels.** Group and Variable alignment are left by default, as PPIC's published charts show. In a version 3 view Variable alignment always shows, and Group alignment shows when the chart draws groups. The row label indents stay hidden.
- **Value axis.** Fits the data with round ends instead of starting at zero, and draws a darker line at zero whenever the axis reaches it. A light vertical grid line marks each labeled tick, departing from the guide's rule against vertical grid lines as the published charts do. Labels thin out when they would touch. **Value axis position** (Advanced Mode) puts the axis at the bottom or the top. **Hide X-Axis** (Advanced Mode) saves `hideXAxis` and leaves out the labels and grid lines but keeps the zero line. A view saved with the old `showValueAxis: false` opens with it on, and a saved `hideXAxis` wins. The automatic X-Axis label is the measure.
- **Point values.** **Show point values** writes each value just outside the row's range, left of the lower end and right of the higher one, in its end's color. **Label which end** (Advanced Mode) labels both ends, the start only, or the end only. **First line only** labels the first row only.
- **Hover.** The information goes on the chart, as on the bar chart. The hovered row's label turns bold, and both of its values appear beside its ends in bold. With several comparisons, the other comparisons' rows fade to a 30% tint. Screen readers hear the row, both periods, and both values.
- **Keyboard.** The chart takes focus; the arrow keys step through the rows, Home and End jump to the first and last, and Escape clears the hover.

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

- title, subtitle, and axis labels, each with a show switch;
- Legend Position (in Appearance only; **Top**, **Right**, **Bottom**, or **Hidden**, plus **Automatic** on charts that can name their series directly; **Hidden** replaces the retired Legend switch);
- categorical palettes and sequential or diverging ramps;
- per-comparison legend labels, colors, and visibility (Advanced Mode);
- chart-specific controls such as orientation, reference lines, point styles, and value labels;
- font sizes and decimal precision (Advanced Mode); and
- a footnote, the **Show source and notes** switch, and annotations where supported.

The owner removed three controls, and saved views that still hold their settings open normally and ignore them: the Legend switch (`showLegend`), the Tooltip template (`labels.tooltip`), and the per-series rename, hide, and color list (`legendLabels`, `hiddenSeries`, `seriesColors`).

Style values come from one owner, `lib/visualization/chartStyle.js`, built from `lib/constants.js` tokens, including the style guide's graph-line gray `#6C7075`, subtitle gray `#646D76`, and source-box gray `#EFF0F2`. Chart text uses Inter, whose 400 and 700 weights are loaded. `lib/visualization/models/sharedSettings.js` is the one reader for the settings every chart shares.

For visx charts, the source-and-notes box follows PPIC's published Datawrapper standard:

- a `#EFF0F2` box with 15px padding, 20px below the chart;
- 11px text on 16px lines in `#6C7075`;
- bold uppercase **SOURCE:** and **NOTES:** captions; and
- citations separated by semicolons, with a period ending the source line.

The other gaps in the frame also follow PPIC's published charts rather than the guide's 48px (`CHART_STYLE.frameGap`, October 1, 2026): 20px below the title block, 12px between a key above or below the chart and the chart, and 24px beside a key on the right.

The source line cites the topic's datasets in full, not the Source filter value. For example, "DoF P-3" becomes "California Department of Finance (DOF), P-3 Population Projections". Each module schema declares a `sourceCitations` map from source id (or `default`) to citation, and `citeSources` in `datasetLabels.js` resolves it. **Show source and notes** (`appearance.showSource`) hides the whole box.

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

Image export still renders through `Plotly.toImage`. For a chart drawn with visx (currently the line, bar, and range charts), the image dialog shows a notice that image export is coming soon, and its Download button stays off. Embeds and data export work normally. Workstream M of [[chart-renderer-implementation-plan]] rebuilds export from the drawn SVG.

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
rendererFor(chart type, preview request)
    |
    +--> "plotly": adaptObservations --> Plotly figure or DataTableView
    |
    +--> "visx":   buildChartModel   --> ChartFrame + visx chart
    |
    v
ChartRenderer (marks data-chart-ready when drawn)
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
| Observations-to-figure rendering (Plotly) | `lib/visualization/adapters/index.js` |
| Renderer choice per chart type | `lib/visualization/chartRegistry.js` (`renderer`, `rendererFor`) |
| Observations-to-chart-model (visx) | `lib/visualization/models/` |
| Drawing either renderer, and the ready signal | `components/charts/ChartRenderer.js` |
| PPIC frame and source box | `components/charts/ChartFrame.js` |
| Style-guide values | `lib/visualization/chartStyle.js` |
| Shared settings reader | `lib/visualization/models/sharedSettings.js` |
| Series order, names, and colors for both line renderers | `lib/visualization/lineSeries.js` |
| Ranking | `lib/data/visualization/rankObservations.js` |
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
| barColorBy | Color bars by | Appearance | advanced | Charts: bar; datasets: All | series, comparison, period | presentation.appearance.barColorBy | lib/visualization/models/barModel.js |
| barSort | Sort | Appearance | standard | Charts: bar; datasets: All | data, descending, ascending | presentation.appearance.sort | lib/visualization/models/barModel.js |
| benchmarkDifference | Difference from benchmark | Outcome | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.calculation.params.benchmark | lib/data/visualization/calculationRegistry.js |
| calculation | Transformation | Outcome | standard | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.calculation.id | lib/data/visualization/calculationRegistry.js |
| categoryAxis | Bars along | Appearance | advanced | Charts: bar; datasets: All | location, period | presentation.appearance.categoryAxis | lib/visualization/models/barModel.js |
| comparisonColor | Comparison color | Appearance | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.comparisons[].color | lib/visualization/palettes.js |
| comparisonGeographyOverride | Comparison geography override | Comparisons | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.comparisons[].geography | lib/data/visualization/executeQuestion.js |
| comparisonLegendLabel | Comparison legend label | Appearance | standard | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.comparisons[].customLabel | lib/visualization/adapters/index.js |
| comparisonPresentation | Comparison presentation | Comparisons | standard | Charts: All; datasets: All | See resolved chart and dataset capabilities | presentation.comparisonPresentation | lib/visualization/adapters/index.js |
| comparisons | Comparisons | Comparisons | standard | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.comparisons | lib/data/visualization/executeQuestion.js |
| comparisonTimeOverride | Comparison time override | Comparisons | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.comparisons[].time | lib/data/visualization/executeQuestion.js |
| comparisonVisibility | Comparison visibility | Appearance | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | presentation.comparisonVisibility | lib/visualization/adapters/index.js |
| customDivergingStops | Custom diverging stops | Appearance | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | presentation.appearance.divergingStops | lib/visualization/palettes.js |
| dashedRange | Dashed lines for a range of periods | Appearance | standard | Charts: line; datasets: All | See resolved chart and dataset capabilities | presentation.appearance.dashedRange | lib/visualization/models/lineModel.js |
| hideXAxis | Hide horizontal axis | Appearance | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | presentation.appearance.hideXAxis | lib/visualization/adapters/index.js |
| outcome | Outcome | Outcome | standard | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.outcome.measureId | lib/data/visualization/executeQuestion.js |
| pointLabelEnds | Label which end | Appearance | advanced | Charts: dumbbell; datasets: All | both, start, end | presentation.appearance.pointLabelEnds | lib/visualization/models/rangeModel.js |
| rangeStyle | Range style | Appearance | standard | Charts: dumbbell; datasets: All | dots, arrow | presentation.appearance.rangeStyle | lib/visualization/models/rangeModel.js |
| ranking | Ranking | Geography | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.calculation.params.ranking | lib/data/visualization/rankObservations.js |
| seriesBinding | Series binding | Outcome | advanced | Charts: All; datasets: All | See resolved chart and dataset capabilities | presentation.bindings.series | lib/tabular/toObservations.js |
| seriesOrder | Bar order within groups | Appearance | standard | Charts: bar; datasets: All | Series names in a dragged order (data order by default) | presentation.appearance.seriesOrder | lib/visualization/models/barModel.js |
| showSource | Show source and notes | Appearance | standard | Charts: All; datasets: All | See resolved chart and dataset capabilities | presentation.appearance.showSource | components/charts/ChartFrame.js |
| showStackTotals | Stack totals | Appearance | standard | Charts: bar; datasets: All | On or off, for stacked bars (off by default) | presentation.appearance.showStackTotals | lib/visualization/models/barModel.js |
| showValueLabels | Show values | Appearance | standard | Charts: bar; datasets: All | On or off (off by default) | presentation.appearance.showValueLabels | lib/visualization/models/barModel.js |
| time | Time | Time | standard | Charts: All; datasets: All | See resolved chart and dataset capabilities | question.time | components/chart-builder/sections/TimeSection.js |
| valueAxisPosition | Value axis position | Appearance | advanced | Charts: dumbbell; datasets: All | bottom, top | presentation.appearance.valueAxisPosition | lib/visualization/models/rangeModel.js |
| valueLabelPosition | Label position | Appearance | advanced | Charts: bar; datasets: All | automatic, inside, outside | presentation.appearance.valueLabelPosition | lib/visualization/models/barModel.js |
| valueLabelSeries | Label which series | Appearance | advanced | Charts: bar; datasets: All | All series, or one series by name | presentation.appearance.valueLabelSeries | lib/visualization/models/barModel.js |
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
- Image export of a visx chart (currently the line, bar, and range charts) is not available yet; the image dialog says so.

---

## Related documents

- [[projectSpec]] - Whole-project architecture and topic inventory
- [[unit-tests]] - Testing strategy and suite organization
- [[topic-workbench-overhaul]] - Topic workbench decisions and implementation history
- [[visualization-backend-refractor]] - Version 3 backend goals and migration record
- [[visualization-backend-removal-changelog]] - Reviewed quarantine and removal ledger
- [[chart-renderer-implementation-plan]] - The Plotly-to-visx renderer plan and its decisions
