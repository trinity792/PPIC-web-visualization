/**
 * nav-dropdown.js — hover-activated navigation dropdown for the primary navbar.
 *
 * Props:
 *   label {string}        — text shown on the trigger button
 *   items {Array<{href: string, label: string}>} — menu links, in display order
 *   className {string}    — optional extra classes on the wrapper
 *
 * Behavior:
 *   - Opens on pointer hover and stays open while the pointer is over the
 *     trigger OR the menu (both live inside the hover wrapper, so there is no
 *     dead gap between them).
 *   - Closes when a menu item is clicked (the link then navigates), when the
 *     pointer leaves the wrapper, on blur, or on Escape.
 *   - Keyboard accessible: the trigger toggles on Enter/Space and focus opens
 *     the menu; Escape closes it and returns focus to the trigger.
 *
 * Data sources:
 *   - Menu links are passed in via the `items` prop
 *
 * UI Kit reference:
 *   - Extends the global "Navigation Header" pattern with a hover menu
 */

"use client";

/* eslint-disable react/prop-types */

import React from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { cn } from "@/components/ui/utils";

export default function NavDropdown({ label, items, className }) {
  const [open, setOpen] = React.useState(false);
  const wrapperRef = React.useRef(null);
  const triggerRef = React.useRef(null);
  const closeTimer = React.useRef(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const openNow = React.useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  // Delay closing so a quick diagonal move from the trigger toward a menu item
  // (which briefly leaves the hover region) doesn't dismiss the menu.
  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 100);
  }, [cancelClose]);

  const close = React.useCallback(() => {
    cancelClose();
    setOpen(false);
  }, [cancelClose]);

  React.useEffect(() => cancelClose, [cancelClose]);

  // Close when focus moves entirely outside the wrapper (e.g. tabbing away).
  const handleBlur = React.useCallback(
    (event) => {
      if (!wrapperRef.current?.contains(event.relatedTarget)) {
        close();
      }
    },
    [close],
  );

  const handleKeyDown = React.useCallback(
    (event) => {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    },
    [close],
  );

  return (
    <div
      ref={wrapperRef}
      className={cn("relative", className)}
      onMouseEnter={openNow}
      onMouseLeave={scheduleClose}
      onFocus={openNow}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1 font-body text-sm hover:underline"
      >
        {label}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {/* The outer box is anchored flush to the trigger (top-full) and uses
          padding — not margin — for the visual gap, so the space between the
          trigger and the card is still part of the hover region. This lets the
          pointer travel diagonally toward a menu item without leaving the
          wrapper and dismissing the menu. */}
      <div
        className={cn(
          "absolute right-0 top-full z-40 pt-2",
          open ? "block" : "hidden",
        )}
      >
        <div
          role="menu"
          aria-label={label}
          className="flex min-w-56 flex-col rounded-md bg-white py-2 text-foreground shadow-lg ring-1 ring-black/5"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={close}
              className="block px-4 py-2 text-sm hover:bg-ppic-brand-soft hover:text-black"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
