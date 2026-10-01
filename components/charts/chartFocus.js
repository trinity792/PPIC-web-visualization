"use client";

/**
 * chartFocus.js — which series a chart is focused on while the reader hovers
 * it, shared by the drawing and the key around it.
 *
 * PPIC's published bar charts show only the hovered series in the key. The key
 * is drawn by ChartFrame, outside the drawing, so ChartFrame provides this
 * focus and the drawing sets it; ChartKey reads it. Outside a ChartFrame (unit
 * tests, a bare drawing) there is no provider, and setting focus does nothing.
 *
 * Exports:
 *   ChartFocusProvider — holds { focusId, setFocusId } for one chart
 *   useChartFocus()    — { focusId: string|null, setFocusId(id|null) }
 *
 * Data sources:
 *   - Set by the visx drawings (BarChart) from their hover state
 */

import React from "react";

const NO_FOCUS = Object.freeze({ focusId: null, setFocusId: () => {} });
const ChartFocusContext = React.createContext(NO_FOCUS);

export function ChartFocusProvider({ children }) {
  const [focusId, setFocusId] = React.useState(null);
  const value = React.useMemo(() => ({ focusId, setFocusId }), [focusId]);
  return <ChartFocusContext.Provider value={value}>{children}</ChartFocusContext.Provider>;
}

export function useChartFocus() {
  return React.useContext(ChartFocusContext);
}
