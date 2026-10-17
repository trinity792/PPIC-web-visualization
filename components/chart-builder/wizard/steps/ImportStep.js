"use client";

/**
 * ImportStep.js — wizard step 1 (standalone Visualization Tool only): bring your
 * own data. The left column reuses DataSourcePanel and offers a date-order
 * choice for date columns. The right column shows the shared table editor.
 *
 * Props:
 *   onProceed {() => void} — optional; renders a "Proceed" button, disabled
 *                            until a table has been imported.
 *   (everything else reads/dispatches through useChartConfig())
 *
 * Data sources:
 *   - components/chart-builder/DataSourcePanel.js (import UI + SET_DATA_SOURCE)
 *   - components/chart-builder/InputTableEditor.js (colour-graded table view)
 *   - lib/tabular/columnTypes.js (date parsing and column profiles)
 */

import React from "react";
import { ArrowRight } from "lucide-react";

import { ImportConfigButton } from "@/components/chart-builder/ConfigActions";
import DataSourcePanel from "@/components/chart-builder/DataSourcePanel";
import InputTableEditor from "@/components/chart-builder/InputTableEditor";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DATE_ORDERS, SLASH_DATE_RE, parseDateToken, profileColumns } from "@/lib/tabular/columnTypes";
import { inlineTableOf } from "@/lib/visualization/inlineQuestion";

import StepShell from "@/components/chart-builder/wizard/StepShell";

function DateOrderSetting() {
  const { config, dispatch } = useChartConfig();
  const inline = inlineTableOf(config);
  const columnIndex = inline?.columns.findIndex((column, index) =>
    column.type === "date" && inline.rows.some((row) => SLASH_DATE_RE.test(String(row[index]).trim())),
  ) ?? -1;
  if (columnIndex < 0) return null;
  const column = inline.columns[columnIndex];
  const example = inline.rows.map((row) => row[columnIndex]).find((value) => SLASH_DATE_RE.test(String(value).trim()));
  const token = parseDateToken(example, column);
  const preview = token ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(token.value) : null;

  function changeOrder(dateOrder) {
    // Reprofile the current cells rather than reimporting the original text,
    // so formulas, edited values, row marks and dataset metadata all survive.
    const table = {
      ...inline,
      columns: inline.columns.map((entry) => entry.type === "date" ? { ...entry, forced: true } : entry),
      meta: { ...inline.meta, importOptions: { ...inline.meta?.importOptions, dateOrder } },
    };
    dispatch({ type: "SET_DATA_SOURCE", source: "inline", inline: { ...table, columns: profileColumns(table) } });
  }

  return (
    <div className="mt-4 grid gap-2">
      <Label htmlFor="import-date-reading">Date format</Label>
      <Select value={inline.meta?.importOptions?.dateOrder || column.dateOrder || "mdy"} onValueChange={changeOrder}>
        <SelectTrigger id="import-date-reading"><SelectValue /></SelectTrigger>
        <SelectContent>
          {DATE_ORDERS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {preview ? <p className="text-xs text-muted-foreground">{example} is read as {preview}.</p> : null}
    </div>
  );
}

function ImportedTableView() {
  const { config, dispatch } = useChartConfig();
  const inline = inlineTableOf(config);

  if (!inline) {
    return (
      <div className="flex h-full min-h-96 items-center justify-center text-center text-muted-foreground">
        Paste or upload a table to see it here.
      </div>
    );
  }

  function handleTableChange(nextTable) {
    dispatch({
      type: "SET_DATA_SOURCE",
      source: "inline",
      // The editor owns the complete table, including formulas, marks, findings
      // and re-read metadata. Picking only rows/columns silently loses edits.
      inline: nextTable,
    });
  }

  function handleRevert() {
    const original = inline?.meta?.original;
    if (!original) return;
    handleTableChange({ ...inline, columns: original.columns, rows: original.rows, issues: [], formulas: {}, rowMarks: {}, findings: original.findings || [] });
  }

  return (
    <InputTableEditor
      onUndo={() => dispatch({ type: "UNDO" })}
      onRedo={() => dispatch({ type: "REDO" })}
      table={inline}
      onChange={handleTableChange}
      onRevert={inline.meta?.original ? handleRevert : undefined}
    />
  );
}

function ProceedButton({ onProceed }) {
  const { config } = useChartConfig();
  const ready = Boolean(inlineTableOf(config));

  return (
    <div className="mt-4">
      <Button type="button" className="w-full" disabled={!ready} onClick={onProceed}>
        Proceed
        <ArrowRight aria-hidden="true" />
      </Button>
      {!ready ? (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Import a table to continue.
        </p>
      ) : null}
    </div>
  );
}

export default function ImportStep({ onProceed }) {
  return (
    <StepShell title="Import Your Data" preview={<ImportedTableView />} fitSidebar>
      <div className="grid gap-2">
        {/* justify-self-start: in this grid the heading would otherwise stretch,
            and its underline with it, across the whole column. */}
        <div className="inline-block justify-self-start border-b-2 border-ppic-brand pb-1 font-heading text-base font-semibold">
          Paste or Upload
        </div>
        <DataSourcePanel />
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Have a saved chart?</span>
          <ImportConfigButton />
        </div>
      </div>
      <DateOrderSetting />
      {onProceed ? <ProceedButton onProceed={onProceed} /> : null}
    </StepShell>
  );
}
