/**
 * topicIcons.js — line icons for the landing-page topic cards, keyed by topic id.
 *
 * Props (TopicIcon):
 *   topicId   {string} — topic/module id from lib/visualization/topicRegistry.js
 *   className {string} — optional sizing classes on the <svg>
 *
 * Data sources:
 *   - Static path data in this file, traced from mockups/new-landing
 *
 * UI Kit reference:
 *   - None — icon set unique to the landing directory
 *
 * The paths are drawn for a 24x24 box at stroke width 1.6 with round caps and
 * joins; those attributes live on the shared <svg> below rather than per path,
 * so every card icon stays optically consistent.
 */

import React from "react";

const TOPIC_ICON_PATHS = Object.freeze({
  pophousing: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V8l5-4 5 4v13" />
      <path d="M15 21v-8l4-3 0 11" />
      <path d="M9 12h2M9 16h2" />
    </>
  ),
  "components-of-change": (
    <>
      <path d="M4 17l5-5 4 3 7-8" />
      <path d="M20 7h-4M20 7v4" />
      <path d="M4 20h16" />
    </>
  ),
  "demographic-projections": (
    <>
      <circle cx="9" cy="7" r="3" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
      <path d="M15 20c0-2.4 1.4-4.2 3.5-4.2 1.4 0 2.6.8 3.2 2" />
    </>
  ),
  "housing-stress": (
    <>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M4 20h16" />
      <path d="M10 20v-5h4v5" />
      <path d="M8 4l8 5" />
    </>
  ),
  "building-permits": (
    <>
      <path d="M4 21h16" />
      <path d="M6 21V6h8v15" />
      <path d="M14 11h4v10" />
      <path d="M9 9h2M9 13h2M9 17h2" />
    </>
  ),
  "rhna-progress": (
    <>
      <path d="M6 20V4h9l-1.5 4L15 12H6" />
      <path d="M6 20v-3" />
      <path d="M18 8v13" />
      <path d="M15 21h6" />
    </>
  ),
});

export default function TopicIcon({ topicId, className }) {
  const paths = TOPIC_ICON_PATHS[topicId];
  if (!paths) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}
