---
Topic: Technical
Content Type: refractor plan
pinned: false
description: "Plan for hoisting the five duplicated archive_and_save() implementations into a single shared helper, unifying their naming, change detection, and copy semantics, for the developer doing the refactor."
Date Published: August 04, 2026
Last Updated: 08/07/2026 - 03:40 PM
Status: Archive
Footnote: Drafted by Claude Opus 5 from a read of all five implementations and their tests. No code changed. Every current-state claim below cites the file and line it came from. Content verified by Trinity Jones
---

# Shared `archive_and_save`: Refactor Plan

A cross-cutting refactor rather than a module migration: five near-but-not-quite-identical archive-and-write implementations collapse into one shared mechanism, and the archive filename changes to `{module}_{prefix}_{YYYY-MM-DD}.csv`.

> [!warning] Superseded, kept as a record
> This is the August 4 plan. It was replaced by [[shared-archive-and-save-plan]], which is the plan that was actually implemented and is now the as-built guide for the shared helper. **Do not act on anything below.** The filename format, the `module_id` rule, the `housing_stress` backfill resolution, and the treatment of `pophousing` as a sixth write path all reached their final form in the successor document. This one is preserved because its Open Questions and their answers are the record of how those decisions were reached.

> [!info] Who this document was for and what it did not do
> The developer performing the refactor. It was a plan, not an as-built: nothing described here had been implemented when it was written, and no file had been modified. It read [Current State](#current-state) before [Target Design](#target-design), because the five implementations differed more than their shared name suggested and the differences drove most of the decisions.

---

## Why This Refactor

The immediate trigger is a filename change. Archive files are going onto external storage under the manual-refresh setup in [[github-actions-workflow-reference]], where they will be browsed by a human rather than parsed by a script. That makes two properties matter that did not matter while the archive sat in a gitignored local directory: a file should identify itself if it is moved out of its folder, and a directory listing should sort chronologically.

The reason it is a refactor rather than a one-line edit is that there is no single place to make the change. `archive_and_save` exists five times, in five module directories, with three different naming schemes between them. Changing the name in one place is impossible; changing it in five places without unifying them first means the next change costs the same again.

This also lines up with a project-wide decision already recorded in [[refractor-process]]: the three-layer backend puts shared mechanisms in `shared/`, module-specific domain logic in `<module>/`, and sequencing in `orchestrators/`. Conditional archive-and-write is a mechanism, not domain logic. It is in the wrong layer today.

---

## Current State

Five implementations, verified by reading each one.

| Module | Function | Archive filename produced | Change detection | Copy or move |
|---|---|---|---|---|
| `building_permits` | `archive_and_save` | `BuildingPermits_08-04-26.csv` | full-string read, in-function | copy via `write_bytes` |
| `projections` | `archive_and_save` | `DemographicProjections_Current_08-04-26.csv` | streamed SHA-256, in-function | `shutil.copy2` |
| `housing_stress` | `archive_and_save` | `HousingStress_Current_08-04-26.csv` | streamed SHA-256, in-function | `shutil.copy2` |
| `components_of_change` | `archive_and_save` | `ComponentsOfChange_Current.csv`, then `_1`, `_2` | **none**; caller gates on source flags | **move** via `archive_or_delete_files` |
| `rhna_progress` | `write_dataset` | `RHNAProgress_08-04-26.csv` | caller passes `new_snapshot` | copy via `write_bytes` |

### Three naming schemes, not one

`building_permits` and `rhna_progress` take `current_path.stem.split("_")[0]`, which drops the `_Current` suffix and yields `BuildingPermits_08-04-26.csv`.

`projections` and `housing_stress` use the full stem, so the `_Current` survives into the archive name: `DemographicProjections_Current_08-04-26.csv`.

`components_of_change` does not timestamp at all. It hands the file to `archive_or_delete_files()` in `scripts/shared/archives/file_retention.py`, which keeps the original filename and disambiguates collisions with a counter, producing `ComponentsOfChange_Current.csv`, then `ComponentsOfChange_Current_1.csv`. An archive of this module is therefore un-orderable by date without reading file mtimes.

All five use `%m-%d-%y`, which sorts wrongly in any lexicographic listing: `01-15-26` precedes `02-03-25`.

### Two comparison strategies, one of them deliberate

`building_permits` and `rhna_progress` compare by reading the whole existing file into a string. `projections` and `housing_stress` stream a SHA-256 and compare digests.

The hash version is not an arbitrary difference. [[refractor-process]] records it as a deliberate efficiency pass on Projections: "`archive_and_save` streams a SHA-256 hash + `shutil.copy2` instead of reading two full files into strings (peak ~189MB → ~2MB)." The string version is the older, unoptimised form. On a 87MB projections CSV the difference is the whole point; on a small building-permits file it is invisible. The shared helper should adopt the optimised version, which makes this refactor a performance improvement for three modules as a side effect.

> [!note] `rhna_progress` is not missing its guard
> It looks like it archives unconditionally, because the archive branch is a bare `if current_path.exists():` with no content comparison. The guard is one level up: `write_dataset` returns early on `if not new_snapshot`. The comparison is the caller's responsibility rather than the function's. This is an interface difference, not a bug, and it is the reason `rhna_progress` also takes a `paths` dict instead of `current_path` and `archive_directory` separately.

> [!warning] `components_of_change` has no byte-level idempotency at all
> Its `archive_and_save` performs no comparison, and neither does the `write_components_output` it delegates the write to. The only gate is in the orchestrator at `components_of_change_pipeline.py:213`, `if new_dof_data_found or new_census_data_found:`, which is a *source-acquisition* flag rather than a statement about the output. If a source republishes byte-identical data, this module archives and rewrites anyway.
>
> [[refractor-process]] records the same class of problem in another module: "the 'new data' flags are effectively always true — real idempotency comes only from the byte-hash no-op in `archive_and_save`." Components of Change is the one module with no such backstop. Adopting the shared helper gives it one, which makes this the most substantive improvement in the refactor and not merely a deduplication.

### One module moves rather than copies

> [!danger] `components_of_change` deletes its canonical CSV before writing the replacement
> `archive_or_delete_files()` calls `shutil.move`, so the current file is *relocated* into the archive directory and then the new dataset is written fresh. Between those two operations there is no canonical CSV on disk. The other four modules copy the old file and leave the original untouched until an atomic `replace()` swaps the new one in, so a crash at any point leaves a valid file. Fixing this is the highest-value part of the refactor and is independent of the naming change.

### What the tests pin

Naming is asserted directly in at least one place, in `scripts/unit_tests/building_permits/output/test_finalize_dataset.py`:

```python
assert archives[0].stem.startswith("BuildingPermits_")
```

Others assert on `archive_directory.glob("*.csv")` and on counts rather than names, which will survive a rename unchanged. Every test file in the table below still needs reading before its module is touched, because a passing glob assertion can hide a name assumption in a fixture.

> [!note] Retention does not read these filenames
> The `filename_pattern` regexes in `scripts/pophousing/archives/e5_retention.py` and `scripts/projections/acquisition/dof_p3_downloader.py` match *source downloads* such as `E-5-2025_Geo_InternetVersion.xlsx`, not archived datasets. Nothing downstream parses archive filenames, so the rename has no consumers to break. This was checked specifically because it is the failure mode that would be discovered late.

---

## Target Design

### The shared helper

A new module, `scripts/shared/archives/dataset_archive.py`, holding one public function. It belongs beside `file_retention.py` in the same package, which already owns archive mechanics.

```python
def archive_and_save(dataframe, current_path, archive_directory, module_id, already_compared=False):
    """
    Archive the prior canonical CSV and atomically write the new one, only when the data changed.

    Compares by streamed SHA-256 so a no-op run never holds two full files in memory
    and leaves the existing file byte- and mtime-identical. The prior version is
    **copied** to the archive, never moved, so a crash between archive and write can
    never leave the module without a canonical CSV.

    Args:
        dataframe: the prepared output frame.
        current_path: canonical CSV path, e.g. data/data-cleaned/<module>/X_Current.csv.
        archive_directory: data/archive/<module>/.
        module_id: the same string the orchestrator passes to execute_pipeline_run(),
            e.g. "building-permits". Prefixes the archive filename.
        already_compared: True when the caller has established the data is new and the
            in-function hash comparison should be skipped. Used by rhna_progress.

    Returns:
        pathlib.Path or None — the output path if written, None if unchanged.
    """
```

The write sequence is the one four of the five modules already use, and is unchanged: archive the old file by copy, stage the new data to a sibling `.tmp`, then `replace()` it into place.

### Filename format

```text
{module_id}_{prefix}_{YYYY-MM-DD}.csv
```

where `prefix` is `current_path.stem.split("_")[0]`, matching what `building_permits` does today.

| Module | Today | After |
|---|---|---|
| `building_permits` | `BuildingPermits_08-04-26.csv` | `building-permits_BuildingPermits_2026-08-04.csv` |
| `projections` | `DemographicProjections_Current_08-04-26.csv` | `projections_DemographicProjections_2026-08-04.csv` |
| `housing_stress` | `HousingStress_Current_08-04-26.csv` | `housing-stress_HousingStress_2026-08-04.csv` |
| `components_of_change` | `ComponentsOfChange_Current.csv` (undated) | `components-of-change_ComponentsOfChange_2026-08-04.csv` |
| `rhna_progress` | `RHNAProgress_08-04-26.csv` | `rhna-progress_RHNAProgress_2026-08-04.csv` |

`module_id` is passed explicitly rather than derived from `archive_directory.name`. Deriving it would need no new plumbing and would usually be right, but it would silently produce `tmp_path`-derived garbage under tests and would couple the filename to a directory layout that is not guaranteed. Passing it explicitly also means the archive filename and the run record in `logs/pipeline-runs.jsonl` are provably the same string, since both come from the orchestrator's module metadata.

> [!warning] The day-granularity collision survives this change
> `{YYYY-MM-DD}` has the same resolution as `{mm-dd-yy}`. Two refreshes of the same module on the same day still produce the same filename, and the second overwrites the first. This is deliberate: the format stays readable, and the collision does not matter while refreshes are manual and roughly monthly. If a schedule is ever added, the fix is to extend the format to `{YYYY-MM-DD}T{HHMMSS}` in one place, which is the entire point of hoisting the function.

### Behavioral changes this introduces

| Module | Change | Risk |
|---|---|---|
| `building_permits` | String comparison becomes streamed hash | None. Same result, less memory. |
| `rhna_progress` | String comparison becomes streamed hash; signature changes from `paths` dict to explicit arguments | Low. Caller already gates on `new_snapshot`. |
| `projections` | Archive name loses `_Current`, gains module prefix and ISO date | None beyond the rename. |
| `housing_stress` | Archive name loses `_Current`, gains module prefix and ISO date; **the backfill's seed archive needs its own `module_id`** | Second-highest. The rename itself is free, but the prefix rule maps `HousingStress_Current.csv` and `HousingStress_Historical.csv` onto one filename, so the backfill must pass `module_id="housing-stress-backfill"` or the seed archive is silently overwritten. See [§ 3](#3-housing_stress). |
| `components_of_change` | **Move becomes copy**; gains byte-level change detection; archives gain dates; counter-suffix disambiguation disappears | Highest. Four changes at once, and the only module whose write path is genuinely re-specified. |

---

## Per-Module Migration

Each module is one commit. Order is chosen so the riskiest change lands last, against a helper already proven by four modules.

### 1. `scripts/shared/archives/dataset_archive.py`

Write the helper and its tests first, with no caller changes. The suite in `scripts/unit_tests/shared/archives/` gains `test_dataset_archive.py`. Nothing else in the repo changes in this commit, so it cannot break anything.

### 2. `building_permits`

The closest match to the target. Delete `archive_and_save` from `scripts/building_permits/output/finalize_dataset.py`, import the shared one, and pass `module_id="building-permits"` from `scripts/orchestrators/building_permits_pipeline.py:264`.

Update `scripts/unit_tests/building_permits/output/test_finalize_dataset.py`, including the `startswith("BuildingPermits_")` assertion at line 199, which becomes `startswith("building-permits_BuildingPermits_")`.

### 3. `housing_stress`

Two call sites rather than one, and they archive different files. `scripts/orchestrators/housing_stress_pipeline.py:288` passes `current_data_path` and is the same shape as `building_permits`. `scripts/orchestrators/housing_stress_backfill.py:192` passes `paths["historical_data_path"]`, the deep-history seed `HousingStress_Historical.csv`, and is the only call site in any module that archives a historical seed rather than a live output.

The backfill keeps its archiving, resolved. The "immutable" label on that file (`scripts/housing_stress/config/paths.py:39-41`) scopes to the live pipeline, not to all writers: the comment reads "read-only to the live pipeline so a bad current write cannot poison the baseline," and the pipeline only ever loads it (`housing_stress_pipeline.py:172`). The backfill is the seed's sole owner and only writer, and because a rebuild pulls live from Census, the archive is the one thing standing between a partial or degraded rebuild and an irreplaceable artifact. It has already served that purpose once: `data/archive/housing-stress/` holds `HousingStress_Historical_07-13-26.csv`, the 2022-2024 live-only seed preserved on the run that expanded it to the full 2012-2024 series via the legacy bootstrap. The seed is committed to git, so history is a second recovery path, but only the archive covers the window between commits, which is exactly when a rebuild runs.

> [!danger] The prefix rule collapses both housing_stress archives onto one filename
> `prefix` is defined as `current_path.stem.split("_")[0]`, which yields `HousingStress` for **both** `HousingStress_Current.csv` and `HousingStress_Historical.csv`. Paired with a single `module_id="housing-stress"`, the live pipeline and the backfill would both write `housing-stress_HousingStress_{YYYY-MM-DD}.csv`, so the seed archive is silently overwritten by the live archive on any day both run, and the two are indistinguishable by name in general. Today they are distinguishable (`_Current_` versus `_Historical_`), so this would be a regression rather than a rename.

The fix is to apply the `module_id` rule literally rather than per-module. The backfill's own `execute_pipeline_run` call (`housing_stress_backfill.py:226`) already passes `module_id="housing-stress-backfill"`, so passing that same string to `archive_and_save` yields `housing-stress-backfill_HousingStress_{YYYY-MM-DD}.csv`, distinct from the pipeline's `housing-stress_HousingStress_{YYYY-MM-DD}.csv` and self-describing about which driver produced it. This is what the helper's docstring already prescribes ("the same string the orchestrator passes to `execute_pipeline_run()`"), and it is the reason the argument is passed explicitly instead of derived from `archive_directory.name`, which would collapse the two.

Beyond `scripts/unit_tests/housing_stress/output/test_finalize_dataset.py`, this commit also touches `scripts/unit_tests/orchestrators/test_housing_stress_backfill.py`, which mocks `backfill.archive_and_save` at line 73 and asserts the archived path at line 95. Both survive the import change, but the assertion should gain a companion check that the backfill passes `module_id="housing-stress-backfill"`, since that string is now what keeps the two archives apart.

### 4. `projections`

Call site `scripts/orchestrators/projections_pipeline.py:395`. The largest dataset, so this is where the hash-comparison path gets its real exercise. Confirm the no-op case still leaves mtime untouched.

### 5. `rhna_progress`

`write_dataset` keeps its name and its `new_snapshot` guard, but its body delegates to the shared helper with `already_compared=True`. This is the only module whose public interface stays as-is.

### 6. `components_of_change`

Last, and the only one that is a behavior change rather than a move. `archive_and_save` in `scripts/components_of_change/output/finalize_dataset.py` currently wraps `archive_or_delete_files` plus `write_components_output`; it becomes a call to the shared helper. Call site is `scripts/orchestrators/components_of_change_pipeline.py:214`.

`write_components_output` was checked and does only an atomic `.tmp` plus `replace()` write, with no module-specific work, so the shared helper replaces it exactly. Whether the function stays for other callers or is deleted is a judgement call at the time.

Keep the orchestrator's `if new_dof_data_found or new_census_data_found:` gate. It usefully skips the whole write path when acquisition found nothing; the shared helper's hash comparison then acts as the second line of defence for the case where a source republished identical data. The two guards answer different questions and both are worth having.

---

## Test Plan

### New tests, `scripts/unit_tests/shared/archives/test_dataset_archive.py`

| Test | What it verifies |
|---|---|
| `test_returns_none_and_touches_nothing_when_identical` | A no-op run leaves the file byte- and mtime-identical and writes no archive. |
| `test_archives_prior_version_when_data_changes` | Exactly one archive file appears, with the prior contents. |
| `test_archive_filename_uses_module_prefix_and_iso_date` | Name matches `{module}_{prefix}_{YYYY-MM-DD}.csv`. |
| `test_archive_copies_rather_than_moves` | The canonical path still exists immediately after the archive step. |
| `test_second_run_same_day_overwrites_archive_entry` | Documents the known collision rather than leaving it to be discovered. |
| `test_already_compared_skips_hash_and_always_archives` | The `rhna_progress` path. |
| `test_write_is_atomic_on_failure` | A raised exception mid-write leaves the original intact and no `.tmp` behind. |
| `test_creates_archive_directory_when_absent` | First run on a clean checkout. |

### Existing tests to update

`scripts/unit_tests/{building_permits,projections,housing_stress,components_of_change,rhna_progress}/output/test_finalize_dataset.py`. Most assert via `glob("*.csv")` and counts and will pass unchanged; the ones that assert names need the new format. Each module's tests are updated in that module's commit, never ahead of it.

### Verification per commit

```bash
python -m pytest scripts/unit_tests/shared/archives/ -q          # after step 1
python -m pytest scripts/unit_tests/<module>/ -q                 # after each module
ruff check .
python -m pytest                                                  # before the final commit
```

> [!warning] Green tests are not a working pipeline
> [[refractor-process]] records this as the single most repeated lesson of the project: every module's orchestrator tests mocked the file seams and passed while the real run crashed. The archive path is exactly such a seam. Each migrated module needs one real run against live sources, confirming an archive file actually appears with the new name, before the module is considered done.

---

## Sequencing

- [ ] Write `dataset_archive.py` and its tests. No callers touched.
- [ ] Migrate `building_permits`, update its tests, run the module suite.
- [ ] Migrate `housing_stress`, resolving the backfill call site question.
- [ ] Migrate `projections`, confirming no-op behavior on the large file.
- [ ] Migrate `rhna_progress` via `already_compared=True`.
- [ ] Migrate `components_of_change`, the copy-not-move change.
- [ ] Full `python -m pytest` and `ruff check .`.
- [ ] One live run per module, confirming archive filenames on disk.
- [ ] Delete `archive_or_delete_files` usage from the dataset write path if nothing else calls it.

---

## Resolved Decisions

| Decision | Resolution | Reasoning |
|---|---|---|
| Filename format | `{module}_{prefix}_{YYYY-MM-DD}.csv` | Self-identifying when moved off the drive; sorts chronologically in a listing. |
| Where `module_id` comes from | Explicit argument from the orchestrator | Avoids coupling the filename to directory layout, and matches the run record's module string exactly. |
| Comparison strategy | Streamed SHA-256 for all modules | Already the optimised form in two modules, with a recorded 189MB to 2MB improvement. |
| Copy or move | Always copy | A crash must never leave a module without a canonical CSV. |
| Hoist before rename | Yes | Five edit sites become one; the next format change costs a single line. |
| Keep the Components orchestrator gate | Yes | The source-acquisition flag and the byte hash answer different questions; both are worth having. |
| Same-day collision | Accepted for now | Manual monthly refreshes do not hit it, and the fix is one format string once hoisted. |

---

## Open Questions

**Does anything outside the repository read `ComponentsOfChange_Current_1.csv` by name?** The counter-suffix scheme disappears under the shared helper. A search across `.py`, `.js`, `.jsx`, and `.md` found the pattern only in `test_file_retention.py`, which exercises the generic uniquifier rather than this module, so nothing in the repository depends on it. The archive directory is gitignored, though, so a local script or a personal notebook could depend on it in a way the repository cannot show.
- Response: Not that I'm aware of.

**Should `housing_stress_backfill.py` archive at all?** It passes `paths["historical_data_path"]`, so it archives the *historical* seed rather than the live output. That file is described elsewhere in the project as immutable. Whether it should ever be archived, and under what name, is a question for whoever wrote the backfill.
- Response: Keep the archiving. It is the only rebuild-safety net for an irreplaceable artifact, the "immutable" label refers to the live pipeline rather than the backfill, and the archive directory already contains a version it saved. Pass module_id="housing-stress-backfill" at that call site so the seed archive and the live archive can't collide

**Should existing archive files be renamed?** The plan changes new files only. Existing archives keep their old names, so a directory will hold both conventions for a while and will not sort cleanly across the boundary. A one-off rename script is possible but has to run wherever the archives physically live, which under the manual-refresh setup is an external drive rather than the repository.
- Response: Right now there's no external drive, I'll add it in later so rename now.
