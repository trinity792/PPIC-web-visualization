"use client";

/**
 * InputTableEditor.js — the editable grid over an inline table: per-cell
 * color grading (number green / text black / heading orange / malformed red /
 * empty gray), in-place cell editing, header-row toggle, rename headers,
 * add/delete/hide rows and columns, force column type, transpose, derived-
 * column builder, and revert-to-original.
 *
 * Props:
 *   table     {Object}   — the inline table (columns, rows, issues)
 *   onChange  {function} — next-table callback (immutably produced)
 *   onRevert  {function} — restore the original upload
 *
 * Data sources:
 *   - `lib/tabular/{tableChecker,columnTypes,derivedColumns}.js`
 *
 * UI Kit reference:
 *   - Built from ui/table + ui/input following landing/RegionTable.js
 *     conventions; paginates past 100 rows (no grid library)
 */

/* eslint-disable react/prop-types */

import React, { useMemo, useState } from "react";

import { ArrowLeftRight, EyeOff, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/components/ui/utils";

import { useChartConfig } from "@/components/chart-builder/chartConfigStore";
import { addDerivedColumn, compileFormula } from "@/lib/tabular/derivedColumns";
import { inferColumnType } from "@/lib/tabular/columnTypes";
import { GRADE_CLASSNAMES, gradeTable } from "@/lib/tabular/tableChecker";
import { isVisible } from "@/lib/visualization/settingsTiers";

const PAGE_SIZE = 100;
const COLUMN_TYPE_OPTIONS = ["text", "group", "number", "date"];

// ── Pure row/column helpers over the { columns, rows, issues } shape ──────

function setCell(table, rowIndex, columnIndex, value) {
  const rows = table.rows.map((row, index) =>
    index === rowIndex ? row.map((cell, c) => (c === columnIndex ? value : cell)) : row,
  );
  return { ...table, rows };
}

function renameColumn(table, columnIndex, name) {
  const columns = table.columns.map((column, index) =>
    index === columnIndex ? { ...column, name } : column,
  );
  return { ...table, columns };
}

function setColumnType(table, columnIndex, type) {
  const columns = table.columns.map((column, index) =>
    index === columnIndex ? { ...column, type } : column,
  );
  return { ...table, columns };
}

function addRow(table) {
  const blank = table.columns.map(() => "");
  return { ...table, rows: [...table.rows, blank] };
}

function deleteRow(table, rowIndex) {
  return { ...table, rows: table.rows.filter((_, index) => index !== rowIndex) };
}

function addColumn(table) {
  const columns = [
    ...table.columns,
    { name: `Column ${table.columns.length + 1}`, type: "text" },
  ];
  const rows = table.rows.map((row) => [...row, ""]);
  return { ...table, columns, rows };
}

function deleteColumn(table, columnIndex) {
  const columns = table.columns.filter((_, index) => index !== columnIndex);
  const rows = table.rows.map((row) => row.filter((_, index) => index !== columnIndex));
  return { ...table, columns, rows };
}

/** Promote the first data row to headers, demoting the current headers to a
 * data row — pressed again, this swaps them right back. */
function toggleHeaderRow(table) {
  if (!table.rows.length) return table;
  const [firstRow, ...restRows] = table.rows;
  const oldHeaderRow = table.columns.map((column) => column.name);
  const columns = table.columns.map((column, index) => ({
    ...column,
    name: firstRow[index] ?? column.name,
  }));
  return { ...table, columns, rows: [oldHeaderRow, ...restRows] };
}

/** Matrix-transpose the whole grid (header row included), then re-declare
 * the new row 0 as headers — the conventional spreadsheet "transpose". */
function transpose(table) {
  const header = table.columns.map((column) => column.name);
  const grid = [header, ...table.rows];
  const rowCount = grid.length;
  const colCount = header.length;
  const transposed = Array.from({ length: colCount }, (_, c) =>
    Array.from({ length: rowCount }, (_, r) => grid[r][c] ?? ""),
  );
  const [newHeader, ...newRows] = transposed;
  const columns = newHeader.map((name, index) => ({
    name: name || `Column ${index + 1}`,
    type: inferColumnType(newRows.map((row) => row[index])).type,
  }));
  return { columns, rows: newRows, issues: [] };
}

export default function InputTableEditor({ table, onChange, onRevert }) {
  const { config } = useChartConfig();
  const [page, setPage] = useState(0);
  const [hiddenColumns, setHiddenColumns] = useState(() => new Set());
  const [formulaName, setFormulaName] = useState("");
  const [formulaText, setFormulaText] = useState("");
  const [formulaError, setFormulaError] = useState(null);

  const grades = useMemo(() => gradeTable(table), [table]);
  const rows = table.rows || [];
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const visibleRows = rows.slice(start, start + PAGE_SIZE);

  function commit(nextTable) {
    onChange(nextTable);
  }

  function toggleColumnHidden(columnIndex) {
    setHiddenColumns((previous) => {
      const next = new Set(previous);
      if (next.has(columnIndex)) next.delete(columnIndex);
      else next.add(columnIndex);
      return next;
    });
  }

  function handleAddDerivedColumn() {
    setFormulaError(null);
    const compiled = compileFormula(formulaText, table.columns);
    if (compiled.error) {
      setFormulaError(compiled.error);
      return;
    }
    const name = formulaName.trim() || `Formula ${table.columns.length + 1}`;
    commit(addDerivedColumn(table, name, formulaText));
    setFormulaName("");
    setFormulaText("");
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => commit(toggleHeaderRow(table))}
        >
          Toggle header row
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => commit(transpose(table))}
        >
          <ArrowLeftRight aria-hidden="true" className="size-3.5" />
          Transpose
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => commit(addRow(table))}
        >
          <Plus aria-hidden="true" className="size-3.5" />
          Add row
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => commit(addColumn(table))}
        >
          <Plus aria-hidden="true" className="size-3.5" />
          Add column
        </Button>
        {onRevert ? (
          <Button type="button" variant="outline" size="sm" onClick={onRevert}>
            Revert to original
          </Button>
        ) : null}
      </div>

      <div
        role="region"
        aria-label="Editable imported data"
        tabIndex={0}
        className="max-h-[28rem] overflow-auto rounded-md border"
      >
        <Table containerClassName="overflow-visible">
          <TableHeader>
            <TableRow>
              {table.columns.map((column, columnIndex) =>
                hiddenColumns.has(columnIndex) ? null : (
                  <TableHead key={columnIndex} className="min-w-40 align-top">
                    <div className="grid gap-1">
                      <Input
                        value={column.name}
                        onChange={(event) =>
                          commit(renameColumn(table, columnIndex, event.target.value))
                        }
                        className={cn("h-7 text-xs", GRADE_CLASSNAMES.heading)}
                      />
                      <div className="flex items-center gap-1">
                        <Select
                          value={column.type}
                          onValueChange={(type) => commit(setColumnType(table, columnIndex, type))}
                        >
                          <SelectTrigger size="sm" className="text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COLUMN_TYPE_OPTIONS.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label={`Hide ${column.name}`}
                          onClick={() => toggleColumnHidden(columnIndex)}
                        >
                          <EyeOff aria-hidden="true" className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label={`Delete ${column.name}`}
                          onClick={() => commit(deleteColumn(table, columnIndex))}
                        >
                          <Minus aria-hidden="true" className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </TableHead>
                ),
              )}
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row, localIndex) => {
              const rowIndex = start + localIndex;
              const rowGrades = grades[rowIndex + 1] || [];
              return (
                <TableRow key={rowIndex}>
                  {row.map((cell, columnIndex) =>
                    hiddenColumns.has(columnIndex) ? null : (
                      <TableCell key={columnIndex}>
                        <Input
                          value={cell ?? ""}
                          onChange={(event) =>
                            commit(setCell(table, rowIndex, columnIndex, event.target.value))
                          }
                          className={cn("h-7 text-xs", GRADE_CLASSNAMES[rowGrades[columnIndex]])}
                        />
                      </TableCell>
                    ),
                  )}
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label={`Delete row ${rowIndex + 1}`}
                      onClick={() => commit(deleteRow(table, rowIndex))}
                    >
                      <Minus aria-hidden="true" className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <span>
            Page {page + 1} of {pageCount}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next
          </Button>
        </div>
      ) : null}

      {isVisible("derivedColumns", config.tier) ? (
        <div className="grid gap-2 rounded-md border p-3">
          <p className="text-sm font-medium">Add a derived column</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <Input
              placeholder="Column name"
              value={formulaName}
              onChange={(event) => setFormulaName(event.target.value)}
            />
            <Input
              placeholder="e.g. round([Total Population] / 1000, 1)"
              value={formulaText}
              onChange={(event) => setFormulaText(event.target.value)}
            />
          </div>
          {formulaError ? (
            <p className="text-xs text-destructive">
              {formulaError.message} (position {formulaError.position})
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="w-fit"
            onClick={handleAddDerivedColumn}
            disabled={!formulaText.trim()}
          >
            Add column
          </Button>
        </div>
      ) : null}
    </div>
  );
}
