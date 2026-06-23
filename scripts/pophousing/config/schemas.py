from datetime import date

from lib.pophousing_config import E5_COLUMN_NAMES


def get_schema_config():
    numeric_columns = [
        "Total Population",
        "Household Population",
        "Group Quarters Population",
        "Total Housing Units",
        "Single Family Detached Units",
        "Single Family Attached Units",
        "Two to Four Family Units",
        "Five Plus Family Units",
        "Mobile Homes",
        "Occupied Units",
        "Vacancy Rate (%)",
        "Persons Per Household",
    ]
    output_columns = [
        "Geographic Level",
        "Location",
        "Year",
        "Total Population",
        "Household Population",
        "Group Quarters Population",
        "Total Housing Units",
        "Single Family Units",
        "Multiple Family Units",
        "Mobile Homes",
        "Occupied Units",
        "Vacancy Rate (%)",
        "Persons Per Household",
        "Single Family Detached Units",
        "Single Family Attached Units",
        "Two to Four Family Units",
        "Five Plus Family Units",
        "Vacant Units",
        "Source",
    ]
    required_cleaning_columns = [
        "Location",
        "Geographic Level",
        "Year",
        "Total Population",
        "Total Housing Units",
        "Single Family Units",
        "Multiple Family Units",
        "Occupied Units",
        "Vacant Units",
    ]
    final_validation = {
        "required_columns": list(output_columns),
        "duplicate_key_columns": ["Location", "Geographic Level", "Year"],
        "valid_levels": ["City", "County", "Region", "State", "Town"],
        "required_levels": ["City", "County", "Region", "State", "Town"],
        "location_column": "Location",
        "level_column": "Geographic Level",
        "year_column": "Year",
        "minimum_year": 1991,
        "maximum_year": date.today().year,
        "state_name": "California",
        "state_level": "State",
        "san_francisco_name": "San Francisco",
        "bay_area_name": "Bay Area",
        "bay_area_year": 2020,
        "bay_area_population_minimum": 7_000_000,
        "bay_area_population_maximum": 9_000_000,
        "nonnegative_columns": [
            "Total Population",
            "Total Housing Units",
        ],
        "vacancy_rate_column": "Vacancy Rate (%)",
        "vacancy_rate_minimum": 0,
        "vacancy_rate_maximum": 100,
        "persons_per_household_column": "Persons Per Household",
        "persons_per_household_minimum": 0,
        "persons_per_household_maximum": 10,
    }

    return {
        "e5_column_names": list(E5_COLUMN_NAMES),
        "raw_column_mapping": {"Region": "County", "City": "Location"},
        "anchor_column": "Region",
        "anchor_value": "Alameda",
        "date_column": "Date",
        "year_column": "Year",
        "minimum_year": 2020,
        "maximum_year": None,
        "numeric_columns": list(numeric_columns),
        "zero_fill_columns": list(numeric_columns),
        "summary_patterns": [
            r"^Balance of ",
            r"^Incorporated ",
        ],
        "summary_keep_values": ["County Total", "State Total"],
        "header_patterns": [
            r"^Cities? and Towns?$",
            r"^Incorporated Cities?$",
        ],
        "meaningful_data_columns": [
            "Total Population",
            "Household Population",
            "Group Quarters Population",
            "Total Housing Units",
            "Occupied Units",
        ],
        "output_columns": list(output_columns),
        "cleaning_validation": {
            "required_columns": list(required_cleaning_columns),
            "critical_columns": ["Location", "Geographic Level", "Year"],
            "duplicate_key_columns": [
                "Geographic Level",
                "Location",
                "Year",
            ],
            "valid_levels": ["City", "County", "Region", "State", "Town"],
            "nonnegative_numeric_columns": [
                column
                for column in required_cleaning_columns
                if column
                not in {"Location", "Geographic Level", "Year"}
            ],
        },
        "final_validation": final_validation,
    }
