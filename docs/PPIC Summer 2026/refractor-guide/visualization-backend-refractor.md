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
> - **Which existing saved views and shared links must continue to open?** This asks how far backward compatibility must reach. **Implication:** if all saved configurations must continue to work, the project needs a deliberate conversion step; if some may be retired, the conversion can be simpler but users need advance notice.

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
> - **Is the main goal demographic comparison, or a general comparison system for every dataset?** This asks whether age, sex, and race are the first use case for a reusable concept or a special feature of one module. **Implication:** a general model takes more design work at the beginning but avoids creating another module-specific pathway that later has to be replaced.

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
> - **When should a chart-specific control be allowed?** This asks where shared behavior ends. **Implication:** requiring universal components can create large components full of exceptions, while allowing every chart to build its own controls creates duplication. The preferred boundary is shared components for shared meanings, with small chart-specific presentations when the meaning truly differs.

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
> - **Can one chart contain more than one outcome?** This is different from comparing population groups. **Implication:** multiple outcomes introduce unit and scale questions, so they should remain a separate feature unless a required use case clearly depends on them.

## Comparison model

The chart configuration should contain an explicit list of comparisons. Each comparison should have:

- A stable identifier used to keep data, colors, labels, exports, and saved views connected.
- A default label derived from its selections.
- An optional user-edited label.
- One value for every relevant comparison dimension, such as age group, sex, and race or ethnicity.

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

The default state should be one comparison using the dataset’s aggregate values, such as All Ages, Both Sexes, and All races or ethnicities. An aggregate is a value already representing the whole group. It must not be added to its component groups, because doing so would count the same people more than once.

> **Decision callout: comparison behavior**
>
> - **Should checkboxes always generate every combination, or may users select only particular pairings?** This asks whether Black women and White men can be selected without also creating Black men and White women. **Implication:** automatic generation is fast for regular comparisons, but individual cards are still needed for selected pairings.
> - **What is the practical maximum number of comparisons?** This is not only a performance question; too many lines, slices, or colors can make a chart unreadable. **Implication:** the tool may need a soft warning, a chart-specific display limit, or a recommendation to use a table or several charts.
> - **May comparison dimensions overlap?** For example, “All races” overlaps every specific race. **Implication:** overlapping comparisons can be valid when intentionally comparing a subgroup with the total, but labels and explanations must make clear that the groups are not mutually exclusive.

## Time selection

Time should be described by the number and kind of periods a chart accepts, not by the name of a specific interface control.

The main time needs are:

- **No period:** the dataset or chart has no time dimension.
- **One snapshot:** one value at one point in time.
- **Several snapshots:** selected individual years shown separately.
- **Exactly two periods:** a starting and ending value.
- **A range:** a continuous span used for a trend or matrix.

A shared Time section can display different controls for these needs. A dense sequence of yearly observations may justify a slider. A short list of projection years may be clearer as checkboxes. A two-period chart may use two selectors or a two-ended range control.

For donuts, the intended direction is a list of year checkboxes rather than a continuous range slider. Selecting more than one year must not combine those years into a single ring. Each year needs a separate donut, tab, or panel so that the meaning remains clear.

| Chart family | Expected time behavior |
|---|---|
| Line | A range or sequence of periods |
| Bar | One snapshot, or several snapshots displayed separately |
| Donut | Year checkboxes; one clearly separated view per selected year |
| Map | One snapshot per map; additional years use tabs or separate panels |
| Range or forest | Exactly two periods |
| Heatmap | A range or selected sequence |
| Table | Any periods valid for the requested data |

This table is a starting specification. The final capability table must cover every supported chart type.

> **Decision callout: multiple years**
>
> - **When several years are checked for a donut, should they appear as tabs or small multiples?** Tabs show one chart at a time; small multiples show several charts together. **Implication:** tabs use less space, while small multiples support direct comparison but need limits to remain readable.
> - **Should year choices come from every observed year or only designated reporting years?** This asks whether a projection dataset with many annual values should show every checkbox. **Implication:** a long checklist may need grouping, search, or a different control even though the underlying selection still means “several snapshots.”
> - **What happens when a user switches between chart types with incompatible time selections?** For example, a line may hold a 2020–2040 range while a range chart needs exactly two endpoints. **Implication:** the system needs a predictable conversion rule and must tell the user if it discards or narrows a selection.

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
> - **Which limits are strict and which are recommendations?** A strict limit prevents rendering; a recommendation warns that the result may be hard to read. **Implication:** making every readability guideline strict reduces flexibility, but providing no limits allows unusable charts.

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
> - **What belongs in Advanced Mode?** Advanced Mode should expose useful complexity, not settings that are inert or unsupported. **Implication:** every advanced setting still needs the same capability declaration, validation, tests, and documentation as a standard setting.

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

> **Decision callout: calculation ownership**
>
> - **Which calculations belong on the backend?** This asks where weighted means, sums, change, indexing, and ranking should occur. **Implication:** calculations that define the meaning of the measure should normally live in one backend location; display-only operations such as arranging rows can remain in the browser.
> - **How should missing and suppressed data appear?** This asks whether a comparison with unavailable data is omitted, shown as a gap, or accompanied by a message. **Implication:** inconsistent treatment can make the chart, table, and export appear to disagree.
> - **Should all comparisons succeed or fail together?** This asks whether one invalid comparison blocks the chart. **Implication:** all-or-nothing behavior is easier to reason about, while partial results are more forgiving but require very clear warnings.

## Chart rendering and comparison presentation

Each renderer should receive the same observations and translate them into the visual structure its chart understands. A small translation layer, sometimes called an **adapter**, can reshape rows into Plotly traces without changing their meaning.

The expected comparison behavior is:

| Chart family | Comparison presentation |
|---|---|
| Line | One line per comparison |
| Bar | Grouped or stacked marks when that presentation is meaningful |
| Donut | Comparisons may be slices when they form the chart’s one categorical breakdown; additional dimensions or years use separate panels or tabs |
| Map | One comparison per map panel or tab because color is already used to encode the measure |
| Range or forest | One row or mark per comparison and category |
| Heatmap | Comparison rows, tabs, or panels according to the question |
| Table | All selected comparisons as clearly labeled rows or columns |

A donut should not attempt to encode race, sex, geography, and year as nested slices in one ring. A map should not place several unrelated values into one color scale. Shared comparison data does not require every chart to combine it in the same physical space.

Colors and labels should be attached to stable comparison identifiers. Reordering comparisons should not unexpectedly change their identities, and the table and exported data should use the same labels as the chart.

> **Decision callout: display policies**
>
> - **When should comparisons become marks within one chart versus separate panels or tabs?** This asks how many visual dimensions the chart can communicate without ambiguity. **Implication:** the decision affects legends, color assignment, layout, exports, and maximum comparison limits.
> - **How should comparison colors remain stable across chart changes and saved views?** This asks whether color belongs to the comparison or is recalculated from display order. **Implication:** stable colors improve continuity, but they require comparison identifiers and saved color assignments to survive configuration changes.

## Configuration versions and saved-view migration

The new chart configuration should have an explicit version. A **migration** is a conversion from an older stored shape to the new shape when a saved view or shared link is opened.

The straightforward conversions are:

- One stored age, sex, and race or ethnicity selection becomes one explicit comparison.
- Shared dataset, outcome, geography, and period settings remain shared when valid.
- Supported appearance settings move into their clearly defined shared or chart-specific locations.

Some old settings are ambiguous. A stored `Group` might mean “show every value from this dimension,” or it might be a setting the renderer never used. `Series` may be meaningful for pasted data but inert for a module. The migration should not pretend to know the user’s intent where the existing result provides no evidence.

The application may temporarily need an adapter that reads the old configuration, but it should immediately produce the new model. Old and new pathways should not remain active indefinitely because every bug would then need to be understood in two systems.

> **Decision callout: migration policy**
>
> - **How should an ambiguous old `Group` setting be converted?** This asks whether to create comparisons for every allowed value, preserve only the previously visible result, or ask the user to review the conversion. **Implication:** automatic expansion may change a chart unexpectedly, while ignoring the setting may lose a comparison the user intended.
> - **How long must legacy links remain supported?** This asks whether conversion code is permanent or can be removed after a defined period. **Implication:** permanent compatibility adds ongoing testing cost; a retirement date requires communication and possibly an export or resave process.

## Validation and user guidance

Validation should explain whether the requested data question is complete and whether the selected chart can present it clearly.

Errors should be reserved for conditions where the result would be incorrect or impossible, such as:

- A required outcome or geography is missing.
- A comparison contains a value not supported by the dataset.
- A chart requires exactly two periods and does not have them.
- A requested calculation cannot be performed with the available data.

Warnings should cover readable but potentially poor choices, such as too many lines or donut slices. Where possible, the message should recommend a concrete correction, such as switching to a table, reducing comparisons, or using tabs.

Validation should use the same resolved capabilities as the editor. A control should not permit a choice that a separate validation rule rejects unless there is a clear reason and an immediate explanation.

> **Decision callout: validation experience**
>
> - **Which conditions should block rendering?** This asks where the boundary lies between an incorrect result and a merely crowded one. **Implication:** blocking too much makes exploration frustrating; blocking too little risks publishing misleading charts.
> - **Should the tool automatically change to a recommended chart?** This asks whether guidance is advisory or can modify the user’s selection. **Implication:** automatic changes may be efficient but can feel unpredictable, so a visible recommendation is generally safer unless the conversion is lossless.

## Testing and long-term reliability

Tests should protect intended behavior rather than preserve the current internal structure. Existing tests are useful evidence of current behavior, but a test that asserts an intentionally replaced interaction should be rewritten or removed.

The test strategy should have several layers.

**Comparison model tests**

These tests should verify that checkbox selections generate the expected comparisons, irregular comparison cards remain independent, labels and identifiers are stable, aggregate rows are not double-counted, and saved configurations can be restored.

**Capability tests**

A table-driven test should cover every chart type and its accepted periods, comparison presentation, required data roles, visible sections, and appearance controls. Adding a new chart should require adding a complete capability entry.

**Settings-resolution tests**

Given a dataset, chart type, and configuration, these tests should verify the resolved controls and rules. Examples include a line receiving a range control, a donut receiving year choices, a range chart requiring two periods, and a chart without grouping support receiving no generic Group control.

**Data-contract tests**

These tests should verify independent filters for each comparison, weighted calculations, geographic filtering, empty results, missing values, suppression, and protection against double-counting.

**Renderer tests**

Renderer tests should check meaningful results such as trace count, comparison names, selected periods, categories, and panel assignments. They should avoid storing enormous snapshots of Plotly’s full output because those snapshots tend to change for reasons unrelated to user-visible correctness.

**Full-flow tests**

A small number of tests should exercise representative workflows from settings through rendered output and export:

- Several demographic comparisons in a line chart.
- Several comparisons and selected years in donuts.
- Switching comparison or year on a map.
- Preserving all comparison identities in a table and data export.

The goal is not to test every setting against every chart through the browser. The capability and pure decision tests should cover the full matrix efficiently, while full-flow tests confirm a few important paths.

> **Decision callout: test boundaries**
>
> - **Which outputs require visual regression tests?** A visual regression test compares an image of a chart with an approved image. **Implication:** it can catch layout problems that data assertions miss, but broad image coverage is slow and sensitive to harmless rendering differences. It should be reserved for a few important layouts.
> - **What fixtures represent the supported data edge cases?** A fixture is a small, controlled test dataset. **Implication:** agreeing on fixtures for aggregates, missing values, projections, geography, and small populations makes backend and renderer tests comparable and repeatable.
> - **Which current tests describe a requirement and which describe an implementation detail?** **Implication:** requirement tests should survive the refactor; implementation-detail tests should not force the new design to reproduce obsolete internal structure.

## Settings reference and documentation reliability

The settings reference should be treated as part of the product contract. Every configurable setting should have an inventory entry containing:

- Its plain-language purpose.
- The chart families and datasets where it applies.
- Its valid values or limits.
- Whether it changes the data question or only presentation.
- The part of the system that reads it.
- What happens to it when the chart type changes.

Automated checks should confirm that every setting shown in the editor appears in the inventory and that every stored setting has a real consumer. A **consumer** is the data, validation, or rendering code that uses the setting. If no consumer exists, the setting should be implemented or removed.

The capability tables can be checked automatically, while the explanations should remain human-written so they stay useful to non-specialists. Documentation should describe observable behavior, not temporary component names or file locations.

> **Decision callout: documentation ownership**
>
> - **Which parts of the settings reference should be generated from capabilities?** This asks how to prevent the applicability tables from drifting while preserving readable explanations. **Implication:** generating the factual matrix reduces inconsistency, but fully generated prose is likely to be harder to understand and maintain.
> - **Who approves a new or changed setting?** This asks for ownership of its meaning, interface, tests, and documentation. **Implication:** without one acceptance path, a setting can be added to the interface before its renderer or reference entry is ready.

## Recommended migration sequence

This is a sequence of design and migration stages, not the detailed implementation plan.

1. **Agree on representative questions.** Write several exact demographic comparisons and expected chart behaviors, including line, donut, map, and table examples.
2. **Complete the chart capability table.** Decide time, comparison, geography, calculation, and readability behavior for every chart type.
3. **Define the new comparison and observation contracts.** Include defaults, labels, identifiers, missing values, and aggregate rules.
4. **Build the age, sex, and race case as the proving ground.** It is the most demanding current dataset and will expose assumptions that simpler modules do not.
5. **Complete one vertical path through line, donut, map, and table.** A vertical path means the setting, request, response, renderer, export, and tests all work together for that chart family.
6. **Convert the remaining chart families.** Reuse the same question and observation models rather than adding module-specific branches.
7. **Convert saved views and remove legacy paths.** Keep a temporary conversion boundary, then delete forced grouping, inert settings, and obsolete chart-shaped requests.
8. **Finalize the visualization specification and settings reference.** Confirm that the documented behavior matches the capability and acceptance tests.

Parts likely worth preserving include the Plotly rendering boundary, dataset field descriptions, low-level form components, workspace and export concepts, and the basic chart-registry idea. Parts likely to be replaced include scalar demographic filters, broadly injected `Group` and `Series` roles, chart-specific backend response shapes, and chart-name-based time-control rules.

> **Decision callout: rollout**
>
> - **Should chart families move to the new system together or in stages?** This asks whether temporary old and new paths may coexist. **Implication:** staged work reduces the size of each release but creates a short-term compatibility burden; a single cutover avoids dual behavior but raises delivery and review risk.
> - **Which four representative charts are required before the model is considered proven?** Line, donut, map, and table are recommended because they exercise trends, snapshots, geography, and raw observations. **Implication:** proving only the easiest chart could hide structural problems until late in the migration.

## Completion criteria

The refactor is complete when:

- Users can create regular and irregular age, sex, and race comparisons without relying on ambiguous Group or Series settings.
- Every comparison has a stable identity used consistently by the chart, table, saved view, and export.
- Donuts offer explicit year choices and never silently combine selected years.
- Every chart type has a complete capability description.
- Visible controls, validation, data preparation, and rendering all use the same capability decisions.
- No visible or stored setting is without a documented effect.
- Existing supported configurations are converted through a tested version migration.
- Common observation rows support all chart families without requiring the backend to prepare a different response merely because the user changed chart type.
- Unit tests cover comparison expansion, capabilities, data calculations, migrations, and renderer behavior.
- A small set of full-flow tests verifies the most important user journeys.
- The visualization specification and settings reference agree with the tested behavior.
- Obsolete compatibility branches and inert settings have been removed rather than left as permanent alternatives.

> **Decision callout: acceptance**
>
> - **Who confirms that the comparison workflows are understandable to nontechnical users?** Automated tests can prove consistency, but they cannot prove that labels and interactions are clear. **Implication:** completion should include product review using the representative questions agreed on at the start.
> - **What evidence is required before legacy code is removed?** This asks which migrations, tests, and manual checks must pass. **Implication:** agreeing on this evidence prevents both premature removal and indefinite retention of the old system.
