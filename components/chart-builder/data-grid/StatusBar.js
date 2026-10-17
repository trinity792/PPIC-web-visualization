/**
 * StatusBar.js — table size and statistics for the current selection.
 * Props: table {Object}; selection {Object}; stats {Object} from selectionStats.
 * Data sources: parent grid. UI Kit reference: typography and border tokens.
 */
import React from "react";
export default function StatusBar({ table, selection, stats }) {
  const multiple = selection.ranges.length > 1 || selection.ranges.some((r) => r.r2 > r.r1 || r.c2 > r.c1);
  const columns = table.columns.filter((_, i) => selection.ranges.some((r) => i >= r.c1 && i <= r.c2));
  const units = new Set(columns.filter((c) => c.type === "number").map((c) => c.unit));
  const unit = units.size === 1 ? [...units][0] : null;
  const format = (n) => `${unit === "usd" ? "$" : ""}${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit === "percent" ? "%" : ""}`;
  return <div className="flex flex-wrap justify-between gap-2 border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
    <span>{table.rows.length.toLocaleString()} rows · {table.columns.length} columns · Double-click a cell to edit</span>
    <span role="status" aria-label="Selection statistics" className="flex gap-4 tabular-nums">
      {multiple && <>{stats.numericCount > 0 && <><span>Sum {format(stats.sum)}</span><span>Average {format(stats.average)}</span></>}<span>Count {stats.count.toLocaleString()}</span></>}
    </span>
  </div>;
}
