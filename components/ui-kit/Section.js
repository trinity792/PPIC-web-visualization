/* eslint-disable react/prop-types */
import React from "react";

export function Section({ id, eyebrow, title, description, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-6">
        {eyebrow && (
          <p
            className="mb-1 text-[12px] uppercase tracking-[0.22em]"
            style={{ fontFamily: "var(--font-sans)", color: "var(--ppic-orange-300)" }}
          >
            {eyebrow}
          </p>
        )}
        <h2
          className="text-[28px] tracking-[0.04em] text-neutral-900"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {title}
        </h2>
        {/* signature orange underline accent */}
        <div
          className="mt-2 h-[3px] w-12 rounded-full"
          style={{ backgroundColor: "var(--ppic-orange-300)" }}
        />
        {description && (
          <p
            className="mt-3 max-w-2xl text-[15px] leading-relaxed text-neutral-600"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

export function Panel({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border bg-white p-6 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.06)] ${className}`}
      style={{ borderColor: "var(--ppic-border)" }}
    >
      {children}
    </div>
  );
}

export function Caption({ children }) {
  return (
    <p
      className="mt-3 text-[12px] uppercase tracking-[0.14em] text-neutral-500"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {children}
    </p>
  );
}
