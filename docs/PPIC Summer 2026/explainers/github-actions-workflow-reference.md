---
Topic: Technical
Content Type: guide
pinned: false
description: "Worked GitHub Actions workflow files implementing the Planned Process from the Automations Guide, annotated step by step, for the developer setting up automation on this repo."
Date Published: August 04, 2026
Last Updated: 08/04/2026 - 04:45 PM
Status: Draft
Footnote: Written by Claude Opus 5 against the live repository. Every YAML block was parsed and the report and detection shell steps were executed against a scratch git repo before publication. Action version pins were checked against the GitHub Marketplace on 08/04/2026 - Verification in Progress by Trinity
---

# GitHub Actions Workflow Reference

Concrete workflow files for the five steps in [[Automations Guide|the Automations Guide]]'s Planned Process, written against this repository as it actually stands.

> [!info] Who this document is for
> The developer wiring up Option C. It assumes you know what the pipelines do and can read Python, but not that you have written GitHub Actions before. Every construct is explained once, in the step where it first appears. The Automations Guide answers *whether* to automate; this document answers *how*.

---

## Assumptions and Scope

The runner is GitHub-hosted (`ubuntu-latest`), which is Option C as written. The repository currently lives on a MacBook and may later move to a Windows laptop, so nothing below hardcodes an absolute path, a home directory, or a machine name. Every path in every workflow is relative to the repository root, and the workflows reference each other by relative path too.

The storage question from Appendix C is unresolved, so Step 4 commits to the repository exactly as the manual process does today, with a commented-out block marking where an external destination would slot in.

> [!important] Actions minutes are free while the repo is public
> The 2,000-minute Free-tier cap in Appendix A applies to **private** repositories. `trinity792/PPIC-web-visualization` is public today, so Actions usage is unmetered. The minutes budget only becomes a real constraint at the moment the repo is made private, which is a decision that can be made independently of building these workflows. Estimate the budget before flipping that switch, not before writing the YAML.

---

## Prerequisites

Three things do not exist in the repo yet and must exist before any of this runs.

### A pinned dependency file

This now exists. It is not a `requirements.txt`; it is a set of PEP 735 dependency groups declared in `pyproject.toml`, alongside the pytest and ruff configuration that was already there:

```toml
[dependency-groups]
runtime = [
    "pandas==3.0.3",
    "numpy==2.4.6",
    "requests==2.34.2",
    "beautifulsoup4==4.15.0",
    "plotly==6.8.0",
    "openpyxl==3.1.5",
    "xlrd==2.0.2",
    "tzdata; sys_platform == 'win32'",
]
dev = [
    "pytest==9.1.1",
    "ruff==0.15.18",
]
geo = [
    "geopandas",
]
```

A pipeline job installs it with `pip install --group runtime`; the test job adds `--group dev`. Versions are pinned exactly because there is no lockfile, and a pipeline that silently starts failing because pandas changed a default is exactly the failure mode automation is supposed to eliminate. Bumping a version is a deliberate edit to this file, which is the point.

Two entries are not obvious from reading the imports. `openpyxl` and `xlrd` appear in no `import` statement anywhere in `scripts/`; pandas loads them internally when `read_excel()` opens an `.xlsx` or a legacy `.xls`, and the DoF E-5, DoF E-6, and Census BPS downloaders all depend on that. Without them a fresh runner gets an `ImportError` from inside pandas partway through a run rather than at install time. `geopandas` is deliberately in its own group and deliberately unpinned, because `choropleth_map.py` and `components_of_change/visualizations.py` import it lazily inside a function and fall back to an undissolved map when it is missing. Installing it would change which code path runs, and it pulls GDAL and PROJ behind it, so the workflows below leave it out.

> [!warning] `tzdata` is what breaks first on Windows
> `scripts/shared/logging/run_records.py` builds `PACIFIC = ZoneInfo("America/Los_Angeles")` at module scope, on line 32, not inside a function. Linux and macOS ship an IANA timezone database; Windows does not. On a Windows machine that line raises `ZoneInfoNotFoundError` at *import* time, so every module that imports the logger dies before `main()` is reached and no pipeline gets far enough to log why. The `tzdata` package supplies the database in pure Python. The environment marker installs it only where it is needed, so it costs nothing on the Ubuntu runner but saves the migration to the Windows laptop.

> [!important] Dependency groups need pip 25.1 or newer
> The `--group` flag did not exist before pip 25.1, released in April 2025. `actions/setup-python@v6` ships a recent pip on `ubuntu-latest`, but the install steps below still run `python -m pip install --upgrade pip` first, and that line is load-bearing rather than cosmetic. On an older pip the flag fails with an unrecognized-argument error that does not mention the version requirement. Anyone working locally needs the same floor; `pip --version` inside `.venv` confirms it.

#### Why groups rather than a `requirements.txt`

A `requirements.txt` is the more familiar choice and would work. Groups were chosen for three reasons specific to this repository.

The first is that they keep the Python configuration in one file. `pyproject.toml` already holds the pytest and ruff settings, so the alternative splits three related concerns across two files for no gain.

The second is that groups express `runtime`, `dev`, and `geo` separately without a file per group. The pipeline job installs `runtime` and skips `pytest` and `ruff`; the test job installs both. With requirements files that is `requirements.txt`, `requirements-dev.txt`, and an `-r` chain between them.

The third is the important one. The other way to declare dependencies in `pyproject.toml` is a `[project]` table, and that would be a mistake here. Adding `[project]` tells pip this repository is an installable Python package, and setuptools then tries to work out which directories to package. On a repository root that contains `app/`, `components/`, `node_modules/`, and `data/` alongside `scripts/`, that discovery fails outright with `PackageDiscoveryError: Multiple top-level packages discovered in a flat-layout`. Worse, the naive fix produces a package containing `node_modules` while *excluding* `scripts/`, because setuptools excludes a directory named `scripts` by default. Dependency groups declare dependencies without any of that, because they do not imply a package.

> [!note] Groups are a declaration, not a lockfile
> The seven pinned versions cover the libraries this code imports directly. They say nothing about the roughly ten transitive packages underneath, so `narwhals`, `certifi`, and `python-dateutil` still float. If a transitive change ever breaks a run, the fix is to generate a true lockfile from the group with `uv pip compile --group runtime -o requirements.lock.txt pyproject.toml`, commit it, and install that instead. Doing it before that happens adds a file and a regeneration ritual to maintain for a problem the direct pins already mostly cover.

### Workflow permissions

In `Settings > Actions > General > Workflow permissions`, select "Read and write permissions" and enable "Allow GitHub Actions to create and approve pull requests." Without the second checkbox the pull-request step fails with a permissions error that does not name the setting.

### A decision about what the bot may touch

The workflows below only ever stage `data/data-cleaned/<module>/`. That is deliberate: it is the only data directory tracked by Git. `data/data-raw/` and `data/archive/` are both in `.gitignore`, so a broad `git add .` would stage nothing from them but would happily stage stray files the pipeline dropped elsewhere.

---

## How the Planned Process Maps onto Actions

Each step in the guide has a direct counterpart in workflow syntax. The mapping is not quite one-to-one, and the place it diverges is worth knowing before reading the YAML.

| Planned Process step | GitHub Actions construct | Notes |
|---|---|---|
| Step 1: Check for new data | `on: schedule` with a `cron` expression | In this repo, detection lives inside the pipeline rather than ahead of it. |
| Step 2: Pipeline run | A `run:` step invoking `python -m scripts.orchestrators.<module>_pipeline` | The orchestrators are already CLI-invocable, so this is a single line. |
| Step 3: Review | A pull request opened by the workflow | Authenticated with a PAT, not `GITHUB_TOKEN`. Two alternatives are recorded in Appendix A. |
| Step 4: Storage | `actions/upload-artifact` for run evidence, plus a stub for external destinations | Currently the Git repo, as today. |
| Step 5: Push and commit | The merge of the bot's pull request | Vercel takes over from here; nothing to configure. |

> [!note] Steps 1 and 2 are already fused in this codebase
> The guide describes Step 1 as a cheap probe that runs before the expensive pipeline. This repo does not work that way. `build_building_permits_dataset()` acquires, cleans, merges, and only then calls `detect_new_data()` to decide whether to write. By the time the workflow knows whether there is new data, it has already done the full run. That is fine and arguably better, because "new data" is defined as a byte-level difference in the serialized output rather than a guess based on the source. It does mean a scheduled run always costs its full runtime whether or not anything changed. If minutes ever become scarce, [the pre-flight probe](#optional-a-cheap-pre-flight-probe) shows how to split the two apart.

---

## File Layout

```text
.github/
└── workflows/
    ├── module-pipeline.yml       # reusable; the actual logic, called by the others
    ├── building-permits.yml      # schedule + inputs for one module
    ├── components-of-change.yml  # same shape, different inputs
    ├── pophousing.yml
    └── tests.yml                 # pytest and vitest on every PR
```

The logic lives once, in `module-pipeline.yml`. Each module gets a caller file that is roughly twenty lines: a schedule and a handful of inputs. Adding the seventh module means writing a seventh caller, not copying a hundred lines of YAML.

GitHub only discovers workflows in `.github/workflows/` at the repository root. That directory is not configurable.

---

## Step 1: Check for New Data

The trigger block declares when a workflow runs. This one runs on a schedule and also on demand.

```yaml
on:
  schedule:
    # 16:17 UTC = 8:17 AM PST / 9:17 AM PDT.
    - cron: "17 16 * * 2"
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Run the pipeline and publish the report without opening a PR"
        type: boolean
        default: false
```

The five cron fields are minute, hour, day-of-month, month, and day-of-week. `17 16 * * 2` means "at 16:17 on every Tuesday."

Two properties of GitHub's scheduler are worth internalizing because both cause confusion later.

**Cron is always UTC and never observes daylight saving.** A job scheduled for 16:00 UTC runs at 8:00 AM Pacific in winter and 9:00 AM Pacific in summer. There is no timezone option. If a run must land at a fixed local hour, schedule it twice with `if:` guards on the month, or accept the one-hour drift. For a data refresh the drift is irrelevant, but it is the sort of thing that reads like a bug six months later.

**Scheduled runs are best-effort and often late.** GitHub queues scheduled jobs across all of its users, and runs at the top of the hour queue hardest. Delays of five to thirty minutes are normal; during incidents, a scheduled run can be skipped outright. Using an off-the-hour minute like `:17` measurably reduces this. Never build logic that assumes a run happened at a precise time, and never assume a run happened at all.

`workflow_dispatch` adds a "Run workflow" button in the Actions tab. It is what you will use for every test run while developing this, and it is the manual override when a source agency publishes off-cadence. The `dry_run` input lets you exercise the full pipeline and read the report without the workflow opening a pull request at you.

> [!warning] Scheduled workflows only run from the default branch
> While you are developing this on a feature branch, `on: schedule` will not fire. GitHub reads the schedule from the version of the file on `main` only. Use `workflow_dispatch` to test, and expect the cron to start working only after merge.

### Choosing a cadence

Match the schedule to the source agency's publication rhythm, then add slack. Census BPS releases monthly but the exact day moves, so a weekly poll costs about four runs a month and catches the release within a week. Annual sources like DOF E-5 can run weekly during the publication window and monthly otherwise. Polling more often than the source publishes wastes minutes; polling less often delays readers.

---

## Step 2: The Pipeline Run

This is the substance of the workflow. The blocks below are the reusable workflow, `module-pipeline.yml`, presented in order.

### Declaring the inputs

`on: workflow_call` makes a workflow callable by other workflows rather than triggered by events. The inputs are the per-module knobs.

```yaml
name: Module data refresh (reusable)

on:
  workflow_call:
    inputs:
      module_id:
        description: "Must match module_id in the orchestrator's run record, e.g. building-permits."
        required: true
        type: string
      module_label:
        description: "Human-readable name used in the PR title and job summary."
        required: true
        type: string
      orchestrator:
        description: "Dotted module path passed to python -m, relative to the repo root."
        required: true
        type: string
      data_path:
        description: "Repo-relative directory the pipeline is allowed to change."
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

`module_id` is not decorative. It is the same string the orchestrators pass to `execute_pipeline_run()`, which means the run record written to `logs/pipeline-runs.jsonl` can be matched back to the workflow that produced it. The seven current values are `building-permits`, `components-of-change`, `pophousing`, `projections`, `housing-stress`, `housing-stress-backfill`, and `rhna-progress`.

### The job header

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
```

`runs-on: ubuntu-latest` selects a GitHub-hosted Linux runner: a fresh virtual machine, destroyed when the job ends. Nothing persists between runs except what you explicitly commit or upload.

Runner choice is also a billing decision, which connects directly to Appendix A. Linux minutes bill at 1x, Windows at 2x, and macOS at 10x. There is no reason to run a pandas pipeline anywhere but Linux.

`timeout-minutes: 20` is a safety valve. Without it, a pipeline that hangs on a stalled HTTP request burns up to six hours of the monthly allowance in a single run. Every scheduled job should have one.

`permissions` narrows what the automatically-provided `GITHUB_TOKEN` can do. Declaring it explicitly at the job level, rather than relying on the repository default, means the token cannot do anything the workflow does not need.

The two entries here are the ones `GITHUB_TOKEN` still does the work for. `contents: write` covers checkout and any direct push. `issues: write` is what the failure-notification step in Step 5 needs; `pull-requests: write` does *not* grant issue creation, and a job missing this line fails only on the rare path where the pipeline has already errored, which is the worst time to discover a permissions bug. Notably absent is `pull-requests: write`: the pull request is opened with `DATA_REFRESH_TOKEN` rather than `GITHUB_TOKEN`, so that permission would be granting something nothing uses.

`defaults.run.shell: bash` pins the shell. On Ubuntu that is already the default, but stating it means the same YAML behaves identically if you ever point this at a self-hosted Windows runner, where the default would otherwise be PowerShell and every `[[ ]]` test would break.

### Checkout and environment

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
```

`uses:` runs a published action; `run:` executes a shell command. `actions/checkout` clones the repository into the runner's workspace and makes it the working directory for every subsequent step, which is the mechanism that makes relative paths work throughout.

`cache: pip` stores the downloaded wheels keyed on the hash of `cache-dependency-path`. Installing pandas, numpy, and plotly cold takes forty seconds or so; from cache it takes a few. Over dozens of runs a month that is real, and it costs one line.

Pointing that key at `pyproject.toml` has one wrinkle worth knowing. The file holds the ruff and pytest configuration too, so editing a lint rule changes the hash and throws away a perfectly good wheel cache. The cost is one slow install on the next run, which is not worth restructuring the file to avoid, but it explains an occasional cache miss that otherwise looks inexplicable.

This job installs `runtime` only. `pytest` and `ruff` live in the `dev` group and are not needed to run a pipeline; skipping them keeps the install lean. The test workflow later in this document installs both.

> [!warning] Action version pins moved a lot in early 2026
> The Node 24 migration pushed most first-party actions through two or three major versions between January and March 2026. One consequence is that `upload-artifact` and `download-artifact` are no longer on matching majors, so the `@v6` and `@v7` pins used below are not a typo. Check the Marketplace page for each action before committing. For anything beyond a proof of concept, pin to a full commit SHA rather than a major tag: `actions/checkout@08c6903...`. A major tag is mutable, so pinning to `@v6` means trusting whatever that tag points at tomorrow. Dependabot can be configured to bump SHA pins for you.

### Running the pipeline

```yaml
      - name: Run the ${{ inputs.module_label }} pipeline
        id: pipeline
        env:
          PYTHONUNBUFFERED: "1"
          TZ: America/Los_Angeles
        run: python -m ${{ inputs.orchestrator }}
```

One line, because the orchestrators were already written to be invoked this way. `python -m` puts the current working directory at the front of `sys.path`, and the working directory after checkout is the repository root, so `from lib.config import ...` and `from scripts.shared...` resolve without a `PYTHONPATH` export or an installed package.

This is also where the portability requirement is satisfied, and it is worth being precise about why. `lib/config.py` computes `PROJECT_ROOT = Path(__file__).resolve().parents[1]` and derives every data, archive, and log path from it. Nothing in the pipeline knows or cares where the repository sits on disk. The workflow inherits that property for free: it never names a directory above the repository root. Move the repo from the MacBook to the Windows laptop, or clone it onto a self-hosted runner, and these paths keep resolving.

`PYTHONUNBUFFERED: "1"` makes print output appear in the live log rather than arriving in a lump when the process exits, which matters when you are watching a twelve-minute run to see where it stalls. `TZ` aligns the runner's local clock with the Pacific timestamps in the run records, so log lines and record timestamps agree.

If the pipeline raises, the step exits non-zero and the job fails. The orchestrators already wrap each phase in a `*PipelinePhaseError` tagged with the phase name, so the failure line in the Actions log names the phase directly. That is a genuinely nice property of how the pipelines were written, and it means no extra error handling is needed here.

---

## Step 3: Review

**The review gate is a pull request**, opened by the workflow and authenticated with a personal access token stored as the repository secret `DATA_REFRESH_TOKEN`. That is the decision, and the reasoning behind the token half of it is in [Authenticating the pull request](#authenticating-the-pull-request).

Two other constructs can serve as the checkpoint: an environment approval gate, and an issue plus a manual dispatch. Neither was chosen, because the pull request is the only one of the three where the reviewer sees the actual numbers before approving them, which is the entire point of the checkpoint the guide asks for. It is also the only one that gets a Vercel preview deployment for free, so the reviewer can look at the rendered charts rather than a CSV diff. Both alternatives are worked out in full in [Appendix A](#appendix-a-review-gates-not-chosen), because the reasons could change.

Whichever gate is in use, the reviewer needs the change report the guide describes. That comes first.

### Generating the change report

The orchestrators already append a structured run record to `logs/pipeline-runs.jsonl` on every run, success or failure. This step reads the last record and renders it as Markdown.

```yaml
      - name: Build the change report
        id: report
        if: always()
        env:
          MODULE_ID: ${{ inputs.module_id }}
          MODULE_LABEL: ${{ inputs.module_label }}
          DATA_PATH: ${{ inputs.data_path }}
        run: |
          python - <<'PY' | tee change-report.md >> "$GITHUB_STEP_SUMMARY"
          import json, os, pathlib, subprocess

          log = pathlib.Path("logs/pipeline-runs.jsonl")
          lines = log.read_text(encoding="utf-8").splitlines() if log.exists() else []
          record = json.loads(lines[-1]) if lines else {}
          result = record.get("result") or {}

          diff = subprocess.run(
              ["git", "diff", "--numstat", "--", os.environ["DATA_PATH"]],
              capture_output=True, text=True, check=False,
          ).stdout.strip()

          print(f"## {os.environ['MODULE_LABEL']} change report\n")
          print(f"- Outcome: **{record.get('severity', 'unknown')}**")
          print(f"- Run finished: {record.get('timestamp', 'n/a')}")
          print(f"- Rows in dataset: {result.get('row_count', 'n/a')}")
          print(f"- New data detected: {result.get('new_data', 'n/a')}")
          print(f"- Source fallback used: {result.get('source_failed', 'n/a')}")
          if record.get("error"):
              print(f"\n> Failure: `{record['summary']}`")
          print("\n### Line-level diff\n")
          print("```text")
          print(diff or "(no tracked file changed)")
          print("```")
          PY
```

Three mechanisms are doing work here.

`if: always()` overrides the default behaviour, which is to skip every remaining step once one fails. The report is most valuable precisely when the pipeline failed, so this step must run regardless. The run record's `severity` field will read `error` and its `summary` will carry the phase-tagged message.

`$GITHUB_STEP_SUMMARY` is a file path the runner provides. Markdown appended to it renders on the workflow run's summary page, so the report is visible in the Actions UI without opening logs. `tee` writes the same text to `change-report.md` on disk, which the pull-request step will use as the PR body. One generation, two destinations.

The heredoc (`<<'PY'`) inlines Python inside a shell step. The quoted delimiter prevents the shell from expanding anything inside the block, which is what keeps `$` and backticks in the Python source intact. This is convenient for a self-contained example, but a script this size belongs in `scripts/shared/logging/` under the project's Python conventions, invoked as one line here. Promote it when you commit.

The report's contents map onto the guide's example. `acquired_months` and `revisions` are also in the run record for modules that populate them, and `summarize_revisions()` in the building-permits pipeline already distinguishes genuinely new months from silently revised ones, which is the most reviewer-relevant thing the report can say. Extend the script to surface it.

### Detecting whether anything changed

```yaml
      - name: Detect changed data files
        id: detect
        run: |
          if [[ -n "$(git status --porcelain -- "${{ inputs.data_path }}")" ]]; then
            echo "changed=true" >> "$GITHUB_OUTPUT"
          else
            echo "changed=false" >> "$GITHUB_OUTPUT"
          fi
```

Writing `name=value` to `$GITHUB_OUTPUT` publishes a value that later steps read as `steps.detect.outputs.changed`. This is how steps communicate; shell variables do not survive from one step to the next because each step is a separate shell process.

Scoping `git status` to `data_path` is what keeps this honest. The pipeline also writes `logs/` and `data/archive/`, both gitignored, so an unscoped check would be comparing against the wrong thing. Restricting it to the one tracked directory means `changed=true` if and only if the published dataset actually differs.

### The review gate: a pull request

The workflow commits the new dataset to a branch and opens a PR whose body is the change report. Review is reading a diff, which is the thing every developer already knows how to do.

```yaml
      - name: Open a data-refresh pull request
        if: steps.detect.outputs.changed == 'true' && inputs.dry_run == false
        uses: peter-evans/create-pull-request@v8
        with:
          token: ${{ secrets.DATA_REFRESH_TOKEN }}
          base: main
          branch: data/${{ inputs.module_id }}
          add-paths: ${{ inputs.data_path }}
          commit-message: "data(${{ inputs.module_id }}): scheduled refresh"
          title: "Data refresh: ${{ inputs.module_label }}"
          body-path: change-report.md
          labels: |
            data-refresh
            automated
          delete-branch: true
```

The `if:` condition means no PR is opened when nothing changed, so a run against an unchanged source is silent. `add-paths` restricts the commit to the module's data directory, which is what keeps `change-report.md` and any other runner debris out of the commit. Reusing a fixed branch name per module means a second run before you have reviewed the first updates the existing PR rather than opening a competing one.

The reviewer sees a diff of the actual CSV, the change report as the PR description, and Vercel's preview deployment of the site built against the new data. Merging is Step 5. Closing the PR is a rejection, and costs nothing.

---

## Authenticating the Pull Request

The `token:` line above is the only part of this section's YAML that required a decision, and it is the part most likely to be wrong on a first attempt.

### Why not `GITHUB_TOKEN`

Every workflow run is issued a `GITHUB_TOKEN` automatically. It has no setup cost and would otherwise be the obvious choice. It is not usable here.

> [!danger] A PR opened with `GITHUB_TOKEN` will not trigger your test workflow
> GitHub deliberately refuses to trigger workflows from events raised by `GITHUB_TOKEN`, in order to prevent a workflow from triggering itself indefinitely. The practical consequence is that the bot's pull request shows no checks at all: `tests.yml` never fires, and you would be merging data without pytest or vitest having run against it. The review gate would then be a human reading a CSV diff with no automated verification underneath it, which is weaker than what the manual process gives you today.

The alternative fix is to run the tests inside the refresh workflow itself, before the PR step, so the results are already in the change report. That works, but it couples the test suite to the data pipeline, re-runs the frontend tests on every data refresh whether or not any frontend code changed, and still leaves the pull request showing no checks to anyone who looks at it later. A token that can trigger workflows is the cleaner answer, and it is also what branch protection rules expect to see.

### The personal access token

Create a fine-grained personal access token scoped to this repository alone, with `Contents: Read and write` and `Pull requests: Read and write`. Store it under `Settings > Secrets and variables > Actions` as `DATA_REFRESH_TOKEN`. Nothing else in the workflow changes.

A fine-grained token rather than a classic one matters. A classic PAT grants its scopes across every repository the owner can reach, so a leak from this workflow would expose everything. A fine-grained token is bound to one repository and two permissions, which is roughly what the workflow actually needs.

> [!warning] What you are accepting by using a PAT
> **The token belongs to a person, not to the project.** Everything below follows from that one fact.
>
> **It may expire.** Fine-grained tokens carry an expiry date, and the maximum is one year. When it lapses, the refresh workflows keep running and keep failing at the final step, which is a quiet failure mode: the pipeline succeeds, the report is generated, and no pull request appears.
>
> **It stops working if that person leaves PPIC or loses repository access.** The token's permissions are a subset of its owner's. Revoke the owner's access and every automated refresh stops, with no warning until the next scheduled run fails.
>
> **Rotation means updating the repository secret.** There is no automatic renewal. Someone has to remember, and the thing that reminds them is usually a broken pipeline.
>
> **The pull request and its commits are made under that person's authorization.** `create-pull-request` sets the displayed commit author to `github-actions[bot]` by default, so the UI looks like a bot did it. The audit log does not agree: the API calls were authenticated as the token owner, and that is what an org administrator reviewing activity would see.

None of these are reasons to avoid a PAT for the initial implementation. They are reasons to write down whose token it is and when it expires, and to treat it as a temporary arrangement rather than the final design.

### The long-term answer: a GitHub App

If PPIC adopts this automation across more than this one repository, the right credential is a GitHub App installation token rather than a personal one. An App is an identity that belongs to the organization. It does not expire, does not depend on any individual remaining employed, and can be installed on several repositories with the same narrow permissions. Its tokens are minted per run and expire after an hour, so a leaked log is worth far less than a leaked PAT.

The workflow change is one extra step ahead of the PR step:

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
          # ... everything else unchanged
```

The downside is more initial setup. You have to create the App in organization settings, grant it the same two repository permissions, install it on the repository, generate a private key, and store the app ID and that key. That is four or five screens in the GitHub UI before a single workflow runs, against roughly one for a PAT, and it requires organization-owner access, which the project does not have until the PPIC organization exists.

There are two smaller costs worth knowing. An App is another thing to document and hand over, and a reviewer looking at a pull request sees a name like `ppic-data-refresh[bot]` rather than a person, which is an improvement for auditing but does mean nobody obvious to ask when a refresh looks wrong. And the private key is a long-lived secret in its own right: it does not expire, so losing control of it is worse than losing a PAT that would have aged out on its own.

> [!tip] The migration is genuinely small
> Because the token is a single input to a single step, moving from PAT to App is adding one step and changing one line. There is no reason to delay the initial implementation waiting for the App, and no reason to treat the App as a rewrite when the time comes. Do the PAT now; revisit at the point the PPIC organization is created, which is already on the Automations Guide's Option C checklist.

---

## Step 4: Storage

Today this means committing to the repository, which the pull request already handles. What the repository does not durably hold is the run evidence: `logs/` and `data/archive/` are both gitignored, so `archive_and_save()` writes a timestamped archive copy on the runner that vanishes when the VM is destroyed.

Artifacts fill that gap.

```yaml
      - name: Upload run logs and archive copies
        if: always()
        uses: actions/upload-artifact@v6
        with:
          name: ${{ inputs.module_id }}-run-${{ github.run_id }}
          path: |
            logs/
            data/archive/${{ inputs.module_id }}/
            change-report.md
          retention-days: 30
          if-no-files-found: warn
```

`${{ github.run_id }}` in the name keeps each run's artifact distinct. `retention-days: 30` overrides the ninety-day default; artifact storage counts against the packages quota in Appendix A, and month-old pipeline logs have little value. `if-no-files-found: warn` prevents a failure when the archive directory does not exist, which happens on any run where nothing changed.

Note what this does and does not solve. It gives you thirty days of forensic evidence for debugging a bad run. It is not durable storage for the dataset, and the growth problem the guide describes is untouched: every refresh still appends to a CSV that lives in Git history forever.

### Where external storage would attach

When Appendix C resolves, the destination slots in here, after the pipeline has produced a validated dataset and before or alongside the commit.

```yaml
      # Uncomment ONE of these once the storage question is settled.
      # Both need credentials added under Settings > Secrets and variables > Actions.
      #
      # - name: Upload the approved dataset to S3
      #   if: steps.detect.outputs.changed == 'true'
      #   env:
      #     AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
      #     AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      #     AWS_DEFAULT_REGION: us-west-2
      #   run: aws s3 sync "${{ inputs.data_path }}" "s3://ppic-datasets/${{ inputs.module_id }}/"
      #
      # - name: Upload the approved dataset to SharePoint or OneDrive
      #   if: steps.detect.outputs.changed == 'true'
      #   env:
      #     GRAPH_TENANT_ID: ${{ secrets.GRAPH_TENANT_ID }}
      #     GRAPH_CLIENT_ID: ${{ secrets.GRAPH_CLIENT_ID }}
      #     GRAPH_CLIENT_SECRET: ${{ secrets.GRAPH_CLIENT_SECRET }}
      #   run: python -m scripts.shared.storage.graph_upload --module "${{ inputs.module_id }}"
```

`${{ secrets.NAME }}` reads a repository secret. Secrets are write-only through the UI and masked in logs, though masking is not a security boundary: anything a workflow can read, a workflow can exfiltrate. That is the substance of Appendix C's "may an external service write to PPIC storage" question. Answering yes means accepting that a credential capable of writing to PPIC infrastructure sits in GitHub's secret store and is readable by any workflow in the repository.

If the answer is no, the change is smaller than it sounds. Install a self-hosted runner on a PPIC machine and change one line:

```yaml
    runs-on: [self-hosted, linux, ppic-data]
```

GitHub still schedules, orchestrates, reports, and gates. The Python process, the source downloads, and the data all stay inside the network. That is the middle path the guide describes, and structuring the workflows as above means adopting it is a one-line edit rather than a rewrite.

> [!warning] Never attach a self-hosted runner to a public repository
> Anyone who can open a pull request can propose a workflow change that executes on the runner. On a public repo that is anyone on the internet, and the runner is a machine inside PPIC's network. Making the repository private is a prerequisite for self-hosting, not an independent decision.

---

## Step 5: Push and Commit

Nothing to configure. Merging the pull request pushes to `main`, Vercel sees the commit, rebuilds, and redeploys. This already works and is the one pillar the guide marks as automated today.

The one addition worth making is failure notification. A scheduled workflow that fails silently is worse than no automation, because the site keeps serving stale data while everyone assumes it is current.

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

`if: failure()` runs the step only when an earlier step in the job failed. `actions/github-script` provides a pre-authenticated Octokit client, so calling the GitHub API takes no token handling.

GitHub also emails the workflow file's last committer on scheduled-run failure, and disables schedules entirely after sixty days of repository inactivity. Both are worth knowing: the first means you get notified by default, and the second means a quiet month can silently stop every pipeline.

---

## The Caller Workflow

With the reusable workflow in place, each module is this:

```yaml
name: Building Permits refresh

on:
  schedule:
    - cron: "17 16 * * 2"
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
      orchestrator: scripts.orchestrators.building_permits_pipeline
      data_path: data/data-cleaned/building-permits
      dry_run: ${{ inputs.dry_run == true }}
```

`uses: ./.github/workflows/module-pipeline.yml` is the relative reference, and the leading `./` is required. GitHub resolves it against the same commit of the same repository, so the pair moves together under a fork, a transfer to a PPIC organization, or a clone onto another machine. The alternative syntax, `owner/repo/.github/workflows/file.yml@ref`, hardcodes an owner and would need editing on transfer.

`concurrency` prevents two runs of the same module from overlapping. Without it, a manual dispatch fired while a scheduled run is mid-flight produces two processes racing to write the same CSV and open the same branch. `cancel-in-progress: false` queues the second run instead of killing the first, which is right for a data pipeline: an interrupted run leaves a half-written file.

`dry_run: ${{ inputs.dry_run == true }}` handles a subtlety. On a `schedule` event there are no inputs, so `inputs.dry_run` is null. Comparing to `true` yields a proper boolean either way, which is what `workflow_call` requires. Passing `${{ inputs.dry_run }}` directly fails type validation on scheduled runs.

`permissions` is declared on the calling job, not inside the reusable workflow. A called workflow cannot grant itself more than its caller has.

> [!warning] `secrets: inherit` is what makes `DATA_REFRESH_TOKEN` reachable
> A called workflow gets no secrets by default. Without this line, `${{ secrets.DATA_REFRESH_TOKEN }}` inside `module-pipeline.yml` silently evaluates to an empty string, and `create-pull-request` fails with an authentication error that says nothing about the caller. The alternative is to declare the secret explicitly with a `secrets:` block naming it, which is stricter and worth doing once more than one secret is in play. `inherit` passes everything the caller can see, which is fine while that set is one token and worth revisiting when storage credentials join it.

---

## Testing on the Bot's Pull Requests

This is the workflow that `DATA_REFRESH_TOKEN` exists to trigger. It runs on your own pull requests regardless; it runs on the bot's only because the refresh workflow authenticates with a PAT rather than `GITHUB_TOKEN`.

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

The two jobs have no `needs:` relationship, so they run in parallel on separate machines. `permissions: contents: read` is the minimum, because nothing here writes.

`npm ci` rather than `npm install` installs exactly what `package-lock.json` specifies and fails if the lockfile is out of sync, which is what you want in CI. `npm run check:palette` is the existing non-mutating counterpart to `build:palette`, so a stale generated palette fails the check instead of being silently regenerated.

---

## Optional: A Cheap Pre-flight Probe

Only worth adding if minutes become scarce. It asks the source whether anything changed before spending the full pipeline runtime.

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

      - name: Skip the rest of the run
        if: steps.probe.outputs.stale == 'true'
        run: echo "Source unchanged since the last run; nothing to do." >> "$GITHUB_STEP_SUMMARY"
```

Every subsequent step then carries `if: steps.probe.outputs.stale != 'true'`. A skipped run costs about fifteen seconds instead of several minutes.

Two caveats. The ETag has to persist between runs, which means either committing it or caching it with `actions/cache`; the snippet above writes a file that would need one of those to survive. And an unchanged ETag is a heuristic, not a guarantee: some servers do not send one, and some change it on every request. Treat a stale ETag as "probably nothing new" and let the monthly cadence catch what the probe misses. The pipeline's own `detect_new_data()` remains the authority.

---

## Portability Notes

The requirement was that the repository and these workflows survive being moved. Here is what actually holds and what does not.

| Concern | Status |
|---|---|
| Absolute paths in the workflows | None. Every path is repo-root-relative. |
| Absolute paths in the pipelines | None. `lib/config.py` derives everything from `Path(__file__).resolve().parents[1]`. |
| Reusable workflow reference | `./.github/workflows/module-pipeline.yml`, relative, moves with the repo. |
| Repository owner or name | Never named. `${{ github.repository }}` and `context.repo` resolve at runtime. |
| Moving the repo to the Windows laptop | Works. `tzdata` is in the `runtime` group behind a `sys_platform == 'win32'` marker, so it installs there and nowhere else. |
| Python version agreement | Loose. The workflows request 3.12, `[tool.ruff]` targets `py312`, and the local `.venv` is 3.11.9. Nothing declares a floor, because `requires-python` is a `[project]` field and this repo has no `[project]` table. |
| Running these workflows on a Windows self-hosted runner | Needs `shell: bash` (already pinned) and Git Bash on the machine. |
| Transferring to a PPIC organization | Workflows need no edits. `DATA_REFRESH_TOKEN` does, since it belongs to an individual. |

The one thing that genuinely does not travel is credentials. Repository secrets do not follow a transfer to a new organization, and `DATA_REFRESH_TOKEN` is bound to the person who created it. Whoever owns the eventual PPIC organization has to re-create every secret, which is worth writing down somewhere before the handoff rather than discovering when the pipelines stop. That handoff is also the natural moment to replace the PAT with a GitHub App, since organization-owner access is a prerequisite for creating one and the change is a single extra step in the workflow.

---

## Setup Checklist

- [x] Declare pinned dependencies as groups in `pyproject.toml`, including `tzdata` for Windows.
- [ ] Confirm `python -m scripts.orchestrators.building_permits_pipeline` runs clean from a fresh clone with only `pip install --group runtime`.
- [ ] Reconcile the Python version: the local `.venv` is 3.11.9 while ruff targets `py312` and the workflows request 3.12.
- [ ] Enable read and write workflow permissions, and PR creation, in repository settings.
- [ ] Add `.github/workflows/module-pipeline.yml` and one caller for building permits.
- [ ] Run it via `workflow_dispatch` with `dry_run: true` and read the job summary.
- [ ] Run it with `dry_run: false` and confirm the pull request looks the way a reviewer would want.
- [ ] Create a fine-grained PAT scoped to this repo with `Contents` and `Pull requests` write, store it as `DATA_REFRESH_TOKEN`, and record whose it is and when it expires.
- [ ] Confirm `tests.yml` actually runs on the bot's pull request, which is the only proof the token is working as intended.
- [ ] Revisit the PAT when the PPIC organization exists, and replace it with a GitHub App installation token.
- [ ] Promote the inline report script into `scripts/shared/logging/` per the Python conventions.
- [ ] Add callers for the remaining six modules once the first is stable.
- [ ] Re-pin every action to a commit SHA before treating this as production.

---

## Open Questions for the Project

These follow from the workflows above rather than from the infrastructure questions in the Automations Guide's Appendix C.

**What happens to `data/archive/` under automation?** The archive currently accumulates on the maintainer's machine and is gitignored. On a hosted runner it is written and immediately discarded. If the archive matters as a record, it needs a destination; if it does not, `archive_and_save()` is doing work that no longer serves a purpose in the automated path.

**Who reviews, and do they have a GitHub account?** The pull request assumes the reviewer is a repository collaborator who can read a diff. The guide says "a researcher or project owner," which may not describe the same person. If the approver turns out to be someone without a GitHub account, the issue-plus-dispatch approach in [Appendix A](#appendix-a-review-gates-not-chosen) is the fallback, and the decision should be revisited rather than worked around.

**Should a failing pipeline block the schedule?** As written, a module that fails every Tuesday opens an issue every Tuesday. A backoff, or a check that suppresses duplicate issues, is straightforward to add but needs a policy decision about how loud repeated failure should be.

---

## Appendix A: Review Gates Not Chosen

Two constructs other than the pull request can serve as the human checkpoint in [Step 3](#step-3-review). Neither was chosen. Both are worked out here rather than discarded, because the deciding factor is who the reviewer turns out to be, and that is not settled.

### Comparison

| | Pull request (chosen) | Environment gate | Issue plus dispatch |
|---|---|---|---|
| Reviewer sees the data diff | Yes | No, artifact download only | No, artifact download only |
| Vercel preview deploy | Yes, automatic | No | No |
| Works on Free tier, private repo | Yes | No | Yes |
| Reviewer must be a collaborator | Yes | Yes, and named in settings | No |
| Steps for the reviewer | Read diff, merge | Click approve | Read issue, dispatch with run ID |
| Extra setup | A token that can trigger workflows | Environment config | Two workflows to maintain |

The issue-plus-dispatch approach stays on the table for one specific future: if a researcher who does not use GitHub becomes the approver, it is the only one of the three that works without making them a repository collaborator. The Automations Guide describes the reviewer as "a researcher or project owner," so this is a plausible end state rather than a hypothetical one. Revisit if the approver changes.

### An environment approval gate

Split the work into two jobs. The first builds the candidate and uploads it; the second waits for a named reviewer to click Approve in the Actions UI before it pushes.

```yaml
jobs:
  build:
    name: Build candidate dataset
    runs-on: ubuntu-latest
    timeout-minutes: 20
    outputs:
      changed: ${{ steps.detect.outputs.changed }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-python@v6
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: pyproject.toml
      - run: |
          python -m pip install --upgrade pip
          pip install --group runtime
      - run: python -m scripts.orchestrators.building_permits_pipeline
      - id: detect
        run: |
          if [[ -n "$(git status --porcelain -- data/data-cleaned/building-permits)" ]]; then
            echo "changed=true" >> "$GITHUB_OUTPUT"
          else
            echo "changed=false" >> "$GITHUB_OUTPUT"
          fi
      - uses: actions/upload-artifact@v6
        if: steps.detect.outputs.changed == 'true'
        with:
          name: building-permits-candidate
          path: |
            data/data-cleaned/building-permits/
            logs/

  publish:
    name: Publish approved dataset
    needs: build
    if: needs.build.outputs.changed == 'true'
    runs-on: ubuntu-latest
    # The gate. Settings > Environments > data-publish > Required reviewers.
    # The job pauses here until a named reviewer clicks Approve.
    environment: data-publish
    steps:
      - uses: actions/checkout@v6
      - uses: actions/download-artifact@v7
        with:
          name: building-permits-candidate
          path: .
      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data/data-cleaned/building-permits
          git diff --staged --quiet || git commit -m "data(building-permits): scheduled refresh"
          git push
```

`needs: build` creates the dependency, and `needs.build.outputs.changed` reads the value the first job exported. Jobs run on separate machines with separate filesystems, so the artifact upload and download is the only way to move the dataset between them.

The gate itself is not in the YAML. `environment: data-publish` refers to an environment configured in repository settings with a required reviewer; the job suspends and GitHub emails the reviewer. Everything the workflow can express is the pause. Who may approve, and whether a wait timer applies, lives in settings.

The tradeoff is that the reviewer approves without seeing the data. They get the job summary and can download the artifact, but there is no diff view. Approving is a decision about whether the run looks healthy, not about whether the numbers look right.

> [!warning] Required reviewers on environments are a paid feature for private repos
> On the Free tier, environment protection rules work on public repositories only. If the repo goes private under Option C, this approach stops gating until the org is on Team or Enterprise. The pull request has no such restriction, which is a second reason it was chosen.

### An issue plus manual dispatch

The most decoupled option. The pipeline run opens an issue containing the report and uploads the candidate as an artifact. Publishing is a separate workflow you trigger by hand, naming the run whose artifact you approved.

```yaml
name: Publish reviewed dataset

on:
  workflow_dispatch:
    inputs:
      run_id:
        description: "Run ID of the pipeline run whose artifact you approved"
        required: true
        type: string
      module_id:
        description: "Module directory under data/data-cleaned/"
        required: true
        type: choice
        options:
          - building-permits
          - components-of-change
          - pophousing

permissions:
  contents: write
  actions: read

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Download the approved candidate
        uses: actions/download-artifact@v7
        with:
          name: ${{ inputs.module_id }}-candidate
          run-id: ${{ inputs.run_id }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          path: .
      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add "data/data-cleaned/${{ inputs.module_id }}"
          git diff --staged --quiet || git commit -m "data(${{ inputs.module_id }}): approved refresh from run ${{ inputs.run_id }}"
          git push
```

Downloading an artifact from a *different* workflow run requires `run-id`, an explicit `github-token`, and `actions: read` permission. Within the same run, none of those are needed.

`type: choice` renders a dropdown in the dispatch form instead of a free-text box, which prevents a typo in a module name from producing a confusing artifact-not-found error.

This approach's appeal is that review can happen entirely outside GitHub: the issue can be assigned to a researcher who is not a repository collaborator, discussed in comments, and closed when handled. Its cost is that the human is now responsible for carrying a run ID from one screen to another, and artifacts expire, so approving a three-month-old run fails in a way that will not be obvious.

> [!note] Neither alternative uses `DATA_REFRESH_TOKEN`
> Both push directly with `GITHUB_TOKEN` rather than opening a pull request, so the recursion rule that forces the PAT in the chosen design does not apply. That also means neither triggers `tests.yml`: there is no pull request for it to run against, and the push to `main` fires `tests.yml` only after the data has already been published. Adopting either one would mean moving the test suite into the build job to keep the verification the pull request gets for free.
