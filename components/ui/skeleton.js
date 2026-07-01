/**
 * skeleton.js — animated placeholder for content loading states.
 *
 * Props:
 *   className {string} — optional sizing and utility classes
 *   ...props  {Object} — native div attributes
 *
 * Data sources:
 *   - Via props from parent components
 *
 * UI Kit reference:
 *   - Implements the shared loading-skeleton pattern
 */

/* eslint-disable react/prop-types */

import React from "react";

import { cn } from "@/components/ui/utils";
function Skeleton({ className, ...props }) {
  return <div
    data-slot="skeleton"
    className={cn("bg-accent animate-pulse rounded-md", className)}
    {...props}
  />;
}
export {
  Skeleton
};
