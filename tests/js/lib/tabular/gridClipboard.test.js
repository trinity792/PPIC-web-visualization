/** Workstream 3. The specification wins over the plan's null fallback. */
import { expect, it } from "vitest";
import { parseClipboard, rangeToClipboard, selectionToClipboard } from "@/lib/tabular/gridClipboard";
import { gridTable, range, selection } from "@/tests/fixtures/spreadsheet-grid";

const htmlRows = (html) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("br").forEach((br) => br.replaceWith(doc.createTextNode("\n")));
  return [...doc.querySelectorAll("tr")].map((row) => [...row.querySelectorAll("td,th")].map((cell) => cell.textContent));
};

it("copies a range as tab-separated text and an HTML table", () => {
  const result = rangeToClipboard(gridTable(), range(1, 0, 2, 1), {});
  expect(result.text).toBe("North\t40\nSouth\t30");
  expect(htmlRows(result.html)).toEqual([["North", "40"], ["South", "30"]]);
  expect(rangeToClipboard(gridTable(), range(0, 0, 1, 1), {}).text).toBe("Region\tYes\nNorth\t40");
});

it("quotes cells with tabs, newlines, and quotes", () => {
  const table = { ...gridTable(), rows: [['a\tb', 'two\nlines', 'say "yes"'], ["<img src=x>", "A&B", ""]] };
  const result = rangeToClipboard(table, range(1, 0, 2, 2), {});
  expect(result.text).toBe('"a\tb"\t"two\nlines"\t"say ""yes"""\n<img src=x>\tA&B\t');
  expect(htmlRows(result.html)).toEqual(table.rows);
  expect(new DOMParser().parseFromString(result.html, "text/html").querySelector("img")).toBeNull();
});

it("copies formulas for pasting back here and values for elsewhere", () => {
  const table = { ...gridTable(), formulas: { "0:2": "=100-B2" } };
  const internal = rangeToClipboard(table, range(1, 1, 1, 2), { formulas: true });
  expect(internal.text).toBe("40\t=100-B2");
  expect(htmlRows(internal.html)).toEqual([["40", "60"]]);
  const cells = new DOMParser().parseFromString(internal.html, "text/html").querySelectorAll("td");
  expect([...cells[1].attributes].some((attr) => attr.value === "=100-B2")).toBe(true);
  const external = rangeToClipboard(table, range(1, 1, 1, 2), { formulas: false });
  expect(external.text).toBe("40\t60");
});

it("copies several ranges as one block only when they line up", () => {
  const table = gridTable();
  const alignedRows = { ...selection(1, 2, 2, 2), ranges: [range(1, 0, 2, 0), range(1, 2, 2, 2)] };
  expect(selectionToClipboard(table, alignedRows).text).toBe("North\t60\nSouth\t70");
  const alignedColumns = { ...selection(3, 0, 3, 1), ranges: [range(1, 0, 1, 1), range(3, 0, 3, 1)] };
  expect(selectionToClipboard(table, alignedColumns).text).toBe("North\t40\nWest\t20");
  const unaligned = { ...selection(3, 2), ranges: [range(1, 0), range(3, 2)] };
  expect(selectionToClipboard(table, unaligned).text).toBe("80");
});

it("reads an Excel HTML table, including merged and multi-line cells", () => {
  const html = '<html><body><!--StartFragment--><table><tr><td rowspan="2">North</td><td colspan="2">Jobs<br>2026</td></tr><tr><td>1 &amp; 2</td><td>3</td></tr></table><!--EndFragment--></body></html>';
  expect(parseClipboard({ html, text: "wrong\ttext" })).toEqual([["North", "Jobs\n2026", ""], ["", "1 & 2", "3"]]);
});

it("falls back to tab-separated text with quoted cells", () => {
  expect(parseClipboard({ html: "<b>no table</b>", text: '"a\tb"\t"two\nlines"\t"say ""yes"""\r\nx\t\ty\r\n' }))
    .toEqual([["a\tb", "two\nlines", 'say "yes"'], ["x", "", "y"]]);
});
