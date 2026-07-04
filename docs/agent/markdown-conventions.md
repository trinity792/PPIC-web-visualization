---
name: markdown-conventions
description: >
  Enforces structure, formatting, and consistency conventions for all Markdown documentation
  files in the project. Use this skill for ANY documentation task -- writing new docs, editing
  existing ones, creating refactoring plans, agent instructions, guides, or any .md file under
  docs/. Triggers on: "write a doc", "create a guide", "document this", "write up notes",
  "refactoring plan", "update the docs", ".md", "markdown", or any request to create or modify
  a documentation file. This skill defines HOW documentation files are structured, HOW they
  use frontmatter, callouts, and cross-references, and WHAT rendering constraints to respect.
  Always consult this skill even for small doc edits -- consistent formatting matters at every
  scale. Works alongside python_conventions.md (which governs .py files) and
  frontend-conventions.md (which governs .js/.jsx files).
Topic: Convention Guide
Content Type: agent instructions
pinned: false
Date Published: July 04, 2026
Last Updated: 07/04/2026 - 09:20 AM
Status: Updating
---

# Markdown Conventions Skill

Conventions for writing well-structured, consistently formatted Markdown documentation. Every document should be navigable by someone unfamiliar with the project, just by scanning the frontmatter, heading hierarchy, and callouts.

---

## Guiding Principle

**Every document declares what it is before it says anything.** The YAML frontmatter and the opening lines tell a reader the document's purpose, audience, and freshness. The heading hierarchy lets them jump to any section without reading linearly. Callouts surface the things that would otherwise be missed. These structural cues are not decoration; they are the interface to the document.

---

## Dual Rendering Context

Documentation in this project renders in two environments. Every `.md` file must work in both.

**Obsidian** is the authoring environment. Documents live in an Obsidian vault and are read, searched, and linked there first. Obsidian supports callouts (`> [!type]`), wikilinks (`[[Page Name]]`), highlighting (`==text==`), MathJax/LaTeX, and interactive checkboxes (`- [ ]`).

**The web documents renderer** (`/documents`) publishes `docs/` as a browsable catalog. It uses `react-markdown` with `remark-gfm`, `remark-math` + `rehype-katex`, `rehype-raw`, and custom plugins for callouts, wikilinks, symbols, and code blocks. Frontmatter fields drive the catalog cards. SVG fenced blocks (` ```svg `) render as inline images rather than source code.

The practical upshot: standard GFM Markdown, callouts, wikilinks, LaTeX, and tables all work in both contexts. Raw HTML/SVG is trusted and rendered verbatim (safe because `docs/` is internally authored, never user-generated). Avoid features that only one context supports unless the document is explicitly single-context.

---

## YAML Frontmatter (Required)

Every documentation file begins with a YAML frontmatter block. The web renderer reads these fields to build catalog cards; Obsidian uses them for Dataview queries and search.

```yaml
---
Topic: tbd
Content Type: guide
pinned: false
description: "A one-sentence summary of what this document covers and who it is for."
Date Published: June 30, 2026
Last Updated: 06/30/2026 - 10:17 AM
---
```

### Field Definitions

| Field | Required | Values | Purpose |
|---|---|---|---|
| `Topic` | Yes | Free text or `tbd` | The subject area. Use `tbd` when the document hasn't been categorized yet. |
| `Content Type` | Yes | `guide`, `refractor plan`, `agent instructions`, `project specification`, `unit tests plan`, `process documentation`, `landing page`, `codebook`, `implementation plan` | Tells the reader what kind of document this is. |
| `pinned` | Yes | `true` or `false` | Whether the document appears at the top of its catalog section. |
| `description` | Yes | Quoted string | A one-sentence summary shown on catalog cards and used for search. Include the audience when relevant (e.g., "for programmers continuing work on the project"). |
| `Date Published` | Yes | `Month DD, YYYY` | When the document was first created. |
| `Last Updated` | Yes | `MM/DD/YYYY - HH:MM AM/PM` | When the document was last meaningfully edited. Update this on every substantive change. |

### Rules

- Always quote the `description` value to avoid YAML parsing issues with colons, quotes, or special characters inside the string.
- `Last Updated` uses a different date format than `Date Published`. This is intentional (the longer format reads naturally on cards; the shorter format is compact for frequent updates). Do not normalize them to one format.
- Update `Last Updated` whenever content changes. Do not update it for whitespace-only or formatting-only edits.
- `Content Type` should match the document's actual shape, not its subject. A document about unit tests that describes how to write them is a `guide`; a document that specifies exactly which tests to write is a `unit tests plan`.

---

## Heading Hierarchy

| Level | Markdown | Role | Notes |
|---|---|---|---|
| H1 (`#`) | Document title | One per file, immediately after frontmatter | Must match or closely reflect the filename's intent |
| H2 (`##`) | Major sections | Top-level divisions of the document | Separated by `---` horizontal rules |
| H3 (`###`) | Subsections | Sub-divisions within an H2 section | The workhorse heading for most content |
| H4 (`####`) | Fine-grained subsections | Sub-divisions within an H3 | Preferred over bolded text when a subsection needs its own anchor |

### Rules

- **Do not skip levels.** Never jump from H1 to H3 or from H2 to H4. Always step down one level at a time.
- **One H1 per file.** The H1 is the document title. Everything else is H2 or lower.
- **Use H4 instead of bold-as-heading.** When a subsection under H3 needs its own identity, use `####` rather than `**Bold text**` on its own line. H4 headings get anchor links and appear in the table of contents; bold text does not.
- **Avoid H5 and H6.** If you need five levels of nesting, the document should probably be split into two documents or restructured so that a deeply nested section becomes its own H2.
- **Use `---` dividers between H2 sections.** This creates visual breathing room in both Obsidian and the web renderer. Do not place dividers between H3 sections within the same H2.

### Example Structure

```markdown
# Document Title

A one-line summary or introductory sentence.

---

## First Major Section

Introductory paragraph for this section.

### Subsection 1.1

Content here.

#### A Fine-Grained Point

Details that warrant their own anchor.

### Subsection 1.2

Content here.

---

## Second Major Section

### Subsection 2.1

Content here.
```

---

## Callouts

Obsidian callouts (`> [!type]`) are the primary mechanism for surfacing information that would be lost in running prose: warnings, decisions, action items, and context that applies to everything below it. The web renderer reproduces them with matching styling.

### Available Types and When to Use Them

| Type | Syntax | Use for |
|---|---|---|
| `note` | `> [!note]` | Supplementary context that clarifies but is not critical. Structural observations, scope notes, "this is how X relates to Y." |
| `tip` | `> [!tip]` | Practical advice, shortcuts, or recommendations the reader should act on. |
| `important` | `> [!important]` | Key facts the reader must understand before proceeding. Stronger than `note`, weaker than `warning`. |
| `warning` | `> [!warning]` | Fragilities, footguns, or constraints that will cause problems if ignored. |
| `danger` | `> [!danger]` | The highest-severity alert. Things that will break, corrupt data, or cause silent failures. |
| `info` | `> [!info]` | Audience or context-setting blocks, typically at the top of a document. "Who this is for" or "How to read this." |
| `flag` | `> [!flag]` | Action items, implementation tasks, or "create new script" directives in refactoring plans. |
| `success` | `> [!success]` | Verified outcomes, confirmed results, or completion markers. |
| `quote` | `> [!quote]` | Attributed quotations or excerpts from external sources. |

### Rules

- **Use callouts for signal, not decoration.** A document with a callout in every section is noisy. Reserve them for information that genuinely needs to stand apart from the surrounding prose.
- **Callouts are self-contained.** A reader skimming the document should understand each callout without reading the paragraph before it. Include enough context inside the callout itself.
- **Custom titles are supported.** `> [!warning] Geographic coverage` renders with "Geographic coverage" as the callout title instead of the generic "Warning." Use custom titles when the type alone does not convey the subject.
- **Collapsible callouts** use `+` (default open) or `-` (default closed) after the type: `> [!note]+ Click to expand`. Use these sparingly; collapsed content is easily missed.
- **Do not nest callouts.** Obsidian supports it, but the web renderer does not handle nested callouts reliably.

### Example

```markdown
> [!warning] ETL-on-every-chart can overwrite good data with bad
> A transient network blip or a changed file can be cleaned into a malformed
> frame and saved over the canonical CSV. Separate "refresh data" from "draw chart"
> and validate before writing.
```

---

## Writing Style

### Prose Over Bullets

Prefer prose paragraphs over bullet lists. Bullets are for genuinely list-like content (inventories, step sequences, option sets). A paragraph that explains context, motivation, and consequence is almost always more useful than a bulleted summary of the same information.

When bullets are appropriate, each item should be at least one full sentence. Single-word or fragment bullets are a sign that the content should either be a table or inline prose.

### Punctuation

- Use standard hyphens (`-`), not em dashes, for parenthetical asides and ranges. This is a project-wide preference.
- Use the Oxford comma in lists.
- Period-terminate list items that are full sentences. Fragment items (in tables, inventories) do not need periods.

### Tables for Structured Comparisons

When presenting structured information with two or more attributes per item, use a GFM table rather than a nested bullet list. Tables are scannable; nested bullets are not.

```markdown
| Function | Description |
|---|---|
| `clean_e5()` | Keeps only State/County/Region rows; drops April 1 rows. |
| `combine_e5_with_historical()` | Loads the existing CSV, drops overlapping years, concatenates. |
```

### Code References

- Use inline code (`` ` ``) for filenames, function names, column names, config keys, CLI commands, and any string that appears literally in the codebase: `` `pophousing_pipeline.py` ``, `` `Total Population` ``, `` `Geographic Level` ``.
- Use fenced code blocks for multi-line code, file paths, directory trees, or extended examples. Always include a language tag (` ```python `, ` ```js `, ` ```text `, ` ```yaml `).
- For directory trees, use ` ```text ` and draw the tree with `├──`, `└──`, and `│` characters.

### Tone

Write for a reader who is intelligent but unfamiliar with this specific codebase. Explain the "why" alongside the "what." Do not assume the reader has read every other document in `docs/`; if a concept depends on context from another document, link to it or summarize the relevant part.

---

## Internal Linking

### Wikilinks for Cross-References

Use Obsidian wikilink syntax (`[[Document Name]]`) to link between documents in `docs/`. The web renderer resolves these to internal `/documents/<slug>` routes.

```markdown
For the full legacy codebase analysis, see [[previous_tool_analysis]].
The pipeline follows the architecture described in [[projectSpec]].
```

### Rules

- Link to the document name as it appears in the filesystem (without the `.md` extension). Obsidian resolves these by filename regardless of directory.
- Use display-text links when the document name does not read naturally in the sentence: `[[projectSpec|the project specification]]`.
- Do not over-link. A reference to "the project spec" in a document that is clearly downstream of the spec does not need a wikilink every time. Link on first mention within a section, then use plain text.
- External URLs use standard Markdown syntax: `[display text](https://example.com)`.

### Image Embeds

Obsidian supports `![[image.png]]` for vault-local images. The web renderer serves these through an API route (`/api/doc-asset`). Standard Markdown images (`![alt](url)`) also work in both contexts.

---

## Math and LaTeX

Both Obsidian (MathJax) and the web renderer (`remark-math` + `rehype-katex`) support LaTeX notation. Use display mode (`$$...$$`) for block equations and inline mode (`$...$`) for variables and short expressions in prose.

### Critical Rules

- **Double backslash for row breaks.** Use `\\` in all matrix and multi-row environments (`bmatrix`, `cases`, `aligned`, `array`). A single `\` silently collapses the matrix into one line.
- **Blank lines around display blocks.** Leave a blank line before and after `$$` blocks to avoid rendering issues in some themes.
- **Pipe characters in matrices.** Use `\vert` or `\mid` inside math mode if `|` causes GFM table-parsing conflicts.
- **Underscores near math.** Inside math mode, `_` is a subscript. Outside math mode near math blocks, bare underscores can trigger unintended italic formatting. Escape them or restructure the sentence.

### Example

```markdown
The eigenvalue equation is $A\mathbf{x} = \lambda\mathbf{x}$ for some nonzero $\mathbf{x}$.

$$
\begin{bmatrix} 2 - \lambda & 7 \\ 7 & 2 - \lambda \end{bmatrix}
$$
```

---

## SVG in Code Blocks

The web renderer treats fenced SVG blocks (` ```svg `) specially: instead of rendering the SVG as source code, it inlines the markup as a rendered image. This is useful for architecture diagrams and flowcharts authored as raw SVG.

- Default render width is `DOC_SVG_DEFAULT_SIZE` (60% of the article width, defined in `lib/constants.js`).
- Override width per block by appending a number to the language token: ` ```svg-80 ` renders at 80% width.
- Because `rehype-raw` is enabled, SVG markup is trusted and rendered verbatim. This is safe only because `docs/` content is internally authored.

---

## Document Types and Templates

The project uses several document types, each with a characteristic structure. Match the template when creating a new document of that type.

### Refactoring Plan

Used for each module migration. Follows a consistent arc: legacy summary, unique challenges, target architecture, data contract, pipeline phases with function signatures, frontend deliverables, test plan, sequencing, resolved decisions, and open questions.

```markdown
# Module Name: Refactoring Plan

---

## Legacy Module Summary
### Data source
### Current function inventory
### Legacy fragilities carried forward
### Legacy-to-target mapping

---

## Unique Challenges

---

## Target Architecture

---

## Data Contract
### Grain
### Columns

---

## Pipeline Phases and Function Definitions
### Phase 1: Configuration
### Phase 2: Data Acquisition
### Phase 3: Cleaning
...

---

## Frontend Deliverables

---

## Test Plan

---

## Sequencing

---

## Resolved Decisions

---

## Open Questions
```

### Agent Instructions

Used for `AGENTS.md`, `CLAUDE.md`, and conventions files. Structured as imperative rules with clear boundary markers.

```markdown
# Document Title

## Goal
## Tech stack
## Defaults
## Boundaries (Always / Ask first / Never)
## Uncertainty
## Context
```

### Guide (Human-Readable)

Used for documents whose audience may not have programming experience. The `previous_tool_analysis.md` and `AI Comparison Guide.md` are examples. These use more introductory context, define terms before using them, and include an "info" callout at the top stating who the document is for.

```markdown
# Document Title

> [!info] Who this document is for
> Describe the intended audience and what they will get from reading it.

---

## Overview
## Key Concepts
## Detailed Sections
## Glossary (if term-heavy)
```

### Unit Test Plan

Used for specifying exactly which tests to write. Organized by module, with tables of test names and what each verifies. Includes fixture patterns and cross-cutting requirements.

```markdown
# Module -- Unit Testing Guide

## Test Directory Structure
## General Testing Conventions
## Fixture Strategy
## Phase N -- Test Requirements
### `module_name.py`
#### `function_name()`
| Test | What it verifies |
|---|---|
| `test_function_scenario` | Description of what is checked. |
## Summary: Minimum Test Counts
```

---

## Checklists and Task Lists

Use GFM checkboxes (`- [ ]` / `- [x]`) for actionable task lists. Obsidian renders these as interactive checkboxes; the web renderer displays them as styled list items.

```markdown
- [x] Stand up the data layer
- [ ] Port one chart type end-to-end
- [ ] Add remaining chart types
```

### Rules

- Use checkboxes only for items that will actually be checked off. A list of observations or notes is not a checklist.
- Checked items (`- [x]`) indicate completed work. Do not pre-check items that are aspirational.
- In refactoring plans, the "Sequencing" section uses checkboxes for the step list; status annotations (e.g., "complete", "remaining") appear as inline text or status markers, not as checked boxes for future work.

---

## Filename Conventions

- Use **kebab-case** for filenames: `building-permits-refractor.md`, not `BuildingPermits_Refractor.md` or `building_permits_refractor.md`.
- Be descriptive: `age-sex-race-projections-refractor.md`, not `refractor-3.md`.
- Match the document title (H1) reasonably closely. The filename does not need to be identical, but a reader should be able to guess the filename from the title and vice versa.
- Landing pages use `Landing.md` or `{Section} Landing.md`.
- Convention and instruction files use descriptive names: `python_conventions.md`, `frontend-conventions.md`, `AGENTS.md`.

---

## Things to Avoid

- **Raw HTML when Markdown suffices.** Obsidian has limited HTML support, and raw HTML bypasses the renderer's theme tokens. Use HTML only for content that cannot be expressed in Markdown (inline SVG diagrams, status chips with specific styling).
- **Deeply nested bullets.** Keep nesting to two or three levels. If a bullet list needs four levels, it should be restructured as prose with H4 headings, or as a table.
- **Orphan sections.** Every H2 should have content under it. An H2 followed immediately by an H3 with no introductory text reads as a structural accident. Add at least one sentence introducing what the section covers.
- **Giant paragraphs without visual breaks.** Technical documentation benefits from tables, code blocks, callouts, and short paragraphs. A 15-line paragraph without any structural aid is hard to scan.
- **Leaving `Last Updated` stale.** If you edit a document substantively, update the frontmatter timestamp. A reader who sees "Last Updated: 06/22/2026" on a document that discusses July events will not trust the rest of it.
- **Em dashes.** Use hyphens for parenthetical asides and compound modifiers. This is a project-wide style preference.

---

## Quick Reference: Frontmatter for Each Content Type

### Refactoring Plan

```yaml
---
Topic: tbd
Content Type: refractor plan
pinned: false
description: "Refactoring plan for migrating the legacy X module into the V3 architecture."
Date Published: June 30, 2026
Last Updated: 06/30/2026 - 10:17 AM
---
```

### Agent Instructions

```yaml
---
Topic: tbd
Content Type: agent instructions
pinned: false
description: "Top-level orientation for AI agents working on the PPIC V3 migration."
Date Published: June 22, 2026
Last Updated: 06/30/2026 - 10:17 AM
---
```

### Human-Readable Guide

```yaml
---
Topic: AI
Content Type: guide
pinned: true
description: "Comparative guide to AI tools for research and policy workflows."
Date Published: June 30, 2026
Last Updated: 07/02/2026 - 12:04 PM
---
```

### Project Specification

```yaml
---
Topic: tbd
Content Type: project specification
pinned: true
description: "The single source of truth for the project's specification, architecture, and API reference."
Date Published: June 23, 2026
Last Updated: 07/03/2026 - 08:45 PM
---
```

---