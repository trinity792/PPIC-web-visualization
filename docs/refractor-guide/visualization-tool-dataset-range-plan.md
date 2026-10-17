---
Topic: Visualization Tool
Content Type: implementation plan
pinned: false
description: "A tests-first plan for widening the range of pasted and uploaded tables the standalone Visualization Tool draws correctly: messier tables, real dates, units, several value columns, automatic chart choice, unmapped-column warnings, and labels written for pasted data. Written for programmers continuing the visualization work."
Date Published: October 14, 2026
Last Updated: 10/16/2026 - 05:00 PM
Status: Updating
---

# Visualization Tool: Dataset Range Plan

> [!info] Who this is for and how to read it
> This plan is for whoever extends the standalone Visualization Tool (`/visualization-tool`), whether a person or a model. All four stages are built; see the progress notes below. The documents each workstream makes out of date were updated on October 16, 2026 ([[visualization-specification]] and [[projectSpec]]). Stage 1 writes every test first, including a corpus of example tables that stands in for "the tables people actually paste". The seven workstreams then follow in the order given in [The Order of Work](#the-order-of-work). Each workstream says what is wrong today, the steps to fix it, which documents it makes out of date, and the tests to write. Words that may be unfamiliar are defined in the [Glossary](#glossary) at the end.

> [!note] Progress, October 14, 2026
> Stage 1's tests are written, and Stage 2 (workstreams 1, 2, and 3) is built. Every test for those three workstreams passes, including all 19 corpus entries' "reads every column as the expected type and unit". The remaining failures belong to workstreams 4 to 7, plus the five renderer Plan O checks in `visualizationV3Cutover.test.js` that were failing before this plan. Where the build settled something the steps left open:
>
> - **Header detection.** `detectHeaderRow` now compares only columns whose body holds numbers or dates, because text under text says nothing either way. An all-text table therefore defaults to a header row (the editor's header toggle still swaps it).
> - **Trailing notes.** A lone cell under the data is moved out only when it starts with "Source", "Note", or "*", or is a sentence of three or more words, so a short data label whose values are all blank stays a row.
> - **Stricter numbers.** `parseNumber` now requires thousands separators in groups of three, so it can tell "1.234,5" (decimal comma) from "1,234.5". "12,5" no longer reads as 125 under the default convention.
> - **Placeholders in text columns.** "-" or "NA" in a text column is ordinary text; only number and date columns read placeholders as missing or suppressed.
> - **Calculation gate.** A pasted column's unit decides its calculations inside `executeInlineQuestion` only (`calculationsForUnit`), using the registry's own unit lists. `isCalculationAllowed` is unchanged, so topic measures are unaffected.
> - **Pasted number format.** Pasted observations carry `columnFormat: { unit, decimals }`, and `numberFormatFor` reads it only when no number type is chosen and the value is untransformed, so topic charts and calculated values keep today's axes.
> - **Captured title.** `meta.title` also holds the dataset name the Import step records, so `DataSourcePanel` now saves `meta.titleFrom` ("table", "name", or "file"), and only a title found in the table titles the chart.
> - **Month and quarter ticks** get half the label budget of year ticks, because "Jan 2010" is about twice as wide as "2010".

> [!note] Progress, October 16, 2026
> Stages 3 and 4 (workstreams 4 to 7) are built. The whole suite passes except the five renderer Plan O checks in `visualizationV3Cutover.test.js` that failed before this plan, including every byod-shapes corpus entry on all six checks. Where the build settled something the steps left open:
>
> - **Range pairs.** Rule 4 also reads Women/Men and Female/Male as a pair, and a third number column named like a total (Total, All, Overall, Average, Mean, Median) as the range's middle point, so a pay-gap table opens as a range chart. An estimate with lower and upper bounds is still a forest plot.
> - **Rule order.** Unique labels with exactly two number columns rank as a scatter plot before grouped bars, as the corpus decided.
> - **The warning level.** `inlineRowsShareMapping` uses level `warning`, which is the tool's own: the observation contract keeps its three levels (blocking, comparison, information), and the preview shows warnings with the other notices, above the chart.
> - **Series names.** A line series whose place and comparison share one name (every pasted series) says it once, so value columns read "Chrome", not "Chrome Chrome".
> - **Value columns as periods.** Their rows use the measure name "Value", since no single column names them.
>
> Four tests written in Stage 1 were changed, each because it contradicted the rest of the plan or the code it tests:
>
> - `inlineQuestion.test.js`, "maps each chart family's roles": the exact-match expectations gained `values`, which the new "reads a single column name and a list the same way" test requires.
> - `executeInlineQuestion.test.js`, "allows a calculation only when every value column's unit does": the indexed values are `[0, 20, 0, 50]`, because the shared registry and the specification define Index to Base Year as change relative to the base period, not base = 100.
> - `deriveLabels.test.js`, "names a pasted scatter's two measures on their axes": the title is "HHI by Region", matching the corpus's "Rent by Name" for a scatter with a unit column.
> - `EditStep.overhaul.test.js` and `ChartTypeSection.test.js`: their store mocks pass the real store through so the corpus helpers can build configs, and the tile-order test expands the grid only when it is not already open (a selected hidden tile opens it).

The Visualization Tool draws a reader's own table. Two test tables in `mockups/custom-viz-test/` showed how narrow the range of tables it draws well still is. A web-browser market-share table (a date column and six number columns, one per browser) drew only Chrome, as one line named "Data", titled "Chrome over time by geography", with evenly spaced month labels. A tipping survey (Job and Nation label columns and four answer columns that add up to 100) opened as a range chart, and its bar chart raised a React duplicate-key error. The key error is fixed (October 14, 2026, `barModel.js`); everything else is this plan.

The causes are general, not specific to those two tables. Most spreadsheet exports are wide (one column per series), carry footnotes and suppression marks, use month or school-year periods, and hold more than one label column. Each workstream below fixes one of those causes for every table of that shape. The two mockups are two entries in the Stage 1 corpus, not the target.

> [!note] What this plan does not change
> Topic workbenches are untouched, apart from one shared number-format decision flagged in [Workstream 3](#workstream-3---units-and-number-formats-come-from-the-data). The question specification, the observation contract, and the chart renderers keep their shapes; this plan adds optional fields to them. Sections and panels (review item 6) and highlighting one series with the rest in gray (review item 9) are not here: both belong to the renderer plan's Workstream P ([[chart-renderer-implementation-plan]]), and pasted data adopts them when P is built.

---

## The Order of Work

The work runs in four stages. A stage starts only when the one before it is done, except that the three workstreams in Stage 2 can run side by side.

| Stage | What happens | Workstreams |
|---|---|---|
| 1. Write the tests | The example-table corpus and every test in this plan are written before any feature code. The suite is expected to fail until the work lands. | See [Stage 1](#stage-1---write-every-test-first) |
| 2. Read the table correctly | Parsing and typing: messy tables, dates, and units. Everything later reads what these produce. | 1, 2, 3 |
| 3. Several value columns | The mapping change that lets one table hold many series. | 4 |
| 4. Choose and explain | The chart picked for a table, the warning for unmapped label columns, and the labels. | 5, 6, 7 |

| # | Workstream | Review item | Depends on |
|---|---|---|---|
| 1 | Messier tables read cleanly | 8 | - |
| 2 | Dates sit on a real time axis | 2 | - |
| 3 | Units and number formats come from the data | 3 | - |
| 4 | Several value columns become series | 1 | 1, 3 |
| 5 | The chart switches to the most applicable chart | 4 | 2, 3, 4 |
| 6 | Unmapped label columns raise a warning | 5 | 4 |
| 7 | Titles and labels are written for pasted data | 7 | 4 |

---

## Decisions Already Made

Decided by the owner on October 14, 2026.

| Question | Decision |
|---|---|
| Where several value columns live | **In the column mapping.** A value role holds a list of columns. The stored table is never reshaped, so the Import step shows the table as pasted and the choice is reversible. |
| What the chart choice does | **The chart switches to the most applicable chart.** A fresh import applies the best-ranked chart, with its mapping and a few appearance presets, rather than only recommending tiles. |
| What happens when rows share every mapped column | **Warn only.** The chart draws as it does today, and a warning names the label column the mapping leaves out. Nothing is combined or filtered for the reader. |
| Sections, panels, and series emphasis | Out of this plan. They are Workstream P of [[chart-renderer-implementation-plan]]. |

### Decisions still needed

Each has a suggested answer, which the steps below follow until the owner decides otherwise.

| Question | Suggested |
|---|---|
| Blank label cells in grouped exports (a label only on the first row of its block) | Offer a one-click "Fill down" in the Check panel, not an automatic fill. Consistent with warn-only. |
| Total rows ("Total", "All", "Overall") | Flag them in the Check panel and leave them in. A one-click "Leave out total rows" removes them. |
| "Source:" and "Note:" lines under a pasted table | Move them out of the data automatically, into the source and notes, because left in they turn a number column into text. |
| Ambiguous slash dates (`03/04/2020`, with no part above 12) | Read them as month/day, as US spreadsheets write them, and say so in the Check panel. |
| Series from several value columns and a mapped series column together | One series per pair ("Britain - I typically tip"), with an information notice above 12 series suggesting tabs. |
| Number format from the data on topic charts too | Pasted data only. Module rows also carry `unit`; giving module percent measures a default percent axis would change approved module screenshots, so that is a separate decision. |
| When the chart switches after a table edit | Only when the current chart can no longer draw the edited table. A fresh import always switches. |

---

## Stage 1 - Write Every Test First

Every test named in this plan is written before its feature code, following the rules in the renderer plan's Stage 1. Tests that import a module that does not exist yet go in their own file, because a dynamic `import()` of a missing module fails the whole test file under Vite, not just that test.

### The example-table corpus

The corpus is what keeps this plan general. Each entry is a small pasted table and the result the tool should reach on a fresh import, with no edits from the reader. A new shape found later becomes a new entry, not a special case in code.

New folder `tests/fixtures/byod-shapes/`. Each entry is a `.txt` file (tab-separated, as a spreadsheet copy arrives) plus one record in `tests/fixtures/byod-shapes/expectations.js` giving the expected column types and units, chart type, mapping, appearance presets, warnings, and title.

| Entry | Shape | Expected chart |
|---|---|---|
| `wide-monthly-shares` | Date (YYYY-MM) and six share columns, one with leading blanks (`mockups/custom-viz-test/test-data-1.txt`) | Line, six series, percent axis, calendar ticks |
| `long-monthly-shares` | The same data long: Date, Browser, Share | Line, series from Browser |
| `years-across-columns` | Location, then 2019 to 2024 as columns | Line, years as periods, one series per location |
| `two-period-columns` | County, 2010, 2020 | Range |
| `interval-columns` | Study, Estimate, Lower, Upper | Forest |
| `low-high-columns` | Occupation, Low, High | Range |
| `two-labels-shares` | Job, Nation, four answer shares adding to 100 (`test-data-2.txt`) | Bar, horizontal, stacked to 100%, sorted; warning that Job is unmapped |
| `one-label-several-values` | Region and three unrelated counts | Bar, grouped |
| `one-label-one-value` | Nation and one value, 14 rows | Bar, horizontal |
| `two-labels-grid` | Age group, Region, value, every pair present | Heatmap |
| `two-labels-sparse` | Age group, Region, value, pairs missing | Dot plot |
| `two-numbers` | Unique names, Income, Rent | Scatter |
| `quarterly` | "2020 Q1" periods and two values | Line, quarter ticks |
| `school-years` | "2019-20" periods and enrollment | Line |
| `irregular-dates` | ISO survey dates with uneven gaps and one value | Line, uneven spacing |
| `month-names` | "Jan 2020" periods | Line |
| `messy-export` | A title line, a two-row header, "n/a" and "(D)" cells, "12.3*" footnote marks, a Total row, blank label cells, and Source and Note lines | Line or bar as its shape says; findings listed in the Check panel |
| `decimal-comma` | "1.234,5" values | Values read as numbers |
| `currency-percent-strings` | "$1,200" and "45%" cells | Currency and percent axes |

### The corpus test

New file `tests/js/lib/visualization/byodShapes.test.js`. For every corpus entry it parses the text with `parsePaste`, dispatches a fresh `SET_DATA_SOURCE` through `reduceChartConfig`, runs `executeInlineQuestion`, builds the chart model, and renders the chart.

| Test | What it checks |
|---|---|
| `<entry>: reads every column as the expected type and unit` | Workstreams 1 to 3. |
| `<entry>: picks the expected chart, mapping, and presets` | Workstreams 4 and 5. |
| `<entry>: raises exactly the expected warnings` | Workstream 6, and no unexpected issues. |
| `<entry>: derives the expected title and axis labels` | Workstream 7. |
| `<entry>: renders without a React key warning or an error` | The duplicate-key class of bug, for every chart a fresh import picks. |
| `<entry>: renders without a React key warning on every chart it can switch to` | The same, for every visx chart the reader can switch to. |

---

## Workstream 1 - Messier tables read cleanly

### What is wrong today

- **Only the first row can be the header.** `detectHeaderRow` in `lib/tabular/parseTable.js` compares row 0 with the rows below it. A title line above the header becomes the header, and the real header becomes a data row that turns every column into text.
- **Placeholders vote as text.** `inferColumnType` in `lib/tabular/columnTypes.js` counts "n/a", "-", "..", "(D)", and "(X)" as text, so a number column with enough of them is typed text, and with fewer of them its placeholders grade red as malformed.
- **Footnote marks break numbers.** `parseNumber` rejects "12.3*", "12.3 (r)", "−5" (a Unicode minus), and "1 234" (a space as thousands separator).
- **The decimal-comma convention is never detected.** `parseNumber` accepts `locale: "eu"`, but `inferColumnType` always calls it with the default, so "1.234,5" is text.
- **Source and note lines become data.** "Source: YouGov" under a table is a data row.
- **Two-row headers lose their names.** A header split over two rows (merged cells in Excel) produces "Column 3" names.
- **Grouped exports and totals.** A label written only on the first row of its block leaves blank label cells, and a Total row double counts in stacked bars and pies. Neither is pointed out.

### Steps

1. **A cleaning pass before the table is built.** New client-safe file `lib/tabular/cleanTable.js`. `cleanGrid(rawRows)` runs between the parser (Papa Parse or ExcelJS) and `buildTable`, for both paste and upload, and returns `{ rows, meta, findings }`.
   - Leading lines with one non-empty cell, above the first row that is at least half filled, become `meta.title`.
   - After the last row with a number in a numeric column, rows with one non-empty cell, or starting with "Source", "Sources", "Note", "Notes", or "*", become `meta.source` and `meta.notes`.
   - When the two rows above the body are both text and the upper one has blanks, the upper row is filled to the right (merged cells) and the two are joined as "Upper - Lower" names.
   - `detectHeaderRow` then runs on the cleaned rows. Each change is recorded in `findings`, so the Check panel can say what was moved and the reader can undo it.
2. **Missing and suppressed tokens.** One list of each in `columnTypes.js`. Missing: a blank cell, `n/a`, `NA`, `-`, `–`, `—`, `..`, `...`, `null`, and `none`. Suppressed: `(D)`, `(X)`, `(S)`, `*`, `**`, and `suppressed`.
   - `inferColumnType` leaves both out of its vote, so they never decide a column's type.
   - `coerceColumn` coerces both to null, never as failures. `tableChecker.js` grades missing tokens as empty, and gains a suppressed grade drawn like empty with an "S".
   - `tableToObservations` gives a suppressed cell status `suppressed` and a missing one status `missing`, so hover and View Data can tell them apart, as module data already does.
3. **Decorated numbers.** `parseNumber` accepts a trailing footnote mark (`*`, `†`, `‡`, or a letter in parentheses), a Unicode minus, a leading plus, and spaces, non-breaking spaces, or thin spaces as thousands separators. `coerceColumn` reports which cells carried a mark, and the Check panel shows them.
4. **Per-column number convention.** `inferColumnType` tries both conventions and keeps the one that parses more cells, saved as `column.locale`. `coerceColumn` and `tableToObservations` read it.
5. **Fill down.** A text column whose blanks each sit directly below a filled cell, in rows whose other columns are filled, is a fill-down candidate. The Check panel offers "Fill down" (a table edit through `SET_DATA_SOURCE`, undoable).
6. **Total rows.** A row whose first text cell starts with "Total", "Grand total", "All", or "Overall" is flagged. The Check panel offers "Leave out total rows".
7. **Use what was moved.**
   - `meta.source` becomes the observations' `source` in place of "Inline data", and turns on the source-and-notes box, which is off by default in the tool only because a pasted table normally has nothing to cite.
   - `meta.title` fills the title when the reader has typed none.
   - `meta.notes` fill the footnote.
8. **The Check panel.** `CheckLegend` in `components/chart-builder/wizard/steps/ImportStep.js` grows a findings list under the color key, one line per finding, each with its one-click action where it has one.

### What this makes out of date

- [[visualization-specification]], section Visualization Tool (Import step and Check).
- [[projectSpec]], the description of the tabular helpers in `lib/tabular/`.

### Tests

New file `tests/js/lib/tabular/cleanTable.test.js`:

| Test | What it checks |
|---|---|
| `moves a title line above the header into meta.title` | The header is found below it. |
| `moves Source and Note lines under the data into meta` | They are not data rows. |
| `joins a two-row header with merged cells into one name per column` | No "Column 3" names. |
| `records every change as a finding` | The Check panel can show and undo it. |
| `leaves a clean table untouched` | No findings, identical rows. |

Extend existing files:

| File | Test | What it checks |
|---|---|---|
| `columnTypes.test.js` | `does not let missing or suppressed tokens decide a column's type` | A number column with "n/a" and "(D)" stays a number column. |
| `columnTypes.test.js` | `reads footnote marks, a Unicode minus, and space separators` | Decorated numbers. |
| `columnTypes.test.js` | `detects the decimal-comma convention per column` | `column.locale`. |
| `tableChecker.test.js` | `grades suppressed tokens apart from empty and malformed cells` | The new grade. |
| `toObservations.test.js` | `gives suppressed cells suppressed status and placeholders missing status` | Honest statuses. |
| `toObservations.test.js` | `uses the table's detected source in place of Inline data` | The source box cites it. |
| `ImportStep.test.js` (new) | `lists findings with their one-click actions` | Fill down, Leave out total rows, Undo move. |

---

## Workstream 2 - Dates sit on a real time axis

### What is wrong today

- **Anything but a plain year is drawn as a category.** `periodToken` in `lib/visualization/inlineQuestion.js` keeps "2009-01" as a string. `LineChart.js` then uses an evenly spaced point scale whenever a period is not a plain number (`components/charts/visx/LineChart.js`, around line 240), so a missing month or an uneven survey date is hidden. `periodTicks` in `lib/visualization/chartLayout/axisScale.js` labels every Nth period, giving ticks like "2010-12, 2011-11" rather than calendar years.
- **Several common formats are not dates.** `parseDateToken` in `lib/tabular/columnTypes.js` reads years, "YYYY-MM", quarters, and ISO dates. It does not read "Jan 2020", "January 2020", "1/31/2020", "31/01/2020", "2020/01", "FY2020", or school and fiscal years such as "2019-20" and "2019-2020", which are common in PPIC's own data.
- **Text periods sort alphabetically.** `comparePeriods` in `inlineQuestion.js` and `toObservations.js` compares labels as text, so "Feb 2020" would sort before "Jan 2020".

### Steps

1. **Read more date formats.** Extend `parseDateToken`:
   - Month names, full or short, before or after the year.
   - Slash dates: month/day/year, day/month/year, and year/month.
   - Fiscal and school years: "2019-20", "2019-2020", "FY2020", "FY 2019-20".

   Every result gains a `position` in decimal years (a day's fraction of its year; a month at `(m - 1) / 12`; a quarter at `(q - 1) / 4`; a school or fiscal year at July 1 of its first year, `+ 0.5`) and a `granularity` (year, quarter, month, day, or span).
2. **Slash dates are decided per column.** If any first part is above 12, the column is day/month. If any second part is above 12, it is month/day. Otherwise it is read as month/day and the Check panel says so (see [Decisions still needed](#decisions-still-needed)).
3. **A date column knows its granularity.** `inferColumnType` returns the finest granularity present, saved as `column.granularity`.
4. **Observations carry a position.** `tableToObservations` keeps `period` as the label (the identity the time filter, keys, and View Data use) and adds `periodPosition` from `parseDateToken`. Document `periodPosition` as optional in `lib/visualization/observationContract.js`. Module rows need nothing new: a numeric year is its own position.
5. **Sort by position.** `inlinePeriods` and `requestedPeriods` sort by position, falling back to today's comparison only for periods with none.
6. **A time scale on line charts.**
   - `lineModel.js` passes each period's position. `LineChart.js` uses a linear scale over positions whenever every period has one, so spacing follows the calendar.
   - New `calendarTicks({ min, max, width, granularity })` in `axisScale.js` chooses ticks at calendar boundaries: 1, 2, 5, 10, or 25 years, or quarters, or months, as many as `periodLabelCount(width)` allows. Labels read "2010", "Q1 2010", or "Jan 2010".
   - Hover shows the period's own label, formatted ("Dec 2014").
   - The dashed range compares positions.
   - The Advanced Mode horizontal tick increment stays in years. Month and quarter increments are a follow-up.
7. **Other charts keep categorical periods.** Bar, heatmap, and dot plot keep one slot per period, ordered by position and labelled with the formatted label.

### What this makes out of date

- [[visualization-specification]], sections Visualization Tool and Time.
- The observation contract table in [[visualization-backend-implementation-plan]] (the optional `periodPosition`).

### Tests

| File | Test | What it checks |
|---|---|---|
| `columnTypes.test.js` | `reads month names, slash dates, and fiscal and school years` | New formats. |
| `columnTypes.test.js` | `gives every date a decimal-year position and a granularity` | `position`, `granularity`. |
| `columnTypes.test.js` | `decides day/month order per column and reports an ambiguous column` | Slash dates. |
| `inlineQuestion.test.js` | `sorts month-name periods by date, not alphabetically` | Sort by position. |
| `toObservations.test.js` | `adds periodPosition and keeps the period label` | Observation shape. |
| `axisScale.test.js` | `places calendar ticks on year boundaries for monthly data` | `calendarTicks`. |
| `axisScale.test.js` | `steps up from years to 5 and 10 years as the span grows` | Tick density. |
| `lineModel.test.js` | `spaces uneven survey dates by their distance in time` | Linear positions. |
| `LineChart.test.js` | `labels monthly data with years and hovers with the month` | Ticks and hover. |

Screenshot case: `matches the approved monthly line layout`, from the `wide-monthly-shares` corpus entry.

---

## Workstream 3 - Units and number formats come from the data

### What is wrong today

- **Every pasted measure is a plain number.** `withInlineBindings` in `lib/visualization/inlineQuestion.js` writes `unit: "number"` on every outcome. `parseNumber` strips "%" and "$" and forgets them, so a column of "45%" draws an axis reading "45".
- **The axis never reads a unit.** `numberFormatFor` in `lib/visualization/models/sharedSettings.js` uses the reader's number type, or detects year-over-year change, and nothing else.
- **Calculations ignore what the numbers are.** Because every column is a count, the tool offers calculations on shares that only make sense on counts.

### Steps

1. **Profile each number column.** `inferColumnType` returns, and the table saves on each column:
   - `unit`: "percent" when at least 80% of filled cells end in "%" or the header contains "%", "percent", "pct", or "share"; "usd" when at least 80% carry "$"; otherwise "number".
   - `decimals`: the median number of decimal places the cells show.

   Other currency symbols stay "number" for now, because the formatter knows only `usd`.
2. **The reader can change it.** `InputTableEditor.js` adds a Format choice (Number, Percent, Currency) beside each number column's type, saved on the column. A reader's choice is never overwritten by a later profile.
3. **Parts of a whole.** New helper `rowShares(table, columns)` in `lib/tabular/columnTypes.js` returns true when at least 90% of rows sum to 100 (within 1.5), or to 1 (within 0.015), across the given columns. Workstream 5 uses it to pick a 100% stacked bar. Columns that pass are marked percent, unless the reader set their format.
4. **Fractions stay as written.** A column headed as a percent whose values all sit between 0 and 1 is not rescaled. The Check panel offers "Show as percent (multiply by 100)" as a one-click table edit.
5. **Wire the unit through.**
   - `withInlineBindings` takes each outcome's unit from its column, so `isCalculationAllowed` gates calculations by what the numbers are.
   - `numberFormatFor` falls back to the rows' shared unit when the reader chose no number type and the rows are pasted data (see [Decisions still needed](#decisions-still-needed) for topic charts).
   - The decimal places default to the column's `decimals`, capped at 1 for percents.
6. **Mixed units.** When the mapped value columns (Workstream 4) differ in unit, the axis uses the first column's unit, and an information notice names the others.

### What this makes out of date

- [[visualization-specification]], sections Visualization Tool, Number formats, and Settings reference (the Format column choice).

### Tests

| File | Test | What it checks |
|---|---|---|
| `columnTypes.test.js` | `profiles percent, usd, and plain number columns with their decimals` | `unit`, `decimals`. |
| `columnTypes.test.js` | `detects rows that add up to 100 or to 1` | `rowShares`. |
| `inlineQuestion.test.js` | `takes each outcome's unit from its column` | No more hard-coded unit. |
| `sharedSettings.test.js` | `formats a pasted percent column as percent with no number type chosen` | The fallback. |
| `sharedSettings.test.js` | `leaves topic charts' number format unchanged` | The fallback is pasted-data only. |
| `executeInlineQuestion.test.js` (new) | `does not offer count-only calculations on a percent column` | The unit gate. |
| `InputTableEditor.test.js` | `keeps a reader's Format choice when the table is profiled again` | The reader wins. |

---

## Workstream 4 - Several value columns become series

### What is wrong today

- **One value column per chart.** `resolveInlineRoles` in `lib/visualization/inlineQuestion.js` maps one column to `value`, and `tableToObservations` reads that one column per row. A wide table (a date and one column per series) can show only one series, with no way to reshape it in the tool.
- **Series come only from a label column.** `deriveInlineComparisons` makes one comparison per distinct value of the comparison column, or a single "Data" comparison when none is mapped.
- **Periods across the top cannot be read.** A table with years as column headers (Location, 2019, 2020, 2021) has no time column, so a line chart is impossible without transposing.
- **The mapping holds one column per role.** `dataset.bindings` maps a role to one column name, `InlineRoles` in `components/chart-builder/sections/OutcomeSection.js` draws one select per role, and the `SET_BINDING` handler in `chartConfigStore.js` removes a column from every other role by comparing names.

### Steps

1. **Charts declare which role takes a list.** Add `multiValueRole` to the line (`y`), bar (`y`), and dot plot (`color`) descriptors in `lib/visualization/chartRegistry.js`, exposed through `getChartCapabilities`. No other chart takes a list in this plan.
2. **The mapping holds a list.** That role's binding may be a list of column names: `bindings.y: ["Chrome", "IE", "Firefox"]`. A single name stays valid, so every view saved today opens unchanged. One helper, `bindingColumns(value)`, returns a list either way, and every reader of `bindings` calls it.
3. **Value columns as series.**
   - `resolveInlineRoles` returns `values` (the list) beside `value` (its first entry, for callers that want one).
   - With two or more value columns and no comparison column, `deriveInlineComparisons` makes one comparison per value column: its label is the column name and it records `valueColumn`.
   - With a comparison column mapped too, it makes one comparison per pair ("Britain - I typically tip"), and an information notice appears above 12 series suggesting tabs.
   - Reader edits (custom label, color) keep matching by derived label, as today.
4. **Value columns as periods.** When every listed value column's header parses as a date (Workstream 2), the line chart offers "Columns are periods" (`bindings.valuesArePeriods: true`). Each value column then becomes a period, the header its label and position, and the series come from the comparison column. This reads a years-across-the-top table without transposing it.
5. **Observations.** `tableToObservations` emits one observation per row per value column. Each carries that column's comparison id (or, with `valuesArePeriods`, the column as its period), `measureId` and `measureLabel` set to the column name, and that column's unit and status. A blank cell is a missing observation, so a series that starts late (Edge in the browser table) draws from its first value.
6. **The question.**
   - `withInlineBindings` keeps one `y` outcome, the first value column, because the outcome list allows each role once (renderer plan, Workstream Q).
   - `executeInlineQuestion` checks the calculation against every value column's unit, as Workstream Q checks every measure.
   - Calculations already run per comparison, so change and index calculations work per column with no change. Ranked values rank by the first value column.
7. **The mapping control.** For the chart's `multiValueRole`, `InlineRoles` draws a checklist of the table's number columns, in table order, with Select all, in place of a single select. `SET_BINDING` accepts `columns: [...]`. Its rule that a column serves one role at a time removes chosen columns from other roles, and other roles' columns from the list.
8. **Order and stacking.** Series order is the checklist order. On bar charts the existing drag order (`seriesOrder`) applies, and stacking, including 100% stacking, works with no change because each value column is an ordinary comparison.
9. **Auto-mapping.** `guessInlineBindings` puts every number column in the list role when no label column is mapped to the comparison role. Otherwise it maps only the first, as today. Workstream 5 refines this with the table's shape.
10. **View Data and data export.** Rows already name their own measure. `displayTableFromObservations` adds a Measure column when a table holds several measures, as Workstream Q specifies, so the same change serves both.

### What this makes out of date

- [[visualization-specification]], sections Visualization Tool, Outcome, and Comparisons (series from value columns).
- [[projectSpec]], the description of inline bindings in `inlineQuestion.js`.

### Tests

| File | Test | What it checks |
|---|---|---|
| `inlineQuestion.test.js` | `reads a single column name and a list the same way` | `bindingColumns`, old views open. |
| `inlineQuestion.test.js` | `makes one comparison per value column, labelled by the column` | Series from columns. |
| `inlineQuestion.test.js` | `makes one comparison per pair when a comparison column is also mapped` | The pairing and its notice. |
| `inlineQuestion.test.js` | `keeps a custom label and color when the value list changes` | Reader edits survive. |
| `toObservations.test.js` | `emits one observation per row per value column with that column's unit` | Observation shape. |
| `toObservations.test.js` | `reads years across the top as periods` | `valuesArePeriods`. |
| `toObservations.test.js` | `starts a series at its first filled cell` | Leading blanks are missing values. |
| `executeInlineQuestion.test.js` (new) | `allows a calculation only when every value column's unit does` | The unit gate. |
| `chartConfigStore.inline.v3.test.js` | `SET_BINDING takes a list and keeps each column in one role` | The store. |
| `OutcomeSection.test.js` | `draws a checklist for the chart's value list role` | The control. |
| `barModel.test.js` | `stacks value columns to 100% in their checklist order` | Stacking. |
| `lineModel.test.js` | `draws one line per value column` | Wide tables. |

---

## Workstream 5 - The chart switches to the most applicable chart

### What is wrong today

`suggestChartType` in `lib/visualization/inlineMapping.js` returns one chart from counts of column kinds. Any table with a label column and two or more number columns becomes a range chart, which suits a low-and-high pair and little else. It never looks at headers, row sums, repeated labels, or the number of categories, and it sets no appearance (orientation, stacking, sort).

### Steps

1. **Profile the table.** New client-safe file `lib/visualization/inlineProfile.js`. `profileTable(table)` returns:
   - the columns of each kind, with each text column's distinct count and whether its values repeat;
   - whether the label columns together identify each row;
   - the date column's granularity;
   - `rowShares` over the number columns;
   - which number columns have date headers;
   - name pairs among number columns (low/high, lower/upper, start/end, before/after, min/max, two periods);
   - whether two label columns form a complete grid;
   - the longest category label.
2. **Rank the charts.** `rankInlineCharts(profile)` returns candidates in order, each `{ chartType, bindings, appearance, reason }`, following the [ranking rules](#the-ranking-rules) below. The first rule a table matches ranks first, and the rest follow for the reader's Chart Type tiles. Pie and the maps are never chosen automatically: the style guide prefers bars to pies, and a pasted table has no map boundaries.
3. **A fresh import switches.** `SET_DATA_SOURCE` with `defaultChart` applies the first candidate: its chart type, its mapping, and its appearance presets. The tool's wizard is exempt from the workbench rule that no setting is chosen for the reader, which is why presets are allowed here. `suggestChartType` becomes a thin wrapper that returns the first candidate's chart type, so its callers keep working.
4. **A table edit switches only when it must.** After a type change, transpose, fill down, or Format change, the current chart stays, and its mapping is refreshed, unless `inlineRenderBlock` says it can no longer draw the table. Only then does the chart switch to the first candidate.
5. **Say why.** Above the preview in the Edit step, a one-line note gives the candidate's reason, for example "Line chart: a date column and six number columns." It disappears once the reader changes chart type, and Undo (existing) returns to the previous chart. Nothing about it is saved: it is derived by ranking again and comparing with the current chart.
6. **The Chart Type tiles.** `ChartTypeSection.js` orders its "Show more" tiles by the ranking, so the next-best charts are one click away.

#### The ranking rules

Rules are checked top to bottom. Each candidate's reason, shown to the reader, restates its row in plain words.

| Table shape | Chart | Mapping and appearance |
|---|---|---|
| A date column and one or more number columns, no label column | Line | x = date; values = every number column |
| A date column, a label column whose values repeat across dates, and one number column | Line | x = date; series = the label column |
| A label column and three or more number columns with date headers | Line | values = those columns, `valuesArePeriods`; series = the label column |
| A label column and two number columns that are a name pair or two periods | Range | category = label; start and end in header order |
| A label column, an estimate column, and lower and upper columns | Forest | category = label; point, start, end |
| Label columns and two or more number columns whose rows share 100 | Bar | category = the label column with the most distinct values; values = those columns; stacked to 100%; horizontal; sorted by the first value column |
| A label column and two or more number columns that are not shares | Bar | values = the number columns, grouped |
| Two label columns and one number column, every pair present, each with 25 values or fewer | Heatmap | x and y = the two label columns |
| Two label columns and one number column otherwise | Dot plot | rows = the label column with more values |
| One label column and one number column | Bar | horizontal when there are more than 10 categories or a label is longer than 20 characters |
| Two or more number columns and no label column, or unique labels and two number columns | Scatter | x and y = the first two number columns |
| Anything else | Bar | as auto-mapping guesses |

### What this makes out of date

- [[visualization-specification]], section Visualization Tool (how the first chart is chosen).
- The `suggestChartType` description in [[projectSpec]].

### Tests

New file `tests/js/lib/visualization/inlineProfile.test.js`:

| Test | What it checks |
|---|---|
| `profiles column kinds, repeats, grids, row shares, and date headers` | `profileTable`. |
| `ranks one rule per table shape` | One test per row of the ranking table, from the corpus. |
| `never ranks pie or a map first` | The style-guide rule. |
| `gives every candidate a reason a reader can understand` | The note's text. |

Extend existing files:

| File | Test | What it checks |
|---|---|---|
| `chartConfigStore.inline.v3.test.js` | `a fresh import applies the first candidate's chart, mapping, and presets` | The switch. |
| `chartConfigStore.inline.v3.test.js` | `a table edit keeps a chart that can still draw` | No surprise switches. |
| `chartConfigStore.inline.v3.test.js` | `a table edit switches when the chart can no longer draw` | The fallback. |
| `inlineMapping.test.js` | `suggestChartType returns the first candidate` | The wrapper. |
| `EditStep.overhaul.test.js` | `shows the reason until the reader changes chart type` | The note. |
| `ChartTypeSection.test.js` | `orders the extra tiles by the ranking for pasted data` | The tiles. |

---

## Workstream 6 - Unmapped label columns raise a warning

### What is wrong today

When two rows share every mapped column, for example Nation mapped as the category while Job is left out, the chart draws both rows in one place with no explanation. Bars overlap or stack, a line zig-zags between them, a heatmap keeps the last one, and a pie shows two slices with the same name. Since October 14 these no longer break React's keys, but the reader is never told why the chart looks wrong.

### Steps

1. **Find rows that share a place on the chart.** In `executeInlineQuestion` (`lib/tabular/toObservations.js`), after the observations are built, group them by comparison, category, geography, period, and measure role. Any group with more than one row raises one issue, `inlineRowsShareMapping`, with level `warning`.
2. **Name the cause.** The issue lists the unmapped text or date columns whose values differ within those groups, and how many places are affected. The message names the column and the fix, for example: "8 rows share a bar because “Job” is not mapped. Map “Job” to a role, or remove rows in the table so each bar has one row."
3. **Show it.** `PreviewPane.js` shows issues of level `comparison` and `information` today (`components/chart-builder/wizard/PreviewPane.js`, around line 361). Add `warning`, styled as a warning in `ValidationNotice.js`.
4. **Warn only.** Nothing is combined, filtered, or remapped. The chart draws as it does today, with the unique keys added on October 14 (`barModel.js`). Combining rows and sections can be offered later, as Workstream P's panels land.

### What this makes out of date

- [[visualization-specification]], section Visualization Tool (validation messages).

### Tests

| File | Test | What it checks |
|---|---|---|
| `executeInlineQuestion.test.js` (new, or extended if Workstream 4 created it) | `warns when rows share every mapped column, naming the unmapped column` | The issue and its message. |
| `executeInlineQuestion.test.js` | `does not warn when every row has its own place` | No false alarms. |
| `executeInlineQuestion.test.js` | `changes no observation when it warns` | Warn only. |
| `PreviewPane.renderer.test.js` | `shows a warning-level issue above the chart` | The display. |

---

## Workstream 7 - Titles and labels are written for pasted data

### What is wrong today

`deriveQuestionLabels` in `lib/visualization/deriveLabels.js` writes topic phrasing for pasted data too. A line chart's title ends "over time by geography", because a pasted question has no geographic level and `geographyScope` falls back to "geography". The line chart's x-axis reads "Time", and a bar's category axis reads "Location", whatever the columns are called. A chart with no comparison column has one series named "Data".

### Steps

1. **A branch for pasted questions.** When `question.dataset.kind === "inline"`, `deriveQuestionLabels` calls a new `deriveInlineLabels(config)` in the same file. It builds every label from the mapped column names:
   - **Value name.** With one value column, the value name is that column's name. With several, it lists up to three names ("Chrome, IE, and Firefox") and then "and N more".
   - **Title.** The value name, then "over time" when x is a date column, otherwise "by" and the category column's name.
   - **Axes.** They name the mapped columns: the date column on a line chart, the category column on a bar chart, horizontal or vertical as the orientation says. The value axis names the one value column, or, with several sharing a unit, the unit ("Percent"). With mixed units it is left blank.
   - **No geography wording.** Never "by geography" or "in" a place list.
2. **The table's own title wins.** A title captured by Workstream 1 (`meta.title`) is the derived title.
3. **Series names.** With no comparison column and one value column, the single series is named after that column, not "Data". `deriveInlineComparisons` and `tableToObservations` share that label.
4. **Typed labels still win.** These are derived defaults. `effectiveLabels` already keeps anything the reader typed.

### What this makes out of date

- [[visualization-specification]], section Labels (derived labels for pasted data).

### Tests

| File | Test | What it checks |
|---|---|---|
| `deriveLabels.test.js` | `titles a pasted line chart from its value and date columns, with no geography wording` | The branch. |
| `deriveLabels.test.js` | `lists up to three value columns and counts the rest` | Several values. |
| `deriveLabels.test.js` | `names the axes after the mapped columns in either bar orientation` | No "Time" or "Location". |
| `deriveLabels.test.js` | `uses the table's own title when one was captured` | `meta.title`. |
| `inlineQuestion.test.js` | `names a lone series after its value column, not Data` | Series names. |
| `deriveLabels.test.js` | `leaves topic labels unchanged` | The branch is pasted-data only. |

---

## Glossary

| Term | Meaning |
|---|---|
| **Wide table** | A table with one column per series, for example a date column and one column per browser. Most spreadsheet exports are wide. |
| **Long table** | A table with one row per value, and a label column saying which series it belongs to, for example Date, Browser, Share. |
| **Mapping** | Which table column plays which part of the chart (`question.dataset.bindings`), for example the date column as the x-axis. |
| **Value list role** | The one role per chart (`y` on line and bar, `color` on dot plot) that can hold several columns, each becoming a series. |
| **Comparison** | One series in the question's own terms: each gets a color, a key entry, and its own rows. Pasted data derives its comparisons from the mapping. |
| **Corpus** | The folder of example tables in `tests/fixtures/byod-shapes/` that every change is tested against. |
| **Finding** | Something the cleaning pass or a column profile noticed (a moved title line, a total row, a fill-down candidate), listed in the Import step's Check panel. |
| **Position** | A period's place on a time axis, in decimal years, so months, quarters, days, and school years can share one scale. |
| **Granularity** | The finest unit a date column uses: year, quarter, month, day, or span (a school or fiscal year). |
| **Row shares** | Number columns whose values add up to 100 (or 1) on nearly every row: parts of a whole, best drawn as a 100% stacked bar. |
| **Candidate** | One ranked chart for a table, with its mapping, appearance presets, and the reason it was chosen. |
