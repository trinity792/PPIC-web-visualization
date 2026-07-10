/**
 * Validation: the single enforcement point for main.md's "Sidebar behavior
 * rules" and "Most important guardrails".
 *
 * CLIENT-SAFE (no node:fs). Every function is pure and returns an array of
 * machine-readable findings the sidebar can surface:
 *
 *   { ok: false, level: "error" | "warn", code, message, suggestion? }
 *
 * `ok:true` findings are never produced (a clean result is an empty array); the
 * `ok` field exists so callers can filter uniformly. Errors block a render;
 * warnings recommend a better chart but still allow it.
 */

import {
  isMeasure,
  areComparable,
  allowedTransforms,
  supportsRole,
} from "./fieldTypes";
import { CATALOG_ROLE_FOR_BINDING, getChartType } from "./chartRegistry";
import { getPreset } from "./presetRegistry";

const err = (code, message, suggestion) => ({ ok: false, level: "error", code, message, suggestion });
const warn = (code, message, suggestion) => ({ ok: false, level: "warn", code, message, suggestion });

/**
 * Required roles present; each bound field's kind matches the role's constraint.
 * Implements "Changes chart type → revalidate all field bindings against the new
 * chart's required roles."
 */
export function validateBindings(chartTypeId, bindings = {}, schema, { schemaFields = true } = {}) {
  const chart = getChartType(chartTypeId);
  if (!chart) return [err("UNKNOWN_CHART_TYPE", `Unknown chart type: ${chartTypeId}`)];
  const findings = [];

  for (const role of chart.requiredRoles) {
    if (!bindings[role]) {
      findings.push({
        ...err("MISSING_REQUIRED_ROLE", `"${role}" is required for a ${chart.label} chart.`),
        role,
      });
    }
  }

  // Inline ("your data") bindings name table columns, not module schema fields,
  // so the field-existence/kind checks below don't apply — validateInlineBindings
  // covers column existence instead. The role/structure checks still run.
  for (const [role, fieldName] of schemaFields ? Object.entries(bindings) : []) {
    if (!fieldName) continue;
    const field = schema?.fields?.[fieldName];
    if (!field) {
      findings.push(err("UNKNOWN_FIELD", `Field "${fieldName}" is not in this module.`));
      continue;
    }
    const accepted = chart.roleConstraints[role];
    if (accepted && !accepted.includes(field.kind)) {
      findings.push(
        err(
          "ROLE_KIND_MISMATCH",
          `"${fieldName}" (${field.kind}) can't be used as "${role}" on a ${chart.label} chart.`,
          `"${role}" accepts: ${accepted.join(", ")}.`,
        ),
      );
    }
    const catalogRole = CATALOG_ROLE_FOR_BINDING[role];
    if (
      isMeasure(field) &&
      catalogRole &&
      Array.isArray(field.chartRoles) &&
      !supportsRole(field, catalogRole)
    ) {
      findings.push(
        err(
          "FIELD_ROLE_NOT_SUPPORTED",
          `"${fieldName}" cannot be used as "${role}".`,
          "Choose a field whose catalog allows this encoding.",
        ),
      );
    }
  }

  // Dumbbell/slope: both endpoints must be the same metric across two periods.
  // This is a module concept (one metric, two years). Bring-your-own-data binds
  // two distinct columns (e.g. Lower Bound / Upper Bound) by design, so it's
  // skipped in inline mode (schemaFields === false).
  if (schemaFields && chart.sameMetricBothEnds && bindings.start && bindings.end && bindings.start !== bindings.end) {
    findings.push(
      err(
        "SAME_METRIC_REQUIRED",
        `A ${chart.label} chart must use the same metric at both ends.`,
        "Pick one metric and two periods, not two metrics.",
      ),
    );
  }

  return findings;
}

/**
 * Block incompatible measures from sharing one value axis. Two measures may share
 * an axis only when their `comparisonGroup` matches (e.g. population vs vacancy
 * rate is disallowed). Implements main.md's "same-axis allowed?" table + the
 * "Adds a new measure → checks unit and semantic compatibility" rule.
 *
 * @param {string[]} measureNames field names expected to occupy the same axis
 */
export function validateComparability(measureNames = [], schema) {
  const fields = measureNames
    .map((name) => ({ name, field: schema?.fields?.[name] }))
    .filter((m) => m.field && isMeasure(m.field));
  if (fields.length < 2) return [];

  const findings = [];
  const base = fields[0];
  for (let i = 1; i < fields.length; i += 1) {
    if (!areComparable(base.field, fields[i].field)) {
      findings.push(
        warn(
          "INCOMPATIBLE_AXIS_MEASURES",
          `"${base.name}" and "${fields[i].name}" aren't comparable on the same axis.`,
          "Use a scatter plot, indexed trend, or faceted small multiples instead.",
        ),
      );
    }
  }
  return findings;
}

/** The measures that land on a single shared value axis for this chart/config. */
function measuresOnValueAxis(chart, bindings, layers, schema) {
  if (chart.allowsIncomparableAxes) return []; // scatter/bubble axes are independent
  const names = [];
  if (bindings.y && isMeasure(schema?.fields?.[bindings.y])) names.push(bindings.y);
  for (const layer of layers || []) {
    if (layer.type === "secondMeasure" && layer.y) names.push(layer.y);
  }
  return [...new Set(names)];
}

const SUPPORTED_LAYER_TYPES = new Set([
  "selectedPlaces",
  "benchmark",
  "secondSource",
  "secondMeasure",
  "referenceValue",
  "derivedComparison",
]);

/**
 * Trace layers are constrained configuration, never arbitrary Plotly traces.
 * In particular, second measures must share a comparison group with the primary
 * y measure and second-source layers only exist for multi-source modules.
 */
export function validateLayers(layers = [], bindings = {}, schema) {
  const findings = [];
  const primary = schema?.fields?.[bindings.y];

  for (const layer of layers) {
    if (!SUPPORTED_LAYER_TYPES.has(layer.type)) {
      findings.push(
        err(
          "UNSUPPORTED_LAYER_TYPE",
          `Layer type "${layer.type}" is not supported.`,
          "Use one of the predefined layer types.",
        ),
      );
      continue;
    }

    if (layer.type === "secondSource" && !schema?.sources?.length) {
      findings.push(
        err(
          "SECOND_SOURCE_UNAVAILABLE",
          "A second-source layer is only valid for a multi-source module.",
        ),
      );
    }

    if (layer.type === "secondMeasure") {
      const secondary = schema?.fields?.[layer.y];
      if (!primary || !secondary || !isMeasure(secondary)) {
        findings.push(
          err(
            "SECOND_MEASURE_REQUIRED",
            "A second-measure layer must reference a measure in this module.",
          ),
        );
      } else if (!areComparable(primary, secondary)) {
        findings.push(
          err(
            "INCOMPATIBLE_SECOND_MEASURE",
            `"${bindings.y}" and "${layer.y}" cannot share an axis.`,
            "Use an indexed trend, scatter plot, or faceted small multiples.",
          ),
        );
      }
    }

    if (
      layer.type === "derivedComparison" &&
      layer.transform &&
      !allowedTransforms(primary).includes(layer.transform)
    ) {
      findings.push(
        err(
          "LAYER_TRANSFORM_NOT_ALLOWED",
          `"${layer.transform}" is not valid for "${bindings.y}".`,
          "Choose a transform allowed by the field catalog.",
        ),
      );
    }
  }

  return findings;
}

export function validateTransform(transform, bindings = {}, schema) {
  if (!transform || transform === "actual") return [];
  const measureName =
    bindings.y || bindings.color || bindings.start || bindings.x;
  const field = schema?.fields?.[measureName];
  if (!field || allowedTransforms(field).includes(transform)) return [];
  return [
    err(
      "TRANSFORM_NOT_ALLOWED",
      `"${transform}" is not valid for "${measureName}".`,
      "Choose one of the transforms allowed by the field catalog.",
    ),
  ];
}

export function validatePresetBindings(presetId, bindings = {}) {
  const preset = getPreset(presetId);
  if (!preset) {
    return [err("UNKNOWN_PRESET", `Unknown preset: ${presetId}`)];
  }
  return (preset.requiredRoles || [])
    .filter((role) => !bindings[role])
    .map((role) => ({
      ...err(
        "MISSING_PRESET_ROLE",
        `"${role}" is required by the ${preset.title} preset.`,
      ),
      role,
    }));
}

/**
 * Recommend a better chart when too many (or too few) categories/series are in
 * play. Implements "Selects too many categories → recommends a different chart
 * type, faceting, or a filtered subset" and the per-chart limits.
 *
 * @param {number} seriesCount number of series/categories after filtering
 */
export function validateComplexity(chartTypeId, seriesCount) {
  const chart = getChartType(chartTypeId);
  if (!chart || typeof seriesCount !== "number") return [];
  const { limits = {} } = chart;
  const findings = [];

  if (limits.maxRows && seriesCount > limits.maxRows) {
    findings.push(
      warn(
        "TOO_MANY_ROWS",
        `${seriesCount} rows exceeds the recommended ${limits.maxRows} for a heatmap.`,
        "Add search, a Top N filter, or a smaller subset.",
      ),
    );
  }
  if (limits.recommendTopN && seriesCount > limits.recommendTopN) {
    findings.push(
      warn(
        "RECOMMEND_TOP_N",
        `${seriesCount} categories is a lot for a bar chart.`,
        `Switch to a horizontal ranking and limit to Top ${limits.recommendTopN}.`,
      ),
    );
  }
  if (limits.maxCategories && seriesCount > limits.maxCategories) {
    findings.push(
      warn(
        "TOO_MANY_CATEGORIES",
        `${seriesCount} categories exceeds the recommended ${limits.maxCategories} for a ${chart.label} chart.`,
        "Filter to the most relevant places.",
      ),
    );
  }
  if (limits.minCategories && seriesCount > 0 && seriesCount < limits.minCategories) {
    findings.push(
      warn(
        "TOO_FEW_CATEGORIES",
        `A ${chart.label} chart works best with at least ${limits.minCategories} categories.`,
      ),
    );
  }
  return findings;
}

// Transforms whose meaning depends on a base year (flagged issue 4).
const BASE_YEAR_TRANSFORMS = new Set([
  "indexed",
  "numericChange",
  "percentChange",
  "percentagePointChange",
]);

/**
 * A base year that sits outside the selected period window is nearly always a
 * mistake (e.g. indexing to a year the chart doesn't display). Only fires
 * when both `period.startYear` and `period.endYear` are numbers — an
 * unbounded period has no window to validate against.
 *
 * @param {object} config { transform, period }
 */
export function validateBaseYear(config) {
  const transform = config?.transform;
  if (!BASE_YEAR_TRANSFORMS.has(transform)) return [];

  const baseYear = config?.period?.baseYear;
  const { startYear, endYear } = config?.period || {};
  if (typeof baseYear !== "number") return [];
  if (typeof startYear !== "number" || typeof endYear !== "number") return [];
  if (baseYear >= startYear && baseYear <= endYear) return [];

  return [
    warn(
      "BASE_YEAR_OUT_OF_RANGE",
      `Base year ${baseYear} is outside the selected period (${startYear}–${endYear}).`,
      "Move the base year inside the period, or widen the period to include it.",
    ),
  ];
}

/**
 * Surface (rather than silently drop) location names a geographic join
 * couldn't match to a boundary — the data layer already filtered them out of
 * the records; this just tells the user what fell out (flagged issue 3).
 *
 * @param {string[]} geoUnmatched location names that failed the geo join
 */
export function validateGeoUnmatched(geoUnmatched = []) {
  if (!geoUnmatched.length) return [];
  const shown = geoUnmatched.slice(0, 5);
  const remainder = geoUnmatched.length - shown.length;
  const names = shown.join(", ") + (remainder > 0 ? `, and ${remainder} more` : "");
  return [
    warn(
      "GEO_JOIN_UNMATCHED",
      `${geoUnmatched.length} location${geoUnmatched.length === 1 ? "" : "s"} could not be matched to a geographic boundary: ${names}.`,
      "Check for a name mismatch between the data and the county boundaries.",
    ),
  ];
}

/**
 * No silent geographic-level mixing; no silent source comparison. Components of
 * Change keeps DoF and Census side-by-side, so a deliberate source choice is
 * required (guardrail #6). Choropleth requires a single geographic level
 * (guardrail #5).
 *
 * @param {object} config { chartType, filters, comparisonMode }
 */
export function validateGeographyAndSource(config, schema) {
  const findings = [];
  const chart = getChartType(config.chartType);
  const filters = config.filters || {};

  if (schema?.sources && !filters.source && config.comparisonMode !== "sources") {
    findings.push(
      err(
        "SOURCE_REQUIRED",
        `${schema.label} keeps ${schema.sources.join(" and ")} side by side; choose one.`,
        "Pick a source, or switch on source-comparison mode.",
      ),
    );
  }

  if (chart?.limits?.oneGeographicLevel && !filters.subset) {
    findings.push(
      err(
        "GEO_LEVEL_REQUIRED",
        `A ${chart.label} can only show one geographic level at a time.`,
        "Choose a geographic subset (e.g. Counties).",
      ),
    );
  }

  return findings;
}

/**
 * Every binding referenced by the active chart type (required or optional)
 * must name a column that actually exists in the inline table — inline
 * ("your data") bindings name table columns, not module schema fields, so
 * this is the inline-mode counterpart to validateBindings' "does this field
 * exist" half. Only meaningful when `config.data?.source === "inline"`
 * (wired into validateConfig below); unbound roles are skipped.
 *
 * @param {object} config { chartType, bindings }
 * @param {object} table  the inline table ({ columns, rows })
 */
export function validateInlineBindings(config, table) {
  const chart = getChartType(config?.chartType);
  if (!chart || !table) return [];
  const columnNames = new Set((table.columns || []).map((column) => column.name));
  const bindings = config?.bindings || {};
  const roles = [...chart.requiredRoles, ...chart.optionalRoles];

  const findings = [];
  for (const role of roles) {
    const columnName = bindings[role];
    if (!columnName || columnNames.has(columnName)) continue;
    findings.push({
      ...err(
        "INLINE_BINDING_MISSING",
        `"${columnName}" (bound to "${role}") is not a column in your data.`,
        "Choose a column from your uploaded or pasted table, or re-bind this role.",
      ),
      role,
    });
  }
  return findings;
}

/**
 * Run every validator for a config and return a flat, de-duplicated finding list.
 * This is what the chart-config reducer calls on each change.
 *
 * @param {object} config  { chartType, bindings, filters, comparisonMode, layers }
 * @param {object} schema  the active module schema
 * @param {object} [opts]  { seriesCount, geoUnmatched }
 */
export function validateConfig(config, schema, opts = {}) {
  if (!config || !config.chartType) return [];
  const chart = getChartType(config.chartType);
  const bindings = config.bindings || {};
  const isInline = config.data?.source === "inline";

  // In inline ("your data") mode the active module schema no longer describes
  // the data, so the schema-coupled validators (field existence/kind,
  // module source/geo-subset requirements, cross-measure comparability) don't
  // apply and would false-positive on every inline binding. They're replaced
  // by validateInlineBindings' column-existence check; the schema-independent
  // structural checks (required roles, same-metric, transform, base year) run
  // in both modes.
  const findings = [
    ...validateBindings(config.chartType, bindings, schema, { schemaFields: !isInline }),
    ...validatePresetBindings(config.preset, bindings),
    ...(chart && !isInline
      ? validateComparability(measuresOnValueAxis(chart, bindings, config.layers, schema), schema)
      : []),
    ...validateLayers(config.layers, bindings, schema),
    ...validateTransform(config.transform, bindings, schema),
    ...(isInline ? [] : validateGeographyAndSource(config, schema)),
    ...validateBaseYear(config),
  ];
  if (isInline) {
    findings.push(...validateInlineBindings(config, config.data.inline));
  }
  if (typeof opts.seriesCount === "number") {
    findings.push(...validateComplexity(config.chartType, opts.seriesCount));
  }
  if (opts.geoUnmatched?.length) {
    findings.push(...validateGeoUnmatched(opts.geoUnmatched));
  }

  // De-dup by code+message so repeated bindings don't spam identical notices.
  const seen = new Set();
  return findings.filter((f) => {
    const key = `${f.code}|${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Convenience: are there any blocking (error-level) findings? */
export function hasBlockingErrors(findings = []) {
  return findings.some((f) => f.level === "error");
}
