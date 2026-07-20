"use client";

/**
 * ConfigActions.js — import/export of the chart configuration as JSON.
 *
 * Split intentionally: `ImportConfigButton` lives in the dataset step (load a
 * saved config alongside the data), `ExportConfigButton` lives in the edit step
 * (save the chart you're building). Both round-trip through savedViews so a
 * multi-chart workspace survives; a single-chart file loads as one view.
 *
 * Props:
 *   (none — read/dispatch through useChartConfig())
 *
 * Data sources:
 *   - components/chart-builder/savedViews.js (serialize/deserialize + workspace)
 *   - lib/export/exportTable.js (downloadBlob)
 */

import React, { useRef } from "react";

import { Download, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import {
  deserialize,
  deserializeWorkspace,
  serialize,
  serializeWorkspace,
} from "@/components/chart-builder/savedViews";
import { downloadBlob } from "@/lib/export/exportTable";
import { logEditorEvent } from "@/lib/logs/editorLog";

export function ExportConfigButton() {
  const { config, workspace } = useChartConfig();
  const multi = (workspace?.charts?.length || 1) > 1;

  function onDownload() {
    // Multi-chart: save the whole workspace so re-import restores every chart.
    const json = multi ? serializeWorkspace(workspace) : serialize(config);
    const blob = new Blob([json], { type: "application/json" });
    downloadBlob(blob, `${config.module || "chart"}-config.json`);
    logEditorEvent({
      severity: "info",
      code: "CONFIG_EXPORTED",
      summary: multi ? "Downloaded a chart workspace" : "Downloaded a chart config",
      source: "ConfigActions",
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={onDownload}>
      <Download aria-hidden="true" />
      Export config
    </Button>
  );
}

export function ImportConfigButton() {
  const { dispatch, schema } = useChartConfig();
  const inputRef = useRef(null);

  function onImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        // A workspace file restores every chart; a single-config file loads one.
        const importedWorkspace = deserializeWorkspace(text, schema);
        if (importedWorkspace) {
          dispatch({ type: "LOAD_WORKSPACE", workspace: importedWorkspace });
        } else {
          dispatch({ type: "LOAD_VIEW", config: deserialize(text, schema) });
        }
        logEditorEvent({
          severity: "info",
          code: "CONFIG_IMPORTED",
          summary: importedWorkspace
            ? "Imported a chart workspace"
            : "Imported a chart config",
          source: "ConfigActions",
        });
      } catch (error) {
        logEditorEvent({
          severity: "error",
          code: "CONFIG_IMPORT_FAILED",
          summary: "Could not import that config file",
          detail: error.message,
          source: "ConfigActions",
        });
      }
    };
    reader.readAsText(file);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
      >
        <Upload aria-hidden="true" />
        Import config
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onImport}
      />
    </>
  );
}
