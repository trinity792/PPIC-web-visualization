"use client";

/**
 * DocTableOfContents.js — sticky H1–H3 outline with scrollspy.
 *
 * Mirrors the UI Kit's "Contents" sidebar (app/ui-kit/page.js) but indents by
 * heading depth and highlights the heading currently in view using an
 * IntersectionObserver. Anchor ids come from extractToc (github-slugger), which
 * matches the rehype-slug ids on the rendered headings.
 *
 * Props:
 *   toc {Array<{depth:number, text:string, id:string}>}
 *
 * Data sources:
 *   - Via props from DocumentView
 *
 * UI Kit reference:
 *   - Reuses the "Table of Contents" navigation pattern
 */

/* eslint-disable react/prop-types */

import React, { useEffect, useState } from "react";

function buildTocTree(toc) {
  const roots = [];
  const stack = [{ depth: 0, children: roots }];

  toc.forEach((heading, index) => {
    while (stack.length > 1 && stack[stack.length - 1].depth >= heading.depth) {
      stack.pop();
    }

    const node = {
      ...heading,
      key: `${heading.id}-${index}`,
      children: [],
    };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  });

  return roots;
}

function TocBranch({ items, activeId, nested = false }) {
  return (
    <ol
      className={`space-y-1 ${
        nested ? "ml-3 border-l border-ppic-neutral-100" : ""
      }`}
    >
      {items.map((item) => {
        const active = item.id === activeId;

        return (
          <li key={item.key}>
            <a
              href={`#${item.id}`}
              className={`block rounded-r-lg px-3 py-1.5 text-[14px] leading-snug transition-colors hover:bg-ppic-neutral-50 hover:text-ppic-orange-300 ${
                active ? "font-semibold text-ppic-orange-300" : "text-ppic-neutral-400"
              }`}
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {item.text}
            </a>
            {item.children.length ? (
              <TocBranch items={item.children} activeId={activeId} nested />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function DocTableOfContents({ toc }) {
  const [activeId, setActiveId] = useState(toc[0]?.id || null);
  const tocTree = buildTocTree(toc);

  useEffect(() => {
    if (!toc.length) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 }
    );
    toc.forEach((t) => {
      const el = document.getElementById(t.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [toc]);

  if (!toc.length) return null;

  return (
    <aside className="sticky top-28 hidden max-h-[calc(100svh-8rem)] self-start overflow-y-auto overscroll-contain pb-8 lg:block">
      <nav className="space-y-1">
        <p
          className="mb-3 text-[12px] uppercase tracking-[0.18em] text-neutral-500"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          Contents
        </p>
        <TocBranch items={tocTree} activeId={activeId} />
      </nav>
    </aside>
  );
}
