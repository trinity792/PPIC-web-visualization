"use client";
/**
 * useGridKeyboard.js — routes only grid-owned shortcuts, preserving browser keys.
 * Options: scheme {string}; mac/editing {boolean}; onAction {Function}.
 * Data sources: gridKeymap and SpreadsheetGrid. UI Kit reference: None.
 */
import { actionFor } from "@/lib/tabular/gridKeymap";
export function useGridKeyboard({ scheme, mac, editing, onAction }) {
  return (event) => {
    if (event.isComposing || event.nativeEvent?.isComposing) return;
    const action = actionFor(event, { scheme, mac, editing });
    if (!action) return;
    // The browser must dispatch its native clipboard event with the data.
    if (["copy", "cut", "paste", "pasteValues"].includes(action)) {
      onAction(action, event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onAction(action, event);
  };
}
