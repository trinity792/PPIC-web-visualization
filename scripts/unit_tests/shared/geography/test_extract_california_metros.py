import geopandas as gpd
import pandas as pd
import pytest
import shapely
from shapely.geometry import MultiPolygon, box

from scripts.shared.geography.extract_california_metros import (
    METROS_BY_CBSA,
    MetroExtractError,
    build_california_metros,
    split_fresno_and_madera,
)

CRS = "EPSG:4326"


def _cbsa(rows):
    return gpd.GeoDataFrame(
        {
            "GEOID": [row[0] for row in rows],
            "NAME": [row[1] for row in rows],
            "LSAD": [row[2] for row in rows],
        },
        geometry=[row[3] for row in rows],
        crs=CRS,
    )


def _all_california_metros():
    """One small square per configured CBSA, Fresno's square covering two counties."""
    rows = []
    for index, (geoid, entry) in enumerate(sorted(METROS_BY_CBSA.items())):
        if geoid == "31460":  # Madera is cut out of Fresno, not read from the file
            continue
        x = index * 3
        shape = box(0, 0, 4, 2) if geoid == "23420" else box(x + 10, 0, x + 11, 1)
        rows.append((geoid, f"{entry['name']} Metro, CA", "M1", shape))
    rows.append(("99999", "Truckee-Grass Valley, CA", "M2", box(-5, 0, -4, 1)))  # micro area
    rows.append(("12345", "Reno, NV", "M1", box(-9, 0, -8, 1)))  # out of state
    return _cbsa(rows)


def _counties():
    return gpd.GeoDataFrame(
        {"GEOID": ["06019", "06039"], "NAME": ["Fresno", "Madera"]},
        # Madera's outline overshoots the metro edge slightly, as real files disagree.
        geometry=[box(2, 0, 4, 2), box(0, 0, 2.0, 2.05)],
        crs=CRS,
    )


def test_split_follows_the_county_line_and_keeps_the_outer_edge():
    fresno_metro = box(0, 0, 4, 2)

    fresno, madera = split_fresno_and_madera(fresno_metro, _counties())

    assert madera.equals(box(0, 0, 2, 2))
    assert fresno.equals(box(2, 0, 4, 2))
    assert fresno.union(madera).equals(fresno_metro)


def test_split_folds_slivers_on_the_far_side_into_madera():
    # A sliver of metro left outside Madera's outline but touching it, not Fresno.
    fresno_metro = box(-0.01, 0, 4, 2)

    fresno, madera = split_fresno_and_madera(fresno_metro, _counties())

    assert not isinstance(fresno, MultiPolygon)
    assert fresno.equals(box(2, 0, 4, 2))
    assert madera.area == pytest.approx(2.01 * 2)


def test_build_keeps_the_26_zillow_metros_with_names_and_alternates():
    metros = build_california_metros(_all_california_metros(), _counties())

    assert len(metros) == 26
    assert list(metros.columns) == ["GEOID", "NAME", "ALT_NAME", "geometry"]
    by_name = metros.set_index("NAME")
    assert by_name.loc["Riverside", "ALT_NAME"] == "Inland Empire"
    assert by_name.loc["Santa Maria", "ALT_NAME"] == "Santa Barbara"
    assert by_name.loc["Oxnard", "ALT_NAME"] == "Ventura"
    assert by_name["ALT_NAME"].notna().sum() == 3
    assert by_name.loc["Madera", "GEOID"] == "31460"
    assert by_name.loc["Fresno", "geometry"].equals(box(2, 0, 4, 2))
    assert "Reno" not in set(metros["NAME"])


def test_build_fails_loudly_when_a_configured_metro_is_missing():
    source = _all_california_metros()
    source = source[source["GEOID"] != "41860"]

    with pytest.raises(MetroExtractError, match="41860"):
        build_california_metros(source, _counties())


def test_build_fails_loudly_on_an_unexpected_california_metro():
    extra = _cbsa([("88888", "Brand New, CA", "M1", box(50, 0, 51, 1))])
    source = gpd.GeoDataFrame(pd.concat([_all_california_metros(), extra], ignore_index=True), crs=CRS)

    with pytest.raises(MetroExtractError, match="Brand New"):
        build_california_metros(source, _counties())


def test_configured_names_match_the_zillow_topic():
    from scripts.zillow_affordability.config.schemas import get_schema_config

    expected = set(get_schema_config()["expected_locations"]) - {"United States"}
    assert {entry["name"] for entry in METROS_BY_CBSA.values()} == expected


def test_as_valid_coverage_adds_the_shared_corner_a_split_creates():
    from scripts.shared.geography.extract_california_metros import as_valid_coverage

    # Left square is split in two; the split line ends on the right square's
    # edge at (2, 1), a corner the right square doesn't have: a T-junction.
    metros = gpd.GeoDataFrame(
        {"GEOID": ["a", "b", "c"], "NAME": ["Lower", "Upper", "Right"], "ALT_NAME": [None, None, None]},
        geometry=[box(0, 0, 2, 1), box(0, 1, 2, 2), box(2, 0, 4, 2)],
        crs=CRS,
    )
    assert not shapely.coverage_is_valid(metros.geometry.to_numpy())

    fixed = as_valid_coverage(metros, decimals=5)

    assert shapely.coverage_is_valid(fixed.geometry.to_numpy())
    assert list(fixed["NAME"]) == ["Lower", "Upper", "Right"]
    for before, after in zip(metros.geometry, fixed.geometry):
        assert after.equals(before) or after.symmetric_difference(before).area < 1e-9


def test_as_valid_coverage_gives_an_overlap_to_one_shape_only():
    from scripts.shared.geography.extract_california_metros import as_valid_coverage

    metros = gpd.GeoDataFrame(
        {"GEOID": ["a", "b"], "NAME": ["A", "B"], "ALT_NAME": [None, None]},
        geometry=[box(0, 0, 2.001, 1), box(2, 0, 4, 1)],
        crs=CRS,
    )

    fixed = as_valid_coverage(metros, decimals=5)

    assert shapely.coverage_is_valid(fixed.geometry.to_numpy())
    assert fixed.geometry[0].intersection(fixed.geometry[1]).area == 0
