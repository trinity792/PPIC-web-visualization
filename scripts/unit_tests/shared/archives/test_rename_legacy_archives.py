"""Contract tests for the one-off legacy archive filename migration."""

import os
from datetime import datetime
from pathlib import Path

import pytest

from scripts.shared.archives.rename_legacy_archives import rename_legacy_archives


@pytest.fixture
def renamer():
    return rename_legacy_archives


def _legacy_file(archive_root, directory, name, content=b"unchanged"):
    path = archive_root / directory / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


def _set_mtime(path, year, month, day, hour=12, minute=0, second=0):
    # Local clock, matching what the script reads. Using UTC here would make the
    # fixture disagree with the expected filename on any machine west of Greenwich.
    timestamp = datetime(year, month, day, hour, minute, second).timestamp()
    os.utime(path, (timestamp, timestamp))


def test_converts_mm_dd_yy_name_to_module_prefixed_iso_name(
    tmp_path,
    renamer,
):
    archive_root = tmp_path / "archive"
    source = _legacy_file(
        archive_root,
        "building-permits",
        "BuildingPermits_07-03-26.csv",
    )

    renamer(archive_root, dry_run=False)

    destination = source.with_name(
        "building-permits_BuildingPermits_2026-07-03.csv"
    )
    assert not source.exists()
    assert destination.is_file()


@pytest.mark.parametrize(
    ("directory", "legacy_name", "expected_name"),
    [
        (
            "demographic-projections",
            "DemographicProjections_Current_07-03-26.csv",
            "projections_DemographicProjections_2026-07-03.csv",
        ),
        (
            "RHNA-progress-report",
            "RHNAProgress_07-03-26.csv",
            "rhna-progress_RHNAProgress_2026-07-03.csv",
        ),
    ],
)
def test_maps_directory_names_to_module_ids_that_differ_from_them(
    tmp_path,
    renamer,
    directory,
    legacy_name,
    expected_name,
):
    archive_root = tmp_path / "archive"
    source = _legacy_file(archive_root, directory, legacy_name)

    renamer(archive_root, dry_run=False)

    assert not source.exists()
    assert (source.parent / expected_name).is_file()


def test_routes_historical_seed_to_backfill_module_id(tmp_path, renamer):
    archive_root = tmp_path / "archive"
    historical = _legacy_file(
        archive_root,
        "housing-stress",
        "HousingStress_Historical_07-13-26.csv",
        b"historical",
    )
    current = _legacy_file(
        archive_root,
        "housing-stress",
        "HousingStress_Current_07-14-26.csv",
        b"current",
    )

    renamer(archive_root, dry_run=False)

    assert not historical.exists()
    assert not current.exists()
    assert (
        historical.parent
        / "housing-stress-backfill_HousingStress_2026-07-13.csv"
    ).read_bytes() == b"historical"
    assert (
        current.parent / "housing-stress_HousingStress_2026-07-14.csv"
    ).read_bytes() == b"current"


def test_falls_back_to_mtime_for_undated_counter_suffixed_name(
    tmp_path,
    renamer,
    capsys,
):
    archive_root = tmp_path / "archive"
    source = _legacy_file(
        archive_root,
        "components-of-change",
        "ComponentsOfChange_Current_1.csv",
    )
    _set_mtime(source, 2026, 6, 15)

    renamer(archive_root, dry_run=False)

    destination = source.with_name(
        "components-of-change_ComponentsOfChange_2026-06-15.csv"
    )
    assert destination.is_file()
    assert "mtime" in capsys.readouterr().out.lower()


def test_does_not_flag_a_parsed_filename_date_as_inferred_from_mtime(
    tmp_path,
    renamer,
    capsys,
):
    # A date read out of the filename is stronger evidence than one guessed from
    # mtime, and the output has to say which it was. Asserting absence, because the
    # sibling mtime test asserts presence and passes either way.
    archive_root = tmp_path / "archive"
    _legacy_file(
        archive_root,
        "building-permits",
        "BuildingPermits_07-03-26.csv",
    )

    renamer(archive_root, dry_run=False)

    assert "mtime" not in capsys.readouterr().out.lower()


def test_dates_an_undated_file_by_its_local_mtime_rather_than_utc(
    tmp_path,
    renamer,
):
    # 18:00 local is the following day in UTC anywhere west of Greenwich, which is
    # how two real pophousing archives would have been dated a day late. On a UTC
    # machine this test is vacuous but still correct.
    archive_root = tmp_path / "archive"
    source = _legacy_file(
        archive_root,
        "housing-population",
        "PopHousing_Current.csv",
    )
    _set_mtime(source, 2026, 6, 18, 18, 0, 0)

    renamer(archive_root, dry_run=False)

    assert (
        source.parent / "pophousing_PopHousing_2026-06-18.csv"
    ).is_file()


def test_stops_on_an_archive_directory_with_no_module_id_mapping(
    tmp_path,
    renamer,
):
    archive_root = tmp_path / "archive"
    known = _legacy_file(
        archive_root,
        "building-permits",
        "BuildingPermits_07-03-26.csv",
    )
    unknown = _legacy_file(
        archive_root,
        "some-new-module",
        "SomeNewModule_07-03-26.csv",
    )

    with pytest.raises(ValueError, match="some-new-module"):
        renamer(archive_root, dry_run=False)

    assert known.is_file()
    assert unknown.is_file()


def test_ignores_directories_holding_no_csv_files(tmp_path, renamer):
    # An empty RHNA-progress-report/ is a normal state, not something to report.
    archive_root = tmp_path / "archive"
    source = _legacy_file(
        archive_root,
        "building-permits",
        "BuildingPermits_07-03-26.csv",
    )
    (archive_root / "RHNA-progress-report").mkdir(parents=True)
    notes_directory = archive_root / "scratch"
    notes_directory.mkdir()
    (notes_directory / "notes.txt").write_text("not a dataset")

    renamer(archive_root, dry_run=False)

    assert (
        source.parent / "building-permits_BuildingPermits_2026-07-03.csv"
    ).is_file()


def test_dry_run_writes_nothing_and_is_the_default(
    tmp_path,
    renamer,
    capsys,
):
    archive_root = tmp_path / "archive"
    source = _legacy_file(
        archive_root,
        "building-permits",
        "BuildingPermits_07-03-26.csv",
        b"prior dataset",
    )
    before = {
        path.relative_to(archive_root): path.read_bytes()
        for path in archive_root.rglob("*")
        if path.is_file()
    }

    renamer(archive_root)

    after = {
        path.relative_to(archive_root): path.read_bytes()
        for path in archive_root.rglob("*")
        if path.is_file()
    }
    assert after == before
    assert source.is_file()
    output = capsys.readouterr().out
    assert "BuildingPermits_07-03-26.csv" in output
    assert "building-permits_BuildingPermits_2026-07-03.csv" in output


def test_refuses_sources_sharing_a_date_and_a_whole_second_mtime(
    tmp_path,
    renamer,
):
    # A same-day collision is now resolved by the time suffix, so an genuinely
    # unresolvable pair needs an identical mtime down to the second.
    archive_root = tmp_path / "archive"
    first = _legacy_file(
        archive_root,
        "components-of-change",
        "ComponentsOfChange_Current.csv",
        b"first",
    )
    second = _legacy_file(
        archive_root,
        "components-of-change",
        "ComponentsOfChange_Current_1.csv",
        b"second",
    )
    _set_mtime(first, 2026, 6, 15, 9, 30, 15)
    _set_mtime(second, 2026, 6, 15, 9, 30, 15)
    before = {first.name: first.read_bytes(), second.name: second.read_bytes()}

    with pytest.raises(ValueError) as exc_info:
        renamer(archive_root, dry_run=False)

    message = str(exc_info.value)
    assert first.name in message
    assert second.name in message
    assert {path.name: path.read_bytes() for path in first.parent.iterdir()} == before


def test_disambiguates_two_same_day_files_by_their_mtime_time(
    tmp_path,
    renamer,
    capsys,
):
    # The real-archive case: data/archive/components-of-change/ holds two files
    # written 78 seconds apart on 2026-07-01.
    archive_root = tmp_path / "archive"
    earlier = _legacy_file(
        archive_root,
        "components-of-change",
        "ComponentsOfChange_Current_1.csv",
        b"earlier",
    )
    later = _legacy_file(
        archive_root,
        "components-of-change",
        "ComponentsOfChange_Current_2.csv",
        b"later",
    )
    _set_mtime(earlier, 2026, 7, 1, 15, 56, 38)
    _set_mtime(later, 2026, 7, 1, 15, 57, 56)

    renamer(archive_root, dry_run=False)

    directory = earlier.parent
    assert not earlier.exists()
    assert not later.exists()
    expected_earlier = "components-of-change_ComponentsOfChange_2026-07-01T155638.csv"
    expected_later = "components-of-change_ComponentsOfChange_2026-07-01T155756.csv"
    assert (directory / expected_earlier).read_bytes() == b"earlier"
    assert (directory / expected_later).read_bytes() == b"later"
    # Chronological ordering as plain strings is the whole reason for the format.
    assert sorted(path.name for path in directory.glob("*.csv")) == [
        expected_earlier,
        expected_later,
    ]
    assert "time inferred from file mtime" in capsys.readouterr().out


def test_leaves_a_non_colliding_file_on_the_plain_date(tmp_path, renamer):
    # Guards against the disambiguation pass over-applying to the whole directory.
    archive_root = tmp_path / "archive"
    colliding_first = _legacy_file(
        archive_root,
        "components-of-change",
        "ComponentsOfChange_Current_1.csv",
        b"first",
    )
    colliding_second = _legacy_file(
        archive_root,
        "components-of-change",
        "ComponentsOfChange_Current_2.csv",
        b"second",
    )
    alone = _legacy_file(
        archive_root,
        "components-of-change",
        "ComponentsOfChange_Current.csv",
        b"alone",
    )
    _set_mtime(colliding_first, 2026, 7, 1, 15, 56, 38)
    _set_mtime(colliding_second, 2026, 7, 1, 15, 57, 56)
    _set_mtime(alone, 2026, 6, 25, 11, 23, 10)

    renamer(archive_root, dry_run=False)

    plain = alone.parent / "components-of-change_ComponentsOfChange_2026-06-25.csv"
    assert plain.read_bytes() == b"alone"


def test_a_second_run_leaves_time_suffixed_names_alone(tmp_path, renamer, capsys):
    # Without the optional T group in _NEW_FORMAT_PATTERN a disambiguated file reads
    # as legacy on the next run and is renamed again into garbage.
    archive_root = tmp_path / "archive"
    first = _legacy_file(
        archive_root,
        "components-of-change",
        "ComponentsOfChange_Current_1.csv",
        b"first",
    )
    second = _legacy_file(
        archive_root,
        "components-of-change",
        "ComponentsOfChange_Current_2.csv",
        b"second",
    )
    _set_mtime(first, 2026, 7, 1, 15, 56, 38)
    _set_mtime(second, 2026, 7, 1, 15, 57, 56)
    renamer(archive_root, dry_run=False)
    after_first_run = {
        path.name: path.read_bytes()
        for path in archive_root.rglob("*.csv")
    }
    capsys.readouterr()

    plan = renamer(archive_root, dry_run=False)

    assert plan == []
    assert {
        path.name: path.read_bytes()
        for path in archive_root.rglob("*.csv")
    } == after_first_run


def test_refuses_to_overwrite_an_existing_destination(tmp_path, renamer):
    archive_root = tmp_path / "archive"
    source = _legacy_file(
        archive_root,
        "building-permits",
        "BuildingPermits_07-03-26.csv",
        b"legacy",
    )
    destination = _legacy_file(
        archive_root,
        "building-permits",
        "building-permits_BuildingPermits_2026-07-03.csv",
        b"existing",
    )

    with pytest.raises(FileExistsError):
        renamer(archive_root, dry_run=False)

    assert source.read_bytes() == b"legacy"
    assert destination.read_bytes() == b"existing"


def test_does_not_modify_file_contents(tmp_path, renamer):
    archive_root = tmp_path / "archive"
    expected = b"\x00old,csv\r\nbytes,exact\xff"
    source = _legacy_file(
        archive_root,
        "housing-population",
        "PopHousing_Current.csv",
        expected,
    )
    _set_mtime(source, 2026, 5, 9)

    renamer(archive_root, dry_run=False)

    destination = source.with_name("pophousing_PopHousing_2026-05-09.csv")
    assert destination.read_bytes() == expected


def test_uses_path_rename_for_each_file(tmp_path, renamer, monkeypatch):
    archive_root = tmp_path / "archive"
    source = _legacy_file(
        archive_root,
        "building-permits",
        "BuildingPermits_07-03-26.csv",
    )
    original_rename = Path.rename
    calls = []

    def record_rename(path, target):
        calls.append((path, target))
        return original_rename(path, target)

    monkeypatch.setattr(Path, "rename", record_rename)

    renamer(archive_root, dry_run=False)

    assert calls == [
        (
            source,
            source.with_name(
                "building-permits_BuildingPermits_2026-07-03.csv"
            ),
        )
    ]


def test_rejects_two_digit_year_outside_the_supported_archive_era(
    tmp_path,
    renamer,
):
    archive_root = tmp_path / "archive"
    source = _legacy_file(
        archive_root,
        "building-permits",
        "BuildingPermits_07-03-99.csv",
    )

    with pytest.raises(ValueError, match="year"):
        renamer(archive_root, dry_run=False)

    assert source.is_file()
