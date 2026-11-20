"""
extract_california_metros.py — cuts California's metro areas out of the national CBSA boundary file, as the map source the app simplifies.

Data sources:
    - data/data-raw/zillow/NTAD_Core_Based_Statistical_Areas_*.geojson — national CBSA boundaries
      (2023 OMB delineations, 935 areas, ~135 MB; gitignored, supplied by the researcher 2026-11-18)
    - assets/ca_counties.geojson — detailed California counties, used to split Fresno and Madera

Outputs:
    - assets/ca_metros.geojson — 26 California metros with properties GEOID (CBSA code), NAME (short
      name the datasets use), and ALT_NAME (a second dataset label, or null)

Usage:
    web-viz-venv/bin/python -m scripts.shared.geography.extract_california_metros --source data/data-raw/zillow/NTAD_Core_Based_Statistical_Areas_-7539325261031514892.geojson

    Run once when the boundary file changes, then run simplify_geometries to rebuild the app's map files.

Test Folders:
    - scripts/unit_tests/shared/geography/
"""

import argparse
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
import shapely
from shapely.geometry import MultiPolygon
from shapely.ops import polygonize, unary_union

from lib.config import PROJECT_ROOT

# ── Constants ─────────────────────────────────────────────────────────────────

ASSETS_DIRECTORY = PROJECT_ROOT / "assets"
COUNTIES_SOURCE = ASSETS_DIRECTORY / "ca_counties.geojson"
OUTPUT_PATH = ASSETS_DIRECTORY / "ca_metros.geojson"
GEOGRAPHIC_CRS = "EPSG:4326"
STATE_SUFFIX = ", CA"
METRO_LSAD = "M1"
# The simplifier's own grid (COORDINATE_DECIMALS in simplify_geometries.py, about
# 11 m). Rounding here, before borders are rebuilt, lets the rebuild absorb
# slivers thinner than a grid cell; rounding only afterwards collapsed the
# Madera/Merced sliver into a zero-width spike that failed the coverage check.
SOURCE_COORDINATE_DECIMALS = 4

FRESNO_CBSA = "23420"
MADERA_CBSA = "31460"
MADERA_COUNTY_GEOID = "06039"

# The 26 metros the Zillow and Building Permits topics report, keyed by CBSA
# code. NAME is the short label both datasets use; ALT_NAME is the label
# Building Permits uses where the two differ. Madera has no shape of its own in
# the 2023 delineations (it was merged into Fresno), so it is cut out of Fresno.
METROS_BY_CBSA = {
    "12540": {"name": "Bakersfield", "alt": None},
    "17020": {"name": "Chico", "alt": None},
    "20940": {"name": "El Centro", "alt": None},
    "23420": {"name": "Fresno", "alt": None},
    "25260": {"name": "Hanford", "alt": None},
    "31080": {"name": "Los Angeles", "alt": None},
    "31460": {"name": "Madera", "alt": None},
    "32900": {"name": "Merced", "alt": None},
    "33700": {"name": "Modesto", "alt": None},
    "34900": {"name": "Napa", "alt": None},
    "37100": {"name": "Oxnard", "alt": "Ventura"},
    "39820": {"name": "Redding", "alt": None},
    "40140": {"name": "Riverside", "alt": "Inland Empire"},
    "40900": {"name": "Sacramento", "alt": None},
    "41500": {"name": "Salinas", "alt": None},
    "41740": {"name": "San Diego", "alt": None},
    "41860": {"name": "San Francisco", "alt": None},
    "41940": {"name": "San Jose", "alt": None},
    "42020": {"name": "San Luis Obispo", "alt": None},
    "42100": {"name": "Santa Cruz", "alt": None},
    "42200": {"name": "Santa Maria", "alt": "Santa Barbara"},
    "42220": {"name": "Santa Rosa", "alt": None},
    "44700": {"name": "Stockton", "alt": None},
    "46700": {"name": "Vallejo", "alt": None},
    "47300": {"name": "Visalia", "alt": None},
    "49700": {"name": "Yuba City", "alt": None},
}


class MetroExtractError(ValueError):
    """The boundary file doesn't match the configured metros, so nothing should be written."""


"""
========================================================================================================================
Extraction
========================================================================================================================
"""


def split_fresno_and_madera(fresno_metro, counties):
    """
    Split the 2023 Fresno metro into the older Fresno and Madera metros along the county line.

    Madera is the metro clipped to Madera County, so the metro's outer edge (shared with
    its neighbors) is kept exactly. Where the county file and the metro file disagree on
    that outer edge, thin slivers fall outside the clipped Madera; the largest leftover
    piece is Fresno and any other piece touching Madera is folded into Madera.

    Args:
        fresno_metro: Polygon/MultiPolygon of CBSA 23420 (Fresno + Madera counties).
        counties: GeoDataFrame of California counties with a GEOID column.

    Returns:
        (fresno, madera) geometries.

    Test file:
        scripts/unit_tests/shared/geography/test_extract_california_metros.py
    """
    madera_county = counties.loc[counties["GEOID"] == MADERA_COUNTY_GEOID].geometry
    if madera_county.empty:
        raise MetroExtractError(f"county file has no Madera County ({MADERA_COUNTY_GEOID})")
    madera = fresno_metro.intersection(madera_county.iloc[0])
    remainder = fresno_metro.difference(madera)
    parts = sorted(
        list(remainder.geoms) if isinstance(remainder, MultiPolygon) else [remainder],
        key=lambda part: part.area,
        reverse=True,
    )
    fresno, leftovers = parts[0], parts[1:]
    fold_into_madera = [part for part in leftovers if part.intersects(madera)]
    keep_with_fresno = [part for part in leftovers if not part.intersects(madera)]
    if fold_into_madera:
        madera = unary_union([madera, *fold_into_madera])
    if keep_with_fresno:
        fresno = unary_union([fresno, *keep_with_fresno])
    return fresno, madera


def build_california_metros(cbsa, counties):
    """
    Select the configured California metros, split Fresno and Madera, and attach the dataset names.

    Args:
        cbsa: GeoDataFrame of the national CBSA file (GEOID, NAME, LSAD, geometry).
        counties: GeoDataFrame of California counties (GEOID, geometry).

    Returns:
        GeoDataFrame with GEOID, NAME, ALT_NAME, geometry, sorted by NAME.

    Raises:
        MetroExtractError: a configured metro is missing, or the file has a California
            metro the table doesn't know (a new delineation that needs a human look).

    Test file:
        scripts/unit_tests/shared/geography/test_extract_california_metros.py
    """
    cbsa = cbsa.to_crs(GEOGRAPHIC_CRS)
    counties = counties.to_crs(GEOGRAPHIC_CRS)
    california = cbsa[(cbsa["LSAD"] == METRO_LSAD) & cbsa["NAME"].str.endswith(STATE_SUFFIX)]
    found = set(california["GEOID"].astype(str))
    expected = set(METROS_BY_CBSA) - {MADERA_CBSA}
    missing = sorted(expected - found)
    if missing:
        raise MetroExtractError(f"boundary file is missing configured metros: {missing}")
    unknown = california[~california["GEOID"].astype(str).isin(expected)]
    if not unknown.empty:
        raise MetroExtractError(f"boundary file has unconfigured California metros: {sorted(unknown['NAME'])}")

    geometry_by_cbsa = dict(zip(california["GEOID"].astype(str), california.geometry))
    fresno, madera = split_fresno_and_madera(geometry_by_cbsa[FRESNO_CBSA], counties)
    geometry_by_cbsa[FRESNO_CBSA] = fresno
    geometry_by_cbsa[MADERA_CBSA] = madera

    rows = [{"GEOID": geoid, "NAME": entry["name"], "ALT_NAME": entry["alt"], "geometry": geometry_by_cbsa[geoid]} for geoid, entry in METROS_BY_CBSA.items()]
    metros = gpd.GeoDataFrame(pd.DataFrame(rows), geometry="geometry", crs=GEOGRAPHIC_CRS)
    return metros.sort_values("NAME").reset_index(drop=True)[["GEOID", "NAME", "ALT_NAME", "geometry"]]


def as_valid_coverage(metros, decimals=SOURCE_COORDINATE_DECIMALS):
    """
    Rebuild the metros from one shared, noded set of border lines so neighbors meet exactly.

    Splitting Fresno along the county line adds a corner where that line meets Merced's
    border, a corner Merced's own ring doesn't have; rounding adds hairline overlaps. The
    simplifier's coverage check rejects both. Here every border is noded together and
    polygonized, and each face goes to the first metro containing its interior point, so
    every shared edge has the same vertices on both sides and no area belongs to two metros.

    Args:
        metros: GeoDataFrame from build_california_metros.
        decimals: coordinate precision to round to before noding.

    Returns:
        A copy with rebuilt geometry, same rows and order.

    Test file:
        scripts/unit_tests/shared/geography/test_extract_california_metros.py
    """
    rounded = shapely.set_precision(metros.geometry.to_numpy(), 10**-decimals)
    linework = unary_union([geometry.boundary for geometry in rounded])
    faces_by_metro = {index: [] for index in range(len(rounded))}
    for face in polygonize(linework):
        point = face.representative_point()
        owner = next((index for index, geometry in enumerate(rounded) if geometry.contains(point)), None)
        if owner is not None:
            faces_by_metro[owner].append(face)
    rebuilt = metros.copy()
    rebuilt["geometry"] = [unary_union(faces_by_metro[index]) for index in range(len(rounded))]
    return rebuilt


"""
========================================================================================================================
Write
========================================================================================================================
"""


def write_metros(metros, output_path=OUTPUT_PATH):
    """Write the metro source file atomically. Test file: Not yet implemented"""
    output_path = Path(output_path)
    temporary = output_path.with_suffix(output_path.suffix + ".tmp")
    metros.to_file(temporary, driver="GeoJSON")
    temporary.replace(output_path)
    return output_path


def main():
    """Extract the California metros from a national CBSA file. Test file: Not yet implemented"""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--source", required=True, type=Path, help="national CBSA GeoJSON")
    arguments = parser.parse_args()
    try:
        metros = build_california_metros(gpd.read_file(arguments.source), gpd.read_file(COUNTIES_SOURCE))
        metros = as_valid_coverage(metros)
        if not shapely.coverage_is_valid(metros.geometry.to_numpy()):
            raise MetroExtractError("metros still overlap or disagree on a shared border after rebuilding")
        path = write_metros(metros)
    except (MetroExtractError, OSError) as error:
        print(f"  ⚠ Metro source not written: {error}")
        sys.exit(1)
    print(f"  ✓ {len(metros)} California metros → {path} ({path.stat().st_size:,} bytes)")


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    main()
