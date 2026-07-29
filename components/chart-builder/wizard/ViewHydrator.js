"use client";

/**
 * ViewHydrator.js — loads a saved or deep-linked view into the config store once
 * on mount.
 *
 * Extracted from VisualizationWizard so both editor shells share one hydration
 * path: the module workbench and the standalone Visualization Tool must resolve
 * `?view=` identically, or a link would behave differently depending on where it
 * was opened. Renders nothing.
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

/* eslint-disable react/prop-types */

import { useEffect } from "react";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import {
  deserialize,
  deserializeWorkspace,
  getView,
} from "@/components/chart-builder/savedViews";

export default function ViewHydrator({ viewId, hasBuiltInView = false }) {
  const { dispatch, schema } = useChartConfig();

  useEffect(() => {
    if (!viewId || hasBuiltInView) return;
    try {
      const local = getView(viewId, schema);
      if (local) {
        dispatch({ type: "LOAD_VIEW", config: local });
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
      dispatch({ type: "LOAD_VIEW", config: imported });
    } catch {
      // Unknown deep links fall back to the default preset.
    }
  }, [dispatch, hasBuiltInView, schema, viewId]);

  return null;
}
