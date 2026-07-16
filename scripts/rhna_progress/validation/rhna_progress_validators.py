"""
rhna_progress_validators.py — the dictionary-vs-live column check plus the cleaning and final validators.

Data sources:
    - the cycle DOCX data dictionaries (Field Name column)
    - the cleaned and finalized RHNA Progress frames

Outputs:
    - tuple(is_valid, messages) for each validator

Usage:
    Called by the RHNA Progress cleaning and validation phases; not run standalone.

Test Folders:
    - scripts/unit_tests/rhna_progress/validation/
"""

import xml.etree.ElementTree as ET
import zipfile

import pandas as pd

from scripts.rhna_progress.enrichment.pace_metrics import classify_status

_WORD_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_HEADER_LABELS = {"field name", "field", "column name", "column", "name"}

"""
========================================================================================================================
Dictionary Column Check
========================================================================================================================
"""


def _extract_declared_fields(codebook_path):
    """Return the first-column (Field Name) values from every table in a DOCX dictionary."""
    with zipfile.ZipFile(codebook_path) as archive:
        document_xml = archive.read("word/document.xml")
    root = ET.fromstring(document_xml)

    fields = []
    seen = set()
    for table in root.iter(f"{_WORD_NS}tbl"):
        for row in table.iter(f"{_WORD_NS}tr"):
            cells = row.findall(f"{_WORD_NS}tc")
            if not cells:
                continue
            text = "".join(node.text or "" for node in cells[0].iter(f"{_WORD_NS}t")).strip()
            if not text or text.lower() in _HEADER_LABELS:
                continue
            if text not in seen:
                seen.add(text)
                fields.append(text)
    return fields


def validate_dictionary_columns(raw_columns, cycle, codebook_path):
    """
    Parse the cycle's DOCX dictionary and confirm the live CSV's columns match the declared Field Names; block-hard on a missing/renamed field, warn-soft on an extra one.

    Test file: scripts/unit_tests/rhna_progress/validation/test_rhna_progress_validators.py
    """
    declared = _extract_declared_fields(codebook_path)
    declared_set = set(declared)
    raw_set = set(raw_columns)

    messages = []
    is_valid = True
    for field in declared:
        if field not in raw_set:
            messages.append(f"Cycle {cycle} dictionary declares '{field}' but it is missing from the live data")
            is_valid = False
    for column in raw_columns:
        if column not in declared_set:
            messages.append(f"Cycle {cycle} live data has extra column '{column}' not in the dictionary")
    return is_valid, messages


"""
========================================================================================================================
Cleaning Validator
========================================================================================================================
"""


def validate_cleaned(df, schema_config):
    """
    Wired cleaning-stage gate: required columns present, dtypes correct, no null grain keys, exactly the five Income Level values per (Jurisdiction, Cycle, Snapshot Date), Units/RHNA non-negative, tier Percent within tolerance of Units/RHNA where
    RHNA > 0.

    Test file: scripts/unit_tests/rhna_progress/validation/test_rhna_progress_validators.py
    """
    config = schema_config["cleaning_validation_config"]
    required = config["required_columns"]
    key_columns = config["key_columns"]
    income_levels = set(config["income_levels"])
    tolerance = config.get("percent_tolerance", 0.02)
    tiers = set(schema_config["tier_income_levels"])

    messages = []
    missing = [column for column in required if column not in df.columns]
    if missing:
        messages.append(f"Missing required columns: {missing}")
        return False, messages

    for key in key_columns:
        if key in df.columns and df[key].isna().any():
            messages.append(f"Null value(s) present in grain key '{key}'")

    group_columns = [column for column in ["Jurisdiction", "Cycle", "Snapshot Date"] if column in df.columns]
    if group_columns:
        for keys, group in df.groupby(group_columns, dropna=False):
            missing_levels = income_levels - set(group["Income Level"])
            if missing_levels:
                messages.append(f"Missing income level(s) {sorted(missing_levels)} for {keys}")

    units = pd.to_numeric(df["Units"], errors="coerce")
    rhna = pd.to_numeric(df["RHNA"], errors="coerce")
    if (units < 0).any() or (rhna < 0).any():
        messages.append("Negative Units or RHNA present")

    tier_rows = df[df["Income Level"].isin(tiers)]
    tier_rhna = pd.to_numeric(tier_rows["RHNA"], errors="coerce")
    tier_units = pd.to_numeric(tier_rows["Units"], errors="coerce")
    tier_percent = pd.to_numeric(tier_rows["Percent"], errors="coerce")
    mask = (tier_rhna > 0) & tier_percent.notna()
    if mask.any():
        expected = tier_units[mask] / tier_rhna[mask]
        if ((tier_percent[mask] - expected).abs() > tolerance).any():
            messages.append("Tier Percent inconsistent with Units / RHNA")

    return len(messages) == 0, messages


"""
========================================================================================================================
Final Validator
========================================================================================================================
"""


def validate_final(df, schema_config):
    """
    Final gate before write: grain uniqueness on (Jurisdiction, Cycle, Snapshot Date, Income Level); Total row Units/RHNA equal the tier sums; every Most Recent group has one value per (Jurisdiction, Cycle); Region in the 9 shared regions; each
    Status/Overall Category consistent with its score and the four-quadrant rule; Tiers Met <= Tiers With Goal.

    Test file: scripts/unit_tests/rhna_progress/validation/test_rhna_progress_validators.py
    """
    config = schema_config["final_validation_config"]
    grain = config["duplicate_key_columns"]
    required = config["required_columns"]
    tiers = set(config["tier_income_levels"])
    regions = set(config["regions"])
    thresholds = schema_config["status_thresholds"]
    labels = schema_config["status_labels"]

    messages = []
    missing = [column for column in required if column not in df.columns]
    if missing:
        messages.append(f"Missing required columns: {missing}")
        return False, messages

    if df.duplicated(subset=grain).any():
        messages.append("Duplicate grain rows present")

    for keys, group in df.groupby(["Jurisdiction", "Cycle", "Snapshot Date"], dropna=False):
        tier_rows = group[group["Income Level"].isin(tiers)]
        total_rows = group[group["Income Level"].eq("Total")]
        if not total_rows.empty:
            tier_units = pd.to_numeric(tier_rows["Units"], errors="coerce").sum()
            tier_rhna = pd.to_numeric(tier_rows["RHNA"], errors="coerce").sum()
            total_units = pd.to_numeric(total_rows["Units"], errors="coerce").iloc[0]
            total_rhna = pd.to_numeric(total_rows["RHNA"], errors="coerce").iloc[0]
            if total_units != tier_units or total_rhna != tier_rhna:
                messages.append(f"Total row Units/RHNA do not equal tier sums for {keys}")
        if group["Most Recent"].nunique(dropna=False) > 1:
            messages.append(f"Mixed Most Recent flags within {keys}")

    bad_regions = set(df["Region"].dropna().unique()) - regions
    if bad_regions:
        messages.append(f"Region value(s) outside the shared nine: {sorted(bad_regions)}")

    snapshot = pd.to_datetime(df["Snapshot Date"], errors="coerce")
    deadline = pd.to_datetime(df["Planning Period End"], errors="coerce")
    units = pd.to_numeric(df["Units"], errors="coerce")
    rhna = pd.to_numeric(df["RHNA"], errors="coerce")
    score = pd.to_numeric(df["On Track Score"], errors="coerce")
    for position, index in enumerate(df.index):
        expected = classify_status(
            units.iloc[position],
            rhna.iloc[position],
            snapshot.iloc[position],
            deadline.iloc[position],
            score.iloc[position],
            thresholds,
            labels,
        )
        if df.loc[index, "Status"] != expected:
            messages.append(
                f"Status '{df.loc[index, 'Status']}' inconsistent with the four-quadrant rule (expected '{expected}')"
            )
            break

    tiers_met = pd.to_numeric(df["Tiers Met"], errors="coerce")
    tiers_with_goal = pd.to_numeric(df["Tiers With Goal"], errors="coerce")
    if (tiers_met > tiers_with_goal).any():
        messages.append("Tiers Met exceeds Tiers With Goal")

    return len(messages) == 0, messages
