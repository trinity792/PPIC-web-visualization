---
Topic: AI
Content Type: agent instructions
pinned: false
description: "Top-level orientation for AI agents maintaining the PPIC data pipelines and V3 React/Next.js visualization site. Sets project goals, commands, sources of truth, and contributor boundaries."
Date Published: June 22, 2026
Last Updated: 09/18/2026 - 02:50 PM
Status: Updating
---

# AGENTS.md

## Goal

This repository maintains PPIC data pipelines and the V3 React/Next.js visualization
site that replaced the legacy Jupyter (V1) and partial Shiny (V2) tools. Six topic
topics currently feed the shared application: Population and Housing, Components of
Change, Demographic Projections, Housing Stress, Building Permits, and RHNA Progress.
The frontend uses a shared question model, topic schemas, adapters, and chart
renderers, and it must remain extensible to additional topics and visualizations.
Pipelines must preserve validated data contracts and backend error handling; when
recovery fails, the application must surface a message identifying the error source.
The project must remain understandable to non-developers and future contributors.

## Tech stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4, Plotly.js (via react-plotly.js)
- **Backend/ETL:** Python 3, pandas
- **Testing:** Vitest and Playwright (frontend); pytest (backend)
- **Dev environment:** macOS, VS Code workspace, `web-viz-venv` on Python 3.12

## Workspace

- `web-data-visualization/` — the project root. All work happens here.

## Commands

- `npm run dev` — start Next.js dev server
- `npm test` — run frontend unit tests
- `npm run build` — production build
- `npm run check:palette` — verify generated palette CSS
- `npm run check:settings` — verify generated settings documentation
- `web-viz-venv/bin/python -m pytest` — run backend tests

## Defaults

- Make the smallest working change that solves the requested task
- Match existing code patterns and project structure
- Do not touch unrelated files
- Ask before destructive or irreversible actions
- Do not invent requirements, APIs, or test results
- Restate the task briefly before major edits
- Before writing new code, search the codebase for existing utilities or patterns that already solve the problem; generalize shared logic into reusable functions rather than duplicating it across files

## Boundaries

✅ **Always:**
- Run tests before committing
- Check `docs/agent/` for project context before architectural changes;
  if not found there, check other folders within `docs/`
- Read `lib/pophousing_config.py` before making Population and Housing data changes;
  it is the source of truth for that topic's regions, geographic classifications,
  and column definitions
- Treat `lib/config.py` as the source of shared paths and HTTP defaults, not as a
  universal schema or geography registry
- Use `scripts/<topic>/config/` for topic-specific Python contracts and
  `lib/visualization/moduleSchemas/` for client-safe frontend field contracts
- Follow Python conventions in `docs/agent/python-skill.md` when writing or modifying `.py` files
- Follow `docs/agent/markdown-skill.md` while editing markdown files.
- Reference `docs/agent/frontend-skill.md` before implementing any frontend UI;
  match its patterns for layout, typography, color usage, and component styling
- Follow `docs/agent/changelog-updater-skill.md` when adding an entry to the
  /logs Changelog (edit `data/changelog-overlay.json`, then rebuild)
- Use the shared constants/theme file (for example, `lib/constants.js`) for all
  colors, fonts, spacing, and design tokens; never hard-code these values in
  individual components. When a new value is needed, add it to the shared owner
  first, then import it.

## Permissions

- Reading, searching, listing, or viewing files within `web-data-visualization/` does not require user approval — just do it
- Running unit tests/unit checks or running npm does not require user approval - just do it
- Only prompt for confirmation before destructive, irreversible, or out-of-scope actions
  (e.g., deleting files, modifying configs listed under "Ask first")

⚠️ **Ask first:**
- Adding new dependencies (npm or pip)
- Modifying `lib/config.py` or a topic-specific root config such as
  `lib/pophousing_config.py`
- Changing data schemas or output file formats
- Restructuring folders under `scripts/` or `lib/`

🚫 **Never:**
- Commit raw data files or cleaned CSVs to git
- Rewrite working pipeline logic without explicit instruction
- Suppress warnings with blanket `warnings.filterwarnings("ignore")`

## Uncertainty

- Flag low-confidence conclusions explicitly
- When multiple reasonable paths exist, present the trade-off before acting
- Stop and ask if the task expands beyond the original scope

## Context

For full legacy codebase understanding, read `docs/specifications/previous_tool_analysis.md`.

For the full project spec, read `docs/specifications/projectSpec.md`

For an as-built pipeline overview, read the matching guide in `docs/topic-guides/`.
