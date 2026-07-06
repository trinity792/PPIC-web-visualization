"""
dataframe_logging.py — logs dataframe summaries and named data-quality results.

Data sources:
    - logger and pandas.DataFrame inputs — pipeline logging context and tabular records
    - quality-check metadata — check name, condition, and severity

Outputs:
    - log records — dataframe summaries and quality-check pass/fail results

Usage:
    python scripts/shared/logging/dataframe_logging.py

Test Folders:
    - scripts/unit_tests/shared/logging/
"""

import logging

"""
========================================================================================================================
Dataframe Logging
========================================================================================================================
"""


def log_dataframe_info(logger, dataframe, description):
    """Log a dataframe's shape, columns, and null counts under a description. Test file: scripts/unit_tests/shared/logging/test_dataframe_logging.py"""
    if logger is None:
        return

    rows, columns = dataframe.shape
    null_counts = {
        column: int(count)
        for column, count in dataframe.isnull().sum().items()
        if count
    }
    null_text = null_counts if null_counts else "none"
    logger.info(
        f"{description}: {rows} rows x {columns} cols; "
        f"columns={list(dataframe.columns)}; nulls={null_text}"
    )


def log_data_quality_check(logger, check_name, condition, level=logging.WARNING):
    """Log a named data-quality check, escalating to the given level on failure. Test file: scripts/unit_tests/shared/logging/test_dataframe_logging.py"""
    if logger is None:
        return

    if condition:
        logger.info(f"Data quality check passed: {check_name}")
    else:
        logger.log(level, f"Data quality check FAILED: {check_name}")
