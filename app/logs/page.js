/**
 * app/logs/page.js — Pipeline Logs page (server component).
 *
 * Reads the run records written by the Python pipelines (logs/*.jsonl) and renders
 * them as a filterable feed of run cards. Filter options are derived from the
 * records, so new pipelines appear without code changes.
 *
 * Data sources:
 *   - lib/logs/logs.js (reads logs/*.jsonl)
 */

import React from "react";

import LogsBrowser from "@/components/logs/LogsBrowser";
import { getLogEntries, getLogModules, getLogSeverities } from "@/lib/logs/logs";

export const metadata = {
  title: "Logs · PPIC Data Explorer",
  description: "Pipeline run logs: successes, recovered fallbacks, and failures across every data module.",
};

export default function LogsPage() {
  const entries = getLogEntries();
  const modules = getLogModules();
  const severities = getLogSeverities();

  return <LogsBrowser entries={entries} modules={modules} severities={severities} />;
}
