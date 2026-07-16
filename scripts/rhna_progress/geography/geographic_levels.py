"""
geographic_levels.py — classifies City vs County and joins each jurisdiction to its county and PPIC region.

Data sources:
    - the long income-level frame
    - the committed jurisdiction crosswalk
    - scripts/shared/geography/california_geography.py — county -> region mapping

Outputs:
    - pandas.DataFrame — the frame with Geographic Level, County, and Region assigned

Usage:
    Called by the RHNA Progress enrichment phase; not run standalone.

Test Folders:
    - scripts/unit_tests/rhna_progress/geography/
"""

"""
========================================================================================================================
Geographic Classification
========================================================================================================================
"""


def classify_geographic_level(df):
    """Assign Geographic Level = County when the name carries a COUNTY suffix, else City. Test file: scripts/unit_tests/rhna_progress/geography/test_geographic_levels.py"""
    result = df.copy()
    result["Geographic Level"] = [
        "County" if str(name).strip().upper().endswith("COUNTY") else "City"
        for name in result["Jurisdiction"]
    ]
    return result


def assign_county_and_region(df, crosswalk, geography):
    """
    Join each jurisdiction to its County (self for county rows) and roll County up into one of the 9 shared PPIC regions via california_geography. Fail loud on an unmapped jurisdiction so a new incorporation is caught, not silently regionless.

    Test file: scripts/unit_tests/rhna_progress/geography/test_geographic_levels.py
    """
    result = df.copy()

    crosswalk_map = {}
    if "Jurisdiction" in crosswalk.columns and "County" in crosswalk.columns:
        crosswalk_map = dict(zip(crosswalk["Jurisdiction"], crosswalk["County"]))

    county_to_region = {}
    for region, counties in geography["regions_mapping"].items():
        for county in counties:
            county_to_region[county] = region

    counties = []
    regions = []
    missing_jurisdictions = []
    missing_regions = []
    for jurisdiction, level in zip(result["Jurisdiction"], result["Geographic Level"]):
        if level == "County":
            name = str(jurisdiction).strip()
            county = name[: -len(" County")].strip() if name.upper().endswith("COUNTY") else name
        else:
            county = crosswalk_map.get(jurisdiction)
            if county is None:
                missing_jurisdictions.append(jurisdiction)

        region = None
        if county is not None:
            region = county_to_region.get(county)
            if region is None:
                missing_regions.append(county)

        counties.append(county)
        regions.append(region)

    if missing_jurisdictions:
        raise ValueError(
            f"Unmapped jurisdiction(s) not found in the crosswalk: {sorted(set(missing_jurisdictions))}"
        )
    if missing_regions:
        raise ValueError(
            f"County without a PPIC region (check REGIONS_MAPPING): {sorted(set(missing_regions))}"
        )

    result["County"] = counties
    result["Region"] = regions
    return result
