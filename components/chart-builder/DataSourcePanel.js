"use client";

/**
 * DataSourcePanel.js — the sidebar Data section, extended: choose between the
 * module dataset and "Your data" (paste or upload), and manage the inline
 * table (open editor, revert to original, remove).
 *
 * Props:
 *   (none — reads/dispatches through useChartConfig())
 *
 * Data sources:
 *   - `lib/tabular/parseTable.js` for paste/upload; dispatches SET_DATA_SOURCE
 *   - module schema for the module-dataset option (existing behavior)
 *
 * UI Kit reference:
 *   - Extends the existing DataSourcesSection (ChartSidebar) rather than
 *     replacing it; upload via a styled file input + Button, paste via Textarea
 */

import React, { useRef, useState } from "react";

import { Pencil, RotateCcw, Trash2, Upload } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import InputTableEditor from "@/components/chart-builder/InputTableEditor";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { logEditorEvent } from "@/lib/logs/editorLog";
import { parseFile, parsePaste } from "@/lib/tabular/parseTable";
import { isVisible } from "@/lib/visualization/settingsTiers";

/** "2,340 rows × 6 columns" — shape only, never cell values (privacy rule). */
function tableShape(table) {
  return `${(table.rows || []).length.toLocaleString()} rows × ${(table.columns || []).length} columns`;
}

export default function DataSourcePanel() {
  const { config, dispatch, schema } = useChartConfig();
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const fileInputRef = useRef(null);

  if (!isVisible("ownData", config.tier)) return null;

  const source = config.data?.source || "module";
  const inline = config.data?.inline;

  function loadInlineTable(table, originName) {
    setError("");
    const withMeta = {
      ...table,
      meta: {
        importedAt: new Date().toISOString(),
        originalName: originName || null,
        // A pristine snapshot so "revert to original" has something to
        // restore to after in-place edits in InputTableEditor.
        original: { columns: table.columns, rows: table.rows },
      },
    };
    dispatch({ type: "SET_DATA_SOURCE", source: "inline", inline: withMeta });
    logEditorEvent({
      severity: "info",
      code: "TABLE_IMPORTED",
      summary: `${tableShape(table)} from ${originName ? "a file upload" : "a paste"}`,
      source: "DataSourcePanel",
    });
  }

  async function handlePaste() {
    const { value, errors } = await parsePaste(pasteText);
    if (errors.length || !value) {
      const message = errors[0]?.message || "The pasted text could not be parsed.";
      setError(message);
      logEditorEvent({
        severity: "error",
        code: errors[0]?.code || "TABLE_PARSE_FAILED",
        summary: "Paste import failed",
        detail: message,
        source: "DataSourcePanel",
      });
      return;
    }
    loadInlineTable(value, null);
    setPasteText("");
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;
    const { value, errors } = await parseFile(file);
    if (errors.length || !value) {
      const message = errors[0]?.message || "The file could not be parsed.";
      setError(message);
      logEditorEvent({
        severity: "error",
        code: errors[0]?.code || "TABLE_PARSE_FAILED",
        summary: `Upload of "${file.name}" failed`,
        detail: message,
        source: "DataSourcePanel",
      });
      return;
    }
    loadInlineTable(value, file.name);
  }

  function handleSourceChange(nextSource) {
    if (nextSource === source) return;
    setError("");
    dispatch({
      type: "SET_DATA_SOURCE",
      source: nextSource,
      inline: nextSource === "inline" ? inline : undefined,
    });
  }

  function handleRemove() {
    dispatch({ type: "SET_DATA_SOURCE", source: "module" });
    logEditorEvent({
      severity: "info",
      code: "TABLE_REMOVED",
      summary: "Removed your data; reverted to the module dataset",
      source: "DataSourcePanel",
    });
  }

  function handleTableChange(nextTable) {
    dispatch({
      type: "SET_DATA_SOURCE",
      source: "inline",
      inline: {
        ...inline,
        columns: nextTable.columns,
        rows: nextTable.rows,
        issues: nextTable.issues,
      },
    });
  }

  function handleRevert() {
    const original = inline?.meta?.original;
    if (!original) return;
    handleTableChange({ columns: original.columns, rows: original.rows, issues: [] });
    logEditorEvent({
      severity: "info",
      code: "TABLE_REVERTED",
      summary: "Reverted your data to the original import",
      source: "DataSourcePanel",
    });
  }

  return (
    <div className="grid gap-3 rounded-lg border bg-card p-3">
      <div className="grid gap-2">
        <Label htmlFor="data-source-mode">Dataset</Label>
        <Select value={source === "inline" ? "inline" : "module"} onValueChange={handleSourceChange}>
          <SelectTrigger id="data-source-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="module">{schema.label}</SelectItem>
            <SelectItem value="inline">Your data</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {source === "inline" && !inline ? (
        <div className="grid gap-2">
          <Label htmlFor="data-source-paste">Paste from Excel or Sheets</Label>
          <Textarea
            id="data-source-paste"
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder="Paste a table here"
            className="min-h-24 font-mono text-xs"
          />
          <Button type="button" size="sm" onClick={handlePaste} disabled={!pasteText.trim()}>
            Use pasted data
          </Button>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx"
              className="hidden"
              onChange={handleFile}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload aria-hidden="true" className="size-3.5" />
              Upload a file
            </Button>
            <span className="text-xs text-muted-foreground">CSV, TSV, TXT, or XLSX</span>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      ) : null}

      {source === "inline" && inline ? (
        <div className="grid gap-2">
          <p className="text-xs text-muted-foreground">
            {tableShape(inline)}
            {inline.meta?.originalName ? ` · ${inline.meta.originalName}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-1.5">
                  <Pencil aria-hidden="true" className="size-3.5" />
                  Edit table
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                  <DialogTitle>Edit your data</DialogTitle>
                  <DialogDescription>
                    Fix cells, rename headers, add derived columns, or revert to the
                    original import. Nothing here is ever sent to a server.
                  </DialogDescription>
                </DialogHeader>
                <InputTableEditor
                  table={inline}
                  onChange={handleTableChange}
                  onRevert={inline.meta?.original ? handleRevert : undefined}
                />
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button">Done</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {inline.meta?.original ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleRevert}
              >
                <RotateCcw aria-hidden="true" className="size-3.5" />
                Revert to original
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleRemove}
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
              Remove
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
