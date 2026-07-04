"use client";

/**
 * MarkdownArticle.js — renders a document's Markdown body (client island).
 *
 * Wires react-markdown with the GFM/math/wikilink/symbol/callout remark plugins
 * and slug/raw/katex rehype plugins, then maps elements to the project's
 * interactive components (CodeBlock, Callout) and internal links/images. The
 * wikilink resolution maps are computed server-side and passed in as props.
 *
 * Props:
 *   content  {string} — raw Markdown body
 *   linkMap  {Object} — filename→slug (for [[wikilinks]])
 *   assetMap {Object} — filename→docs-relative path (for ![[embeds]])
 *
 * Data sources:
 *   - Via props from DocumentView
 *
 * UI Kit reference:
 *   - Scoped ".ppic-markdown" typography (app/globals.css)
 */

/* eslint-disable react/prop-types */
// react-markdown passes a `node` prop to every component override; we strip it
// (via `node: _node`) so it isn't spread onto DOM elements.
/* eslint-disable no-unused-vars */

import React from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";

import "katex/dist/katex.min.css";

import { CodeBlock } from "./CodeBlock";
import { Callout } from "./Callout";
import remarkWikilinks from "@/lib/docs/markdown/remarkWikilinks";
import remarkSymbols from "@/lib/docs/markdown/remarkSymbols";
import remarkCallouts from "@/lib/docs/markdown/remarkCallouts";
import remarkLineParagraphs from "@/lib/docs/markdown/remarkLineParagraphs";
import { DOC_SVG_DEFAULT_SIZE } from "@/lib/constants";

export default function MarkdownArticle({ content, linkMap, assetMap }) {
  const remarkPlugins = [
    remarkGfm,
    // Matches Obsidian: single `$` is inline math, `$$ … $$` is display math.
    // Literal dollars in prose (e.g. "\$20/month") must be escaped as `\$`.
    remarkMath,
    [remarkWikilinks, { linkMap, assetMap }],
    remarkCallouts,
    remarkLineParagraphs,
    remarkSymbols,
  ];
  const rehypePlugins = [rehypeRaw, rehypeSlug, rehypeKatex];

  const components = {
    pre: ({ children }) => <>{children}</>,
    code({ className, children }) {
      const text = String(children ?? "");
      // An ```svg fenced block renders as an inline image rather than source.
      // The render width defaults to DOC_SVG_DEFAULT_SIZE; a ```svg-80 fence
      // (className "language-svg-80") overrides it to 80%.
      if (/language-svg\b/.test(className || "")) {
        const sizeMatch = /language-svg-(\d+)/.exec(className || "");
        const width = sizeMatch ? `${sizeMatch[1]}%` : DOC_SVG_DEFAULT_SIZE;
        return (
          <span
            className="ppic-doc-svg"
            role="img"
            style={{ width }}
            dangerouslySetInnerHTML={{ __html: text }}
          />
        );
      }
      const isBlock = /language-/.test(className || "") || text.includes("\n");
      return isBlock ? (
        <CodeBlock className={className}>{children}</CodeBlock>
      ) : (
        <code className="ppic-inline-code">{children}</code>
      );
    },
    div({ node: _node, className, ...rest }) {
      if ((className || "").split(" ").includes("callout")) {
        return <Callout className={className} {...rest} />;
      }
      return <div className={className} {...rest} />;
    },
    a({ node: _node, href, children, ...rest }) {
      if (href && (href.startsWith("/") || href.startsWith("#"))) {
        return (
          <Link href={href} {...rest}>
            {children}
          </Link>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
          {children}
        </a>
      );
    },
    img({ node: _node, src, alt, ...rest }) {
      return <img src={src} alt={alt || ""} className="ppic-doc-image" loading="lazy" {...rest} />;
    },
  };

  return (
    <article className="ppic-markdown">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
