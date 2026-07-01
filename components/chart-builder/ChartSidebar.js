"use client";

/**
 * ChartSidebar.js — resizable graph-editor sidebar and saved-view controls.
 *
 * Props:
 *   scale         {number}   — current sidebar width/zoom scale
 *   onScaleChange {Function} — callback that persists a new sidebar scale
 *
 * Data sources:
 *   - Chart configuration and module schema from ChartConfigProvider
 *   - Saved views from browser localStorage through savedViews.js
 *
 * UI Kit reference:
 *   - Implements the "Editor Sidebar", form controls, and pill-action patterns
 */

/* eslint-disable react/prop-types */

import React, { useCallback, useEffect, useRef, useState } from "react";

import { Clipboard, Download, RotateCcw, Save, Trash2, Upload } from "lucide-react";

import ComparisonSection from "@/components/chart-builder/ComparisonSection";
import EncodingSection from "@/components/chart-builder/EncodingSection";
import LabelEditor from "@/components/chart-builder/LabelEditor";
import ValidationNotice from "@/components/chart-builder/ValidationNotice";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import {
  deleteView,
  deserialize,
  listViews,
  saveView,
  serialize,
} from "@/components/chart-builder/savedViews";
import { cn } from "@/components/ui/utils";
import {
  CHART_TYPE_IDS,
  getChartType,
} from "@/lib/visualization/chartRegistry";
import { PRESET_ORDER, PRESETS } from "@/lib/visualization/presetRegistry";

import { CHART_SIDEBAR } from "@/lib/constants";

// Charts whose period is a span (vs a single year). Dumbbell/slope also use a
// start+end pair, so a dual-handle slider fits them too.
const RANGE_CHART_TYPES = ["line", "heatmap", "dumbbell", "slope"];

/**
 * ======================================================================
 * Shared Section Primitives
 * ======================================================================
 */

function SectionHeading({ children, className }) {
  return (
    <div className={cn("relative inline-block", className)}>
      <span className="font-heading text-base font-semibold">{children}</span>
      <span className="absolute -bottom-1 left-0 h-0.5 w-8 rounded-full bg-ppic-brand" />
    </div>
  );
}

function SectionCard({ children, className }) {
  return (
    <div className={cn("rounded-xl border bg-card p-3 shadow-xs", className)}>
      {children}
    </div>
  );
}

function Section({ value, label, children }) {
  return (
    <AccordionItem value={value} className="border-b-0">
      <AccordionTrigger className="py-3 hover:no-underline">
        <SectionHeading>{label}</SectionHeading>
      </AccordionTrigger>
      <AccordionContent className="pb-4">{children}</AccordionContent>
    </AccordionItem>
  );
}

// An inline selectable list (the boxed "highlight the chosen row" look from the
// mockup's Region / Graph Type / Preset sections).
function OptionList({ value, onChange, options, ariaLabel }) {
  return (
    <SectionCard className="grid gap-1 p-1.5" role="listbox" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg px-3 py-2 text-left text-sm transition-colors",
              selected
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </SectionCard>
  );
}

/**
 * ======================================================================
 * Data and Graph Editor Sections
 * ======================================================================
 */

function DataSourcesSection() {
  const { config, dispatch, schema } = useChartConfig();
  const sources = schema.sources || [];

  if (sources.length <= 1) {
    // Single-dataset module: show the dataset/source name (e.g. "DoF"), not the
    // module name. The lone source lives on the Source field's values.
    const datasetName =
      sources[0] || schema.fields?.Source?.values?.[0] || schema.label;
    return <p className="text-sm font-medium">{datasetName}</p>;
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="data-source">Source</Label>
      <Select
        value={config.filters.source || ""}
        onValueChange={(value) =>
          dispatch({ type: "SET_FILTER", key: "source", value })
        }
      >
        <SelectTrigger id="data-source">
          <SelectValue placeholder="Choose a source" />
        </SelectTrigger>
        <SelectContent>
          {sources.map((source) => (
            <SelectItem key={source} value={source}>
              {source}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function YearRangeSection() {
  const { config, dispatch, schema } = useChartConfig();
  const [min, max] = schema.yearRange || [2000, new Date().getFullYear()];
  const isRange = RANGE_CHART_TYPES.includes(config.chartType);

  const committed = isRange
    ? [config.period.startYear ?? min, config.period.endYear ?? max]
    : [config.period.year ?? max];
  // Local value for smooth dragging; only commit to the store (and trigger a
  // refetch) on release.
  const [value, setValue] = useState(committed);
  useEffect(() => {
    setValue(
      isRange
        ? [config.period.startYear ?? min, config.period.endYear ?? max]
        : [config.period.year ?? max],
    );
  }, [config.period.startYear, config.period.endYear, config.period.year, isRange, min, max]);

  function commit(next) {
    if (isRange) {
      dispatch({ type: "SET_PERIOD", key: "startYear", value: next[0] });
      dispatch({ type: "SET_PERIOD", key: "endYear", value: next[1] });
    } else {
      dispatch({ type: "SET_PERIOD", key: "year", value: next[0] });
    }
  }

  return (
    <div className="grid gap-3 px-1">
      <Slider
        min={min}
        max={max}
        step={1}
        value={value}
        onValueChange={setValue}
        onValueCommit={commit}
        aria-label={isRange ? "Year range" : "Year"}
        // The compact track matches the editor mockup without changing shared Slider.
        className={cn(
          "[&_[data-slot=slider-track]]:h-2.5",
          "[&_[data-slot=slider-range]]:bg-ppic-orange-300",
          "[&_[data-slot=slider-thumb]]:size-3",
          "[&_[data-slot=slider-thumb]]:border-ppic-orange-300",
        )}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{min}</span>
        <span className="font-medium text-foreground">{value[0]}</span>
        {isRange ? (
          <span className="font-medium text-foreground">{value[1]}</span>
        ) : null}
        <span>{max}</span>
      </div>
    </div>
  );
}

function GraphTypeSection() {
  const { config, dispatch } = useChartConfig();
  return (
    <OptionList
      ariaLabel="Graph type"
      value={config.chartType}
      onChange={(chartType) => dispatch({ type: "SET_CHART_TYPE", chartType })}
      options={CHART_TYPE_IDS.map((chartType) => ({
        value: chartType,
        label: getChartType(chartType).label,
      }))}
    />
  );
}

function PresetSection() {
  const { config, dispatch } = useChartConfig();
  return (
    <div className="grid gap-2">
      <OptionList
        ariaLabel="Preset"
        value={config.preset}
        onChange={(preset) => dispatch({ type: "SET_PRESET", preset })}
        options={PRESET_ORDER.map((id) => ({ value: id, label: PRESETS[id].title }))}
      />
      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        {PRESETS[config.preset]?.question}
      </p>
    </div>
  );
}

function AppearanceSection() {
  const { config, dispatch } = useChartConfig();
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="appearance-legend">Legend</Label>
        <Select
          value={config.appearance.legendPosition || "right"}
          onValueChange={(value) =>
            dispatch({ type: "SET_APPEARANCE", key: "legendPosition", value })
          }
        >
          <SelectTrigger id="appearance-legend">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="right">Right</SelectItem>
            <SelectItem value="bottom">Bottom</SelectItem>
            <SelectItem value="hidden">Hidden</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {config.chartType === "line" ? (
        <div className="grid gap-2">
          <Label htmlFor="appearance-markers">Markers</Label>
          <Select
            value={config.appearance.markerMode || "auto"}
            onValueChange={(value) =>
              dispatch({ type: "SET_APPEARANCE", key: "markerMode", value })
            }
          >
            <SelectTrigger id="appearance-markers">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automatic</SelectItem>
              <SelectItem value="on">On</SelectItem>
              <SelectItem value="off">Off</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {config.chartType === "bar" ? (
        <div className="grid gap-2">
          <Label htmlFor="appearance-orientation">Orientation</Label>
          <Select
            value={config.appearance.orientation || "horizontal"}
            onValueChange={(value) =>
              dispatch({ type: "SET_APPEARANCE", key: "orientation", value })
            }
          >
            <SelectTrigger id="appearance-orientation">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="horizontal">Horizontal</SelectItem>
              <SelectItem value="vertical">Vertical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {["heatmap", "choroplethMap"].includes(config.chartType) ? (
        <div className="grid gap-2">
          <Label htmlFor="appearance-color-scale">Color scale</Label>
          <Select
            value={config.appearance.colorScale || "sequential"}
            onValueChange={(value) =>
              dispatch({ type: "SET_APPEARANCE", key: "colorScale", value })
            }
          >
            <SelectTrigger id="appearance-color-scale">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sequential">Sequential</SelectItem>
              <SelectItem value="diverging">Diverging</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="appearance-watermark">PPIC watermark</Label>
        <Switch
          id="appearance-watermark"
          checked={Boolean(config.appearance.watermark)}
          onCheckedChange={(checked) =>
            dispatch({ type: "SET_APPEARANCE", key: "watermark", value: checked })
          }
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="appearance-footnote">Footnote</Label>
        <Textarea
          id="appearance-footnote"
          value={config.labels.footnote || ""}
          placeholder="Optional source note shown beneath the chart"
          onChange={(event) =>
            dispatch({ type: "SET_LABEL", key: "footnote", value: event.target.value })
          }
        />
      </div>
    </div>
  );
}

// The eight top-level sections, top to bottom. `key` entries only render when
// the current chart type lists them in its `sidebarSections`.
const TOP_SECTIONS = [
  { value: "data-sources", label: "Data Sources", Component: DataSourcesSection },
  { value: "presets", label: "Presets", Component: PresetSection },
  { value: "graph-type", label: "Graph Type", Component: GraphTypeSection },
  { value: "date-range", label: "Date Range", Component: YearRangeSection },
  { value: "encodings", label: "Encodings", Component: EncodingSection, key: "encodings" },
  { value: "comparison", label: "Comparisons", Component: ComparisonSection, key: "comparison" },
  { value: "labels", label: "Labels", Component: LabelEditor, key: "labels" },
  { value: "appearance", label: "Appearance", Component: AppearanceSection, key: "appearance" },
];

/**
 * ======================================================================
 * Saved View Actions
 * ======================================================================
 */

function FooterActions({ scale = 1 }) {
  const { config, dispatch, schema } = useChartConfig();
  const [mode, setMode] = useState("export");
  const [json, setJson] = useState(() => serialize(config));
  const [name, setName] = useState(config.labels.title || "Untitled view");
  const [message, setMessage] = useState("");
  const [views, setViews] = useState([]);

  const refreshViews = useCallback(() => {
    setViews(listViews().filter((view) => view.module === schema.id));
  }, [schema.id]);

  useEffect(() => {
    refreshViews();
  }, [refreshViews]);

  function openConfig(nextMode) {
    setMode(nextMode);
    setMessage("");
    setJson(nextMode === "export" ? serialize(config) : "");
  }

  async function copyConfig() {
    const exported = serialize(config);
    setJson(exported);
    try {
      await navigator.clipboard.writeText(exported);
      setMessage("Configuration copied.");
    } catch {
      setMessage("Copy was blocked. Select the JSON and copy it manually.");
    }
  }

  function importConfig() {
    try {
      dispatch({ type: "LOAD_VIEW", config: deserialize(json, schema) });
      setMessage("Configuration loaded.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  function persist() {
    const view = saveView(name, config);
    refreshViews();
    setMessage(`Saved "${view.name}".`);
  }

  // Compact pills — roughly half the default button height/text/icon size.
  const pill =
    "h-8 w-full gap-2 rounded-full border-ppic-neutral-600 bg-ppic-orange-100 px-2 py-0 text-[0.750rem] text-foreground [&_svg]:size-3!";

  // The button grid reflows with the sidebar's drag scale: a 2x2 layout at
  // normal/expanded widths, collapsing to one stacked column when shrunk.
  const twoColumns = scale >= 1.2;

  return (
    <div className={cn("grid gap-2", twoColumns ? "grid-cols-2" : "grid-cols-1")}>
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" className={pill}>
            <Upload aria-hidden="true" />
            Restore View
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore a saved view</DialogTitle>
            <DialogDescription>
              Load or remove browser-local configurations for this module.
            </DialogDescription>
          </DialogHeader>
          {views.length ? (
            <div className="grid gap-2">
              {views.map((view) => (
                <div key={view.id} className="flex items-center gap-2 rounded-md border p-2">
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-w-0 flex-1 justify-start"
                      onClick={() =>
                        dispatch({
                          type: "LOAD_VIEW",
                          config: deserialize(view.config, schema),
                        })
                      }
                    >
                      <span className="truncate">{view.name}</span>
                    </Button>
                  </DialogClose>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${view.name}`}
                    onClick={() => {
                      deleteView(view.id);
                      refreshViews();
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No saved views yet. Use “Save View” to store the current configuration.
            </p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" className={pill}>
            <Save aria-hidden="true" />
            Save View
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>
              Stores this configuration in your browser for this module.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="saved-view-name">View name</Label>
            <Input
              id="saved-view-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Saved view name"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" onClick={persist}>
                <Save aria-hidden="true" />
                Save view
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button
        type="button"
        variant="outline"
        className={pill}
        onClick={() => dispatch({ type: "RESET" })}
      >
        <RotateCcw aria-hidden="true" />
        Reset View
      </Button>

      <Dialog>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={pill}
            onClick={() => openConfig("export")}
          >
            <Download aria-hidden="true" />
            Import / export
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {mode === "export" ? "Export configuration" : "Import configuration"}
            </DialogTitle>
            <DialogDescription>
              Saved views contain declarative settings only—never rendered figures
              or datasets.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "export" ? "default" : "outline"}
              onClick={() => openConfig("export")}
            >
              <Download aria-hidden="true" />
              Export
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "import" ? "default" : "outline"}
              onClick={() => openConfig("import")}
            >
              <Upload aria-hidden="true" />
              Import
            </Button>
          </div>
          <Textarea
            aria-label={
              mode === "export"
                ? "Exported chart configuration"
                : "Chart configuration to import"
            }
            className="min-h-72 font-mono text-xs"
            value={json}
            onChange={(event) => setJson(event.target.value)}
            readOnly={mode === "export"}
          />
          {message ? (
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {message}
            </p>
          ) : null}
          <DialogFooter>
            {mode === "export" ? (
              <Button type="button" onClick={copyConfig}>
                <Clipboard aria-hidden="true" />
                Copy JSON
              </Button>
            ) : (
              <Button type="button" onClick={importConfig}>
                Load configuration
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * ======================================================================
 * Sidebar Resizing and Main Component
 * ======================================================================
 */

function ResizeHandle({ scale, onScaleChange }) {
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  function onPointerDown(event) {
    event.preventDefault();
    const startX = event.clientX;
    const startScale = scaleRef.current;
    const rootPx =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const basePx = CHART_SIDEBAR.baseRem * rootPx;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(moveEvent) {
      const nextWidth = basePx * startScale + (moveEvent.clientX - startX);
      const next = Math.min(
        CHART_SIDEBAR.maxScale,
        Math.max(CHART_SIDEBAR.minScale, nextWidth / basePx),
      );
      onScaleChange(next);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <button
      type="button"
      aria-label="Resize sidebar"
      onPointerDown={onPointerDown}
      className="absolute inset-y-0 right-0 z-20 w-2 cursor-col-resize bg-transparent transition-colors hover:bg-ppic-brand-soft"
    />
  );
}

export default function ChartSidebar({ scale = 1, onScaleChange }) {
  const { config, schema } = useChartConfig();
  const { isMobile } = useSidebar();

  // Phase 1 (stretch): font stays at base size, the panel fills its width so
  // boxes grow wider. Phase 2 (zoom): once past the stretch threshold, magnify
  // everything so the text/controls grow too.
  const stretching = scale <= CHART_SIDEBAR.stretchScale;
  const zoomFactor = Math.max(1, scale / CHART_SIDEBAR.stretchScale);

  // The sidebar is position:fixed, so it ignores page scroll. Lower its top
  // offset (--sb-top) as the navbar scrolls away so it rides up to the viewport
  // top and grows to fill — staying visible rather than hiding like the navbar.
  // Driven through a CSS var to avoid a React re-render on every scroll tick.
  useEffect(() => {
    const navbarPx =
      CHART_SIDEBAR.navbarHeightRem *
      (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    let raf = 0;
    const apply = () => {
      raf = 0;
      const top = Math.max(navbarPx - window.scrollY, 0);
      document.documentElement.style.setProperty("--sb-top", `${top}px`);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      document.documentElement.style.removeProperty("--sb-top");
    };
  }, []);

  const chartSections = getChartType(config.chartType)?.sidebarSections || [];
  const visibleSections = TOP_SECTIONS.filter(
    (section) => !section.key || chartSections.includes(section.key),
  );

  const body = (
    <>
      <SidebarHeader className="p-4 pb-2">
        <div className="text-center">
          <h2 className="inline-block border-b-2 border-ppic-brand pb-1 font-heading text-lg font-semibold">
            {schema.label}
          </h2>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <ScrollArea className="h-full px-4">
          <div className="grid gap-2 pb-4">
            <ValidationNotice />
            <Accordion
              type="multiple"
              defaultValue={visibleSections.map((section) => section.value)}
              className="grid gap-1"
            >
              {visibleSections.map(({ value, label, Component }) => (
                <Section key={value} value={value} label={label}>
                  <Component />
                </Section>
              ))}
            </Accordion>
          </div>
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <FooterActions scale={scale} />
      </SidebarFooter>
    </>
  );

  return (
    <Sidebar
      collapsible="offcanvas"
      className="top-[var(--sb-top)] h-[calc(100svh-var(--sb-top))] overflow-hidden"
    >
      {isMobile ? (
        body
      ) : (
        <div className="relative h-full w-full">
          {/* Open-state toggle — sits in the sidebar's top-left corner, outside
              the zoom wrapper so it stays a constant size. Closing it hands off
              to the reopen toggle parked at the page's left edge. */}
          <SidebarTrigger className="absolute left-2 top-2 z-20 size-7" />
          {/* Two-phase scaling. While stretching, the wrapper fills the full
              width at zoom 1 so boxes widen but text stays put. Past the stretch
              threshold it's laid out at the stretch-max width and `zoom` magnifies
              it up to the resized container, growing the text/controls too. */}
          <div
            className="flex flex-col overflow-hidden"
            style={{
              zoom: zoomFactor,
              width: stretching
                ? "100%"
                : `${CHART_SIDEBAR.baseRem * CHART_SIDEBAR.stretchScale}rem`,
              height: `calc((100svh - var(--sb-top)) / ${zoomFactor})`,
            }}
          >
            {body}
          </div>
          <ResizeHandle scale={scale} onScaleChange={onScaleChange} />
        </div>
      )}
    </Sidebar>
  );
}
