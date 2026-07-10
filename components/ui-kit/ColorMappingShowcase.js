/**
 * ColorMappingShowcase.js — the guide's color-mapping guidance: categorical
 * pairings, ordered N-group schemes, sequential ramps, the political-party
 * palette, and the pattern-swatch note for 7+ groups.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - components/ui-kit/ppicSpec.js (transcribed from the guide, pp.14–17)
 *
 * UI Kit reference:
 *   - Documents the "Color Mapping" foundation
 */

/* eslint-disable react/prop-types */

import React from "react";

import { Section } from "@/components/ui-kit/Section";
import {
  PPIC_GROUP_SCHEMES,
  PPIC_HEX,
  PPIC_POLITICAL,
  PPIC_SEQUENTIAL,
  PPIC_TWO_GROUP_PAIRS,
} from "@/components/ui-kit/ppicSpec";

export function ColorMappingShowcase() {
  return (
    <Section
      id="color-mapping"
      eyebrow="Foundations"
      title="Color Mapping"
      description="How to assign the core palette to data. Categorical schemes distinguish discrete groups with no inherent order; sequential ramps encode low-to-high magnitude. Take the first N swatches from an ordered scheme, and consolidate to fewer than seven groups wherever possible."
    >
      {/* Categorical — two groups */}
      <Block title="Categorical · two groups">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PPIC_TWO_GROUP_PAIRS.map((pair) => (
            <ChipRow key={pair.join("-")}>
              {pair.map((name) => (
                <NamedChip key={name} name={name} hex={PPIC_HEX[name]} />
              ))}
            </ChipRow>
          ))}
          <ChipRow accent>
            {PPIC_POLITICAL.map((p) => (
              <NamedChip key={p.name} name={p.name} hex={p.hex} />
            ))}
          </ChipRow>
        </div>
        <Note>
          The party palette (Democratic / Republican / Independent) is for
          political-party denotation only.
        </Note>
      </Block>

      {/* Categorical — ordered N-group schemes */}
      <Block title="Categorical · three to ten groups">
        <div className="space-y-2.5">
          {PPIC_GROUP_SCHEMES.map((scheme) => (
            <div key={scheme.count} className="flex items-center gap-4">
              <span className="w-16 shrink-0 font-sans text-[13px] uppercase tracking-[0.1em] text-neutral-500">
                {scheme.count} grp
              </span>
              <div className="flex flex-wrap gap-1.5">
                {scheme.colors.map((name, i) => (
                  <span
                    key={`${name}-${i}`}
                    title={`${name} ${PPIC_HEX[name]}`}
                    className="size-7 rounded-[4px] border border-ppic-border"
                    style={{ backgroundColor: PPIC_HEX[name] }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <Note>
          Seven or more groups gets hard to read — consolidate where you can. When
          you must, this ordered sequence keeps the best contrast; pattern swatches
          can add hierarchy beyond six groups.
        </Note>
      </Block>

      {/* Sequential */}
      <Block title="Sequential · one color family, light → dark">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PPIC_SEQUENTIAL.slice(0, 6).map((ramp) => (
            <div key={ramp.name}>
              <p className="mb-1 font-sans text-[13px] text-neutral-600">{ramp.name}</p>
              <div className="flex overflow-hidden rounded-lg border border-ppic-border">
                {ramp.stops.map((stop) => (
                  <span
                    key={stop}
                    className="h-9 flex-1"
                    style={{ backgroundColor: stop }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <Note>
          Sequential mapping suits data that runs from low / uninteresting to high /
          interesting values, establishing hierarchy toward the important end.
        </Note>
      </Block>
    </Section>
  );
}

// ── Tightly coupled sub-components ───────────────────────────────────

function Block({ title, children }) {
  return (
    <div className="mb-10 last:mb-0">
      <h3 className="mb-4 font-heading text-lg font-semibold text-neutral-900">
        {title}
      </h3>
      {children}
    </div>
  );
}

function ChipRow({ children, accent = false }) {
  return (
    <div
      className={`flex flex-wrap gap-2 rounded-xl border p-3 ${
        accent ? "border-ppic-brand/40 bg-ppic-orange-50/20" : "border-ppic-border bg-white"
      }`}
    >
      {children}
    </div>
  );
}

function NamedChip({ name, hex }) {
  return (
    <span className="inline-flex items-center gap-2 font-sans text-[13px] text-neutral-700">
      <span
        aria-hidden="true"
        className="size-5 rounded-[4px] border border-ppic-border"
        style={{ backgroundColor: hex }}
      />
      {name}
    </span>
  );
}

function Note({ children }) {
  return (
    <p className="mt-4 max-w-2xl font-body text-[14px] leading-relaxed text-neutral-600">
      {children}
    </p>
  );
}
