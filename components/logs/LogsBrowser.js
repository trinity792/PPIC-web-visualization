"use client";

/**
 * LogsBrowser.js — client island for the /logs page.
 *
 * Owns the view-mode toggle (technical / non-technical), the module / severity /
 * date filters, the sort order, and "show more" pagination, then renders the
 * filtered run records as LogCards. Layout mirrors the Documents page: a left
 * filter sidebar (LogFilterSidebar) plus a results section whose header holds the
 * sort control and the view-mode toggle. All data arrives as props.
 *
 * Props:
 *   entries    {Object[]} — normalized run records from lib/logs/logs.js
 *   modules    {string[]} — ["All modules", ...] from getLogModules()
 *   severities {string[]} — ["All severities", ...] from getLogSeverities()
 */

/* eslint-disable react/prop-types */

import React, { useMemo, useState } from "react";

import LogCard from "./LogCard";
import { LogFilterSidebar } from "./LogFilterSidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { pacificDateKey, severityMeta } from "@/lib/logs/presentation";

const PAGE_SIZE = 15;

const SORT_LABELS = { newest: "Newest first", oldest: "Oldest first" };

function severityLabel(value) {
  if (value === "All severities") return value;
  return severityMeta(value).label;
}

export default function LogsBrowser({ entries, modules, severities }) {
  const [technical, setTechnical] = useState(false);
  const [module, setModule] = useState("All modules");
  const [severity, setSeverity] = useState("All severities");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("newest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const clear = () => {
    setModule("All modules");
    setSeverity("All severities");
    setDateFrom("");
    setDateTo("");
  };

  const results = useMemo(() => {
    let list = entries.filter((entry) => {
      const matchesModule = module === "All modules" || entry.moduleLabel === module;
      const matchesSeverity = severity === "All severities" || entry.severity === severity;
      const day = pacificDateKey(entry.timestamp);
      const matchesFrom = !dateFrom || day >= dateFrom;
      const matchesTo = !dateTo || day <= dateTo;
      return matchesModule && matchesSeverity && matchesFrom && matchesTo;
    });

    list = [...list].sort((a, b) => {
      const diff = String(b.timestamp).localeCompare(String(a.timestamp));
      return sort === "newest" ? diff : -diff;
    });
    return list;
  }, [entries, module, severity, dateFrom, dateTo, sort]);

  const visible = results.slice(0, visibleCount);
  const hasMore = visibleCount < results.length;

  return (
    <main className="page-container flex flex-col gap-10 px-6 py-10 md:flex-row">
        <LogFilterSidebar
          modules={modules}
          module={module}
          onModule={setModule}
          severities={severities}
          severity={severity}
          onSeverity={setSeverity}
          dateFrom={dateFrom}
          onDateFrom={setDateFrom}
          dateTo={dateTo}
          onDateTo={setDateTo}
          severityLabel={severityLabel}
          technical={technical}
          onTechnical={setTechnical}
          onClear={clear}
        />

        <section className="min-w-0 flex-1" style={{ fontFamily: "var(--font-sans)" }}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <span style={{ color: "var(--ppic-neutral-400)", fontSize: 14 }}>
              {results.length} {results.length === 1 ? "run" : "runs"}
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

          {/* Results */}
          <div className="flex flex-col gap-3">
            {visible.map((entry) => (
              <LogCard key={entry.id} entry={entry} mode={technical ? "technical" : "nontechnical"} />
            ))}
            {results.length === 0 ? (
              <div
                className="rounded-xl py-20 text-center"
                style={{ color: "var(--ppic-neutral-400)", border: "1px dashed var(--ppic-border)" }}
              >
                No logs match your filters.
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
