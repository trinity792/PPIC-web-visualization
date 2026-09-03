import {
  selectProjectionRows,
  SUBSET_TO_LEVELS as PROJECTION_LEVELS,
} from "@/lib/data/demographic_projections";
import {
  loadComponentsOfChangeData,
  SUBSET_TO_LEVELS as CHANGE_LEVELS,
} from "@/lib/data/components_of_change";
import { getFeatureIdLookup } from "@/lib/data/geography";
import {
  DEMOGRAPHIC_PROJECTIONS_SCHEMA,
} from "@/lib/visualization/moduleSchemas/demographicProjections";
import {
  COMPONENTS_OF_CHANGE_SCHEMA,
} from "@/lib/visualization/moduleSchemas/componentsOfChange";
import { POPHOUSING_SCHEMA } from "@/lib/visualization/moduleSchemas/pophousing";
import { HOUSING_STRESS_SCHEMA } from "@/lib/visualization/moduleSchemas/housingStress";
import { BUILDING_PERMITS_SCHEMA } from "@/lib/visualization/moduleSchemas/buildingPermits";
import { RHNA_PROGRESS_SCHEMA } from "@/lib/visualization/moduleSchemas/rhnaProgress";
import { queryFullTable as queryPopHousingTable } from "@/lib/data/pop_housing";
import { queryFullTable as queryHousingStressTable } from "@/lib/data/housing_stress";
import { queryFullTable as queryBuildingPermitsTable } from "@/lib/data/building_permits";
import { queryFullTable as queryRhnaProgressTable } from "@/lib/data/rhna_progress";
import { ISSUE_LEVELS, createIssue } from "@/lib/visualization/observationContract";
import { resolveLabels } from "@/lib/visualization/comparisons";

let countyIds;
async function geographyId(location, subset) {
  if (subset !== "Counties") return location;
  countyIds ||= await getFeatureIdLookup("counties");
  return countyIds.get(location) || location;
}

const blocking = (code, message) =>
  createIssue({ code, level: ISSUE_LEVELS.BLOCKING, message });
const comparisonIssue = (code, comparisonId, message) =>
  createIssue({ code, level: ISSUE_LEVELS.COMPARISON, comparisonId, message });

function sourceKind(year) {
  return year > 2025 ? "projected" : "observed";
}

function collapseProjectionRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.Location}|${row.Year}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map((members) => {
    const unavailable = members.filter((row) => !Number.isFinite(row.Population));
    return {
      ...members[0],
      Population: unavailable.length
        ? null
        : members.reduce((sum, row) => sum + row.Population, 0),
      status: unavailable.length ? "missing" : "available",
    };
  });
}

export const projectionsAdapter = Object.freeze({
  id: "projections",
  datasetIds: Object.freeze(["projections", "demographic-projections"]),
  measure(measureId) {
    if (measureId !== "Population") return null;
    const field = DEMOGRAPHIC_PROJECTIONS_SCHEMA.fields.Population;
    return {
      id: "Population",
      label: field.label,
      unit: field.unit,
      aggregation: field.aggregation,
      calculations: [
        ...field.transforms,
        "benchmarkDifference",
        "ranking",
        "averageSelectedYears",
      ],
    };
  },
  availablePeriods() {
    return DEMOGRAPHIC_PROJECTIONS_SCHEMA.time.availablePeriods;
  },
  defaultReportingPeriod() {
    return DEMOGRAPHIC_PROJECTIONS_SCHEMA.time.defaultReportingPeriod;
  },
  valueKindForPeriod(period) {
    return sourceKind(period);
  },
  comparisonLabel(question, comparison) {
    return resolveLabels(
      [{
        ...comparison,
        // Geography is a structured override in v3. Trace presentation owns
        // composing its location label with the demographic label; passing the
        // object to the generic label resolver would stringify it as
        // "[object Object]" and then repeat the location in the legend.
        geography: undefined,
        source: comparison.source || question.source,
      }],
      { labelMeta: DEMOGRAPHIC_PROJECTIONS_SCHEMA.labelMeta },
    )[0].label;
  },
  validateQuestion(question) {
    if (!DEMOGRAPHIC_PROJECTIONS_SCHEMA.sources.includes(question.source)) {
      return [blocking("invalidSource", "Select a valid projections source.")];
    }
    return [];
  },
  validateComparison({ question, comparison }) {
    const geography = comparison.geography || question.geography;
    const source = comparison.source || question.source;
    const missing = DEMOGRAPHIC_PROJECTIONS_SCHEMA.comparisonDimensions
      .filter((dimension) => {
        const value = comparison.dimensions?.[dimension.id];
        return value == null || value === "" || (Array.isArray(value) && !value.length);
      })
      .map((dimension) =>
        dimension.label || DEMOGRAPHIC_PROJECTIONS_SCHEMA.fields[dimension.id]?.label || dimension.id,
      );
    if (missing.length) {
      return [
        comparisonIssue(
          "incompleteComparison",
          comparison.id,
          `Select ${missing.join(", ")} for this comparison.`,
        ),
      ];
    }
    if (geography.subset === "US States" && source !== "Census cc-est") {
      return [
        comparisonIssue(
          "invalidSourceForSubset",
          comparison.id,
          "US States are only available from Census cc-est.",
        ),
      ];
    }
    if (geography.subset !== "US States" && source !== "DoF P-3") {
      return [
        comparisonIssue(
          "invalidSourceForSubset",
          comparison.id,
          "California geographies are only available from DoF P-3.",
        ),
      ];
    }
    return [];
  },
  async select({ question, comparison, periods }) {
    const geography = comparison.geography || question.geography;
    const source = comparison.source || question.source;
    const levels = PROJECTION_LEVELS[geography.subset] || [];
    const locations = geography.locations || [];
    const dimensions = comparison.dimensions || {};
    const rows = await selectProjectionRows({ levels, source, locations, periods, dimensions });
    return Promise.all(
      collapseProjectionRows(rows).map(async (row) => ({
        period: row.Year,
        geographyId: await geographyId(row.Location, geography.subset),
        geographyLabel: row.Location,
        categoryId: null,
        categoryLabel: null,
        value: row.Population,
        status: row.status,
        valueKind: sourceKind(row.Year),
        source: row.Source,
      })),
    );
  },
});

function aggregationFor(field) {
  if (/rate|percent/i.test(field.unit || "")) return "weightedMean";
  return "sum";
}

export const componentsOfChangeAdapter = Object.freeze({
  id: "components-of-change",
  datasetIds: Object.freeze(["components-of-change"]),
  measure(measureId) {
    const field = COMPONENTS_OF_CHANGE_SCHEMA.fields[measureId];
    if (!field || field.kind !== "measure") return null;
    return {
      id: measureId,
      label: field.label,
      unit: field.unit,
      aggregation: aggregationFor(field),
      weightField: /rate|percent/i.test(field.unit || "") ? "Total Population" : undefined,
      calculations: [...field.transforms, "benchmarkDifference", "ranking"],
    };
  },
  availablePeriods() {
    return COMPONENTS_OF_CHANGE_SCHEMA.time.availablePeriods;
  },
  defaultReportingPeriod() {
    return COMPONENTS_OF_CHANGE_SCHEMA.time.defaultReportingPeriod;
  },
  comparisonLabel(question, comparison) {
    const geography = comparison.geography || question.geography;
    if (comparison.customLabel) return comparison.customLabel;
    if (geography?.locations?.length === 1) return geography.locations[0];
    return comparison.label || "Selected locations";
  },
  validateQuestion(question) {
    if (!COMPONENTS_OF_CHANGE_SCHEMA.sources.includes(question.source)) {
      return [blocking("invalidSource", "Select a valid Components of Change source.")];
    }
    return [];
  },
  validateComparison({ question, comparison }) {
    const geography = comparison.geography || question.geography;
    const source = comparison.source || question.source;
    if (geography.subset === "States" && source !== "Census") {
      return [
        comparisonIssue(
          "invalidSourceForSubset",
          comparison.id,
          "States are only available from Census.",
        ),
      ];
    }
    return [];
  },
  async select({ question, comparison, measure, periods }) {
    const geography = comparison.geography || question.geography;
    const source = comparison.source || question.source;
    const levels = CHANGE_LEVELS[geography.subset] || [];
    const locations = geography.locations || [];
    const rows = (await loadComponentsOfChangeData()).filter(
      (row) =>
        levels.includes(row["Geographic Level"]) &&
        row.Source === source &&
        periods.includes(row.Year) &&
        (!locations.length || locations.includes(row.Location)),
    );
    return Promise.all(
      rows.map(async (row) => {
        const value = row[measure.id];
        return {
          period: row.Year,
          geographyId: await geographyId(row.Location, geography.subset),
          geographyLabel: row.Location,
          categoryId: null,
          categoryLabel: null,
          value,
          status: Number.isFinite(value) ? "available" : "missing",
          valueKind: "observed",
          source: row.Source,
        };
      }),
    );
  },
});

function genericModuleAdapter(schema, loadTable) {
  const periodColumn =
    schema.temporalColumn ||
    schema.temporalField ||
    Object.entries(schema.fields || {}).find(([, field]) => field.kind === "temporal")?.[0] ||
    null;
  let recordsPromise;
  const records = async () => {
    recordsPromise ||= Promise.resolve(loadTable({ full: true })).then(
      (result) => result.records || [],
    );
    return recordsPromise;
  };
  const periods = async () => {
    if (!periodColumn) return [null];
    return [...new Set((await records()).map((row) => row[periodColumn]).filter(Boolean))].sort(
      (a, b) =>
        typeof a === "number" && typeof b === "number"
          ? a - b
          : String(a).localeCompare(String(b), undefined, { numeric: true }),
    );
  };
  return Object.freeze({
    id: schema.id,
    measure(measureId) {
      const field = schema.fields?.[measureId];
      if (!field || field.kind !== "measure") return null;
      return {
        id: measureId,
        label: field.label || measureId,
        unit: field.unit || "number",
        aggregation: field.aggregation || "notAllowed",
        calculations: field.calculations || field.transforms || ["actual"],
      };
    },
    async availablePeriods() {
      return periods();
    },
    async defaultReportingPeriod() {
      return (await periods()).at(-1) ?? null;
    },
    comparisonLabel(question, comparison) {
      if (comparison.customLabel) return comparison.customLabel;
      const geography = comparison.geography || question.geography;
      const place = geography?.locations?.length === 1 ? geography.locations[0] : null;
      const values = Object.values(comparison.dimensions || {}).flat().filter(Boolean);
      return [place, ...values].filter(Boolean).join(" ") || "Selected locations";
    },
    validateQuestion(question) {
      if (question.dataset?.moduleId !== schema.id) {
        return [blocking("datasetMismatch", `This route answers ${schema.label}.`)];
      }
      return [];
    },
    validateComparison() {
      return [];
    },
    async select({ question, comparison, measure, periods }) {
      const geography = comparison.geography || question.geography;
      const locations = geography?.locations || [];
      const levels = schema.subsets?.[geography?.subset] || [];
      const dimensions = comparison.dimensions || {};
      const rows = (await records()).filter((row) => {
        const location = row.Location || row.Jurisdiction || row.Region;
        const period = periodColumn ? row[periodColumn] : null;
        const source = comparison.source || question.source;
        return (
          (!locations.length || locations.includes(location)) &&
          (!levels.length || levels.includes(row["Geographic Level"])) &&
          (periods.includes(null) || periods.includes(period)) &&
          (!source || row.Source == null || row.Source === source) &&
          Object.entries(dimensions).every(([key, value]) =>
            Array.isArray(value) ? value.includes(row[key]) : row[key] === value,
          )
        );
      });
      return Promise.all(rows.map(async (row) => {
        const location = row.Location || row.Jurisdiction || row.Region || "All";
        const period = periodColumn ? row[periodColumn] : null;
        const value = row[measure.id];
        return {
          period,
          geographyId: await geographyId(location, geography?.subset),
          geographyLabel: location,
          categoryId: null,
          categoryLabel: null,
          value,
          status: Number.isFinite(value) ? "available" : "missing",
          valueKind: "observed",
          source: row.Source || question.source || schema.label,
        };
      }));
    },
  });
}

export const pophousingAdapter = genericModuleAdapter(POPHOUSING_SCHEMA, queryPopHousingTable);
export const housingStressAdapter = genericModuleAdapter(HOUSING_STRESS_SCHEMA, queryHousingStressTable);
export const buildingPermitsAdapter = genericModuleAdapter(BUILDING_PERMITS_SCHEMA, queryBuildingPermitsTable);
export const rhnaProgressAdapter = genericModuleAdapter(RHNA_PROGRESS_SCHEMA, queryRhnaProgressTable);

// The full cutover registry is explicit. Adapters not yet domain-specialized
// use their module id here so no chart-shaped response is required at dispatch.
export const MODULE_ADAPTERS = Object.freeze({
  "components-of-change": componentsOfChangeAdapter,
  "demographic-projections": projectionsAdapter,
  projections: projectionsAdapter,
  pophousing: pophousingAdapter,
  "housing-stress": housingStressAdapter,
  "building-permits": buildingPermitsAdapter,
  "rhna-progress": rhnaProgressAdapter,
});

export function getModuleAdapter(moduleId) {
  return MODULE_ADAPTERS[moduleId];
}
