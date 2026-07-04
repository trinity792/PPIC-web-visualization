"""
dof_p3_cleaner.py — cleans the DoF P-3 demographic projections CSV.

The P-3 source is a flat, long-format CSV (one population count per row) with columns:
fips (county FIPS code), year, sex (MALE/FEMALE), race7 (1-7), agerc (0-110), perwt (population).
The data is already one-row-per-record, so no wide-to-long reshaping is needed. Cleaning
consists of: FIPS-to-county-name mapping, race code decoding, single-year-age binning to
5-year groups (summing perwt within each bin), and sex label standardization.

Data sources:
    - {download_directory}/P-3_{FILENAME}.csv — extracted P-3 CSV (columns: fips, year, sex, race7, agerc, perwt)

Outputs:
    - pandas.DataFrame — cleaned County rows matching the canonical cleaning-stage schema

Usage:
    Called by the projections pipeline orchestrator; not run standalone.

Test Folders:
    - scripts/unit_tests/projections/cleaning/
"""

from collections import Counter

import pandas as pd

from scripts.projections.cleaning.race_ethnicity_mapping import map_race_ethnicity

_CLEANING_OUTPUT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Year",
    "Sex",
    "Race/Ethnicity",
    "Age Group",
    "Population",
]

"""
========================================================================================================================
Column Mapping
========================================================================================================================
"""


def map_fips_to_county(df, fips_column, fips_to_county_map):
    """Replace numeric FIPS codes with county names and rename the column to Location. Test file: scripts/unit_tests/projections/cleaning/test_dof_p3_cleaner.py"""
    codes = pd.to_numeric(df[fips_column], errors="coerce").astype("Int64")
    unmapped = sorted(
        {int(code) for code in codes.dropna().unique() if int(code) not in fips_to_county_map}
    )
    if unmapped:
        raise ValueError(f"Unmapped FIPS code(s): {unmapped}")

    result = df.copy()
    result["Location"] = [fips_to_county_map[int(code)] for code in codes]
    return result.drop(columns=[fips_column])


def standardize_sex_labels(df, sex_column, label_map):
    """Replace raw sex strings with canonical labels ("MALE" to "Male", "FEMALE" to "Female"). Test file: scripts/unit_tests/projections/cleaning/test_dof_p3_cleaner.py"""
    if sex_column not in df.columns:
        raise ValueError(f"Missing required sex column: {sex_column}")

    unmapped = sorted(
        (value for value in df[sex_column].unique() if value not in label_map),
        key=str,
    )
    if unmapped:
        raise ValueError(f"Unmapped sex value(s): {unmapped}")

    result = df.copy()
    result["Sex"] = result[sex_column].map(label_map)
    return result.drop(columns=[sex_column])


"""
========================================================================================================================
Age Binning
========================================================================================================================
"""


def bin_single_year_ages(df, age_column, population_column, bin_edges, groupby_columns):
    """Bin single-year ages (0-110) into 5-year groups and sum population within each bin. Test file: scripts/unit_tests/projections/cleaning/test_dof_p3_cleaner.py"""
    labels = _labels_from_bin_edges(bin_edges)
    bins = [*bin_edges, float("inf")]

    result = df.copy()
    result["Age Group"] = pd.cut(
        result[age_column],
        bins=bins,
        right=False,
        labels=labels,
        ordered=False,
    ).astype(str)

    return (
        result.groupby([*groupby_columns, "Age Group"], observed=True, sort=False)[population_column]
        .sum()
        .reset_index()
    )


def _labels_from_bin_edges(bin_edges):
    """Reconstruct 5-year group labels from bin edges; the final edge is open-ended ("85+")."""
    labels = []
    for index, edge in enumerate(bin_edges):
        if index == len(bin_edges) - 1:
            labels.append(f"{edge}+")
        else:
            labels.append(f"{edge}-{bin_edges[index + 1] - 1}")
    return labels


"""
========================================================================================================================
Entry Point
========================================================================================================================
"""


def clean_p3_projections(csv_path, schema_config):
    """Full P-3 cleaner entry point: validate mandatory columns, map FIPS/race/sex, bin ages, and validate the result. Test file: scripts/unit_tests/projections/cleaning/test_dof_p3_cleaner.py"""
    raw_columns = schema_config["p3_raw_columns"]
    _validate_p3_header(csv_path, raw_columns)

    # Read only the mandatory columns (header already validated) — avoids
    # loading unused columns and the extra full-frame copy of a subset slice.
    df = pd.read_csv(csv_path, usecols=raw_columns)
    _validate_p3_values(df, schema_config)

    df = map_fips_to_county(df, "fips", schema_config["fips_to_county_map"])
    df = map_race_ethnicity(df, "race7", schema_config["p3_race7_code_map"])
    df = standardize_sex_labels(df, "sex", schema_config["sex_label_map"])
    df = df.rename(columns={"year": "Year"})
    df["perwt"] = df["perwt"].astype("int64")

    binned = bin_single_year_ages(
        df,
        "agerc",
        "perwt",
        schema_config["age_bin_edges"],
        ["Location", "Year", "Sex", "Race/Ethnicity"],
    )
    binned = binned.rename(columns={"perwt": "Population"})
    binned["Geographic Level"] = "County"
    return binned[_CLEANING_OUTPUT_COLUMNS].reset_index(drop=True)


# ── Validation Helpers ────────────────────────────────────────────────────────


def _validate_p3_header(csv_path, raw_columns):
    """Confirm each mandatory column appears exactly once in the raw header."""
    with open(csv_path, encoding="utf-8") as csv_file:
        header_line = csv_file.readline().strip()
    header_counts = Counter(column.strip() for column in header_line.split(","))

    missing = [column for column in raw_columns if header_counts[column] == 0]
    if missing:
        raise ValueError(f"P-3 CSV is missing required column(s): {', '.join(missing)}")

    duplicated = [column for column in raw_columns if header_counts[column] > 1]
    if duplicated:
        raise ValueError(f"P-3 CSV has duplicate required column(s): {', '.join(duplicated)}")


def _validate_p3_values(df, schema_config):
    """Reject null, out-of-range, negative, or non-integral mandatory values."""
    raw_columns = schema_config["p3_raw_columns"]
    null_columns = [column for column in raw_columns if df[column].isnull().any()]
    if null_columns:
        raise ValueError(f"P-3 mandatory column(s) contain null/missing values: {null_columns}")

    year_min, year_max = schema_config["p3_year_range"]
    years = pd.to_numeric(df["year"], errors="coerce")
    if ((years < year_min) | (years > year_max)).any():
        raise ValueError(f"P-3 year values must be within {year_min}-{year_max}")

    age_min, age_max = schema_config["p3_age_range"]
    ages = pd.to_numeric(df["agerc"], errors="coerce")
    if ((ages < age_min) | (ages > age_max)).any():
        raise ValueError(f"P-3 agerc (age) values must be within {age_min}-{age_max}")

    populations = pd.to_numeric(df["perwt"], errors="coerce")
    if (populations < 0).any():
        raise ValueError("P-3 perwt (population) values must be non-negative")
    if (populations % 1 != 0).any():
        raise ValueError("P-3 perwt (population) values must be integers")
