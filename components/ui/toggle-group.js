"use client";

/**
 * toggle-group.js — grouped Radix toggle controls with shared variants and sizing.
 *
 * Props:
 *   className {string}    — optional utility classes
 *   variant   {string}    — toggle visual variant
 *   size      {string}    — toggle size
 *   children  {ReactNode} — toggle-group items
 *   ...props  {Object}    — corresponding Radix ToggleGroup attributes
 *
 * Data sources:
 *   - Selected values via props from parent components
 *
 * UI Kit reference:
 *   - Implements the shared grouped-toggle pattern
 */

/* eslint-disable react/prop-types */

import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";

import { toggleVariants } from "@/components/ui/toggle";
import { cn } from "@/components/ui/utils";
const ToggleGroupContext = React.createContext({
  size: "default",
  variant: "default"
});
function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}) {
  return <ToggleGroupPrimitive.Root
    data-slot="toggle-group"
    data-variant={variant}
    data-size={size}
    className={cn(
      "group/toggle-group flex w-fit items-center rounded-md data-[variant=outline]:shadow-xs",
      className
    )}
    {...props}
  >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>;
}
function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}) {
  const context = React.useContext(ToggleGroupContext);
  return <ToggleGroupPrimitive.Item
    data-slot="toggle-group-item"
    data-variant={context.variant || variant}
    data-size={context.size || size}
    className={cn(
      toggleVariants({
        variant: context.variant || variant,
        size: context.size || size
      }),
      "min-w-0 flex-1 shrink-0 rounded-none shadow-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 data-[variant=outline]:border-l-0 data-[variant=outline]:first:border-l",
      className
    )}
    {...props}
  >
      {children}
    </ToggleGroupPrimitive.Item>;
}
export {
  ToggleGroup,
  ToggleGroupItem
};
