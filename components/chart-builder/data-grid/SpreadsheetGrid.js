"use client";
/**
 * SpreadsheetGrid.js — a DOM spreadsheet over the existing inline-table model.
 * Props: table {Object}; onChange {Function} one immutable table per edit;
 * onRevert/onUndo/onRedo {Function}; focus {Object|null} data row/col/key;
 * usage {Object|null} column names to chart roles.
 * Data sources: inline table, lib/tabular grid logic, browser clipboard events.
 * UI Kit reference: shared buttons, selects, menus, dialog and input. Sheet
 * geometry comes from SPREADSHEET_GRID; colors are application theme tokens.
 */
import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/components/ui/utils";
import { SPREADSHEET_GRID as G } from "@/lib/constants";
import * as S from "@/lib/tabular/gridSelection";
import * as E from "@/lib/tabular/tableEdits";
import { columnLetters, recalculate } from "@/lib/tabular/formulas";
import { parseClipboard, selectionToClipboard, selectionClipboardAxes } from "@/lib/tabular/gridClipboard";
import { gradeTable } from "@/lib/tabular/tableChecker";
import { rereadTable } from "@/lib/tabular/parseTable";
import ColumnHeader from "./ColumnHeader";
import RowHeader from "./RowHeader";
import CellEditor from "./CellEditor";
import FormulaBar from "./FormulaBar";
import GridToolbar from "./GridToolbar";
import GridContextMenu from "./GridContextMenu";
import ShortcutsMenu from "./ShortcutsMenu";
import StatusBar from "./StatusBar";
import ImportSettings from "./ImportSettings";
import { isMac, useShortcutScheme } from "./useShortcutScheme";
import { useGridPointer } from "./useGridPointer";
import { useGridKeyboard } from "./useGridKeyboard";

const CLIPBOARD_TYPE = "application/x-ppic-spreadsheet";
const at = (row, col) => ({ kind: "cells", row, col });
const single = (row, col) => S.selectCell(null, row, col);
const address = (row, col) => `${columnLetters(col)}${row + 1}`;
const inRange = (r, row, col) => r && row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2;
// Include both header controls so short data values cannot clip chart roles.
const fitWidth = (table, col, usage) => Math.min(G.fitMaxWidth, Math.max(G.fitMinWidth,
  usage ? G.kindControlWidth + usage.length * G.characterWidth + G.cellPadding : 0,
  Math.max(String(table.columns[col]?.name ?? "").length, ...table.rows.slice(0, 50).map((row) => String(row[col] ?? "").length)) * G.characterWidth + G.cellPadding));

export default function SpreadsheetGrid({ table: input, onChange, onRevert, onUndo, onRedo, focus = null, usage = null }) {
  const table = useMemo(() => recalculate(input), [input]);
  const size = { rows: table.rows.length + 2, columns: table.columns.length };
  const id = useId();
  const gridRef = useRef(null);
  const editorRef = useRef(null);
  const barRef = useRef(null);
  const [selection, setSelection] = useState(() => single(1, 0));
  const [hidden, setHidden] = useState(new Set());
  const [widthOverrides, setWidthOverrides] = useState(new Map());
  const [scroll, setScroll] = useState({ top: 0, height: G.viewportHeight });
  const [draft, setDraftState] = useState(null);
  const draftRef = useRef(null);
  const [cut, setCut] = useState(null);
  const copied = useRef(null);
  const lastPointerType = useRef("mouse");
  const pasteValues = useRef(false);
  const [menu, setMenu] = useState(null);
  const [shortcuts, setShortcuts] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [scheme, setScheme] = useShortcutScheme();
  const mac = isMac();
  const visible = table.columns.map((_, col) => col).filter((col) => !hidden.has(table.columns[col].name));
  const widths = useMemo(() => table.columns.map((column, col) => widthOverrides.get(column.name) ?? fitWidth(table, col, usage?.[column.name])), [table, widthOverrides, usage]);
  const grades = useMemo(() => gradeTable(table), [table]);
  const malformed = useMemo(() => grades.flatMap((row, r) => row.flatMap((grade, c) => grade === "malformed" ? [{ row: r, col: c }] : [])), [grades]);
  const stats = useMemo(() => S.selectionStats(table, selection), [table, selection]);
  const range = S.activeRange(selection);
  const cellId = (row, col) => `${id}-r${row}-c${col}`;
  const cellText = (row, col) => row === 0 ? table.columns[col]?.name ?? "" : E.cellText(table, row - 1, col);
  const focusGrid = () => gridRef.current?.focus({ preventScroll: true });
  // The sheet fills its container; virtualization must follow its actual height.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const measure = () => setScroll({ top: grid.scrollTop, height: grid.clientHeight || G.viewportHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);
  function setDraft(value) { draftRef.current = value; setDraftState(value); }
  function choose(next) { setSelection(next); setNotice(""); focusGrid(); return next; }
  function publish(next, message = "Cells updated") {
    if (next === table) return;
    setCut(null);
    setNotice(message);
    onChange(next);
  }
  function resize(col, width) {
    setWidthOverrides((previous) => new Map(previous).set(table.columns[col].name, width));
  }
  function scrollToCell(row, col) {
    const grid = gridRef.current;
    if (!grid) return;
    const top = Math.max(0, (row - 1) * G.rowHeight);
    const viewport = grid.clientHeight || G.viewportHeight;
    if (top < grid.scrollTop || top + G.rowHeight > grid.scrollTop + viewport - G.letterHeight - G.headerHeight) {
      grid.scrollTop = top;
      setScroll({ top, height: viewport });
    }
    document.getElementById(cellId(row, col))?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  useLayoutEffect(() => { scrollToCell(selection.active.row, selection.active.col); }, [selection.active.row, selection.active.col]);
  useEffect(() => {
    if (focus?.col == null) return;
    const col = Math.max(0, Math.min(focus.col, table.columns.length - 1));
    const row = Math.max(1, Math.min((focus.row ?? 0) + 1, table.rows.length + 1));
    setHidden((prev) => { const next = new Set(prev); next.delete(table.columns[col]?.name); return next; });
    choose(single(row, col));
    scrollToCell(row, col);
  }, [focus?.key]);
  // External undo, import or deletion can shrink the table underneath selection.
  useEffect(() => {
    if (selection.active.col >= size.columns || selection.active.row >= size.rows) {
      choose(S.selectCell(null, selection.active.row, selection.active.col, size));
    }
  }, [size.rows, size.columns]);

  // ── Editing and formula point mode ──────────────────────────────────
  function startEdit(text, surface = "cell", position = selection.active) {
    const value = text ?? cellText(position.row, position.col);
    setDraft({ ...position, text: value, caret: value.length, surface, point: null });
  }
  function commit(direction = null, all = false, text) {
    const editing = draftRef.current;
    if (!editing && text == null) return;
    const position = editing || selection.active;
    const value = text ?? editing.text;
    setDraft(null);
    const target = all ? selection : single(position.row, position.col);
    const next = all || value !== cellText(position.row, position.col) ? E.pasteCells(table, target, [[value]], all ? { source: position } : {}) : table;
    if (direction) {
      const grownSize = { ...size, rows: Math.max(size.rows, position.row + 2) };
      choose(S.nextInSelection(selection, direction, grownSize));
    } else focusGrid();
    publish(next, `${address(position.row, position.col)} updated`);
  }
  function changeDraft(event, surface = "cell") {
    const previous = draftRef.current || { ...selection.active, surface };
    setDraft({ ...previous, text: event.target.value, caret: event.target.selectionStart, point: null });
  }
  function point(target, extend = false, start = null) {
    const editing = draftRef.current;
    if (!editing || !editing.text.startsWith("=")) return false;
    const input = editing.surface === "bar" ? barRef.current : editorRef.current;
    const cursor = input?.selectionStart ?? editing.caret ?? editing.text.length;
    const existing = editing.point;
    if (!existing && !/[=+\-*/^(,]\s*$/.test(editing.text.slice(0, cursor))) return false;
    const anchor = extend ? start || existing?.anchor || target : target;
    const reference = S.extendTo(single(anchor.row, anchor.col), target.row, target.col, size);
    const token = S.addressOf(reference);
    const from = existing?.from ?? cursor;
    const end = existing?.end ?? input?.selectionEnd ?? cursor;
    const text = editing.text.slice(0, from) + token + editing.text.slice(end);
    setDraft({ ...editing, text, caret: from + token.length,
      point: { from, end: from + token.length, target, anchor, range: reference.ranges[0] } });
    return true;
  }
  function editKey(event) {
    if (event.isComposing || event.nativeEvent?.isComposing) return;
    if (/^Arrow/.test(event.key)) {
      const editing = draftRef.current;
      const from = editing?.point?.target || editing;
      const moved = S.moveActive(single(from.row, from.col), event.key.slice(5).toLowerCase(), { size });
      if (point(at(moved.active.row, moved.active.col), event.shiftKey)) { event.preventDefault(); event.stopPropagation(); return; }
    }
    editingKey(event);
  }
  const editingKey = useGridKeyboard({ scheme, mac, editing: true, onAction(action) {
    if (action === "cancelEdit") { setDraft(null); focusGrid(); }
    else if (action === "fillSelectionWithEntry") commit(null, true);
    else if (action.startsWith("commit")) commit(action.slice(6).toLowerCase());
  } });

  // ── Selection and pointer operations ────────────────────────────────
  function selectTarget(target, event = {}) {
    if (draftRef.current) commit();
    const options = { size, extend: event.shiftKey, add: mac ? event.metaKey : event.ctrlKey };
    if (target.kind === "rows") return choose(S.selectRows(selection, target.row, target.row, options));
    if (target.kind === "columns") return choose(S.selectColumns(selection, target.col, target.col, options));
    return choose(options.extend ? S.extendTo(selection, target.row, target.col, size)
      : options.add ? S.addRange(selection, target.row, target.col, size) : S.selectCell(selection, target.row, target.col, size));
  }
  function move(selected, target) {
    const columns = target.kind === "columns";
    const moving = columns ? S.selectedColumns(selected, size) : S.selectedRows(selected, size).filter((row) => row > 0 && row <= table.rows.length).map((row) => row - 1);
    const length = columns ? table.columns.length : table.rows.length;
    const hovered = columns ? target.col : Math.max(0, target.row - 1);
    const to = Math.min(length, hovered > moving.at(-1) ? hovered + 1 : hovered);
    const remaining = Array.from({ length }, (_, index) => index).filter((index) => !moving.includes(index));
    const order = [...remaining.filter((index) => index < to), ...moving, ...remaining.filter((index) => index >= to)];
    if (order.every((old, index) => old === index)) return;
    const next = columns ? E.moveColumns(table, moving, to) : E.moveRows(table, moving, to);
    const first = order.indexOf(moving[0]);
    choose(columns ? S.selectColumns(null, first, first + moving.length - 1, { size }) : S.selectRows(null, first + 1, first + moving.length, { size }));
    publish(next, columns ? "Columns moved" : "Rows moved");
  }
  const pointer = useGridPointer({ gridRef, selection, widths, select: selectTarget, point, resize, move,
    extend(start, target) {
      choose(target.kind === "rows" ? S.selectRows(start, start.anchor.row, target.row, { size, extend: true })
        : target.kind === "columns" ? S.selectColumns(start, start.anchor.col, target.col, { size, extend: true })
          : S.extendTo(start, target.row, target.col, size));
    },
    fill(from, to, option) { choose({ ...single(from.r1, from.c1), ranges: [to] }); publish(E.fillRange(table, from, to, { option }), "Selection filled"); },
  });
  function openMenu(kind, event, target) {
    event?.preventDefault();
    if (target && !S.contains(selection, target.row, target.col)) selectTarget(target);
    const rect = event?.currentTarget?.getBoundingClientRect() || document.getElementById(cellId(selection.active.row, selection.active.col))?.getBoundingClientRect();
    setMenu({ kind: kind === "selection" ? selection.mode : kind,
      x: event?.type === "contextmenu" ? event.clientX : rect?.left ?? 0,
      y: event?.type === "contextmenu" ? event.clientY : rect?.bottom ?? 0 });
  }
  const handlers = (target) => ({
    onPointerDown: (event) => { lastPointerType.current = event.pointerType; pointer.begin(event, target); },
    onPointerEnter: (event) => pointer.enter(event, target),
    onContextMenu: (event) => openMenu(target.kind, event, target),
  });

  // ── Clipboard: native events, with private provenance for internal copies ──
  function copy(event, cutting = false) {
    if (draftRef.current || event.target?.closest?.("input,textarea")) return;
    const external = selectionToClipboard(table, selection);
    const internal = selectionToClipboard(table, selection, { formulas: true });
    const source = S.activeRange(selection);
    const axes = selectionClipboardAxes(selection);
    const origins = axes.rows.map((row) => axes.columns.map((col) => ({ row, col })));
    const payload = { owner: id, token: `${Date.now()}-${Math.random()}`, cells: parseClipboard(internal), computed: parseClipboard(external), source: { row: source.r1, col: source.c1 }, origins, cut: cutting ? selection : null };
    copied.current = payload;
    event.clipboardData.setData("text/plain", external.text);
    // Chromium may discard custom MIME formats on a system clipboard round trip.
    // Keep only an opaque lookup token in HTML; provenance stays in this editor.
    event.clipboardData.setData("text/html", internal.html.replace("<table", `<table data-ppic-copy="${payload.token}"`));
    event.clipboardData.setData(CLIPBOARD_TYPE, JSON.stringify(payload));
    event.preventDefault();
    setCut(cutting ? selection : null);
    setNotice(cutting ? "Selection cut. Paste to move it, or Escape to cancel." : "Selection copied");
  }
  function paste(event) {
    if (draftRef.current || event.target?.closest?.("input,textarea")) return;
    event.preventDefault();
    let payload;
    try { payload = JSON.parse(event.clipboardData.getData(CLIPBOARD_TYPE)); } catch { /* External clipboard. */ }
    const html = event.clipboardData.getData("text/html");
    const htmlToken = html ? new DOMParser().parseFromString(html, "text/html").querySelector("table")?.getAttribute("data-ppic-copy") : null;
    const internal = copied.current && ((payload?.owner === id && payload?.token === copied.current.token) || htmlToken === copied.current.token) ? copied.current : null;
    const values = pasteValues.current;
    pasteValues.current = false;
    let valueHtml = html;
    if (values && !internal && html) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("[data-formula]").forEach((cell) => cell.removeAttribute("data-formula"));
      valueHtml = doc.body.innerHTML;
    }
    const cells = internal?.cells || parseClipboard({ text: event.clipboardData.getData("text/plain"), html: valueHtml });
    const options = internal ? { source: internal.source, origins: internal.origins, computed: internal.computed, cut: cut ? internal.cut : null, values } : { values };
    publish(E.pasteCells(table, selection, cells, options), "Cells pasted");
    if (internal?.cut) copied.current = null;
  }

  // ── Shared commands for keys, toolbar and context menus ──────────────
  function action(command, event) {
    const rows = S.selectedRows(selection, size).filter((row) => row > 0 && row <= table.rows.length).map((row) => row - 1);
    const cols = S.selectedColumns(selection, size);
    const r = S.activeRange(selection);
    const col = selection.active.col;
    if (command.startsWith("kind:")) { publish(E.setColumnKind(table, col, command.slice(5))); return; }
    switch (command) {
      case "rowAbove": publish(E.insertRows(table, Math.max(0, r.r1 - 1), Math.max(1, rows.length))); break;
      case "rowBelow": publish(E.insertRows(table, Math.min(table.rows.length, r.r2), Math.max(1, rows.length))); break;
      case "columnLeft": publish(E.insertColumns(table, r.c1, Math.max(1, cols.length))); break;
      case "columnRight": publish(E.insertColumns(table, r.c2 + 1, Math.max(1, cols.length))); break;
      case "deleteRows":
        if (selection.mode === "columns") { setNotice("Select rows to delete; columns are selected."); break; }
        if (!rows.length) { setNotice("The header cannot be deleted. Rename its cells instead."); break; }
        publish(E.deleteRows(table, rows), "Rows deleted"); break;
      case "deleteColumns":
        if (cols.length === table.columns.length) { setNotice("Keep at least one column in the table."); break; }
        publish(E.deleteColumns(table, cols), "Columns deleted"); break;
      case "clear": publish(E.clearRange(table, selection), "Selection cleared"); break;
      case "sortAsc": case "sortDesc": publish(E.sortRows(table, col, command === "sortAsc" ? "asc" : "desc"), "Rows sorted"); break;
      case "rangeAsc": case "rangeDesc": publish(E.sortRange(table, selection, col, command === "rangeAsc" ? "asc" : "desc"), "Selected rows sorted"); break;
      case "fillDown": publish(E.fillDownSelection(table, selection), "Selection filled down"); break;
      case "fillRight": publish(E.fillRightSelection(table, selection), "Selection filled right"); break;
      case "formulaColumn": {
        const { table: next, col: inserted } = E.insertFormulaColumn(table, r.c2);
        choose(single(1, inserted)); startEdit("=", "cell", { row: 1, col: inserted }); publish(next, "Formula column inserted"); break;
      }
      case "validity":
        if (malformed.length) {
          setHidden(new Set());
          choose({ ...single(malformed[0].row, malformed[0].col), ranges: malformed.map(({ row, col }) => ({ r1: row, c1: col, r2: row, c2: col })) });
        } break;
      case "hide":
        if (cols.length >= visible.length && visible.every((c) => cols.includes(c))) { setNotice("Keep at least one column visible."); break; }
        setHidden((prev) => new Set([...prev, ...cols.map((c) => table.columns[c].name)]));
        choose(single(selection.active.row, visible.find((c) => !cols.includes(c)) ?? 0)); break;
      case "showHidden": setHidden(new Set()); break;
      case "fit": cols.forEach((c) => resize(c, fitWidth(table, c, usage?.[table.columns[c].name]))); break;
      case "rename": choose(single(0, col)); startEdit(null, "cell", { row: 0, col }); break;
      case "promoteHeader": if (rows.length) publish(E.promoteRowToHeader(table, rows[0])); break;
      case "include": case "exclude": case "total": publish(E.markRows(table, rows, command === "include" ? null : command === "total" ? "total" : "excluded")); break;
      case "transpose": setHidden(new Set()); setWidthOverrides(new Map()); choose(single(1, 0)); publish(E.transpose(table)); break;
      case "revert": onRevert?.(); break;
      case "import": setImportOpen(true); break;
      case "shortcuts": setShortcuts(true); break;
      case "undo": setDraft(null); setCut(null); onUndo?.(); break;
      case "redo": setDraft(null); setCut(null); onRedo?.(); break;
      case "copy": case "cut":
        if (!event) {
          focusGrid();
          // Browser-native copy/cut fires the handlers above without requesting permissions.
          if (!document.execCommand?.(command)) setNotice(`Press ${mac ? "⌘" : "Ctrl"}+${command === "copy" ? "C" : "X"} to ${command}.`);
        } break;
      case "paste": case "pasteValues":
        if (command === "pasteValues" || !event) pasteValues.current = command === "pasteValues";
        if (!event) { focusGrid(); setNotice(`Press ${mac ? "⌘" : "Ctrl"}+V to paste${pasteValues.current ? " values only" : ""}.`); }
        break;
      default: break;
    }
  }
  function keyboardAction(command, event) {
    const movement = /^(move|extendJump|extend|jump)(Up|Down|Left|Right)$/.exec(command);
    if (movement) {
      let next = S.moveActive(selection, movement[2].toLowerCase(), { size, isFilled: S.filledIn(table), jump: /jump/i.test(movement[1]), extend: /extend/i.test(movement[1]) });
      // Hidden columns are not keyboard stops.
      if (["Left", "Right"].includes(movement[2]) && !/extend/i.test(movement[1])) {
        while (hidden.has(table.columns[next.active.col]?.name)) {
          const after = S.moveActive(next, movement[2].toLowerCase(), { size });
          if (after.active.col === next.active.col) { next = selection; break; }
          next = after;
        }
      }
      choose(next); return;
    }
    switch (command) {
      case "startEdit": startEdit(); break;
      case "typeToEdit": startEdit(event.key); break;
      case "selectRow": choose(S.rowsOfSelection(selection, size)); break;
      case "selectColumn": choose(S.columnsOfSelection(selection, size)); break;
      case "selectAll": choose(S.selectAll(selection, size)); break;
      case "home": choose(S.moveTo(selection, selection.active.row, visible[0], { size })); break;
      case "end": choose(S.moveTo(selection, selection.active.row, visible.at(-1), { size })); break;
      case "first": choose(single(0, visible[0])); break;
      case "last": choose(single(table.rows.length, visible.at(-1))); break;
      case "pageUp": case "pageDown": choose(S.moveTo(selection, selection.active.row + (command === "pageUp" ? -1 : 1) * Math.max(1, Math.floor(scroll.height / G.rowHeight)), selection.active.col, { size })); break;
      case "openMenu": openMenu("selection"); break;
      case "cancel": pointer.cancel(); setCut(null); pasteValues.current = false; setMenu(null); break;
      case "insertRowsOrColumns": if (selection.mode === "rows") action("rowAbove"); else if (selection.mode === "columns") action("columnLeft"); break;
      case "deleteRowsOrColumns": if (selection.mode === "rows") action("deleteRows"); else if (selection.mode === "columns") action("deleteColumns"); break;
      default: action(command, event);
    }
  }
  const onKeyDown = useGridKeyboard({ scheme, mac, editing: false, onAction: keyboardAction });

  // ── Rendering: a single sticky grid, with body-row virtualization ─────
  const virtual = table.rows.length > G.virtualThreshold;
  const start = virtual ? Math.max(1, Math.floor(scroll.top / G.rowHeight) + 1 - G.overscan) : 1;
  const end = virtual ? Math.min(table.rows.length + 1, Math.floor(scroll.top / G.rowHeight) + Math.ceil(scroll.height / G.rowHeight) + G.overscan) : table.rows.length + 1;
  const template = `${G.gutterWidth}px ${visible.map((col) => `${widths[col]}px`).join(" ")}`;
  const totalWidth = G.gutterWidth + visible.reduce((sum, col) => sum + widths[col], 0);
  const rowStyle = { gridTemplateColumns: template, width: totalWidth, minWidth: "100%" };
  function renderCell(row, col) {
    const selected = S.contains(selection, row, col);
    const active = selection.active.row === row && selection.active.col === col;
    const formula = row > 0 ? table.formulas?.[`${row - 1}:${col}`] : null;
    const grade = grades[row]?.[col];
    const editing = draft?.surface === "cell" && draft.row === row && draft.col === col;
    const referenced = inRange(draft?.point?.range, row, col);
    const filled = pointer.preview?.kind === "fill" && inRange(pointer.preview.range, row, col);
    return <div key={col} id={cellId(row, col)} role={row === 0 ? "columnheader" : "gridcell"} aria-colindex={col + 1}
      aria-selected={selected} aria-invalid={grade === "malformed" || undefined} data-cut={S.contains(cut, row, col) || undefined}
      {...handlers(at(row, col))} onDoubleClick={(e) => { if (lastPointerType.current === "touch") return; e.preventDefault(); choose(single(row, col)); startEdit(null, "cell", { row, col }); }}
      style={{ width: widths[col] }}
      className={cn("relative flex h-full min-w-0 items-center border-r border-b border-border text-sm outline-none select-none", row === 0 ? "bg-muted/40" : "bg-transparent px-2",
        selected && "bg-[color-mix(in_srgb,var(--ppic-orange-50)_20%,var(--background))]", active && "z-10 outline-solid outline-3 -outline-offset-3 outline-ppic-orange-200",
        (referenced || filled) && "ring-2 ring-inset ring-ppic-blue-400", S.contains(cut, row, col) && "border-dashed border-ppic-orange-300",
        table.columns[col].ignored && "text-muted-foreground", row > 0 && table.rowMarks?.[row - 1] && "text-muted-foreground",
        grade === "malformed" && "bg-destructive/10 text-destructive", grade === "suppressed" && "italic text-muted-foreground", grade === "empty" && "text-muted-foreground",
        row > 0 && grade === "number" && "justify-end tabular-nums",
        pointer.preview?.kind === "move" && pointer.preview.target.kind === "columns" && pointer.preview.target.col === col && (pointer.preview.after ? "border-r-2 border-r-ppic-orange-300" : "border-l-2 border-l-ppic-orange-300"))}>
      {row === 0 ? <ColumnHeader column={table.columns[col]} onKind={(kind) => publish(E.setColumnKind(table, col, kind))} usage={usage?.[table.columns[col].name]} />
        : <span className="truncate whitespace-pre" title={grade === "malformed" ? (formula ? `${formula}: ${table.rows[row - 1]?.[col]} — check the formula's references and values.` : `This value cannot be read as ${table.columns[col].type}.`) : String(table.rows[row - 1]?.[col] ?? "")}>{table.rows[row - 1]?.[col] ?? ""}</span>}
      {formula && <span title={formula} aria-label="Formula" className="absolute top-0 right-0 size-1.5 bg-ppic-orange-300" />}
      {editing && <CellEditor draft={draft} inputRef={editorRef} onChange={changeDraft} onKeyDown={editKey} onBlur={() => { if (draftRef.current && !draftRef.current.point) commit(); }} />}
      {!draft && selected && row === range.r2 && col === range.c2 && row > 0 && <button type="button" tabIndex={-1} aria-label="Fill selection"
        className="absolute -right-1 -bottom-1 z-20 size-2 cursor-crosshair border border-background bg-ppic-orange-300"
        onPointerDown={(e) => pointer.begin(e, { kind: "fill" })} onDoubleClick={(e) => { e.stopPropagation(); publish(E.fillToEnd(table, selection), "Selection filled"); }} />}
    </div>;
  }
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
    <GridToolbar malformed={malformed.length} onAction={action} onMenu={openMenu} />
    <FormulaBar address={S.addressOf(selection)} cellAddress={address(selection.active.row, selection.active.col)}
      text={cellText(selection.active.row, selection.active.col)} draft={draft?.surface === "bar" ? draft : null} inputRef={barRef}
      onChange={(e) => changeDraft(e, "bar")} onKeyDown={editKey} onCommit={() => commit()} onFocus={() => { if (!draftRef.current) startEdit(null, "bar"); }} />
    <div ref={gridRef} role="grid" aria-label="Editable imported data" tabIndex={0}
      aria-rowcount={size.rows} aria-colcount={size.columns} aria-multiselectable="true"
      aria-activedescendant={selection.active.row === 0 || (selection.active.row >= start && selection.active.row <= end) ? cellId(selection.active.row, selection.active.col) : undefined}
      className="relative min-h-0 flex-auto overflow-auto overscroll-contain outline-none" style={{ height: G.viewportHeight }}
      onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight || G.viewportHeight })}
      onKeyDown={(e) => { if (!e.target.closest("input,textarea,button,[role=combobox]")) onKeyDown(e); }}
      onCopy={copy} onCut={(e) => copy(e, true)} onPaste={paste}>
      <div data-sticky="top" className="sticky top-0 z-30 grid bg-muted" style={{ ...rowStyle, height: G.letterHeight }}>
        <button aria-label="Select all cells" tabIndex={-1} className="sticky left-0 z-20 border-r border-b bg-muted" onClick={() => choose(S.selectAll(selection, size))} />
        {visible.map((col) => <div key={col} data-column-letter={columnLetters(col)} {...handlers({ kind: "columns", row: 1, col })}
          className={cn("relative flex items-center justify-center border-r border-b bg-muted text-xs text-muted-foreground select-none", selection.ranges.some((r) => col >= r.c1 && col <= r.c2) && "bg-[color-mix(in_srgb,var(--ppic-orange-50)_60%,var(--background))] font-medium text-foreground")}>
          {columnLetters(col)}<div role="separator" aria-label={`Resize column ${columnLetters(col)}`} aria-orientation="vertical" aria-valuenow={widths[col]} aria-valuemin={G.minWidth}
            className="absolute top-0 right-0 h-full w-1 cursor-col-resize" onPointerDown={(e) => pointer.begin(e, { kind: "resize", col })}
            onDoubleClick={(e) => { e.stopPropagation(); resize(col, fitWidth(table, col, usage?.[table.columns[col].name])); }} />
        </div>)}
      </div>
      <div role="row" aria-rowindex={1} data-sticky="top" className="sticky z-20 grid bg-background" style={{ ...rowStyle, top: G.letterHeight, height: G.headerHeight }}>
        <RowHeader number={1} selected={S.selectedRows(selection, size).includes(0)} handlers={handlers({ kind: "rows", row: 0, col: 0 })} />{visible.map((col) => renderCell(0, col))}
      </div>
      {start > 1 && <div aria-hidden="true" style={{ height: (start - 1) * G.rowHeight }} />}
      {Array.from({ length: Math.max(0, end - start + 1) }, (_, offset) => start + offset).map((row) => <div key={row} role="row" aria-rowindex={row + 1}
        className={cn("grid bg-background hover:bg-muted/50", pointer.preview?.kind === "move" && pointer.preview.target.kind === "rows" && pointer.preview.target.row === row && (pointer.preview.after ? "border-b-2 border-ppic-orange-300" : "border-t-2 border-ppic-orange-300"))}
        style={{ ...rowStyle, height: G.rowHeight }}>
        <RowHeader number={row + 1} mark={table.rowMarks?.[row - 1]} selected={selection.ranges.some((r) => row >= r.r1 && row <= r.r2)} handlers={handlers({ kind: "rows", row, col: 0 })} />
        {visible.map((col) => renderCell(row, col))}
      </div>)}
      {end < table.rows.length + 1 && <div aria-hidden="true" style={{ height: (table.rows.length + 1 - end) * G.rowHeight }} />}
      {pointer.preview?.kind === "move" && <span role="separator" aria-label="Move selection here" className="sr-only" />}
    </div>
    <StatusBar table={table} selection={selection} stats={stats} />
    <div aria-live="polite" className={notice ? "border-t bg-muted/30 px-3 py-1 text-xs text-muted-foreground" : "sr-only"}>{notice || `${S.addressOf(selection).replace(":", " to ")} selected${stats.numericCount ? `, Sum ${stats.sum.toLocaleString()}` : ""}`}</div>
    <GridContextMenu menu={menu} setMenu={setMenu} onAction={action} onClose={() => { if (!draftRef.current && !importOpen && !shortcuts) focusGrid(); }}
      canReread={Boolean(table.meta?.raw || table.meta?.rawText)} canRevert={Boolean(onRevert)} multipleRows={range.r2 > Math.max(1, range.r1)} marked={Boolean(table.rowMarks?.[selection.active.row - 1])} />
    <ShortcutsMenu open={shortcuts} onOpenChange={setShortcuts} scheme={scheme} setScheme={setScheme} mac={mac} />
    {importOpen && <ImportSettings table={table} open={importOpen} onOpenChange={setImportOpen} showTrigger={false} onApply={async (options) => {
      try { const result = await rereadTable(table, options); setHidden(new Set()); publish(result, "Import read again"); }
      catch (error) { setNotice(`Import settings: ${error.message}`); }
    }} />}
  </div>;
}
