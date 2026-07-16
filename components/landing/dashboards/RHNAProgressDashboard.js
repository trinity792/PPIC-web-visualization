/**
 * RHNAProgressDashboard.js — landing dashboard for the RHNA Progress Report module.
 *
 * Props:
 *   category {Object} — rhna-progress metadata from the category registry
 *
 * Data sources:
 *   - queryBestWorst() and queryRegionalOnTrack() from lib/data/rhna_progress.js
 *
 * UI Kit reference:
 *   - Composes "Dashboard Container", "Chart Container", "Stat Card", and "Data Table"
 */

/* eslint-disable react/prop-types */

import React, { Suspense } from "react";

import DataTableView from "@/components/charts/DataTableView";
import DashboardShell from "@/components/landing/DashboardShell";
import RegionalOnTrackBars from "@/components/landing/RegionalOnTrackBars";
import StatCard from "@/components/landing/StatCard";

import { queryBestWorst, queryDataSources, queryRegionalOnTrack } from "@/lib/data/rhna_progress";

const PERCENT = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });

const STANDINGS_COLUMNS = [
  { name: "Jurisdiction", type: "text" },
  { name: "Region", type: "text" },
  { name: "On track", type: "text" },
  { name: "Category", type: "text" },
  { name: "Tiers met", type: "text" },
  { name: "Overall progress", type: "text" },
];

function standingsTable(records) {
  return {
    columns: STANDINGS_COLUMNS,
    rows: records.map((record) => [
      record.location,
      record.region,
      record.onTrackScore == null ? "—" : record.onTrackScore.toFixed(2),
      record.overallCategory,
      `${record.tiersMet} of ${record.tiersWithGoal}`,
      record.overallProgress == null ? "—" : PERCENT.format(record.overallProgress),
    ]),
  };
}

function StandingsPanel({ title, subtitle, records }) {
  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <DataTableView
          table={standingsTable(records)}
          format={{}}
          appearance={{ search: false, sortable: true, pageSize: 10 }}
        />
      </div>
    </div>
  );
}

export default function RHNAProgressDashboard({ category }) {
  return (
    <Suspense
      fallback={
        <DashboardShell category={category}>
          <div
            role="status"
            className="rounded-lg border bg-muted/40 p-5 text-center text-sm text-muted-foreground"
          >
            Loading RHNA progress standings…
          </div>
        </DashboardShell>
      }
    >
      <RHNAProgressContent category={category} />
    </Suspense>
  );
}

// ── Tightly coupled async content ────────────────────────────────────

async function RHNAProgressContent({ category }) {
  let bestWorst;
  let regional;
  let sources;
  try {
    [bestWorst, regional, sources] = await Promise.all([
      queryBestWorst({ topN: 8 }),
      queryRegionalOnTrack(),
      queryDataSources(),
    ]);
  } catch (error) {
    console.error("RHNAProgressDashboard data load failed:", error);
    return (
      <DashboardShell category={category}>
        <div className="rounded-lg border bg-muted/40 p-5 text-center text-sm text-muted-foreground">
          RHNA progress data is not available yet. Run the RHNA progress pipeline to generate it.
        </div>
      </DashboardShell>
    );
  }

  const onPace = bestWorst.best
    .concat(bestWorst.worst)
    .filter((record) => record.onTrackScore >= 1).length;

  return (
    <DashboardShell category={category} sources={sources}>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Jurisdictions tracked" value={bestWorst.total.toLocaleString()} />
        <StatCard
          label="Leading jurisdiction (on track score)"
          value={bestWorst.best[0] ? bestWorst.best[0].onTrackScore.toFixed(2) : "—"}
        />
        <StatCard
          label="Shown on or ahead of pace"
          value={`${onPace} of ${bestWorst.best.length + bestWorst.worst.length}`}
        />
      </div>

      <RegionalOnTrackBars levels={regional.levels} byLevel={regional.byLevel} />

      <div className="grid gap-4 lg:grid-cols-2">
        <StandingsPanel
          title="Falling behind"
          subtitle="Lowest On Track Score at the Total level — compensatory (On Track Score) beside the non-compensatory Tiers Met and Overall Progress"
          records={bestWorst.worst}
        />
        <StandingsPanel
          title="On pace to meet allocation"
          subtitle="Highest On Track Score at the Total level (latest snapshot, current cycle)"
          records={bestWorst.best}
        />
      </div>
    </DashboardShell>
  );
}
