"use client";

/**
 * ImportStep.js — wizard step 1 (standalone Visualization Tool only): bring your
 * own data. The left column reuses DataSourcePanel (paste/upload + in-place edit,
 * inlineOnly mode) and adds the "Check" colour legend; the right column shows the
 * parsed table with per-cell colour grading via the shared InputTableEditor.
 *
 * Props:
 *   (none — reads/dispatches through useChartConfig())
 *
 * Data sources:
 *   - components/chart-builder/DataSourcePanel.js (import UI + SET_DATA_SOURCE)
 *   - components/chart-builder/InputTableEditor.js (colour-graded table view)
 */

import React from "react";

import { ImportConfigButton } from "@/components/chart-builder/ConfigActions";
import DataSourcePanel from "@/components/chart-builder/DataSourcePanel";
import InputTableEditor from "@/components/chart-builder/InputTableEditor";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";

import StepShell from "@/components/chart-builder/wizard/StepShell";

function CheckLegend() {
  return (
    <div className="mt-6">
      <div className="mb-2 inline-block border-b-2 border-ppic-brand pb-1 font-heading text-base font-semibold">
        Check
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        In the table, number columns show in{" "}
        <span className="font-medium text-ppic-blue-400">blue</span>, dates in{" "}
        <span className="font-medium text-ppic-complement-green-600">green</span>,
        and text in <span className="font-medium text-foreground">black</span>. A{" "}
        <span className="font-medium text-destructive">red</span> cell flags a
        problem to fix; a gray “–” marks an empty cell.
      </p>
    </div>
  );
}

function ImportedTableView() {
  const { config, dispatch } = useChartConfig();
  const inline = config.data?.inline;

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
  }

  return (
    <InputTableEditor
      table={inline}
      onChange={handleTableChange}
      onRevert={inline.meta?.original ? handleRevert : undefined}
    />
  );
}

export default function ImportStep() {
  return (
    <StepShell title="Import Your Data" preview={<ImportedTableView />}>
      <div className="grid gap-2">
        <div className="inline-block self-start border-b-2 border-ppic-brand pb-1 font-heading text-base font-semibold">
          Paste or Upload
        </div>
        <DataSourcePanel />
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Have a saved chart?</span>
          <ImportConfigButton />
        </div>
      </div>
      <CheckLegend />
    </StepShell>
  );
}
