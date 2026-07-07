"use client";

/**
 * ExportMenu.js — the editor's Export control: image (PNG/SVG/JPG/PDF with
 * transparency and scale), data (CSV/XLSX of the displayed table), and config
 * (copy / download / import JSON). One dropdown is the single export surface,
 * replacing the old footer import/export affordances.
 *
 * Props:
 *   graphDivRef {Object} — ref to the mounted Plotly graph div (for toImage)
 *   loaded      {Object} — the loaded chart result behind the current chart
 *
 * Data sources:
 *   - `lib/export/{exportImage,exportTable}.js`; config round-trip via
 *     `components/chart-builder/savedViews.js` serialize/deserialize
 *
 * UI Kit reference:
 *   - ui/dropdown-menu for the format list; Button trigger; brand icons via
 *     lucide-react — no new primitives
 */

/* eslint-disable react/prop-types */

import React, { useRef } from "react";

import { Download, FileDown, FileSpreadsheet, Image as ImageIcon, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { deserialize, serialize } from "@/components/chart-builder/savedViews";
import { exportImage, IMAGE_FORMATS } from "@/lib/export/exportImage";
import {
  copyText,
  displayTable,
  downloadBlob,
  toCsv,
  toXlsxBlob,
} from "@/lib/export/exportTable";
import { logEditorEvent } from "@/lib/logs/editorLog";
import { normalizeSpec } from "@/lib/visualization/chartSpec";

function imageFilename(config, format) {
  const base = config.data?.source === "inline" ? "your-data" : config.module || "chart";
  return `${base}-${config.chartType}.${format.ext || format.id}`;
}

export default function ExportMenu({ graphDivRef, loaded }) {
  const { config, dispatch, schema } = useChartConfig();
  const importInputRef = useRef(null);

  async function onExportImage(format) {
    try {
      await exportImage(graphDivRef?.current, {
        format: format.id,
        scale: 2,
        transparent: format.supportsAlpha,
        filename: imageFilename(config, format),
      });
      logEditorEvent({
        severity: "info",
        code: "EXPORT_IMAGE",
        summary: `Exported chart as ${format.label}`,
        source: "ExportMenu",
      });
    } catch (error) {
      logEditorEvent({
        severity: "error",
        code: error.code || "EXPORT_RENDER_FAILED",
        summary: `Chart image export failed (${format.label})`,
        detail: error.message,
        source: error.source || "exportImage",
      });
    }
  }

  function onExportCsv() {
    const table = displayTable(config, loaded);
    const blob = new Blob([toCsv(table)], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, table.filename);
    logEditorEvent({
      severity: "info",
      code: "EXPORT_DATA",
      summary: `Exported ${table.rows.length} rows as CSV`,
      source: "ExportMenu",
    });
  }

  async function onExportXlsx() {
    const table = displayTable(config, loaded);
    const blob = await toXlsxBlob(table);
    downloadBlob(blob, table.filename.replace(/\.csv$/, ".xlsx"));
    logEditorEvent({
      severity: "info",
      code: "EXPORT_DATA",
      summary: `Exported ${table.rows.length} rows as XLSX`,
      source: "ExportMenu",
    });
  }

  function onCopyConfig() {
    // Compact JSON so it pastes cleanly into a bug report or the code editor.
    copyText(JSON.stringify(normalizeSpec(config)));
  }

  function onDownloadConfig() {
    const blob = new Blob([serialize(config)], { type: "application/json" });
    downloadBlob(blob, `${config.module || "chart"}-config.json`);
  }

  function onImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = deserialize(String(reader.result), schema);
        dispatch({ type: "LOAD_VIEW", config: imported });
        logEditorEvent({
          severity: "info",
          code: "CONFIG_IMPORTED",
          summary: "Imported a chart config",
          source: "ExportMenu",
        });
      } catch (error) {
        logEditorEvent({
          severity: "error",
          code: "CONFIG_IMPORT_FAILED",
          summary: "Could not import that config file",
          detail: error.message,
          source: "savedViews",
        });
      }
    };
    reader.readAsText(file);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Download aria-hidden="true" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Image</DropdownMenuLabel>
          {IMAGE_FORMATS.map((format) => (
            <DropdownMenuItem key={format.id} onSelect={() => onExportImage(format)}>
              <ImageIcon aria-hidden="true" />
              {format.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Data</DropdownMenuLabel>
          <DropdownMenuItem onSelect={onExportCsv}>
            <FileDown aria-hidden="true" />
            CSV
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onExportXlsx}>
            <FileSpreadsheet aria-hidden="true" />
            Excel (XLSX)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Config</DropdownMenuLabel>
          <DropdownMenuItem onSelect={onCopyConfig}>Copy config</DropdownMenuItem>
          <DropdownMenuItem onSelect={onDownloadConfig}>Download config</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => importInputRef.current?.click()}>
            <Upload aria-hidden="true" />
            Import config…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onImportFile}
      />
    </>
  );
}
