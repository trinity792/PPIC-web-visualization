/**
 * Workstream B - lib/data/visualization/rankObservations.js.
 *
 * Ranking runs on the server, after the calculation, over the values the reader
 * will actually see. Three properties follow, and all three were reachable bugs
 * on the v2 path where Top N was applied to raw records before the client
 * transformed them:
 *
 *   - Top 5 by percent change is the top 5 percent changes, not the top 5 raw
 *     populations that happen to have a percent change attached.
 *   - An unavailable value is not the smallest value. Ranking a suppressed cell
 *     as zero puts it at the bottom of every Top N and the top of every
 *     Bottom N, which is the worst possible place for a hole.
 *   - Ties resolve the same way on every run, or the chart quietly reorders
 *     itself between two identical requests.
 */

import { describe, expect, it } from "vitest";

import { rankObservations } from "@/lib/data/visualization/rankObservations";
import { OBSERVATION_STATUS, VALUE_KINDS } from "@/lib/visualization/observationContract";
import {
  COMPONENTS_OF_CHANGE_EXPECTED,
  COMPONENTS_OF_CHANGE_ROWS,
} from "@/tests/fixtures/visualization-v3/componentsOfChange";

/** One observation per geography, as the calculation layer hands them over. */
function births2025(overrides = {}) {
  return COMPONENTS_OF_CHANGE_ROWS.filter(
    (row) => row.measureId === "Births" && row.Year === 2025 && row.Source === "DoF",
  ).map((row) => ({
    comparisonId: "cmp_births",
    comparisonLabel: "Births",
    measureId: "Births",
    measureLabel: "Births",
    unit: "count",
    period: 2025,
    geographyId: row.Location,
    geographyLabel: row.Location,
    categoryId: null,
    categoryLabel: null,
    value: row.value,
    status: row.status,
    valueKind: row.valueKind,
    calculation: { id: "actual", params: {} },
    includedPeriods: null,
    source: row.Source,
    ...overrides,
  }));
}

/** Percent change in total population, hand-calculated per county. */
function percentChangeRows() {
  const byLocation = {
    Fresno: 25, // 800,000 -> 1,000,000
    Kern: 25, // 2,400,000 -> 3,000,000
    Merced: 20, // 250,000 -> 300,000
  };
  return Object.entries(byLocation).map(([location, value]) => ({
    comparisonId: "cmp_growth",
    comparisonLabel: "Population growth",
    measureId: "Total Population",
    measureLabel: "Total population",
    unit: "percent",
    period: 2025,
    geographyId: location,
    geographyLabel: location,
    categoryId: null,
    categoryLabel: null,
    value,
    status: OBSERVATION_STATUS.AVAILABLE,
    valueKind: VALUE_KINDS.DERIVED,
    calculation: { id: "percentChange", params: { startYear: 2020, endYear: 2025 } },
    includedPeriods: [2020, 2025],
    source: "DoF",
  }));
}

describe("rankObservations", () => {
  it("ranks calculated values before applying Top N", () => {
    // Kern is three times Fresno's size but grows at the same rate, and Merced
    // grows slower. Ranking the raw stock would have returned Kern, Fresno.
    const { rows } = rankObservations(percentChangeRows(), {
      direction: "top",
      n: 2,
      labelKey: "geographyLabel",
    });

    expect(rows.map((row) => row.geographyLabel)).toEqual(["Fresno", "Kern"]);
    expect(rows.map((row) => row.value)).toEqual([25, 25]);
    expect(rows.map((row) => row.rank)).toEqual([1, 2]);
  });

  it("places missing and suppressed values outside the ranked marks", () => {
    const { rows, excluded } = rankObservations(births2025(), {
      direction: "top",
      n: 2,
      labelKey: "geographyLabel",
    });

    expect(rows.map((row) => row.geographyLabel)).toEqual(
      COMPONENTS_OF_CHANGE_EXPECTED.topTwoBirths2025,
    );
    // Alpine is suppressed. It is not ranked, it is not plotted as zero, and it
    // does not disappear: the caller can still list it for the table.
    expect(excluded.map((row) => row.geographyLabel)).toEqual(
      COMPONENTS_OF_CHANGE_EXPECTED.unrankedBirths2025,
    );
    for (const row of excluded) {
      expect(row.value).toBeNull();
      expect(row.rank).toBeNull();
      expect(row.inRankedSet).toBe(false);
    }
  });

  it("keeps unavailable rows out of Bottom N as well", () => {
    // The bug this guards is asymmetric: treating a hole as zero hides it at
    // the bottom of a Top N but puts it FIRST in a Bottom N.
    const { rows, excluded } = rankObservations(births2025(), {
      direction: "bottom",
      n: 2,
      labelKey: "geographyLabel",
    });

    expect(rows.map((row) => row.geographyLabel)).toEqual(["Merced", "Fresno"]);
    expect(rows.map((row) => row.geographyLabel)).not.toContain("Alpine");
    expect(excluded.map((row) => row.geographyLabel)).toEqual(["Alpine"]);
  });

  it("breaks equal values by stable label", () => {
    const forward = rankObservations(births2025(), {
      direction: "top",
      n: 3,
      labelKey: "geographyLabel",
    });
    const reversed = rankObservations([...births2025()].reverse(), {
      direction: "top",
      n: 3,
      labelKey: "geographyLabel",
    });

    // Fresno and Kern both report 12,000. Input order must not decide which one
    // is first.
    expect(forward.rows.map((row) => row.geographyLabel)).toEqual(
      COMPONENTS_OF_CHANGE_EXPECTED.rankedOrderBirths2025,
    );
    expect(reversed.rows.map((row) => row.geographyLabel)).toEqual(
      forward.rows.map((row) => row.geographyLabel),
    );
  });

  it("returns every available row when the request asks for full data", () => {
    // Tables and exports ask for everything: the ranked subset for the chart
    // and the rest for the reader, with their statuses intact.
    const { rows, excluded, all } = rankObservations(births2025(), {
      direction: "top",
      n: 2,
      labelKey: "geographyLabel",
      includeUnranked: true,
    });

    expect(all).toHaveLength(births2025().length);
    expect(all.filter((row) => row.inRankedSet)).toHaveLength(rows.length);
    expect(all.filter((row) => !row.inRankedSet).map((row) => row.geographyLabel)).toEqual([
      "Merced",
      ...excluded.map((row) => row.geographyLabel),
    ]);
  });

  it("returns every ranked row when N exceeds the available values", () => {
    const { rows } = rankObservations(births2025(), {
      direction: "top",
      n: 25,
      labelKey: "geographyLabel",
    });
    expect(rows.map((row) => row.geographyLabel)).toEqual(
      COMPONENTS_OF_CHANGE_EXPECTED.rankedOrderBirths2025,
    );
  });

  it("does not mutate the observations it was given", () => {
    const input = births2025();
    const snapshot = JSON.parse(JSON.stringify(input));
    rankObservations(input, { direction: "top", n: 2, labelKey: "geographyLabel" });
    expect(input).toEqual(snapshot);
  });
});
