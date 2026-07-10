/**
 * ConsiderationsShowcase.js — the guide's opening "Considerations" foundation:
 * overview, the three framing questions, and the accessibility commitment.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Official PPIC Data Visualization Style Guide v1.0 (Considerations, p.4)
 *
 * UI Kit reference:
 *   - Documents the "Considerations" foundation
 */

/* eslint-disable react/prop-types */

import React from "react";

import { Panel, Section } from "@/components/ui-kit/Section";

const FOUNDATION = [
  "What story does the data tell?",
  "How should the reader benefit from the visualization?",
  "How transparent are we being with the data being presented?",
];

export function ConsiderationsShowcase() {
  return (
    <Section
      id="considerations"
      eyebrow="Foundations"
      title="Considerations"
      description="Use this style guide to create a uniform look and feel across all of PPIC's charts and graphs, in line with data-visualization best practices and proven design principles."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel>
          <Heading>Overview</Heading>
          <p className="mt-3 font-body text-[15px] leading-relaxed text-neutral-700">
            A single reference for the foundations and components behind PPIC&apos;s
            dashboards — so every chart, graph, and table reads as one system.
          </p>
        </Panel>

        <Panel>
          <Heading>Foundation</Heading>
          <p className="mt-3 font-body text-[15px] leading-relaxed text-neutral-700">
            Before approaching a chart or graph, consider:
          </p>
          <ul className="mt-3 space-y-2">
            {FOUNDATION.map((q) => (
              <li
                key={q}
                className="flex gap-2 font-body text-[15px] leading-relaxed text-neutral-800"
              >
                <span aria-hidden="true" className="mt-1 text-ppic-brand">
                  →
                </span>
                {q}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <Heading>Accessibility</Heading>
          <p className="mt-3 font-body text-[15px] leading-relaxed text-neutral-700">
            Survey color contrast, printability, and web-safe accessibility. These
            guidelines follow the Web Content Accessibility Guidelines (WCAG) and are
            built alongside PPIC&apos;s team to address issues of style and access.
          </p>
        </Panel>
      </div>
    </Section>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

function Heading({ children }) {
  return (
    <h3 className="font-heading text-lg font-semibold tracking-[0.02em] text-neutral-900">
      {children}
    </h3>
  );
}
