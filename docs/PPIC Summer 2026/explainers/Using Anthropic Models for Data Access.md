---
Topic: AI
Content Type: Explainer
pinned: false
description: "A guide to configuring Claude for repeatable web research, data comparison, and auditable results."
Date Published: August 25, 2026
Last Updated: 08/27/2026 - 11:31 AM
Footnote: Research, outline, and original draft written by Trinity Jones. GPT 5.6 Sol used for editing
Status: Finalized
---

# Using Anthropic Models for Data Access
## Executive Summary

An AI agent needs clear operating instructions for repeated data access work. It also needs a consistent way to record results. Together, these controls make the work easier to review and repeat.

Two project files provide the operating instructions. `AGENTS.md` defines the project goal, boundaries, and approval requirements. `CLAUDE.md` tells Claude how to apply those project rules. A separate skill file, `changelog.md`, defines how the agent records findings and file changes. The agent reads the project instructions at the start of a session. It reads the skill when the skill's trigger applies.

The appendix compares Claude.ai, Claude Code, and Claude Cowork. It also compares the Opus and Sonnet model tiers. The model section recommends which tier to use for planning, routine work, and review. The appendix also provides writing rules for Markdown and Python files.

| Section | What it covers |
|---|---|
| The changelog.md skill file | Its purpose, trigger, rules, template, and an example |
| AGENTS.md and CLAUDE.md | How the two files define project instructions for an agent |
| Appendix | Claude products, model tiers, and supporting writing rules |

---

## The changelog.md skill file

A skill file contains instructions for a specific type of task. Frontmatter is a metadata block at the top of the file. It gives the skill name and its trigger conditions. These fields help people and agents decide when the skill applies. The `changelog.md` skill makes the work auditable. It tells the agent how to record its checks, findings, and changes for each task.

### Template

```markdown
---
name: changelog
description: >
  Creates an audit record for each task. Use this skill before you check a source or edit a project file. Use the same changelog file for the entire task. Triggers include: "log this," "start a changelog," "record this finding," and "record this edit." The skill also applies to any task that checks a source or changes a project file.
---

# changelog.md

## Purpose

[Explain what evidence a reviewer needs to verify the findings or untracked file changes.]

## Task

Create one changelog file for each task. Use the path `changelogs/YYYY-MM-DD-<task-slug>.md`. Open the file before the first action.

- `## Scope` — state what the task includes and excludes
- `## Findings` — use one subsection for each source and quote the previous and new values
- `## Untracked changes` — quote changes to files that have no version control
- `## Tracked changes` — give a one-line summary for each version-controlled file
- `## Verification` — state which checks you completed
- `## Deferred` — identify incomplete work and its tracking location

Omit an empty section, but always include `## Verification`.

## Trigger

Open the changelog before you check the first source or change the first file. Use this skill for every applicable task, even when you expect no findings.

## Boundaries

Quote only the changed content. Do not quote the complete page or file. Remove sensitive information from each quote. For a credential, record the key name but not the value. Give a one-line summary for each version-controlled file. Do not combine separate tasks in one changelog.

```

### Example

The following example tracks application deadlines and eligibility rules on state grant program pages.

```markdown
---
name: changelog
description: >
  Creates an audit record for the grant program monitor. Use this skill before you check a program page or edit sources.csv. Triggers include: "log this," "start a changelog," "record this finding," and each check_sources.py run.
---

# changelog.md

## Purpose

An unrecorded deadline change can create false confidence in the stored data. This skill creates a reviewable record for each task. The record covers findings and changes to `sources.csv`. A program officer can verify the work without repeating it.

## Task

Create one changelog file for each task. Use the path `changelogs/YYYY-MM-DD-<task-slug>.md`. Open the file before you check the first program.

- `## Scope` — identify the programs in the run
- `## Findings` — use one subsection for each program and quote the previous and new values
- `## Untracked changes` — quote changes to `sources.csv`
- `## Tracked changes` — give a one-line summary of each script change
- `## Verification` — identify the programs checked against the live pages
- `## Deferred` — identify incomplete checks and explain the reason

## Trigger

Open the changelog before you run `check_sources.py`. Use this skill even when you expect no findings.

## Boundaries

Remove contact email addresses and phone numbers from quoted content. Give a one-line summary for a version-controlled file such as `check_sources.py`. Do not combine checks from separate weeks in one changelog.
```

The changelog for one weekly run can contain the following information:

```markdown
---
title: 2026-08-25 Weekly Grant Program Check
description: "Weekly check of eight state grant program pages for deadline and eligibility changes."
date: 2026-08-25
---

# 2026-08-25 Weekly Grant Program Check

## Scope

The run covered all eight programs in `sources.csv`. It checked only the deadline and eligibility fields.

## Findings

### California Housing and Community Development, Multifamily Housing Program

**Was:** "Applications due September 30, 2026"
**Now:** "Applications due October 15, 2026"
**Why:** The agent verified the new deadline on the live program page. The agent did not use the cached snapshot.

### Remaining seven programs

No change from the prior snapshot.

## Untracked changes

### `sources.csv`

**Was:** "CA Housing and Community Development, Multifamily Housing Program, checked monthly"
**Now:** "CA Housing and Community Development, Multifamily Housing Program, checked weekly"
**Why:** The deadline changed twice in one month. A monthly check did not detect the first change.

## Verification

The agent checked all eight programs against the live pages. The agent did not use cached pages for verification. A second review of the live page confirmed the deadline change.

## Deferred

None.
```

---

## AGENTS.md and CLAUDE.md

`AGENTS.md` and `CLAUDE.md` contain project-level instructions. These instructions apply throughout a session. A skill such as `changelog.md` applies only when its trigger conditions are present. Use `AGENTS.md` for rules that must work across different AI tools. Use `CLAUDE.md` for Claude-specific instructions. Claude Code reads `CLAUDE.md` automatically, but it does not read `AGENTS.md` by default. Therefore, keep `CLAUDE.md` short and use it to direct Claude Code to `AGENTS.md`.

### Template

#### AGENTS.md

```markdown
# AGENTS.md

## Goal

This project uses an AI agent for repeated research. The agent collects specified data from an approved list of web sources. It compares the new data with the last confirmed values and reports changes. The output includes the current data and an audit record. The record states what the agent checked, when it checked it, and what it found.

## Tech stack

- **Sources:** [the monitored sites, pages, or APIs]
- **Retrieval:** [the retrieval method, such as a Python script, browser automation, or a manual procedure]
- **Comparison:** [the rule that defines a change, such as a comparison with a saved snapshot]
- **Output:** [the output locations, such as one snapshot per source and one changelog per task]

## Workspace

- `[project-folder]/` — the project root for all work

## Commands

- `[command]` — run one comparison
- `[command]` — run the validation checks

## Boundaries

**Always:**
- Record the source URL and the retrieval timestamp for every value pulled
- Report an unreachable source, a paywall, or a structure change
- Record each result that a person must review as specified in `changelog.md`
  - If `changelog.md` does not exist, stop and ask the user for it

**Ask first:**
- Adding a new source to monitor
- Changing the definition of a change or a significant result
- Removing or archiving a source that is no longer tracked

**Never:**
- Scrape content behind a login or paywall without explicit authorization
- Store personal data or data that the task does not require
- Overwrite a snapshot unless the previous version remains available
- Invent or estimate a value that the agent could not retrieve

## Uncertainty

Mark each low-confidence finding as unconfirmed. If a source structure changes, determine whether the extraction logic still applies. If it does not apply, stop and ask for instructions. Do not guess a solution. Give a confidence value from 0 to 100 percent and explain the value.

## Context

- `[source-list file]` — the tracked sources and their locations
- `changelog.md` — the instructions for recording findings
```

#### CLAUDE.md

```markdown
# CLAUDE.md

## Commands

- `[command]` — run one comparison
- `[command]` — run the validation checks

## Workflow

Review and report changes. Do not act on a change unless the task requires the action. Process one source at a time. Ask for approval before you change multiple sources. Follow `changelog.md`. Open the changelog before you check the first source or change the first file.

## Project context

- Read `AGENTS.md` for the project goal, defaults, and boundaries
- Read `[source-list file]` for the tracked sources and their locations
- Read `changelog.md` before you start a task

## Permissions

- List project files without approval
- Run an existing comparison or validation check without approval
- Ask for approval before you add a source, change the tracked data, or work outside the defined scope
```

### Example

The following `AGENTS.md` and `CLAUDE.md` files continue the grant program example.

#### AGENTS.md

```markdown
# AGENTS.md

## Goal

This project monitors an approved list of state grant program pages. It reports changes to application deadlines and eligibility rules. The output includes one snapshot for each program and a reviewable change record. The record includes the change date and the agent's confidence value.

## Tech stack

- **Sources:** eight state grant program pages in `sources.csv`
- **Retrieval:** a Python script that uses `requests` and `BeautifulSoup`
- **Comparison:** a field comparison with the last saved snapshot in `snapshots/`
- **Output:** one updated snapshot for each program and one task changelog in `changelogs/`

## Workspace

- `grant-monitor/` — the project root for all work

## Commands

- `python check_sources.py` — compare all sources
- `python -m pytest` — test the comparison logic

## Defaults

Retrieve only the required deadline and eligibility fields. Do not retrieve the complete page. Use the existing snapshot format when you add a program. If the scope is not clear, list the programs before you start the run.

## Boundaries

**Always:**
- Record the source URL and retrieval timestamp for every value pulled
- Report an unreachable page or a page structure change
- Confirm that the source permits automated access before you add it
- Add a changelog entry for each result that requires review

**Ask first:**
- Adding a new program to track
- Changing the definition of a significant deadline or eligibility change
- Removing a program that is no longer active

**Never:**
- Scrape a page that requires a login without authorization
- Overwrite a snapshot unless the previous version remains available
- Report a deadline or rule that the agent could not retrieve

## Uncertainty

Mark a low-confidence value, such as an unclear date, as unconfirmed. Do not guess. If a page layout change makes the extraction logic invalid, stop and ask for instructions.

## Context

- `sources.csv` — the tracked programs and their URLs
- `changelog.md` — the instructions for recording findings
```

#### CLAUDE.md

```markdown
# CLAUDE.md

## Commands

- `python check_sources.py` — run one comparison
- `python -m pytest` — run the tests

## Workflow

Review and report deadline or eligibility changes. Do not act on a change unless the task requires the action. Process one program at a time. Ask for approval before you change multiple programs. Follow `changelog.md`. Open the changelog before you run `check_sources.py`.

## Project context

- Read `AGENTS.md` for the project goal, defaults, and boundaries
- Read `sources.csv` for the tracked programs and their URLs
- Read `changelog.md` before you start a check

## Permissions

Read and list project files without approval. Run `check_sources.py` or the tests without approval. Ask for approval before you add a program, change the significance rules, or work outside this scope.
```

---

## Appendix

### Claude.ai, Claude Code, and Claude Cowork

You can use Claude through three products. Each product supports a different type of work.

| | Claude.ai (chat) | Claude Code | Claude Cowork |
|---|---|---|---|
| Built for | Conversation, questions, and drafting | Software development and command-line tasks | Research, analysis, and other multi-step knowledge work |
| Where it runs | A web browser or the Claude mobile app | A terminal, an IDE extension, the desktop app, or a web browser | The desktop app, with web and mobile access in beta |
| How it works | Responds to messages in a conversation | Reads and changes project files, runs commands, and supports automated workflows | Plans and completes multi-step tasks, can use subagents, and can work with local or cloud files |
| Standing instructions | A project provides context and memory across conversations | Claude Code reads `CLAUDE.md` at the start of a session | Project instructions and project knowledge provide persistent context |

Use Claude Code when scripts retrieve and compare the data. Claude Code can read, change, and run the scripts. It reads `CLAUDE.md` automatically. That file can direct Claude Code to `AGENTS.md` and applicable skill files. Claude Code also supports scheduled and pipeline-based workflows. These workflows can run a check without an interactive conversation.

Use Claude Cowork when the task does not require code maintenance. For example, Cowork can check a list of pages and prepare a report. Put the project rules in the Cowork project instructions. Cowork does not read a coding project's `CLAUDE.md` automatically. You can use the same changelog process if Cowork can read and write the `changelogs/` folder. Cowork isolates cloud sessions from the rest of your network. Before you use sensitive data, confirm that this isolation meets the project security requirements.

Use Claude.ai for a one-time question, a draft, or a joint review. A standard chat does not provide the same persistent file access as Claude Code or Claude Cowork. Therefore, it is less suitable for repeated tasks that change project files.

### Opus and Sonnet

Sonnet is Anthropic's standard model for high-volume, well-defined work. Sonnet costs less per token than Opus. These properties make Sonnet suitable for repeated source checks and change logs. Opus is the more capable model. Use Opus when a task requires more judgment, such as an unfamiliar site structure or an unclear instruction. Also consider Opus when an incorrect result creates a significant risk.

Use Opus to plan work that requires judgment. Examples include adding a source and changing the significance rules. Use Sonnet for routine implementation and repeated comparisons. This work has a defined scope and benefits from the lower token cost. Before you finalize `## Verification`, ask a person to review the output. Use Opus for an additional model review. The model that performed the task must not be the only reviewer.