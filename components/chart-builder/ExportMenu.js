"use client";

/**
 * ExportMenu.js — the editor's export controls as two side-by-side buttons:
 *
 *   • Export image — PNG/SVG/JPG/PDF at a chosen quality, plus an embed dialog
 *     with a live iframe preview of the whole workspace.
 *   • Export data  — the chart's displayed table, or the module's entire cleaned
 *     dataset (fetched full, ignoring the chart's filters), each as CSV or Excel.
 *
 * Props:
 *   graphDivRef {Object}       — ref to the active mounted Plotly graph div
 *   loaded      {Object}       — the loaded chart result behind the active chart
 *   previews    {Array|null}   — per-chart {id,name,config,result} for the whole
 *                                workspace (from PreviewContext); enables
 *                                multi-chart export
 *   graphDivRefs {Object|null} — live map of chartId → mounted graph div
 *
 * Data sources:
 *   - `lib/export/{exportImage,exportTable}.js`; embed link via
 *     `components/chart-builder/savedViews.js` serializeWorkspace
 *
 * UI Kit reference:
 *   - ui/dropdown-menu, ui/dialog, ui/toggle-group; brand icons via lucide-react
 */

/* eslint-disable react/prop-types */

import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  Check,
  Code2,
  ExternalLink,
  FileDown,
  FileSpreadsheet,
  Image as ImageIcon,
  SlidersHorizontal,
  Table,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/components/ui/utils";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { serializeWorkspace } from "@/components/chart-builder/savedViews";
import {
  exportCombinedImage,
  exportImage,
  IMAGE_FORMATS,
  IMAGE_QUALITIES,
} from "@/lib/export/exportImage";
import {
  copyText,
  displayTable,
  downloadBlob,
  originalTable,
  tablesToXlsxBlob,
  toCsv,
  toXlsxBlob,
} from "@/lib/export/exportTable";
import { logEditorEvent } from "@/lib/logs/editorLog";

function exportBase(config) {
  return config.data?.source === "inline" ? "your-data" : config.module || "chart";
}

function slug(text) {
  return String(text || "chart")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function imageFilename(config, format) {
  return `${exportBase(config)}-${config.chartType}.${format.ext || format.id}`;
}

function combinedImageFilename(config, format) {
  return `${exportBase(config)}-charts.${format.ext || format.id}`;
}

// The suffix each exportable data source appends to the download filename.
const DATA_SUFFIX = { chart: "", original: "-original" };

/**
 * The `view=table&full=1` URL that returns every row and column of a module's
 * cleaned CSV, ignoring the chart's geography / source / date filters. Returns
 * null for bring-your-own-data (no server dataset) — that path keeps the pasted
 * table client-side. `subset`/`source` are still sent because the routes require
 * a valid subset, but `full=1` makes the query ignore them for row selection.
 */
function fullTableUrl(config, schema) {
  if (!schema?.apiPath || config?.data?.source === "inline") return null;
  const params = new URLSearchParams({ view: "table", full: "1" });
  if (config?.filters?.subset) params.set("subset", config.filters.subset);
  if (config?.filters?.source) params.set("source", config.filters.source);
  return `${schema.apiPath}?${params}`;
}

const MAX_EMBED_URL_LENGTH = 16000;

function embedPath(config) {
  return config.module === "byod" ? "/visualization-tool" : `/${config.module || ""}`;
}

// Stacked / grid layouts need a taller iframe: one 560px band per chart row.
function embedHeight(layout) {
  const rows = layout === "2x1" || layout === "2x2" ? 2 : 1;
  return rows * 560;
}

function embedInfo(config, workspace) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  // Carry the whole workspace (every chart + layout), not just the active
  // chart, so a multi-chart grid embeds intact.
  const src = `${origin}${embedPath(config)}?embed=1&view=${encodeURIComponent(
    serializeWorkspace(workspace),
  )}`;
  const title = config.labels?.title || "PPIC chart";
  const height = embedHeight(workspace?.layout);
  const code = `<iframe title="${title.replace(/"/g, "&quot;")}" src="${src}" width="100%" height="${height}" style="border:0;" loading="lazy"></iframe>`;
  return { src, code, height, tooLarge: src.length > MAX_EMBED_URL_LENGTH };
}

// Desktop width at which the embed is rendered for the preview, so its
// responsive layout (e.g. a 1x2 grid crossing Tailwind's lg breakpoint) matches
// what a full-width embed / new-tab view shows. The iframe is then scaled down
// to fit the dialog, rather than rendered narrow — which would collapse
// multi-column layouts and misrepresent the result.
const EMBED_PREVIEW_WIDTH = 1100;

function EmbedPreview({ src, height }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Never upscale: at desktop widths show the embed 1:1. Default to 1 until the
  // container is measured (the absolute iframe below can't expand the dialog, so
  // an unscaled first frame is merely clipped, not disruptive).
  const scale = width ? Math.min(1, width / EMBED_PREVIEW_WIDTH) : 1;
  const scaledHeight = Math.round(height * scale);

  // The measured box is w-full (dialog-driven, definite) and the iframe is
  // absolutely positioned inside it, so the iframe's 1100px layout box can never
  // push the dialog wider — no circular sizing. Tall layouts scroll vertically.
  return (
    <div className="max-h-[55vh] overflow-y-auto rounded-md border bg-white">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden"
        style={{ height: scaledHeight }}
      >
        <iframe
          title="Embed preview"
          src={src}
          width={EMBED_PREVIEW_WIDTH}
          height={height}
          loading="lazy"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            border: 0,
            transformOrigin: "top left",
            transform: `scale(${scale})`,
          }}
        />
      </div>
    </div>
  );
}

export default function ExportMenu({
  graphDivRef,
  loaded,
  previews = null,
  graphDivRefs = null,
}) {
  const { config, schema, workspace } = useChartConfig();
  // Full-source tables are fetched on demand and cached by URL so repeated
  // exports (and the CSV/XLSX pair) don't re-hit the API.
  const originalTableCache = useRef(new Map());
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  // Default to the highest-quality preset (index 0).
  const [qualityId, setQualityId] = useState(IMAGE_QUALITIES[0].id);
  const quality =
    IMAGE_QUALITIES.find((option) => option.id === qualityId) || IMAGE_QUALITIES[0];
  const embed = useMemo(() => embedInfo(config, workspace), [config, workspace]);

  // The charts export operates on: every workspace chart when the preview
  // context is wired (with per-chart config + loaded result), else a single
  // synthetic chart from the active config/result (keeps the component usable
  // without a PreviewProvider, e.g. in unit tests).
  const exportCharts = useMemo(() => {
    if (Array.isArray(previews) && previews.length) {
      return previews.map((preview) => ({
        id: preview.id,
        name: preview.name,
        config: preview.config,
        result: preview.result,
      }));
    }
    return [
      {
        id: null,
        name: config.labels?.title || "Chart 1",
        config,
        result: loaded,
      },
    ];
  }, [previews, config, loaded]);
  const multi = exportCharts.length > 1;

  // Original ("full source") data is available whenever a chart reads a module
  // dataset with an API path (fetched full from the server) or already carries a
  // richer source table than the chart itself (BYOD, or a module response whose
  // loaded result reconstructs one — originalTable returns null otherwise).
  const hasOriginal = useMemo(
    () =>
      exportCharts.some(
        (chart) =>
          Boolean(fullTableUrl(chart.config, schema)) ||
          Boolean(originalTable(chart.config, chart.result)),
      ),
    [exportCharts, schema],
  );

  // Resolve a chart's "original" table: the entire cleaned CSV for a module
  // (fetched full, filters ignored), or the pasted table for BYOD. `null` when
  // neither exists. Cached by URL.
  async function resolveOriginalTable(chartConfig, chartResult) {
    const url = fullTableUrl(chartConfig, schema);
    if (!url) return originalTable(chartConfig, chartResult);
    const cache = originalTableCache.current;
    if (cache.has(url)) return cache.get(url);
    const response = await fetch(url);
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || "The full dataset could not be loaded.");
    }
    const table = originalTable(chartConfig, { response: { records: body.records || [] } });
    cache.set(url, table);
    return table;
  }

  // One resolver for both export sources: displayTable is synchronous, the full
  // source table may need a fetch — await either uniformly.
  async function tableFor(sourceId, chartConfig, chartResult) {
    return sourceId === "original"
      ? resolveOriginalTable(chartConfig, chartResult)
      : displayTable(chartConfig, chartResult);
  }

  // Reset the "Copied!" confirmation shortly after it shows.
  useEffect(() => {
    if (!embedCopied) return undefined;
    const timer = setTimeout(() => setEmbedCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [embedCopied]);

  async function onExportImage(format) {
    try {
      if (multi) {
        // Live-read each mounted graph div (the previews snapshot may predate a
        // slot's mount); combine them into one image in the workspace layout.
        const graphDivs = exportCharts.map(
          (chart) => graphDivRefs?.current?.[chart.id] || null,
        );
        await exportCombinedImage(graphDivs, {
          layout: workspace?.layout,
          format: format.id,
          scale: quality.scale,
          transparent: format.supportsAlpha,
          quality: quality.jpegQuality,
          filename: combinedImageFilename(config, format),
        });
      } else {
        await exportImage(graphDivRef?.current, {
          format: format.id,
          scale: quality.scale,
          transparent: format.supportsAlpha,
          quality: quality.jpegQuality,
          filename: imageFilename(config, format),
        });
      }
      logEditorEvent({
        severity: "info",
        code: "EXPORT_IMAGE",
        summary: multi
          ? `Exported ${exportCharts.length} charts as ${format.label}`
          : `Exported chart as ${format.label}`,
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

  async function onExportCsv(sourceId) {
    const suffix = DATA_SUFFIX[sourceId];
    try {
      if (multi) {
        // CSV holds one table, so each chart downloads as its own file.
        let count = 0;
        for (const chart of exportCharts) {
          const table = await tableFor(sourceId, chart.config, chart.result);
          if (!table) continue;
          const blob = new Blob([toCsv(table)], { type: "text/csv;charset=utf-8" });
          downloadBlob(blob, `${exportBase(config)}-${slug(chart.name)}${suffix}.csv`);
          count += 1;
        }
        logEditorEvent({
          severity: "info",
          code: "EXPORT_DATA",
          summary: `Exported ${count} charts as CSV (${sourceId} data)`,
          source: "ExportMenu",
        });
        return;
      }
      const table = await tableFor(sourceId, config, loaded);
      if (!table) return;
      const blob = new Blob([toCsv(table)], { type: "text/csv;charset=utf-8" });
      const filename =
        sourceId === "original" ? `${exportBase(config)}-original.csv` : table.filename;
      downloadBlob(blob, filename);
      logEditorEvent({
        severity: "info",
        code: "EXPORT_DATA",
        summary: `Exported ${table.rows.length} rows as CSV (${sourceId} data)`,
        source: "ExportMenu",
      });
    } catch (error) {
      logEditorEvent({
        severity: "error",
        code: "EXPORT_DATA_FAILED",
        summary: `Data export failed (${sourceId} data, CSV)`,
        detail: error.message,
        source: "ExportMenu",
      });
    }
  }

  async function onExportXlsx(sourceId) {
    const suffix = DATA_SUFFIX[sourceId];
    try {
      if (multi) {
        // One workbook, one sheet per chart.
        const sheets = [];
        for (const chart of exportCharts) {
          const table = await tableFor(sourceId, chart.config, chart.result);
          if (table) sheets.push({ name: chart.name, table });
        }
        if (!sheets.length) return;
        const blob = await tablesToXlsxBlob(sheets);
        downloadBlob(blob, `${exportBase(config)}-charts${suffix}.xlsx`);
        logEditorEvent({
          severity: "info",
          code: "EXPORT_DATA",
          summary: `Exported ${sheets.length} charts as XLSX (${sourceId} data)`,
          source: "ExportMenu",
        });
        return;
      }
      const table = await tableFor(sourceId, config, loaded);
      if (!table) return;
      const blob = await toXlsxBlob(table);
      const filename =
        sourceId === "original"
          ? `${exportBase(config)}-original.xlsx`
          : table.filename.replace(/\.csv$/, ".xlsx");
      downloadBlob(blob, filename);
      logEditorEvent({
        severity: "info",
        code: "EXPORT_DATA",
        summary: `Exported ${table.rows.length} rows as XLSX (${sourceId} data)`,
        source: "ExportMenu",
      });
    } catch (error) {
      logEditorEvent({
        severity: "error",
        code: "EXPORT_DATA_FAILED",
        summary: `Data export failed (${sourceId} data, XLSX)`,
        detail: error.message,
        source: "ExportMenu",
      });
    }
  }

  async function onCopyEmbed() {
    await copyText(embed.code);
    setEmbedCopied(true);
    logEditorEvent({
      severity: "info",
      code: "EMBED_COPIED",
      summary: "Copied chart embed code",
      source: "ExportMenu",
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <SlidersHorizontal aria-hidden="true" className="size-3.5" />
          Image quality
        </span>
        <ToggleGroup
          type="single"
          value={qualityId}
          // type="single" emits "" when the active item is re-clicked; ignore it
          // so a quality is always selected.
          onValueChange={(value) => value && setQualityId(value)}
          aria-label="Image export quality"
          className="gap-1 rounded-full bg-muted p-1"
        >
          {IMAGE_QUALITIES.map((option) => (
            <ToggleGroupItem
              key={option.id}
              value={option.id}
              className={cn(
                "h-7 rounded-full border-0 px-3 text-xs font-medium text-muted-foreground shadow-none",
                "first:rounded-full last:rounded-full",
                "hover:bg-background/70 hover:text-foreground",
                "data-[state=on]:bg-ppic-brand data-[state=on]:font-semibold data-[state=on]:text-white data-[state=on]:shadow-sm",
              )}
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <ImageIcon aria-hidden="true" />
              Export image
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>Image</DropdownMenuLabel>
            {IMAGE_FORMATS.map((format) => (
              <DropdownMenuItem key={format.id} onSelect={() => onExportImage(format)}>
                <ImageIcon aria-hidden="true" />
                {format.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Embed</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setEmbedOpen(true);
              }}
            >
              <Code2 aria-hidden="true" />
              Embed code…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Table aria-hidden="true" />
              Export data
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Chart data (as displayed)</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => onExportCsv("chart")}>
              <FileDown aria-hidden="true" />
              CSV
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExportXlsx("chart")}>
              <FileSpreadsheet aria-hidden="true" />
              Excel (XLSX)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Original data (entire dataset)</DropdownMenuLabel>
            <DropdownMenuItem disabled={!hasOriginal} onSelect={() => onExportCsv("original")}>
              <FileDown aria-hidden="true" />
              CSV
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!hasOriginal} onSelect={() => onExportXlsx("original")}>
              <FileSpreadsheet aria-hidden="true" />
              Excel (XLSX)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog
        open={embedOpen}
        onOpenChange={(open) => {
          setEmbedOpen(open);
          if (!open) setEmbedCopied(false);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Embed chart</DialogTitle>
            <DialogDescription>
              Copy this iframe into a page that can embed PPIC chart URLs.
            </DialogDescription>
          </DialogHeader>
          {embed.tooLarge ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              This embed URL is long because it carries chart configuration in the
              link. For large uploaded datasets, export the chart image instead.
            </p>
          ) : (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Preview</p>
              {/* The Dialog only mounts this while open, so the preview iframe
                  loads on demand, not eagerly. Rendered at desktop width and
                  scaled to fit so the layout matches the real embed. */}
              <EmbedPreview src={embed.src} height={embed.height} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" asChild>
              <a href={embed.src} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" />
                Open in new tab
              </a>
            </Button>
            <Button type="button" onClick={onCopyEmbed} disabled={embed.tooLarge}>
              {embedCopied ? (
                <Check aria-hidden="true" />
              ) : (
                <Code2 aria-hidden="true" />
              )}
              {embedCopied ? "Copied!" : "Copy embed code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
