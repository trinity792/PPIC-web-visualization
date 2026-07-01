import { COMPONENTS_OF_CHANGE_SCHEMA } from "./moduleSchemas/componentsOfChange";
import { DEMOGRAPHIC_PROJECTIONS_SCHEMA } from "./moduleSchemas/demographicProjections";
import { POPHOUSING_SCHEMA } from "./moduleSchemas/pophousing";

export const MODULE_SCHEMAS = Object.freeze({
  [POPHOUSING_SCHEMA.id]: POPHOUSING_SCHEMA,
  [COMPONENTS_OF_CHANGE_SCHEMA.id]: COMPONENTS_OF_CHANGE_SCHEMA,
  [DEMOGRAPHIC_PROJECTIONS_SCHEMA.id]: DEMOGRAPHIC_PROJECTIONS_SCHEMA,
});

export const MODULE_IDS = Object.freeze(Object.keys(MODULE_SCHEMAS));

export function getModuleSchema(moduleId) {
  return MODULE_SCHEMAS[moduleId];
}
