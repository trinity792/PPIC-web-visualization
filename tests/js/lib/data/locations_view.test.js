/** Phase 1 integration contract shared by all module API routes. */

import { describe, expect, it } from "vitest";

import { GET as buildingPermits } from "@/app/api/building-permits/route";
import { GET as componentsOfChange } from "@/app/api/components-of-change/route";
import { GET as housingStress } from "@/app/api/housing-stress/route";
import { GET as pophousing } from "@/app/api/pophousing/route";
import { GET as projections } from "@/app/api/projections/route";
import { GET as rhnaProgress } from "@/app/api/rhna-progress/route";

// Each module's own canonical subset: Building Permits is metro-grained (BPS
// publishes no county series) and RHNA is jurisdiction-grained, so neither
// offers "Counties".
const routes = [
  ["pophousing", pophousing, "Counties"],
  ["components-of-change", componentsOfChange, "Counties"],
  ["projections", projections, "Counties"],
  ["housing-stress", housingStress, "Counties"],
  ["building-permits", buildingPermits, "Metros"],
  ["rhna-progress", rhnaProgress, "Jurisdictions"],
];

async function request(get, query) {
  const response = await get(new Request(`http://test/api/module?${query}`));
  return { status: response.status, body: await response.json() };
}

describe("view=locations", () => {
  it("returns the standard response shape for a valid subset", async () => {
    const { status, body } = await request(
      componentsOfChange,
      "view=locations&subset=Counties",
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ subset: "Counties", locations: expect.any(Array) });
    expect(body.locations.length).toBeGreaterThan(0);
  });

  it("rejects an unknown subset with the standard error/source envelope", async () => {
    const { status, body } = await request(
      componentsOfChange,
      "view=locations&subset=Atlantis",
    );
    expect(status).toBe(400);
    expect(body).toEqual({ error: expect.any(String), source: expect.stringMatching(/components/i) });
  });

  it.each(routes)(
    "%s serves distinct sorted names from its own location column",
    async (_name, get, subset) => {
      const { status, body } = await request(
        get,
        `view=locations&subset=${encodeURIComponent(subset)}`,
      );
      expect(status).toBe(200);
      expect(body).toEqual({ subset, locations: expect.any(Array) });
      expect(body.locations.length).toBeGreaterThan(0);
      expect(new Set(body.locations).size).toBe(body.locations.length);
      expect(body.locations).toEqual(
        [...body.locations].sort((a, b) => a.localeCompare(b)),
      );
    },
    // These hit the real route over the real contract CSV. Projections' is 90MB,
    // which parses well inside the 5s default alone but can exceed it when the
    // suite's workers are all reading at once — an intermittent failure that has
    // nothing to do with the assertion.
    20_000,
  );

  it("RHNA resolves Jurisdiction rather than returning blank Location values", async () => {
    const { status, body } = await request(
      rhnaProgress,
      "view=locations&subset=Jurisdictions",
    );
    expect(status).toBe(200);
    expect(body.locations).toContain("Oakland");
    expect(body.locations.every((name) => typeof name === "string" && name.trim())).toBe(
      true,
    );
  });
});
