"use client";
/**
 * label.js — accessible Radix label primitive.
 *
 * Props:
 *   className {string} — optional utility classes
 *   ...props  {Object} — Radix Label attributes and children
 *
 * Data sources:
 *   - Via props from parent components
 *
 * UI Kit reference:
 *   - Implements the shared form-label pattern
 */

/* eslint-disable react/prop-types */

import React from "react";

import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/components/ui/utils";
function Label({
  className,
  ...props
}) {
  return <LabelPrimitive.Root
    data-slot="label"
    className={cn(
      "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
      className
    )}
    {...props}
  />;
}
export {
  Label
};
