/** Workstreams 6–8. Real component, real edits; no mocked selection/keymap. */
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SpreadsheetGrid from "@/components/chart-builder/data-grid/SpreadsheetGrid";
import { gridTable } from "@/tests/fixtures/spreadsheet-grid";
import { active, cell, clipboard, drag, editor, enter, grid, key, letter, menuItem, mountGrid, pointer, row, rowHeader, select, selected } from "./spreadsheetTestUtils";

beforeEach(() => vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel"));
afterEach(() => vi.restoreAllMocks());
const mount = (props) => mountGrid(SpreadsheetGrid, props);
const fillHandle = () => screen.getByRole("button", { name: "Fill selection" });

describe("spreadsheet shell", () => {
  it("draws letters, a numbered gutter with the header as row 1, and type pills", () => {
    mount({ usage: { Yes: "Value" } });
    for (const name of ["A", "B", "C"]) expect(letter(name)).toBeInTheDocument();
    for (const r of [1, 2, 3, 4, 5]) expect(rowHeader(r)).toHaveTextContent(String(r));
    expect(cell(1, 1)).toHaveTextContent("Region");
    expect(screen.getByRole("combobox", { name: "Kind for Region" })).toHaveTextContent("text");
    expect(screen.queryByText("Abc")).not.toBeInTheDocument();
    expect(cell(1, 2)).toHaveTextContent("Value");
    expect(cell(5, 1)).toHaveTextContent(/^$/);
  });

  it("keeps the letter row, header row, and gutter sticky", () => {
    mount();
    for (const element of [letter("A").closest('[data-sticky="top"]'), row(1), rowHeader(2)]) {
      expect(element).toHaveAttribute("data-sticky");
      expect(element).toHaveClass("sticky");
    }
    fireEvent.scroll(grid(), { target: { scrollLeft: 200, scrollTop: 32 } });
    expect(grid().querySelectorAll('[data-column-letter="A"]')).toHaveLength(1);
    expect(within(grid()).getAllByText("North")).toHaveLength(1);
  });

  it("tints the active and selected rows and columns and outlines the active cell", () => {
    mount();
    select(cell(2, 2));
    selected(2, 2);
    active(2, 2);
    expect(cell(2, 2)).toHaveClass("outline-solid", "outline-3", "outline-ppic-orange-200");
    expect(letter("B").className).toContain("ppic-orange-50");
    expect(rowHeader(2).className).toContain("ppic-orange-50");
    select(cell(4, 3), { shiftKey: true });
    for (const r of [2, 3, 4]) for (const c of [2, 3]) {
      selected(r, c);
      expect(cell(r, c).className).toContain("ppic-orange-50");
    }
    selected(2, 1, false);
  });

  it("marks formula cells, errors, marked rows, and ignored columns", () => {
    const initial = gridTable();
    initial.formulas = { "0:2": "=100-B2", "1:2": "=Z99" };
    initial.rows[1][2] = "#REF!";
    initial.rows[2][1] = "bad number";
    initial.rowMarks = { 2: "total" };
    initial.columns[0].ignored = true;
    mount({ initial });
    expect(cell(2, 3)).toHaveTextContent("60");
    expect(within(cell(2, 3)).getByTitle("=100-B2")).toBeInTheDocument();
    expect(cell(3, 3)).toHaveTextContent("#REF!");
    expect(cell(3, 3)).toHaveAttribute("aria-invalid", "true");
    expect(cell(4, 2)).toHaveAttribute("aria-invalid", "true");
    expect(rowHeader(4)).toHaveTextContent("Total");
    expect(cell(1, 1)).toHaveTextContent("ignored");
  });

  it("draws only the rows in view above 200 rows and reports the full size", () => {
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(320);
    const initial = { ...gridTable(), rows: Array.from({ length: 50000 }, (_, i) => [`Region ${i}`, String(i), "1"]) };
    mount({ initial });
    expect(grid()).toHaveAttribute("aria-rowcount", "50002"); // Header + data + trailing row, not letter chrome.
    expect(grid()).toHaveAttribute("aria-colcount", "3");
    expect(within(grid()).getAllByRole("row").length).toBeLessThanOrEqual(34);
    fireEvent.scroll(grid(), { target: { scrollTop: 32000 } });
    expect(screen.getByText("Region 1000")).toBeInTheDocument();
    expect(screen.queryByText("Region 0")).not.toBeInTheDocument();
    expect(within(grid()).getAllByRole("row").length).toBeLessThanOrEqual(34);
    expect(row(1002)).toHaveAttribute("aria-rowindex", "1002");
  });

  it("selects and scrolls to a requested cell, showing a hidden column", () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    const view = mount();
    fireEvent.contextMenu(letter("B"));
    fireEvent.click(menuItem("Hide"));
    expect(grid().querySelector('[data-column-letter="B"]')).toBeNull();
    // Existing focus prop uses DATA coordinates, unlike grid selection ranges.
    view.refocus({ key: "finding-1", row: 1, col: 1 });
    expect(letter("B")).toBeInTheDocument();
    active(3, 2);
    selected(3, 2);
    expect(scroll).toHaveBeenCalled();
  });

  it("exposes grid roles, the active descendant, and a live announcement", () => {
    mount();
    select(cell(2, 2));
    expect(grid()).toHaveFocus();
    active(2, 2);
    expect(cell(2, 2)).toHaveAttribute("role", "gridcell");
    expect(cell(1, 2)).toHaveAttribute("role", "columnheader");
    drag(cell(2, 2), cell(3, 2));
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).toHaveTextContent(/B2.*B3/);
    expect(live).toHaveTextContent(/Sum.*70/);
  });
});

describe("spreadsheet pointer", () => {
  it("drags across cells to select a range", () => {
    mount();
    drag(cell(2, 1), cell(4, 2));
    for (const r of [2, 3, 4]) for (const c of [1, 2]) selected(r, c);
    selected(2, 3, false);
  });

  it("extends with Shift and adds ranges with Cmd", () => {
    mount();
    select(cell(2, 1));
    select(cell(3, 2), { shiftKey: true });
    select(cell(4, 3), { metaKey: true });
    for (const [r, c] of [[2, 1], [2, 2], [3, 1], [3, 2], [4, 3]]) selected(r, c);
    selected(2, 3, false);
    active(4, 3);
  });

  it("selects columns and rows from their headers, several with Shift and Cmd", () => {
    mount();
    select(letter("A"));
    select(letter("B"), { shiftKey: true });
    select(letter("C"), { metaKey: true });
    for (const c of [1, 2, 3]) for (const r of [1, 2, 3, 4]) selected(r, c);
    select(rowHeader(2));
    select(rowHeader(3), { shiftKey: true });
    select(rowHeader(4), { metaKey: true });
    for (const r of [2, 3, 4]) for (const c of [1, 2, 3]) selected(r, c);
    selected(1, 1, false);
  });

  it("drags selected columns to a new place, with a drop line, as one edit", () => {
    const view = mount();
    select(letter("C"));
    pointer(letter("C"), "pointerDown");
    pointer(letter("A"), "pointerEnter");
    expect(screen.getByRole("separator", { name: /move/i })).toBeInTheDocument();
    expect(view.changed).not.toHaveBeenCalled();
    pointer(window, "pointerUp");
    expect(view.changed).toHaveBeenCalledTimes(1);
    expect(view.next().columns.map((c) => c.name)).toEqual(["No", "Region", "Yes"]);
    expect(view.next().rows[0]).toEqual(["60", "North", "40"]);
  });

  it("drags selected rows to a new place, as one edit", () => {
    const view = mount();
    select(rowHeader(4));
    drag(rowHeader(4), rowHeader(2));
    expect(view.changed).toHaveBeenCalledTimes(1);
    expect(view.next().rows.map((r) => r[0])).toEqual(["West", "North", "South"]);
  });

  it("cancels a move with Esc", () => {
    const view = mount();
    select(letter("C"));
    pointer(letter("C"), "pointerDown");
    pointer(letter("A"), "pointerEnter");
    key("Escape");
    pointer(window, "pointerUp");
    expect(view.changed).not.toHaveBeenCalled();
    expect(screen.queryByRole("separator", { name: /move/i })).not.toBeInTheDocument();
    drag(letter("C"), letter("C"));
    expect(view.changed).not.toHaveBeenCalled();
  });

  it("drags the fill handle to extend a series", () => {
    const initial = gridTable();
    initial.rows[2][1] = "999";
    const view = mount({ initial });
    drag(cell(2, 2), cell(3, 2));
    drag(fillHandle(), cell(4, 2));
    expect(view.changed).toHaveBeenCalledTimes(1);
    expect(view.next().rows.map((r) => r[1])).toEqual(["40", "30", "20"]);
    select(cell(2, 3));
    drag(fillHandle(), cell(4, 3), { altKey: true });
    expect(view.changed).toHaveBeenCalledTimes(2);
    expect(view.next().rows.map((r) => r[2])).toEqual(["60", "61", "62"]);
  });

  it("double-clicks the fill handle to fill to the end of the data", () => {
    const initial = gridTable();
    initial.rows[1][1] = "";
    initial.rows[2][1] = "";
    const view = mount({ initial });
    select(cell(2, 2));
    fireEvent.doubleClick(fillHandle());
    expect(view.changed).toHaveBeenCalledTimes(1);
    expect(view.next().rows.map((r) => r[1])).toEqual(["40", "40", "40"]);
  });

  it("resizes and fits a column", () => {
    mount();
    const handle = screen.getByRole("separator", { name: "Resize column B" });
    pointer(handle, "pointerDown", { clientX: 200 });
    pointer(window, "pointerMove", { clientX: -1000 });
    pointer(window, "pointerUp");
    expect(cell(2, 2)).toHaveStyle({ width: "48px" });
    fireEvent.doubleClick(handle);
    // Autofit defaults are bounded at 96..320 px.
    const width = Number.parseFloat(getComputedStyle(cell(2, 2)).width);
    expect(width).toBeGreaterThanOrEqual(96);
    expect(width).toBeLessThanOrEqual(320);
  });

  it("selects with a tap and opens no drag on touch", () => {
    const view = mount();
    select(cell(2, 2), { pointerType: "touch" });
    selected(2, 2);
    drag(cell(2, 2), cell(4, 3), { pointerType: "touch" });
    selected(4, 3, false);
    select(letter("C"), { pointerType: "touch" });
    drag(letter("C"), letter("A"), { pointerType: "touch" });
    expect(view.changed).not.toHaveBeenCalled();
    expect(within(grid()).queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("spreadsheet keyboard and editing", () => {
  it("moves, extends, and jumps with the arrow keys", () => {
    mount();
    select(cell(2, 2));
    key("ArrowDown");
    active(3, 2);
    key("ArrowRight", { shiftKey: true });
    selected(3, 2); selected(3, 3);
    select(cell(2, 2));
    key("ArrowDown", { metaKey: true });
    active(4, 2);
    key("ArrowUp", { metaKey: true, shiftKey: true });
    selected(2, 2); selected(3, 2); selected(4, 2);
  });

  it("selects a row with Shift+Space and a column with Ctrl+Space", () => {
    mount();
    select(cell(3, 2));
    key(" ", { shiftKey: true });
    for (const c of [1, 2, 3]) selected(3, c);
    select(cell(3, 2));
    key(" ", { ctrlKey: true });
    for (const r of [1, 2, 3, 4]) selected(r, 2);
  });

  it("selects everything with Cmd+A", () => {
    mount();
    select(cell(2, 2));
    key("a", { metaKey: true });
    key("a", { metaKey: true });
    for (const r of [1, 2, 3, 4]) for (const c of [1, 2, 3]) selected(r, c);
  });

  it("types to replace a cell and commits with Enter, moving down", () => {
    const view = mount();
    select(cell(2, 2));
    key("9");
    expect(editor()).toHaveValue("9");
    expect(view.changed).not.toHaveBeenCalled();
    enter("95");
    expect(view.changed).toHaveBeenCalledTimes(1);
    expect(view.next().rows[0][1]).toBe("95");
    active(3, 2);
  });

  it("starts editing on Enter in Sheets and moves down on Enter in Excel", () => {
    const sheets = mount();
    select(cell(2, 2));
    key("Enter");
    expect(editor()).toHaveValue("40");
    sheets.unmount();
    localStorage.setItem("visualizationTool.gridShortcutScheme", "excel");
    const excel = mount();
    select(cell(2, 2));
    key("Enter");
    active(3, 2);
    expect(within(grid()).queryByRole("textbox")).not.toBeInTheDocument();
    expect(excel.changed).not.toHaveBeenCalled();
  });

  it("cancels with Esc and edits in place with F2", () => {
    const view = mount();
    select(cell(2, 2));
    key("F2");
    expect(editor()).toHaveValue("40");
    fireEvent.change(editor(), { target: { value: "999" } });
    fireEvent.keyDown(editor(), { key: "Escape" });
    expect(view.changed).not.toHaveBeenCalled();
    expect(cell(2, 2)).toHaveTextContent("40");
    active(2, 2);
  });

  it("writes the entry into every selected cell with Cmd+Enter, as one edit", () => {
    const view = mount();
    drag(cell(2, 2), cell(3, 3));
    key("7");
    enter("7", { metaKey: true });
    expect(view.changed).toHaveBeenCalledTimes(1);
    expect(view.next().rows).toEqual([["North", "7", "7"], ["South", "7", "7"], ["West", "20", "80"]]);
  });

  it("inserts a reference by arrowing or clicking while typing a formula", () => {
    const view = mount();
    select(cell(2, 3));
    key("=");
    fireEvent.keyDown(editor(), { key: "ArrowLeft" });
    expect(editor()).toHaveValue("=B2");
    select(cell(3, 2));
    expect(editor()).toHaveValue("=B3");
    fireEvent.keyDown(editor(), { key: "Enter" });
    expect(view.next().formulas).toEqual({ "0:2": "=B3" });
    expect(view.next().rows[0][2]).toBe("30");
  });

  it("inserts a range in point mode and leaves point mode when typing resumes", () => {
    mount();
    select(cell(2, 3));
    key("=");
    fireEvent.change(editor(), { target: { value: "=SUM(" } });
    editor().setSelectionRange(5, 5);
    drag(cell(2, 2), cell(4, 2));
    expect(editor()).toHaveValue("=SUM(B2:B4");
    fireEvent.change(editor(), { target: { value: "=SUM(B2:B4)+2" } });
    const text = editor().value;
    fireEvent.keyDown(editor(), { key: "ArrowLeft" });
    expect(editor()).toHaveValue(text);
  });

  it("renames a column by editing its header cell", () => {
    const initial = { ...gridTable(), formulas: { "0:2": "=[Yes]*2" } };
    const view = mount({ initial });
    fireEvent.doubleClick(cell(1, 2));
    enter("Agree");
    expect(view.next().columns[1].name).toBe("Agree");
    expect(view.next().formulas["0:2"]).toBe("=[Agree]*2");
    fireEvent.doubleClick(cell(1, 2));
    enter("");
    expect(cell(1, 2)).toHaveTextContent("Agree");
  });

  it("adds a row when the trailing blank row is filled", () => {
    const view = mount();
    select(cell(5, 1));
    key("E");
    enter("East");
    expect(view.changed).toHaveBeenCalledTimes(1);
    expect(view.next().rows[3]).toEqual(["East", "", ""]);
    expect(cell(6, 1)).toHaveTextContent(/^$/);
  });

  it("clears the selection with Delete", () => {
    const initial = { ...gridTable(), formulas: { "0:2": "=100-B2" } };
    const view = mount({ initial });
    drag(cell(2, 2), cell(3, 3));
    key("Delete");
    expect(view.changed).toHaveBeenCalledTimes(1);
    expect(view.next().rows).toEqual([["North", "", ""], ["South", "", ""], ["West", "20", "80"]]);
    expect(view.next().formulas).toEqual({});
  });

  it("copies a range and pastes it as one edit, through clipboard events", () => {
    const view = mount();
    drag(cell(2, 2), cell(2, 3));
    const data = clipboard();
    fireEvent.copy(grid(), { clipboardData: data });
    expect(data.getData("text/plain")).toBe("40\t60");
    expect(data.getData("text/html")).toContain("<table");
    expect(view.changed).not.toHaveBeenCalled();
    select(cell(3, 2));
    fireEvent.paste(grid(), { clipboardData: data });
    expect(view.changed).toHaveBeenCalledTimes(1);
    expect(view.next().rows[1]).toEqual(["South", "40", "60"]);
  });

  it("cuts and pastes, clearing the source", () => {
    const view = mount();
    drag(cell(2, 2), cell(2, 3));
    const data = clipboard();
    fireEvent.cut(grid(), { clipboardData: data });
    expect(view.changed).not.toHaveBeenCalled();
    expect(cell(2, 2)).toHaveAttribute("data-cut", "true");
    select(cell(3, 2));
    fireEvent.paste(grid(), { clipboardData: data });
    expect(view.changed).toHaveBeenCalledTimes(1);
    expect(view.next().rows.slice(0, 2)).toEqual([["North", "", ""], ["South", "40", "60"]]);
    expect(grid().querySelector('[data-cut="true"]')).toBeNull();
  });

  it("cancels an unpasted cut without changing the data", () => {
    const view = mount();
    select(cell(2, 2));
    fireEvent.cut(grid(), { clipboardData: clipboard() });
    key("Escape");
    expect(view.changed).not.toHaveBeenCalled();
    expect(cell(2, 2)).toHaveTextContent("40");
    expect(grid().querySelector('[data-cut="true"]')).toBeNull();
  });

  it("keeps formula origins when a browser strips custom clipboard formats", () => {
    const initial = { ...gridTable(), formulas: { "0:2": "=B2*2" } };
    const view = mount({ initial });
    select(cell(2, 3));
    const data = clipboard();
    fireEvent.copy(grid(), { clipboardData: data });
    const native = clipboard({ "text/html": data.getData("text/html"), "text/plain": data.getData("text/plain") });
    select(cell(3, 3));
    fireEvent.paste(grid(), { clipboardData: native });
    expect(view.next().formulas["1:2"]).toBe("=B3*2");
    expect(view.next().rows[1][2]).toBe("60");
  });

  it("pastes aligned disjoint ranges with each formula's actual source coordinates", () => {
    const initial = { ...gridTable(), formulas: { "0:2": "=B2*2" } };
    const view = mount({ initial });
    select(cell(2, 1));
    select(cell(2, 3), { metaKey: true });
    const data = clipboard();
    fireEvent.copy(grid(), { clipboardData: data });
    select(cell(3, 1));
    fireEvent.paste(grid(), { clipboardData: data });
    expect(view.next().rows[1][0]).toBe("North");
    expect(view.next().formulas["1:1"]).toBe("=A3*2");
  });

  it("moves a column after the final column when dragging to the right", () => {
    const view = mount();
    select(letter("A"));
    drag(letter("A"), letter("C"));
    expect(view.next().columns.map((column) => column.name)).toEqual(["Yes", "No", "Region"]);
  });

  it("does not edit on a touch double tap", () => {
    mount();
    select(cell(2, 2), { pointerType: "touch" });
    fireEvent.doubleClick(cell(2, 2));
    expect(within(grid()).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("pastes values only after choosing the menu action and pressing the native paste key", () => {
    const initial = { ...gridTable(), formulas: { "0:2": "=B2*2" } };
    const view = mount({ initial });
    select(cell(2, 3));
    const data = clipboard();
    fireEvent.copy(grid(), { clipboardData: data });
    fireEvent.contextMenu(cell(3, 3));
    fireEvent.click(menuItem("Paste values only"));
    key("v", { metaKey: true });
    fireEvent.paste(grid(), { clipboardData: data });
    expect(view.next().rows[1][2]).toBe("80");
    expect(view.next().formulas).toEqual({ "0:2": "=B2*2" });
  });

  it("moves relative formula references when filling the entry into the selection", () => {
    const view = mount();
    drag(cell(2, 3), cell(4, 3));
    key("=");
    enter("=B2+$B$2", { metaKey: true });
    expect(view.changed).toHaveBeenCalledTimes(1);
    expect(view.next().formulas).toEqual({ "0:2": "=B2+$B$2", "1:2": "=B3+$B$2", "2:2": "=B4+$B$2" });
  });

  it("fills down and right with Cmd+D and Cmd+R", () => {
    const view = mount();
    drag(cell(2, 2), cell(4, 2));
    key("d", { metaKey: true });
    expect(view.changed).toHaveBeenCalledTimes(1);
    expect(view.next().rows.map((r) => r[1])).toEqual(["40", "40", "40"]);
    drag(cell(2, 2), cell(2, 3));
    key("r", { metaKey: true });
    expect(view.changed).toHaveBeenCalledTimes(2);
    expect(view.next().rows[0]).toEqual(["North", "40", "40"]);
  });

  it("calls undo and redo with the scheme's keys", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    mount({ onUndo, onRedo });
    select(cell(2, 2));
    key("z", { metaKey: true });
    key("Z", { metaKey: true, shiftKey: true });
    key("y", { metaKey: true });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(2);
  });

  it.each(["sheets", "excel"])("inserts and deletes rows or columns with the scheme's keys: %s", (scheme) => {
    localStorage.setItem("visualizationTool.gridShortcutScheme", scheme);
    const view = mount();
    const insert = scheme === "sheets" ? { metaKey: true, altKey: true, code: "Equal" } : { ctrlKey: true, shiftKey: true, code: "Equal" };
    const remove = scheme === "sheets" ? { metaKey: true, altKey: true, code: "Minus" } : { ctrlKey: true, code: "Minus" };
    select(rowHeader(3));
    key("=", insert);
    expect(view.changed).toHaveBeenCalledTimes(1);
    expect(view.next().rows[1]).toEqual(["", "", ""]);
    select(rowHeader(3));
    key("-", remove);
    expect(view.next().rows).toEqual(gridTable().rows);
    select(letter("B"));
    key("=", insert);
    expect(view.next().columns).toHaveLength(4);
    select(letter("B"));
    key("-", remove);
    expect(view.next().columns).toEqual(gridTable().columns);
    expect(view.changed).toHaveBeenCalledTimes(4);
  });

  it("wraps committed Enter and Tab moves within the selected range", () => {
    mount();
    drag(cell(2, 2), cell(3, 3));
    key("F2");
    enter("5");
    active(3, 2);
    key("F2");
    enter("6");
    active(2, 3);
    key("F2");
    fireEvent.keyDown(editor(), { key: "Tab" });
    active(3, 2);
    selected(2, 2); selected(3, 3);
  });
});
