/**
 * DocumentCard.js — one row in the Documents landing list.
 *
 * Ported from the Figma reference "document-card.tsx", adapted to Next.js:
 * links to the document's slug route, uses a Content-Type icon tile in place of
 * a photo, and reuses the shared Badge for the type chip.
 *
 * Props:
 *   doc {Object} — normalized record from lib/docs/documents.js
 *     { slug, title, type, summary, category, publishedISO, publishedRaw, updatedLabel }
 *
 * Data sources:
 *   - Via props from DocumentsBrowser
 *
 * UI Kit reference:
 *   - Implements the shared "Card" / "Tag" patterns (Badge) with PPIC tokens
 */

/* eslint-disable react/prop-types */

import React from "react";
import Link from "next/link";

import {
  ArrowUpRight,
  Bot,
  BookMarked,
  BookOpen,
  FileText,
  FlaskConical,
  ListChecks,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { docTypeStyle } from "@/lib/docs/docTypeStyles";

// Resolve lucide icon names from docTypeStyles into components.
const ICONS = {
  Bot,
  BookMarked,
  BookOpen,
  FileText,
  FlaskConical,
  ListChecks,
  Wrench,
};

function formatDate(doc) {
  if (doc.publishedISO) {
    return new Date(doc.publishedISO).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return doc.publishedRaw || "";
}

export function DocumentCard({ doc }) {
  const style = docTypeStyle(doc.type);
  const Icon = ICONS[style.icon] || FileText;
  const published = formatDate(doc);

  return (
    <Link
      href={`/documents/${doc.slug}`}
      className="group flex gap-5 rounded-xl p-4 transition-all"
      style={{
        background: "var(--ppic-card)",
        border: "1px solid var(--ppic-border)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--ppic-brand)";
        e.currentTarget.style.boxShadow = "0 8px 24px -12px rgba(227,106,24,0.4)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--ppic-border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Content-type icon tile (replaces the reference's photo thumbnail) */}
      <div
        className="flex h-24 w-32 shrink-0 items-center justify-center rounded-lg"
        style={{ background: style.bg, color: style.fg }}
      >
        <Icon className="h-8 w-8" aria-hidden="true" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <Badge
          className="mb-2 self-start rounded-full border-transparent uppercase"
          style={{ background: style.bg, color: style.fg, letterSpacing: "0.06em" }}
        >
          {doc.type}
        </Badge>

        <h3
          className="line-clamp-2"
          style={{
            color: "var(--ppic-ink, #0d0d0d)",
            lineHeight: 1.3,
            fontFamily: "var(--font-serif)",
            fontSize: 19,
            fontWeight: 400,
          }}
        >
          {doc.title}
        </h3>

        {doc.summary ? (
          <p
            className="mt-1.5 line-clamp-2"
            style={{
              color: "var(--ppic-neutral-500)",
              fontSize: 13.5,
              lineHeight: 1.5,
              fontFamily: "var(--font-sans)",
            }}
          >
            {doc.summary}
          </p>
        ) : null}

        <div
          className="mt-2 flex flex-wrap items-center gap-3"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          <span style={{ color: "var(--ppic-neutral-400)", fontSize: 13 }}>
            {doc.category}
          </span>
          {published ? (
            <>
              <span style={{ color: "var(--ppic-border)" }}>•</span>
              <span style={{ color: "var(--ppic-neutral-400)", fontSize: 13 }}>
                {published}
              </span>
            </>
          ) : null}
          {doc.updatedLabel ? (
            <>
              <span style={{ color: "var(--ppic-border)" }}>•</span>
              <span style={{ color: "var(--ppic-neutral-400)", fontSize: 13 }}>
                Updated {doc.updatedLabel}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <ArrowUpRight
        className="h-5 w-5 shrink-0 self-center transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        style={{ color: "var(--ppic-brand)" }}
        aria-hidden="true"
      />
    </Link>
  );
}
