"""
rename_legacy_archives.py — one-off migration of pre-existing archive filenames to the shared module-prefixed ISO format.

Not part of any pipeline. Run once against the repository-local archive (there is no external
drive yet) so every file in data/archive/ sorts correctly under the new
{module_id}_{prefix}_{YYYY-MM-DD}.csv convention introduced by dataset_archive.py. Full context:
docs/PPIC Summer 2026/refractor-guide/shared-archive-and-save-plan.md, Workstream E.

Data sources:
    - {archive_root}/{DIRECTORY}/*.csv — existing archived datasets under their legacy names

Outputs:
    - {archive_root}/{DIRECTORY}/{module_id}_{prefix}_{YYYY-MM-DD}.csv — same files, renamed in place
    - stdout — the planned (or applied) source -> destination mapping, one line per file

Usage:
    python -m scripts.shared.archives.rename_legacy_archives --archive-root data/archive
    python -m scripts.shared.archives.rename_legacy_archives --archive-root data/archive --execute

Test Folders:
    - scripts/unit_tests/shared/archives/
"""

import re
from collections import defaultdict
from dataclasses import dataclass, replace
from datetime import datetime
from pathlib import Path

from scripts.shared.archives.dataset_archive import build_archive_filename

# Three of six archive directories do not match their module id (see the refactor guide's
# table), so the mapping is written down literally rather than derived from
# archive_directory.name — deriving it would be wrong in half the cases and would collapse
# the two housing-stress writers onto one name.
_DIRECTORY_MODULE_IDS = {
    "building-permits": "building-permits",
    "demographic-projections": "projections",
    "RHNA-progress-report": "rhna-progress",
    "components-of-change": "components-of-change",
    "housing-population": "pophousing",
    # "housing-stress" is intentionally absent: it holds both writers' archives in one
    # directory, so its module id is resolved per-file below, not looked up here.
}

_HOUSING_STRESS_DIRECTORY = "housing-stress"

# Legacy dated names end in _mm-dd-yy.csv (building_permits/projections/rhna_progress/
# housing_stress all wrote this). Undated names (components_of_change, pophousing) have no
# such suffix and fall back to file mtime.
_DATED_SUFFIX_PATTERN = re.compile(r"^.+_(?P<month>\d{2})-(?P<day>\d{2})-(?P<year>\d{2})\.csv$")

# Already-migrated names look like {module_id}_{prefix}_{YYYY-MM-DD}.csv, optionally with the
# T{HHMMSS} suffix the collision pass below adds: a lowercase, hyphenated module id, then a
# PascalCase prefix, then a four-digit-year ISO date. Skip these so a second run of this one-off
# script is a no-op rather than a double rename. The optional T group is load-bearing — without
# it a disambiguated file is read as legacy on the next run and renamed again into garbage.
_NEW_FORMAT_PATTERN = re.compile(r"^[a-z][a-z0-9-]*_[A-Za-z0-9]+_\d{4}-\d{2}-\d{2}(T\d{6})?\.csv$")

# This project's archives only run from 2026 onward, so a two-digit year that parses (via the
# standard %y pivot) to anything earlier is not a real archive date — it is an unresolvable
# filename that should be rejected rather than guessed.
_EARLIEST_SUPPORTED_ARCHIVE_YEAR = 2020


"""
========================================================================================================================
Rename Plan
========================================================================================================================
"""


@dataclass(frozen=True)
class _PlannedRename:
    source: Path
    destination: Path
    module_id: str
    date_inferred_from_mtime: bool
    time_inferred_from_mtime: bool = False


def _module_id_for(directory_name, file_name):
    """Resolve the module id for one archived file. Test file: scripts/unit_tests/shared/archives/test_rename_legacy_archives.py"""
    if directory_name == _HOUSING_STRESS_DIRECTORY:
        # The only directory holding two writers' archives; the historical seed (backfill's
        # sole writer) must never collide with the live pipeline's archive (guide Workstream C).
        if file_name.startswith("HousingStress_Historical"):
            return "housing-stress-backfill"
        if file_name.startswith("HousingStress_Current"):
            return "housing-stress"
        raise ValueError(f"Cannot resolve a housing-stress module id for {file_name!r}; expected a HousingStress_Historical_* or HousingStress_Current_* name.")
    if directory_name not in _DIRECTORY_MODULE_IDS:
        raise ValueError(f"No module id mapping for archive directory {directory_name!r}.")
    return _DIRECTORY_MODULE_IDS[directory_name]


def _local_mtime(path):
    """
    Return the file's modification time as a local-clock datetime.

    Local, not UTC, so a date derived here matches one written by date.today() in
    dataset_archive.py. Reading mtime in UTC shifts anything modified after ~5pm Pacific onto
    the following day, which would date two of the real pophousing archives a day late.

    Note that on these files mtime is preserved from the source by shutil.copy2/shutil.move, so
    it records when a dataset version was written to the canonical path (its vintage) rather
    than when it was archived. That is the more meaningful of the two dates and is what makes
    the mtime fallback below sound rather than a guess.

    Test file: scripts/unit_tests/shared/archives/test_rename_legacy_archives.py
    """
    return datetime.fromtimestamp(path.stat().st_mtime)


def _resolve_date(path):
    """
    Resolve the archive date for one file: parsed from an mm-dd-yy suffix when present, else mtime.

    Returns:
        (datetime.date, bool) — the resolved date, and whether it was inferred from mtime
        (as opposed to parsed from the filename). An inferred date is weaker evidence than a
        parsed one, so the caller reports the difference.

    Raises:
        ValueError — the filename carries a two-digit year that cannot be resolved
        unambiguously (parses before the supported archive era).

    Test file: scripts/unit_tests/shared/archives/test_rename_legacy_archives.py
    """
    match = _DATED_SUFFIX_PATTERN.match(path.name)
    if match is None:
        return _local_mtime(path).date(), True

    two_digit_year = match["year"]
    parsed = datetime.strptime(f"{match['month']}-{match['day']}-{two_digit_year}", "%m-%d-%y").date()
    if parsed.year < _EARLIEST_SUPPORTED_ARCHIVE_YEAR:
        raise ValueError(
            f"{path.name}: two-digit year '{two_digit_year}' cannot be resolved unambiguously "
            f"(parsed as {parsed.year}, before this project's archive era); refusing to guess."
        )
    return parsed, False


def _archive_directories(archive_root):
    """
    Yield subdirectories of archive_root that hold at least one CSV.

    Unmapped directories are yielded rather than filtered out, so _module_id_for raises on them
    and an archive directory nobody added to _DIRECTORY_MODULE_IDS stops the run instead of
    being silently skipped. Directories with no CSVs are skipped without comment, because an
    empty RHNA-progress-report/ is a normal state and not something to report.

    Test file: scripts/unit_tests/shared/archives/test_rename_legacy_archives.py
    """
    for entry in sorted(archive_root.iterdir()):
        if entry.is_dir() and any(entry.glob("*.csv")):
            yield entry


def _disambiguate_same_day_collisions(plan):
    """
    Re-plan any group of files that collide on one destination, adding a T{HHMMSS} suffix.

    Day granularity collapses archives written minutes apart; data/archive/components-of-change/
    holds two from 2026-07-01, 78 seconds apart. Colliding entries are rebuilt with their local
    mtime time-of-day, regardless of whether the date itself came from the filename or from
    mtime, so the rule is the same for every collision. Files that do not collide keep the plain
    readable date. Anything this pass cannot separate (same date *and* same whole-second mtime)
    falls through to _validate_plan, which refuses the run.

    Test file: scripts/unit_tests/shared/archives/test_rename_legacy_archives.py
    """
    grouped = defaultdict(list)
    for item in plan:
        grouped[item.destination].append(item)

    disambiguated = []
    for items in grouped.values():
        if len(items) == 1:
            disambiguated.append(items[0])
            continue
        for item in items:
            mtime = _local_mtime(item.source)
            filename = build_archive_filename(item.module_id, item.source, mtime.date(), mtime.time())
            disambiguated.append(
                replace(
                    item,
                    destination=item.destination.with_name(filename),
                    time_inferred_from_mtime=True,
                )
            )
    return sorted(disambiguated, key=lambda item: item.source)


def _build_rename_plan(archive_root):
    """Compute every planned source -> destination rename under archive_root. Test file: scripts/unit_tests/shared/archives/test_rename_legacy_archives.py"""
    plan = []
    for directory in _archive_directories(archive_root):
        for source_path in sorted(directory.glob("*.csv")):
            if _NEW_FORMAT_PATTERN.match(source_path.name):
                # Already migrated; a second run of this script must be a no-op for it.
                continue
            module_id = _module_id_for(directory.name, source_path.name)
            resolved_date, date_inferred_from_mtime = _resolve_date(source_path)
            filename = build_archive_filename(module_id, source_path, resolved_date)
            plan.append(_PlannedRename(source_path, directory / filename, module_id, date_inferred_from_mtime))
    return _disambiguate_same_day_collisions(plan)


def _validate_plan(plan):
    """
    Refuse to rename anything if two planned sources collide, or a destination already exists.

    Raises:
        ValueError — two source files in this run would both rename to the same destination.
        FileExistsError — a planned destination is already occupied by a file outside this run.

    Test file: scripts/unit_tests/shared/archives/test_rename_legacy_archives.py
    """
    planned_by_destination = {}
    for item in plan:
        collision = planned_by_destination.get(item.destination)
        if collision is not None:
            raise ValueError(f"Two source files would both rename to {item.destination.name!r}: {collision.source.name!r} and {item.source.name!r}. Refusing to rename either.")
        planned_by_destination[item.destination] = item

    for item in plan:
        if item.destination.exists():
            raise FileExistsError(f"Refusing to overwrite existing archive file {item.destination}.")


def _print_plan(plan, applied):
    """Print the source -> destination mapping, flagging anything inferred from file mtime."""
    verb = "Renamed" if applied else "Would rename"
    for item in plan:
        inferred = []
        if item.date_inferred_from_mtime:
            inferred.append("date")
        if item.time_inferred_from_mtime:
            inferred.append("time")
        note = f" ({' and '.join(inferred)} inferred from file mtime)" if inferred else ""
        print(f"  {verb}: {item.source.name} -> {item.destination.name}{note}")


"""
========================================================================================================================
Migration Entry Point
========================================================================================================================
"""


def rename_legacy_archives(archive_root, dry_run=True):
    """
    Rename every legacy-format archive file under archive_root to the shared module-prefixed name.

    File *contents* are never touched — only Path.rename() is used, never a copy-then-delete,
    so a bug here costs a name, not data. Validates the full plan (no destination collisions,
    no overwriting an existing file) before renaming anything, so a bad plan changes nothing.

    Args:
        archive_root: directory containing one subdirectory per module's archive.
        dry_run: when True (the default, so an accidental invocation is inert), print the
            planned mapping and rename nothing.

    Returns:
        list of the planned renames (whether or not dry_run applied them).

    Test file: scripts/unit_tests/shared/archives/test_rename_legacy_archives.py
    """
    archive_root = Path(archive_root)
    plan = _build_rename_plan(archive_root)
    _validate_plan(plan)

    if dry_run:
        _print_plan(plan, applied=False)
        print(f"Dry run: {len(plan)} file(s) would be renamed. Pass dry_run=False (or --execute) to apply.")
        return plan

    for item in plan:
        item.source.rename(item.destination)
    _print_plan(plan, applied=True)
    print(f"Renamed {len(plan)} file(s).")
    return plan


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    from lib.config import get_project_paths

    parser = argparse.ArgumentParser(description="Rename legacy archive filenames to the shared module-prefixed ISO format")
    parser.add_argument(
        "--archive-root",
        default=None,
        help="Directory holding one subdirectory per module's archive (default: data/archive)",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually rename files. Without this flag, the mapping is printed and nothing is renamed.",
    )
    args = parser.parse_args()

    root = Path(args.archive_root) if args.archive_root else get_project_paths()["archive_directory"]
    rename_legacy_archives(root, dry_run=not args.execute)
