"use client";

/**
 * VisualizationWizard.js — the step-based chart-editor shell (Import → Chart
 * Type → Edit → Export) behind the standalone Visualization Tool. It wraps the
 * declarative chart-config store and preview pipeline; each step reuses the
 * shared chart-builder panels.
 *
 * Per-module editors no longer use this shell: as of the module workbench
 * overhaul they render `workbench/ModuleWorkbench` — a single screen with a
 * persistent sidebar — so the wizard is now the bring-your-own-data surface
 * only. Both shells share ChartConfigProvider, PreviewProvider, and ViewHydrator.
 *
 * Props:
 *   schema         {Object}         — registered schema (normally the byod one)
 *   initialConfig  {Object}         — initial declarative chart configuration
 *   steps          {Array<string>}  — ordered step ids (defaults to DEFAULT_STEPS)
 *   viewId         {string|null}    — saved/built-in deep-link view id
 *   hasBuiltInView {boolean}        — whether initialConfig already is viewId
 *   embedded       {boolean}        — render chart preview only for iframe embeds
 *
 * Data sources:
 *   - components/chart-builder/chartConfigStore.js (ChartConfigProvider)
 *   - components/chart-builder/wizard/PreviewContext.js
 *   - components/chart-builder/wizard/ViewHydrator.js
 */

/* eslint-disable react/prop-types */

import React, { useEffect, useMemo, useState } from "react";

import {
  ChartConfigProvider,
  useChartConfig,
} from "@/components/chart-builder/chartConfigStore";
import MultiChartToolbar from "@/components/chart-builder/MultiChartToolbar";

import { PreviewProvider } from "@/components/chart-builder/wizard/PreviewContext";
import ViewHydrator from "@/components/chart-builder/wizard/ViewHydrator";
import PreviewPane from "@/components/chart-builder/wizard/PreviewPane";
import StepNav from "@/components/chart-builder/wizard/StepNav";
import ImportStep from "@/components/chart-builder/wizard/steps/ImportStep";
import ChartTypeStep from "@/components/chart-builder/wizard/steps/ChartTypeStep";
import EditStep from "@/components/chart-builder/wizard/steps/EditStep";
import ExportStep from "@/components/chart-builder/wizard/steps/ExportStep";

const STEP_DEFS = {
  import: { id: "import", label: "Import" },
  chartType: { id: "chartType", label: "Chart Type" },
  edit: { id: "edit", label: "Edit" },
  export: { id: "export", label: "Export" },
};

export const DEFAULT_STEPS = ["import", "chartType", "edit", "export"];

function EmbedChromeHider() {
  useEffect(() => {
    document.body.classList.add("chart-embed-mode");
    return () => document.body.classList.remove("chart-embed-mode");
  }, []);
  return null;
}

function EmbeddedPreview() {
  return (
    <>
      <EmbedChromeHider />
      <main className="min-h-svh bg-white p-3">
        <PreviewPane embedded />
      </main>
    </>
  );
}

function WizardInner({ steps }) {
  const { config, schema } = useChartConfig();
  const [currentId, setCurrentId] = useState(steps[0]);

  const hasImport = steps.includes("import");
  // For the standalone tool, everything after Import needs an imported table;
  // module editors always have data, so their steps are always reachable.
  const dataReady = hasImport ? Boolean(config.data?.inline) : true;

  function isEnabled(stepId) {
    if (stepId === "import") return true;
    return dataReady;
  }

  // If the active step becomes unreachable (e.g. the table was cleared), fall
  // back to the first step.
  useEffect(() => {
    if (!isEnabled(currentId)) setCurrentId(steps[0]);
  }, [dataReady, currentId]);

  const navSteps = useMemo(() => steps.map((id) => STEP_DEFS[id]), [steps]);

  function renderStep() {
    switch (currentId) {
      case "import":
        return <ImportStep />;
      case "chartType":
        return <ChartTypeStep />;
      case "edit":
        return <EditStep />;
      case "export":
        return <ExportStep />;
      default:
        return null;
    }
  }

  return (
    // grid-cols-1 (minmax(0,1fr)), not a bare `grid` (auto = max-content): a wide
    // table in a step must NOT stretch the track — otherwise the step chevrons and
    // the whole page grow to the CSV width. min-w-0 lets the items shrink to the
    // track so the table's own overflow-auto box owns the horizontal scroll.
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <div className="min-w-0 rounded-lg border bg-background p-3 shadow-xs">
        <h1 className="mb-3 text-center font-heading text-lg font-semibold text-muted-foreground">
          {schema.label}
        </h1>
        <StepNav
          steps={navSteps}
          currentId={currentId}
          onSelect={setCurrentId}
          isEnabled={isEnabled}
        />
        <MultiChartToolbar />
      </div>
      {renderStep()}
    </div>
  );
}

export default function VisualizationWizard({
  schema,
  initialConfig,
  steps = DEFAULT_STEPS,
  viewId = null,
  hasBuiltInView = false,
  embedded = false,
}) {
  return (
    // Key on the schema id so switching modules remounts the provider and
    // rebuilds a fresh config against the new schema.
    <ChartConfigProvider key={schema.id} schema={schema} initialConfig={initialConfig}>
      <PreviewProvider>
        <ViewHydrator viewId={viewId} hasBuiltInView={hasBuiltInView} />
        {embedded ? (
          <EmbeddedPreview />
        ) : (
          <main className="min-h-[calc(100svh-7.5rem)] bg-muted/45 px-4 py-6 sm:px-8 lg:px-12">
            <div className="page-container">
              <WizardInner steps={steps} />
            </div>
          </main>
        )}
      </PreviewProvider>
    </ChartConfigProvider>
  );
}
