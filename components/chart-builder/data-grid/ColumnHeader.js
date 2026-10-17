"use client";
/**
 * ColumnHeader.js — the column name, kind pill and chart usage badge.
 * Props: column {Object}; onKind {Function}; usage {string|null}.
 * Data sources: parent grid's inline table and chart bindings.
 * UI Kit reference: ui/select. Structure actions live in GridContextMenu.
 */
import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COLUMN_KINDS, columnKind } from "@/lib/tabular/tableEdits";
const PILLS = { label: "text", group: "group", time: "date", number: "number", percent: "percent", usd: "dollars", ignore: "ignored" };
export default function ColumnHeader({ column, onKind, usage }) {
  return <div className="flex w-full min-w-0 flex-col gap-0.5 px-2 py-0.5">
    <span className="truncate text-sm font-semibold" title={column.name}>{column.name}</span>
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <div className="shrink-0" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <Select value={columnKind(column)} onValueChange={onKind}>
          <SelectTrigger size="sm" aria-label={`Kind for ${column.name}`} className="w-auto gap-1 rounded bg-background px-1.5 py-0 text-[10px] leading-none data-[size=sm]:h-5 [&>svg]:size-3">
            {column.forced && <span aria-label="Kind set by you" className="size-1 rounded-full bg-current" />}
            <SelectValue>{PILLS[columnKind(column)]}</SelectValue>
          </SelectTrigger>
          <SelectContent>{COLUMN_KINDS.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {usage && <span title={`The chart uses this column for ${usage}`} className="min-w-0 max-w-full text-[10px] leading-3 break-words text-muted-foreground">{usage}</span>}
    </div>
  </div>;
}
