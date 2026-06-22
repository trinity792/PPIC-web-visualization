import os
import time

import pytest
import requests


@pytest.fixture
def set_file_age():
    def set_age(file_path, days):
        modified_time = time.time() - days * 86_400
        os.utime(file_path, (modified_time, modified_time))

    return set_age


@pytest.fixture(autouse=True)
def block_real_http(monkeypatch):
    def deny_request(*args, **kwargs):
        raise RuntimeError("Tests must not make real HTTP requests; add a mock")

    monkeypatch.setattr(requests, "get", deny_request)
    monkeypatch.setattr(requests, "post", deny_request)
