/**
 * ToolingShowcase.js — the guide's "Capabilities & Limitations" survey of the
 * authoring tools PPIC evaluated (Excel, Infogram, Datawrapper, Tableau).
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - components/ui-kit/ppicSpec.js (transcribed from the guide, pp.6–9)
 *
 * UI Kit reference:
 *   - Documents the "Authoring Tools" appendix
 */

import React from "react";

import { Section } from "@/components/ui-kit/Section";
import { PPIC_TOOLS } from "@/components/ui-kit/ppicSpec";

export function ToolingShowcase() {
  return (
    <Section
      id="tooling"
      eyebrow="Appendix"
      title="Authoring Tools"
      description="Capabilities and limitations of the tools the style guide surveyed for producing charts and maps. Included for completeness — this data explorer supersedes these tools for the population and housing modules."
    >
      <div className="grid gap-5 md:grid-cols-2">
        {PPIC_TOOLS.map((tool) => (
          <div
            key={tool.name}
            className="rounded-2xl border border-ppic-border bg-white p-6 shadow-[0_4px_4px_rgba(0,0,0,0.06)]"
          >
            <h3 className="font-heading text-lg font-semibold text-neutral-900">
              {tool.name}
            </h3>

            <p className="mt-4 font-sans text-[12px] uppercase tracking-[0.14em] text-ppic-brand">
              Capabilities
            </p>
            <ul className="mt-2 space-y-1.5">
              {tool.capabilities.map((c) => (
                <li
                  key={c}
                  className="flex gap-2 font-body text-[14px] leading-relaxed text-neutral-800"
                >
                  <span aria-hidden="true" className="mt-[2px] text-ppic-brand">
                    +
                  </span>
                  {c}
                </li>
              ))}
            </ul>

            <p className="mt-4 font-sans text-[12px] uppercase tracking-[0.14em] text-neutral-500">
              Limitations
            </p>
            <ul className="mt-2 space-y-1.5">
              {tool.limitations.map((l) => (
                <li
                  key={l}
                  className="flex gap-2 font-body text-[14px] leading-relaxed text-neutral-700"
                >
                  <span aria-hidden="true" className="mt-[2px] text-neutral-400">
                    −
                  </span>
                  {l}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
