/**
 * Acceptance contract for the workbench section registry.
 *
 * Both editor shells compose their sidebar from this list, and since the
 * 2026-09-14 cutover every config that reaches it is a v3 question, so the
 * fixtures here are v3 specs. Transform is never a section: calculation choices
 * live inside Outcome.
 */

import { describe, expect, it } from "vitest";

import {
  SIDEBAR_SECTIONS,
  visibleSectionsFor,
} from "@/lib/visualization/sidebarSections";

const schema = {
  id: "widgets",
  sources: ["DoF", "Census"],
  subsets: { Counties: ["County"] },
  fields: {
    Year: { kind: "temporal" },
    Location: { kind: "dimension" },
    Value: { kind: "measure" },
  },
  comparisonDimensions: [],
  time: { availablePeriods: [2000, 2025] },
};

function config(chartType = "line", { time = { contract: "range" }, comparisons = [] } = {}) {
  return {
    version: 3,
    presentation: { chartType },
    question: {
      dataset: { kind: "module", moduleId: "widgets" },
      outcome: { measureId: "Value" },
      time,
      comparisons,
    },
  };
}

/**
 * Every section a line chart shows on the fixture schema above, hand-written in
 * registry order.
 */
const LINE_SECTIONS = [
  "datasets",
  "chart-type",
  "axis",
  "time",
  "geography",
  "labels",
  "appearance",
  "typography",
];

describe("visibleSectionsFor", () => {
  it("lists a line chart's sections in registry order", () => {
    expect(visibleSectionsFor(config("line"), schema).map((item) => item.value)).toEqual(
      LINE_SECTIONS,
    );
  });

  it("gates keyed sections with the chart descriptor's sidebarSections", () => {
    const table = visibleSectionsFor(config("dataTable"), schema).map((item) => item.value);
    // Outcome always applies on v3: a data table still has an outcome and a
    // calculation to choose.
    expect(table).toContain("axis");
    expect(table).toEqual(expect.arrayContaining(["labels", "appearance"]));
  });

  it("never offers a standalone Transform section", () => {
    for (const chartType of ["line", "dumbbell", "choroplethMap", "dataTable"]) {
      expect(
        visibleSectionsFor(config(chartType), schema).map((item) => item.value),
        chartType,
      ).not.toContain("transform");
    }
  });

  it("shows Time only for a question that has a time axis", () => {
    expect(visibleSectionsFor(config("line"), schema).map((item) => item.value)).toContain(
      "time",
    );
    // A forest plot, or pasted data with no time column, settles on "none".
    expect(
      visibleSectionsFor(config("forest", { time: { contract: "none" } }), schema).map(
        (item) => item.value,
      ),
    ).not.toContain("time");
  });

  it("shows Comparisons only for modules with comparison dimensions", () => {
    const demographic = { ...schema, comparisonDimensions: [{ id: "Race/Ethnicity" }] };
    expect(visibleSectionsFor(config(), demographic).map((item) => item.value)).toContain(
      "comparisons",
    );
    expect(visibleSectionsFor(config(), schema).map((item) => item.value)).not.toContain(
      "comparisons",
    );
  });

  it("shows Geographic Level only for a schema with subsets", () => {
    const byod = { id: "byod", inlineOnly: true, fields: {}, subsets: {} };
    const inline = {
      version: 3,
      presentation: { chartType: "line" },
      question: {
        dataset: { kind: "inline", inline: { columns: [], rows: [] }, bindings: {} },
        time: { contract: "range" },
        comparisons: [],
      },
    };
    const sections = visibleSectionsFor(inline, byod, { exclude: ["chart-type"] }).map(
      (item) => item.value,
    );
    expect(sections).toContain("axis");
    expect(sections).not.toContain("geography");
    expect(sections).not.toContain("datasets");
  });

  it("applies only and exclude without changing registry order", () => {
    // The registry's declared order, asserted against the hand-written list so a
    // reordering of either shows up here rather than cancelling out.
    const registryOrder = SIDEBAR_SECTIONS.map((item) => item.value);
    expect(registryOrder.filter((value) => LINE_SECTIONS.includes(value))).toEqual(
      LINE_SECTIONS,
    );

    const requested = ["appearance", "datasets", "axis", "chart-type"];
    const only = visibleSectionsFor(config(), schema, { only: requested }).map(
      (item) => item.value,
    );
    const excluded = visibleSectionsFor(config(), schema, {
      exclude: ["chart-type", "datasets"],
    }).map((item) => item.value);

    // Requested out of order on purpose: the result is registry order regardless.
    expect(only).toEqual(LINE_SECTIONS.filter((value) => requested.includes(value)));
    expect(excluded).toEqual(
      LINE_SECTIONS.filter((value) => !["chart-type", "datasets"].includes(value)),
    );
  });
});
