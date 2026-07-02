---
name: python-scripts
description: >
  Enforces structure, documentation, and organization conventions for Python scripts. Use this
  skill for ANY Python coding task — data pipelines, automation scripts, file processors, API
  clients, CLI tools, analysis scripts, or any standalone .py file. Triggers on: "write a
  Python script", "create a script that", "data pipeline", "process this data", "automate",
  "write a CLI tool", "Python", ".py", or any request to create or modify a Python file.
  Also trigger when the user asks to clean up, refactor, or document an existing Python script.
  This skill defines HOW Python files are structured internally, HOW they're documented, and
  WHERE they live within a project. Always consult this skill even for single-file scripts —
  consistent documentation matters at every scale.
Topic: tbd
Content Type: agent instructions
pinned: false
Date Published: June 22, 2026
Last Updated: 06/23/2026 - 01:54 PM
---
 
# Python Scripts Skill
 
Conventions for writing well-structured, self-documenting Python scripts. Every script should be understandable by someone who has never seen the codebase, just by reading the first 20 lines.
 
---
 
## Guiding Principle
 
**Every script tells you what it does before it does it.** The top of every Python file contains a complete briefing: what the script does, what it reads, what it produces, and how to run it. No one should ever need to read the implementation to understand the script's purpose.
 
---
 
## Script Header (Required)
 
Every Python script begins with a docstring block containing these sections in order:
 
1. **Filename and purpose** — one line: `filename.py — what it does`
2. **Data sources / inputs** — what files, APIs, or data the script reads
3. **Outputs** — what files, data, or side effects the script produces
4. **Usage** — exact command-line invocations with examples
5. **Test Files** - where the folders for the test files for this script are located
```python
"""
overview.py — generates overview.json for states and districts.
 
Data sources:
    - data-raw/congress-legislators/legislators-current.json  — rep roster (name, party, terms)
    - public/data/districts/{DISTRICT}/ces_positions.json     — CES sample size per district
    - public/data/districts/{DISTRICT}/alignment.json         — district alignment score
 
Outputs:
    - public/data/states/{STATE}/overview.json                — one per state
    - public/data/districts/{DISTRICT}/overview.json          — one per district
 
Usage:
    python overview.py                         # all states + all districts
    python overview.py --states                # all 50 states + DC
    python overview.py --states CA TX          # specific state(s)
    python overview.py --districts             # all districts
    python overview.py --districts CA-11 TX-07 # specific district(s)
    python overview.py --state-districts CA    # all districts for one state

Test Folders:
    - scripts/unit_tests/shared/validation/
    - scripts/unit_tests/gerrymandering/output/
"""
```
 
### Rules
 
- The **first line** is always `filename.py — short description` (em dash, not hyphen)
- **Data sources** lists every input file or API with a brief annotation after the em dash
- **Outputs** lists every file written or side effect produced
- **Usage** shows real invocations. Use `--flag` style (GNU long options) for all CLI arguments — never single-letter flags for readability
- If a script takes no arguments, the Usage section shows one line: `python filename.py`
- Use `{PLACEHOLDER}` in paths to indicate variable segments
---
 
## Internal Structure
 
### Section Headers
 
Use two levels of visual headers to organize code within a file.
 
**Level 1 — Major sections** (top-level logical blocks: classes, pipeline stages, main entry point):
 
```python
"""
========================================================================================================================
Section or Class Name
========================================================================================================================
"""
```
 
**Level 2 — Subsections** (helper groups, related functions, logical subgroups within a section):
 
```python
# ── Helpers ───────────────────────────────────────────────────────────────────
```
 
The em dash + line of dashes extends to ~80 characters. Keep the label short (1–3 words).
 
### Standard Section Order
 
Scripts follow this top-to-bottom order:
 
```
1. Module docstring (the header described above)
2. Imports (stdlib → third-party → local, separated by blank lines)
3. Constants / configuration
4. Helper functions
5. Core logic (classes, pipeline functions, main processing)
6. CLI argument parsing (if applicable)
7. Main entry point (if __name__ == "__main__")
```
 
### Example Skeleton
 
```python
"""
process_census.py — cleans and reshapes Census ACS data for the web frontend.
 
Data sources:
  - data-raw/acs/acs5_2023.csv  — American Community Survey 5-year estimates
 
Outputs:
  - public/data/census/demographics.json  — cleaned demographics per state
 
Usage:
  python process_census.py                     # all states
  python process_census.py --states CA TX NY   # specific states
"""
 
import json
import sys
from pathlib import Path
 
import pandas as pd
 
# ── Constants ─────────────────────────────────────────────────────────────────
 
PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_ROOT / "data-raw" / "acs"
OUT_DIR = PROJECT_ROOT / "public" / "data" / "census"
 
EXPECTED_COLUMNS = ["state_fips", "population", "median_income", "poverty_rate"]
 
 
# ── Helpers ───────────────────────────────────────────────────────────────────
 
def validate_dataframe(df, expected_cols):
    """Check that all expected columns are present. Raises ValueError if not. Test file: tests/test_process_census.py"""
    missing = set(expected_cols) - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns: {missing}")
 
 
def clean_nulls(df):
    """Drop rows where critical fields are null; fill others with defaults. Test file: tests/test_process_census.py"""
    df = df.dropna(subset=["state_fips", "population"])
    df = df.fillna({"median_income": 0, "poverty_rate": 0})
    return df
 
 
"""
========================================================================================================================
Core Pipeline
========================================================================================================================
"""
 
 
def process_state(state_fips, df):
    """Process a single state's data and return a dict ready for JSON export. Test file: scripts/unit_tests/gerrymandering/output/test_process_state.py"""
    state_df = df[df["state_fips"] == state_fips].copy()
    # ... processing logic ...
    return state_df.to_dict(orient="records")
 
 
def run_pipeline(states=None):
    """Run the full pipeline. If states is None, process all states. Test file: tests/test_process_census.py"""
    raw_path = RAW_DIR / "acs5_2023.csv"
    df = pd.read_csv(raw_path)
    validate_dataframe(df, EXPECTED_COLUMNS)
    df = clean_nulls(df)
 
    if states is None:
        states = df["state_fips"].unique()
 
    OUT_DIR.mkdir(parents=True, exist_ok=True)
 
    for fips in states:
        result = process_state(fips, df)
        out_path = OUT_DIR / "demographics.json"
        with open(out_path, "w") as f:
            json.dump(result, f, indent=2)
        print(f"  ✓ {fips} → {out_path}")
 
 
# ── CLI ───────────────────────────────────────────────────────────────────────
 
if __name__ == "__main__":
    import argparse
 
    parser = argparse.ArgumentParser(description="Process Census ACS data")
    parser.add_argument("--states", nargs="*", default=None,
                        help="State FIPS codes to process (default: all)")
    args = parser.parse_args()
 
    run_pipeline(states=args.states)
```
 
---
 
## CLI Argument Conventions
 
- Always use `argparse` for scripts that accept arguments (not `sys.argv` parsing)
- Use `--long-flag` names exclusively — no single-letter shortcuts (`--states`, not `-s`)
- Use `nargs="*"` for flags that accept zero or more values (e.g., `--states CA TX` or `--states` for all)
- Include a `--help` description for every argument
- The `if __name__ == "__main__"` block should contain only argument parsing and a single function call
---
 
## Documentation Standards
 
### Function Docstrings
 
Every function gets a docstring that identifies its test file location. Use a repository-relative path so the test can be found from the project root.

- For a one-line docstring, end the description with `Test file: path/to/test_file.py`.
- For a multi-line docstring, add a `Test file:` section after `Returns:` (or after `Args:` when the function returns nothing).
- Name the specific test file, not only its parent directory.
- If several functions are tested in the same file, repeat that file path in each function's docstring.
- If a function does not yet have a test file, use `Test file: Not yet implemented` rather than omitting the location.

Use a multi-line docstring when the function has non-obvious parameters or return values:
 
```python
# Simple — one line is enough
def slugify(name):
    """Convert a name to a URL-safe slug. Test file: tests/test_slugs.py"""
    return name.lower().replace(" ", "-")
 
# Complex — document params and return
def load_state_data(state_code, filename):
    """
    Load a JSON data file for a specific state.
 
    Args:
        state_code: Two-letter state abbreviation (e.g., "CA")
        filename: JSON filename within the state's data directory
 
    Returns:
        Parsed JSON as a dict, or None if the file doesn't exist.

    Test file:
        tests/test_state_data.py
    """
```
 
### Inline Comments
 
- Use comments to explain **why**, not **what**. `# Remove duplicates` above `df.drop_duplicates()` is noise. `# Census sometimes double-counts split districts` is useful.
- Comment non-obvious business logic, magic numbers, and workarounds
- Never comment out code and leave it — delete it (git has the history)
---
 
## Error Handling
 
- Scripts that process data should **fail gracefully on missing files** — return `None` or skip with a warning, don't crash the whole pipeline because one state's data is missing
- Print clear error messages: `print(f"  ⚠ Skipping {state}: {filename} not found")`
- Use `try/except` around file I/O and parsing, catch specific exceptions
- Exit with a non-zero code on fatal errors: `sys.exit(1)`
---
 
## Output Conventions
 
- Always `mkdir -p` equivalent before writing: `Path(out_dir).mkdir(parents=True, exist_ok=True)`
- Print progress for multi-item processing: `print(f"  ✓ {item} → {out_path}")`
- Write JSON with `indent=2` for human readability
- Use `pathlib.Path` over `os.path` for all path operations
---
