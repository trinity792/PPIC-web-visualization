/**
 * RegionTable.js — latest population and housing estimates by California region.
 *
 * Props:
 *   regionRows {Array<Object>} — region, population, and housing-unit records
 *   year       {number|null}   — latest estimate year, when available
 *
 * Data sources:
 *   - Via props from queryRegionTable() in lib/data/pop_housing.js
 *
 * UI Kit reference:
 *   - Implements the "Data Table" pattern
 */

/* eslint-disable react/prop-types */

import React from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const NUMBER = new Intl.NumberFormat("en-US");

function formatCell(value) {
  return value == null ? "—" : NUMBER.format(value);
}

export default function RegionTable({ regionRows = [], year = null }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <p className="font-medium">Population &amp; housing by region</p>
        <p className="text-xs text-muted-foreground">
          {year ? `${year} estimates` : "Latest estimates"}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Region</TableHead>
              <TableHead className="text-right">Population</TableHead>
              <TableHead className="text-right">Housing units</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {regionRows.length ? (
              regionRows.map((regionRow) => (
                <TableRow key={regionRow.region}>
                  <TableCell className="font-medium">{regionRow.region}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCell(regionRow.population)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCell(regionRow.housingUnits)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                  Regional estimates are unavailable. Try refreshing the page.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
