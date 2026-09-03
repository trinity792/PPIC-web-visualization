import { calculationOptionsFor } from "@/lib/data/visualization/calculationRegistry";
import { CHART_TYPE_IDS, getChartCapabilities } from "./chartRegistry";

const ADVANCED_SETTINGS = Object.freeze([
  { id: "ranking", capability: "calculations", value: "ranking" },
  { id: "benchmarkDifference", capability: "calculations", value: "benchmarkDifference" },
  { id: "comparisonGeographyOverride", capability: "comparison", value: "geographyOverride" },
  { id: "comparisonTimeOverride", capability: "comparison", value: "timeOverride" },
  { id: "customDivergingStops", capability: "appearance", value: "divergingStops" },
  { id: "hideXAxis", capability: "appearance", value: "hideXAxis" },
]);

function capabilityValues(capabilities, section) {
  const value = capabilities?.[section];
  if (Array.isArray(value)) return value;
  if (section === "calculations") return value || [];
  return Object.entries(value || {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([id]) => id);
}

export function resolveEditorModel({ spec, schema, mode = "standard", capabilities } = {}) {
  const chartType = spec?.presentation?.chartType;
  const descriptor = getChartCapabilities(chartType);
  const effective = capabilities || descriptor || {};
  const measureId = spec?.question?.outcome?.measureId;
  const measure = schema?.fields?.[measureId] || { id: measureId };
  const declared = calculationOptionsFor({ id: measureId, ...measure });
  const chartCalculations = capabilityValues(effective, "calculations");
  const calculationIds = declared.filter((id) =>
    chartCalculations.length ? chartCalculations.includes(id) : true,
  );
  const calculationChoices = calculationIds
    .filter((id) => mode === "advanced" || !["ranking", "benchmarkDifference"].includes(id))
    .map((id) => ({ id }));

  const comparisonCount = spec?.question?.comparisons?.length || 0;
  const activeCalculation = spec?.question?.calculation?.id || "actual";
  const chartChoices = CHART_TYPE_IDS.map((id) => {
    const candidate = getChartCapabilities(id);
    const available = candidate?.calculations?.includes(activeCalculation) !== false;
    return {
      id,
      available,
      ...(!available
        ? { reason: "This chart cannot show the selected calculation." }
        : {}),
      ...(available && comparisonCount >= 10 && id === "line"
        ? { information: "Ten lines can be difficult to read. Use clear labels or tabs." }
        : {}),
    };
  });

  const visibleSettings = [];
  if (mode === "advanced") {
    for (const setting of ADVANCED_SETTINGS) {
      if (capabilityValues(effective, setting.capability).includes(setting.value)) {
        visibleSettings.push({ id: setting.id });
      }
    }
  }

  const timeMeta = schema?.time || {};
  const activeContract = spec?.question?.time?.contract;
  const selectedSnapshotModes =
    chartType === "bar"
      ? ["grouped"]
      : chartType === "pie"
        ? ["tabs", "average"]
        : ["tabs"];
  return {
    chartType,
    mode,
    presentation: { ...(spec?.presentation || {}) },
    chartChoices,
    calculationChoices,
    calculations: calculationIds,
    visibleSettings,
    time: {
      contract: activeContract,
      availablePeriods: timeMeta.availablePeriods || [],
      reportingPeriods: timeMeta.reportingPeriods || [],
      defaultPeriod: timeMeta.defaultReportingPeriod,
      displayModes:
        activeContract === "selectedSnapshots" ? selectedSnapshotModes : [],
    },
  };
}

export default resolveEditorModel;
