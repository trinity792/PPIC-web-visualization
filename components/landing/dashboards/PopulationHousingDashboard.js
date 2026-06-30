/* eslint-disable react/prop-types */
import React from "react";
import ChartTile from "@/components/landing/ChartTile";
import DashboardShell from "@/components/landing/DashboardShell";
import StatCard from "@/components/landing/StatCard";
import RegionTable from "@/components/landing/RegionTable";
import { Card } from "@/components/ui/card";
import {
  queryRegionTable,
  queryStatewideStats,
} from "@/lib/data/pop_housing";

const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const RATIO = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const fmt = (formatter, value) => (value == null ? "—" : formatter.format(value));

/**
 * Dashboard for the Population & Housing category. An async server component that
 * computes its own statewide stats + region table server-side, then lays out two
 * chart tiles, a stat-card row, and a chart tile + region table. Each category
 * registers a dashboard like this in `dashboards/index.js`.
 */
export default async function PopulationHousingDashboard({ category }) {
  const [stats, regionTable] = await Promise.all([
    queryStatewideStats([
      "Total Population",
      "Total Housing Units",
      "Persons Per Household",
    ]),
    queryRegionTable(),
  ]);

  return (
    <DashboardShell category={category}>
      {/* Row 1: stacked-area trend + persons-per-household county map */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartTile viewId="population-area" modulePath="/pophousing" />
        <ChartTile viewId="persons-per-household-map" modulePath="/pophousing" />
      </div>

      {/* Row 2: statewide snapshot */}
      <div className="grid gap-5 sm:grid-cols-3">
        <StatCard
          label={`Total state population${stats.year ? ` (${stats.year})` : ""}`}
          value={fmt(COMPACT, stats.values["Total Population"])}
        />
        <StatCard
          label="Avg. household size"
          value={fmt(RATIO, stats.values["Persons Per Household"])}
        />
        <StatCard
          label="Total housing units"
          value={fmt(COMPACT, stats.values["Total Housing Units"])}
        />
      </div>

      {/* Row 3: migration trend + region table */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartTile viewId="migration-trend" modulePath="/components-of-change" />
        <Card className="overflow-hidden rounded-lg p-0">
          <RegionTable rows={regionTable.rows} year={regionTable.year} />
        </Card>
      </div>
    </DashboardShell>
  );
}
