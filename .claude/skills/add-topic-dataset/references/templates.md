# Templates

Fill these in; don't recite them. Drop any section that doesn't apply, and keep the researcher-facing ones short enough to read in a minute or two. Every number in them must come from something you actually ran or read. Where a value is unverified, say so in place.

**Contents:** 1 Dataset plan (Checkpoint 1) · 2 Run report (Checkpoint 2) · 3 Hand-off (Checkpoint 4 / Stage 6): confirm, commits, push, pull request, closing message

---

## 1. Dataset plan

**Audience:** the researcher. Show it in the chat. Once they approve it, it also becomes the first draft of the topic specification.

```markdown
## Plan for <Display Name>

**In one sentence:** <what the table will let people see, e.g. "Average monthly child care cost by county and age group, 2010–2025.">

**What one row means:** one <place> × one <year/month> × <one breakdown value, if any>.

### Columns

| Column | What it means | Units | Example |
|---|---|---|---|
| Geographic Level | Whether the row is a county, region, or the state | | County |
| Location | Place name | | Fresno |
| Year | <calendar or fiscal year? say which> | | 2024 |
| <Measure> | <plain meaning, including what's counted and what's excluded> | <dollars / people / % (0–100)> | 1,240 |
| Source | Which publication the row came from | | <publisher, table name> |

### Coverage

- **Places:** <e.g. all 58 counties, 9 PPIC regions (added up from counties), and California>
- **Time:** <first–last period>, <published yearly/monthly, about N months after the period ends>
- **Gaps:** <missing years or places, and why>

### Missing and suppressed values

<e.g. "The publisher hides counts under 10 to protect privacy. Those cells will be blank, never zero, so averages aren't pulled down.">

### Where the data comes from and how it will update

| Source | How the pipeline finds it | What you'll need to do each release |
|---|---|---|
| <name, publisher> | Fixed / Predictable / Findable / Hand-delivered: <one plain sentence> | Nothing / Send me the new link or file |

### Things to know (caveats)

- <definition change in 2019, PUMA approximations, revisions to old numbers, etc.>

### Example of the finished table (real values from the download)

| Geographic Level | Location | Year | <Measure> |
|---|---|---|---|
| … 5 rows spanning different places and years … |

### Scope

<"Data table only", or "Data table, then (after checking with you again) the topic in the app's chart editor">

**Please check:** do the column meanings and caveats match how you understand this data? Anything to add, rename, or drop?
```

---

## 2. Run report

**Audience:** the researcher, at Checkpoint 2. In Mode B, lead with "What's new" and keep the rest brief.

```markdown
## <Display Name>: results

**Status:** <The pipeline ran successfully twice: the second run found nothing new and left the table untouched, which is what we want for automatic updates.> <Name any fallback that was used, and why.>

- **Rows:** <n>
- **Places:** <counts by Geographic Level>
- **Time covered:** <first–last>, <any gaps>
- **Automatic checks:** all passed. <List any warnings in plain words, e.g. "Alpine County's 2021 value jumped 80% over 2020. It matches the source, but worth knowing.">

### What's new (refresh only)

- **New periods:** <e.g. 2025>
- **Revised older values:** <n cells; the largest: Place, Year, old → new>  *or* "none"

### Sample of the finished table

| … 5–8 rows, plain column names … |

### Checked against the source

| Place | Period | Column | Source file says | Our table says | Match |
|---|---|---|---|---|---|
| Fresno | 2024 | <Measure> | 1,240 | 1,240 | ✅ |
| … at least five, across places and years … |

<Note any value you could not verify, and why.>

**Your turn:** could you check two or three numbers you know well? Or open <source page> and compare <Place, Year, Column> with what's above.
```

---

## 3. Hand-off

### 3a. Confirm with the researcher

> Everything's checked. Next I'll save this work to a separate draft copy called `<branch>` and open a pull request, which is a request for a developer or programmer to review it before it goes live. Nothing changes on the live site until they approve. OK to go ahead?

Only continue on a yes.

### 3b. Commits, grouped by scope

The developer or programmer builds the project changelog from commits, so each commit should hold one kind of change. Stage **by explicit path**, never `git add -A` or `git add .`. Then run `git status` and confirm nothing stray is staged: no `data/data-raw/`, `logs/`, `.next/`, or archive files, and no files outside this topic's scope.

Match the repository's message style: short, lowercase, past tense (e.g. `added geojson maps`). End each message with whatever commit attribution line your app's instructions require.

**Mode A: new topic**

| Order | Message | Paths |
|---|---|---|
| 1 | `added <topic> pipeline and tests` | `scripts/<topic_snake>/`, `scripts/orchestrators/<topic_snake>_pipeline.py`, `scripts/unit_tests/<topic_snake>/`, `scripts/unit_tests/orchestrators/test_<topic_snake>_pipeline.py` |
| 2 | `added <topic> cleaned dataset` | `data/data-cleaned/<topic-slug>/` |
| 3 | `added <topic> topic specification` | `docs/specifications/<topic-slug>-topic-specification.md` |
| 4 | `added <topic> to the app` *(only if Stage 5 ran)* | the files in `app-wiring.md` plus their tests |

**Mode B: refresh**

| Order | Message | Paths |
|---|---|---|
| 1 | `fixed <topic> cleaning for new source layout` *(only if code changed)* | the changed worker(s) and their tests |
| 2 | `refreshed <topic> data for <period>` | `scripts/<topic_snake>/config/sources.py` (if the link changed) and `data/data-cleaned/<topic-slug>/` |
| 3 | `updated <topic> topic specification` *(only if it changed)* | the specification |

Don't edit `data/changelog-overlay.json`. A developer or programmer writes changelog entries after merging.

### 3c. Push

`git push -u origin <branch>`. If the push is refused (not signed in, no permission), don't try to fix credentials. The commits are safe locally: record it as a hand-off item and tell the researcher the branch name to pass on.

### 3d. Pull request

**Audience:** a developer or programmer reviewing the work, plus anyone skimming the repository later. Title: `<Display Name>: new topic` or `<Display Name>: <period> data refresh`.

```markdown
## Summary

<2–3 plain sentences: what this adds or updates, who asked for it (the researcher, by role, not by name unless they asked), and the scope (data only / data + app).>

## Sources and how they update

| Source | Link or discovery method | Class | Release cadence | Researcher action each release |
|---|---|---|---|---|
| … | … | Fixed / Predictable / Findable / Hand-delivered | … | None / supplies new link or file |

<Mode B: the exact link or file used, where it came from, and the date. Call out any switch to Hand-delivered and why discovery couldn't be repaired.>

## Data

- Table: `data/data-cleaned/<topic-slug>/<PascalName>_Current.csv`, <rows> rows, <coverage>
- One row = <grain>
- Full contract: `docs/specifications/<topic-slug>-topic-specification.md`
- <Mode B: new periods; revised cells (count and largest)>

## Verification

- [ ] Topic tests: <n passed>
- [ ] Full backend suite: <n passed, 0 failed>
- [ ] `ruff`: clean
- [ ] Live run ×2: first wrote the table, second reported no new data and left it byte-identical
- [ ] Fallback exercised: manual file picked up; failed download degraded to last saved table
- [ ] Cross-check: <n> cells matched the raw source (table below)
- [ ] Researcher spot-check: <what they checked and their answer>
- [ ] App (if wired): `npm test` <n passed>, `check:palette` + `check:settings` pass, `npm run build` passes, researcher previewed the topic page

<cross-check table from the run report>

## Judgment calls and decisions

- <each decision the researcher made at the checkpoints, and why>
- <each judgment call you made, and the alternative you didn't take>

## Warnings and unverified items

- <soft-check warnings from the real run>
- <anything you could not verify>

## Needs a developer or programmer

- [ ] <shared-code or config change that was designed around>
- [ ] <new dependency that would help>
- [ ] Add the topic to `projectSpec.md` (inventory, references, history) and `docs/agent/AGENTS.md` topic list
- [ ] Schedule automatic refreshes (pipeline runs unattended with no arguments)
- [ ] <app wiring, if the researcher chose data only>
- [ ] <push or pull request creation, if it failed>
- [ ] Review and promote the topic specification from `Draft`

<end with whatever pull request attribution line your app's instructions require>
```

### 3e. Closing message to the researcher

Keep it to a few lines:

> Done! The <topic> work is saved on `<branch>` and sent for review: <PR link, or "please send the branch name `<branch>` to a developer or programmer">.
>
> **What you have:** <one sentence>.
> **Future updates:** <"These will happen on their own once a developer sets up the schedule." / "When <publisher> releases new data (usually <when>), come back and say 'there's a new release of <topic>' with the link or file.">
> **Left for a developer or programmer:** <one line, or "nothing">.
