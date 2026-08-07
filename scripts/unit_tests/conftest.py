import os
import time
from datetime import date

import pytest
import requests

from scripts.shared.archives import dataset_archive


class FrozenArchiveDate(date):
    """Clock used by archive tests so expected filenames never depend on today."""

    @classmethod
    def today(cls):
        return cls(2026, 8, 7)


@pytest.fixture
def set_file_age():
    def set_age(file_path, days):
        modified_time = time.time() - days * 86_400
        os.utime(file_path, (modified_time, modified_time))

    return set_age


@pytest.fixture
def frozen_archive_clock(monkeypatch):
    """
    Freeze dataset_archive's clock at 2026-08-07 so expected archive filenames can be
    hand-written rather than recomputed from the same call the code makes.

    raising=True deliberately: if the helper ever stops importing `date` at module level, this
    fails here with a clear message instead of silently no-opping and leaving every archive
    filename assertion dependent on the real calendar.
    """
    monkeypatch.setattr(dataset_archive, "date", FrozenArchiveDate)
    return FrozenArchiveDate(2026, 8, 7)


@pytest.fixture
def shared_archive_and_save():
    """Return the shared helper itself, for tests asserting a module re-exports it."""
    return dataset_archive.archive_and_save


@pytest.fixture(autouse=True)
def block_real_http(monkeypatch):
    def deny_request(*args, **kwargs):
        raise RuntimeError("Tests must not make real HTTP requests; add a mock")

    monkeypatch.setattr(requests, "get", deny_request)
    monkeypatch.setattr(requests, "post", deny_request)
