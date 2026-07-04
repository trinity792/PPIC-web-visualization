"use client";

/**
 * DocumentsBrowser.js — client island for the Documents landing page.
 *
 * Ported from the Figma reference "App.tsx": owns the search, topic, type,
 * status, and sort state and the filter+sort pipeline, then renders the hero band, the
 * filter sidebar, the sort control, and the results list. All data (documents
 * and filter options) arrives as props from the server page.
 *
 * Props:
 *   docs         {Object[]} — normalized records from lib/docs/documents.js
 *   contentTypes {string[]} — filter options from getContentTypes()
 *   statuses     {string[]} — filter options from getStatuses()
 *   topics       {string[]} — filter options from getTopics()
 *
 * Data sources:
 *   - Via props from app/documents/page.js (server component)
 *
 * UI Kit reference:
 *   - Composes shared Select/Checkbox/Badge primitives with PPIC tokens
 */

/* eslint-disable react/prop-types */

import React, { useMemo, useState } from "react";

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

export default function DocumentsBrowser({ docs, contentTypes, statuses, topics }) {
  const defaultTopic = topics[0] || "All topics";
  const defaultStatus = statuses[0] || "All statuses";
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState(defaultTopic);
  const [status, setStatus] = useState(defaultStatus);
  const [selectedTypes, setSelectedTypes] = useState([]);
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
        d.category.toLowerCase().includes(q);
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
      {/* Hero band */}
      <section
        className="w-full border-b"
        style={{ background: "var(--ppic-surface)", borderColor: "var(--ppic-border)" }}
      >
        <div className="page-container px-6 py-14 text-center">
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 44,
              fontWeight: 400,
              lineHeight: 1.15,
              color: "var(--ppic-ink, #0d0d0d)",
            }}
          >
            Browse PPIC Resources
          </h1>
          <p
            className="mx-auto mt-3 max-w-xl"
            style={{ color: "var(--ppic-neutral-400)", fontFamily: "var(--font-sans)" }}
          >
            Explore reports, guides, and plans from this project
          </p>
        </div>
      </section>

      {/* Content */}
      <main className="page-container flex flex-col gap-10 px-6 py-10 md:flex-row">
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
          <div className="mb-5 flex items-center justify-between">
            <span style={{ color: "var(--ppic-neutral-400)", fontSize: 14 }}>
              {results.length} {results.length === 1 ? "document" : "documents"}
            </span>

            <div className="flex items-center gap-2">
              <span style={{ color: "var(--ppic-neutral-400)", fontSize: 14 }}>
                Sort by:
              </span>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="h-9 w-44">
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
          <div className="mb-4">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents"
              className="h-10 w-full rounded-lg px-3.5 text-sm outline-none"
              style={{
                background: "var(--ppic-card)",
                border: "1px solid var(--ppic-border)",
                color: "var(--ppic-neutral-600)",
              }}
            />
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
    </div>
  );
}
