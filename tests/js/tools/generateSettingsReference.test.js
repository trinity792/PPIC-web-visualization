/**
 * Workstream G - tools/generate-settings-reference.mjs.
 *
 * The factual half of the Settings Reference is generated from the registry;
 * the explanations are written by a person and live outside the generated
 * markers. That division is the whole design: facts go stale silently and prose
 * does not, so the facts are regenerated and checked in CI while the prose is
 * never touched by a tool.
 *
 * Check mode is what makes the drift visible. Without it, the generator is just
 * a convenience someone forgets to run.
 */

import { describe, expect, it } from "vitest";

import {
  GENERATED_END,
  GENERATED_START,
  checkDocument,
  generateFactualRows,
  renderReferenceBlock,
  writeReferenceBlock,
} from "@/tools/generate-settings-reference.mjs";

const SETTINGS = [
  {
    id: "calculation",
    label: "Calculation",
    section: "Outcome",
    mode: "standard",
    classification: "question",
    charts: "all",
    datasets: "all",
    values: ["actual", "numericChange", "percentChange", "indexed"],
    configPath: "question.calculation.id",
    consumer: "lib/data/visualization/calculationRegistry.js",
    chartSwitchPolicy: "keep",
    documentationId: "calculation",
    approval: "approved",
  },
  {
    id: "comparisonPresentation",
    label: "Comparison presentation",
    section: "Comparisons",
    mode: "standard",
    classification: "presentation",
    charts: ["line", "bar"],
    datasets: "all",
    values: ["combined", "tabs"],
    configPath: "presentation.comparisonPresentation",
    consumer: "lib/visualization/adapters/",
    chartSwitchPolicy: "remember",
    documentationId: "comparisonPresentation",
    approval: "approved",
  },
];

/** A reference page as a person maintains it: prose, markers, prose. */
const document = (block) => `## Settings Reference

Every control the editor can show is listed below. The tables are generated from
the registry; the explanations are written by hand and are not.

${GENERATED_START}
${block}
${GENERATED_END}

### Why Calculation sits under Outcome

Choosing what to measure and choosing what to do to it are one decision, and
splitting them across two sections is how a reader ends up indexing a rate.
`;

describe("generation", () => {
  it("generates stable factual rows from the registry", () => {
    const first = generateFactualRows(SETTINGS);
    const second = generateFactualRows([...SETTINGS].reverse());

    // Repeated generation does not churn order, so a regeneration commit shows
    // only what actually changed.
    expect(second).toEqual(first);
    expect(renderReferenceBlock(first)).toBe(renderReferenceBlock(second));
  });

  it("renders only facts, never prose", () => {
    const block = renderReferenceBlock(generateFactualRows(SETTINGS));

    expect(block).toContain("Calculation");
    expect(block).toContain("question.calculation.id");
    expect(block).toContain("lib/data/visualization/calculationRegistry.js");
    // Purpose, implications, and examples come from settingsCopy.js and are
    // written by a person; the generator has no opinion to offer about them.
    expect(block).not.toMatch(/purpose/i);
    expect(block).not.toMatch(/for example/i);
  });

  it("marks the generated region so a person can see where their prose ends", () => {
    const block = renderReferenceBlock(generateFactualRows(SETTINGS));
    const written = writeReferenceBlock(document("stale rows"), block);
    expect(written).toContain(GENERATED_START);
    expect(written).toContain(GENERATED_END);
    expect(written.indexOf(GENERATED_START)).toBeLessThan(written.indexOf(GENERATED_END));
  });
});

describe("check mode", () => {
  it("fails check mode when the committed factual block is stale", () => {
    const current = renderReferenceBlock(generateFactualRows(SETTINGS));
    const stale = renderReferenceBlock(generateFactualRows([SETTINGS[0]]));

    expect(checkDocument(document(current), current).stale).toBe(false);
    const result = checkDocument(document(stale), current);
    expect(result.stale).toBe(true);
    // The report names what moved, so the fix is obvious without a diff tool.
    expect(result.message).toMatch(/comparisonPresentation/);
  });

  it("fails when the markers are missing entirely", () => {
    const result = checkDocument("## Settings Reference\n\nNo markers here.\n", "rows");
    expect(result.stale).toBe(true);
    expect(result.message).toMatch(/marker/i);
  });
});

describe("human prose survives", () => {
  it("preserves human-written copy outside generated markers", () => {
    const before = document("stale rows");
    const after = writeReferenceBlock(
      before,
      renderReferenceBlock(generateFactualRows(SETTINGS)),
    );

    // The paragraph above the markers and the section below them are the reason
    // the reference is worth reading. A generator that can erase them is a
    // generator nobody will run twice.
    expect(after).toContain("Every control the editor can show is listed below.");
    expect(after).toContain("### Why Calculation sits under Outcome");
    expect(after).toContain("splitting them across two sections");
    expect(after).not.toContain("stale rows");
  });

  it("is idempotent, so running it twice changes nothing", () => {
    const block = renderReferenceBlock(generateFactualRows(SETTINGS));
    const once = writeReferenceBlock(document("stale rows"), block);
    expect(writeReferenceBlock(once, block)).toBe(once);
  });
});
