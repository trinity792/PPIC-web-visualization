"""
pipeline_logging.py — configures setup, access, shutdown, and progress helpers for pipeline logs.

Data sources:
    - script name, log directory, and log level — logging configuration
    - processing-step metadata — names, dataframe shapes, and detail fields

Outputs:
    - configured logger — file and console logging interface
    - {logs_dir}/{script_name}_pipeline.log — appended pipeline progress output

Usage:
    python scripts/shared/logging/pipeline_logging.py

Test Folders:
    - scripts/unit_tests/shared/logging/
"""

import logging
from pathlib import Path

LOG_FORMAT = "%(asctime)s %(name)s %(levelname)s %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S %Z"

"""
========================================================================================================================
Pipeline Logging
========================================================================================================================
"""


def setup_logging(script_name, logs_dir, log_level=logging.INFO):
    """Configure a file + console logger for a pipeline script. Test file: scripts/unit_tests/shared/logging/test_pipeline_logging.py"""
    logs_dir = Path(logs_dir)
    logs_dir.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger(script_name)
    logger.setLevel(log_level)
    # Do not double-emit through the root logger's handlers.
    logger.propagate = False

    # Guard against duplicate handlers when a script re-runs in one process.
    if logger.handlers:
        close_logging(logger)

    formatter = logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT)

    file_handler = logging.FileHandler(
        logs_dir / f"{script_name}_pipeline.log", encoding="utf-8"
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    return logger


def get_logger(script_name, logs_dir=None, log_level=logging.INFO):
    """Return a configured script logger, configuring it if a directory is given. Test file: scripts/unit_tests/shared/logging/test_pipeline_logging.py"""
    logger = logging.getLogger(script_name)
    if logs_dir is not None and not logger.handlers:
        return setup_logging(script_name, logs_dir, log_level)
    return logger


def close_logging(logger):
    """Flush, close, and detach a logger's handlers so repeated runs do not leak files. Test file: scripts/unit_tests/shared/logging/test_pipeline_logging.py"""
    if logger is None:
        return
    for handler in list(logger.handlers):
        handler.flush()
        handler.close()
        logger.removeHandler(handler)


def log_processing_step(logger, step_name, start_shape, end_shape, **details):
    """Log one processing-step summary with its row/column change and detail fields. Test file: scripts/unit_tests/shared/logging/test_pipeline_logging.py"""
    if logger is None:
        return

    def _shape_text(shape):
        if shape is None:
            return "?"
        rows, columns = shape
        return f"{rows} rows x {columns} cols"

    message = f"{step_name}: {_shape_text(start_shape)} -> {_shape_text(end_shape)}"
    if details:
        detail_text = ", ".join(f"{key}={value}" for key, value in details.items())
        message = f"{message} ({detail_text})"
    logger.info(message)
