"""
zillow_affordability_validators.py — hard and soft checks on the Zillow Housing Affordability table.

Data sources:
    - scripts/zillow_affordability/config/schemas.py — contract, vocabularies, expected places, tolerances

Outputs:
    - (bool, list[str]) — hard-check result and failure messages, each prefixed with its check tag
    - list[str] — soft-check warnings

Usage:
    from scripts.zillow_affordability.validation.zillow_affordability_validators import validate_final

Test Folders:
    - scripts/unit_tests/zillow_affordability/validation/
"""

import re
from datetime import date

import pandas as pd

"""
========================================================================================================================
Constants
========================================================================================================================
"""

_MONTH_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

"""
========================================================================================================================
Hard Checks
========================================================================================================================
"""

# ── Structure ─────────────────────────────────────────────────────────────────


def _check_columns(df, schema_config):
    """Columns must equal the contract, in order."""
    if list(df.columns) != schema_config["output_columns"]:
        return [f"columns: expected {schema_config['output_columns']}, got {list(df.columns)}"]
    return []


def _check_not_empty(df):
    """At least one row."""
    return ["empty: the table has no rows"] if df.empty else []


def _check_duplicates(df, schema_config):
    """No repeated grain key."""
    duplicated = df[df.duplicated(schema_config["grain_keys"], keep=False)]
    if duplicated.empty:
        return []
    sample = duplicated[schema_config["grain_keys"]].head(3).to_dict("records")
    return [f"duplicates: {len(duplicated)} rows share a grain key, e.g. {sample}"]


def _check_vocabulary(df, schema_config):
    """Geographic Level and Housing Scenario values are in the allowed lists."""
    messages = []
    allowed = {
        "Geographic Level": set(schema_config["geographic_level_order"]),
        "Housing Scenario": set(schema_config["scenario_order"]),
    }
    for column, values in allowed.items():
        unexpected = sorted(set(df[column].dropna()) - values)
        if unexpected or df[column].isna().any():
            messages.append(f"allowed values: {column} has unexpected values {unexpected or ['<blank>']}")
    return messages


def _check_locations(df, schema_config):
    """Every expected place is present in every scenario."""
    messages = []
    expected = set(schema_config["expected_locations"])
    for scenario in schema_config["scenario_order"]:
        present = set(df.loc[df["Housing Scenario"] == scenario, "Location"])
        missing = sorted(expected - present)
        if missing:
            messages.append(f"locations: {scenario} is missing {', '.join(missing)}")
    return messages


# ── Time ──────────────────────────────────────────────────────────────────────


def _parse_release_dates(df):
    """Return (release Timestamp or None, messages) for a single-release table."""
    releases = df["Release Date"].dropna().unique()
    if len(releases) != 1 or df["Release Date"].isna().any():
        return None, [f"release date: expected exactly one Release Date, found {sorted(map(str, releases))}"]
    try:
        release = pd.Timestamp(date.fromisoformat(str(releases[0])))
    except ValueError:
        return None, [f"release date: {releases[0]!r} is not a YYYY-MM-DD date"]
    if release.date() > date.today():
        return None, [f"release date: {releases[0]} is in the future"]
    return release, []


def _check_months(df, schema_config, release):
    """Months are YYYY-MM, contiguous per place and scenario, start on time, and stop by the release month."""
    malformed = sorted({str(value) for value in df["Date"] if not _MONTH_PATTERN.match(str(value))})
    if malformed:
        return [f"months: malformed Date values {malformed[:5]}"]

    messages = []
    periods = pd.PeriodIndex(df["Date"], freq="M")
    frame = pd.DataFrame({"Location": df["Location"], "Scenario": df["Housing Scenario"], "Period": periods})
    for (location, scenario), group in frame.groupby(["Location", "Scenario"], sort=True):
        first, last = group["Period"].min(), group["Period"].max()
        expected_count = (last - first).n + 1
        if group["Period"].nunique() != expected_count:
            messages.append(f"months: {location} / {scenario} has gaps between {first} and {last}")
        earliest = schema_config["earliest_month"].get(scenario)
        if earliest and first > pd.Period(earliest, freq="M"):
            messages.append(f"months: {location} / {scenario} starts {first}, later than {earliest}")
        if release is not None and last > release.to_period("M"):
            messages.append(f"months: {location} / {scenario} runs to {last}, after the release month")
    return messages


# ── Values ────────────────────────────────────────────────────────────────────


def _check_scenario_measures(df, schema_config):
    """Measures that do not apply to a scenario are blank."""
    messages = []
    for scenario, applicable in schema_config["applicable_measures"].items():
        rows = df[df["Housing Scenario"] == scenario]
        for column in schema_config["measure_columns"]:
            if column not in applicable and rows[column].notna().any():
                messages.append(f"scenario measures: {column} has values on {scenario} rows")
    return messages


def _check_non_negative(df, schema_config):
    """No measure is negative."""
    messages = []
    for column in schema_config["measure_columns"]:
        negative = df[pd.to_numeric(df[column], errors="coerce") < 0]
        if not negative.empty:
            messages.append(f"negative: {column} has {len(negative)} negative values")
    return messages


def _check_total_covers_mortgage(df):
    """Total Monthly Payment includes the mortgage, so it cannot be smaller."""
    both = df[df["Mortgage Payment"].notna() & df["Total Monthly Payment"].notna()]
    below = both[both["Total Monthly Payment"] < both["Mortgage Payment"]]
    if below.empty:
        return []
    sample = below[["Location", "Date", "Housing Scenario"]].head(3).to_dict("records")
    return [f"total below mortgage: {len(below)} rows, e.g. {sample}"]


def _check_history_preserved(df, existing, schema_config):
    """No grain key in the saved table disappears."""
    if existing is None or existing.empty:
        return []
    keys = schema_config["grain_keys"]
    saved = set(map(tuple, existing[keys].astype(str).itertuples(index=False)))
    new = set(map(tuple, df[keys].astype(str).itertuples(index=False)))
    lost = sorted(saved - new)
    if not lost:
        return []
    return [f"history: {len(lost)} saved rows would disappear, e.g. {lost[:3]}"]


"""
========================================================================================================================
Validators
========================================================================================================================
"""


def validate_cleaned(df, schema_config):
    """Run the structural hard checks right after cleaning; return (is_valid, messages). Test file: scripts/unit_tests/zillow_affordability/validation/test_zillow_affordability_validators.py"""
    messages = _check_columns(df, schema_config)
    if messages:
        return False, messages
    messages += _check_not_empty(df)
    if not df.empty:
        messages += _check_duplicates(df, schema_config)
        messages += _check_vocabulary(df, schema_config)
        messages += _check_locations(df, schema_config)
    return not messages, messages


def validate_final(df, schema_config, existing=None):
    """
    Run every hard check; any failure blocks the save.

    Args:
        df: finalized table
        schema_config: get_schema_config() output
        existing: the saved table, for the history-preserved check (None on a first run)

    Returns:
        (is_valid, messages), each message prefixed with its check tag.

    Test file:
        scripts/unit_tests/zillow_affordability/validation/test_zillow_affordability_validators.py
    """
    is_valid, messages = validate_cleaned(df, schema_config)
    if list(df.columns) != schema_config["output_columns"] or df.empty:
        return is_valid, messages
    release, release_messages = _parse_release_dates(df)
    messages += release_messages
    messages += _check_months(df, schema_config, release)
    messages += _check_scenario_measures(df, schema_config)
    messages += _check_non_negative(df, schema_config)
    messages += _check_total_covers_mortgage(df)
    messages += _check_history_preserved(df, existing, schema_config)
    return not messages, messages


"""
========================================================================================================================
Soft Checks
========================================================================================================================
"""


def collect_warnings(df, schema_config):
    """
    Return soft-check warnings that are logged but never block the save.

    Covers: the 30% income identity at 20% down, a share above 100% of income, a blank value
    in a place's latest month, and California metros outside the expected list.

    Test file:
        scripts/unit_tests/zillow_affordability/validation/test_zillow_affordability_validators.py
    """
    warnings = []

    buy20 = df[(df["Housing Scenario"] == "Buy (20% down)") & df["Income Needed"].gt(0)]
    implied = buy20["Total Monthly Payment"] * 12 / buy20["Income Needed"]
    drift = buy20[(implied - schema_config["income_rule_share"]).abs() > schema_config["income_rule_tolerance"]]
    for _, row in drift.head(5).iterrows():
        warnings.append(f"30% rule: {row['Location']} {row['Date']} total payment x 12 / income needed is {row['Total Monthly Payment'] * 12 / row['Income Needed']:.3f}, not {schema_config['income_rule_share']:.2f}")

    high = df[df["Share of Income"] > 1]
    for _, row in high.head(5).iterrows():
        warnings.append(f"share above 100%: {row['Location']} {row['Date']} {row['Housing Scenario']} share of income is {row['Share of Income']:.2f}")

    latest_month = df["Date"].max()
    for scenario, applicable in schema_config["applicable_measures"].items():
        rows = df[(df["Housing Scenario"] == scenario) & (df["Date"] == latest_month)]
        blank = rows[rows[applicable].isna().all(axis=1)]
        for location in blank["Location"]:
            warnings.append(f"latest month: {location} has no {scenario} values for {latest_month}")

    unexpected = sorted(set(df["Location"]) - set(schema_config["expected_locations"]))
    for location in unexpected:
        warnings.append(f"unexpected place: {location} is not in the expected list; review before publishing")
    return warnings
