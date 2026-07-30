/**
 * impliedRoles.js — the field a chart type infers for a role instead of asking
 * for it.
 *
 * CLIENT-SAFE (no node:fs), matching chartRegistry.js's constraint.
 *
 * A chart type may declare a role as **implied** (`CHART_TYPES[id].impliedRoles`,
 * chartRegistry.js) rather than bound: a line's `x` is always the schema's one
 * temporal field, and a bar's `category` is always its geography field. Resolving
 * is strict and takes a chart-type id rather than a config, because
 * `validateBindings(chartTypeId, bindings, schema)` has no config to pass, and a
 * resolver keyed on config would be a second, divergent copy of this logic.
 *
 * Omitting rather than guessing is the contract: a role the resolver cannot
 * answer (zero or ambiguous candidates) is left out of the returned object
 * entirely, so it stays a real dropdown and stays validated. That is what makes
 * bring-your-own-data (no temporal field, no geography field) fall through with
 * no special case, and what protects a future module with no geography.
 */

import { getChartType } from "./chartRegistry";
import { FIELD_KINDS } from "./fieldTypes";

/** Resolvers keyed by the `impliedRoles` source name on a chart descriptor. */
const RESOLVERS = {
  temporal(schema) {
    const named = schema?.temporalField;
    if (named && schema?.fields?.[named]?.kind === FIELD_KINDS.TEMPORAL) {
      return named;
    }
    const candidates = Object.entries(schema?.fields || {}).filter(
      ([, field]) => field.kind === FIELD_KINDS.TEMPORAL,
    );
    return candidates.length === 1 ? candidates[0][0] : null;
  },
  geography(schema) {
    const named = schema?.geographyField ?? "Location";
    return schema?.fields?.[named] ? named : null;
  },
};

/** The field a chart type implies for a role, or {} when nothing resolves. */
export function impliedBindings(chartTypeId, schema) {
  const chart = getChartType(chartTypeId);
  const declared = chart?.impliedRoles || {};
  const result = {};
  for (const [role, source] of Object.entries(declared)) {
    const field = RESOLVERS[source]?.(schema);
    if (!field) continue;
    const accepted = chart.roleConstraints[role] || [];
    if (!accepted.includes(schema?.fields?.[field]?.kind)) continue;
    result[role] = field;
  }
  return result;
}

/** Does this chart type declare this role as implied? Descriptor-only. */
export function isImpliedRole(chartTypeId, role) {
  return Boolean(getChartType(chartTypeId)?.impliedRoles?.[role]);
}

/** The sentence the sidebar prints in place of the missing dropdown. */
export function impliedRoleHint(role, config, schema) {
  const fieldName = impliedBindings(config?.chartType, schema)[role];
  const field = schema?.fields?.[fieldName];
  const label = field?.label || fieldName || role;

  if (role === "x") {
    return `Plotted against ${label}, set in Date Range`;
  }

  const lowerLabel = label.charAt(0).toLowerCase() + label.slice(1);
  const subset = config?.filters?.subset;
  return subset
    ? `One bar per ${lowerLabel} in ${subset}, set in Geographic Level`
    : `One bar per ${lowerLabel}, set in Geographic Level`;
}
