import pytest

from scripts.components_of_change.config.columns import get_columns_config
from scripts.components_of_change.config.geography import get_components_geography
from scripts.components_of_change.validation.input_validators import (
    expand_locations,
    locations_for_subset,
    validate_locations,
    validate_metric_of_change,
    validate_parameters,
    validate_source,
    validate_subset,
    validate_year_bounds,
)


def test_validate_locations_rejects_national_locations_for_dof():
    with pytest.raises(ValueError, match="National data"):
        validate_locations(["NY"], ["DoF"], get_components_geography())


def test_validate_metric_of_change_rejects_total_for_rates():
    with pytest.raises(ValueError, match="crude rates"):
        validate_metric_of_change("Total", "Crude Birth Rate", get_columns_config())


def test_validate_year_bounds_applies_source_rules():
    with pytest.raises(ValueError, match="2011"):
        validate_year_bounds(["Census"], 2010, 2019)


def test_expand_locations_all_counties():
    result = expand_locations(["All Counties"], get_components_geography())

    assert "Alameda" in result
    assert "Bay Area" not in result


def test_locations_for_subset_removes_ca_for_county_numeric_change():
    result = locations_for_subset("Regions", get_components_geography(), "Numeric Change")

    assert "CA" not in result
    assert "Bay Area" in result


"""
========================================================================================================================
validate_parameters (previously untested)
========================================================================================================================
"""


def test_validate_parameters_accepts_valid_metrics():
    columns_config = get_columns_config()

    result = validate_parameters(["Total Population", "Births"], columns_config)

    assert result == ["Total Population", "Births"]


def test_validate_parameters_rejects_unknown_metric():
    with pytest.raises(ValueError, match="Invalid parameters"):
        validate_parameters(["Population Growth"], get_columns_config())


def test_validate_parameters_change_only_excludes_levels():
    # "Total Population" is valid normally but not a change/total parameter.
    with pytest.raises(ValueError, match="Invalid parameters"):
        validate_parameters(["Total Population"], get_columns_config(), change_only=True)


"""
========================================================================================================================
validate_source (previously untested)
========================================================================================================================
"""


def test_validate_source_single_returns_string():
    assert validate_source("DoF") == "DoF"


def test_validate_source_rejects_unknown_source():
    with pytest.raises(ValueError, match="Invalid source"):
        validate_source("ACS")


def test_validate_source_rejects_multiple_when_not_allowed():
    with pytest.raises(ValueError, match="Exactly one source"):
        validate_source(["DoF", "Census"])


def test_validate_source_allows_multiple_returns_list():
    assert validate_source(["DoF", "Census"], allow_multiple=True) == ["DoF", "Census"]


def test_validate_source_rejects_invalid_within_allowed_list():
    with pytest.raises(ValueError, match="Invalid source"):
        validate_source(["DoF", "ACS"], allow_multiple=True)


"""
========================================================================================================================
validate_subset (previously untested)
========================================================================================================================
"""


def test_validate_subset_accepts_known_subset():
    assert validate_subset("Counties", "DoF", get_components_geography()) == "Counties"


def test_validate_subset_rejects_unknown_subset():
    with pytest.raises(ValueError, match="Invalid subset"):
        validate_subset("Cities", "DoF", get_components_geography())


def test_validate_subset_states_requires_census():
    with pytest.raises(ValueError, match="National data"):
        validate_subset("States", "DoF", get_components_geography())


def test_validate_subset_states_with_census_ok():
    assert validate_subset("States", "Census", get_components_geography()) == "States"


"""
========================================================================================================================
Comprehensive variants of existing basic tests
========================================================================================================================
"""


def test_validate_locations_comprehensive():
    geography_config = get_components_geography()

    # California county/region locations pass for either source.
    assert validate_locations(["Alameda", "Bay Area", "CA"], ["DoF"], geography_config) == ["Alameda", "Bay Area", "CA"]
    # National state locations pass only when Census is among the sources.
    assert validate_locations(["NY"], ["Census"], geography_config) == ["NY"]
    # Unknown locations are rejected.
    with pytest.raises(ValueError, match="Invalid locations"):
        validate_locations(["Atlantis"], ["Census"], geography_config)
    # A single (non-list) source argument is accepted.
    assert validate_locations(["Alameda"], "DoF", geography_config) == ["Alameda"]


def test_validate_metric_of_change_comprehensive():
    columns_config = get_columns_config()

    for metric in ("Percent Change", "Numeric Change", "Total"):
        assert validate_metric_of_change(metric, "Births", columns_config) == metric
    # Totals over count parameters are allowed; only crude rates are blocked.
    assert validate_metric_of_change("Total", "Net Migration", columns_config) == "Total"
    with pytest.raises(ValueError, match="Invalid metric"):
        validate_metric_of_change("Average", "Births", columns_config)


def test_validate_year_bounds_comprehensive():
    # Valid DoF range returns the normalized tuple.
    assert validate_year_bounds(["DoF"], 1991, 2020) == (1991, 2020)
    # start_year may not exceed end_year.
    with pytest.raises(ValueError, match="cannot exceed"):
        validate_year_bounds(["DoF"], 2010, 2005)
    # DoF lower bound is enforced.
    with pytest.raises(ValueError, match="1991"):
        validate_year_bounds(["DoF"], 1985, 2000)
    # Census has no 2020 data.
    with pytest.raises(ValueError, match="No Census data for 2020"):
        validate_year_bounds(["Census"], 2019, 2020)
    # Availability bounds are enforced when provided.
    with pytest.raises(ValueError, match="No available DoF data"):
        validate_year_bounds(["DoF"], 1991, 2030, available={"DoF": [1991, 2024]})


def test_expand_locations_comprehensive():
    geography_config = get_components_geography()

    regions = expand_locations(["All Regions"], geography_config)
    assert "Bay Area" in regions
    assert "Alameda" not in regions
    # Explicit location lists pass through unchanged (and are copied, not aliased).
    explicit = ["Alameda", "Yuba"]
    result = expand_locations(explicit, geography_config)
    assert result == explicit
    assert result is not explicit


def test_locations_for_subset_comprehensive():
    geography_config = get_components_geography()

    # Percent Change keeps CA for the Regions subset (Counties never includes CA).
    assert "CA" in locations_for_subset("Regions", geography_config, "Percent Change")
    # Numeric Change / Total drop CA from county/region subsets.
    assert "CA" not in locations_for_subset("Regions", geography_config, "Total")
    # States subset is returned intact regardless of metric.
    states = locations_for_subset("States", geography_config, "Numeric Change")
    assert "CA" in states and "TX" in states
