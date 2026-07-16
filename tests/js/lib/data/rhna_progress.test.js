import { describe, expect, it } from "vitest";

import {
  DEFAULT_MEASURE,
  queryBestWorst,
  queryCategoryValues,
  queryRegionalOnTrack,
  resolveMeasureColumn,
} from "@/lib/data/rhna_progress";

// Exercises the RHNA data-access shapes against the committed
// RHNAProgress_Current.csv (the offline-seeded 5th + 6th cycle dataset).

describe("rhna_progress data access", () => {
  it("resolves the headline measure by default and validates explicit ones", () => {
    expect(resolveMeasureColumn({})).toBe(DEFAULT_MEASURE);
    expect(resolveMeasureColumn({ parameter: "Percent" })).toBe("Percent");
    expect(() => resolveMeasureColumn({ parameter: "Nope" })).toThrow(/Unknown measure/);
  });

  it("ranks jurisdictions by On Track Score at the Total level, best first", async () => {
    const { records, measure } = await queryCategoryValues({ subset: "Jurisdictions" });
    expect(measure).toBe("On Track Score");
    expect(records.length).toBeGreaterThan(400);
    // Non-null values sort descending.
    const values = records.map((r) => r.value).filter((v) => v !== null);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i - 1]).toBeGreaterThanOrEqual(values[i]);
    }
    // Every ranked record carries a region and a category for the dashboard.
    expect(records[0].region).toBeTruthy();
    expect(records[0].overallCategory).toBeTruthy();
  });

  it("returns best/worst standings with both compensatory and non-compensatory reads", async () => {
    const { best, worst, total } = await queryBestWorst({ topN: 8 });
    expect(total).toBeGreaterThan(400);
    expect(best).toHaveLength(8);
    expect(worst).toHaveLength(8);
    expect(best[0].onTrackScore).toBeGreaterThanOrEqual(worst[0].onTrackScore);
    for (const record of best) {
      expect(record.tiersWithGoal).toBeGreaterThanOrEqual(record.tiersMet);
      expect(record).toHaveProperty("overallProgress");
      expect(record).toHaveProperty("overallCategory");
    }
  });

  it("aggregates a median On Track Score per region for every income level", async () => {
    const { levels, byLevel } = await queryRegionalOnTrack();
    expect(levels).toContain("Total");
    for (const level of levels) {
      const regions = byLevel[level];
      expect(Array.isArray(regions)).toBe(true);
      // Sorted worst-to-best by median value.
      const values = regions.map((r) => r.value).filter((v) => v != null);
      for (let i = 1; i < values.length; i += 1) {
        expect(values[i - 1]).toBeLessThanOrEqual(values[i]);
      }
    }
    // The nine PPIC regions should all appear at the Total level.
    expect(byLevel.Total.length).toBe(9);
  });
});
