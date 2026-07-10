/**
 * Navbar.js — global PPIC brand navigation, module links, and search control.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Static application routes defined in this file
 *
 * UI Kit reference:
 *   - Implements the global "Navigation Header" and search-input patterns
 */

import React from "react";
import Link from "next/link";

import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import NavDropdown from "@/components/ui/nav-dropdown";

// Data modules — each links to its detailed graph-editor page at /[module].
const MODULE_LINKS = [
  { href: "/pophousing", label: "Population & Housing" },
  { href: "/components-of-change", label: "Components of Change" },
  { href: "/demographic-projections", label: "Age, Sex & Race Projections" },
  { href: "/housing-stress", label: "Housing Stress" },
  { href: "/building-permits", label: "Building Permits" },
];

export default function Navbar() {
  return (
    <nav
      aria-label="Primary navigation"
      className="relative z-30 min-h-30 bg-ppic-brand text-white shadow-sm"
    >
      <div className="mx-auto flex max-w-400 flex-col gap-4 px-5 py-4 sm:px-10 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/"
            className="font-display text-3xl font-black tracking-[0.08em] sm:text-5xl"
          >
            PPIC
          </Link>
          <div aria-hidden="true" className="h-14 w-px bg-white/45" />
          <div className="font-heading text-sm leading-relaxed tracking-[0.12em] sm:text-lg">
            <div>PUBLIC POLICY</div>
            <div>INSTITUTE OF CALIFORNIA</div>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <form className="flex w-full max-w-sm items-center rounded-md bg-white p-1 lg:w-80">
            <Input
              name="q"
              type="search"
              aria-label="Search data modules"
              placeholder="Search"
              className="border-0 bg-white text-foreground shadow-none focus-visible:ring-0"
            />
            <Button type="submit" variant="ghost" size="icon" aria-label="Search">
              <Search aria-hidden="true" className="text-muted-foreground" />
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 font-body text-sm">
            <NavDropdown label="Modules" items={MODULE_LINKS} />
            <Link href="/visualization-tool" className="hover:underline">
              Visualization Tool
            </Link>
            <Link href="/documents" className="hover:underline">
              Documents
            </Link>
            <Link href="/logs" className="hover:underline">
              Logs
            </Link>
            <Link href="/ui-kit" className="hover:underline">
              UI Kit
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
