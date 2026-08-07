# CLAUDE.md

## Commands

- `npm run dev` — start Next.js dev server
- `npm run build` — production build
- `python -m pytest` — run backend tests (from project root with .venv activated)

## Workflow

- Review and flag changes rather than rewriting, unless asked to rewrite
- "Follow Python conventions in `docs/agent/python-conventions.md` when writing or modifying `.py` files."
- Work file-by-file; confirm before batching changes across multiple files
- Run `python -m pytest` after backend changes
- Use more efficient subagents where necessary

## Project context

- Read `docs/agent/AGENTS.md` for boundaries, defaults, and tech stack
- Read `docs/agent/frontend-conventions.md` for rules when working on frontend code
- Read `docs/agent/python-conventions.md` for rules when working on .py scripts.
- Read `docs/PPIC Summer 2026/specifications/previous_tool_analysis.md` for legacy codebase understanding
- Read `docs/PPIC Summer 2026/specifications/projectSpec.md` for current project spec
- `lib/config.py` is the single source of truth for regions, geography, and column definitions
- Follow `docs/agent/markdown-conventions.md` while editing markdown files.

## Permissions

- Reading, searching, listing, or viewing files within `web-data-visualization/` does not require user approval — just do it
- Running unit tests/unit checks or running npm does not require user approval - just do it
- Only prompt for confirmation before destructive, irreversible, or out-of-scope actions
  (e.g., deleting files, modifying configs listed under "Ask first")