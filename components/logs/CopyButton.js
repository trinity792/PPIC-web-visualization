"use client";

/**
 * CopyButton.js — small copy-to-clipboard button with a timed "Copied" state.
 *
 * Reuses the clipboard + timeout pattern from components/documents/CodeBlock.js,
 * extracted so both the raw-record and traceback copy affordances on a log card
 * share one implementation.
 *
 * Props:
 *   text  {string} — the text to copy
 *   label {string} — accessible label + resting button text (default "Copy")
 */

/* eslint-disable react/prop-types */

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className="inline-flex items-center gap-1.5 rounded-md border border-ppic-border bg-white px-2.5 py-1 text-xs text-ppic-neutral-600 transition-colors hover:bg-ppic-neutral-50"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}
