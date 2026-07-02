/**
 * remarkSymbols.js — ASCII→Unicode symbol prettifier (remark transform).
 *
 * Reimplements the character map of the Obsidian "Symbols Prettifier" plugin as
 * a small remark plugin: it rewrites sequences like `->`, `>=`, `!=`, `--` in
 * plain text into their Unicode equivalents. Only `text` mdast nodes are visited,
 * so code (`code`/`inlineCode`) and math (`math`/`inlineMath`) — which carry a
 * `value`, not `text` children — are left untouched.
 *
 * Attribution: symbol set inspired by Symbols Prettifier by Florian Woelki.
 *
 * Data sources:
 *   - mdast tree (via unified/remark)
 *
 * Usage:
 *   remarkPlugins: [remarkSymbols]
 */

import { visit } from "unist-util-visit";

// Longest patterns first so e.g. "<->" wins over "<-".
const CHARACTER_MAP = [
  ["<->", "↔"],
  ["<=>", "⇔"],
  ["===", "≡"],
  ["->", "→"],
  ["<-", "←"],
  ["<=", "⇐"],
  ["=>", "⇒"],
  ["--", "–"],
  ["!=", "≠"],
  ["=<", "≤"],
  [">=", "≥"],
  ["+-", "±"],
  ["-+", "∓"],
];

const PATTERN = /<->|<=>|===|->|<-|<=|=>|--|!=|=<|>=|\+-|-\+/g;
const LOOKUP = new Map(CHARACTER_MAP);

export default function remarkSymbols() {
  return (tree) => {
    visit(tree, "text", (node) => {
      if (node.value && PATTERN.test(node.value)) {
        PATTERN.lastIndex = 0;
        node.value = node.value.replace(PATTERN, (m) => LOOKUP.get(m) || m);
      }
      PATTERN.lastIndex = 0;
    });
  };
}
