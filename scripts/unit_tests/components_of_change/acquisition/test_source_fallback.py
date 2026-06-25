from unittest.mock import Mock

import pandas as pd
import pytest

from scripts.components_of_change.acquisition.source_fallback import acquire_with_fallback

LIVE_DF = pd.DataFrame({"Source": ["live"]})
MANUAL_DF = pd.DataFrame({"Source": ["manual"]})
SAVED_DF = pd.DataFrame({"Source": ["saved"]})


def _write_manual_csv(tmp_path):
    path = tmp_path / "manual.csv"
    MANUAL_DF.to_csv(path, index=False)
    return path


"""
========================================================================================================================
acquire_with_fallback
========================================================================================================================
"""


def test_first_scrape_success_returns_live_data():
    # Act
    data, source_failed, used_manual = acquire_with_fallback(
        [Mock(return_value=LIVE_DF)], None, Mock(return_value=SAVED_DF)
    )

    # Assert
    pd.testing.assert_frame_equal(data, LIVE_DF)
    assert source_failed is False
    assert used_manual is False


def test_falls_through_to_second_scrape(tmp_path):
    # Arrange
    first = Mock(side_effect=RuntimeError("scrape failed"))
    second = Mock(return_value=LIVE_DF)
    last_saved = Mock(return_value=SAVED_DF)

    # Act
    data, source_failed, used_manual = acquire_with_fallback(
        [first, second], _write_manual_csv(tmp_path), last_saved
    )

    # Assert
    pd.testing.assert_frame_equal(data, LIVE_DF)
    assert (source_failed, used_manual) == (False, False)
    last_saved.assert_not_called()


def test_falls_back_to_manual_csv(tmp_path):
    # Arrange
    manual_path = _write_manual_csv(tmp_path)
    last_saved = Mock(return_value=SAVED_DF)

    # Act
    data, source_failed, used_manual = acquire_with_fallback(
        [Mock(side_effect=RuntimeError("down"))], manual_path, last_saved
    )

    # Assert
    pd.testing.assert_frame_equal(data, MANUAL_DF)
    assert (source_failed, used_manual) == (False, True)
    last_saved.assert_not_called()


def test_passes_manual_read_kwargs(tmp_path):
    # Arrange: a latin1/python-engine CSV still loads when kwargs are forwarded.
    manual_path = tmp_path / "manual.csv"
    MANUAL_DF.to_csv(manual_path, index=False)

    # Act
    data, _, used_manual = acquire_with_fallback(
        [Mock(side_effect=RuntimeError("down"))],
        manual_path,
        Mock(return_value=SAVED_DF),
        manual_read_kwargs={"engine": "python", "encoding": "latin1"},
    )

    # Assert
    assert used_manual is True
    pd.testing.assert_frame_equal(data, MANUAL_DF)


def test_falls_back_to_last_saved_when_manual_missing(tmp_path):
    # Arrange: manual path does not exist, so last-saved data is used.
    last_saved = Mock(return_value=SAVED_DF)

    # Act
    data, source_failed, used_manual = acquire_with_fallback(
        [Mock(side_effect=RuntimeError("down"))], tmp_path / "missing.csv", last_saved
    )

    # Assert
    pd.testing.assert_frame_equal(data, SAVED_DF)
    assert (source_failed, used_manual) == (True, False)


def test_skips_manual_when_path_is_none():
    # Arrange
    last_saved = Mock(return_value=SAVED_DF)

    # Act
    data, source_failed, used_manual = acquire_with_fallback(
        [Mock(side_effect=RuntimeError("down"))], None, last_saved
    )

    # Assert
    pd.testing.assert_frame_equal(data, SAVED_DF)
    assert (source_failed, used_manual) == (True, False)


def test_all_fallbacks_failing_raises_with_notes(tmp_path):
    # Arrange: every layer fails; prior scrape errors are attached as notes.
    scrape = Mock(side_effect=RuntimeError("scrape boom"))
    last_saved = Mock(side_effect=RuntimeError("saved boom"))

    # Act / Assert
    with pytest.raises(RuntimeError, match="All source acquisition fallbacks failed") as exc_info:
        acquire_with_fallback([scrape], tmp_path / "missing.csv", last_saved)
    notes = getattr(exc_info.value, "__notes__", [])
    assert any("scrape boom" in note for note in notes)
    assert isinstance(exc_info.value.__cause__, RuntimeError)
