---
Topic: Visualization backend
Content Type: implementation plan
pinned: false
description: "A tests-first plan for moving every chart except maps from Plotly to visx, one chart type at a time, so each chart follows the PPIC Data Visualization Style Guide and every editor control works. Written for programmers continuing the visualization work."
Date Published: September 26, 2026
Last Updated: 10/01/2026 - 02:00 PM
Status: Updating
---

# Chart Renderer: Implementation Plan

> [!info] Who this is for and how to read it
> This plan is for whoever builds the new chart drawing code, whether a person or a model. Nothing in it is built yet. The work runs in five stages, in order: write every test, lay the groundwork, fix the charts one type at a time, rebuild export, then handle everything outside the chart. An optional sixth stage adds extras shared across chart types, such as callouts and panels. Each workstream (a group of related changes) says what is wrong today, the steps to fix it, which documents it makes out of date, and the tests to write. Words that may be unfamiliar are defined in the [Glossary](#glossary) at the end.

Today every chart in the app is drawn by Plotly, a charting library that makes many layout and style choices for us. The PPIC Data Visualization Style Guide (`docs/ref/Data Visualization Style Guide_062321-1 5 3.pdf`) asks for things Plotly makes hard or impossible: lines labeled directly in their own color, square key swatches no larger than 20px, and a separate gray source-and-notes box under the chart. A test of a different approach on a colleague's project ([older_ca_lfp_projections](https://github.com/emcghee73/older_ca_lfp_projections)) showed that visx, a small set of React chart building blocks, produces a line chart much closer to the guide.

A check of the editor also found 44 controls that save a setting the chart never uses, and three that do not save at all. This plan fixes both problems together. Each chart type is rebuilt in visx, and each control shown for that chart is either made to work, removed, or hidden, as the project owner decides.

This plan keeps Plotly for the two map types. It does not change how data is fetched or calculated. The question, comparison, and observation system from [[visualization-backend-implementation-plan]] stays exactly as it is. Only the last step, turning prepared observations into a picture, changes.

---

## The Order of Work

The work runs in five stages, plus an optional sixth. A stage starts only when the one before it is done, except that charts in Stage 3 can be worked on side by side once Stage 2 is finished. Stage 6 holds nice-to-have extras, and nothing in Stages 1 to 5 waits for it.

> [!note] Progress, September 30, 2026
> Stage 1 (tests) is written. Stage 2 (A, B, C) and Workstreams D (line chart) and E (bar chart) are built. The line and bar screenshot baselines await review. Workstreams F to O remain.
>
> **October 1, 2026.** Workstream F (range chart) is built and, after owner review against six published PPIC range plots, is the visx default, as the line and bar charts are. Its screenshot baselines await review. Workstreams G to O remain.
>
> On September 30 the owner collected twelve published PPIC bar charts (`mockups/bar chart reference/`). Workstream E was widened to cover them, and the owner decided its eleven new rows the same day (ten Build, one Remove). The features they share with other chart types (callouts, highlights, context gray, custom label text, and panels) went into a new optional Workstream P. Workstream E was built the same day, and after two rounds of owner review the bar chart became visx by default, as the line chart had (see the exception below).

| Stage | What happens | Workstreams |
|---|---|---|
| 1. Write the tests | The owner decides what happens to each broken control. Then every test in this plan is written, before any feature code. The test suite is expected to fail until the work lands. | See [Stage 1](#stage-1---write-every-test-first) |
| 2. Groundwork | The shared pieces every chart needs: style rules, a way to pick the drawing library per chart type, the PPIC frame, and the settings every chart shares. | A, B, C |
| 3. Chart by chart | Each chart type is rebuilt, reviewed until it looks right, and has each of its controls made to work, removed, or hidden. | D to L |
| 4. Export | Export is rebuilt to work from the drawn picture. Each chart type becomes the default only once its export works. | M |
| 5. Other externalities | Embeds, saved views, shared links, the click-through tests, cleanup, and project documents. | N, O |
| 6. Extras (optional) | Features shared across chart types that are nice to have once the charts look right. Each chart type can adopt them after its own workstream is done. | P |

| # | Workstream | Stage | Depends on |
|---|---|---|---|
| A | The PPIC style rules live in one file that every chart reads | 2 | - |
| B | Each chart type says which library draws it | 2 | - |
| C | Every chart sits inside the same PPIC frame, and the settings every chart shares work | 2 | A, B |
| D | Line chart | 3 | C |
| E | Bar chart | 3 | C |
| F | Range chart (dumbbell) | 3 | C, and the row label helper from E |
| G | Dot plot | 3 | C, F |
| H | Forest plot | 3 | C, F |
| I | Heatmap | 3 | C |
| J | Scatter and bubble charts | 3 | C |
| K | Pie chart | 3 | C |
| L | Maps (still drawn by Plotly) | 3 | C |
| M | Export works from the picture the chart already draws | 4 | D to L |
| N | Embeds, saved views, shared links, and click-through tests keep working | 5 | M |
| O | Plotly is loaded only for maps, and the old code and documents are cleaned up | 5 | N |
| P | Shared extras: callouts, highlights, context gray, custom label text, and panels | 6 | D, E. Nothing depends on P. |

> [!warning] Users keep seeing the Plotly charts until Stage 4, except the line, bar, and range charts
> Stage 3 builds each visx chart behind a preview switch (Workstream B). Users keep seeing the Plotly version of every chart until that chart's export works in Stage 4. This follows the decision that export stays on Plotly in the short term, and it means Stage 3 can be reviewed without affecting anyone.
>
> **Exception, September 29, 2026.** The owner made visx the line chart's default ahead of Workstream M, for review. Until M lands, a line chart's image dialog says image export is coming soon, and its Download button stays off; data export and embeds work. `?renderer=plotly` still shows the Plotly line. The approved legacy `line-comparisons` screenshot stays a Plotly picture until a visx baseline is approved.
>
> **Exception, September 30, 2026.** The owner made visx the bar chart's default too, on the same terms as the line chart: the image dialog's notice now names line and bar charts, `?renderer=plotly` still shows the Plotly bar, and the legacy bar screenshot stays a Plotly picture until a visx baseline is approved. Views from the older (version 2) editor still draw with Plotly.
>
> **Exception, October 1, 2026.** The owner made visx the range chart's default on the same terms: the image dialog's notice now names line, bar, and range charts, `?renderer=plotly` still shows the Plotly range chart, the legacy `range-two-period` screenshot stays a Plotly picture until a visx baseline is approved, and version 2 views still draw with Plotly.

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
| Row label alignment | Decided September 30, 2026. Row labels on horizontal bars, range charts, dot plots, and forest plots are left-aligned by default, as PPIC's published charts show. The guide's right alignment is still available through the alignment setting. |
| Shared extras | Decided September 30, 2026. Callouts with arrows, highlighted categories, a context gray series, custom label text, and panels are built once in Workstream P, after the charts look right. Nothing else in this plan depends on them. Panels split a chart by comparison only. Two different measures side by side wait for a later plan, because they need a question with more than one outcome. |

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

> [!note] Rows added after Stage 1
> Workstream E gained rows on September 30, 2026, after the owner collected PPIC's published bar charts, and Workstream P was added the same day. E's new rows were decided the same day. P's one Pending row (panel value scale) is decided before P starts. Their tests are written at the start of their own workstream, before any of its feature code, following the rules in Step 2. Three Stage 1 tests change as a result; Workstream E's Tests section names them.

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

The bar chart type in `lib/visualization/chartRegistry.js` also declares defaults that nothing uses: `sort: "value"`, `showValueLabels: false`, `mirror: false`, and a third stacking choice, `stackMode: "percent"`. No control writes them, and `barFigure` reads none of them; it only knows `stackMode: "stacked"`. The registry's `sort: "value"` describes a sorted chart that users never see.

Guide rules that matter most: the value axis starts at zero, bars are at least 10px wide, a stacked series is shaded dark to light, and there are no vertical grid lines. The guide also shows right-aligned category labels on horizontal bars, but PPIC's published charts left-align them, and the owner chose the published look (September 30, 2026).

### What PPIC publishes

On September 30, 2026 the owner collected twelve bar charts from PPIC publications, saved in `mockups/bar chart reference/`. They vary far more than the guide's examples. The table lists what each one needs and where this plan covers it: **E** is this workstream, **P** is the optional extras in [Workstream P](#workstream-p---shared-extras-callouts-emphasis-custom-labels-and-panels), and **Tabs** is the existing Tabs comparison presentation. The pictures are the standard a bar chart is reviewed against in step 7 of the chart recipe, alongside the guide.

| Reference (publication, chart) | What it shows | Covered by |
|---|---|---|
| Homelessness and Drug Use, "Beds in permanent housing increased substantially after 2013" | Stacked columns along 18 years. White labels inside one series only. The other series in light gray as context, with gray key text. Key above. Every other year labeled, the latest in bold. | E: bars along periods, stacking, labels for chosen series, key above. P: context gray. Not planned: bold latest year. |
| Homelessness and Drug Use, Figure 13 | One series. A label above each bar with custom text, such as "(12%*)". | E: labels outside the bar. P: custom label text. |
| Homelessness and Drug Use, Figure 15 | 50 states sorted largest first. Category labels turned 90 degrees. Two categories highlighted in their own colors. Two callouts with arrows. | E: sorting, turned labels. P: highlight, callouts. |
| Employment Before, During, and After Prison | Two panels (Before prison, After prison) with bold panel titles. A different color for each category. Labels above. No value axis. Wrapped category labels. | P: panels, and highlighting every category. E: minimal axis on ordinary bars, wrapped labels, labels outside. |
| Racial Disparities in Law Enforcement Stops, Figure 3 | Four panels with independent value scales. Grouped 2019 and 2023 bars. Labels only on 2023, showing the change since 2019. One key below. | P: panels, independent scales, custom label text. E: labels for chosen series. Not planned: labels that compute change. |
| Racial Disparities in Law Enforcement Stops, Figure 6 | Negative values around a darker zero line. Categories nested inside agencies, with divider lines. Labels only on 2023, past each bar's tip. Key centered above. | E |
| Is College Worth It, "College graduates have greater success on the job market" | Tabs. Two measures side by side sharing one set of row labels. A gray track rail behind each bar. Labels inside at the bar's start, moved outside when the bar is too short. | Tabs. E: track rail on ordinary bars, label placement. Deferred: two measures side by side. |
| Is College Worth It, "At public colleges, nontuition costs are a large part of overall expenses" | Horizontal stacked bars. Dollar value axis. Left-aligned row labels. Key above. | E |
| Is College Worth It, "Students at public colleges are less likely to take out loans" | Two measures side by side. Dotted row dividers. Values shortened, such as "15.8K". | Deferred: two measures side by side. Not planned: row dividers, shortened numbers. |
| Is College Worth It, "Students who do not graduate are more likely to have loans in default" | Two stacked shades of one color. Series named at the right instead of in a key. A bold total above each stack. | E: stacking dark to light, direct series labels, stack totals. |
| Is College Worth It, "Most California 9th graders will not earn a bachelor's degree" | Grouped columns. White labels inside the top of each bar. Wrapped category labels. Key above. | E |
| Transfer-Level Courses at California Community Colleges, Figure 10 | Horizontal bars stacked to 100%. Rows grouped under bold headers (2-year, 3-year, 4-year). Segment labels in white or dark text, whichever reads better. No label on a segment too small to hold one. Key above. | E |

> [!note] What is deferred or not planned, and why
> - **Two measures side by side** (the two college charts that set a rate beside a second measure) need a question that carries more than one outcome. This plan does not change the question or how data is fetched, so they wait for a later plan. The owner chose panels by comparison only (September 30, 2026).
> - **Labels that compute change** ("−35,868" beside a 2023 bar) need a new calculation. Until one exists, an author can type them with P's custom label text.
> - **Not planned:** a bold latest period label, dotted row dividers, and shortened numbers such as "15.8K". Each is small. Add the first two to P, and shortened numbers to the shared number types in Workstream C, if the owner wants them.

### Bar chart settings

Rows marked **New, September 30** come from the PPIC references above. The owner decided them on September 30, 2026. Their tests are written at the start of this workstream, before its feature code (see "Rows added after Stage 1" in [Stage 1](#stage-1---write-every-test-first)).

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
| Threshold colors | `colorBuckets` | Does nothing | Follows the diverging decision. The picker offers only the style guide's ten official colors, saved by name; the default set is Navy, Blue, Orange, and Red (owner, after review). Views saved with older brand tokens still draw. | Build |
| Key above the chart (New, September 30) | `legendPosition: "top"` | No such choice | Build. Add Top to the shared Legend Position choices (`LEGEND_POSITIONS` in `sharedSettings.js`, placed by `ChartFrame` and `ChartKey`), so every chart type gains it, and make it the bar chart's default. Every reference with a key puts it above the chart. | Build |
| Show values (New, September 30) | `showValueLabels` | Declared in the registry, no control, never read | Build a switch, off by default. Standard mode. | Build |
| Label which series (New, September 30) | `valueLabelSeries` | New | Build, the way the dot plot's `pointLabelSeries` works. All series by default. Advanced Mode only. | Build |
| Label position (New, September 30) | `valueLabelPosition` | New | Build: Automatic, Inside the bar, or Outside the bar. Automatic follows step 6. Advanced Mode only. | Build |
| Stack totals (New, September 30) | `showStackTotals` | New | Build, shown only for stacked bars, off by default. | Build |
| Stacked to 100% (New, September 30) | `stackMode: "percent"` | Declared, never read | Build, as a third Stacking choice. | Build |
| Sort (New, September 30) | `sort` | Declared default `"value"`, no control, never read | Build a Sort choice: Data order, Largest first, or Smallest first. The default is Data order, which is what users see today, and the registry default changes to match. Dragging locations sets a custom order and shows the choice as Custom. Standard mode. | Build |
| Bars along (New, September 30) | `categoryAxis` | New | Build: Locations (today) or Periods, for one bar per year as in the permanent housing chart. Advanced Mode only. | Build |
| Color bars by (New, September 30) | `barColorBy` | New | Build, shown only when the bars show several comparisons and several periods: Each series (today, for example "Latina Women · 2025"), Comparison, or Period. The one not chosen becomes an inner category nested under each location. The default is Each series, so no chart changes color. Advanced Mode only. | Build |
| Bar order within groups (New, September 30) | `seriesOrder` | New | Build (owner, after review): a drag list of the series, for example which year's bar comes first in each group. It also orders a stack from its base up and the key. Each series keeps its color. Data order by default. Shown when there are two or more series. Standard mode. | Build |
| Track rail and Minimal axis without diverging (New, September 30) | `trackRail`, `minimalAxis` | Shown only when Diverging bars is on | Build. Move both out of the diverging group, because the references use them on ordinary bars. The diverging group keeps five controls. | Build |
| Population pyramid (New, September 30) | `mirror` | Declared in the registry, no control, never read | Hide. No reference uses it, and diverging bars already draw bars from a center. | Remove |

### Steps

Follow [What every chart goes through](#what-every-chart-goes-through). Chart-specific points:

1. **Model** in `lib/visualization/models/barModel.js`, using `axisScale.js` for the value axis. Bars keep today's grouping, series names, and colors from `barFigure`; reuse `colorsForLineSeries`, as the line model does, and do not copy it. For each bar the model holds its category, inner category if any, series, value, start and end (for stacks and diverging bars), a stable key (step 10), and its label text and placement (step 6). Colors come from one function in the model, so P can replace it.
2. **Categories.**
   - **Along the axis.** Locations by default. With Bars along set to Periods, each period is a category, and `periodTicks` from Workstream D thins the labels at narrow widths.
   - **Order.** A dragged order (`categoryOrder`) wins. Otherwise the Sort choice applies: grouped bars sort by the first visible series, and stacked bars by the stack total. Missing values sort last.
   - **Nested categories.** When Color bars by leaves an inner category, locations become outer groups. On vertical bars, the outer label sits below the inner labels, with 1px divider lines in the axis color between groups (Figure 6). On horizontal bars, the outer label is a bold header row above its rows (Figure 10). With one location, the outer level is left out.
3. **Row labels for horizontal bars.** New file `lib/visualization/chartLayout/rowLabels.js`. E builds it because E comes before F, and F, G, and H reuse it. Given the labels, the text size, a maximum width, and the alignment, it returns the label column width and each label's position. Long labels wrap onto a second line rather than being cut off. Labels are left-aligned by default (owner, September 30, 2026), and centered on their bar or row.
4. **Drawing** in `components/charts/visx/BarChart.js`.
   - Enforce the 10px minimum bar width by reducing the gap between bars first. When even that is not enough, show a notice asking the reader to show fewer categories, rather than drawing bars thinner than the guide allows.
   - Category labels on vertical bars wrap onto two lines first. When they still overlap, they angle 45 degrees while the bars are at least two text heights apart, and turn 90 degrees only when the bars are closer than that (Figure 15; owner, September 30, 2026). The 10px notice applies only after these.
   - When values go below zero, the zero line is drawn as an axis line (1px, axis color), not as a pale grid line (Figure 6).
   - With one series, the key entry names what the bars measure (the value axis title, or the measure when that title is off), and the value axis title is not repeated above the axis (owner, September 30, 2026). With the key hidden, the title stays.
   - The drawing receives its plot area from its caller rather than assuming it owns the whole frame, so P's panel grid can draw several bar charts in one SVG.
5. **Hover** follows PPIC's published bar charts, not the line chart's point label (owner, September 30, 2026): the information goes on the chart, with no floating box. With several series, the hovered bar's series keeps its color and shows every one of its values, the other series fade to a 30% tint of their own color (their value labels step back), and the key fades the other entries' swatches the same way, keeping every label readable (owner, after review: hiding them made the key too dim). A stack labels the hovered series inside every segment only when all of them fit; otherwise only the hovered value shows, past the end of its stack and beyond any total, so every stack behaves the same (owner, after review). With one series, the hovered bar darkens (official orange to official red `#832522`; other colors lose lightness in Lab, keeping their hue) and its value appears above it in bold, unless its value is already shown. Hover numbers take the hovered bar's color: outside a bar, its fill darkened only as far as 4.5:1 contrast needs; inside, white or dark gray, whichever reads on it (owner, after review). The hovered category label turns bold and dark; the others keep their gray, which is light enough already (owner, September 30, 2026). The hovered value carries `role="tooltip"` with the series, category, and any stack total for screen readers. The key around the chart learns the hovered series through a small shared focus (`components/charts/chartFocus.js`), which `ChartFrame` provides. Keyboard use follows the chart recipe.
6. **Value labels.** When Show values is on:
   - The text is the value in the shared number format from `sharedSettings.js`, at the data label size.
   - **Automatic** placement puts labels outside the bar when the chart has one series or only some series are labeled (Figures 13 and 6), and inside otherwise (the 9th graders chart). Stacked segments are always labeled inside.
   - **Inside** labels sit at the end of a vertical bar and at the start of a horizontal bar, in white or dark text, whichever contrasts more with the bar. Add that choice to `lib/visualization/chartLayout/contrast.js` as one function; the heatmap's cell values (Workstream I) reuse it.
   - **Outside** labels sit just past the bar's end, which is below the tip for a negative vertical bar. They are in the axis label color when every series is labeled, and in the series' readable color (`readableTextColor`) when only some are, so a reader can tell which series they belong to.
   - An inside label that does not fit moves outside. An outside label that would leave the plot moves inside. A stacked segment too small for its label shows no label, and its value stays in hover and View Data.
   - Stack totals are bold, in the axis label color, just past the end of each stack.
   - Labels never overlap each other or another bar. When they would at the current width, the chart leaves those labels out and keeps the values in hover.
7. **Direct series labels for stacks.** When Legend Position is Automatic and bars are stacked, each series is named once, to the right of the last stack and level with its segment, instead of in a key (the loans-in-default chart). Reuse `directLabels.js` from Workstream D, so labels are pushed apart the same way and use the same readable text color rule. When they do not fit, or there are more than four series, fall back to the key.
8. **Orientation.** Horizontal bars put the row labels from step 3 to the left of each bar.
9. **Diverging bars.** Bars grow left and right (or up and down) from the center value, with the reference line and its label drawn across the chart. Build all seven diverging settings: center, reference line and label, manual value axis range, track rail, minimal axis, and threshold colors. Track rail and Minimal axis also work on ordinary bars (owner, September 30, 2026): the rail is a full-length gray bar behind each bar in the source box color, and the minimal axis leaves out the value axis and its grid lines, which suits charts with value labels.
10. **Leave room for the extras.** Workstream P adds callouts, highlights, context gray, custom label text, and panels to bars later. E does not build them and does not wait for them, but must not block them. Give every bar a stable key made of its comparison, location, and period, and put it on the bar as `data-key`. Keep the color function (step 1) and the plot area (step 4) as described.
11. **Controls** in `AppearanceSection.js`, shown only for bar charts:
    - Bring back three: an Orientation choice (vertical or horizontal, saved as `orientation`), a Diverging bars switch (`diverging`), and a Stacking choice (side by side, stacked, or stacked to 100%, saved as `stackMode`).
    - Add the other New, September 30 controls, in the mode each row names: Show values, Sort, and Stack totals in Standard Mode; Label which series, Label position, Bars along, and Color bars by in Advanced Mode. Top joins the shared Legend Position choices.
    - The five remaining diverging controls keep appearing only when Diverging bars is on, as they do today. Track rail and Minimal axis move out of the diverging group and show for every bar chart.
    - Views that already set `diverging`, such as the RHNA topic's built-in views, keep their setting.
    - Register every new setting in `lib/visualization/settingsRegistry.js`.
12. **Remove `mirror`.** Delete it from the bar chart's defaults in `chartRegistry.js`. A saved view that still holds `mirror` opens without error and ignores it. Change the registry's `sort` default from `"value"` to data order at the same time, so the registry describes what users see.

### What this makes out of date

- [[visualization-specification]], section "Chart catalog": the bar chart's description (value labels, sorting, stacking to 100%, nested categories, key above).
- [[visualization-specification]], section "Settings reference", and the generated settings reference. Regenerate it with `npm run generate:settings`, and do not edit it by hand.
- Workstream F in this plan: row labels now come from E and default to left-aligned. F has been updated to match.

> [!note] As built, September 30, 2026
> Workstream E is built. Its screenshot baselines are not recorded; they wait for review. Where the build settled something the steps above left open:
> - **Reference line.** A diverging chart draws a separate reference line only when a reference value (0 included) or label is set. Otherwise the baseline at the center marks it, so an explicit 0 still changes the chart.
> - **Horizontal bars** draw no value grid lines (they would be vertical) and stop growing at 36px thick, so a short list does not become blocks. A short chart leaves space below it; check this at review.
> - **Label which series** is one dropdown: All series, or Only one named series. It saves the same `valueLabelSeries` map. The editor names the series from the bar model (through the new `lib/visualization/previewInput.js`, shared with `PreviewContext`), so the choices match the chart after Color bars by or Bars along change the series.
> - **The series behind a bar** come from the new `lib/visualization/barSeries.js`, which the Plotly bar adapter now uses too, so both renderers draw the same series, names, and colors.
> - **Bar controls are version 3 only.** The older editor keeps Orientation and Diverging bars in its Outcome section; showing them in Appearance too would draw each control twice there.
> - **Automatic axis labels** for a version 3 horizontal bar put the measure on X (`deriveLabels.js`), matching the older editor's labels.
> - **Stage 1 tests changed** beyond the three named below: `chartRegistry.catalog.test.js` no longer expects `mirror` in the bar defaults; the Orientation case in `AppearanceSection.test.js` now renders a version 3 bar; and `AppearanceSection.bar.test.js` gates six diverging controls instead of eight, because Track rail and Minimal axis left the group.
> - **The Projections topic's "Age pyramid" example** (`demographicProjections.js`) still sets `mirror: true`. With `mirror` removed it draws ordinary horizontal bars.
> - **Second owner review (September 30, 2026).** Track rail moved to Advanced Mode (Minimal axis stays standard). Hover numbers take the hovered bar's color. A stack labels the hovered series everywhere or only past the hovered stack. Threshold colors offer only the official colors; the Plotly bar resolves the official names too. The Outcome section's bare "Sum" now reads "Combined values are added together."
> - **Owner review in the editor (September 30, 2026).** Four changes followed. The key no longer hides the other series on hover; their swatches fade instead. A hovered stacked segment too small for its value now shows it past the stack; before, nothing appeared. **Bar order within groups** (`seriesOrder`) was added, reusing the location list's drag rows. The Time section's Years box lists the chosen years ("2025, 2026") instead of a count.

### Tests

> [!warning] Three Stage 1 tests change with the September 30 decisions
> These were written in Stage 1 and assume the old defaults. Change them at the start of this workstream, and say why in the commit, as the Markers default change did.
> - `tests/js/components/charts/visx/BarChart.test.js`, `draws horizontal bars with right-aligned labels`: rename it `draws horizontal bars with left-aligned labels` and expect `text-anchor` `start`.
> - `tests/js/lib/visualization/chartLayout/rowLabels.test.js`, `right-aligns row labels by default`: rename it `left-aligns row labels by default` and expect `start`.
> - `tests/js/components/chart-builder/sections/controlCoverage.test.js`, the `bar` list: add the seven new controls (Show values, Label which series, Label position, Stack totals, Sort, Bars along, Color bars by) and the Top legend choice, and keep Track rail and Minimal axis visible without Diverging bars. Add one `bar` row to `tests/js/lib/visualization/settingsCoverage.test.js` for each new Build setting, and add `mirror` to the bar chart's removed settings.

Written in Stage 1, in `tests/js/lib/visualization/models/barModel.test.js` and `tests/js/components/charts/visx/BarChart.test.js`:

| Test | What it checks |
|---|---|
| `gives each comparison the same color the Plotly bar chart gives it` | No color change on switching. |
| `starts the value axis at zero` | The guide rule. |
| `keeps missing values as gaps, not zero-height bars` | Honest charts. |
| `never draws a bar narrower than 10px` | The guide rule. |
| `draws no vertical grid lines` | The guide rule. |
| `orders bars by the dragged location order` | Dragging locations reorders the bars. |
| `draws horizontal bars with left-aligned labels` | The published charts' rule. Renamed on September 30 (see the warning above). |
| `stacks series dark to light` | The guide's stacked column rule. |
| `draws bars from the center value` | Diverging bars grow from `center`. |
| `draws the reference line and its label` | `referenceValue` and `referenceLabel`, including a reference value of 0, because 0 is a real setting. |
| `uses the manual value axis range` | `valueRange`. |
| `draws the track rail behind each bar` | `trackRail`. |
| `draws the minimal axis` | `minimalAxis`. |
| `colors bars by threshold` | `colorBuckets`. |
| `shows the bar's value on hover` | Hover. |

Added September 30, 2026, to `barModel.test.js`. Expected values are typed by hand from the shared fixtures.

| Test | What it checks |
|---|---|
| `defaults the key to the top for bar charts` | `legendPosition` falls back to `"top"` for bars only. |
| `keeps data order when nothing is saved` | No chart reorders on switching. |
| `sorts largest first and smallest first` | `sort`. |
| `sorts stacked bars by their totals` | Stacks sort by the whole stack. |
| `lets a dragged order win over the sort choice` | `categoryOrder` beats `sort`. |
| `stacks each bar to 100 percent` | Each stack's segments add up to 100. |
| `puts periods along the axis when Bars along is Periods` | `categoryAxis`. |
| `nests the inner category under each location` | `barColorBy`, with the expected outer and inner order typed out. |
| `keeps today's series and colors when Color bars by is not saved` | Compare with `adaptObservations` output. |
| `labels only the chosen series` | `valueLabelSeries`. |
| `places labels outside for one series and inside for several` | Automatic placement. |
| `labels stacked segments inside` | Stacked segments never take outside labels. |
| `shows a total for each stack` | `showStackTotals`. |
| `gives every bar a stable key` | Comparison, location, and period, the same at every width. |
| `names a single series' key entry after the value axis` | One series' key says what is measured. |
| `keeps series names in the key and the axis title when there are several series or no key` | The rule's limits. |
| `ignores a saved mirror setting` | `mirror` is removed; an old view opens and draws ordinary bars. |

Added September 30, 2026, to `BarChart.test.js`:

| Test | What it checks |
|---|---|
| `writes inside labels in white on dark bars and dark on light bars` | The contrast rule. |
| `moves an inside label outside when the bar is too short` | The fit rule. It needs sizes in px, so it is a drawing test. |
| `leaves out a label on a segment too small to hold it` | Stacked segments. |
| `labels a negative bar past its tip` | Outside labels on negative bars. |
| `colors outside labels by series when only some series are labeled` | Readers can tell which series a label belongs to. |
| `wraps a long category label onto two lines` | The first fitting step. |
| `turns category labels 90 degrees when wrapping is not enough` | The second fitting step, with 50 categories. |
| `draws the zero line as an axis line when values go negative` | Figure 6. |
| `draws divider lines between nested groups` | Vertical nested categories. |
| `draws bold group headers for nested horizontal rows` | Horizontal nested categories. |
| `names stacked series at the right when the key is Automatic` | Direct series labels. |
| `falls back to the key when stacked series names do not fit` | The fallback. |
| `never overlaps two value labels` | Labels that would collide are left out. |
| `shows the stack total on hover` | Hover on stacks. |
| `puts each bar's stable key on the drawing` | The `data-key` hook P needs. |
| `draws the track rail and minimal axis without diverging bars` | The un-gated settings. |
| `moves between bars with the arrow keys` | Keyboard use. |
| `darkens the hovered bar of a single series to the official red` | One-series hover. |
| `darkens other colors while keeping their hue` | Lab darkening. |
| `shows a single series' hovered value above the bar in bold` | Figure 15's hover. |
| `only darkens a bar whose value is already shown` | Figure 13's hover. |
| `fades the other series and labels every bar of the hovered one` | The beds chart's hover; the faded fill is typed out (`#BFC4CC`). |
| `hides the faded series' value labels while another series is hovered` | Faded series step back. |
| `labels a stacked series in every stack or only past the hovered one` | Stacked hover is the same in every stack. |
| `writes hover numbers in the hovered bar's color` | Hover color. |
| `fades the other series in the key, as on the bars` | The key follows the hover without hiding entries. |
| `shows a stacked segment's value past the stack when it does not fit inside` | Stacked hover. |
| `bolds the hovered category label and leaves the others as they are` | Category emphasis. |
| `angles category labels 45 degrees when the bars have room` | Sparse bars with long labels. |
| `leaves the value axis title to the key for a single series` | The key names the value. |
| `draws no hover changes once the pointer leaves` | Hover clears. |

Moved from Workstream F to `tests/js/lib/visualization/chartLayout/rowLabels.test.js` (already written in Stage 1):

| Test | What it checks |
|---|---|
| `left-aligns row labels by default` | The published charts' default. Renamed on September 30. |
| `wraps a long row label instead of cutting it off` | Readability. |
| `honors <alignment> alignment` | One case each for left, center, and right. |

New file: `tests/js/components/chart-builder/sections/AppearanceSection.bar.test.js`:

| Test | What it checks |
|---|---|
| `shows Orientation, Diverging bars, and Stacking only for bar charts` | The restored controls. |
| `shows the diverging controls only when Diverging bars is on` | Today's gating is kept for the controls that stay in the group. |
| `keeps diverging on for a view that already set it` | RHNA's built-in views are unchanged. |
| `offers Top as a legend position and defaults bar charts to it` | The new key placement. |
| `shows Stack totals only for stacked bars` | The gating. |
| `shows Color bars by only when bars show several comparisons and several periods` | The gating. |
| `shows Track rail and Minimal axis without Diverging bars` | The un-gated controls. |
| `keeps the label controls in Advanced Mode behind Show values` | Label which series and Label position. |
| `saves the new bar settings in appearance` | Show values, Sort, and Stacked to 100%. |

Screenshot cases in `tests/visual/visualization-v3.spec.js`. Cases that need more than two counties use a new hand-built fixture in `tests/fixtures/visualization-v3/`, for example 50 categories for the turned labels.

| Test | What it checks |
|---|---|
| `matches the approved Bar comparison layout` | Existing test. Its new baseline is recorded after review. |
| `fits eight comparisons without overlapping labels` | Crowding. |
| `draws horizontal bars` | Left-aligned row labels, inside value labels. |
| `draws stacked bars` | Dark to light, stack totals. |
| `draws diverging bars` | Center, reference line and label. |
| `labels values inside and outside bars` | The placement rules, including a short bar. |
| `stacks to 100 percent with nested row groups` | Figure 10. |
| `turns labels for fifty categories` | Figure 15, without its callouts. |
| `nests categories around negative values` | Figure 6. |
| `names stacked series directly` | The loans-in-default chart. |
---

## Workstream F - Range chart (dumbbell)

### What is wrong today

Every range-only control does nothing. The "Hide X-Axis" switch (Advanced Mode) writes `showValueAxis`, which nothing reads, while the charts read a different setting, `hideXAxis`, which no control writes.

It reuses the row label helper, `rowLabels.js`, that Workstream E builds for horizontal bars. The dot plot (G) and forest plot (H) reuse it too, because all of them draw one row per category with a label at the left.

### What PPIC publishes

On October 1, 2026 the owner collected six published PPIC range plots, saved in `mockups/range chart reference/`. They are the standard a range chart is reviewed against, alongside the guide. Ignore the gap between each chart and its source box; some are older drafts.

| Reference (file) | What it shows | Covered by |
|---|---|---|
| Clearance rates, adjusted and observed (`clearance-rates-adjusted-vs-observed.png`) | Three groups with bold gray headers. Each end in its own color (Observed navy, Adjusted orange), named once above the first row with a short tick. Every value labeled outside the range in its end's color. Dotted row lines. A zero line in each group; the axis shows only 0.0. | F: end colors, end names, value labels, row lines, zero line, groups. Deferred: two measures as the two ends (they need a question with more than one outcome). Not planned: an axis per group. |
| Price increases, two colors (`price-increases-two-colors-draft.png`) | Start in blue, end in orange. Only the start values labeled. Axis on top in percent. Vertical grid lines and dotted row lines. | F: end colors, Label which end, Value axis position, grid and row lines. |
| Price increases, arrows (`price-increases-arrows.png`) | Arrows from 0 to each value, the value at the arrowhead. Two rows highlighted in navy. Axis on top. | F: Range style, Value axis position. P: highlight. |
| Employment rates, arrows (`employment-rates-arrows.png`) | Arrows from the earlier to the later period, pointing left for a decline. Only the end value labeled. Ends named above the first row with ticks. The axis starts at 65%. | F: Range style, end names, Label which end, value axis range. |
| Business regulations, two tabs (`business-regulations-tab-a.png`, `business-regulations-tab-c.png`) | Six dots per row (minimum, quartiles, median, CA, maximum) on a gray band from minimum to maximum, each named above the first row in its color. Tabs. | G (dot plot): several dots per row and a band. Tabs: the existing presentation. |

### Range chart settings

| Control | Setting | Today | Suggested | Decision |
|---|---|---|---|---|
| Group row label alignment | `groupLabelAlignment` | Does nothing | Build, defaulting to left-aligned as PPIC's published charts show (owner, September 30, 2026; the guide shows right-aligned) | Build |
| Variable row label alignment | `variableLabelAlignment` | Does nothing | Build, same default | Build |
| Group row label indent | `groupLabelIndent` | Does nothing | Hide. Alignment covers the common need. | Hide |
| Variable row label indent | `variableLabelIndent` | Does nothing | Hide | Hide |
| Hide X-Axis (Advanced Mode) | `showValueAxis` | Does nothing | Build, as one setting (`hideXAxis`) shared by every chart that has the control | Build |
| Show point values | `showPointLabels` | Does nothing | Build. The guide favors labeling data directly. | Build |
| First line only | `pointLabelsFirstLineOnly` | Does nothing | Build if Show point values is Build, otherwise Remove | Build |
| Color of each end (New, October 1) | none: the start takes the palette's first color, the end its second | Each row in its comparison's color | Build. Default Navy for the start and Orange for the end, both dots filled, as the clearance-rate and price charts show. A chosen categorical palette supplies the two colors instead. The row labels name the rows, so comparison colors no longer apply. | Build |
| End names above the first row (New, October 1) | `legendPosition: "automatic"` | A key | Build. Automatic, the new default, names each end once above the first row, in its color with a short tick (the clearance-rate and employment charts). Top, Right, and Bottom draw a key instead. | Remove (owner, after review the same day): no Automatic choice for range charts; the key sits on top by default, and a saved "automatic" draws it on top. |
| Value axis range (New, October 1) | none | Starts at zero | Build. Fit the data with round ends (the employment chart starts at 65%), and draw a darker line at zero whenever the axis reaches it. | Build |
| Grid and row lines (New, October 1) | none | No grid | Build. A light vertical grid line at each tick and a dotted guide line along every row, as all six references show. This departs from the guide's rule against vertical grid lines, because the published look wins. | Build |
| Range style (New, October 1) | `rangeStyle` | New | Build: Dots (a connector between two dots) or Arrow (from the start to the end, with the value at the arrowhead), as the price and employment charts show. Dots by default. Standard mode. | Build |
| Label which end (New, October 1) | `pointLabelEnds` | New | Build, under Show point values: Both ends, Start only, or End only. Both by default. Advanced Mode only. | Build |
| Value axis position (New, October 1) | `valueAxisPosition` | New | Build: Bottom or Top; the references use both. Bottom by default. Advanced Mode only. | Build |

### Steps

Follow [What every chart goes through](#what-every-chart-goes-through). Chart-specific points:

1. **Row labels** come from `lib/visualization/chartLayout/rowLabels.js`, built in Workstream E (step 3). Pass the alignment settings through to it; with nothing saved, labels are left-aligned.
2. **Model** in `lib/visualization/models/rangeModel.js`, and **drawing** in `components/charts/visx/RangeChart.js`. The connector always runs from the start value to the end value, so a chart drawn from swapped endpoints is caught by a test, not only by a picture.
3. **Hide X-Axis.** If Build, the switch writes `hideXAxis`. When a saved view holds `showValueAxis: false`, treat it as `hideXAxis: true` when the view opens, so old views keep what their authors chose.

### Tests

New files: `tests/js/lib/visualization/models/rangeModel.test.js` and `tests/js/components/charts/visx/RangeChart.test.js`. The row label cases in `rowLabels.test.js` moved to Workstream E.

| Test | What it checks |
|---|---|
| `draws the connector from the start value to the end value` | Direction is right. |
| `keeps a row with one missing endpoint, without a connector` | Honest charts. |
| `opens an old view with showValueAxis false as hideXAxis true` | Old views keep what their authors chose. |
| `shows each endpoint's value when Show point values is on` | `showPointLabels`. |
| `shows only the first line of a two-line value label` | `pointLabelsFirstLineOnly`. |

Screenshot cases: `matches the approved Range layout` (existing test, new baseline after review) and `wraps long row labels`.

> [!note] As built, October 1, 2026
> Workstream F is built and, after owner review the same day, is the default range drawing (see the October 1 exception at the top of this plan). Its screenshot baselines are not recorded; they wait for review. Where the build settled something the steps above left open:
> - **Rows.** One comparison gives one row per category. Several comparisons and one location give one row per comparison. Several of each make each location a group with a bold header row (Group alignment) holding one row per comparison (Variable alignment). Rows keep data order; the registry's `sort: "difference"` default is still not read by either renderer.
> - **Row order (owner, October 1, 2026).** The range chart joined the line and bar charts as a place chart (`PLACE_CATEGORY_CHART_TYPES` in `GeographySection.js`): dragging locations in the Geographic Level list sets `categoryOrder`, which orders the rows or groups, and Ranked values sits there in Advanced Mode. Before, the range chart showed the fallback Categories panel, which is always empty in version 3 (previews never send `categoryNames`) and saved settings the chart does not read. The dot plot, forest plot, heatmap, and pie still show that empty panel; their workstreams should decide the same question.
> - **Time section.** The two-period First year and Second year boxes now use the editor's standard select (the one Geographic level uses) instead of a plain browser select.
> - **Owner review against the PPIC references (October 1, 2026).** The first build colored both dots by comparison (hollow start, filled end), put a key above the chart, started the axis at zero, and drew no grid lines. The owner replaced all four with the rows decided above: one color per end (`officialComparisonColor` Navy and Orange, or a categorical palette's first two), end names above the first row on Automatic (built, then removed at the next review: the key sits on top by default and the chart offers no Automatic), an axis that fits the data (`axisScale` gained `includeZero: false`) with a zero line, and grid and row lines. Range style, Label which end, and Value axis position were added to this workstream because no other workstream covered them. The visx and Plotly range charts now color differently; Plotly still colors by comparison through `comparisonColors`, which moved from the adapter into `palettes.js`.
> - **Spacing (owner, October 1, 2026).** The frame drew too much space around the key and above the source box. `ChartFrame` now uses `CHART_STYLE.frameGap` (20px below the title block, 12px between a top or bottom key and the chart, 24px beside a right key) instead of the guide's 48px `partSpacing`, which stays as the guide's documented value. This tightens every visx chart, not only the range chart. The range model sets `fitContent`, so the frame no longer reserves the full drawing height and the source box follows the chart's last row. Horizontal bars leave the same space below them and can opt in the same way.
> - **Style values** (`CHART_STYLE.range`): 6px dot radius, a 6px `officialGray` connector, a 3px arrow with a 7px head, 1px `officialGray` grid lines, 1px dotted `gray3` row lines, and a 1px `chartAxis` zero line. They approximate the references; check them at review.
> - **Point values** sit outside each row's range, left of the lower end and right of the higher, in the end's color, so they never cover the connector. The plot keeps room for them and for the end names.
> - **Hover** follows the bar chart: no floating box. The hovered row's label turns bold and both values appear beside its ends; with several comparisons the others fade to a 30% tint.
> - **Row label controls in version 3.** Version 3 views rarely set a `group` binding, which the controls used to require. A version 3 range chart now always shows Variable alignment, and shows Group alignment when the loaded chart draws groups. The Variable default in the editor changed from right to left, matching the drawing.
> - **Hide X-Axis** writes `hideXAxis`. `readQuestion` (`questionSpec.js`) turns a saved `showValueAxis: false` into `hideXAxis: true` when a view opens. The registry defaults of all three range-family charts now declare `hideXAxis: false` instead of `showValueAxis: true`, so switching to another chart type parks the setting instead of hiding that chart's axis (the Plotly adapter reads `hideXAxis` for every chart).
> - **Automatic axis labels** for a version 3 range chart put the measure on X and leave Y blank (`deriveLabels.js`). Before, the measure landed on Y, the row axis, for both renderers.
> - **First line only** labels the first row only, as `toPlotly.js` always drew it. The Stage 1 test read it as the first text line of a two-line label, but no range label has two lines, so that reading would have left the switch doing nothing. The test was rewritten as `labels only the first row when First line only is on`.
> - **Other Stage 1 tests changed.** `settingsCoverage.test.js` tests `groupLabelAlignment: "right"` instead of `"left"`, since left is now the default; the alignment case in `AppearanceSection.test.js` chooses Right for the same reason.
> - **Not done.** The two line spacing controls still do nothing on the range chart, as on the bar chart. The chart grows taller rather than squeezing rows, and a short chart leaves space below it, as horizontal bars do.

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

## Stage 6 - Extras

Stage 6 holds features that are nice to have once the charts look right. Nothing in Stages 2 to 5 waits for it. It can start for a chart type as soon as that chart's screenshot baselines are approved, before or after export (Workstream M).

---

## Workstream P - Shared extras: callouts, emphasis, custom labels, and panels

### Why this is separate

PPIC's published charts use a few features that belong to no single chart type (see [What PPIC publishes](#what-ppic-publishes) in Workstream E): a callout pointing at one data point, highlighted categories, a series drawn in gray as context, a label with custom text, and one chart split into panels. The owner wants all five (September 30, 2026), but only after the charts look right, and nothing else in this plan may depend on them. So they are built once, here, as shared pieces. The bar chart (E) and line chart (D) adopt them in this workstream. Each of F to L can adopt them later as a small follow-up, and none of those workstreams waits for P.

### What exists today

- **Annotations are already saved, but never drawn.** `presentation.annotations` is part of every saved view (`questionSpec.js`, `chartSpec.js`, `defaultQuestions.js`), and the editor's store has `ADD_ANNOTATION` and `REMOVE_ANNOTATION` (`components/chart-builder/chartConfigStore.js`). No control sends either action, and no chart draws annotations. Build on this field; do not add a second one.
- **Comparisons can be combined or tabbed, nothing else.** `CAPABILITIES` in `lib/visualization/chartRegistry.js` offers `combined` and `tabs` for bars and lines. There is no way to show every comparison at once, each in its own panel.
- **The per-series color list is gone.** Workstream C removed the per-series rename, hide, and color list. Emphasis must go through the comparison controls that were kept, not bring that list back.

### Extras settings

| Feature | Setting | Today | Suggested | Decision |
|---|---|---|---|---|
| Callout: text with an optional arrow to one data point | `presentation.annotations[]`, kind `callout` | Saved field and store actions, no control, never drawn | Build | Build |
| Highlight categories | `appearance.highlight` (`{ categories, baseColor }`) | New | Build | Build |
| Context gray series | A new choice in the comparison color control | New | Build | Build |
| Custom label text | `appearance.labelOverrides` | New | Build | Build |
| Panels | `presentation.comparisonPresentation: "panels"` | New | Build, for bar and line first | Build |
| Panel value scale | `appearance.panelScale` | New | Build: Shared by default, or Independent (Figure 3 in the police stops report) | Pending |

### Steps

1. **Callouts, model.** New file `lib/visualization/models/annotations.js`. It reads `presentation.annotations` and returns, for each callout whose target is in the data, where the target sits on the chart's own scales, the text, the side, and whether to draw an arrow.
   - A callout points at data, not pixels. Its target names a comparison, a location, and a period, whichever the chart type needs (the stable key from E step 10), so it stays on its bar or point at every width and after the data refreshes.
   - Side: Automatic, Above, Below, Left, or Right. Automatic puts the text above the target unless the side with the most room is clearly better. The text sits a fixed distance from its target, wraps at a maximum width, and stays inside the plot.
   - Style: text at the data label size in the axis label color, and a 1px arrow in the axis color with a small head, as in Figure 15 of the homelessness report. Add these values to `chartStyle.js`.
   - A callout whose target is not in the data is left out, and the editor lists it with a warning so the author can fix or delete it. It never throws.
   - Before choosing field names, check the shapes the store actions already save in `chartConfigStore.test.js` and `savedViews.v3.test.js`, and keep any saved annotation opening without error.
2. **Callouts, drawing.** New file `components/charts/visx/Callout.js`. Callouts are drawn inside the chart's own SVG, so export (M) copies them with no extra work. Callout text is also added to the screen-reader caption that `ChartFrame` writes.
3. **Highlight categories.** New file `lib/visualization/models/emphasis.js`, called from each chart model's one color function (E step 1). With `appearance.highlight` set, the chosen categories take palette colors in order, skipping the base color, and every other category takes the base color. The base color is a choice that defaults to Navy, matching Figure 15 (orange and yellow-green highlights on navy bars). Highlighting every category gives each its own color, as in the prison chart. On line charts the same setting picks lines. Keys, direct labels, and hover follow the new colors.
4. **Context gray.** Add a light gray named token for context series to `lib/constants.js`, or reuse `gray2` if the owner agrees it matches the permanent housing chart, and offer it as a choice in the kept comparison color control. The series draws in that gray. Its key text and labels use `readableTextColor`, so they stay readable; the reference's pale key text would fail the 4.5 to 1 rule. Hover still works on it.
5. **Custom label text.** `appearance.labelOverrides` maps a bar's or point's stable key to text. The text replaces that one value label, and shows even when Show values is off, as in Figure 13 of the homelessness report, where "(12%*)" is the only label. A key not in the data is ignored, and the editor lists it with a warning. This applies to chart types that have value labels: bar now, and dot plot, range, and pie once their workstreams are done.
6. **Panels.**
   - Add `"panels"` to the `comparison` capability of bar and line in `chartRegistry.js`. The question and the data fetch do not change: panels split the same observations by comparison, as tabs do.
   - New file `lib/visualization/chartLayout/panels.js`. Given the frame's width and height and the number of panels, it returns each panel's box: two columns at 650px and wider, one column below that. At most six panels; more gives a validation message suggesting Tabs.
   - New file `components/charts/visx/PanelGrid.js`. It draws each panel with the chart type's own drawing component, all inside one SVG, so export needs no change. Each panel has a title (its comparison label) at the key title size, bold, in the subtitle color. The whole figure shares one key, placed by `ChartFrame`.
   - Every panel uses the same category order. With a shared scale, every panel uses the same value axis, so panels can be compared honestly. With an independent scale (if `panelScale` is Build), each panel shows its own value axis.
   - Hover and arrow keys move within a panel, and Tab moves between panels.
7. **Line chart adoption.** Callouts point at a period on a line. Highlight picks lines, and the rest take the base color. Context gray and panels work as for bars. Custom label text does not apply, because line charts have no value labels.
8. **Editor.**
   - New section `components/chart-builder/sections/AnnotationsSection.js`, Advanced Mode only, shown for chart types that have adopted P. It lists callouts (text, a target picked from the data, side, and an arrow switch) and custom labels (a target and its text). Register it in `lib/visualization/sidebarSections.js`.
   - Add `UPDATE_ANNOTATION` next to the add and remove actions, and check that all three change a version 3 view. The per-series actions did not (Workstream C).
   - Highlight goes in the Appearance section: a list of the chart's categories or lines to highlight, and a base color choice.
   - Panels is a third choice in the presentation control in `ComparisonsSection.js`, next to Combined and Tabs.
   - Register every new setting in `lib/visualization/settingsRegistry.js`, and regenerate the settings reference with `npm run generate:settings`.
9. **Chart types that have not adopted P.** A saved view holding P's settings opens on any chart type without error. The settings are ignored there but kept, as a Hide decision keeps them, so switching back to a bar or line chart restores them.

### What this makes out of date

- [[visualization-specification]], sections "Labels, appearance, and accessibility" and "Settings reference", and the part that describes comparison presentations (panels join combined and tabs).
- [[projectSpec]], the chart registry description: bar and line offer the panels presentation.

### Tests

P was added after Stage 1, so its tests are written at the start of this workstream, before its feature code, following the rules in [Stage 1](#stage-1---write-every-test-first). Each chart type that adopts P later adds its own cases in the same files. Add one row per P setting for bar and line to `settingsCoverage.test.js` and `controlCoverage.test.js`.

New file: `tests/js/lib/visualization/models/annotations.test.js`:

| Test | What it checks |
|---|---|
| `anchors a callout to its data point at every width` | The same target lands on the same bar at 950px and 330px. |
| `leaves out a callout whose target is not in the data` | No crash, and the callout is reported for the editor's warning. |
| `keeps callout text inside the plot` | A callout on the last bar is not clipped. |
| `opens a view saved with the existing annotation shape` | Nothing saved before P breaks. |

New file: `tests/js/lib/visualization/models/emphasis.test.js`:

| Test | What it checks |
|---|---|
| `draws every category that is not highlighted in the base color` | Highlight. |
| `gives highlighted categories palette colors in order, skipping the base color` | Expected colors typed out by hand. |
| `highlights lines on a line chart` | The same setting on lines. |
| `draws a context gray series with readable key text` | Context gray, and the key text reaches 4.5 to 1. |
| `shows custom label text in place of the value` | `labelOverrides`. |
| `shows a custom label even when Show values is off` | Figure 13. |
| `ignores a custom label whose bar is not in the data` | Reported, not thrown. |

New file: `tests/js/lib/visualization/chartLayout/panels.test.js`:

| Test | What it checks |
|---|---|
| `lays out two columns at 650px and one at 330px` | The grid rule. |
| `gives every panel the same value scale by default` | Honest comparison. |
| `gives each panel its own scale when independent` | `panelScale`, if Build. |
| `keeps category order the same in every panel` | Readers compare like with like. |
| `refuses more than six panels and suggests tabs` | The limit. |

New files: `tests/js/components/charts/visx/Callout.test.js` and `tests/js/components/charts/visx/PanelGrid.test.js`:

| Test | What it checks |
|---|---|
| `draws an arrow from the callout text to its target` | The arrow switch. |
| `adds callout text to the screen-reader caption` | Accessibility. |
| `draws callouts and panel titles inside the chart's SVG` | Export (M) copies them with no extra work. |
| `draws one panel per comparison, each with its title` | Panels. |
| `moves between panels with Tab` | Keyboard use. |

New file: `tests/js/components/chart-builder/sections/AnnotationsSection.test.js`:

| Test | What it checks |
|---|---|
| `adds, edits, and removes a callout on a version 3 view` | All three actions change the view. |
| `offers only targets that are in the data` | The target picker. |
| `shows Annotations only for chart types that have adopted P` | Bar and line. |
| `offers Panels as a comparison presentation for bar and line` | The new choice. |

Extend `tests/js/components/chart-builder/savedViews.renderer.test.js` (Workstream N) when both exist:

| Test | What it checks |
|---|---|
| `keeps annotations, highlight, and custom labels through save and reopen` | P's settings survive. |
| `opens a view with P's settings as a chart type that has not adopted P` | Ignored without error, and kept. |

If Workstream M has landed, add `exports callouts and panels` to `tests/js/lib/export/exportSvgChart.test.js`. If it has not, the `draws callouts and panel titles inside the chart's SVG` case above keeps the way open, and M does not change for P.

Screenshot cases: `draws a callout with an arrow` and `highlights two categories` (Figure 15), `draws a context gray series` (the permanent housing chart), and `draws a two-by-two panel grid` (Figure 3 of the police stops report).

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
| **Direct label** | A series name written at the end of its line, or beside its segment of a stacked bar, instead of in a key. |
| **Value label** | A bar's value written on or just past the bar. |
| **Stack total** | The sum of a stacked bar's segments, written past the end of the stack. |
| **Nested categories** | Bars grouped twice, for example races inside each agency, with the outer group labeled below the inner labels or as a header row. |
| **Track rail** | A full-length pale bar drawn behind each bar, so the reader sees how far each bar is from the maximum. |
| **Callout** | A short note placed on the chart, often with an arrow, pointing at one data point. |
| **Highlight** | Drawing chosen categories or lines in their own colors and everything else in one base color. |
| **Context gray** | A series drawn in light gray, so it gives context without drawing the eye. |
| **Panels** | One chart split into several small charts, one per comparison, side by side. Also called small multiples. |
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
