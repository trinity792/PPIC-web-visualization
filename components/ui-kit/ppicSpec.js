/**
 * ppicSpec.js — Verbatim data transcribed from the official
 * "PPIC Data Visualization Style Guide" (Version 1.0, 06.24.2021).
 *
 * These hex values, RGB triples, and type specs reproduce the published PDF
 * exactly and INTENTIONALLY differ from the app's runtime design tokens in
 * lib/constants.js. They back the "Official PPIC Spec", "Color Mapping",
 * "Chart Anatomy", "Chart Types", "Data Tables", and "Authoring Tools"
 * sections of the UI Kit, which document the source-of-truth guidance rather
 * than the app's adapted implementation.
 *
 * The colour RAMPS moved to `lib/visualization/ppicRamps.js` and are
 * re-exported below: `palettes.js` renders from them, and `lib/` must not
 * import from `components/`. They are still the same guide-verbatim values;
 * this module remains the place the UI Kit reads them from.
 *
 * Consumers:
 *   - OfficialSpecShowcase.js
 *   - ColorMappingShowcase.js
 *   - ChartAnatomyShowcase.js
 *   - ChartTypesShowcase.js
 *   - DataTablesShowcase.js
 *   - ToolingShowcase.js
 */

// The guide's colour ramps, owned by the renderer-side module (see above).
export {
  PPIC_CHOROPLETH_DIVERGENT,
  PPIC_SEQUENTIAL,
} from "@/lib/visualization/ppicRamps";

// ── Main graphic colors (guide p.13) ─────────────────────────────────
export const PPIC_MAIN_COLORS = [
  { name: "Orange", hex: "#CA4F1A", rgb: "202, 79, 26" },
  { name: "Red", hex: "#832522", rgb: "131, 37, 34" },
  { name: "Green", hex: "#196348", rgb: "25, 99, 72" },
  { name: "Seafoam", hex: "#02BDA7", rgb: "2, 189, 167" },
  { name: "Navy", hex: "#293B54", rgb: "41, 59, 84" },
  { name: "Violet", hex: "#693692", rgb: "105, 54, 146" },
  { name: "Blue", hex: "#44AFD0", rgb: "68, 175, 208" },
  { name: "Lime", hex: "#CCCB74", rgb: "204, 203, 116" },
  { name: "Gray", hex: "#CFCFCF", rgb: "207, 207, 207" },
  { name: "Dark Gray", hex: "#1A1918", rgb: "26, 25, 24" },
];

// Name → hex lookup for the schemes below.
export const PPIC_HEX = Object.fromEntries(
  PPIC_MAIN_COLORS.map((c) => [c.name, c.hex]),
);

// ── Categorical pairings for two groups (guide p.14) ─────────────────
export const PPIC_TWO_GROUP_PAIRS = [
  ["Orange", "Navy"],
  ["Green", "Lime"],
  ["Lime", "Navy"],
  ["Orange", "Violet"],
  ["Green", "Blue"],
];

// Political-party denotation only (guide p.14).
export const PPIC_POLITICAL = [
  { name: "Democratic", hex: "#0F4880" },
  { name: "Republican", hex: "#D96A66" },
  { name: "Independent", hex: "#CFCFCF" },
];

// ── Ordered categorical schemes, 3–10 groups (guide pp.15–16) ────────
// The published order is the recommended contrast sequence; take the first N.
export const PPIC_GROUP_SCHEMES = [
  { count: 3, colors: ["Orange", "Navy", "Gray"] },
  { count: 4, colors: ["Orange", "Navy", "Lime", "Blue"] },
  { count: 5, colors: ["Orange", "Navy", "Lime", "Blue", "Dark Gray"] },
  { count: 6, colors: ["Orange", "Navy", "Lime", "Blue", "Violet", "Dark Gray"] },
  { count: 7, colors: ["Orange", "Navy", "Lime", "Blue", "Violet", "Seafoam", "Dark Gray"] },
  { count: 8, colors: ["Orange", "Navy", "Lime", "Blue", "Violet", "Seafoam", "Dark Gray", "Gray"] },
  { count: 9, colors: ["Orange", "Navy", "Lime", "Blue", "Violet", "Seafoam", "Gray", "Red", "Dark Gray"] },
  { count: 10, colors: ["Orange", "Navy", "Lime", "Blue", "Violet", "Seafoam", "Gray", "Red", "Green", "Dark Gray"] },
];

// ── Typography roles (guide pp.11–12) ────────────────────────────────
export const PPIC_TYPE_ROLES = [
  {
    role: "Figure (Eyebrow)",
    font: "Proxima Nova",
    weight: "Bold",
    size: "12px",
    line: "16px",
    tracking: "5%",
    color: null,
    upper: true,
    sample: "Public Policy Institute of California",
  },
  {
    role: "Title",
    font: "Proxima Nova",
    weight: "Bold",
    size: "20px",
    line: "40px",
    tracking: "1%",
    color: null,
    sample: "Public Policy Institute of California",
  },
  {
    role: "Subtitle",
    font: "Proxima Nova",
    weight: "Regular",
    size: "18px",
    line: "40px",
    tracking: "-1%",
    color: "#646D76",
    sample: "Public Policy Institute of California",
  },
  {
    role: "Key Title",
    font: "Proxima Nova",
    weight: "Bold",
    size: "16px",
    line: "16px",
    tracking: "1%",
    color: null,
    sample: "Public Policy Institute of California",
  },
  {
    role: "Key Descriptor",
    font: "Proxima Nova",
    weight: "Regular",
    size: "14px",
    line: "16px",
    tracking: "1%",
    color: null,
    sample: "Public Policy Institute of California",
  },
  {
    role: "Body Copy",
    font: "Proxima Nova",
    weight: "Regular",
    size: "16px",
    line: "40px",
    tracking: "-1%",
    color: null,
    sample: "Public Policy Institute of California",
  },
  {
    role: "Data Label",
    font: "Arial",
    weight: "Regular",
    size: "14px",
    line: "16px",
    tracking: "0%",
    color: null,
    sample: "Public Policy Institute of California",
  },
  {
    role: "Data Label — X Axis",
    font: "Arial",
    weight: "Regular",
    size: "14px",
    line: "16px",
    tracking: "0%",
    color: "#6C7075",
    sample: "Public Policy Institute of California",
  },
  {
    role: "Data Label — Y Axis",
    font: "Arial",
    weight: "Regular",
    size: "14px",
    line: "16px",
    tracking: "0%",
    color: "#6C7075",
    sample: "Public Policy Institute of California",
  },
  {
    role: "Source / Notes",
    font: "Arial",
    weight: "Regular",
    size: "11px",
    line: "40px",
    tracking: "-1%",
    color: null,
    sample: "Public Policy Institute of California",
  },
];

// ── Authoring-tool capabilities & limitations (guide pp.6–9) ─────────
export const PPIC_TOOLS = [
  {
    name: "Excel",
    capabilities: [
      "Low learning curve for hand-off from research / content teams",
      "Data easily gathered; simple charts generated and designed (e.g. Illustrator)",
      "JPG or PNG files embed easily onto the site",
    ],
    limitations: [
      "Limited typography customization",
      "Extra design step and time needed",
      "Chart and graph functionality limited to Excel templates",
    ],
  },
  {
    name: "Infogram",
    capabilities: [
      "Easy for non-designers (drag-and-drop) and can be branded",
      "Range of charts, including maps",
      "Downloads in many formats; interactive viz for embedding",
      "API for additional data sources",
      "Typography and color customization",
    ],
    limitations: ["Limited data sources", "Limitations on range of charts"],
  },
  {
    name: "Datawrapper",
    capabilities: [
      "Built for adding charts and maps to stories — interactive and commonly embedded",
      "Charts created with a single click; wide range of types including maps",
    ],
    limitations: ["Data sources are limited — you must copy and paste data into the tool"],
  },
  {
    name: "Tableau",
    capabilities: [
      "Numerous versions — desktop app, server, online",
      "Many import options (CSV, Google Analytics); refreshes consistent data sets",
      "Many chart formats and excellent mapping capabilities",
      "Can be branded",
    ],
    limitations: [
      "Cost and a fairly steep learning curve",
      "Surveys require manipulation and cleaning to optimize (fewer columns, more rows)",
    ],
  },
];
