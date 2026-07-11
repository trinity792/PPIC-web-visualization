"use client";

/**
 * ChangelogBrowser.js — client island for the Changelog tab of the /logs page.
 *
 * The changelog counterpart to LogsBrowser: same two-column layout (a left
 * ChangelogFilterSidebar plus a results section whose header holds the count and
 * sort control) and "show more" pagination, rendering changelog entries as
 * ChangelogCards. Owns the area / intensity / audited / date filters and sort
 * order. All data arrives as props.
 *
 * Props:
 *   entries     {Object[]} — changelog records from lib/changelog/changelog.js
 *   areas       {string[]} — ["All areas", ...] from getChangelogAreas()
 *   intensities {string[]} — ["All intensities", ...] from getChangelogIntensities()
 */

/* eslint-disable react/prop-types */

import React, { useMemo, useState } from "react";

import ChangelogCard from "./ChangelogCard";
import { ChangelogFilterSidebar } from "./ChangelogFilterSidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { intensityLabel, pacificDateKey } from "@/lib/changelog/presentation";

const PAGE_SIZE = 15;

const SORT_LABELS = { newest: "Newest first", oldest: "Oldest first" };

export default function ChangelogBrowser({ entries, areas, intensities }) {
  const [area, setArea] = useState("All areas");
  const [intensity, setIntensity] = useState("All intensities");
  const [audited, setAudited] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("newest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const clear = () => {
    setArea("All areas");
    setIntensity("All intensities");
    setAudited("all");
    setDateFrom("");
    setDateTo("");
  };

  const results = useMemo(() => {
    let list = entries.filter((entry) => {
      const matchesArea = area === "All areas" || entry.area === area;
      const matchesIntensity = intensity === "All intensities" || entry.intensity === intensity;
      const matchesAudited =
        audited === "all" ||
        (audited === "audited" ? entry.audited : !entry.audited);
      const day = pacificDateKey(entry.timestamp);
      const matchesFrom = !dateFrom || day >= dateFrom;
      const matchesTo = !dateTo || day <= dateTo;
      return matchesArea && matchesIntensity && matchesAudited && matchesFrom && matchesTo;
    });

    list = [...list].sort((a, b) => {
      const diff = String(b.timestamp).localeCompare(String(a.timestamp));
      return sort === "newest" ? diff : -diff;
    });
    return list;
  }, [entries, area, intensity, audited, dateFrom, dateTo, sort]);

  const visible = results.slice(0, visibleCount);
  const hasMore = visibleCount < results.length;

  return (
    <main className="page-container flex flex-col gap-10 px-6 py-10 md:flex-row">
      <ChangelogFilterSidebar
        areas={areas}
        area={area}
        onArea={setArea}
        intensities={intensities}
        intensity={intensity}
        onIntensity={setIntensity}
        audited={audited}
        onAudited={setAudited}
        dateFrom={dateFrom}
        onDateFrom={setDateFrom}
        dateTo={dateTo}
        onDateTo={setDateTo}
        intensityLabel={intensityLabel}
        onClear={clear}
      />

      <section className="min-w-0 flex-1" style={{ fontFamily: "var(--font-sans)" }}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <span style={{ color: "var(--ppic-neutral-400)", fontSize: 14 }}>
            {results.length} {results.length === 1 ? "change" : "changes"}
          </span>

          <div className="flex items-center gap-2">
            <span style={{ color: "var(--ppic-neutral-400)", fontSize: 14 }}>Sort by:</span>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(SORT_LABELS).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SORT_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {visible.map((entry) => (
            <ChangelogCard key={entry.id} entry={entry} />
          ))}
          {results.length === 0 ? (
            <div
              className="rounded-xl py-20 text-center"
              style={{ color: "var(--ppic-neutral-400)", border: "1px dashed var(--ppic-border)" }}
            >
              No changes match your filters.
            </div>
          ) : null}
        </div>

        {hasMore ? (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              className="rounded-lg border border-ppic-border bg-white px-5 py-2 text-sm font-medium text-ppic-neutral-600 transition-colors hover:bg-ppic-neutral-50"
            >
              Show more ({results.length - visibleCount} remaining)
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
