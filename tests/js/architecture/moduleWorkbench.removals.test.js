/** Phase 8-9 import-graph contracts for dropped module-surface capabilities. */

/* global process */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const sourceFiles = ["app", "components", "lib"].flatMap((folder) =>
  walk(path.join(root, folder)).filter((file) => /\.[cm]?[jt]sx?$/.test(file)),
);

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function importers(pattern) {
  return sourceFiles.filter((file) => pattern.test(fs.readFileSync(file, "utf8")));
}

/**
 * Strip block and line comments so a name can be *discussed* in a file without
 * counting as wiring. Workstream F4 gave ModuleSidebar a comment explaining why
 * MultiChartToolbar belongs beside the chart grid instead of in the rail, which
 * a raw substring check read as the very thing the comment says it isn't doing.
 */
function code(file) {
  return fs
    .readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("overhaul removals", () => {
  it("lib/visualization/settingsTiers.js no longer exists", () => {
    expect(
      fs.existsSync(path.join(root, "lib/visualization/settingsTiers.js")),
    ).toBe(false);
  });

  it("has no component importing the settings-tier visibility gate", () => {
    const componentFiles = sourceFiles.filter((file) => file.includes(`${path.sep}components${path.sep}`));
    const offenders = componentFiles.filter((file) =>
      /import[\s\S]*\bisVisible\b[\s\S]*settingsTiers/.test(
        fs.readFileSync(file, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("lib/visualization/codebridge no longer exists", () => {
    // The R/Stata generators outlived the code editor by two releases as a
    // dormant "copy the code for this chart" export item that was never built.
    // Asserted on the filesystem, like settingsTiers: the old import-graph
    // guard would have passed against a directory nobody had deleted.
    expect(
      fs.existsSync(path.join(root, "lib/visualization/codebridge")),
    ).toBe(false);
  });

  it("has no production import of the removed codebridge", () => {
    expect(importers(/(?:@\/|\.\.\/|\.\/)lib\/visualization\/codebridge\//)).toEqual([]);
  });

  it("does not wire presets, saved views, multi-chart, logs, or config actions into ModuleSidebar", () => {
    const sidebar = path.join(
      root,
      "components/chart-builder/workbench/ModuleSidebar.js",
    );
    expect(fs.existsSync(sidebar), "ModuleSidebar has not been created").toBe(true);
    const source = code(sidebar);
    for (const forbidden of [
      "PresetSection",
      "FooterActions",
      "MultiChartToolbar",
      "EditorActivityLog",
      "ConfigActions",
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });
});
