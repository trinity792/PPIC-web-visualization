import { getChartType } from "./chartRegistry";

export const QUESTION_SPEC_VERSION = 3;
export const UNSUPPORTED_VERSION_MESSAGE =
  "This view uses an older format and cannot open in this version.";

const QUESTION_KEYS = Object.freeze([
  "dataset",
  "source",
  "outcomes",
  "geography",
  "time",
  "calculation",
  "comparisons",
]);

const PRESENTATION_KEYS = Object.freeze([
  "chartType",
  "comparisonPresentation",
  "activeTab",
  "activePeriod",
  "primaryTabAxis",
  "bindings",
  "comparisonVisibility",
  "labels",
  "format",
  "appearance",
  "annotations",
  "charts",
]);

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function orderedObject(value, keys) {
  const source = value && typeof value === "object" ? value : {};
  const result = {};
  for (const key of keys) {
    if (Object.hasOwn(source, key)) result[key] = clone(source[key]);
  }
  return result;
}

/** Read canonical role measures, including views saved before multi-measure questions. */
export function readOutcomes(question = {}) {
  if (!question || typeof question !== "object") return [];
  const entries = Object.hasOwn(question, "outcomes")
    ? (Array.isArray(question.outcomes) ? question.outcomes : [])
    : question.outcome?.measureId ? [{ ...question.outcome, role: "y" }] : [];
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry?.role || !entry.measureId || seen.has(entry.role)) return false;
    seen.add(entry.role);
    return true;
  }).map((entry) => ({ ...entry })).sort((a, b) => Number(b.role === "y") - Number(a.role === "y"));
}

export function outcomeFor(question, role = "y") {
  return readOutcomes(question).find((entry) => entry.role === role);
}

/** Return only the durable v3 question and presentation state. */
export function normalizeQuestion(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    version: QUESTION_SPEC_VERSION,
    question: orderedObject({ ...source.question, outcomes: readOutcomes(source.question) }, QUESTION_KEYS),
    presentation: orderedObject(source.presentation, PRESENTATION_KEYS),
  };
}

export function serializeQuestion(input) {
  return normalizeQuestion(input);
}

export function readQuestion(input) {
  if (!input || input.version !== QUESTION_SPEC_VERSION) {
    return {
      ok: false,
      reason: "unsupported-version",
      version: input?.version,
      message: UNSUPPORTED_VERSION_MESSAGE,
    };
  }
  if (!input.question || typeof input.question !== "object") {
    return { ok: false, reason: "invalid-question", message: "This view has no data question." };
  }
  if (!input.presentation || typeof input.presentation !== "object") {
    return {
      ok: false,
      reason: "invalid-presentation",
      message: "This view has no chart presentation.",
    };
  }
  return { ok: true, spec: renameOldSettings(normalizeQuestion(input)) };
}

/**
 * Settings renamed after views were saved with them. Hide X-Axis used to save
 * `showValueAxis: false`; a view that says so opens with `hideXAxis: true`, so
 * it keeps what its author chose (renderer plan F). A saved `hideXAxis` wins.
 */
function renameOldSettings(spec) {
  const appearance = spec.presentation.appearance;
  if (appearance?.showValueAxis === false && !Object.hasOwn(appearance, "hideXAxis")) {
    appearance.hideXAxis = true;
  }
  return spec;
}

export function classifyChange(before, after) {
  const left = normalizeQuestion(before);
  const right = normalizeQuestion(after);
  if (JSON.stringify(left.question) !== JSON.stringify(right.question)) return "structural";
  if (JSON.stringify(left.presentation) !== JSON.stringify(right.presentation)) {
    return "presentation";
  }
  return "none";
}

function chartAppearanceKeys(chartType) {
  return new Set(Object.keys(getChartType(chartType)?.defaults || {}));
}

/**
 * Switch charts without allowing a setting owned by the inactive chart to
 * affect the active one. Shared appearance values (for example the palette)
 * remain active, while chart-owned values are parked under `charts`.
 */
export function applyChartType(input, nextChartType) {
  const spec = normalizeQuestion(input);
  const presentation = spec.presentation;
  const currentChartType = presentation.chartType;
  if (!nextChartType || currentChartType === nextChartType) return spec;

  const currentKeys = chartAppearanceKeys(currentChartType);
  const nextKeys = chartAppearanceKeys(nextChartType);
  const appearance = { ...(presentation.appearance || {}) };
  const charts = clone(presentation.charts || {});
  const parked = { ...(charts[currentChartType] || {}) };
  const nextRoles = new Set(["y", ...(getChartType(nextChartType)?.additionalOutcomeRoles || []).map(({ role }) => role)]);
  const outcomes = readOutcomes(spec.question);
  const leaving = outcomes.filter(({ role }) => !nextRoles.has(role));
  if (leaving.length) parked.outcomes = [...(parked.outcomes || []).filter((entry) => !leaving.some(({ role }) => role === entry.role)), ...leaving];
  const active = outcomes.filter(({ role }) => nextRoles.has(role));
  for (const entry of charts[nextChartType]?.outcomes || []) {
    if (nextRoles.has(entry.role) && !active.some(({ role }) => role === entry.role)) active.push(entry);
  }
  // Restored roles are active state now. Leaving a stale parked copy here
  // would resurrect a measure the reader subsequently clears.
  if (charts[nextChartType]?.outcomes) delete charts[nextChartType].outcomes;
  spec.question.outcomes = active;
  const ranking = spec.question.calculation?.params?.ranking;
  if (ranking?.role && !active.some(({ role }) => role === ranking.role)) ranking.role = "y";

  for (const key of ["activePeriod", "primaryTabAxis"]) {
    if (Object.hasOwn(presentation, key)) {
      parked[key] = clone(presentation[key]);
      delete presentation[key];
    }
  }

  for (const [key, value] of Object.entries(appearance)) {
    if (currentKeys.has(key) && !nextKeys.has(key)) {
      parked[key] = value;
      delete appearance[key];
    }
  }
  if (currentChartType && Object.keys(parked).length) charts[currentChartType] = parked;

  for (const [key, value] of Object.entries(charts[nextChartType] || {})) {
    if (["activePeriod", "primaryTabAxis"].includes(key)) {
      presentation[key] = clone(value);
    } else if (nextKeys.has(key)) {
      appearance[key] = clone(value);
    }
  }

  return normalizeQuestion({
    ...spec,
    presentation: { ...presentation, chartType: nextChartType, appearance, charts },
  });
}
