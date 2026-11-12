"""
simplify_geometries.py — builds the lightweight map files the app draws from the detailed source GeoJSON.

Data sources:
    - assets/ca_counties.geojson — detailed California counties (58 features)
    - assets/ca_regions.geojson  — detailed California regions (9 features, numbered 1-9)
    - assets/us_states.geojson   — detailed US states plus DC and Puerto Rico (52 features);
      Alaska, Hawaii, and Puerto Rico are relocated, so it is for display only
    - lib/pophousing_config.py   — region names and the counties in each region

Outputs:
    - data/data-cleaned/geography/california-counties.geojson — properties GEOID, NAME
    - data/data-cleaned/geography/california-regions.geojson  — properties GEOID, NAME
    - data/data-cleaned/geography/us-states.geojson           — properties GEOID, NAME, STUSPS

Usage:
    web-viz-venv/bin/python -m scripts.shared.geography.simplify_geometries

Test Folders:
    - scripts/unit_tests/shared/geography/
"""

import json
import os
import sys
from dataclasses import dataclass

import geopandas as gpd
import numpy as np
import shapely
from shapely.geometry import MultiPolygon

from lib.config import CLEANED_DATA_DIRECTORY, PROJECT_ROOT
from lib.pophousing_config import REGIONS_MAPPING

# ── Constants ─────────────────────────────────────────────────────────────────

ASSETS_DIRECTORY = PROJECT_ROOT / "assets"
OUTPUT_DIRECTORY = CLEANED_DATA_DIRECTORY / "geography"

GEOGRAPHIC_CRS = "EPSG:4326"
# California Albers: an equal-area projection, so piece sizes come out in real
# square metres. Only used for measuring; output stays in longitude/latitude.
EQUAL_AREA_CRS = "EPSG:3310"
SQUARE_METRES_PER_KM2 = 1_000_000

# About 11 m. Far below a pixel at any zoom the app offers, and it removes a
# quarter of the file's digits.
COORDINATE_DECIMALS = 4

# The source file identifies regions only by number. Region data rows are labeled
# by name, and that name is already the project's canonical id, so it serves as
# both GEOID and NAME. check_region_numbering confirms this table against the
# counties each numbered shape actually contains.
REGION_NAMES_BY_NUMBER = {
    1: "Far North",
    2: "Bay Area",
    3: "San Diego (Regional)",
    4: "Inland Empire",
    5: "Sacramento (Regional)",
    6: "North San Joaquin Valley",
    7: "South San Joaquin Valley",
    8: "Central Coast",
    9: "Los Angeles (Regional)",
}


@dataclass(frozen=True)
class MapLayer:
    """One map file: where it comes from, how far to simplify it, and what it keeps."""

    source: str
    output: str
    # In degrees. Roughly the width of a pixel or two at the size the layer is drawn.
    tolerance: float
    expected_features: int
    properties: tuple
    min_part_km2: float | None = None


LAYERS = {
    "counties": MapLayer(
        source="ca_counties.geojson",
        output="california-counties.geojson",
        tolerance=0.02,
        expected_features=58,
        properties=("GEOID", "NAME"),
    ),
    "regions": MapLayer(
        source="ca_regions.geojson",
        output="california-regions.geojson",
        tolerance=0.02,
        expected_features=9,
        properties=("GEOID", "NAME"),
        # The source holds 1,155 specks under 1 km² (8.4 km² in total). Each costs
        # at least four points however hard it is simplified, so they would
        # otherwise make up most of the file.
        min_part_km2=1.0,
    ),
    "states": MapLayer(
        source="us_states.geojson",
        output="us-states.geojson",
        tolerance=0.05,
        expected_features=52,
        properties=("GEOID", "NAME", "STUSPS"),
    ),
}


class GeometryCheckError(ValueError):
    """A map file failed a check, so nothing should be written."""


"""
========================================================================================================================
Simplification
========================================================================================================================
"""


def polygon_parts(geometry):
    """List a Polygon or MultiPolygon's separate pieces. Test file: scripts/unit_tests/shared/geography/test_simplify_geometries.py"""
    return list(geometry.geoms) if isinstance(geometry, MultiPolygon) else [geometry]


def drop_small_parts(geometries, min_km2):
    """
    Remove pieces smaller than a size from each feature, always keeping its largest.

    Pieces are measured in an equal-area projection, but the ones kept are the
    original objects, so no coordinates shift through a round trip.

    Args:
        geometries: GeoSeries of Polygon/MultiPolygon in longitude/latitude.
        min_km2: Smallest piece to keep, in square kilometres.

    Returns:
        GeoSeries with the same index and CRS.

    Test file:
        scripts/unit_tests/shared/geography/test_simplify_geometries.py
    """
    kept = []
    for geometry in geometries:
        parts = polygon_parts(geometry)
        measured = gpd.GeoSeries(parts, crs=geometries.crs).to_crs(EQUAL_AREA_CRS)
        areas_km2 = measured.area.to_numpy() / SQUARE_METRES_PER_KM2
        large = [part for part, area in zip(parts, areas_km2) if area >= min_km2]
        if not large:
            large = [parts[int(np.argmax(areas_km2))]]
        kept.append(MultiPolygon(large) if len(large) > 1 else large[0])
    return gpd.GeoSeries(kept, index=geometries.index, crs=geometries.crs)


def simplify_shared_borders(geometries, tolerance):
    """Simplify a set of neighboring shapes, moving each shared border as one line. Test file: scripts/unit_tests/shared/geography/test_simplify_geometries.py"""
    return geometries.simplify_coverage(tolerance)


def round_coordinates(geometries, decimals=COORDINATE_DECIMALS):
    """Round every coordinate, then remove points the rounding made identical. Test file: scripts/unit_tests/shared/geography/test_simplify_geometries.py"""
    rounded = shapely.transform(geometries.to_numpy(), lambda coordinates: np.round(coordinates, decimals))
    return gpd.GeoSeries(shapely.remove_repeated_points(rounded), index=geometries.index, crs=geometries.crs)


def wind_for_drawing(geometries):
    """
    Point every ring the way Plotly's map drawing needs: outer rings clockwise.

    The GeoJSON standard (RFC 7946) says the opposite, and the source files follow
    it. But Plotly draws with d3-geo, which reads a ring's direction as which side
    is inside, so a standard ring fills the whole map except the shape itself.

    Args:
        geometries: GeoSeries of Polygon/MultiPolygon.

    Returns:
        GeoSeries with the same index and CRS.

    Test file:
        scripts/unit_tests/shared/geography/test_simplify_geometries.py
    """
    wound = shapely.orient_polygons(geometries.to_numpy(), exterior_cw=True)
    return gpd.GeoSeries(wound, index=geometries.index, crs=geometries.crs)


def is_wound_for_drawing(geometry):
    """Check that outer rings run clockwise and holes counter-clockwise. Test file: scripts/unit_tests/shared/geography/test_simplify_geometries.py"""
    return all(
        not part.exterior.is_ccw and all(ring.is_ccw for ring in part.interiors)
        for part in polygon_parts(geometry)
    )


def assign_region_ids(regions):
    """
    Give numbered region features the GEOID and NAME the app joins on.

    Args:
        regions: GeoDataFrame with a numeric `region` column.

    Returns:
        A copy with GEOID and NAME columns, both holding the region's name.

    Test file:
        scripts/unit_tests/shared/geography/test_simplify_geometries.py
    """
    unknown = sorted(set(regions["region"]) - set(REGION_NAMES_BY_NUMBER))
    if unknown:
        raise GeometryCheckError(f"Unknown region numbers: {unknown}")
    named = regions.copy()
    named["NAME"] = named["region"].map(REGION_NAMES_BY_NUMBER)
    named["GEOID"] = named["NAME"]
    return named


def simplify_layer(features, layer):
    """Apply a layer's simplification and keep only its properties. Test file: scripts/unit_tests/shared/geography/test_simplify_geometries.py"""
    geometries = features.geometry
    if layer.min_part_km2 is not None:
        geometries = drop_small_parts(geometries, layer.min_part_km2)
    # Winding comes last: simplifying can flip a ring's direction.
    geometries = wind_for_drawing(round_coordinates(simplify_shared_borders(geometries, layer.tolerance)))
    return gpd.GeoDataFrame(features[list(layer.properties)].copy(), geometry=geometries, crs=features.crs)


"""
========================================================================================================================
Checks
========================================================================================================================
"""


def check_layer(features, layer):
    """
    Confirm a simplified layer is safe to draw.

    `coverage_is_valid` fails when neighbors overlap or no longer meet along an
    identical border, which is how a gap between them shows up after simplifying.

    Args:
        features: Simplified GeoDataFrame.
        layer: The MapLayer it was built from.

    Raises:
        GeometryCheckError: Naming the first problem found.

    Test file:
        scripts/unit_tests/shared/geography/test_simplify_geometries.py
    """
    label = layer.output
    if len(features) != layer.expected_features:
        raise GeometryCheckError(f"{label}: expected {layer.expected_features} features, found {len(features)}")
    missing = [name for name in layer.properties if name not in features.columns]
    if missing:
        raise GeometryCheckError(f"{label}: missing properties {missing}")
    if features["GEOID"].isna().any() or features["GEOID"].duplicated().any():
        raise GeometryCheckError(f"{label}: GEOID values must be present and unique")
    if features.geometry.isna().any() or features.geometry.is_empty.any():
        raise GeometryCheckError(f"{label}: found an empty shape")
    if not features.geometry.is_valid.all():
        raise GeometryCheckError(f"{label}: found an invalid shape")
    if not shapely.coverage_is_valid(features.geometry.to_numpy()):
        raise GeometryCheckError(f"{label}: neighboring shapes overlap or no longer share a border")
    if not all(is_wound_for_drawing(geometry) for geometry in features.geometry):
        raise GeometryCheckError(f"{label}: found a ring wound the wrong way, which would draw inside out")


def check_region_numbering(regions, counties, regions_mapping=REGIONS_MAPPING):
    """
    Confirm each named region contains the counties the project assigns to it.

    Args:
        regions: GeoDataFrame with NAME holding region names.
        counties: GeoDataFrame with NAME holding county names.
        regions_mapping: Region name to county names.

    Raises:
        GeometryCheckError: Listing every county in the wrong region or in none.

    Test file:
        scripts/unit_tests/shared/geography/test_simplify_geometries.py
    """
    expected = {county: region for region, members in regions_mapping.items() for county in members}
    points = gpd.GeoDataFrame({"county": counties["NAME"].to_numpy()}, geometry=counties.representative_point().to_numpy(), crs=counties.crs)
    joined = points.sjoin(regions[["NAME", "geometry"]], how="left", predicate="within")
    found = dict(zip(joined["county"], joined["NAME"]))
    wrong = sorted(county for county, region in expected.items() if found.get(county) != region)
    if wrong:
        raise GeometryCheckError(f"Region numbering disagrees with REGIONS_MAPPING for: {wrong}")


"""
========================================================================================================================
Build
========================================================================================================================
"""


def build_layers(assets_directory=ASSETS_DIRECTORY):
    """
    Read, simplify, and check every layer. Nothing is written here, so one bad
    layer cannot leave the others replaced.

    Args:
        assets_directory: Folder holding the source GeoJSON.

    Returns:
        Dict of layer name to simplified GeoDataFrame.

    Test file:
        scripts/unit_tests/shared/geography/test_simplify_geometries.py
    """
    sources = {name: gpd.read_file(assets_directory / layer.source) for name, layer in LAYERS.items()}
    sources["regions"] = assign_region_ids(sources["regions"])
    check_region_numbering(sources["regions"], sources["counties"])
    built = {}
    for name, layer in LAYERS.items():
        built[name] = simplify_layer(sources[name], layer)
        check_layer(built[name], layer)
    return built


def to_geojson_text(features):
    """Serialize a layer as compact GeoJSON; these files are read by code, and indenting would inflate them. Test file: scripts/unit_tests/shared/geography/test_simplify_geometries.py"""
    return json.dumps(json.loads(features.to_json(drop_id=True)), separators=(",", ":"), ensure_ascii=False)


def write_atomically(path, text):
    """Replace a file in one step, so a failed write cannot leave a partial map behind. Test file: scripts/unit_tests/shared/geography/test_simplify_geometries.py"""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    os.replace(temporary, path)


def run(assets_directory=ASSETS_DIRECTORY, output_directory=OUTPUT_DIRECTORY):
    """Build every layer, then write them all. Test file: scripts/unit_tests/shared/geography/test_simplify_geometries.py"""
    built = build_layers(assets_directory)
    for name, features in built.items():
        path = output_directory / LAYERS[name].output
        text = to_geojson_text(features)
        write_atomically(path, text)
        points = int(shapely.get_num_coordinates(features.geometry.to_numpy()).sum())
        print(f"  ✓ {name}: {len(features)} features, {points:,} points, {len(text.encode('utf-8')):,} bytes → {path}")


def main():
    """Run the build, exiting non-zero with the reason if it fails. Test file: scripts/unit_tests/shared/geography/test_simplify_geometries.py"""
    try:
        run()
    except (GeometryCheckError, OSError) as error:
        print(f"  ⚠ Map files not written: {error}")
        sys.exit(1)


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    main()
