---
Topic: Visualization backend
Content Type: implementation plan
pinned: false
description: "A tests-first plan for moving every chart except maps from Plotly to visx, one chart type at a time, so each chart follows the PPIC Data Visualization Style Guide and every editor control works. Written for programmers continuing the visualization work."
Date Published: September 26, 2026
Last Updated: 09/29/2026 - 09:00 PM
Status: Updating
---

# Chart Renderer: Implementation Plan

> [!info] Who this is for and how to read it
> This plan is for whoever builds the new chart drawing code, whether a person or a model. Nothing in it is built yet. The work runs in five stages, in order: write every test, lay the groundwork, fix the charts one type at a time, rebuild export, then handle everything outside the chart. Each workstream (a group of related changes) says what is wrong today, the steps to fix it, which documents it makes out of date, and the tests to write. Words that may be unfamiliar are defined in the [Glossary](#glossary) at the end.

Today every chart in the app is drawn by Plotly, a charting library that makes many layout and style choices for us. The PPIC Data Visualization Style Guide (`docs/ref/Data Visualization Style Guide_062321-1 5 3.pdf`) asks for things Plotly makes hard or impossible: lines labeled directly in their own color, square key swatches no larger than 20px, and a separate gray source-and-notes box under the chart. A test of a different approach on a colleague's project ([older_ca_lfp_projections](https://github.com/emcghee73/older_ca_lfp_projections)) showed that visx, a small set of React chart building blocks, produces a line chart much closer to the guide.

A check of the editor also found 44 controls that save a setting the chart never uses, and three that do not save at all. This plan fixes both problems together. Each chart type is rebuilt in visx, and each control shown for that chart is either made to work, removed, or hidden, as the project owner decides.

This plan keeps Plotly for the two map types. It does not change how data is fetched or calculated. The question, comparison, and observation system from [[visualization-backend-implementation-plan]] stays exactly as it is. Only the last step, turning prepared observations into a picture, changes.

---

## The Order of Work

The work runs in five stages. A stage starts only when the one before it is done, except that charts in Stage 3 can be worked on side by side once Stage 2 is finished.

> [!note] Progress, September 29, 2026
> Stage 1 (tests) is written. Stage 2 (A, B, C) and Workstream D (line chart) are built. The line chart's screenshot baselines await review. Workstreams E to O remain.

| Stage | What happens | Workstreams |
|---|---|---|
| 1. Write the tests | The owner decides what happens to each broken control. Then every test in this plan is written, before any feature code. The test suite is expected to fail until the work lands. | See [Stage 1](#stage-1---write-every-test-first) |
| 2. Groundwork | The shared pieces every chart needs: style rules, a way to pick the drawing library per chart type, the PPIC frame, and the settings every chart shares. | A, B, C |
| 3. Chart by chart | Each chart type is rebuilt, reviewed until it looks right, and has each of its controls made to work, removed, or hidden. | D to L |
| 4. Export | Export is rebuilt to work from the drawn picture. Each chart type becomes the default only once its export works. | M |
| 5. Other externalities | Embeds, saved views, shared links, the click-through tests, cleanup, and project documents. | N, O |

| # | Workstream | Stage | Depends on |
|---|---|---|---|
| A | The PPIC style rules live in one file that every chart reads | 2 | - |
| B | Each chart type says which library draws it | 2 | - |
| C | Every chart sits inside the same PPIC frame, and the settings every chart shares work | 2 | A, B |
| D | Line chart | 3 | C |
| E | Bar chart | 3 | C |
| F | Range chart (dumbbell) | 3 | C |
| G | Dot plot | 3 | C, F |
| H | Forest plot | 3 | C, F |
| I | Heatmap | 3 | C |
| J | Scatter and bubble charts | 3 | C |
| K | Pie chart | 3 | C |
| L | Maps (still drawn by Plotly) | 3 | C |
| M | Export works from the picture the chart already draws | 4 | D to L |
| N | Embeds, saved views, shared links, and click-through tests keep working | 5 | M |
| O | Plotly is loaded only for maps, and the old code and documents are cleaned up | 5 | N |

> [!warning] Users keep seeing the Plotly charts until Stage 4, except the line chart
> Stage 3 builds each visx chart behind a preview switch (Workstream B). Users keep seeing the Plotly version of every chart until that chart's export works in Stage 4. This follows the decision that export stays on Plotly in the short term, and it means Stage 3 can be reviewed without affecting anyone.
>
> **Exception, September 29, 2026.** The owner made visx the line chart's default ahead of Workstream M, for review. Until M lands, a line chart's image dialog says image export is coming soon, and its Download button stays off; data export and embeds work. `?renderer=plotly` still shows the Plotly line. The approved legacy `line-comparisons` screenshot stays a Plotly picture until a visx baseline is approved.

---

## Decisions Already Made

These were settled with the project owner. They are recorded here so no one has to guess later.

| Question | Decision |
|---|---|
| Which library draws which charts | Plotly keeps the choropleth map and the symbol map. Every other chart type moves to visx. |
| Chart font | Keep Inter for all chart text. The style guide's Proxima Nova and Arial are not used. |
| Dashed lines | Lines are solid by default, as the guide asks. The user can turn on dashes for a range of periods they choose, for example projected years. |
| Hover | Build hover information (a tooltip) for the visx charts. On September 29, 2026 the owner chose to match the hover label on PPIC's published Datawrapper charts: it names only the one point nearest the pointer, with no box (see Workstream D, step 6). |
| Source line | Decided September 29, 2026. The source-and-notes box cites each topic's datasets in full (publisher and dataset, for example "California Department of Finance (DOF), P-3 Population Projections"), not the Source filter value ("DoF P-3"). A "Show source and notes" switch can turn the whole box off. |
| Toolbar, zoom, and pan | Dropped for now. They are rarely used. The line chart must be built so zoom can be added later without a rewrite (Workstream D, step 7). |
| Export timing | Export stays on Plotly in the short term. Once each visx chart looks right and its controls work, export is rebuilt, and only then does visx become the default. |
| Order of work | Write all tests first, then go chart type by chart type, then export, then everything else. |
| Broken controls | The owner decides for each one whether to build it, remove it, or hide it until later. |
| Priority | Long-term reliability comes first, because the project may become public. |

> [!important] Choices this plan makes that you can overrule
> The plan makes a few smaller choices, each following the style guide. Change any of them before Stage 1 starts if you disagree.
>
> - **Markers off by default.** The guide says to avoid individual data markers on lines. Today the Markers switch is on when nothing is saved. It becomes off when nothing is saved, and a saved "on" still shows markers.
> - **Direct labels by default.** A new "Automatic" key setting labels each line at its right end, in its own color, when the labels fit without overlapping. When they do not fit, it falls back to a key on the right.
> - **Label text color.** A direct label is written in its line's color. A color too pale to read as text on white (below a 4.5 to 1 contrast ratio) is darkened, keeping its hue, until it reaches 4.5 to 1. This matches PPIC's published charts and was chosen by the owner on September 29, 2026, replacing the earlier gray-text-with-color-sample rule. The same rule colors the series name in the hover label.
> - **Vertical axis starts at zero.** This is the guide's default. The one exception is the "indexed" calculation (values around 100), where starting at zero would flatten every line. For that calculation the axis starts at a round number just below the lowest value.

---

## How the Screenshot Tests Work

This section explains the screenshot tests, because Stage 3 uses them to decide when a chart "looks good".

### What they are

Most of the project's tests run in Vitest, inside a fake browser (jsdom) that has no real screen. Those tests can check that a chart was given the right numbers and colors, but not what the chart looks like. For example, they cannot tell whether a key covers the lines or whether labels overlap.

The screenshot tests fill that gap. They use Playwright, which starts a real Chromium browser, opens a page, and takes a picture. `playwright.config.js` controls the setup and `tests/visual/visualization-v3.spec.js` holds the tests. Each picture is compared against an approved picture, called a baseline, stored in `tests/visual/__screenshots__/`. If more than 0.2% of the pixels differ, the test fails, and a person looks at the two pictures to decide whether the change was intended. There are four baselines today:

| Baseline | What it protects |
|---|---|
| `line-comparisons` | Four comparison lines and their legend |
| `bar-comparisons` | Grouped bars and category labels |
| `range-two-period` | Two endpoints and the connector between them |
| `heatmap-active-comparison` | The active tab, color scale key, and cell grid |

The pictures come from a test-only page, `/__visual/visualization-v3` (built from `app/%5F%5Fvisual/visualization-v3/visualization-v3-fixture.js`). It draws one chart from fixed test data with no network calls, so the picture is the same every run. The same spec file also has eight "full flow" tests. They click through the editor and check text and behavior, not pixels.

Run them with `npm run test:visual`. They are separate from `npm test`, and a new machine needs `npx playwright install chromium` once.

### How this plan affects them

- **The "done drawing" signal is Plotly-only today.** Workstream B replaces it with a signal any drawing can send.
- **Every baseline will change** as each chart type is rebuilt. A baseline is re-recorded only after a person has compared the old and new pictures and agreed the new one is right. Re-recording without looking would approve whatever was drawn, mistakes included.
- **Each chart gets new baselines** in its Stage 3 workstream, covering the layouts most likely to break.
- **The full-flow tests** are checked in Workstream N.

---

## Stage 1 - Write Every Test First

Stage 1 has two steps, and nothing else in this plan starts until both are done.

### Step 1: The owner decides each broken control

Every control that does nothing today appears in a settings table, either in Workstream C (controls every chart shares) or in the workstream for its chart type. Each table has a **Suggested** column, which is this plan's recommendation, and a **Decision** column. The owner filled in every Decision on September 26, 2026, with one of three answers (Keep marks a control that already works):

| Decision | What it means | What the tests check |
|---|---|---|
| **Build** | Make the control change the chart. | Changing the setting changes the chart in the stated way. |
| **Remove** | Take the control out of the editor for good. A saved view that still holds the old setting opens without an error and ignores it. | The control is not shown for that chart, and an old saved value is ignored. |
| **Hide** | Take the control out of the editor for now, keeping the saved setting, so it can be built later. | The control is not shown for that chart, and an old saved value is kept when the view is saved again. |

Every row now has a decision, so every test can be written. A new control added later needs a decision before its test is written. Leaving a control that does nothing in a public tool is not an option this plan offers.

> [!note] How "Build" was read for settings that have no control
> Where the Suggested column recommended a behavior with no control (bubble size by area, slice value labels), Build means build that behavior with no control. Where it left the choice open or recommended against a control (marker size, heatmap cell values, donut hole), Build means add a control. The chart workstreams below spell out each one.

### Step 2: Write the tests

Every workstream below ends with a Tests section naming each test file and each case. Write all of them in this stage, following these rules. They are the same rules the visualization backend refactor used.

- **The suite is meant to fail.** A test for a feature that does not exist yet fails until that feature lands. Do not skip tests or weaken them to make the suite pass. Each workstream is done when its tests pass.
- **Put tests for new files in new test files.** Vitest fails a whole test file, including its passing tests, when the file imports a module that does not exist yet. A test for a new module therefore goes in its own new file, never appended to a file whose other tests pass today. Once the module exists, the test can be moved if that reads better.
- **Write expected values by hand.** A test must never ask the code under test what the answer is and then agree with it. Expected colors, sizes, and orders are typed out in the test.
- **Use the shared test data.** Chart tests build their data from the existing fixtures in `tests/fixtures/visualization-v3/`, so every test agrees on what missing, suppressed, and projected values look like.
- **Screenshot tests are written now, pictures are recorded later.** The screenshot cases in each chart workstream are written in Stage 1. They have no approved picture yet, so they fail until the chart is reviewed and its baseline is recorded in Stage 3.

### Two tests that guard against broken controls coming back

These two files are written in Stage 1 and grow as each chart is finished. Together they make it impossible to add a control that does nothing without a test failing.

New file: `tests/js/lib/visualization/settingsCoverage.test.js`. It holds one hand-written row per chart type and per setting marked Build, with a test value. For each row, drawing the chart with the setting must give a different chart model than drawing it without. This is the same check that found the broken controls, made permanent.

| Test | What it checks |
|---|---|
| `<chart type>: <setting> changes the chart` | One case per row, for example `bar: groupGap changes the chart`. |
| `<chart type>: removed and hidden settings are ignored without error` | One case per chart type. |

New file: `tests/js/components/chart-builder/sections/controlCoverage.test.js`. For each chart type, it opens the editor's sidebar sections in both standard and advanced mode and lists every control shown.

| Test | What it checks |
|---|---|
| `<chart type> shows exactly the controls in its settings table` | The shown controls match a hand-written list per chart type. A new control fails this test until someone adds it to the list, which also means adding a row to `settingsCoverage.test.js`. |
| `<chart type> shows no removed or hidden control` | Controls marked Remove or Hide are gone. |

---

## Stage 2 - Groundwork

Stage 2 builds the pieces every chart needs. No chart changes appearance for users in this stage.

---

## Workstream A - The PPIC style rules live in one file that every chart reads

### What is wrong today

The chart style values are spread out, and the charts users see do not use most of them. `lib/visualization/plotlyDefaults.js` defines the font and grid color:

```js
export const PLOTLY_FONT_FAMILY = "Inter, sans-serif";
export const PLOTLY_GRID_COLOR = COLORS.gray2;
```

Only `toPlotly.js` imports these, and `toPlotly.js` now draws only the UI Kit examples ([[visualization-specification]], "`toPlotly.js` is not the production editor renderer"). The editor's charts are built by `adaptObservations` in `lib/visualization/adapters/index.js`, which never imports `plotlyDefaults.js`. So editor charts get Plotly's built-in font and grid, not PPIC's.

Some guide values are not in `lib/constants.js` at all. The guide's graph line and axis label color is `#6C7075`. Its subtitle color is `#646D76`, and its source-box and table-divider color is `#EFF0F2`. The nearest existing tokens (`gray2` `#C2C9CC`, `gray5` `#595F61`) are different colors.

### Steps

1. **`lib/constants.js`.** Add the three guide colors as named tokens next to the existing grays: graph line and axis label `#6C7075`, subtitle `#646D76`, and source box `#EFF0F2`. The project rule is that colors live in `constants.js` and nowhere else. Do not change any existing token's value, because the UI Kit and site pages use them.
2. **New file `lib/visualization/chartStyle.js`.** One frozen object holding the guide's rules, built from `constants.js` tokens. It must be safe to use in the browser. It holds:
   - **Type sizes.** Title 20px bold, subtitle 18px regular in the subtitle color, key title 16px bold, key text 14px, figure eyebrow 12px bold with 5% letter spacing, axis labels 14px in the axis color, data labels 14px, and source and notes 11px. The family is Inter throughout, by decision.
   - **Line weights.** Data lines 2px, graph and axis lines 1px in the axis color, and table row dividers 1px in the source-box color.
   - **Spacing.** 48px between chart parts (eyebrow, title, chart, key, source box), key swatches at most 20px and square, and bars no narrower than 10px.
   - **Standard export widths.** The guide's 950px, 650px, and 330px.
   - **Grid rule.** Horizontal grid lines only, never vertical.
3. **`lib/visualization/plotlyDefaults.js`.** Read its font and grid values from `chartStyle.js` instead of defining its own, so the maps match the visx charts. Keep the current export names so `toPlotly.js` and the UI Kit keep working.
4. **`components/ui-kit/ChartAnatomyShowcase.js`.** Read its numbers from `chartStyle.js` instead of typing them again. The UI Kit shows `1px, #6C7075` as literal text today, which will drift.

Keep the PPIC color orders in `lib/visualization/palettes.js` (`ppic-official-3` through `ppic-official`) and their contrast adjustments unchanged. Colors for comparisons already come from one place, and this workstream does not touch that.

### What this makes out of date

- [[visualization-specification]], section "Labels, appearance, and accessibility": add that chart style values come from `chartStyle.js`.
- `docs/agent/frontend-skill.md`, section "Configuration Defaults": it describes Plotly defaults in a `lib/chartDefaults.js` file that does not exist. Point it at `chartStyle.js`.

### Tests

New file: `tests/js/lib/visualization/chartStyle.test.js`. Write each expected value by hand from the style guide.

| Test | What it checks |
|---|---|
| `uses Inter for every chart text role` | Title, subtitle, key, axis, data label, and source all name Inter. |
| `matches the style guide type sizes` | Each size listed in step 2, written out by hand. |
| `draws graph lines at 1px in #6C7075` | The guide's graph line rule. |
| `draws data lines at 2px` | The guide's data line rule. |
| `caps key swatches at 20px` | The key rule. |
| `lists the guide's three export widths` | 950, 650, and 330. |
| `takes every color from lib/constants.js` | No hex value is written directly in `chartStyle.js`. Check the file's text, as `paletteSync.test.js` does. |

New file: `tests/js/lib/visualization/plotlyDefaults.test.js`:

| Test | What it checks |
|---|---|
| `Plotly font and grid come from chartStyle` | Maps and the UI Kit use the same values as visx charts. |
| `keeps its existing export names` | `PLOTLY_FONT`, `PLOTLY_GRID_COLOR`, and `legendFor` still exist, so `toPlotly.js` is not broken. |

---

## Workstream B - Each chart type says which library draws it

### What is wrong today

Plotly is hard-wired into the one place that draws editor charts. `components/chart-builder/wizard/PreviewPane.js` draws a `PlotlyChart` whenever the result has Plotly data:

```js
{status === "ready" && plotly?.data && !renderError ? (
  <PlotlyChart
```

The result is also stored in a variable named `plotly`, and export reaches into Plotly's own page element (`onGraphDiv`). There is no way to draw one chart type with something else, and no way to look at a new drawing before it replaces the old one. The screenshot test page has the same problem: it marks the chart ready only from Plotly's callback (`onGraphDiv={() => setReady(true)}`), so a visx chart would never be marked ready.

### Steps

1. **`lib/visualization/chartRegistry.js`.** Give every chart type descriptor a required `renderer` field set to `"plotly"` or `"visx"`. Every type starts as `"plotly"`. Add a function that returns the renderer for a chart type. It also takes an optional preview request and honors it only when the requested renderer exists for that chart type. Add a list of which chart types have a visx drawing; it starts empty, and each Stage 3 workstream adds its type.
2. **Preview switch.** When the page address contains `renderer=visx` or `renderer=plotly`, pass it through as the preview request. `PreviewContext.js` reads the page address. Ignore it on embedded charts (`embed=1`), so a shared embed always shows the default. This switch is for the team to compare drawings, and nothing on screen links to it.
3. **New file `lib/visualization/models/index.js`.** A function that turns observations into a plain description of what to draw (a chart model) for visx chart types. It takes the same input as `adaptObservations`. For now it throws the same "No adapter" error for every type. Each Stage 3 workstream adds its type.
4. **`components/chart-builder/wizard/PreviewContext.js`.** In `adaptV3Result`, ask the registry which renderer applies. For `"plotly"`, call `adaptObservations` exactly as today. For `"visx"`, call the new model function. Tag the result with the renderer that produced it.
5. **New file `components/charts/ChartRenderer.js`.** One component that receives the tagged result and draws either `PlotlyChart` or the matching visx component. It sets `data-chart-ready="true"` on its container once drawing is finished, whichever library drew it. Its file header follows `frontend-skill.md`.
6. **`components/chart-builder/wizard/PreviewPane.js`.** Replace the direct `PlotlyChart` use with `ChartRenderer`. Keep the table path (`plotly.table` to `DataTableView`) and the error, empty, and loading states exactly as they are. Renaming the `plotly` variable to something neutral is welcome but optional. If you rename it, rename it everywhere it is read in the same change.
7. **Screenshot test page.** Change `app/%5F%5Fvisual/visualization-v3/visualization-v3-fixture.js` to draw through `ChartRenderer`, to take `renderer=` from the page address, and to accept every chart type in this plan, not only the four it draws today. Change `openChart` in `tests/visual/visualization-v3.spec.js` to wait for `data-chart-ready` instead of `data-plot-ready`. Keep waiting for fonts to load. Update the comments in `playwright.config.js` that describe Plotly, and keep the 0.2% pixel tolerance unless the new pictures show it is wrong.

The default drawing must not change: with every chart type set to `"plotly"` and no preview switch, every editor chart, embed, and export behaves exactly as before, and the four existing screenshot baselines still pass.

### What this makes out of date

- [[visualization-specification]], sections "Current request flow" and "Ownership map": add the renderer choice step between the response and the drawing.
- [[projectSpec]], the chart registry description: descriptors now carry `renderer`.

### Tests

Extend `tests/js/lib/visualization/chartRegistry.catalog.test.js`. These cases only need `chartRegistry.js`, which exists, so they can go in the existing file.

| Test | What it checks |
|---|---|
| `every chart type declares a renderer` | A new chart type cannot leave it out. |
| `maps are drawn by plotly` | `choroplethMap` and `symbolMap` are `"plotly"`, written by hand. |
| `ignores a preview request for a type with no visx drawing` | Asking for visx on a type that has none returns `"plotly"`. |

New file: `tests/js/components/charts/ChartRenderer.test.js`:

| Test | What it checks |
|---|---|
| `draws PlotlyChart for a plotly result` | The existing path. |
| `draws the visx component for a visx result` | The new path. |
| `marks itself ready after drawing, for either library` | The shared `data-chart-ready` mark. |
| `shows the rendering error state when a model cannot be drawn` | A failure shows the existing "Visualization could not be loaded" message, not a blank area. |

New file: `tests/js/components/chart-builder/wizard/PreviewPane.renderer.test.js`:

| Test | What it checks |
|---|---|
| `draws every chart type with Plotly when nothing is switched` | Protects today's behavior. |
| `ignores the renderer switch in embed mode` | Embeds always show the default. |

The four existing screenshot tests must still pass unchanged after this workstream. That is the check that the new ready signal works.

---

## Workstream C - Every chart sits inside the same PPIC frame, and the settings every chart shares work

### What is wrong today

The editor lets a user set things no chart shows. The production adapter reads only three label fields:

```js
if (labels.xAxis) xaxis.title = { text: labels.xAxis };
if (labels.yAxis) yaxis.title = { text: labels.yAxis };
...(labels.title ? { title: { text: labels.title } } : {}),
```

Every other control in the table below was checked by drawing test charts of nine types with and without the setting. None of the listed controls changed any chart, except where the table says otherwise. The guide's chart parts in order are figure eyebrow, title, subtitle, key, chart, then a separate source-and-notes box. The source and notes box is not drawn anywhere, even though every observation already carries a `source` field.

The per-series controls in Advanced Mode are worse than doing nothing: they do not save. `PalettePicker.js` sends `SET_SERIES_COLOR`, `SET_LEGEND_LABEL`, and `SET_SERIES_VISIBILITY`, and the version 3 part of the editor's store (`reduceV3ChartConfig` in `components/chart-builder/chartConfigStore.js`) has no case for any of them, so it returns the settings unchanged.

### Settings every chart shares

| Control | Where | Setting | Today | Suggested | Decision |
|---|---|---|---|---|---|
| Title | Labels | `labels.title` | Works | Keep | Keep |
| X-Axis Label, Y-Axis Label | Labels | `labels.xAxis`, `labels.yAxis` | Works | Keep | Keep |
| Subtitle | Labels | `labels.subtitle` | Saved, never drawn | Build. The guide's frame has a subtitle. | Build |
| Show title, Show subtitle | Labels | `showTitle`, `showSubtitle` | Does nothing | Build | Build |
| Show X-axis label, Show Y-axis label | Labels | `showXAxisLabel`, `showYAxisLabel` | Does nothing | Build | Build |
| Legend Position | Labels and Appearance | `legendPosition` | Does nothing | Build, with "Automatic" as a new first choice where a chart supports direct labels. Show it in one section only. | Build |
| Show legend | Labels | `showLegend` | Does nothing | Remove. Legend Position already has "Hidden". | Remove |
| Footnote | Appearance | `labels.footnote` | Saved, never drawn | Build, as the notes line in the source box | Build |
| Show source and notes | Appearance, beside Footnote | `showSource` | New (owner request, September 29, 2026) | Build. Off removes the whole source-and-notes box. On when nothing is saved. | Build |
| Title, Subtitle, Axis Label, Legend Text, and Data Label sizes | Typography | `titleFontSize` and four others | Does nothing | Build. The whole Typography section is Advanced Mode only (owner, September 29, 2026). | Build |
| Decimal Places | Typography | `decimalPlaces` | Line charts only, and only with a number type or year-over-year percent | Build for every chart that shows numbers | Build |
| Vertical number type | Appearance | `verticalNumberType` | Line charts only | Build for every chart with a vertical value axis | Build |
| Horizontal number type | Appearance | `horizontalNumberType` | Does nothing | Build for charts with a horizontal value axis (horizontal bar, scatter, range) | Build |
| Horizontal and Vertical tick increment | Appearance | `horizontalTickIncrement`, `verticalTickIncrement` | Does nothing | Build. Both are Advanced Mode only (owner, September 29, 2026). | Build |
| Tooltip template | Appearance | `labels.tooltip` | Line charts only, and only with a number type | Remove. It takes Plotly's own template syntax (`%{y}`), which means nothing to visx. The new tooltips follow one standard format. | Remove |
| Per-series rename, hide, and color | Appearance, Advanced Mode | `legendLabels`, `hiddenSeries`, `seriesColors` | Not saved | Remove. The comparison label, visibility, and color controls already do this for version 3. | Remove |
| Palette | Appearance | `palette` | Works | Keep | Keep |
| Comparison label, visibility, and color | Appearance | `question.comparisons[]`, `comparisonVisibility` | Works | Keep. The whole Comparison appearance block is Advanced Mode only (owner, September 29, 2026). | Keep |

> [!note] Hide horizontal axis has the opposite problem
> The charts read `hideXAxis`, but no control writes it. The "Hide X-Axis" switch shown on range charts writes a different setting, `showValueAxis`, which nothing reads. Workstream F joins them into one setting. Decide there whether other charts should get the control too.

### Steps

1. **New file `components/charts/ChartFrame.js`.** The PPIC chart parts, written as ordinary HTML around the drawing area. From top to bottom:
   - optional eyebrow ("Figure 2")
   - title
   - subtitle
   - key (when it sits above or beside the chart)
   - the drawing area
   - key (when at the bottom)
   - the source and notes box, with the `#EFF0F2` background

   Spacing and type come from `chartStyle.js`. Each part is left out entirely, not left as an empty gap, when it has no text or its show switch is off.
2. **Sizing.** `ChartFrame` measures the width it is given and passes an exact width and height to the drawing inside. The drawing never measures itself. This keeps drawings testable in jsdom, which cannot measure anything, and keeps one owner for size.
3. **Source and notes.** Build the source line from the datasets the observations come from, in the order they first appear. Each observation's `source` is the Source filter value ("DoF P-3"), so each module schema declares `sourceCitations`, a map from that value to the full citation; a topic whose rows carry no source uses its `default` citation. `citeSources` in `lib/visualization/datasetLabels.js` does the mapping, and a value with no citation shows as it is. The footnote goes on the notes line below. The "Show source and notes" switch (`showSource`) removes the whole box. The box follows PPIC's published (Datawrapper) standard, measured from the charts on ppic.org and chosen by the owner on September 29, 2026: a `#EFF0F2` box with 15px padding, 20px below the chart (not the guide's 48px); 11px text on 16px lines in `#6C7075`; bold uppercase "SOURCE:" and "NOTES:" captions; citations separated by semicolons; and a period ending the source line. The values live in `CHART_STYLE.sourceBox` and `CHART_STYLE.text.source`.
4. **Description for screen readers.** `ChartFrame` puts the chart's written summary in a caption that screen readers read and sighted users do not see. The existing View Data table stays the full accessible version of the numbers.
5. **New file `components/charts/visx/ChartKey.js`.** The shared key: square swatches no larger than 20px, an optional key title, and right or bottom placement from `legendPosition`. It is HTML inside `ChartFrame`, not drawn in the chart, so its text wraps normally. Charts that draw lines or dashes pass a line sample instead of a square.
6. **New file `lib/visualization/models/sharedSettings.js`.** One function every chart model calls to read the settings in the table above: labels and their show switches, typography sizes with the guide sizes as fallback, key placement, number format, decimal places, and tick increments. No chart reads these settings any other way, so each one has exactly one place to change.
7. **Number formats.** Move the number format logic now inside `verticalNumberFormat` in `lib/visualization/adapters/index.js` into `sharedSettings.js`, and extend it to both axes. Format numbers with `lib/visualization/formatters.js` and the browser's built-in number formatting, as the rest of the app does. Do not add `d3-format`.
8. **Apply the Remove decisions.**
   - Delete the Show legend switch from `LabelsSection.js`.
   - Delete the Tooltip template field from `AppearanceSection.js`. Every visx chart uses the standard tooltip format from the chart recipe.
   - Delete the per-series rename, hide, and color list from `PalettePicker.js`. The palette choice stays.

   Saved views that hold these settings (`showLegend`, `labels.tooltip`, `legendLabels`, `hiddenSeries`, `seriesColors`) still open, and the settings are ignored.
9. **Legend Position in one place.** It appears in both `LabelsSection.js` and `AppearanceSection.js` today. Keep it in the Appearance section, next to the other key and layout controls, and delete it from the Labels section.
10. **Use the frame for visx charts only, for now.** Plotly charts, including maps, keep their titles inside Plotly until Workstream M. Plotly's own image export includes those titles, and moving them out before the new export exists would drop titles from exported charts.

### What this makes out of date

- [[visualization-specification]], sections "Labels, appearance, and accessibility" and "Settings reference".
- The generated settings reference. Regenerate it with `npm run generate:settings` after the decisions are applied, and do not edit it by hand.

### Tests

New file: `tests/js/components/charts/ChartFrame.test.js`:

| Test | What it checks |
|---|---|
| `shows parts in guide order` | Eyebrow, title, subtitle, chart, and source appear top to bottom. |
| `leaves out a part that is switched off` | The title is removed, not blank, when `showTitle` is false. |
| `leaves out a part with no text` | No empty subtitle row. |
| `lists each distinct source once` | Two observations with the same source give one line. |
| `shows the footnote on the notes line` | The footnote appears below the source line. |
| `gives the drawing an exact width and height` | The child receives numbers, never zero, once measured. |
| `includes a caption for screen readers` | The summary text is present and visually hidden. |
| `leaves out the whole source and notes box when Show source and notes is off` | `showSource` false removes the box and the footnote. |
| `cites the topic's dataset from its source citations` | The full citation replaces the Source filter value. |

New file: `tests/js/components/charts/visx/ChartKey.test.js`:

| Test | What it checks |
|---|---|
| `draws square swatches no larger than 20px` | The guide's key rule. |
| `places the key right, at the bottom, or hides it` | Each `legendPosition` value. |
| `draws a line sample for line series` | Line charts do not get squares. |

New file: `tests/js/lib/visualization/models/sharedSettings.test.js`. One case per Build row, plus:

| Test | What it checks |
|---|---|
| `falls back to guide sizes when none are set` | Title 20px, subtitle 18px, axis 14px. |
| `keeps sizes within the Typography section's limits` | A saved 99 is capped at the section's maximum. |
| `formats dollars, percents, and plain numbers with the chosen decimal places` | For example, 1234.5 with 0 places and dollar type gives "$1,235". |
| `leaves whole-number counts unformatted when no number type is chosen` | Today's rule for counts is kept. |
| `ignores removed and hidden settings without error` | Old saved views still open. |

For each Remove or Hide row, extend the matching section's existing test file, for example `tests/js/components/chart-builder/sections/LabelsSection.test.js`:

| Test | What it checks |
|---|---|
| `does not show <control>` | One case per removed or hidden control: Show legend, Tooltip template, the per-series list, and both row label indents. |
| `shows Legend Position in the Appearance section only` | The duplicate in the Labels section is gone. |

---

## Stage 3 - Chart by Chart

Each chart type is rebuilt on its own branch, in the order of the workstreams below. The line chart goes first, because it is the most used and it proves the approach. Charts after it can be worked on side by side.

### What every chart goes through

Each chart workstream follows the same steps. Only the details differ, and the workstream lists those details.

1. **Confirm the settings table.** Open the editor with that chart type and try every control in its table, to confirm what works and what does not. A code search can miss a setting read under a different name.
2. **Write the model.** A plain function in `lib/visualization/models/<chart>Model.js` that turns observations and settings into a description of what to draw. It calls `sharedSettings.js` for shared settings and reads chart-specific settings itself. Missing and suppressed values stay as gaps, never zero. Series colors, order, and names must match what the Plotly version shows today, so nothing changes color when the chart switches.
3. **Draw it.** A component in `components/charts/visx/` that draws the model at the exact width and height `ChartFrame` gives it. It never reads `appearance` directly.
4. **Build hover.** A tooltip showing the values under the pointer, formatted exactly as the View Data table formats them. The tooltip works with the keyboard (the chart can take focus, and arrow keys move between points), stays inside the chart's edges, and disappears when the data changes.
5. **Wire each Build setting, and apply each Remove or Hide.**
6. **Register it.** Add the chart type to the registry's list of types with a visx drawing, and to `lib/visualization/models/index.js`. Keep its default renderer as `"plotly"` until Stage 4.
7. **Review the picture.** Record its screenshot baselines only after a person has looked at them next to the style guide and agreed they are right. Record who approved them and when in the commit message.

A chart workstream is done when all of these are true:

- [ ] Every test in its Tests section passes, including its rows in `settingsCoverage.test.js` and `controlCoverage.test.js`.
- [ ] Its screenshot baselines are approved and recorded.
- [ ] Every row in its settings table has a Decision, and the chart does what the Decision says.

> [!warning] New packages need approval
> `docs/agent/AGENTS.md` lists adding dependencies under "Ask first". Install only the individual visx packages each chart needs (the line chart is expected to need `@visx/scale`, `@visx/shape`, `@visx/axis`, `@visx/grid`, and `@visx/group`), not the all-in-one `@visx/visx`. Use exact version numbers in `package.json` for reliability, and confirm with the project owner before installing each new one.

The colleague's project is a useful reference for the line chart, but copy ideas, not files. It is written in TypeScript and this project is JavaScript, and its line chart uses dashed and dotted lines that this plan makes optional. Worth reusing in spirit: the round tick and zero-baseline logic (`computeYAxisScale` in its `src/charts/chartLayout.ts`), breaking a line at missing values (`buildLineSegments`), and clamping the tooltip inside the chart.

---

## Workstream D - Line chart

### What is wrong today

The Plotly line chart (`lineFigure` in `lib/visualization/adapters/index.js`) shows markers on every point by default, uses Plotly's key, and cannot label lines directly:

```js
mode:
  rows.length === 1
    ? "markers"
    : appearance?.markerMode === "off"
      ? "lines"
      : "lines+markers",
```

The guide asks for 2px lines without markers, direct labels in the line's color where they fit, horizontal grid lines only, a zero baseline, and no dashed or dotted lines by default. It also suggests no more than three or four lines per chart.

### Line chart settings

Shared settings are in Workstream C.

| Control | Setting | Today | Suggested | Decision |
|---|---|---|---|---|
| Markers | `markerMode` | Works | Keep. Default becomes off. Advanced Mode only (September 29, 2026). | Keep |
| Line spacing (horizontal and vertical) | `horizontalLinePadding`, `verticalLinePadding` | Works, through a `PlotlyChart` resizing trick | Keep. Rebuilt (owner correction, September 29, 2026) as extra pixels between neighbouring values: Vertical between periods, Horizontal between value gridlines. The drawing grows, and scrolls sideways when wider than its space. Advanced Mode only. | Keep |
| Dragging locations to reorder (Geography) | `categoryOrder` | Does nothing | Build. Sets series order in the tooltip and key. | Build |
| Dashed range | `dashedRange` | New | Build. Advanced Mode only (September 29, 2026). | Build |

### Steps

1. **New file `lib/visualization/models/lineModel.js`.** The model holds:
   - **One series per visible comparison and geography**, in the same order and with the same ids and colors that `lineSeries` and `colorsForLineSeries` produce today. Reuse those functions, moved to a shared file if needed. Do not copy them.
   - **One point per period** with the value, status, value kind, and the formatted text for tooltips.
   - **The ordered list of periods** from the response.
   - **The dashed range**, if set (step 3).
2. **New file `lib/visualization/chartLayout/axisScale.js`.** Shared by every chart with a value axis. Given the lowest and highest values, it returns the axis range and tick values:
   - Round steps (1, 2, 2.5, or 5 times a power of ten), unless a tick increment is set.
   - The axis starts at zero unless the values go below zero, or the calculation is `indexed`.
   - Four to six ticks.

   Given a width, it also returns how many period labels fit on the horizontal axis without overlapping, at about one label per 70px. `periodTicks` then picks which periods to label: always the latest period, then back from it in one even step (every 1, 2, 5, 10, 20, ... years), the smallest step that fits and no finer than the data's own spacing; a saved tick increment sets the step. For 1991 to 2026 that reads 1991, 1996, ..., 2021, 2026. Counting back from the latest period keeps the gaps equal and never drops the most recent year (owner, September 29, 2026); forcing both ends onto a forward count had made uneven gaps (1991, 1997, ..., 2015, 2026). The plot keeps half the widest year label clear at each edge so an end label is never clipped.
3. **New file `lib/visualization/chartLayout/dashedRange.js`.** Given the ordered periods and the saved dashed range (`{ from, to, label }`), decides for each segment between two points whether it is dashed. A segment is dashed when both of its ends fall inside the range. Periods are compared by their position in the response's ordered list, never by comparing their text, because period labels are not always numbers.
4. **New file `lib/visualization/chartLayout/directLabels.js`.** Given each series' last available point, its label text, its color, the chart height, and the text size, decides where each end label goes:
   - Start at the height of each line's last point.
   - Push overlapping labels apart, keeping their order.
   - Report "does not fit" when the labels cannot all fit inside the chart height, or when there are more than four series.
   - Report the label text color: the series color when it reaches 4.5 to 1 contrast against white, otherwise the same hue darkened until it does (`readableTextColor` in `lib/visualization/chartLayout/contrast.js`).
5. **New file `components/charts/visx/LineChart.js`.** Draws:
   - Horizontal grid lines only, and 1px axis lines in the axis color.
   - 2px lines, breaking at gaps.
   - Dashed segments where step 3 says so.
   - Markers only when Markers is on, or when a series has a single point (a one-point line is otherwise invisible).
   - Direct labels when step 4 says they fit and the key setting allows them, otherwise the shared key. When a dashed range is on, the key shows a dashed sample with the range's label, for example "Projected".
6. **Hover.** Matches the hover label on PPIC's published Datawrapper charts (owner decision, September 29, 2026). A single invisible layer over the chart finds the one data point nearest the pointer, measuring both across and up and down, so moving the pointer up or down at the same period switches lines. That point gets a gray ring, joined by a short tick to a label with no box: the series name in bold in its (readable) line color, then the period and the value in gray, with a white outline so other lines never strike through it. The label sits above the point, reads leftward on the right half of the chart, and drops below the point near the top. Values use the View Data table's format. Keyboard use is kept: Left and Right move along the current line, Up and Down move to the line above or below, Home and End jump to the line's ends, and Escape closes the label.
7. **Leave room for zoom.** Compute the horizontal and vertical ranges in one place in `LineChart.js`, called the visible range. Every scale reads the visible range, so adding zoom later means changing that one value. Do not build any zoom or pan controls now.
8. **New Dashed range control** in `components/chart-builder/sections/AppearanceSection.js`, shown only for line charts:
   - A switch labeled "Dashed lines for a range of periods", off by default.
   - When on, a start period and end period picker filled from the response's ordered periods, and a short label field that defaults to "Projected".
   - When the data contains projected values (`valueKind` of `projected`), a "Use projected periods" button fills the start and end from those values.

   It is saved as `appearance.dashedRange` inside `presentation.appearance`. Register it in `lib/visualization/settingsRegistry.js`. A saved view with no `dashedRange` draws no dashes.
9. **Markers default.** In `AppearanceSection.js`, the Markers switch is currently on when `markerMode` is not saved (`checked={appearance.markerMode !== "off"}`). Change it to be off when nothing is saved, to match the new chart default.

### What this makes out of date

- [[visualization-specification]], section "Chart catalog": the line chart's description (markers, key, direct labels, dashed range).

### Tests

New file: `tests/js/lib/visualization/models/lineModel.test.js`:

| Test | What it checks |
|---|---|
| `gives each series the same color the Plotly line chart gives it` | Compare with `adaptObservations` output for the same fixture. |
| `keeps series order and names from the Plotly line chart` | Same comparison. |
| `keeps missing and suppressed values as gaps, not zero` | Honest charts. |
| `leaves hidden comparisons out` | `comparisonVisibility` false removes the series. |
| `orders series by the dragged location order` | Dragging locations reorders the tooltip and key. |
| `reads the dashed range from appearance` | `dashedRange` reaches the model. |
| `uses direct labels when legendPosition is missing or automatic` | The new default. |

New file: `tests/js/lib/visualization/chartLayout/axisScale.test.js`:

| Test | What it checks |
|---|---|
| `starts at zero for positive values` | The guide default. |
| `includes zero and the lowest value when values go negative` | Year-over-year change can be negative. |
| `does not force zero for the indexed calculation` | The stated exception. |
| `uses round steps` | For example, 0 to 40 in steps of 10, not 0 to 37.5. |
| `uses the tick increment when one is set` | A step of 5 gives 0, 5, 10, and so on. |
| `handles one value and all-equal values` | No zero-height axis and no crash. |
| `fits fewer period labels at narrow widths` | 330px gives fewer labels than 950px. |

New file: `tests/js/lib/visualization/chartLayout/dashedRange.test.js`:

| Test | What it checks |
|---|---|
| `draws nothing dashed when no range is set` | The default. |
| `dashes segments whose ends are both inside the range` | The basic rule. |
| `leaves the segment into the range solid` | The segment from 2025 to 2026 stays solid when the range starts at 2026. |
| `compares periods by order, not text` | Periods such as "2019-20" and "2020-21" work. |
| `ignores a range whose periods are not in the data` | No crash and no dashes. |

New file: `tests/js/lib/visualization/chartLayout/directLabels.test.js`:

| Test | What it checks |
|---|---|
| `places each label at its line's last point when nothing overlaps` | The simple case. |
| `pushes overlapping labels apart without swapping them` | The order is kept. |
| `reports does-not-fit with more than four series` | The guide's line limit. |
| `reports does-not-fit when labels cannot fit the height` | Falls back to the key. |
| `keeps a series color that already reaches 4.5 to 1 contrast` | A dark official color is used as it is. |
| `darkens a pale series color just enough to reach 4.5 to 1 contrast` | At least 4.5 to 1, below 5 to 1, and the same hue. |
| `uses the last available point, skipping a trailing gap` | A line ending in a missing value is still labeled. |

New file: `tests/js/components/charts/visx/LineChart.test.js`. Pass a fixed width and height, because jsdom cannot measure.

| Test | What it checks |
|---|---|
| `draws one line per series` | Count of line paths. |
| `draws no markers by default` | The guide default. |
| `draws markers when Markers is on` | The switch still works. |
| `draws a marker for a one-point series` | A single point is never invisible. |
| `draws no vertical grid lines` | The guide rule. |
| `draws no dashed segments by default` | The decision. |
| `labels only the point nearest the pointer on hover` | One series' name, period, and value, and no other series. |
| `picks the line nearest the pointer vertically` | The same period, higher up, labels the upper line. |
| `rings the labeled point with no box around the label` | The PPIC look. |
| `moves the tooltip with the arrow keys` | Keyboard use. |
| `moves between lines with the up and down arrow keys` | Keyboard use across lines. |
| `clears the tooltip when the data changes` | No stale values. |

New file: `tests/js/components/chart-builder/sections/AppearanceSection.dashedRange.test.js`:

| Test | What it checks |
|---|---|
| `shows the dashed range control only for line charts` | Not for bar or map. |
| `offers only periods that are in the data` | The pickers are filled from the response. |
| `fills the range from projected periods` | The shortcut button. |
| `shows Markers off when nothing is saved` | The new default. If an existing test in `AppearanceSection.test.js` asserts the switch starts on, update it and say why in the commit. |
| `offers Automatic as the first legend position for line charts` | The new option. |

Screenshot cases in `tests/visual/visualization-v3.spec.js`:

| Test | What it checks |
|---|---|
| `matches the approved Line comparison layout` | Existing test. Its new baseline is recorded after review. |
| `labels two lines directly` | Direct labels in position. |
| `falls back to the key with five lines` | The fallback. |
| `draws the chosen range dashed` | The dashed range. |
| `shows the full PPIC frame` | Eyebrow, title, subtitle, and source box. |
| `fits the line chart at 330px` | The guide's smallest width, where labels crowd first. |

---

## Workstream E - Bar chart

### What is wrong today

Only the shared controls, palette, and line spacing reach the bar chart. Every bar-only control does nothing, including the whole diverging bar group. There is also no longer a control to turn diverging bars on or to change orientation. The version 3 Outcome section (`V3Outcome` in `OutcomeSection.js`) does not include the Orientation and Diverging switches the older editor had. The diverging controls only appear when a saved or built-in view already has `diverging` set, for example in the RHNA topic's schema, and the adapter ignores `diverging` and `orientation` too. Stacking (`stackMode`) is read by the adapter but has no control.

Guide rules that matter most: the value axis starts at zero, horizontal bars have right-aligned category labels centered on each bar, bars are at least 10px wide, a stacked series is shaded dark to light, and there are no vertical grid lines.

### Bar chart settings

| Control | Setting | Today | Suggested | Decision |
|---|---|---|---|---|
| Orientation (no control in version 3) | `orientation` | Ignored | Build, and bring back the control. The guide recommends horizontal bars for long labels. | Build |
| Stacking (no control) | `stackMode` | Read, no control | Build a control. The guide covers stacked columns. | Build |
| Space between groups | `groupGap` | Does nothing | Build | Build |
| Dragging locations to reorder (Geography) | `categoryOrder` | Does nothing | Build. Sets bar order. | Build |
| Diverging bars (no control in version 3) | `diverging` | Ignored | Decide as one feature with the seven rows below. Build all of them, bringing the switch back, or Remove all of them. | Build |
| Center reference | `center` | Does nothing | Follows the diverging decision | Build |
| Reference line | `referenceValue` | Does nothing | Follows the diverging decision | Build |
| Reference line label | `referenceLabel` | Does nothing | Follows the diverging decision | Build |
| Value axis range (manual) | `valueRange` | Does nothing | Follows the diverging decision | Build |
| Track rail | `trackRail` | Does nothing | Follows the diverging decision | Build |
| Minimal axis | `minimalAxis` | Does nothing | Follows the diverging decision | Build |
| Threshold colors | `colorBuckets` | Does nothing | Follows the diverging decision | Build |

### Steps

Follow [What every chart goes through](#what-every-chart-goes-through). Chart-specific points:

1. **Model** in `lib/visualization/models/barModel.js`, using `axisScale.js` for the value axis. Bars grouped by comparison keep today's grouping and colors from `barFigure`.
2. **Drawing** in `components/charts/visx/BarChart.js`. Enforce the 10px minimum bar width by reducing the gap between bars first. When even that is not enough, show a notice asking the reader to show fewer categories, rather than drawing bars thinner than the guide allows.
3. **Hover** shows the category, comparison, and value of the bar under the pointer.
4. **Orientation.** Horizontal bars put right-aligned category labels to the left of each bar, centered on it.
5. **Diverging bars.** Bars grow left and right (or up and down) from the center value, with the reference line and its label drawn across the chart. Build all seven diverging settings: center, reference line and label, manual value axis range, track rail, minimal axis, and threshold colors.
6. **Bring back three controls** in `AppearanceSection.js`, shown only for bar charts: an Orientation choice (vertical or horizontal, saved as `orientation`), a Diverging bars switch (`diverging`), and a Stacking choice (side by side or stacked, saved as `stackMode`). The seven diverging controls keep appearing only when Diverging bars is on, as they do today. Views that already set `diverging`, such as the RHNA topic's built-in views, keep their setting.

### Tests

New files: `tests/js/lib/visualization/models/barModel.test.js` and `tests/js/components/charts/visx/BarChart.test.js`.

| Test | What it checks |
|---|---|
| `gives each comparison the same color the Plotly bar chart gives it` | No color change on switching. |
| `starts the value axis at zero` | The guide rule. |
| `keeps missing values as gaps, not zero-height bars` | Honest charts. |
| `never draws a bar narrower than 10px` | The guide rule. |
| `draws no vertical grid lines` | The guide rule. |
| `orders bars by the dragged location order` | Dragging locations reorders the bars. |
| `draws horizontal bars with right-aligned labels` | The guide's horizontal bar rule. |
| `stacks series dark to light` | The guide's stacked column rule. |
| `draws bars from the center value` | Diverging bars grow from `center`. |
| `draws the reference line and its label` | `referenceValue` and `referenceLabel`, including a reference value of 0, because 0 is a real setting. |
| `uses the manual value axis range` | `valueRange`. |
| `draws the track rail behind each bar` | `trackRail`. |
| `draws the minimal axis` | `minimalAxis`. |
| `colors bars by threshold` | `colorBuckets`. |
| `shows the bar's value on hover` | Hover. |

New file: `tests/js/components/chart-builder/sections/AppearanceSection.bar.test.js`:

| Test | What it checks |
|---|---|
| `shows Orientation, Diverging bars, and Stacking only for bar charts` | The restored controls. |
| `shows the seven diverging controls only when Diverging bars is on` | Today's gating is kept. |
| `keeps diverging on for a view that already set it` | RHNA's built-in views are unchanged. |

Screenshot cases: `matches the approved Bar comparison layout` (existing test, new baseline after review), `fits eight comparisons without overlapping labels`, and one case each for horizontal, stacked, and diverging bars if they are Build.

---

## Workstream F - Range chart (dumbbell)

### What is wrong today

Every range-only control does nothing. The "Hide X-Axis" switch (Advanced Mode) writes `showValueAxis`, which nothing reads, while the charts read a different setting, `hideXAxis`, which no control writes.

This workstream also builds the row label helper that the dot plot (G) and forest plot (H) reuse, because all three draw one row per category with a label at the left.

### Range chart settings

| Control | Setting | Today | Suggested | Decision |
|---|---|---|---|---|
| Group row label alignment | `groupLabelAlignment` | Does nothing | Build, defaulting to right-aligned as the guide shows for horizontal bars | Build |
| Variable row label alignment | `variableLabelAlignment` | Does nothing | Build, same default | Build |
| Group row label indent | `groupLabelIndent` | Does nothing | Hide. Alignment covers the common need. | Hide |
| Variable row label indent | `variableLabelIndent` | Does nothing | Hide | Hide |
| Hide X-Axis (Advanced Mode) | `showValueAxis` | Does nothing | Build, as one setting (`hideXAxis`) shared by every chart that has the control | Build |
| Show point values | `showPointLabels` | Does nothing | Build. The guide favors labeling data directly. | Build |
| First line only | `pointLabelsFirstLineOnly` | Does nothing | Build if Show point values is Build, otherwise Remove | Build |

### Steps

Follow [What every chart goes through](#what-every-chart-goes-through). Chart-specific points:

1. **New file `lib/visualization/chartLayout/rowLabels.js`**, shared with G and H. Given category labels, the text size, and the alignment setting, it returns the label column width and each label's position. Long labels wrap onto a second line rather than being cut off.
2. **Model** in `lib/visualization/models/rangeModel.js`, and **drawing** in `components/charts/visx/RangeChart.js`. The connector always runs from the start value to the end value, so a chart drawn from swapped endpoints is caught by a test, not only by a picture.
3. **Hide X-Axis.** If Build, the switch writes `hideXAxis`. When a saved view holds `showValueAxis: false`, treat it as `hideXAxis: true` when the view opens, so old views keep what their authors chose.

### Tests

New files: `tests/js/lib/visualization/chartLayout/rowLabels.test.js`, `tests/js/lib/visualization/models/rangeModel.test.js`, and `tests/js/components/charts/visx/RangeChart.test.js`.

| Test | What it checks |
|---|---|
| `right-aligns row labels by default` | The guide default. |
| `wraps a long row label instead of cutting it off` | Readability. |
| `draws the connector from the start value to the end value` | Direction is right. |
| `keeps a row with one missing endpoint, without a connector` | Honest charts. |
| `opens an old view with showValueAxis false as hideXAxis true` | Old views keep what their authors chose. |
| `shows each endpoint's value when Show point values is on` | `showPointLabels`. |
| `shows only the first line of a two-line value label` | `pointLabelsFirstLineOnly`. |

Screenshot cases: `matches the approved Range layout` (existing test, new baseline after review) and `wraps long row labels`.

---

## Workstream G - Dot plot

### What is wrong today

Every dot-plot-only control does nothing. It shows the same row label, Hide X-Axis, and Show point values controls as the range chart, plus a per-series choice of which series get value labels. Marker size (`markerSize`) is read by the adapter but has no control.

### Dot plot settings

| Control | Setting | Today | Suggested | Decision |
|---|---|---|---|---|
| Row label alignment | Two settings, as in F | Does nothing | Same decision as F | Build |
| Row label indent | Two settings, as in F | Does nothing | Same decision as F | Hide |
| Hide X-Axis (Advanced Mode) | `showValueAxis` | Does nothing | Same decision as F | Build |
| Show point values | `showPointLabels` | Does nothing | Same decision as F | Build |
| Point labels per series | `pointLabelSeries` | Does nothing | Build if Show point values is Build, otherwise Remove | Build |
| Marker size (no control) | `markerSize` | Read, no control | Leave without a control. Use one standard dot size from `chartStyle.js`. | Build |

### Steps

Follow [What every chart goes through](#what-every-chart-goes-through), reusing `rowLabels.js` from F. Model in `lib/visualization/models/dotPlotModel.js`, drawing in `components/charts/visx/DotPlot.js`. When two dots in a row overlap, draw the later one with a white outline so both stay visible.

Add a Marker size control to `AppearanceSection.js`, shown only for dot plots and saved as `markerSize`. Use a slider with a small set of sizes, and default to the standard dot size in `chartStyle.js` when nothing is saved.

### Tests

New files: `tests/js/lib/visualization/models/dotPlotModel.test.js` and `tests/js/components/charts/visx/DotPlot.test.js`.

| Test | What it checks |
|---|---|
| `gives each series the same color the Plotly dot plot gives it` | No color change on switching. |
| `keeps missing values as gaps` | Honest charts. |
| `labels only the chosen series` | `pointLabelSeries`. |
| `keeps overlapping dots visible` | The outline rule. |
| `draws dots at the chosen marker size` | `markerSize`. |
| `uses the standard dot size when none is saved` | The default from `chartStyle.js`. |
| `shows Marker size only for dot plots` | The new control, in `tests/js/components/chart-builder/sections/AppearanceSection.dotPlot.test.js`. |

Screenshot case: `matches the approved Dot plot layout` (new).

---

## Workstream H - Forest plot

### What is wrong today

Every forest-only control does nothing. It shows the same row label, Hide X-Axis, and Show point values controls as the range chart, plus four of its own.

### Forest plot settings

| Control | Setting | Today | Suggested | Decision |
|---|---|---|---|---|
| Row label alignment | Two settings, as in F | Does nothing | Same decision as F | Build |
| Row label indent | Two settings, as in F | Does nothing | Same decision as F | Hide |
| Hide X-Axis (Advanced Mode) | `showValueAxis` | Does nothing | Same decision as F | Build |
| Show point values | `showPointLabels` | Does nothing | Same decision as F | Build |
| Interval ends | `endpointStyle` | Does nothing | Build | Build |
| Estimate marker | `pointStyle` | Does nothing | Build | Build |
| Line of no effect | `noEffectValue` | Does nothing | Build. It is the forest plot's main reference line. | Build |
| Value axis center | `center` | Does nothing | Build | Build |

### Steps

Follow [What every chart goes through](#what-every-chart-goes-through), reusing `rowLabels.js` from F. Model in `lib/visualization/models/forestModel.js`, drawing in `components/charts/visx/ForestPlot.js`. Every estimate marker is drawn at one size; the registry already says the renderer ignores weighting, and that stays true.

### Tests

New files: `tests/js/lib/visualization/models/forestModel.test.js` and `tests/js/components/charts/visx/ForestPlot.test.js`.

| Test | What it checks |
|---|---|
| `draws every estimate marker at one size` | The existing rule. |
| `draws the line of no effect at the chosen value` | Include cases for 0 and for no value set, because 0 is a real setting. |
| `centers the value axis on the chosen value` | `center`. |
| `draws the chosen interval end style` | One case per style. |
| `draws the chosen estimate marker` | One case per marker. |

Screenshot case: `matches the approved Forest layout` (new).

---

## Workstream I - Heatmap

### What is wrong today

The heatmap's color controls mostly work: palette, color scale (sequential or diverging), and custom diverging colors all reach it. Invert color scale does nothing, because `rampFor` in `lib/visualization/palettes.js` never reads `invertScale`. The Categories panel's reorder and show/hide controls do nothing. Cell values (`showCellValues`) are read only by `toPlotly.js` and have no control.

### Heatmap settings

| Control | Setting | Today | Suggested | Decision |
|---|---|---|---|---|
| Palette, Color scale, Custom diverging colors | `palette`, `colorScale`, `divergingStops` | Works | Keep | Keep |
| Invert color scale | `invertScale` | Does nothing | Build | Build |
| Categories panel: reorder | `categoryOrder` | Does nothing | Build | Build |
| Categories panel: show or hide | `hiddenCategories` | Does nothing | Build | Build |
| Cell values (no control) | `showCellValues` | No control | Owner to decide whether to add one | Build |

> [!note] Check that the Categories panel appears at all
> In version 3, `CategoriesSection.js` reads `config.appearance`, which version 3 does not have (its settings live in `presentation.appearance`). So the panel may show an empty list. Confirm this in the editor during step 1 of the chart recipe, and fix it to read `presentation.appearance`. The pie chart (K) shares this fix.

### Steps

Follow [What every chart goes through](#what-every-chart-goes-through). Model in `lib/visualization/models/heatmapModel.js`, drawing in `components/charts/visx/Heatmap.js`. The color scale key is drawn in the shared `ChartKey` as a labeled bar. `rampFor` gains support for `invertScale`, which also fixes it for maps (Workstream L).

Add a Show cell values switch to `AppearanceSection.js`, shown only for heatmaps, saved as `showCellValues`, and off by default. When on, each cell shows its value in the shared number format, in dark or white text, whichever contrasts more with the cell color.

### Tests

New files: `tests/js/lib/visualization/models/heatmapModel.test.js` and `tests/js/components/charts/visx/Heatmap.test.js`.

| Test | What it checks |
|---|---|
| `uses the same color scale the Plotly heatmap uses` | No color change on switching. |
| `draws a missing cell as empty, not the lowest color` | Honest charts. |
| `reverses the scale when Invert is on` | `invertScale`. |
| `orders and hides categories as chosen` | `categoryOrder` and `hiddenCategories`. |
| `shows no cell values by default` | `showCellValues` is off. |
| `shows each cell's value in the readable text color when on` | Dark text on light cells, white on dark. |
| `shows the Categories panel's list for a version 3 view` | The `presentation.appearance` read fix. |
| `shows Show cell values only for heatmaps` | The new control, in `tests/js/components/chart-builder/sections/AppearanceSection.heatmap.test.js`. |

Screenshot case: `matches the approved Heatmap tab layout` (existing test, new baseline after review).

---

## Workstream J - Scatter and bubble charts

### What is wrong today

Scatter and bubble charts have no controls of their own, so they are affected only by the shared settings in Workstream C. Bubble sizing by area (`sizeByArea`) is read only by `toPlotly.js`.

### Scatter and bubble settings

| Control | Setting | Today | Suggested | Decision |
|---|---|---|---|---|
| Bubble size by area (no control) | `sizeByArea` | No control | Always size bubbles by area, with no control. Sizing by width makes large values look much bigger than they are. | Build |

### Steps

Follow [What every chart goes through](#what-every-chart-goes-through). One model file, `lib/visualization/models/pointModel.js`, serves both, as `pointFigure` does today. Drawing in `components/charts/visx/PointChart.js`. Both axes use `axisScale.js`. Scatter charts are the one place where the zero baseline may not suit both axes; follow the guide's zero default on the vertical axis and let the horizontal axis fit the data. Bubbles are always sized by area, with no control, and the unused `sizeByArea` setting is ignored.

### Tests

New files: `tests/js/lib/visualization/models/pointModel.test.js` and `tests/js/components/charts/visx/PointChart.test.js`.

| Test | What it checks |
|---|---|
| `gives each comparison the same color the Plotly chart gives it` | No color change on switching. |
| `sizes bubbles by area` | A value four times larger gives a bubble with twice the radius. |
| `leaves out points with a missing value on either axis` | Honest charts. |

Screenshot cases: `matches the approved Scatter layout` and `matches the approved Bubble layout` (both new).

---

## Workstream K - Pie chart

### What is wrong today

The Categories panel's reorder and show/hide controls do nothing (see the Categories panel note in Workstream I). The donut hole size (`hole`) is read by the adapter but has no control. Slice value labels (`showValueLabels`) are read only by `toPlotly.js`.

The guide says pie charts work best with fewer than four or five slices, and that each slice should be labeled directly, with a thin leader line when the label is long.

### Pie chart settings

| Control | Setting | Today | Suggested | Decision |
|---|---|---|---|---|
| Categories panel: reorder | `categoryOrder` | Does nothing | Build | Build |
| Categories panel: show or hide | `hiddenCategories` | Does nothing | Build | Build |
| Donut hole (no control) | `hole` | Read, no control | Owner to decide: pie only, donut only, or a control | Build |
| Slice value labels (no control) | `showValueLabels` | No control | Always label slices directly, as the guide asks, with no control | Build |

### Steps

Follow [What every chart goes through](#what-every-chart-goes-through). Model in `lib/visualization/models/pieModel.js`, drawing in `components/charts/visx/PieChart.js`, using the pie layout from `@visx/shape` (already requested for the line chart). Every slice is labeled directly, with no control, and the unused `showValueLabels` setting is ignored. Labels sit outside each slice, joined by a 1px leader line when a label is too long to sit beside its slice.

Add a Donut hole control to `AppearanceSection.js`, shown only for pie charts and saved as `hole`. It is a slider from 0 (a full pie) to 0.6, defaulting to 0, which matches how the adapter reads `hole` today, so existing views look the same.

### Tests

New files: `tests/js/lib/visualization/models/pieModel.test.js` and `tests/js/components/charts/visx/PieChart.test.js`.

| Test | What it checks |
|---|---|
| `gives each slice the same color the Plotly pie gives it` | No color change on switching. |
| `labels every slice` | The guide rule. |
| `leaves out a missing slice rather than drawing it as zero` | Honest charts. |
| `orders and hides slices as chosen` | `categoryOrder` and `hiddenCategories`. |
| `draws a full pie when no hole is saved` | Existing views look the same. |
| `draws a donut at the chosen hole size` | `hole`, including 0 as a real setting. |
| `shows Donut hole only for pie charts` | The new control, in `tests/js/components/chart-builder/sections/AppearanceSection.pie.test.js`. |

Screenshot cases: `matches the approved Pie layout` and `labels a slice with a leader line` (both new).

---

## Workstream L - Maps (still drawn by Plotly)

### What is wrong today

Maps stay on Plotly by decision, but they still have broken controls. Their color controls mostly work: palette, color scale, and custom diverging colors reach both maps through `rampFor`. Invert color scale does nothing (see Workstream I). The symbol map's Color gradient switch (`symbolGradient`) changes which palettes the editor offers, but `symbolMapFigure` never reads it, so the map itself does not change. The shared settings in Workstream C are also ignored by both maps.

### Map settings

| Control | Setting | Today | Suggested | Decision |
|---|---|---|---|---|
| Palette, Color scale, Custom diverging colors | `palette`, `colorScale`, `divergingStops` | Works | Keep | Keep |
| Invert color scale | `invertScale` | Does nothing | Same decision as the heatmap (I) | Build |
| Color gradient (symbol map) | `symbolGradient` | Does nothing on the map | Build | Build |

### Steps

1. **Apply the PPIC style** from `chartStyle.js` through `plotlyDefaults.js` (Workstream A) in `mapFigure` and `symbolMapFigure`.
2. **Shared settings.** Apply the Workstream C settings that make sense on a map (key position, key text size, number format, and decimal places in the color scale key and hover) inside the Plotly layout. Title, subtitle, and source move into `ChartFrame` in Workstream M, not here.
3. **Wire the map settings** marked Build. The guide asks for the brand orange sequential ramp by default for choropleth maps; confirm the default palette matches.

### Tests

New file: `tests/js/lib/visualization/adapters/maps.test.js`. Map adapters need map shapes, so use a small fixed geometry with two counties.

| Test | What it checks |
|---|---|
| `uses Inter and the guide's colors` | Style reaches the maps. |
| `defaults to the orange sequential ramp` | The guide's default. |
| `reverses the ramp when Invert is on` | `invertScale`. |
| `colors symbols by value when Color gradient is on` | `symbolGradient`. |
| `formats the color scale key with the chosen decimal places` | Shared settings reach maps. |

Screenshot cases: `matches the approved Choropleth layout` and `matches the approved Symbol map layout` (both new).

---

## Stage 4 - Export

---

## Workstream M - Export works from the picture the chart already draws

### What is wrong today

Export only knows how to ask Plotly for an image. `lib/export/exportImage.js` calls `globalThis.Plotly.toImage(graphDiv, options)` with Plotly's own page element, which `PlotlyChart` hands up through `onGraphDiv`. A visx chart has no such element, so export would fail for it.

### Steps

1. **New file `lib/export/exportSvgChart.js`.** Builds one self-contained SVG image of the whole chart, frame included, from what is on screen:
   - Copy the chart's SVG, and draw the frame's text parts (eyebrow, title, subtitle, key, source box) into the same SVG at the same positions, using `chartStyle.js` sizes. Do not use `foreignObject`, which some PDF and image tools drop.
   - Write every style into the SVG itself, not as class names, because a saved file has no access to the page's CSS.
   - Embed the Inter font inside the SVG, so the image looks the same on a computer without Inter. Inter is freely licensed (SIL Open Font License). Keep a copy of the weights the charts use in `public/fonts/`, so export does not depend on the file names Next.js generates.
2. **Formats.** Save the SVG directly. For PNG and JPG, draw the SVG onto a canvas at the chosen quality scale and save that, reusing the existing `IMAGE_QUALITIES`. For PDF, pass the SVG to the existing `jsPDF` plus `svg2pdf.js` path. Every failure returns the existing named `EXPORT_*` errors, so the export menu's error messages still work.
3. **Sizes.** Offer the guide's widths (950px, 650px, 330px) as export size choices, drawn at that exact width rather than scaled from the screen.
4. **`lib/export/exportImage.js`.** Pick the path by renderer. Visx charts use `exportSvgChart.js`, and maps keep today's `Plotly.toImage` path. The workspace export that combines several charts must accept a mix of both.
5. **Maps join the frame.** Move map titles, subtitles, and sources out of Plotly and into `ChartFrame`. Map export then places Plotly's SVG output for the map inside the same frame SVG. After this, every chart has the same frame on screen and in files.
6. **Switch the defaults, one chart type at a time.** When a chart type's export tests pass and a person has checked one exported file of each format, change that type's default renderer in `chartRegistry.js` to `"visx"`. Keep its Plotly drawing code, reachable with `renderer=plotly`, until Workstream O, so the two can be compared if a problem is reported.

### What this makes out of date

- [[visualization-specification]], section "Export": the two export paths and the standard widths.
- The header comment of `lib/export/exportImage.js`, which says all export goes through `Plotly.toImage`.

### Tests

New file: `tests/js/lib/export/exportSvgChart.test.js`:

| Test | What it checks |
|---|---|
| `includes the title, subtitle, and source in the exported SVG` | The frame is not lost. |
| `writes styles into the SVG instead of class names` | No dependence on page CSS. |
| `embeds the Inter font` | The file contains an `@font-face` for Inter. |
| `draws at the chosen standard width` | 650 gives a 650px-wide image. |
| `exports every visx chart type` | One case per chart type, from a hand-written list. |
| `fails with a named export error when the chart is missing` | The existing error codes. |

New file: `tests/js/lib/export/exportImage.renderer.test.js`:

| Test | What it checks |
|---|---|
| `uses the SVG path for a visx chart` | Choice by renderer. |
| `still uses Plotly.toImage for a map` | Maps keep their path. |
| `includes the frame around an exported map` | Maps join the frame. |
| `combines a visx chart and a map in one workspace export` | Mixed workspaces. |

New file: `tests/js/components/chart-builder/ExportMenu.sizes.test.js`:

| Test | What it checks |
|---|---|
| `offers the three standard widths` | The new size choices. |

Extend `tests/js/lib/visualization/chartRegistry.catalog.test.js` at the end of this stage:

| Test | What it checks |
|---|---|
| `every non-map chart type defaults to visx` | Written as a hand-typed list. |

---

## Stage 5 - Other Externalities

---

## Workstream N - Embeds, saved views, shared links, and click-through tests keep working

### What is wrong today

Nothing is broken yet, but everything outside the chart depends on it. The embed opens the same page in embed mode (`?embed=1`) and draws whatever the editor draws, so it follows the renderer choice automatically; it needs checks, not a rebuild. Saved views and shared links store settings that this plan renames, removes, or hides. The eight click-through tests in the screenshot spec exercise the editor as a whole.

### Steps

1. **Embeds.** Confirm that embed mode draws every chart with its frame and no editor controls. Confirm that the `embedHeight` bands in `components/chart-builder/ExportMenu.js` still fit the taller frame (the source box adds height), and that the embed preview dialog shows the same picture. Make sure no `renderer=` value can leak into a copied embed link.
2. **Saved views and shared links.** Open a saved view from before this plan for every chart type and check it opens without an error. Removed settings are ignored, hidden settings are kept, and `showValueAxis` becomes `hideXAxis` (Workstream F).
3. **Click-through tests.** Run the eight full-flow tests in `tests/visual/visualization-v3.spec.js`. Change any step that relies on something Plotly draws (for example a Plotly class name) to check visible text or roles instead.
4. **Accessibility check.** Check every chart type with a screen reader and with the keyboard alone: the caption is read, the tooltip can be reached with the arrow keys, and focus is visible.

### Tests

New file: `tests/js/components/chart-builder/savedViews.renderer.test.js`:

| Test | What it checks |
|---|---|
| `opens a view saved before this plan for every chart type` | One case per chart type, from a hand-written list of saved configurations. |
| `ignores removed settings in an old view` | No error, no effect. |
| `keeps hidden settings through save and reopen` | Hidden means kept. |
| `opens a view with showValueAxis false as hideXAxis true` | The renamed setting. |
| `keeps dashedRange through save and reopen` | The new setting survives. |

New file: `tests/js/components/chart-builder/ExportMenu.embed.test.js`:

| Test | What it checks |
|---|---|
| `embed code never includes a renderer value` | Shared embeds always use the default. |
| `embed height fits a chart with a source box` | The taller frame is not cut off. |

---

## Workstream O - Plotly is loaded only for maps, and the old code and documents are cleaned up

### What is wrong today

Once every non-map chart draws through visx by default, a lot of Plotly-only code will be left behind:

- **Plotly drawing code for non-map charts** in `adapters/index.js`.
- **`toPlotly.js`**, 2,449 lines used only by the UI Kit examples.
- **Two orphaned line chart files.** Nothing imports `components/charts/ComponentsOfChangeLineSection.js` or `components/charts/PopHousingLineSection.js`.
- **Two unused dependencies.** `recharts` is installed but nothing imports it, and Plotly's full bundle (4.6 MB minified) is loaded for charts that no longer use it.
- **The raw Plotly pass-through.** `layoutFor` merges `appearance.layout` straight into Plotly. Nothing in the editor writes it, only the screenshot test page, and a visx chart cannot honor it.

### Steps

> [!warning] Deleting files and removing dependencies need approval
> Both are "Ask first" actions in `docs/agent/AGENTS.md`. Confirm each removal with the project owner. Move deleted files to `.trash/` following the project's existing quarantine practice, not straight out of the repository.

1. **UI Kit.** Change `components/ui-kit/GraphsShowcase.js` and `CardsShowcase.js` to draw their examples with the real renderers, so the UI Kit shows exactly what users get. Then retire `toPlotly.js`. Move `fitFootnoteLayout`, which `PlotlyChart.js` imports from it, next to `PlotlyChart` if maps still need it.
2. **Adapters.** Remove the Plotly adapters for chart types that are now visx, keeping only the two map adapters. Remove the `appearance.layout` pass-through, and change the screenshot test page to stop sending it.
3. **Orphans.** Remove `ComponentsOfChangeLineSection.js` and `PopHousingLineSection.js` after confirming nothing imports them.
4. **Dependencies.** Remove `recharts`. Make sure `react-plotly.js` is loaded only on pages that draw a map. It is already loaded on demand through `next/dynamic`, so check that nothing else imports Plotly directly.
5. **Project documents.** Update `docs/agent/frontend-skill.md` "Chart Component Conventions", which describes Plotly as the chart library for everything, and the tech stack line in `docs/agent/AGENTS.md`. Mark this plan's Status as `Finalized` once every workstream is done.

### What this makes out of date

- `docs/agent/frontend-skill.md`, section "Chart Component Conventions".
- `docs/agent/AGENTS.md`, section "Tech stack".
- [[visualization-specification]], sections "Ownership map" and "Interface components and migration notes".
- [[projectSpec]], wherever it says Plotly draws all charts.

### Tests

Extend `tests/js/architecture/visualizationV3Cutover.test.js`:

| Test | What it checks |
|---|---|
| `only map chart types use the plotly renderer` | Every non-map type is `"visx"`. Write the list by hand. |
| `no component outside the map path imports react-plotly.js` | Plotly stays confined to maps. |
| `recharts is not a dependency` | The unused package is gone. |
| `the orphaned line section files are gone` | The cleanup happened. |
| `no adapter reads appearance.layout` | The raw pass-through is gone. |

Remove or rewrite the `toPlotly.*.test.js` files together with `toPlotly.js`, stating in the change which cases moved to the new model tests and which were dropped because the feature they tested no longer exists.

---

## Glossary

| Term | Meaning here |
|---|---|
| **Renderer** | The code that turns prepared numbers into a picture. Plotly is one; the new visx charts are another. |
| **Plotly** | A charting library that draws a whole chart from one settings object. Easy to start with, but it makes many style choices itself. |
| **visx** | A set of small React building blocks for charts, made by Airbnb. It uses D3's math (scales and line shapes) and leaves every visual choice to us. |
| **D3** | A JavaScript library for chart math and drawing. With visx, only its math is used, and React does the drawing. |
| **SVG** | The web's format for drawings made of shapes and text. visx charts are SVG, which is why they export cleanly. |
| **Chart model** | A plain description of what to draw (series, points, axis ranges, labels), built from observations before any drawing happens. |
| **Adapter** | Today's code that turns observations into Plotly's settings object. |
| **Frame** | The PPIC parts around a chart: eyebrow, title, subtitle, key, and the source and notes box. |
| **Direct label** | A series name written at the end of its line, instead of in a key. |
| **Baseline (screenshot)** | An approved picture a screenshot test compares against. |
| **Fixture** | Fixed test data that never changes, so tests give the same result every time. |
| **jsdom** | The fake browser the unit tests run in. It has no screen and cannot measure sizes. |
| **Tests first** | Writing a feature's tests before the feature, so the tests say what "done" means. The tests fail until the feature is built. |

---

## Related Documents

- [[visualization-backend-implementation-plan]] - the question, comparison, and observation system this plan draws from.
- [[visualization-specification]] - the as-built description of the editor and charts.
- [[projectSpec]] - the project specification.
- `docs/ref/Data Visualization Style Guide_062321-1 5 3.pdf` - the PPIC style guide.
