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
const cell = (value) => (value == null ? "—" : NUMBER.format(value));

/**
 * Presentational region table: population + housing units per region for the
 * latest available year. Data is computed server-side (lib/data/pop_housing.js).
 */
export default function RegionTable({ rows = [], year }) {
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
            {rows.map((row) => (
              <TableRow key={row.region}>
                <TableCell className="font-medium">{row.region}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {cell(row.population)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {cell(row.housingUnits)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
