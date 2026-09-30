/**
 * nav-dropdown.js — hover-activated navigation dropdown for the primary navbar.
 *
 * Props:
 *   label {string}        — text shown on the trigger button
 *   items {Array<{href: string, label: string}>} — menu links, in display order
 *   className {string}    — optional extra classes on the wrapper
 *   disabled {boolean}   — suspends the menu while navbar search is open
 *
 * Behavior:
 *   - Opens on pointer hover and stays open while the pointer is over the
 *     trigger OR the menu (both live inside the hover wrapper, so there is no
 *     dead gap between them).
 *   - Closes when a menu item is clicked (the link then navigates), when the
 *     pointer leaves the wrapper, on blur, or on Escape.
 *   - Enter/Space toggles the menu; arrow keys move between items.
 *     Escape closes it and returns focus to the trigger.
 *
 * Data sources:
 *   - Menu links are passed in via the `items` prop
 *
 * UI Kit reference:
 *   - Extends the global "Navigation Header" pattern with a hover menu
 */

"use client";

import React from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { cn } from "@/components/ui/utils";

export default function NavDropdown({ label, items, className, disabled = false }) {
  const [open, setOpen] = React.useState(false);
  const menuOpen = open && !disabled;
  const menuId = React.useId();
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
    if (disabled) return;
    cancelClose();
    setOpen(true);
  }, [cancelClose, disabled]);

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
  React.useEffect(() => {
    if (disabled) close();
  }, [disabled, close]);

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
        event.stopPropagation();
        close();
        triggerRef.current?.focus();
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const links = [...wrapperRef.current.querySelectorAll('[role="menuitem"]')];
        const current = links.indexOf(document.activeElement);
        const index = event.key === "Home" ? 0
          : event.key === "End" ? links.length - 1
          : event.key === "ArrowDown" ? (current + 1) % links.length
          : current <= 0 ? links.length - 1 : current - 1;
        openNow();
        // Wait for React to remove inert before moving focus into the panel.
        requestAnimationFrame(() => links[index]?.focus());
      }
    },
    [close, openNow],
  );

  return (
    <div
      ref={wrapperRef}
      className={cn("relative", className)}
      onMouseEnter={openNow}
      onMouseLeave={scheduleClose}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="ppic-nav-link flex items-center gap-1 text-sm"
      >
        {label}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 transition-transform duration-200 motion-reduce:transition-none",
            menuOpen && "rotate-180",
          )}
        />
      </button>

      {/* The outer box is anchored flush to the trigger (top-full) and uses
          padding — not margin — for the visual gap, so the space between the
          trigger and the card is still part of the hover region. This lets the
          pointer travel diagonally toward a menu item without leaving the
          wrapper and dismissing the menu. */}
      <div
        id={menuId}
        className="ppic-nav-reveal absolute left-0 top-full z-40 pt-2 lg:left-auto lg:right-0"
        data-open={menuOpen}
        aria-hidden={!menuOpen}
        inert={!menuOpen}
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
              className="block px-4 py-2 text-sm tracking-normal transition-colors hover:text-ppic-official-orange focus-visible:text-ppic-official-orange motion-reduce:transition-none"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
