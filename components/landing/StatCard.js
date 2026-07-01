/**
 * StatCard.js — headline statistic with a supporting label.
 *
 * Props:
 *   label {string}        — description displayed above the statistic
 *   value {string|number} — formatted statistic value
 *
 * Data sources:
 *   - Via props from a category dashboard
 *
 * UI Kit reference:
 *   - Implements the "Stat Card" pattern
 */

/* eslint-disable react/prop-types */

import React from "react";

export default function StatCard({ label, value }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-card px-6 py-8 text-center shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-serif text-4xl font-semibold sm:text-5xl">{value}</p>
    </div>
  );
}
