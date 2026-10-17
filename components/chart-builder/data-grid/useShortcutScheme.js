"use client";

/**
 * useShortcutScheme.js — the reader's keyboard scheme for the data grid,
 * Google Sheets (the default) or Excel, remembered per viewer in
 * localStorage (spreadsheet grid plan, workstream 2).
 *
 * Storage can be missing or throw (a private window, blocked site data), so
 * every read and write is guarded and the scheme falls back to Sheets.
 *
 * Exports:
 *   SHORTCUT_SCHEME_KEY
 *   useShortcutScheme() — [scheme, setScheme]
 *   isMac()             — whether Cmd (not Ctrl) is the platform's command key
 *
 * Data sources:
 *   - lib/tabular/gridKeymap.js (the scheme ids)
 */

import { useCallback, useEffect, useState } from "react";

import { DEFAULT_SCHEME, SCHEME_IDS } from "@/lib/tabular/gridKeymap";

export const SHORTCUT_SCHEME_KEY = "visualizationTool.gridShortcutScheme";

function readScheme() {
  try {
    const saved = window.localStorage.getItem(SHORTCUT_SCHEME_KEY);
    return SCHEME_IDS.includes(saved) ? saved : DEFAULT_SCHEME;
  } catch {
    return DEFAULT_SCHEME;
  }
}

export function useShortcutScheme() {
  const [scheme, setSchemeState] = useState(DEFAULT_SCHEME);

  // Restore the saved scheme after hydration to avoid an SSR mismatch.
  useEffect(() => {
    setSchemeState(readScheme());
  }, []);

  const setScheme = useCallback((next) => {
    const value = SCHEME_IDS.includes(next) ? next : DEFAULT_SCHEME;
    setSchemeState(value);
    try {
      window.localStorage.setItem(SHORTCUT_SCHEME_KEY, value);
    } catch {
      // Not remembered this time; the choice still holds for this page.
    }
  }, []);

  return [scheme, setScheme];
}

/** Whether this is a Mac (or iPad or iPhone), where Cmd is the command key. */
export function isMac() {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}
