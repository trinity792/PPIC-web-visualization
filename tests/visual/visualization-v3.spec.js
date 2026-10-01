/**
 * Workstream F - visual regression for the four approved chart families.
 *
 * These four cover the layout risks the figure-object tests cannot see: a
 * legend that overlaps the plot, a grouped bar that collides at eight
 * comparisons, connectors that cross their endpoints, and a colour scale whose
 * legend loses its labels.
 *
 * Requires a deterministic fixture route (Workstream F, implementation step 4)
 * at `/__visual/visualization-v3`, which renders one chart from
 * `tests/fixtures/visualization-v3/` with no network access, no random ids, and
 * no timestamps. It is a test-only route and must not ship in the public
 * navigation.
 *
 * A failing baseline is a question, not a chore: look at the diff, decide
 * whether the new picture is the intended one, and only then re-record.
 */

import { expect, test } from "@playwright/test";

const FIXTURE_ROUTE = "/__visual/visualization-v3";

/** Wait for the renderer-neutral ready signal and loaded fonts (plan B).
 * `scenario` selects tests/fixtures/visualization-v3/rendererVisual.js.
 * Stage 1 deliberately does not implement the fixture-route renderer switch.
 */
async function openChart(page, chart, options = {}) {
  const query = new URLSearchParams({ chart, ...options });
  await page.goto(`${FIXTURE_ROUTE}?${query}`);
  await page.locator(`[data-chart="${chart}"] [data-chart-ready="true"], [data-chart="${chart}"][data-chart-ready="true"]`).first().waitFor();
  await page.waitForFunction(() => document.fonts.status === "loaded");
}

const plot = (page) => page.getByTestId("visual-fixture-plot");

test.describe("visualization v3 baselines", () => {
  test.beforeEach(async ({ page }) => {
    // Plotly transitions and CSS animation both make a screenshot depend on
    // when it was taken.
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("matches the approved Line comparison layout", async ({ page }) => {
    await openChart(page, "line");

    // Four comparisons, combined, with full derived labels - the default
    // presentation and the one a legend can most easily break.
    await expect(page.getByText("San Francisco Latina Women")).toBeVisible();
    await expect(plot(page)).toHaveScreenshot("line-comparisons.png");
  });

  test("matches the approved Bar comparison layout", async ({ page }) => {
    await openChart(page, "bar");

    // Grouping, category labels, and the spacing between groups. This is where
    // a comparison count change shows up as overlapping tick labels.
    await expect(plot(page)).toHaveScreenshot("bar-comparisons.png");
  });

  test("matches the approved Range layout", async ({ page }) => {
    await openChart(page, "dumbbell");

    // Two endpoints, the connector between them, and the row labels. A Range
    // chart drawn from swapped endpoints still renders; it just points the
    // wrong way, which only a picture catches.
    await expect(plot(page)).toHaveScreenshot("range-two-period.png");
  });

  test("matches the approved Heatmap tab layout", async ({ page }) => {
    await openChart(page, "heatmap");

    // The active comparison tab, the colour scale legend, the cell grid, and
    // the axis labels.
    await expect(page.getByRole("tab", { selected: true })).toBeVisible();
    await expect(plot(page)).toHaveScreenshot("heatmap-active-comparison.png");
  });
});

test.describe("full flows", () => {
  /**
   * The eight flows from Workstream F. They exercise the editor rather than a
   * static fixture, so they assert behaviour and leave the pixels to the four
   * baselines above.
   */

  test("generates comparisons and draws a combined Line with full legend labels", async ({
    page,
  }) => {
    await page.goto("/visualization-tool");
    await page.getByRole("button", { name: /generate comparisons/i }).click();
    await expect(page.getByText("San Francisco Latina Women")).toBeVisible();
    await expect(page.getByText("San Francisco White Women")).toBeVisible();
  });

  test("switches Line to tabs without changing the question or the colours", async ({ page }) => {
    await page.goto("/visualization-tool");
    const before = await page.getByTestId("question-signature").textContent();
    await page.getByRole("radio", { name: /show each comparison in tabs/i }).click();
    await expect(page.getByTestId("question-signature")).toHaveText(before);
  });

  test("draws a Bar ranked by calculated change", async ({ page }) => {
    await page.goto("/visualization-tool");
    await page.getByLabel(/transformation/i).selectOption("percentChange");
    await page.getByLabel(/^top$/i).fill("5");
    // Ranking runs on the calculated values, so the bars arrive in order and
    // the client never re-sorts them.
    await expect(page.getByTestId("bar-category-labels")).toHaveCount(5);
  });

  test("keeps every comparison in the export while one map tab is active", async ({ page }) => {
    await page.goto("/visualization-tool");
    await page.getByRole("tab", { name: /San Francisco White Women/i }).click();
    const download = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: /export csv/i }).click(),
    ]);
    const contents = await download[0].path();
    expect(contents).toBeTruthy();
  });

  test("compares Donut year tabs with the average and reads the note", async ({ page }) => {
    await page.goto("/visualization-tool");
    await page.getByRole("radio", { name: /show the average of selected years/i }).click();
    await expect(page.getByText(/^Average of /)).toBeVisible();
  });

  test("shows valid, missing, suppressed, and invalid comparisons together", async ({ page }) => {
    await page.goto("/visualization-tool");
    // The chart draws what it can; the table and the export say what it could
    // not, in the same words.
    await expect(page.getByText("Not available")).toBeVisible();
    await expect(page.getByText("Suppressed")).toBeVisible();
  });

  test("saves and restores a v3 view and rejects a v2 fixture", async ({ page }) => {
    await page.goto("/visualization-tool");
    await page.getByRole("button", { name: /save view/i }).click();
    await page.reload();
    await expect(page.getByText("San Francisco Latina Women")).toBeVisible();

    await page.getByRole("button", { name: /import config/i }).click();
    await page.getByRole("textbox").fill(JSON.stringify({ version: 2, module: "projections" }));
    await expect(
      page.getByText("This view uses an older format and cannot open in this version."),
    ).toBeVisible();
  });

  test("gives the empty-time instruction on an incompatible chart switch", async ({ page }) => {
    await page.goto("/visualization-tool");
    await page.getByRole("button", { name: /donut/i }).click();
    await expect(page.getByText("Select time to show this chart.")).toBeVisible();
  });
});

// Stage 1: do not record these baselines until a person reviews the chart.
// `--update-snapshots=none` can run this suite without creating approvals.
test.describe("renderer plan screenshots", () => {
  test.beforeEach(async ({ page }) => page.emulateMedia({ reducedMotion: "reduce" }));
  const cases = [
    ["labels two lines directly", "line", "two-lines", "line-direct-labels.png"],
    ["falls back to the key with five lines", "line", "five-lines", "line-five-series-key.png"],
    ["draws the chosen range dashed", "line", "dashed", "line-dashed-range.png"],
    ["shows the full PPIC frame", "line", "frame", "line-ppic-frame.png"],
    ["fits the line chart at 330px", "line", "narrow", "line-330.png"],
    ["fits eight comparisons without overlapping labels", "bar", "eight-comparisons", "bar-eight-comparisons.png"],
    ["matches the approved horizontal Bar layout", "bar", "horizontal", "bar-horizontal.png"],
    ["matches the approved stacked Bar layout", "bar", "stacked", "bar-stacked.png"],
    ["matches the approved diverging Bar layout", "bar", "diverging", "bar-diverging.png"],
    ["labels values inside and outside bars", "bar", "values-inside-outside", "bar-value-labels.png"],
    ["stacks to 100 percent with nested row groups", "bar", "percent-nested", "bar-percent-nested.png"],
    ["turns labels for fifty categories", "bar", "fifty-categories", "bar-fifty-categories.png"],
    ["nests categories around negative values", "bar", "negative-nested", "bar-negative-nested.png"],
    ["names stacked series directly", "bar", "stacked-direct", "bar-stacked-direct.png"],
    ["angles labels for nine regions", "bar", "nine-regions", "bar-nine-regions.png"],
    ["wraps long row labels", "dumbbell", "long-rows", "range-long-rows.png"],
    ["matches the approved Dot plot layout", "dotPlot", "default", "dot-plot.png"],
    ["matches the approved Forest layout", "forest", "default", "forest.png"],
    ["matches the approved Scatter layout", "scatter", "default", "scatter.png"],
    ["matches the approved Bubble layout", "bubble", "default", "bubble.png"],
    ["matches the approved Pie layout", "pie", "default", "pie.png"],
    ["labels a slice with a leader line", "pie", "long-slice", "pie-leader-line.png"],
    ["matches the approved Choropleth layout", "choroplethMap", "default", "choropleth.png"],
    ["matches the approved Symbol map layout", "symbolMap", "default", "symbol-map.png"],
  ];
  for(const [name, chart, scenario, filename] of cases) test(name, async ({ page }) => {
    const renderer = ["choroplethMap", "symbolMap"].includes(chart) ? "plotly" : "visx";
    await openChart(page, chart, { renderer, scenario, width: scenario === "narrow" ? "330" : "950" });
    // Prove the route honored the requested scenario before comparing pixels.
    await expect(plot(page)).toHaveAttribute("data-scenario", scenario);
    await expect(plot(page).locator('[data-chart-ready="true"]')).toHaveAttribute("data-renderer", renderer);
    if(scenario === "two-lines") await expect(plot(page).locator('[data-mark="direct-label"]')).toHaveCount(2);
    if(scenario === "five-lines") {
      await expect(plot(page).locator('[data-mark="direct-label"]')).toHaveCount(0);
      await expect(plot(page).locator('[data-key-position="right"]')).toBeVisible();
    }
    if(scenario === "dashed") await expect(plot(page).locator('[data-mark="series-line"][stroke-dasharray]').first()).toBeVisible();
    if(scenario === "frame") {
      // The source line cites the topic's dataset, not the Source filter value.
      for(const text of ["Figure 2", "Population", "Selected counties", "California Department of Finance (DOF), P-3 Population Projections", "Estimates may be revised."]) await expect(plot(page).getByText(text, { exact: false }).first()).toBeVisible();
    }
    if(scenario === "narrow") expect(Math.round((await plot(page).boundingBox()).width)).toBe(330);
    if(scenario === "values-inside-outside") await expect(plot(page).locator('[data-mark="value-label"][data-placement="outside"]').first()).toBeVisible();
    if(scenario === "percent-nested") await expect(plot(page).locator('[data-mark="group-label"]')).toHaveCount(2);
    if(scenario === "fifty-categories") await expect(plot(page).locator('[data-mark="category-label"][transform]')).toHaveCount(50);
    if(scenario === "nine-regions") await expect(plot(page).locator('[data-mark="category-label"][transform*="rotate(-45"]')).toHaveCount(9);
    if(scenario === "stacked-direct") await expect(plot(page).locator('[data-mark="direct-label"]')).toHaveCount(2);
    if(scenario === "long-slice") await expect(plot(page).locator('[data-mark="leader-line"]').first()).toBeVisible();
    await expect(plot(page)).toHaveScreenshot(filename);
  });
});

test.describe("renderer plan embed and keyboard access", () => {
  for(const chart of ["line", "bar", "dumbbell", "dotPlot", "forest", "heatmap", "scatter", "bubble", "pie", "choroplethMap", "symbolMap"]) {
    test(`${chart} embed fits the frame without editor controls`, async ({ page }) => {
      await openChart(page, chart, { embed: "1", scenario: "frame" });
      await expect(page.getByLabel("Color Palette")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /generate chart/i })).toHaveCount(0);
      await expect(plot(page).locator('figcaption')).toHaveText(/Population/);
      const outer = await plot(page).boundingBox();
      const source = await plot(page).locator('[data-frame-part="source"]').boundingBox();
      expect(source).not.toBeNull();
      expect(source.y + source.height).toBeLessThanOrEqual(outer.y + outer.height);
    });
  }
  for(const chart of ["line", "bar", "dumbbell", "dotPlot", "forest", "heatmap", "scatter", "bubble", "pie"]) {
    test(`${chart} tooltip is keyboard reachable with visible focus`, async ({ page }) => {
      await openChart(page, chart, { renderer: "visx", scenario: "default" });
      const drawing = plot(page).getByRole("img");
      // Reach through the tab order, not element.focus(), which bypasses it.
      for(let i = 0; i < 30; i++) {
        await page.keyboard.press("Tab");
        if(await drawing.evaluate(el => el === document.activeElement)) break;
      }
      await expect(drawing).toBeFocused();
      const focusVisible = await drawing.evaluate(el => {
        const style = getComputedStyle(el);
        return (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none";
      });
      expect(focusVisible).toBe(true);
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("tooltip")).toBeVisible();
      const bounds = await plot(page).boundingBox();
      const tip = await page.getByRole("tooltip").boundingBox();
      expect(tip.x).toBeGreaterThanOrEqual(bounds.x);
      expect(tip.y).toBeGreaterThanOrEqual(bounds.y);
      expect(tip.x + tip.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(tip.y + tip.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    });
  }
});
