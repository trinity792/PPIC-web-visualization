import pandas as pd
import pytest
from scripts.rhna_progress.geography.geographic_levels import (
    assign_county_and_region,
    classify_geographic_level,
)


def _geography():
    return {
        "region_names": {"Bay Area", "Los Angeles (Regional)"},
        "regions_mapping": {
            "Bay Area": ["Alameda"],
            "Los Angeles (Regional)": ["Los Angeles"],
        },
    }


def test_classify_geographic_level_uses_county_suffix():
    source = pd.DataFrame(
        {
            "Jurisdiction": ["Alameda", "Alameda County", "San Francisco County"],
        }
    )

    result = classify_geographic_level(source)

    assert result["Geographic Level"].tolist() == ["City", "County", "County"]


def test_classify_geographic_level_does_not_mutate_input():
    source = pd.DataFrame({"Jurisdiction": ["Alameda County"]})
    original = source.copy(deep=True)

    classify_geographic_level(source)

    pd.testing.assert_frame_equal(source, original)


def test_assign_county_and_region_joins_crosswalk_and_rolls_county_to_region():
    source = pd.DataFrame(
        {
            "Jurisdiction": ["Alameda", "Alameda County", "Los Angeles"],
            "Geographic Level": ["City", "County", "City"],
        }
    )
    crosswalk = pd.DataFrame(
        {
            "Jurisdiction": ["Alameda", "Los Angeles"],
            "County": ["Alameda", "Los Angeles"],
        }
    )

    result = assign_county_and_region(source, crosswalk, _geography())

    assert result.set_index("Jurisdiction")["County"].to_dict() == {
        "Alameda": "Alameda",
        "Alameda County": "Alameda",
        "Los Angeles": "Los Angeles",
    }
    assert result.set_index("Jurisdiction")["Region"].to_dict() == {
        "Alameda": "Bay Area",
        "Alameda County": "Bay Area",
        "Los Angeles": "Los Angeles (Regional)",
    }


def test_assign_county_and_region_fails_loud_on_unmapped_jurisdiction():
    source = pd.DataFrame(
        {
            "Jurisdiction": ["New City"],
            "Geographic Level": ["City"],
        }
    )
    crosswalk = pd.DataFrame({"Jurisdiction": ["Alameda"], "County": ["Alameda"]})

    with pytest.raises(ValueError, match="New City"):
        assign_county_and_region(source, crosswalk, _geography())


def test_assign_county_and_region_fails_loud_on_county_without_region():
    source = pd.DataFrame(
        {
            "Jurisdiction": ["Alpine County"],
            "Geographic Level": ["County"],
        }
    )
    crosswalk = pd.DataFrame(columns=["Jurisdiction", "County"])

    with pytest.raises(ValueError, match="Alpine"):
        assign_county_and_region(source, crosswalk, _geography())

