---
Topic: AI
Content Type: agent instructions
pinned: false
description: "Top-level orientation for AI agents working on the PPIC V3 migration, which consolidates the legacy Jupyter (V1) and partial Shiny (V2) systems into a documented, tested React/Next.js site. Sets the project's goals and ground rules for contributors."
Date Published: June 22, 2026
Last Updated: 06/30/2026 - 10:17 AM
Status: Updating
---

# AGENTS.md

## Goal

This is a migration/refactor project at PPIC (Public Policy Institute of California).
The legacy codebase had two separate systems: Jupyter notebook visualizations of
California demographic data (V1) and a partial Shiny web app (V2). This project (V3)
consolidates everything into a React/Next.js website that reproduces all existing
visualizations, supports adding new ones, and includes backend error handling and
testing with pytest. When all error handling fails, the application surfaces a message
identifying the error source. The final product should be fully documented so that
non-developers can understand it and future contributors can extend it.

## Tech stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4, Plotly.js (via react-plotly.js)
- **Backend/ETL:** Python 3, pandas
- **Testing:** pytest (backend); errors surface messages identifying the failure source
- **Dev environment:** macOS, VS Code workspace, `.venv` for Python

## Workspace

This VS Code workspace has three folders:

- `web-data-visualization/` — the new project root. All work happens here.
- `Previous Tool/` — read-only legacy reference. Contains `Visualization Tool/`
  (14 Jupyter notebooks across 5 datasets) and `Automated Data Pipeline/`
  (the Shiny web app and production ETL pipeline). Never modify this folder.
  `UI Kit for Data Visualization/` - the UI kit for front end work. read-only reference.

## Commands

- `npm run dev` — start Next.js dev server
- `npm run build` — production build
- `python -m pytest` — run backend tests (from project root with .venv activated)

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
- Read `lib/pophousing_config.py` before making Population & Housing data changes —
  it is the source of truth for regions, geographic classifications, and column definitions
- Follow Python conventions in `docs/agent/python_conventions.md` when writing or modifying `.py` files
- Follow `docs/agent/markdown-conventions.md` while editing markdown files.
- Reference `docs/agent/frontend-conventions.md` before implementing any frontend UI;
  match its patterns for layout, typography, color usage, and component styling
- Use the shared constants/theme module (e.g., `constants.js`) for all colors, fonts,
  spacing, and design tokens — never hard-code these values in individual components.
  When a new value is needed, add it to the constants file first, then import it.

## Permissions

- Reading, searching, listing, or viewing files within `web-data-visualization/` or `previous tool/` does not require user approval — just do it
- Running unit tests/unit checks or running npm does not require user approval - just do it
- Only prompt for confirmation before destructive, irreversible, or out-of-scope actions
  (e.g., deleting files, modifying configs listed under "Ask first")

⚠️ **Ask first:**
- Adding new dependencies (npm or pip)
- Modifying `lib/config.py` or a module-specific root config such as
  `lib/pophousing_config.py`
- Changing data schemas or output file formats
- Restructuring folders under `scripts/` or `lib/`

🚫 **Never:**
- Modify anything under `Previous Tool/` or `UI Kit for Data Visualization`
- Commit raw data files or cleaned CSVs to git
- Rewrite working pipeline logic without explicit instruction
- Suppress warnings with blanket `warnings.filterwarnings("ignore")`

## Uncertainty

- Flag low-confidence conclusions explicitly
- When multiple reasonable paths exist, present the trade-off before acting
- Stop and ask if the task expands beyond the original scope

## Context

For full legacy codebase understanding, read `docs/PPIC Summer 2026/specifications/previous_tool_analysis.md`.

For the full project spec, read `docs/PPIC Summer 2026/specifications/projectSpec.md`
