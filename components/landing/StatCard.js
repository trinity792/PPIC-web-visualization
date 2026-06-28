/* eslint-disable react/prop-types */
import React from "react";

/** Presentational landing stat card (serif value over a muted label). */
export default function StatCard({ label, value }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-card px-6 py-8 text-center shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-serif text-4xl font-semibold sm:text-5xl">{value}</p>
    </div>
  );
}
