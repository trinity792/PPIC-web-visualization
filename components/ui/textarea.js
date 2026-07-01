/**
 * textarea.js — styled native multiline text-input primitive.
 *
 * Props:
 *   className {string} — optional utility classes
 *   ...props  {Object} — native textarea attributes and children
 *
 * Data sources:
 *   - Via props from parent components
 *
 * UI Kit reference:
 *   - Implements the shared "Textarea" pattern
 */

/* eslint-disable react/prop-types */

import React from "react";

import { cn } from "@/components/ui/utils";
function Textarea({ className, ...props }) {
  return <textarea
    data-slot="textarea"
    className={cn(
      "resize-none border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-input-background px-3 py-2 text-base transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
      className
    )}
    {...props}
  />;
}
export {
  Textarea
};
