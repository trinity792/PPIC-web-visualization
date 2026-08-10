---
Topic: Technical
Content Type: implementation plan
pinned: false
description: "Ordered implementation plan for automating the data pipelines under Option C, built first against a MacBook with local storage and written so the move to PPIC infrastructure is a configuration change rather than a rewrite."
Date Published: August 04, 2026
Last Updated: 08/10/2026 - 11:40 AM
Status: Updating
Footnote: Written by Claude Opus 5 against the live repository. Every YAML block was parsed and the report and detection shell steps were executed against a scratch git repo before publication. Action version pins were checked against the GitHub Marketplace on 08/04/2026. Reframed as an implementation plan on 08/10/2026 following confirmation of Option C - Content verified by Trinity Jones
---

# GitHub Actions Implementation Plan

The build order for automating the data pipelines, written for the configuration that can be stood up today and structured so that the eventual move onto PPIC infrastructure changes settings rather than design.

> [!info] How to read this
> This is a plan first and a reference second. The stages are ordered and each ends in a checkpoint that either passes or names what broke; run the checkpoint before moving on, because a stage whose checkpoint fails will not be rescued by the next one. [Moving to PPIC Servers](#moving-to-ppic-servers) is the section to read before making any decision that would be expensive to reverse. The appendices hold the per-construct explanations and the reasoning behind each decision, so the stages can stay directive.
>
> Commands assume macOS. Windows equivalents are noted where they differ.

---

## What Is Settled and What Is Not

### The confirmed decision

Option C is confirmed in full: pipelines execute as GitHub Actions workflows, Vercel continues to serve the site, and PPIC-owned GitHub and Vercel accounts are the destination. That removes the option comparison in [[Automations Guide|the Automations Guide]] from the critical path. What remains is a sequencing problem rather than a choice problem.

Server details, network placement, and storage destination are still being worked out. This document therefore builds the version that depends on none of them, and marks every point where a server answer would change something.

### The configuration this document builds

Pipelines run on GitHub-hosted `ubuntu-latest` runners. Review is a pull request. The published dataset reaches the site by being committed, exactly as it does today. Everything the pipeline produces that Git deliberately does not keep, meaning run logs, superseded dataset versions, and raw source downloads, is uploaded as a workflow artifact and then pulled down to a local destination on the MacBook by a short sync routine.

The MacBook's role is worth stating precisely, because "run it locally" can mean two quite different things. The pipeline does not execute on the MacBook. GitHub's runner clones the repository and does the work, which is what makes the setup survive the machine being closed, replaced, or reimaged. The MacBook is the archive destination and the place the sync routine runs from. That is the part which later points at PPIC storage instead.

> [!important] The published data never leaves Git, under any variant
> `lib/data/building_permits.js` and its siblings read their CSVs with `node:fs` from `path.join(process.cwd(), "data", "data-cleaned", ...)`. On Vercel, `process.cwd()` is the deployed bundle, which is built from the Git repository. A CSV that is not committed does not exist as far as the site is concerned. Every storage question in this document is about the gitignored material, not about `data/data-cleaned/`. Moving that directory anywhere would take the site down.

### What is still open

| Open item | Blocks | Where it lands |
|---|---|---|
| Where processed run evidence and archives are permitted to live | Nothing today; the local destination works meanwhile | [Moving to PPIC Servers](#moving-to-ppic-servers) |
| Whether GitHub-hosted runners may write into PPIC storage | Variant 4 only | [Variant 4: The Workflow Writes to PPIC Storage](#variant-4-the-workflow-writes-to-ppic-storage) |
| Whether the repository becomes private, and on which GitHub tier | Actions minutes budget, and Variant 5 | [Appendix D](#appendix-d-alternatives-still-on-the-table) |
| Who reviews the pull requests, and whether they hold a GitHub account | The shape of the review gate | [Appendix D](#appendix-d-alternatives-still-on-the-table) |

None of these gate stages 0 through 9.

---

## The Portability Contract

The requirement is that this survives moving to PPIC servers without being rebuilt. That is achievable, but only because the seam is deliberately narrow. It is worth knowing exactly where the seam is before writing anything.

| Layer | Portable? | Why |
|---|---|---|
| Pipeline code | Yes, already | `lib/config.py` computes `PROJECT_ROOT = Path(__file__).resolve().parents[1]` and derives every data, archive, and log path from it. Nothing knows where the repository sits on disk. |
| Workflow files | Yes | Every path is repository-root-relative. The reusable workflow is referenced as `./.github/workflows/module-pipeline.yml`, which moves with the repository. No owner or machine name appears anywhere. |
| Where the pipeline executes | One line | `runs-on: ubuntu-latest` becomes `runs-on: [self-hosted, linux, ppic-data]` and nothing else changes. |
| Where evidence is stored | One variable | The sync routine's destination path. Everything upstream of it is identical across variants. |
| Credentials | **Not portable** | Repository secrets do not follow a transfer to a new organization, and a personal access token is bound to the person who created it. This is the one thing that must be re-created by hand. |

> [!tip] Write the destination as a variable from the first day, not the second
> The single highest-leverage habit in this whole plan is that no path outside the repository is ever typed inline. Stage 1 establishes `PPIC_ARCHIVE_DEST` as an environment variable, and every later command reads it. Changing storage destination then means editing one line in a shell profile rather than finding every hardcoded `/Volumes/...` across a document, a script, and someone's shell history.

---

## Prerequisites

Four things, none of which involve a storage destination yet.

| Requirement | How to check | If missing |
|---|---|---|
| Write access to the repository | You can see the Actions tab's "Run workflow" button | Ask the repository owner |
| Python 3.12 | `python3 --version` | Install from python.org |
| pip 25.1 or newer | `pip --version` | `python3 -m pip install --upgrade pip` |
| GitHub CLI | `gh --version` | `brew install gh`, then `gh auth login` |

The GitHub CLI is optional through stage 6, all of which can be done in a browser. It becomes necessary at stage 7, because downloading an artifact into a specific directory is not something the web UI does well.

---

## Stage 0: Reconcile the Local Environment

The repository has a version disagreement that is currently harmless and will not stay that way. The local `.venv` is Python 3.11, `[tool.ruff]` in `pyproject.toml` targets `py312`, and the workflows below request 3.12. Nothing *declares* a floor, because `requires-python` is a `[project]` field and this repository deliberately has no `[project]` table (see [Appendix B](#appendix-b-dependencies-and-why-they-are-declared-as-groups)).

There is nonetheless a real one. `scripts/components_of_change/acquisition/source_fallback.py` and its projections counterpart call `Exception.add_note()`, which was added in Python 3.11, so the suite fails on 3.10 with an `AttributeError` that names neither the version nor the requirement. **3.11 is the effective floor and 3.12 is the target.** Anything older fails in two tests that look unrelated to the interpreter.

Pick 3.12 and rebuild the virtual environment, so that a failure on the runner is reproducible on the MacBook.

```bash
cd /path/to/web-data-visualization
rm -rf .venv
python3.12 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
python -m pip install --upgrade pip
pip install --group runtime
python -m scripts.orchestrators.building_permits_pipeline
```

> [!success] Checkpoint 0
> ```bash
> python --version          # 3.12.x
> pip --version             # 25.1 or higher, or --group silently fails
> python -c "import pandas, numpy, requests, bs4, openpyxl, xlrd; print('imports ok')"
> python -c "from zoneinfo import ZoneInfo; print(ZoneInfo('America/Los_Angeles'))"
> ```
> The pipeline itself should end with either `Written to: data/data-cleaned/building-permits/BuildingPermits_Current.csv` or a message that no new data was detected. Both are passes; the second means the source has published nothing since the last commit.
>
> A `ZoneInfoNotFoundError` on the last line means `tzdata` did not install. That cannot happen on macOS, and is the first thing to check on Windows.

Do not skip this because the pipeline already runs under 3.11. The point of the stage is that from here on, "it works on my machine" and "it works on the runner" mean the same environment, which is what makes every later checkpoint diagnostic.

---

## Stage 1: Choose and Prepare the Local Destination

The destination holds the three things Git deliberately does not keep. It is not in the publishing path, so a forgotten sync delays the archive, never the website.

| Artifact | In Git? | Goes to the destination? | Why |
|---|---|---|---|
| `data/data-cleaned/<dir>/*.csv` | Yes, committed by the pull request | No | The site reads it at build time. |
| `data/archive/<dir>/*.csv` | No, gitignored | Yes | Superseded dataset versions. |
| `data/data-raw/<dir>/` | No, gitignored | Yes | Source downloads, useful for reproducing a bad run. |
| `logs/pipeline-runs.jsonl` | No, gitignored | Yes | The run record behind each change report. |
| `change-report.md` | No, generated per run | Yes | What the reviewer saw when they approved. |

Any directory works. An internal folder on the MacBook is the simplest thing that is correct, and unlike an external drive it does not fail silently when nobody remembered to plug it in. Set it once, in `~/.zshrc`, so that every later command and the eventual sync script read the same value:

```bash
echo 'export PPIC_ARCHIVE_DEST="$HOME/PPIC-data-archive"' >> ~/.zshrc
source ~/.zshrc

mkdir -p "$PPIC_ARCHIVE_DEST"/{archive,raw,refresh-runs}
printf 'PPIC data-visualization archive.\nHolds gitignored pipeline output. Not the published dataset.\nSee docs/PPIC Summer 2026/explainers/github-actions-workflow-reference.md\n' \
  > "$PPIC_ARCHIVE_DEST/README.txt"
```

Three subdirectories rather than one, because the destination answers two different questions and they want different shapes. `archive/<dir>/` accumulates every superseded CSV across all runs, answering "what did this dataset look like in May." `refresh-runs/<id>/` holds one bundle per run with its log and change report, answering "what happened on that run." Keeping them apart means the archive stays browsable by module and date rather than buried under run identifiers.

> [!warning] If you do use an external drive, format matters more than capacity
> exFAT is the right choice for a drive that moves between macOS and Windows, and it is fine for copying CSVs and logs. Do not put a Git clone or a `node_modules` on it: exFAT has no symlink support and does not preserve Unix permissions, so `npm install` and `git` both misbehave in ways that are tedious to diagnose. A drive that mounts read-only, which happens with NTFS on macOS, fails silently at the copy step much later, so test with `touch "$PPIC_ARCHIVE_DEST/.writetest" && rm "$PPIC_ARCHIVE_DEST/.writetest"` before trusting it.

> [!success] Checkpoint 1
> ```bash
> ls -la "$PPIC_ARCHIVE_DEST"
> df -h "$PPIC_ARCHIVE_DEST" | tail -1
> touch "$PPIC_ARCHIVE_DEST/.writetest" && rm "$PPIC_ARCHIVE_DEST/.writetest" && echo writable
> ```
> Expected: the three directories plus `README.txt`, a free-space figure to compare against next month, and `writable`. Open a new terminal window and run `echo $PPIC_ARCHIVE_DEST` to confirm the variable survives a fresh shell; if it prints nothing, the export did not reach the profile that shell loads.

---

## Stage 2: Add the Workflow Files

This is the longest stage and the only one that writes code. Create `.github/workflows/` at the repository root, which is the one directory GitHub is not configurable about.

```text
.github/
└── workflows/
    ├── module-pipeline.yml       # reusable; the actual logic, called by the others
    ├── building-permits.yml      # inputs for one module
    └── tests.yml                 # pytest and vitest on every pull request
```

The logic lives once. Each module gets a caller of roughly twenty lines, so adding the seventh module means writing a seventh caller rather than copying a hundred lines of YAML. Every construct used below is explained in [Appendix A](#appendix-a-construct-reference); the annotations here are limited to what affects whether the file works.

### The module directory input, which is not the module identifier

This repository has one naming inconsistency that will silently break the artifact steps if it is not accounted for, and it will not break them on the first module you test.

`module_id` is the string the orchestrators pass to `execute_pipeline_run()` and `archive_and_save()`. It prefixes archive filenames and keys the run record. The *directory* each module reads and writes under `data/data-cleaned/`, `data/archive/`, and `data/data-raw/` is a separate name, and for four of the seven modules the two do not match.

| Module | `module_id` | Data directory | Same? |
|---|---|---|---|
| Building Permits | `building-permits` | `building-permits` | Yes |
| Components of Change | `components-of-change` | `components-of-change` | Yes |
| Housing Stress | `housing-stress` | `housing-stress` | Yes |
| Population and Housing | `pophousing` | `housing-population` | No |
| Projections | `projections` | `demographic-projections` | No |
| RHNA Progress | `rhna-progress` | `RHNA-progress-report` | No |
| Housing Stress Backfill | `housing-stress-backfill` | `housing-stress` | No, and shared |

> [!danger] Keying artifact paths on `module_id` produces empty artifacts, silently
> Building permits is the module you will test first and it is one of the three where the two names agree, so a workflow that writes `data/archive/${{ inputs.module_id }}/` will appear to work perfectly. It then uploads nothing for `pophousing`, `projections`, and `rhna-progress`, and because `if-no-files-found: ignore` is the correct setting for a run that legitimately archived nothing, there is no warning to notice. The failure surfaces months later as a missing archive.
>
> The workflow below takes `data_dir` as an input and builds all three paths from it. `module_id` is kept as a separate input because the change report matches on it.

### `module-pipeline.yml`

The inputs are the per-module knobs. `on: workflow_call` makes the file callable by other workflows rather than triggered by an event of its own.

```yaml
name: Module data refresh (reusable)

on:
  workflow_call:
    inputs:
      module_id:
        description: "Matches module_id in the orchestrator's run record, e.g. pophousing."
        required: true
        type: string
      module_label:
        description: "Human-readable name used in the PR title and job summary."
        required: true
        type: string
      data_dir:
        description: "Directory name under data/data-cleaned, data/archive, and data/data-raw. Often but NOT always equal to module_id."
        required: true
        type: string
      orchestrator:
        description: "Dotted module path passed to python -m, relative to the repo root."
        required: true
        type: string
      python_version:
        required: false
        type: string
        default: "3.12"
      dry_run:
        description: "Run the pipeline and publish the report, but never open a PR."
        required: false
        type: boolean
        default: false
```

The job header sets the runner, a timeout, and the narrowest token permissions the job needs.

```yaml
jobs:
  refresh:
    name: Refresh ${{ inputs.module_label }}
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: write
      issues: write
    defaults:
      run:
        shell: bash
    env:
      CLEANED_PATH: data/data-cleaned/${{ inputs.data_dir }}
      ARCHIVE_PATH: data/archive/${{ inputs.data_dir }}
      RAW_PATH: data/data-raw/${{ inputs.data_dir }}
```

Three of these lines carry more weight than they look like they do. `timeout-minutes: 20` is the safety valve that stops a pipeline hung on a stalled HTTP request from burning six hours of the monthly allowance in one run; every scheduled job should have one. `issues: write` is what the failure-notification step needs, and `pull-requests: write` does not grant it, so a job missing this line fails only on the path where the pipeline has already errored, which is the worst possible time to discover a permissions bug. `defaults.run.shell: bash` is redundant on Ubuntu today and is what keeps every `[[ ]]` test working if this is ever pointed at a Windows self-hosted runner, where the default would otherwise be PowerShell.

Checkout, environment, and the run itself:

```yaml
    steps:
      - name: Check out the repository
        uses: actions/checkout@v6

      - name: Set up Python
        uses: actions/setup-python@v6
        with:
          python-version: ${{ inputs.python_version }}
          cache: pip
          cache-dependency-path: pyproject.toml

      - name: Install Python dependencies
        run: |
          python -m pip install --upgrade pip
          pip install --group runtime

      - name: Run the ${{ inputs.module_label }} pipeline
        id: pipeline
        env:
          PYTHONUNBUFFERED: "1"
          TZ: America/Los_Angeles
        run: python -m ${{ inputs.orchestrator }}
```

The pipeline invocation is one line because the orchestrators were already written to be run this way. `python -m` puts the working directory at the front of `sys.path`, and the working directory after checkout is the repository root, so `from lib.config import ...` resolves with no `PYTHONPATH` export and no installed package. `python -m pip install --upgrade pip` is load-bearing rather than cosmetic: the `--group` flag did not exist before pip 25.1, and on an older pip it fails with an unrecognized-argument error that never mentions the version requirement.

If the pipeline raises, the step exits non-zero and the job fails. The orchestrators already wrap each phase in a `*PipelinePhaseError` tagged with the phase name, so the failure line in the log names the phase directly and no extra error handling is needed here.

### The change report

The orchestrators append a structured run record to `logs/pipeline-runs.jsonl` on every run, success or failure. `scripts/shared/logging/change_report.py` selects the newest record for this module and renders it as the Markdown a reviewer reads, so the workflow step is one line to two destinations.

```yaml
      - name: Build the change report
        id: report
        if: always()
        run: |
          python -m scripts.shared.logging.change_report \
            --module "${{ inputs.module_id }}" \
            --data-path "$CLEANED_PATH" \
            | tee change-report.md >> "$GITHUB_STEP_SUMMARY"
```

`if: always()` overrides the default behaviour of skipping every remaining step once one fails. The report is most valuable precisely when the pipeline failed, in which case `severity` reads `error` and `summary` carries the phase-tagged message. `$GITHUB_STEP_SUMMARY` is a file the runner provides whose contents render on the run's summary page, and `tee` writes the same text to disk for the pull request body. One generation, two destinations.

> [!warning] The seven modules do not share a `result` schema, which is why this is not a heredoc
> An obvious inline script reads `result["new_data"]` and `result["source_failed"]`. Only two of the seven modules emit those keys. `rhna-progress` uses `new_snapshot`, `components-of-change` uses `new_census_data_found` and `new_dof_data_found`, `projections` uses `census_new_data` and `dof_new_data`, and `pophousing` emits no new-data flag at all. A `.get(key, "n/a")` swallows every one of those differences silently, so the reviewer reads `n/a` and cannot tell whether that means "nothing happened" or "this module never reports it."
>
> Only `row_count` and `output_path` appear in all seven. The module therefore leads with those, treats `output_path: null` as the uniform "nothing was written" signal, and discovers the module-specific flags by pattern rather than from a per-module table, so a module added later reports what it emits instead of regressing to `n/a`.

The report also surfaces two things the run record already carried and nothing previously printed. Revisions to previously published history are rendered through the existing `format_revision_summary()`, which matters more to a reviewer than an appended period does, because a revision changes numbers the site has already shown. And fallback paths actually taken are named, so a run that quietly fell back to a manual source is visible rather than buried in a flag dump.

> [!note] Verify the report against a module where the names diverge
> `python -m scripts.shared.logging.change_report --module pophousing --no-diff` renders from whatever is already in your local run log and needs no workflow. It is the fastest way to confirm the report is meaningful for the four modules where `module_id` and the data directory differ, and it is worth running after any change to an orchestrator's summary dict.

### Detection and the pull request

```yaml
      - name: Detect changed data files
        id: detect
        run: |
          if [[ -n "$(git status --porcelain -- "$CLEANED_PATH")" ]]; then
            echo "changed=true" >> "$GITHUB_OUTPUT"
          else
            echo "changed=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Open a data-refresh pull request
        if: steps.detect.outputs.changed == 'true' && inputs.dry_run == false
        uses: peter-evans/create-pull-request@v8
        with:
          token: ${{ secrets.DATA_REFRESH_TOKEN }}
          base: main
          branch: data/${{ inputs.module_id }}
          add-paths: data/data-cleaned/${{ inputs.data_dir }}
          commit-message: "data(${{ inputs.module_id }}): scheduled refresh"
          title: "Data refresh: ${{ inputs.module_label }}"
          body-path: change-report.md
          labels: |
            data-refresh
            automated
          delete-branch: true
```

Scoping `git status` to the cleaned directory is what keeps detection honest, because the pipeline also writes `logs/` and `data/archive/`, both gitignored, so an unscoped check would compare against the wrong thing. `add-paths` restricts the commit to that same directory, which keeps `change-report.md` and any other runner debris out of it. Reusing a fixed branch name per module means a second run before the first is reviewed updates the existing pull request rather than opening a competitor.

The reviewer gets three things: a diff of the actual CSV, the change report as the description, and Vercel's preview deployment built against the new data. Merging is publication. Closing is rejection, and costs nothing.

> [!warning] The token is a personal access token, and `GITHUB_TOKEN` cannot substitute
> GitHub refuses to trigger workflows from events raised by the automatically-provided `GITHUB_TOKEN`, in order to prevent a workflow triggering itself indefinitely. A pull request opened with it shows no checks at all, meaning `tests.yml` never runs and you would be merging data with no automated verification underneath the human review. That is weaker than what the manual process gives you today. See [Appendix C](#appendix-c-credentials) for what using a personal access token commits you to and what replaces it.

### Artifacts, which is where the local destination is fed

Three artifacts rather than one, deliberately, because the split is what makes the stage 7 sync a plain download with nothing to unpack afterwards.

```yaml
      - name: Upload the run record
        if: always()
        uses: actions/upload-artifact@v6
        with:
          name: ${{ inputs.module_id }}-run-${{ github.run_id }}
          path: |
            logs/
            change-report.md
          retention-days: 30
          if-no-files-found: warn

      - name: Upload superseded dataset versions
        if: always()
        uses: actions/upload-artifact@v6
        with:
          name: ${{ inputs.module_id }}-archive-${{ github.run_id }}
          path: data/archive/${{ inputs.data_dir }}/
          retention-days: 90
          if-no-files-found: ignore

      - name: Upload raw source downloads
        if: always()
        uses: actions/upload-artifact@v6
        with:
          name: ${{ inputs.module_id }}-raw-${{ github.run_id }}
          path: data/data-raw/${{ inputs.data_dir }}/
          retention-days: 30
          if-no-files-found: ignore
```

`upload-artifact` uses the least common ancestor of its `path` entries as the artifact root. An artifact given the single path `data/archive/<dir>/` therefore contains the CSVs at its top level with no `data/archive/` wrapper, so pointing `-D` at the matching directory on the destination puts them exactly where they belong. The run-record artifact keeps two paths on purpose, so its root is the workspace and `logs/` and `change-report.md` stay separate entries inside it.

Two settings differ between the three. `if-no-files-found: ignore` on the archive and raw artifacts, because a run that finds no new data legitimately archives nothing and there is no reason to colour the run yellow for it. And `retention-days: 90` on the archive alone, because that artifact is the only copy of a superseded dataset until it reaches the destination, whereas a run log is disposable once the run is understood.

> [!important] Retention is a real deadline, not a default to ignore
> The runner is destroyed when the job ends. After ninety days an archive artifact is gone permanently, and there is no way to reconstruct it. Stage 8's sync script exists mostly to make sure that window is never the thing standing between you and a superseded dataset.

### Failure notification

```yaml
      - name: Open an issue if the pipeline failed
        if: failure()
        uses: actions/github-script@v8
        with:
          script: |
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Pipeline failure: ${{ inputs.module_label }}`,
              labels: ["pipeline-failure"],
              body: `Run [${context.runId}](${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}) failed. See the job summary for the phase that raised.`,
            });
```

A scheduled workflow that fails silently is worse than no automation, because the site keeps serving stale data while everyone assumes it is current. GitHub also emails the workflow file's last committer when a scheduled run fails, and disables schedules entirely after sixty days of repository inactivity. The second is worth writing on a calendar: a quiet month silently stops every pipeline.

### The caller

```yaml
name: Building Permits refresh

on:
  # No schedule while the setup is being proven. Refreshes are triggered by hand.
  # To automate later, uncomment:
  #   schedule:
  #     - cron: "17 16 * * 2"        # 16:17 UTC Tuesdays = 8:17 PST / 9:17 PDT
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Run the pipeline and publish the report without opening a PR"
        type: boolean
        default: false

concurrency:
  group: data-refresh-building-permits
  cancel-in-progress: false

jobs:
  refresh:
    uses: ./.github/workflows/module-pipeline.yml
    secrets: inherit
    permissions:
      contents: write
      issues: write
    with:
      module_id: building-permits
      module_label: Building Permits
      data_dir: building-permits
      orchestrator: scripts.orchestrators.building_permits_pipeline
      dry_run: ${{ inputs.dry_run == true }}
```

Four lines here are load-bearing in ways that are not obvious.

The leading `./` in the `uses:` reference is required, and it is what makes the pair move together under a fork, an organization transfer, or a clone onto another machine. The alternative syntax, `owner/repo/.github/workflows/file.yml@ref`, hardcodes an owner and would need editing on transfer.

`concurrency` prevents two runs of the same module overlapping. Without it, a manual dispatch fired while a scheduled run is mid-flight gives you two processes racing to write the same CSV and open the same branch. `cancel-in-progress: false` queues the second rather than killing the first, which is right for a data pipeline, since an interrupted run leaves a half-written file.

`dry_run: ${{ inputs.dry_run == true }}` handles a subtlety worth knowing before it costs an afternoon. On a `schedule` event there are no inputs, so `inputs.dry_run` is null; comparing to `true` yields a proper boolean either way. Passing `${{ inputs.dry_run }}` directly fails type validation on scheduled runs only, so it works throughout testing and breaks the moment the cron is enabled.

> [!warning] `secrets: inherit` is what makes `DATA_REFRESH_TOKEN` reachable
> A called workflow gets no secrets by default. Without this line `${{ secrets.DATA_REFRESH_TOKEN }}` inside the reusable workflow silently evaluates to an empty string, and `create-pull-request` fails with an authentication error that says nothing about the caller. The stricter alternative is a `secrets:` block naming the secret explicitly, which is worth adopting once more than one secret is in play, and storage credentials would be the second.

### `tests.yml`

This is the workflow the personal access token exists to trigger. It runs on your own pull requests regardless; it runs on the bot's only because the refresh workflow authenticates with a token that is allowed to raise events.

```yaml
name: Tests

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  python:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-python@v6
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: pyproject.toml
      - run: |
          python -m pip install --upgrade pip
          pip install --group runtime --group dev
      - run: ruff check .
      - run: python -m pytest

  frontend:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm run check:palette
      - run: npm test
```

The two jobs have no `needs:` relationship, so they run in parallel on separate machines. `npm ci` rather than `npm install` installs exactly what `package-lock.json` specifies and fails if the lockfile is out of sync, which is what you want in CI. `npm run check:palette` is the existing non-mutating counterpart to `build:palette`, so a stale generated palette fails the check instead of being silently regenerated.

Commit all three files to `main`. They will not appear in the Actions tab from a branch.

> [!success] Checkpoint 2
> ```bash
> python -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]; print('yaml ok')" \
>   .github/workflows/*.yml
> gh workflow list
> ```
> Expected: `yaml ok`, then a list including `Building Permits refresh` and `Tests`. If `gh workflow list` does not show them, the files are not on the default branch yet.
>
> `yaml ok` proves the files parse, not that GitHub accepts them. A schema error still surfaces as a failed run, which is what stage 5 is for.

---

## Stage 3: Create and Store the Token

Under **Settings > Developer settings > Personal access tokens > Fine-grained tokens**, create a token scoped to this repository alone, with `Contents: Read and write` and `Pull requests: Read and write`. Set the shortest expiry you are willing to re-do.

A fine-grained token rather than a classic one matters. A classic token grants its scopes across every repository the owner can reach, so a leak from this workflow would expose all of them. A fine-grained token is bound to one repository and two permissions, which is roughly what the workflow actually needs.

Store it on the repository, not on the machine:

```bash
gh secret set DATA_REFRESH_TOKEN
# paste the token when prompted; it will not echo
```

> [!success] Checkpoint 3
> ```bash
> gh secret list
> ```
> Expected: a row reading `DATA_REFRESH_TOKEN  Updated less than a minute ago`. The value is unreadable from here on, by you or anyone else, which is the intended behaviour.
>
> Record whose token it is and its expiry date somewhere that is not the repository. [Appendix C](#appendix-c-credentials) explains why that note is the difference between a five-minute fix and a week of confused debugging.

---

## Stage 4: Configure Repository Settings

Two settings, both under **Settings > Actions > General > Workflow permissions**: select "Read and write permissions", and tick "Allow GitHub Actions to create and approve pull requests."

> [!success] Checkpoint 4
> No command for this one. Reload the settings page and confirm both are still set. The second checkbox reverts silently if the first is not saved before it is ticked, and its absence produces a permissions error at the very end of an otherwise successful run.

---

## Stage 5: First Dry Run

This exercises the pipeline, the report, and all three artifact uploads without opening a pull request.

```bash
gh workflow run building-permits.yml -f dry_run=true
sleep 5
gh run watch          # pick the running job; streams until it finishes
```

Or in the browser: **Actions > Building Permits refresh > Run workflow**, tick `dry_run`, confirm.

> [!success] Checkpoint 5
> ```bash
> gh run list --workflow=building-permits.yml --limit 1
> gh pr list --label data-refresh
> ```
> Expected: a row with a green `completed  success`, and no pull requests. Then open the run in the browser and confirm the summary page shows the "Building Permits change report" heading with a row count and a diff block. That report rendering is what this stage is really testing, because it is what the reviewer will read.
>
> If a pull request appeared, `dry_run` is not reaching the reusable workflow, which almost always means the `inputs.dry_run == true` expression was mistyped in the caller.

---

## Stage 6: First Real Refresh

Same command without the flag.

```bash
gh workflow run building-permits.yml
gh run watch
```

If the source has published nothing since the last commit, the pipeline succeeds and opens no pull request. That is correct behaviour rather than a failure. To get something reviewable on a first pass, run against a module whose data is genuinely stale.

Once a pull request exists, review it as the reviewer would: read the change report in the description, open the **Files changed** tab, and follow the Vercel preview link.

> [!success] Checkpoint 6
> ```bash
> gh pr list --label data-refresh
> gh pr checks <pr-number>
> ```
> Expected: one open pull request titled `Data refresh: Building Permits`, and `gh pr checks` listing the `python` and `frontend` jobs from `tests.yml`.
>
> **If `gh pr checks` reports no checks, `DATA_REFRESH_TOKEN` is not being used.** That is the `GITHUB_TOKEN` recursion rule, and it means either the secret name is misspelled or `secrets: inherit` is missing from the caller. Do not merge until checks appear. A pull request with no checks is exactly the unverified merge this design exists to prevent.

Merge it, then confirm the site picked it up.

> [!success] Checkpoint 6b
> Wait for the Vercel deployment to finish, then load the module's page and confirm the newest date in the chart matches what the change report said was added. This is the only checkpoint that verifies the whole chain end to end, and it is the one worth repeating after any later change to the workflow.

---

## Stage 7: Pull the First Archive Locally

Artifacts expire, so this is the first stage with an actual deadline attached. Because stage 2 split the upload by destination, each artifact downloads straight to where it belongs with nothing to unpack, move, or clean up.

```bash
MODULE="building-permits"
DATA_DIR="building-permits"
RUN_ID=$(gh run list --workflow="${MODULE}.yml" --limit 1 --json databaseId --jq '.[0].databaseId')

# Superseded dataset versions, into the consolidated tree.
gh run download "$RUN_ID" -n "${MODULE}-archive-${RUN_ID}" \
  -D "$PPIC_ARCHIVE_DEST/archive/$DATA_DIR" \
  || echo "no archive artifact for run $RUN_ID (nothing changed)"

# Raw source downloads.
gh run download "$RUN_ID" -n "${MODULE}-raw-${RUN_ID}" \
  -D "$PPIC_ARCHIVE_DEST/raw/$DATA_DIR" \
  || echo "no raw artifact for run $RUN_ID"

# Log and change report, kept per run.
gh run download "$RUN_ID" -n "${MODULE}-run-${RUN_ID}" \
  -D "$PPIC_ARCHIVE_DEST/refresh-runs/$RUN_ID"
```

The `|| echo` on the first two is not defensive padding. A run that finds no new data archives nothing, so `if-no-files-found: ignore` means the artifact is never created and `gh run download` exits non-zero looking for it. Without the guard, a perfectly normal no-op refresh ends the routine looking like a failure.

Note that the archive and raw directories are keyed on `DATA_DIR` while the artifact names are keyed on `MODULE`. That is not an inconsistency; it is the naming mismatch from stage 2 showing up on the receiving end, and keeping the destination tree in data-directory names is what makes it line up with the repository.

> [!success] Checkpoint 7
> ```bash
> ls "$PPIC_ARCHIVE_DEST/archive/$DATA_DIR"
> ls "$PPIC_ARCHIVE_DEST/refresh-runs/$RUN_ID"
> du -sh "$PPIC_ARCHIVE_DEST/archive"
> ```
> Expected: one or more archived CSVs sitting directly in `archive/building-permits/` with no nested `data/` directory above them, a bundle containing `logs/` and `change-report.md`, and a size figure to compare against next month.
>
> A nested `data/archive/` inside the destination means the artifact was uploaded with more than one `path` entry, which pushes the least common ancestor back up to the workspace root.
>
> An empty archive is not necessarily an error. `archive_and_save()` writes an archive copy only when it is about to overwrite an existing file, so a run that found no new data archives nothing. Check the change report: if it said `New data detected: False`, no archive artifact is correct.

> [!warning] Two runs of one module on the same day overwrite each other's archive entry
> `build_archive_filename()` stamps the archive name with `date.today()` and no run identifier, so two refreshes of the same module on the same day produce the same filename and the second silently replaces the first. This is invisible on the destination, because the second download simply overwrites the first file.
>
> This is a deliberate decision rather than an oversight, and `archive_and_save()`'s docstring records it: day granularity is "accepted while refreshes are manual and roughly monthly." That premise holds for every stage up to this one. **Enabling a schedule is what invalidates it**, which is why it appears here rather than earlier.
>
> The fix is already half-built. `build_archive_filename()` accepts an optional `time_of_day` argument that appends `THHMMSS` and still sorts chronologically as a plain string; `archive_and_save()` simply never passes it. Passing it is a one-line change plus the docstrings that record the reasoning, and it changes the archive filename format for all six modules, so it is worth doing deliberately rather than as a side effect of enabling a cron. Treat it as a precondition for any cadence more frequent than weekly.

---

## Stage 8: Script the Sync

Three download lines retyped every month is three chances to typo a path or a run identifier. Per the project's Python conventions this belongs in the repository rather than in someone's shell history, as `scripts/shared/storage/sync_artifacts.sh` taking the module as its argument and reading `PPIC_ARCHIVE_DEST` from the environment.

> [!flag] Create `scripts/shared/storage/sync_artifacts.sh`
> Arguments: `MODULE` and optionally `RUN_ID`, defaulting to the latest run. Reads `PPIC_ARCHIVE_DEST` from the environment and exits with a clear message if it is unset rather than writing to a relative path. Maps `MODULE` to `DATA_DIR` from a table in the script, so the one place that mapping lives outside the workflow files is also the one place it needs correcting. Tolerates a missing archive or raw artifact without a non-zero exit. Prints what it copied and where.
>
> Making it take a list of modules, so a monthly catch-up is one invocation, is worth the extra ten lines.

This is the single point in the whole setup that the PPIC move touches. A script that reads its destination from one environment variable is repointed by editing a shell profile. A script with `/Users/...` in it has to be found and rewritten, probably by someone who did not write it.

> [!success] Checkpoint 8
> ```bash
> unset PPIC_ARCHIVE_DEST && ./scripts/shared/storage/sync_artifacts.sh building-permits
> ```
> Expected: a clear error naming the unset variable, and no files written anywhere. Then restore the variable and run it for real against the stage 6 run, confirming it reproduces exactly what stage 7 did by hand. A script that silently falls back to a relative path when the destination is unset is worse than no script, because it appears to succeed.

---

## Stage 9: Add the Remaining Modules

Only once building permits has been through a full cycle including a merge and a sync. Each additional module is one caller file, and the values are the only thing that varies.

| Module | `module_id` | `data_dir` | `orchestrator` |
|---|---|---|---|
| Building Permits | `building-permits` | `building-permits` | `scripts.orchestrators.building_permits_pipeline` |
| Components of Change | `components-of-change` | `components-of-change` | `scripts.orchestrators.components_of_change_pipeline` |
| Population and Housing | `pophousing` | `housing-population` | `scripts.orchestrators.pophousing_pipeline` |
| Projections | `projections` | `demographic-projections` | `scripts.orchestrators.projections_pipeline` |
| Housing Stress | `housing-stress` | `housing-stress` | `scripts.orchestrators.housing_stress_pipeline` |
| RHNA Progress | `rhna-progress` | `RHNA-progress-report` | `scripts.orchestrators.rhna_progress_pipeline` |

Housing Stress Backfill is deliberately absent. It is a one-off historical reconstruction rather than a recurring refresh, it writes to the historical file rather than the current one, and it shares a data directory with the housing stress module. Scheduling it would produce a pull request against data that is not supposed to move.

> [!tip] Add the second module as `pophousing`, not `components-of-change`
> Components of change is the other module where `module_id` and `data_dir` agree, so adding it second proves nothing new. `pophousing` is the first case where they diverge, which makes it the test that the artifact paths are actually keyed correctly. Confirm its archive artifact is non-empty on a run that did produce new data before adding any others.

Once each module has completed one clean manual cycle, uncomment the `schedule` block in its caller. Match the cadence to the source agency's publication rhythm and add slack: Census BPS releases monthly but the exact day moves, so a weekly poll costs four runs a month and catches the release within a week, while annual sources such as DOF E-5 can poll weekly during the publication window and monthly otherwise.

> [!warning] Two properties of GitHub's scheduler that read like bugs six months later
> **Cron is always UTC and never observes daylight saving.** A job scheduled for 16:00 UTC runs at 8:00 AM Pacific in winter and 9:00 AM in summer. There is no timezone option. For a data refresh the drift is irrelevant, but it will look like a defect to whoever notices it first.
>
> **Scheduled runs are best-effort and often late.** GitHub queues scheduled jobs across all of its users, and runs at the top of the hour queue hardest. Delays of five to thirty minutes are normal, and during incidents a scheduled run can be skipped outright. An off-the-hour minute such as `:17` measurably reduces this. Never build logic that assumes a run happened at a precise time, or that it happened at all.
>
> **Schedules only fire from the default branch.** While developing on a feature branch, `on: schedule` will not run at all. This is why every stage above uses `workflow_dispatch`.

---

## The Ongoing Routine

Once the setup is done, a refresh is six steps and touches the local destination only at the last one.

| # | Action | Where |
|---|---|---|
| 1 | Notice the source agency published, or wait for the schedule | Anywhere |
| 2 | Actions tab, "Run workflow" on the module, if triggering by hand | Browser |
| 3 | Read the change report on the pull request | Browser |
| 4 | Check the diff and the Vercel preview | Browser |
| 5 | Merge; the site redeploys itself | Browser |
| 6 | Run the sync script | Terminal |

> [!important] Steps 1 through 5 need a browser and nothing else
> There is no clone, no Python, no terminal, and no local copy of the repository involved. The runner clones the repository itself, from GitHub, at the moment the job starts. The only prerequisite is a GitHub account with write access, which is the same access the reviewer needs in order to merge.
>
> The corollary is the failure mode most likely to waste an afternoon: **a run publishes what is on `main`, not what is on your disk.** Uncommitted local changes, a stale clone, or an unpushed branch have no effect on the result. A fix has to be merged before it can reach a refresh.

Step 6 can be batched. Nothing breaks if it is done monthly rather than per refresh, as long as it happens inside the retention window: ninety days for archives, thirty for run records and raw downloads. Past that the archive copy is gone for good, because the runner that made it no longer exists.

---

## Moving to PPIC Servers

Everything above works with no PPIC infrastructure at all. This section is what changes when the server details land, organized so that the answer to each IT question maps to exactly one variant.

The variants are not exclusive and not a progression. Variants 1 through 4 are storage answers, and any of them can combine with variant 5, which is a runner answer.

| Variant | What moves | What changes | Selected when IT confirms |
|---|---|---|---|
| 1: Local folder (build this now) | Nothing | Nothing | Default; needs nothing |
| 2: Mounted PPIC share | The destination | One environment variable | A share exists and can be mounted from a staff machine |
| 3: Server pulls artifacts | The sync routine | Where the script runs, plus a token for it | A server may run scheduled jobs and reach GitHub outbound |
| 4: Workflow pushes to PPIC | The write direction | Credentials in GitHub secrets, plus one workflow step | An external service may write into PPIC storage |
| 5: Self-hosted runner | The execution | `runs-on`, plus the repository going private | Data may not leave the network at all |

### Variant 1: Local folder

What stages 1 through 8 build. `PPIC_ARCHIVE_DEST` points at a folder on the MacBook. It has one genuine weakness worth naming rather than glossing: the archive is on one unmanaged machine with no redundancy, so it is a stopgap for evidence retention rather than an answer to it. It is nonetheless strictly better than today, where the same material lives in the same place and additionally has to be produced by hand.

### Variant 2: Mounted PPIC share

If a network share exists that a staff machine can mount, this is the whole change:

```bash
# ~/.zshrc
export PPIC_ARCHIVE_DEST="/Volumes/ppic-research/data-visualization/archive"
```

Nothing else moves. The workflows do not know the destination exists, the sync script reads the variable, and the directory layout is identical.

> [!warning] A share that is not mounted looks exactly like a share that is empty
> `mkdir -p` on an unmounted mount point cheerfully creates a local directory at that path, and the sync then writes into it. Weeks later the share is mounted and appears to have lost everything. If the destination is a mount, the sync script must verify the mount before writing, not merely that the path exists. Checking for a sentinel file that only exists on the real share is the simplest reliable test.

**What to confirm with IT:** whether a share exists, the mount path and protocol, whether the mount survives sleep and reconnect, and roughly what growth rate is acceptable. That last figure is the one the project should supply rather than ask for, and the `du -sh` from checkpoint 7 after a few months is the input to it.

### Variant 3: The server pulls artifacts

If a PPIC server may run scheduled jobs and reach GitHub outbound, the sync moves off the MacBook entirely and onto the server, on its own cron. Nothing about the workflows changes. The script is the same script, with `PPIC_ARCHIVE_DEST` set to a local path on the server.

This is the strongest of the storage variants and probably the target, because it removes the last recurring manual step and puts the evidence on managed hardware. Its requirement is modest: outbound HTTPS to GitHub and a credential for `gh` to authenticate with.

That credential is the one new thing. It needs only read access to Actions artifacts, which a fine-grained token with `Actions: Read` and `Contents: Read` provides, and it should be a different token from `DATA_REFRESH_TOKEN` so that revoking one does not silently break the other.

**What to confirm with IT:** whether scheduled jobs are permitted on the target server, whether outbound HTTPS to `github.com` and `*.actions.githubusercontent.com` is allowed, and where a service credential may be stored on that machine.

### Variant 4: The workflow writes to PPIC storage

The reverse direction, and the one that carries real security weight. Instead of PPIC pulling from GitHub, a GitHub-hosted runner writes directly into PPIC storage at the end of each run. The workflow change is one step:

```yaml
      # Requires credentials under Settings > Secrets and variables > Actions.
      - name: Upload run evidence to PPIC storage
        if: always()
        env:
          GRAPH_TENANT_ID: ${{ secrets.GRAPH_TENANT_ID }}
          GRAPH_CLIENT_ID: ${{ secrets.GRAPH_CLIENT_ID }}
          GRAPH_CLIENT_SECRET: ${{ secrets.GRAPH_CLIENT_SECRET }}
        run: python -m scripts.shared.storage.graph_upload --module "${{ inputs.module_id }}"
```

The same shape works for S3 or Azure Blob with different credentials and a different command.

> [!danger] This is the variant that needs an explicit decision, not an implementation
> Secrets are write-only through the UI and masked in logs, but masking is not a security boundary: anything a workflow can read, a workflow can exfiltrate. Adopting this means accepting that a credential capable of writing into PPIC infrastructure sits in GitHub's secret store and is readable by any workflow in the repository, including one introduced by a pull request if the repository is public.
>
> Variant 3 achieves nearly the same outcome with the trust running the other way, and should be preferred unless there is a specific reason it cannot work. Raise variant 4 with IT as a question, not a proposal.

**What to confirm with IT:** whether an external service may write into PPIC storage at all, and if so which service and what the credential's blast radius is.

### Variant 5: Self-hosted runner

If the answer is that the data may not leave the network, the pipeline execution moves rather than the storage. One line changes:

```yaml
    runs-on: [self-hosted, linux, ppic-data]
```

GitHub still schedules, orchestrates, reports, and gates. The Python process, the source downloads, and the data all stay inside the network. Storage then becomes trivial, because the runner is already on PPIC hardware and can write straight to a local path.

This variant also removes the Actions minutes question entirely, since self-hosted runners consume no billable minutes on any tier.

> [!danger] Never attach a self-hosted runner to a public repository
> Anyone who can open a pull request can propose a workflow change that executes on the runner. On a public repository that is anyone on the internet, and the runner is a machine inside PPIC's network. **Making the repository private is a prerequisite for self-hosting, not an independent decision**, and it should be done before the runner is registered rather than after.

Making the repository private has two consequences worth pricing in ahead of time. Actions minutes start being metered, at 2,000 per month on Free and 3,000 on Team, which is the number the project still owes an estimate for. And on the Free tier, private repositories lose environment protection rules and required-reviewer branch protections, which matters only if the review gate ever moves away from a pull request.

**What to confirm with IT:** whether a machine can be dedicated, where it sits on the network, and whether it may reach the public source agency sites the pipelines download from. That last one is easy to forget and is the thing that would make the runner useless.

### Cross-cutting: what does not survive the move

Whatever variant is chosen, two things need re-creating by hand and neither will announce itself.

Repository secrets do not follow a transfer to a new organization. Every secret has to be re-created after the repository moves into the PPIC organization, and the first sign that one was missed is a workflow failing at its last step.

`DATA_REFRESH_TOKEN` belongs to an individual. The organization transfer is the natural moment to replace it with a GitHub App installation token, because organization-owner access is a prerequisite for creating one and the workflow change is a single extra step. [Appendix C](#appendix-c-credentials) has the details.

---

## Setup Checklist

- [x] Declare pinned dependencies as groups in `pyproject.toml`, including `tzdata` for Windows.
- [ ] Stage 0: rebuild `.venv` on Python 3.12 and confirm a clean pipeline run.
- [ ] Stage 1: set `PPIC_ARCHIVE_DEST` and create the three subdirectories.
- [ ] Stage 2: add `module-pipeline.yml`, `building-permits.yml`, and `tests.yml`, keyed on `data_dir` rather than `module_id` for all data paths.
- [ ] Stage 3: create the fine-grained token, store it as `DATA_REFRESH_TOKEN`, and record whose it is and when it expires.
- [ ] Stage 4: enable read and write workflow permissions, and pull request creation.
- [ ] Stage 5: dispatch with `dry_run: true` and read the job summary.
- [ ] Stage 6: dispatch for real, confirm `tests.yml` runs on the bot's pull request, merge, and verify the site.
- [ ] Stage 7: pull the first artifacts to the local destination.
- [ ] Stage 8: promote the sync into `scripts/shared/storage/sync_artifacts.sh`.
- [ ] Stage 9: add `pophousing` second, then the remaining four; enable schedules only after a clean manual cycle each.
- [x] Render the change report from `scripts/shared/logging/change_report.py`, which handles the seven divergent `result` schemas rather than printing `n/a`.
- [ ] Pass `time_of_day` in `archive_and_save()` before enabling any cadence more frequent than weekly.
- [ ] Re-pin every action to a commit SHA before treating this as production.
- [ ] Estimate monthly Actions minutes across all modules, needed before the repository goes private.
- [ ] Revisit `DATA_REFRESH_TOKEN` when the PPIC organization exists, replacing it with a GitHub App token.

---

## Open Questions for the Project

These follow from the implementation rather than from the infrastructure questions in the Automations Guide.

**Who reviews, and do they hold a GitHub account?** The pull request assumes a reviewer who is a repository collaborator and can read a diff. The same write access gates triggering a refresh by hand, so one permission grant covers both halves of the flow. The Automations Guide describes the reviewer as "a researcher or project owner," which may not be one person. If the approver turns out not to use GitHub, the issue-plus-dispatch gate in [Appendix D](#appendix-d-alternatives-still-on-the-table) is the fallback, and it is a decision to revisit rather than work around.

**Should a failing pipeline block its own schedule?** As written, a module that fails every Tuesday opens an issue every Tuesday. A backoff, or a check that suppresses duplicate issues, is easy to add but needs a policy decision about how loud repeated failure should be.

**Does `data/archive/` still earn its keep?** On a hosted runner the archive is written and immediately discarded unless the sync catches it inside the retention window. If it matters as a record, variant 3 is the version of this plan that treats it seriously. If it does not, `archive_and_save()` is doing work that no longer serves a purpose in the automated path, and saying so would simplify three workflow steps.

**What is the monthly Actions minutes figure?** Still owed, and it is the input to both the GitHub tier decision and the question of whether the pre-flight probe in [Appendix D](#appendix-d-alternatives-still-on-the-table) is worth building. It only becomes a real constraint when the repository goes private, so it is not urgent, but it is on the path to variant 5.

---

## Appendix A: Construct Reference

Each GitHub Actions construct used above, explained once. Read this the first time a piece of syntax is unfamiliar, not linearly.

| Construct | What it does |
|---|---|
| `on: schedule` / `cron` | Five fields: minute, hour, day-of-month, month, day-of-week. Always UTC. Only fires from the default branch. |
| `on: workflow_dispatch` | Adds a "Run workflow" button in the Actions tab, with optional typed inputs. |
| `on: workflow_call` | Makes a workflow callable by another rather than triggered by an event of its own. |
| `uses:` | Runs a published action, or another workflow when the value is a path. |
| `run:` | Executes a shell command in the runner's workspace. |
| `runs-on` | Selects the runner. `ubuntu-latest` is a fresh VM destroyed when the job ends. Linux bills at 1x, Windows 2x, macOS 10x. |
| `permissions` | Narrows what the automatically-provided `GITHUB_TOKEN` may do. Declaring it per job means the token cannot do what the job does not need. |
| `$GITHUB_OUTPUT` | Writing `name=value` to this file publishes a value that later steps read as `steps.<id>.outputs.<name>`. Shell variables do not survive between steps, because each step is a separate process. |
| `$GITHUB_STEP_SUMMARY` | Markdown appended to this file renders on the run's summary page. |
| `if: always()` | Runs the step even if an earlier one failed, overriding the default skip. |
| `if: failure()` | Runs the step only when an earlier one failed. |
| `${{ secrets.NAME }}` | Reads a repository secret. Write-only through the UI, masked in logs. |
| `concurrency` | Prevents overlapping runs in the same named group. |
| `actions/checkout` | Clones the repository into the workspace and makes it the working directory, which is what makes every relative path work. |
| `cache: pip` | Caches wheels keyed on the hash of `cache-dependency-path`. Cold install of pandas, numpy, and plotly is around forty seconds; cached is a few. |
| `actions/github-script` | Provides a pre-authenticated Octokit client, so calling the GitHub API needs no token handling. |

> [!note] Why an occasional cache miss looks inexplicable
> `cache-dependency-path: pyproject.toml` points the cache key at a file that also holds the ruff and pytest configuration. Editing a lint rule changes the hash and throws away a perfectly good wheel cache. The cost is one slow install on the next run, which is not worth restructuring the file to avoid, but it explains the behaviour.

> [!warning] Action version pins moved a lot in early 2026
> The Node 24 migration pushed most first-party actions through two or three major versions between January and March 2026. One consequence is that `upload-artifact` and `download-artifact` are no longer on matching majors, so the `@v6` and `@v7` pins above are not typos. Check the Marketplace page for each action before committing.
>
> For anything beyond a proof of concept, pin to a full commit SHA rather than a major tag: `actions/checkout@08c6903...`. A major tag is mutable, so pinning to `@v6` means trusting whatever that tag points at tomorrow. Dependabot can be configured to bump SHA pins for you.

---

## Appendix B: Dependencies and Why They Are Declared as Groups

The dependency declaration already exists in `pyproject.toml` as PEP 735 groups rather than a `requirements.txt`:

```toml
[dependency-groups]
runtime = [
    "pandas==3.0.3", "numpy==2.4.6", "requests==2.34.2",
    "beautifulsoup4==4.15.0", "plotly==6.8.0",
    "openpyxl==3.1.5", "xlrd==2.0.2",
    "tzdata; sys_platform == 'win32'",
]
dev = ["pytest==9.1.1", "ruff==0.15.18"]
geo = ["geopandas"]
```

Versions are pinned exactly because there is no lockfile, and a pipeline that silently starts failing because pandas changed a default is exactly the failure mode automation is supposed to eliminate. Bumping a version is a deliberate edit to this file, which is the point.

Three entries are not obvious from reading the imports. `openpyxl` and `xlrd` appear in no `import` statement anywhere in `scripts/`; pandas loads them internally when `read_excel()` opens an `.xlsx` or a legacy `.xls`, and the DoF E-5, DoF E-6, and Census BPS downloaders all depend on that. Without them a fresh runner gets an `ImportError` from inside pandas partway through a run rather than at install time. `geopandas` is deliberately in its own group and deliberately unpinned, because `choropleth_map.py` and `components_of_change/visualizations.py` import it lazily inside a function and fall back to an undissolved map when it is missing. Installing it would change which code path runs, and it pulls GDAL and PROJ behind it, so the workflows leave it out.

> [!warning] `tzdata` is what breaks first on Windows
> `scripts/shared/logging/run_records.py` builds `PACIFIC = ZoneInfo("America/Los_Angeles")` at module scope rather than inside a function. Linux and macOS ship an IANA timezone database; Windows does not. On a Windows machine that line raises `ZoneInfoNotFoundError` at *import* time, so every module that imports the logger dies before `main()` is reached and no pipeline gets far enough to log why. The environment marker installs `tzdata` only where it is needed, so it costs nothing on the Ubuntu runner and saves any future move to a Windows machine.

### Why groups rather than a `requirements.txt`

A `requirements.txt` is the more familiar choice and would work. Groups were chosen for three reasons specific to this repository. They keep the Python configuration in one file, since `pyproject.toml` already holds the pytest and ruff settings. They express `runtime`, `dev`, and `geo` separately without a file per group, where requirements files would need an `-r` chain between three of them.

The third reason is the important one. The other way to declare dependencies in `pyproject.toml` is a `[project]` table, and that would be a mistake here. Adding `[project]` tells pip this repository is an installable package, and setuptools then tries to work out which directories to package. On a repository root containing `app/`, `components/`, `node_modules/`, and `data/` alongside `scripts/`, that discovery fails outright with `PackageDiscoveryError: Multiple top-level packages discovered in a flat-layout`. The naive fix is worse: it produces a package containing `node_modules` while *excluding* `scripts/`, because setuptools excludes a directory named `scripts` by default. Dependency groups declare dependencies without implying a package.

The cost is that `requires-python` is a `[project]` field, so nothing in the repository declares a Python floor. That is why stage 0 exists.

> [!note] Groups are a declaration, not a lockfile
> The pins cover the libraries this code imports directly and say nothing about the roughly ten transitive packages underneath, so `narwhals`, `certifi`, and `python-dateutil` still float. If a transitive change ever breaks a run, the fix is to generate a real lockfile with `uv pip compile --group runtime -o requirements.lock.txt pyproject.toml`, commit it, and install that instead. Doing it before that happens adds a file and a regeneration ritual to maintain for a problem the direct pins already mostly cover.

---

## Appendix C: Credentials

The `token:` line in the pull request step is the one part of the workflow that required a decision rather than a lookup.

`GITHUB_TOKEN` is issued automatically to every run, has no setup cost, belongs to no person, and expires when the job ends. It cannot be used here, because GitHub refuses to trigger workflows from events it raises, so `tests.yml` would never run against the bot's pull request. This is the one decision in the whole design with no realistic path back, and it is why a personal access token appears at all. `GITHUB_TOKEN` remains correct for everything else in these workflows: checkout, the failure-notification issue, and any artifact download within the same run.

### What a personal access token commits you to

> [!warning] The token belongs to a person, not to the project
> **It may expire.** Fine-grained tokens carry an expiry date with a one-year maximum. When it lapses, the refresh workflows keep running and keep failing at the final step, which is a quiet failure mode: the pipeline succeeds, the report is generated, and no pull request appears.
>
> **It stops working if that person leaves PPIC or loses repository access.** The token's permissions are a subset of its owner's. Revoke the owner's access and every automated refresh stops, with no warning until the next run.
>
> **Rotation is manual.** There is no renewal. Someone has to remember, and the thing that usually reminds them is a broken pipeline.
>
> **The pull request is made under that person's authorization.** `create-pull-request` sets the displayed commit author to `github-actions[bot]`, so the UI looks like a bot did it. The audit log does not agree: the API calls were authenticated as the token owner, and that is what an organization administrator reviewing activity would see.

None of these are reasons to avoid a personal access token for the initial implementation. They are reasons to write down whose token it is and when it expires, and to treat it as temporary.

### The replacement: a GitHub App

Once the PPIC organization exists, the right credential is a GitHub App installation token. An App is an identity belonging to the organization. It does not expire, does not depend on any individual remaining employed, and can be installed on several repositories with the same narrow permissions. Its tokens are minted per run and expire after an hour, so a leaked log is worth far less than a leaked personal token.

```yaml
      - name: Mint a GitHub App installation token
        id: app-token
        uses: actions/create-github-app-token@v3
        with:
          app-id: ${{ vars.DATA_REFRESH_APP_ID }}
          private-key: ${{ secrets.DATA_REFRESH_APP_PRIVATE_KEY }}

      - name: Open a data-refresh pull request
        if: steps.detect.outputs.changed == 'true' && inputs.dry_run == false
        uses: peter-evans/create-pull-request@v8
        with:
          token: ${{ steps.app-token.outputs.token }}
          # everything else unchanged
```

The cost is setup: creating the App in organization settings, granting the two repository permissions, installing it, generating a private key, and storing the app ID and key. That is four or five screens against roughly one for a personal token, and it requires organization-owner access, which does not exist until the PPIC organization does.

Two smaller costs are worth knowing. A reviewer looking at a pull request sees `ppic-data-refresh[bot]` rather than a person, which is better for auditing but means nobody obvious to ask when a refresh looks wrong. And the private key is a long-lived secret in its own right: it does not expire, so losing control of it is worse than losing a token that would have aged out on its own.

> [!tip] The migration is one step and one line
> Because the token is a single input to a single step, moving from a personal token to an App is adding one step and changing one line. There is no reason to delay the initial implementation waiting for the App, and no reason to treat the App as a rewrite when the time comes.

---

## Appendix D: Alternatives Still on the Table

These are not part of the plan. Each is here because it has a specific trigger that would make it the right choice, and re-deriving them later would be wasted work. Anything without such a trigger has been removed.

| Alternative | Becomes the right choice when | Cost of switching |
|---|---|---|
| Issue plus manual dispatch as the review gate | The approver turns out not to hold a GitHub account | Two workflows to maintain; the reviewer never sees the diff |
| Environment approval gate | The repository is private on Team or Enterprise and a named-reviewer gate is required for policy reasons | Reviewer approves without seeing the data |
| Pre-flight source probe | Actions minutes become scarce, which only happens once the repository is private | An `if:` guard on every step, and a heuristic that can be wrong |

### Issue plus manual dispatch

The most decoupled option, and the only one of the three that works without making the approver a repository collaborator. The pipeline run opens an issue containing the report and uploads the candidate as an artifact; publishing is a separate workflow triggered by hand, naming the run whose artifact was approved.

```yaml
name: Publish reviewed dataset

on:
  workflow_dispatch:
    inputs:
      run_id:
        description: "Run ID of the pipeline run whose artifact you approved"
        required: true
        type: string
      data_dir:
        description: "Directory under data/data-cleaned/"
        required: true
        type: choice
        options: [building-permits, components-of-change, housing-population]

permissions:
  contents: write
  actions: read

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/download-artifact@v7
        with:
          name: ${{ inputs.data_dir }}-candidate
          run-id: ${{ inputs.run_id }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          path: .
      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add "data/data-cleaned/${{ inputs.data_dir }}"
          git diff --staged --quiet || git commit -m "data: approved refresh from run ${{ inputs.run_id }}"
          git push
```

Downloading an artifact from a *different* run requires `run-id`, an explicit `github-token`, and `actions: read`. Within the same run, none of those are needed. `type: choice` renders a dropdown rather than a free-text box, which stops a typo producing a confusing artifact-not-found error.

Its appeal is that review can happen entirely outside GitHub: the issue can be assigned to a non-collaborator, discussed in comments, and closed when handled. Its cost is that a human now carries a run identifier from one screen to another, and artifacts expire, so approving a three-month-old run fails in a way that will not be obvious.

### Environment approval gate

Split the work into two jobs, where the second declares `environment: data-publish` and suspends until a reviewer named in repository settings clicks Approve. The gate itself is not expressible in YAML; everything the workflow can say is that it pauses.

The tradeoff is that the reviewer approves without seeing the data. They get the job summary and can download an artifact, but there is no diff view and no Vercel preview, so approving is a judgment about whether the run looks healthy rather than whether the numbers look right. That is why it was not chosen.

> [!note] It is unavailable on the configuration most likely to occur
> On the Free tier, environment protection rules work on public repositories only. Since going private is a prerequisite for variant 5, the two would arrive together and this gate would stop working at exactly the moment it was needed, unless the organization is on Team or Enterprise.

### Pre-flight source probe

Steps 1 and 2 of the Planned Process are fused in this codebase: `build_building_permits_dataset()` acquires, cleans, merges, and only then calls `detect_new_data()` to decide whether to write. By the time the workflow knows whether there is new data, it has already done the full run. That is arguably better, because "new data" is then a byte-level difference in the serialized output rather than a guess about the source. It does mean a scheduled run always costs its full runtime.

If minutes become scarce, a probe splits them apart by asking the source first:

```yaml
      - name: Check whether the source has published anything new
        id: probe
        run: |
          URL="https://www2.census.gov/econ/bps/Metro/"
          ETAG_FILE=".github/cache/building-permits.etag"
          mkdir -p "$(dirname "$ETAG_FILE")"
          NEW_ETAG="$(curl -sSI "$URL" | tr -d '\r' | awk 'tolower($1)=="etag:"{print $2}')"
          OLD_ETAG="$(cat "$ETAG_FILE" 2>/dev/null || true)"
          if [[ -n "$NEW_ETAG" && "$NEW_ETAG" == "$OLD_ETAG" ]]; then
            echo "stale=true" >> "$GITHUB_OUTPUT"
          else
            echo "stale=false" >> "$GITHUB_OUTPUT"
            printf '%s' "$NEW_ETAG" > "$ETAG_FILE"
          fi
```

Every subsequent step then carries `if: steps.probe.outputs.stale != 'true'`, and a skipped run costs about fifteen seconds instead of several minutes.

Two caveats. The ETag has to persist between runs, so the snippet above needs either a commit or `actions/cache` to survive. And an unchanged ETag is a heuristic: some servers send none, and some change it on every request. Treat a stale ETag as "probably nothing new" and let the cadence catch what the probe misses. `detect_new_data()` remains the authority.

---

## Appendix E: If Something Fails

| Symptom | Most likely cause | Check |
|---|---|---|
| Workflow missing from Actions tab | Not on the default branch | `gh workflow list` after pushing to `main` |
| `--group` unrecognised | pip older than 25.1 | `pip --version` |
| `AttributeError: 'RuntimeError' object has no attribute 'add_note'` | Python older than 3.11 | `python --version`; rebuild `.venv` per stage 0 |
| Change report says "Change report unavailable" | The pipeline died before writing a run record | The step log above it, for the traceback |
| Change report warns that no record matched the module | `module_id` in the caller does not match what the orchestrator passes | The mapping table in stage 2 against `execute_pipeline_run()` |
| `ZoneInfoNotFoundError` | `tzdata` missing, on Windows only | Confirm the `sys_platform` marker survived |
| Run succeeds, no pull request | Nothing changed, or `dry_run` still set | Read `New data detected` in the report |
| Pull request opens with no checks | `GITHUB_TOKEN` in use, not the personal token | Secret name, and `secrets: inherit` on the caller |
| Pull request step fails on permissions | Repository setting not saved | Re-tick both boxes from stage 4 |
| Site unchanged after merge | Vercel build failed | Vercel dashboard, not GitHub |
| Archive artifact empty for one module | Artifact path keyed on `module_id` instead of `data_dir` | Compare against the mapping table in stage 2 |
| `gh run download` finds nothing | Artifact expired, wrong run ID, or nothing was archived | Retention is 30 days for runs and raw, 90 for archives |
| Archived CSVs land under a nested `data/` | Artifact uploaded with more than one `path` | One path per artifact keeps the least common ancestor at that directory |
| Sync writes nowhere, or somewhere unexpected | `PPIC_ARCHIVE_DEST` unset, or the share is not mounted | Checkpoint 8's unset test, then the mount sentinel check |
| Everything worked, then stopped after a quiet month | GitHub disabled the schedules after 60 days of inactivity | Re-enable them in the Actions tab |
