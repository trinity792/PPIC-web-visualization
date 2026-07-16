import { describe, expect, it } from "vitest";
import { queryDataSources as rhna } from "@/lib/data/rhna_progress";
import { queryDataSources as poph } from "@/lib/data/pop_housing";
describe("dashboard data-source footnotes", () => {
  it("rhna reports a single HCD source with a date and PT time", async () => {
    const s = await rhna();
    expect(s).toHaveLength(1);
    expect(s[0].label).toMatch(/HCD/);
    expect(s[0].lastUpdated).toMatch(/\d{4}/);
    // Source Last Updated is a datetime, rendered with the time in Pacific Time.
    expect(s[0].lastUpdated).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)\s?P[SD]T/);
  });
  it("pophousing reports DoF E-5 and E-8 vintages", async () => {
    const s = await poph();
    const labels = s.map((x) => x.label).join(" | ");
    expect(labels).toMatch(/E-5/);
    expect(labels).toMatch(/E-8/);
    expect(s.every((x) => /through \d{4}/.test(x.lastUpdated))).toBe(true);
  });
});
