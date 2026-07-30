/**
 * Tests for lib/logs/presentation.js — the revision helpers.
 *
 * The backend emits two shapes under result.revisions: a {source: diff} map for
 * multi-source modules (Components, Projections) and a bare diff for single-source
 * ones (Housing Stress, Building Permits, RHNA). Both must normalize to one array.
 */

import { describe, expect, it } from "vitest";

import {
  deriveRevisionSummary,
  deriveRevisions,
  formatPeriodList,
} from "@/lib/logs/presentation";

const DOF_DIFF = {
  added_periods: [2024],
  changed_periods: [2023],
  removed_periods: [],
  added_keys: 1,
  removed_keys: 0,
  changed_cells: 1,
  truncated: false,
  sample: [{ key: "Fresno County|2023|DoF", column: "Births", old: 12400.0, new: 12180.0 }],
};

function entryWith(revisions) {
  return { result: { row_count: 4023, revisions } };
}

describe("deriveRevisions", () => {
  it("normalizes a per-source map", () => {
    const result = deriveRevisions(entryWith({ DoF: DOF_DIFF }));

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("DoF");
    expect(result[0].changedCells).toBe(1);
    expect(result[0].changedPeriods).toEqual([2023]);
    expect(result[0].sample[0].column).toBe("Births");
  });

  it("normalizes a bare diff from a single-source module", () => {
    const result = deriveRevisions(entryWith(DOF_DIFF));

    expect(result).toHaveLength(1);
    expect(result[0].source).toBeNull();
    expect(result[0].changedCells).toBe(1);
  });

  it("returns an empty array when the record has no revisions", () => {
    expect(deriveRevisions({ result: { row_count: 10 } })).toEqual([]);
    expect(deriveRevisions({ result: null })).toEqual([]);
    expect(deriveRevisions({})).toEqual([]);
  });

  it("keeps both sources of a multi-source run", () => {
    const census = { ...DOF_DIFF, changed_cells: 4, changed_periods: [2022] };
    const result = deriveRevisions(entryWith({ DoF: DOF_DIFF, Census: census }));

    expect(result.map((item) => item.source)).toEqual(["DoF", "Census"]);
  });
});

describe("formatPeriodList", () => {
  it("lists a short span verbatim", () => {
    expect(formatPeriodList([2023, 2024])).toBe("2023, 2024");
  });

  it("collapses a long span, matching the backend log line", () => {
    const horizon = Array.from({ length: 51 }, (_, index) => 2020 + index);

    expect(formatPeriodList(horizon)).toBe("2020–2070 (51 periods)");
  });

  it("returns an empty string for no periods", () => {
    expect(formatPeriodList([])).toBe("");
    expect(formatPeriodList(undefined)).toBe("");
  });
});

describe("deriveRevisionSummary", () => {
  it("describes a restated value in plain language", () => {
    expect(deriveRevisionSummary(entryWith({ DoF: DOF_DIFF }))).toBe(
      "1 previously published value restated in 2023."
    );
  });

  it("pluralizes and totals across sources", () => {
    const census = { ...DOF_DIFF, changed_cells: 4, changed_periods: [2022] };

    expect(deriveRevisionSummary(entryWith({ DoF: DOF_DIFF, Census: census }))).toBe(
      "5 previously published values restated in 2022, 2023."
    );
  });

  it("is null when a run only added new periods", () => {
    const additionsOnly = { ...DOF_DIFF, changed_cells: 0, changed_periods: [] };

    expect(deriveRevisionSummary(entryWith({ DoF: additionsOnly }))).toBeNull();
  });

  it("is null when the record has no revisions at all", () => {
    expect(deriveRevisionSummary({ result: { row_count: 10 } })).toBeNull();
  });
});
