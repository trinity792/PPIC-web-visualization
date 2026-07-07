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
import { getPreset } from "@/lib/visualization/presetRegistry";
import {
  hasBlockingErrors,
  validateConfig,
} from "@/lib/visualization/validation";

export const SAVED_VIEWS_KEY = "ppic.savedViews.v1";
export const SAVED_VIEW_VERSION = SPEC_VERSION;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function storage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

/** The serialized shape: the normalized spec (computed keys already stripped). */
function savedShape(config) {
  return normalizeSpec(config);
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

  const shape = savedShape(config);
  const serialized = JSON.stringify(shape);
  if (shape.data?.inline && serialized.length > INLINE_DATA_MAX_BYTES) {
    throw new Error(
      `VIEW_TOO_LARGE: this view carries ${Math.round(serialized.length / 1024)} KB of inline data — ` +
        `the saved-view limit is ${Math.round(INLINE_DATA_MAX_BYTES / 1024)} KB. ` +
        "Export the view as a JSON file instead.",
    );
  }

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
    config: shape,
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
