/**
 * under-construction.js — reusable "page under construction" placeholder.
 *
 * Drop this into any route whose feature has not been built yet. It renders a
 * centered icon, title, and message using the shared PPIC surface tokens, so
 * every not-yet-built page looks the same.
 *
 * Props:
 *   title {string}   — heading text (default "Under construction")
 *   message {string} — supporting line (default "Check back soon.")
 *   icon {React.ComponentType} — lucide (or compatible) icon component to show;
 *                                defaults to the Construction icon
 *
 * Data sources:
 *   - None — presentational placeholder
 *
 * UI Kit reference:
 *   - Shared empty/placeholder state pattern
 */

/* eslint-disable react/prop-types */

import React from "react";

import { Construction } from "lucide-react";

export function UnderConstruction({
  title = "Under construction",
  message = "Check back soon.",
  icon: Icon = Construction,
}) {
  return (
    <main
      className="flex min-h-[70vh] items-center justify-center px-6 py-24"
      style={{ backgroundColor: "var(--ppic-surface)" }}
    >
      <div className="max-w-lg text-center">
        <Icon aria-hidden="true" className="mx-auto mb-6 size-14 text-ppic-brand" />
        <h1 className="font-heading text-3xl font-bold text-foreground">
          {title}
        </h1>
        <p className="mt-3 font-body text-lg text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}

export default UnderConstruction;
