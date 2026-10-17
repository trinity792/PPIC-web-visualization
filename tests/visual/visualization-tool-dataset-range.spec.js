/** Stage 1: assert the real import flow; record a baseline after owner review. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("matches the approved monthly line layout", async ({ page }) => {
  const text = readFileSync(path.resolve("tests/fixtures/byod-shapes/wide-monthly-shares.txt"), "utf8");
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/visualization-tool");
  await page.getByRole("textbox", { name: /paste/i }).fill(text);
  await page.getByRole("button", { name: "Use pasted data", exact: true }).click();
  await page.getByRole("button", { name: "Proceed", exact: true }).click();
  const chart = page.locator('[data-chart-ready="true"]').first();
  await expect(chart).toBeVisible();
  await expect(chart.locator('[data-mark="series-line"]')).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready);
  expect(errors).toEqual([]);
  await expect(chart).toHaveScreenshot("byod-wide-monthly-shares.png");
});
