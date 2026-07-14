import pandas as pd
import pytest

from scripts.housing_stress.geography.puma_aggregation import (
    aggregate_pumas_to_geography,
    extract_puma_id,
    map_region_ids_to_names,
)

REGION_ID_TO_NAME = {
    1: "Far North",
    2: "Bay Area",
    3: "San Diego (Regional)",
    4: "Inland Empire",
    5: "Sacramento (Regional)",
    6: "North San Joaquin Valley",
    7: "South San Joaquin Valley",
    8: "Central Coast",
    9: "Los Angeles (Regional)",
}


def _raw_geography_frame():
    return pd.DataFrame(
        {
            "NAME": [
                "PUMA 00101, California",
                "California",
                "Alameda County, California",
                "PUMA 07501, California",
            ],
            "E001": [100, 1_000, 500, 200],
        },
        index=pd.Index(
            [
                "7950000US0600101",
                "0400000US06",
                "0500000US06001",
                "7950000US0607501",
            ],
            name="GEO_ID",
        ),
    )


def _write_crosswalk(tmp_path, rows):
    path = tmp_path / "crosswalk.csv"
    pd.DataFrame(rows).to_csv(path, index=False)
    return path


def test_extract_puma_id_keeps_only_puma_rows():
    result = extract_puma_id(_raw_geography_frame())

    assert result["NAME"].tolist() == [
        "PUMA 00101, California",
        "PUMA 07501, California",
    ]
    assert result["E001"].tolist() == [100, 200]


def test_extract_puma_id_parses_trailing_five_digits_as_integer():
    result = extract_puma_id(_raw_geography_frame())

    assert result["PUMA_ID"].tolist() == [101, 7501]
    assert pd.api.types.is_integer_dtype(result["PUMA_ID"])


def test_extract_puma_id_accepts_geo_id_as_a_column():
    source = _raw_geography_frame().reset_index()

    result = extract_puma_id(source)

    assert result["GEO_ID"].tolist() == [
        "7950000US0600101",
        "7950000US0607501",
    ]
    assert result["PUMA_ID"].tolist() == [101, 7501]


def test_extract_puma_id_rejects_malformed_puma_geo_id():
    source = pd.DataFrame(
        {
            "GEO_ID": ["7950000US06ABCDE"],
            "NAME": ["PUMA malformed, California"],
        }
    )

    with pytest.raises(ValueError, match="GEO_ID|PUMA"):
        extract_puma_id(source)


def test_extract_puma_id_detects_by_geo_id_not_name_text():
    # Structural detection: PUMA rows are found by GEO_ID prefix even when the
    # NAME text no longer contains "PUMA" (a wording change must not drop rows).
    source = pd.DataFrame(
        {
            "NAME": ["Public Use Microdata Area 00101, California", "California"],
            "E001": [100, 1_000],
        },
        index=pd.Index(["7950000US0600101", "0400000US06"], name="GEO_ID"),
    )

    result = extract_puma_id(source)

    assert result["PUMA_ID"].tolist() == [101]


def test_extract_puma_id_raises_when_no_puma_rows_present():
    source = pd.DataFrame(
        {"NAME": ["California"], "E001": [1_000]},
        index=pd.Index(["0400000US06"], name="GEO_ID"),
    )

    with pytest.raises(ValueError, match="No PUMA rows"):
        extract_puma_id(source)


def test_aggregate_pumas_to_geography_raises_on_missing_crosswalk_header(tmp_path):
    source = pd.DataFrame({"PUMA_ID": [101], "E001": [100]})
    # Crosswalk with a renamed geography column: a clear error naming the file,
    # not an opaque KeyError.
    crosswalk = _write_crosswalk(tmp_path, {"pumace": [101], "renamed_geo": ["Alameda"]})

    with pytest.raises(ValueError, match="crosswalk.*missing columns|missing columns.*cntynm"):
        aggregate_pumas_to_geography(source, crosswalk, "cntynm", ["E001"], "Location")


def test_extract_puma_id_does_not_mutate_input():
    source = _raw_geography_frame()
    original = source.copy(deep=True)

    extract_puma_id(source)

    pd.testing.assert_frame_equal(source, original)


def test_aggregate_pumas_to_geography_sums_member_pumas(tmp_path):
    source = pd.DataFrame(
        {
            "PUMA_ID": [101, 102, 201],
            "E001": [100, 250, 80],
            "E002": [50, 125, 40],
        }
    )
    crosswalk = _write_crosswalk(
        tmp_path,
        {
            "pumace": [101, 102, 201],
            "cntynm": ["Alameda", "Alameda", "Alpine"],
        },
    )

    result = aggregate_pumas_to_geography(
        source,
        crosswalk,
        "cntynm",
        ["E001", "E002"],
        "Location",
    )

    by_location = result.set_index("Location")
    assert by_location.loc["Alameda", "E001"] == 350
    assert by_location.loc["Alameda", "E002"] == 175
    assert by_location.loc["Alpine", "E001"] == 80


def test_aggregate_pumas_to_geography_drops_unmatched_pumas(tmp_path):
    source = pd.DataFrame(
        {
            "PUMA_ID": [101, 99999],
            "E001": [100, 9_999],
        }
    )
    crosswalk = _write_crosswalk(
        tmp_path,
        {"pumace": [101], "cntynm": ["Alameda"]},
    )

    result = aggregate_pumas_to_geography(
        source,
        crosswalk,
        "cntynm",
        ["E001"],
        "Location",
    )

    assert result.to_dict("records") == [
        {"Location": "Alameda", "E001": 100}
    ]


def test_aggregate_pumas_to_geography_renames_crosswalk_geography_column(
    tmp_path,
):
    source = pd.DataFrame({"PUMA_ID": [101], "E001": [100]})
    crosswalk = _write_crosswalk(
        tmp_path,
        {"pumace": [101], "region": [2]},
    )

    result = aggregate_pumas_to_geography(
        source,
        crosswalk,
        "region",
        ["E001"],
        "REGION_ID",
    )

    assert result.columns.tolist() == ["REGION_ID", "E001"]
    assert result.loc[0, "REGION_ID"] == 2


def test_aggregate_pumas_to_geography_sums_only_requested_estimates(tmp_path):
    source = pd.DataFrame(
        {
            "PUMA_ID": [101, 102],
            "E001": [100, 200],
            "E002": [50, 75],
            "unrelated": [1, 2],
        }
    )
    crosswalk = _write_crosswalk(
        tmp_path,
        {
            "pumace": [101, 102],
            "cntynm": ["Alameda", "Alameda"],
            "crosswalk_note": ["a", "b"],
        },
    )

    result = aggregate_pumas_to_geography(
        source,
        crosswalk,
        "cntynm",
        ["E001", "E002"],
        "Location",
    )

    assert result.columns.tolist() == ["Location", "E001", "E002"]
    assert result.loc[0, ["E001", "E002"]].tolist() == [300, 125]


def test_aggregate_pumas_to_geography_keeps_distinct_groups_separate(tmp_path):
    source = pd.DataFrame(
        {
            "PUMA_ID": [101, 102],
            "E001": [100, 200],
        }
    )
    crosswalk = _write_crosswalk(
        tmp_path,
        {
            "pumace": [101, 102],
            "cntynm": ["Alameda", "Contra Costa"],
        },
    )

    result = aggregate_pumas_to_geography(
        source,
        crosswalk,
        "cntynm",
        ["E001"],
        "Location",
    )

    assert result.set_index("Location")["E001"].to_dict() == {
        "Alameda": 100,
        "Contra Costa": 200,
    }


def test_aggregate_pumas_to_geography_does_not_mutate_input(tmp_path):
    source = pd.DataFrame({"PUMA_ID": [101], "E001": [100]})
    original = source.copy(deep=True)
    crosswalk = _write_crosswalk(
        tmp_path,
        {"pumace": [101], "cntynm": ["Alameda"]},
    )

    aggregate_pumas_to_geography(
        source,
        crosswalk,
        "cntynm",
        ["E001"],
        "Location",
    )

    pd.testing.assert_frame_equal(source, original)


def test_map_region_ids_to_names_maps_all_nine_regions():
    source = pd.DataFrame({"REGION_ID": list(REGION_ID_TO_NAME)})

    result = map_region_ids_to_names(
        source,
        "REGION_ID",
        REGION_ID_TO_NAME,
    )

    assert result["REGION_ID"].tolist() == list(REGION_ID_TO_NAME.values())


def test_map_region_ids_to_names_preserves_other_columns_and_input():
    source = pd.DataFrame({"REGION_ID": [2], "E001": [100]})

    result = map_region_ids_to_names(
        source,
        "REGION_ID",
        REGION_ID_TO_NAME,
    )

    assert result.loc[0].to_dict() == {"REGION_ID": "Bay Area", "E001": 100}
    assert source.loc[0, "REGION_ID"] == 2


def test_map_region_ids_to_names_raises_for_unknown_id():
    source = pd.DataFrame({"REGION_ID": [2, 10]})

    with pytest.raises(ValueError, match="10"):
        map_region_ids_to_names(
            source,
            "REGION_ID",
            REGION_ID_TO_NAME,
        )
