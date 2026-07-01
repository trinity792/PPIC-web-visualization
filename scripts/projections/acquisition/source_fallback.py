"""
source_fallback.py — resilient acquisition coordinator for Demographic Projections sources.

Data sources:
    - dof_p3_downloader.py — live DoF P-3 strategies
    - census_ccest_downloader.py — live Census cc-est strategies
    - data/data-raw/demographic-projections/{FILENAME} — optional manual fallback files
    - data/data-cleaned/demographic-projections/DemographicProjections_Current.csv — last-saved rows

Outputs:
    - pathlib.Path or pandas.DataFrame — the raw file path from the best available
      live/manual source, or already-cleaned last-saved rows when acquisition failed
    - bool — whether acquisition failed (fell back to last-saved rows)
    - bool — whether a manual file was used

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/acquisition/
"""

from pathlib import Path

"""
========================================================================================================================
Fallback Acquisition
========================================================================================================================
"""


def acquire_with_fallback(live_strategies, manual_path, saved_rows_fn, source_name):
    """Try each live acquisition strategy in order, then a manual CSV, then last-saved rows. Test file: scripts/unit_tests/projections/acquisition/test_source_fallback.py

    Live and manual strategies yield a raw file *path* the cleaner will read;
    only the last-saved fallback returns an already-cleaned DataFrame (paired
    with source_failed=True so the caller skips cleaning it).
    """
    errors = []

    for strategy in live_strategies:
        try:
            return strategy(), False, False
        except Exception as error:
            errors.append(error)

    manual_path = Path(manual_path)
    if manual_path.is_file():
        return manual_path, False, True

    try:
        return saved_rows_fn(), True, False
    except Exception as error:
        fallback_error = RuntimeError(f"All acquisition strategies failed for {source_name}")
        for prior_error in errors:
            fallback_error.add_note(str(prior_error))
        raise fallback_error from error
