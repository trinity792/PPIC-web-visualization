/**
 * grammar.js — the single source of truth binding chart-spec features to R
 * (ggplot2) and Stata (twoway/graph) surface syntax.
 *
 * Both `toRCode`/`toStataCode` (generators) and `parseRCode`/`parseStataCode`
 * (parsers) import from here so the two directions can never drift apart:
 * whatever a generator emits for a role/chart-type pair is exactly what the
 * matching parser recognizes for that same pair.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   SUPPORTED_CHART_TYPES         — { r: [...], stata: [...] } chart types v1
 *                                    code generation can express
 *   R_GEOM_FOR_CHART              — chartType -> canonical geom_* function name
 *   CHART_FOR_R_GEOM              — geom_* name -> chartType (parse direction;
 *                                    also accepts geom_bar/geom_area)
 *   STATA_COMMAND_FOR_CHART       — chartType -> canonical Stata command prefix
 *   CHART_FOR_STATA_COMMAND       — Stata command prefix -> chartType (parse
 *                                    direction; also accepts "graph hbar")
 *   AES_FOR_ROLE / ROLE_FOR_AES   — generic (chart-type-agnostic) role <-> aes
 *                                    name table, for documentation/tests
 *   aesForRole(role, chartType)   — role -> aes name, resolving the one
 *                                    context-dependent case (bar's category
 *                                    role rides the x aesthetic)
 *   roleForAes(aesName, chartType)— aes name -> role, the reverse resolution
 *   slugForField(name)            — Stata-safe identifier for a field name
 *   fieldForSlug(slug, schema)    — reverse lookup of slugForField over a schema
 *   featureCoverage(spec, lang)   — named spec features "r"/"stata" can't express
 *
 * Data sources:
 *   - none (pure functions over plain objects/strings)
 */

/** Chart types v1 code generation supports, per language. */
export const SUPPORTED_CHART_TYPES = Object.freeze({
  r: ["line", "bar", "scatter", "bubble", "heatmap"],
  stata: ["line", "bar", "scatter"],
});

/** Canonical geom for each chart type this codegen supports in R. */
export const R_GEOM_FOR_CHART = Object.freeze({
  line: "geom_line",
  bar: "geom_col",
  scatter: "geom_point",
  bubble: "geom_point", // bubble = geom_point with a size aes
  heatmap: "geom_tile",
});

/**
 * Parse direction: geom name -> chart type. Also accepts geoms the generator
 * never emits but a human-written script might use: `geom_bar` (an alias for
 * `geom_col` when paired with `stat = "identity"`, treated the same as bar
 * here) and `geom_area` (parsed as a line chart with `appearance.area = true`
 * — an appearance variant, not a distinct chart type).
 */
export const CHART_FOR_R_GEOM = Object.freeze({
  geom_line: "line",
  geom_col: "bar",
  geom_bar: "bar",
  geom_point: "scatter", // upgraded to "bubble" by the parser when a size aes is present
  geom_tile: "heatmap",
  geom_area: "line",
});

/** Canonical Stata command prefix for each chart type this codegen supports. */
export const STATA_COMMAND_FOR_CHART = Object.freeze({
  line: "twoway line",
  scatter: "twoway scatter",
  bar: "graph bar",
});

/** Parse direction: Stata command prefix -> chart type (`graph hbar` too). */
export const CHART_FOR_STATA_COMMAND = Object.freeze({
  "twoway line": "line",
  "twoway scatter": "scatter",
  "graph bar": "bar",
  "graph hbar": "bar", // + appearance.orientation = "horizontal"
});

/**
 * Generic (chart-type-agnostic) role <-> aes name table. Kept for
 * documentation and tests; `aesForRole`/`roleForAes` below resolve the one
 * context-dependent case (bar's `category` role) that this flat table can't
 * express on its own.
 */
export const AES_FOR_ROLE = Object.freeze({
  x: "x",
  y: "y",
  series: "color",
  size: "size",
  category: "x", // bar only — the category dimension rides the x aesthetic
});

export const ROLE_FOR_AES = Object.freeze({
  x: "x",
  y: "y",
  color: "series",
  colour: "series",
  size: "size",
  group: "series",
});

/**
 * Role -> aes name, given the chart type. On a bar chart the `category` role
 * rides the `x` aesthetic (there is no dedicated "category" aesthetic in
 * ggplot); on a heatmap the value (`color`) role rides `fill`, since
 * `geom_tile` shades cells rather than points/lines. Every other role maps
 * generically via AES_FOR_ROLE.
 */
export function aesForRole(role, chartType) {
  if (chartType === "bar" && role === "category") return "x";
  if (chartType === "heatmap" && role === "color") return "fill";
  if (chartType === "line" && role === "series") return "color";
  if (["x", "y", "size", "color"].includes(role)) return role;
  return null;
}

/**
 * Aes name -> role, given the chart type (the reverse of `aesForRole`).
 * `colour` is treated as `color`; `group` is treated as `series` (ggplot's
 * grouping aesthetic without an explicit color mapping).
 */
export function roleForAes(aesName, chartType) {
  const name = aesName === "colour" ? "color" : aesName;
  if (name === "group") return "series";
  if (chartType === "bar" && name === "x") return "category";
  if (chartType === "heatmap" && name === "fill") return "color";
  if (chartType === "line" && name === "color") return "series";
  if (["x", "y", "size", "color"].includes(name)) return name;
  return null;
}

/**
 * A Stata-safe identifier: lowercase, non-alphanumeric runs collapsed to a
 * single underscore, leading/trailing underscores trimmed, and a `v_` prefix
 * added when the result would otherwise start with a digit (Stata variable
 * names may not).
 */
export function slugForField(name) {
  if (!name) return "";
  let slug = String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (/^[0-9]/.test(slug)) slug = `v_${slug}`;
  return slug;
}

/**
 * Reverse lookup of `slugForField` over a schema's field catalog (plus the
 * always-present `Year`/`Location` fields, in case a schema's `fields` map
 * doesn't declare them explicitly). Returns null when no field slugs to the
 * given value.
 */
export function fieldForSlug(slug, schema) {
  if (!slug) return null;
  const known = new Set(Object.keys(schema?.fields || {}));
  known.add("Year");
  known.add("Location");
  for (const name of known) {
    if (slugForField(name) === slug) return name;
  }
  return null;
}

const CODEGEN_UNSUPPORTED = "CODEGEN_UNSUPPORTED";

/**
 * Named spec features the given language's v1 code generation cannot
 * express. Each finding is `{ code: "CODEGEN_UNSUPPORTED", feature, message }`
 * — informational, never blocking (code still generates from what it can).
 */
export function featureCoverage(spec, lang) {
  const findings = [];
  const supported = SUPPORTED_CHART_TYPES[lang] || [];
  const langLabel = lang === "r" ? "R" : "Stata";

  if (!supported.includes(spec?.chartType)) {
    findings.push({
      code: CODEGEN_UNSUPPORTED,
      feature: `chart type "${spec?.chartType}"`,
      message: `${langLabel} code generation does not support the "${spec?.chartType}" chart type yet.`,
    });
  }

  if (Array.isArray(spec?.layers) && spec.layers.length) {
    findings.push({
      code: CODEGEN_UNSUPPORTED,
      feature: "layers",
      message: "Additional layers are not translated into generated code.",
    });
  }

  if (Array.isArray(spec?.annotations) && spec.annotations.length) {
    findings.push({
      code: CODEGEN_UNSUPPORTED,
      feature: "annotations",
      message: "Annotations are not translated into generated code.",
    });
  }

  if (Array.isArray(spec?.referenceLines) && spec.referenceLines.length) {
    findings.push({
      code: CODEGEN_UNSUPPORTED,
      feature: "reference lines",
      message: "Reference lines are not translated into generated code.",
    });
  }

  if (spec?.transform && spec.transform !== "actual") {
    findings.push({
      code: CODEGEN_UNSUPPORTED,
      feature: `transform "${spec.transform}"`,
      message: `Generated code uses untransformed ("actual") values; the "${spec.transform}" transform is not applied in code.`,
    });
  }

  const extraFilterKeys = Object.keys(spec?.filters || {}).filter(
    (key) => key !== "subset" && key !== "source",
  );
  if (extraFilterKeys.length) {
    findings.push({
      code: CODEGEN_UNSUPPORTED,
      feature: "stratification filters",
      message: `Filters beyond subset/source (${extraFilterKeys.join(", ")}) are not applied in generated code.`,
    });
  }

  return findings;
}
