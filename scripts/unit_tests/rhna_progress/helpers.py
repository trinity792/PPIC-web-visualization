from datetime import date, datetime
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

import pandas as pd

TIER_LEVELS = ["Very Low", "Low", "Moderate", "Above Moderate"]
INCOME_LEVELS = [*TIER_LEVELS, "Total"]
GRAIN_KEYS = ["Jurisdiction", "Cycle", "Snapshot Date", "Income Level"]

OUTPUT_COLUMNS = [
    "Income Level",
    "Units",
    "RHNA",
    "Percent",
    "Projected Units",
    "On Track Score",
    "Status",
    "Jurisdiction",
    "Geographic Level",
    "County",
    "Region",
    "Cycle",
    "Planning Period",
    "Planning Period Start",
    "Planning Period End",
    "Cycle Started",
    "Snapshot Date",
    "Most Recent",
    "Total Days",
    "Elapsed Days",
    "Percent Elapsed",
    "Tiers Met",
    "Tiers With Goal",
    "Overall Progress",
    "Overall On Track Score",
    "Overall Category",
    "Source Last Updated",
]

TIER_COLUMN_MAP = {
    "Very Low": {
        "units": "Very Low Units",
        "rhna": "Very Low RHNA",
        "percent": "Very Low Percent",
        "source_units": "VLI UNITS",
        "source_rhna": "RHNA VLI",
        "source_percent": "VLI %",
    },
    "Low": {
        "units": "Low Units",
        "rhna": "Low RHNA",
        "percent": "Low Percent",
        "source_units": "LI UNITS",
        "source_rhna": "RHNA LI",
        "source_percent": "LI %",
    },
    "Moderate": {
        "units": "Moderate Units",
        "rhna": "Moderate RHNA",
        "percent": "Moderate Percent",
        "source_units": "MOD UNITS",
        "source_rhna": "RHNA MOD",
        "source_percent": "MOD %",
    },
    "Above Moderate": {
        "units": "Above Moderate Units",
        "rhna": "Above Moderate RHNA",
        "percent": "Above Moderate Percent",
        "source_units": "ABOVE MOD UNITS",
        "source_rhna": "RHNA ABOVE MOD",
        "source_percent": "ABOVE MOD %",
    },
}


def schema_config():
    return {
        "output_columns": list(OUTPUT_COLUMNS),
        "required_columns": list(OUTPUT_COLUMNS),
        "income_levels": list(INCOME_LEVELS),
        "tier_income_levels": list(TIER_LEVELS),
        "income_tier_columns": {
            level: dict(columns)
            for level, columns in TIER_COLUMN_MAP.items()
        },
        "grain_keys": list(GRAIN_KEYS),
        "status_thresholds": {
            "on_track": 1.0,
            "nearly_on_track": 0.70,
            "somewhat_off_track": 0.50,
        },
        "status_labels": {
            "no_allocation": "No Allocation",
            "met": "Met",
            "behind": "Behind",
            "on_track": "On Track",
            "nearly_on_track": "Nearly On Track",
            "somewhat_off_track": "Somewhat Off Track",
            "far_off_track": "Far Off Track",
        },
        "cleaning_validation_config": {
            "required_columns": [
                "Jurisdiction",
                "Cycle",
                "Snapshot Date",
                "Income Level",
                "Units",
                "RHNA",
                "Percent",
            ],
            "key_columns": list(GRAIN_KEYS),
            "income_levels": list(INCOME_LEVELS),
        },
        "final_validation_config": {
            "required_columns": list(OUTPUT_COLUMNS),
            "duplicate_key_columns": list(GRAIN_KEYS),
            "income_levels": list(INCOME_LEVELS),
            "tier_income_levels": list(TIER_LEVELS),
            "regions": {
                "Bay Area",
                "Central Coast",
                "Far North",
                "Inland Empire",
                "Los Angeles (Regional)",
                "North San Joaquin Valley",
                "Sacramento (Regional)",
                "San Diego (Regional)",
                "South San Joaquin Valley",
            },
        },
    }


def raw_cycle_5_frame():
    return pd.DataFrame(
        [
            {
                "Jurisdiction": "ALAMEDA",
                "Planning Period": "01/31/2015 - 01/31/2023",
                "VLI UNITS": "267",
                "RHNA VLI": "444",
                "VLI %": "0.60",
                "LI UNITS": "161",
                "RHNA LI": "248",
                "LI %": "0.65",
                "MOD UNITS": "132",
                "RHNA MOD": "283",
                "MOD %": "0.47",
                "ABOVE MOD UNITS": "1968",
                "RHNA ABOVE MOD": "748",
                "ABOVE MOD %": "2.63",
            }
        ]
    )


def raw_cycle_6_frame():
    source = raw_cycle_5_frame()
    source.insert(2, "6th Cycle Started", "TRUE")
    source.loc[0, "Planning Period"] = "10/15/2021 - 10/15/2029"
    return source


def wide_income_frame(**overrides):
    row = {
        "Jurisdiction": "Alameda",
        "Planning Period": "01/31/2015 - 01/31/2023",
        "Planning Period Start": pd.Timestamp("2015-01-31"),
        "Planning Period End": pd.Timestamp("2023-01-31"),
        "Cycle Started": True,
        "Cycle": 5,
        "Very Low Units": 10,
        "Very Low RHNA": 20,
        "Very Low Percent": 0.50,
        "Low Units": 5,
        "Low RHNA": 10,
        "Low Percent": 0.50,
        "Moderate Units": 8,
        "Moderate RHNA": 16,
        "Moderate Percent": 0.50,
        "Above Moderate Units": 30,
        "Above Moderate RHNA": 60,
        "Above Moderate Percent": 0.50,
    }
    row.update(overrides)
    return pd.DataFrame([row])


def long_row(
    *,
    jurisdiction="Alameda",
    cycle=6,
    snapshot_date=date(2026, 7, 15),
    income_level="Total",
    units=50,
    rhna=100,
    percent=0.50,
    percent_elapsed=0.50,
    planning_start=date(2021, 10, 15),
    planning_end=date(2029, 10, 15),
    status="Far Off Track",
    most_recent=True,
    region="Bay Area",
    county="Alameda",
    geographic_level="City",
    overall_category="Far Off Track",
):
    return {
        "Income Level": income_level,
        "Units": units,
        "RHNA": rhna,
        "Percent": percent,
        "Projected Units": pd.NA,
        "On Track Score": pd.NA,
        "Status": status,
        "Jurisdiction": jurisdiction,
        "Geographic Level": geographic_level,
        "County": county,
        "Region": region,
        "Cycle": cycle,
        "Planning Period": "10/15/2021 - 10/15/2029",
        "Planning Period Start": pd.Timestamp(planning_start),
        "Planning Period End": pd.Timestamp(planning_end),
        "Cycle Started": True,
        "Snapshot Date": pd.Timestamp(snapshot_date),
        "Most Recent": most_recent,
        "Total Days": (date(2029, 10, 15) - date(2021, 10, 15)).days,
        "Elapsed Days": int((date(2026, 7, 15) - date(2021, 10, 15)).days),
        "Percent Elapsed": percent_elapsed,
        "Tiers Met": 0,
        "Tiers With Goal": 4,
        "Overall Progress": 0.0,
        "Overall On Track Score": 0.0,
        "Overall Category": overall_category,
        "Source Last Updated": pd.Timestamp(datetime(2026, 7, 15, 12, 0)),
    }


def long_frame(rows=None):
    if rows is None:
        rows = [long_row()]
    return pd.DataFrame(rows, columns=OUTPUT_COLUMNS)


def write_minimal_docx_table(path, field_names):
    """Write a tiny DOCX table with a Field Name column for validator tests."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    def cell(text):
        return (
            "<w:tc><w:p><w:r><w:t>"
            f"{text}"
            "</w:t></w:r></w:p></w:tc>"
        )

    rows = ["<w:tr>" + cell("Field Name") + cell("Description") + "</w:tr>"]
    rows.extend(
        "<w:tr>" + cell(field_name) + cell("fixture") + "</w:tr>"
        for field_name in field_names
    )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body><w:tbl>"
        + "".join(rows)
        + "</w:tbl></w:body></w:document>"
    )

    with ZipFile(path, "w", ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            "</Types>",
        )
        archive.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            "</Relationships>",
        )
        archive.writestr("word/document.xml", document)

