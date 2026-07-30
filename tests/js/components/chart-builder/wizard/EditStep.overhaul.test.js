/** Phase 10 source-composition contract for the shared standalone Edit step. */

/* global process */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const editPath = path.join(
  process.cwd(),
  "components/chart-builder/wizard/steps/EditStep.js",
);
const source = fs.readFileSync(editPath, "utf8");

describe("EditStep overhaul composition", () => {
  it("uses the shared registry and excludes only Chart Type", () => {
    expect(source).toMatch(/sidebarSections/);
    expect(source).toMatch(/exclude\s*:\s*\[\s*["']chart-type["']\s*\]/);
    expect(source).not.toMatch(/only\s*=/);
  });

  it("removes GUI/Code and tier controls", () => {
    // Advanced Mode is back as a single boolean (see below); what stays gone is
    // the code editor and the three-tier visibility registry.
    for (const removed of [
      "EditorModeToggle",
      "CodeEditorPanel",
      "SET_TIER",
      "settingsTiers",
    ]) {
      expect(source, removed).not.toContain(removed);
    }
  });

  it("hosts the Advanced Mode switch over its own sections", () => {
    expect(source).toMatch(
      /import\s*\{[^}]*AdvancedModeProvider[^}]*\}\s*from\s*["'][^"']*advancedMode["']/,
    );
    expect(source).toContain("<AdvancedModeProvider>");
    expect(source).toMatch(/<AdvancedModeToggle[^>]*\/>/);
  });

  it("opts the shared Outcome section into the standalone Add line action", () => {
    expect(source).toMatch(/OutcomeSection|allowLayers/);
    expect(source).toContain("allowLayers");
  });

  it("keeps standalone config export alongside the shared sections", () => {
    expect(source).toMatch(/import\s*\{[^}]*ExportConfigButton[^}]*\}\s*from/);
    expect(source).toMatch(/<ExportConfigButton\s*\/?\s*>/);
  });
});
