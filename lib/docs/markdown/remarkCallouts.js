/**
 * remarkCallouts.js — Obsidian callout syntax → renderable container (remark).
 *
 * Detects blockquotes whose first line is `[!TYPE]`, `[!TYPE]+`, or `[!TYPE]-`
 * (case-insensitive, optional custom title after the marker) and rewrites the
 * blockquote into a `<div class="callout" data-callout=… data-callout-fold=…
 * data-callout-title=…>` element that the Callout component renders. The
 * marker line is stripped; all remaining blockquote content becomes the body,
 * so lists/paragraphs inside multi-line callouts are preserved.
 *
 * Data sources:
 *   - mdast tree (via unified/remark)
 *
 * Usage:
 *   remarkPlugins: [remarkCallouts]
 */

import { visit } from "unist-util-visit";

const MARKER = /^\s*\[!(\w+)\]([+-]?)[ \t]*([^\n]*)(\n?)([\s\S]*)$/;

export default function remarkCallouts() {
  return (tree) => {
    visit(tree, "blockquote", (node) => {
      const first = node.children && node.children[0];
      if (!first || first.type !== "paragraph" || !first.children?.length) return;

      const lead = first.children[0];
      if (!lead || lead.type !== "text") return;

      const m = lead.value.match(MARKER);
      if (!m) return;

      const [, type, fold, titleLine, , rest] = m;
      const title = (titleLine || "").trim();

      // Strip the marker line; keep the rest of the first text node as body.
      lead.value = rest;

      const meaningful = first.children.some((child, i) => {
        if (i === 0) return Boolean(child.value && child.value.trim());
        if (child.type === "break") return false;
        if (child.type === "text") return Boolean(child.value && child.value.trim());
        return true; // other inline content (emphasis, code, links…)
      });

      if (!meaningful) {
        node.children.shift(); // marker-only line → drop the empty paragraph
      } else if (lead.value === "") {
        first.children.shift(); // drop the now-empty leading text node…
        if (first.children[0]?.type === "break") first.children.shift(); // …and its break
      }

      node.data = node.data || {};
      node.data.hName = "div";
      node.data.hProperties = {
        className: ["callout"],
        "data-callout": type.toLowerCase(),
        "data-callout-fold": fold || "",
        ...(title ? { "data-callout-title": title } : {}),
      };
    });
  };
}
