/**
 * extractToc.js — build a table-of-contents outline from Markdown (server).
 *
 * Parses the body and collects H1–H3 headings as `{ depth, text, id }`. Heading
 * ids are generated with `github-slugger`, the same slugger `rehype-slug` uses,
 * so TOC anchors match the ids rendered onto the headings.
 *
 * Data sources:
 *   - raw Markdown string
 *
 * Usage:
 *   const toc = extractToc(content);
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import GithubSlugger from "github-slugger";

/** Concatenate the visible text of a heading's inline children. */
function headingText(node) {
  let text = "";
  visit(node, (child) => {
    if (child.type === "text" || child.type === "inlineCode") text += child.value;
  });
  return text.trim();
}

export function extractToc(content) {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(content || "");
  const slugger = new GithubSlugger();
  const toc = [];

  visit(tree, "heading", (node) => {
    if (node.depth > 3) return;
    const text = headingText(node);
    if (!text) return;
    toc.push({ depth: node.depth, text, id: slugger.slug(text) });
  });

  return toc;
}
