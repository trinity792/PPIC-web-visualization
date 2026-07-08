import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import remarkIndentNesting from "@/lib/docs/markdown/remarkIndentNesting";

/** Render markdown to HTML through the app's list-affecting plugin order. */
function render(md) {
  return renderToStaticMarkup(
    React.createElement(
      ReactMarkdown,
      { remarkPlugins: [remarkGfm, remarkIndentNesting] },
      md
    )
  );
}

/** Count nested lists: an <li> that directly contains a <ul>/<ol> before it closes. */
function nestedListCount(html) {
  return (html.match(/<li[^>]*>(?:(?!<\/li>)[\s\S])*?<[uo]l/g) || []).length;
}

describe("remarkIndentNesting", () => {
  it("nests sub-bullets indented 1 space under a dash (below CommonMark threshold)", () => {
    const html = render(["- Parent", " - child A", " - child B"].join("\n"));
    // The parent <li> should contain a nested <ul> holding both children.
    expect(html).toMatch(/<li>Parent\s*<ul>\s*<li>child A<\/li>\s*<li>child B<\/li>\s*<\/ul>/);
  });

  it("nests sub-bullets under-indented (2 spaces) below an ordered item", () => {
    const html = render(["1. Parent", "  - child A", "  - child B"].join("\n"));
    // Without the plugin these split into a sibling <ul>; now they nest.
    expect(nestedListCount(html)).toBe(1);
    expect(html).toMatch(/<li>Parent\s*<ul>\s*<li>child A<\/li>\s*<li>child B<\/li>\s*<\/ul>\s*<\/li>/);
  });

  it("leaves a correctly-indented nested list unchanged", () => {
    const html = render(["- Parent", "  - child A", "    - grandchild"].join("\n"));
    // one ul inside the parent li, one ul inside child A's li
    expect(nestedListCount(html)).toBe(2);
    expect(html).toMatch(/grandchild/);
  });

  it("keeps a flat list flat", () => {
    const html = render(["- a", "- b", "- c"].join("\n"));
    expect(nestedListCount(html)).toBe(0);
    expect(html.match(/<li>/g)).toHaveLength(3);
  });

  it("does not merge two separate lists split by a paragraph", () => {
    const html = render(["- a", "- b", "", "text", "", "- c", "- d"].join("\n"));
    expect(nestedListCount(html)).toBe(0);
    expect(html.match(/<ul>/g)).toHaveLength(2);
  });

  it("preserves ordered vs unordered marker types across levels", () => {
    const html = render(["- Parent", "  1. first", "  2. second"].join("\n"));
    expect(html).toMatch(/<li>Parent\s*<ol>\s*<li>first<\/li>\s*<li>second<\/li>\s*<\/ol>/);
  });

  it("preserves task-list checkboxes on nested items", () => {
    const html = render(["- Parent", " - [ ] todo", " - [x] done"].join("\n"));
    const boxes = html.match(/<input[^>]*type="checkbox"[^>]*>/g) || [];
    expect(boxes).toHaveLength(2);
    expect(html).toMatch(/checked/);
    expect(nestedListCount(html)).toBe(1);
  });

  it("handles three indentation depths driven purely by source column", () => {
    const html = render(["- L0", " - L1", "  - L2"].join("\n"));
    // L1 nested under L0, L2 nested under L1 → two nested lists.
    expect(nestedListCount(html)).toBe(2);
  });
});
