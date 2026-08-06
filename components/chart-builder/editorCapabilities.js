"use client";

/**
 * editorCapabilities.js — what an editor shell can support (Workstream F).
 *
 * Five booleans — presets, savedViews, layers, activityLog, multiChart —
 * describing a fact about the *surface* (can it support this tool at all),
 * not a guess about the reader (which is what the withdrawn settings-tier
 * registry tried to do; see advancedMode.js). Each capability is combined
 * with `useAdvancedMode()` by the section that owns the tool: a capability
 * says whether a block may exist; Advanced Mode says whether this reader
 * wants to see it right now.
 *
 * The two surfaces' sets live here rather than in the shells that supply them.
 * `WORKBENCH_CAPABILITIES` in particular has two consumers — `ModuleWorkbench`
 * provides it for the workspace bar and the two-column grid below it, and
 * `ModuleSidebar`'s boundary re-supplies it when the rail is mounted alone —
 * and two hand-written copies of one fact drift without failing anything.
 *
 * Exports:
 *   EditorCapabilitiesProvider  — { capabilities } wraps one editor shell
 *   useEditorCapabilities()     — the active capability set (all false
 *                                 outside a provider — a tool nobody declared
 *                                 is a tool nobody can support)
 *   EditorCapabilitiesBoundary  — provides only where no ancestor already
 *                                 does (Workstream F4; see its own doc comment)
 *   NO_CAPABILITIES             — every capability off; the outside-a-provider
 *                                 default, also useful as a test baseline
 *   WORKBENCH_CAPABILITIES      — the module workbench's set
 *   STANDALONE_CAPABILITIES     — the standalone Visualization Tool's set
 *
 * Data sources:
 *   - None (component state / props only)
 */

import React, { createContext, useContext } from "react";

const EditorCapabilitiesContext = createContext(null);

/** Every capability off. The default outside any provider. */
export const NO_CAPABILITIES = Object.freeze({
  presets: false,
  savedViews: false,
  layers: false,
  activityLog: false,
  multiChart: false,
});

/**
 * The module workbench. No presets, because seeding bindings from nothing is
 * the opposite of the surface's manual-encoding rule — Advanced Mode does not
 * change that, it is a rule and not a complexity tier. No saved views (a module
 * chart is reproducible from its URL) and no trace layers (the comparable job
 * is a Series binding or a Geographic Level selection). No activity log, which
 * only ever recorded wizard-only events. Multi-chart is the one it supports,
 * through the workspace bar `ModuleWorkbench` puts above the grid.
 */
export const WORKBENCH_CAPABILITIES = Object.freeze({
  ...NO_CAPABILITIES,
  multiChart: true,
});

/**
 * The standalone Visualization Tool. Everything, because bring-your-own-data
 * has no server dataset to fall back on: a saved view is the only way a chart
 * survives a refresh, and layers are how two pasted columns get compared.
 */
export const STANDALONE_CAPABILITIES = Object.freeze({
  presets: true,
  savedViews: true,
  layers: true,
  activityLog: true,
  multiChart: true,
});

export function EditorCapabilitiesProvider({ capabilities, children }) {
  return (
    <EditorCapabilitiesContext.Provider value={capabilities}>
      {children}
    </EditorCapabilitiesContext.Provider>
  );
}

export function useEditorCapabilities() {
  return useContext(EditorCapabilitiesContext) || NO_CAPABILITIES;
}

/**
 * A provider that only provides when nothing already does — the capability
 * counterpart to `advancedMode.js`'s `AdvancedModeBoundary`, and for the same
 * reason. `ModuleSidebar` needs a working capability set when rendered on its
 * own; `ModuleWorkbench` needs `ChartContainer`, its sidebar's sibling, to
 * read the identical set so `multiChart` means the same thing in both. See
 * `AdvancedModeBoundary`'s doc comment for the full reasoning.
 */
export function EditorCapabilitiesBoundary({ capabilities, children }) {
  const existing = useContext(EditorCapabilitiesContext);
  if (existing) return children;
  return (
    <EditorCapabilitiesProvider capabilities={capabilities}>
      {children}
    </EditorCapabilitiesProvider>
  );
}

export default EditorCapabilitiesProvider;
