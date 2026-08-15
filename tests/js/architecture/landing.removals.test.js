/** Import-graph contracts for retiring the dashboard-based landing surface. */

/* global process */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const sourceFiles = ["app", "components", "lib"].flatMap((folder) =>
  walk(path.join(root, folder)).filter((file) => /\.[cm]?[jt]sx?$/.test(file)),
);

const RETIRED_PATHS = [
  "components/landing/DashboardShell.js",
  "components/landing/ChartTile.js",
  "components/landing/StatCard.js",
  "components/landing/RegionTable.js",
  "components/landing/RegionalOnTrackBars.js",
  "components/landing/dashboards",
  "components/charts/ChartPreview.js",
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function code(file) {
  return fs
    .readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function moduleSpecifiers(file) {
  return [
    ...code(file).matchAll(
      /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g,
    ),
  ].map((match) => match[1]);
}

function importsRetiredModule(specifier) {
  const modulePath = specifier.replace(/\.[cm]?[jt]sx?$/, "");

  return [
    "/DashboardShell",
    "/ChartTile",
    "/StatCard",
    "/RegionTable",
    "/RegionalOnTrackBars",
    "/ChartPreview",
  ].some((suffix) => modulePath.endsWith(suffix)) ||
    modulePath === "./dashboards" ||
    modulePath.includes("/landing/dashboards");
}

describe("landing-page overhaul removals", () => {
  it("the landing dashboard components no longer exist", () => {
    for (const retiredPath of RETIRED_PATHS) {
      expect(fs.existsSync(path.join(root, retiredPath)), retiredPath).toBe(false);
    }
  });

  it("nothing imports the retired landing components", () => {
    const offenders = sourceFiles.filter((file) =>
      moduleSpecifiers(file).some(importsRetiredModule),
    );

    expect(offenders.map((file) => path.relative(root, file))).toEqual([]);
  });

  it("lib/visualization/categoryRegistry.js no longer exists", () => {
    expect(
      fs.existsSync(path.join(root, "lib/visualization/categoryRegistry.js")),
    ).toBe(false);
  });

  it("nothing imports CATEGORIES or getDashboard", () => {
    const offenders = sourceFiles.filter((file) =>
      /\bimport\b[^;]*\b(?:CATEGORIES|getDashboard)\b[^;]*;/m.test(code(file)),
    );

    expect(offenders.map((file) => path.relative(root, file))).toEqual([]);
  });
});
