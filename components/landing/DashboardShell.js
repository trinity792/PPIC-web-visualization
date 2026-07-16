/**
 * DashboardShell.js — shared titled container for a landing-page category dashboard.
 *
 * Props:
 *   category {Object}    — category metadata from the category registry
 *   children {ReactNode} — dashboard tiles and summary content
 *   sources  {Array<{label,lastUpdated}>} — optional data-source refresh notes,
 *     rendered as a gray-italic footnote (bottom left) like the Markdown doc footnote
 *
 * Data sources:
 *   - Category metadata via props from app/page.js
 *   - Source refresh notes via props from the category dashboard's data module
 *
 * UI Kit reference:
 *   - Implements the "Dashboard Container" card pattern
 */

/* eslint-disable react/prop-types */

import React from "react";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// One line for a single source ("Data last updated …"), otherwise a per-source
// list, mirroring the doc footnote's gray-italic treatment.
function formatSources(sources) {
  if (sources.length === 1) {
    const [only] = sources;
    return `Data last updated ${only.lastUpdated} — ${only.label}.`;
  }
  return `Data last updated — ${sources
    .map((source) => `${source.label}: ${source.lastUpdated}`)
    .join("; ")}.`;
}

export default function DashboardShell({ category, children, sources = null }) {
  return (
    <Card className="overflow-hidden bg-background shadow-sm">
      <CardHeader className="border-b px-6 py-7 text-center sm:px-10">
        <CardTitle className="font-serif text-3xl leading-tight sm:text-5xl">
          <Link href={category.modulePath} className="hover:text-ppic-brand">
            {category.title}
          </Link>
        </CardTitle>
        <CardDescription className="mx-auto max-w-3xl text-base">
          {category.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-5 sm:p-8">
        {children}
        {sources?.length ? (
          <footer className="border-t pt-3 text-left text-xs italic text-muted-foreground">
            {formatSources(sources)}
          </footer>
        ) : null}
      </CardContent>
    </Card>
  );
}
