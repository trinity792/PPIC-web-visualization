---
Topic: Population and Housing
Content Type: unit tests plan
pinned: false
description: "Guidelines and requirements for writing pytest tests covering the Phase 1 (Setup & Validation) and Phase 2 (Data Acquisition) modules of the refactored Pop-Housing pipeline."
Date Published: June 22, 2026
Last Updated: 07/04/2026 - 09:20 AM
---

# Pop-Housing Pipeline — Unit Testing Guide

Guidelines and requirements for writing pytest tests covering the Phase 1 (Setup & Validation) and Phase 2 (Data Acquisition) refactored modules.

---

## Test Directory Structure

Tests mirror the source tree. Each source module gets a corresponding test file in the same relative position under `scripts/unit_tests/`.

```
scripts/unit_tests/
├── conftest.py                          ← project-wide fixtures
├── test_config.py                       ← existing smoke test
│
├── shared/
│   ├── __init__.py
│   ├── conftest.py                      ← shared-level fixtures
│   ├── archives/
│   │   ├── __init__.py
│   │   └── test_file_retention.py
│   ├── downloads/
│   │   ├── __init__.py
│   │   └── test_http_downloads.py
│   └── validation/
│       ├── __init__.py
│       └── test_dataframe_validators.py
│
└── pophousing/
    ├── __init__.py
    ├── conftest.py                      ← pophousing-level fixtures
    ├── archives/
    │   ├── __init__.py
    │   └── test_e5_retention.py
    ├── acquisition/
    │   ├── __init__.py
    │   └── test_dof_e5_downloader.py
    ├── config/
    │   ├── __init__.py
    │   ├── test_paths.py
    │   └── test_sources.py
    └── validation/
        ├── __init__.py
        └── test_historical_data_validator.py
```

The project convention is to include an empty `__init__.py` in each test directory, even though pytest can traverse these directories without one. The `conftest.py` files at each level hold fixtures scoped to that level — shared fixtures don't import from pophousing, matching the dependency direction in the source code.

---

## General Testing Conventions

### Naming

Test files are named `test_{module_name}.py`. Inside each file, test functions follow the pattern:

```
test_{function_name}_{scenario}
```

Scenarios should describe the condition, not the expected outcome. A few examples:

```python
# Good — describes the condition being tested
def test_find_files_older_than_empty_directory():
def test_find_files_older_than_no_matches():
def test_find_files_older_than_mixed_ages():
def test_validate_required_columns_all_present():
def test_validate_required_columns_one_missing():

# Bad — describes the return value, not the scenario
def test_find_files_older_than_returns_empty_list():
def test_validate_required_columns_returns_true():
```

### Test Structure

Every test follows the Arrange → Act → Assert pattern. Keep each section visually separated:

```python
def test_find_files_older_than_mixed_ages(tmp_path):
    # Arrange: create files with different modification times
    old_file = tmp_path / "data_2020.csv"
    old_file.touch()
    set_file_age(old_file, days=100)

    new_file = tmp_path / "data_2024.csv"
    new_file.touch()

    # Act
    results = find_files_older_than(tmp_path, max_age_days=90, filename_pattern=r"data_\d{4}\.csv")

    # Assert
    assert results == [old_file]
```

### One Assertion Concept Per Test

Each test verifies one logical thing. A single `assert` is ideal; a few related asserts (checking both length and contents of a list) are fine. If you're asserting five different properties, that's five tests.

### No Tests That Test Python Itself

Don't test that `os.path.exists` works or that `pd.DataFrame` creates a DataFrame. Test *your logic* — the decisions, branching, edge handling, and composition your functions perform.

### Imports Mirror Source Imports

```python
# In test_file_retention.py
from scripts.shared.archives.file_retention import find_files_older_than, archive_or_delete_files

# In test_dof_e5_downloader.py
from scripts.pophousing.acquisition.dof_e5_downloader import get_e5_file_url, download_e5_data
```

This works because `pyproject.toml` sets `pythonpath = ["."]` at the project root.

---

## Fixture Strategy

### Filesystem Fixtures — Use `tmp_path`

Every test that touches files gets its own isolated temporary directory via pytest's built-in `tmp_path` fixture. Never create files in the real project tree during tests.

```python
def test_cleanup_old_e5_files_removes_expired(tmp_path):
    download_dir = tmp_path / "downloads"
    archive_dir = tmp_path / "archive"
    download_dir.mkdir()
    archive_dir.mkdir()
    # ... create test files inside download_dir
```

### DataFrame Fixtures — Small, Explicit, Inline

Build test DataFrames inside each test or in the module's `conftest.py`. Keep them minimal — the fewest rows and columns that exercise the function's logic. Don't load real CSV files from the project.

```python
# In scripts/unit_tests/pophousing/conftest.py

import pandas as pd
import pytest

@pytest.fixture
def minimal_housing_df():
    """Smallest valid housing DataFrame — 3 rows, required columns only."""
    return pd.DataFrame({
        "Location": ["California", "Alameda", "Oakland"],
        "Geographic Level": ["State", "County", "City"],
        "Year": [2023, 2023, 2023],
        "Total Population": [39000000, 1600000, 440000],
        "Total Housing Units": [14000000, 600000, 180000],
        "Single Family Units": [9000000, 400000, 100000],
    })
```

### Time Manipulation — Helper, Not Mock

For file-age tests, manipulate the file's modification time directly rather than mocking `datetime.now()`:

```python
# In scripts/unit_tests/conftest.py or a local conftest

import os
import time

def set_file_age(path, days):
    """Set a file's modification time to `days` ago."""
    age_seconds = days * 86400
    old_time = time.time() - age_seconds
    os.utime(path, (old_time, old_time))
```

### HTTP Mocking — Use `unittest.mock.patch` or `responses`

Phase 2 functions make HTTP requests. Never hit real servers in unit tests.

**`responses` library (more expressive, requires `pip install responses`):**

```python
import responses

@responses.activate
def test_fetch_response_success():
    responses.add(responses.GET, "https://example.com", body="<html>...</html>", status=200)
    result = fetch_response("https://example.com", headers={}, timeout=30)
    assert result.status_code == 200
```

### Config Fixtures — From the Active Config Module

Tests should import configuration from the module used by the source under test. Phase 1 and Phase 2 use `scripts/pophousing/config/paths.py` and `scripts/pophousing/config/sources.py`. Modules that still depend on Population & Housing geography or schema constants may import those values from `lib/pophousing_config.py`. Don't duplicate configuration values in test code — that's how drift happens.

```python
from scripts.pophousing.config.sources import get_source_settings
```

---

## Phase 1: Setup & Validation — Test Requirements

### `scripts/shared/archives/file_retention.py`

#### `find_files_older_than(directory, max_age_days, filename_pattern)`

This function scans a directory and returns file paths at or beyond an inclusive age threshold. `filename_pattern` is a regular expression evaluated with `re.fullmatch()`, not a glob.

**Tests for `test_file_retention.py`:**

| Test | What it verifies |
|---|---|
| `test_find_files_older_than_empty_directory` | Returns an empty list when the directory has no files. |
| `test_find_files_older_than_no_matches` | Returns empty when all files are newer than `max_age_days`. |
| `test_find_files_older_than_all_match` | Returns every file when all are older than the threshold. |
| `test_find_files_older_than_mixed_ages` | Returns only the old files, leaves new ones out. |
| `test_find_files_older_than_pattern_filtering` | Only considers files matching `filename_pattern` — ignores non-matching files even if old. |
| `test_find_files_older_than_boundary_age` | A file exactly `max_age_days` old is included because the boundary is inclusive. |
| `test_find_files_older_than_nonexistent_directory` | Raises a clear error (not a silent empty list) when the directory doesn't exist. |
| `test_find_files_older_than_ignores_subdirectories` | Doesn't recurse into subdirectories or return directory paths. |

**Key fixture:** `set_file_age` helper to backdate modification times.

#### `archive_or_delete_files(file_paths, archive_directory)`

Moves files to an archive directory, or deletes them when `archive_directory=None`. It does not copy files.

| Test | What it verifies |
|---|---|
| `test_archive_or_delete_files_moves_single_file` | File appears in `archive_directory`, no longer at original path. |
| `test_archive_or_delete_files_moves_multiple_files` | All listed files are archived. |
| `test_archive_or_delete_files_creates_archive_directory` | If `archive_directory` doesn't exist, it's created automatically. |
| `test_archive_or_delete_files_empty_list` | No-op when given an empty file list — no errors, no side effects. |
| `test_archive_or_delete_files_nonexistent_file` | Skips a listed file that no longer exists. |
| `test_archive_or_delete_files_name_collision` | Renames the incoming file with a numeric suffix instead of overwriting an existing archive. |
| `test_archive_or_delete_files_preserves_content` | Archived file has identical content to the original (read both and compare). |
| `test_archive_or_delete_files_delete_mode` | Deletes source files when `archive_directory=None`. |

---

### `scripts/shared/validation/dataframe_validators.py`

#### `validate_required_columns(dataframe, required_columns)`

| Test | What it verifies |
|---|---|
| `test_validate_required_columns_all_present` | Returns an empty missing-column list when every required column exists. |
| `test_validate_required_columns_one_missing` | Identifies the missing column by name. |
| `test_validate_required_columns_multiple_missing` | Reports all missing columns, not just the first. |
| `test_validate_required_columns_extra_columns_ok` | Extra columns beyond the required set still produce an empty list. |
| `test_validate_required_columns_empty_dataframe` | An empty DataFrame with the right column names produces an empty list because columns still exist. |
| `test_validate_required_columns_empty_required_list` | Returns an empty list when no columns are required. |

`validate_required_columns()` returns a list of missing column names. An empty list means every required column is present; callers decide whether missing columns are fatal.

#### `find_duplicate_rows(dataframe, key_columns)`

| Test | What it verifies |
|---|---|
| `test_find_duplicate_rows_no_duplicates` | Returns empty/zero when all key combinations are unique. |
| `test_find_duplicate_rows_with_duplicates` | Identifies the duplicated rows, including which key combination is repeated. |
| `test_find_duplicate_rows_multiple_key_columns` | Duplicates are judged by the composite key, not individual columns. Example: (Alameda, 2023) appearing twice is a duplicate, but (Alameda, 2023) and (Alameda, 2024) are not. |
| `test_find_duplicate_rows_single_key_column` | Works with just one key column. |
| `test_find_duplicate_rows_ignores_non_key_columns` | Two rows with identical keys but different non-key values are still flagged as duplicates. |

#### `validate_null_counts(dataframe, columns)`

| Test | What it verifies |
|---|---|
| `test_validate_null_counts_no_nulls` | Clean pass when specified columns have no nulls. |
| `test_validate_null_counts_some_nulls` | Reports which columns have nulls and how many. |
| `test_validate_null_counts_all_null_column` | A column that's entirely null is reported. |
| `test_validate_null_counts_nan_vs_none` | Both `NaN` and `None` are counted as null (pandas treats both as missing). |
| `test_validate_null_counts_subset_of_columns` | Only checks the columns you pass, ignores nulls in other columns. |

#### `validate_not_empty(dataframe)`

| Test | What it verifies |
|---|---|
| `test_validate_not_empty_with_rows` | Returns `True` when the DataFrame contains at least one row. |
| `test_validate_not_empty_without_rows` | Returns `False` when the DataFrame has columns but no rows. |

---

### `scripts/pophousing/archives/e5_retention.py`

#### `cleanup_old_e5_files(download_directory, archive_directory, max_age_days, filename_pattern=..., warning_days=..., deletion_log_directory=None)`

This composes the shared `file_retention` functions with E-5-specific policy. Since the shared functions are tested separately, these tests focus on the composition and E-5-specific behavior.

| Test | What it verifies |
|---|---|
| `test_cleanup_old_e5_files_uses_e5_pattern` | Only E-5 files (matching the expected filename pattern) are evaluated — other files in the same directory are ignored. |
| `test_cleanup_old_e5_files_archives_not_deletes` | Old E-5 files are moved to `archive_directory`, not permanently deleted. |
| `test_cleanup_old_e5_files_respects_max_age` | Files within the age limit are untouched. |
| `test_cleanup_old_e5_files_empty_directory` | No-op, no errors. |
| `test_cleanup_old_e5_files_returns_archived_paths` | Returns archived and warning path lists for operational visibility. |

#### `write_deletion_warnings(file_paths, warning_days, deletion_log_directory, max_age_days=60)`

| Test | What it verifies |
|---|---|
| `test_write_deletion_warnings_creates_warning_file` | A warning file appears in `deletion_log_directory` for a file approaching its threshold. |
| `test_write_deletion_warnings_multiple_thresholds` | With `warning_days=[15, 10, 5, 1]`, the correct warning is generated based on how close the file is to deletion. |
| `test_write_deletion_warnings_no_warnings_needed` | Files far from deletion produce no warning files. |
| `test_write_deletion_warnings_creates_log_directory` | Automatically creates `deletion_log_directory` if it doesn't exist. |
| `test_write_deletion_warnings_warning_content` | The warning file contains the filename and the projected deletion date (not just the existence of the file, but useful content inside it). |
| `test_write_deletion_warnings_no_duplicate_warnings` | Running twice for the same file at the same threshold doesn't create duplicate warning files. |

---

### `scripts/pophousing/validation/historical_data_validator.py`

#### `validate_historical_housing_data(file_path, validation_config)`

This composes the shared DataFrame validators with pophousing-specific checks (year coverage, geographic levels, California presence, population ranges). Tests should use small CSV fixtures written to `tmp_path`.

**Fixture pattern:**

```python
@pytest.fixture
def valid_historical_csv(tmp_path):
    """A minimal but valid historical housing CSV."""
    df = pd.DataFrame({
        "Location": ["California", "Alameda", "Oakland"] * 3,
        "Geographic Level": ["State", "County", "City"] * 3,
        "Year": [1991, 1991, 1991, 2005, 2005, 2005, 2020, 2020, 2020],
        "Total Population": [30000000, 1400000, 400000, 35000000, 1500000, 420000, 39000000, 1600000, 440000],
        "Total Housing Units": [11000000, 500000, 160000, 12500000, 550000, 170000, 14000000, 600000, 180000],
        "Single Family Units": [7000000, 350000, 90000, 8000000, 375000, 95000, 9000000, 400000, 100000],
    })
    path = tmp_path / "PopHousing_Historical.csv"
    df.to_csv(path, index=False)
    return path
```

| Test | What it verifies |
|---|---|
| `test_validate_historical_valid_file` | A properly formed file passes all checks. This is the baseline — if this fails, something is wrong with the test setup. |
| `test_validate_historical_missing_required_column` | Fails with a message naming the missing column. |
| `test_validate_historical_missing_year_coverage` | Fails when expected year range (1991–2020) has gaps. Test with a file that skips a decade. |
| `test_validate_historical_no_state_level_data` | Fails when no rows have `Geographic Level == "State"`. |
| `test_validate_historical_no_california_rows` | Fails when "California" is absent from the Location column. |
| `test_validate_historical_negative_population` | Fails when any `Total Population` is negative. |
| `test_validate_historical_zero_population_state` | Flags California with zero population as suspicious. |
| `test_validate_historical_has_duplicates` | Fails when the same (Location, Geographic Level, Year) appears twice. |
| `test_validate_historical_excessive_nulls` | Fails when null counts in critical columns exceed a threshold. |
| `test_validate_historical_file_not_found` | Raises a clear error when `file_path` doesn't exist. |
| `test_validate_historical_returns_structured_result` | Returns `(is_valid, validation_messages)` so the caller can decide how to handle failures. |

---

### `scripts/pophousing/config/paths.py`

#### `get_paths()`

| Test | What it verifies |
|---|---|
| `test_get_paths_project_root` | Resolves the repository root from the module location. |
| `test_get_paths_housing_directories` | Produces the expected raw, cleaned, archive, and log locations. |
| `test_get_paths_values_are_path_objects` | Returns `pathlib.Path` values rather than environment-dependent strings. |

---

## Phase 2: Data Acquisition — Test Requirements

### `scripts/pophousing/config/sources.py`

#### `get_source_settings()`

| Test | What it verifies |
|---|---|
| `test_get_source_settings_required_keys` | Includes every key consumed by the Phase 2 downloader. |
| `test_get_source_settings_e5_filename_pattern` | The configured regular expression accepts the canonical E-5 filename. |
| `test_get_source_settings_retention_consistency` | Cache and fallback ages are consistent with the 60-day retention policy. |
| `test_get_source_settings_request_configuration` | Uses HTTPS, a positive timeout, and an explicit User-Agent. |

---

### `scripts/shared/downloads/http_downloads.py`

These functions wrap `requests`. Every test mocks the network layer — no real HTTP calls.

#### `fetch_response(url, headers, timeout)`

| Test | What it verifies |
|---|---|
| `test_fetch_response_success` | Returns the response object on a 200. |
| `test_fetch_response_passes_headers` | The configured headers (e.g., Chrome User-Agent) are sent with the request. Inspect the mock's call args. |
| `test_fetch_response_passes_timeout` | The timeout value reaches `requests.get`. |
| `test_fetch_response_http_error` | A 404 or 500 response raises `HTTPDownloadError` with the URL and status detail. |
| `test_fetch_response_connection_error` | A `requests.ConnectionError` becomes `HTTPDownloadError` with a connection-specific message. |
| `test_fetch_response_timeout_error` | A `requests.Timeout` becomes `HTTPDownloadError` with a timeout-specific message. |

#### `download_file(url, destination_path, headers, timeout)`

| Test | What it verifies |
|---|---|
| `test_download_file_writes_content` | File at `destination_path` contains the response body. Use `tmp_path` for the destination. |
| `test_download_file_creates_parent_directories` | If the parent of `destination_path` doesn't exist, it's created. |
| `test_download_file_http_failure` | On a failed HTTP status, the file is not created (no partial writes). |
| `test_download_file_network_error` | On a connection/timeout error, the file is not created. |
| `test_download_file_overwrites_existing` | If the destination already exists, it's overwritten with new content. |

**Mock pattern for binary download:**

```python
def test_download_file_writes_content(tmp_path):
    dest = tmp_path / "subdir" / "test_file.xlsx"
    fake_content = b"fake excel bytes"

    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = fake_content
    mock_response.raise_for_status = Mock()

    with patch("scripts.shared.downloads.http_downloads.requests.get", return_value=mock_response):
        download_file("https://example.com/file.xlsx", dest, headers={}, timeout=60)

    assert dest.read_bytes() == fake_content
```

---

### `scripts/pophousing/acquisition/dof_e5_downloader.py`

These functions combine HTTP requests with HTML parsing, regex matching, caching logic, and Excel reading. Tests mock HTTP and filesystem interactions, then verify the parsing and decision logic.

#### `get_e5_file_url(source_settings)`

This function navigates two DOF web pages to find the E-5 download URL. It's the most scraping-heavy function in Phase 2.

**Fixture: fake DOF HTML pages.** Store these as string constants in the test file or in a `fixtures/` directory next to the test:

```python
FAKE_DOF_LANDING_HTML = """
<html><body>
<h2>E-5 Population and Housing Estimates for Cities, Counties, and the State:</h2>
  <ul>
    <li><a href="/sub-page-2020-2025">2020-2025</a></li>
    <li><a href="/other-page">Some other report</a></li>
  </ul>
</body></html>
"""

FAKE_DOF_SUBPAGE_HTML = """
<html><body>
<a href="https://dof.ca.gov/files/E-5-2025_Geo_InternetVersion.xlsx">
  Organized by Geography (Excel)
</a>
</body></html>
"""
```

| Test | What it verifies |
|---|---|
| `test_get_e5_file_url_normal_page` | Given the expected DOF HTML structure, extracts the correct Excel URL. |
| `test_get_e5_file_url_multiple_links_picks_correct` | When the page has multiple links, the function selects the E-5 link (by text match or pattern). |
| `test_get_e5_file_url_landing_page_failure` | When the first HTTP request fails, the function raises `E5DiscoveryError` with the underlying HTTP detail. |
| `test_get_e5_file_url_subpage_failure` | First request succeeds but the subpage request fails with the same typed, actionable error. |
| `test_get_e5_file_url_no_matching_link` | The landing page HTML exists but has no E-5 link — function reports what it expected vs. what it found. |
| `test_get_e5_file_url_changed_page_structure` | The expected E-5 heading or following link container is missing. Verify the error identifies the missing structural element. |
| `test_get_e5_file_url_relative_url_resolution` | The Excel link is relative (e.g., `/files/E-5-2025_Geo_InternetVersion.xlsx`) — verify it's resolved against the base URL. |

**Why this many tests for one function:** `get_e5_file_url` is the #1 fragility point identified in the previous-tool-analysis. The DOF site *will* change. Each test here documents one assumption about the page structure so that when it breaks, the failing test name tells you exactly which assumption was violated.

#### `get_e5_filename_from_url(url, filename_pattern)`

Pure string logic — no mocking needed.

| Test | What it verifies |
|---|---|
| `test_get_e5_filename_standard_url` | Extracts the filename from a typical E-5 URL like `https://dof.ca.gov/files/E-5-2025_Geo_InternetVersion.xlsx`. |
| `test_get_e5_filename_with_query_params` | URL has `?download=true` appended — query params are stripped. |
| `test_get_e5_filename_no_match` | URL doesn't contain a recognizable E-5 filename — raises `ValueError` with the invalid URL. |
| `test_get_e5_filename_pattern_validation` | If `filename_pattern` is provided, the extracted name must match it. |

#### `download_e5_data(url, download_directory, cache_max_age_days, headers=None, timeout=60)`

This orchestrates caching checks, downloading, and Excel loading. It's where you test the *caching policy*, not the HTTP mechanics (those are tested in `test_http_downloads.py`).

| Test | What it verifies |
|---|---|
| `test_download_e5_data_cache_hit` | A matching file younger than `cache_max_age_days` exists — no HTTP request is made, the cached file is loaded. |
| `test_download_e5_data_cache_miss` | No cached file exists — the function downloads and saves the file. |
| `test_download_e5_data_cache_expired` | A cached file exists but is older than `cache_max_age_days` — it's replaced by a fresh download. |
| `test_download_e5_data_download_failure_no_cache` | HTTP fails and no cache exists — raises a clear error. |
| `test_download_e5_data_download_failure_stale_cache` | HTTP fails while only a stale cache exists — raises `HTTPDownloadError` instead of silently serving expired data. |
| `test_download_e5_data_returns_dataframe` | On success, returns a pandas DataFrame, not a file path. |

**Mock strategy:** Patch `download_file` and `_read_e5_workbook` where they are imported and looked up in `dof_e5_downloader`. Use `tmp_path` for the download directory and create fake cached files with `set_file_age`. This avoids requiring `openpyxl` in unit tests.

```python
def test_download_e5_data_cache_hit(tmp_path):
    # Arrange: create a "cached" file that's recent
    cached = tmp_path / "E-5-2025_Geo_InternetVersion.xlsx"
    cached.write_bytes(b"fake excel")  # won't actually parse, but that's mocked

    fake_df = pd.DataFrame({"Location": ["Alameda"], "Year": [2024]})

    with patch("scripts.pophousing.acquisition.dof_e5_downloader._read_e5_workbook", return_value=fake_df) as mock_read, \
         patch("scripts.pophousing.acquisition.dof_e5_downloader.download_file") as mock_download:

        result = download_e5_data(
            url="https://dof.ca.gov/files/E-5-2025_Geo_InternetVersion.xlsx",
            download_directory=tmp_path,
            cache_max_age_days=90,
        )

    # Assert: used the cache, did NOT download
    mock_download.assert_not_called()
    mock_read.assert_called_once()
    assert len(result) == 1
```

#### `get_most_recent_e5_file(download_directory, filename_pattern, fallback_max_age_days)`

Fallback function — scans the download directory for the newest valid file.

| Test | What it verifies |
|---|---|
| `test_get_most_recent_e5_file_single_file` | One matching file within age limit — returns it. |
| `test_get_most_recent_e5_file_picks_newest` | Multiple matching files — returns the one with the most recent modification time. |
| `test_get_most_recent_e5_file_all_too_old` | All files exceed `fallback_max_age_days` — returns `None` without reading them. |
| `test_get_most_recent_e5_file_no_files` | Empty directory — returns `None`. |
| `test_get_most_recent_e5_file_ignores_non_matching` | Non-E-5 files in the directory are skipped regardless of age. |
| `test_get_most_recent_e5_file_returns_dataframe` | Like `download_e5_data`, verify the return type is a DataFrame, not a path. |

#### `_read_e5_workbook(workbook_path)`

This private helper is tested directly because it owns workbook-specific branching. Mock `pd.ExcelFile` and `pd.read_excel`; unit tests must not require a locally installed Excel engine.

| Test | What it verifies |
|---|---|
| `test_read_e5_workbook_data_sheet` | Reads the second worksheet, which is the E-5 data sheet. |
| `test_read_e5_workbook_without_data_sheet` | Raises an actionable `ValueError` when the workbook only contains metadata. |
| `test_read_e5_workbook_missing_excel_engine` | Converts pandas' optional-dependency `ImportError` into a clear `RuntimeError` naming `openpyxl`. |

---

## Cross-Cutting Test Requirements

These apply to every function across both phases.

### Error Messages Are Part of the Contract

When a function fails, its error message should be specific enough that someone can fix the problem without reading the source code. Test error messages, not just that an error occurs:

```python
def test_validate_required_columns_one_missing():
    df = pd.DataFrame({"a": [1], "b": [2]})
    missing_columns = validate_required_columns(df, ["a", "b", "c"])

    assert missing_columns == ["c"]
```

This is especially important for Phase 2's scraping functions where the DOF site will eventually change.

### Return Types Are Explicit

Tests must verify the implemented contracts rather than selecting a new one independently:

- Shared DataFrame validators return missing-column lists, duplicate-row DataFrames, null-count dictionaries, or booleans.
- `validate_historical_housing_data()` returns `(is_valid, validation_messages)` and raises `FileNotFoundError` for a missing source file.
- Shared HTTP failures raise `HTTPDownloadError` with timeout, connection, or HTTP-status context.
- E-5 page-discovery failures raise `E5DiscoveryError` with the failed structural or network assumption.
- E-5 cache lookup returns a DataFrame on success and `None` when no acceptable fallback exists.

### Shared Functions Never Reference Pop-Housing Concepts

This mirrors the source dependency rule. Tests for `scripts/shared/` must work with generic DataFrames and generic filenames — not county names, not E-5 columns, not housing metrics. If you find yourself importing from `lib/config` in a shared test, that's a signal the shared function has leaked domain knowledge.

```python
# Good — shared test uses generic data
def test_validate_required_columns_one_missing():
    df = pd.DataFrame({"a": [1], "b": [2]})
    result = validate_required_columns(df, ["a", "b", "c"])

# Bad — shared test uses pophousing domain data
def test_validate_required_columns_one_missing():
    df = pd.DataFrame({"Location": ["Alameda"], "Year": [2023]})
    result = validate_required_columns(df, ["Location", "Year", "Total Population"])
```

The pophousing tests are where you use real column names and geography.

### Log Output Doesn't Pollute Test Runs

If your functions use Python logging, add this to the top-level `conftest.py` to keep test output clean:

```python
import logging

@pytest.fixture(autouse=True)
def suppress_pipeline_logging():
    """Quiet pipeline loggers during tests — failures still show in test output."""
    logging.getLogger("scripts").setLevel(logging.CRITICAL)
    yield
    logging.getLogger("scripts").setLevel(logging.NOTSET)
```

### Tests Run Without Network Access

No test in Phase 1 or Phase 2 should require an internet connection. If a test fails because a mock is missing and a real HTTP call is attempted, that's a test bug. Consider adding a safety net:

```python
# In scripts/unit_tests/conftest.py

@pytest.fixture(autouse=True)
def block_real_http(monkeypatch):
    """Prevent accidental real HTTP requests during tests."""
    def deny(*args, **kwargs):
        raise RuntimeError("Tests must not make real HTTP requests — add a mock")
    monkeypatch.setattr("requests.get", deny)
    monkeypatch.setattr("requests.post", deny)
```

If a specific test needs to override this (unlikely for unit tests), it can re-patch locally.

---

## Summary: Minimum Test Counts

This table lists the minimum number of distinct test functions per module. The actual count will be higher once you add edge cases that emerge during implementation.

| Test File | Functions Covered | Minimum Tests |
|---|---|---|
| `test_file_retention.py` | `find_files_older_than`, `archive_or_delete_files` | 16 |
| `test_dataframe_validators.py` | `validate_required_columns`, `find_duplicate_rows`, `validate_null_counts`, `validate_not_empty` | 18 |
| `test_e5_retention.py` | `cleanup_old_e5_files`, `write_deletion_warnings` | 11 |
| `test_historical_data_validator.py` | `validate_historical_housing_data` | 11 |
| `test_paths.py` | `get_paths` | 3 |
| `test_sources.py` | `get_source_settings` | 4 |
| `test_http_downloads.py` | `fetch_response`, `download_file` | 11 |
| `test_dof_e5_downloader.py` | `get_e5_file_url`, `get_e5_filename_from_url`, `download_e5_data`, `get_most_recent_e5_file`, `_read_e5_workbook` | 26 |
| **Total** | | **~100** |

---

## Workflow: When to Write the Tests

Write tests and source code together, not source-first-tests-later. For each function in the refactoring plan:

1. Create the test file and write the test function signatures (just the names, with `pass` bodies).
2. Implement the source function.
3. Fill in the test bodies one at a time, running `./.venv/bin/pytest -x` (stop on first failure) as you go.
4. After all tests pass, review: is every branch in the source function exercised? Is every error path tested?

This means you'll have a growing test suite from the very first function, and you'll catch interface mismatches early — before they cascade into later phases.
# Pop-Housing Pipeline — Unit Testing Guide (Phases 3, 4 & 5)

Guidelines and requirements for writing pytest tests covering Phase 3 (Clean the Raw E-5 Data), Phase 4 (Merge Historical + Modern), and Phase 5 (Enrich the Merged Dataset).

This guide continues from the Phase 1 & 2 guide and follows the same conventions: Arrange → Act → Assert structure, `test_{function}_{scenario}` naming, small inline DataFrame fixtures, `tmp_path` for file I/O, and the shared-vs-pophousing dependency boundary.

---

## Test Directory Additions

These directories and files extend the existing structure from Phases 1 & 2.

```
scripts/unit_tests/
├── conftest.py
├── ...                                  ← Phase 1 & 2 files unchanged
│
├── shared/
│   ├── ...                              ← existing shared tests
│   ├── data_cleaning/
│   │   ├── __init__.py
│   │   ├── test_type_conversions.py
│   │   ├── test_row_filters.py
│   │   └── test_dataframe_operations.py
│   └── validation/
│       ├── ...                          ← existing test_dataframe_validators.py
│       └── (validate_numeric_range tests added to test_dataframe_validators.py)
│
└── pophousing/
    ├── ...                              ← existing pophousing tests
    ├── cleaning/
    │   ├── __init__.py
    │   ├── test_e5_schema_normalizer.py
    │   ├── test_hierarchical_location_cleaning.py
    │   ├── test_location_standardization.py
    │   └── test_geographic_classification.py
    ├── calculations/
    │   ├── __init__.py
    │   ├── test_housing_metrics.py
    │   └── test_rate_normalization.py
    ├── merging/
    │   ├── __init__.py
    │   └── test_historical_modern_merge.py
    ├── aggregation/
    │   ├── __init__.py
    │   ├── test_aggregation_utils.py
    │   ├── test_regional_aggregation.py
    │   └── test_state_aggregation.py
    └── validation/
        ├── ...                          ← existing test_historical_data_validator.py
        ├── test_cleaning_validators.py
        └── test_aggregation_validators.py
```

---

## Fixture Strategy for Phases 3–5

Phases 3–5 are heavier on DataFrame transformations than Phases 1–2. The fixtures below support these patterns.

### Hierarchical E-5 Layout Fixture

The raw E-5 workbook uses a hierarchical layout: a county name appears once as a header, followed by its cities with blank county fields. This structure is central to Phase 3 cleaning. Build a fixture that reproduces this layout:

```python
# In scripts/unit_tests/pophousing/conftest.py

import pandas as pd
import pytest

@pytest.fixture
def raw_e5_hierarchical_df():
    """Mimics the E-5 Excel layout before forward-filling.

    County names appear as headers above their cities.
    City rows have blank County fields. 'County Total' and
    'State Total' are summary rows that must be handled specially.
    """
    return pd.DataFrame({
        "County": ["Alameda", None, None, None, "San Francisco", None],
        "Location": ["County Total", "Oakland", "Berkeley", "Balance of County",
                      "County Total", "San Francisco"],
        "Year": [2023, 2023, 2023, 2023, 2023, 2023],
        "Total Population": [1600000, 440000, 120000, 1040000, 870000, 870000],
        "Total Housing Units": [600000, 180000, 50000, 370000, 400000, 400000],
        "Geographic Level": [None, None, None, None, None, None],
    })
```

### Multi-Year County DataFrame Fixture

Phase 4 and 5 tests need DataFrames spanning multiple years with proper geographic levels already assigned:

```python
@pytest.fixture
def multi_year_county_df():
    """County-level data for two counties across three years.

    Suitable for merge, aggregation, and rate-calculation tests.
    """
    rows = []
    for year in [2020, 2021, 2022]:
        rows.append({
            "Location": "Alameda", "County": "Alameda",
            "Geographic Level": "County", "Year": year,
            "Total Population": 1600000 + (year - 2020) * 10000,
            "Household Population": 1560000 + (year - 2020) * 9000,
            "Total Housing Units": 600000 + (year - 2020) * 2000,
            "Occupied Units": 570000 + (year - 2020) * 1800,
            "Vacant Units": 30000 + (year - 2020) * 200,
            "Single Family Units": 400000,
            "Multiple Family Units": 200000,
            "Vacancy Rate": 5.0,
            "Persons Per Household": 2.74,
            "Source": "DoF",
        })
        rows.append({
            "Location": "Contra Costa", "County": "Contra Costa",
            "Geographic Level": "County", "Year": year,
            "Total Population": 1150000 + (year - 2020) * 5000,
            "Household Population": 1120000 + (year - 2020) * 4500,
            "Total Housing Units": 420000 + (year - 2020) * 1000,
            "Occupied Units": 400000 + (year - 2020) * 900,
            "Vacant Units": 20000 + (year - 2020) * 100,
            "Single Family Units": 310000,
            "Multiple Family Units": 110000,
            "Vacancy Rate": 4.76,
            "Persons Per Household": 2.80,
            "Source": "DoF",
        })
    return pd.DataFrame(rows)
```

### Config Imports for Domain Tests

Pophousing tests import real configuration values. Don't duplicate mappings or lists:

```python
from lib.pophousing_config import (
    REGIONS_MAPPING, COUNTY_LEVEL, ALL_TOWNS,
    CITY_NAME_MAPPINGS, HISTORICAL_NAME_STANDARDIZATION,
    AMBIGUOUS_CITY_NAMES, E5_COLUMN_NAMES,
)
```

---

## Phase 3: Clean the Raw E-5 Data — Test Requirements

Phase 3 is the most function-dense phase. It spans four shared modules and five pophousing modules. The tests are organized below in dependency order: shared utilities first, then pophousing modules that compose them.

---

### `scripts/shared/data_cleaning/type_conversions.py`

#### `parse_year_from_date(dataframe, date_col, out_col)`

Extracts a four-digit year from a date column and writes it to a new column. The date column may contain datetime objects, date strings, or mixed formats.

| Test | What it verifies |
|---|---|
| `test_parse_year_from_date_datetime_objects` | Extracts years from `pd.Timestamp` values. |
| `test_parse_year_from_date_string_dates` | Parses `"2023-01-01"` and `"January 1, 2023"` style strings. |
| `test_parse_year_from_date_mixed_formats` | Handles a column with both datetime objects and strings without erroring. |
| `test_parse_year_from_date_creates_new_column` | The output column is separate from the input — the original date column is unmodified. |
| `test_parse_year_from_date_null_dates` | Null values in the date column produce null in the output column, not errors. |
| `test_parse_year_from_date_output_is_integer` | The output column dtype is numeric (int or Int64), not string. |

**Keep tests generic.** Use column names like `"date"` and `"year"`, not `"Date"` and `"Year"`.

#### `coerce_numeric_columns(dataframe, numeric_cols)`

Forces specified columns to numeric dtype, coercing unparseable values to NaN.

| Test | What it verifies |
|---|---|
| `test_coerce_numeric_already_numeric` | Columns that are already int/float are unchanged. |
| `test_coerce_numeric_string_numbers` | `"1234"` and `"56.78"` are converted to numeric values. |
| `test_coerce_numeric_commas` | `"1,234,567"` is handled — verify whether your implementation strips commas or whether pandas `to_numeric` handles them. Test the actual behavior. |
| `test_coerce_numeric_unparseable_becomes_nan` | `"N/A"`, `""`, and `"--"` become NaN, not errors. |
| `test_coerce_numeric_preserves_other_columns` | Non-specified columns are not touched. |
| `test_coerce_numeric_empty_column_list` | No-op when passed an empty list. |

---

### `scripts/shared/data_cleaning/row_filters.py`

#### `filter_year_range(dataframe, year_col, min_year, max_year)`

| Test | What it verifies |
|---|---|
| `test_filter_year_range_keeps_within_bounds` | Rows with year between `min_year` and `max_year` (inclusive) are retained. |
| `test_filter_year_range_drops_outside_bounds` | Rows before `min_year` or after `max_year` are dropped. |
| `test_filter_year_range_min_only` | When `max_year=None`, only the lower bound applies. |
| `test_filter_year_range_max_only` | When `min_year=None`, only the upper bound applies. |
| `test_filter_year_range_boundary_inclusive` | Rows exactly at `min_year` and `max_year` are included. |
| `test_filter_year_range_empty_result` | All rows outside range returns an empty DataFrame with the same columns. |

#### `remove_summary_rows(dataframe, location_col, keep_values)`

Removes rows whose location matches summary patterns (e.g., "Incorporated", "Unincorporated") while preserving explicitly kept values like "County Total" and "State Total".

| Test | What it verifies |
|---|---|
| `test_remove_summary_rows_drops_incorporated` | Rows with "Incorporated" or "Unincorporated" in the location column are removed. |
| `test_remove_summary_rows_preserves_keep_values` | "County Total" and "State Total" (or whatever `keep_values` specifies) survive the filter. |
| `test_remove_summary_rows_preserves_regular_rows` | City and county rows are untouched. |
| `test_remove_summary_rows_case_handling` | Verify whether matching is case-sensitive or case-insensitive, and test accordingly. |
| `test_remove_summary_rows_empty_keep_values` | When `keep_values` is empty, all summary-pattern rows are removed. |

#### `remove_header_like_rows(dataframe, location_col, patterns)`

Removes rows where the location value matches header-like patterns (e.g., text that looks like a section label rather than a place name).

| Test | What it verifies |
|---|---|
| `test_remove_header_like_rows_matches_patterns` | Rows matching any provided regex pattern are removed. |
| `test_remove_header_like_rows_preserves_data_rows` | Rows not matching any pattern are untouched. |
| `test_remove_header_like_rows_empty_patterns` | No-op when patterns list is empty. |
| `test_remove_header_like_rows_null_locations` | Rows with null location values are handled without error. |

#### `drop_empty_rows_without_data(dataframe, location_col, data_cols)`

Removes rows where the location is blank/null and all specified data columns are zero or null.

| Test | What it verifies |
|---|---|
| `test_drop_empty_rows_removes_blank_location_zero_data` | A row with null location and all-zero data columns is removed. |
| `test_drop_empty_rows_keeps_blank_location_with_data` | A row with null location but nonzero data in at least one column is kept. |
| `test_drop_empty_rows_keeps_named_location_zero_data` | A row with a populated location and zero data is kept — the filter is only about genuinely empty rows. |
| `test_drop_empty_rows_nan_data_treated_as_empty` | NaN values in data columns count as empty, same as zero. |

---

### `scripts/shared/data_cleaning/dataframe_operations.py`

#### `forward_fill_columns(dataframe, columns)`

Simple pandas forward fill scoped to specific columns.

| Test | What it verifies |
|---|---|
| `test_forward_fill_columns_fills_nulls` | Null values in specified columns are filled from the preceding row. |
| `test_forward_fill_columns_preserves_non_null` | Existing values are never overwritten. |
| `test_forward_fill_columns_leaves_other_columns` | Columns not in the list are untouched, even if they have nulls. |
| `test_forward_fill_columns_leading_nulls` | Nulls at the start of a column (no preceding value) remain null. |

#### `assign_values_from_mapping(dataframe, source_col, target_col, value_mapping)`

Writes values to `target_col` based on a dictionary lookup of `source_col`.

| Test | What it verifies |
|---|---|
| `test_assign_values_from_mapping_applies_matches` | Rows whose `source_col` matches a key get the mapped value in `target_col`. |
| `test_assign_values_from_mapping_no_match` | Rows without a matching key have their `target_col` unchanged. |
| `test_assign_values_from_mapping_creates_target_column` | If `target_col` doesn't exist, it's created. |
| `test_assign_values_from_mapping_empty_mapping` | No-op when the mapping dict is empty. |

---

### `scripts/shared/validation/dataframe_validators.py` (addition)

Phase 5 adds one new function to the existing shared validators module.

#### `validate_numeric_range(dataframe, value_col, min_value, max_value, row_mask)`

| Test | What it verifies |
|---|---|
| `test_validate_numeric_range_all_within` | Returns no violations when all values are in range. |
| `test_validate_numeric_range_below_minimum` | Identifies rows where the value is below `min_value`. |
| `test_validate_numeric_range_above_maximum` | Identifies rows where the value exceeds `max_value`. |
| `test_validate_numeric_range_with_mask` | Only checks rows where `row_mask` is True — other rows are ignored even if out of range. |
| `test_validate_numeric_range_null_values` | Null values are not flagged as violations (they're missing, not out of range). |
| `test_validate_numeric_range_open_bounds` | When `min_value=None` or `max_value=None`, only the provided bound is enforced. |

---

### `scripts/pophousing/cleaning/e5_schema_normalizer.py`

#### `normalize_e5_columns(raw_e5_df, column_names)`

Assigns the canonical E-5 column names to the raw DataFrame's positional columns.

| Test | What it verifies |
|---|---|
| `test_normalize_e5_columns_correct_count` | When the DataFrame has exactly as many columns as `column_names`, all columns are renamed. |
| `test_normalize_e5_columns_extra_columns` | When the DataFrame has more columns than `column_names`, the extra columns are retained with their original names (or dropped — test whichever behavior you implement). |
| `test_normalize_e5_columns_fewer_columns` | When the DataFrame has fewer columns than expected, raises `ValueError` naming the mismatch (expected N, found M). |
| `test_normalize_e5_columns_preserves_data` | Renaming columns does not alter cell values. |

#### `trim_to_first_data_row(raw_e5_df, anchor_value, column)`

Drops all rows above the first occurrence of `anchor_value` in `column`. For E-5, the anchor is `"Alameda"` in the county column — everything above it is header metadata.

| Test | What it verifies |
|---|---|
| `test_trim_to_first_data_row_removes_headers` | Rows above the anchor are dropped. The row containing the anchor is kept. |
| `test_trim_to_first_data_row_no_anchor_found` | Raises `ValueError` identifying the missing anchor value and the column searched. |
| `test_trim_to_first_data_row_anchor_at_top` | If the anchor is already the first row, nothing is dropped. |
| `test_trim_to_first_data_row_resets_index` | The returned DataFrame has a contiguous integer index starting at 0. |

#### `rename_e5_schema(raw_e5_df, mapping)`

Applies the `Region` → `County`, `City` → `Location` column renames.

| Test | What it verifies |
|---|---|
| `test_rename_e5_schema_applies_mapping` | Columns listed in the mapping are renamed. |
| `test_rename_e5_schema_missing_source_column` | Raises `KeyError` or `ValueError` identifying which expected column is absent. |
| `test_rename_e5_schema_preserves_unmapped_columns` | Columns not in the mapping are unchanged. |

---

### `scripts/pophousing/cleaning/hierarchical_location_cleaning.py`

This module contains the most intricate logic in Phase 3. The E-5 workbook uses a hierarchical layout where county names appear as headers above their constituent cities. Testing requires DataFrames that reproduce this layout.

#### `has_meaningful_housing_data(housing_row, value_columns)`

Row-level check: does a row have at least one nonzero, non-null value in the specified columns?

| Test | What it verifies |
|---|---|
| `test_has_meaningful_data_all_nonzero` | Returns True when all value columns are positive. |
| `test_has_meaningful_data_all_zero` | Returns False when all value columns are zero. |
| `test_has_meaningful_data_all_null` | Returns False when all value columns are null. |
| `test_has_meaningful_data_mixed_zero_and_nonzero` | Returns True — one nonzero column is enough. |
| `test_has_meaningful_data_mixed_null_and_nonzero` | Returns True — nulls in some columns don't negate a real value in another. |

#### `identify_county_headers(housing_df, county_names, location_col)`

Detects rows that are county headers — rows where the location matches a known county name and the next row is a "County Total" or a city belonging to that county.

| Test | What it verifies |
|---|---|
| `test_identify_county_headers_standard_layout` | Correctly tags county-header rows in a typical E-5 layout where a county name sits above "County Total". |
| `test_identify_county_headers_not_a_header` | A row with a county name that is followed by another county (not cities) is not tagged as a header. |
| `test_identify_county_headers_ambiguous_name` | "San Diego" appearing as a city within San Diego County is not misidentified as a header row. Uses `county_names` to distinguish. |
| `test_identify_county_headers_last_row` | A county name in the last row of the DataFrame (no following rows) is handled without index errors. |

#### `build_county_context_column(housing_df, location_col, county_col, temp_col)`

Creates a temporary column recording which county each row belongs to, based on the hierarchical position of county headers above city rows.

| Test | What it verifies |
|---|---|
| `test_build_county_context_cities_get_parent_county` | City rows receive the name of the county header above them. |
| `test_build_county_context_county_total_gets_county` | "County Total" rows get the county name from their header. |
| `test_build_county_context_state_total` | "State Total" rows do not receive a county assignment. |
| `test_build_county_context_multiple_counties` | The context resets correctly when moving from one county block to the next. |

#### `forward_fill_locations_with_context(housing_df, location_col, county_col)`

The main row-by-row loop that forward-fills location names while tracking county context. This is the most complex function in Phase 3.

| Test | What it verifies |
|---|---|
| `test_forward_fill_context_fills_blank_locations` | City rows with blank locations are filled from the preceding non-blank row within the same county block. |
| `test_forward_fill_context_county_boundary_stops_fill` | A blank location immediately after a new county header is not filled with a city name from the previous county. |
| `test_forward_fill_context_preserves_county_total` | "County Total" rows retain their location value — they're not overwritten by a forward-fill. |
| `test_forward_fill_context_preserves_state_total` | "State Total" is never overwritten. |
| `test_forward_fill_context_three_county_blocks` | Process three consecutive county blocks (e.g., Alameda → Contra Costa → San Francisco) and verify each city lands under the correct county. |
| `test_forward_fill_context_single_city_county` | San Francisco has only one city which shares its county name — the fill doesn't confuse the city with the county header. |

**Fixture pattern for this function:**

```python
def test_forward_fill_context_fills_blank_locations():
    # Arrange: two cities under Alameda, blanks in Location
    df = pd.DataFrame({
        "County": ["Alameda", None, None],
        "Location": ["County Total", None, None],
        "Total Population": [1600000, 440000, 120000],
    })
    # The expected behavior: forward_fill should NOT fill these
    # blanks from "County Total" — it should use context to assign
    # the city names from the original E-5 structure.
    # Adjust this fixture to match your actual E-5 row layout.
```

The exact fixture structure depends on how much of the raw E-5 hierarchy your implementation expects as input. If `forward_fill_locations_with_context` receives the DataFrame *after* `build_county_context_column` has run, the `_temp_county` column will already be present. Build fixtures that match the actual pre-condition.

---

### `scripts/pophousing/cleaning/location_standardization.py`

#### `standardize_location_column(housing_df, location_col, geo_col, only_levels)`

Applies name mappings (`CITY_NAME_MAPPINGS`, `HISTORICAL_NAME_STANDARDIZATION`), strips " City" and " Town" suffixes (except for names in `PROPER_NAMES_ENDING_IN_CITY`), and scopes changes to specific geographic levels via `only_levels`.

| Test | What it verifies |
|---|---|
| `test_standardize_location_name_mapping` | A location present in `CITY_NAME_MAPPINGS` (e.g., "Rancho Santa Margarita" → its canonical form) is renamed. |
| `test_standardize_location_historical_mapping` | A location in `HISTORICAL_NAME_STANDARDIZATION` is renamed. |
| `test_standardize_location_strips_city_suffix` | `"Oakland City"` becomes `"Oakland"`. |
| `test_standardize_location_strips_town_suffix` | `"Yountville Town"` becomes `"Yountville"`. |
| `test_standardize_location_preserves_proper_city_names` | Names in `PROPER_NAMES_ENDING_IN_CITY` (e.g., `"Daly City"`, `"Redwood City"`) keep their " City" suffix. |
| `test_standardize_location_only_levels_filter` | When `only_levels=["City"]`, only city-level rows are standardized; county and region rows are untouched. |
| `test_standardize_location_only_levels_none` | When `only_levels=None`, all rows are standardized regardless of geographic level. |
| `test_standardize_location_no_matching_names` | Rows with already-standard names pass through unchanged. |

---

### `scripts/pophousing/cleaning/geographic_classification.py`

This module has the most functions of any Phase 3 module. Most are small and focused, but `classify_ambiguous_location` and `assign_missing_geographic_levels` have significant branching.

#### `resolve_county_total_rows(housing_df, location_col, temp_county_col)`

Replaces "County Total" in the location column with the actual county name from the temporary county-context column.

| Test | What it verifies |
|---|---|
| `test_resolve_county_total_replaces_with_county_name` | A row with Location="County Total" and _temp_county="Alameda" becomes Location="Alameda". |
| `test_resolve_county_total_sets_geographic_level` | The resolved row gets `Geographic Level = "County"`. |
| `test_resolve_county_total_multiple_counties` | Each "County Total" row resolves to its own county, not a shared one. |
| `test_resolve_county_total_no_county_total_rows` | No-op when no "County Total" rows exist. |

#### `normalize_state_total_rows(housing_df, location_col, state_name)`

Renames "State Total" to `state_name` (e.g., "California") and sets the geographic level.

| Test | What it verifies |
|---|---|
| `test_normalize_state_total_renames` | "State Total" becomes "California". |
| `test_normalize_state_total_sets_level` | The row gets `Geographic Level = "State"`. |
| `test_normalize_state_total_no_state_rows` | No-op when no "State Total" rows exist. |

#### `apply_town_overrides(housing_df, town_list, location_col, level_col)`

Explicitly sets `Geographic Level = "Town"` for locations appearing in the configured town list.

| Test | What it verifies |
|---|---|
| `test_apply_town_overrides_known_town` | A location in `ALL_TOWNS` (e.g., "Yountville") gets level "Town". |
| `test_apply_town_overrides_not_in_list` | A city not in the town list is unaffected. |
| `test_apply_town_overrides_preserves_existing_level` | If a town already has the correct level, it's not altered (idempotent). |
| `test_apply_town_overrides_empty_list` | No-op when `town_list` is empty. |

#### `classify_ambiguous_location(location, county_context, population, housing_row, housing_df, row_index)`

Resolves names that are both a city and a county (e.g., "San Francisco", "San Diego"). Uses explicit markers first, then structural position, then the town list, then a population threshold as a last resort.

| Test | What it verifies |
|---|---|
| `test_classify_ambiguous_san_francisco_as_city` | San Francisco within a San Francisco county block, with a city-sized population, is classified as "City". |
| `test_classify_ambiguous_san_diego_city_in_county_block` | "San Diego" appearing under a San Diego county header (preceded by "County Total" context) is classified as "City". |
| `test_classify_ambiguous_explicit_county_marker` | When the row has an explicit county-level marker (e.g., it IS a "County Total" row), the classification is "County" regardless of name. |
| `test_classify_ambiguous_population_threshold_fallback` | When structural position and markers are inconclusive, a large population (above the threshold) yields "City" and a small one yields "Town". |
| `test_classify_ambiguous_unknown_name` | A name not in `AMBIGUOUS_CITY_NAMES` is not processed by this function — it returns None or defers. |

#### `assign_missing_geographic_levels(housing_df, classifier_fn, location_col, county_col, population_col, level_col)`

Fills in `Geographic Level` for rows that still have null/blank levels after the explicit assignment steps.

| Test | What it verifies |
|---|---|
| `test_assign_missing_levels_fills_blanks` | Rows with null geographic level get a level assigned via the classifier function. |
| `test_assign_missing_levels_preserves_existing` | Rows with an already-assigned level are not changed. |
| `test_assign_missing_levels_uses_classifier` | The provided `classifier_fn` is called for each row needing classification, with the correct arguments. |
| `test_assign_missing_levels_all_assigned` | No-op when every row already has a geographic level. |

#### `sanitize_geographic_levels(housing_df, valid_levels, default_level)`

Fills any remaining blank or invalid geographic levels with a default.

| Test | What it verifies |
|---|---|
| `test_sanitize_levels_fills_blank_with_default` | Null or empty-string levels become `default_level`. |
| `test_sanitize_levels_replaces_invalid` | A level not in `valid_levels` (e.g., "Unknown") becomes `default_level`. |
| `test_sanitize_levels_preserves_valid` | Valid levels ("State", "County", "City", "Town", "Region") are unchanged. |

#### `remove_balance_rows(housing_df, location_col)`

Drops rows where the location starts with "Balance of" (e.g., "Balance of County").

| Test | What it verifies |
|---|---|
| `test_remove_balance_rows_drops_balance` | Rows with "Balance of County" or "Balance of Alameda" are removed. |
| `test_remove_balance_rows_preserves_others` | City, county, and state rows are untouched. |
| `test_remove_balance_rows_no_balance_rows` | No-op when no "Balance of" rows exist. |

#### `drop_helper_columns(housing_df, columns)`

Removes temporary working columns (e.g., `_temp_county`) from the final output.

| Test | What it verifies |
|---|---|
| `test_drop_helper_columns_removes_listed` | Named columns are removed from the DataFrame. |
| `test_drop_helper_columns_missing_column` | Silently skips columns that don't exist rather than raising. |
| `test_drop_helper_columns_preserves_data_columns` | Non-listed columns are untouched. |

#### `standardize_san_francisco_classification(housing_df, location_col, level_col)`

Duplicates San Francisco rows so it appears as both a City and a County. This function runs exactly once in Phase 6, but it's defined in this module and tested here.

| Test | What it verifies |
|---|---|
| `test_sf_classification_creates_both_rows` | A single SF row produces two rows: one with level "City", one with level "County". |
| `test_sf_classification_identical_data` | Both rows have identical population, housing, and year values. |
| `test_sf_classification_original_removed` | The original SF row (with whatever level it had) is replaced by the two new rows, not left alongside them. |
| `test_sf_classification_multiple_years` | Each SF year-row produces its own City + County pair. |
| `test_sf_classification_idempotent` | Running the function twice doesn't produce four rows per year — it recognizes that City and County versions already exist. |
| `test_sf_classification_no_sf_rows` | No-op when San Francisco isn't in the dataset. |

---

### `scripts/pophousing/calculations/housing_metrics.py`

#### `add_housing_derived_columns(housing_df)`

Computes `Single Family Units`, `Multiple Family Units`, and `Vacant Units` from the component columns already present in the DataFrame.

| Test | What it verifies |
|---|---|
| `test_add_derived_single_family` | `Single Family Units = Single Family Detached + Single Family Attached`. |
| `test_add_derived_multiple_family` | `Multiple Family Units = Two to Four + Five Plus`. |
| `test_add_derived_vacant` | `Vacant Units = Total Housing Units - Occupied Units`. |
| `test_add_derived_null_components` | When a component column has NaN, the derived column is NaN (not zero). |
| `test_add_derived_preserves_existing_columns` | Existing columns are untouched; only the three new columns are added. |
| `test_add_derived_overwrites_existing_derived` | If `Single Family Units` already exists (from a previous pass or historical data), it's overwritten with the fresh calculation. |

**Fixture pattern:**

```python
def test_add_derived_single_family():
    df = pd.DataFrame({
        "Single Family Detached Units": [300000],
        "Single Family Attached Units": [100000],
        "Two to Four Family Units": [50000],
        "Five Plus Family Units": [150000],
        "Total Housing Units": [600000],
        "Occupied Units": [570000],
    })
    result = add_housing_derived_columns(df)
    assert result["Single Family Units"].iloc[0] == 400000
```

#### `recalculate_housing_rates(housing_df, row_mask)`

Recomputes Vacancy Rate and Persons Per Household for rows selected by `row_mask`. Used after aggregation (Phases 5 and 6) when summing component columns makes the old rates invalid.

| Test | What it verifies |
|---|---|
| `test_recalculate_rates_vacancy` | `Vacancy Rate = (Vacant Units / Total Housing Units) * 100`. |
| `test_recalculate_rates_persons_per_household` | `Persons Per Household = Household Population / Occupied Units`. |
| `test_recalculate_rates_only_masked_rows` | Rows where `row_mask` is False retain their original rate values. |
| `test_recalculate_rates_zero_housing_units` | When Total Housing Units is zero, Vacancy Rate becomes NaN (not division-by-zero error). |
| `test_recalculate_rates_zero_occupied` | When Occupied Units is zero, Persons Per Household becomes NaN. |
| `test_recalculate_rates_precision` | Rates are rounded to a consistent number of decimal places (verify the rounding convention). |

---

### `scripts/pophousing/validation/cleaning_validators.py`

#### Tests for Phase 3 post-cleaning validation

This module validates the output of the Phase 3 cleaning pipeline. The specific functions depend on your implementation, but the following scenarios must be covered:

| Test | What it verifies |
|---|---|
| `test_cleaning_validator_no_balance_rows_remain` | No rows with "Balance of" in the location column survived cleaning. |
| `test_cleaning_validator_no_null_geographic_levels` | Every row has a non-null geographic level. |
| `test_cleaning_validator_valid_levels_only` | Geographic levels are limited to the valid set (State, County, City, Town). |
| `test_cleaning_validator_no_null_locations` | Every row has a non-null, non-empty location name. |
| `test_cleaning_validator_year_range` | All years fall within the expected modern range (≥ 2020). |
| `test_cleaning_validator_no_duplicate_keys` | No duplicate (Location, Geographic Level, Year) combinations exist. |

---

## Phase 4: Merge Historical + Modern — Test Requirements

Phase 4 is the smallest phase. All functions live in one pophousing module.

---

### `scripts/pophousing/merging/historical_modern_merge.py`

#### `load_historical_housing_data(historical_file_path)`

Loads the historical CSV and validates it has the expected schema.

| Test | What it verifies |
|---|---|
| `test_load_historical_valid_csv` | Loads a well-formed CSV into a DataFrame with correct dtypes. |
| `test_load_historical_missing_file` | Raises `FileNotFoundError` with the attempted path. |
| `test_load_historical_missing_columns` | Raises `ValueError` naming the missing columns when the CSV schema doesn't match. |
| `test_load_historical_empty_csv` | Raises `ValueError` when the CSV has headers but no data rows. |

**Use `tmp_path`:** Write small test CSVs to `tmp_path` rather than depending on real data files.

#### `filter_historical_years(historical_housing_df, max_year)`

Drops rows with years above `max_year`. For the standard pipeline, `max_year=2020` removes years that overlap with the modern E-5 data.

| Test | What it verifies |
|---|---|
| `test_filter_historical_years_drops_above_max` | Rows with year > 2020 are removed. |
| `test_filter_historical_years_keeps_at_max` | Rows with year exactly 2020 are kept (inclusive boundary). |
| `test_filter_historical_years_all_below` | When all years are below `max_year`, the DataFrame is returned unchanged. |
| `test_filter_historical_years_preserves_columns` | The column set is unchanged after filtering. |

#### `merge_historical_and_modern_data(historical_housing_df, modern_housing_df)`

Concatenates the two DataFrames and enforces schema alignment.

| Test | What it verifies |
|---|---|
| `test_merge_concatenates_rows` | The result contains all rows from both sources. |
| `test_merge_column_alignment` | Both DataFrames must have the same columns; a mismatch raises `ValueError` listing the differences. |
| `test_merge_preserves_source_tag` | If a `Source` column exists, the historical and modern rows retain their respective values. |
| `test_merge_resets_index` | The merged DataFrame has a contiguous integer index. |
| `test_merge_empty_historical` | When historical is empty, the result equals the modern data. |
| `test_merge_empty_modern` | When modern is empty, the result equals the historical data. |

#### `resolve_source_overlap(merged_housing_df, key_columns, source_priority)`

Deduplicates rows where the same (Location, Geographic Level, Year) appears in both historical and modern data. `source_priority` specifies which source wins (e.g., `"E-5"` over `"E-8"`).

| Test | What it verifies |
|---|---|
| `test_resolve_overlap_keeps_priority_source` | When a key combination appears in both sources, only the `source_priority` row survives. |
| `test_resolve_overlap_no_duplicates` | When there's no overlap, all rows are retained. |
| `test_resolve_overlap_boundary_year_2020` | Year 2020 specifically — the year most likely to appear in both historical and modern data — resolves correctly. |
| `test_resolve_overlap_multiple_locations_same_year` | Overlap resolution is per (Location, Geographic Level, Year) — two different locations in the same overlapping year are both resolved independently. |
| `test_resolve_overlap_preserves_non_overlapping_years` | Rows in years that only exist in one source are untouched. |

**Fixture pattern:**

```python
def test_resolve_overlap_keeps_priority_source():
    historical = pd.DataFrame({
        "Location": ["Alameda"], "Geographic Level": ["County"],
        "Year": [2020], "Total Population": [1600000], "Source": ["E-8"],
    })
    modern = pd.DataFrame({
        "Location": ["Alameda"], "Geographic Level": ["County"],
        "Year": [2020], "Total Population": [1610000], "Source": ["E-5"],
    })
    merged = pd.concat([historical, modern], ignore_index=True)

    result = resolve_source_overlap(merged, key_columns=["Location", "Geographic Level", "Year"],
                                     source_priority="E-5")

    assert len(result) == 1
    assert result.iloc[0]["Total Population"] == 1610000
```

---

## Phase 5: Enrich the Merged Dataset — Test Requirements

Phase 5 transforms the merged dataset by building regional and state aggregates, fixing rate formatting, and validating the enriched output. The key testing principle here: **aggregation of additive columns (population, housing counts) uses sums, but rate columns (Vacancy Rate, Persons Per Household) must be recalculated from the summed components, not summed directly.** Every aggregation test must verify this distinction.

---

### `scripts/pophousing/aggregation/aggregation_utils.py`

#### `remove_existing_geographic_level(housing_df, level_col, level_name)`

Strips all rows of a given geographic level before rebuilding aggregates. Prevents stale region or state rows from persisting.

| Test | What it verifies |
|---|---|
| `test_remove_existing_level_drops_target` | All "Region" rows are removed when `level_name="Region"`. |
| `test_remove_existing_level_preserves_others` | County, City, Town, and State rows are untouched. |
| `test_remove_existing_level_no_matching_rows` | No-op when no rows match the target level. |
| `test_remove_existing_level_returns_copy` | The original DataFrame is not mutated. |

#### `deduplicate_geographic_rows(housing_df, location_col, year_col, level_col, preferred_level)`

Before aggregating counties into regions, this removes duplicate county rows (which can appear when a location exists at both City and County levels with the same name and year).

| Test | What it verifies |
|---|---|
| `test_deduplicate_keeps_preferred_level` | When "Alameda" appears as both City and County for 2023, the County row survives because `preferred_level="County"`. |
| `test_deduplicate_no_duplicates` | When all (location, year) combinations are unique, the DataFrame is returned unchanged. |
| `test_deduplicate_preserves_different_years` | "Alameda" County in 2022 and "Alameda" County in 2023 are both kept (different years). |
| `test_deduplicate_multiple_ambiguous_locations` | Both "San Francisco" and "San Diego" are deduplicated in the same pass. |

---

### `scripts/pophousing/aggregation/regional_aggregation.py`

#### `build_regional_rows(housing_df, regions_mapping, location_col, level_col, year_col)`

Groups county rows into regions using `REGIONS_MAPPING` and returns new region rows with summed additive columns.

| Test | What it verifies |
|---|---|
| `test_build_regional_rows_sums_population` | The Bay Area region's Total Population equals the sum of its 9 constituent counties' populations. |
| `test_build_regional_rows_sums_housing` | Total Housing Units, Occupied Units, Vacant Units, etc. are summed (not averaged). |
| `test_build_regional_rows_does_not_sum_rates` | Vacancy Rate and Persons Per Household in the output are NOT the sum of county rates. They should either be recalculated or left for `recalculate_housing_rates` to handle. |
| `test_build_regional_rows_per_year` | Each year gets its own region rows — regions from 2020 and 2021 are separate. |
| `test_build_regional_rows_geographic_level` | Every output row has `Geographic Level = "Region"`. |
| `test_build_regional_rows_all_nine_regions` | Given data for all 58 counties, produces rows for all 9 regions. |
| `test_build_regional_rows_missing_county` | When a county belonging to a region is absent from the data, the region is still built from the available counties (log a warning, don't fail). |
| `test_build_regional_rows_ignores_non_county_rows` | City, Town, State, and existing Region rows in the input are ignored — only County rows feed the aggregation. |

**Fixture for this test group:** Use the `multi_year_county_df` fixture from the pophousing conftest, or a purpose-built fixture that includes at least two counties belonging to the same region.

#### `add_regional_data(housing_df, regions_mapping)`

The entry point that removes existing region rows, builds new ones, recalculates rates, and appends.

| Test | What it verifies |
|---|---|
| `test_add_regional_data_replaces_stale_regions` | If old region rows exist, they're removed and replaced with freshly aggregated ones. |
| `test_add_regional_data_rates_are_recalculated` | The Vacancy Rate and Persons Per Household in region rows reflect the recalculated values (Vacant / Total Housing * 100), not a sum of county rates. |
| `test_add_regional_data_preserves_county_rows` | The original county rows are unchanged in the output. |
| `test_add_regional_data_row_count` | For N years and 9 regions, the output has the original rows plus 9 × N new region rows. |

**Rate recalculation verification pattern:**

```python
def test_add_regional_data_rates_are_recalculated(multi_year_county_df):
    # Arrange: only include Bay Area counties for simplicity
    bay_area_counties = REGIONS_MAPPING["Bay Area"]
    df = multi_year_county_df[multi_year_county_df["Location"].isin(bay_area_counties)]

    result = add_regional_data(df, REGIONS_MAPPING)
    bay_area_rows = result[result["Location"] == "Bay Area"]

    for _, row in bay_area_rows.iterrows():
        # Rate must equal the recalculated value, not the sum of county rates
        expected_vacancy = (row["Vacant Units"] / row["Total Housing Units"]) * 100
        assert abs(row["Vacancy Rate"] - expected_vacancy) < 0.01
```

---

### `scripts/pophousing/aggregation/state_aggregation.py`

#### `find_missing_state_years(housing_df, state_name, year_col)`

Identifies which years have county-level data but no California state-level row.

| Test | What it verifies |
|---|---|
| `test_find_missing_state_years_some_missing` | Returns the year(s) where counties exist but no "California" State row does. |
| `test_find_missing_state_years_none_missing` | Returns an empty list when every year already has a state row. |
| `test_find_missing_state_years_all_missing` | Returns all years when no state rows exist at all. |

#### `build_state_rows_from_counties(housing_df, missing_years, state_name)`

Aggregates county data for the missing years into state-level rows.

| Test | What it verifies |
|---|---|
| `test_build_state_rows_sums_counties` | Total Population for California equals the sum of all 58 counties' populations (or however many are present). |
| `test_build_state_rows_does_not_sum_rates` | Same principle as regions: rates are recalculated, not summed. |
| `test_build_state_rows_geographic_level` | Every output row has `Geographic Level = "State"` and `Location = "California"`. |
| `test_build_state_rows_only_missing_years` | Only the years in `missing_years` are built — existing state rows are not duplicated. |
| `test_build_state_rows_ignores_non_county` | City, Town, and Region rows don't feed into the state aggregate. |

#### `add_state_data_for_missing_years(housing_df, state_name)`

Entry point: finds missing years, builds state rows, recalculates rates, appends.

| Test | What it verifies |
|---|---|
| `test_add_state_data_fills_gaps` | A year that had no California row now has one after the function runs. |
| `test_add_state_data_no_gaps` | No-op when every year already has a California row. |
| `test_add_state_data_rates_recalculated` | State-level Vacancy Rate and Persons Per Household reflect the recalculated values. |
| `test_add_state_data_preserves_existing_state_rows` | State rows that already existed are not replaced or modified. |

---

### `scripts/pophousing/calculations/rate_normalization.py`

#### `find_decimal_fraction_rates(housing_df, year_col, rate_col, level_col, min_year)`

Identifies rows where the vacancy rate appears to be stored as a decimal fraction (e.g., 0.05) rather than a percentage (e.g., 5.0). Applies only to non-State rows in years ≥ `min_year`.

| Test | What it verifies |
|---|---|
| `test_find_decimal_rates_detects_small_values` | A rate of 0.05 for year 2022 at City level is flagged. |
| `test_find_decimal_rates_ignores_state_rows` | State-level rows are excluded from the mask regardless of their rate value. |
| `test_find_decimal_rates_ignores_old_years` | Rows before `min_year` are excluded from the mask. |
| `test_find_decimal_rates_does_not_flag_zero` | A rate of exactly 0.0 is not flagged (zero is not a decimal fraction needing conversion). |
| `test_find_decimal_rates_does_not_flag_normal_percentages` | A rate of 5.0 is not flagged — it's already in percentage form. |
| `test_find_decimal_rates_boundary_value` | Test rates at 1.0 exactly — this is the boundary. Verify whether 1.0 is considered a decimal fraction or a valid percentage. Document the choice. |

#### `normalize_decimal_fraction_rates(housing_df, rate_col, mask)`

Multiplies flagged rates by 100 and rounds.

| Test | What it verifies |
|---|---|
| `test_normalize_decimal_rates_multiplies` | 0.05 becomes 5.0. |
| `test_normalize_decimal_rates_rounds` | The result is rounded to a consistent number of decimal places. |
| `test_normalize_decimal_rates_only_masked_rows` | Rows where `mask` is False are unchanged. |
| `test_normalize_decimal_rates_preserves_other_columns` | Only the rate column is modified. |

---

### `scripts/pophousing/validation/aggregation_validators.py`

#### `validate_normalized_housing_rates(housing_df, year_col, rate_col, level_col)`

Checks that after normalization, all rates fall within a plausible range. Composes the shared `validate_numeric_range` with pophousing-specific rules.

| Test | What it verifies |
|---|---|
| `test_validate_rates_all_plausible` | Rates between 0 and 100 pass. |
| `test_validate_rates_negative_rate` | A negative Vacancy Rate is flagged. |
| `test_validate_rates_over_100` | A Vacancy Rate above 100% is flagged. |
| `test_validate_rates_suspicious_decimal` | A rate that still looks like an unconverted decimal (e.g., 0.05 in a post-normalization dataset) is flagged. |
| `test_validate_rates_null_rates_ok` | Null rates (from aggregation edge cases) are not flagged as violations. |

---

## Cross-Cutting Requirements for Phases 3–5

These supplement the general conventions from the Phase 1 & 2 guide.

### Aggregation Tests Must Distinguish Sums from Rates

The single most important testing principle in Phase 5: population and housing-unit counts are summed, but Vacancy Rate and Persons Per Household are never summed. Every regional and state aggregation test must explicitly verify that rates are recalculated from components:

```python
# Verify the rate was recalculated, not summed
expected_vacancy = (row["Vacant Units"] / row["Total Housing Units"]) * 100
assert abs(row["Vacancy Rate"] - expected_vacancy) < 0.01
```

If a test sums county vacancy rates and asserts the region matches that sum, the test itself is wrong.

### DataFrame Mutation Awareness

Many Phase 3 and 5 functions modify their input DataFrame in place. Tests should verify whether the function mutates or returns a copy, and assert accordingly:

```python
def test_remove_balance_rows_returns_copy():
    df = pd.DataFrame({"Location": ["Oakland", "Balance of Alameda"]})
    original_len = len(df)

    result = remove_balance_rows(df, location_col="Location")

    # The original should be untouched if the function returns a copy
    assert len(df) == original_len
    assert len(result) == 1
```

If the function mutates in place, test that the original is modified and no separate copy is returned. Pick one convention and apply it consistently across all Phase 3–5 functions.

### Hierarchical Fixtures Must Reflect Real E-5 Structure

The E-5 workbook has a specific row ordering: county header → "County Total" → cities → "Balance of County" → next county. Phase 3 tests for `forward_fill_locations_with_context`, `build_county_context_column`, and `identify_county_headers` must use fixtures that preserve this ordering. A shuffled DataFrame would pass through production code incorrectly but produce wrong results in practice.

When building these fixtures, refer to the actual E-5 layout documented in `previous-tool-analysis.md` rather than inventing a structure that might not match.

### Shared Tests Remain Generic

The new shared modules (`type_conversions.py`, `row_filters.py`, `dataframe_operations.py`, and the `validate_numeric_range` addition) must be tested with generic column names and data. Use `"a"`, `"b"`, `"value"`, `"date"` — not `"Location"`, `"Total Population"`, `"Vacancy Rate"`. The pophousing tests are where domain-specific column names appear.

### San Francisco Is a Special Case Everywhere

The SF city/county duplication touches Phase 3 (where the function is defined), Phase 5 (where regional aggregation must not double-count SF), and Phase 6 (where it runs exactly once). Write a focused test in `test_geographic_classification.py` for the function itself, and add a supplementary test in `test_regional_aggregation.py` verifying that SF-as-County is included in the Bay Area aggregate but SF-as-City is not double-counted.

### Rate Normalization Has a Known Heuristic Edge

The `find_decimal_fraction_rates` function uses a `< 1.0` threshold to distinguish decimal fractions from percentages. A legitimate sub-1% vacancy rate (rare but theoretically possible for a high-demand city) would be incorrectly flagged. Your test for the boundary value at 1.0 should document this limitation in a comment, so a future developer encountering a false positive knows it's a known trade-off.

---

## Summary: Minimum Test Counts

| Test File | Functions Covered | Minimum Tests |
|---|---|---|
| `test_type_conversions.py` | `parse_year_from_date`, `coerce_numeric_columns` | 12 |
| `test_row_filters.py` | `filter_year_range`, `remove_summary_rows`, `remove_header_like_rows`, `drop_empty_rows_without_data` | 19 |
| `test_dataframe_operations.py` | `forward_fill_columns`, `assign_values_from_mapping` | 8 |
| `test_dataframe_validators.py` (addition) | `validate_numeric_range` | 6 |
| `test_e5_schema_normalizer.py` | `normalize_e5_columns`, `trim_to_first_data_row`, `rename_e5_schema` | 10 |
| `test_hierarchical_location_cleaning.py` | `has_meaningful_housing_data`, `identify_county_headers`, `build_county_context_column`, `forward_fill_locations_with_context` | 19 |
| `test_location_standardization.py` | `standardize_location_column` | 8 |
| `test_geographic_classification.py` | `resolve_county_total_rows`, `normalize_state_total_rows`, `apply_town_overrides`, `classify_ambiguous_location`, `assign_missing_geographic_levels`, `sanitize_geographic_levels`, `remove_balance_rows`, `drop_helper_columns`, `standardize_san_francisco_classification` | 33 |
| `test_housing_metrics.py` | `add_housing_derived_columns`, `recalculate_housing_rates` | 12 |
| `test_cleaning_validators.py` | Phase 3 post-cleaning validation | 6 |
| `test_historical_modern_merge.py` | `load_historical_housing_data`, `filter_historical_years`, `merge_historical_and_modern_data`, `resolve_source_overlap` | 19 |
| `test_aggregation_utils.py` | `remove_existing_geographic_level`, `deduplicate_geographic_rows` | 8 |
| `test_regional_aggregation.py` | `build_regional_rows`, `add_regional_data` | 12 |
| `test_state_aggregation.py` | `find_missing_state_years`, `build_state_rows_from_counties`, `add_state_data_for_missing_years` | 12 |
| `test_rate_normalization.py` | `find_decimal_fraction_rates`, `normalize_decimal_fraction_rates` | 10 |
| `test_aggregation_validators.py` | `validate_normalized_housing_rates` | 5 |
| **Total (Phases 3–5)** | | **~199** |
| **Running total (Phases 1–5)** | | **~299** |
# Pop-Housing Pipeline — Unit Testing Guide (Phase 6)

Guidelines and requirements for writing pytest tests covering Phase 6 (Archive & Finalize) and the pipeline orchestrator.

This guide continues from the Phase 3–5 guide and follows the same conventions. Phase 6 is structurally different from earlier phases: most of its transformation logic is performed by canonical functions already defined and tested in Phase 3 (`location_standardization.py`, `geographic_classification.py`). Those functions are not re-tested here. Phase 6 testing focuses on the new output and validation modules, the orchestrator's sequencing and error handling, and a small set of integration-level tests that verify canonical functions behave correctly on post-enrichment data.

---

## Test Directory Additions

```
scripts/unit_tests/
├── ...                                  ← Phases 1–5 files unchanged
│
├── pophousing/
│   ├── ...                              ← existing pophousing tests
│   ├── output/
│   │   ├── __init__.py
│   │   └── test_finalize_dataset.py
│   ├── validation/
│   │   ├── ...                          ← existing test files
│   │   └── test_final_dataset_validator.py
│   └── integration/
│       ├── __init__.py
│       └── test_phase6_canonical_reuse.py
│
└── orchestrators/
    ├── __init__.py
    └── test_pophousing_pipeline.py
```

The `integration/` directory holds tests that verify canonical Phase 3 functions work correctly on Phase 6 inputs. These are not duplicates of Phase 3 tests — they use post-enrichment DataFrames (with region and state rows, mixed historical and modern sources) that the Phase 3 tests never see.

---

## What Phase 6 Does NOT Re-Test

The following functions are canonical implementations tested in Phase 3. Phase 6 calls them but does not own them, so Phase 6 does not add unit tests for their internal logic:

- `location_standardization.standardize_location_column()` — tested in `test_location_standardization.py`
- `geographic_classification.assign_missing_geographic_levels()` — tested in `test_geographic_classification.py`
- `geographic_classification.standardize_san_francisco_classification()` — tested in `test_geographic_classification.py`
- `file_retention.archive_or_delete_files()` — tested in `test_file_retention.py`

If a Phase 6 bug turns out to originate inside one of these functions, the fix and its test belong in the Phase 3 test file, not here.

---

## Fixture Strategy for Phase 6

### Near-Final Dataset Fixture

Phase 6 operates on a dataset that has already been through Phases 3–5: cleaned, merged, enriched with regions and state rows, and rate-normalized. The fixture needs all geographic levels, multiple years spanning historical and modern data, and the full output column set.

```python
# In scripts/unit_tests/pophousing/conftest.py (append to existing)

@pytest.fixture
def enriched_housing_df():
    """A post-Phase-5 dataset with all geographic levels and both sources.

    Small enough for unit tests but structurally complete: historical and
    modern years, all five geographic levels, both E-8 and E-5 sources,
    and derived columns already computed.
    """
    rows = []
    for year, source in [(2019, "E-8"), (2020, "E-8"), (2021, "E-5"), (2022, "E-5")]:
        # State
        rows.append({
            "Location": "California", "County": None,
            "Geographic Level": "State", "Year": year,
            "Total Population": 39000000, "Household Population": 38000000,
            "Group Quarters Population": 1000000,
            "Total Housing Units": 14000000, "Occupied Units": 13300000,
            "Vacant Units": 700000, "Single Family Units": 9000000,
            "Multiple Family Units": 5000000,
            "Single Family Detached Units": 8000000,
            "Single Family Attached Units": 1000000,
            "Two to Four Family Units": 1500000,
            "Five Plus Family Units": 3500000,
            "Mobile Homes": 500000,
            "Vacancy Rate": 5.0, "Persons Per Household": 2.86,
            "Source": source,
        })
        # County
        rows.append({
            "Location": "Alameda", "County": "Alameda",
            "Geographic Level": "County", "Year": year,
            "Total Population": 1600000, "Household Population": 1560000,
            "Group Quarters Population": 40000,
            "Total Housing Units": 600000, "Occupied Units": 570000,
            "Vacant Units": 30000, "Single Family Units": 400000,
            "Multiple Family Units": 200000,
            "Single Family Detached Units": 350000,
            "Single Family Attached Units": 50000,
            "Two to Four Family Units": 60000,
            "Five Plus Family Units": 140000,
            "Mobile Homes": 10000,
            "Vacancy Rate": 5.0, "Persons Per Household": 2.74,
            "Source": source,
        })
        # City
        rows.append({
            "Location": "Oakland", "County": "Alameda",
            "Geographic Level": "City", "Year": year,
            "Total Population": 440000, "Household Population": 430000,
            "Group Quarters Population": 10000,
            "Total Housing Units": 180000, "Occupied Units": 170000,
            "Vacant Units": 10000, "Single Family Units": 100000,
            "Multiple Family Units": 80000,
            "Single Family Detached Units": 85000,
            "Single Family Attached Units": 15000,
            "Two to Four Family Units": 25000,
            "Five Plus Family Units": 55000,
            "Mobile Homes": 2000,
            "Vacancy Rate": 5.56, "Persons Per Household": 2.53,
            "Source": source,
        })
        # Region
        rows.append({
            "Location": "Bay Area", "County": None,
            "Geographic Level": "Region", "Year": year,
            "Total Population": 7800000, "Household Population": 7600000,
            "Group Quarters Population": 200000,
            "Total Housing Units": 2800000, "Occupied Units": 2660000,
            "Vacant Units": 140000, "Single Family Units": 1800000,
            "Multiple Family Units": 1000000,
            "Single Family Detached Units": 1500000,
            "Single Family Attached Units": 300000,
            "Two to Four Family Units": 300000,
            "Five Plus Family Units": 700000,
            "Mobile Homes": 50000,
            "Vacancy Rate": 5.0, "Persons Per Household": 2.86,
            "Source": source,
        })
        # Town
        rows.append({
            "Location": "Yountville", "County": "Napa",
            "Geographic Level": "Town", "Year": year,
            "Total Population": 3000, "Household Population": 2900,
            "Group Quarters Population": 100,
            "Total Housing Units": 1800, "Occupied Units": 1600,
            "Vacant Units": 200, "Single Family Units": 1200,
            "Multiple Family Units": 600,
            "Single Family Detached Units": 1000,
            "Single Family Attached Units": 200,
            "Two to Four Family Units": 150,
            "Five Plus Family Units": 450,
            "Mobile Homes": 50,
            "Vacancy Rate": 11.11, "Persons Per Household": 1.81,
            "Source": source,
        })
    return pd.DataFrame(rows)
```

### Output Column List Fixture

Loaded from the real config so tests stay in sync with the canonical column order:

```python
@pytest.fixture
def output_columns():
    """The canonical output column order for PopHousing_Current.csv."""
    return [
        "Location", "County", "Geographic Level", "Year",
        "Total Population", "Household Population", "Group Quarters Population",
        "Total Housing Units",
        "Single Family Detached Units", "Single Family Attached Units",
        "Two to Four Family Units", "Five Plus Family Units", "Mobile Homes",
        "Occupied Units", "Vacancy Rate", "Persons Per Household",
        "Single Family Units", "Multiple Family Units", "Vacant Units",
        "Source",
    ]
```

Adjust this list to match whatever your `finalize_dataset.py` implementation uses as the canonical order. The important thing is that the test imports or derives it from the same source as the production code.

---

## Phase 6: Archive & Finalize — Test Requirements

### `scripts/pophousing/output/finalize_dataset.py`

#### `prepare_housing_output(housing_df, source_name, output_columns, sort_columns)`

Sets the `Source` column, enforces the canonical output column order, coerces `Year` to string, and sorts.

| Test | What it verifies |
|---|---|
| `test_prepare_output_sets_source` | Every row's `Source` column is set to `source_name` for rows that currently lack one, or left unchanged for rows that already have a source. Verify whichever contract you implement. |
| `test_prepare_output_column_order` | The returned DataFrame's columns match `output_columns` in exact order. |
| `test_prepare_output_drops_extra_columns` | Columns not in `output_columns` (e.g., `_temp_county`) are removed. |
| `test_prepare_output_missing_output_column` | Raises `ValueError` listing which expected output columns are absent from the DataFrame. |
| `test_prepare_output_sort_order` | Rows are sorted by `sort_columns` (e.g., `["Geographic Level", "Location", "Year"]`). |
| `test_prepare_output_year_as_string` | The `Year` column in the output is string dtype, not integer (the legacy pipeline writes years as strings in the CSV). |
| `test_prepare_output_does_not_mutate_input` | The original DataFrame is not modified — the function returns a new DataFrame. |

**Fixture pattern:**

```python
def test_prepare_output_column_order(enriched_housing_df, output_columns):
    result = prepare_housing_output(
        enriched_housing_df,
        source_name="DoF",
        output_columns=output_columns,
        sort_columns=["Geographic Level", "Location", "Year"],
    )
    assert list(result.columns) == output_columns
```

#### `write_housing_output(housing_df, output_path)`

Writes the finalized DataFrame to CSV.

| Test | What it verifies |
|---|---|
| `test_write_output_creates_file` | A CSV file appears at `output_path`. |
| `test_write_output_no_index` | The CSV does not include a pandas index column. |
| `test_write_output_roundtrip` | Reading the written CSV back with `pd.read_csv` produces a DataFrame equal to the input (within expected dtype coercions). |
| `test_write_output_creates_parent_directory` | If the parent directory doesn't exist, it's created. |
| `test_write_output_overwrites_existing` | If a file already exists at `output_path`, it's replaced. |

---

### `scripts/pophousing/validation/final_dataset_validator.py`

#### `validate_final_housing_dataset(housing_df, validation_config)`

The last gate before writing the CSV. Composes shared validators and pophousing-specific checks into a single pass. Returns `(is_valid, validation_messages)` matching the convention established by `validate_historical_housing_data`.

**Schema and structure checks:**

| Test | What it verifies |
|---|---|
| `test_validate_final_valid_dataset` | A properly formed enriched dataset passes all checks. This is the baseline. |
| `test_validate_final_missing_required_column` | Fails when a required output column is absent. The message names the column. |
| `test_validate_final_duplicate_keys` | Fails when the same (Location, Geographic Level, Year) appears more than once. |
| `test_validate_final_empty_dataset` | Fails with a message saying the dataset has no rows. |

**Geographic-level checks:**

| Test | What it verifies |
|---|---|
| `test_validate_final_all_five_levels_present` | Fails if any of the five geographic levels (State, County, City, Town, Region) is entirely absent. |
| `test_validate_final_invalid_level` | Fails when a row has a geographic level outside the valid set. |
| `test_validate_final_no_null_levels` | Fails when any row has a null geographic level. |
| `test_validate_final_california_state_rows` | Fails when no State-level rows exist for "California". |

**Year-coverage checks:**

| Test | What it verifies |
|---|---|
| `test_validate_final_year_range` | Fails when the dataset doesn't span the expected range (1991 through the current year). The specific bounds come from `validation_config`. |
| `test_validate_final_no_future_years` | Fails if any year is beyond the current pipeline year. |

**San Francisco checks:**

| Test | What it verifies |
|---|---|
| `test_validate_final_sf_has_both_levels` | Fails if San Francisco doesn't appear as both a City and a County row for each year it's present. |
| `test_validate_final_sf_no_triplication` | Fails if San Francisco appears more than twice per year (which would indicate the duplication function ran more than once). |

**Bay Area 2020 sanity check:**

The legacy pipeline includes a specific Bay Area 2020 validation as a canary. This checks that the region's population for the boundary year is within a plausible range — it catches catastrophic merge or aggregation errors.

| Test | What it verifies |
|---|---|
| `test_validate_final_bay_area_2020_plausible` | The Bay Area region's 2020 Total Population falls within a configured range (e.g., 7–9 million). |
| `test_validate_final_bay_area_2020_missing` | Warns (but doesn't necessarily fail) when there's no Bay Area 2020 row — the dataset might be valid but the canary can't run. |

**Population and rate sanity checks:**

| Test | What it verifies |
|---|---|
| `test_validate_final_no_negative_populations` | Fails when any Total Population or Total Housing Units value is negative. |
| `test_validate_final_vacancy_rate_range` | Fails when any Vacancy Rate is below 0 or above 100 (post-normalization). |
| `test_validate_final_persons_per_household_range` | Fails when Persons Per Household is below 0 or above a configured ceiling (e.g., 10). |

**Return type:**

| Test | What it verifies |
|---|---|
| `test_validate_final_returns_tuple` | Returns `(is_valid: bool, messages: list[str])`. |
| `test_validate_final_multiple_failures` | When several checks fail, all failure messages are collected — the validator doesn't short-circuit after the first failure. |

---

### `scripts/pophousing/integration/test_phase6_canonical_reuse.py`

These tests verify that canonical Phase 3 functions produce correct results when called on post-enrichment data. They do not test the internal logic of those functions (that's Phase 3's job). They test that the *data shapes Phase 6 sends them* don't trigger unexpected behavior.

#### Location standardization on post-enrichment data

| Test | What it verifies |
|---|---|
| `test_standardize_on_enriched_data_region_rows_untouched` | Region rows (e.g., "Bay Area") pass through standardization without name changes — they aren't in any name-mapping dict. |
| `test_standardize_on_enriched_data_only_levels_filter` | When called with `only_levels=["City", "Town"]`, County, Region, and State rows are untouched even if their names appear in a mapping. |
| `test_standardize_on_enriched_data_historical_names` | A historical-era city name from `HISTORICAL_NAME_STANDARDIZATION` in a pre-2000 row is corrected. |

#### Geographic level assignment on post-enrichment data

| Test | What it verifies |
|---|---|
| `test_assign_levels_on_enriched_data_no_regressions` | Running the classifier on a fully-leveled enriched DataFrame changes zero rows. This catches regressions where enrichment inadvertently clears geographic levels. |
| `test_assign_levels_on_enriched_data_fills_new_gaps` | If aggregation introduced a row with a null level (e.g., a state row missing its level tag), the classifier fills it correctly. |

#### San Francisco duplication on post-enrichment data

| Test | What it verifies |
|---|---|
| `test_sf_duplication_on_enriched_data_both_sources` | SF rows from both historical (E-8) and modern (E-5) sources are each duplicated into City and County. |
| `test_sf_duplication_on_enriched_data_row_count` | For N years of SF data, the output has exactly 2 × N SF rows (one City, one County per year). |
| `test_sf_duplication_on_enriched_data_no_other_rows_affected` | Non-SF rows are identical before and after the function runs. |

---

## Pipeline Orchestrator — Test Requirements

### `scripts/orchestrators/pophousing_pipeline.py`

The orchestrator's `main()` coordinates every phase in sequence. It should contain only sequencing, logging, and error handling — no transformation logic. Orchestrator tests mock all phase functions and verify the coordination.

#### Sequencing

| Test | What it verifies |
|---|---|
| `test_pipeline_calls_phases_in_order` | Phase 1 (cleanup, validation) → Phase 2 (acquisition) → Phase 3 (cleaning) → Phase 4 (merge) → Phase 5 (enrichment) → Phase 6 (archive, finalize, validate, write). Use `unittest.mock.call_args_list` or a shared call log to verify ordering. |
| `test_pipeline_passes_phase2_output_to_phase3` | The raw DataFrame returned by Phase 2's acquisition is the input to Phase 3's cleaning. |
| `test_pipeline_passes_phase3_output_to_phase4` | The cleaned DataFrame is the input to Phase 4's merge. |
| `test_pipeline_passes_phase4_output_to_phase5` | The merged DataFrame is the input to Phase 5's enrichment. |
| `test_pipeline_passes_phase5_output_to_phase6` | The enriched DataFrame is the input to Phase 6's finalization. |

**Mock pattern for sequencing tests:**

```python
from unittest.mock import patch, call, MagicMock

def test_pipeline_calls_phases_in_order():
    call_order = []

    def track(name):
        def tracked(*args, **kwargs):
            call_order.append(name)
            return MagicMock()  # each phase returns a mock DataFrame
        return tracked

    with patch("scripts.orchestrators.pophousing_pipeline.cleanup_old_e5_files", side_effect=track("phase1_cleanup")), \
         patch("scripts.orchestrators.pophousing_pipeline.validate_historical_data", side_effect=track("phase1_validate")), \
         patch("scripts.orchestrators.pophousing_pipeline.download_e5_data", side_effect=track("phase2")), \
         patch("scripts.orchestrators.pophousing_pipeline.clean_e5_pipeline", side_effect=track("phase3")), \
         patch("scripts.orchestrators.pophousing_pipeline.merge_pipeline", side_effect=track("phase4")), \
         patch("scripts.orchestrators.pophousing_pipeline.enrich_pipeline", side_effect=track("phase5")), \
         patch("scripts.orchestrators.pophousing_pipeline.finalize_pipeline", side_effect=track("phase6")):

        main()

    assert call_order == [
        "phase1_cleanup", "phase1_validate",
        "phase2", "phase3", "phase4", "phase5", "phase6",
    ]
```

The exact function names in the patches depend on how the orchestrator imports its dependencies. Adjust to match.

#### Error handling

| Test | What it verifies |
|---|---|
| `test_pipeline_phase1_validation_failure_stops` | When `validate_historical_data` returns `(False, messages)`, the pipeline does not proceed to Phase 2. |
| `test_pipeline_phase2_download_failure_tries_fallback` | When `download_e5_data` raises `HTTPDownloadError`, the pipeline calls `get_most_recent_e5_file` as a fallback before giving up. |
| `test_pipeline_phase2_total_failure_stops` | When both download and fallback fail, the pipeline raises a structured error and does not proceed to Phase 3. |
| `test_pipeline_phase3_cleaning_failure_stops` | A cleaning error halts the pipeline before merge. |
| `test_pipeline_phase6_validation_failure_does_not_write` | When `validate_final_housing_dataset` returns `(False, messages)`, the pipeline does not call `write_housing_output`. The bad dataset is not written to disk. |
| `test_pipeline_phase6_archive_before_write` | The old CSV is archived before the new one is written — not after. Verify call ordering. |
| `test_pipeline_error_includes_phase_name` | Any error raised by the orchestrator includes which phase failed, so the caller can identify the failure source without reading a traceback. |

#### Return value and logging

| Test | What it verifies |
|---|---|
| `test_pipeline_success_returns_summary` | On a clean run, the orchestrator returns a result object (or dict) summarizing row counts, year range, geographic-level counts, and the output path. |
| `test_pipeline_failure_returns_structured_error` | On failure, the error (or return value) includes the phase name, the original exception message, and any partial results from earlier phases. |
| `test_pipeline_does_not_prompt_for_input` | The orchestrator never calls `input()` or `builtins.input`. The legacy `run_original_pipeline.py` prompted interactively on failure — the rewritten orchestrator must not. |

**Testing the no-interactive-prompt rule:**

```python
def test_pipeline_does_not_prompt_for_input(monkeypatch):
    def deny(*args, **kwargs):
        raise RuntimeError("Orchestrator must not prompt for interactive input")
    monkeypatch.setattr("builtins.input", deny)

    with patch(...):  # mock all phases to succeed
        main()
    # If we reach here without RuntimeError, the test passes
```

#### File I/O safety

| Test | What it verifies |
|---|---|
| `test_pipeline_does_not_write_on_validation_failure` | Mocking Phase 6 validation to fail, assert that `write_housing_output` is never called and no file exists at the output path. |
| `test_pipeline_archives_before_overwrite` | When an existing output file is present, it's moved to the archive directory before the new file is written. The old file's content is preserved in the archive. Use `tmp_path` for all file paths. |
| `test_pipeline_no_orphaned_archive_on_write_failure` | If `write_housing_output` raises an error after the archive step, the archived copy still exists (the pipeline doesn't delete the archive on failure). |

---

## Cross-Cutting Requirements for Phase 6

### Canonical Functions Are Tested in Phase 3, Called in Phase 6

This is the most important structural rule. `standardize_location_column`, `assign_missing_geographic_levels`, and `standardize_san_francisco_classification` each have one implementation and one test location (Phase 3). Phase 6 calls them but does not duplicate their unit tests. The integration tests in `test_phase6_canonical_reuse.py` only verify that the data shapes Phase 6 produces are compatible with those functions — they don't re-assert the functions' internal logic.

If a Phase 6 bug is traced to a canonical function, add the regression test to the Phase 3 test file, not here.

### The Orchestrator Tests Mock Everything Below It

Orchestrator tests never call real cleaning, merging, or aggregation functions. Every phase is mocked. The orchestrator's job is sequencing and error handling — those are what its tests verify. If an orchestrator test fails because a cleaning function raised an unexpected error, the test is testing the wrong thing.

### Validation Failure Must Block Output

The pipeline must not produce a CSV when the final validator rejects the dataset. This invariant is tested from two directions: in `test_final_dataset_validator.py` (the validator correctly identifies bad data) and in `test_pophousing_pipeline.py` (the orchestrator respects a False result by not calling `write_housing_output`). Both tests must pass for the invariant to hold.

### No Surviving Temporary Columns

Phase 3 creates helper columns like `_temp_county`. Phase 6's `prepare_housing_output` enforces the output column set and drops everything else. Test that the final output contains exactly the canonical columns and nothing more. If `_temp_county` or any other working column survives to the CSV, the test catches it:

```python
def test_prepare_output_drops_extra_columns(enriched_housing_df, output_columns):
    enriched_housing_df["_temp_county"] = "leftover"
    enriched_housing_df["_debug_flag"] = True

    result = prepare_housing_output(
        enriched_housing_df,
        source_name="DoF",
        output_columns=output_columns,
        sort_columns=["Geographic Level", "Location", "Year"],
    )

    assert "_temp_county" not in result.columns
    assert "_debug_flag" not in result.columns
    assert list(result.columns) == output_columns
```

### Year Dtype Consistency

The legacy pipeline writes `Year` as a string in the final CSV. This is a known quirk, not a mistake — downstream consumers (including the Shiny app) expect it. `prepare_housing_output` converts Year to string, and the test must verify this. If a future refactor changes this convention, the test will flag it.

---

## Summary: Minimum Test Counts

| Test File | Functions Covered | Minimum Tests |
|---|---|---|
| `test_finalize_dataset.py` | `prepare_housing_output`, `write_housing_output` | 12 |
| `test_final_dataset_validator.py` | `validate_final_housing_dataset` | 18 |
| `test_phase6_canonical_reuse.py` | Integration: standardization, classification, SF duplication on enriched data | 8 |
| `test_pophousing_pipeline.py` | Orchestrator `main()`: sequencing, error handling, file I/O safety | 14 |
| **Total (Phase 6)** | | **~52** |
| **Running total (Phases 1–6)** | | **~351** |

---

## Full Pipeline Test Summary

With all six phases covered, the complete test suite spans 21 test files:

| Phase | Test Files | Tests |
|---|---|---|
| **Phase 1** (Setup & Validation) | `test_file_retention.py`, `test_dataframe_validators.py`, `test_e5_retention.py`, `test_historical_data_validator.py`, `test_paths.py`, `test_sources.py` | ~63 |
| **Phase 2** (Data Acquisition) | `test_http_downloads.py`, `test_dof_e5_downloader.py` | ~37 |
| **Phase 3** (Clean the Raw E-5 Data) | `test_type_conversions.py`, `test_row_filters.py`, `test_dataframe_operations.py`, `test_dataframe_validators.py` (addition), `test_e5_schema_normalizer.py`, `test_hierarchical_location_cleaning.py`, `test_location_standardization.py`, `test_geographic_classification.py`, `test_housing_metrics.py`, `test_cleaning_validators.py` | ~133 |
| **Phase 4** (Merge Historical + Modern) | `test_historical_modern_merge.py` | ~19 |
| **Phase 5** (Enrich the Merged Dataset) | `test_aggregation_utils.py`, `test_regional_aggregation.py`, `test_state_aggregation.py`, `test_rate_normalization.py`, `test_aggregation_validators.py` | ~47 |
| **Phase 6** (Archive & Finalize) | `test_finalize_dataset.py`, `test_final_dataset_validator.py`, `test_phase6_canonical_reuse.py`, `test_pophousing_pipeline.py` | ~52 |
| **Total** | **21 files** | **~351** |

These are minimums. The actual count will grow as implementation reveals edge cases — particularly around ambiguous location names, decade-boundary years, and the E-5 hierarchical layout.
