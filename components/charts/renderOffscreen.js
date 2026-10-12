"use client";

/**
 * renderOffscreen.js — draws a chart frame once more, off screen, at an exact
 * size, so image export lays the chart out at the export width instead of
 * scaling the on-screen picture (renderer plan, Workstream M).
 *
 * The copy is mounted in its own React root inside a fixed-position box far
 * outside the viewport. It stays in the page, so it gets the page's CSS and
 * fonts and the browser lays it out normally (ChartFrame's ResizeObserver
 * still measures it). It resolves once ChartRenderer marks the drawing ready
 * (`data-chart-ready="true"`) and the browser has painted it; the caller calls
 * `dispose()` when done. `padding` insets the drawing inside the box, so the
 * box is the whole exported image.
 *
 * Exports:
 *   renderOffscreen(node, {width, height, padding, timeout})
 *     — resolves to { element, dispose }; rejects if the chart is not ready
 *       within `timeout` ms (the copy is removed first)
 *
 * Data sources:
 *   - Via arguments from the caller (PreviewPane's export handle)
 */

import { createRoot } from "react-dom/client";

const READY_SELECTOR = '[data-chart-ready="true"]';

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForReady(host, timeout) {
  const started = performance.now();
  while (!host.querySelector(READY_SELECTOR)) {
    if (performance.now() - started > timeout) {
      throw new Error("The chart did not finish drawing at the export size.");
    }
    await nextFrame();
  }
  // One more frame so layout after the last commit has settled.
  await nextFrame();
}

export async function renderOffscreen(
  node,
  { width, height = null, padding = 0, timeout = 5000 } = {},
) {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("data-export-copy", "");
  Object.assign(host.style, {
    position: "fixed",
    top: "0",
    left: "-100000px",
    width: `${Math.round(width)}px`,
    ...(Number.isFinite(height) && height > 0 ? { height: `${Math.round(height)}px` } : {}),
    boxSizing: "border-box",
    padding: `${padding}px`,
    pointerEvents: "none",
    background: "#FFFFFF",
  });
  document.body.append(host);
  const root = createRoot(host);
  const dispose = () => {
    root.unmount();
    host.remove();
  };
  root.render(node);
  try {
    await waitForReady(host, timeout);
  } catch (error) {
    dispose();
    throw error;
  }
  return { element: host, dispose };
}
