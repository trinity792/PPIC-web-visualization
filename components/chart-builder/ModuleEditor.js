"use client";

/**
 * ModuleEditor.js — chart-builder entry point for one registered data module.
 *
 * Thin wrapper around the shared VisualizationWizard: a module editor is the
 * wizard with the three non-Import steps (Chart Type → Edit → Export) and the
 * module's data preloaded. The standalone Visualization Tool uses the same
 * wizard with the added Import (bring-your-own-data) step.
 *
 * Props:
 *   moduleId       {string}      — registered module identifier
 *   initialConfig  {Object}      — validated initial chart configuration
 *   viewId         {string|null} — saved or built-in deep-link view identifier
 *   hasBuiltInView {boolean}     — whether initialConfig already represents viewId
 *
 * Data sources:
 *   - Module schema from lib/visualization/moduleRegistry.js
 *   - Chart data through chartData.js and the module API route
 *   - Saved views from browser localStorage through savedViews.js
 */

/* eslint-disable react/prop-types */

import React from "react";

import { getModuleSchema } from "@/lib/visualization/moduleRegistry";

import VisualizationWizard, {
  MODULE_STEPS,
} from "@/components/chart-builder/wizard/VisualizationWizard";

export default function ModuleEditor({
  moduleId,
  initialConfig,
  viewId,
  hasBuiltInView = false,
}) {
  const schema = getModuleSchema(moduleId);

  return (
    <VisualizationWizard
      schema={schema}
      initialConfig={initialConfig}
      steps={MODULE_STEPS}
      viewId={viewId}
      hasBuiltInView={hasBuiltInView}
    />
  );
}
