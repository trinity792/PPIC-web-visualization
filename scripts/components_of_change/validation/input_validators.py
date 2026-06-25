"""
input_validators.py — validates notebook-facing Components of Change chart inputs.

Data sources:
    - user-provided chart parameters, locations, sources, subsets, and year bounds
    - Components column and geography configuration dictionaries

Outputs:
    - normalized inputs or raised ValueError with actionable validation messages

Usage:
    python scripts/components_of_change/validation/input_validators.py

Test Folders:
    - scripts/unit_tests/components_of_change/validation/
"""

"""
========================================================================================================================
Input Validation
========================================================================================================================
"""


def validate_parameters(parameters, columns_config, change_only=False):
    """Validate selected Components metrics. Test file: scripts/unit_tests/components_of_change/validation/test_input_validators.py"""
    valid_parameters = set(columns_config["chart_change_parameters"] if change_only else columns_config["valid_parameters"])
    invalid_parameters = [parameter for parameter in parameters if parameter not in valid_parameters]
    if invalid_parameters:
        raise ValueError(f"Invalid parameters selected: {', '.join(invalid_parameters)}")
    return list(parameters)


def validate_locations(locations, source, geography_config):
    """Validate selected locations and source/location compatibility. Test file: scripts/unit_tests/components_of_change/validation/test_input_validators.py"""
    invalid_locations = [location for location in locations if location not in geography_config["valid_locations"]]
    if invalid_locations:
        raise ValueError(f"Invalid locations selected: {', '.join(invalid_locations)}")
    sources = set(source if isinstance(source, list) else [source])
    national_locations = set(locations) - geography_config["county_names"] - geography_config["region_names"] - {"CA", "All Counties", "All Regions"}
    if national_locations and "Census" not in sources:
        raise ValueError("National data only available for Census")
    return list(locations)


def validate_source(source, allow_multiple=False):
    """Validate one or more Components sources. Test file: scripts/unit_tests/components_of_change/validation/test_input_validators.py"""
    valid_sources = {"DoF", "Census"}
    sources = source if isinstance(source, list) else [source]
    if not allow_multiple and len(sources) != 1:
        raise ValueError("Exactly one source is required")
    invalid_sources = [item for item in sources if item not in valid_sources]
    if invalid_sources:
        raise ValueError(f"Invalid source selected: {', '.join(invalid_sources)}")
    return list(sources) if allow_multiple else sources[0]


def validate_subset(subset, source, geography_config):
    """Validate a location subset and source/subset compatibility. Test file: scripts/unit_tests/components_of_change/validation/test_input_validators.py"""
    if subset not in geography_config["valid_subsets"]:
        raise ValueError(f"Invalid subset selected: {subset}")
    if subset == "States" and source != "Census":
        raise ValueError("National data only available for Census")
    return subset


def validate_metric_of_change(metric_of_change, parameter, columns_config):
    """Validate change metric and prevent totals over crude rates. Test file: scripts/unit_tests/components_of_change/validation/test_input_validators.py"""
    valid_metrics = {"Percent Change", "Numeric Change", "Total"}
    if metric_of_change not in valid_metrics:
        raise ValueError(f"Invalid metric of change: {metric_of_change}")
    if metric_of_change == "Total" and parameter in columns_config["rate_columns"]:
        raise ValueError("Aggregating totals over a period of years does not work for crude rates")
    return metric_of_change


def validate_year_bounds(source, start_year, end_year, available=None):
    """Validate source-specific year bounds. Test file: scripts/unit_tests/components_of_change/validation/test_input_validators.py"""
    if start_year > end_year:
        raise ValueError("start_year cannot exceed end_year")
    sources = source if isinstance(source, list) else [source]
    if "DoF" in sources and start_year < 1991:
        raise ValueError("Invalid start year for DoF. Must be 1991 or after")
    if "Census" in sources and start_year < 2011:
        raise ValueError("Invalid start year for Census. Must be 2011 or after")
    if "Census" in sources and (start_year == 2020 or end_year == 2020):
        raise ValueError("No Census data for 2020")
    if available is not None:
        for item in sources:
            source_years = available.get(item, [])
            if source_years and (start_year < min(source_years) or end_year > max(source_years)):
                raise ValueError(f"No available {item} data for requested year bounds")
    return start_year, end_year


def expand_locations(locations, geography_config):
    """Expand All Counties and All Regions aliases into concrete location lists. Test file: scripts/unit_tests/components_of_change/validation/test_input_validators.py"""
    if locations == ["All Counties"]:
        return list(geography_config["line_expansions"]["All Counties"])
    if locations == ["All Regions"]:
        return list(geography_config["line_expansions"]["All Regions"])
    return list(locations)


def locations_for_subset(subset, geography_config, metric_of_change=None):
    """Return configured locations for a chart subset. Test file: scripts/unit_tests/components_of_change/validation/test_input_validators.py"""
    locations = list(geography_config["subset_locations"][subset])
    if metric_of_change in {"Numeric Change", "Total"} and subset in {"Counties", "Regions"} and "CA" in locations:
        locations.remove("CA")
    return locations
