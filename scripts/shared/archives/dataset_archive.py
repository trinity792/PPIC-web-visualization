"""
dataset_archive.py — shared conditional archive-and-save for module dataset write paths.

Collapses the six module-local archive-and-write implementations (building_permits,
projections, rhna_progress, housing_stress, components_of_change, pophousing) into one
mechanism, per docs/PPIC Summer 2026/refractor-guide/shared-archive-and-save-plan.md.

Data sources:
    - pandas.DataFrame — the prepared output frame, already through the module's prepare_output
    - {current_path} — canonical CSV path, compared against the new frame

Outputs:
    - {current_path} — updated canonical dataset, written atomically (when data changed)
    - {archive_directory}/{module_id}_{prefix}_{YYYY-MM-DD}.csv — archived prior output (when data changed)

Usage:
    Imported by module output writers and pipeline orchestrators; not run standalone.

Test Folders:
    - scripts/unit_tests/shared/archives/
"""

import hashlib
import shutil
from datetime import date
from pathlib import Path

_HASH_CHUNK_BYTES = 1 << 20  # 1 MiB streaming reads for the byte-identity check


"""
========================================================================================================================
Archive Filename
========================================================================================================================
"""


def build_archive_filename(module_id, current_path, today, time_of_day=None):
    """
    Build the archive filename {module_id}_{prefix}_{YYYY-MM-DD}.csv.

    prefix is current_path.stem.split("_")[0] — the rule building_permits already used, kept
    as the single source of truth here. Two source files with the same prefix (for example
    HousingStress_Current.csv and HousingStress_Historical.csv, both prefixed "HousingStress")
    only stay apart in the archive because their callers pass distinct module_id values; this
    function does not itself guard against that collision.

    Day granularity is deliberate for live writes: two refreshes of one module on the same day
    produce the same name and the second overwrites the first, which is accepted while refreshes
    are manual and roughly monthly. archive_and_save therefore never passes time_of_day. The
    parameter exists for the one-off rename_legacy_archives migration, which has to separate
    pre-existing archives written minutes apart (data/archive/components-of-change/ holds two
    from 2026-07-01, 78 seconds apart). Building the escape hatch is not opting into it.

    Args:
        module_id: string identifying the writer, e.g. "building-permits".
        current_path: canonical CSV path (or any path sharing its naming scheme) whose stem
            supplies the prefix.
        today: a date-like object; only its isoformat() is used.
        time_of_day: optional time-like object. When given, the name gains a T{HHMMSS} suffix
            ({module_id}_{prefix}_{YYYY-MM-DD}T{HHMMSS}.csv) so same-day archives stay distinct
            and still sort chronologically as plain strings.

    Returns:
        str — the archive filename, with no directory component.

    Test file: scripts/unit_tests/shared/archives/test_dataset_archive.py
    """
    current_path = Path(current_path)
    prefix = current_path.stem.split("_")[0]
    stamp = today.isoformat()
    if time_of_day is not None:
        stamp = f"{stamp}T{time_of_day.strftime('%H%M%S')}"
    return f"{module_id}_{prefix}_{stamp}.csv"


"""
========================================================================================================================
Conditional Archival
========================================================================================================================
"""


def archive_and_save(dataframe, current_path, archive_directory, module_id, already_compared=False):
    """
    Save only when the data changed; archive the prior version under the module-prefixed ISO name.

    Compares the prepared frame's encoded bytes against a streamed SHA-256 of the existing file
    (never holding a second full-file copy in memory) and returns None on a match, leaving the
    existing file byte- and mtime-identical. Otherwise the existing file is copied — never
    moved — into archive_directory, and the new data is written atomically: staged to a sibling
    .tmp file, then replace()'d into place. The canonical CSV therefore exists and is valid at
    every instant, including while the archive copy is being made and if the write later fails.

    Args:
        dataframe: the prepared output frame.
        current_path: canonical CSV path.
        archive_directory: directory the prior version is archived into.
        module_id: the same string the orchestrator passes to execute_pipeline_run(); prefixes
            the archive filename so two writers sharing a filename prefix cannot collide.
        already_compared: when True, skip the hash comparison and always archive + write. Used
            by rhna_progress, whose caller has already established the data is new.

    Returns:
        pathlib.Path or None — the output path if written, None if skipped.

    Test file: scripts/unit_tests/shared/archives/test_dataset_archive.py
    """
    current_path = Path(current_path)
    archive_directory = Path(archive_directory)
    new_bytes = dataframe.to_csv(index=False).encode("utf-8")

    if current_path.is_file():
        if not already_compared and _sha256_of_file(current_path) == hashlib.sha256(new_bytes).hexdigest():
            return None
        archive_directory.mkdir(parents=True, exist_ok=True)
        archive_filename = build_archive_filename(module_id, current_path, date.today())
        # Copy, never move: the canonical CSV must exist and be valid at every
        # instant, including while this archive copy is being made.
        shutil.copy2(current_path, archive_directory / archive_filename)

    current_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = current_path.with_name(f"{current_path.name}.tmp")
    try:
        temporary_path.write_bytes(new_bytes)
        temporary_path.replace(current_path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()
    return current_path


def _sha256_of_file(path):
    """Return the SHA-256 hex digest of a file read in fixed-size chunks. Test file: scripts/unit_tests/shared/archives/test_dataset_archive.py"""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(_HASH_CHUNK_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()
