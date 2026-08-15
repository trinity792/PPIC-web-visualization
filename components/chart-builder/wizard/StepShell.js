"use client";

/**
 * StepShell.js — the wizard's shared two-column step layout: a controls card on
 * the left and a preview card on the right, matching the Import/Chart Type/Edit/
 * Export mockups. Every step renders through this so the frame stays identical
 * across steps.
 *
 * The left controls card is width-adjustable on desktop via a drag handle on
 * its right edge (persisted in localStorage, shared across steps). This keeps
 * long content — e.g. the R/Stata code editor in Edit mode — scrolling inside a
 * bounded, user-sized panel instead of overflowing the sidebar.
 *
 * On desktop, only the preview contributes intrinsic height to the row. The
 * controls card is absolutely positioned inside its stretched column, so it
 * fills whatever height the preview requests without making the preview follow
 * a long control list in the opposite direction. Overflow stays inside the
 * sidebar. The stacked mobile layout remains natural-height.
 *
 * Props:
 *   title     {string}    — underlined heading for the left controls card
 *   children  {ReactNode} — left-column controls
 *   preview   {ReactNode} — right-column preview (chart or table)
 *   footer    {ReactNode} — optional actions pinned to the bottom of the left card
 *   aside     {ReactNode} — optional hint rendered to the right of the preview
 *   resizable {boolean}   — allow dragging the left card's width (default true)
 *
 * UI Kit reference:
 *   - ui/card containers; underlined section heading matches ChartSidebar.
 */

import React from "react";

import {
  SidebarResizeHandle,
  useResizableSidebarWidth,
} from "@/components/chart-builder/resizableSidebar";
import { Card } from "@/components/ui/card";

export default function StepShell({
  title,
  children,
  preview,
  footer,
  aside,
  resizable = true,
}) {
  const { width, applyWidth } = useResizableSidebarWidth();

  return (
    <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-stretch">
      <div
        className="relative w-full shrink-0 lg:w-[var(--sb-w)]"
        style={{ "--sb-w": `${width}px` }}
      >
        <Card className="flex min-h-[calc(100svh-16rem)] min-w-0 flex-col p-5 lg:absolute lg:inset-0 lg:min-h-0 lg:overflow-y-auto">
          {title ? (
            <div className="mb-4 text-center">
              <h2 className="inline-block border-b-2 border-ppic-brand pb-1 font-heading text-xl font-semibold">
                {title}
              </h2>
            </div>
          ) : null}
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden">{children}</div>
          {footer ? <div className="mt-4 border-t pt-4">{footer}</div> : null}
        </Card>
        {resizable ? (
          <SidebarResizeHandle width={width} onWidth={applyWidth} />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 gap-4">
        <Card className="min-h-[calc(100svh-16rem)] min-w-0 flex-1 p-4 sm:p-6">
          {preview}
        </Card>
        {aside ? <div className="hidden w-56 shrink-0 xl:block">{aside}</div> : null}
      </div>
    </div>
  );
}
