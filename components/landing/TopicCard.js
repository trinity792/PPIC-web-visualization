/**
 * TopicCard.js — one topic in the landing directory, as a single card-sized link.
 *
 * Props:
 *   topic {Object} — entry from lib/visualization/topicRegistry.js
 *                    ({id, title, description, accent}); the route and display
 *                    label are derived from it, never read off the object
 *
 * Data sources:
 *   - Via props from app/page.js, which maps over the topic registry
 *
 * UI Kit reference:
 *   - New "Topic Card" pattern; not a variant of ui/card.js, whose fixed gap-6
 *     column and bordered shell fight the accent rail and hover lift. Add it to
 *     the UI Kit page as a follow-up.
 *
 * The whole card is one <Link>: there is no nested button or second link, so the
 * card has a single tab stop and screen readers announce one target. The visible
 * text is generic ("Explore topic"), hence the aria-label naming the topic.
 */

import React from "react";
import Link from "next/link";

import TopicIcon from "@/components/landing/topicIcons";
import {
  getTopicHref,
  getTopicLabel,
} from "@/lib/visualization/topicRegistry";

export default function TopicCard({ topic }) {
  const href = getTopicHref(topic);
  const label = getTopicLabel(topic);

  return (
    <Link
      href={href}
      aria-label={`Open the ${label} topic`}
      className="group relative flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-ppic-border transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_40px_-20px_rgba(25,27,28,0.45)] hover:ring-transparent focus-visible:ring-2 focus-visible:ring-ppic-brand focus-visible:ring-offset-2 focus-visible:ring-offset-ppic-surface focus-visible:outline-none"
    >
      {/* Accent rail across the top — reinforces that the card is clickable. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: topic.accent }}
      />

      <div className="flex flex-1 flex-col p-6">
        <span
          className="flex size-11 items-center justify-center rounded-lg"
          // 14 = 8% alpha: a tint of the accent, not another palette entry.
          style={{ backgroundColor: `${topic.accent}14`, color: topic.accent }}
        >
          <TopicIcon topicId={topic.id} className="size-6" />
        </span>

        <p
          className="mt-5 font-heading text-xs font-semibold tracking-[0.12em] uppercase"
          style={{ color: topic.accent }}
        >
          {label}
        </p>
        <h2 className="mt-1 font-serif text-2xl leading-tight text-ppic-neutral-600">
          {topic.title}
        </h2>

        <p className="mt-3 line-clamp-2 text-[15px] leading-relaxed text-ppic-neutral-main">
          {topic.description}
        </p>

        <div className="mt-6 border-t border-ppic-border pt-4">
          <span
            className="inline-flex items-center gap-2 text-sm font-semibold"
            style={{ color: topic.accent }}
          >
            Explore topic
            <svg
              viewBox="0 0 24 24"
              className="size-4 transition-transform duration-200 group-hover:translate-x-1"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}
