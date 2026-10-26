/**
 * DocumentCard.js — thumbnail, publication date, title, and summary preview.
 *
 * Props:
 *   doc {Object} — normalized document from lib/docs/documents.js
 *   variant {string} — "default" or the smaller "compact" plan preview
 *
 * Data sources:
 *   - Via props from DocumentsBrowser
 *
 * UI Kit reference:
 *   - Shared card pattern, adapted to mockups/Doc Page Mockup.jpg
 */

import React from "react";
import Link from "next/link";

import {
  Bot,
  BookMarked,
  BookOpen,
  FileCog,
  FileSearch,
  FileText,
  FlaskConical,
  ListChecks,
  MessageSquareText,
  NotebookPen,
  NotepadText,
  Save,
  ScrollText,
  Workflow,
  Wrench,
} from "lucide-react";

import { DOCUMENT_PAGE_COLORS } from "@/lib/constants";
import { docTypeStyle } from "@/lib/docs/docTypeStyles";

// Resolve lucide icon names from docTypeStyles into components.
const ICONS = {
  Bot,
  BookMarked,
  BookOpen,
  FileCog,
  FileSearch,
  FileText,
  FlaskConical,
  ListChecks,
  MessageSquareText,
  NotebookPen,
  NotepadText,
  Save,
  ScrollText,
  Workflow,
  Wrench,
};

function formatDate(doc) {
  if (doc.publishedISO) {
    return new Date(doc.publishedISO).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return doc.publishedRaw || "";
}

export function DocumentCard({ doc, variant = "default" }) {
  const style = docTypeStyle(doc.type);
  const Icon = ICONS[style.icon] || FileText;
  const published = formatDate(doc);
  const isCompact = variant === "compact";

  return (
    <Link
      href={`/documents/${doc.slug}`}
      className={`group flex overflow-hidden rounded-2xl border bg-background font-sans text-foreground transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ppic-brand motion-reduce:transition-none ${
        isCompact ? "min-h-32" : "min-h-40 lg:min-h-42"
      }`}
      style={{ borderColor: DOCUMENT_PAGE_COLORS.cardBorder }}
    >
      <div
        className={`flex shrink-0 items-center justify-center ${isCompact ? "w-[26%]" : "w-[17%]"}`}
        style={{ background: style.bg, color: style.fg }}
        aria-hidden="true"
      >
        <Icon className="h-auto w-1/4 max-w-14" />
      </div>
      <div className={`min-w-0 flex-1 py-4 ${isCompact ? "px-5 lg:px-6" : "px-5 lg:px-8"}`}>
        {published ? (
          <time dateTime={doc.publishedISO || undefined} className={`block font-proxima font-bold ${isCompact ? "text-[11px]" : "text-[13px]"}`}>
            {published}
          </time>
        ) : null}
        <h3 className={`mt-2 line-clamp-2 font-serif font-regular leading-tight ${isCompact ? "text-lg" : "text-2xl"}`}>
          {doc.title}
        </h3>
        {doc.summary ? (
          <p className={`mt-2 line-clamp-2 font-proxima leading-relaxed ${isCompact ? "text-xs" : "text-sm"}`}>
            {doc.summary}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
