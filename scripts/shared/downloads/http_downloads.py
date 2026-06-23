"""
http_downloads.py — fetches HTTP responses and atomically downloads files with normalized errors.

Data sources:
    - {url} — HTTP resource requested with caller-provided headers and timeout

Outputs:
    - requests.Response — successful HTTP response
    - {destination_path} — atomically written downloaded file

Usage:
    python scripts/shared/downloads/http_downloads.py

Test Folders:
    - scripts/unit_tests/shared/downloads/
"""

from pathlib import Path

import requests

"""
========================================================================================================================
HTTP Downloads
========================================================================================================================
"""


class HTTPDownloadError(RuntimeError):
    """Report a normalized HTTP request failure. Test file: scripts/unit_tests/shared/downloads/test_http_downloads.py"""

    pass


def fetch_response(url, headers, timeout):
    """Return a successful HTTP response or raise a normalized error. Test file: scripts/unit_tests/shared/downloads/test_http_downloads.py"""
    if timeout <= 0:
        raise ValueError("timeout must be greater than zero")

    try:
        response = requests.get(url, headers=headers, timeout=timeout)
        response.raise_for_status()
    except requests.Timeout as error:
        raise HTTPDownloadError(f"HTTP request timed out for {url}") from error
    except requests.ConnectionError as error:
        raise HTTPDownloadError(f"HTTP connection failed for {url}") from error
    except requests.HTTPError as error:
        raise HTTPDownloadError(f"HTTP request failed for {url}: {error}") from error
    except requests.RequestException as error:
        raise HTTPDownloadError(f"HTTP request could not be completed for {url}: {error}") from error
    return response


def download_file(url, destination_path, headers, timeout):
    """Atomically download an HTTP resource to a local path. Test file: scripts/unit_tests/shared/downloads/test_http_downloads.py"""
    destination_path = Path(destination_path)
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = destination_path.with_name(f"{destination_path.name}.part")

    try:
        response = fetch_response(url, headers, timeout)
        temporary_path.write_bytes(response.content)
        temporary_path.replace(destination_path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()

    return destination_path
