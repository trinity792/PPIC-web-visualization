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

/* eslint-disable react/prop-types */

import React, { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";

const WIDTH_KEY = "wizardSidebarWidth";
const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 288;
const MAX_WIDTH = 680;

function clampWidth(value) {
  if (!Number.isFinite(value)) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
}

function ResizeHandle({ width, onWidth }) {
  function onPointerDown(event) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width; // fixed for the duration of this drag
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(moveEvent) {
      onWidth(startWidth + (moveEvent.clientX - startX));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <button
      type="button"
      aria-label="Resize panel"
      onPointerDown={onPointerDown}
      className="group absolute inset-y-0 -right-2 z-10 hidden w-3 cursor-col-resize items-center justify-center lg:flex"
    >
      <span className="h-10 w-1 rounded-full bg-border transition-colors group-hover:bg-ppic-brand" />
    </button>
  );
}

export default function StepShell({
  title,
  children,
  preview,
  footer,
  aside,
  resizable = true,
}) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  // Restore the persisted width after hydration (avoids an SSR mismatch).
  useEffect(() => {
    const saved = Number(window.localStorage.getItem(WIDTH_KEY));
    if (saved) setWidth(clampWidth(saved));
  }, []);

  function applyWidth(next) {
    const clamped = clampWidth(next);
    setWidth(clamped);
    window.localStorage.setItem(WIDTH_KEY, String(clamped));
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div
        className="relative w-full shrink-0 lg:w-[var(--sb-w)]"
        style={{ "--sb-w": `${width}px` }}
      >
        <Card className="flex min-h-[calc(100svh-16rem)] min-w-0 flex-col p-5">
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
        {resizable ? <ResizeHandle width={width} onWidth={applyWidth} /> : null}
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
