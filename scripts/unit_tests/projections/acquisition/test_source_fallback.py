from unittest.mock import Mock

import pandas as pd
import pytest

from scripts.projections.acquisition.source_fallback import acquire_with_fallback

LIVE_DF = pd.DataFrame({"Source": ["live"]})
MANUAL_DF = pd.DataFrame({"Source": ["manual"]})
SAVED_DF = pd.DataFrame({"Source": ["saved"]})


def _write_csv(path, dataframe):
    dataframe.to_csv(path, index=False)
    return path


"""
========================================================================================================================
Fallback Acquisition
========================================================================================================================

Live and manual strategies yield a raw file *path* (the cleaner reads it); only
the last-saved fallback returns an already-cleaned DataFrame.
"""


def test_acquire_with_fallback_first_live_strategy_wins(tmp_path):
    # Arrange
    live_path = _write_csv(tmp_path / "live.csv", LIVE_DF)
    first = Mock(return_value=live_path)
    second = Mock(side_effect=AssertionError("second strategy must not run"))
    saved_rows = Mock(return_value=SAVED_DF)

    # Act
    data, source_failed, used_manual = acquire_with_fallback(
        [first, second],
        tmp_path / "manual.csv",
        saved_rows,
        "DoF P-3",
    )

    # Assert
    assert data == live_path
    assert (source_failed, used_manual) == (False, False)
    second.assert_not_called()
    saved_rows.assert_not_called()


def test_acquire_with_fallback_uses_second_live_strategy(tmp_path):
    # Arrange
    live_path = _write_csv(tmp_path / "live.csv", LIVE_DF)
    first = Mock(side_effect=RuntimeError("primary discovery failed"))
    second = Mock(return_value=live_path)
    saved_rows = Mock(return_value=SAVED_DF)

    # Act
    data, source_failed, used_manual = acquire_with_fallback(
        [first, second],
        tmp_path / "manual.csv",
        saved_rows,
        "DoF P-3",
    )

    # Assert
    assert data == live_path
    assert (source_failed, used_manual) == (False, False)
    first.assert_called_once()
    second.assert_called_once()
    saved_rows.assert_not_called()


def test_acquire_with_fallback_uses_manual_file_after_live_failures(tmp_path):
    # Arrange
    manual_path = _write_csv(tmp_path / "manual.csv", MANUAL_DF)
    saved_rows = Mock(return_value=SAVED_DF)

    # Act
    data, source_failed, used_manual = acquire_with_fallback(
        [Mock(side_effect=RuntimeError("network unavailable"))],
        manual_path,
        saved_rows,
        "Census cc-est",
    )

    # Assert
    assert data == manual_path
    assert (source_failed, used_manual) == (False, True)
    saved_rows.assert_not_called()


def test_acquire_with_fallback_uses_saved_rows_as_last_resort(tmp_path):
    # Arrange
    saved_rows = Mock(return_value=SAVED_DF)

    # Act
    data, source_failed, used_manual = acquire_with_fallback(
        [Mock(side_effect=RuntimeError("network unavailable"))],
        tmp_path / "missing-manual.csv",
        saved_rows,
        "Census cc-est",
    )

    # Assert
    pd.testing.assert_frame_equal(data, SAVED_DF)
    assert (source_failed, used_manual) == (True, False)
    saved_rows.assert_called_once()


def test_acquire_with_fallback_skips_manual_file_after_live_success(tmp_path):
    # Arrange
    live_path = _write_csv(tmp_path / "live.csv", LIVE_DF)
    manual_path = _write_csv(tmp_path / "manual.csv", MANUAL_DF)
    saved_rows = Mock(return_value=SAVED_DF)

    # Act
    data, source_failed, used_manual = acquire_with_fallback(
        [Mock(return_value=live_path)],
        manual_path,
        saved_rows,
        "DoF P-3",
    )

    # Assert
    assert data == live_path
    assert (source_failed, used_manual) == (False, False)
    saved_rows.assert_not_called()


def test_acquire_with_fallback_reports_source_when_every_strategy_fails(tmp_path):
    # Arrange
    saved_rows = Mock(side_effect=RuntimeError("saved rows unavailable"))

    # Act / Assert
    with pytest.raises(RuntimeError, match="DoF P-3") as exc_info:
        acquire_with_fallback(
            [Mock(side_effect=RuntimeError("network unavailable"))],
            tmp_path / "missing-manual.csv",
            saved_rows,
            "DoF P-3",
        )
    assert isinstance(exc_info.value.__cause__, RuntimeError)
