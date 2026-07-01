from unittest.mock import Mock

import pandas as pd
from scripts.housing_stress.aggregation import geographic_levels
from scripts.housing_stress.aggregation.geographic_levels import (
    build_all_levels,
    build_county_rows,
    build_region_rows,
    build_state_rows,
)

from scripts.shared.geography.california_geography import (
    get_california_geography,
)

STATE_ABBREVIATIONS = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]

TENURE_FORMULAS = {
    "Total": {
        "num_30": ["E003", "E007", "E011"],
        "num_50": ["E004", "E008", "E012"],
        "denom": ["E001"],
    },
    "Rented": {
        "num_30": ["E011"],
        "num_50": ["E012"],
        "denom": ["E010"],
    },
    "Owned": {
        "num_30": ["E003", "E007"],
        "num_50": ["E004", "E008"],
        "denom": ["E002", "E006"],
    },
    "Owned With Mortgage": {
        "num_30": ["E003"],
        "num_50": ["E004"],
        "denom": ["E002"],
    },
    "Owned Without Mortgage": {
        "num_30": ["E007"],
        "num_50": ["E008"],
        "denom": ["E006"],
    },
}

REGION_NAMES = {
    "Far North",
    "Bay Area",
    "San Diego (Regional)",
    "Inland Empire",
    "Sacramento (Regional)",
    "North San Joaquin Valley",
    "South San Joaquin Valley",
    "Central Coast",
    "Los Angeles (Regional)",
}


def _schema_config():
    race_iteration_map = {
        "b25140": "All",
        "b25140b": "Black",
        "b25140c": "American Indian/Alaskan Native",
        "b25140d": "Asian",
        "b25140e": "Native Hawaiian/Pacific Islander",
        "b25140f": "Other",
        "b25140g": "Multiracial",
        "b25140h": "White",
        "b25140i": "Hispanic",
    }
    reconciliation = {
        "All": "All",
        "Black": "Black",
        "American Indian/Alaskan Native": "AIAN",
        "Asian": "Asian",
        "Native Hawaiian/Pacific Islander": "NHPI",
        "Other": "Other",
        "Multiracial": "Multiracial",
        "White": "White",
        "Hispanic": "Hispanic",
    }
    return {
        "year_column": "Year",
        "location_column": "Location",
        "level_column": "Geographic Level",
        "state_column": "State",
        "race_column": "Race/Ethnicity",
        "tenure_column": "Tenure",
        "measure_columns": [
            "Number Over 30%",
            "Number Over 50%",
            "Share Over 30%",
            "Share Over 50%",
        ],
        "estimate_columns": [
            f"E{number:03d}" for number in range(1, 14)
        ],
        "tenure_formulas": TENURE_FORMULAS,
        "race_iteration_map": race_iteration_map,
        "race_reconciliation_map": reconciliation,
        "state_abbreviations": STATE_ABBREVIATIONS,
        "excluded_state_areas": {"DC", "PR"},
    }


def _estimate_values():
    values = {f"E{number:03d}": 0 for number in range(1, 14)}
    values.update(
        {
            "E001": 100,
            "E002": 50,
            "E003": 20,
            "E004": 10,
            "E006": 30,
            "E007": 9,
            "E008": 3,
            "E010": 40,
            "E011": 12,
            "E012": 6,
        }
    )
    return values


def _raw_frame(geographies, prefix="B25140"):
    rows = []
    index = []
    for geo_id, name, state in geographies:
        row = {
            f"{prefix}_{column}": value
            for column, value in _estimate_values().items()
        }
        row.update({"NAME": name, "STUSAB": state})
        rows.append(row)
        index.append(geo_id)
    return pd.DataFrame(
        rows,
        index=pd.Index(index, name="GEO_ID"),
    )


def _state_frame(abbreviations=None):
    abbreviations = abbreviations or STATE_ABBREVIATIONS
    geographies = [
        (f"0400000US{number:02d}", f"State {state}", state)
        for number, state in enumerate(abbreviations, start=1)
    ]
    return _raw_frame(geographies)


def _puma_frame(count=9, prefix="B25140"):
    geographies = [
        (
            f"7950000US06{puma_id:05d}",
            f"PUMA {puma_id:05d}, California",
            "CA",
        )
        for puma_id in range(101, 101 + count)
    ]
    return _raw_frame(geographies, prefix)


def _write_crosswalks(tmp_path):
    region_path = tmp_path / "puma_regions_xwalk_2020.csv"
    county_path = tmp_path / "puma_counties_xwalk_2020.csv"
    pd.DataFrame(
        {
            "pumace": list(range(101, 110)),
            "region": list(range(1, 10)),
        }
    ).to_csv(region_path, index=False)
    pd.DataFrame(
        {
            "pumace": list(range(101, 110)),
            "cntynm": [
                "Alameda",
                "Alameda",
                "Contra Costa",
                "Contra Costa",
                "Fresno",
                "Fresno",
                "Fresno",
                "Yuba",
                "Yuba",
            ],
        }
    ).to_csv(county_path, index=False)
    return {
        "region_crosswalk_path": region_path,
        "county_crosswalk_path": county_path,
    }


def test_build_state_rows_yields_exactly_fifty_states_and_excludes_areas():
    source = _state_frame([*STATE_ABBREVIATIONS, "DC", "PR"])

    result = build_state_rows(
        {"All": source},
        2023,
        _schema_config(),
    )

    assert result["Location"].nunique() == 50
    assert len(result) == 50 * 5
    assert not {"DC", "PR"} & set(result["Location"])


def test_build_state_rows_uses_usps_abbreviation_as_location():
    result = build_state_rows(
        {"All": _state_frame()},
        2023,
        _schema_config(),
    )

    assert set(result["Location"]) == set(STATE_ABBREVIATIONS)
    assert "State CA" not in set(result["Location"])


def test_build_state_rows_tags_level_and_year():
    result = build_state_rows(
        {"All": _state_frame(["CA"])},
        2023,
        _schema_config(),
    )

    assert result["Geographic Level"].eq("State").all()
    assert result["Year"].eq(2023).all()


def test_build_state_rows_applies_shared_tenure_measures():
    result = build_state_rows(
        {"All": _state_frame(["CA"])},
        2023,
        _schema_config(),
    )
    total = result.loc[result["Tenure"].eq("Total")].iloc[0]

    assert set(result["Tenure"]) == set(TENURE_FORMULAS)
    assert total["Number Over 30%"] == 41
    assert total["Number Over 50%"] == 19
    assert total["Share Over 30%"] == 0.41


def test_build_state_rows_reconciles_race_label():
    result = build_state_rows(
        {
            "American Indian/Alaskan Native": _raw_frame(
                [
                    ("0400000US06", "California", "CA"),
                ],
                "B25140C",
            )
        },
        2023,
        _schema_config(),
    )

    assert result["Race/Ethnicity"].eq("AIAN").all()


def test_build_region_rows_yields_all_nine_regions(tmp_path):
    result = build_region_rows(
        {"All": _puma_frame()},
        2023,
        _write_crosswalks(tmp_path),
        _schema_config(),
        get_california_geography(),
    )

    assert set(result["Location"]) == REGION_NAMES
    assert result["Location"].nunique() == 9


def test_build_region_rows_tags_level_and_year(tmp_path):
    result = build_region_rows(
        {"All": _puma_frame()},
        2022,
        _write_crosswalks(tmp_path),
        _schema_config(),
        get_california_geography(),
    )

    assert result["Geographic Level"].eq("Region").all()
    assert result["Year"].eq(2022).all()


def test_build_region_rows_applies_measure_and_race_transforms(tmp_path):
    result = build_region_rows(
        {"White": _puma_frame(prefix="B25140H")},
        2023,
        _write_crosswalks(tmp_path),
        _schema_config(),
        get_california_geography(),
    )
    total = result.loc[result["Tenure"].eq("Total")].iloc[0]

    assert result["Race/Ethnicity"].eq("White").all()
    assert set(result["Tenure"]) == set(TENURE_FORMULAS)
    assert total["Number Over 30%"] == 41


def test_build_region_rows_aggregates_pumas_before_computing_measures(tmp_path):
    result = build_region_rows(
        {"All": _puma_frame()},
        2023,
        _write_crosswalks(tmp_path),
        _schema_config(),
        get_california_geography(),
    )
    bay_area_total = result[
        result["Location"].eq("Bay Area")
        & result["Tenure"].eq("Total")
    ].iloc[0]

    assert bay_area_total["Number Over 30%"] == 41
    assert bay_area_total["Share Over 30%"] == 0.41


def test_build_county_rows_yields_crosswalk_counties(tmp_path):
    result = build_county_rows(
        {"All": _puma_frame()},
        2023,
        _write_crosswalks(tmp_path),
        _schema_config(),
        get_california_geography(),
    )

    assert set(result["Location"]) == {
        "Alameda",
        "Contra Costa",
        "Fresno",
        "Yuba",
    }
    assert result["Location"].nunique() <= 58


def test_build_county_rows_tags_level_and_year(tmp_path):
    result = build_county_rows(
        {"All": _puma_frame()},
        2021,
        _write_crosswalks(tmp_path),
        _schema_config(),
        get_california_geography(),
    )

    assert result["Geographic Level"].eq("County").all()
    assert result["Year"].eq(2021).all()


def test_build_county_rows_applies_measure_and_race_transforms(tmp_path):
    result = build_county_rows(
        {"Other": _puma_frame(prefix="B25140F")},
        2023,
        _write_crosswalks(tmp_path),
        _schema_config(),
        get_california_geography(),
    )
    alameda_total = result[
        result["Location"].eq("Alameda")
        & result["Tenure"].eq("Total")
    ].iloc[0]

    assert result["Race/Ethnicity"].eq("Other").all()
    assert set(result["Tenure"]) == set(TENURE_FORMULAS)
    assert alameda_total["Number Over 30%"] == 82
    assert alameda_total["Share Over 30%"] == 0.41


def test_build_county_rows_omits_unmatched_pumas(tmp_path):
    paths = _write_crosswalks(tmp_path)
    source = pd.concat(
        [
            _puma_frame(),
            _raw_frame(
                [
                    (
                        "7950000US0699999",
                        "PUMA 99999, California",
                        "CA",
                    )
                ]
            ),
        ]
    )

    result = build_county_rows(
        {"All": source},
        2023,
        paths,
        _schema_config(),
        get_california_geography(),
    )

    assert result["Location"].nunique() == 4
    assert "99999" not in set(result["Location"])


def _level_frame(level, location, race="All", tenure="Total"):
    return pd.DataFrame(
        {
            "Year": [2023],
            "Geographic Level": [level],
            "Location": [location],
            "Race/Ethnicity": [race],
            "Tenure": [tenure],
            "Number Over 30%": [1],
            "Number Over 50%": [1],
            "Share Over 30%": [0.1],
            "Share Over 50%": [0.1],
        }
    )


def test_build_all_levels_concatenates_state_region_and_county(monkeypatch):
    monkeypatch.setattr(
        geographic_levels,
        "build_state_rows",
        Mock(return_value=_level_frame("State", "CA")),
    )
    monkeypatch.setattr(
        geographic_levels,
        "build_region_rows",
        Mock(return_value=_level_frame("Region", "Bay Area")),
    )
    monkeypatch.setattr(
        geographic_levels,
        "build_county_rows",
        Mock(return_value=_level_frame("County", "Alameda")),
    )

    result = build_all_levels({}, {}, 2023, {}, {}, {})

    assert set(result["Geographic Level"]) == {"State", "Region", "County"}
    assert len(result) == 3


def test_build_all_levels_sorts_contract_grain(monkeypatch):
    monkeypatch.setattr(
        geographic_levels,
        "build_state_rows",
        Mock(return_value=_level_frame("State", "CA", "White", "Rented")),
    )
    monkeypatch.setattr(
        geographic_levels,
        "build_region_rows",
        Mock(return_value=_level_frame("Region", "Bay Area", "All", "Total")),
    )
    monkeypatch.setattr(
        geographic_levels,
        "build_county_rows",
        Mock(return_value=_level_frame("County", "Yuba", "Black", "Owned")),
    )

    result = build_all_levels({}, {}, 2023, {}, {}, {})
    expected = result.sort_values(
        [
            "Geographic Level",
            "Location",
            "Race/Ethnicity",
            "Tenure",
        ],
        ignore_index=True,
    )

    pd.testing.assert_frame_equal(result.reset_index(drop=True), expected)


def test_suppressed_race_iteration_produces_absent_not_zero_rows():
    result = build_state_rows(
        {"All": _state_frame(["CA"])},
        2023,
        _schema_config(),
    )

    assert set(result["Race/Ethnicity"]) == {"All"}
    assert "NHPI" not in set(result["Race/Ethnicity"])
