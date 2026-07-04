export const COLORS = {
  primaryOrange: "#E36A36",
  lightGray: "#F2F2F2",
  white: "#FFFFFF",
  primaryBackground: "#F2F2F2", // == lightGray; can't self-reference inside this literal

  // Orange scale (light to dark)
  orange1: "#FED4BF",
  orange2: "#FC9C69",
  orange3: "#E36A18",
  orange4: "#B25210",
  orange5: "#7F3808",
  orange6: "#4C1F03",
  orange7: "#1E0801",

  // Blue scale (light to dark)
  blue1: "#B5DBFD",
  blue2: "#66B7FC",
  blue3: "#1891E3",
  blue4: "#106FB0",
  blue5: "#084D7C",
  blue6: "#022A47",
  blue7: "#000B18",

  // Gray scale (light to dark)
  gray1: "#EDEFF0",
  gray2: "#C2C9CC",
  gray3: "#9BA3A8",
  gray4: "#7B8285",
  gray5: "#595F61",
  gray6: "#383B3D",
  gray7: "#191B1C",

  // Accent colors
  navyBlue: "#2D4059",
  steelBlue: "#759CBF",
  darkGray: "#0D0D0D",
  burntOrange: "#BF471B",
};

export const GOOGLE_FONTS = [
  "Source Sans 3",
  "Inter",
  "Georgia",
  "Orbitron",
];

export const BASE_PLOTLY_COLORS = [
  COLORS.blue3,
  COLORS.orange3,
  COLORS.navyBlue,
  COLORS.steelBlue,
  COLORS.burntOrange,
  COLORS.blue5,
  COLORS.orange2,
  COLORS.gray5,
  COLORS.blue2,
  COLORS.orange4,
];

export const CHART_HEIGHTS = Object.freeze({
  default: 520,
  preview: 420,
  uiKit: 256,
});

export const CHART_SIDEBAR = Object.freeze({
  baseRem: 16,
  minScale: 1.3,
  maxScale: 2.25,
  stretchScale: 2,
  navbarHeightRem: 7.5,
});

export const VIEWPORT_BREAKPOINTS = Object.freeze({
  mobile: 768,
});

export const UI_SIDEBAR = Object.freeze({
  width: "16rem",
  mobileWidth: "18rem",
  iconWidth: "3rem",
});

// Global page content width. Matches the graph editor's main content area when
// the sidebar is hidden — full-bleed, i.e. no max-width cap. This value is
// injected as the `--page-max-width` CSS variable in app/layout.js and consumed
// by the shared `.page-container` utility, so changing it re-caps every page at
// once (e.g. set to "1600px" to cap all pages).
export const PAGE_LAYOUT = Object.freeze({
  maxWidth: "none",
});

export const UI_KIT_CHART_HEIGHT = CHART_HEIGHTS.uiKit;

// Inline ```svg blocks in the docs Markdown renderer render at this width by
// default. Per-block override via the fence language token — ```svg-80 → 80%
// (the meta string is stripped by rehype-raw, so the size rides on the class).
// Consumed by components/documents/MarkdownArticle.js.
export const DOC_SVG_DEFAULT_SIZE = "60%";
