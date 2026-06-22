"""Smoke test — confirms pytest can find tests and import from lib/."""

from lib.config import REGIONS_MAPPING


def test_region_count():
    assert len(REGIONS_MAPPING) == 9