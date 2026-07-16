"""
ckan_downloader.py — enumerates and downloads changed RHNA cycle CSVs, DOCX dictionaries, and package metadata from CKAN.

Data sources:
    - data.ca.gov CKAN action API (package_show) for HCD's RHNA Progress Report
    - the signed-S3 resource URLs the CSV/DOCX resources redirect to

Outputs:
    - dict — package metadata (resources + metadata_modified)
    - list — enumerated (cycle_int, resource) pairs and downloaded (cycle, path, last_modified) records
    - files — refreshed DOCX dictionaries and data/details/RHNAInfo.json

Usage:
    Called by the acquisition fallback ladder; not run standalone.

Test Folders:
    - scripts/unit_tests/rhna_progress/acquisition/
"""

import json
import re
import time

import pandas as pd
import requests

from scripts.rhna_progress.config.sources import get_source_config

"""
========================================================================================================================
Package Metadata
========================================================================================================================
"""


def fetch_package_metadata(source_config):
    """
    Call CKAN package_show and return the resource inventory (name, format, url, last_modified) plus the package metadata_modified. Retries on transient HTTP failure; raises on a hard failure so acquisition can fall back.

    Test file: scripts/unit_tests/rhna_progress/acquisition/test_ckan_downloader.py
    """
    url = f"{source_config['api_base_url']}/package_show"
    headers = source_config["request_headers"]
    timeout = source_config["timeout"]
    attempts = max(1, int(source_config.get("retry_attempts", 1)))
    backoff = source_config.get("retry_backoff_seconds", 0)

    last_error = None
    for attempt in range(attempts):
        try:
            response = requests.get(
                url,
                params={"id": source_config["package_id"]},
                headers=headers,
                timeout=timeout,
            )
            response.raise_for_status()
            result = response.json()["result"]
            return {
                "metadata_modified": result.get("metadata_modified"),
                "resources": result.get("resources", []),
            }
        except Exception as error:  # noqa: BLE001 - transient failures retry, hard failures re-raise below
            last_error = error
            if attempt + 1 < attempts and backoff:
                time.sleep(backoff)
    raise last_error


"""
========================================================================================================================
Resource Enumeration
========================================================================================================================
"""


def enumerate_cycle_resources(resources, source_config):
    """Match CSV resources against the cycle name pattern and return an ordered list of (cycle_int, resource) - future cycles included automatically. Test file: scripts/unit_tests/rhna_progress/acquisition/test_ckan_downloader.py"""
    pattern = re.compile(source_config["resource_name_pattern"], re.IGNORECASE)
    matched = []
    for resource in resources:
        match = pattern.match(resource.get("name", ""))
        if match:
            matched.append((int(match.group("cycle")), resource))
    matched.sort(key=lambda pair: pair[0])
    return matched


def _is_newer(resource_modified, stored_snapshot):
    """Return True when a resource's last_modified is strictly newer than the stored snapshot (or nothing is stored)."""
    if stored_snapshot is None or (isinstance(stored_snapshot, float) and pd.isna(stored_snapshot)):
        return True
    return pd.Timestamp(resource_modified) > pd.Timestamp(stored_snapshot)


"""
========================================================================================================================
Downloads
========================================================================================================================
"""


def download_changed_cycles(cycle_resources, latest_snapshot_by_cycle, paths):
    """
    For each cycle whose resource last_modified is newer than the latest stored Snapshot Date, follow the 302 to S3 and download the CSV to the raw dir; skip unchanged cycles. Returns the downloaded (cycle, path, last_modified) records.

    Test file: scripts/unit_tests/rhna_progress/acquisition/test_ckan_downloader.py
    """
    config = get_source_config()
    headers = config["request_headers"]
    timeout = config["timeout"]
    download_directory = paths["download_directory"]

    downloaded = []
    for cycle, resource in cycle_resources:
        stored = latest_snapshot_by_cycle.get(cycle)
        if not _is_newer(resource.get("last_modified"), stored):
            continue
        download_directory.mkdir(parents=True, exist_ok=True)
        destination = download_directory / f"rhna_progress_{cycle}.csv"
        response = requests.get(
            resource["url"],
            headers=headers,
            timeout=timeout,
            allow_redirects=True,
        )
        response.raise_for_status()
        destination.write_bytes(response.content)
        downloaded.append(
            {
                "cycle": cycle,
                "path": destination,
                "last_modified": resource.get("last_modified"),
            }
        )
    return downloaded


def refresh_codebooks_and_details(resources, package_meta, paths):
    """Download the current DOCX dictionaries to docs/Codebooks and write/update data/details/RHNAInfo.json (coverage, cadence, granularity, last module refresh). Test file: scripts/unit_tests/rhna_progress/acquisition/test_ckan_downloader.py"""
    config = get_source_config()
    headers = config["request_headers"]
    timeout = config["timeout"]
    dictionary_pattern = re.compile(config["dictionary_name_pattern"], re.IGNORECASE)
    codebook_directory = paths["codebook_directory"]

    for resource in resources:
        if not dictionary_pattern.match(resource.get("name", "")):
            continue
        codebook_directory.mkdir(parents=True, exist_ok=True)
        filename = resource["name"].strip().lower().replace(" ", "-") + ".docx"
        response = requests.get(resource["url"], headers=headers, timeout=timeout, allow_redirects=True)
        response.raise_for_status()
        (codebook_directory / filename).write_bytes(response.content)

    details_path = paths["details_path"]
    details_path.parent.mkdir(parents=True, exist_ok=True)
    details = {
        "coverage": "California jurisdictions",
        "cadence": "Biweekly",
        "granularity": "Jurisdiction, Cycle, Snapshot Date, Income Level",
        "source": "California HCD RHNA Progress Report (data.ca.gov)",
        "source_last_updated": package_meta.get("metadata_modified"),
    }
    details_path.write_text(json.dumps(details, indent=2))
    return details
