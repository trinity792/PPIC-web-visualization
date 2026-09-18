"use client";

/**
 * ViewHydrator.js — loads a saved or deep-linked view into the config store once
 * on mount.
 *
 * Extracted from VisualizationWizard so both editor shells share one hydration
 * path: the module workbench and the standalone Visualization Tool must resolve
 * `?view=` identically, or a link would behave differently depending on where it
 * was opened. Renders nothing unless the view was declined, in which case it
 * shows the reason (an older format, another module's dataset) above the
 * editor - the module workbench has no activity log to carry the message.
 *
 * Three shapes are accepted, in order:
 *   1. a browser-local saved-view id (savedViews.getView)
 *   2. a serialized multi-chart workspace (deserializeWorkspace)
 *   3. a serialized single chart config (deserialize)
 *
 * Props:
 *   viewId         {string|null} — saved-view id or serialized deep link
 *   hasBuiltInView {boolean}     — the initial config already IS this view, so
 *                                  hydrating again would be a no-op overwrite
 *
 * Data sources:
 *   - components/chart-builder/savedViews.js
 *   - Chart configuration store (dispatch, schema)
 */

import React, { useEffect, useState } from "react";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  deserialize,
  deserializeWorkspace,
  getView,
  isRejectedView,
} from "@/components/chart-builder/savedViews";
import { logEditorEvent } from "@/lib/logs/editorLog";

export default function ViewHydrator({ viewId, hasBuiltInView = false }) {
  const { dispatch, schema } = useChartConfig();
  const [declined, setDeclined] = useState(null);

  useEffect(() => {
    if (!viewId || hasBuiltInView) return;
    // A declined view (an older format, another module's dataset) is reported
    // and otherwise ignored: the page stays on its default question rather
    // than loading a half-converted spec or a rejection object as a config.
    const decline = (message) => {
      setDeclined(message);
      logEditorEvent({
        severity: "error",
        code: "VIEW_NOT_LOADED",
        summary: "Could not open that view",
        detail: message,
        source: "ViewHydrator",
      });
    };
    try {
      const local = getView(viewId, schema);
      if (local) {
        if (isRejectedView(local)) decline(local.message);
        else dispatch({ type: "LOAD_VIEW", config: local });
        return;
      }
      const decoded = decodeURIComponent(viewId);
      // Multi-chart embeds carry the whole workspace; single views carry one
      // config. deserializeWorkspace returns null for the single-config shape.
      const workspace = deserializeWorkspace(decoded, schema);
      if (workspace) {
        dispatch({ type: "LOAD_WORKSPACE", workspace });
        return;
      }
      const imported = deserialize(decoded, schema);
      if (isRejectedView(imported)) decline(imported.message);
      else dispatch({ type: "LOAD_VIEW", config: imported });
    } catch (error) {
      // Unknown or malformed deep links fall back to the default question.
      decline(error.message);
    }
  }, [dispatch, hasBuiltInView, schema, viewId]);

  if (!declined) return null;
  return (
    <div className="page-container px-4 pt-4 sm:px-8 lg:px-12">
      <Alert variant="destructive" role="status" className="max-w-xl">
        <AlertTitle>Could not open that view</AlertTitle>
        <AlertDescription>{declined}</AlertDescription>
      </Alert>
    </div>
  );
}
