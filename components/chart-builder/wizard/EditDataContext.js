"use client";

/**
 * EditDataContext.js — lets anything in the Visualization Tool's Edit step
 * open the table for editing (import overhaul, phase 4): the preview's
 * "Fix in data" links, the chart-choice note, and the View Chart / Edit Data
 * toggle all go through it.
 *
 * Exports:
 *   EditDataContext  — null outside the Edit step, so a component can offer
 *                      "Fix in data" only where the data can be edited
 *   EditDataProvider — holds the view ("chart" | "data") and the cell to show
 *   useEditData()    — { view, setView, focus, openData(target) } or null
 *
 * `openData({ column, row })` switches to Edit Data and selects that cell;
 * `column` is a column name (the chart's messages know names, not positions).
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export const EditDataContext = createContext(null);

export function useEditData() {
  return useContext(EditDataContext);
}

export function EditDataProvider({ children }) {
  const [view, setView] = useState("chart");
  const [focus, setFocus] = useState(null);
  const openData = useCallback((target = {}) => {
    setView("data");
    // A new key each time, so asking again for the same cell still scrolls to it.
    setFocus({ ...target, key: Date.now() });
  }, []);
  const value = useMemo(() => ({ view, setView, focus, openData }), [view, focus, openData]);
  return <EditDataContext.Provider value={value}>{children}</EditDataContext.Provider>;
}
