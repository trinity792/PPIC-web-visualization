"""
columns.py — exposes Components of Change schema, metric, and rename settings.

Data sources:
    - hardcoded legacy Components of Change schema — canonical column names and metric mappings

Outputs:
    - dict — isolated schema, parameter, and validation settings used by Components modules

Usage:
    python scripts/components_of_change/config/columns.py

Test Folders:
    - scripts/unit_tests/components_of_change/config/
"""

"""
========================================================================================================================
Column Configuration
========================================================================================================================
"""


def get_columns_config():
    """Return isolated Components column settings. Test file: scripts/unit_tests/components_of_change/config/test_columns.py"""
    canonical_columns = [
        "Location",
        "Year",
        "Total Population",
        "Percent Change in Population",
        "Numeric Change in Population",
        "Births",
        "Deaths",
        "Natural Increase",
        "Net Migration",
        "Net Foreign Immigration",
        "Net Domestic Migration",
    ]
    component_columns = [
        "Births",
        "Deaths",
        "Natural Increase",
        "Net Migration",
        "Net Foreign Immigration",
        "Net Domestic Migration",
    ]
    crude_rate_component_map = {
        "Crude Birth Rate": "Births",
        "Crude Death Rate": "Deaths",
        "Crude Migration Rate": "Net Migration",
        "Crude Domestic Migration Rate": "Net Domestic Migration",
        "Crude Foreign Migration Rate": "Net Foreign Immigration",
    }
    rate_columns = list(crude_rate_component_map)
    valid_parameters = [
        "Total Population",
        "Percent Change in Population",
        "Numeric Change in Population",
        *component_columns,
        *rate_columns,
    ]
    chart_change_parameters = [*component_columns, *rate_columns]
    output_columns = [
        "Geographic Level",
        "Location",
        "Year",
        "Total Population",
        "Percent Change in Population",
        "Numeric Change in Population",
        *component_columns,
        *rate_columns,
        "Source",
    ]
    census_rename_map = {
        "CTYNAME": "Location",
        "BIRTHS": "Births",
        "DEATHS": "Deaths",
        "DOMESTICMIG": "Net Domestic Migration",
        "POPESTIMATE": "Total Population",
        "INTERNATIONALMIG": "Net Foreign Immigration",
        "NATURALCHG": "Natural Increase",
        "NETMIG": "Net Migration",
    }
    return {
        "canonical_columns": list(canonical_columns),
        "component_columns": list(component_columns),
        "numeric_columns": [
            "Total Population",
            "Percent Change in Population",
            "Numeric Change in Population",
            *component_columns,
        ],
        "crude_rate_component_map": dict(crude_rate_component_map),
        "rate_columns": list(rate_columns),
        "valid_parameters": list(valid_parameters),
        "chart_change_parameters": list(chart_change_parameters),
        "census_rename_map": dict(census_rename_map),
        "output_columns": list(output_columns),
        "duplicate_key_columns": ["Location", "Year", "Source"],
    }
