"use client";

/** Shared desktop resize behavior for both chart-editor sidebars. */

/* eslint-disable react/prop-types */

import React, { useEffect, useState } from "react";

export const SIDEBAR_WIDTH_KEY = "wizardSidebarWidth";
export const DEFAULT_SIDEBAR_WIDTH = 360;
export const MIN_SIDEBAR_WIDTH = 288;
export const MAX_SIDEBAR_WIDTH = 680;

export function clampSidebarWidth(value) {
  if (!Number.isFinite(value)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value));
}

export function useResizableSidebarWidth() {
  const [width, setWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  // Restore the persisted width after hydration to avoid an SSR mismatch.
  useEffect(() => {
    const saved = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (saved) setWidth(clampSidebarWidth(saved));
  }, []);

  function applyWidth(next) {
    const clamped = clampSidebarWidth(next);
    setWidth(clamped);
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped));
  }

  return { width, applyWidth };
}

export function SidebarResizeHandle({ width, onWidth }) {
  function onPointerDown(event) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
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
