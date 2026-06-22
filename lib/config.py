# lib/config.py file for pophousing_pipeline.py

"""
Configuration file for the pophousing_pipeline.py script.
"""

import os
from typing import List

# --- Web Scraping Settings ---
DOF_BASE_URL = "https://dof.ca.gov/forecasting/demographics/estimates/"
# Use a modern user-agent to avoid being blocked
# User-Agent to avoid being blocked by servers
REQUESTS_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36" }
# timeout for web requests (in seconds)
REQUESTS_TIMEOUT = 60

# --- File Paths ---


# Get the absolute path of the directory where this config file is located (lib folder)
lib_dir = os.path.abspath(os.path.dirname(__file__))

# Get the parent of the 'lib' folder (this will be the project root directory: web-data-visualization)
ROOT_DIR = os.path.dirname(lib_dir)

# Define the data directory by joining the project root path with "data"
DATA_DIR = os.path.join(ROOT_DIR, "data")

# Define all other paths based on the absolute DATA_DIR path
CURRENT_DATA_PATH = os.path.join(DATA_DIR, "data-cleaned", "housing-population", "PopHousing_Current.csv")
ARCHIVE_DATA_PATH = os.path.join(DATA_DIR, "archive")
DOWNLOAD_DIR = os.path.join(DATA_DIR, "data-raw", "housing-population") # Path to the folder


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
# Maximum age in days before re-downloading E-5 file
# DoF releases E-5 data annually in May, so 90 days ensures we get fresh data
# while avoiding unnecessary downloads throughout the year
E5_CACHE_MAX_AGE_DAYS = 90

# Maximum age in days for fallback E-5 files (when web scraping fails)
# Allow up to 6 months for fallback since E-5 data is updated annually
E5_FALLBACK_MAX_AGE_DAYS = 180

# Pattern for E-5 files to help with cleanup
E5_FILE_PATTERN = r'E-5-\d{4}_Geo_InternetVersion\.xlsx'

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
