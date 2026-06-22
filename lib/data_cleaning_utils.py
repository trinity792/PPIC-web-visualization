"""
data_cleaning_utils.py

Centralized utilities for data cleaning operations used across the production pipeline.
Consolidates common cleaning functions from historical_data_processor.py and pophousing_pipeline.py
to reduce code duplication and improve maintainability.
"""

import logging
import re
from typing import Dict, List, Optional, Tuple

import config
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ============================================================================
# NAME STANDARDIZATION UTILITIES
# ============================================================================

def standardize_location_names(df: pd.DataFrame, name_column: str = 'Location') -> pd.DataFrame:
    """
    Applies specific rules to clean and standardize location names.

    Args:
        df: the dataframe to modify
        name_column: the name of the column containing location names.

    Returns:
        the dataframe with cleaned names in the specified column.
    """

    def clean_single_name(name):
        # intial cleanup
        if pd.isna(name):
            return name
        name = str(name).strip()

        # apply the mappings first
        if hasattr(config, 'CITY_NAME_MAPPINGS') and name in config.CITY_NAME_MAPPINGS:
            return config.CITY_NAME_MAPPINGS[name]
        
        # preserve special names & names ending in city
        if (name in ['County Total', 'State Total', 'California'] or 
            (hasattr(config, 'PROPER_NAMES_ENDING_IN_CITY') and name in config.PROPER_NAMES_ENDING_IN_CITY) or
            (hasattr(config, 'COUNTY_LEVEL') and name in config.COUNTY_LEVEL)):
            return name
        
        # historical standardizations
        if hasattr(config, 'HISTORICAL_NAME_MAPPINGS') and name in config.HISTORICAL_NAME_MAPPINGS:
            return config.HISTORICAL_NAME_MAPPINGS[name]
        
        # THEN remove " City" or " Town" suffix
        cleaned = re.sub(r'\s+(City|Town)$', '', name, flags=re.I).strip()
        return cleaned
    
    # apply the cleaning function to the entire column
    df[name_column] = df[name_column].apply(clean_single_name)
    return df

def standardize_san_francisco_classification(df: pd.DataFrame) -> pd.DataFrame:
    """
    Standardizes San Francisco classification across different data sources.
    Some sources classify SF as a city, others as a county.
    """
    logger.debug("Applying special San Francisco duplication (City and County)...")
    
    # San Francisco should be classified as 'County' (City and County of San Francisco)
    sf_mask = df['Location'] == 'San Francisco'
    sf_data = df[sf_mask].copy()

    if not sf_data.empty:
        # create two versions, one as a city, one as a county
        sf_city = sf_data.copy()
        sf_city['Geographic Level'] = 'City'

        sf_county = sf_data.copy()
        sf_county['Geographic Level'] = 'County'

        # remove o.g. SF entries and add back the duplicate versions
        df_without_sf = df[~sf_mask]
        df = pd.concat([df_without_sf, sf_city, sf_county], ignore_index=True)
        logger.info(f"Duplicated {len(sf_data)} San Francisco entries into separate City and County records.")

    return df


# ============================================================================
# GEOGRAPHIC LEVEL ASSIGNMENT
# ============================================================================

def assign_geographic_levels(df: pd.DataFrame, source_type: str = 'historical') -> pd.DataFrame:
    """
    Assigns geographic levels (County, City, Town, etc.) based on location names and patterns.
    
    Args:
        df: DataFrame with Location column
        source_type: 'historical' or 'modern' to apply appropriate rules
        
    Returns:
        DataFrame with Geographic Level column added
    """
    logger.debug(f"Assigning geographic levels for {source_type} data")
    
    # Initialize Geographic Level column
    df['Geographic Level'] = 'City'  # Default assumption
    
    # County identification patterns
    county_patterns = [
        r'County Total$',
        r'^.*County$',
        r'Unincorporated.*County',
    ]
    
    # Apply county patterns
    for pattern in county_patterns:
        county_mask = df['Location'].str.contains(pattern, case=False, na=False, regex=True)
        df.loc[county_mask, 'Geographic Level'] = 'County'
    
    # State level identification
    state_mask = df['Location'].str.contains('^California$', case=False, na=False, regex=True)
    df.loc[state_mask, 'Geographic Level'] = 'State'
    
    # Region identification (if regions are defined in config)
    if hasattr(config, 'REGIONS_MAPPING'):
        region_names = list(config.REGIONS_MAPPING.keys())
        for region_name in region_names:
            region_mask = df['Location'] == region_name
            df.loc[region_mask, 'Geographic Level'] = 'Region'
    
    # Town identification (smaller municipalities)
    if hasattr(config, 'TOWN_CLASSIFICATIONS'):
        town_mask = df['Location'].isin(config.TOWN_CLASSIFICATIONS)
        df.loc[town_mask, 'Geographic Level'] = 'Town'
    
    # Apply San Francisco special handling
    df = standardize_san_francisco_classification(df)
    
    logger.debug(f"Geographic level distribution: {df['Geographic Level'].value_counts().to_dict()}")
    return df


# ============================================================================
# CALCULATED COLUMNS
# ============================================================================

def calculate_derived_housing_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calculates derived housing columns from base data.
    
    Args:
        df: DataFrame with base housing unit columns
        
    Returns:
        DataFrame with additional calculated columns
    """
    logger.debug("Calculating derived housing columns")
    
    # Single Family Units (if components exist)
    if 'Single Family Detached Units' in df.columns and 'Single Family Attached Units' in df.columns:
        df['Single Family Units'] = (
            df['Single Family Detached Units'].fillna(0) + 
            df['Single Family Attached Units'].fillna(0)
        )
    
    # Multiple Family Units
    if 'Two to Four Family Units' in df.columns and 'Five Plus Family Units' in df.columns:
        df['Multiple Family Units'] = (
            df['Two to Four Family Units'].fillna(0) + 
            df['Five Plus Family Units'].fillna(0)
        )
    
    # Vacant Units
    if 'Total Housing Units' in df.columns and 'Occupied Units' in df.columns:
        df['Vacant Units'] = df['Total Housing Units'] - df['Occupied Units']
    
    # Vacancy Rate (as percentage)
    if 'Vacant Units' in df.columns and 'Total Housing Units' in df.columns:
        df['Vacancy Rate (%)'] = np.where(
            df['Total Housing Units'] > 0,
            (df['Vacant Units'] / df['Total Housing Units'] * 100),
            0
        ).round(2)
    
    # Owner Occupied Percentage
    if 'Owner Occupied Units' in df.columns and 'Occupied Units' in df.columns:
        df['Owner Occupied (%)'] = np.where(
            df['Occupied Units'] > 0,
            (df['Owner Occupied Units'] / df['Occupied Units'] * 100),
            0
        ).round(2)
    
    logger.debug("Derived columns calculated successfully")
    return df


# ============================================================================
# VECTORIZED DATA PROCESSING
# ============================================================================

def vectorized_forward_fill(df: pd.DataFrame, columns: List[str]) -> pd.DataFrame:
    """
    Efficiently forward-fills specified columns using pandas vectorized operations.
    
    Args:
        df: DataFrame to process
        columns: List of column names to forward-fill
        
    Returns:
        DataFrame with forward-filled columns
    """
    logger.debug(f"Forward-filling columns: {columns}")
    
    for col in columns:
        if col in df.columns:
            df[col] = df[col].ffill()
    
    return df


def vectorized_conditional_assignment(df: pd.DataFrame, 
                                    condition_column: str,
                                    condition_values: Dict[str, str],
                                    target_column: str) -> pd.DataFrame:
    """
    Efficiently assigns values based on conditions using vectorized operations.
    
    Args:
        df: DataFrame to process
        condition_column: Column to check conditions against
        condition_values: Dict mapping condition values to target values
        target_column: Column to assign values to
        
    Returns:
        DataFrame with conditional assignments applied
    """
    logger.debug(f"Applying conditional assignments to {target_column}")
    
    # Use np.select for multiple conditions
    conditions = []
    choices = []
    
    for condition_val, target_val in condition_values.items():
        conditions.append(df[condition_column] == condition_val)
        choices.append(target_val)
    
    # Default case (if no conditions match)
    default = df[target_column] if target_column in df.columns else 'Unknown'
    
    df[target_column] = np.select(conditions, choices, default=default)
    return df


# ============================================================================
# MAIN CLEANING PIPELINE
# ============================================================================

def universal_data_cleaner(df: pd.DataFrame, 
                          source_type: str = 'historical',
                          config_overrides: Optional[Dict] = None) -> pd.DataFrame:
    """
    Universal data cleaning function that can be called by both processors.
    
    Args:
        df: Raw DataFrame to clean
        source_type: 'historical' or 'modern' for specific processing rules
        config_overrides: Optional dictionary to override default processing rules
        
    Returns:
        Cleaned and standardized DataFrame
    """
    logger.info(f"Starting universal data cleaning for {source_type} data")
    logger.debug(f"Input DataFrame shape: {df.shape}")
    
    # Apply configuration overrides if provided
    if config_overrides:
        logger.debug(f"Applying config overrides: {list(config_overrides.keys())}")
    
    # Step 1: Standardize location names
    df = standardize_location_names(df)
    
    # Step 2: Assign geographic levels
    df = assign_geographic_levels(df, source_type)
    
    # Step 3: Calculate derived columns
    df = calculate_derived_housing_columns(df)
    
    # Step 4: Handle missing data with forward fill for key columns
    fill_columns = ['Location', 'Geographic Level']
    df = vectorized_forward_fill(df, fill_columns)
    
    logger.info(f"Universal data cleaning complete. Output shape: {df.shape}")
    return df


# ============================================================================
# VALIDATION UTILITIES
# ============================================================================

def validate_cleaned_data(df: pd.DataFrame, required_columns: List[str]) -> Tuple[bool, List[str]]:
    """
    Validates that cleaned data meets quality requirements.
    
    Args:
        df: Cleaned DataFrame to validate
        required_columns: List of columns that must be present
        
    Returns:
        Tuple of (is_valid, list_of_issues)
    """
    issues = []
    
    # Check required columns
    missing_cols = [col for col in required_columns if col not in df.columns]
    if missing_cols:
        issues.append(f"Missing required columns: {missing_cols}")
    
    # Check for empty dataframe
    if df.empty:
        issues.append("DataFrame is empty")
    
    # Check for duplicate rows
    duplicates = df.duplicated().sum()
    if duplicates > 0:
        issues.append(f"Found {duplicates} duplicate rows")
    
    # Check Location column quality
    if 'Location' in df.columns:
        null_locations = df['Location'].isna().sum()
        if null_locations > 0:
            issues.append(f"Found {null_locations} null location values")
    
    is_valid = len(issues) == 0
    return is_valid, issues
