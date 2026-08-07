"""Executable contract for the shared conditional dataset writer.

Every module that writes a canonical dataset delegates to archive_and_save, so the
behaviors pinned here (no-op on identical bytes, copy rather than move, atomic write)
are the ones protecting six modules' contract files at once.
"""

from datetime import date, time
from pathlib import Path

import pandas as pd
import pytest

from scripts.shared.archives.dataset_archive import (
    archive_and_save as shared_archive_and_save_function,
)
from scripts.shared.archives.dataset_archive import (
    build_archive_filename as shared_build_archive_filename,
)


@pytest.fixture
def archive_api():
    return shared_archive_and_save_function, shared_build_archive_filename


def _frame(value):
    return pd.DataFrame(
        [{"Location": "California", "Year": 2026, "Value": value}]
    )


def _write_current(path, dataframe):
    path.parent.mkdir(parents=True, exist_ok=True)
    dataframe.to_csv(path, index=False)


def test_returns_none_and_touches_nothing_when_data_is_identical(
    tmp_path,
    archive_api,
):
    archive_and_save, _ = archive_api
    current_path = tmp_path / "HousingStress_Current.csv"
    archive_directory = tmp_path / "archive"
    dataframe = _frame(10)
    _write_current(current_path, dataframe)
    original_bytes = current_path.read_bytes()
    fixed_timestamp = 1_700_000_000_123_456_789
    current_path.touch()
    # Pin nanoseconds so a rewrite of identical bytes cannot pass by chance on a
    # coarse or very fast filesystem.
    import os

    os.utime(current_path, ns=(fixed_timestamp, fixed_timestamp))

    result = archive_and_save(
        dataframe,
        current_path,
        archive_directory,
        module_id="housing-stress",
    )

    assert result is None
    assert current_path.read_bytes() == original_bytes
    assert current_path.stat().st_mtime_ns == fixed_timestamp
    assert not archive_directory.exists()


def test_identical_comparison_streams_the_existing_file_instead_of_reading_it_whole(
    tmp_path,
    archive_api,
    monkeypatch,
):
    archive_and_save, _ = archive_api
    current_path = tmp_path / "DemographicProjections_Current.csv"
    dataframe = _frame(10)
    _write_current(current_path, dataframe)

    def fail_whole_file_read(*_args, **_kwargs):
        raise AssertionError("the canonical CSV must be hashed as a stream")

    monkeypatch.setattr(Path, "read_bytes", fail_whole_file_read)
    monkeypatch.setattr(Path, "read_text", fail_whole_file_read)

    result = archive_and_save(
        dataframe,
        current_path,
        tmp_path / "archive",
        module_id="projections",
    )

    assert result is None


def test_archives_the_prior_version_when_data_changes(
    tmp_path,
    archive_api,
    frozen_archive_clock,
):
    archive_and_save, _ = archive_api
    current_path = tmp_path / "BuildingPermits_Current.csv"
    archive_directory = tmp_path / "archive"
    prior = _frame(10)
    replacement = _frame(20)
    _write_current(current_path, prior)

    result = archive_and_save(
        replacement,
        current_path,
        archive_directory,
        module_id="building-permits",
    )

    assert result == current_path
    archives = list(archive_directory.glob("*.csv"))
    assert len(archives) == 1
    pd.testing.assert_frame_equal(pd.read_csv(archives[0]), prior)
    pd.testing.assert_frame_equal(pd.read_csv(current_path), replacement)


def test_archive_filename_uses_the_module_prefix_and_an_iso_date(archive_api):
    _, build_archive_filename = archive_api

    result = build_archive_filename(
        "building-permits",
        Path("BuildingPermits_Current.csv"),
        date(2026, 8, 7),
    )

    assert result == "building-permits_BuildingPermits_2026-08-07.csv"


def test_archive_filename_appends_a_time_component_when_one_is_given(archive_api):
    _, build_archive_filename = archive_api

    result = build_archive_filename(
        "components-of-change",
        Path("ComponentsOfChange_Current.csv"),
        date(2026, 7, 1),
        time(15, 56, 38),
    )

    assert result == "components-of-change_ComponentsOfChange_2026-07-01T155638.csv"


def test_archive_filename_omits_the_time_component_by_default(archive_api):
    # Guards the live format: the collision escape hatch must not leak into the
    # three-argument call that archive_and_save makes.
    _, build_archive_filename = archive_api

    result = build_archive_filename(
        "components-of-change",
        Path("ComponentsOfChange_Current.csv"),
        date(2026, 7, 1),
    )

    assert result == "components-of-change_ComponentsOfChange_2026-07-01.csv"


def test_archive_prefix_drops_everything_after_the_first_underscore(archive_api):
    _, build_archive_filename = archive_api

    result = build_archive_filename(
        "housing-stress",
        Path("HousingStress_Current_revised.csv"),
        date(2026, 8, 7),
    )

    assert result == "housing-stress_HousingStress_2026-08-07.csv"


def test_copies_rather_than_moves_the_prior_version(
    tmp_path,
    archive_api,
    frozen_archive_clock,
    monkeypatch,
):
    archive_and_save, _ = archive_api
    current_path = tmp_path / "ComponentsOfChange_Current.csv"
    archive_directory = tmp_path / "archive"
    prior = _frame(10)
    _write_current(current_path, prior)
    original_replace = Path.replace
    observed_before_swap = []

    def inspect_before_swap(temporary_path, target_path):
        observed_before_swap.append(
            (
                current_path.is_file(),
                current_path.read_bytes(),
                list(archive_directory.glob("*.csv")),
            )
        )
        return original_replace(temporary_path, target_path)

    monkeypatch.setattr(Path, "replace", inspect_before_swap)

    archive_and_save(
        _frame(20),
        current_path,
        archive_directory,
        module_id="components-of-change",
    )

    assert len(observed_before_swap) == 1
    canonical_existed, canonical_bytes, archives = observed_before_swap[0]
    assert canonical_existed is True
    assert canonical_bytes == prior.to_csv(index=False).encode("utf-8")
    assert len(archives) == 1
    assert archives[0].read_bytes() == canonical_bytes


def test_a_second_run_on_the_same_day_overwrites_the_existing_archive_entry(
    tmp_path,
    archive_api,
    frozen_archive_clock,
):
    archive_and_save, _ = archive_api
    current_path = tmp_path / "BuildingPermits_Current.csv"
    archive_directory = tmp_path / "archive"
    first = _frame(10)
    second = _frame(20)
    third = _frame(30)
    _write_current(current_path, first)

    archive_and_save(
        second,
        current_path,
        archive_directory,
        module_id="building-permits",
    )
    archive_and_save(
        third,
        current_path,
        archive_directory,
        module_id="building-permits",
    )

    archives = list(archive_directory.glob("*.csv"))
    assert [path.name for path in archives] == [
        "building-permits_BuildingPermits_2026-08-07.csv"
    ]
    pd.testing.assert_frame_equal(pd.read_csv(archives[0]), second)
    pd.testing.assert_frame_equal(pd.read_csv(current_path), third)


def test_already_compared_skips_the_hash_and_always_archives(
    tmp_path,
    archive_api,
    frozen_archive_clock,
):
    archive_and_save, _ = archive_api
    current_path = tmp_path / "RHNAProgress_Current.csv"
    archive_directory = tmp_path / "archive"
    dataframe = _frame(10)
    _write_current(current_path, dataframe)

    result = archive_and_save(
        dataframe,
        current_path,
        archive_directory,
        module_id="rhna-progress",
        already_compared=True,
    )

    assert result == current_path
    assert [path.name for path in archive_directory.glob("*.csv")] == [
        "rhna-progress_RHNAProgress_2026-08-07.csv"
    ]
    pd.testing.assert_frame_equal(pd.read_csv(current_path), dataframe)


def test_already_compared_defaults_to_false(tmp_path, archive_api):
    archive_and_save, _ = archive_api
    current_path = tmp_path / "RHNAProgress_Current.csv"
    dataframe = _frame(10)
    _write_current(current_path, dataframe)

    result = archive_and_save(
        dataframe,
        current_path,
        tmp_path / "archive",
        module_id="rhna-progress",
    )

    assert result is None
    assert not (tmp_path / "archive").exists()


def test_leaves_original_intact_and_no_temp_file_when_the_write_raises(
    tmp_path,
    archive_api,
    frozen_archive_clock,
    monkeypatch,
):
    archive_and_save, _ = archive_api
    current_path = tmp_path / "PopHousing_Current.csv"
    archive_directory = tmp_path / "archive"
    prior = _frame(10)
    _write_current(current_path, prior)
    prior_bytes = current_path.read_bytes()

    def fail_replace(_temporary_path, _target_path):
        raise OSError("disk full during atomic replace")

    monkeypatch.setattr(Path, "replace", fail_replace)

    with pytest.raises(OSError, match="disk full"):
        archive_and_save(
            _frame(20),
            current_path,
            archive_directory,
            module_id="pophousing",
        )

    assert current_path.read_bytes() == prior_bytes
    assert list(tmp_path.glob("*.tmp")) == []


def test_creates_the_archive_directory_when_it_does_not_exist(
    tmp_path,
    archive_api,
    frozen_archive_clock,
):
    archive_and_save, _ = archive_api
    current_path = tmp_path / "HousingStress_Current.csv"
    archive_directory = tmp_path / "nested" / "archive"
    _write_current(current_path, _frame(10))
    assert not archive_directory.exists()

    archive_and_save(
        _frame(20),
        current_path,
        archive_directory,
        module_id="housing-stress",
    )

    assert archive_directory.is_dir()
    assert len(list(archive_directory.glob("*.csv"))) == 1


def test_writes_without_archiving_when_no_canonical_file_exists(
    tmp_path,
    archive_api,
):
    archive_and_save, _ = archive_api
    current_path = tmp_path / "cleaned" / "PopHousing_Current.csv"
    archive_directory = tmp_path / "archive"

    result = archive_and_save(
        _frame(10),
        current_path,
        archive_directory,
        module_id="pophousing",
    )

    assert result == current_path
    assert current_path.is_file()
    assert not archive_directory.exists()


def test_does_not_mutate_the_dataframe_it_is_given(tmp_path, archive_api):
    archive_and_save, _ = archive_api
    dataframe = _frame(10)
    original = dataframe.copy(deep=True)

    archive_and_save(
        dataframe,
        tmp_path / "BuildingPermits_Current.csv",
        tmp_path / "archive",
        module_id="building-permits",
    )

    pd.testing.assert_frame_equal(dataframe, original)


def test_two_module_ids_writing_the_same_prefix_produce_distinct_archive_names(
    tmp_path,
    archive_api,
    frozen_archive_clock,
):
    archive_and_save, _ = archive_api
    current_path = tmp_path / "HousingStress_Historical.csv"
    archive_directory = tmp_path / "archive"
    _write_current(current_path, _frame(10))

    archive_and_save(
        _frame(20),
        current_path,
        archive_directory,
        module_id="housing-stress",
    )
    archive_and_save(
        _frame(30),
        current_path,
        archive_directory,
        module_id="housing-stress-backfill",
    )

    assert sorted(path.name for path in archive_directory.glob("*.csv")) == [
        "housing-stress-backfill_HousingStress_2026-08-07.csv",
        "housing-stress_HousingStress_2026-08-07.csv",
    ]
