/**
 * Workstream H - the v3 saved-view namespace.
 *
 * Belongs to `savedViews.test.js` and folds back into it once
 * `lib/visualization/questionSpec.js` exists. It is a separate file only
 * because Vite resolves a dynamic import's static specifier at transform time,
 * so an unwritten module here would take the live v1/v2 saved-view tests down
 * with it - and those still protect shipping code.
 */

import { beforeEach as v3BeforeEach, describe, expect, it } from "vitest";

import { SAVED_VIEWS_KEY } from "@/components/chart-builder/savedViews";

v3BeforeEach(() => {
  window.localStorage.clear();
});

/**
 * Workstream H - the v3 namespace and the end of legacy conversion.
 *
 * `chartSpec.js` migrated v1 into v2 and preserved retired chart types so old
 * links kept rendering. That was correct for the prior requirement. It is not
 * one here: the v3 question has no honest reading of `Group`, `Series`, scalar
 * demographic filters, or `filters.tab*`, so a migration would have to guess at
 * what population a saved view described. Guessing wrong produces a chart that
 * opens and is quietly about someone else.
 *
 * The cutover is therefore non-destructive rather than backward-compatible: v3
 * writes to its own key, `ppic.savedViews.v1` is left exactly as it is, and a
 * v1 or v2 import gets one plain sentence.
 */
const savedViewsModule = () => import("@/components/chart-builder/savedViews");
const questionSpecModule = () => import("@/lib/visualization/questionSpec");

const V3_SCHEMA = {
  id: "projections",
  label: "Age, Sex & Race Projections",
  sources: ["DoF P-3", "Census cc-est"],
  subsets: { Counties: ["County"] },
  fields: {
    Year: { kind: "temporal" },
    Location: { kind: "dimension" },
    Population: { kind: "measure", unit: "people", calculations: ["actual"] },
  },
};

function v3Config(overrides = {}) {
  return {
    version: 3,
    question: {
      dataset: { kind: "module", moduleId: "projections" },
      source: "DoF P-3",
      outcome: { measureId: "Population" },
      geography: { subset: "Counties", locations: ["San Francisco"] },
      time: { contract: "range", startYear: 2020, endYear: 2030 },
      calculation: { id: "actual", params: {} },
      comparisons: [
        {
          id: "cmp_latina",
          dimensions: { "Race/Ethnicity": "Hispanic", Sex: "Female", "Age Group": "All Ages" },
          customLabel: "SF Latinas",
          color: "Violet",
        },
        {
          id: "cmp_white_women",
          dimensions: { "Race/Ethnicity": "White", Sex: "Female", "Age Group": "All Ages" },
          customLabel: null,
          color: null,
        },
      ],
    },
    presentation: {
      chartType: "line",
      comparisonPresentation: "tabs",
      activeTab: "cmp_white_women",
      labels: { title: "Population by group" },
      format: {},
      appearance: { palette: "brand-categorical" },
      annotations: [],
      charts: { bar: { stackMode: "grouped" } },
    },
    ...overrides,
  };
}

describe("Workstream H v3 saved views", () => {
  it("uses the v3 storage namespace without mutating old saved data", async () => {
    const { SAVED_VIEWS_KEY_V3, saveView: saveV3, serialize: serializeV3 } =
      await savedViewsModule();

    expect(SAVED_VIEWS_KEY_V3).toBe("ppic.savedViews.v3");
    expect(SAVED_VIEWS_KEY_V3).not.toBe(SAVED_VIEWS_KEY);

    // Someone else's v2 views, already in this browser.
    const existing = JSON.stringify([{ name: "An old view", config: { version: 2 } }]);
    window.localStorage.setItem(SAVED_VIEWS_KEY, existing);

    saveV3("A new view", v3Config());

    // The old key is left byte-for-byte alone. Nothing about a cutover
    // justifies deleting a reader's saved work from their own browser.
    expect(window.localStorage.getItem(SAVED_VIEWS_KEY)).toBe(existing);
    expect(window.localStorage.getItem(SAVED_VIEWS_KEY_V3)).toContain("A new view");
    expect(JSON.parse(serializeV3(v3Config())).version).toBe(3);
  });

  it("round-trips one chart and a multi-chart v3 workspace", async () => {
    const { deserialize: readV3, deserializeWorkspace: readWorkspaceV3, serialize: writeV3, serializeWorkspace: writeWorkspaceV3 } =
      await savedViewsModule();
    const { normalizeQuestion } = await questionSpecModule();

    expect(readV3(writeV3(v3Config()), V3_SCHEMA)).toEqual(
      normalizeQuestion(v3Config()),
    );

    const workspace = {
      charts: [v3Config(), v3Config({ presentation: { ...v3Config().presentation, chartType: "bar" } })],
      activeChartId: 1,
    };
    const restored = readWorkspaceV3(writeWorkspaceV3(workspace), V3_SCHEMA);
    expect(restored.charts).toHaveLength(2);
    expect(restored.charts[1].presentation.chartType).toBe("bar");
    expect(restored.activeChartId).toBe(1);
  });

  it("rejects v1 and v2 with the approved plain-language message", async () => {
    const { deserialize: readV3 } = await savedViewsModule();
    const { UNSUPPORTED_VERSION_MESSAGE } = await questionSpecModule();

    for (const version of [1, 2]) {
      const older = JSON.stringify({
        version,
        module: "projections",
        chartType: "line",
        bindings: { x: "Year", y: "Population", series: "Location" },
        filters: { subset: "Counties", raceEthnicity: "Hispanic", sex: "Female" },
        period: { startYear: 2020, endYear: 2030 },
        transform: "indexed",
      });

      const result = readV3(older, V3_SCHEMA);
      expect(result.ok, `v${version}`).toBe(false);
      expect(result.message, `v${version}`).toBe(UNSUPPORTED_VERSION_MESSAGE);
      // No partial conversion: a spec that came back half-guessed would render,
      // which is exactly the outcome that makes it dangerous.
      expect(result, `v${version}`).not.toHaveProperty("spec");
    }
  });

  it("preserves comparison ids labels colors and presentation state", async () => {
    const { deserialize: readV3, serialize: writeV3 } = await savedViewsModule();
    const restored = readV3(writeV3(v3Config()), V3_SCHEMA);

    // The id is what colour, legend entry, tab, and returned observations are
    // all keyed by. If save and restore renumbers it, a shared link opens with
    // the reader's custom label on somebody else's series.
    expect(restored.question.comparisons.map((entry) => entry.id)).toEqual([
      "cmp_latina",
      "cmp_white_women",
    ]);
    expect(restored.question.comparisons[0].customLabel).toBe("SF Latinas");
    expect(restored.question.comparisons[0].color).toBe("Violet");
    expect(restored.presentation.comparisonPresentation).toBe("tabs");
    expect(restored.presentation.activeTab).toBe("cmp_white_women");
    // Remembered chart-specific presentation survives too, still inactive.
    expect(restored.presentation.charts.bar).toEqual({ stackMode: "grouped" });
  });

  it("keeps the inline-data size cap", async () => {
    const { serialize: writeV3 } = await savedViewsModule();
    const huge = {
      columns: [{ name: "Value", type: "number" }],
      rows: Array.from({ length: 200_000 }, (_, index) => [index]),
    };
    expect(() =>
      writeV3(
        v3Config({
          question: {
            ...v3Config().question,
            dataset: { kind: "inline", inline: huge },
          },
        }),
      ),
    ).toThrow(/too large/i);
  });

  it("rejects a v3 view whose module does not match the open schema", async () => {
    const { deserialize: readV3 } = await savedViewsModule();
    const result = readV3(JSON.stringify(v3Config()), { ...V3_SCHEMA, id: "pophousing" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/dataset/i);
  });
});
