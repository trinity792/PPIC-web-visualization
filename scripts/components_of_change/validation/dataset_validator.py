"""
dataset_validator.py — validates canonical Components of Change datasets before save.

Data sources:
    - pandas.DataFrame — merged and finalized Components records
    - Components column configuration — required output columns and duplicate keys

Outputs:
    - tuple[bool, list[str]] — validation status and human-readable messages

Usage:
    python scripts/components_of_change/validation/dataset_validator.py

Test Folders:
    - scripts/unit_tests/components_of_change/validation/
"""

from scripts.shared.validation.dataframe_validators import find_duplicate_rows, validate_not_empty, validate_required_columns

"""
========================================================================================================================
Dataset Validation
========================================================================================================================
"""


def validate_components_dataset(dataframe, columns_config):
    """Validate required columns, emptiness, and duplicate source-location-year rows. Test file: scripts/unit_tests/components_of_change/validation/test_dataset_validator.py"""
    messages = []
    missing_columns = validate_required_columns(dataframe, columns_config["output_columns"])
    if missing_columns:
        messages.append(f"Missing required columns: {', '.join(missing_columns)}")
    if not validate_not_empty(dataframe):
        messages.append("Components dataset is empty")
    if not missing_columns:
        duplicate_rows = find_duplicate_rows(dataframe, columns_config["duplicate_key_columns"])
        if not duplicate_rows.empty:
            messages.append(f"Found {len(duplicate_rows)} duplicate Components rows")
    return not messages, messages
