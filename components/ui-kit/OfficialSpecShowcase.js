/**
 * OfficialSpecShowcase.js — faithful appendix reproducing the published PPIC
 * style-guide palette and typography (real hexes, RGB triples, Proxima Nova /
 * Arial specs) as an authoritative reference alongside the app's own tokens.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - components/ui-kit/ppicSpec.js (transcribed from the guide, pp.11–13)
 *
 * UI Kit reference:
 *   - Documents the "Official PPIC Spec" appendix (Main Chart Colors + Typography)
 */

import React from "react";

import { Caption, Section } from "@/components/ui-kit/Section";
import {
  PPIC_MAIN_COLORS,
  PPIC_SEQUENTIAL,
  PPIC_TYPE_ROLES,
} from "@/components/ui-kit/ppicSpec";

function isDark(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}

export function OfficialSpecShowcase() {
  return (
    <Section
      id="spec"
      eyebrow="Appendix"
      title="Official PPIC Spec"
      description="Reproduced verbatim from the PPIC Data Visualization Style Guide v1.0 (06.24.2021). These are the authoritative brand values; the app's UI-kit tokens above are an adapted, screen-tuned implementation of the same system."
    >
      {/* Main graphic colors */}
      <h3 className="mb-3 font-heading text-lg font-semibold text-neutral-900">
        Main graphic colors
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {PPIC_MAIN_COLORS.map((c) => (
          <div
            key={c.name}
            className="overflow-hidden rounded-xl border border-ppic-border bg-white"
          >
            <div className="h-16" style={{ backgroundColor: c.hex }} />
            <div className="px-3 py-2">
              <p className="font-sans text-[13px] font-medium text-neutral-800">
                {c.name}
              </p>
              <p className="font-sans text-xs uppercase text-neutral-500">{c.hex}</p>
              <p className="font-sans text-xs text-neutral-400">{c.rgb}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Sequential ramps */}
      <h3 className="mb-3 mt-10 font-heading text-lg font-semibold text-neutral-900">
        Shades of main colors · sequential ramps
      </h3>
      <p className="mb-4 max-w-2xl font-body text-[15px] leading-relaxed text-neutral-600">
        Use shades within one color family for sequenced data, lightest to darkest.
        Some shades are not colorblind-accessible — follow the color-combining
        guidelines. The gray family can also carry sequential map data.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PPIC_SEQUENTIAL.map((ramp) => (
          <div
            key={ramp.name}
            className="rounded-xl border border-ppic-border bg-white p-3"
          >
            <p className="mb-2 font-sans text-[13px] font-medium text-neutral-700">
              {ramp.name}
            </p>
            <div className="flex overflow-hidden rounded-lg">
              {ramp.stops.map((stop) => (
                <div
                  key={stop}
                  className="flex h-12 flex-1 items-end justify-center pb-1"
                  style={{
                    backgroundColor: stop,
                    color: isDark(stop) ? "#FFFFFF" : "#1A1918",
                  }}
                >
                  <span className="font-sans text-[9px] uppercase tracking-tight opacity-80">
                    {stop.replace("#", "")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Typography */}
      <h3 className="mb-3 mt-10 font-heading text-lg font-semibold text-neutral-900">
        Typography roles
      </h3>
      <p className="mb-4 max-w-2xl font-body text-[15px] leading-relaxed text-neutral-600">
        Proxima Nova carries titles, subtitles, keys, and body copy; Arial carries
        data labels and source / notes. Sizes, weights, line spacing, and tracking
        are quoted exactly from the guide.
      </p>
      <div className="overflow-x-auto rounded-xl border border-ppic-border bg-white">
        <table className="w-full border-collapse text-left font-sans text-[13px]">
          <thead>
            <tr className="border-b border-ppic-border text-neutral-500">
              <th className="px-4 py-3 font-semibold uppercase tracking-[0.1em]">Role</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-[0.1em]">Font</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-[0.1em]">Weight</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-[0.1em]">Size</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-[0.1em]">Line</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-[0.1em]">Tracking</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-[0.1em]">Color</th>
            </tr>
          </thead>
          <tbody>
            {PPIC_TYPE_ROLES.map((t) => (
              <tr
                key={t.role}
                className="border-b border-ppic-neutral-50 last:border-b-0 text-neutral-800"
              >
                <td className="px-4 py-3 font-medium">{t.role}</td>
                <td className="px-4 py-3">{t.font}</td>
                <td className="px-4 py-3">{t.weight}</td>
                <td className="px-4 py-3">{t.size}</td>
                <td className="px-4 py-3">{t.line}</td>
                <td className="px-4 py-3">{t.tracking}</td>
                <td className="px-4 py-3">
                  {t.color ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="size-3 rounded-[3px] border border-ppic-border"
                        style={{ backgroundColor: t.color }}
                      />
                      {t.color}
                    </span>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Caption>
        Type family — Proxima Nova (titles / body) · Arial (data labels / source)
      </Caption>
    </Section>
  );
}
