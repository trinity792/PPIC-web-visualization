const base = (id, label, section, mode, classification, configPath, consumer, extras = {}) =>
  Object.freeze({
    id,
    label,
    section,
    mode,
    classification,
    charts: "all",
    datasets: "all",
    values: "See resolved chart and dataset capabilities",
    configPath,
    consumer,
    chartSwitchPolicy: classification === "question" ? "keep" : "remember",
    documentationId: id,
    approval: "approved",
    ...extras,
  });

const SETTINGS = Object.freeze([
  base("outcome", "Outcome", "Outcome", "standard", "question", "question.outcome.measureId", "lib/data/visualization/executeQuestion.js"),
  base("calculation", "Transformation", "Outcome", "standard", "question", "question.calculation.id", "lib/data/visualization/calculationRegistry.js"),
  base("time", "Time", "Time", "standard", "question", "question.time", "components/chart-builder/sections/TimeSection.js", { chartSwitchPolicy: "clear" }),
  base("comparisons", "Comparisons", "Comparisons", "standard", "question", "question.comparisons", "lib/data/visualization/executeQuestion.js"),
  base("comparisonPresentation", "Comparison presentation", "Comparisons", "standard", "presentation", "presentation.comparisonPresentation", "lib/visualization/adapters/index.js"),
  base("ranking", "Ranking", "Geography", "advanced", "question", "question.calculation.params.ranking", "lib/data/visualization/rankObservations.js"),
  base("benchmarkDifference", "Difference from benchmark", "Outcome", "advanced", "question", "question.calculation.params.benchmark", "lib/data/visualization/calculationRegistry.js"),
  base("seriesBinding", "Series binding", "Outcome", "advanced", "presentation", "presentation.bindings.series", "lib/tabular/toObservations.js"),
  base("comparisonLegendLabel", "Comparison legend label", "Appearance", "standard", "question", "question.comparisons[].customLabel", "lib/visualization/adapters/index.js"),
  base("comparisonColor", "Comparison color", "Appearance", "advanced", "question", "question.comparisons[].color", "lib/visualization/palettes.js"),
  base("comparisonVisibility", "Comparison visibility", "Appearance", "advanced", "presentation", "presentation.comparisonVisibility", "lib/visualization/adapters/index.js"),
  base("customDivergingStops", "Custom diverging stops", "Appearance", "advanced", "presentation", "presentation.appearance.divergingStops", "lib/visualization/palettes.js"),
  base("showSource", "Show source and notes", "Appearance", "standard", "presentation", "presentation.appearance.showSource", "components/charts/ChartFrame.js"),
  base("dashedRange", "Dashed lines for a range of periods", "Appearance", "standard", "presentation", "presentation.appearance.dashedRange", "lib/visualization/models/lineModel.js", { charts: ["line"] }),
  base("showValueLabels", "Show values", "Appearance", "standard", "presentation", "presentation.appearance.showValueLabels", "lib/visualization/models/barModel.js", { charts: ["bar"], values: "On or off (off by default)" }),
  base("valueLabelSeries", "Label which series", "Appearance", "advanced", "presentation", "presentation.appearance.valueLabelSeries", "lib/visualization/models/barModel.js", { charts: ["bar"], values: "All series, or one series by name" }),
  base("valueLabelPosition", "Label position", "Appearance", "advanced", "presentation", "presentation.appearance.valueLabelPosition", "lib/visualization/models/barModel.js", { charts: ["bar"], values: ["automatic", "inside", "outside"] }),
  base("showStackTotals", "Stack totals", "Appearance", "standard", "presentation", "presentation.appearance.showStackTotals", "lib/visualization/models/barModel.js", { charts: ["bar"], values: "On or off, for stacked bars (off by default)" }),
  base("barSort", "Sort", "Appearance", "standard", "presentation", "presentation.appearance.sort", "lib/visualization/models/barModel.js", { charts: ["bar"], values: ["data", "descending", "ascending"] }),
  base("rangeStyle", "Range style", "Appearance", "standard", "presentation", "presentation.appearance.rangeStyle", "lib/visualization/models/rangeModel.js", { charts: ["dumbbell"], values: ["dots", "arrow"] }),
  base("valueAxisPosition", "Value axis position", "Appearance", "advanced", "presentation", "presentation.appearance.valueAxisPosition", "lib/visualization/models/rangeModel.js", { charts: ["dumbbell"], values: ["bottom", "top"] }),
  base("pointLabelEnds", "Label which end", "Appearance", "advanced", "presentation", "presentation.appearance.pointLabelEnds", "lib/visualization/models/rangeModel.js", { charts: ["dumbbell"], values: ["both", "start", "end"] }),
  base("seriesOrder", "Bar order within groups", "Appearance", "standard", "presentation", "presentation.appearance.seriesOrder", "lib/visualization/models/barModel.js", { charts: ["bar"], values: "Series names in a dragged order (data order by default)" }),
  base("categoryAxis", "Bars along", "Appearance", "advanced", "presentation", "presentation.appearance.categoryAxis", "lib/visualization/models/barModel.js", { charts: ["bar"], values: ["location", "period"] }),
  base("barColorBy", "Color bars by", "Appearance", "advanced", "presentation", "presentation.appearance.barColorBy", "lib/visualization/models/barModel.js", { charts: ["bar"], values: ["series", "comparison", "period"] }),
  base("hideXAxis", "Hide horizontal axis", "Appearance", "advanced", "presentation", "presentation.appearance.hideXAxis", "lib/visualization/adapters/index.js"),
  base("comparisonGeographyOverride", "Comparison geography override", "Comparisons", "advanced", "question", "question.comparisons[].geography", "lib/data/visualization/executeQuestion.js"),
  base("comparisonTimeOverride", "Comparison time override", "Comparisons", "advanced", "question", "question.comparisons[].time", "lib/data/visualization/executeQuestion.js"),
]);

const BY_ID = new Map(SETTINGS.map((setting) => [setting.id, setting]));

export function listSettings() {
  return [...SETTINGS];
}

export function getSetting(id) {
  return BY_ID.get(id);
}

export function resolveVisibleSettings(model = {}) {
  const moduleId = model.spec?.question?.dataset?.moduleId;
  return SETTINGS.filter((setting) => {
    if (setting.mode === "advanced" && model.mode !== "advanced") return false;
    if (setting.charts !== "all" && !setting.charts.includes(model.chartType)) return false;
    if (setting.datasets !== "all" && !setting.datasets.includes(moduleId)) return false;
    return true;
  }).map((setting) => ({ id: setting.id, label: setting.label }));
}

export function assertNoPendingVisibleSettings(model = {}) {
  const overrides = model.overrideApprovals || {};
  const pending = [
    ...resolveVisibleSettings(model).filter(
      (control) => (overrides[control.id] || getSetting(control.id).approval) === "pending",
    ),
    ...Object.entries(overrides)
      .filter(([, approval]) => approval === "pending")
      .map(([id]) => ({ id })),
  ];
  if (pending.length) throw new Error(`Visible setting ${pending[0].id} is pending approval.`);
}

export function unwiredSettings() {
  return [];
}
