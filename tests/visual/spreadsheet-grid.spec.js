/** Real-browser spreadsheet checks: native clipboard, pointer capture and sticky layout. */
import { expect, test } from "@playwright/test";

const cell = (page, row, col) => page.locator(`[role="grid"] [role="row"][aria-rowindex="${row}"] [aria-colindex="${col}"]`);
const letter = (page, col) => page.locator(`[data-column-letter="${col}"]`);
async function importTable(page, text = "Region\tYes\tNo\nNorth\t40\t60\nSouth\t30\t70\nWest\t20\t80") {
  await page.goto("/visualization-tool");
  await page.getByRole("textbox", { name: /paste/i }).fill(text);
  await page.getByRole("button", { name: "Use pasted data", exact: true }).click();
  await expect(page.getByRole("grid")).toBeVisible();
  return await page.evaluate(() => /mac/i.test(navigator.userAgentData?.platform || navigator.platform) ? "Meta" : "Control");
}
async function drag(page, from, to) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

test("selects, fills, moves and undoes through the actual import screen", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const mod = await importTable(page);
  await drag(page, cell(page, 2, 2), cell(page, 3, 2));
  await expect(cell(page, 3, 2)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press(`${mod}+d`);
  await expect(cell(page, 3, 2)).toHaveText("40");
  await page.keyboard.press(`${mod}+z`);
  await expect(cell(page, 3, 2)).toHaveText("30");
  await letter(page, "C").click();
  await drag(page, letter(page, "C"), letter(page, "A"));
  await expect(cell(page, 2, 1)).toHaveText("60");
  await page.keyboard.press(`${mod}+z`);
  await expect(cell(page, 2, 1)).toHaveText("North");
  await cell(page, 2, 2).click();
  await page.keyboard.type("75");
  await page.keyboard.press("Enter");
  await expect(cell(page, 2, 2)).toHaveText("75");
  expect(errors).toEqual([]);
});

test("round-trips formulas internally while copying values to the system clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const mod = await importTable(page);
  // Playwright's Desktop Chrome profile emulates a Windows user agent, while
  // system clipboard accelerators still belong to the actual browser host.
  const clipboardMod = await page.evaluate(() => /mac/i.test(navigator.platform) ? "Meta" : "Control");
  await cell(page, 2, 3).dblclick();
  await page.getByRole("textbox", { name: "Edit cell", exact: true }).fill("=B2*2");
  await page.keyboard.press("Enter");
  await cell(page, 2, 3).click();
  await page.keyboard.press(`${clipboardMod}+c`);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("80");
  await cell(page, 3, 3).click();
  await page.keyboard.press(`${clipboardMod}+v`);
  await expect(cell(page, 3, 3)).toHaveText("60");
  await expect(page.getByRole("textbox", { name: "Cell C3", exact: true })).toHaveValue("=B3*2");
  await page.keyboard.press(`${mod}+z`);
  await expect(cell(page, 3, 3)).toHaveText("70");
  await cell(page, 2, 2).click();
  await page.keyboard.press(`${clipboardMod}+x`);
  await cell(page, 4, 2).click();
  await page.keyboard.press(`${clipboardMod}+v`);
  await expect(cell(page, 2, 2)).toHaveText("");
  await expect(cell(page, 4, 2)).toHaveText("40");
  await cell(page, 2, 3).click();
  await expect(page.getByRole("textbox", { name: "Cell C2", exact: true })).toHaveValue("=B4*2");
  await expect(cell(page, 2, 3)).toHaveText("80");
  await page.keyboard.press(`${mod}+z`);
  await expect(cell(page, 2, 2)).toHaveText("40");
  await expect(page.getByRole("textbox", { name: "Cell C2", exact: true })).toHaveValue("=B2*2");
});

test("keeps the two header rows and gutter fixed while virtual rows scroll", async ({ page }) => {
  const text = "Region\tYes\tNo\n" + Array.from({ length: 1000 }, (_, i) => `Region ${i}\t${i}\t${i + 1}`).join("\n");
  await importTable(page, text);
  const grid = page.getByRole("grid");
  const before = await letter(page, "A").boundingBox();
  const headerBefore = await cell(page, 1, 1).boundingBox();
  await grid.evaluate((node) => { node.scrollTop = 16000; });
  await expect(page.getByText("Region 500", { exact: true })).toBeVisible();
  const after = await letter(page, "A").boundingBox();
  const headerAfter = await cell(page, 1, 1).boundingBox();
  expect(after.y).toBe(before.y);
  expect(headerAfter.y).toBe(headerBefore.y);
  expect(await grid.getByRole("row").count()).toBeLessThan(40);
  await expect(letter(page, "A")).toHaveCount(1);
});
