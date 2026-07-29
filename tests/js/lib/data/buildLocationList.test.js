/** Phase 1 contract for the shared locations query shape. */

import { describe, expect, it } from "vitest";

import { buildLocationList } from "@/lib/data/query_shapes";

describe("buildLocationList", () => {
  it("deduplicates locations", () => {
    expect(
      buildLocationList(
        [
          { "Geographic Level": "County", Location: "Alameda" },
          { "Geographic Level": "County", Location: "Alameda" },
          { "Geographic Level": "County", Location: "Butte" },
        ],
        { subset: "Counties" },
      ),
    ).toEqual(["Alameda", "Butte"]);
  });

  it("returns a stable locale-sorted list", () => {
    const rows = ["Zeta", "Álamo", "alpine", "Butte"].map((Location) => ({
      "Geographic Level": "County",
      Location,
    }));
    const first = buildLocationList(rows, { subset: "Counties" });
    const second = buildLocationList([...rows].reverse(), { subset: "Counties" });
    expect(second).toEqual(first);
    expect(first).toEqual([...first].sort((a, b) => a.localeCompare(b)));
  });

  it("returns an empty array for no rows", () => {
    expect(buildLocationList([], { subset: "Counties" })).toEqual([]);
  });

  it("drops null, empty, and whitespace-only names", () => {
    expect(
      buildLocationList(
        [
          { Location: null },
          { Location: "" },
          { Location: "   " },
          { Location: " Alameda " },
        ],
        { subset: "Counties" },
      ),
    ).toEqual(["Alameda"]);
  });

  it("can resolve a module-specific location column", () => {
    expect(
      buildLocationList(
        [{ Jurisdiction: "Oakland" }, { Jurisdiction: "Berkeley" }],
        { subset: "Jurisdictions", locationColumn: "Jurisdiction" },
      ),
    ).toEqual(["Berkeley", "Oakland"]);
  });
});
