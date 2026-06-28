"use client";

import React, { useEffect, useState } from "react";
import { Clipboard, Download, Save, Trash2, Upload } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import {
  CHART_TYPE_IDS,
  getChartType,
} from "@/lib/visualization/chartRegistry";
import ComparisonSection from "./ComparisonSection";
import EncodingSection from "./EncodingSection";
import LabelEditor from "./LabelEditor";
import PresetPicker from "./PresetPicker";
import ValidationNotice from "./ValidationNotice";
import { useChartConfig } from "./chartConfigStore";
import {
  deleteView,
  deserialize,
  listViews,
  saveView,
  serialize,
} from "./savedViews";

// Charts whose period is a span (vs a single year). Dumbbell/slope also use a
// start+end pair, so a dual-handle slider fits them too.
const RANGE_CHART_TYPES = ["line", "heatmap", "dumbbell", "slope"];

function YearRangeSlider() {
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
    <div className="grid gap-2">
      <Label>{isRange ? "Year range" : "Year"}</Label>
      <Slider
        min={min}
        max={max}
        step={1}
        value={value}
        onValueChange={setValue}
        onValueCommit={commit}
        aria-label={isRange ? "Year range" : "Year"}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{value[0]}</span>
        <span>{isRange ? value[1] : max}</span>
      </div>
    </div>
  );
}

function DataSection() {
  const { config, dispatch, schema } = useChartConfig();
  const subsets =
    config.chartType === "choroplethMap" && schema.subsets?.Counties
      ? ["Counties"]
      : Object.keys(schema.subsets || {});

  function setSubset(value) {
    dispatch({ type: "SET_FILTER", key: "subset", value });
    if (value === "States" && schema.sources?.includes("Census")) {
      dispatch({ type: "SET_FILTER", key: "source", value: "Census" });
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs text-muted-foreground">Module</p>
        <p className="text-sm font-medium">{schema.label}</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="data-subset">Geographic level</Label>
        <Select
          value={config.filters.subset || ""}
          onValueChange={setSubset}
        >
          <SelectTrigger id="data-subset">
            <SelectValue placeholder="Choose a subset" />
          </SelectTrigger>
          <SelectContent>
            {subsets.map((subset) => (
              <SelectItem key={subset} value={subset}>
                {subset}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <YearRangeSlider />
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
    </div>
  );
}

function SavedViewActions() {
  const { config, dispatch, schema } = useChartConfig();
  const [mode, setMode] = useState("export");
  const [json, setJson] = useState(() => serialize(config));
  const [name, setName] = useState(config.labels.title || "Untitled view");
  const [message, setMessage] = useState("");
  const [views, setViews] = useState([]);

  useEffect(() => {
    setViews(listViews().filter((view) => view.module === schema.id));
  }, [schema.id]);

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
    setViews(listViews().filter((item) => item.module === schema.id));
    setMessage(`Saved "${view.name}".`);
  }

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => dispatch({ type: "RESET" })}>
          Reset
        </Button>
        <Button type="button" size="sm" onClick={persist}>
          <Save />
          Save view
        </Button>
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="sm" onClick={() => openConfig("export")}>
            <Download />
            Export or import config
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
              <Download />
              Export
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "import" ? "default" : "outline"}
              onClick={() => openConfig("import")}
            >
              <Upload />
              Import
            </Button>
          </div>
          <Textarea
            className="min-h-72 font-mono text-xs"
            value={json}
            onChange={(event) => setJson(event.target.value)}
            readOnly={mode === "export"}
          />
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          <DialogFooter>
            {mode === "export" ? (
              <Button type="button" onClick={copyConfig}>
                <Clipboard />
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

      {views.length ? (
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              {views.length} saved {views.length === 1 ? "view" : "views"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Saved views</DialogTitle>
              <DialogDescription>
                Load or remove browser-local configurations for this module.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              {views.map((view) => (
                <div key={view.id} className="flex items-center gap-2 rounded-md border p-2">
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${view.name}`}
                    onClick={() => {
                      deleteView(view.id);
                      setViews(listViews().filter((item) => item.module === schema.id));
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      <Label htmlFor="saved-view-name" className="sr-only">
        Saved view name
      </Label>
      <Input
        id="saved-view-name"
        className="h-8"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Saved view name"
      />
    </div>
  );
}

const SECTION_COMPONENTS = {
  data: DataSection,
  encodings: EncodingSection,
  comparison: ComparisonSection,
  labels: LabelEditor,
  appearance: AppearanceSection,
};

const SECTION_LABELS = {
  data: "Data",
  encodings: "Encodings",
  comparison: "Comparison",
  labels: "Labels",
  appearance: "Appearance",
};

export default function ChartSidebar() {
  const { config, dispatch, schema } = useChartConfig();
  const sections = getChartType(config.chartType)?.sidebarSections || [];

  return (
    <Sidebar
      collapsible="offcanvas"
      className="top-30 h-[calc(100svh-7.5rem)]"
    >
      <SidebarHeader className="gap-4 p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Graph editor
          </p>
          <h2 className="font-semibold">{schema.label}</h2>
        </div>
        <PresetPicker />
        <div className="grid gap-2">
          <Label htmlFor="chart-type">Chart type</Label>
          <Select
            value={config.chartType}
            onValueChange={(chartType) =>
              dispatch({ type: "SET_CHART_TYPE", chartType })
            }
          >
            <SelectTrigger id="chart-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHART_TYPE_IDS.map((chartType) => (
                <SelectItem key={chartType} value={chartType}>
                  {getChartType(chartType).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <ScrollArea className="h-full px-4">
          <div className="py-3">
            <ValidationNotice />
            <Accordion
              type="multiple"
              defaultValue={sections}
              className="mt-2"
            >
              {sections.map((section) => {
                const Section = SECTION_COMPONENTS[section];
                if (!Section) return null;
                return (
                  <AccordionItem key={section} value={section}>
                    <AccordionTrigger>{SECTION_LABELS[section]}</AccordionTrigger>
                    <AccordionContent>
                      <Section />
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        </ScrollArea>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="p-4">
        <SavedViewActions />
      </SidebarFooter>
    </Sidebar>
  );
}
