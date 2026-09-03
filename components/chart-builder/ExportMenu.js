"use client";

/**
 * ExportMenu.js — the editor's export controls.
 *
 * Two independent export controls, each exported on its own so a shell can
 * place them wherever it likes:
 *
 *   • ExportChartButton — a live image-preview dialog with format and quality
 *     controls for PNG/SVG/JPG/PDF, plus an embed dialog for the workspace.
 *   • ExportDataButton  — the chart-shaped table under its active settings
 *     (including rows hidden by its visual ranking cap), or the module's entire
 *     cleaned dataset (fetched full, ignoring the chart's filters), as CSV or
 *     Excel.
 *
 * The default export composes both buttons. Image quality lives with the image
 * preview so the wizard and module workbench expose the same complete flow.
 *
 * Props (both buttons):
 *   graphDivRef  {Object}       — ref to the active mounted Plotly graph div
 *   loaded       {Object}       — the loaded chart result behind the active chart
 *   previews     {Array|null}   — per-chart {id,name,config,result} for the whole
 *                                 workspace (from PreviewContext); enables
 *                                 multi-chart export
 *   graphDivRefs {Object|null}  — live map of chartId → mounted graph div
 *   disabled     {boolean}      — the preview is not ready. ExportChartButton
 *                                 greys its trigger out entirely (there is no
 *                                 figure). ExportDataButton greys out only its
 *                                 "as displayed" items: the entire cleaned
 *                                 dataset is addressable from config + schema,
 *                                 so it stays exportable from an unconfigured
 *                                 chart.
 * Data sources:
 *   - `lib/export/{exportImage,exportTable}.js`; embed link via
 *     `components/chart-builder/savedViews.js` serializeWorkspace
 *
 * UI Kit reference:
 *   - ui/dropdown-menu, ui/dialog, ui/toggle-group; brand icons via lucide-react
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  ArrowLeft,
  Check,
  Code2,
  ExternalLink,
  FileDown,
  FileSpreadsheet,
  Image as ImageIcon,
  Laptop,
  Lock,
  LockOpen,
  LoaderCircle,
  Monitor,
  Scan,
  SlidersHorizontal,
  Smartphone,
  Table,
  Tablet,
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/components/ui/utils";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import {
  fullTableUrl,
  loadChartExportData,
} from "@/components/chart-builder/chartData";
import { serializeWorkspace } from "@/components/chart-builder/savedViews";
import {
  exportCombinedImage,
  exportImage,
  IMAGE_FORMATS,
  IMAGE_QUALITIES,
  renderCombinedImagePreview,
  renderImagePreview,
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
import { CHART_HEIGHTS } from "@/lib/constants";

/**
 * ======================================================================
 * Shared helpers
 * ======================================================================
 */

function exportBase(config) {
  return config.question?.dataset?.kind === "inline" || config.data?.source === "inline"
    ? "your-data"
    : config.question?.dataset?.moduleId || config.module || "chart";
}

function slug(text) {
  return String(text || "chart")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function imageFilename(config, format) {
  const chartType = config.presentation?.chartType || config.chartType;
  return `${exportBase(config)}-${chartType}.${format.ext || format.id}`;
}

function combinedImageFilename(config, format) {
  return `${exportBase(config)}-charts.${format.ext || format.id}`;
}

const IMAGE_SIZE_PRESETS = Object.freeze([
  { id: "phone", label: "Phone", width: 390, icon: Smartphone },
  { id: "tablet", label: "Tablet", width: 768, icon: Tablet },
  { id: "laptop", label: "Laptop", width: 1440, icon: Laptop },
  { id: "monitor", label: "Monitor", width: 1920, icon: Monitor },
]);
const DEFAULT_IMAGE_SIZE = Object.freeze({ width: 1100, height: CHART_HEIGHTS.default });
const MIN_IMAGE_DIMENSION = 240;
const MAX_IMAGE_DIMENSION = 3840;
const RESPONSIVE_GRID_BREAKPOINT = 1024;

function pixelDimension(value) {
  if (String(value).trim() === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < MIN_IMAGE_DIMENSION) return null;
  if (number > MAX_IMAGE_DIMENSION) return null;
  return Math.round(number);
}

function graphPixelSize(graphDiv) {
  const bounds = graphDiv?.getBoundingClientRect?.();
  const width =
    Number(graphDiv?._fullLayout?.width) ||
    Number(bounds?.width) ||
    Number(graphDiv?.clientWidth);
  const height =
    Number(graphDiv?._fullLayout?.height) ||
    Number(bounds?.height) ||
    Number(graphDiv?.clientHeight);
  return {
    width: pixelDimension(width) || DEFAULT_IMAGE_SIZE.width,
    height: pixelDimension(height) || DEFAULT_IMAGE_SIZE.height,
  };
}

function exportGridDimensions(layout, count, width, responsive = false) {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (responsive && width < RESPONSIVE_GRID_BREAKPOINT) {
    return { cols: 1, rows: count };
  }
  if (layout === "1x2") return { cols: 2, rows: 1 };
  if (layout === "2x1") return { cols: 1, rows: count };
  if (layout === "2x2") return { cols: 2, rows: Math.ceil(count / 2) };
  return { cols: 1, rows: count };
}

// The suffix each exportable data source appends to the download filename.
const DATA_SUFFIX = { chart: "", original: "-original" };

/**
 * The charts an export operates on: every workspace chart when the preview
 * context is wired (with per-chart config + loaded result), else a single
 * synthetic chart from the active config/result (keeps the buttons usable
 * without a PreviewProvider, e.g. in the workbench footer and unit tests).
 */
function useExportCharts(previews, config, loaded) {
  return useMemo(() => {
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
        name: config.presentation?.labels?.title || config.labels?.title || "Chart 1",
        config,
        result: loaded,
      },
    ];
  }, [previews, config, loaded]);
}

const MAX_EMBED_URL_LENGTH = 16000;

function embedPath(config) {
  const moduleId = config.question?.dataset?.moduleId || config.module;
  return moduleId === "byod" ? "/visualization-tool" : `/${moduleId || ""}`;
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
  const title = config.presentation?.labels?.title || config.labels?.title || "PPIC chart";
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

/**
 * ======================================================================
 * Image export
 * ======================================================================
 */

export function ExportChartButton({
  graphDivRef,
  loaded,
  previews = null,
  graphDivRefs = null,
  disabled = false,
}) {
  const { config, workspace } = useChartConfig();
  const [imageOpen, setImageOpen] = useState(false);
  const [formatId, setFormatId] = useState(IMAGE_FORMATS[0].id);
  const [qualityId, setQualityId] = useState(IMAGE_QUALITIES[0].id);
  const [imageWidth, setImageWidth] = useState(String(DEFAULT_IMAGE_SIZE.width));
  const [imageHeight, setImageHeight] = useState(String(DEFAULT_IMAGE_SIZE.height));
  const [aspectLocked, setAspectLocked] = useState(true);
  const [aspectRatio, setAspectRatio] = useState(
    DEFAULT_IMAGE_SIZE.width / DEFAULT_IMAGE_SIZE.height,
  );
  const [sizeSelection, setSizeSelection] = useState("editor");
  const [imagePreview, setImagePreview] = useState({
    status: "idle",
    src: null,
    error: null,
  });
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const activeFormat =
    IMAGE_FORMATS.find((format) => format.id === formatId) || IMAGE_FORMATS[0];
  const activeQuality =
    IMAGE_QUALITIES.find((option) => option.id === qualityId) || IMAGE_QUALITIES[0];
  const exportWidth = pixelDimension(imageWidth);
  const exportHeight = pixelDimension(imageHeight);
  const dimensionsValid = exportWidth != null && exportHeight != null;
  const outputWidth = dimensionsValid
    ? Math.round(exportWidth * activeQuality.scale)
    : null;
  const outputHeight = dimensionsValid
    ? Math.round(exportHeight * activeQuality.scale)
    : null;
  const embed = useMemo(() => embedInfo(config, workspace), [config, workspace]);
  const exportCharts = useExportCharts(previews, config, loaded);
  const multi = exportCharts.length > 1;
  const devicePresetSelected = IMAGE_SIZE_PRESETS.some(
    (preset) => preset.id === sizeSelection,
  );
  const editorUsesStackedGrid =
    sizeSelection === "editor" &&
    typeof window !== "undefined" &&
    window.innerWidth < RESPONSIVE_GRID_BREAKPOINT;
  const responsiveGrid = devicePresetSelected || editorUsesStackedGrid;

  function mountedGraphDivs() {
    return multi
      ? exportCharts.map((chart) => graphDivRefs?.current?.[chart.id] || null)
      : [graphDivRef?.current || null];
  }

  function measuredExportSize({ width = null, responsive = false } = {}) {
    const sizes = mountedGraphDivs().filter(Boolean).map(graphPixelSize);
    const chartSizes = sizes.length ? sizes : [DEFAULT_IMAGE_SIZE];
    const cellWidth = Math.max(...chartSizes.map((size) => size.width));
    const cellHeight = Math.max(...chartSizes.map((size) => size.height));
    const gridWidth = width ?? (responsive ? 0 : Number.POSITIVE_INFINITY);
    const { cols, rows } = exportGridDimensions(
      workspace?.layout,
      exportCharts.length,
      gridWidth,
      responsive,
    );
    return {
      width: width ?? cellWidth * cols,
      height: cellHeight * rows,
    };
  }

  function applyDimensions({ width, height }, selection) {
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);
    setImageWidth(String(nextWidth));
    setImageHeight(String(nextHeight));
    setAspectRatio(nextWidth / nextHeight);
    setAspectLocked(true);
    setSizeSelection(selection);
  }

  function applyEditorDimensions() {
    const stacked =
      typeof window !== "undefined" &&
      window.innerWidth < RESPONSIVE_GRID_BREAKPOINT;
    applyDimensions(measuredExportSize({ responsive: stacked }), "editor");
  }

  function applyDevicePreset(preset) {
    applyDimensions(
      measuredExportSize({ width: preset.width, responsive: true }),
      preset.id,
    );
  }

  function onDimensionChange(axis, value) {
    const parsed = pixelDimension(value);
    setSizeSelection(null);
    if (axis === "width") {
      setImageWidth(value);
      if (aspectLocked && parsed != null) {
        setImageHeight(String(Math.round(parsed / aspectRatio)));
      }
      return;
    }
    setImageHeight(value);
    if (aspectLocked && parsed != null) {
      setImageWidth(String(Math.round(parsed * aspectRatio)));
    }
  }

  function toggleAspectLock() {
    if (!aspectLocked && dimensionsValid) {
      setAspectRatio(exportWidth / exportHeight);
    }
    setAspectLocked((locked) => !locked);
  }

  // Opening the dialog renders the same chart canvas used by the eventual
  // download, at preview density to avoid allocating a 4x monitor-sized bitmap.
  // A stale render is ignored if the dialog closes or dimensions change.
  useEffect(() => {
    if (!imageOpen) return undefined;
    if (!dimensionsValid) {
      setImagePreview({ status: "idle", src: null, error: null });
      return undefined;
    }
    let cancelled = false;
    setImagePreview({ status: "loading", src: null, error: null });

    const graphDivs = multi
      ? exportCharts.map((chart) => graphDivRefs?.current?.[chart.id] || null)
      : null;
    const previewPromise = multi
      ? renderCombinedImagePreview(graphDivs, {
          layout: workspace?.layout,
          responsive: responsiveGrid,
          scale: 1,
          width: exportWidth,
          height: exportHeight,
        })
      : renderImagePreview(graphDivRef?.current, {
          scale: 1,
          width: exportWidth,
          height: exportHeight,
        });

    Promise.resolve(previewPromise)
      .then((src) => {
        if (!cancelled) setImagePreview({ status: "ready", src, error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setImagePreview({
          status: "error",
          src: null,
          error: error.message || "The export preview could not be rendered.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    dimensionsValid,
    exportCharts,
    exportHeight,
    exportWidth,
    graphDivRef,
    graphDivRefs,
    imageOpen,
    multi,
    responsiveGrid,
    workspace?.layout,
  ]);

  // Reset the "Copied!" confirmation shortly after it shows.
  useEffect(() => {
    if (!embedCopied) return undefined;
    const timer = setTimeout(() => setEmbedCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [embedCopied]);

  async function onExportImage(format) {
    if (!dimensionsValid) return;
    try {
      if (multi) {
        // Live-read each mounted graph div (the previews snapshot may predate a
        // slot's mount); combine them into one image in the workspace layout.
        const graphDivs = exportCharts.map(
          (chart) => graphDivRefs?.current?.[chart.id] || null,
        );
        await exportCombinedImage(graphDivs, {
          layout: workspace?.layout,
          responsive: responsiveGrid,
          format: format.id,
          scale: activeQuality.scale,
          width: exportWidth,
          height: exportHeight,
          transparent: format.supportsAlpha,
          quality: activeQuality.jpegQuality,
          filename: combinedImageFilename(config, format),
        });
      } else {
        await exportImage(graphDivRef?.current, {
          format: format.id,
          scale: activeQuality.scale,
          width: exportWidth,
          height: exportHeight,
          transparent: format.supportsAlpha,
          quality: activeQuality.jpegQuality,
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
      setImageOpen(false);
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
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => {
          applyEditorDimensions();
          setImageOpen(true);
        }}
      >
        <ImageIcon aria-hidden="true" />
        Export image
      </Button>

      <Dialog
        open={imageOpen}
        onOpenChange={(open) => {
          setImageOpen(open);
          if (!open) {
            setImagePreview({ status: "idle", src: null, error: null });
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Export image</DialogTitle>
            <DialogDescription>
              Review the finished image, then choose its format and resolution.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="flex min-h-64 items-center justify-center overflow-auto rounded-lg border bg-muted/30 p-3">
              {imagePreview.status === "loading" ? (
                <div
                  role="status"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                  Rendering export preview…
                </div>
              ) : null}
              {imagePreview.status === "ready" ? (
                <figure className="grid max-w-full gap-2">
                  <figcaption className="text-center text-xs text-muted-foreground">
                    {exportWidth} × {exportHeight} px chart layout
                  </figcaption>
                  <img
                    src={imagePreview.src}
                    alt="Export preview"
                    className="max-h-[55vh] max-w-full object-contain shadow-sm"
                  />
                </figure>
              ) : null}
              {imagePreview.status === "error" ? (
                <p role="alert" className="max-w-lg text-center text-sm text-destructive">
                  {imagePreview.error}
                </p>
              ) : null}
              {!dimensionsValid ? (
                <p role="alert" className="max-w-lg text-center text-sm text-destructive">
                  Enter a width and height from {MIN_IMAGE_DIMENSION} to{" "}
                  {MAX_IMAGE_DIMENSION} pixels.
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 rounded-lg border bg-card p-3 sm:grid-cols-2">
              <div className="grid gap-3 sm:col-span-2">
                <div className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Chart size
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Match the live chart or preview it at a responsive device width.
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={sizeSelection === "editor" ? "default" : "outline"}
                    aria-label="Match editor dimensions"
                    aria-pressed={sizeSelection === "editor"}
                    className="h-8 gap-1.5 px-2.5 text-xs"
                    onClick={applyEditorDimensions}
                  >
                    <Scan aria-hidden="true" className="size-3.5" />
                    Match editor
                  </Button>
                  {IMAGE_SIZE_PRESETS.map((preset) => {
                    const active = sizeSelection === preset.id;
                    const PresetIcon = preset.icon;
                    return (
                      <Button
                        key={preset.id}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        aria-label={`${preset.label} responsive chart at ${preset.width} pixels wide`}
                        aria-pressed={active}
                        className="h-8 gap-1.5 px-2.5 text-xs"
                        onClick={() => applyDevicePreset(preset)}
                      >
                        <PresetIcon aria-hidden="true" className="size-3.5" />
                        {preset.label}
                      </Button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="export-image-width">Width (px)</Label>
                    <Input
                      id="export-image-width"
                      type="number"
                      inputMode="numeric"
                      min={MIN_IMAGE_DIMENSION}
                      max={MAX_IMAGE_DIMENSION}
                      value={imageWidth}
                      aria-invalid={pixelDimension(imageWidth) == null}
                      onChange={(event) =>
                        onDimensionChange("width", event.target.value)
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant={aspectLocked ? "secondary" : "outline"}
                    className="size-9"
                    aria-label={
                      aspectLocked ? "Unlock aspect ratio" : "Lock aspect ratio"
                    }
                    aria-pressed={aspectLocked}
                    title={
                      aspectLocked ? "Aspect ratio linked" : "Aspect ratio unlocked"
                    }
                    onClick={toggleAspectLock}
                  >
                    {aspectLocked ? (
                      <Lock aria-hidden="true" className="size-3.5" />
                    ) : (
                      <LockOpen aria-hidden="true" className="size-3.5" />
                    )}
                  </Button>
                  <div className="grid gap-1.5">
                    <Label htmlFor="export-image-height">Height (px)</Label>
                    <Input
                      id="export-image-height"
                      type="number"
                      inputMode="numeric"
                      min={MIN_IMAGE_DIMENSION}
                      max={MAX_IMAGE_DIMENSION}
                      value={imageHeight}
                      aria-invalid={pixelDimension(imageHeight) == null}
                      onChange={(event) =>
                        onDimensionChange("height", event.target.value)
                      }
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  {aspectLocked
                    ? "Width and height are linked to preserve the chart’s proportions."
                    : "Aspect ratio is unlocked; the chart will reflow into the custom size."}
                </p>

                {dimensionsValid ? (
                  <p className="text-xs text-muted-foreground">
                    {activeQuality.label} quality downloads at {outputWidth} ×{" "}
                    {outputHeight} px ({activeQuality.scale}× density).
                  </p>
                ) : null}
              </div>

              <div className="grid content-start gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Image format
                </span>
                <ToggleGroup
                  type="single"
                  value={formatId}
                  onValueChange={(value) => value && setFormatId(value)}
                  aria-label="Image export format"
                  className="w-full gap-1 rounded-full bg-muted p-1"
                >
                  {IMAGE_FORMATS.map((format) => (
                    <ToggleGroupItem
                      key={format.id}
                      value={format.id}
                      aria-label={`${format.label} format`}
                      className={cn(
                        "h-7 rounded-full border-0 px-3 text-xs font-medium text-muted-foreground shadow-none",
                        "first:rounded-full last:rounded-full",
                        "hover:bg-background/70 hover:text-foreground",
                        "data-[state=on]:bg-ppic-brand data-[state=on]:font-semibold data-[state=on]:text-white data-[state=on]:shadow-sm",
                      )}
                    >
                      {format.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              <div className="grid content-start gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <SlidersHorizontal aria-hidden="true" className="size-3.5" />
                  Image quality
                </span>
                <ToggleGroup
                  type="single"
                  value={qualityId}
                  onValueChange={(value) => value && setQualityId(value)}
                  aria-label="Image export quality"
                  className="w-full gap-1 rounded-full bg-muted p-1"
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
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setImageOpen(false);
                setEmbedOpen(true);
              }}
            >
              <Code2 aria-hidden="true" />
              Embed chart
            </Button>
            <Button
              type="button"
              onClick={() => onExportImage(activeFormat)}
              disabled={!dimensionsValid || imagePreview.status !== "ready"}
            >
              <FileDown aria-hidden="true" />
              Download {activeFormat.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={embedOpen}
        onOpenChange={(open) => {
          setEmbedOpen(open);
          if (!open) setEmbedCopied(false);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader className="items-start">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={() => {
                setEmbedOpen(false);
                setEmbedCopied(false);
                setImageOpen(true);
              }}
            >
              <ArrowLeft aria-hidden="true" />
              Back to export options
            </Button>
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
    </>
  );
}

/**
 * ======================================================================
 * Data export
 * ======================================================================
 */

export function ExportDataButton({
  loaded,
  previews = null,
  disabled = false,
}) {
  const { config, schema } = useChartConfig();
  // Full-source tables are fetched on demand and cached by URL so repeated
  // exports (and the CSV/XLSX pair) don't re-hit the API.
  const originalTableCache = useRef(new Map());
  const exportCharts = useExportCharts(previews, config, loaded);
  const multi = exportCharts.length > 1;

  // Original ("entire cleaned dataset") data is available whenever a chart reads
  // a module dataset with an API path (fetched full from the server) or already
  // carries a richer source table than the chart itself (BYOD, or a module
  // response whose loaded result reconstructs one — originalTable returns null
  // otherwise).
  const hasOriginal = useMemo(
    () =>
      exportCharts.some(
        (chart) =>
          Boolean(fullTableUrl(chart.config, schema)) ||
          Boolean(originalTable(chart.config, chart.result)),
      ),
    [exportCharts, schema],
  );

  // `disabled` means "the preview is not ready", which is about the *chart*, not
  // about the dataset. The entire cleaned dataset is addressable from config and
  // schema alone, so a reader who has configured nothing — the skeleton state a
  // module now opens on — can still take the data away. Only the as-displayed
  // items need a rendered chart; the trigger closes only when neither source has
  // anything to write.
  const chartDataReady = !disabled;
  const triggerDisabled = disabled && !hasOriginal;

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

  // One resolver for both export sources. Chart data is reloaded from the active
  // settings with its visual Top/Bottom N cap disabled, while original data
  // keeps its separate full-source path unchanged.
  async function tableFor(sourceId, chartConfig, chartResult) {
    if (sourceId === "original") {
      return resolveOriginalTable(chartConfig, chartResult);
    }
    if (chartConfig.version === 3) return displayTable(chartConfig, chartResult);
    return displayTable(
      chartConfig,
      await loadChartExportData(chartConfig, schema),
    );
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={triggerDisabled}>
          <Table aria-hidden="true" />
          Export data
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {/* Each source's label and its two formats share a wrapper, so the label
            names the items beneath it for assistive tech (and for tests that
            resolve an item by the group it belongs to). */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Chart data (as displayed)</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!chartDataReady}
            onSelect={() => onExportCsv("chart")}
          >
            <FileDown aria-hidden="true" />
            CSV
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!chartDataReady}
            onSelect={() => onExportXlsx("chart")}
          >
            <FileSpreadsheet aria-hidden="true" />
            Excel (XLSX)
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Original data (entire cleaned dataset)</DropdownMenuLabel>
          <DropdownMenuItem disabled={!hasOriginal} onSelect={() => onExportCsv("original")}>
            <FileDown aria-hidden="true" />
            CSV
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!hasOriginal} onSelect={() => onExportXlsx("original")}>
            <FileSpreadsheet aria-hidden="true" />
            Excel (XLSX)
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * ======================================================================
 * Composed surface (wizard Export step)
 * ======================================================================
 */

export default function ExportMenu({
  graphDivRef,
  loaded,
  previews = null,
  graphDivRefs = null,
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <ExportChartButton
        graphDivRef={graphDivRef}
        loaded={loaded}
        previews={previews}
        graphDivRefs={graphDivRefs}
      />
      <ExportDataButton loaded={loaded} previews={previews} />
    </div>
  );
}
