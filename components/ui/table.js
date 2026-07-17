"use client";

/**
 * table.js — responsive semantic table composition primitives.
 *
 * Props:
 *   className {string} — optional utility classes on table primitives
 *   ...props  {Object} — native table-element attributes and children
 *
 * Data sources:
 *   - Rows and cells via props from parent components
 *
 * UI Kit reference:
 *   - Implements the shared "Data Table" pattern
 */

/* eslint-disable react/prop-types */

import React from "react";

import { cn } from "@/components/ui/utils";
function Table({ className, containerClassName, ...props }) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto", containerClassName)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}
function TableHeader({ className, ...props }) {
  return <thead
    data-slot="table-header"
    className={cn("[&_tr]:border-b", className)}
    {...props}
  />;
}
function TableBody({ className, ...props }) {
  return <tbody
    data-slot="table-body"
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />;
}
function TableFooter({ className, ...props }) {
  return <tfoot
    data-slot="table-footer"
    className={cn(
      "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />;
}
function TableRow({ className, ...props }) {
  return <tr
    data-slot="table-row"
    className={cn(
      "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
      className
    )}
    {...props}
  />;
}
function TableHead({ className, ...props }) {
  return <th
    data-slot="table-head"
    className={cn(
      "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap has-[[role=checkbox]]:pr-0 *:[[role=checkbox]]:translate-y-0.5",
      className
    )}
    {...props}
  />;
}
function TableCell({ className, ...props }) {
  return <td
    data-slot="table-cell"
    className={cn(
      "p-2 align-middle whitespace-nowrap has-[[role=checkbox]]:pr-0 *:[[role=checkbox]]:translate-y-0.5",
      className
    )}
    {...props}
  />;
}
function TableCaption({
  className,
  ...props
}) {
  return <caption
    data-slot="table-caption"
    className={cn("text-muted-foreground mt-4 text-sm", className)}
    {...props}
  />;
}
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
};
