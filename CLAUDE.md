# CLAUDE.md

## Commands

- `npm run dev` — start Next.js dev server
- `npm test` — run frontend unit tests
- `npm run build` — production build
- `npm run check:palette && npm run check:settings` — verify generated frontend references
- `web-viz-venv/bin/python -m pytest` — run backend tests from the project root

## Workflow

- Review and flag changes rather than rewriting, unless asked to rewrite
- Follow Python conventions in `docs/agent/python-skill.md` when writing or modifying `.py` files
- Work file-by-file; confirm before batching changes across multiple files
- Run `web-viz-venv/bin/python -m pytest` after backend changes
- Use more efficient subagents where necessary

## Project context

- Read `docs/agent/AGENTS.md` for boundaries, defaults, and tech stack
- Read `docs/agent/frontend-skill.md` for rules when working on frontend code
- Read `docs/agent/python-skill.md` for rules when working on `.py` scripts
- Read `docs/specifications/previous_tool_analysis.md` for legacy codebase understanding
- Read `docs/specifications/projectSpec.md` for current project spec
- `lib/config.py` is the source of truth for shared project paths and HTTP defaults
- `lib/pophousing_config.py` is the source of truth for Population and Housing regions, geographic classifications, and column definitions; other topics keep their configuration under `scripts/<topic>/config/`
- Follow `docs/agent/markdown-skill.md` while editing Markdown files

## Permissions

- Reading, searching, listing, or viewing files within `web-data-visualization/` does not require user approval — just do it
- Running unit tests/unit checks or running npm does not require user approval - just do it
- Only prompt for confirmation before destructive, irreversible, or out-of-scope actions
  (e.g., deleting files, modifying configs listed under "Ask first")
