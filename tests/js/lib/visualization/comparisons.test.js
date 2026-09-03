/**
 * Workstream A - lib/visualization/comparisons.js.
 *
 * A comparison is the unit the whole refactor turns on: it is what the user
 * builds, what the server answers, what a trace is named after, and what a
 * colour is attached to. Three properties make that work and each is pinned
 * below:
 *
 *   - **Identity is stable.** The id is generated once and never encodes a
 *     mutable selection, so editing a card, reordering the list, switching
 *     charts, or saving and restoring cannot silently rename a series or move
 *     its colour to another population.
 *   - **Two editors, one list.** Checkbox cross-product generation and
 *     one-at-a-time irregular cards write the same array. Neither is a separate
 *     stored mode.
 *   - **Labels are derived, then disambiguated.** The label a reader sees in the
 *     legend is the same string that reaches the table, the CSV, and the
 *     accessible description.
 */

import { describe, expect, it } from "vitest";

import {
  COMPARISON_LIMIT_MESSAGE,
  MAX_COMPARISONS,
  addComparison,
  canonicalSignature,
  createComparison,
  expandCrossProduct,
  overlapMetadata,
  resolveLabels,
  updateComparison,
} from "@/lib/visualization/comparisons";

/**
 * Label metadata the Projections schema is expected to declare (Workstream A,
 * "Derived labels and defaults"). Written out here rather than imported so this
 * test states the expectation instead of reading it back off the schema.
 */
const projectionsLabelMeta = {
  dimensionOrder: ["geography", "Race/Ethnicity", "Sex", "Age Group"],
  omitValues: {
    "Age Group": ["All Ages"],
    Sex: ["Both Sexes"],
    "Race/Ethnicity": ["All"],
  },
  valueLabels: {
    "Race/Ethnicity": {
      Hispanic: { default: "Latino", bySex: { Female: "Latina", Male: "Latino" } },
      White: { default: "White" },
      Black: { default: "Black" },
    },
    Sex: { Female: "Women", Male: "Men" },
  },
  disambiguateBy: ["geography", "Source", "time"],
};

const cmp = (dimensions, extra = {}) =>
  createComparison({ dimensions, ...extra });

describe("comparison generation", () => {
  it("expands two races and two sexes into four comparisons", () => {
    const { comparisons, issues } = expandCrossProduct(
      {
        "Race/Ethnicity": ["Hispanic", "White"],
        Sex: ["Female", "Male"],
      },
      { existing: [], fixed: { "Age Group": "All Ages" } },
    );

    expect(issues).toEqual([]);
    expect(comparisons).toHaveLength(4);
    expect(
      comparisons.map((c) => [c.dimensions["Race/Ethnicity"], c.dimensions.Sex]),
    ).toEqual([
      ["Hispanic", "Female"],
      ["Hispanic", "Male"],
      ["White", "Female"],
      ["White", "Male"],
    ]);
    // The fixed dimension is written onto every generated combination, so a
    // comparison is always a complete population definition.
    for (const comparison of comparisons) {
      expect(comparison.dimensions["Age Group"]).toBe("All Ages");
      expect(comparison.id).toEqual(expect.any(String));
    }
    expect(new Set(comparisons.map((c) => c.id)).size).toBe(4);
  });

  it("keeps only Black women and White men when added as irregular cards", () => {
    // The point of the irregular editor: this pair is NOT the cross-product of
    // {Black, White} x {Female, Male}, and generating that would add two
    // populations the user never asked about.
    let list = [];
    ({ comparisons: list } = addComparison(
      list,
      cmp({ "Race/Ethnicity": "Black", Sex: "Female", "Age Group": "All Ages" }),
    ));
    ({ comparisons: list } = addComparison(
      list,
      cmp({ "Race/Ethnicity": "White", Sex: "Male", "Age Group": "All Ages" }),
    ));

    expect(list).toHaveLength(2);
    expect(list.map((c) => [c.dimensions["Race/Ethnicity"], c.dimensions.Sex])).toEqual([
      ["Black", "Female"],
      ["White", "Male"],
    ]);
  });

  it("reuses identity when a generated signature returns", () => {
    const original = {
      ...cmp({ "Race/Ethnicity": "Hispanic", Sex: "Female", "Age Group": "All Ages" }),
      customLabel: "Latinas, SF",
      color: "Violet",
    };

    // The user unticks White, then re-ticks it. Hispanic/Female was never
    // removed, so its card must come back with its own id, label, and colour -
    // not as a fresh card that loses both.
    const { comparisons } = expandCrossProduct(
      { "Race/Ethnicity": ["Hispanic", "White"], Sex: ["Female"] },
      { existing: [original], fixed: { "Age Group": "All Ages" } },
    );

    const returned = comparisons.find(
      (c) => c.dimensions["Race/Ethnicity"] === "Hispanic" && c.dimensions.Sex === "Female",
    );
    expect(returned.id).toBe(original.id);
    expect(returned.customLabel).toBe("Latinas, SF");
    expect(returned.color).toBe("Violet");
  });

  it("matches a returning combination by canonical signature, not key order", () => {
    const a = cmp({ "Race/Ethnicity": "Hispanic", Sex: "Female", "Age Group": "All Ages" });
    const b = cmp({ Sex: "Female", "Age Group": "All Ages", "Race/Ethnicity": "Hispanic" });
    expect(canonicalSignature(a)).toBe(canonicalSignature(b));
    // ...and the signature is not the id, so the id can stay stable while the
    // signature moves with an edit.
    expect(a.id).not.toBe(canonicalSignature(a));
  });

  it("generates an id that does not encode a mutable selection", () => {
    const comparison = cmp({
      "Race/Ethnicity": "Hispanic",
      Sex: "Female",
      "Age Group": "All Ages",
    });
    for (const value of ["Hispanic", "Female", "All Ages"]) {
      expect(comparison.id).not.toContain(value);
    }
  });

  it("keeps the id through an edit that changes the population", () => {
    const list = [cmp({ "Race/Ethnicity": "Hispanic", Sex: "Female", "Age Group": "All Ages" })];
    const { comparisons } = updateComparison(list, list[0].id, {
      dimensions: { "Race/Ethnicity": "Hispanic", Sex: "Male", "Age Group": "All Ages" },
    });

    expect(comparisons[0].id).toBe(list[0].id);
    expect(comparisons[0].dimensions.Sex).toBe("Male");
    // The signature must move even though the id did not, or a later
    // regeneration would think this card is still Hispanic/Female.
    expect(canonicalSignature(comparisons[0])).not.toBe(canonicalSignature(list[0]));
  });
});

describe("the ten-comparison limit", () => {
  it("declares ten as the limit", () => {
    expect(MAX_COMPARISONS).toBe(10);
    expect(COMPARISON_LIMIT_MESSAGE).toBe("This chart has the maximum of 10 comparisons.");
  });

  it("allows ten comparisons and rejects the eleventh", () => {
    const ten = Array.from({ length: 10 }, (_, index) =>
      cmp({ "Race/Ethnicity": "Hispanic", Sex: "Female", "Age Group": `${index}-${index + 4}` }),
    );

    const { comparisons, issues } = addComparison(
      ten,
      cmp({ "Race/Ethnicity": "Hispanic", Sex: "Female", "Age Group": "85+" }),
    );

    // Rejected before the list mutates: ten in, ten out.
    expect(comparisons).toHaveLength(10);
    expect(comparisons).toEqual(ten);
    expect(issues).toEqual([
      expect.objectContaining({ code: "comparisonLimit", message: COMPARISON_LIMIT_MESSAGE }),
    ]);
  });

  it("rejects a cross-product larger than ten before creating any of it", () => {
    const { comparisons, issues } = expandCrossProduct(
      {
        "Race/Ethnicity": ["Hispanic", "White", "Black"],
        Sex: ["Female", "Male"],
        "Age Group": ["0-4", "5-9"],
      },
      { existing: [] },
    );

    // 3 x 2 x 2 = 12. Nothing partial is produced.
    expect(comparisons).toEqual([]);
    expect(issues).toEqual([
      expect.objectContaining({ code: "comparisonLimit", message: COMPARISON_LIMIT_MESSAGE }),
    ]);
  });
});

describe("aggregate overlap", () => {
  it("permits an aggregate beside an overlapping subgroup", () => {
    const total = cmp({ "Race/Ethnicity": "All", Sex: "Both Sexes", "Age Group": "All Ages" });
    const subgroup = cmp({
      "Race/Ethnicity": "Hispanic",
      Sex: "Female",
      "Age Group": "All Ages",
    });

    const { comparisons, issues } = addComparison([total], subgroup);

    // Comparing a subgroup with its own total is a normal, intentional request.
    expect(comparisons).toHaveLength(2);
    expect(issues.some((issue) => issue.level === "blocking")).toBe(false);

    // ...but the overlap has to be visible, because the two marks are not
    // independent and a reader who cannot tell will read the total as a peer.
    const overlap = overlapMetadata(comparisons, {
      dimensionRoles: {
        "Race/Ethnicity": { All: "aggregate", Hispanic: "component" },
        Sex: { "Both Sexes": "aggregate", Female: "component" },
      },
    });
    expect(overlap).toEqual([
      expect.objectContaining({
        comparisonId: subgroup.id,
        containedBy: [total.id],
      }),
    ]);
  });
});

describe("derived labels", () => {
  it("derives San Francisco Latina Women in schema order", () => {
    const [label] = resolveLabels(
      [
        cmp(
          { "Race/Ethnicity": "Hispanic", Sex: "Female", "Age Group": "All Ages" },
          { geography: "San Francisco" },
        ),
      ],
      { labelMeta: projectionsLabelMeta },
    ).map((c) => c.label);

    // Geography, race, sex, age - with "All Ages" omitted because it adds
    // nothing a reader needs.
    expect(label).toBe("San Francisco Latina Women");
  });

  it("omits aggregate values but keeps the dimensions that carry meaning", () => {
    const labels = resolveLabels(
      [
        cmp(
          { "Race/Ethnicity": "Hispanic", Sex: "Male", "Age Group": "All Ages" },
          { geography: "San Francisco" },
        ),
        cmp(
          { "Race/Ethnicity": "All", Sex: "Both Sexes", "Age Group": "0-4" },
          { geography: "San Francisco" },
        ),
      ],
      { labelMeta: projectionsLabelMeta },
    ).map((c) => c.label);

    expect(labels).toEqual(["San Francisco Latino Men", "San Francisco Ages 0-4"]);
  });

  it("disambiguates two otherwise identical labels", () => {
    // The same population from two vintages. Without the source, the legend
    // would show one name twice.
    const dof = cmp(
      { "Race/Ethnicity": "Hispanic", Sex: "Female", "Age Group": "All Ages" },
      { geography: "San Francisco", source: "DoF P-3" },
    );
    const census = cmp(
      { "Race/Ethnicity": "Hispanic", Sex: "Female", "Age Group": "All Ages" },
      { geography: "San Francisco", source: "Census cc-est" },
    );

    const labels = resolveLabels([dof, census], { labelMeta: projectionsLabelMeta }).map(
      (c) => c.label,
    );

    expect(labels).toEqual([
      "San Francisco Latina Women (DoF P-3)",
      "San Francisco Latina Women (Census cc-est)",
    ]);
    expect(new Set(labels).size).toBe(2);
  });

  it("lets a custom label win over the derived one", () => {
    const [resolved] = resolveLabels(
      [
        cmp(
          { "Race/Ethnicity": "Hispanic", Sex: "Female", "Age Group": "All Ages" },
          { geography: "San Francisco", customLabel: "SF Latinas" },
        ),
      ],
      { labelMeta: projectionsLabelMeta },
    );

    expect(resolved.label).toBe("SF Latinas");
    // The derived label stays available, so the editor can offer "reset".
    expect(resolved.derivedLabel).toBe("San Francisco Latina Women");
  });

  it("does not disambiguate labels that already differ", () => {
    const labels = resolveLabels(
      [
        cmp({ "Race/Ethnicity": "Hispanic", Sex: "Female" }, { geography: "San Francisco" }),
        cmp({ "Race/Ethnicity": "White", Sex: "Female" }, { geography: "San Francisco" }),
      ],
      { labelMeta: projectionsLabelMeta },
    ).map((c) => c.label);

    expect(labels).toEqual(["San Francisco Latina Women", "San Francisco White Women"]);
  });
});
