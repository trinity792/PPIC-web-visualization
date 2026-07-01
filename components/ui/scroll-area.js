"use client";

/**
 * scroll-area.js — styled Radix scroll-area and scrollbar primitives.
 *
 * Props:
 *   className   {string}    — optional utility classes
 *   children    {ReactNode} — scrollable content
 *   orientation {string}    — scrollbar direction
 *   ...props    {Object}    — corresponding Radix ScrollArea attributes
 *
 * Data sources:
 *   - Via props from parent components
 *
 * UI Kit reference:
 *   - Implements the shared custom-scrollbar pattern
 */

/* eslint-disable react/prop-types */

import React from "react";

import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "@/components/ui/utils";
function ScrollArea({
  className,
  children,
  ...props
}) {
  return <ScrollAreaPrimitive.Root
    data-slot="scroll-area"
    className={cn("relative", className)}
    {...props}
  >
      <ScrollAreaPrimitive.Viewport
    data-slot="scroll-area-viewport"
    className="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1"
  >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>;
}
function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}) {
  return <ScrollAreaPrimitive.ScrollAreaScrollbar
    data-slot="scroll-area-scrollbar"
    orientation={orientation}
    className={cn(
      "flex touch-none p-px transition-colors select-none",
      orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent",
      orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent",
      className
    )}
    {...props}
  >
      <ScrollAreaPrimitive.ScrollAreaThumb
    data-slot="scroll-area-thumb"
    className="bg-border relative flex-1 rounded-full"
  />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>;
}
export {
  ScrollArea,
  ScrollBar
};
