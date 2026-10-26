/**
 * page.js — full document catalog with optional collection/search selection.
 *
 * Props:
 *   searchParams {Promise<Object>} — collection and q from landing-page links
 * Data sources:
 *   - Committed Markdown catalog via lib/docs/documents.js
 * UI Kit reference:
 *   - Existing DocumentsBrowser sidebar, search, sort, and card patterns
 */
import React from "react";
import DocumentsBrowser from "@/components/documents/DocumentsBrowser";
import { isCollectionType } from "@/lib/docs/collections";
import { getContentTypes, getDocuments, getStatuses, getTopics } from "@/lib/docs/documents";

export const metadata = {
  title: "Browse documents · PPIC Data Explorer",
  description: "Search, filter, and sort the complete project document library.",
};

export default async function BrowseDocumentsPage({ searchParams }) {
  const params = await searchParams;
  const collection = typeof params.collection === "string" ? params.collection : "";
  const query = typeof params.q === "string" ? params.q : "";
  const contentTypes = getContentTypes();

  return (
    <DocumentsBrowser
      key={`${collection}:${query}`}
      docs={getDocuments()}
      contentTypes={contentTypes}
      statuses={getStatuses()}
      topics={getTopics()}
      initialTypes={contentTypes.filter((type) => isCollectionType(type, collection))}
      initialQuery={query}
    />
  );
}
