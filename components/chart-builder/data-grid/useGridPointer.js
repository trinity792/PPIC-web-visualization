"use client";
/**
 * useGridPointer.js — element-based range selection, moving, filling and sizing.
 * Options: gridRef {Ref}; selection {Object}; select/extend/point/move/fill/resize
 * {Function}; widths {Array}. Returns begin/enter/cancel and preview state.
 * Data sources: SpreadsheetGrid; no table writes until pointerup.
 * Adapted from Fortune-sheet (MIT), onCellsMoveStart/onCellsMove/onCellsMoveEnd.
 * UI Kit reference: None — spreadsheet pointer interaction.
 */
import { useEffect, useRef, useState } from "react";
import { SPREADSHEET_GRID as G } from "@/lib/constants";
import { activeRange, bounds, contains } from "@/lib/tabular/gridSelection";

export function useGridPointer(options) {
  const latest = useRef(options);
  latest.current = options;
  const operation = useRef(null);
  const [preview, setPreview] = useState(null);
  const cancel = () => { operation.current = null; setPreview(null); };
  function begin(event, target) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const state = latest.current;
    const touch = event.pointerType === "touch";
    if (touch && ["fill", "resize"].includes(target.kind)) return;
    if (target.kind === "cells" && state.point(target, false)) {
      if (!touch) operation.current = { kind: "point", start: target };
      return;
    }
    if (target.kind === "resize") {
      operation.current = { ...target, x: event.clientX, width: state.widths[target.col] };
      return;
    }
    if (target.kind === "fill") {
      operation.current = { kind: "fill", from: activeRange(state.selection), option: event.altKey };
      return;
    }
    const moving = !touch && !event.shiftKey && !event.metaKey && !event.ctrlKey &&
      state.selection.mode === target.kind && ["rows", "columns"].includes(target.kind) &&
      contains(state.selection, target.row, target.col);
    const selection = moving ? state.selection : state.select(target, event);
    if (!touch) operation.current = { kind: moving ? "move" : "select", targetKind: target.kind, start: target, selection };
  }
  function enter(event, target) {
    const op = operation.current;
    if (!op || event.pointerType === "touch") return;
    const state = latest.current;
    if (op.kind === "point" && target.kind === "cells") { state.point(target, true, op.start); return; }
    if (op.kind === "select" && target.kind === op.targetKind) state.extend(op.selection, target);
    if (op.kind === "move" && target.kind === op.targetKind) {
      op.to = target;
      const selected = bounds(op.selection);
      setPreview({ kind: "move", target, after: target.kind === "columns" ? target.col > selected.c2 : target.row > selected.r2 });
    }
    if (op.kind === "fill" && target.kind === "cells") {
      const from = op.from;
      // The dominant extension chooses a single axis, as a fill handle does.
      const dr = Math.max(from.r1 - target.row, target.row - from.r2, 0);
      const dc = Math.max(from.c1 - target.col, target.col - from.c2, 0);
      op.to = dr >= dc ? { ...from, r1: Math.max(1, Math.min(from.r1, target.row)), r2: Math.max(from.r2, target.row) }
        : { ...from, c1: Math.min(from.c1, target.col), c2: Math.max(from.c2, target.col) };
      setPreview({ kind: "fill", range: op.to });
    }
  }
  useEffect(() => {
    let frame = 0;
    let point = null;
    function scroll() {
      frame = 0;
      const grid = latest.current.gridRef.current;
      if (!operation.current || !point || !grid || operation.current.kind === "resize") return;
      const rect = grid.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dy = point.y > rect.bottom - G.autoScrollEdge ? G.autoScrollStep : point.y < rect.top + G.autoScrollEdge ? -G.autoScrollStep : 0;
      const dx = point.x > rect.right - G.autoScrollEdge ? G.autoScrollStep : point.x < rect.left + G.autoScrollEdge ? -G.autoScrollStep : 0;
      if (dy || dx) { grid.scrollTop += dy; grid.scrollLeft += dx; frame = requestAnimationFrame(scroll); }
    }
    function pointerMove(event) {
      const op = operation.current;
      if (!op) return;
      if (op.kind === "resize") latest.current.resize(op.col, Math.max(G.minWidth, op.width + event.clientX - op.x));
      else { point = { x: event.clientX, y: event.clientY }; if (!frame) frame = requestAnimationFrame(scroll); }
    }
    function finish() {
      const op = operation.current;
      cancel();
      cancelAnimationFrame(frame);
      if (op?.kind === "move" && op.to) latest.current.move(op.selection, op.to);
      if (op?.kind === "fill" && op.to) latest.current.fill(op.from, op.to, op.option);
    }
    function escape(event) { if (event.key === "Escape") { cancel(); cancelAnimationFrame(frame); } }
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", escape);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  return { begin, enter, cancel, preview };
}
