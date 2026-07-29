/**
 * datasetLabels.js — public display names for raw dataset/source ids.
 *
 * The cleaned CSVs carry the agency's own shorthand in their `Source` column
 * ("DoF", "Census", "E-5"). Those strings are the join keys the data layer
 * filters on and must never be renamed there (guardrail #1), so the mapping to
 * something a reader recognises lives here instead.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any server-only
 * module.
 *
 * Exports:
 *   DATASET_LABELS      — raw id → public name
 *   datasetLabel(id)    — one id, falling back to the id itself
 *   datasetOptions(schema) — the [{ id, label }] list the Datasets section renders
 *
 * Data sources:
 *   - none (static table)
 */

/**
 * Raw source id → the name PPIC publishes it under. Unmapped ids fall through
 * unchanged, so a new dataset is never hidden by a missing entry — it just shows
 * its raw id until someone adds it here.
 */
export const DATASET_LABELS = Object.freeze({
  DoF: "CA Department of Finance",
  "DoF P-3": "CA Department of Finance (P-3)",
  Census: "US Census",
  "Census cc-est": "US Census (cc-est)",
  ACS: "American Community Survey",
});

export function datasetLabel(id) {
  return DATASET_LABELS[id] || String(id ?? "");
}

/**
 * The datasets a module offers, in schema order. A schema may declare an
 * explicit `datasets` array of `{ id, label }`; otherwise the list is derived
 * from `sources`. Returns [] for modules with no dataset toggle at all, which is
 * what hides the section.
 */
export function datasetOptions(schema) {
  if (Array.isArray(schema?.datasets)) return schema.datasets;
  return (schema?.sources || []).map((id) => ({ id, label: datasetLabel(id) }));
}
