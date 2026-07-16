/**
 * Integration test for app/api/rhna-progress/route.js — the exact request the
 * chart editor's default bar (compare-places) preview builds for RHNA, verified
 * end to end against the committed RHNAProgress_Current.csv.
 */

import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/rhna-progress/route";

async function get(query) {
  const res = await GET(new Request(`http://test/api/rhna-progress?${query}`));
  return { status: res.status, body: await res.json() };
}

describe("rhna-progress API route", () => {
  it("serves the editor's default ranking (bar) request", async () => {
    const { status, body } = await get(
      "view=category&subset=Jurisdictions&incomeLevel=Total&parameter=On+Track+Score&topN=20&sort=value",
    );
    expect(status).toBe(200);
    expect(body.measure).toBe("On Track Score");
    expect(body.records).toHaveLength(20);
    expect(body.records[0]).toHaveProperty("category");
    expect(body.records[0]).toHaveProperty("value");
    // Descending rank (the default bar sort).
    const values = body.records.map((record) => record.value);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i - 1]).toBeGreaterThanOrEqual(values[i]);
    }
  });

  it("pins a different income level and measure when asked", async () => {
    const { status, body } = await get(
      "view=category&subset=Counties&incomeLevel=Very+Low&parameter=Percent&topN=5&sort=ascending",
    );
    expect(status).toBe(200);
    expect(body.incomeLevel).toBe("Very Low");
    expect(body.measure).toBe("Percent");
    expect(body.records.length).toBeLessThanOrEqual(5);
  });

  it("rejects an invalid income level", async () => {
    const { status, body } = await get("view=category&incomeLevel=Bogus");
    expect(status).toBe(400);
    expect(body.error).toMatch(/incomeLevel/);
  });
});
