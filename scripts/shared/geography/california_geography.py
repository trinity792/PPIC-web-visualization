"""
california_geography.py — exposes shared California county, region, state, and CBSA-metro reference geography.

Data sources:
    - lib/pophousing_config.py — canonical California county list and region-to-county mapping

Outputs:
    - dict — California state name, county names, region names, region-to-county
      mapping, and the CBSA-metro reference (metro display names, metro-to-county
      composition, and derived metro-to-region grouping)

Usage:
    python scripts/shared/geography/california_geography.py

Test Folders:
    - scripts/unit_tests/shared/geography/
"""

from lib.pophousing_config import COUNTY_LEVEL, REGIONS_MAPPING

"""
========================================================================================================================
California Reference Geography
========================================================================================================================
"""

# Cross-module reference data: more than one California dataset (PopHousing,
# Components of Change, Building Permits) needs the same county/region/state
# names, so this is the single shared owner rather than one module reaching into
# another's config.
_STATE_NAME = "California"
_SAN_FRANCISCO = "San Francisco"

# The 26 canonical California CBSA metros carried by the Building Permits module,
# lifted here (out of the legacy permits_code.py `msa_mapping`) so the metro grain
# is owned centrally. Each metro maps to the whole member counties that compose it.
# Every metro's counties nest within exactly one of the 9 shared regions, so the
# metro-to-region grouping is derived rather than hand-maintained (see
# get_california_geography). The San Jose CBSA's rural San Benito county is folded
# into Santa Clara here so the metro nests wholly within the Bay Area region, per
# the shared-region reconciliation decided for this module.
_METRO_TO_COUNTY_MAPPING = {
    "Bakersfield": ["Kern"],
    "Chico": ["Butte"],
    "El Centro": ["Imperial"],
    "Fresno": ["Fresno"],
    "Hanford": ["Kings"],
    "Los Angeles": ["Los Angeles", "Orange"],
    "Madera": ["Madera"],
    "Merced": ["Merced"],
    "Modesto": ["Stanislaus"],
    "Napa": ["Napa"],
    "Ventura": ["Ventura"],
    "Redding": ["Shasta"],
    "Inland Empire": ["San Bernardino", "Riverside"],
    "Sacramento": ["Sacramento", "El Dorado", "Placer", "Yolo"],
    "Salinas": ["Monterey"],
    "San Diego": ["San Diego"],
    "San Francisco": ["San Francisco", "Alameda", "Marin", "Contra Costa", "San Mateo"],
    "San Jose": ["Santa Clara"],
    "San Luis Obispo": ["San Luis Obispo"],
    "Santa Cruz": ["Santa Cruz"],
    "Santa Barbara": ["Santa Barbara"],
    "Santa Rosa": ["Sonoma"],
    "Stockton": ["San Joaquin"],
    "Vallejo": ["Solano"],
    "Visalia": ["Tulare"],
    "Yuba City": ["Sutter", "Yuba"],
}


def _derive_metro_to_region(metro_to_county, regions_mapping):
    """Map each metro to the single shared region that contains all its member counties."""
    metro_to_region = {}
    for metro, counties in metro_to_county.items():
        county_set = set(counties)
        containing = [region for region, region_counties in regions_mapping.items() if county_set <= set(region_counties)]
        if len(containing) != 1:
            raise ValueError(f"Metro {metro} does not nest within exactly one shared region: {containing}")
        metro_to_region[metro] = containing[0]
    return metro_to_region


def get_california_geography():
    """Return shared California county, region, state, and CBSA-metro reference geography. Test file: scripts/unit_tests/shared/geography/test_california_geography.py"""
    county_names = set(COUNTY_LEVEL)
    # San Francisco is both a city and a county; every consumer treats it as a county here.
    county_names.add(_SAN_FRANCISCO)
    regions_mapping = {region: list(counties) for region, counties in REGIONS_MAPPING.items()}
    metro_to_county_mapping = {metro: list(counties) for metro, counties in _METRO_TO_COUNTY_MAPPING.items()}
    metro_to_region_mapping = _derive_metro_to_region(_METRO_TO_COUNTY_MAPPING, REGIONS_MAPPING)
    return {
        "state_name": _STATE_NAME,
        "county_names": county_names,
        "region_names": set(REGIONS_MAPPING),
        "regions_mapping": regions_mapping,
        "cbsa_metros": set(_METRO_TO_COUNTY_MAPPING),
        "metro_to_county_mapping": metro_to_county_mapping,
        "metro_to_region_mapping": metro_to_region_mapping,
    }
