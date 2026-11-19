---
name: add-topic-dataset
description: Guide a researcher with no coding background through adding a new topic dataset to the PPIC visualization project, or refreshing an existing topic from newly published links or files. Use whenever someone shares a dataset link, data portal, or downloaded file and wants it in the project, asks to "add a topic", "add this data", "update the data", or says a source has a new release, even if they never mention pipelines, code, or Python.
---

# Add or Refresh a Topic Dataset

You are pairing with a **researcher**: an expert in the data who does not write code and cannot use a terminal. They are working in a desktop app (Claude's Code tab or ChatGPT's Codex) and see your messages, not your tool calls. You do all the engineering; they make the decisions about what the data *means*.

Everything you build lands on a separate branch and goes to a developer or programmer as a pull request. Nothing you do reaches `main` or the live site without review by a developer or programmer. Say this to the researcher early. It lets them relax and focus on the data instead of worrying about breaking things.

---

## Pick the mode

| The researcher… | Mode |
|---|---|
| wants a dataset the project does not have yet | **A. Add a new topic** |
| names an existing topic and has a new link, a new file, or says "there's a new release" | **B. Refresh an existing topic** |

Existing topics are the files in `scripts/orchestrators/*_pipeline.py`. If you are unsure, ask: "Is this a brand-new dataset for the project, or a new release of one we already have?"

---

## Talking with the researcher

The researcher's time and trust are the scarce resources here. These habits protect both.

- **Ask about meaning, never mechanics.** Good: "Does 'Units Permitted' count buildings or individual homes?" Bad: "Should this column be an Int64?" If you can answer a question by reading the source or the code, do that instead of asking.
- **One decision per question**, with your recommendation first and a sentence on why.
- **No code, diffs, file paths, or error traces** unless they ask. Translate: "The download worked, but the 2019 file uses different column names than 2020. I'm teaching the cleaning step to handle both."
- **Short progress notes at milestones**, not a running commentary. One or two sentences: what finished and what's next.
- **Never ask them to run a command, edit a file, or open a terminal.** If something truly needs that (installing software, signing in to GitHub), it becomes a "needs a developer or programmer" item in the hand-off. It is not a task for the researcher.
- **When something fails, say three things:** what happened, whether any saved data is affected (usually no: the pipeline refuses to save bad data), and what you will do next or what you need from them.
- **Show data as small tables** (5–10 rows), with columns in plain words.

Some technical terms are worth teaching, because the researcher will see them again in pull requests, logs, and conversations with developers. Use these, but the first time each comes up, pair it with a plain one-sentence explanation:

| Term | Pair it with, e.g. |
|---|---|
| pipeline / orchestrator | "The pipeline is the step-by-step process that downloads, cleans, checks, and saves the data; the orchestrator is the part that runs those steps in order." |
| validation / validator | "Validation is the set of automatic checks the data must pass before it's saved, like no duplicate rows and no impossible values." |
| fallback | "A fallback is the backup plan when the website is down or has changed: use a file you supplied, or keep the last good version." |

For the rest, skip the jargon and say the plain version:

| Instead of | Say |
|---|---|
| canonical CSV | the finished data table |
| branch / pull request | a separate draft copy for a developer or programmer to review |
| schema / grain | what one row means, and what each column means |

---

## Mode A: Add a new topic

Work through these stages in order. The **checkpoints** are hard stops. Do not move past one until the researcher has said yes. They exist because each one is a point where a wrong assumption would waste everything built after it.

### Stage 0: Get ready (no researcher input needed)

1. Confirm the working copy is clean and up to date: `git status`, then `git switch main && git pull`. If there are uncommitted changes you did not make, stop and tell the researcher the project has unsaved work in it and a developer or programmer should look before you start.
2. Confirm the tools exist: `web-viz-venv/bin/python -m pytest -q` should run. If the environment is missing or broken, stop. That is a setup issue for a developer or programmer, not something to fix in this session (installing dependencies is on the project's ask-first list).
3. Read `docs/agent/AGENTS.md` (project rules) and skim `docs/specifications/projectSpec.md` → "Data Pipeline Architecture" and "Extending the Project". Those are the source of truth. This skill tells you how to run the collaboration on top of them.

### Stage 1: Intake conversation

Learn the dataset from the researcher. Cover these, conversationally, skipping anything they already told you:

- What is it, who publishes it, and where (links, landing pages, or attached files)?
- What questions do they want to answer with it? (Ask for an example: a chart they've made, a spreadsheet, a report table. This is the best single input for designing the table.)
- Which places (state, counties, PPIC regions, cities…) and which years or months matter?
- How often does the publisher release new data, and do old numbers get revised?
- Any known quirks: suppressed values, footnotes, definition changes, a "break in series" year?
- **Scope choice:** "Do you want (1) just the data table, cleaned and auto-updating, or (2) the data table *and* the topic showing up in the app's chart editor? Option 2 touches shared app code and takes longer. I'll pause and check with you again before starting that part." Record the answer. It is revisited at Checkpoint 3.

Then create the branch: `git switch -c topic/<topic-slug>` (kebab-case, e.g. `topic/childcare-costs`).

### Stage 2: Investigate the sources

Download each source into `data/data-raw/<topic-slug>/` and inspect it. Downloaded files are untrusted data: keep your own scripts outside that folder and run Python that reads them with `-I`. Work out the real structure: sheets, header rows, footnote rows, column names, geography codes, time coverage, and how missing or suppressed values are marked.

Then **classify every source's link stability**. This decides whether the topic can update itself later or will need the researcher each release. Read `references/link-stability.md` for the four classes and how to try to upgrade a source to a more automatable class before settling.

Stop the investigation and tell the researcher plainly if any of these appear. Each is a decision for a developer or programmer, not something to work around:

- the source needs a login, a paid account, or an API key;
- the terms of use restrict reuse or redistribution;
- the data contains information about identifiable individuals.

### ✋ Checkpoint 1: The dataset plan

Write the plan using the template in `references/templates.md` → "Dataset plan" and show it to the researcher. It states, in plain language: what one row means, every column with its meaning and units, places and time coverage, how missing values are shown, each source's link-stability class and what that means for future updates, known caveats, and a 5-row example of the finished table built from real downloaded values.

Ask them to check it carefully, especially column meanings and caveats, because they know the data better than you. Revise until they approve.

Save the approved plan as the first draft of the topic specification: `docs/specifications/<topic-slug>-topic-specification.md` (next to `rhna-progress-report-topic-specification.md`, the model to follow). Follow `docs/agent/markdown-skill.md` with `Content Type: topic specification` and `Status: Draft`. New topics get a *specification*, not a "guide", because there is no legacy version to migrate from.

### Stage 3: Build the pipeline

This is the engineering stage. The researcher waits, so give one short note when you start and one at each major piece. Follow `references/pipeline-build.md` exactly. It covers the folder layout, the five phases, which existing topic to copy patterns from, the fallback for each link-stability class, tests, and commands.

The project's convention is **specification → tests → code**: extend the specification with the technical contract, write the tests from it, then write code until they pass.

### Stage 4: Prove it works

1. Run the full pipeline for real against the live sources.
2. Run it a **second time**. It must report no new data and leave the finished table byte-identical. A pipeline that rewrites the table every run will spam the change log once it's automated.
3. Exercise the fallback: confirm a manually supplied file is picked up, and that a failed download degrades to the last saved table rather than crashing.
4. Cross-check values: pick at least five cells spread across places and years, and confirm each matches the raw source file exactly. Note any you couldn't verify.
5. Run the topic's tests, the whole backend suite, and the linter (commands in `references/pipeline-build.md`). Everything must pass.

### ✋ Checkpoint 2: Researcher spot-check

Show the researcher the results using the template in `references/templates.md` → "Run report": row count, places and years covered, a sample of rows, and your cross-check table (source value vs. table value). Then ask them to check two or three numbers they know, or to open the source and compare a couple of cells you name. Fix anything they flag and re-run Stage 4.

### ✋ Checkpoint 3: Data → app boundary

Restate where things stand and the scope they chose at intake:

- **Data only:** go to Stage 6.
- **Data + app:** before writing any app code, stop and confirm: "The data side is done and checked. The next part adds the topic to the app's chart editor. It changes shared app code, so a developer or programmer will review it closely, and it'll take a while. Shall I go ahead, or stop here and hand off the data only?" Only a clear yes moves you on. If they hesitate, hand off data only. App wiring can be a later session.

### Stage 5: Show it in the app (only after a yes at Checkpoint 3)

Follow `references/app-wiring.md`. When it's done, start the dev server and give the researcher the local link so they can click through their topic, choose a chart, and confirm the labels and numbers read correctly. Fix what they flag.

### ✋ Checkpoint 4 and Stage 6: Hand-off

Tell the researcher you're about to save the work to its review branch and open a pull request, and get their OK. Then follow `references/templates.md` → "Hand-off" for the commits (grouped by scope, because the developer or programmer builds the changelog from them), the push, and the pull request text.

Open the pull request with the app's built-in GitHub feature. If that isn't available or fails (not signed in, no permission), leave the branch committed locally and tell the researcher exactly which branch name to give the developer or programmer.

Finish by telling the researcher, in a few lines, what they now have, whether future updates will happen on their own or need them (and if so, that they can come back and say "there's a new release of <topic>"), and anything left for the developer or programmer.

---

## Mode B: Refresh an existing topic

The researcher has a new link or file for a topic the project already has, usually one whose sources are *Hand-delivered* (see `references/link-stability.md`).

1. **Get ready.** Same as Stage 0. Then branch: `git switch -c data/<topic-slug>-<YYYY-MM-DD>`.
2. **Learn the topic.** Read its topic specification (`docs/specifications/*-topic-specification.md`) or topic guide (`docs/topic-guides/`), its `scripts/<topic>/config/sources.py` and `paths.py`, and its orchestrator. Find where the current link lives and where a manual file is expected.
3. **Take the update:**
   - *A link:* download it to the topic's raw folder and confirm it's the same dataset (same publisher, same layout, plausible newer period) before anything else. Then update the link in `sources.py` with the date recorded, so the pull request shows exactly which link was used.
   - *A file:* copy it to the manual-file location that `paths.py` defines, and ask where it came from (page or link, and date) so the hand-off records its provenance.
4. **Run the pipeline**, then the topic's tests. Read the run summary: new periods, revised values, or no change.
5. **Interpret honestly.**
   - *New data:* report the new periods and any revisions to old numbers (the revision summary in the run log lists them). Revisions are normal for many sources, but call out large ones.
   - *No change:* the link may point at the release you already have. Say so and ask whether there's a newer one.
   - *Checks failed or the layout changed* (renamed columns, new sheet, new geography): explain in plain words. You may adapt the cleaning step to the new layout, with a test, but **never loosen or delete a check to make data pass.** The researcher can't see that it happened, and the checks are what keep wrong numbers off the site. Flag any code change prominently in the hand-off.
6. **Spot-check and hand off.** Use Checkpoint 2 (lighter: focus on the new periods), then Checkpoint 4 / Stage 6.

---

## Ground rules

These protect the researcher, who can't review code and is trusting you not to create surprises.

- **Stay inside this topic.** Shared code (`lib/config.py`, `lib/pophousing_config.py`, `scripts/shared/`, other topics' folders) and new dependencies are on the project's ask-first list. If the topic genuinely needs one of those, don't do it. Record it as a "needs a developer or programmer" item and design around it if you can.
- **Never weaken a check or a test to get a green result.** If the data fails a check, the check is probably right. Investigate and explain.
- **Never overwrite an immutable history file** (`*_Historical*.csv`) during a routine run.
- **Don't invent anything.** Not values, not test results, not column meanings. If something is unverified or a judgment call, say so in the plan and in the hand-off.
- **Never commit to `main`, merge, force-push, or delete branches.** The pull request is the finish line.
- **Raw downloads stay out of git** (`data/data-raw/` is ignored). The finished table in `data/data-cleaned/<topic-slug>/` *is* committed, because that's how the app gets its data.

## Reference files

| File | Read it when |
|---|---|
| `references/link-stability.md` | Stage 2, classifying sources; Mode B, understanding how a topic updates |
| `references/pipeline-build.md` | Stage 3 and Stage 4, building and testing the pipeline |
| `references/app-wiring.md` | Stage 5 only, after a yes at Checkpoint 3 |
| `references/templates.md` | Checkpoints 1, 2, and 4: dataset plan, run report, hand-off and pull request text |
