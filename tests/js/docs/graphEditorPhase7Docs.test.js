/**
 * Tests for Phase 7 of the graph-editor overhaul: documentation and sign-off.
 * These read Markdown directly because the phase exit criteria are docs state:
 * the plan is rewritten as an as-built guide, projectSpec's UI layer is updated,
 * module audit/status notes no longer describe pre-overhaul gaps, and final
 * supervisor sign-off is recorded.
 */

/* global process */ // Node test file: `process.cwd()` roots the doc paths (silences eslint no-undef).

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const graphEditorPath = path.join(
  root,
  "docs/PPIC Summer 2026/specifications/graphEditor-overhaul.md",
);
const projectSpecPath = path.join(
  root,
  "docs/PPIC Summer 2026/specifications/projectSpec.md",
);

function readDoc(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function frontmatterValue(markdown, key) {
  const match = markdown.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() || "";
}

function section(markdown, startHeading, endHeading) {
  const start = markdown.indexOf(startHeading);
  expect(start, `missing section ${startHeading}`).toBeGreaterThanOrEqual(0);
  const end = endHeading ? markdown.indexOf(endHeading, start + startHeading.length) : -1;
  return markdown.slice(start, end === -1 ? undefined : end);
}

const stalePlanPhrases = [
  "This is a **plan, not an as-built guide**",
  "Implementation Plan",
  "build in progress",
  "Phase 5 (export) next",
  "⬜ Pending",
  "build remains paused",
];

describe("graphEditor-overhaul.md as-built rewrite", () => {
  const doc = readDoc(graphEditorPath);

  it("is no longer marked as an in-progress implementation plan", () => {
    expect(frontmatterValue(doc, "Content Type")).toMatch(/as-built|reference|guide/i);

    const h1 = doc.match(/^# .+$/m)?.[0] || "";
    expect(h1).toMatch(/as-built|guide|reference/i);
    expect(h1).not.toMatch(/Implementation Plan/i);

    for (const phrase of stalePlanPhrases) {
      expect(doc.includes(phrase), `stale phrase: ${phrase}`).toBe(false);
    }
  });

  it("records every phase, including Phase 7, as shipped or complete", () => {
    const phaseTable = section(doc, "## Part 10 — Implementation Phases", "### As-built notes");
    for (const phase of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const row = phaseTable.match(new RegExp(`\\| \\*\\*${phase}\\. [^\\n]+`, "i"))?.[0] || "";
      expect(row, `missing phase ${phase}`).toBeTruthy();
      expect(row, `phase ${phase} status`).toMatch(/✅|shipped|complete|signed off/i);
      expect(row, `phase ${phase} still pending`).not.toMatch(/pending|⬜/i);
    }
  });

  it("contains the Phase 5 and Phase 6 as-built surfaces, not only the proposal", () => {
    for (const required of [
      "lib/export/exportImage.js",
      "lib/export/exportTable.js",
      "ExportMenu",
      "PlotlyChart",
      "pie",
      "symbolMap",
      "dataTable",
      "DataTableView",
      "RegionTable",
      "Building Permits",
    ]) {
      expect(doc.includes(required), `missing as-built term: ${required}`).toBe(true);
    }
  });

  it("records final supervisor sign-off on the shipped editor", () => {
    expect(doc).toMatch(/supervisor sign-?off/i);
    expect(doc).toMatch(/(signed off|approved|accepted|granted)/i);
    expect(doc).toMatch(/2026-07-07|July 7, 2026/i);
  });
});

describe("projectSpec Frontend Architecture update", () => {
  const doc = readDoc(projectSpecPath);
  const frontend = section(doc, "## Frontend Architecture (UI Layer)", "### Frontend — Flagged Issues");

  it("documents the shipped spec-v2 editor surfaces", () => {
    for (const required of [
      "spec v2",
      "`version`",
      "`data`",
      "`format`",
      "`annotations`",
      "`tier`",
      "data.inline",
      "settingsTiers",
      "DataSourcePanel",
      "InputTableEditor",
      "CodeEditorPanel",
      "codebridge",
      "ExportMenu",
      "lib/export",
      "DataTableView",
    ]) {
      expect(frontend.includes(required), `missing frontend term: ${required}`).toBe(true);
    }
  });

  it("does not retain stale pre-overhaul UI architecture claims", () => {
    for (const stale of [
      "One of the 8 `chartRegistry` ids",
      "**Applied client-side in `toPlotly`, line charts only**",
      "localStorage` (`ppic.savedViews.v1`",
      "currently Building Permits, whose presets aren't built yet",
      "Curated presets are deferred pending a graph-editor overhaul",
      "the build remains paused",
    ]) {
      expect(frontend.includes(stale), `stale frontend claim: ${stale}`).toBe(false);
    }
  });
});

describe("projectSpec flagged issues and module status", () => {
  const doc = readDoc(projectSpecPath);
  const flagged = section(doc, "### Frontend — Flagged Issues", "## Conventions & Standards");
  const audit = section(doc, "## Module Audit Status", "# The PopHousing Module");

  it("marks the graph-editor flagged issues resolved instead of restating them as open", () => {
    expect(
      /resolved by the graph-editor overhaul|graph-editor overhaul.*resolved/i.test(flagged),
    ).toBe(true);
    for (const stale of [
      "Transforms are a silent no-op",
      "stale preset",
      "Choropleths are county-only",
      "Base year can silently disagree",
      "`savedViews` overloads `filters`",
      "pending the overhaul",
    ]) {
      expect(flagged.includes(stale), `stale flagged issue: ${stale}`).toBe(false);
    }
  });

  it("updates module audit/status notes for the shipped graph editor", () => {
    expect(audit.includes("Status as of 2026-07-04")).toBe(false);
    expect(audit).toMatch(/2026-07-07|July 7, 2026/i);
    expect(doc.includes("Building Permits, whose presets aren't built yet")).toBe(false);
    expect(
      doc.includes(
        "Curated presets and the monthly slider control are deferred to the graph-editor overhaul",
      ),
    ).toBe(false);
    expect(doc).toMatch(/Building Permits[\s\S]{0,500}(graph editor|detailed module page|presets)[\s\S]{0,500}(Verified|Active|signed off)/i);
  });
});
