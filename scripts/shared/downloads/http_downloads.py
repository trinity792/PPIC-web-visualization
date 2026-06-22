from pathlib import Path

import requests


class HTTPDownloadError(RuntimeError):
    pass


def fetch_response(url, headers, timeout):
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
