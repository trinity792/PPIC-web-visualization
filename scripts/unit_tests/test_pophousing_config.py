"""Smoke tests for the Population & Housing root configuration."""

from lib.pophousing_config import E5_COLUMN_NAMES, REGIONS_MAPPING


def test_region_count():
    assert len(REGIONS_MAPPING) == 9


def test_e5_schema_width():
    assert len(E5_COLUMN_NAMES) == 15
