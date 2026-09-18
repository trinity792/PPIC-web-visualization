/**
 * savedViews.js — serialization, validation, and local persistence for chart views.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Browser localStorage under SAVED_VIEWS_KEY
 *
 * UI Kit reference:
 *   - None — persistence utility that does not render UI
 *
 * Wire format: spec v2 (see lib/visualization/chartSpec.js) — the declarative
 * config with computed keys stripped and `transform`/`chartType`/`appearance`
 * serialized top-level. Version-1 views (which folded those three keys inside
 * `filters` — flagged issue 6) are still read via `migrateSpec`, so existing
 * saved views keep loading; new saves are always v2.
 */

import {
  INLINE_DATA_MAX_BYTES,
  migrateSpec,
  normalizeSpec,
  SPEC_VERSION,
} from "@/lib/visualization/chartSpec";
import { BYOD_SCHEMA, MODULE_IDS } from "@/lib/visualization/moduleRegistry";
import { getPreset } from "@/lib/visualization/presetRegistry";
import {
  hasBlockingErrors,
  validateConfig,
} from "@/lib/visualization/validation";
import {
  normalizeQuestion,
  readQuestion,
  serializeQuestion,
} from "@/lib/visualization/questionSpec";

export const SAVED_VIEWS_KEY = "ppic.savedViews.v1";
export const SAVED_VIEWS_KEY_V3 = "ppic.savedViews.v3";
export const SAVED_VIEW_VERSION = SPEC_VERSION;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function storage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

/** The serialized shape: the normalized spec (computed keys already stripped). */
function savedShape(config) {
  return config?.version === 3 ? serializeQuestion(config) : normalizeSpec(config);
}

export function serialize(config) {
  const shape = savedShape(config);
  const json = JSON.stringify(shape, null, 2);
  if (
    shape.question?.dataset?.kind === "inline" &&
    json.length > INLINE_DATA_MAX_BYTES
  ) {
    throw new Error("This saved view is too large because it contains inline data.");
  }
  return json;
}

function parseJson(json) {
  if (typeof json === "string") {
    try {
      return JSON.parse(json);
    } catch {
      throw new Error("The saved view is not valid JSON.");
    }
  }
  if (json && typeof json === "object") return clone(json);
  throw new Error("A saved view must be a JSON object.");
}

/**
 * Did `deserialize` decline the view rather than return a config? A v3 reader
 * answers with `{ ok: false, message }` (never a half-converted spec), and the
 * callers that load views must show that message instead of dispatching it.
 */
export function isRejectedView(result) {
  return Boolean(result) && result.ok === false;
}

export function deserialize(json, schema) {
  const saved = parseJson(json);
  // Every editor surface reads v3 only (modules and the bring-your-own-data
  // tool both cut over on 2026-09-14): a v1 or v2 view gets the plain-language
  // unsupported-version message rather than a guessed conversion. The legacy
  // reader below survives only for unregistered (test) schemas.
  const v3Only =
    saved.version === 3 ||
    schema?.id === "projections" ||
    schema?.inlineOnly ||
    MODULE_IDS.includes(schema?.id);
  if (v3Only) {
    const result = readQuestion(saved);
    if (!result.ok) return result;
    const dataset = result.spec.question.dataset || {};
    // A pasted-data view opens only on the standalone tool; a module view only
    // on its own module page.
    const mismatch =
      dataset.kind === "inline" ? !schema?.inlineOnly : dataset.moduleId !== schema?.id;
    if (mismatch) {
      const owner = dataset.kind === "inline" ? "your own data" : `dataset "${dataset.moduleId}"`;
      return {
        ok: false,
        reason: "dataset-mismatch",
        message: `This view belongs to ${owner}, not "${schema?.id}".`,
      };
    }
    return normalizeQuestion(result.spec);
  }
  if (saved.version !== 1 && saved.version !== SAVED_VIEW_VERSION) {
    throw new Error(
      `Unsupported saved-view version "${saved.version}". Expected 1 or ${SAVED_VIEW_VERSION}.`,
    );
  }
  if (saved.module !== schema.id) {
    throw new Error(
      `This view belongs to "${saved.module}", not "${schema.id}".`,
    );
  }

  const preset = getPreset(saved.preset);
  if (!preset) throw new Error(`Unknown preset "${saved.preset}".`);

  // migrateSpec unpacks the v1 filters-smuggled keys; normalizeSpec fills the
  // v2 containers. A v2 view passes through unchanged.
  const migrated = migrateSpec(saved);
  const config = normalizeSpec(
    { ...migrated, chartType: migrated.chartType || preset.chartType },
    schema,
  );

  const findings = validateConfig(config, schema);
  if (hasBlockingErrors(findings)) {
    const messages = findings
      .filter((finding) => finding.level === "error")
      .map((finding) => finding.message)
      .join(" ");
    throw new Error(`Saved view is invalid: ${messages}`);
  }
  return config;
}

/**
 * Workspace (multi-chart) wire format for embeds: `{ layout, charts: [{name,
 * config}] }`. A single saved view has no top-level `charts` array, so one
 * `view=` param can carry either shape and the reader can tell them apart.
 * Serialized compact (no pretty-print) because embeds ride inside a URL.
 */
export function serializeWorkspace(workspace) {
  const v3 = (workspace?.charts || []).some(
    (chart) => (chart?.config || chart)?.version === 3,
  );
  if (v3) {
    const directCharts = workspace.charts.every((chart) => chart?.version === 3);
    return JSON.stringify({
      activeChartId: workspace.activeChartId,
      layout: workspace?.layout,
      charts: workspace.charts.map((chart) => {
        const config = serializeQuestion(chart?.config || chart);
        return directCharts ? config : { name: chart.name, config };
      }),
    });
  }
  const charts = (workspace?.charts || []).map((chart) => ({
    name: chart.name,
    config: savedShape(chart.config),
  }));
  return JSON.stringify({ layout: workspace?.layout || "1x1", charts });
}

/**
 * Parse a workspace payload. Returns null when `json` is not workspace-shaped,
 * so callers can fall back to single-view `deserialize`; throws when it IS a
 * workspace but any chart config is invalid (reusing per-chart validation).
 */
export function deserializeWorkspace(json, schema) {
  let parsed;
  try {
    parsed = typeof json === "string" ? JSON.parse(json) : clone(json);
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray(parsed.charts)) return null;
  const readChart = (chart) => {
    const config = deserialize(chart, schema);
    if (isRejectedView(config)) throw new Error(config.message);
    return config;
  };
  if (parsed.charts.some((chart) => (chart?.config || chart)?.version === 3)) {
    const directCharts = parsed.charts.every((chart) => chart?.version === 3);
    const charts = parsed.charts.map((chart, index) => {
      const config = readChart(chart?.config || chart);
      return directCharts
        ? config
        : { name: chart?.name || `Chart ${index + 1}`, config };
    });
    return { activeChartId: parsed.activeChartId, layout: parsed.layout, charts };
  }
  const charts = parsed.charts.map((chart, index) => ({
    name: chart?.name || `Chart ${index + 1}`,
    config: readChart(chart?.config ?? chart),
  }));
  return { layout: parsed.layout, charts };
}

/** Every browser-local saved view, v3 first, then the untouched v1 namespace. */
export function listViews() {
  return [...listViewsAt(SAVED_VIEWS_KEY_V3), ...listViewsAt(SAVED_VIEWS_KEY)];
}

function listViewsAt(key) {
  const store = storage();
  if (!store) return [];
  try {
    const views = JSON.parse(store.getItem(key) || "[]");
    return Array.isArray(views) ? views : [];
  } catch {
    return [];
  }
}

export function getView(id, schema) {
  const view =
    listViews().find((item) => item.id === id);
  return view ? deserialize(view.config, schema) : null;
}

export function saveView(name, config, id) {
  const store = storage();
  if (!store) throw new Error("Saved views are only available in the browser.");

  const shape = savedShape(config);
  const serialized = JSON.stringify(shape);
  if (
    (shape.data?.inline || shape.question?.dataset?.kind === "inline") &&
    serialized.length > INLINE_DATA_MAX_BYTES
  ) {
    throw new Error(
      `VIEW_TOO_LARGE: this view carries ${Math.round(serialized.length / 1024)} KB of inline data — ` +
        `the saved-view limit is ${Math.round(INLINE_DATA_MAX_BYTES / 1024)} KB. ` +
        "Export the view as a JSON file instead.",
    );
  }

  const key = config?.version === 3 ? SAVED_VIEWS_KEY_V3 : SAVED_VIEWS_KEY;
  const views = listViewsAt(key);
  const viewId =
    id ||
    globalThis.crypto?.randomUUID?.() ||
    `view-${Date.now().toString(36)}`;
  const next = {
    id: viewId,
    name: name?.trim() || config.labels?.title || config.presentation?.labels?.title || "Untitled view",
    // The owner the Restore list filters on: a module id, or the standalone
    // tool's schema id for pasted data.
    module:
      config.module ||
      config.question?.dataset?.moduleId ||
      (config.question?.dataset?.kind === "inline" ? BYOD_SCHEMA.id : undefined),
    updatedAt: new Date().toISOString(),
    config: shape,
  };
  const index = views.findIndex((view) => view.id === viewId);
  if (index === -1) views.push(next);
  else views[index] = next;
  store.setItem(key, JSON.stringify(views));
  return next;
}

export function deleteView(id) {
  const store = storage();
  if (!store) return;
  for (const key of [SAVED_VIEWS_KEY_V3, SAVED_VIEWS_KEY]) {
    store.setItem(
      key,
      JSON.stringify(listViewsAt(key).filter((view) => view.id !== id)),
    );
  }
}
