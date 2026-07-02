/**
 * remarkLineParagraphs.js — treat single newlines as paragraph breaks (remark).
 *
 * The docs are authored in Obsidian, where each source line is its own block.
 * CommonMark instead folds single-newline-separated lines into ONE paragraph
 * (soft breaks render as spaces), collapsing what the author sees as separate
 * paragraphs. This plugin splits a paragraph on its internal soft breaks (`\n`
 * in text) and hard breaks so each line renders as its own <p> and receives the
 * standard paragraph spacing.
 *
 * Only paragraphs that actually contain a line break are affected — a paragraph
 * written on a single source line has no `\n` and is left untouched.
 *
 * Data sources:
 *   - mdast tree (via unified/remark)
 *
 * Usage:
 *   remarkPlugins: [remarkLineParagraphs]
 */

import { visit, SKIP } from "unist-util-visit";

export default function remarkLineParagraphs() {
  return (tree) => {
    visit(tree, "paragraph", (node, index, parent) => {
      if (index == null || !parent) return undefined;

      const groups = [[]];
      const startGroup = () => groups.push([]);
      const add = (n) => groups[groups.length - 1].push(n);

      for (const child of node.children) {
        if (child.type === "break") {
          startGroup();
        } else if (child.type === "text" && child.value.includes("\n")) {
          child.value.split("\n").forEach((part, i) => {
            if (i > 0) startGroup();
            if (part.length) add({ type: "text", value: part });
          });
        } else {
          add(child);
        }
      }

      const paragraphs = groups
        .filter((children) => children.length > 0)
        .map((children) => ({ type: "paragraph", children }));

      if (paragraphs.length <= 1) return undefined; // nothing to split
      parent.children.splice(index, 1, ...paragraphs);
      return [SKIP, index + paragraphs.length];
    });
  };
}
