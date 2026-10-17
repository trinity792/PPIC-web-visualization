"use client";

/**
 * EditPreview.js — the Visualization Tool's Edit-step preview: the chart, or,
 * one toggle away, the same data grid as the Import step bound to the same
 * table (import overhaul, phase 4). Fixing a misread no longer means leaving
 * the chart: an edit here goes through SET_DATA_SOURCE, which keeps the chart
 * unless it can no longer draw the table, and View Chart shows the result.
 *
 * In Edit Data each column header carries a badge naming what the current
 * chart uses it for (from the column mapping); the mapping itself stays in
 * the Outcome section.
 * The shared topic-editor footer provides the view switcher and image/data exports.
 *
 * Props:
 *   (none — reads useChartConfig() and useEditData())
 *
 * Data sources:
 *   - components/chart-builder/InputTableEditor.js (the data grid)
 *   - components/chart-builder/wizard/EditDataContext.js
 */

import React, { useMemo } from "react";

import InputTableEditor from "@/components/chart-builder/InputTableEditor";
import { EditorOptionsMenu } from "@/components/chart-builder/advancedMode";
import ChartContainerFooter from "@/components/chart-builder/workbench/ChartContainerFooter";
import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import PreviewPane from "@/components/chart-builder/wizard/PreviewPane";
import { useEditData } from "@/components/chart-builder/wizard/EditDataContext";
import { usePreview } from "@/components/chart-builder/wizard/PreviewContext";
import { cn } from "@/components/ui/utils";
import { bindingColumns } from "@/lib/visualization/inlineMapping";
import { inlineTableOf } from "@/lib/visualization/inlineQuestion";
import { roleLabel } from "@/lib/visualization/roleLabels";

const VIEW_MODES = Object.freeze([
  { id: "chart", label: "View Chart" },
  { id: "data", label: "Edit Data" },
]);

export default function EditPreview() {
  const { config, dispatch } = useChartConfig();
  const edit = useEditData();
  const { status, result, graphDivRef, previews, graphDivRefs } = usePreview();
  const table = config.question?.dataset?.kind === "inline" ? inlineTableOf(config) : null;
  const chartType = config.presentation?.chartType;
  const bindings = config.question?.dataset?.bindings;

  // What the chart uses each column for, as header badges.
  const usage = useMemo(() => {
    const uses = {};
    for (const [role, value] of Object.entries(bindings || {})) {
      if (role === "valuesArePeriods") continue;
      for (const name of bindingColumns(value)) {
        uses[name] = uses[name] ? `${uses[name]}, ${roleLabel(role, chartType)}` : roleLabel(role, chartType);
      }
    }
    return uses;
  }, [bindings, chartType]);

  // A "Fix in data" link names a column; the grid wants its position.
  const focus = useMemo(() => {
    if (!edit?.focus || !table) return null;
    const col = edit.focus.column != null
      ? table.columns.findIndex((column) => column.name === edit.focus.column)
      : edit.focus.col;
    return { row: edit.focus.row ?? 0, col: col >= 0 ? col : 0, key: edit.focus.key };
  }, [edit?.focus, table]);

  if (!edit || !table) return <PreviewPane />;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 justify-end"><EditorOptionsMenu /></div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Keep the chart mounted at full width so image exports also work in Edit Data. */}
        <div
          className={cn("min-h-0 flex-1", edit.view === "data" && "pointer-events-none invisible absolute inset-0")}
          aria-hidden={edit.view === "data" || undefined}
          inert={edit.view === "data" || undefined}
        >
          <PreviewPane />
        </div>
        {edit.view === "data" ? (
          <InputTableEditor
            onUndo={() => dispatch({ type: "UNDO" })}
            onRedo={() => dispatch({ type: "REDO" })}
            table={table}
            onChange={(next) => dispatch({ type: "SET_DATA_SOURCE", source: "inline", inline: next })}
            focus={focus}
            usage={usage}
          />
        ) : null}
      </div>
      <ChartContainerFooter
        viewMode={edit.view}
        onViewModeChange={edit.setView}
        viewModes={VIEW_MODES}
        status={status}
        graphDivRef={graphDivRef}
        loaded={result}
        previews={previews}
        graphDivRefs={graphDivRefs}
      />
    </div>
  );
}
