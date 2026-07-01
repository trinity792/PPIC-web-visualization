"use client";

/**
 * separator.js — accessible horizontal or vertical visual separator.
 *
 * Props:
 *   className   {string}  — optional utility classes
 *   orientation {string}  — separator direction ("horizontal"|"vertical")
 *   decorative  {boolean} — whether the separator is ignored by assistive technology
 *   ...props    {Object}  — Radix Separator attributes
 *
 * Data sources:
 *   - Via props from parent components
 *
 * UI Kit reference:
 *   - Implements the shared divider pattern
 */

/* eslint-disable react/prop-types */

import React from "react";

import * as SeparatorPrimitive from "@radix-ui/react-separator";

import { cn } from "@/components/ui/utils";
function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}) {
  return <SeparatorPrimitive.Root
    data-slot="separator-root"
    decorative={decorative}
    orientation={orientation}
    className={cn(
      "bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
      className
    )}
    {...props}
  />;
}
export {
  Separator
};
