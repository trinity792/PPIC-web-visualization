/**
 * UnderConstruction.js — shared placeholder for pages not yet built.
 *
 * Props:
 *   label {string} — optional secondary label shown under the banner
 *
 * Data sources:
 *   - None (static)
 *
 * UI Kit reference:
 *   - None — utility placeholder
 */

/* eslint-disable react/prop-types */

import React from "react";

export default function UnderConstruction({ label }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center"
      style={{ backgroundColor: "var(--ppic-surface)" }}
    >
      <p
        className="text-neutral-500"
        style={{ fontFamily: "var(--font-serif)", fontSize: 32 }}
      >
        &lt;under construction&gt;
      </p>
      {label ? (
        <p style={{ fontFamily: "var(--font-sans)", color: "var(--ppic-neutral-400)" }}>
          {label}
        </p>
      ) : null}
    </div>
  );
}
