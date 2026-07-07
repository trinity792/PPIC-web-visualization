/**
 * generate-palette-css.mjs — palette single-owner build step.
 *
 * `lib/constants.js` COLORS is the single source of truth for the PPIC brand
 * palette. This script regenerates the `--ppic-*` ramp block in
 * `app/globals.css` (between the `ppic-palette:begin` / `ppic-palette:end`
 * markers) from COLORS, so a value changed in JS propagates to CSS instead of
 * being hand-synced (projectSpec "Frontend — Flagged Issues" item 7; decided
 * direction 2026-07-04, implemented in the graph-editor overhaul Phase 0).
 *
 * The two numbering schemes (JS `orange1..7` = 1-based, CSS
 * `--ppic-orange-50..700` = 50-based) are unified HERE, in one explicit
 * mapping table, rather than by renaming the CSS variables — renaming would
 * touch every Tailwind utility class that references them and break the
 * "renders pixel-identical" exit criterion for Phase 0.
 *
 * Usage:
 *   node tools/generate-palette-css.mjs          # rewrite the block in place
 *   node tools/generate-palette-css.mjs --check  # exit 1 if the block drifted
 *
 * Outputs:
 *   app/globals.css (generated block only; everything else untouched)
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { COLORS } from "../lib/constants.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = path.join(rootDir, "app", "globals.css");

const BEGIN_MARKER =
  "/* ppic-palette:begin — generated from lib/constants.js COLORS by tools/generate-palette-css.mjs; edit COLORS and run `npm run build:palette`, never this block */";
const END_MARKER = "/* ppic-palette:end */";

/**
 * CSS ramp → COLORS key mapping. Order inside each ramp is the CSS stop order
 * (50, 100, 200, …). The orange ramp interleaves `primaryOrange` between
 * orange2 and orange3 — that is the historical CSS layout the site's Tailwind
 * classes depend on, kept verbatim.
 */
const RAMPS = [
  {
    comment: "/* ===== PPIC brand tokens ===== */\n  /* Orange ramp (primary brand) */",
    prefix: "orange",
    keys: ["orange1", "orange2", "primaryOrange", "orange3", "orange4", "orange5", "orange6", "orange7"],
  },
  {
    comment: "/* Blue ramp (data / accent) */",
    prefix: "blue",
    keys: ["blue1", "blue2", "blue3", "blue4", "blue5", "blue6", "blue7"],
  },
  {
    comment: "/* Teal ramp (data / accent) */",
    prefix: "teal",
    keys: ["teal1", "teal2", "teal3", "teal4", "teal5", "teal6", "teal7", "teal8"],
  },
  {
    comment: "/* Site accent ramps */",
    prefix: "navy-blue",
    keys: ["navyBlue1", "navyBlue2", "navyBlue3", "navyBlue4", "navyBlue5", "navyBlue6", "navyBlue7"],
  },
  {
    comment: null, // steel-blue continues the "Site accent ramps" group
    prefix: "steel-blue",
    keys: ["steelBlue1", "steelBlue2", "steelBlue3", "steelBlue4", "steelBlue5", "steelBlue6", "steelBlue7"],
  },
  {
    comment: null,
    prefix: "complement-green",
    keys: [
      "complementGreen1",
      "complementGreen2",
      "complementGreen3",
      "complementGreen4",
      "complementGreen5",
      "complementGreen6",
      "complementGreen7",
      "complementGreen8",
    ],
  },
  {
    comment: null,
    prefix: "burnt-orange",
    keys: ["burntOrange1", "burntOrange2", "burntOrange3", "burntOrange4", "burntOrange5", "burntOrange6", "burntOrange7"],
  },
  {
    comment: "/* Neutral ramp */",
    prefix: "neutral",
    keys: ["gray1", "gray2", "gray3", "gray4", "gray5", "gray6", "gray7"],
  },
];

/** CSS stop labels in order: 50, 100, 200, 300, … */
function stopLabel(index) {
  return index === 0 ? "50" : String(index * 100);
}

function generateBlock() {
  const lines = [`  ${BEGIN_MARKER}`];
  for (const [rampIndex, ramp] of RAMPS.entries()) {
    if (ramp.comment) {
      if (rampIndex > 0) lines.push("");
      lines.push(`  ${ramp.comment}`);
    }
    for (const [i, key] of ramp.keys.entries()) {
      const hex = COLORS[key];
      if (!hex) throw new Error(`COLORS.${key} is missing — the RAMPS table names a key that no longer exists.`);
      lines.push(`  --ppic-${ramp.prefix}-${stopLabel(i)}: ${hex.toLowerCase()};`);
    }
  }
  lines.push(`  ${END_MARKER}`);
  return lines.join("\n");
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const css = readFileSync(cssPath, "utf8");

  const beginAt = css.indexOf(BEGIN_MARKER);
  const endAt = css.indexOf(END_MARKER);
  if (beginAt === -1 || endAt === -1 || endAt < beginAt) {
    console.error(`generate-palette-css: markers not found in ${cssPath} — refusing to write.`);
    process.exit(1);
  }

  const blockStart = css.lastIndexOf("  ", beginAt); // include the marker's indent
  const blockEnd = endAt + END_MARKER.length;
  const current = css.slice(blockStart, blockEnd);
  const next = generateBlock();

  if (current === next) {
    console.log("generate-palette-css: up to date.");
    return;
  }
  if (checkOnly) {
    console.error(
      "generate-palette-css: app/globals.css --ppic-* ramp has drifted from lib/constants.js COLORS. Run `npm run build:palette`.",
    );
    process.exit(1);
  }
  writeFileSync(cssPath, css.slice(0, blockStart) + next + css.slice(blockEnd));
  console.log("generate-palette-css: regenerated the --ppic-* ramp from COLORS.");
}

main();
