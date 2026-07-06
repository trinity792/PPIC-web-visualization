import logging

import pandas as pd

from scripts.shared.logging.dataframe_logging import (
    log_data_quality_check,
    log_dataframe_info,
)


def test_log_dataframe_info_reports_shape_and_nulls(caplog):
    # Arrange
    frame = pd.DataFrame({"a": [1, None], "b": [3, 4]})
    logger = logging.getLogger("df-info")

    # Act
    with caplog.at_level(logging.INFO, logger="df-info"):
        log_dataframe_info(logger, frame, "cleaned frame")

    # Assert
    message = caplog.text
    assert "cleaned frame" in message
    assert "2 rows x 2 cols" in message
    assert "'a': 1" in message  # the one null in column a


def test_log_data_quality_check_pass_is_info(caplog):
    # Arrange
    logger = logging.getLogger("dq-pass")

    # Act
    with caplog.at_level(logging.INFO, logger="dq-pass"):
        log_data_quality_check(logger, "row count positive", True)

    # Assert
    assert caplog.records[-1].levelno == logging.INFO
    assert "passed" in caplog.text


def test_log_data_quality_check_failure_escalates(caplog):
    # Arrange
    logger = logging.getLogger("dq-fail")

    # Act
    with caplog.at_level(logging.WARNING, logger="dq-fail"):
        log_data_quality_check(logger, "no duplicates", False)

    # Assert
    assert caplog.records[-1].levelno == logging.WARNING
    assert "FAILED" in caplog.text


def test_dataframe_helpers_tolerate_none_logger():
    # Act / Assert — no exception when logging is disabled
    log_dataframe_info(None, pd.DataFrame(), "x")
    log_data_quality_check(None, "check", True)
