# Visualization Backend Refactor Guide and Preliminary Specification

## Purpose and scope

This document describes the direction for restructuring the visualization tool before a detailed implementation plan is written. It is both a guide to the intended design and a preliminary specification of the behavior the finished system should support.

A **refactor** changes how a system is organized internally. It does not require the published charts to look different. In this case, however, some editor controls will also need to change because the current controls cannot express all of the questions users want to ask.

In this guide, **backend** means the configuration and data-preparation work behind the visible editor, including both browser and server code. It does not refer only to the server.

The work covers four connected areas:

- How a visualization question is stored.
- How the application requests and prepares data.
- How chart-specific settings are selected and displayed.
- How tests and documentation verify that those pieces remain consistent.

This document intentionally does not prescribe individual files, functions, or a task-by-task implementation sequence. Those details belong in the implementation plan that follows the decisions recorded here.

> **Decision callout: scope**
>
> - **How much visible change is acceptable in the editor?** This asks whether the project must preserve the exact current placement and appearance of every control, or only preserve successful user workflows and published chart output. **Implication:** preserving every control exactly would limit the ability to make comparisons understandable; preserving the broader workflow allows the editor to replace misleading controls while keeping familiar styling.
>   - **Response**: Setting names, placement, and control types may change, except for the Outcome section's name and placement. Keep the current minimal styling and orange accents.
> - **Which existing saved views and shared links must continue to open?** This asks how far backward compatibility must reach. **Implication:** if all saved configurations must continue to work, the project needs a deliberate conversion step; if some may be retired, the conversion can be simpler but users need advance notice.
>   - **Response**: No existing saved view or shared link must continue to open.

## Context and motivation

The current visualization tool begins with a chart configuration, which is a stored recipe containing the chart type, selected fields, filters, period, and appearance. The application converts that recipe into a chart-specific data request, receives prepared data, translates it into Plotly instructions, and then lets Plotly, the chart-drawing library used by the project, draw the chart in the browser.

That pipeline works for the datasets and questions it was originally designed around. The first modules emphasized population and housing data, where a single measure, geography, and set of filters were usually enough. Age, sex, and race projections place greater demands on the same model.

Several related problems now appear:

- Some settings are displayed even though the selected chart does not use them.
- Some settings disappear even though the chart still needs the underlying information.
- A user can choose one age, one sex, and one race or ethnicity, but cannot naturally construct several combinations and compare them together.
- `Group` and `Series` have different meanings in different parts of the system. In some module-backed charts they can be stored without affecting the finished chart.
- The data request is partly shaped by the chart type, so changing a chart can change both presentation and data preparation at the same time.

The donut-year issue discussed in the project meeting is a useful example. A line chart needs a span of years, while a donut needs one or more individual snapshot years. Treating both needs as one generic “year range” setting can cause the entire control to disappear for a donut. The current tool now supplies snapshot charts with a single-year slider, but the example still shows the underlying design problem: the interface is choosing controls from broad chart categories instead of from a precise statement of what the chart needs.

The older labor force projections website demonstrates a different comparison model. Each comparison defines one complete combination of demographic choices, and each comparison becomes its own trend line. Its visual design and one-purpose code should not be copied, but its central idea is valuable: a comparison should be a complete, independent description of a group of people.

> **Decision callout: primary user need**
>
> - **Which comparison questions must the first release support?** This means listing concrete examples, such as “Black versus White residents, each split by sex,” rather than saying only that the tool needs more flexibility. **Implication:** these examples determine whether a simple list of comparisons is sufficient or whether the first release also needs nested breakdowns, multiple outcomes, or comparisons that use different time periods.
>   - **Response**: Support any valid combination available in a dataset. Examples include Black residents ages 18-25 compared with White residents ages 65 and older, Black men ages 18-25 compared with Black women ages 18-25, and groups that use different geography or time selections in Advanced Mode. These examples describe the required flexibility; their exact values still depend on the dataset.
> - **Is the main goal demographic comparison, or a general comparison system for every dataset?** This asks whether age, sex, and race are the first use case for a reusable concept or a special feature of one module. **Implication:** a general model takes more design work at the beginning but avoids creating another module-specific pathway that later has to be replaced.
>   - **Response**: Build a general comparison system for every dataset.

## Design principles

The refactor should follow a small set of principles.

1. **Model the user’s question before choosing how to draw it.** The dataset, outcome, geography, time, and population comparisons describe the question. The chart type describes the presentation.
2. **Make comparisons explicit.** Do not infer important comparison behavior from a loosely defined `Group` or `Series` field.
3. **Reuse concepts, not accidental similarities.** A shared Time section is useful; requiring every chart to use the same time control is not.
4. **Do not offer settings that have no effect.** Every visible setting must be read by data preparation, validation, or rendering.
5. **Do not let hidden settings have surprising effects.** A hidden value must either be safely inactive, deliberately retained for later use, or removed.
6. **Prefer a small, clear data model over a highly configurable one.** Additional layers of abstraction are justified only when they remove real duplication or make behavior easier to verify.
7. **Preserve working visual output when the question has not changed.** Existing charts should continue to communicate the same result after their configuration has been converted.

> **Decision callout: simplicity and flexibility**
>
> - **What is the smallest comparison model that covers the required examples?** This asks where flexibility is genuinely needed and where it is merely possible. **Implication:** supporting explicit comparison groups is straightforward; supporting arbitrary logical expressions such as nested “and/or” filters would substantially increase validation, interface, and testing complexity.
>   - **Response**: In the first version, users select checkbox values for each comparison dimension. For example, one comparison can select Female, All races, All ages, and one geographic level. The user can then add another comparison with different selections.
> - **When should a chart-specific control be allowed?** This asks where shared behavior ends. **Implication:** requiring universal components can create large components full of exceptions, while allowing every chart to build its own controls creates duplication. The preferred boundary is shared components for shared meanings, with small chart-specific presentations when the meaning truly differs.
>   - **Response**: Use shared components for shared meanings and small chart-specific controls where the meaning differs.

## Target mental model

The future system should treat a visualization as a question followed by a presentation choice:

```text
Dataset + outcome + geography + time + comparisons
                         |
                         v
              Consistent observation rows
                         |
                         v
             Chart-specific presentation
```

The first line is the **question model**. It describes what the user wants to know without assuming a line, bar, donut, or map.

The middle line is the **data contract**. A contract is an agreed structure shared by the part of the application that prepares data and the part that displays it.

The final line is the **renderer**. A renderer is the code that translates prepared observations into the marks, axes, labels, and legends of a particular chart.

This separation means that switching from a line to a bar should normally change the presentation, not silently redefine the population being measured.

> **Decision callout: what belongs to the shared question**
>
> - **Are outcome, geography, and time shared by all comparisons in one chart?** This asks whether comparisons differ only by demographic characteristics or can also use different measures, places, and periods. **Implication:** keeping these values shared makes the first model much easier to understand and test. Allowing them to vary turns each comparison into a nearly complete chart and overlaps with the existing multi-chart feature.
>   - **Response**: In Standard Mode, all comparisons share the outcome, geography, and time selection. In Advanced Mode, geography and time may differ by comparison. The outcome remains shared because support for multiple outcomes is deferred.
> - **Can one chart contain more than one outcome?** This is different from comparing population groups. **Implication:** multiple outcomes introduce unit and scale questions, so they should remain a separate feature unless a required use case clearly depends on them.
>   - **Response**: Defer multiple outcomes in both Standard Mode and Advanced Mode for the first version.

## Comparison model

The chart configuration should contain an explicit list of comparisons. Each comparison should have:

- A stable identifier used to keep data, colors, labels, exports, and saved views connected.
- A default label derived from its selections.
- An optional user-edited label.
- One value for every relevant comparison dimension, such as age group, sex, and race or ethnicity.
- Optional geography and time overrides when Advanced Mode is enabled.

The outcome remains shared by all comparisons in the first version.

For example:

| Comparison label | Age group | Sex | Race or ethnicity |
|---|---|---|---|
| Black women 65–69 | 65–69 | Female | Black |
| White women 65–69 | 65–69 | Female | White |
| Black men 65–69 | 65–69 | Male | Black |
| White men 65–69 | 65–69 | Male | White |

The interface should offer two ways to produce this list:

- **Checkbox generation for regular comparisons.** Selecting Black and White, then Female and Male, generates four comparisons. This is sometimes called a **cross-product**, meaning every selected race is paired with every selected sex.
- **Individual comparison cards for irregular comparisons.** A user can add, edit, label, or remove a specific combination, similar to the older projections website.

Both interfaces must produce the same stored list. Checkbox state should not become a second source of truth that can disagree with the comparison cards.

A chart may contain no more than 10 comparisons. The interface must prevent the user from adding an eleventh comparison and state that the chart has reached its limit.

The default state should be one comparison using the dataset’s aggregate values, such as All Ages, Both Sexes, and All races or ethnicities. An aggregate is a value already representing the whole group. It must not be added to its component groups, because doing so would count the same people more than once.

> **Decision callout: comparison behavior**
>
> - **Should checkboxes always generate every combination, or may users select only particular pairings?** This asks whether Black women and White men can be selected without also creating Black men and White women. **Implication:** automatic generation is fast for regular comparisons, but individual cards are still needed for selected pairings.
>   - **Response**: Allow selected pairings such as Black women and White men without also creating Black men and White women.
> - **What is the practical maximum number of comparisons?** This is not only a performance question; too many lines, slices, or colors can make a chart unreadable. **Implication:** the tool may need a soft warning, a chart-specific display limit, or a recommendation to use a table or several charts.
>   - **Response**: Allow no more than 10 comparisons. Prevent the user from adding an eleventh comparison.
> - **May comparison dimensions overlap?** For example, “All races” overlaps every specific race. **Implication:** overlapping comparisons can be valid when intentionally comparing a subgroup with the total, but labels and explanations must make clear that the groups are not mutually exclusive.
>   - **Response**: Yes. Allow overlapping comparisons.

## Time selection

Time should be described by the number and kind of periods a chart accepts, not by the name of a specific interface control.

The main time needs are:

- **No period:** the dataset or chart has no time dimension.
- **One snapshot:** one value at one point in time.
- **Several snapshots:** selected individual years shown separately.
- **Average of selected snapshots:** the arithmetic mean of selected years shown as one value.
- **Exactly two periods:** a starting and ending value.
- **A range:** a continuous span used for a trend or matrix.

A shared Time section can display different controls for these needs. A dense sequence of yearly observations may justify a slider. A short list of projection years may be clearer as checkboxes. A two-period chart may use two selectors or a two-ended range control.

For donuts, use a searchable list of year checkboxes rather than a continuous range slider. When a user selects multiple years, the user can display each year in an automatically populated tab or display the arithmetic mean in one donut. A donut that displays the mean must include a note that identifies the selected years and states that the values are averages. The tool must not combine years without this explicit selection and note.

| Chart family | Expected time behavior |
|---|---|
| Line | A range or sequence of periods |
| Bar | One snapshot, or several snapshots displayed separately |
| Donut | Searchable year checkboxes; automatic tabs for separate years or a clearly labeled average of selected years |
| Map | One snapshot per map; additional years use tabs or separate panels |
| Range | Exactly two periods |
| Forest | One snapshot or no period; its lower and upper bounds are measure fields, not time endpoints |
| Heatmap | A range or selected sequence |
| Table | Any periods valid for the requested data |

This table is a starting specification. The final capability table must cover every supported chart type.

When a user selects the aggregate-years option, the backend must calculate the arithmetic mean of the selected years. The chart, table, and export must identify the result as an average and list the included years.

> **Decision callout: multiple years**
>
> - **When several years are checked for a donut, should they appear as tabs or small multiples?** Tabs show one chart at a time; small multiples show several charts together. **Implication:** tabs use less space, while small multiples support direct comparison but need limits to remain readable.
>   - **Response**: Let the user choose between automatically populated year tabs and an aggregate-years view. The aggregate-years view uses the arithmetic mean of the selected years and includes a note that states it displays an average.
> - **Should year choices come from every observed year or only designated reporting years?** This asks whether a projection dataset with many annual values should show every checkbox. **Implication:** a long checklist may need grouping, search, or a different control even though the underlying selection still means “several snapshots.”
>   - **Response**: Use a searchable checklist of available years. For projections, default to the module's declared reporting year. The current fixture should use 2025, which is the latest observed Census estimate year represented in the repository, rather than infer the default from the end of the 2070 projection range.
> - **What happens when a user switches between chart types with incompatible time selections?** For example, a line may hold a 2020–2040 range while a range chart needs exactly two endpoints. **Implication:** the system needs a predictable conversion rule and must tell the user if it discards or narrows a selection.
>   - **Response**: Clear the active time selection and show `Select time to show this chart`, consistent with the current module and topic editor.

## Chart capability specification

Each chart type should have one description of what it can accept and display. This is the chart’s **capability specification**. The existing chart registry provides a useful starting point, but the description needs to be precise enough to drive the editor, validation, data preparation, and documentation together.

At minimum, every chart should declare:

| Capability | Meaning |
|---|---|
| Required data roles | The fields that must exist, such as a measure or geographic identifier |
| Period selection | None, one, several, exactly two, or a range |
| Comparison presentation | Lines, grouped marks, slices, tabs, panels, or unsupported |
| Geographic support | Whether the chart requires or can use locations |
| Calculation support | Whether change, indexing, ranking, or other calculations are meaningful |
| Appearance support | The visual controls that its renderer actually reads |
| Readability limits | Warnings or limits for too many categories, comparisons, or periods |

The editor should not add `Group` to every chart merely because grouping might be useful. A chart should declare the comparison presentation it supports. If the chart cannot show a requested comparison clearly, the tool should explain the limitation or recommend a better chart.

One pure decision step should combine the chart capabilities, dataset description, and current configuration into a resolved editor model. “Pure” means it produces the same answer from the same inputs and does not fetch data or change the screen itself. The sidebar, validator, and tests should all read that result instead of maintaining separate lists of exceptions.

> **Decision callout: unsupported combinations**
>
> - **Should the tool prevent an unsupported chart choice or allow it and show guidance?** This asks whether invalid combinations disappear from the chart picker or remain visible but disabled. **Implication:** hiding choices keeps the interface simple, while showing disabled choices can teach users why another chart is more appropriate.
>   - **Response**: In Standard Mode, do not show invalid combinations. In Advanced Mode, allow crowded or experimental combinations when the data and calculation remain valid, and show a low-key information message. Advanced Mode must not allow a mathematically invalid combination or render an incorrect result.
> - **Which limits are strict and which are recommendations?** A strict limit prevents rendering; a recommendation warns that the result may be hard to read. **Implication:** making every readability guideline strict reduces flexibility, but providing no limits allows unusable charts.
>   - **Response**: The 10-comparison maximum and mathematically invalid requests are strict limits. Do not use loud warnings for readability or crowding. Advanced Mode may show a low-key information message for a valid but crowded result.

## Settings and shared interface components

Settings should be divided according to what they control.

**Question settings** determine what data is requested:

- Dataset and source
- Outcome
- Geography
- Time
- Comparisons
- Calculation or transformation

**Presentation settings** determine how valid results are drawn:

- Chart type
- Palette and colors
- Labels
- Orientation
- Legend
- Value labels
- Chart-specific options such as donut hole size

Shared components should represent stable meanings. Useful shared pieces include a Time section, comparison card, checkbox list, field selector, label editor, and validation message. A shared section may select a different small control based on the resolved capabilities.

This is preferable to one large component containing many checks such as “if line,” “if donut,” and “if map.” It is also preferable to separate copies of the same checkbox or label behavior for every chart.

When a chart type changes, settings that no longer apply must follow an explicit policy:

- Shared question settings remain when they are still valid.
- Incompatible question settings are converted using a documented rule or require a user decision.
- Chart-specific presentation settings are reset or stored separately from the active chart specification.
- Hidden settings never continue to alter the active result unexpectedly.

> **Decision callout: hidden and advanced settings**
>
> - **Should an inapplicable setting be discarded or remembered for switching back?** This asks whether changing from a line to a donut should remember line-only appearance choices. **Implication:** remembering is convenient but requires safely separated chart-specific state; discarding is simpler but may frustrate experimentation.
>   - **Response**: Remember the setting in chart-specific state so it returns when the user switches back. Do not let it affect the active chart while it is hidden.
> - **What belongs in Advanced Mode?** Advanced Mode should expose useful complexity, not settings that are inert or unsupported. **Implication:** every advanced setting still needs the same capability declaration, validation, tests, and documentation as a standard setting.
>   - **Response**: Advanced Mode includes per-comparison geography and time, experimental presentation choices, and valid combinations that may be crowded. It does not include multiple outcomes or mathematically invalid settings.

## Data contract and backend responsibilities

The backend should return a consistent collection of **observation rows**. An observation is one measured value with the information needed to identify it.

A typical row should include:

- Comparison identifier and label
- Period
- Geographic identifier and label, when applicable
- Measure identifier and label
- Value
- Any status needed to distinguish actual, projected, suppressed, or missing values

The backend should accept all comparisons for one chart together, apply each comparison’s filters independently, and return the results with their comparison identifiers attached. Sending one coordinated request avoids repeatedly loading the same source and reduces the risk of showing a partially completed comparison.

The backend should be responsible for:

- Validating that requested values exist in the dataset.
- Applying demographic and geographic filters.
- Performing approved aggregations and weighted calculations.
- Protecting against double-counting aggregate rows.
- Returning missing or suppressed values consistently.
- Preserving enough identifying information for charts, tables, and exports to agree.

The backend should not need to know whether the result will become a line, donut, or map unless the chart requires a genuinely different calculation. The browser can reshape the common observations for each renderer.

Values shown in a dimension control do not guarantee that every combined comparison has an observation. For example, a dataset can contain a race value and an age value but no publishable value for one race-and-age combination. Suppression can also remove a value after the application has created the available option lists.

The backend must preserve requested rows with an explicit `missing` or `suppressed` status and a null value. A chart shows a gap or no mark for that row and keeps the comparison label visible. A table shows `Not available` for missing data and `Suppressed` for suppressed data. An export keeps the value empty and includes the same status. The application must not replace either status with zero or infer a suppressed value. Other valid comparisons continue to render.

The backend calculates an average of selected years only when every selected year has an available, unsuppressed value. Otherwise, the average is unavailable, and the chart, table, and export must identify whether the cause is missing or suppressed data.

The calculation selector belongs in **Outcomes**, directly after the outcome measure. It offers only calculations that the selected measure and chart can support: actual value, numeric change, percent change for counts or stocks, percentage-point change for rates, and index to 100 for a time series. Difference from a benchmark is an Advanced Mode option. Time supplies the required periods rather than duplicating year selectors in Outcomes. The selected-year average is a Time display mode, and ranking controls remain with Geography or Categories because they determine which rows appear.

Sum and weighted mean are backend aggregation rules. A measure should declare which rule is valid and which weight field it requires. The editor should show that rule as additional information rather than let the user choose a mathematically invalid aggregation. A selector is appropriate only when a measure explicitly declares more than one valid aggregation.

> **Decision callout: calculation ownership**
>
> - **Which calculations belong on the backend?** This asks where weighted means, sums, change, indexing, and ranking should occur. **Implication:** calculations that define the meaning of the measure should normally live in one backend location; display-only operations such as arranging rows can remain in the browser.
>   - **Response**: Most calculations including weighted means, sums, change, indexing, and ranking should occur at the back end.
> - **How should missing and suppressed data appear?** This asks whether a comparison with unavailable data is omitted, shown as a gap, or accompanied by a message. **Implication:** inconsistent treatment can make the chart, table, and export appear to disagree.
>   - **Response**: Keep missing and suppressed observations explicit. Show missing chart values as gaps or absent marks, show `Not available` in the table, and export an empty value with a `missing` status. Do not plot or calculate suppressed values; show `Suppressed` in the table and export an empty value with a `suppressed` status. Never substitute zero. Other valid comparisons should continue to render. Calculate a selected-year average only when all selected years have available, unsuppressed values.
> - **Should all comparisons succeed or fail together?** This asks whether one invalid comparison blocks the chart. **Implication:** all-or-nothing behavior is easier to reason about, while partial results are more forgiving but require very clear warnings.
>   - **Response**: No. Do not render an invalid comparison, but continue to render the valid comparisons. Block the complete chart only when the shared request is invalid or no valid comparisons remain.

## Chart rendering and comparison presentation

Each renderer should receive the same observations and translate them into the visual structure its chart understands. A small translation layer, sometimes called an **adapter**, can reshape rows into Plotly traces without changing their meaning.

The expected comparison behavior is:

| Chart family | Comparison presentation |
|---|---|
| Line | One labeled line per comparison by default, with comparison tabs as an option |
| Bar | Grouped or stacked marks when that presentation is meaningful |
| Donut | Comparisons may be slices when they form the chart’s one categorical breakdown; additional dimensions or years use separate panels or tabs |
| Map | One comparison per tab because color is already used to encode the measure |
| Range | One row or mark per comparison and category |
| Forest | One estimate and interval per comparison and category |
| Heatmap | One comparison per tab because color already encodes the measured value |
| Table | All selected comparisons as clearly labeled rows or columns |

A donut should not attempt to encode race, sex, geography, and year as nested slices in one ring. A map should not place several unrelated values into one color scale. Shared comparison data does not require every chart to combine it in the same physical space.

Colors and labels should be attached to stable comparison identifiers. Reordering comparisons should not unexpectedly change their identities, and the table and exported data should use the same labels as the chart. Combined line charts must use complete derived legend labels, such as `San Francisco Latina Women`, unless the user supplies a custom label.

The UI Kit page's official PPIC data-visualization specification is the style authority. Comparison colors must use its published two-group pairings and exact ordered three-to-ten-group schemes. Sequential and diverging displays must use the official ramps. The implementation must not substitute an editorially adjusted palette while labeling it official.

> **Decision callout: display policies**
>
> - **When should comparisons become marks within one chart versus separate panels or tabs?** This asks how many visual dimensions the chart can communicate without ambiguity. **Implication:** the decision affects legends, color assignment, layout, exports, and maximum comparison limits.
>   - **Response**: Maps and heatmaps use one comparison per tab. Line charts show one descriptively labeled line per comparison by default and also offer comparison tabs. Other demographic comparison charts may offer tabs when their capability declares that presentation. Combined views must label every comparison clearly.
> - **How should comparison colors remain stable across chart changes and saved views?** This asks whether color belongs to the comparison or is recalculated from display order. **Implication:** stable colors improve continuity, but they require comparison identifiers and saved color assignments to survive configuration changes.
>   - **Response**: Attach colors to stable comparison identifiers and follow the official PPIC schemes on the UI Kit page. Preserve those assignments across chart changes, reordering, and current-version saved views.

## Configuration versions and cutover

The new chart configuration should have an explicit version. No existing saved view or shared link is required to open after the cutover, so the implementation must not guess how an ambiguous old `Group` or `Series` value maps into comparisons.

The new configuration reader should accept the new version only. It should reject an older saved configuration or shared link with a clear unsupported-version message rather than silently reinterpret it. Current-version save, restore, import, export, and shared-link behavior remain required.

The implementation should use a new saved-view storage namespace so that it does not overwrite old browser data. The old reader, conversion code, and chart-shaped request path can be unwired or moved to `.trash/visualization-backend/` during implementation. They remain available for review until the developer approves or denies each deletion recorded in the removal ledger.

> **Decision callout: migration policy**
>
> - **How should an ambiguous old `Group` setting be converted?** This asks whether to create comparisons for every allowed value, preserve only the previously visible result, or ask the user to review the conversion. **Implication:** automatic expansion may change a chart unexpectedly, while ignoring the setting may lose a comparison the user intended.
>   - **Response**: Do not convert it. Older configurations are outside the compatibility requirement, and the new model must not guess what an ambiguous `Group` value meant.
> - **How long must legacy links remain supported?** This asks whether conversion code is permanent or can be removed after a defined period. **Implication:** permanent compatibility adds ongoing testing cost; a retirement date requires communication and possibly an export or resave process.
>   - **Response**: Legacy links are not supported after the coordinated cutover. Keep unwired legacy code in `.trash/visualization-backend/` until the developer reviews its removal ledger entry.

## Validation and user guidance

Validation should explain whether the requested data question is complete and whether the selected chart can present it clearly.

Errors should be reserved for conditions where the result would be incorrect or impossible, such as:

- A required outcome or geography is missing.
- The configuration contains more than 10 comparisons.
- A comparison contains a value not supported by the dataset.
- A chart requires exactly two periods and does not have them.
- A requested calculation cannot be performed with the available data.

Do not block a mathematically valid chart only because it is crowded. Advanced Mode may show a low-key information message for a valid but crowded result. Do not use loud readability warnings. Do not render a mathematically invalid comparison. Continue to render other valid comparisons. Block the complete chart when the shared request is invalid or no valid comparisons remain.

Validation should use the same resolved capabilities as the editor. A control should not permit a choice that a separate validation rule rejects unless there is a clear reason and an immediate explanation.

> **Decision callout: validation experience**
>
> - **Which conditions should block rendering?** This asks where the boundary lies between an incorrect result and a merely crowded one. **Implication:** blocking too much makes exploration frustrating; blocking too little risks publishing misleading charts.
>   - **Response**: Do not render a mathematically invalid comparison in either mode. Continue to render other valid comparisons. Block the complete chart when the shared request is invalid or no valid comparisons remain. Standard Mode hides invalid combinations. Advanced Mode may permit crowded or experimental combinations only when the data and calculation remain valid. A crowded but valid chart does not block rendering and may show a low-key information message.
> - **Should the tool automatically change to a recommended chart?** This asks whether guidance is advisory or can modify the user’s selection. **Implication:** automatic changes may be efficient but can feel unpredictable, so a visible recommendation is generally safer unless the conversion is lossless.
>   - **Response**: No. Recommendations are advisory. The tool must not change the selected chart automatically.

## Testing and long-term reliability

Tests should protect intended behavior rather than preserve the current internal structure. Existing tests are useful evidence of current behavior, but a test that asserts an intentionally replaced interaction should be rewritten or removed.

The test strategy should have several layers.

**Comparison model tests**

These tests should verify that checkbox selections generate the expected comparisons, irregular comparison cards remain independent, labels and identifiers are stable, and aggregate rows are not double-counted. They should also verify that the interface permits 10 comparisons and prevents an eleventh.

**Capability tests**

A table-driven test should cover every chart type and its accepted periods, comparison presentation, required data roles, visible sections, and appearance controls. Adding a new chart should require adding a complete capability entry.

**Settings-resolution tests**

Given a dataset, chart type, and configuration, these tests should verify the resolved controls and rules. Examples include a line receiving a range control, a donut receiving searchable year choices, a range chart requiring two periods, and a chart without grouping support receiving no generic Group control. They should verify that Standard Mode hides invalid combinations and that Advanced Mode permits only mathematically valid combinations.

**Data-contract tests**

These tests should verify independent filters for each comparison, weighted calculations, geographic filtering, empty results, missing values, suppression, and protection against double-counting. They should verify the selected-year average, the average label and included-year metadata, and the rule that prevents an average when an input is missing or suppressed.

**Renderer tests**

Renderer tests should check meaningful results such as trace count, comparison names, selected periods, categories, and panel assignments. They should avoid storing enormous snapshots of Plotly’s full output because those snapshots tend to change for reasons unrelated to user-visible correctness.

**Full-flow tests**

A small number of tests should exercise representative workflows from settings through rendered output and export:

- Several demographic comparisons in a line chart.
- Several comparisons and selected years in donut tabs.
- An average of selected donut years with its average note and included-year list.
- A partial result that preserves valid comparisons and identifies missing or suppressed values consistently in the chart, table, and export.
- Switching comparison or year on a map.
- Preserving all comparison identities in a table and data export.

The goal is not to test every setting against every chart through the browser. The capability and pure decision tests should cover the full matrix efficiently, while full-flow tests confirm a few important paths.

> **Decision callout: test boundaries**
>
> - **Which outputs require visual regression tests?** A visual regression test compares an image of a chart with an approved image. **Implication:** it can catch layout problems that data assertions miss, but broad image coverage is slow and sensitive to harmless rendering differences. It should be reserved for a few important layouts.
>   - **Response**: Add visual regression tests for Line, Bar, Range, and Heatmap.
> - **What fixtures represent the supported data edge cases?** A fixture is a small, controlled test dataset. **Implication:** agreeing on fixtures for aggregates, missing values, projections, geography, and small populations makes backend and renderer tests comparable and repeatable.
>   - **Response**: Use Age, Sex & Race Projections and Components of Change fixtures. The fixtures must include aggregates, irregular comparisons, missing and suppressed observations, projection and observed periods, and values suitable for change, indexing, averaging, and ranking.
> - **Which current tests describe a requirement and which describe an implementation detail?** **Implication:** requirement tests should survive the refactor; implementation-detail tests should not force the new design to reproduce obsolete internal structure.
>   - **Response**: Preserve or adapt tests for chart and field contracts, validation outcomes, renderer results, exports, accessibility, API behavior, and current-version save and restore. Rewrite tests that pin the current slider, exact sidebar order, reducer action names, `filters.tab*` storage, chart-shaped query URLs, or v1-to-v2 migration. Filesystem-removal tests should guard only a developer-approved retirement, not force a deletion before review.

## Settings reference and documentation reliability

The settings reference should be treated as part of the product contract. Every configurable setting should have an inventory entry containing:

- Its plain-language purpose.
- The chart families and datasets where it applies.
- Its valid values or limits.
- Whether it changes the data question or only presentation.
- The part of the system that reads it.
- What happens to it when the chart type changes.

Automated checks should confirm that every setting shown in the editor appears in the inventory and that every stored setting has a real consumer. A **consumer** is the data, validation, or rendering code that uses the setting. If no consumer exists, the setting should be implemented or removed.

The capability tables can be checked automatically, while the explanations should remain human-written so they stay useful to non-specialists. The Settings Reference should include a global **Show additional information** toggle. It is on by default. Turning it off hides explanations, notes, implications, and source or help text while keeping the setting name, location, applicability, valid values or limits, and configuration key visible. Documentation should describe observable behavior, not temporary component names or file locations.

The repository does not currently have a machine-readable settings inventory. The implementation must create one before it removes or renames settings.

> **Decision callout: documentation ownership**
>
> - **Which parts of the settings reference should be generated from capabilities?** This asks how to prevent the applicability tables from drifting while preserving readable explanations. **Implication:** generating the factual matrix reduces inconsistency, but fully generated prose is likely to be harder to understand and maintain.
>   - **Response**: Generate the factual matrix from capabilities and a settings inventory. Keep the explanations human-written. Add the global toggle described above so readers can hide all additional information.
> - **Who approves a new or changed setting?** This asks for ownership of its meaning, interface, tests, and documentation. **Implication:** without one acceptance path, a setting can be added to the interface before its renderer or reference entry is ready.
>   - **Response**: The developer approves every new or changed setting.

## Recommended migration sequence

This is a sequence of design and migration stages, not the detailed implementation plan.

1. **Derive representative questions.** Build the initial examples from the accepted comparison and fixture contracts during implementation. If those examples expose a gap, return to the product decision instead of adding a module-specific exception.
2. **Complete the chart capability table.** Decide time, comparison, geography, calculation, and readability behavior for every chart type.
3. **Define the new comparison and observation contracts.** Include defaults, labels, identifiers, missing values, and aggregate rules.
4. **Build the age, sex, and race case as the proving ground.** It is the most demanding current dataset and will expose assumptions that simpler modules do not.
5. **Complete proving paths through line, bar, map, table, and donut.** A vertical path means the setting, request, response, renderer, export, and tests all work together for that chart family.
6. **Convert the remaining chart families behind the same cutover boundary.** Reuse the same question and observation models rather than adding module-specific branches. Do not expose a mixed old-and-new editor.
7. **Cut over all chart families together and quarantine legacy paths.** Unwire or move replaced files to `.trash/visualization-backend/`, and record each item and its replacement in the removal ledger. Do not permanently delete an item until the developer approves it.
8. **Finalize the visualization specification and settings reference.** Confirm that the documented behavior matches the capability and acceptance tests.

Parts likely worth preserving include the Plotly rendering boundary, dataset field descriptions, low-level form components, workspace and export concepts, and the basic chart-registry idea. Parts likely to be replaced include scalar demographic filters, broadly injected `Group` and `Series` roles, chart-specific backend response shapes, and chart-name-based time-control rules.

> **Decision callout: rollout**
>
> - **Should chart families move to the new system together or in stages?** This asks whether temporary old and new paths may coexist. **Implication:** staged work reduces the size of each release but creates a short-term compatibility burden; a single cutover avoids dual behavior but raises delivery and review risk.
>   - **Response**: Migrate all chart families together. Internal implementation may proceed behind an unwired boundary, but users must not receive a mixed old-and-new system.
> - **Which representative charts are required before the model is considered proven?** Line, donut, map, and table were recommended because they exercise trends, snapshots, geography, and raw observations. **Implication:** proving only the easiest chart could hide structural problems until late in the migration.
>   - **Response**: Line, Bar, map, table, and donut.

## Completion criteria

The refactor is complete when:

- Users can create regular and irregular age, sex, and race comparisons without relying on ambiguous Group or Series settings.
- Users cannot add more than 10 comparisons to one chart.
- Every comparison has a stable identity used consistently by the chart, table, saved view, and export.
- Donuts offer explicit year choices, automatic year tabs, and a clearly labeled average option. They never silently combine selected years.
- Every chart type has a complete capability description.
- Visible controls, validation, data preparation, and rendering all use the same capability decisions.
- No visible or stored setting is without a documented effect.
- The new configuration version round-trips through save, restore, import, export, and current-version shared links; older versions fail with a clear unsupported-version message.
- Common observation rows support all chart families without requiring the backend to prepare a different response merely because the user changed chart type.
- Charts, tables, and exports use the same missing and suppressed statuses and never substitute zero.
- Mathematically invalid comparisons do not render, but other valid comparisons remain available.
- Unit tests cover comparison expansion, capabilities, data calculations, current-version serialization, and renderer behavior.
- A small set of full-flow tests verifies the most important user journeys.
- The visualization specification and settings reference agree with the tested behavior.
- Obsolete compatibility branches and inert settings have been unwired or quarantined with a removal ledger, and each permanent deletion has been approved by the developer.

> **Decision callout: acceptance**
>
> - **Who confirms that the comparison workflows are understandable to nontechnical users?** Automated tests can prove consistency, but they cannot prove that labels and interactions are clear. **Implication:** completion should include product review using the representative questions agreed on at the start.
>   - **Response**: Before implementation review, the assistant performs a Simplified Technical English pass over all user-facing labels, help text, validation messages, and documentation. The developer reviews that pass. Feedback from product users is incorporated after the first implementation.
> - **What evidence is required before legacy code is removed?** This asks which migrations, tests, and manual checks must pass. **Implication:** agreeing on this evidence prevents both premature removal and indefinite retention of the old system.
>   - **Response**: During implementation, unwire legacy code or move it to `.trash/visualization-backend/` and keep a running removal ledger that names what was replaced. After implementation, the developer approves or denies permanent deletion one ledger entry at a time.
