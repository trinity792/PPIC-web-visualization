import { expect, it } from "vitest";
import { citeSources } from "@/lib/visualization/datasetLabels";
import { DEMOGRAPHIC_PROJECTIONS_SCHEMA } from "@/lib/visualization/moduleSchemas/demographicProjections";
import { BUILDING_PERMITS_SCHEMA } from "@/lib/visualization/moduleSchemas/buildingPermits";
import { POPHOUSING_SCHEMA } from "@/lib/visualization/moduleSchemas/pophousing";
it("cites the topic's dataset instead of the Source filter value", () => {
  expect(citeSources([{ source: "DoF P-3" }, { source: "DoF P-3" }], DEMOGRAPHIC_PROJECTIONS_SCHEMA.sourceCitations))
    .toEqual(["California Department of Finance (DOF), P-3 Population Projections"]);
});
it("lists each dataset drawn once, in the order the data first uses it", () => {
  expect(citeSources([{ source: "E-8" }, { source: "E-5" }, { source: "E-8" }], POPHOUSING_SCHEMA.sourceCitations)).toEqual([
    "California Department of Finance (DOF), E-8 Historical Population and Housing Estimates",
    "California Department of Finance (DOF), E-5 Population and Housing Estimates",
  ]);
});
it("uses the topic's default citation when rows carry only the topic name", () => {
  expect(citeSources([{ source: "Building Permits" }], BUILDING_PERMITS_SCHEMA.sourceCitations))
    .toEqual(["US Census Bureau, Building Permits Survey (BPS)"]);
});
it("shows an uncited source as it is rather than dropping it", () => {
  expect(citeSources([{ source: "Pasted data" }], null)).toEqual(["Pasted data"]);
  expect(citeSources([{ source: "" }, {}], null)).toEqual([]);
});
