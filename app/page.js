/**
 * page.js — landing directory: one card per built data topic.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - lib/visualization/topicRegistry.js (static; this page fetches nothing and
 *     is deliberately a synchronous server component so it renders instantly)
 *
 * UI Kit reference:
 *   - Composes the "Topic Card" pattern; page measure is local to this route
 *     because PAGE_LAYOUT.maxWidth is "none" site-wide and .page-container is
 *     therefore a no-op here.
 */

import React from "react";

import TopicCard from "@/components/landing/TopicCard";
import { TOPICS } from "@/lib/visualization/topicRegistry";

export default function Home() {
  return (
    <div className="min-h-[calc(100svh-7.5rem)] bg-ppic-surface">
      <section className="mx-auto max-w-6xl px-6 pt-14 pb-4">
        <p className="font-heading text-xs font-semibold tracking-[0.16em] text-ppic-brand uppercase">
          Explore the data
        </p>
        <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-[1.08] text-ppic-neutral-600 sm:text-5xl">
          PPIC Interactive Visualization Tool
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ppic-neutral-main">
          Each topic is a self-contained dataset with interactive charts and
          downloadable tables. Pick a topic below to open its dashboard and start
          exploring.
        </p>
      </section>

      <main className="mx-auto max-w-6xl px-6 pt-8 pb-20">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="font-serif text-xl text-ppic-neutral-600">Topics</h2>
          <span className="text-sm text-ppic-neutral-main">
            {TOPICS.length} datasets
          </span>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {TOPICS.map((topic) => (
            <TopicCard key={topic.id} topic={topic} />
          ))}
        </div>
      </main>

      <footer className="border-t border-ppic-border bg-card">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-ppic-neutral-main italic">
          Data drawn from the CA Department of Finance, U.S. Census Bureau, and
          CA HCD. Each module page lists its own source and last-updated date.
        </div>
      </footer>
    </div>
  );
}
