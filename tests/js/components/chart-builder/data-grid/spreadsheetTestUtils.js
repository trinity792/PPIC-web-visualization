/**
 * Shared DOM drivers, not grid logic. Cells are addressed using ARIA's 1-based
 * row/column indexes (row 1 is the header). Letter headers expose the existing
 * data-column-letter attribute. Small handles have accessible names.
 * Pointer hit-testing uses elements, never pixel coordinates; resize is the
 * deliberate exception because a width is a pixel measurement.
 */
import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, vi } from "vitest";
import { gridTable } from "@/tests/fixtures/spreadsheet-grid";

export function mountGrid(Component, { initial = gridTable(), ...props } = {}) {
  const changed = vi.fn();
  function Controlled({ focus }) {
    const [table, setTable] = useState(initial);
    return <Component {...props} focus={focus} table={table} onChange={(next) => { changed(next); setTable(next); }} />;
  }
  const view = render(<Controlled focus={props.focus} />);
  return { ...view, changed, next: () => changed.mock.lastCall[0], refocus: (focus) => view.rerender(<Controlled focus={focus} />) };
}

export const grid = () => screen.getByRole("grid", { name: "Editable imported data" });
export const row = (r) => grid().querySelector(`[role="row"][aria-rowindex="${r}"]`);
export const cell = (r, c) => {
  const node = row(r)?.querySelector(`[aria-colindex="${c}"]:is([role="gridcell"],[role="columnheader"])`);
  expect(node, `cell at spreadsheet row ${r}, column ${c}`).toBeInTheDocument();
  return node;
};
export const letter = (name) => {
  const node = grid().querySelector(`[data-column-letter="${name}"]`);
  expect(node, `column letter ${name}`).toBeInTheDocument();
  return node;
};
export const rowHeader = (r) => within(row(r)).getByRole("rowheader");
export const pointer = (node, phase, options = {}) => fireEvent[phase](node, { pointerId: 1, pointerType: "mouse", button: 0, ...options });
export function select(node, options = {}) {
  pointer(node, "pointerDown", options);
  pointer(window, "pointerUp", options);
}
export function drag(from, to, options = {}) {
  pointer(from, "pointerDown", options);
  pointer(to, "pointerEnter", options);
  pointer(window, "pointerUp", options);
}
export const key = (value, options = {}) => fireEvent.keyDown(grid(), { key: value, ...options });
export const active = (r, c) => expect(grid()).toHaveAttribute("aria-activedescendant", cell(r, c).id);
export const editor = () => within(grid()).getByRole("textbox");
export const enter = (text, options = {}) => {
  fireEvent.change(editor(), { target: { value: text } });
  fireEvent.keyDown(editor(), { key: "Enter", ...options });
};
export const selected = (r, c, value = true) => expect(cell(r, c)).toHaveAttribute("aria-selected", String(value));
export const menuItem = (name) => screen.getByRole("menuitem", { name, exact: true });
export const button = (name) => screen.getByRole("button", { name, exact: true });
export const more = () => fireEvent.click(button("More"));
export function clipboard(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getData: vi.fn((type) => values.get(type) ?? ""), setData: vi.fn((type, value) => values.set(type, value)), types: [...values.keys()] };
}
