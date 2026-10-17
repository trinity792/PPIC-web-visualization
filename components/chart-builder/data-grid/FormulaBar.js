"use client";
/**
 * FormulaBar.js — selection address and the shared active-cell draft.
 * Props: address/cellAddress/text {string}; draft {Object|null}; inputRef {Ref};
 * onChange/onKeyDown/onCommit/onFocus {Function}. Data sources: parent grid.
 * UI Kit reference: ui/input. Commits/cancellation share CellEditor's handlers.
 */
import React, { useLayoutEffect } from "react";
import { Input } from "@/components/ui/input";
export default function FormulaBar({ address, cellAddress, text, draft, inputRef, onChange, onKeyDown, onCommit, onFocus }) {
  useLayoutEffect(() => {
    if (draft?.point) {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(draft.caret, draft.caret);
    }
  }, [draft?.point, draft?.caret, inputRef]);
  return <div className="flex items-center border-b bg-background">
    <span className="min-w-24 shrink-0 border-r px-3 py-2 text-center text-xs tabular-nums">{address}</span>
    <span aria-hidden="true" className="px-3 text-sm italic text-muted-foreground">ƒx</span>
    <Input ref={inputRef} aria-label={`Cell ${cellAddress}`} value={draft?.text ?? text ?? ""}
      onChange={onChange} onKeyDown={onKeyDown} onBlur={onCommit} onFocus={onFocus}
      className="h-9 min-w-0 rounded-none border-0 bg-transparent px-1 font-mono text-xs shadow-none focus-visible:ring-0" />
  </div>;
}
