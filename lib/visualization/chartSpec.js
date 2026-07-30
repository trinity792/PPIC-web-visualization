/**
 * chartSpec.js — chart-spec v2: versioning, migration, printing, and diff
 * classification for the graph editor's code mode.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * The spec is the declarative chart config the whole editor revolves around
 * (see projectSpec "The chart config"). Version 2 extends v1 with:
 *   - `data`        — data-source selector ({ source: "module" | "inline", inline? })
 *   - `format`      — per-field display-format overrides
 *   - `annotations` — text/arrow/range annotations beyond referenceLines
 *   - top-level `transform` / `chartType` / `appearance` on the wire (v1
 *     smuggled these inside `filters` when serialized — flagged issue 6)
 *
 * Exports:
 *   SPEC_VERSION            — current spec version (2)
 *   STRUCTURAL_KEYS         — keys whose change forces a re-query ("Run")
 *   COMPUTED_KEYS           — runtime-only keys, stripped on serialize
 *   INLINE_DATA_MAX_BYTES   — localStorage cap for specs carrying inline data
 *   migrateSpec(spec)       — lossless v1 → v2 upgrade
 *   normalizeSpec(spec, schema) — fill defaults, order keys, strip computed keys
 *   printSpec(spec)         — deterministic pretty-printed JSON for the editor
 *   parseSpec(text, schema) — parse + normalize + validate; never throws
 *   diffSpec(live, draft)   — { classification: "none"|"small"|"structural",
 *                              changedPaths }
 *
 * Data sources:
 *   - none (pure functions over plain objects); validation delegates to
 *     `lib/visualization/validation.js`
 */

import { validateConfig } from "./validation";

export const SPEC_VERSION = 2;

/** Serialized specs carrying inline data may not exceed this (VIEW_TOO_LARGE). */
export const INLINE_DATA_MAX_BYTES = 1_000_000;

/** Canonical top-level key order for printing and export. */
const KEY_ORDER = [
  "version",
  "module",
  "preset",
  "chartType",
  "data",
  "bindings",
  "period",
  "filters",
  "transform",
  "comparisonMode",
  "labels",
  "format",
  "appearance",
  "annotations",
  "layers",
  "referenceLines",
];

/**
 * Keys the spec used to carry and no longer does. They are stripped on
 * normalize rather than rejected, so a stored view written before the change
 * still loads — a bookmarked link must not break because a control retired.
 */
const RETIRED_KEYS = Object.freeze(["tier"]);

/**
 * Runtime-only keys: never serialized, never diffed. `geoUnmatched` (location
 * names a geographic join couldn't match) and `seriesNames` (the last-loaded
 * trace names, used by the palette per-series override rows) plus
 * `categoryNames` (the last-loaded line/bar labels) are populated by
 * SET_SERIES_COUNT alongside `seriesCount` — all are load-derived, not user
 * configuration.
 */
export const COMPUTED_KEYS = Object.freeze([
  "seriesCount",
  "validation",
  "geoUnmatched",
  "seriesNames",
  "categoryNames",
  "tabOptions",
]);

/** Changing any of these re-queries or restructures the chart → "structural". */
export const STRUCTURAL_KEYS = Object.freeze([
  "version",
  "module",
  "preset",
  "chartType",
  "data",
  "bindings",
  "period",
  "filters",
  "transform",
  "comparisonMode",
  "layers",
]);

const KNOWN_KEYS = new Set([...KEY_ORDER, ...COMPUTED_KEYS, ...RETIRED_KEYS]);

const err = (code, message, suggestion) => ({ ok: false, level: "error", code, message, suggestion });
const warn = (code, message, suggestion) => ({ ok: false, level: "warn", code, message, suggestion });

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/** The keys v1 `savedShape` smuggled inside `filters` (flagged issue 6). */
const V1_FILTER_SMUGGLED_KEYS = ["transform", "chartType", "appearance"];

/**
 * Chart types that no longer exist, and what a stored view carrying one should
 * fall back to. A bookmarked `?view=` link must keep opening *something*, so a
 * retired type degrades to its closest surviving relative and says so
 * (CHART_TYPE_RETIRED) rather than throwing or rendering blank.
 */
export const RETIRED_CHART_TYPES = Object.freeze({
  // Slopegraph (dropped in the module workbench overhaul): both were two-period
  // views of the same measure, and a line renders that with the same bindings.
  slope: "line",
  // A Bar variant since 2026-07 (Workstream B): same category+measure contract,
  // drawn from a center reference. `appearance.diverging` carries what the id
  // used to; see the `storedType === "divergingBar"` rewrite in normalizeSpec.
  divergingBar: "bar",
});

/**
 * Lossless v1 → v2 upgrade. Accepts either the v1 in-memory shape (top-level
 * transform/chartType/appearance) or the v1 wire shape (those keys folded into
 * `filters`), and returns a v2 spec. A spec already at v2 passes through
 * unchanged (cloned).
 */
export function migrateSpec(spec) {
  if (!spec || typeof spec !== "object") return spec;
  const input = clone(spec);
  if (input.version === SPEC_VERSION) return input;

  const filters = { ...(input.filters || {}) };
  const smuggled = {};
  for (const key of V1_FILTER_SMUGGLED_KEYS) {
    if (filters[key] !== undefined) {
      smuggled[key] = filters[key];
      delete filters[key];
    }
  }

  return {
    ...input,
    version: SPEC_VERSION,
    chartType: input.chartType ?? smuggled.chartType,
    transform: input.transform ?? smuggled.transform ?? "actual",
    appearance: { ...(smuggled.appearance || {}), ...(input.appearance || {}) },
    filters,
    data: input.data || { source: "module" },
    format: input.format || {},
    annotations: input.annotations || [],
  };
}

/**
 * The explicit place selection, as a first-class filter. Before the module
 * workbench overhaul this lived in a `selectedPlaces` layer, which is still how
 * the standalone tool's layer editor writes it; a stored view carrying only the
 * layer is lifted here so the Geographic Level multi-select opens showing what
 * the chart is actually drawing. The layer itself is left alone — removing it
 * would change what the standalone tool renders.
 *
 * Returns `undefined` when there is no selection, so "draw whatever the ranking
 * picks" stays the absence of a key rather than an empty array in every stored
 * view.
 */
function normalizeLocations(migrated) {
  const explicit = migrated.filters?.locations;
  if (Array.isArray(explicit) && explicit.length) return [...new Set(explicit)];
  const fromLayers = (migrated.layers || [])
    .filter((layer) => layer?.type === "selectedPlaces")
    .flatMap((layer) => layer.values || []);
  return fromLayers.length ? [...new Set(fromLayers)] : undefined;
}

/**
 * Shape normalization only: fill missing containers with defaults, strip
 * computed keys, and order keys canonically. Does NOT re-derive bindings from
 * presets — that is `createChartConfig`'s job.
 */
export function normalizeSpec(spec, schema) {
  const migrated = migrateSpec(spec) || {};
  const locations = normalizeLocations(migrated);
  // A stored `divergingBar` view retires to `bar` (Workstream B) with the flag
  // that now carries what the id used to. The stored appearance spreads
  // second, so `center`, `colorBuckets`, `valueRange`, `trackRail`, and
  // `minimalAxis` all survive verbatim — a migrated view that loses its center
  // reference is a chart that silently changes meaning, worse than one that
  // fails to load.
  const storedType = migrated.chartType;
  const appearance =
    storedType === "divergingBar"
      ? { diverging: true, ...(migrated.appearance || {}) }
      : migrated.appearance || {};
  const filled = {
    version: SPEC_VERSION,
    module: migrated.module ?? schema?.id,
    preset: migrated.preset,
    chartType: RETIRED_CHART_TYPES[storedType] || storedType,
    data: migrated.data || { source: "module" },
    bindings: migrated.bindings || {},
    period: migrated.period || {},
    filters: {
      ...(migrated.filters || {}),
      ...(locations ? { locations } : {}),
    },
    transform: migrated.transform || "actual",
    comparisonMode: migrated.comparisonMode || "places",
    labels: migrated.labels || {},
    format: migrated.format || {},
    appearance,
    annotations: migrated.annotations || [],
    layers: migrated.layers || [],
    referenceLines: migrated.referenceLines || [],
  };

  const ordered = {};
  for (const key of KEY_ORDER) ordered[key] = filled[key];
  return ordered;
}

/** Deterministic pretty print (canonical key order, 2-space indent). */
export function printSpec(spec, schema) {
  return JSON.stringify(normalizeSpec(spec, schema), null, 2);
}

const RAW_HEX = /^#[0-9a-f]{3,8}$/i;

/** Spec-shape findings printSpec/parseSpec surface beyond validateConfig. */
function validateSpecShape(raw, normalized) {
  const findings = [];
  const retiredTo = RETIRED_CHART_TYPES[raw.chartType];
  if (retiredTo) {
    findings.push(
      warn(
        "CHART_TYPE_RETIRED",
        `The "${raw.chartType}" chart type has been retired; this view now renders as "${retiredTo}".`,
        "Re-save the view to store the new chart type.",
      ),
    );
  }
  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) {
      findings.push(
        warn("SPEC_UNKNOWN_KEY", `"${key}" is not a chart-spec key and will be ignored.`),
      );
    }
  }

  const appearance = normalized.appearance || {};
  const colorValues = [
    appearance.palette,
    ...Object.values(appearance.seriesColors || {}),
  ].filter(Boolean);
  for (const value of colorValues) {
    if (typeof value === "string" && RAW_HEX.test(value)) {
      findings.push(
        warn(
          "SPEC_RAW_HEX",
          `"${value}" is a raw hex color; use a brand color token so palettes stay in sync.`,
        ),
      );
    }
  }

  const inline = normalized.data?.inline;
  if (inline) {
    const columnCount = inline.columns?.length ?? 0;
    const badRow = (inline.rows || []).findIndex(
      (row) => !Array.isArray(row) || row.length !== columnCount,
    );
    if (columnCount === 0 || badRow !== -1) {
      findings.push(
        err(
          "SPEC_INLINE_SHAPE",
          columnCount === 0
            ? "Inline data must declare at least one column."
            : `Inline data row ${badRow + 1} has a different width than the ${columnCount} declared columns.`,
        ),
      );
    }
  }

  return findings;
}

/**
 * Parse code-mode text (or a plain object) into a validated spec.
 * Never throws on user input.
 *
 * @returns {{ spec: object|null, errors: Array }} errors are standard findings
 *   ({ level: "error"|"warn", code, message }); error-level findings mean the
 *   spec must not be applied.
 */
export function parseSpec(input, schema) {
  let raw = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch (cause) {
      return {
        spec: null,
        errors: [err("SPEC_PARSE_ERROR", `Not valid JSON: ${cause.message}`)],
      };
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { spec: null, errors: [err("SPEC_PARSE_ERROR", "A chart spec must be a JSON object.")] };
  }
  if (raw.version != null && raw.version !== 1 && raw.version !== SPEC_VERSION) {
    return {
      spec: null,
      errors: [
        err(
          "SPEC_VERSION_UNSUPPORTED",
          `Unsupported spec version "${raw.version}". Expected 1 or ${SPEC_VERSION}.`,
        ),
      ],
    };
  }

  const spec = normalizeSpec(raw, schema);
  const errors = [
    ...validateSpecShape(raw, spec),
    ...validateConfig(spec, schema),
  ];
  return { spec, errors };
}

/**
 * Classify the difference between the live spec and a draft. "small" edits
 * (labels, format, appearance, annotations, referenceLines) can apply as they
 * are typed; "structural" edits re-query or restructure the chart.
 *
 * @returns {{ classification: "none"|"small"|"structural", changedPaths: string[] }}
 */
export function diffSpec(live, draft, schema) {
  const a = normalizeSpec(live, schema);
  const b = normalizeSpec(draft, schema);
  const changedPaths = KEY_ORDER.filter(
    (key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]),
  );
  if (changedPaths.length === 0) return { classification: "none", changedPaths };
  const structural = changedPaths.some((key) => STRUCTURAL_KEYS.includes(key));
  return { classification: structural ? "structural" : "small", changedPaths };
}
