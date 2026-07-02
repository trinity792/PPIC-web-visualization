/**
 * app/documents/[slug]/page.js — individual document reader (server component).
 *
 * Loads a document's Markdown by slug, builds its table of contents, and renders
 * the reader layout. Unknown slugs 404. Slugs are pre-generated from the library.
 *
 * Data sources:
 *   - lib/docs/documents.js (getDocContent, getDocSlugs, getWikilinkMap, getAssetMap)
 *   - lib/docs/markdown/extractToc.js
 */

/* eslint-disable react/prop-types */

import React from "react";
import { notFound } from "next/navigation";

import DocumentView from "@/components/documents/DocumentView";
import {
  getAssetMap,
  getDocContent,
  getDocSlugs,
  getWikilinkMap,
} from "@/lib/docs/documents";
import { extractToc } from "@/lib/docs/markdown/extractToc";

export function generateStaticParams() {
  return getDocSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const doc = getDocContent(slug);
  return {
    title: doc ? `${doc.title} · PPIC Data Explorer` : "Document · PPIC Data Explorer",
    description: doc?.summary || undefined,
  };
}

export default async function DocumentPage({ params }) {
  const { slug } = await params;
  const doc = getDocContent(slug);
  if (!doc) notFound();

  const toc = extractToc(doc.content);

  return (
    <DocumentView
      doc={doc}
      toc={toc}
      linkMap={getWikilinkMap()}
      assetMap={getAssetMap()}
    />
  );
}
