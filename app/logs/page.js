/**
 * app/logs/page.js — Logs page (server component).
 *
 * Loads two feeds and hands them to the tabbed LogsTabs shell:
 *   - Pipeline Logs — run records written by the Python pipelines (logs/*.jsonl).
 *   - Changelog — curated changes derived from commit history (data/changelog.json).
 * Filter options for both feeds are derived from their records, so new pipelines
 * and changelog entries appear without code changes.
 *
 * Data sources:
 *   - lib/logs/logs.js (reads logs/*.jsonl)
 *   - lib/changelog/changelog.js (reads data/changelog.json)
 */

import React from "react";

import LogsTabs from "@/components/logs/LogsTabs";
import {
  getChangelogAreas,
  getChangelogEntries,
  getChangelogIntensities,
} from "@/lib/changelog/changelog";
import { getLogEntries, getLogModules, getLogSeverities } from "@/lib/logs/logs";

export const metadata = {
  title: "Logs · PPIC Data Explorer",
  description:
    "Pipeline run logs and a changelog of changes to the tool, across every data module.",
};

export default function LogsPage() {
  const logProps = {
    entries: getLogEntries(),
    modules: getLogModules(),
    severities: getLogSeverities(),
  };
  const changelogProps = {
    entries: getChangelogEntries(),
    areas: getChangelogAreas(),
    intensities: getChangelogIntensities(),
  };

  return <LogsTabs logProps={logProps} changelogProps={changelogProps} />;
}
