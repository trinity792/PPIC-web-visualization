/**
 * ChartTile.js — live built-in chart preview with a deep link to its module editor.
 *
 * Props:
 *   viewId     {string} — built-in view identifier from the category registry
 *   modulePath {string} — module route opened by the "See More" link
 *
 * Data sources:
 *   - View metadata from lib/visualization/categoryRegistry.js
 *   - Chart data loaded by ChartPreview through the module API routes
 *
 * UI Kit reference:
 *   - Implements the "Chart Container" and "See More Button" patterns
 */

/* eslint-disable react/prop-types */

import React from "react";
import Link from "next/link";

import { ArrowRight } from "lucide-react";

import ChartPreview from "@/components/charts/ChartPreview";
import { Card } from "@/components/ui/card";

import { getBuiltInView } from "@/lib/visualization/categoryRegistry";

export default function ChartTile({ viewId, modulePath }) {
  const view = getBuiltInView(viewId);

  return (
    <Card className="gap-2 overflow-hidden rounded-lg">
      <div className="min-h-105">
        <ChartPreview viewId={viewId} />
      </div>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{view.labels.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {view.labels.subtitle}
          </p>
        </div>
        <Link
          href={`${modulePath}?view=${viewId}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-black bg-ppic-blue-50 px-4 py-1 font-heading text-[13px] text-ppic-neutral-600 hover:brightness-95"
        >
          See More <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
    </Card>
  );
}
