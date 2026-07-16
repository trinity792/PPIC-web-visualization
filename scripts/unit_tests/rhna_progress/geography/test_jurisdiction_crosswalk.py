import pandas as pd
import pytest
from scripts.rhna_progress.geography.jurisdiction_crosswalk import (
    build_jurisdiction_crosswalk,
    load_jurisdiction_crosswalk,
)


def test_load_jurisdiction_crosswalk_reads_committed_csv(tmp_path):
    path = tmp_path / "jurisdiction_county_crosswalk.csv"
    expected = pd.DataFrame(
        {
            "Jurisdiction": ["Alameda", "Alameda County"],
            "County": ["Alameda", "Alameda"],
        }
    )
    expected.to_csv(path, index=False)

    result = load_jurisdiction_crosswalk({"jurisdiction_crosswalk_path": path})

    pd.testing.assert_frame_equal(result, expected)


def test_load_jurisdiction_crosswalk_missing_file_has_actionable_error(tmp_path):
    path = tmp_path / "missing.csv"

    with pytest.raises(FileNotFoundError, match="crosswalk missing"):
        load_jurisdiction_crosswalk({"jurisdiction_crosswalk_path": path})


def test_build_jurisdiction_crosswalk_maps_counties_to_self_and_cities_to_county():
    rhna_names = ["ALAMEDA", "ALAMEDA COUNTY", "SAN BUENAVENTURA"]
    e5_hierarchy = pd.DataFrame(
        {
            "County": ["Alameda", "Ventura"],
            "City": ["Alameda", "San Buenaventura"],
        }
    )

    result, unmatched = build_jurisdiction_crosswalk(
        rhna_names,
        e5_hierarchy,
        {"SAN BUENAVENTURA": "Ventura"},
    )

    assert unmatched == []
    assert result.set_index("Jurisdiction")["County"].to_dict() == {
        "Alameda": "Alameda",
        "Alameda County": "Alameda",
        "Ventura": "Ventura",
    }


def test_build_jurisdiction_crosswalk_reports_unmatched_names_for_review():
    result, unmatched = build_jurisdiction_crosswalk(
        ["ALAMEDA", "NEW CITY"],
        pd.DataFrame({"County": ["Alameda"], "City": ["Alameda"]}),
        {},
    )

    assert result["Jurisdiction"].tolist() == ["Alameda"]
    assert unmatched == ["NEW CITY"]

