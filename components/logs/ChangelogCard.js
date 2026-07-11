"use client";

/**
 * ChangelogCard.js — one changelog entry rendered as a card.
 *
 * The changelog variant of LogCard's non-technical card: an intensity-colored
 * thumbnail tile on the left, a serif title, an IntensityChip + a "Manually
 * audited" badge + a copy button top-right, the plain-English description, and
 * Area / Module / When / By / Commit detail rows. Entries are derived from git
 * commits overlaid with curated fields (lib/changelog/changelog.js).
 *
 * Props:
 *   entry {Object} — a changelog record { id, commit, timestamp, date, title,
 *          description, area, intensity, audited, contributor, module }
 *
 * UI Kit reference:
 *   - Mirrors LogCard's non-technical card, DetailRow, and the shared Badge chip.
 */

/* eslint-disable react/prop-types */

import React from "react";
import { CheckCircle2, Feather, Flame, Gauge } from "lucide-react";

import CopyButton from "./CopyButton";
import IntensityChip from "./IntensityChip";
import { Badge } from "@/components/ui/badge";
import { formatTimestamp, intensityMeta } from "@/lib/changelog/presentation";

const INTENSITY_ICONS = {
  Feather,
  Gauge,
  Flame,
};

function DetailRow({ label, children }) {
  if (!children) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-16 shrink-0 font-medium text-ppic-neutral-500">{label}</span>
      <span className="min-w-0 text-ppic-neutral-700">{children}</span>
    </div>
  );
}

export default function ChangelogCard({ entry }) {
  const meta = intensityMeta(entry.intensity);
  const Icon = INTENSITY_ICONS[meta.icon] || Feather;
  const rawRecord = JSON.stringify(entry, null, 2);

  return (
    <div
      className="flex gap-5 rounded-xl p-4"
      style={{
        background: "var(--ppic-card)",
        border: "1px solid var(--ppic-border)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Intensity icon tile — the changelog card's thumbnail (mirrors LogCard). */}
      <div
        className="flex h-24 w-32 shrink-0 items-center justify-center self-start rounded-lg"
        style={{ background: `${meta.color}26`, color: meta.color }}
      >
        <Icon className="h-8 w-8" aria-hidden="true" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 19,
              fontWeight: 400,
              lineHeight: 1.3,
              color: "var(--ppic-ink, #0d0d0d)",
            }}
          >
            {entry.title}
          </h3>
          <div className="flex items-center gap-2">
            <IntensityChip intensity={entry.intensity} />
            {entry.audited ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 aria-hidden="true" />
                Audited
              </Badge>
            ) : (
              <Badge variant="outline" className="text-ppic-neutral-500">
                Not yet audited
              </Badge>
            )}
            <CopyButton text={rawRecord} label="Copy" />
          </div>
        </div>

        <p
          className="mt-1"
          style={{ color: "var(--ppic-neutral-500)", fontSize: 13.5, lineHeight: 1.5 }}
        >
          {entry.description}
        </p>

        <div className="mt-3 space-y-1.5">
          <DetailRow label="Area">{entry.area}</DetailRow>
          <DetailRow label="Module">{entry.module}</DetailRow>
          <DetailRow label="When">{formatTimestamp(entry.timestamp)}</DetailRow>
          <DetailRow label="By">{entry.contributor}</DetailRow>
          <DetailRow label="Commit">
            <code
              className="rounded bg-ppic-neutral-50 px-1.5 py-0.5 text-xs text-ppic-neutral-600"
              style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
            >
              {entry.commit}
            </code>
          </DetailRow>
        </div>
      </div>
    </div>
  );
}
