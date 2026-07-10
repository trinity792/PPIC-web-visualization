export const COLORS = {
  primaryOrange: "#E36A36",
  dataBlue: "#084D7C",
  dataTeal: "#1B5365",
  neutral: "#6D7075",
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

  // Teal scale
  teal1: "#E4F8FF",
  teal2: "#C7F1FF",
  teal3: "#A7E9FF",
  teal4: "#B1D8E6",
  teal5: "#7FB4C6",
  teal6: "#5692A6",
  teal7: "#1B5365",
  teal8: "#1C3C46",

  // Navy blue scale (light to dark; navyBlue is the third stop)
  navyBlue1: "#B4C4D9",
  navyBlue2: "#5D7FAD",
  navyBlue3: "#2D4059",
  navyBlue4: "#233245",
  navyBlue5: "#192331",
  navyBlue6: "#0D131B",
  navyBlue7: "#050609",

  // Steel blue scale (light to dark; steelBlue is the third stop)
  steelBlue1: "#D6E1EC",
  steelBlue2: "#A5BFD5",
  steelBlue3: "#759CBF",
  steelBlue4: "#4C7AA4",
  steelBlue5: "#365674",
  steelBlue6: "#1D2F3F",
  steelBlue7: "#0A1015",

  // Complement green scale (light to dark; complementGreen is the eighth stop)
  complementGreen1: "#D9FAED",
  complementGreen2: "#C4FFE8",
  complementGreen3: "#BAE0D1",
  complementGreen4: "#91C7B1",
  complementGreen5: "#6DAD94",
  complementGreen6: "#4E9478",
  complementGreen7: "#206248",
  complementGreen8: "#1F4737",

  // Burnt orange scale (light to dark; burntOrange is the third stop)
  burntOrange1: "#F4C4B2",
  burntOrange2: "#E77F59",
  burntOrange3: "#BF471B",
  burntOrange4: "#953715",
  burntOrange5: "#69270F",
  burntOrange6: "#391508",
  burntOrange7: "#130703",

  // Gray scale (light to dark)
  gray1: "#EDEFF0",
  gray2: "#C2C9CC",
  gray3: "#9BA3A8",
  gray4: "#7B8285",
  gray5: "#595F61",
  gray6: "#383B3D",
  gray7: "#191B1C",

  // Official Maroon Red Scale (light to dark)
  maroonRed1: "#F2DDDC",
  maroonRed2: "#DBA19F",
  maroonRed3: "#9F1511",
  maroonRed4: "#832522",
  maroonRed5: "#470806",

  // Accent colors
  navyBlue: "#2D4059",
  steelBlue: "#759CBF",
  darkGray: "#0D0D0D",
  burntOrange: "#BF471B",
  complementGreen: "#1F4737",

  // Official PPIC Data Visualization Style Guide v1.0 main graphic colors.
  officialOrange: "#CA4F1A",
  officialRed: "#832522",
  officialGreen: "#196348",
  officialSeafoam: "#02BDA7",
  officialNavy: "#293B54",
  officialViolet: "#693692",
  officialBlue: "#44AFD0",
  officialLime: "#CCCB74",
  officialGray: "#CFCFCF",
  officialDarkGray: "#1A1918",
};

// Accessible foreground/background pairs for document-card thumbnails and
// content-type badges. Each supported content type receives one unique pair.
export const DOCUMENT_THUMBNAIL_COLORS = Object.freeze({
  mutedSteelBlue: Object.freeze({ fg: COLORS.steelBlue5, bg: COLORS.gray1 }),
  mutedComplementGreen: Object.freeze({ fg: COLORS.complementGreen8, bg: COLORS.gray1 }),
  mutedComplementGreen2: Object.freeze({ fg: COLORS.complementGreen7, bg: COLORS.gray1 }),
  mutedBlue: Object.freeze({ fg: COLORS.blue5, bg: COLORS.gray1 }),
  mutedBlue2: Object.freeze({ fg: COLORS.blue4, bg: COLORS.gray1 }),
  mutedOrange: Object.freeze({ fg: COLORS.primaryOrange, bg: COLORS.gray1 }),
  mutedOrange2: Object.freeze({ fg: COLORS.burntOrange, bg: COLORS.gray1 }),
  mutedTeal: Object.freeze({ fg: COLORS.teal7, bg: COLORS.gray1 }),
  mutedNavyBlue: Object.freeze({ fg: COLORS.navyBlue2, bg: COLORS.gray1 }),
  mutedGray: Object.freeze({ fg: COLORS.gray6, bg: COLORS.gray1 }),
  mutedRed: Object.freeze({ fg: COLORS.maroonRed4, bg: COLORS.gray1 }),
  
  complementGreen1: Object.freeze({ fg: COLORS.complementGreen8, bg: COLORS.complementGreen4 }),
  tealLight: Object.freeze({ fg: COLORS.teal7, bg: COLORS.teal4 }),
  orangeAlign: Object.freeze({ fg: COLORS.orange5, bg: COLORS.orange2 }),
  orangeLight: Object.freeze({ fg: COLORS.orange5, bg: COLORS.orange1 }),
  orangeMedium: Object.freeze({ fg: COLORS.orange7, bg: COLORS.orange2 }),
  orangeDark: Object.freeze({ fg: COLORS.white, bg: COLORS.orange5 }),
  steelBlue1: Object.freeze({ fg: COLORS.steelBlue5, bg: COLORS.steelBlue1 }),
  steelBlue2: Object.freeze({ fg: COLORS.steelBlue5, bg: COLORS.steelBlue2 }),
  steelBlue3: Object.freeze({ fg: COLORS.white, bg: COLORS.steelBlue3 }),
  blueLight: Object.freeze({ fg: COLORS.blue5, bg: COLORS.blue1 }),
  blueMedium: Object.freeze({ fg: COLORS.blue7, bg: COLORS.blue2 }),
  blueDark: Object.freeze({ fg: COLORS.white, bg: COLORS.blue4 }),
  blueDeep: Object.freeze({ fg: COLORS.blue1, bg: COLORS.blue5 }),
  neutralLight: Object.freeze({ fg: COLORS.gray6, bg: COLORS.gray1 }),
  neutralMedium: Object.freeze({ fg: COLORS.gray7, bg: COLORS.gray2 }),
  neutralDark: Object.freeze({ fg: COLORS.white, bg: COLORS.gray5 }),
  neutralDeep: Object.freeze({ fg: COLORS.gray1, bg: COLORS.gray6 }),
  fallback: Object.freeze({ fg: COLORS.darkGray, bg: COLORS.lightGray }),
});

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
