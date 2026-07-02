/**
 * DocumentView.js — page layout for a single document (server component).
 *
 * Renders the header band (title, Content-Type badge, category, dates,
 * description) and a two-column body: the sticky table of contents and the
 * rendered Markdown article. Mirrors the UI Kit's hero + grid layout.
 *
 * Props:
 *   doc      {Object}   — normalized record + `content`
 *   toc      {Array}    — headings from extractToc
 *   linkMap  {Object}   — wikilink resolution map
 *   assetMap {Object}   — asset resolution map
 *
 * Data sources:
 *   - Via props from app/documents/[slug]/page.js
 *
 * UI Kit reference:
 *   - Reuses the hero + [TOC | content] grid pattern
 */

/* eslint-disable react/prop-types */

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { DocTableOfContents } from "./DocTableOfContents";
import MarkdownArticle from "./MarkdownArticle";

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

export default function DocumentView({ doc, toc, linkMap, assetMap }) {
  const published = formatDate(doc);

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Header band */}
      <div className="border-b" style={{ borderColor: "var(--ppic-border)", background: "var(--ppic-surface)" }}>
        <div className="page-container px-6 py-10">
          <Link
            href="/documents"
            className="mb-5 inline-flex items-center gap-1.5 text-sm hover:underline"
            style={{ color: "var(--ppic-neutral-400)", fontFamily: "var(--font-sans)" }}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            All documents
          </Link>

          <h1
            className="max-w-4xl text-neutral-900"
            style={{ fontFamily: "var(--font-serif)", fontSize: 44, lineHeight: 1.12, fontWeight: 700 }}
          >
            {doc.title}
          </h1>

          {doc.summary ? (
            <p
              className="mt-3 max-w-3xl"
              style={{ color: "var(--ppic-neutral-500)", fontFamily: "var(--font-sans)", fontSize: 16 }}
            >
              {doc.summary}
            </p>
          ) : null}

          <div
            className="mt-4 flex flex-wrap items-center gap-3 text-[13px]"
            style={{ color: "var(--ppic-neutral-400)", fontFamily: "var(--font-sans)" }}
          >
            <span>{doc.category}</span>
            {published ? (
              <>
                <span style={{ color: "var(--ppic-border)" }}>•</span>
                <span>Published {published}</span>
              </>
            ) : null}
            {doc.updatedLabel ? (
              <>
                <span style={{ color: "var(--ppic-border)" }}>•</span>
                <span>Updated {doc.updatedLabel}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="page-container gap-10 px-6 py-10 lg:grid lg:grid-cols-[220px_1fr]">
        <DocTableOfContents toc={toc} />
        <main className="min-w-0">
          <MarkdownArticle content={doc.content} linkMap={linkMap} assetMap={assetMap} />
        </main>
      </div>
    </div>
  );
}
