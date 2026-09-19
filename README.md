# PPIC Web Data Visualization

A shared Next.js visualization site and Python data-pipeline repository for PPIC demographic and housing data. The current application covers Population and Housing, Components of Change, Demographic Projections, Housing Stress, Building Permits, and RHNA Progress.

The temporary public deployment is on [Vercel](0).

## Stack

- Next.js 16, React 19, Tailwind CSS 4, and Plotly.js
- Python 3.12, pandas, and source-specific acquisition and cleaning pipelines
- Vitest and Playwright for the frontend; pytest for Python

## Local Setup

Install the Node dependencies:

```bash
npm install
```

Create the Python environment and install the declared dependency groups:

```bash
python3.12 -m venv web-viz-venv
web-viz-venv/bin/python -m pip install --upgrade pip
web-viz-venv/bin/pip install --group runtime --group dev
```

Start the application:

```bash
npm run dev
```

## Checks

```bash
npm test
npm run build
npm run check:palette
npm run check:settings
web-viz-venv/bin/python -m pytest
```

Run focused checks while developing, then run the relevant full suites before handoff.

## Repository Map

| Path | Purpose |
|---|---|
| `app/` | Next.js pages and API routes |
| `components/` | Shared application and visualization UI |
| `lib/visualization/` | Topic schemas, question model, adapters, registries, and chart preparation |
| `lib/data/` | Server-side readers and data shaping |
| `scripts/<topic>/` | Topic-specific acquisition, cleaning, validation, and output logic |
| `scripts/orchestrators/` | End-to-end pipeline entry points |
| `scripts/shared/` | Shared geography, cleaning, archive, download, and logging utilities |
| `docs/topic-guides/` | As-built guides for the five original data pipelines |
| `docs/specifications/` | Cross-cutting product and architecture specifications |
| `docs/agent/` | Contributor instructions and task skills |
| `tests/` and `scripts/unit_tests/` | Frontend and Python tests |

## Contributor Guidance

Read [`docs/agent/AGENTS.md`](docs/agent/AGENTS.md) before changing the repository. Use the matching skill in `docs/agent/` for Python, frontend, Markdown, implementation-plan, or changelog work. The full project specification is in [`docs/specifications/projectSpec.md`](docs/specifications/projectSpec.md); the topic topic guides are the faster route to as-built pipeline behavior.

Topic configuration has multiple owners by design: `lib/config.py` holds shared paths and HTTP defaults, `lib/pophousing_config.py` holds Population and Housing configuration, topic Python contracts live under `scripts/<topic>/config/`, and client-safe visualization contracts live under `lib/visualization/moduleSchemas/`.
