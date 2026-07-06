import logging

import pandas as pd

from scripts.shared.logging.pipeline_logging import (
    close_logging,
    get_logger,
    log_processing_step,
    setup_logging,
)


def test_setup_logging_creates_log_file_and_handlers(tmp_path):
    # Arrange / Act
    logger = setup_logging("demo", tmp_path)
    logger.info("hello")
    close_logging(logger)

    # Assert
    log_file = tmp_path / "demo_pipeline.log"
    assert log_file.is_file()
    assert "hello" in log_file.read_text(encoding="utf-8")


def test_setup_logging_does_not_duplicate_handlers_on_reentry(tmp_path):
    # Arrange / Act
    logger = setup_logging("dupe", tmp_path)
    logger = setup_logging("dupe", tmp_path)

    # Assert — file + console handler only, not four
    assert len(logger.handlers) == 2
    close_logging(logger)


def test_close_logging_removes_all_handlers(tmp_path):
    # Arrange
    logger = setup_logging("closeme", tmp_path)

    # Act
    close_logging(logger)

    # Assert
    assert logger.handlers == []


def test_get_logger_configures_when_directory_given(tmp_path):
    # Arrange / Act
    logger = get_logger("accessor", tmp_path)

    # Assert
    assert logger.handlers
    close_logging(logger)


def test_log_processing_step_writes_shape_delta(tmp_path):
    # Arrange
    logger = setup_logging("steps", tmp_path)
    frame = pd.DataFrame({"a": [1, 2]})

    # Act
    log_processing_step(logger, "Phase 3", frame.shape, frame.shape, rows_dropped=0)
    close_logging(logger)

    # Assert
    contents = (tmp_path / "steps_pipeline.log").read_text(encoding="utf-8")
    assert "Phase 3" in contents
    assert "2 rows x 1 cols" in contents
    assert "rows_dropped=0" in contents


def test_logging_helpers_tolerate_none_logger():
    # Act / Assert — no exception when logging is disabled
    log_processing_step(None, "Phase 1", None, None)
    close_logging(None)


def test_log_level_is_respected(tmp_path):
    # Arrange
    logger = setup_logging("leveled", tmp_path, log_level=logging.WARNING)

    # Assert
    assert logger.level == logging.WARNING
    close_logging(logger)
