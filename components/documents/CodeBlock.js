"use client";

/**
 * CodeBlock.js — fenced code block with a language header, line numbers, and copy.
 *
 * Styling mirrors the Obsidian "Code Styler" look (rounded 10px block, a header
 * bar with the language tag, a line-number gutter). Syntax highlighting uses
 * react-syntax-highlighter's PrismLight with a registered language subset.
 *
 * Attribution: code-block styling inspired by Code Styler by Mayuran Visakan.
 *
 * Props:
 *   className {string} — the ``language-xxx`` class react-markdown passes for fences
 *   children {node}    — code text
 *   inline   {boolean} — true for inline `code` spans
 *
 * Data sources:
 *   - Via props from MarkdownArticle
 *
 * UI Kit reference:
 *   - Custom "Code Block" pattern (PPIC tokens)
 */

/* eslint-disable react/prop-types */

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";

SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("shell", bash);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("diff", diff);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("md", markdown);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("py", python);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);

export function CodeBlock({ className, children, inline }) {
  const [copied, setCopied] = useState(false);
  const code = String(children ?? "").replace(/\n$/, "");
  const lang = /language-(\w+)/.exec(className || "")?.[1];

  // Inline code (no language / single line) renders as a simple styled span.
  if (inline || (!lang && !code.includes("\n"))) {
    return <code className="ppic-inline-code">{children}</code>;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="ppic-codeblock">
      <div className="ppic-codeblock-header">
        <span className="ppic-codeblock-lang">{lang || "text"}</span>
        <button type="button" onClick={copy} className="ppic-codeblock-copy" aria-label="Copy code">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <SyntaxHighlighter
        language={lang || "text"}
        style={oneLight}
        showLineNumbers
        customStyle={{
          margin: 0,
          background: "transparent",
          fontSize: 13.5,
          padding: "12px 0",
        }}
        lineNumberStyle={{
          minWidth: "3em",
          paddingRight: "1em",
          textAlign: "right",
          color: "var(--ppic-neutral-300)",
          userSelect: "none",
        }}
        codeTagProps={{ style: { fontFamily: "var(--font-mono, ui-monospace, monospace)" } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
