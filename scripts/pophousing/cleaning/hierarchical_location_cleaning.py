import pandas as pd

from scripts.pophousing.config.geography import get_geography_config


def has_meaningful_housing_data(housing_row, value_columns):
    values = pd.Series([housing_row.get(column) for column in value_columns])
    numeric_values = pd.to_numeric(
        values.astype("string").str.replace(",", "", regex=False),
        errors="coerce",
    )
    return bool(numeric_values.fillna(0).gt(0).any())


def identify_county_headers(housing_df, county_names, location_col):
    if location_col not in housing_df.columns:
        raise KeyError(f"Missing column: {location_col}")

    county_headers = set()
    locations = housing_df[location_col].astype("string").str.strip()
    for position, (row_index, location) in enumerate(locations.items()):
        if location not in county_names:
            continue

        following_locations = locations.iloc[position + 1 : position + 11].dropna()
        if following_locations.eq("County Total").any():
            county_headers.add(row_index)
    return county_headers


def forward_fill_locations_with_context(housing_df, location_col, county_col):
    missing_columns = [
        column
        for column in (location_col, county_col)
        if column not in housing_df.columns
    ]
    if missing_columns:
        raise KeyError(f"Missing columns: {', '.join(missing_columns)}")

    result = housing_df.copy()
    locations = result[location_col].astype("string").str.strip()
    locations = locations.mask(locations.eq(""))
    result[location_col] = locations.ffill()
    return result


def build_county_context_column(housing_df, location_col, county_col, temp_col):
    if location_col not in housing_df.columns:
        raise KeyError(f"Missing column: {location_col}")

    result = housing_df.copy()
    if county_col in result.columns:
        counties = result[county_col].astype("string").str.strip()
        result[temp_col] = counties.mask(counties.eq("")).ffill()
        return result

    county_names = get_geography_config()["county_names"]
    header_indices = identify_county_headers(result, county_names, location_col)
    current_county = pd.NA
    county_context = []
    for row_index, location in result[location_col].items():
        if row_index in header_indices:
            current_county = str(location).strip()
        county_context.append(current_county)
    result[temp_col] = county_context
    return result
