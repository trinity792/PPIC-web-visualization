"use client";

/**
 * Navbar.js — global PPIC brand navigation, module links, and search control.
 *
 * Props:
 *   None.
 *
 * Data sources:
 *   - Official PPIC logo from assets/ppic-logo.svg
 *   - Topic links from lib/visualization/topicRegistry.js
 *   - Document title/content matches from /api/search/documents
 *   - All other application routes are static and defined in this file
 *
 * UI Kit reference:
 *   - Implements the global "Navigation Header" and search-input patterns
 */

import React from "react";
import Image from "next/image";
import Link from "next/link";

import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import NavDropdown from "@/components/ui/nav-dropdown";
import { getTopicLinks } from "@/lib/visualization/topicRegistry";
import ppicLogo from "@/assets/ppic-logo.svg";

const siteLinks = [
  { href: "/", label: "Home" },
  { href: "/visualization-tool", label: "Custom visualizations" },
  { href: "/documents", label: "Documents" },
  { href: "/logs", label: "Logs" },
  { href: "/ui-kit", label: "UI Kit" },
];

export default function Navbar() {
  // Data topics — review-ready v3 modules point to the shared v3 workbench;
  // all other topics retain their detailed graph-editor route at /[module].
  // Derived from the topic registry rather than restated here: the hardcoded
  // copy this replaced had already drifted from the schema ("Housing Stress"
  // where the module is labeled "ACS Housing Stress").
  const moduleLinks = getTopicLinks();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef(null);
  const searchContainerRef = React.useRef(null);
  const resultsRef = React.useRef(null);
  const searchId = React.useId();
  const [documentSearch, setDocumentSearch] = React.useState({ query: "", status: "idle", results: [] });
  const [retry, setRetry] = React.useState(0);
  const normalizedQuery = query.trim();
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const localResults = [...moduleLinks, ...siteLinks].filter((item) =>
    terms.every((term) => item.label.toLowerCase().includes(term)),
  );
  const currentSearch = documentSearch.query === normalizedQuery ? documentSearch : null;
  const results = [...localResults, ...(currentSearch?.results || [])];
  const searchingDocuments = !currentSearch || currentSearch.status === "loading";

  React.useEffect(() => {
    if (!searchOpen || !normalizedQuery) return;
    const controller = new AbortController();
    setDocumentSearch({ query: normalizedQuery, status: "loading", results: [] });
    // Wait for typing to pause; abort prior requests so stale results never win.
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/documents?q=${encodeURIComponent(normalizedQuery)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Document search request failed");
        const data = await response.json();
        if (!controller.signal.aborted) {
          setDocumentSearch({ query: normalizedQuery, status: "success", results: data.results });
        }
      } catch {
        if (!controller.signal.aborted) {
          setDocumentSearch({ query: normalizedQuery, status: "error", results: [] });
        }
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery, searchOpen, retry]);

  const closeSearch = (restoreFocus = false) => {
    if (restoreFocus) searchRef.current?.focus();
    setSearchOpen(false);
    setQuery("");
  };

  React.useEffect(() => {
    if (!searchOpen) return;
    const dismissOutside = (event) => {
      if (!searchContainerRef.current?.contains(event.target)) {
        setSearchOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [searchOpen]);

  return (
    <nav
      aria-label="Primary navigation"
      className="relative z-30 min-h-30 bg-white font-proxima tracking-wider text-black shadow-md"
    >
      <div className="mx-auto flex max-w-400 flex-col gap-4 px-6 py-4 sm:px-12 lg:min-h-30 lg:flex-row lg:items-center lg:justify-between lg:px-16">
        <Link
          href="/"
          aria-label="PPIC home"
          className="inline-flex w-fit shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ppic-data-blue"
        >
          <Image
            src={ppicLogo}
            alt="Public Policy Institute of California"
            width={164}
            height={48}
            className="h-12 w-auto sm:h-14"
            preload
          />
        </Link>

        <div className="flex w-full flex-col gap-2 lg:w-auto lg:items-end">
          <div
            ref={searchContainerRef}
            className="relative z-40 w-full sm:w-56"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeSearch(true);
              }
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) closeSearch();
            }}
          >
            <form
              role="search"
              aria-label="Search topics, pages, and documents"
              className="flex h-8 w-full items-center bg-ppic-neutral-50 focus-within:ring-2 focus-within:ring-ppic-data-blue"
              onSubmit={(event) => {
                event.preventDefault();
                resultsRef.current?.querySelector("a")?.focus();
              }}
            >
              <Input
                ref={searchRef}
                name="q"
                aria-controls={searchOpen && terms.length > 0 ? searchId : undefined}
                type="search"
                aria-label="Search topics, pages, and documents"
                maxLength={200}
                placeholder="Search"
                value={query}
                onFocus={() => setSearchOpen(true)}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSearchOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    resultsRef.current?.querySelector("a")?.focus();
                  }
                }}
                className="h-full rounded-none border-0 bg-transparent pl-4 pr-2 text-sm font-bold text-black shadow-none placeholder:text-black focus-visible:ring-0 dark:bg-transparent"
              />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                aria-label="Search"
                className="h-full w-10 shrink-0 rounded-none text-black hover:bg-transparent hover:text-ppic-brand"
              >
                <Search aria-hidden="true" className="size-3.5" />
              </Button>
            </form>
            {searchOpen && terms.length > 0 && (
              <div id={searchId} ref={resultsRef} className="absolute right-0 top-full max-h-80 w-full overflow-y-auto border border-ppic-border bg-white p-4 shadow-lg sm:w-96">
                <p role="status" className="mb-2 text-sm text-ppic-neutral-400">
                  {searchingDocuments ? "Searching documents…"
                    : results.length ? `${results.length} matching results`
                    : currentSearch?.status === "error" ? "No matching topics or pages."
                    : "No matches. Try another search term."}
                </p>
                {currentSearch?.status === "error" && (
                  <div role="alert" className="mb-2 text-sm">
                    Document search is unavailable.
                    <button type="button" className="ml-2 underline" onClick={() => setRetry((value) => value + 1)}>Try again</button>
                  </div>
                )}
                <ul aria-label="Search results">
                  {results.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="block px-3 py-2 hover:bg-ppic-neutral-50 focus-visible:bg-ppic-neutral-50" onClick={() => closeSearch()}>
                        <span className="block">{item.label}</span>
                        {item.kind && <span className="block text-xs text-ppic-neutral-400">{item.kind}</span>}
                        {item.summary && <span className="mt-1 line-clamp-2 block text-xs text-ppic-neutral-400">{item.summary}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm lg:justify-end">
            <Link href="/" className="ppic-nav-link">Home</Link>
            <NavDropdown label="Topic" items={moduleLinks} />
            {siteLinks.slice(1).map((item) => (
              <Link key={item.href} href={item.href} className="ppic-nav-link">
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
