/**
 * app/documents/page.js — Documents landing page (server component).
 *
 * Reads the committed docs/ Markdown library and renders the browsable catalog.
 * Filter options are derived from the files, so new documents appear without
 * code changes.
 *
 * Data sources:
 *   - lib/docs/documents.js (reads docs/ Markdown frontmatter)
 */

import React from "react";

import DocumentsBrowser from "@/components/documents/DocumentsBrowser";
import {
  getContentTypes,
  getDocuments,
  getTopics,
} from "@/lib/docs/documents";

export const metadata = {
  title: "Documents · PPIC Data Explorer",
  description:
    "Browse PPIC data visualization documents — refactor plans, guides, codebooks, and specifications.",
};

export default function DocumentsPage() {
  const docs = getDocuments();
  const contentTypes = getContentTypes();
  const topics = getTopics();

  return (
    <DocumentsBrowser docs={docs} contentTypes={contentTypes} topics={topics} />
  );
}
