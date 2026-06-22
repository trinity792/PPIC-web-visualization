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

This VS Code workspace has two folders:

- `web-data-visualization/` — the new project root. All work happens here.
- `Previous Tool/` — read-only legacy reference. Contains `Visualization Tool/`
  (14 Jupyter notebooks across 5 datasets) and `Automated Data Pipeline/`
  (the Shiny web app and production ETL pipeline). Never modify this folder.

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

## Boundaries

✅ **Always:**
- Run tests before committing
- Check `docs/agent/` for project context before architectural changes;
  if not found there, check other folders within `docs/`
- Read `lib/config.py` before making data-related changes — it is the single
  source of truth for regions, geographic classifications, and column definitions
- "Follow Python conventions in `docs/agent/python-conventions.md` when writing or modifying `.py` files."

⚠️ **Ask first:**
- Adding new dependencies (npm or pip)
- Modifying `lib/config.py`
- Changing data schemas or output file formats
- Restructuring folders under `scripts/` or `lib/`

🚫 **Never:**
- Modify anything under `Previous Tool/`
- Commit raw data files or cleaned CSVs to git
- Rewrite working pipeline logic without explicit instruction
- Suppress warnings with blanket `warnings.filterwarnings("ignore")`

## Uncertainty

- Flag low-confidence conclusions explicitly
- When multiple reasonable paths exist, present the trade-off before acting
- Stop and ask if the task expands beyond the original scope

## Context

For full legacy codebase understanding, read `docs/technical/previous-tool-analysis.md`.

Additional context files (read when relevant):
- `docs/agent/CLAUDE.md` — Claude-specific instructions
