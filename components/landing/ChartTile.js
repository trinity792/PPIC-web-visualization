/* eslint-disable react/prop-types */
import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import ChartPreview from "@/components/charts/ChartPreview";
import { Card } from "@/components/ui/card";
import { getBuiltInView } from "@/lib/visualization/categoryRegistry";

/**
 * One dashboard chart tile: a live preview of a built-in view plus a "See more"
 * deep-link that opens the same view in the module editor. Shared by every
 * category dashboard.
 */
export default function ChartTile({ viewId, modulePath }) {
  const view = getBuiltInView(viewId);
  return (
    <Card className="gap-2 overflow-hidden rounded-lg">
      <div className="min-h-[420px]">
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
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-1 text-[13px] hover:brightness-95"
          style={{
            backgroundColor: "var(--ppic-blue-50)",
            borderColor: "#000",
            color: "#0d0d0d",
            fontFamily: "var(--font-heading)",
          }}
        >
          See More <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </Card>
  );
}
