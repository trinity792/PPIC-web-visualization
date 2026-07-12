"""Population & Housing-specific configuration."""

from typing import List

from lib.config import get_default_http_settings, get_project_paths

_project_paths = get_project_paths()
_http_settings = get_default_http_settings()

# --- Web Scraping Settings ---
DOF_BASE_URL = "https://dof.ca.gov/forecasting/demographics/estimates/"
# Use a modern user-agent to avoid being blocked
# User-Agent to avoid being blocked by servers
REQUESTS_HEADERS = _http_settings["headers"]
# timeout for web requests (in seconds)
REQUESTS_TIMEOUT = _http_settings["timeout_seconds"]

# --- File Paths ---


ROOT_DIR = str(_project_paths["project_root"])
DATA_DIR = str(_project_paths["data_directory"])
CURRENT_DATA_PATH = str(
    _project_paths["cleaned_data_directory"]
    / "housing-population"
    / "PopHousing_Current.csv"
)
# Deep pre-2020 history lives in its own immutable, committed artifact — NOT the
# pipeline's own output. The Phase 0 builder writes this file; the main pipeline
# only reads it. Decoupling it from CURRENT_DATA_PATH removes the self-
# perpetuating-history drift channel (see refactor guide, Flagged Issue A1).
HISTORICAL_BASELINE_PATH = str(
    _project_paths["cleaned_data_directory"]
    / "housing-population"
    / "PopHousing_Historical_E8.csv"
)
# Sidecar recording the baseline's coverage/build provenance for freshness checks.
HISTORICAL_BASELINE_METADATA_PATH = str(
    _project_paths["cleaned_data_directory"]
    / "housing-population"
    / "PopHousing_Historical_E8.meta.json"
)
HISTORICAL_DATA_PATH = HISTORICAL_BASELINE_PATH
ARCHIVE_DATA_PATH = str(
    _project_paths["archive_directory"] / "housing-population"
)
DOWNLOAD_DIR = str(
    _project_paths["raw_data_directory"] / "housing-population"
)
DELETION_LOG_DIR = str(_project_paths["logs_directory"] / "deletions")


# --- Data Cleaning & Mapping ---
E5_COLUMN_NAMES = [
    'Region', 'City', 'Date', 'Total Population', 'Household Population', 
    'Group Quarters Population', 'Total Housing Units', 'Single Family Detached Units', 
    'Single Family Attached Units', 'Two to Four Family Units', 'Five Plus Family Units', 
    'Mobile Homes', 'Occupied Units', 'Vacancy Rate (%)', 'Persons Per Household'
]

# Defines the counties that make up each custom region.
REGIONS_MAPPING = {
    'Far North': ['Butte', 'Colusa', 'Del Norte', 'Glenn', 'Humboldt', 'Lake', 'Lassen', 'Mendocino', 'Modoc', 'Nevada', 'Plumas', 'Shasta', 'Sierra', 'Siskiyou', 'Sutter', 'Tehama', 'Trinity', 'Yuba'],
    'Bay Area': ['Alameda', 'Contra Costa', 'Marin', 'Napa', 'San Francisco', 'San Mateo', 'Santa Clara', 'Solano', 'Sonoma'],
    'San Diego (Regional)': ['San Diego', 'Imperial'],
    'Inland Empire': ['Riverside', 'San Bernardino'],
    'Sacramento (Regional)': ['El Dorado', 'Placer', 'Sacramento', 'Yolo'],
    'North San Joaquin Valley': ['Merced', 'San Joaquin', 'Stanislaus'],
    'South San Joaquin Valley': ['Fresno', 'Kern', 'Kings', 'Madera', 'Tulare', 'Alpine', 'Amador', 'Calaveras', 'Inyo', 'Mariposa', 'Mono', 'Tuolumne'],
    'Central Coast': ['Monterey', 'San Benito', 'San Luis Obispo', 'Santa Barbara', 'Santa Cruz'],
    'Los Angeles (Regional)': ['Los Angeles', 'Orange', 'Ventura']
}

# --- Geographic Level Classification ---
STATE_LEVEL = ['California']
REGION_LEVEL = list(REGIONS_MAPPING.keys())
COUNTY_LEVEL = [
    'Alameda', 'Alpine', 'Amador', 'Butte', 'Calaveras', 'Colusa', 'Contra Costa', 'Del Norte', 
    'El Dorado', 'Fresno', 'Glenn', 'Humboldt', 'Imperial', 'Inyo', 'Kern', 'Kings', 'Lake', 
    'Lassen', 'Los Angeles', 'Madera', 'Marin', 'Mariposa', 'Mendocino', 'Merced', 'Modoc', 
    'Mono', 'Monterey', 'Napa', 'Nevada', 'Orange', 'Placer', 'Plumas', 'Riverside', 
    'Sacramento', 'San Benito', 'San Bernardino', 'San Diego', 'San Joaquin', 
    'San Luis Obispo', 'San Mateo', 'Santa Barbara', 'Santa Clara', 'Santa Cruz', 'Shasta', 
    'Sierra', 'Siskiyou', 'Solano', 'Sonoma', 'Stanislaus', 'Sutter', 'Tehama', 'Trinity', 
    'Tulare', 'Tuolumne', 'Ventura', 'Yolo', 'Yuba'
]

AMBIGUOUS_CITY_NAMES = [
    'Alameda', 'Orange', 'San Diego', 
    'San Bernardino', 'San Francisco', 'Los Angeles', 
    'Ventura', 'Santa Clara', 'San Mateo', 'San Joaquin', 
    'Solano', 'Sonoma', 'Yolo', 'Yuba', 'Marin', 'Merced', 
    'Napa', 'Placer', 'Riverside', 'Sacramento', 'San Benito', 
    'San Luis Obispo', 'Santa Barbara', 'Santa Cruz', 'Shasta', 
    'Siskiyou', 'Stanislaus', 'Sutter', 'Tehama', 'Trinity', 
    'Tulare', 'Tuolumne'
]

# List of California city names that contain "City" for E-5 parsing
PROPER_NAMES_ENDING_IN_CITY = [
    'Amador City',
    'California City',
    'Cathedral City',
    'Crescent City',
    'Culver City',
    'Daly City',
    'Foster City',
    'King City',
    'National City',
    'Nevada City',
    'Redwood City',  # Added missing city
    'Sand City',
    'Suisun City',
    'Temple City',
    'Union City',
    'Yuba City'  # Added missing city
]

# Mappings for specific city names that aren't standardized in E-5 dataset

# Historical to modern name standardization mapping
# Some historical data uses truncated names that need to be standardized to proper names
HISTORICAL_NAME_STANDARDIZATION = {
    'Amador': 'Amador City',
    'California': 'California City',  # If this appears in city data
    'Cathedral': 'Cathedral City',
    'Culver': 'Culver City', 
    'Daly': 'Daly City',
    'Foster': 'Foster City',
    'King': 'King City',
    'National': 'National City',
    'Nevada': 'Nevada City',
    'Redwood': 'Redwood City',  # Added missing mapping
    'Sand': 'Sand City',
    'Suisun': 'Suisun City',
    'Temple': 'Temple City',
    'Union': 'Union City',
    'Yuba': 'Yuba City'  # Added missing mapping
}

# Mappings for specific city names that aren't standardized in E-5 dataset
CITY_NAME_MAPPINGS = {
    'San Buenaventura (Ventura) City': 'Ventura',
    'San Buenaventura': 'Ventura',  # Historical data variant
    'El Paso de Robles (Paso Robles)': 'Paso Robles',
    'El Paso de Robles City': 'Paso Robles',
    'El Paso de Robles': 'Paso Robles',  # Historical data variant
    'St Helena': 'St. Helena',
    'St. Helena': 'St. Helena',
    'Angels': 'Angels Camp',  # Historical data variant
    'Angels City': 'Angels Camp',  # Historical data variant
    'La Cañada Flintridge': 'La Canada Flintridge',  # Standardize to ASCII version
    'La Canada Flintridge': 'La Canada Flintridge'   # Keep ASCII version as canonical
}

# City incorporation dates for data cleaning
# Used to identify pre-incorporation zeros that should be removed
CITY_INCORPORATION_DATES = {
    'Aliso Viejo': 2001,
    'Eastvale': 2010, 
    'Elk Grove': 2000,
    'Goleta': 2002,
    'Jurupa Valley': 2011,
    'Menifee': 2008,
    'Mountain House': 2024  # Incorporated July 1, 2024
}

# --- E-5 File Management Settings ---
# Maximum age in days before re-downloading E-5 file, and before retention
# archives a cached workbook. DoF releases E-5 annually (~May), so 90 days keeps
# the active cache clean without re-downloading unnecessarily through the year.
E5_CACHE_MAX_AGE_DAYS = 90

# Maximum age in days for fallback E-5 files (when web scraping fails). Set well
# beyond the cache/retention window so a workbook archived out of the active
# cache is still reachable as a fallback during a DoF outage; get_most_recent_e5_file
# searches both the download and archive directories. See refactor guide B1.
E5_FALLBACK_MAX_AGE_DAYS = 400

# Pattern for E-5 files to help with cleanup. DoF has published both hyphen and
# underscore forms of the name (E-5-2025_… and E-5_2026_…), so accept either.
E5_FILE_PATTERN = r'E-5[-_]\d{4}_Geo_InternetVersion\.xlsx'
E5_HEADER_PATTERN = (
    r"E-5 Population and Housing Estimates for Cities, Counties, and the State"
)
E5_LANDING_PAGE_PATTERN = r"20\d{2}\s*(?:-|\u2013)\s*20\d{2}"
E5_WORKBOOK_LINK_PATTERN = r"E-5[-_]\d{4}_Geo_InternetVersion\.xlsx(?:\?.*)?$"

ALL_TOWNS: List[str] = [
    'Apple Valley',
    'Atherton',
    'Colma',
    'Corte Madera',
    'Danville',
    'Fairfax',
    'Hillsborough',
    'Loomis',
    'Los Altos Hills',
    'Los Gatos',
    'Mammoth Lakes',
    'Moraga',
    'Paradise',
    'Portola Valley',
    'Ross',
    'San Anselmo',
    'Tiburon',
    'Truckee',
    'Windsor',
    'Woodside',
    'Yountville',
    'Yucca Valley',
]

# --- Historical File Processing Settings ---
# Maps exact filenames to their specific cleaning function and reading parameters
HISTORICAL_FILE_CONFIG = {
    # NOTE: Your actual filenames may vary slightly.
    # If the script still doesn't find a file, check your 'data/
    # folder and update the filename here to match exactly.
    "E-8_90-00main.xlsx": {
        "clean_func": "clean_1990_2000",
        "sheet_name": "EOC State County City by Year",
        "header": 3,
        "year_start": 1990, "year_end": 2000
    },
    "Closed_E8_Full_Decade_Final_v2.xlsx": {
        "clean_func": "clean_2000_2010",
        "sheet_name": "EOC State County City by Year",
        "header": 2,
        "year_start": 2000, "year_end": 2010
    },
    "E-8_2010_2020_by_Geo_Internet.xlsx": {
        "clean_func": "clean_2010_2020",
        "sheet_name": "E-8 by geography", 
        "header": 2,
        "year_start": 2010, "year_end": 2019  # Exclude 2020 to avoid duplicates with E-5 data
    }
}
