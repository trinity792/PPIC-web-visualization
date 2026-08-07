from pathlib import Path

import pandas as pd
import pytest

from scripts.components_of_change.config.columns import get_columns_config
from scripts.components_of_change.config.geography import get_components_geography
from scripts.components_of_change.output.finalize_dataset import archive_and_save, assign_geographic_level, prepare_components_output, write_components_output


def test_assign_geographic_level_classifies_state_region_county_and_other():
    dataframe = pd.DataFrame({"Location": ["CA", "Bay Area", "Alameda", "Unknown"], "Year": [2020, 2020, 2020, 2020]})

    result = assign_geographic_level(dataframe, get_components_geography())

    assert result["Geographic Level"].tolist() == ["State", "Region", "County", "Other"]
    assert result.columns[0] == "Geographic Level"


def test_prepare_components_output_orders_and_sorts_columns():
    columns = get_columns_config()["output_columns"]
    first_row = {column: 1 for column in columns}
    first_row.update({"Geographic Level": "County", "Location": "B", "Source": "DoF", "Year": 2021})
    second_row = {column: 2 for column in columns}
    second_row.update({"Geographic Level": "County", "Location": "A", "Source": "DoF", "Year": 2020})
    dataframe = pd.DataFrame([first_row, second_row])

    result = prepare_components_output(dataframe, columns)

    assert result.columns.tolist() == columns
    assert result["Location"].tolist() == ["A", "B"]


def test_write_components_output_is_atomic(tmp_path):
    output_path = tmp_path / "components.csv"
    dataframe = pd.DataFrame({"Location": ["CA"]})

    result = write_components_output(dataframe, output_path)

    assert result == output_path
    assert output_path.read_text().startswith("Location")


def test_archive_and_save_leaves_canonical_file_in_place_while_archiving(
    tmp_path,
    frozen_archive_clock,
    monkeypatch,
):
    current_path = tmp_path / "ComponentsOfChange_Current.csv"
    archive_directory = tmp_path / "archive"
    prior = pd.DataFrame({"Location": ["CA"], "Value": [1]})
    replacement = pd.DataFrame({"Location": ["CA"], "Value": [2]})
    prior.to_csv(current_path, index=False)
    prior_bytes = current_path.read_bytes()
    original_replace = Path.replace
    canonical_states = []

    def inspect_before_replace(temporary_path, target_path):
        canonical_states.append(
            (current_path.is_file(), current_path.read_bytes())
        )
        return original_replace(temporary_path, target_path)

    monkeypatch.setattr(Path, "replace", inspect_before_replace)

    archive_and_save(
        replacement,
        current_path,
        archive_directory,
        module_id="components-of-change",
    )

    assert canonical_states == [(True, prior_bytes)]
    archives = list(archive_directory.glob("*.csv"))
    assert len(archives) == 1
    assert archives[0].read_bytes() == prior_bytes
    pd.testing.assert_frame_equal(pd.read_csv(current_path), replacement)


def test_archive_and_save_returns_none_when_data_is_unchanged(tmp_path):
    current_path = tmp_path / "ComponentsOfChange_Current.csv"
    archive_directory = tmp_path / "archive"
    dataframe = pd.DataFrame({"Location": ["CA"], "Value": [1]})
    dataframe.to_csv(current_path, index=False)
    original_bytes = current_path.read_bytes()
    original_mtime = current_path.stat().st_mtime_ns

    result = archive_and_save(
        dataframe,
        current_path,
        archive_directory,
        module_id="components-of-change",
    )

    assert result is None
    assert current_path.read_bytes() == original_bytes
    assert current_path.stat().st_mtime_ns == original_mtime
    assert not archive_directory.exists()


def test_archive_and_save_writes_module_prefixed_iso_archive_name(
    tmp_path,
    frozen_archive_clock,
):
    current_path = tmp_path / "ComponentsOfChange_Current.csv"
    archive_directory = tmp_path / "archive"
    pd.DataFrame({"Value": [1]}).to_csv(current_path, index=False)

    archive_and_save(
        pd.DataFrame({"Value": [2]}),
        current_path,
        archive_directory,
        module_id="components-of-change",
    )

    assert [path.name for path in archive_directory.glob("*.csv")] == [
        "components-of-change_ComponentsOfChange_2026-08-07.csv"
    ]


def test_archive_and_save_leaves_canonical_intact_when_write_raises(
    tmp_path,
    frozen_archive_clock,
    monkeypatch,
):
    current_path = tmp_path / "ComponentsOfChange_Current.csv"
    archive_directory = tmp_path / "archive"
    prior = pd.DataFrame({"Location": ["CA"], "Value": [1]})
    prior.to_csv(current_path, index=False)
    prior_bytes = current_path.read_bytes()

    def fail_replace(_temporary_path, _target_path):
        raise OSError("simulated interrupted write")

    monkeypatch.setattr(Path, "replace", fail_replace)

    with pytest.raises(OSError, match="interrupted write"):
        archive_and_save(
            pd.DataFrame({"Location": ["CA"], "Value": [2]}),
            current_path,
            archive_directory,
            module_id="components-of-change",
        )

    assert current_path.read_bytes() == prior_bytes
    assert list(tmp_path.glob("*.tmp")) == []
