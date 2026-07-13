"""
schemas.py — exposes Demographic Projections column schemas, canonical value sets, and validation configs.

Data sources:
    - hardcoded DoF P-3 and Census cc-est reference schemas — canonical column names,
      race/ethnicity code maps, age-group labels, and California FIPS reference

Outputs:
    - dict — schema settings consumed by the cleaning, validation, and output phases

Usage:
    python scripts/projections/config/schemas.py

Test Folders:
    - scripts/unit_tests/projections/config/
"""

from datetime import datetime

"""
========================================================================================================================
Reference Constants
========================================================================================================================
"""

# Mandatory columns in the DoF P-3 source CSV. Each must occur exactly once;
# unrelated additional columns are tolerated and dropped by the cleaner.
P3_RAW_COLUMNS = ["fips", "year", "sex", "race7", "agerc", "perwt"]

# Official wide-format CC-EST{VINTAGE}-ALLDATA identifiers plus the 14 selected
# race-by-sex population fields used to construct the canonical rows.
CCEST_RAW_COLUMNS = [
    "SUMLEV",
    "STATE",
    "COUNTY",
    "STNAME",
    "CTYNAME",
    "YEAR",
    "AGEGRP",
    "NHWA_MALE",
    "NHWA_FEMALE",
    "NHBA_MALE",
    "NHBA_FEMALE",
    "NHIA_MALE",
    "NHIA_FEMALE",
    "NHAA_MALE",
    "NHAA_FEMALE",
    "NHNA_MALE",
    "NHNA_FEMALE",
    "NHTOM_MALE",
    "NHTOM_FEMALE",
    "H_MALE",
    "H_FEMALE",
]

# The 58 California counties in FIPS order (odd codes 001-115). California county
# FIPS codes are assigned alphabetically, so index N maps to FIPS 6001 + 2N.
_CALIFORNIA_COUNTIES_BY_FIPS = [
    "Alameda", "Alpine", "Amador", "Butte", "Calaveras", "Colusa",
    "Contra Costa", "Del Norte", "El Dorado", "Fresno", "Glenn", "Humboldt",
    "Imperial", "Inyo", "Kern", "Kings", "Lake", "Lassen", "Los Angeles",
    "Madera", "Marin", "Mariposa", "Mendocino", "Merced", "Modoc", "Mono",
    "Monterey", "Napa", "Nevada", "Orange", "Placer", "Plumas", "Riverside",
    "Sacramento", "San Benito", "San Bernardino", "San Diego", "San Francisco",
    "San Joaquin", "San Luis Obispo", "San Mateo", "Santa Barbara",
    "Santa Clara", "Santa Cruz", "Shasta", "Sierra", "Siskiyou", "Solano",
    "Sonoma", "Stanislaus", "Sutter", "Tehama", "Trinity", "Tulare",
    "Tuolumne", "Ventura", "Yolo", "Yuba",
]

# The 50 U.S. states. District of Columbia and Puerto Rico are deliberately
# excluded to match the legacy module's Census cc-est scope.
_US_STATE_NAMES = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
    "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
    "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
    "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
    "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
    "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
    "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
    "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
    "Washington", "West Virginia", "Wisconsin", "Wyoming",
]

# Canonical 5-year age groups; the "85+" bin aggregates ages 85-110 from P-3.
_CANONICAL_AGE_GROUPS = [
    "0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34", "35-39",
    "40-44", "45-49", "50-54", "55-59", "60-64", "65-69", "70-74", "75-79",
    "80-84", "85+",
]

# Bin edges for converting single-year ages (0-110) to 5-year groups; 85-110
# collapse into the open-ended "85+" bin.
_AGE_BIN_EDGES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85]


def _age_labels_from_edges(bin_edges):
    """Reconstruct 5-year group labels from bin edges; the final edge is open-ended ("85+")."""
    labels = []
    for index, edge in enumerate(bin_edges):
        if index == len(bin_edges) - 1:
            labels.append(f"{edge}+")
        else:
            labels.append(f"{edge}-{bin_edges[index + 1] - 1}")
    return labels


# Parity guard (B4): the canonical age-group labels are the single source of
# truth, and the bin edges must reconstruct exactly those labels. Any future edit
# that breaks parity between the two age-label construction routes fails at import
# (and in CI) rather than silently mismatching the completeness gate downstream.
assert _age_labels_from_edges(_AGE_BIN_EDGES) == _CANONICAL_AGE_GROUPS, (
    "Age-group bin edges and canonical labels have drifted apart: "
    f"{_age_labels_from_edges(_AGE_BIN_EDGES)} != {_CANONICAL_AGE_GROUPS}"
)

# Soft sanity window for P-3 projection years. Rather than pin the horizon to a
# single vintage (the legacy hard-coded 2020-2070), the cleaner accepts any range
# inside these bounds and spanning no more than _P3_MAX_YEAR_SPAN years, so a new
# P-3 vintage with a shifted horizon (e.g. Baseline 2028 -> 2025-2075) ingests
# automatically while a garbage year (9999) still fails (A3).
_P3_YEAR_SANE_BOUNDS = (2015, 2100)
_P3_MAX_YEAR_SPAN = 60

# Base race/ethnicity strata (excludes the "All" aggregate).
_CANONICAL_RACE_GROUPS = ["White", "Black", "Asian", "NHPI", "AIAN", "Multiracial", "Hispanic"]

# Base sex strata (excludes the "Both Sexes" aggregate).
_CANONICAL_SEXES = ["Male", "Female"]

# DoF P-3 race7 codes (Baseline 2024, Vintage 2026), keyed by numeric code.
_P3_RACE7_CODE_MAP = {
    1: "White",        # White, Non-Hispanic
    2: "Black",        # Black, Non-Hispanic
    3: "AIAN",         # American Indian or Alaska Native, Non-Hispanic
    4: "Asian",        # Asian, Non-Hispanic
    5: "NHPI",         # Native Hawaiian or Pacific Islander, Non-Hispanic
    6: "Multiracial",  # Two or more races, Non-Hispanic
    7: "Hispanic",     # Hispanic (any race)
}

# Census cc-est wide race-column prefixes mapped to the canonical groups.
_CENSUS_RACE_CODE_MAP = {
    "NHWA": "White",
    "NHBA": "Black",
    "NHIA": "AIAN",
    "NHAA": "Asian",
    "NHNA": "NHPI",
    "NHTOM": "Multiracial",
    "H": "Hispanic",
}

# Census cc-est YEAR codes decode by a stable arithmetic law: calendar year =
# base + code (code 2 -> 2020, code 3 -> 2021, ...). YEAR=1 is the April-2020
# estimates base and is excluded. The decode is derived rather than tabulated so
# a new vintage (e.g. code 8 -> 2026) ingests automatically instead of raising;
# see get_schema_config's census_year_* keys and the A2 resolution.
_CENSUS_YEAR_BASE = 2018

# The YEAR code that denotes the April-2020 estimates base (a semantic exclusion,
# not a decode gap).
_CENSUS_BASE_YEAR_CODE = 1

_OUTPUT_COLUMNS = [
    "Geographic Level",
    "Location",
    "Year",
    "Age Group",
    "Sex",
    "Race/Ethnicity",
    "Population",
    "Source",
]


def _build_fips_to_county_map():
    """Pair the 58 FIPS-ordered county names with their odd 6001-6115 codes."""
    fips_codes = range(6001, 6116, 2)
    return {fips: county for fips, county in zip(fips_codes, _CALIFORNIA_COUNTIES_BY_FIPS)}


"""
========================================================================================================================
Schema Configuration
========================================================================================================================
"""


def get_schema_config():
    """Return isolated schema and validation configuration for the Demographic Projections pipeline. Test file: scripts/unit_tests/projections/config/test_schemas.py"""
    cleaning_required_columns = [
        "Geographic Level",
        "Location",
        "Year",
        "Age Group",
        "Sex",
        "Race/Ethnicity",
        "Population",
    ]
    completeness_group_columns = ["Geographic Level", "Location", "Year", "Source"]
    cleaning_validation_config = {
        "required_columns": list(cleaning_required_columns),
        "critical_columns": [
            "Geographic Level",
            "Location",
            "Year",
            "Age Group",
            "Sex",
            "Race/Ethnicity",
        ],
        "population_column": "Population",
        "nonnegative_columns": ["Population"],
        "canonical_age_groups": list(_CANONICAL_AGE_GROUPS),
        "canonical_sexes": list(_CANONICAL_SEXES),
        "canonical_race_groups": list(_CANONICAL_RACE_GROUPS),
    }
    final_validation_config = {
        "required_columns": list(_OUTPUT_COLUMNS),
        "duplicate_key_columns": [
            "Geographic Level",
            "Location",
            "Year",
            "Age Group",
            "Sex",
            "Race/Ethnicity",
            "Source",
        ],
        "expected_levels": ["County", "Region", "State", "US State"],
        "population_column": "Population",
        # Default to the wide soft sanity window; the orchestrator narrows this to
        # the range actually observed across the two sources so the final gate
        # tracks the ingested vintage instead of a frozen horizon (A3).
        "year_range": _P3_YEAR_SANE_BOUNDS,
        "min_rows": 1,
        "max_rows": None,
    }

    current_year = datetime.now().year

    return {
        "output_columns": list(_OUTPUT_COLUMNS),
        "required_columns": list(_OUTPUT_COLUMNS),
        "population_column": "Population",
        "year_column": "Year",
        "location_column": "Location",
        "level_column": "Geographic Level",
        "source_column": "Source",
        "age_group_column": "Age Group",
        "sex_column": "Sex",
        "race_column": "Race/Ethnicity",
        "p3_raw_columns": list(P3_RAW_COLUMNS),
        # Soft sanity bounds + max span for the observed P-3 horizon (A3). The
        # cleaner validates the actually-observed (min, max) years fall inside
        # these bounds instead of asserting a fixed 2020-2070 window.
        "p3_year_sane_bounds": _P3_YEAR_SANE_BOUNDS,
        "p3_max_year_span": _P3_MAX_YEAR_SPAN,
        "p3_age_range": (0, 110),
        "fips_to_county_map": _build_fips_to_county_map(),
        "p3_race7_code_map": dict(_P3_RACE7_CODE_MAP),
        "ccest_raw_columns": list(CCEST_RAW_COLUMNS),
        "census_race_code_map": dict(_CENSUS_RACE_CODE_MAP),
        # Rename aggregated cc-est identifier headers to canonical pipeline names;
        # the race-by-sex population columns keep their raw names for reshaping.
        "census_rename_map": {
            "STNAME": "Location",
            "YEAR": "Year",
            "AGEGRP": "Age Group",
        },
        # Census YEAR is decoded arithmetically (calendar = base + code) with a
        # sane-range guard, so any future vintage ingests without a code-map edit
        # (A2 derive-and-accept). Codes whose decoded year falls outside the sane
        # range are quarantined by the cleaner (B2), not fatal.
        "census_year_base": _CENSUS_YEAR_BASE,
        "census_base_year_code": _CENSUS_BASE_YEAR_CODE,
        "census_year_sane_range": (2020, current_year + 1),
        "census_age_group_code_map": {
            code: label for code, label in enumerate(_CANONICAL_AGE_GROUPS, start=1)
        },
        "census_state_names": list(_US_STATE_NAMES),
        "completeness_group_columns": list(completeness_group_columns),
        "age_bin_edges": list(_AGE_BIN_EDGES),
        "canonical_age_groups": list(_CANONICAL_AGE_GROUPS),
        "canonical_sexes": list(_CANONICAL_SEXES),
        "canonical_race_groups": list(_CANONICAL_RACE_GROUPS),
        "sex_label_map": {"MALE": "Male", "FEMALE": "Female"},
        "cleaning_validation_config": cleaning_validation_config,
        "final_validation_config": final_validation_config,
    }
