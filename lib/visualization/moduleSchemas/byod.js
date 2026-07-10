/**
 * Client-safe visualization schema for the standalone "Visualization Tool"
 * (bring-your-own-data). Unlike the five data-module schemas, this one has no
 * server dataset: it declares no `apiPath` and an empty field catalog, and is
 * marked `inlineOnly` so the editor drives entirely off a pasted/uploaded
 * table (the "inline" data source shaped client-side by lib/tabular/toSeries.js).
 *
 * ChartConfigProvider requires *a* schema (it keys config off schema.id /
 * schema.label / schema.fields), and inline mode already bypasses the
 * schema-field validation in lib/visualization/validation.js
 * (validateInlineBindings names table columns instead), so this minimal schema
 * satisfies the provider without a backing module.
 */

export const BYOD_SCHEMA = Object.freeze({
  id: "byod",
  label: "Visualization Tool",
  // No apiPath — nothing is ever fetched; data lives in config.data.inline.
  apiPath: null,
  // Empty catalog: inline bindings reference the uploaded table's columns.
  fields: {},
  canonicalColumns: [],
  numericColumns: [],
  curatedMeasures: [],
  subsets: {},
  sources: null,
  // Marks this as a data-source-free editor. DataSourcePanel hides the module
  // dataset option and keeps the source pinned to "inline" when this is set.
  inlineOnly: true,
  // A generous default window for the year-range slider when an uploaded table
  // happens to carry a temporal column; inline charts otherwise ignore it.
  yearRange: [1990, new Date().getFullYear()],
});
