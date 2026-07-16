import { BUILDING_PERMITS_SCHEMA } from "./moduleSchemas/buildingPermits";
import { BYOD_SCHEMA } from "./moduleSchemas/byod";
import { COMPONENTS_OF_CHANGE_SCHEMA } from "./moduleSchemas/componentsOfChange";
import { DEMOGRAPHIC_PROJECTIONS_SCHEMA } from "./moduleSchemas/demographicProjections";
import { HOUSING_STRESS_SCHEMA } from "./moduleSchemas/housingStress";
import { POPHOUSING_SCHEMA } from "./moduleSchemas/pophousing";
import { RHNA_PROGRESS_SCHEMA } from "./moduleSchemas/rhnaProgress";

export const MODULE_SCHEMAS = Object.freeze({
  [POPHOUSING_SCHEMA.id]: POPHOUSING_SCHEMA,
  [COMPONENTS_OF_CHANGE_SCHEMA.id]: COMPONENTS_OF_CHANGE_SCHEMA,
  [DEMOGRAPHIC_PROJECTIONS_SCHEMA.id]: DEMOGRAPHIC_PROJECTIONS_SCHEMA,
  [HOUSING_STRESS_SCHEMA.id]: HOUSING_STRESS_SCHEMA,
  [BUILDING_PERMITS_SCHEMA.id]: BUILDING_PERMITS_SCHEMA,
  [RHNA_PROGRESS_SCHEMA.id]: RHNA_PROGRESS_SCHEMA,
});

// Registered data-module ids only — excludes the data-source-free "byod"
// (Visualization Tool) schema, which is not a `/[module]` route and must not
// appear in generateStaticParams or module listings.
export const MODULE_IDS = Object.freeze(Object.keys(MODULE_SCHEMAS));

// The standalone Visualization Tool schema. Imported directly by the
// /visualization-tool page and threaded through the wizard as the active
// schema; intentionally NOT resolvable via getModuleSchema so it never
// resolves as a `/[module]` route.
export { BYOD_SCHEMA };

export function getModuleSchema(moduleId) {
  return MODULE_SCHEMAS[moduleId];
}
