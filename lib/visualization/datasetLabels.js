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
 *   citeSources(observations, citations) — the chart's source line: one full
 *     citation per dataset drawn, in the order the data first uses it
 *
 * Data sources:
 *   - none (static table); topic citations come from each module schema's
 *     `sourceCitations`
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

/**
 * The citations for the datasets a chart draws, for the chart's source line.
 * Each observation carries its raw `source` id (the Source filter value, such
 * as "DoF P-3"); a topic's `sourceCitations` maps each id to the full citation
 * PPIC publishes (publisher and dataset). A topic with no per-row source falls
 * back to its `default` citation, and an id with no citation at all shows as
 * it is rather than disappearing. Two ids that share a citation are listed once.
 */
export function citeSources(observations = [], citations = null) {
  const cited = [];
  for (const row of observations) {
    const id = typeof row?.source === "string" ? row.source.trim() : "";
    if (!id) continue;
    const citation =
      (citations && Object.hasOwn(citations, id) ? citations[id] : null) ||
      citations?.default ||
      id;
    if (!cited.includes(citation)) cited.push(citation);
  }
  return cited;
}
