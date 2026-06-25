"""
source_fallback.py — applies Components acquisition fallback from live source to manual CSV to last-saved data.

Data sources:
    - scrape_fns — ordered callables that return raw source dataframes
    - {manual_path}.csv — optional manually downloaded fallback
    - last_saved_loader — callable that returns saved canonical rows for a source

Outputs:
    - tuple[pandas.DataFrame, bool, bool] — data, source_failed flag, used_manual flag

Usage:
    python scripts/components_of_change/acquisition/source_fallback.py

Test Folders:
    - scripts/unit_tests/components_of_change/acquisition/
"""

import pandas as pd

"""
========================================================================================================================
Fallback Acquisition
========================================================================================================================
"""


def acquire_with_fallback(scrape_fns, manual_path, last_saved_loader, manual_read_kwargs=None):
    """Return data from the first successful live/manual/last-saved source. Test file: scripts/unit_tests/components_of_change/acquisition/test_source_fallback.py"""
    errors = []
    for scrape_fn in scrape_fns:
        try:
            return scrape_fn(), False, False
        except Exception as error:
            errors.append(error)

    manual_read_kwargs = manual_read_kwargs or {}
    if manual_path is not None:
        try:
            return pd.read_csv(manual_path, **manual_read_kwargs), False, True
        except FileNotFoundError as error:
            errors.append(error)
        except Exception as error:
            errors.append(error)

    try:
        return last_saved_loader(), True, False
    except Exception as error:
        fallback_error = RuntimeError("All source acquisition fallbacks failed")
        for prior_error in errors:
            fallback_error.add_note(str(prior_error))
        raise fallback_error from error
