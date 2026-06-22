from scripts.pophousing.calculations.housing_metrics import (
    add_housing_derived_columns,
)
from scripts.pophousing.cleaning.e5_schema_normalizer import (
    normalize_e5_columns,
    rename_e5_schema,
    trim_to_first_data_row,
)
from scripts.pophousing.cleaning.geographic_classification import (
    apply_town_overrides,
    assign_geographic_level_with_context,
    assign_missing_geographic_levels,
    drop_helper_columns,
    normalize_state_total_rows,
    remove_balance_rows,
    resolve_county_total_rows,
    sanitize_geographic_levels,
)
from scripts.pophousing.cleaning.hierarchical_location_cleaning import (
    build_county_context_column,
    forward_fill_locations_with_context,
)
from scripts.pophousing.cleaning.location_standardization import (
    standardize_location_column,
)
from scripts.pophousing.validation.cleaning_validators import (
    validate_cleaned_e5_data,
)
from scripts.shared.data_cleaning.dataframe_operations import forward_fill_columns
from scripts.shared.data_cleaning.row_filters import (
    drop_empty_rows_without_data,
    filter_year_range,
    remove_header_like_rows,
    remove_summary_rows,
)
from scripts.shared.data_cleaning.type_conversions import (
    coerce_numeric_columns,
    parse_year_from_date,
)


def clean_e5_data(raw_e5_df, schema_config, geography_config):
    housing_df = normalize_e5_columns(
        raw_e5_df, schema_config["e5_column_names"]
    )
    housing_df = trim_to_first_data_row(
        housing_df,
        schema_config["anchor_value"],
        schema_config["anchor_column"],
    )
    housing_df = rename_e5_schema(
        housing_df, schema_config["raw_column_mapping"]
    )
    housing_df = forward_fill_columns(housing_df, ["County"])
    housing_df = remove_summary_rows(
        housing_df,
        "Location",
        schema_config["summary_keep_values"],
        schema_config["summary_patterns"],
    )
    housing_df = remove_header_like_rows(
        housing_df, "Location", schema_config["header_patterns"]
    )
    housing_df = forward_fill_locations_with_context(
        housing_df, "Location", "County"
    )
    housing_df = drop_empty_rows_without_data(
        housing_df,
        "Location",
        schema_config["meaningful_data_columns"],
    )
    housing_df = build_county_context_column(
        housing_df, "Location", "County", "_temp_county"
    )

    housing_df = parse_year_from_date(
        housing_df,
        schema_config["date_column"],
        schema_config["year_column"],
    )
    housing_df = filter_year_range(
        housing_df,
        schema_config["year_column"],
        schema_config["minimum_year"],
        schema_config["maximum_year"],
    )
    housing_df = housing_df.drop(columns=[schema_config["date_column"]])
    housing_df = coerce_numeric_columns(
        housing_df, schema_config["numeric_columns"]
    )
    housing_df[schema_config["zero_fill_columns"]] = housing_df[
        schema_config["zero_fill_columns"]
    ].fillna(0)
    housing_df = add_housing_derived_columns(housing_df)

    housing_df = resolve_county_total_rows(
        housing_df, "Location", "_temp_county"
    )
    housing_df = normalize_state_total_rows(
        housing_df, "Location", geography_config["state_name"]
    )
    housing_df = assign_missing_geographic_levels(
        housing_df,
        assign_geographic_level_with_context,
        "Location",
        "_temp_county",
        "Total Population",
        "Geographic Level",
    )
    housing_df = apply_town_overrides(
        housing_df,
        geography_config["town_names"],
        "Location",
        "Geographic Level",
    )
    housing_df = sanitize_geographic_levels(
        housing_df,
        geography_config["valid_levels"],
        geography_config["default_level"],
    )
    housing_df = standardize_location_column(
        housing_df,
        "Location",
        "Geographic Level",
        ("City", "Town"),
    )
    housing_df = remove_balance_rows(housing_df, "Location")
    housing_df = drop_helper_columns(housing_df, ["County", "_temp_county"])
    housing_df["Source"] = "E-5"
    housing_df = housing_df[schema_config["output_columns"]].reset_index(drop=True)

    is_valid, validation_messages = validate_cleaned_e5_data(
        housing_df, schema_config["cleaning_validation"]
    )
    if not is_valid:
        raise ValueError(
            "Cleaned E-5 validation failed: " + "; ".join(validation_messages)
        )
    return housing_df
