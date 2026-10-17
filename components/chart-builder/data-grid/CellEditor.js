"use client";
/**
 * CellEditor.js — the active cell's overlay input, including formula point mode.
 * Props: draft {Object} text/caret; inputRef {Ref}; onChange/onKeyDown/onBlur
 * {Function}. Data sources: SpreadsheetGrid editing state.
 * UI Kit reference: ui/input, positioned inside the edited grid cell.
 */
import React, { useLayoutEffect } from "react";
import { Input } from "@/components/ui/input";
export default function CellEditor({ draft, inputRef, onChange, onKeyDown, onBlur }) {
  useLayoutEffect(() => {
    inputRef.current?.focus();
    if (draft.caret != null) inputRef.current?.setSelectionRange(draft.caret, draft.caret);
  }, [draft.caret, inputRef]);
  return <Input ref={inputRef} value={draft.text} aria-label="Edit cell"
    onChange={onChange} onKeyDown={onKeyDown} onBlur={onBlur}
    onPointerDown={(e) => e.stopPropagation()}
    className="absolute inset-0 z-20 h-full w-full rounded-none border-2 border-ppic-orange-300 bg-background px-2 font-mono text-sm shadow-none focus-visible:ring-0" />;
}
