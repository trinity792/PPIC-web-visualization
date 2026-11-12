import json

import pytest

gpd = pytest.importorskip("geopandas")

import shapely  # noqa: E402
from shapely.geometry import MultiPolygon, Polygon, box  # noqa: E402

from scripts.shared.geography import simplify_geometries as module  # noqa: E402
from scripts.shared.geography.simplify_geometries import (  # noqa: E402
    GeometryCheckError,
    MapLayer,
    assign_region_ids,
    check_layer,
    check_region_numbering,
    drop_small_parts,
    is_wound_for_drawing,
    round_coordinates,
    simplify_layer,
    simplify_shared_borders,
    to_geojson_text,
    wind_for_drawing,
    write_atomically,
)

CRS = "EPSG:4326"
LAYER = MapLayer(source="s.geojson", output="o.geojson", tolerance=0.1, expected_features=2, properties=("GEOID", "NAME"))
COUNTER_CLOCKWISE_SQUARE = [(0, 0), (1, 0), (1, 1), (0, 1), (0, 0)]
CLOCKWISE_HOLE = [(0.25, 0.25), (0.25, 0.75), (0.75, 0.75), (0.75, 0.25), (0.25, 0.25)]


def jagged_neighbors():
    """Two California squares sharing a wiggly border, so simplifying has something to remove."""
    border = [(-120 + index * 0.01, 37 + (0.002 if index % 2 else 0)) for index in range(101)]
    top = Polygon(border + [(-119, 38), (-120, 38)])
    bottom = Polygon(border + [(-119, 36), (-120, 36)])
    return gpd.GeoSeries([top, bottom], crs=CRS)


def test_wind_for_drawing_runs_outer_rings_clockwise_and_holes_counter_clockwise():
    # The GeoJSON standard's direction, which draws inside out in Plotly.
    standard = Polygon(COUNTER_CLOCKWISE_SQUARE, [CLOCKWISE_HOLE])
    assert not is_wound_for_drawing(standard)
    wound = wind_for_drawing(gpd.GeoSeries([standard], crs=CRS)).iloc[0]
    assert not wound.exterior.is_ccw
    assert wound.interiors[0].is_ccw
    assert is_wound_for_drawing(wound)
    assert wound.equals(standard)


def test_wind_for_drawing_handles_every_piece_of_a_multipolygon():
    second = box(5, 5, 6, 6)
    wound = wind_for_drawing(gpd.GeoSeries([MultiPolygon([Polygon(COUNTER_CLOCKWISE_SQUARE), second])], crs=CRS)).iloc[0]
    assert all(not part.exterior.is_ccw for part in wound.geoms)
    assert is_wound_for_drawing(wound)


def test_simplified_layers_always_come_out_wound_for_drawing():
    # The source rings run counter-clockwise, as these do.
    features = layer_frame(jagged_neighbors().apply(shapely.force_2d).pipe(lambda s: gpd.GeoSeries(shapely.orient_polygons(s.to_numpy(), exterior_cw=False), crs=CRS)))
    result = simplify_layer(features, LAYER)
    assert all(is_wound_for_drawing(geometry) for geometry in result.geometry)


def test_check_layer_rejects_a_ring_wound_the_wrong_way():
    wrong = gpd.GeoSeries([Polygon(COUNTER_CLOCKWISE_SQUARE), wind_for_drawing(gpd.GeoSeries([box(5, 5, 6, 6)], crs=CRS)).iloc[0]], crs=CRS)
    with pytest.raises(GeometryCheckError, match="inside out"):
        check_layer(layer_frame(wrong), LAYER)


def layer_frame(geometries, ids=("A", "B")):
    return gpd.GeoDataFrame({"GEOID": list(ids), "NAME": list(ids)}, geometry=geometries, crs=CRS)


# ── Simplification ────────────────────────────────────────────────────────────


def test_drop_small_parts_removes_specks_and_keeps_large_pieces():
    large = box(-120, 37, -119, 38)
    # About 1 km across at this latitude, and 10 m across.
    medium = box(-118, 37, -117.98, 37.02)
    speck = box(-116, 37, -115.9999, 37.0001)
    result = drop_small_parts(gpd.GeoSeries([MultiPolygon([large, medium, speck])], crs=CRS), 1.0).iloc[0]
    assert isinstance(result, MultiPolygon)
    assert len(result.geoms) == 2
    assert not result.intersects(speck)


def test_drop_small_parts_keeps_original_coordinates():
    large = box(-120.123456, 37.123456, -119, 38)
    speck = box(-116, 37, -115.9999, 37.0001)
    result = drop_small_parts(gpd.GeoSeries([MultiPolygon([large, speck])], crs=CRS), 1.0).iloc[0]
    assert result.equals_exact(large, 0)


def test_drop_small_parts_never_empties_a_feature():
    small = box(-116, 37, -115.9999, 37.0001)
    smaller = box(-115, 37, -114.99995, 37.00005)
    result = drop_small_parts(gpd.GeoSeries([MultiPolygon([small, smaller])], crs=CRS), 1.0).iloc[0]
    assert result.equals(small)


def test_simplifying_removes_points_but_neighbors_still_share_a_border():
    neighbors = jagged_neighbors()
    simplified = simplify_shared_borders(neighbors, 0.1)
    assert shapely.get_num_coordinates(simplified.to_numpy()).sum() < shapely.get_num_coordinates(neighbors.to_numpy()).sum()
    assert shapely.coverage_is_valid(simplified.to_numpy())
    assert simplified.iloc[0].intersection(simplified.iloc[1]).length > 0


def test_round_coordinates_rounds_and_removes_points_it_makes_identical():
    square = Polygon([(-120.00001, 37), (-120.00002, 37), (-119, 37), (-119, 38), (-120.00001, 38), (-120.00001, 37)])
    result = round_coordinates(gpd.GeoSeries([square], crs=CRS)).iloc[0]
    coordinates = list(result.exterior.coords)
    assert coordinates == [(-120, 37), (-119, 37), (-119, 38), (-120, 38), (-120, 37)]


def test_assign_region_ids_uses_the_region_name_for_both_properties():
    regions = gpd.GeoDataFrame({"region": [2]}, geometry=[box(0, 0, 1, 1)], crs=CRS)
    named = assign_region_ids(regions).iloc[0]
    assert named["GEOID"] == "Bay Area"
    assert named["NAME"] == "Bay Area"


def test_assign_region_ids_rejects_an_unknown_number():
    regions = gpd.GeoDataFrame({"region": [10]}, geometry=[box(0, 0, 1, 1)], crs=CRS)
    with pytest.raises(GeometryCheckError, match="10"):
        assign_region_ids(regions)


def test_simplify_layer_keeps_only_the_layers_properties():
    features = layer_frame(jagged_neighbors())
    features["ALAND"] = [1, 2]
    result = simplify_layer(features, LAYER)
    assert set(result.columns) == {"GEOID", "NAME", "geometry"}
    check_layer(result, LAYER)


# ── Checks ────────────────────────────────────────────────────────────────────


def test_check_layer_rejects_the_wrong_feature_count():
    with pytest.raises(GeometryCheckError, match="expected 2 features, found 1"):
        check_layer(layer_frame(jagged_neighbors().iloc[:1], ids=("A",)), LAYER)


def test_check_layer_rejects_a_missing_property():
    layer = MapLayer(source="s", output="o", tolerance=0.1, expected_features=2, properties=("GEOID", "NAME", "STUSPS"))
    with pytest.raises(GeometryCheckError, match="STUSPS"):
        check_layer(layer_frame(jagged_neighbors()), layer)


def test_check_layer_rejects_duplicate_ids():
    with pytest.raises(GeometryCheckError, match="unique"):
        check_layer(layer_frame(jagged_neighbors(), ids=("A", "A")), LAYER)


def test_check_layer_rejects_an_empty_shape():
    with pytest.raises(GeometryCheckError, match="empty"):
        check_layer(layer_frame(gpd.GeoSeries([box(0, 0, 1, 1), Polygon()], crs=CRS)), LAYER)


def test_check_layer_rejects_an_invalid_shape():
    bowtie = Polygon([(0, 0), (1, 1), (1, 0), (0, 1), (0, 0)])
    with pytest.raises(GeometryCheckError, match="invalid"):
        check_layer(layer_frame(gpd.GeoSeries([box(5, 5, 6, 6), bowtie], crs=CRS)), LAYER)


def test_check_layer_rejects_overlapping_neighbors():
    with pytest.raises(GeometryCheckError, match="overlap"):
        check_layer(layer_frame(gpd.GeoSeries([box(0, 0, 2, 2), box(1, 1, 3, 3)], crs=CRS)), LAYER)


def test_check_layer_rejects_neighbors_whose_borders_no_longer_match():
    left = Polygon([(0, 0), (1, 0), (1, 1), (0, 1)])
    # Touches `left` along its edge, but with a vertex `left` does not have.
    right = Polygon([(1, 0), (2, 0), (2, 1), (1, 1), (1, 0.5)])
    with pytest.raises(GeometryCheckError, match="no longer share"):
        check_layer(layer_frame(gpd.GeoSeries([left, right], crs=CRS)), LAYER)


def test_check_region_numbering_accepts_matching_shapes():
    regions = gpd.GeoDataFrame({"NAME": ["North", "South"]}, geometry=[box(0, 1, 1, 2), box(0, 0, 1, 1)], crs=CRS)
    counties = gpd.GeoDataFrame({"NAME": ["Top", "Bottom"]}, geometry=[box(0, 1, 1, 2), box(0, 0, 1, 1)], crs=CRS)
    check_region_numbering(regions, counties, {"North": ["Top"], "South": ["Bottom"]})


def test_check_region_numbering_names_counties_in_the_wrong_region():
    regions = gpd.GeoDataFrame({"NAME": ["North", "South"]}, geometry=[box(0, 1, 1, 2), box(0, 0, 1, 1)], crs=CRS)
    counties = gpd.GeoDataFrame({"NAME": ["Top", "Bottom"]}, geometry=[box(0, 1, 1, 2), box(0, 0, 1, 1)], crs=CRS)
    with pytest.raises(GeometryCheckError, match=r"\['Bottom', 'Top'\]"):
        check_region_numbering(regions, counties, {"North": ["Bottom"], "South": ["Top"]})


def test_check_region_numbering_names_a_county_in_no_region():
    regions = gpd.GeoDataFrame({"NAME": ["North"]}, geometry=[box(0, 1, 1, 2)], crs=CRS)
    counties = gpd.GeoDataFrame({"NAME": ["Top"]}, geometry=[box(50, 50, 51, 51)], crs=CRS)
    with pytest.raises(GeometryCheckError, match="Top"):
        check_region_numbering(regions, counties, {"North": ["Top"]})


# ── Output ────────────────────────────────────────────────────────────────────


def test_to_geojson_text_is_compact_and_keeps_only_join_properties():
    text = to_geojson_text(layer_frame(jagged_neighbors()))
    parsed = json.loads(text)
    assert ": " not in text
    assert parsed["type"] == "FeatureCollection"
    assert parsed["features"][0]["properties"] == {"GEOID": "A", "NAME": "A"}
    assert "id" not in parsed["features"][0]


def test_write_atomically_leaves_only_the_final_file(tmp_path):
    path = tmp_path / "nested" / "map.geojson"
    write_atomically(path, "{}")
    write_atomically(path, '{"a":1}')
    assert path.read_text() == '{"a":1}'
    assert [item.name for item in path.parent.iterdir()] == ["map.geojson"]


def test_a_failed_check_writes_nothing(tmp_path, monkeypatch):
    def fail(_assets):
        raise GeometryCheckError("nope")

    monkeypatch.setattr(module, "build_layers", fail)
    output = tmp_path / "out"
    with pytest.raises(GeometryCheckError):
        module.run(assets_directory=tmp_path, output_directory=output)
    assert not output.exists()


def test_main_exits_non_zero_with_the_reason(capsys, monkeypatch):
    def fail():
        raise GeometryCheckError("regions are wrong")

    monkeypatch.setattr(module, "run", fail)
    with pytest.raises(SystemExit) as raised:
        module.main()
    assert raised.value.code == 1
    assert "regions are wrong" in capsys.readouterr().out
