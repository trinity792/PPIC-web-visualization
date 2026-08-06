"use client";

/**
 * ModuleWorkbench.js — the single-screen chart editor behind every `/[module]`
 * route.
 *
 * Replaces the four-step wizard on modules (overhaul decision 1): a workspace
 * bar across the top, a persistent control sidebar on the left, the chart
 * container on the right, no step navigation. The standalone Visualization Tool
 * keeps VisualizationWizard.
 *
 * Layout note: on desktop the two columns are a grid whose row height is set by
 * the chart container alone. ModuleSidebar's panel is absolutely positioned
 * inside its cell, so however long the control list grows it can never stretch
 * the row — it scrolls inside the container's height instead. Below `lg` the
 * columns stack and the sidebar returns to natural flow.
 *
 * Props:
 *   schema         {Object}      — registered module schema
 *   initialConfig  {Object}      — validated initial chart configuration
 *   viewId         {string|null} — saved or built-in deep-link view identifier
 *   hasBuiltInView {boolean}     — whether initialConfig already represents viewId
 *   embedded       {boolean}     — render the preview only, for iframe embeds
 *
 * Data sources:
 *   - components/chart-builder/chartConfigStore.js (ChartConfigProvider)
 *   - components/chart-builder/wizard/PreviewContext.js (PreviewProvider)
 *   - components/chart-builder/wizard/ViewHydrator.js
 *
 * UI Kit reference:
 *   - Implements the "Editor Sidebar" + "Chart Container" page pattern
 */

/* eslint-disable react/prop-types */

import React, { useEffect } from "react";

import { AdvancedModeProvider } from "@/components/chart-builder/advancedMode";
import { ChartConfigProvider } from "@/components/chart-builder/chartConfigStore";
import {
  EditorCapabilitiesProvider,
  useEditorCapabilities,
  WORKBENCH_CAPABILITIES,
} from "@/components/chart-builder/editorCapabilities";
import MultiChartToolbar from "@/components/chart-builder/MultiChartToolbar";
import { PreviewProvider } from "@/components/chart-builder/wizard/PreviewContext";
import ViewHydrator from "@/components/chart-builder/wizard/ViewHydrator";
import ChartContainer from "@/components/chart-builder/workbench/ChartContainer";
import ModuleSidebar from "@/components/chart-builder/workbench/ModuleSidebar";

// ── Embed mode ───────────────────────────────────────────────────────

function EmbedChromeHider() {
  useEffect(() => {
    document.body.classList.add("chart-embed-mode");
    return () => document.body.classList.remove("chart-embed-mode");
  }, []);
  return null;
}

// ── The workspace bar ────────────────────────────────────────────────

/**
 * The multi-chart controls, in their own full-width bar above the two columns —
 * the same placement the standalone tool gives them under its step nav.
 *
 * They sit outside the grid rather than inside the chart card because they act
 * on the workspace (how many charts, in what layout, which one the sidebar
 * edits) rather than on the chart being previewed, and because a bar that spans
 * both columns stays put when the grid below it goes from one chart to four.
 * Shown whenever the surface supports multi-chart at all: gating them behind
 * Advanced Mode left readers with no way to find a tool the workbench declares
 * it has.
 */
function WorkspaceBar() {
  const capabilities = useEditorCapabilities();
  if (!capabilities.multiChart) return null;

  return (
    <div className="min-w-0 rounded-xl border bg-background p-3 shadow-xs">
      <MultiChartToolbar />
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────

export default function ModuleWorkbench({
  schema,
  initialConfig,
  viewId = null,
  hasBuiltInView = false,
  embedded = false,
}) {
  return (
    // Key on the schema id so switching modules remounts the provider and
    // rebuilds a fresh config against the new schema.
    //
    // autoBind={false} is the workbench's manual-encoding rule: the store never
    // picks a field for the reader, on open or on a chart-type switch. Switching
    // from a line to a scatter carries over what the scatter can accept and
    // leaves the rest unset, so the container returns to the skeleton naming the
    // settings still to make — rather than silently re-plotting a chart the
    // reader did not ask for, or reporting the gap as a configuration error. A
    // `?view=` deep link, an embed and a saved view all carry their own
    // bindings, so they still render on arrival.
    <ChartConfigProvider
      key={schema.id}
      schema={schema}
      initialConfig={initialConfig}
      autoBind={false}
    >
      {/* Landing on a module builds no chart: the container shows a skeleton and
          issues no request until the reader changes a setting. Two cases opt
          back out, because in both the chart has already been asked for by name:
          an iframe embed, which has no sidebar to touch and would otherwise show
          a skeleton forever, and any `?view=` deep link or saved view. */}
      <PreviewProvider deferInitialRender={!embedded && !viewId}>
        <ViewHydrator viewId={viewId} hasBuiltInView={hasBuiltInView} />
        {embedded ? (
          <>
            <EmbedChromeHider />
            <main className="min-h-svh bg-white p-3">
              <ChartContainer embedded />
            </main>
          </>
        ) : (
          <main className="min-h-[calc(100svh-7.5rem)] bg-muted/45 px-4 py-6 sm:px-8 lg:px-12">
            <div className="page-container">
              {/* Deliberately NOT items-start: the row must stretch, because
                  that is what gives the sidebar its height. The chart container
                  is the only item contributing intrinsic height (the sidebar's
                  panel is absolutely positioned and contributes none), so the
                  row is exactly as tall as the chart and the stretched sidebar
                  cell inherits that. `items-start` would collapse the cell to
                  zero and the panel with it. */}
              {/* One shared Advanced Mode + capability instance for the whole
                  surface: the sidebar's toggle, its sections, and the workspace
                  bar above the grid all read the same two flags. See the
                  WORKBENCH_CAPABILITIES doc comment in editorCapabilities.js. */}
              <EditorCapabilitiesProvider capabilities={WORKBENCH_CAPABILITIES}>
                <AdvancedModeProvider>
                  <div className="grid min-w-0 grid-cols-1 gap-4">
                    <WorkspaceBar />
                    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
                      <ModuleSidebar />
                      <ChartContainer />
                    </div>
                  </div>
                </AdvancedModeProvider>
              </EditorCapabilitiesProvider>
            </div>
          </main>
        )}
      </PreviewProvider>
    </ChartConfigProvider>
  );
}
