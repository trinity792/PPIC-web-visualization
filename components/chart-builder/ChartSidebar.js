"use client";

/**
 * ChartSidebar.js — saved-view actions for the chart editor.
 *
 * What remains of the original 1,500-line sidebar after the workbench overhaul's
 * phase 0 split. The section registry now lives in
 * `lib/visualization/sidebarSections.js`, each section in
 * `components/chart-builder/sections/`, and the accordion in
 * `components/chart-builder/sections/SidebarSections.js`. The old default export
 * — a resizable, position-fixed Radix sidebar shell — was already unmounted
 * everywhere and has been removed; `ModuleSidebar` replaces it.
 *
 * This module deliberately has NO default export.
 *
 * Data sources:
 *   - Chart configuration and module schema from ChartConfigProvider
 *   - Saved views from browser localStorage through savedViews.js
 *
 * UI Kit reference:
 *   - Implements the pill-action and dialog patterns
 */

/* eslint-disable react/prop-types */

import React, { useCallback, useEffect, useState } from "react";

import { Clipboard, Download, RotateCcw, Save, Trash2, Upload } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/components/ui/utils";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import {
  deleteView,
  deserialize,
  listViews,
  saveView,
  serialize,
} from "@/components/chart-builder/savedViews";
import { effectiveLabels } from "@/lib/visualization/deriveLabels";

/**
 * ======================================================================
 * Saved View Actions
 * ======================================================================
 */

export function FooterActions({ scale = 1 }) {
  const { config, dispatch, schema } = useChartConfig();
  const [mode, setMode] = useState("export");
  const [json, setJson] = useState(() => serialize(config));
  const [name, setName] = useState(
    () => config.labels.title || effectiveLabels(config, schema).title || "Untitled view",
  );
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

  // The button grid reflows with the panel's drag scale: a 2x2 layout at
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
