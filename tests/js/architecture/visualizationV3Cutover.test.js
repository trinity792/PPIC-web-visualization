/**
 * Workstream H - the cutover is complete and the removals are reversible.
 *
 * The plan's hardest constraint is that the new and old paths must not split
 * production traffic. Internal work may proceed behind an unwired module, but
 * the public switch happens once, when every registered chart type has a v3
 * adapter and every registered module has a v3 question adapter. A half-cutover
 * is the worst state available: two request contracts, two places a calculation
 * can run, and a chart type switch that silently changes which one you get.
 *
 * The second constraint is that nothing is deleted on an assistant's judgement.
 * A replaced file moves to `.trash/visualization-backend/`, which keeps it
 * recoverable and out of the import graph, and it leaves only with a dated
 * developer approval recorded in the removal changelog.
 */

/* global process */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CHART_TYPE_IDS } from "@/lib/visualization/chartRegistry";
import { MODULE_SCHEMAS } from "@/lib/visualization/moduleRegistry";

const root = process.cwd();
const TRASH = path.join(root, ".trash/visualization-backend");
const CHANGELOG = path.join(
  root,
  "docs/PPIC Summer 2026/refractor-guide/visualization-backend-removal-changelog.md",
);

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const sourceFiles = ["app", "components", "lib"].flatMap((folder) =>
  walk(path.join(root, folder)).filter((file) => /\.[cm]?[jt]sx?$/.test(file)),
);

/** Strip comments so a name can be discussed in a file without counting as wiring. */
function code(file) {
  return fs
    .readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const exists = (relative) => fs.existsSync(path.join(root, relative));

/**
 * Parses the removal changelog's State and Developer decision columns. The
 * ledger is the evidence a deletion was reviewed; a filesystem absence with no
 * entry behind it is an assistant's decision wearing a test's clothes.
 */
function changelogEntries() {
  if (!fs.existsSync(CHANGELOG)) return [];
  return fs
    .readFileSync(CHANGELOG, "utf8")
    .split("\n")
    .filter((line) => line.trim().startsWith("|") && line.includes("`"))
    .map((line) => line.split("|").map((cell) => cell.trim()))
    .filter((cells) => cells.length > 3)
    .map((cells) => ({
      path: (cells[1].match(/`([^`]+)`/) || [])[1] || cells[1],
      state: cells.find((cell) =>
        ["identified", "unwired", "trashed", "approved", "denied", "deleted"].includes(cell),
      ),
      row: cells,
    }));
}

describe("every chart family cuts over together", () => {
  it("routes every registered chart through the v3 observation adapter", () => {
    const adapters = walk(path.join(root, "lib/visualization/adapters")).map((file) =>
      fs.readFileSync(file, "utf8"),
    );
    const registered = adapters.join("\n");

    for (const chartTypeId of CHART_TYPE_IDS) {
      // Not "an adapter exists somewhere" but "this id is handled": a chart
      // type with no adapter would otherwise fall through to whatever the
      // dispatcher's default happens to be.
      expect(registered, `chart type: ${chartTypeId}`).toContain(chartTypeId);
    }
  });

  it("leaves no live caller on the chart-shaped request path", () => {
    // QUERY_SHAPES mapped a chart id to an API view, which is what made the
    // renderer part of the data question.
    const offenders = sourceFiles.filter((file) => /\bQUERY_SHAPES\b/.test(code(file)));
    expect(offenders.map((file) => path.relative(root, file))).toEqual([]);

    for (const view of ["view=line", "view=category", "view=twoPeriod", "view=matrix", "view=geo"]) {
      const users = sourceFiles.filter((file) => code(file).includes(view));
      expect(users.map((file) => path.relative(root, file)), view).toEqual([]);
    }
  });

  it("leaves no live consumer of the v2 tab filters", () => {
    // `filters.tabColumn` / `tabValue` / `tabOrder` stored a presentation
    // choice inside the population definition, so changing a tab changed what
    // the chart was about.
    const offenders = sourceFiles.filter((file) =>
      /filters\.(tabColumn|tabValue|tabOrder)/.test(code(file)),
    );
    expect(offenders.map((file) => path.relative(root, file))).toEqual([]);
  });

  it("routes every registered module through a v3 question adapter", () => {
    const adapterSource = walk(path.join(root, "lib/data/visualization"))
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");

    for (const moduleId of Object.keys(MODULE_SCHEMAS)) {
      expect(adapterSource, `module: ${moduleId}`).toContain(moduleId);
    }
  });

  it("gives every module API route a v3 POST handler", () => {
    const routes = walk(path.join(root, "app/api")).filter((file) =>
      file.endsWith(`route.js`),
    );
    const moduleRoutes = routes.filter((file) => !/geography|doc-asset|module-status/.test(file));

    for (const file of moduleRoutes) {
      expect(code(file), path.relative(root, file)).toMatch(/export\s+async\s+function\s+POST/);
    }
  });

  it("keeps the client free of a second calculation implementation", () => {
    // Inline data reuses the shared registry locally. What it may not do is
    // carry its own formulas, because two implementations drift and only one
    // of them knows that a suppressed input makes a sum unavailable.
    const clientFiles = sourceFiles.filter(
      (file) =>
        file.includes(`${path.sep}components${path.sep}`) &&
        !file.includes(`${path.sep}ui-kit${path.sep}`),
    );
    const offenders = clientFiles.filter((file) =>
      /\(end\s*-\s*start\)\s*\/\s*start|\/\s*base\s*\)\s*\*\s*100/.test(code(file)),
    );
    expect(offenders.map((file) => path.relative(root, file))).toEqual([]);
  });
});

describe("quarantined code is recoverable but not executable", () => {
  it("keeps quarantined code outside app component and lib import graphs", () => {
    const offenders = sourceFiles.filter((file) => /['"][^'"]*\.trash\//.test(code(file)));
    expect(offenders.map((file) => path.relative(root, file))).toEqual([]);
  });

  it("documents the quarantine folder and its review rule", () => {
    if (!fs.existsSync(TRASH)) return; // Nothing quarantined yet.
    expect(fs.existsSync(path.join(TRASH, "README.md"))).toBe(true);
    const trashIndex = fs.readFileSync(path.join(root, ".trash/README.md"), "utf8");
    expect(trashIndex).toContain("visualization-backend");
  });

  it("preserves the original relative path of every quarantined file", () => {
    if (!fs.existsSync(TRASH)) return;
    for (const file of walk(TRASH)) {
      if (file.endsWith("README.md")) continue;
      const relative = path.relative(TRASH, file);
      // `.trash/visualization-backend/components/chart-builder/chartData.js`,
      // not a flat pile of basenames: recovery has to be a move, not a hunt.
      expect(relative.includes(path.sep), relative).toBe(true);
    }
  });
});

describe("removals are reviewed one at a time", () => {
  it("keeps a removal changelog once implementation starts", () => {
    expect(fs.existsSync(CHANGELOG)).toBe(true);
  });

  it("allows only developer-approved filesystem removals", () => {
    // Absence is only a requirement where a dated approval says so. Without
    // this, a test asserting "file X no longer exists" is just a record of what
    // an assistant deleted.
    const candidates = [
      "components/chart-builder/chartData.js",
      "components/chart-builder/sections/DateRangeSection.js",
      "lib/visualization/transformRegistry.js",
      "lib/visualization/chartSpec.js",
    ];
    const entries = changelogEntries();

    for (const candidate of candidates) {
      if (exists(candidate)) continue;
      const entry = entries.find((row) => row.path === candidate);
      expect(entry, `${candidate} was removed with no changelog entry`).toBeDefined();
      expect(entry.state, candidate).toBe("deleted");
      expect(entry.row.join(" "), candidate).toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });

  it("records a replacement and a recovery path for every entry", () => {
    for (const entry of changelogEntries()) {
      const row = entry.row.join(" ");
      expect(row, entry.path).toMatch(/lib\/|components\/|app\/|\.trash\//);
      expect(entry.state, entry.path).toBeDefined();
    }
  });

  it("does not use the application changelog as the removal ledger", () => {
    // `data/changelog-overlay.json` is commit-based and records shipped
    // changes. The removal changelog is review evidence collected before a
    // deletion, which is a different artefact for a different reader.
    const overlay = path.join(root, "data/changelog-overlay.json");
    if (!fs.existsSync(overlay)) return;
    expect(fs.readFileSync(overlay, "utf8")).not.toMatch(/\.trash\/visualization-backend/);
  });
});
