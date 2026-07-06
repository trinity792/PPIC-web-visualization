"use client";

/**
 * BackToTopButton.js — floating scroll-to-top control shown on document pages.
 *
 * Props:
 *   None.
 *
 * UI Kit reference:
 *   - Reuses the shared small Button pattern, matched to ReportProblemDialog's
 *     floating trigger so the two sit together in the bottom-right action row.
 */

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";

const SCROLL_THRESHOLD = 400;

export default function BackToTopButton() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setIsVisible(window.scrollY > SCROLL_THRESHOLD);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const onSupportedRoute =
    pathname?.startsWith("/documents") || pathname?.startsWith("/logs");
  if (!onSupportedRoute || !isVisible) {
    return null;
  }

  function handleClick() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={handleClick}
      aria-label="Back to top"
      className="size-8 rounded-full border-ppic-neutral-300 bg-white text-ppic-neutral-600 shadow-md hover:bg-ppic-neutral-50 hover:text-ppic-neutral-600"
    >
      <ArrowUp className="size-4" aria-hidden="true" />
    </Button>
  );
}
