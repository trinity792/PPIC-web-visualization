"use client";
/**
 * GridContextMenu.js — one owner for cell, row, column and toolbar menu actions.
 * Props: menu {Object|null} kind/viewport position; setMenu/onAction/onClose
 * {Function}; canReread/canRevert/marked/multipleRows {boolean}.
 * Data sources: parent grid. UI Kit reference: ui/dropdown-menu.
 */
import React from "react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { COLUMN_KINDS } from "@/lib/tabular/tableEdits";
export default function GridContextMenu({ menu, setMenu, onAction, onClose, canReread, canRevert, marked, multipleRows }) {
  const item = (label, action, disabled = false) => <DropdownMenuItem key={action} disabled={disabled} onSelect={() => onAction(action)}>{label}</DropdownMenuItem>;
  const submenu = (label, kind) => <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setMenu({ ...menu, kind }); }}>{label}</DropdownMenuItem>;
  return <DropdownMenu open={Boolean(menu)} modal={false} onOpenChange={(open) => { if (!open) setMenu(null); }}>
    <DropdownMenuTrigger tabIndex={-1} aria-label="Grid menu anchor" className="pointer-events-none fixed size-px opacity-0" style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }} />
    <DropdownMenuContent align="start" onCloseAutoFocus={(e) => { e.preventDefault(); onClose(); }}>
      {menu?.kind === "more" ? <>
        {item("Import settings", "import", !canReread)}{item("Transpose", "transpose")}{item("Show hidden columns", "showHidden")}{item("Revert to original", "revert", !canRevert)}<DropdownMenuSeparator />{item("Keyboard shortcuts", "shortcuts")}
      </> : menu?.kind === "sort" || menu?.kind === "sortRange" ? <>
        {item("A to Z", menu.kind === "sort" ? "sortAsc" : "rangeAsc")}{item("Z to A", menu.kind === "sort" ? "sortDesc" : "rangeDesc")}
      </> : menu?.kind === "kind" ? COLUMN_KINDS.map((kind) => item(kind.label, `kind:${kind.id}`)) : <>
        {item("Cut", "cut")}{item("Copy", "copy")}{item("Paste", "paste")}{item("Paste values only", "pasteValues")}<DropdownMenuSeparator />
        {item("Insert row above", "rowAbove")}{item("Insert row below", "rowBelow")}{item("Insert column left", "columnLeft")}{item("Insert column right", "columnRight")}
        {item("Delete rows", "deleteRows")}{item("Delete columns", "deleteColumns")}{item("Clear", "clear")}<DropdownMenuSeparator />
        {item("Sort A to Z", "sortAsc")}{item("Sort Z to A", "sortDesc")}{multipleRows && submenu("Sort selected range", "sortRange")}
        {menu?.kind === "rows" && <><DropdownMenuSeparator />{item("Use as header row", "promoteHeader")}{item(marked ? "Include in chart" : "Leave out of chart", marked ? "include" : "exclude")}{item("Mark as total", "total")}</>}
        {menu?.kind === "columns" && <><DropdownMenuSeparator />{item("Rename", "rename")}{submenu("Kind", "kind")}{item("Hide", "hide")}{item("Fit width", "fit")}</>}
      </>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
