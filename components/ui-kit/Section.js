/**
 * Section.js — shared section, panel, and caption layouts for the UI Kit page.
 *
 * Props:
 *   id          {string}    — section anchor identifier
 *   eyebrow     {string}    — optional category label above the title
 *   title       {string}    — section heading
 *   description {string}    — optional supporting copy
 *   children    {ReactNode} — section, panel, or caption content
 *   className   {string}    — optional classes appended to a panel
 *
 * Data sources:
 *   - Via props from UI Kit showcase components
 *
 * UI Kit reference:
 *   - Implements the "Section", "Panel", and "Caption" layout patterns
 */

/* eslint-disable react/prop-types */

import React from "react";

export function Section({ id, eyebrow, title, description, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-6">
        {eyebrow && (
          <p className="mb-1 font-sans text-xs uppercase tracking-[0.22em] text-ppic-brand">
            {eyebrow}
          </p>
        )}
        <h2 className="font-heading text-[28px] tracking-[0.04em] text-neutral-900">
          {title}
        </h2>
        <div className="mt-2 h-[3px] w-12 rounded-full bg-ppic-brand" />
        {description && (
          <p className="mt-3 max-w-2xl font-body text-[15px] leading-relaxed text-neutral-600">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

export function Panel({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-ppic-border bg-white p-6 shadow-[0_4px_4px_rgba(0,0,0,0.06)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Caption({ children }) {
  return (
    <p className="mt-3 font-sans text-xs uppercase tracking-[0.14em] text-neutral-500">
      {children}
    </p>
  );
}
