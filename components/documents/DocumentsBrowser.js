"use client";

/**
 * DocumentsBrowser.js — collection previews or the full filterable catalog.
 *
 * Props:
 *   docs {Object[]} — normalized documents, pinned first then newest first
 *   contentTypes, statuses, topics {string[]} — catalog-derived filter options
 *   view {string} — "landing" previews or "browse" with sidebar and sorting
 *   initialTypes {string[]} — content types selected by a collection link
 *   initialQuery {string} — search submitted from the landing page
 *
 * Data sources:
 *   - Server props from app/documents/page.js and app/documents/browse/page.js
 *
 * UI Kit reference:
 *   - Shared Select/Checkbox controls and DocumentCard previews
 */

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { DOCUMENT_COLLECTIONS, isCollectionType } from "@/lib/docs/collections";

import { DocumentFilterSidebar } from "./DocumentFilterSidebar";
import { DocumentCard } from "./DocumentCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SORT_LABELS = {
  newest: "Newest first",
  oldest: "Oldest first",
  az: "Title A–Z",
};

// Keep the original catalog search field consistent in both views.
const SEARCH_INPUT_CLASS = "h-10 w-full rounded-lg border border-ppic-border bg-ppic-card pr-10 pl-3.5 font-sans text-sm text-ppic-neutral-600 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ppic-brand";

export default function DocumentsBrowser({
  docs,
  contentTypes,
  statuses,
  topics,
  view = "browse",
  initialTypes = [],
  initialQuery = "",
}) {
  const defaultTopic = topics[0] || "All topics";
  const defaultStatus = statuses[0] || "All statuses";
  const [query, setQuery] = useState(initialQuery);
  const [topic, setTopic] = useState(defaultTopic);
  const [status, setStatus] = useState(defaultStatus);
  const [selectedTypes, setSelectedTypes] = useState(initialTypes);
  const [sort, setSort] = useState("newest");

  const toggleType = (t) =>
    setSelectedTypes((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]
    );

  const clear = () => {
    setSelectedTypes([]);
    setTopic(defaultTopic);
    setStatus(defaultStatus);
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = docs.filter((d) => {
      const matchesQuery =
        !q ||
        d.title.toLowerCase().includes(q) ||
        d.summary.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.topic.toLowerCase().includes(q) ||
        d.type.toLowerCase().includes(q);
      const matchesType = selectedTypes.length === 0 || selectedTypes.includes(d.type);
      const matchesTopic = topic === defaultTopic || d.topic === topic;
      const matchesStatus = status === defaultStatus || d.status === status;
      return matchesQuery && matchesType && matchesTopic && matchesStatus;
    });

    list = [...list].sort((a, b) => {
      // Pinned docs always sort to the top, overriding the selected order.
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sort === "az") return a.title.localeCompare(b.title);
      const diff = b.sortTime - a.sortTime;
      return sort === "newest" ? diff : -diff;
    });
    return list;
  }, [
    docs,
    query,
    selectedTypes,
    topic,
    status,
    sort,
    defaultTopic,
    defaultStatus,
  ]);

  return (
    <div className="min-h-screen w-full" style={{ background: "var(--background)" }}>
      <section className="w-full border-b border-ppic-border bg-ppic-surface">
        <div className="page-content py-14 text-center">
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 44,
              fontWeight: 400,
              lineHeight: 1.15,
              color: "var(--ppic-ink, #0d0d0d)",
            }}
          >
            Documents
          </h1>
          <p className="mx-auto mt-3 max-w-xl font-sans text-ppic-neutral-400">
            Explore explainers, guides, &amp; plans from this project
          </p>
        </div>
      </section>

      {view === "landing" ? (
        <main className="page-content py-12">
          <form action="/documents/browse" role="search" className="relative mb-8">
            <label htmlFor="document-search" className="sr-only">Search documents</label>
            <input
              id="document-search"
              name="q"
              type="search"
              placeholder="Search documents"
              className={SEARCH_INPUT_CLASS}
            />
            <button type="submit" aria-label="Search documents" className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-lg text-ppic-neutral-400 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ppic-brand">
              <Search className="size-4" aria-hidden="true" />
            </button>
          </form>
          <div className="grid items-start gap-10 lg:grid-cols-[2.13fr_1fr] lg:gap-6">
            {DOCUMENT_COLLECTIONS.map((collection) => {
              const previews = docs.filter((doc) => isCollectionType(doc.type, collection.id)).slice(0, 3);
              return (
                <section key={collection.id} aria-labelledby={`${collection.id}-heading`} className="min-w-0">
                  <div className="mb-6 flex items-center justify-between gap-4 border-b border-foreground pb-1">
                    <h2 id={`${collection.id}-heading`} className="font-serif text-2xl font-normal leading-tight">{collection.title}</h2>
                    <Link href={`/documents/browse?collection=${collection.id}`} aria-label={`View more ${collection.title.toLowerCase()}`} className="flex shrink-0 items-center gap-1 py-3 font-sans text-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ppic-brand">
                      View more <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                  <div className="flex flex-col gap-6">
                    {previews.map((doc) => <DocumentCard key={doc.slug} doc={doc} variant={collection.id === "plans" ? "compact" : "default"} />)}
                    {previews.length === 0 ? <p className="font-sans text-ppic-neutral-400">No {collection.title.toLowerCase()} yet.</p> : null}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="mt-10 flex justify-start">
            <Link href="/documents/browse" className="inline-flex items-center gap-2 py-2 font-sans text-sm text-ppic-neutral-400 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ppic-brand">
              Browse all documents <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </main>
      ) : (
        <>
        <div className="page-content pt-8">
          <Link href="/documents" className="inline-flex items-center gap-2 font-sans text-sm text-ppic-neutral-400 hover:underline">
            <ArrowLeft className="size-4" aria-hidden="true" /> All collections
          </Link>
        </div>
        {/* Content */}
        <main className="page-content flex flex-col gap-10 py-10 md:flex-row">
          <DocumentFilterSidebar
            topics={topics}
            topic={topic}
            onTopic={setTopic}
            statuses={statuses}
            status={status}
            onStatus={setStatus}
            contentTypes={contentTypes}
            selectedTypes={selectedTypes}
            onToggleType={toggleType}
            onClear={clear}
          />

          <section className="min-w-0 flex-1" style={{ fontFamily: "var(--font-sans)" }}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <span style={{ color: "var(--ppic-neutral-400)", fontSize: 14 }}>
                {results.length} {results.length === 1 ? "document" : "documents"}
              </span>

              <div className="flex items-center gap-2">
                <span style={{ color: "var(--ppic-neutral-400)", fontSize: 14 }}>
                  Sort by:
                </span>
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger aria-label="Sort documents" className="h-9 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(SORT_LABELS).map((k) => (
                      <SelectItem key={k} value={k}>
                        {SORT_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <input
                aria-label="Search documents"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search documents"
                className={SEARCH_INPUT_CLASS}
              />
              <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ppic-neutral-400" aria-hidden="true" />
            </div>

            <div className="flex flex-col gap-3">
              {results.map((doc) => (
                <DocumentCard key={doc.slug} doc={doc} />
              ))}
              {results.length === 0 ? (
                <div
                  className="rounded-xl py-20 text-center"
                  style={{
                    color: "var(--ppic-neutral-400)",
                    border: "1px dashed var(--ppic-border)",
                  }}
                >
                  No documents match your filters.
                </div>
              ) : null}
            </div>
          </section>
        </main>
        </>
      )}
    </div>
  );
}
