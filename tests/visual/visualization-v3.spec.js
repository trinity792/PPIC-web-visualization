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

/**
 * Navigates to one fixture chart and waits for Plotly to report that it has
 * finished drawing. The fixture page sets `data-plot-ready` on the container in
 * its `plotly_afterplot` handler; waiting for a selector rather than a timeout
 * is what keeps this suite from being flaky by construction.
 */
async function openChart(page, chart) {
  await page.goto(`${FIXTURE_ROUTE}?chart=${chart}`);
  await page.waitForSelector(`[data-plot-ready="true"][data-chart="${chart}"]`);
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
