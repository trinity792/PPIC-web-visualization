"use client";

/**
 * DataTableView.js — the `dataTable` chart type's renderer: the exact numbers
 * behind a chart as a searchable, sortable, paginated table. Generalizes the
 * landing RegionTable pattern over any displayed-table object, so RegionTable
 * and the editor's data-table chart share one renderer.
 *
 * Props:
 *   table      {Object} — { columns:[{name,type}], rows:[[...]] } (displayTable shape)
 *   format     {Object} — number formatting hints (reserved; currently locale grouping)
 *   appearance {Object} — { search?, sortable?, pageSize? } (the dataTable defaults)
 *
 * Data sources:
 *   - the displayed table already in memory; no fetch
 *
 * UI Kit reference:
 *   - Built from ui/table + ui/input, following landing/RegionTable conventions;
 *     paginates in-component (no grid library)
 */

/* eslint-disable react/prop-types */

import React, { useMemo, useState } from "react";

import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FORMATTERS } from "@/lib/visualization/formatters";

const NUMBER = new Intl.NumberFormat("en-US");

function formatCell(value, column) {
  if (value === null || value === undefined || value === "") return "—";
  if (column?.type === "number" && Number.isFinite(Number(value))) {
    if (column.name === "Year") return FORMATTERS.year(Number(value));
    return NUMBER.format(Number(value));
  }
  return String(value);
}

function compareValues(a, b, type) {
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (type === "number") return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
}

export default function DataTableView({ table, appearance = {} }) {
  const columns = table?.columns || [];
  const allRows = table?.rows || [];
  const { search = false, sortable = false, pageSize = 25 } = appearance;

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(null); // { index, dir: "asc" | "desc" }
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!search || !query.trim()) return allRows;
    const needle = query.trim().toLowerCase();
    return allRows.filter((row) =>
      row.some((cell) => String(cell ?? "").toLowerCase().includes(needle)),
    );
  }, [allRows, query, search]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const type = columns[sort.index]?.type;
    const factor = sort.dir === "desc" ? -1 : 1;
    return [...filtered].sort(
      (a, b) => factor * compareValues(a[sort.index], b[sort.index], type),
    );
  }, [filtered, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);

  function toggleSort(index) {
    setPage(0);
    setSort((prev) =>
      prev?.index === index
        ? { index, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { index, dir: "asc" },
    );
  }

  function sortIcon(index) {
    if (sort?.index !== index) return <ChevronsUpDown aria-hidden="true" className="size-3.5 opacity-50" />;
    return sort.dir === "asc" ? (
      <ChevronUp aria-hidden="true" className="size-3.5" />
    ) : (
      <ChevronDown aria-hidden="true" className="size-3.5" />
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-3">
      {search ? (
        <Input
          type="search"
          aria-label="Search table"
          placeholder="Search…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
          className="max-w-xs"
        />
      ) : null}
      {/*
        Single scroll container for BOTH axes: the raw <table> (not the Table
        primitive, whose own overflow-x wrapper would put the horizontal
        scrollbar below all rows). The table is sized `w-max min-w-full` so wide
        (whitespace-nowrap) content overflows this box — triggering horizontal
        scroll — while a narrow table still fills it. `max-h-[70svh]` keeps the
        box (and therefore its bottom-pinned horizontal scrollbar) on screen even
        when the surrounding card grows tall, instead of scrolling the page; rows
        scroll internally under the sticky header.
      */}
      <div className="min-h-0 min-w-0 max-h-[70svh] flex-1 overflow-auto rounded-md border">
        <table className="w-max min-w-full caption-bottom text-sm">
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              {columns.map((column, index) => (
                <TableHead
                  key={column.name}
                  className={column.type === "number" ? "text-right" : undefined}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(index)}
                      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                    >
                      {column.name}
                      {sortIcon(index)}
                    </button>
                  ) : (
                    column.name
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length ? (
              visible.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {columns.map((column, colIndex) => (
                    <TableCell
                      key={column.name}
                      className={
                        column.type === "number"
                          ? "text-right tabular-nums"
                          : undefined
                      }
                    >
                      {formatCell(row[colIndex], column)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length || 1}
                  className="py-8 text-center text-muted-foreground"
                >
                  No rows match your search.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      </div>
      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            Page {current + 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={current === 0}
              className="rounded-md border px-2 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={current >= pageCount - 1}
              className="rounded-md border px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
