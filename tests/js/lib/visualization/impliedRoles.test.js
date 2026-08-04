/**
 * Tests for lib/visualization/impliedRoles.js — Workstream A's resolver.
 * Omitting rather than guessing is the contract under test throughout.
 */

import { describe, expect, it } from "vitest";

import {
  impliedBindings,
  impliedRoleHint,
  isImpliedRole,
} from "@/lib/visualization/impliedRoles";
import { BYOD_SCHEMA, MODULE_SCHEMAS } from "@/lib/visualization/moduleRegistry";

describe("impliedBindings", () => {
  it("resolves the temporal field on every module schema for a line chart", () => {
    for (const schema of Object.values(MODULE_SCHEMAS)) {
      const implied = impliedBindings("line", schema);
      expect(implied.x, `module: ${schema.id}`).toBeTruthy();
      expect(schema.fields[implied.x].kind, `module: ${schema.id}`).toBe("temporal");
    }
  });

  it("resolves Location on every module schema for a bar chart", () => {
    for (const schema of Object.values(MODULE_SCHEMAS)) {
      expect(impliedBindings("bar", schema).category, `module: ${schema.id}`).toBe(
        "Location",
      );
    }
  });

  it("returns {} for the bring-your-own-data schema", () => {
    expect(impliedBindings("bar", BYOD_SCHEMA)).toEqual({});
    expect(impliedBindings("line", BYOD_SCHEMA)).toEqual({});
  });

  it("omits an ambiguous temporal field", () => {
    const schema = {
      fields: {
        Year: { kind: "temporal", label: "Year" },
        Month: { kind: "temporal", label: "Month" },
      },
    };
    expect(impliedBindings("line", schema)).toEqual({});
  });

  it("omits a role a chart type does not declare as implied", () => {
    const schema = { fields: { Location: { kind: "dimension", label: "Location" } } };
    expect(impliedBindings("forest", schema)).toEqual({});
  });

  it("honors an explicit schema.temporalField over a same-kind ambiguity", () => {
    const schema = {
      temporalField: "Snapshot Date",
      fields: {
        "Snapshot Date": { kind: "temporal", label: "Snapshot date" },
        "Other Date": { kind: "temporal", label: "Other date" },
      },
    };
    expect(impliedBindings("line", schema).x).toBe("Snapshot Date");
  });
});

describe("isImpliedRole", () => {
  it("is descriptor-only, independent of any schema", () => {
    expect(isImpliedRole("line", "x")).toBe(true);
    expect(isImpliedRole("bar", "category")).toBe(true);
    expect(isImpliedRole("line", "y")).toBe(false);
    expect(isImpliedRole("forest", "category")).toBe(false);
  });
});

describe("impliedRoleHint", () => {
  it("names the temporal field and Date Range for x", () => {
    const schema = { fields: { Year: { kind: "temporal", label: "Year" } } };
    const hint = impliedRoleHint("x", { chartType: "line" }, schema);
    expect(hint).toBe("Plotted against Year, set in Date Range");
  });

  it("names the geography field, the subset, and Geographic Level for category", () => {
    const schema = {
      fields: { Location: { kind: "dimension", label: "Jurisdiction" } },
    };
    const hint = impliedRoleHint(
      "category",
      { chartType: "bar", filters: { subset: "Counties" } },
      schema,
    );
    expect(hint).toBe("One bar per jurisdiction in Counties, set in Geographic Level");
  });
});
