"use client";

/**
 * ExportStep.js — wizard step "Export": the export surface (image PNG/SVG/JPG/
 * PDF, data CSV/XLSX, config JSON) driven by the shared ExportMenu, plus saved-
 * view actions. Reads the same loaded result and mounted graph div the preview
 * rendered (via usePreview), so exports come off the exact displayed figure.
 *
 * Props:
 *   (none)
 *
 * Data sources:
 *   - components/chart-builder/ExportMenu.js
 *   - components/chart-builder/ChartSidebar.js (FooterActions — saved views)
 *   - components/chart-builder/wizard/PreviewContext.js
 */

import React from "react";

import ExportMenu from "@/components/chart-builder/ExportMenu";
import { FooterActions } from "@/components/chart-builder/ChartSidebar";

import PreviewPane from "@/components/chart-builder/wizard/PreviewPane";
import StepShell from "@/components/chart-builder/wizard/StepShell";
import { usePreview } from "@/components/chart-builder/wizard/PreviewContext";

export default function ExportStep() {
  const { result, status, graphDivRef, previews, graphDivRefs } = usePreview();
  const ready = status === "ready" && Boolean(result);

  return (
    <StepShell title="Export" preview={<PreviewPane />}>
      <div className="grid gap-5">
        <div className="grid gap-2">
          <div className="inline-block self-start border-b-2 border-ppic-brand pb-0.5 font-heading text-base font-semibold">
            Export chart
          </div>
          <p className="text-sm text-muted-foreground">
            Download the chart as an image (PNG, SVG, JPG, PDF), the displayed data
            as CSV or Excel, or the chart configuration as JSON.
          </p>
          {ready ? (
            <ExportMenu
              graphDivRef={graphDivRef}
              loaded={result}
              previews={previews}
              graphDivRefs={graphDivRefs}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Finish building a valid chart to enable export.
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <div className="inline-block self-start border-b-2 border-ppic-brand pb-0.5 font-heading text-base font-semibold">
            Saved views
          </div>
          <FooterActions />
        </div>
      </div>
    </StepShell>
  );
}
