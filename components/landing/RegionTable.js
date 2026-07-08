/**
 * RegionTable.js — latest population and housing estimates by California region.
 *
 * A thin preset of DataTableView (graph-editor overhaul, Phase 6): it maps the
 * region records onto the shared displayed-table shape and delegates rendering,
 * so there is one table renderer, not two.
 *
 * Props:
 *   regionRows {Array<Object>} — region, population, and housing-unit records
 *   year       {number|null}   — latest estimate year, when available
 *
 * Data sources:
 *   - Via props from queryRegionTable() in lib/data/pop_housing.js
 *
 * UI Kit reference:
 *   - Delegates to components/charts/DataTableView (the "Data Table" pattern)
 */

/* eslint-disable react/prop-types */

import React from "react";

import DataTableView from "@/components/charts/DataTableView";

const REGION_COLUMNS = [
  { name: "Region", type: "text" },
  { name: "Population", type: "number" },
  { name: "Housing units", type: "number" },
];

export default function RegionTable({ regionRows = [], year = null }) {
  const table = {
    columns: REGION_COLUMNS,
    rows: regionRows.map((regionRow) => [
      regionRow.region,
      regionRow.population,
      regionRow.housingUnits,
    ]),
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <p className="font-medium">Population &amp; housing by region</p>
        <p className="text-xs text-muted-foreground">
          {year ? `${year} estimates` : "Latest estimates"}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <DataTableView
          table={table}
          format={{}}
          appearance={{ search: false, sortable: true, pageSize: 25 }}
        />
      </div>
    </div>
  );
}
