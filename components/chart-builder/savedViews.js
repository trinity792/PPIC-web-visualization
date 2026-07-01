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
 */

import { getPreset } from "@/lib/visualization/presetRegistry";
import {
  hasBlockingErrors,
  validateConfig,
} from "@/lib/visualization/validation";

export const SAVED_VIEWS_KEY = "ppic.savedViews.v1";
export const SAVED_VIEW_VERSION = 1;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function storage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

function savedShape(config) {
  return {
    version: SAVED_VIEW_VERSION,
    module: config.module,
    preset: config.preset,
    bindings: clone(config.bindings || {}),
    period: clone(config.period || {}),
    filters: {
      ...clone(config.filters || {}),
      transform: config.transform || "actual",
      chartType: config.chartType,
      appearance: clone(config.appearance || {}),
    },
    labels: clone(config.labels || {}),
    referenceLines: clone(config.referenceLines || []),
    layers: clone(config.layers || []),
  };
}

export function serialize(config) {
  return JSON.stringify(savedShape(config), null, 2);
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

export function deserialize(json, schema) {
  const saved = parseJson(json);
  if (saved.version !== SAVED_VIEW_VERSION) {
    throw new Error(
      `Unsupported saved-view version "${saved.version}". Expected version ${SAVED_VIEW_VERSION}.`,
    );
  }
  if (saved.module !== schema.id) {
    throw new Error(
      `This view belongs to "${saved.module}", not "${schema.id}".`,
    );
  }

  const preset = getPreset(saved.preset);
  if (!preset) throw new Error(`Unknown preset "${saved.preset}".`);

  const filters = clone(saved.filters || {});
  const appearance = clone(filters.appearance || {});
  const chartType = filters.chartType || preset.chartType;
  const transform = filters.transform || preset.defaults?.transform || "actual";
  delete filters.appearance;
  delete filters.chartType;
  delete filters.transform;

  const config = {
    ...saved,
    chartType,
    transform,
    appearance,
    filters,
    bindings: clone(saved.bindings || {}),
    period: clone(saved.period || {}),
    labels: clone(saved.labels || {}),
    referenceLines: clone(saved.referenceLines || []),
    layers: clone(saved.layers || []),
  };
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

export function listViews() {
  const store = storage();
  if (!store) return [];
  try {
    const views = JSON.parse(store.getItem(SAVED_VIEWS_KEY) || "[]");
    return Array.isArray(views) ? views : [];
  } catch {
    return [];
  }
}

export function getView(id, schema) {
  const view = listViews().find((item) => item.id === id);
  return view ? deserialize(view.config, schema) : null;
}

export function saveView(name, config, id) {
  const store = storage();
  if (!store) throw new Error("Saved views are only available in the browser.");
  const views = listViews();
  const viewId =
    id ||
    globalThis.crypto?.randomUUID?.() ||
    `view-${Date.now().toString(36)}`;
  const next = {
    id: viewId,
    name: name?.trim() || config.labels?.title || "Untitled view",
    module: config.module,
    updatedAt: new Date().toISOString(),
    config: savedShape(config),
  };
  const index = views.findIndex((view) => view.id === viewId);
  if (index === -1) views.push(next);
  else views[index] = next;
  store.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
  return next;
}

export function deleteView(id) {
  const store = storage();
  if (!store) return;
  store.setItem(
    SAVED_VIEWS_KEY,
    JSON.stringify(listViews().filter((view) => view.id !== id)),
  );
}
