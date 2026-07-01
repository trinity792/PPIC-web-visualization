/**
 * PopulationHousingDashboard.js — landing dashboard for population and housing data.
 *
 * Props:
 *   category {Object} — population-housing metadata from the category registry
 *
 * Data sources:
 *   - queryStatewideStats() and queryRegionTable() from lib/data/pop_housing.js
 *   - Built-in chart preview definitions via category.previews
 *
 * UI Kit reference:
 *   - Composes "Dashboard Container", "Chart Container", "Stat Card", and "Data Table"
 */

/* eslint-disable react/prop-types */

import React, { Suspense } from "react";

import ChartTile from "@/components/landing/ChartTile";
import DashboardShell from "@/components/landing/DashboardShell";
import RegionTable from "@/components/landing/RegionTable";
import StatCard from "@/components/landing/StatCard";
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

function formatValue(formatter, value) {
  return value == null ? "—" : formatter.format(value);
}

export default function PopulationHousingDashboard({ category }) {
  return (
    <Suspense
      fallback={
        <DashboardShell category={category}>
          <div
            role="status"
            className="rounded-lg border bg-muted/40 p-5 text-center text-sm text-muted-foreground"
          >
            Loading population and housing summaries…
          </div>
        </DashboardShell>
      }
    >
      <PopulationHousingContent category={category} />
    </Suspense>
  );
}

// ── Tightly coupled async content ────────────────────────────────────

async function PopulationHousingContent({ category }) {
  let stats;
  let regionTable;

  try {
    [stats, regionTable] = await Promise.all([
      queryStatewideStats([
        "Total Population",
        "Total Housing Units",
        "Persons Per Household",
      ]),
      queryRegionTable(),
    ]);
  } catch (error) {
    console.error("PopulationHousingDashboard data load failed:", error);

    return (
      <DashboardShell category={category}>
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-5 text-center text-sm text-destructive"
        >
          Population and housing summaries are unavailable. Try refreshing the page.
        </div>
      </DashboardShell>
    );
  }

  const [populationTrend, householdMap, migrationTrend] = category.previews;

  return (
    <DashboardShell category={category}>
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartTile
          viewId={populationTrend.id}
          modulePath={populationTrend.modulePath}
        />
        <ChartTile viewId={householdMap.id} modulePath={householdMap.modulePath} />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <StatCard
          label={`Total state population${stats.year ? ` (${stats.year})` : ""}`}
          value={formatValue(COMPACT, stats.values["Total Population"])}
        />
        <StatCard
          label="Avg. household size"
          value={formatValue(RATIO, stats.values["Persons Per Household"])}
        />
        <StatCard
          label="Total housing units"
          value={formatValue(COMPACT, stats.values["Total Housing Units"])}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartTile
          viewId={migrationTrend.id}
          modulePath={migrationTrend.modulePath}
        />
        <Card className="overflow-hidden rounded-lg p-0">
          <RegionTable regionRows={regionTable.rows} year={regionTable.year} />
        </Card>
      </div>
    </DashboardShell>
  );
}
