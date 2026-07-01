"use client";

/**
 * use-mobile.js — reactive viewport hook for the project mobile breakpoint.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Browser matchMedia and window.innerWidth
 *
 * UI Kit reference:
 *   - None — responsive-state utility that does not render UI
 */

import * as React from "react";

import { VIEWPORT_BREAKPOINTS } from "@/lib/constants";

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(
      `(max-width: ${VIEWPORT_BREAKPOINTS.mobile - 1}px)`,
    );
    const onChange = () => {
      setIsMobile(window.innerWidth < VIEWPORT_BREAKPOINTS.mobile);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < VIEWPORT_BREAKPOINTS.mobile);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
