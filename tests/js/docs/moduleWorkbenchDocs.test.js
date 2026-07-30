/** Phase 11 documentation and changelog acceptance contract. */

/* global process */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
// The plan was rewritten as the as-built specification for the whole
// visualization feature — both surfaces — and renamed accordingly.
const overhaulPath = path.join(
  root,
  "docs/PPIC Summer 2026/specifications/visualization-specification.md",
);
// The graph-editor guide was archived: it describes the pre-divergence editor.
const graphEditorPath = path.join(
  root,
  "docs/PPIC Summer 2026/archive/graphEditor-overhaul.md",
);
const projectSpecPath = path.join(
  root,
  "docs/PPIC Summer 2026/specifications/projectSpec.md",
);

/** The slice of a document between two headings, for section-scoped assertions. */
function section(markdown, startHeading, endHeading) {
  const start = markdown.indexOf(startHeading);
  expect(start, `missing section ${startHeading}`).toBeGreaterThanOrEqual(0);
  const end = endHeading ? markdown.indexOf(endHeading, start + startHeading.length) : -1;
  return markdown.slice(start, end === -1 ? undefined : end);
}

function frontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]+?)\n---/);
  expect(match, "document must begin with YAML frontmatter").toBeTruthy();
  return Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => line.match(/^([^:]+):\s*(.*)$/))
      .filter(Boolean)
      .map((parts) => [parts[1].trim(), parts[2].trim().replace(/^"|"$/g, "")]),
  );
}

describe("module workbench documentation", () => {
  it("finalizes the overhaul document with valid frontmatter", () => {
    expect(fs.existsSync(overhaulPath)).toBe(true);
    const metadata = frontmatter(fs.readFileSync(overhaulPath, "utf8"));
    expect(metadata.Topic).toBe("Technical");
    expect(metadata["Content Type"]).toMatch(
      /implementation plan|as-built|specification|reference|guide/i,
    );
    expect(metadata.Status).toBe("Finalized");
    expect(metadata["Date Published"]).toMatch(/July 27, 2026|2026-07-27/i);
  });

  it("names every new workbench component and utility", () => {
    const doc = fs.readFileSync(overhaulPath, "utf8");
    for (const required of [
      "ModuleWorkbench",
      "ModuleSidebar",
      "ChartContainer",
      "ChartContainerFooter",
      "DatasetsSection",
      "ChartTypeSection",
      "DateRangeSection",
      "GeographySection",
      "OutcomeSection",
      "TransformSection",
      "CategoriesSection",
      "LabelsSection",
      "AppearanceSection",
      "TypographySection",
      "useLocationOptions",
      "sidebarSections.js",
      "datasetLabels.js",
    ]) {
      expect(doc, required).toContain(required);
    }
  });

  it("updates the graph-editor as-built guide for the divergent module surface", () => {
    const doc = fs.readFileSync(graphEditorPath, "utf8");
    expect(doc).toMatch(/ModuleWorkbench/);
    expect(doc).toMatch(/module.+single[- ]screen|single[- ]screen.+module/is);
    expect(doc).toMatch(/visualization-tool.+wizard|wizard.+visualization-tool/is);
    expect(doc).toMatch(/slopegraph|slope/);
    expect(doc).toMatch(/code editor|R\/Stata/);
  });

  it("updates projectSpec architecture and the locations API reference", () => {
    const doc = fs.readFileSync(projectSpecPath, "utf8");
    expect(doc).toContain("ModuleWorkbench");
    expect(doc).toContain("ChartContainerFooter");
    expect(doc).toMatch(/view=locations/);
    expect(doc).toMatch(/\{\s*locations:\s*string\[\],\s*subset:\s*string\s*\}/);
    expect(doc).not.toMatch(/modules?.+MODULE_STEPS|MODULE_STEPS.+modules?/is);
  });
});

// Folded in from the retired graphEditorPhase7Docs.test.js. Its assertions about
// the graph-editor guide's own body went with the guide, which was archived as a
// digest on 2026-07-28; these projectSpec guarantees outlived it and still hold.
describe("projectSpec Frontend Architecture", () => {
  const doc = fs.readFileSync(projectSpecPath, "utf8");
  const frontend = section(
    doc,
    "## Frontend Architecture (UI Layer)",
    "### Frontend — Flagged Issues",
  );

  it("documents the shipped spec-v2 editor surfaces", () => {
    for (const required of [
      "spec v2",
      "`version`",
      "`data`",
      "`format`",
      "`annotations`",
      "data.inline",
      "DataSourcePanel",
      "InputTableEditor",
      "ExportMenu",
      "lib/export",
      "DataTableView",
      "ModuleWorkbench",
      "ChartContainer",
      "sidebarSections",
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

  it("marks the graph-editor flagged issues resolved instead of restating them as open", () => {
    const flagged = section(doc, "### Frontend — Flagged Issues", "## Conventions & Standards");
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
});

describe("module workbench changelog", () => {
  it("contains a correctly shaped entry with valid intensity and commit date", () => {
    const overlay = JSON.parse(
      fs.readFileSync(path.join(root, "data/changelog-overlay.json"), "utf8"),
    );
    const matchingOverlay = Object.entries(overlay).find(([, entry]) =>
      /module workbench|workbench overhaul|single-screen module/i.test(
        `${entry.title || ""} ${entry.description || ""}`,
      ),
    );
    expect(matchingOverlay, "missing workbench entry in changelog-overlay.json").toBeTruthy();
    expect(["low", "moderate", "high"]).toContain(matchingOverlay[1].intensity);

    const merged = JSON.parse(
      fs.readFileSync(path.join(root, "data/changelog.json"), "utf8"),
    );
    const matchingMerged = merged.find((entry) =>
      /module workbench|workbench overhaul|single-screen module/i.test(
        `${entry.title || ""} ${entry.description || ""}`,
      ),
    );
    expect(matchingMerged, "merged changelog was not regenerated").toBeTruthy();
    expect(matchingMerged.date || matchingMerged.timestamp).toMatch(/^2026-\d{2}-\d{2}/);
  });
});
