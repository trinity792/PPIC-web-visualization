/**
 * remarkWikilinks.js — Obsidian wikilinks & embeds → links/images (remark).
 *
 * Rewrites `[[target]]`, `[[target#heading]]`, `[[target|alias]]` into links to
 * `/documents/<slug>` (unresolved targets fall back to plain text), and
 * `![[image.png]]` / `[[image.png]]` into images served by the /api/doc-asset
 * route. Resolution maps are computed on the server and passed in as options, so
 * this plugin stays pure (no fs) and runs safely inside the client renderer.
 *
 * Options:
 *   linkMap  {Object} — lowercased filename (no ext) → document slug
 *   assetMap {Object} — lowercased image filename → docs-relative path
 *
 * Usage:
 *   remarkPlugins: [[remarkWikilinks, { linkMap, assetMap }]]
 */

import { visit, SKIP } from "unist-util-visit";
import GithubSlugger from "github-slugger";

const WIKILINK = /(!?)\[\[([^\]]+)\]\]/g;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

export default function remarkWikilinks({ linkMap = {}, assetMap = {} } = {}) {
  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || index == null || !node.value.includes("[[")) return;

      const value = node.value;
      const nodes = [];
      let last = 0;
      let match;
      WIKILINK.lastIndex = 0;

      while ((match = WIKILINK.exec(value))) {
        const [full, , inner] = match;
        if (match.index > last) {
          nodes.push({ type: "text", value: value.slice(last, match.index) });
        }
        last = match.index + full.length;

        const [rawTarget, alias] = inner.split("|").map((s) => s.trim());
        const [target, heading] = rawTarget.split("#").map((s) => s.trim());
        const label = alias || rawTarget;

        if (IMAGE_EXT.test(target)) {
          const rel = assetMap[target.toLowerCase()];
          if (rel) {
            nodes.push({
              type: "image",
              url: `/api/doc-asset?file=${encodeURIComponent(rel)}`,
              alt: alias || target,
            });
          } else {
            nodes.push({ type: "text", value: alias || target });
          }
          continue;
        }

        const slug = linkMap[target.toLowerCase()];
        if (slug) {
          const anchor = heading ? `#${new GithubSlugger().slug(heading)}` : "";
          nodes.push({
            type: "link",
            url: `/documents/${slug}${anchor}`,
            children: [{ type: "text", value: label }],
          });
        } else {
          nodes.push({ type: "text", value: label });
        }
      }

      if (!nodes.length) return;
      if (last < value.length) nodes.push({ type: "text", value: value.slice(last) });

      parent.children.splice(index, 1, ...nodes);
      return [SKIP, index + nodes.length];
    });
  };
}
