"use client";

/**
 * collapsible.js — Radix collapsible root, trigger, and content primitives.
 *
 * Props:
 *   ...props {Object} — corresponding Radix Collapsible attributes and children
 *
 * Data sources:
 *   - Via props from parent components
 *
 * UI Kit reference:
 *   - Implements the shared collapsible-content pattern
 */

import React from "react";

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
function Collapsible({
  ...props
}) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}
function CollapsibleTrigger({
  ...props
}) {
  return <CollapsiblePrimitive.CollapsibleTrigger
    data-slot="collapsible-trigger"
    {...props}
  />;
}
function CollapsibleContent({
  ...props
}) {
  return <CollapsiblePrimitive.CollapsibleContent
    data-slot="collapsible-content"
    {...props}
  />;
}
export {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
};
