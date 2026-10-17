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
 *   useChartHover(model) — [active, setActive, setPointerActive]; keyboard
 *                         focus remains available when mouse hover is disabled
 *
 * Data sources:
 *   - Set by the visx drawings from their hover state
 *   - advancedMode.js (the editor's session-only mouse-hover preference)
 */

import React from "react";
import { useAdvancedMode } from "@/components/chart-builder/advancedMode";

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

/** Share hover policy across drawings without disabling clicks or keyboard access. */
export function useChartHover(model) {
  const { mouseHoverAnimations = true } = useAdvancedMode();
  const [hovered, setHovered] = React.useState(null);
  const active = hovered?.model === model && (mouseHoverAnimations || hovered.source !== "pointer") ? hovered.value : null;
  const setActive = (value) => setHovered(value == null ? null : { model, value, source: "keyboard" });
  const setPointerActive = (value) => {
    if (mouseHoverAnimations) setHovered(value == null ? null : { model, value, source: "pointer" });
  };
  // A disabled hover must not reappear later when the setting is re-enabled.
  React.useEffect(() => {
    if (!mouseHoverAnimations) setHovered((previous) => previous?.source === "pointer" ? null : previous);
  }, [mouseHoverAnimations]);
  return [active, setActive, setPointerActive];
}
