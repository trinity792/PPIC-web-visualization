import { expect, it } from "vitest";
import { input } from "@/tests/fixtures/visualization-v3/renderer";

import { buildForestModel } from "@/lib/visualization/models/forestModel";
it("preserves the estimate and interval endpoints", () => expect(buildForestModel(input("forest")).rows[0]).toMatchObject({ estimate: 50000, lower: 40000, upper: 60000 }));
it("centers the value axis on the chosen value", () => {
  const domain = buildForestModel(input("forest", { appearance: { center: 45000 } })).valueAxis.domain;
  expect((domain[0]+domain[1])/2).toBe(45000);
  expect(domain[0]).toBeLessThanOrEqual(40000);
  expect(domain[1]).toBeGreaterThanOrEqual(60000);
});
it.each([0, 1, null])("draws the line of no effect at the chosen value: %s", noEffectValue => expect(buildForestModel(input("forest", { appearance: { noEffectValue } })).referenceLine).toEqual(noEffectValue === null ? null : { value: noEffectValue }));
it("hides the line of no effect when no value is set", () => expect(buildForestModel(input("forest")).referenceLine).toBeNull());
