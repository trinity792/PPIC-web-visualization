"use client";

/**
 * LogCard.js — one pipeline run rendered as a card.
 *
 * Two view modes share the same underlying record:
 *   - "nontechnical": a researcher-facing card modeled on the Documents landing
 *     DocumentCard — the severity icon fills the left thumbnail tile, with the
 *     status chip + copy button top-right, a plain-English summary, and
 *     When / Phase / Cause / Impact / Result / Revised rows. Every card (success,
 *     recovered, or failed) carries a "Show technical details" disclosure that
 *     reveals the complete record: the error block when present, plus Result,
 *     a structured Revisions block, Flags, and the full raw record.
 *   - "technical": the raw JSON record shown in a code block.
 * Both modes expose a copy button for the raw record.
 *
 * Plain-language wording is derived on the client (lib/logs/presentation.js) — the
 * backend records only factual fields.
 *
 * Props:
 *   entry {Object} — a normalized run record from lib/logs/logs.js
 *   mode  {"nontechnical"|"technical"}
 */

import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, ShieldAlert } from "lucide-react";

import CopyButton from "./CopyButton";
import SeverityChip from "./SeverityChip";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  derivePhaseLabel,
  deriveCause,
  deriveImpact,
  deriveResult,
  deriveRevisions,
  deriveRevisionSummary,
  formatPeriodList,
  formatTimestamp,
  severityMeta,
} from "@/lib/logs/presentation";

const SEVERITY_ICONS = {
  CheckCircle2,
  ShieldAlert,
  AlertTriangle,
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

const MONO_PRE_CLASS =
  "max-h-72 overflow-auto rounded-lg border border-ppic-border bg-ppic-neutral-50 p-3 text-xs leading-relaxed text-ppic-neutral-700";

// `revisions` gets its own structured block below; excluding it here stops
// KeyValueBlock from also dumping it as a one-line JSON blob.
const RESULT_KEYS_RENDERED_SEPARATELY = new Set(["revisions"]);

function KeyValueBlock({ title, data, omitKeys }) {
  if (!data || typeof data !== "object") return null;
  const entries = Object.entries(data).filter(
    ([key, value]) => value != null && !omitKeys?.has(key)
  );
  if (!entries.length) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-ppic-neutral-500">{title}</div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs text-ppic-neutral-700">
        {entries.map(([key, value]) => (
          <React.Fragment key={key}>
            <dt className="font-medium text-ppic-neutral-500">{key}</dt>
            <dd className="min-w-0 break-words">
              {typeof value === "object" ? JSON.stringify(value) : String(value)}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}

/**
 * One source's revision diff: what the run added versus what it silently restated.
 * Modules replace an overlapping period wholesale, so a restated figure overwrites
 * the saved one — this is the only place that overwrite is visible.
 */
function RevisionDiff({ diff }) {
  const counts = [
    diff.addedKeys ? `${diff.addedKeys.toLocaleString()} rows added` : null,
    diff.changedCells ? `${diff.changedCells.toLocaleString()} values restated` : null,
    diff.removedKeys ? `${diff.removedKeys.toLocaleString()} rows removed` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-1.5">
      {diff.source ? (
        <div className="text-xs font-medium text-ppic-neutral-700">{diff.source}</div>
      ) : null}
      <div className="text-xs text-ppic-neutral-500">
        {counts.length ? counts.join(" · ") : "No changes"}
      </div>
      {diff.addedPeriods.length ? (
        <div className="text-xs text-ppic-neutral-500">
          New: {formatPeriodList(diff.addedPeriods)}
        </div>
      ) : null}
      {diff.changedPeriods.length ? (
        <div className="text-xs text-ppic-neutral-500">
          Restated: {formatPeriodList(diff.changedPeriods)}
        </div>
      ) : null}
      {diff.removedPeriods.length ? (
        <div className="text-xs text-ppic-neutral-500">
          Removed: {formatPeriodList(diff.removedPeriods)}
        </div>
      ) : null}

      {diff.sample.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-ppic-neutral-700">
            <thead>
              <tr className="text-left text-ppic-neutral-500">
                <th className="py-1 pr-3 font-medium">Row</th>
                <th className="py-1 pr-3 font-medium">Column</th>
                <th className="py-1 pr-3 font-medium">Was</th>
                <th className="py-1 font-medium">Now</th>
              </tr>
            </thead>
            <tbody>
              {diff.sample.map((change, index) => (
                <tr
                  key={`${change.key}-${change.column}-${index}`}
                  className="border-t border-ppic-border align-top"
                >
                  <td className="py-1 pr-3 break-words">{change.key}</td>
                  <td className="py-1 pr-3 break-words">{change.column}</td>
                  <td className="py-1 pr-3 tabular-nums">{String(change.old)}</td>
                  <td className="py-1 tabular-nums">{String(change.new)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {diff.truncated ? (
            <div className="pt-1 text-xs text-ppic-neutral-500">
              Showing the {diff.sample.length} largest of{" "}
              {diff.changedCells.toLocaleString()} changes.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RevisionsBlock({ entry }) {
  const revisions = deriveRevisions(entry);
  const withChanges = revisions.filter(
    (diff) => diff.addedKeys || diff.changedCells || diff.removedKeys
  );
  if (!withChanges.length) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-ppic-neutral-500">Revisions</div>
      {withChanges.map((diff, index) => (
        <RevisionDiff key={diff.source || `diff-${index}`} diff={diff} />
      ))}
    </div>
  );
}

// Shows every field available on the record — for success and recovered runs as
// well as failures — so the toggle is a complete technical view, not error-only.
function TechnicalDetails({ entry }) {
  const error = entry.error;
  const location = error
    ? [error.file, error.function, error.line].filter((part) => part != null).join(" · ")
    : null;
  const rawRecord = JSON.stringify(entry, null, 2);
  return (
    <div className="mt-3 space-y-3">
      {error ? (
        <div className="space-y-2">
          {location ? (
            <div className="text-xs text-ppic-neutral-500">
              {error.type} in {location}
            </div>
          ) : null}
          {error.message ? (
            <div className="text-xs text-ppic-neutral-700">{error.message}</div>
          ) : null}
          {error.traceback ? (
            <pre className={MONO_PRE_CLASS} style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}>
              {error.traceback}
            </pre>
          ) : null}
        </div>
      ) : null}

      <KeyValueBlock title="Result" data={entry.result} omitKeys={RESULT_KEYS_RENDERED_SEPARATELY} />
      <RevisionsBlock entry={entry} />
      <KeyValueBlock title="Flags" data={entry.flags} />

      <div className="space-y-1">
        <div className="text-xs font-medium text-ppic-neutral-500">Raw record</div>
        <pre className={MONO_PRE_CLASS} style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}>
          {rawRecord}
        </pre>
      </div>
    </div>
  );
}

export default function LogCard({ entry, mode }) {
  const [open, setOpen] = useState(false);
  const meta = severityMeta(entry.severity);
  const Icon = SEVERITY_ICONS[meta.icon] || AlertTriangle;
  const rawRecord = JSON.stringify(entry, null, 2);

  if (mode === "technical") {
    return (
      <Card className="gap-0 p-0" style={{ fontFamily: "var(--font-sans)" }}>
        <div className="flex items-center justify-between border-b border-ppic-border px-4 py-2">
          <span className="text-sm font-medium text-ppic-neutral-700">
            {entry.moduleLabel} · {formatTimestamp(entry.timestamp)}
          </span>
          <CopyButton text={rawRecord} label="Copy" />
        </div>
        <pre
          className="max-h-96 overflow-auto p-4 text-xs leading-relaxed text-ppic-neutral-700"
          style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
        >
          {rawRecord}
        </pre>
      </Card>
    );
  }

  const cause = deriveCause(entry);
  const impact = deriveImpact(entry);
  const result = deriveResult(entry);
  // Surfaced on the card face, not only in the disclosure: a restated figure means a
  // previously published number has changed, which a reader needs to know without
  // opening technical details.
  const revised = deriveRevisionSummary(entry);

  return (
    <div
      className="flex gap-5 rounded-xl p-4"
      style={{
        background: "var(--ppic-card)",
        border: "1px solid var(--ppic-border)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Severity icon tile — the log card's thumbnail (mirrors DocumentCard). */}
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
            {entry.moduleLabel}
          </h3>
          <div className="flex items-center gap-2">
            <SeverityChip severity={entry.severity} />
            <CopyButton text={rawRecord} label="Copy" />
          </div>
        </div>

        <p
          className="mt-1"
          style={{ color: "var(--ppic-neutral-500)", fontSize: 13.5, lineHeight: 1.5 }}
        >
          {entry.summary}
        </p>

        <div className="mt-3 space-y-1.5">
          <DetailRow label="When">{formatTimestamp(entry.timestamp)}</DetailRow>
          <DetailRow label="Phase">{derivePhaseLabel(entry.phase)}</DetailRow>
          <DetailRow label="Cause">{cause}</DetailRow>
          <DetailRow label="Impact">{impact}</DetailRow>
          <DetailRow label="Result">{result}</DetailRow>
          <DetailRow label="Revised">{revised}</DetailRow>
        </div>

        <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
          <CollapsibleTrigger className="inline-flex items-center gap-1 text-sm font-medium text-ppic-brand hover:underline">
            <ChevronRight
              className={`size-4 transition-transform ${open ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
            {open ? "Hide technical details" : "Show technical details"}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <TechnicalDetails entry={entry} />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
