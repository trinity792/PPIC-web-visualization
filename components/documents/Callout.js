"use client";

/**
 * Callout.js — renders an Obsidian callout admonition.
 *
 * Consumes the `<div class="callout" data-callout=… data-callout-fold=…
 * data-callout-title=…>` produced by remarkCallouts. Colors/icon/label come from
 * calloutStyles. Foldable callouts (`+`/`-`) render inside a <details>.
 *
 * Props (from react-markdown, spread onto the div element):
 *   data-callout       {string} — type (note, tip, warning, flag, …)
 *   data-callout-fold  {string} — "", "+", or "-"
 *   data-callout-title {string} — optional custom title
 *   children           {node}   — callout body
 *
 * Data sources:
 *   - Via props from MarkdownArticle
 *
 * UI Kit reference:
 *   - Custom "Callout" pattern (PPIC tokens)
 */

/* eslint-disable react/prop-types */

import React from "react";
import * as Icons from "lucide-react";

import { calloutStyle } from "@/lib/docs/markdown/calloutStyles";

export function Callout(props) {
  const type = props["data-callout"] || "note";
  const fold = props["data-callout-fold"] || "";
  const customTitle = props["data-callout-title"];
  const children = props.children;

  const style = calloutStyle(type);
  const Icon = Icons[style.icon] || Icons.Info;
  const title = customTitle || style.label;
  const foldable = fold === "+" || fold === "-";

  const solid = style.solid;
  const rootStyle = {
    "--callout-accent": style.accent,
    borderLeft: solid ? "none" : "4px solid var(--callout-accent)",
    background: solid
      ? "var(--callout-accent)"
      : "color-mix(in srgb, var(--callout-accent) 8%, var(--ppic-card))",
    color: solid ? "#ffffff" : "inherit",
  };
  const accentColor = solid ? "#ffffff" : "var(--callout-accent)";

  const Header = (
    <div className="ppic-callout-title" style={{ color: accentColor }}>
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      <span>{title}</span>
      {foldable ? (
        <Icons.ChevronDown className="ppic-callout-chevron size-4 shrink-0" aria-hidden="true" />
      ) : null}
    </div>
  );

  if (foldable) {
    return (
      <details className="ppic-callout" data-callout={type} open={fold === "+"} style={rootStyle}>
        <summary className="ppic-callout-summary">{Header}</summary>
        <div className="ppic-callout-body">{children}</div>
      </details>
    );
  }

  return (
    <div className="ppic-callout" data-callout={type} style={rootStyle}>
      {Header}
      <div className="ppic-callout-body">{children}</div>
    </div>
  );
}
