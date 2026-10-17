"use client";
/**
 * RowHeader.js — sticky spreadsheet row number and chart exclusion reason.
 * Props: number {number}; mark {string}; selected {boolean}; handlers {Object}.
 * Data sources: parent grid, table.rowMarks.
 * UI Kit reference: None — spreadsheet gutter, using shared theme tokens.
 */
import React from "react";
import { cn } from "@/components/ui/utils";
export default function RowHeader({ number, mark, selected, handlers }) {
  const reason = { excluded: "Left out", total: "Total", note: "Note" }[mark];
  return <div role="rowheader" data-sticky="left" aria-selected={selected}
    {...handlers} title={reason || `Row ${number}`}
    className={cn("sticky left-0 z-10 flex h-full flex-col items-center justify-center border-r border-b border-border bg-muted text-xs tabular-nums text-muted-foreground select-none", selected && "bg-[color-mix(in_srgb,var(--ppic-orange-50)_60%,var(--background))] font-medium text-foreground")}>
    <span>{number}</span>{reason && <span className="text-[10px] leading-none">{reason}</span>}
  </div>;
}
