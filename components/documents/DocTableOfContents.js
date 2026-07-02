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

const INDENT = { 1: 0, 2: 12, 3: 24 };

export function DocTableOfContents({ toc }) {
  const [activeId, setActiveId] = useState(toc[0]?.id || null);

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
    <aside className="hidden lg:block">
      <nav className="sticky top-28 max-h-[calc(100vh-8rem)] space-y-1 overflow-y-auto pb-8">
        <p
          className="mb-3 text-[12px] uppercase tracking-[0.18em] text-neutral-500"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          Contents
        </p>
        {toc.map((t, i) => {
          const active = t.id === activeId;
          return (
            <a
              key={`${t.id}-${i}`}
              href={`#${t.id}`}
              className={`block rounded-lg py-1.5 pr-3 text-[14px] leading-snug transition-colors hover:bg-white hover:text-ppic-orange-300 ${
                active ? "font-semibold text-ppic-orange-300" : "text-ppic-neutral-400"
              }`}
              style={{
                fontFamily: "var(--font-sans)",
                paddingLeft: 12 + INDENT[t.depth],
              }}
            >
              {t.text}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
